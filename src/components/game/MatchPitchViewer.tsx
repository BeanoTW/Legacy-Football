import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type {
  MatchEvent,
  MatchLineupPlayer,
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
  type MatchPitchPoint,
  type MatchSequence,
  type MatchSequenceAction,
  type MatchSequenceFrame,
} from "@/lib/game/matchSequence";
import { motionFrameForSequence } from "@/lib/game/matchMotion";
import { cn } from "@/lib/utils";

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
 */

const PLAYBACK_SPEEDS = [1, 2, 4] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
const BASE_EVENT_MS = 4_800;

/** How quickly a rendered player catches up with its target (ms time constant). */
const PLAYER_FOLLOW_MS = 70;
/** The ball is tighter to its path so passes still feel crisp. */
const BALL_FOLLOW_MS = 28;
/** How long a detected teleport takes to blend out (ms time constant). */
const JUMP_BLEND_MS = 320;
/** Clamp for long frames (tab switches, GC pauses) so nothing lurches. */
const MAX_FRAME_MS = 64;
/** Slider/timeline state is pushed to React at most this often. */
const TIMELINE_PUSH_MS = 100;
const SETTLE_EPSILON = 0.02;

const EMPTY_LINEUP: MatchLineupPlayer[] = [];
const EMPTY_SUBS: MatchSubstitution[] = [];
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
  if (event.type === "sub" || event.type === "injury" || event.type === "card") return 3_200;
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
}

function buildEventPlan(
  active: MatchEvent,
  previousEvent: MatchEvent | undefined,
  ctx: MatchContext,
  usName: string,
  themName: string,
): EventPlan {
  const sequence = buildMatchSequence({ event: active, ...ctx });
  const previousSequence = previousEvent ? buildMatchSequence({ event: previousEvent, ...ctx }) : null;
  const bridge = commentaryBridge(previousEvent, active, usName, themName);
  const bridgeSequence = bridge
    ? buildMatchFlowSequence({
        nextEvent: active,
        previousEvent,
        nextSequence: sequence ?? undefined,
        ...ctx,
      })
    : null;
  const sequenceBaseDuration = eventDurationMs(active, sequence);
  const bridgeGap = bridge ? Math.max(0, bridge.toMinute - bridge.fromMinute) : 0;
  const bridgeDuration =
    bridge && bridgeSequence
      ? Math.max(bridge.durationMs, flowSequenceDurationMs(bridgeSequence, bridgeGap))
      : (bridge?.durationMs ?? 0);
  const duration = sequenceBaseDuration + bridgeDuration;
  return {
    active,
    previousEvent,
    sequence,
    previousSequence,
    bridge,
    bridgeSequence,
    duration,
    bridgeFraction: bridgeDuration > 0 ? bridgeDuration / Math.max(1, duration) : 0,
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
  const active = events[index];
  if (!active) return null;
  const previousEvent = index > 0 ? events[index - 1] : undefined;
  const cached = cache.get(index);
  if (cached && cached.active === active && cached.previousEvent === previousEvent) return cached;
  const plan = buildEventPlan(active, previousEvent, ctx, usName, themName);
  cache.set(index, plan);
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
  return {
    inBridge,
    frame,
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
}

function hudFor(cursor: number, sample: PlanSample): Hud {
  return {
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
    a.minute === b.minute
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
    return { tx: target.x, ty: target.y, ox: 0, oy: 0, rx: target.x, ry: target.y };
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
  const follow = 1 - Math.exp(-dt / followMs);
  body.rx += (body.tx + body.ox - body.rx) * follow;
  body.ry += (body.ty + body.oy - body.ry) * follow;
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
  onReplayProgress?: (revealedEvents: number, complete: boolean, minute: number) => void;
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
    if (node.style.visibility) node.style.visibility = "";
  }

  function publish(sample: PlanSample, force: boolean) {
    const pb = deps.playback.current;
    const nextHud = hudFor(pb.cursor, sample);
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

    const { events, onReplayProgress } = deps.latest.current;
    const revealed = Math.min(events.length, pb.cursor + (sample.resultVisible ? 1 : 0));
    const complete =
      events.length > 0 && !pb.playing && pb.cursor >= events.length - 1 && pb.progress >= 0.99;
    const minute = Math.round(sample.minute);
    const report = `${revealed}:${complete}:${minute}`;
    if (report !== lastReport) {
      lastReport = report;
      onReplayProgress?.(revealed, complete, minute);
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
      paint(key);
    };

    for (const player of userActive) {
      place(
        `us-${player.playerId}`,
        motion.user.get(player.playerId) ?? userShape.get(player.playerId) ?? { x: 45, y: 50 },
        PLAYER_FOLLOW_MS,
      );
    }
    for (const player of opponentActive) {
      place(
        `them-${player.playerId}`,
        motion.opponent.get(player.playerId) ??
          opponentShape.get(player.playerId) ?? { x: 55, y: 50 },
        PLAYER_FOLLOW_MS,
      );
    }
    place("ball", sample.ball, BALL_FOLLOW_MS);

    publish(sample, force);
    return settled;
  }

  function advance(dt: number) {
    const pb = deps.playback.current;
    if (!pb.playing) return;
    const plan = currentPlan();
    if (!plan) return;
    const length = deps.latest.current.events.length;
    pb.progress += (dt * pb.speed) / Math.max(1, plan.duration);
    if (pb.progress >= 1) {
      if (pb.cursor >= length - 1) {
        pb.progress = 1;
        setPlaying(false);
      } else {
        pb.cursor += 1;
        pb.progress = 0;
      }
    }
    const position = pb.cursor + pb.progress;
    if (position > pb.frontier) pb.frontier = position;
  }

  function tick(now: number) {
    const dt = lastTs === null ? 16.7 : Math.min(MAX_FRAME_MS, Math.max(0, now - lastTs));
    lastTs = now;
    advance(dt);
    const settled = renderFrame(dt, false, false);
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
      let callback = refCallbacks.get(key);
      if (!callback) {
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
      <span
        className={cn(
          "grid place-items-center rounded-full border font-black leading-none shadow-sm transition-transform duration-150",
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

function PitchMarkings() {
  return (
    <>
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
        className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
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
  onReplayProgress,
  expanded = false,
  userColours,
  opponentColours,
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
  onReplayProgress?: (revealedEvents: number, complete: boolean, minute: number) => void;
  expanded?: boolean;
  /** Kit colours for each side's player dots. Falls back to green and red. */
  userColours?: DotColours;
  opponentColours?: DotColours;
}) {
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
      } satisfies MatchContext,
      cache: new Map<number, EventPlan>(),
    }),
    [opponentBench, opponentLineup, opponentPlan, substitutions, userBench, userLineup, userPlan],
  );

  const latest = useRef<Latest>({ events, cache, ctx, usName, themName, onReplayProgress });
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
    latest.current = { events, cache, ctx, usName, themName, onReplayProgress };
  });

  useEffect(() => {
    engine.syncEvents();
  }, [engine, events.length]);

  useEffect(() => {
    engine.refresh();
  }, [engine, ctx, usName, themName]);

  useEffect(() => () => engine.dispose(), [engine]);

  const cursor = hud?.cursor ?? 0;
  const plan = useMemo(
    () => planAt(cursor, events, cache, ctx, usName, themName),
    [cache, ctx, cursor, events, themName, usName],
  );
  const view = hud ?? (plan ? hudFor(0, samplePlan(plan, 0)) : null);
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

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-[#07130f] text-white",
        expanded ? "h-full flex-1 p-3 sm:p-4" : "border-b p-2.5 sm:p-3",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          Live match simulation
          {renderSequence && <span className="ml-2 text-white/45">· {renderSequence.styleLabel}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold tnum">
          <span className="max-w-24 truncate">{usName}</span>
          <strong className="rounded bg-black/25 px-2 py-0.5 font-display text-base">
            {replayScore.us}–{replayScore.them}
          </strong>
          <span className="max-w-24 truncate text-white/65">{themName}</span>
        </div>
      </div>

      <div
        ref={engine.pitchRef}
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-white/25 bg-[linear-gradient(90deg,#17764f_0%,#17764f_12.5%,#1b8056_12.5%,#1b8056_25%,#17764f_25%,#17764f_37.5%,#1b8056_37.5%,#1b8056_50%,#17764f_50%,#17764f_62.5%,#1b8056_62.5%,#1b8056_75%,#17764f_75%,#17764f_87.5%,#1b8056_87.5%,#1b8056_100%)] shadow-inner",
          expanded ? "aspect-[1.58/1] max-h-[calc(100dvh-17rem)] flex-1" : "aspect-[1.62/1] max-h-52",
        )}
      >
        <PitchMarkings />

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
          <span
            className={cn(
              "relative block -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/50 bg-white shadow-[0_0_0_3px_rgba(255,255,255,.18),0_1px_9px_rgba(0,0,0,.9)]",
              expanded ? "size-3.5" : "size-3",
            )}
          />
        </div>

        {passLabel && (
          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-bold text-white/85 shadow-sm backdrop-blur-sm">
            {passLabel}
          </div>
        )}

        {showGoal && (
          <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-amber-200/50 bg-amber-300 px-4 py-1.5 font-display text-lg text-amber-950 shadow-lg">
            GOAL
          </div>
        )}
        {showResultBadge && (
          <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-white/20 bg-black/70 px-3 py-1 font-display text-sm uppercase tracking-wide text-white shadow-lg">
            {activeAction.kind === "save" ? "SAVED" : activeAction.kind === "block" ? "BLOCKED" : "MISSED"}
          </div>
        )}

        <div className="absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[10px] font-bold tnum backdrop-blur-sm">
          {view.minute}'
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm">
          {view.inBridge ? "Match flow" : actionStage(activeAction, plan.active)}
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
          <input
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-400"
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