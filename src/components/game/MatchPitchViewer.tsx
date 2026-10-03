import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type {
  MatchEvent,
  MatchLineupPlayer,
  MatchPlayerStats,
  MatchSubstitution,
  MatchTeamPlan,
  TacticalPosition,
} from "@/lib/game/types";
import { bridgeMinute, commentaryBridge, type MatchCommentaryBridge } from "@/lib/game/matchFlow";
import {
  activeMatchLineupAtMinute,
  buildMatchFlowSequence,
  buildMatchSequence,
  flowSequenceDurationMs,
  frameForSequence,
  sequenceDurationMs,
  sequenceResultVisible,
  visiblePossessionMs,
  type MatchPitchPoint,
  type MatchSequence,
  type MatchSequenceAction,
  type MatchSequenceFrame,
  type PossessionLedger,
} from "@/lib/game/matchSequence";
import { motionFrameForSequence } from "@/lib/game/matchMotion";
import { cn } from "@/lib/utils";
import type { MatchdayGroundPresentation } from "@/lib/game/groundPresentation";
import {
  enterMatch,
  exitMatch,
  onSoundSettingsChange,
  playKick,
  playReaction,
  playWhistle,
  setCrowdIntensity,
  soundSettings,
  unlockAudio,
  updateSoundSettings,
} from "@/lib/audio/soundscape";

/*
 * Rendering architecture
 * ----------------------
 * The match data pipeline (matchSequence / matchMotion) is untouched. What
 * changed is how it is played back:
 *
 *  1. One requestAnimationFrame clock owns the playhead. There is no separate
 *     setTimeout racing it, so events no longer freeze for the last 8%.
 *  2. Positions are written straight to the DOM as translate3d transforms.
 *     React only re-renders when something visible in the HUD changes (the
 *     active action, minute, score, badges) — a few times per second at most,
 *     instead of 60.
 *  3. Every body (player or ball) is smoothed. When the target teleports —
 *     for example at an event boundary, where matchMotion rebuilds positions
 *     from the base shape — the jump is absorbed into an offset that decays
 *     over ~0.3s, so the player glides instead of snapping.
 *  4. matchMotion eases every action with smoothStep, which makes players stop
 *     dead between passes. We feed it the inverse of smoothStep so its
 *     interpolation comes out linear, then the follow smoothing adds natural
 *     acceleration on top.
 *  5. Plans are built in playback order and carry a possession ledger, so
 *     quiet play shares the ball in line with the match's real possession
 *     stat across the whole game, not just gap by gap.
 */

const PLAYBACK_SPEEDS = [1, 2, 4] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
const BASE_EVENT_MS = 4_800;

/** How quickly a rendered player catches up with its target (ms time constant). */
const PLAYER_FOLLOW_MS = 70;
/**
 * Players move on a critically damped spring: they accelerate away and
 * decelerate into a stop or a turn, instead of launching at full speed.
 * The ball keeps the crisp exponential follow.
 */
const PLAYER_SPRING_MS = 95;
/** How quickly a player's facing turns (ms time constant). */
const FACING_TURN_MS = 140;
/** The ball is tighter to its path so passes still feel crisp. */
const BALL_FOLLOW_MS = 28;
/** How long a detected teleport takes to blend out (ms time constant). */
const JUMP_BLEND_MS = 320;
/** Clamp for long frames (tab switches, GC pauses) so nothing lurches. */
const MAX_FRAME_MS = 64;
/** Slider/timeline state is pushed to React at most this often. */
const TIMELINE_PUSH_MS = 100;
const SETTLE_EPSILON = 0.02;

/** How much of the match the viewer shows between key moments. */
export type ViewMode = "moments" | "condensed" | "extended";
const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "moments", label: "Key moments" },
  { id: "condensed", label: "Condensed" },
  { id: "extended", label: "Extended" },
];
/** A restart card stays up this long while the teams reset underneath it. */
const CUT_CARD_MS = 900;
/** Keep ball-flight actions at normal pace: shots should feel at least as sharp as passes. */
const SLOW_MOTION = 0.5;
const SLOW_KINDS = new Set<MatchSequenceAction["kind"]>(["save", "goal", "block", "miss"]);
const LOFTED_KINDS = new Set<MatchSequenceAction["kind"]>(["cross", "switch", "clearance"]);
const RESTART_LABEL: Partial<Record<NonNullable<MatchSequence["restart"]>, string>> = {
  kickoff: "Kick-off",
  keeper: "Keeper's ball",
  goalKick: "Goal kick",
};
const SET_PIECE_LABEL: Record<NonNullable<MatchSequence["setPiece"]>, string> = {
  corner: "Corner",
  freeKick: "Free-kick",
  penalty: "Penalty",
};
/** Camera zoom used on phones, where the whole pitch is otherwise tiny. */
const CAMERA_FOLLOW_MS = 450;
/** How quickly the broadcast camera zooms in and out (ms time constant). */
const CAMERA_ZOOM_MS = 900;

const pitchMetres = (a: MatchPitchPoint, b: MatchPitchPoint) =>
  Math.hypot((a.x - b.x) * 1.05, (a.y - b.y) * 0.68);

const EMPTY_LINEUP: MatchLineupPlayer[] = [];
const EMPTY_SUBS: MatchSubstitution[] = [];
const EMPTY_LEDGER: PossessionLedger = { us: 0, them: 0 };
/** Nodes start hidden until the engine has placed them once. */
const HIDDEN_STYLE = { visibility: "hidden" } as const;

const PASS_KINDS = new Set<MatchSequenceAction["kind"]>([
  "pass",
  "recycle",
  "switch",
  "throughBall",
  "overlap",
  "cutback",
  "cross",
]);

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ------------------------------------------------------------------ */
/* Formation + event helpers (unchanged behaviour)                     */
/* ------------------------------------------------------------------ */

const ROLE_X: Record<TacticalPosition, number> = {
  GK: 8,
  LB: 24,
  CB: 22,
  RB: 24,
  LWB: 35,
  RWB: 35,
  CDM: 40,
  CM: 48,
  CAM: 59,
  LM: 52,
  RM: 52,
  LW: 68,
  RW: 68,
  ST: 74,
};

function roleY(role: TacticalPosition, occurrence: number, count: number): number {
  if (role === "LB" || role === "LWB" || role === "LM" || role === "LW") return 16;
  if (role === "RB" || role === "RWB" || role === "RM" || role === "RW") return 84;
  if (role === "GK" || role === "CAM") return 50;
  if (count <= 1) return 50;
  const low = role === "CB" ? 32 : role === "ST" ? 37 : 28;
  const high = 100 - low;
  return low + ((high - low) * occurrence) / Math.max(1, count - 1);
}

/** Fallback resting shape only; with plans, matchMotion uses the formation's own shape. */
function formationPositions(
  lineup: MatchLineupPlayer[],
  ours: boolean,
): Map<string, MatchPitchPoint> {
  const totals = new Map<TacticalPosition, number>();
  for (const player of lineup) totals.set(player.role, (totals.get(player.role) ?? 0) + 1);
  const seen = new Map<TacticalPosition, number>();
  const result = new Map<string, MatchPitchPoint>();
  for (const player of lineup) {
    const occurrence = seen.get(player.role) ?? 0;
    seen.set(player.role, occurrence + 1);
    const x = ROLE_X[player.role];
    result.set(player.playerId, {
      x: ours ? x : 100 - x,
      y: roleY(player.role, occurrence, totals.get(player.role) ?? 1),
    });
  }
  return result;
}

function eventSeed(event: MatchEvent | undefined): number {
  if (!event) return 0;
  const input = event.sequenceId ?? `${event.minute}:${event.type}:${event.side}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackEventPosition(event: MatchEvent | undefined): MatchPitchPoint {
  if (!event) return { x: 50, y: 50 };
  const attackingX =
    event.zone === "box"
      ? 90
      : event.zone === "attackingThird"
        ? 76
        : event.zone === "middleThird"
          ? 55
          : 29;
  const x = event.side === "them" ? 100 - attackingX : attackingX;
  return { x: Math.max(4, Math.min(96, x)), y: 18 + ((eventSeed(event) * 17) % 65) };
}

function eventDurationMs(event: MatchEvent | undefined, sequence: MatchSequence | null): number {
  if (sequence) return sequenceDurationMs(sequence);
  if (!event) return BASE_EVENT_MS;
  // Cards, substitutions and injuries are shown as an overlay, not a pause.
  if (event.type === "sub" || event.type === "injury" || event.type === "card") return 1_600;
  return BASE_EVENT_MS;
}

function actionStage(action: MatchSequenceAction | undefined, event: MatchEvent | undefined): string {
  if (!action) return event?.phase?.replace(/([A-Z])/g, " $1") ?? event?.type ?? "Match phase";
  switch (action.kind) {
    case "receive":
      return "Possession";
    case "carry":
      return "Carry";
    case "pass":
      return "Passing move";
    case "recycle":
      return "Recycle";
    case "switch":
      return "Switch play";
    case "throughBall":
      return "Through ball";
    case "overlap":
      return "Overlap";
    case "cutback":
      return "Cutback";
    case "cross":
      return "Cross";
    case "interception":
      return "Regain";
    case "challenge":
      return "Challenge";
    case "tackle":
      return "Turnover";
    case "clearance":
      return "Clearance";
    case "blockPass":
      return "Pass blocked";
    case "recovery":
      return "Second ball";
    case "press":
      return "Press";
    case "shot":
      return "Shot";
    case "save":
      return "Saved";
    case "block":
      return "Blocked";
    case "miss":
      return "Missed";
    case "goal":
      return "Goal";
  }
}

function playerSurname(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

/** Inverse of smoothStep: feeding this to matchMotion makes its lerp linear. */
function linearise(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return 0.5 - Math.sin(Math.asin(1 - 2 * t) / 3);
}

/* ------------------------------------------------------------------ */
/* Per-event playback plan (built once per event, cached)              */
/* ------------------------------------------------------------------ */

interface MatchContext {
  userLineup: MatchLineupPlayer[];
  opponentLineup: MatchLineupPlayer[];
  userBench: MatchLineupPlayer[];
  opponentBench: MatchLineupPlayer[];
  substitutions: MatchSubstitution[];
  userPlan?: MatchTeamPlan;
  opponentPlan?: MatchTeamPlan;
  /** Real possession share (0-100) that quiet play is budgeted towards. */
  userPossession?: number;
  /** How much open play to show between moments. */
  viewMode?: ViewMode;
}

interface PlanCut {
  /** Plan progress (0-1) at which the picture cuts. */
  at: number;
  label: string;
}

interface EventPlan {
  active: MatchEvent;
  previousEvent: MatchEvent | undefined;
  sequence: MatchSequence | null;
  previousSequence: MatchSequence | null;
  bridge: MatchCommentaryBridge | null;
  bridgeSequence: MatchSequence | null;
  duration: number;
  bridgeFraction: number;
  /** Visible possession shown up to the end of this event. */
  ledgerAfter: PossessionLedger;
  /** Dead-ball cuts inside this plan: the teams reset under a restart card. */
  cuts: PlanCut[];
}

function buildEventPlan(
  active: MatchEvent,
  previousEvent: MatchEvent | undefined,
  ctx: MatchContext,
  usName: string,
  themName: string,
  ledgerBefore: PossessionLedger,
): EventPlan {
  const sequence = buildMatchSequence({ event: active, ...ctx });
  const previousSequence = previousEvent ? buildMatchSequence({ event: previousEvent, ...ctx }) : null;
  const mode = ctx.viewMode ?? "condensed";
  // Key-moments mode shows only the moments themselves, cut together.
  const bridge = mode === "moments" ? null : commentaryBridge(previousEvent, active, usName, themName);
  const bridgeSequence = bridge
    ? buildMatchFlowSequence({
        nextEvent: active,
        previousEvent,
        nextSequence: sequence ?? undefined,
        ...ctx,
        possessionLedger: ledgerBefore,
        detail: mode === "extended" ? 2 : 1,
      })
    : null;
  const sequenceBaseDuration = eventDurationMs(active, sequence);
  const bridgeGap = bridge ? Math.max(0, bridge.toMinute - bridge.fromMinute) : 0;
  const bridgeDuration =
    bridge && bridgeSequence
      ? Math.max(bridge.durationMs, flowSequenceDurationMs(bridgeSequence, bridgeGap, mode === "extended" ? 2 : 1))
      : (bridge?.durationMs ?? 0);
  const duration = sequenceBaseDuration + bridgeDuration;
  const flowShown = visiblePossessionMs(bridgeSequence, bridgeDuration);
  const highlightShown = visiblePossessionMs(sequence, sequenceBaseDuration);
  const bridgeFraction = bridgeDuration > 0 ? bridgeDuration / Math.max(1, duration) : 0;
  const cuts: PlanCut[] = [];
  const restartLabel = bridgeSequence?.restart ? RESTART_LABEL[bridgeSequence.restart] : undefined;
  if (restartLabel) cuts.push({ at: 0, label: restartLabel });
  else if (!bridgeSequence && sequence) {
    cuts.push({ at: 0, label: sequence.setPiece ? SET_PIECE_LABEL[sequence.setPiece] : "Key moment" });
  }
  if (bridgeSequence && sequence?.setPiece) cuts.push({ at: bridgeFraction, label: SET_PIECE_LABEL[sequence.setPiece] });
  return {
    active,
    previousEvent,
    sequence,
    previousSequence,
    bridge,
    bridgeSequence,
    duration,
    bridgeFraction,
    cuts,
    ledgerAfter: {
      us: ledgerBefore.us + flowShown.us + highlightShown.us,
      them: ledgerBefore.them + flowShown.them + highlightShown.them,
    },
  };
}

function planAt(
  index: number,
  events: MatchEvent[],
  cache: Map<number, EventPlan>,
  ctx: MatchContext,
  usName: string,
  themName: string,
): EventPlan | null {
  if (!events[index]) return null;
  // Plans depend on everything shown before them (the possession ledger), so
  // build forward from the last valid cached plan. Replays are deterministic.
  let start = index;
  while (start > 0) {
    const cached = cache.get(start - 1);
    if (cached && cached.active === events[start - 1] && cached.previousEvent === (start > 1 ? events[start - 2] : undefined)) break;
    start -= 1;
  }
  let plan: EventPlan | null = null;
  for (let i = start; i <= index; i += 1) {
    const active = events[i];
    const previousEvent = i > 0 ? events[i - 1] : undefined;
    const cached = cache.get(i);
    const ledgerBefore = i > 0 ? cache.get(i - 1)?.ledgerAfter ?? EMPTY_LEDGER : EMPTY_LEDGER;
    if (cached && cached.active === active && cached.previousEvent === previousEvent) {
      plan = cached;
      continue;
    }
    plan = buildEventPlan(active, previousEvent, ctx, usName, themName, ledgerBefore);
    cache.set(i, plan);
    // Anything cached after a rebuilt plan was built on an older ledger.
    for (const key of [...cache.keys()]) if (key > i) cache.delete(key);
  }
  return plan;
}

interface PlanSample {
  inBridge: boolean;
  frame: MatchSequenceFrame | null;
  renderSequence: MatchSequence | null;
  entrySequences: Array<MatchSequence | null>;
  minute: number;
  ball: MatchPitchPoint;
  resultVisible: boolean;
  /** 0-1 height of a lofted ball (crosses, switches, long balls). */
  lift: number;
  /** A dramatic outcome beat may play slower; shot flight itself stays at pass pace. */
  slow: boolean;
}

function samplePlan(plan: EventPlan, progress: number): PlanSample {
  const { bridge, bridgeFraction, bridgeSequence, sequence } = plan;
  const inBridge = Boolean(bridge && progress < bridgeFraction);
  const bridgeProgress = bridgeFraction > 0 ? Math.min(1, progress / bridgeFraction) : 1;
  const contentProgress =
    bridgeFraction < 1
      ? Math.max(0, Math.min(1, (progress - bridgeFraction) / Math.max(0.0001, 1 - bridgeFraction)))
      : 0;
  const frame =
    inBridge && bridgeSequence
      ? frameForSequence(bridgeSequence, bridgeProgress)
      : sequence && !inBridge
        ? frameForSequence(sequence, contentProgress)
        : null;
  const act = frame?.action;
  const travel = act ? pitchMetres(act.start, act.end) : 0;
  const lofted =
    !!act &&
    (LOFTED_KINDS.has(act.kind) || ((act.kind === "pass" || act.kind === "throughBall") && travel > 30));
  return {
    inBridge,
    frame,
    lift: lofted && frame ? Math.sin(Math.PI * frame.localProgress) * Math.min(1, travel / 40) : 0,
    slow: !inBridge && !!act && SLOW_KINDS.has(act.kind),
    renderSequence: inBridge ? bridgeSequence : sequence,
    entrySequences: inBridge ? [plan.previousSequence] : [plan.previousSequence, bridgeSequence],
    minute: inBridge && bridge ? bridgeMinute(bridge, bridgeProgress) : plan.active.minute,
    ball: frame?.ball ?? (inBridge ? { x: 50, y: 50 } : fallbackEventPosition(plan.active)),
    resultVisible: sequence
      ? !inBridge && sequenceResultVisible(sequence, contentProgress)
      : !inBridge && contentProgress >= 0.88,
  };
}

/* ------------------------------------------------------------------ */
/* HUD: the small slice of state React actually renders from           */
/* ------------------------------------------------------------------ */

interface Hud {
  cursor: number;
  inBridge: boolean;
  actionIndex: number;
  /** Goal/save badges appear 20% into their action. */
  badge: boolean;
  resultVisible: boolean;
  minute: number;
  /** Restart card being shown, if any. */
  cutLabel: string | null;
}

function hudFor(cursor: number, sample: PlanSample, plan?: EventPlan, progress = 0): Hud {
  let cutLabel: string | null = null;
  for (const cut of plan?.cuts ?? []) {
    const elapsed = (progress - cut.at) * (plan?.duration ?? 0);
    if (elapsed >= 0 && elapsed < CUT_CARD_MS) cutLabel = cut.label;
  }
  return {
    cutLabel,
    cursor,
    inBridge: sample.inBridge,
    actionIndex: sample.frame?.actionIndex ?? -1,
    badge: Boolean(sample.frame && sample.frame.localProgress >= 0.2),
    resultVisible: sample.resultVisible,
    minute: Math.round(sample.minute),
  };
}

function sameHud(a: Hud, b: Hud): boolean {
  return (
    a.cursor === b.cursor &&
    a.inBridge === b.inBridge &&
    a.actionIndex === b.actionIndex &&
    a.badge === b.badge &&
    a.resultVisible === b.resultVisible &&
    a.minute === b.minute &&
    a.cutLabel === b.cutLabel
  );
}

interface TimelineState {
  position: number;
  frontier: number;
  playedTo: number;
}

/* ------------------------------------------------------------------ */
/* Smoothed bodies                                                      */
/* ------------------------------------------------------------------ */

interface Body {
  /** Latest target from the simulation. */
  tx: number;
  ty: number;
  /** Decaying offset left behind when the target teleports. */
  ox: number;
  oy: number;
  /** Rendered position. */
  rx: number;
  ry: number;
  /** Rendered velocity (pitch % per second), for springs and facing. */
  vx: number;
  vy: number;
  /** Facing, radians on screen (0 = towards the right-hand goal). */
  face: number;
}

function stepBody(
  body: Body | undefined,
  target: MatchPitchPoint,
  dt: number,
  jumpLimit: number,
  snap: boolean,
  followMs: number,
): Body {
  if (!body || snap) {
    return { tx: target.x, ty: target.y, ox: 0, oy: 0, rx: target.x, ry: target.y, vx: 0, vy: 0, face: body?.face ?? 0 };
  }
  const jx = target.x - body.tx;
  const jy = target.y - body.ty;
  if (jx * jx + jy * jy > jumpLimit * jumpLimit) {
    // Non-physical jump: keep the body where it visually was and blend out.
    body.ox -= jx;
    body.oy -= jy;
  }
  body.tx = target.x;
  body.ty = target.y;
  const decay = Math.exp(-dt / JUMP_BLEND_MS);
  body.ox *= decay;
  body.oy *= decay;
  const goalX = body.tx + body.ox;
  const goalY = body.ty + body.oy;
  if (followMs === PLAYER_SPRING_MS) {
    // Critically damped spring, integrated in small steps for stability.
    const omega = 2000 / followMs;
    let remaining = dt / 1000;
    while (remaining > 0) {
      const h = Math.min(0.008, remaining);
      remaining -= h;
      const ax = omega * omega * (goalX - body.rx) - 2 * omega * body.vx;
      const ay = omega * omega * (goalY - body.ry) - 2 * omega * body.vy;
      body.vx += ax * h;
      body.vy += ay * h;
      body.rx += body.vx * h;
      body.ry += body.vy * h;
    }
    return body;
  }
  const follow = 1 - Math.exp(-dt / followMs);
  const px = body.rx;
  const py = body.ry;
  body.rx += (goalX - body.rx) * follow;
  body.ry += (goalY - body.ry) * follow;
  if (dt > 0) {
    body.vx = ((body.rx - px) * 1000) / dt;
    body.vy = ((body.ry - py) * 1000) / dt;
  }
  return body;
}

function bodySettled(body: Body): boolean {
  return (
    Math.abs(body.ox) < SETTLE_EPSILON &&
    Math.abs(body.oy) < SETTLE_EPSILON &&
    Math.abs(body.tx + body.ox - body.rx) < SETTLE_EPSILON &&
    Math.abs(body.ty + body.oy - body.ry) < SETTLE_EPSILON
  );
}

/* ------------------------------------------------------------------ */
/* Playback engine                                                      */
/* ------------------------------------------------------------------ */

interface Latest {
  events: MatchEvent[];
  cache: Map<number, EventPlan>;
  ctx: MatchContext;
  usName: string;
  themName: string;
  onReplayProgress?: (revealedEvents: number, complete: boolean) => void;
  onReplayClock?: (minute: number) => void;
}

interface PlaybackState {
  cursor: number;
  progress: number;
  playing: boolean;
  speed: PlaybackSpeed;
  frontier: number;
  playedTo: number;
  knownLength: number;
}

interface EngineDeps {
  latest: MutableRefObject<Latest>;
  playback: MutableRefObject<PlaybackState>;
  hudRef: MutableRefObject<Hud | null>;
  setHud: (hud: Hud) => void;
  setTimeline: (timeline: TimelineState) => void;
  setPlayingState: (playing: boolean) => void;
  setSpeedState: (speed: PlaybackSpeed) => void;
}

function createEngine(deps: EngineDeps) {
  const nodes = new Map<string, HTMLElement>();
  const refCallbacks = new Map<string, (node: HTMLElement | null) => void>();
  const bodies = new Map<string, Body>();
  let raf: number | null = null;
  let lastTs: number | null = null;
  let lastTimelinePush = Number.NEGATIVE_INFINITY;
  let lastTimeline: TimelineState | null = null;
  let lastReport = "";
  let width = 0;
  let height = 0;
  let observer: ResizeObserver | null = null;
  // Ball height for lofted passes, a pending hard cut, and the camera.
  let ballLift = 0;
  let snapNext = false;
  // Camera: `broadcast` on = zooms with the play; off = whole pitch.
  let broadcast = false;
  let zoom = 1;
  let camX = 50;
  let camY = 50;
  let ballX = 50;
  let ballY = 50;
  const dives = new Map<string, string>();
  let layer: HTMLElement | null = null;

  function applyCamera() {
    if (!layer) return;
    if (zoom <= 1 || width <= 0) {
      layer.style.transform = "";
      return;
    }
    const cx = (camX / 100) * width;
    const cy = (camY / 100) * height;
    const tx = Math.min(0, Math.max(width - width * zoom, width / 2 - cx * zoom));
    const ty = Math.min(0, Math.max(height - height * zoom, height / 2 - cy * zoom));
    layer.style.transformOrigin = "0 0";
    layer.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${zoom})`;
  }

  function currentPlan(): EventPlan | null {
    const { events, cache, ctx, usName, themName } = deps.latest.current;
    return planAt(deps.playback.current.cursor, events, cache, ctx, usName, themName);
  }

  function paint(key: string) {
    const node = nodes.get(key);
    const body = bodies.get(key);
    if (!node || !body || width <= 0) return;
    const x = ((body.rx * width) / 100).toFixed(2);
    const y = ((body.ry * height) / 100).toFixed(2);
    node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (key === "ball") node.style.setProperty("--lift", `${(ballLift * Math.min(width, height) * 0.08).toFixed(1)}px`);
    else {
      node.style.setProperty("--face", `${((body.face * 180) / Math.PI + 90).toFixed(1)}deg`);
      const dive = dives.get(key) ?? "";
      if ((node.dataset.dive ?? "") !== dive) {
        if (dive) node.dataset.dive = dive;
        else delete node.dataset.dive;
      }
    }
    if (node.style.visibility) node.style.visibility = "";
  }

  function publish(sample: PlanSample, force: boolean) {
    const pb = deps.playback.current;
    const nextHud = hudFor(pb.cursor, sample, currentPlan() ?? undefined, pb.progress);
    if (!deps.hudRef.current || !sameHud(deps.hudRef.current, nextHud)) {
      deps.hudRef.current = nextHud;
      deps.setHud(nextHud);
    }

    const now = performance.now();
    if (force || now - lastTimelinePush >= TIMELINE_PUSH_MS) {
      lastTimelinePush = now;
      const next: TimelineState = {
        position: pb.cursor + pb.progress,
        frontier: pb.frontier,
        playedTo: pb.playedTo,
      };
      if (
        !lastTimeline ||
        lastTimeline.position !== next.position ||
        lastTimeline.frontier !== next.frontier ||
        lastTimeline.playedTo !== next.playedTo
      ) {
        lastTimeline = next;
        deps.setTimeline(next);
      }
    }

    const { events, onReplayProgress, onReplayClock } = deps.latest.current;
    const revealed = Math.min(events.length, pb.cursor + (sample.resultVisible ? 1 : 0));
    const complete =
      events.length > 0 && !pb.playing && pb.cursor >= events.length - 1 && pb.progress >= 0.99;
    const minute = Math.round(sample.minute);
    const report = `${revealed}:${complete}:${minute}`;
    if (report !== lastReport) {
      lastReport = report;
      onReplayProgress?.(revealed, complete);
      onReplayClock?.(minute);
    }
  }

  /** Samples the match at the playhead, moves every body, returns true once all are at rest. */
  function renderFrame(dt: number, snap: boolean, force: boolean): boolean {
    const plan = currentPlan();
    if (!plan) return true;
    const pb = deps.playback.current;
    const sample = samplePlan(plan, pb.progress);
    const { ctx } = deps.latest.current;

    if (pb.cursor + pb.progress >= pb.frontier - 0.002) {
      pb.playedTo = Math.max(pb.playedTo, sample.minute);
    }

    const lineupMinute = Math.round(sample.minute);
    const userActive = activeMatchLineupAtMinute(
      ctx.userLineup,
      ctx.userBench,
      ctx.substitutions,
      "us",
      lineupMinute,
    );
    const opponentActive = activeMatchLineupAtMinute(
      ctx.opponentLineup,
      ctx.opponentBench,
      ctx.substitutions,
      "them",
      lineupMinute,
    );
    const userShape = formationPositions(userActive, true);
    const opponentShape = formationPositions(opponentActive, false);
    const motion = motionFrameForSequence({
      sequence: sample.renderSequence,
      actionIndex: sample.frame?.actionIndex ?? 0,
      localProgress: linearise(sample.frame?.localProgress ?? 0),
      user: { lineup: userActive, basePositions: userShape, ours: true, plan: ctx.userPlan },
      opponent: {
        lineup: opponentActive,
        basePositions: opponentShape,
        ours: false,
        plan: ctx.opponentPlan,
      },
      entrySequences: sample.entrySequences,
    });

    // Anything faster than this per frame is treated as a teleport, not movement.
    const jumpLimit = (3 + 1.5 * pb.speed) * Math.max(1, dt / 16.7);
    let settled = true;
    const place = (key: string, target: MatchPitchPoint, followMs: number) => {
      const body = stepBody(bodies.get(key), target, dt, jumpLimit, snap, followMs);
      bodies.set(key, body);
      if (!bodySettled(body)) settled = false;
    };

    // Goalkeepers: dive towards a shot and stay down; on a save, gather it.
    const act = sample.frame?.action;
    dives.clear();
    const keeperTarget = (side: "us" | "them", key: string, base: MatchPitchPoint): MatchPitchPoint => {
      if (!act || sample.inBridge) return base;
      const shooting = act.possessionSide ?? act.side;
      if (shooting === side) return base;
      const shotLike = act.kind === "shot" || act.kind === "save" || act.kind === "goal";
      if (!shotLike) return base;
      const aimY = act.end.y;
      const reach = aimY - base.y;
      if (Math.abs(reach) < 2.5 && act.kind !== "save") return base;
      const progress = act.kind === "shot" ? Math.min(1, (sample.frame?.localProgress ?? 0) * 1.6) : 1;
      const stretch = act.kind === "goal" ? 0.75 : act.kind === "save" ? 1 : 0.9;
      dives.set(key, reach < 0 ? "up" : "down");
      return { x: base.x, y: base.y + Math.max(-7, Math.min(7, reach)) * stretch * progress };
    };

    for (const player of userActive) {
      const key = `us-${player.playerId}`;
      let target = motion.user.get(player.playerId) ?? userShape.get(player.playerId) ?? { x: 45, y: 50 };
      if (player.role === "GK") target = keeperTarget("us", key, target);
      place(key, target, PLAYER_SPRING_MS);
    }
    for (const player of opponentActive) {
      const key = `them-${player.playerId}`;
      let target = motion.opponent.get(player.playerId) ?? opponentShape.get(player.playerId) ?? { x: 55, y: 50 };
      if (player.role === "GK") target = keeperTarget("them", key, target);
      place(key, target, PLAYER_SPRING_MS);
    }
    ballLift = sample.lift;
    place("ball", sample.ball, BALL_FOLLOW_MS);
    const ballBody = bodies.get("ball");
    ballX = ballBody?.rx ?? sample.ball.x;
    ballY = ballBody?.ry ?? sample.ball.y;

    // Facing: where a player is running, or towards the ball when still.
    const turn = snap ? 1 : 1 - Math.exp(-dt / FACING_TURN_MS);
    for (const [key, body] of bodies) {
      if (key === "ball") continue;
      const vxp = (body.vx * width) / 100;
      const vyp = (body.vy * height) / 100;
      const want =
        Math.hypot(vxp, vyp) > 14
          ? Math.atan2(vyp, vxp)
          : Math.atan2(((ballY - body.ry) * height) / 100, ((ballX - body.rx) * width) / 100);
      let delta = want - body.face;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      body.face += delta * turn;
      paint(key);
    }
    paint("ball");

    // Broadcast camera: wider in midfield, closer towards the box, framing
    // set pieces, pushing in for shots and pulling back for condensed play.
    const attackingUs = (act?.possessionSide ?? act?.side ?? "us") === "us";
    const goalX = attackingUs ? 100 : 0;
    const toGoal = attackingUs ? 100 - sample.ball.x : sample.ball.x;
    let zoomTarget = 1.15 + 0.5 * Math.min(1, Math.max(0, (40 - toGoal) / 30));
    let lookX = sample.ball.x + (goalX - sample.ball.x) * 0.18;
    let lookY = 50 + (sample.ball.y - 50) * 0.8;
    const setPiece = !sample.inBridge && sample.renderSequence?.setPiece;
    if (setPiece) {
      zoomTarget = 1.6;
      lookX = (sample.ball.x + goalX) / 2;
      lookY = (sample.ball.y + 50) / 2;
    }
    if (sample.slow) zoomTarget += 0.15;
    if (sample.inBridge) zoomTarget = Math.min(zoomTarget, 1.3);
    if (!broadcast) zoomTarget = 1;
    const follow = snap ? 1 : 1 - Math.exp(-dt / CAMERA_FOLLOW_MS);
    const zoomFollow = snap ? 1 : 1 - Math.exp(-dt / CAMERA_ZOOM_MS);
    zoom += (zoomTarget - zoom) * zoomFollow;
    camX += (lookX - camX) * follow;
    camY += (lookY - camY) * follow;
    // Land exactly on the target, and keep the loop running until the camera
    // has arrived (otherwise a paused match freezes mid-zoom).
    if (Math.abs(zoomTarget - zoom) < 0.002) zoom = zoomTarget;
    else settled = false;
    if (Math.abs(lookX - camX) > 0.05 || Math.abs(lookY - camY) > 0.05) settled = false;
    applyCamera();

    publish(sample, force);
    return settled;
  }

  function advance(dt: number) {
    const pb = deps.playback.current;
    if (!pb.playing) return;
    const plan = currentPlan();
    if (!plan) return;
    const length = deps.latest.current.events.length;
    // Outcome beats may play in slow motion; shot flight stays at normal pass pace. A restart card holds for
    // the same real time at every playback speed (the reset happens under it).
    const elapsedSinceCut = Math.min(
      ...plan.cuts.map((cut) => (pb.progress - cut.at) * plan.duration).filter((ms) => ms >= 0),
      Number.POSITIVE_INFINITY,
    );
    const underCard = elapsedSinceCut < CUT_CARD_MS;
    const rate = (underCard ? 1 / pb.speed : 1) * (samplePlan(plan, pb.progress).slow ? SLOW_MOTION : 1);
    const before = pb.progress;
    pb.progress += (dt * pb.speed * rate) / Math.max(1, plan.duration);
    if (plan.cuts.some((cut) => cut.at > before && cut.at <= pb.progress)) snapNext = true;
    if (pb.progress >= 1) {
      if (pb.cursor >= length - 1) {
        pb.progress = 1;
        setPlaying(false);
      } else {
        pb.cursor += 1;
        pb.progress = 0;
        if (currentPlan()?.cuts.some((cut) => cut.at === 0)) snapNext = true;
      }
    }
    const position = pb.cursor + pb.progress;
    if (position > pb.frontier) pb.frontier = position;
  }

  function tick(now: number) {
    const dt = lastTs === null ? 16.7 : Math.min(MAX_FRAME_MS, Math.max(0, now - lastTs));
    lastTs = now;
    advance(dt);
    // A dead-ball cut happens under the restart card: snap, don't slide.
    const snap = snapNext;
    snapNext = false;
    const settled = renderFrame(dt, snap, false);
    if (deps.playback.current.playing || !settled) {
      raf = window.requestAnimationFrame(tick);
    } else {
      raf = null;
      lastTs = null;
      // Make sure the slider reflects the exact resting position.
      renderFrame(0, false, true);
    }
  }

  function ensureLoop() {
    if (raf !== null || typeof window === "undefined") return;
    lastTs = null;
    raf = window.requestAnimationFrame(tick);
  }

  function setPlaying(playing: boolean) {
    deps.playback.current.playing = playing;
    deps.setPlayingState(playing);
    if (!playing) renderFrame(0, false, true);
    // Keep running while paused until every body has glided to rest.
    ensureLoop();
  }

  return {
    ensureLoop,
    setPlaying,

    togglePlaying() {
      setPlaying(!deps.playback.current.playing);
    },

    setSpeed(speed: PlaybackSpeed) {
      deps.playback.current.speed = speed;
      deps.setSpeedState(speed);
    },

    /** Move the playhead. snap=true teleports (scrubbing), false glides. */
    seek(cursor: number, progress: number, options: { snap: boolean; play: boolean }) {
      const pb = deps.playback.current;
      pb.cursor = cursor;
      pb.progress = progress;
      renderFrame(0, options.snap, true);
      setPlaying(options.play);
    },

    /** Called when events arrive (live match) or a different match is loaded. */
    syncEvents() {
      const pb = deps.playback.current;
      const length = deps.latest.current.events.length;
      if (length < pb.knownLength) {
        // A different (shorter) match replaced this one: start clean.
        pb.cursor = 0;
        pb.progress = 0;
        pb.frontier = 0;
        pb.playedTo = 0;
        pb.knownLength = 0;
        bodies.clear();
        deps.hudRef.current = null;
        lastReport = "";
      }
      if (length > pb.knownLength) {
        const nextStart = pb.knownLength;
        pb.knownLength = length;
        pb.cursor = nextStart;
        pb.progress = 0;
        pb.frontier = Math.max(pb.frontier, nextStart);
        renderFrame(0, false, true);
        setPlaying(true);
      }
    },

    /** Lineups/plans changed: re-sample without moving the playhead. */
    refresh() {
      renderFrame(0, false, true);
      ensureLoop();
    },

    /** Stable ref callback per body key, so memoised children keep their refs. */
    refFor(key: string) {
      let callback = refCallbacks.get(key);      if (!callback) {
        callback = (node: HTMLElement | null) => {
          if (node) {
            nodes.set(key, node);
            paint(key);
          } else {
            nodes.delete(key);
          }
        };
        refCallbacks.set(key, callback);
      }
      return callback;
    },

    /** Broadcast camera on (zooms with the play) or off (whole pitch). */
    setBroadcast(on: boolean) {
      broadcast = on;
      renderFrame(0, false, true);
      ensureLoop();
    },

    layerRef(node: HTMLElement | null) {
      layer = node;
      applyCamera();
    },

    pitchRef(node: HTMLElement | null) {
      observer?.disconnect();
      observer = null;
      if (!node) return;
      width = node.clientWidth;
      height = node.clientHeight;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (!rect) return;
          width = rect.width;
          height = rect.height;
          renderFrame(0, false, false);
        });
        observer.observe(node);
      }
      renderFrame(0, false, true);
    },

    dispose() {
      if (raf !== null) window.cancelAnimationFrame(raf);
      raf = null;
      observer?.disconnect();
      observer = null;
    },
  };
}

type Engine = ReturnType<typeof createEngine>;

/* ------------------------------------------------------------------ */
/* Presentational pieces                                               */
/* ------------------------------------------------------------------ */

/** Shirt colours for the dots: fill (shirt), edge (trim) and text (number). */
export interface DotColours {
  fill: string;
  edge: string;
  text: string;
}

const PlayerDot = memo(function PlayerDot({
  player,
  ours = false,
  active = false,
  receiver = false,
  expanded = false,
  colours,
}: {
  player: MatchLineupPlayer;
  ours?: boolean;
  active?: boolean;
  receiver?: boolean;
  expanded?: boolean;
  colours?: DotColours;
}) {
  return (
    <div
      className="relative -translate-x-1/2 -translate-y-1/2"
      title={`${player.shirtNumber}. ${player.name} · ${player.role}`}
    >
      <span className={cn("lf-face", expanded && "is-large")} aria-hidden="true" />
      <span
        className={cn(
          "lf-dot grid place-items-center rounded-full border font-black leading-none shadow-sm transition-transform duration-150",
          expanded
            ? "size-5 text-[8px] sm:size-6 sm:text-[9px]"
            : "size-3.5 text-[6px] sm:size-4 sm:text-[7px]",
          !colours && (ours ? "border-emerald-950 bg-emerald-300" : "border-rose-950 bg-rose-300"),
          colours && "border-2",
          active && "scale-125 ring-2 ring-white/70",
          receiver && !active && "ring-2 ring-white/35",
        )}
        style={colours ? { background: colours.fill, borderColor: colours.edge, color: colours.text } : undefined}
      >
        {player.shirtNumber}
      </span>
      {(active || receiver) && (
        <span
          className={cn(
            "absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[8px] font-bold leading-none text-white shadow-sm",
            receiver && !active && "text-white/75",
          )}
        >
          {playerSurname(player.name)}
        </span>
      )}
    </div>
  );
});

function PitchMarkings({ ripple }: { ripple: "left" | "right" | null }) {
  return (
    <>
      {/* Goal nets: they bulge when the ball goes in. */}
      <div className={cn("lf-net is-left absolute left-0 top-[42%] h-[16%] w-[2.2%]", ripple === "left" && "is-rippling")} />
      <div className={cn("lf-net is-right absolute right-0 top-[42%] h-[16%] w-[2.2%]", ripple === "right" && "is-rippling")} />
      {/* Corner flags. */}
      <span className="lf-flag absolute left-0 top-0" />
      <span className="lf-flag absolute right-0 top-0 is-right" />
      <span className="lf-flag absolute bottom-0 left-0 is-bottom" />
      <span className="lf-flag absolute bottom-0 right-0 is-right is-bottom" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/55" />
      <div className="absolute left-1/2 top-1/2 aspect-square h-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55" />
      <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
      <div className="absolute inset-y-[22%] -left-px w-[15%] border border-white/55" />
      <div className="absolute inset-y-[22%] -right-px w-[15%] border border-white/55" />
      <div className="absolute inset-y-[36%] -left-px w-[6%] border border-white/55" />
      <div className="absolute inset-y-[36%] -right-px w-[6%] border border-white/55" />
      <div className="absolute left-[10%] top-1/2 size-1 -translate-y-1/2 rounded-full bg-white/60" />
      <div className="absolute right-[10%] top-1/2 size-1 -translate-y-1/2 rounded-full bg-white/60" />
      <div className="absolute left-0 top-[42%] h-[16%] w-[1.8%] border-y border-r border-white/70 bg-white/10" />
      <div className="absolute right-0 top-[42%] h-[16%] w-[1.8%] border-y border-l border-white/70 bg-white/10" />
    </>
  );
}

function MatchGroundFrame({ ground }: { ground: MatchdayGroundPresentation }) {
  const stage = Math.max(0, Math.min(6, Math.round(ground.stage)));
  const fill = Math.max(0, Math.min(100, ground.fillPercent));
  const standDepth = 2.8 + stage * 0.45;
  const crowdAlpha = 0.12 + (fill / 100) * 0.45;
  const crowdPattern = {
    backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,${crowdAlpha.toFixed(2)}) 1px, transparent 1.35px)`,
    backgroundSize: stage >= 4 ? "4px 4px" : "5px 5px",
  };
  const standBase = "pointer-events-none absolute z-[2] overflow-hidden border-white/10 bg-[#19231f]/80 shadow-inner";

  return (
    <>
      <div
        aria-hidden="true"
        className={cn(standBase, "inset-x-0 bottom-0 border-t")}
        style={{ height: `${standDepth}%`, ...crowdPattern }}
      />
      {stage >= 1 && (
        <div
          aria-hidden="true"
          className={cn(standBase, "inset-x-0 top-0 border-b")}
          style={{ height: `${standDepth}%`, ...crowdPattern }}
        />
      )}
      {stage >= 2 && (
        <div
          aria-hidden="true"
          className={cn(standBase, "inset-y-0 left-0 border-r")}
          style={{ width: `${Math.max(1.5, standDepth * 0.62)}%`, ...crowdPattern }}
        />
      )}
      {stage >= 3 && (
        <div
          aria-hidden="true"
          className={cn(standBase, "inset-y-0 right-0 border-l")}
          style={{ width: `${Math.max(1.5, standDepth * 0.62)}%`, ...crowdPattern }}
        />
      )}

      {stage >= 4 && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-[1.7%] bg-black/55 shadow-[0_3px_10px_rgba(0,0,0,.45)]" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[1.7%] bg-black/55 shadow-[0_-3px_10px_rgba(0,0,0,.45)]" />
        </>
      )}

      {stage >= 2 && (
        <>
          {[
            "left-[1.5%] top-[1.5%]",
            "right-[1.5%] top-[1.5%]",
            "left-[1.5%] bottom-[1.5%]",
            "right-[1.5%] bottom-[1.5%]",
          ].map((position) => (
            <span
              key={position}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute z-[4] h-[6%] w-[0.65%] min-w-px rounded-t bg-slate-200/70 shadow-[0_0_8px_rgba(255,255,255,.28)]",
                position,
              )}
            />
          ))}
        </>
      )}

      <div className="pointer-events-none absolute right-2 top-2 z-30 max-w-[48%] rounded-lg border border-white/15 bg-black/60 px-2 py-1 text-right shadow-sm backdrop-blur-sm">
        <div className="truncate text-[8px] font-black uppercase tracking-[0.14em] text-white/55">
          Home ground · Stage {stage + 1}
        </div>
        <div className="truncate text-[9px] font-semibold text-white/90">{ground.shortName}</div>
        <div className="text-[8px] text-white/50">
          {ground.attendance.toLocaleString()} / {ground.capacity.toLocaleString()} · {fill}% full
        </div>
      </div>
    </>
  );
}

function renderSide(
  engine: Engine,
  lineup: MatchLineupPlayer[],
  side: "us" | "them",
  activeAction: MatchSequenceAction | undefined,
  expanded: boolean,
  colours?: DotColours,
) {
  return lineup.map((player) => {
    const key = `${side}-${player.playerId}`;
    const isReceiver =
      activeAction?.targetPlayerId === player.playerId && PASS_KINDS.has(activeAction.kind);
    return (
      <div
        key={key}
        ref={engine.refFor(key)}
        className="lf-body pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
        style={HIDDEN_STYLE}
      >
        <PlayerDot
          player={player}
          ours={side === "us"}
          active={activeAction?.playerId === player.playerId && activeAction?.side === side}
          receiver={isReceiver}
          expanded={expanded}
          colours={colours}
        />
      </div>
    );
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function MatchPitchViewer({
  events,
  usName,
  themName,
  userLineup = EMPTY_LINEUP,
  opponentLineup = EMPTY_LINEUP,
  userBench = EMPTY_LINEUP,
  opponentBench = EMPTY_LINEUP,
  substitutions = EMPTY_SUBS,
  userPlan,
  opponentPlan,
  userPossession,
  weather,
  playerStats,
  onReplayProgress,
  onReplayClock,
  expanded = false,
  userColours,
  opponentColours,
  ground,
}: {
  events: MatchEvent[];
  usName: string;
  themName: string;
  userLineup?: MatchLineupPlayer[];
  opponentLineup?: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
  userPlan?: MatchTeamPlan;
  opponentPlan?: MatchTeamPlan;
  /** The match's real possession share for the user (0-100). Defaults to an even split. */
  userPossession?: number;
  onReplayProgress?: (revealedEvents: number, complete: boolean) => void;
  onReplayClock?: (minute: number) => void;
  /** The match's weather (Clear, Overcast, Wet, Windy): drawn on the pitch. */
  weather?: string;
  /** Live player ratings for the stats drawer (the engine's playerStats). */
  playerStats?: MatchPlayerStats[];
  expanded?: boolean;
  /** Kit colours for each side's player dots. Falls back to green and red. */
  userColours?: DotColours;
  opponentColours?: DotColours;
  /** Home ground only. Omitted for away fixtures so we never pretend the user's stadium travelled. */
  ground?: MatchdayGroundPresentation;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("condensed");
  // Phones follow the ball; the expanded (large) view shows the whole pitch.
  const [zoomed, setZoomed] = useState(!expanded);
  const { ctx, cache } = useMemo(
    () => ({
      ctx: {
        userLineup,
        opponentLineup,
        userBench,
        opponentBench,
        substitutions,
        userPlan,
        opponentPlan,
        userPossession,
        viewMode,
      } satisfies MatchContext,
      cache: new Map<number, EventPlan>(),
    }),
    [opponentBench, opponentLineup, opponentPlan, substitutions, userBench, userLineup, userPlan, userPossession, viewMode],
  );

  const latest = useRef<Latest>({ events, cache, ctx, usName, themName, onReplayProgress, onReplayClock });
  const playback = useRef<PlaybackState>({
    cursor: 0,
    progress: 0,
    playing: true,
    speed: 1,
    frontier: 0,
    playedTo: 0,
    knownLength: 0,
  });
  const hudRef = useRef<Hud | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [timeline, setTimeline] = useState<TimelineState>({ position: 0, frontier: 0, playedTo: 0 });
  const [playing, setPlayingState] = useState(true);
  const [speed, setSpeedState] = useState<PlaybackSpeed>(1);
  const [engine] = useState(() =>
    createEngine({ latest, playback, hudRef, setHud, setTimeline, setPlayingState, setSpeedState }),
  );

  // Keep the engine's view of props current before any effect reads it.
  useIsomorphicLayoutEffect(() => {
    latest.current = { events, cache, ctx, usName, themName, onReplayProgress, onReplayClock };
  });

  useEffect(() => {
    engine.syncEvents();
  }, [engine, events.length]);

  useEffect(() => {
    engine.refresh();
  }, [engine, ctx, usName, themName]);

  useEffect(() => {
    engine.setBroadcast(zoomed);
  }, [engine, zoomed]);

  useEffect(() => () => engine.dispose(), [engine]);

  // The crowd comes in while the match is on screen; the theme fades out.
  useEffect(() => {
    enterMatch();
    return () => exitMatch();
  }, []);
  const [soundOn, setSoundOn] = useState(() => {
    const s = soundSettings();
    return s.effects || s.crowd;
  });
  useEffect(
    () =>
      onSoundSettingsChange(() => {
        const s = soundSettings();
        setSoundOn(s.effects || s.crowd);
      }),
    [],
  );
  const [statsOpen, setStatsOpen] = useState(false);
  // Confetti and a little shake when we score.
  const [celebrate, setCelebrate] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    if (!celebrate) return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 2_600);
    return () => window.clearTimeout(timer);
  }, [celebrate]);

  const cursor = hud?.cursor ?? 0;
  const plan = useMemo(
    () => planAt(cursor, events, cache, ctx, usName, themName),
    [cache, ctx, cursor, events, themName, usName],
  );
  const view = hud ?? (plan ? hudFor(0, samplePlan(plan, 0), plan, 0) : null);
  const minute = view?.minute ?? 0;

  const activeUserLineup = useMemo(
    () => activeMatchLineupAtMinute(userLineup, userBench, substitutions, "us", minute),
    [minute, substitutions, userBench, userLineup],
  );
  const activeOpponentLineup = useMemo(
    () => activeMatchLineupAtMinute(opponentLineup, opponentBench, substitutions, "them", minute),
    [minute, opponentBench, opponentLineup, substitutions],
  );

  const resultVisible = view?.resultVisible ?? false;
  const replayScore = useMemo(() => {
    const committed = events.slice(0, cursor).filter((event) => event.type === "goal");
    const current = events[cursor];
    const visible = current?.type === "goal" && resultVisible ? [...committed, current] : committed;
    return {
      us: visible.filter((event) => event.side === "us").length,
      them: visible.filter((event) => event.side === "them").length,
    };
  }, [cursor, events, resultVisible]);

  if (events.length === 0 || !plan || !view) return null;

  const renderSequence = view.inBridge ? plan.bridgeSequence : plan.sequence;
  const activeAction =
    view.actionIndex >= 0 ? renderSequence?.actions[view.actionIndex] : undefined;
  const bridge = plan.bridge;
  const passLabel =
    activeAction?.targetPlayerName && activeAction.playerName && PASS_KINDS.has(activeAction.kind)
      ? `${playerSurname(activeAction.playerName)} → ${playerSurname(activeAction.targetPlayerName)}`
      : null;
  const actionCommentary =
    activeAction?.commentary ??
    (view.inBridge && bridge
      ? bridge.text
      : (plan.active.text ?? "The match settles into shape."));
  const contextCommentary = view.inBridge && bridge && activeAction ? bridge.text : null;
  const showResultBadge =
    activeAction && ["save", "block", "miss"].includes(activeAction.kind) && view.badge;
  const showGoal = activeAction?.kind === "goal" && view.badge;
  const atLiveEdge = timeline.position >= timeline.frontier - 0.02;
  const nonPlay = !plan.sequence && !view.inBridge ? plan.active : null;
  const modeBadge = view.inBridge && bridge
    ? `▶▶ ${bridge.fromMinute}′ → ${bridge.toMinute}′`
    : nonPlay
      ? nonPlay.type === "card"
        ? "🟨 Booking"
        : nonPlay.type === "sub"
          ? "🔁 Substitution"
          : nonPlay.type === "injury"
            ? "✚ Injury"
            : null
      : plan.sequence
        ? "Key moment"
        : null;
  const showPassLine = !!activeAction && PASS_KINDS.has(activeAction.kind);
  // With the home-ground chip in the top-right, top-centre badges sit below it.
  const topSlot = ground ? "top-[3.4rem]" : "top-3";
  const markers = events
    .map((event, index) => ({ event, index }))
    .filter(({ event, index }) => (event.type === "goal" || event.type === "chance" || event.type === "card") && index + 0.95 <= timeline.frontier);
  const sliderMax = Math.max(0.001, timeline.frontier);
  // Momentum and stats count only what has been shown: no spoilers.
  const shown = events.slice(0, view.cursor + (view.resultVisible ? 1 : 0));
  const momentum = momentumAt(shown, view.minute, userPossession);
  const stats = matchStatsFrom(shown);
  const weatherKind = (weather ?? "Clear").toLowerCase();

  // Sounds only follow live, forward play: scrubbing back never replays a roar.
  const live = playing && atLiveEdge;
  const cueKey = `${view.cursor}:${view.inBridge ? "b" : "c"}:${view.actionIndex}`;
  const reachedEnd = !playing && atLiveEdge && view.cursor === events.length - 1 && view.minute >= 45;
  const confettiColours = [userColours?.fill ?? "#34d399", userColours?.edge ?? "#fbbf24", "#ffffff"];

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden bg-[#07130f] text-white",
        expanded ? "h-full flex-1 p-3 sm:p-4" : "border-b p-2.5 sm:p-3",
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold tnum">
        <span className="min-w-0 flex-1 truncate">{usName}</span>
        <strong className="shrink-0 rounded bg-black/25 px-2 py-0.5 font-display text-base">
          {replayScore.us}–{replayScore.them}
        </strong>
        <span className="min-w-0 flex-1 truncate text-right text-white/65">{themName}</span>
      </div>
      <div className={cn("lf-led mb-1.5", showGoal && "is-goal")} aria-hidden="true">
        <div className="lf-led-track">
          {showGoal
            ? "GOAL! GOAL! GOAL! GOAL! GOAL! GOAL! GOAL! GOAL!"
            : `${usName.toUpperCase()} · ${themName.toUpperCase()} · LEGACY FOOTBALL · MATCHDAY LIVE · ${usName.toUpperCase()} · ${themName.toUpperCase()} · LEGACY FOOTBALL · MATCHDAY LIVE ·`}
        </div>
      </div>
      <div className="mb-2">
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-white/5" role="radiogroup" aria-label="How much of the match to show">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={viewMode === mode.id}
              onClick={() => setViewMode(mode.id)}
              className={cn(
                "whitespace-nowrap px-1 py-1.5 text-[9px] font-bold uppercase tracking-wide",
                viewMode === mode.id ? "bg-emerald-400 text-[#07130f]" : "text-white/60 hover:bg-white/10",
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/45">Momentum</div>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="meter" aria-label="Momentum" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(momentum * 100)}>
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" />
          <div
            className={cn("absolute inset-y-0 rounded-full transition-all duration-700", momentum >= 0 ? "left-1/2 bg-emerald-400" : "right-1/2 bg-rose-400")}
            style={{ width: `${Math.abs(momentum) * 50}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => setStatsOpen((open) => !open)}
          className={cn("rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wide", statsOpen ? "bg-white text-[#07130f]" : "bg-white/10 text-white/75")}
          aria-expanded={statsOpen}
        >
          Stats
        </button>
      </div>
      <div
        ref={engine.pitchRef}
        className={cn(
          celebrating && "lf-shake",
          `lf-wx-${weatherKind}`,
          "relative w-full overflow-hidden rounded-2xl border border-white/25 bg-[linear-gradient(90deg,#17764f_0%,#17764f_12.5%,#1b8056_12.5%,#1b8056_25%,#17764f_25%,#17764f_37.5%,#1b8056_37.5%,#1b8056_50%,#17764f_50%,#17764f_62.5%,#1b8056_62.5%,#1b8056_75%,#17764f_75%,#17764f_87.5%,#1b8056_87.5%,#1b8056_100%)] shadow-inner",
          expanded ? "aspect-[1.58/1] max-h-[calc(100dvh-17rem)] flex-1" : "aspect-[1.62/1] max-h-52",
        )}
      >
        {ground && <MatchGroundFrame ground={ground} />}
        <div ref={engine.layerRef} className="absolute inset-0 z-10 will-change-transform">
        <PitchMarkings ripple={showGoal && activeAction ? (activeAction.end.x > 50 ? "right" : "left") : null} />

        {showPassLine && activeAction && (
          <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line
              x1={activeAction.start.x}
              y1={activeAction.start.y}
              x2={activeAction.end.x}
              y2={activeAction.end.y}
              stroke="white"
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {renderSide(engine, activeUserLineup, "us", activeAction, expanded, userColours)}
        {renderSide(engine, activeOpponentLineup, "them", activeAction, expanded, opponentColours)}

        <div
          ref={engine.refFor("ball")}
          className="pointer-events-none absolute left-0 top-0 z-40 will-change-transform"
          style={HIDDEN_STYLE}
        >
          {showGoal && (
            <span className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
              <span className="block size-10 animate-ping rounded-full border-2 border-amber-300" />
            </span>
          )}
          {/* Ground shadow stays put; the ball rises above it on lofted passes. */}
          <span className="absolute left-0 top-0 block h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 blur-[1px]" />
          <span className="block" style={{ transform: "translateY(calc(-1 * var(--lift, 0px)))" }}>
            <span
              className={cn(
                "relative block -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/50 bg-white shadow-[0_0_0_3px_rgba(255,255,255,.18),0_1px_9px_rgba(0,0,0,.9)]",
                expanded ? "size-3.5" : "size-3",
              )}
            />
          </span>
        </div>
        </div>

        {weatherKind !== "clear" && (
          <div className={cn("lf-weather pointer-events-none absolute inset-0 z-20", `is-${weatherKind}`)} aria-hidden="true">
            {weatherKind === "windy" &&
              Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="lf-debris" style={{ top: `${12 + ((i * 29) % 76)}%`, animationDelay: `${(i * 1.3) % 5}s` }} />
              ))}
          </div>
        )}
        {weather && (
          <div className={cn("absolute right-2 z-30 rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80", ground ? "top-[3.4rem]" : "top-2")}>
            {weatherKind === "wet" ? "🌧 Wet" : weatherKind === "windy" ? "💨 Windy" : weatherKind === "overcast" ? "☁ Overcast" : "☀ Clear"}
          </div>
        )}

        {statsOpen && (
          <div className="absolute inset-x-0 bottom-0 z-[55] max-h-[92%] overflow-y-auto rounded-t-xl border-t border-white/15 bg-[#07130f]/95 px-3 pb-2 pt-2 backdrop-blur-sm">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Match stats · {view.minute}′</span>
              <button type="button" onClick={() => setStatsOpen(false)} className="text-[10px] font-bold text-white/60">Close</button>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-1 text-[11px] tnum">
              {[
                ["Possession", `${Math.round(userPossession ?? 50)}%`, `${100 - Math.round(userPossession ?? 50)}%`],
                ["Goals", String(stats.us.goals), String(stats.them.goals)],
                ["Shots", String(stats.us.shots), String(stats.them.shots)],
                ["Set pieces", String(stats.us.setPieces), String(stats.them.setPieces)],
                ["Bookings", String(stats.us.cards), String(stats.them.cards)],
              ].map(([label, us, them]) => (
                <div key={label} className="contents">
                  <span className="text-right font-bold">{us}</span>
                  <span className="text-center text-[9px] uppercase tracking-wide text-white/50">{label}</span>
                  <span className="font-bold text-white/75">{them}</span>
                </div>
              ))}
            </div>
            {playerStats && playerStats.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-1.5">
                <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-white/50">Top performers</div>
                {[...playerStats]
                  .sort((a, b) => b.rating - a.rating)
                  .slice(0, 3)
                  .map((p) => (
                    <div key={p.playerId} className="flex items-center justify-between py-0.5 text-[11px]">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 font-bold tnum text-emerald-300">{p.rating.toFixed(1)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        <MatchSoundCues
          live={live}
          cueKey={cueKey}
          action={activeAction}
          inBridge={view.inBridge}
          booking={nonPlay?.type === "card"}
          cutLabel={view.cutLabel}
          cursor={view.cursor}
          reachedEnd={reachedEnd}
          eventCount={events.length}
          minute={view.minute}
          onOurGoal={() => setCelebrate((n) => n + 1)}
        />

        {celebrating && (
          <div className="lf-confetti-layer pointer-events-none absolute inset-0 z-[60] overflow-hidden" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => (
              <span
                key={`${celebrate}-${i}`}
                className="lf-confetti"
                style={{
                  // Spread pieces and start times independently so they scatter, not streak.
                  left: `${((i * 61) % 97) + ((i * 13) % 3)}%`,
                  background: confettiColours[i % confettiColours.length],
                  animationDelay: `${((i * 7) % 13) * 70}ms`,
                  animationDuration: `${2000 + ((i * 11) % 7) * 120}ms`,
                  ["--drift" as string]: `${((i * 53) % 60) - 30}px`,
                  ["--spin" as string]: `${((i * 97) % 720) - 360}deg`,
                }}
              />
            ))}
          </div>
        )}

        {modeBadge && (
          <div
            className={cn(
              "absolute left-2 top-2 z-30 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shadow-sm",
              view.inBridge ? "bg-black/55 text-white/80" : nonPlay ? "bg-amber-300 text-amber-950" : "bg-emerald-400 text-[#07130f]",
            )}
          >
            {modeBadge}
          </div>
        )}

        {/* Restart card: never blocks taps, and steps aside while paused. */}
        {view.cutLabel && playing && (
          <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-[#07130f]/75 backdrop-blur-[2px]" aria-live="polite">
            <div className="rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-center">
              <div className="font-display text-2xl leading-none tnum">{view.minute}′</div>
              <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">{view.cutLabel}</div>
            </div>
          </div>
        )}

        {passLabel && (
          <div className={cn("absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-bold text-white/85 shadow-sm backdrop-blur-sm", topSlot)}>
            {passLabel}
          </div>
        )}

        {showGoal && (
          <div className={cn("absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-amber-200/50 bg-amber-300 px-4 py-1.5 font-display text-lg text-amber-950 shadow-lg", topSlot)}>
            GOAL
          </div>
        )}
        {showResultBadge && (
          <div className={cn("absolute left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/20 bg-black/70 px-3 py-1 font-display text-sm uppercase tracking-wide text-white shadow-lg", topSlot)}>
            {activeAction.kind === "save" ? "SAVED" : activeAction.kind === "block" ? "BLOCKED" : "MISSED"}
          </div>
        )}

        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <span className="rounded bg-black/45 px-2 py-1 text-[10px] font-bold tnum backdrop-blur-sm">{view.minute}'</span>
          <button
            type="button"
            onClick={() => setZoomed((value) => !value)}
            className="rounded bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm"
            aria-pressed={zoomed}
          >
            {zoomed ? "Whole pitch" : "TV camera"}
          </button>
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm">
          {view.inBridge ? "Condensed play" : actionStage(activeAction, plan.active)}
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-black/15 px-2.5 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wide text-white/45">
          <span>Played match history</span>
          <span>
            {playing && atLiveEdge
              ? `LIVE · ${view.minute}'`
              : `PAUSED · ${view.minute}' · played to ${Math.round(timeline.playedTo)}'`}
          </span>
        </div>
        <div className="mb-1 flex items-center justify-between px-0.5 text-[9px] text-white/35">
          <span>0'</span>
          <span>Drag left to replay · rewinding pauses the match</span>
          <span>{Math.round(timeline.playedTo)}'</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
            onClick={() => engine.seek(0, 0, { snap: true, play: false })}
            aria-label="Rewind to the start and pause"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-400 text-[#07130f] hover:bg-emerald-300"
            onClick={() => engine.togglePlaying()}
            aria-label={playing ? "Pause match" : "Play match"}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 -top-3 h-2.5">
            {markers.map(({ event, index }) => (
              <button
                key={`${index}-${event.minute}`}
                type="button"
                title={`${event.minute}′ ${event.text}`}
                onClick={() => engine.seek(index, 0, { snap: true, play: false })}
                className={cn(
                  "pointer-events-auto absolute top-0 -translate-x-1/2 rounded-full",
                  event.type === "goal"
                    ? "size-2.5 bg-amber-300 ring-1 ring-black/40"
                    : event.type === "card"
                      ? "h-2 w-1.5 rounded-[1px] bg-yellow-300"
                      : "size-1.5 bg-white/55",
                  event.side === "them" && event.type !== "card" && "opacity-60",
                )}
                style={{ left: `${((index + 0.95) / sliderMax) * 100}%` }}
                aria-label={`Replay ${event.minute}′ ${event.type}`}
              />
            ))}
          </div>
          <input
            className="h-1.5 w-full cursor-pointer accent-emerald-400"
            type="range"
            min={0}
            max={Math.max(0.001, timeline.frontier)}
            step={0.01}
            value={Math.min(timeline.position, Math.max(0.001, timeline.frontier))}
            onChange={(event) => {
              const frontier = playback.current.frontier;
              const requested = Math.min(Number(event.target.value), frontier);
              const bounded = Math.max(0, Math.min(requested, events.length));
              const nextCursor = Math.min(
                events.length - 1,
                Math.floor(Math.min(bounded, Math.max(0, events.length - 0.000001))),
              );
              const nextProgress =
                bounded >= events.length ? 1 : Math.max(0, Math.min(1, bounded - nextCursor));
              engine.seek(nextCursor, nextProgress, { snap: true, play: false });
            }}
            aria-label="Rewind through the portion of the match already played"
          />
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
            onClick={() => {
              unlockAudio();
              updateSoundSettings({ effects: !soundOn, crowd: !soundOn });
            }}
            aria-label={soundOn ? "Mute match sound" : "Turn match sound on"}
            aria-pressed={soundOn}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
            {PLAYBACK_SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => engine.setSpeed(option)}
                className={cn(
                  "min-w-8 px-1.5 py-2 text-[9px] font-bold",
                  speed === option ? "bg-white text-[#07130f]" : "text-white/65 hover:bg-white/10",
                )}
                aria-label={`Playback speed ${option} times`}
              >
                {option}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={timeline.position >= timeline.frontier - 0.01}
            onClick={() => {
              const frontier = playback.current.frontier;
              const nextCursor = Math.min(
                events.length - 1,
                Math.floor(Math.min(frontier, Math.max(0, events.length - 0.000001))),
              );
              const nextProgress =
                frontier >= events.length ? 1 : Math.max(0, Math.min(1, frontier - nextCursor));
              engine.seek(nextCursor, nextProgress, { snap: false, play: true });
            }}
            aria-label="Return to the latest played moment and resume"
          >
            <span className="px-1 text-[9px] font-black uppercase tracking-wide">Live</span>
          </button>
        </div>
      </div>

      <div
        className={cn(
          "mt-2 min-h-12 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-snug",
          activeAction?.kind === "goal" && "border-amber-300/40 bg-amber-300/10",
        )}
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 font-bold text-emerald-300 tnum">{view.minute}'</span>
          <div className="min-w-0">
            <div>{actionCommentary}</div>
            {contextCommentary && contextCommentary !== actionCommentary && (
              <div className="mt-0.5 text-[10px] leading-snug text-white/45">{contextCommentary}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sound cues                                                          */
/* ------------------------------------------------------------------ */

/**
 * Turns what is on screen into sound: whistles, the crowd following the ball,
 * and reactions to shots and goals. Renders nothing. Only fires during live,
 * forward play, so scrubbing back through the timeline stays silent.
 */
function MatchSoundCues({
  live,
  cueKey,
  action,
  inBridge,
  booking,
  cutLabel,
  cursor,
  reachedEnd,
  eventCount,
  minute,
  onOurGoal,
}: {
  live: boolean;
  cueKey: string;
  action: MatchSequenceAction | undefined;
  inBridge: boolean;
  booking: boolean;
  cutLabel: string | null;
  cursor: number;
  reachedEnd: boolean;
  eventCount: number;
  minute: number;
  onOurGoal: () => void;
}) {
  const firedCue = useRef("");
  const firedCut = useRef("");
  const firedBreak = useRef("");

  useEffect(() => {
    if (!live || firedCue.current === cueKey) return;
    firedCue.current = cueKey;
    if (booking) playWhistle("short");
    if (!action) {
      setCrowdIntensity(inBridge ? 0.25 : 0.3);
      return;
    }
    const attacking = action.possessionSide ?? action.side;
    const towardsGoal = attacking === "us" ? action.end.x / 100 : 1 - action.end.x / 100;
    let intensity = 0.15 + 0.6 * Math.pow(Math.max(0, (towardsGoal - 0.45) / 0.55), 1.3);
    if (inBridge) intensity = Math.min(intensity, 0.45);
    switch (action.kind) {
      case "shot":
        playKick(1);
        intensity = 0.95;
        break;
      case "goal":
        if (action.side === "us") {
          playReaction("goal");
          onOurGoal();
        } else {
          playReaction("concede");
        }
        window.setTimeout(() => playWhistle("short"), 1_400);
        intensity = action.side === "us" ? 0.9 : 0.2;
        break;
      case "save":
      case "miss":
      case "block":
        // Our near miss is an "ooh"; theirs is relieved applause.
        playReaction(attacking === "us" ? "ooh" : "applause");
        intensity = 0.55;
        break;
      case "cross":
      case "throughBall":
      case "cutback":
        intensity = Math.max(intensity, 0.7);
        break;
    }
    setCrowdIntensity(intensity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey, live]);

  useEffect(() => {
    if (!live || !cutLabel || firedCut.current === `${cursor}:${cutLabel}`) return;
    firedCut.current = `${cursor}:${cutLabel}`;
    if (cutLabel === "Kick-off") playWhistle("kickoff");
    else if (cutLabel === "Corner" || cutLabel === "Free-kick" || cutLabel === "Penalty") playWhistle("short");
    if (cutLabel === "Penalty") setCrowdIntensity(0.05);
  }, [cutLabel, cursor, live]);

  useEffect(() => {
    if (!reachedEnd) return;
    const key = `${eventCount}:${minute >= 90 ? "ft" : "ht"}`;
    if (firedBreak.current === key) return;
    firedBreak.current = key;
    playWhistle(minute >= 90 ? "fulltime" : "halftime");
    setCrowdIntensity(minute >= 90 ? 0.6 : 0.3);
  }, [reachedEnd, eventCount, minute]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Momentum and live stats (from shown events only)                    */
/* ------------------------------------------------------------------ */

const SET_PIECE_TEXT = /corner|free-kick|penalty/i;

/**
 * Who is on top right now, -1 (them) to +1 (us). Recent goals and chances
 * count most (an 8-minute fade); bookings take a little away; possession
 * sets the baseline.
 */
function momentumAt(shown: MatchEvent[], minute: number, userPossession?: number): number {
  let score = ((userPossession ?? 50) - 50) / 50 * 0.4;
  for (const event of shown) {
    if (event.side === "neutral") continue;
    const sign = event.side === "us" ? 1 : -1;
    const fade = Math.exp(-Math.max(0, minute - event.minute) / 8);
    const weight = event.type === "goal" ? 3 : event.type === "chance" ? (SET_PIECE_TEXT.test(event.text) ? 0.8 : 1.2) : event.type === "card" ? -0.3 : 0;
    score += sign * weight * fade;
  }
  return Math.tanh(score / 2.5);
}

function matchStatsFrom(shown: MatchEvent[]) {
  const blank = () => ({ goals: 0, shots: 0, setPieces: 0, cards: 0 });
  const out = { us: blank(), them: blank() };  for (const event of shown) {
    if (event.side === "neutral") continue;
    const side = out[event.side];
    if (event.type === "goal") {
      side.goals += 1;
      side.shots += 1;
    }
    if (event.type === "chance") side.shots += 1;
    if ((event.type === "goal" || event.type === "chance") && SET_PIECE_TEXT.test(event.text) && !/shouts/i.test(event.text)) side.setPieces += 1;
    if (event.type === "card") side.cards += 1;
  }
  return out;
}