import type {
  MatchEvent,
  MatchLineupPlayer,
  MatchSubstitution,
  MatchTeamPlan,
  TacticalPosition,
} from "./types";
import {
  formationPitchShape,
  resolveManagerFormation,
  wideDefenderMovement,
} from "./managerFormationLayout";

export interface MatchPitchPoint {
  x: number;
  y: number;
}

export type FootballActionKind =
  | "receive"
  | "interception"
  | "challenge"
  | "tackle"
  | "clearance"
  | "blockPass"
  | "recovery"
  | "carry"
  | "pass"
  | "recycle"
  | "switch"
  | "throughBall"
  | "overlap"
  | "cutback"
  | "cross"
  | "press"
  | "shot"
  | "save"
  | "block"
  | "miss"
  | "goal";

export type SetPieceKind = "corner" | "freeKick" | "penalty";

export type MatchSequencePattern =
  | "patient"
  | "balanced"
  | "direct"
  | "wide"
  | "counter"
  | "highPress"
  | "setPiece"
  | "circulation";

export interface MatchSequenceAction {
  id: string;
  kind: FootballActionKind;
  side: "us" | "them";
  /** Team controlling the ball after/during this action. Defensive pressure can differ from actor side. */
  possessionSide?: "us" | "them";
  playerId?: string;
  playerName?: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  start: MatchPitchPoint;
  end: MatchPitchPoint;
  /** Relative playback time. Rendering speed may scale this but not reorder it. */
  weight: number;
  commentary: string;
}

export interface MatchSequence {
  id: string;
  minute: number;
  side: "us" | "them";
  phase: MatchEvent["phase"];
  sourceType: MatchEvent["type"];
  sourceText: string;
  pattern: MatchSequencePattern;
  /** Which dead ball a set-piece sequence is, so play before it can earn it. */
  setPiece?: SetPieceKind;
  /** How an open-play clip restarts the game, so the viewer can signpost the cut. */
  restart?: "kickoff" | "keeper" | "goalKick" | "loose" | "open";
  styleLabel: string;
  actions: MatchSequenceAction[];
  participantIds: string[];
  totalWeight: number;
}

export interface MatchSequenceInput {
  event: MatchEvent;
  userLineup: MatchLineupPlayer[];
  opponentLineup: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
  userPlan?: MatchTeamPlan;
  opponentPlan?: MatchTeamPlan;
}

export interface MatchSequenceFrame {
  action: MatchSequenceAction;
  actionIndex: number;
  localProgress: number;
  ball: MatchPitchPoint;
}

type Side = "us" | "them";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function seedOf(event: MatchEvent, salt = ""): number {
  const input = `${event.sequenceId ?? `${event.minute}:${event.type}:${event.side}`}:${salt}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic stream of 0-1 numbers from a seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surname(name: string): string {
  return name.trim().split(/\s+/).pop() ?? name;
}

const DEFAULT_PLAN: MatchTeamPlan = {
  managerId: null,
  managerName: "Caretaker",
  formation: "4-4-2",
  philosophy: "Balanced",
  squadFit: 50,
  tempo: "Medium",
  pressing: "Medium",
  directness: "Medium",
};

function planForSide(input: MatchSequenceInput, side: Side): MatchTeamPlan {
  return side === "us" ? input.userPlan ?? DEFAULT_PLAN : input.opponentPlan ?? DEFAULT_PLAN;
}

function otherSide(side: Side): Side {
  return side === "us" ? "them" : "us";
}

/**
 * Who is on the pitch at a minute. A substitute takes over the role of the
 * player he replaced, so the viewer shows the same formation after changes.
 */
export function activeMatchLineupAtMinute(
  starters: MatchLineupPlayer[],
  bench: MatchLineupPlayer[],
  substitutions: MatchSubstitution[],
  side: Side,
  minute: number,
): MatchLineupPlayer[] {
  // Replace in place so the substitute also inherits the outgoing player's
  // slot (left-sided centre-back stays left-sided) as well as his role.
  const active = [...starters];
  for (const sub of substitutions
    .filter((item) => item.side === side && item.minute <= minute)
    .sort((a, b) => a.minute - b.minute)) {
    const index = active.findIndex((player) => player.playerId === sub.playerOffId);
    const incoming = bench.find((player) => player.playerId === sub.playerOnId);
    if (index >= 0) {
      if (incoming) active[index] = { ...incoming, role: active[index].role };
      else active.splice(index, 1);
    } else if (incoming) {
      active.push(incoming);
    }
  }
  return active;
}

function chanceOutcome(event: MatchEvent): "save" | "wide" | "blocked" | "over" {
  const text = event.text.toLowerCase();
  if (text.includes("save") || text.includes("smother")) return "save";
  if (text.includes("block") || text.includes("turned behind") || text.includes("cleared")) return "blocked";
  if (text.includes("over")) return "over";
  if (text.includes("wide") || text.includes("dragged")) return "wide";
  return ["save", "wide", "blocked", "over"][seedOf(event, "outcome") % 4] as
    | "save"
    | "wide"
    | "blocked"
    | "over";
}

function shotDestination(event: MatchEvent): MatchPitchPoint {
  const direction = event.side === "us" ? 1 : -1;
  const seed = seedOf(event, "shot");
  if (event.type === "goal") {
    return { x: direction === 1 ? 99.3 : 0.7, y: 44 + (seed % 13) };
  }
  const outcome = chanceOutcome(event);
  if (outcome === "save") {
    return { x: direction === 1 ? 94.5 : 5.5, y: 43 + (seed % 15) };
  }
  if (outcome === "blocked") {
    return { x: direction === 1 ? 86 : 14, y: 34 + (seed % 33) };
  }
  return {
    x: direction === 1 ? 98.2 : 1.8,
    y:
      outcome === "over"
        ? seed % 2 === 0
          ? 34
          : 66
        : seed % 2 === 0
          ? 27
          : 73,
  };
}

/** Which dead ball the commentary describes. Appeals ("penalty shouts") are open play. */
function setPieceKind(event: MatchEvent): SetPieceKind {
  const text = event.text.toLowerCase();
  if (text.includes("penalty") && !text.includes("shouts")) return "penalty";
  if (text.includes("free-kick")) return "freeKick";
  return "corner";
}

function isPenaltyAppeal(event: MatchEvent): boolean {
  return /penalty shouts/i.test(event.text);
}

function sequencePattern(event: MatchEvent, plan: MatchTeamPlan): MatchSequencePattern {
  if (event.phase === "setPiece" && !isPenaltyAppeal(event)) return "setPiece";
  if (event.phase === "transition") {
    if (plan.pressing === "High") return "highPress";
    return "counter";
  }
  if (plan.philosophy === "Direct" || plan.directness === "High") return "direct";
  if (plan.philosophy === "Possession" || plan.directness === "Low") {
    return seedOf(event, "patient-or-wide") % 3 === 0 ? "wide" : "patient";
  }
  if (plan.philosophy === "Front-foot") {
    return seedOf(event, "front-foot") % 2 === 0 ? "wide" : "balanced";
  }
  if (plan.philosophy === "Defensive" && event.phase !== "finalThird") return "counter";
  return seedOf(event, "balanced-pattern") % 4 === 0 ? "wide" : "balanced";
}

function styleLabel(pattern: MatchSequencePattern): string {
  switch (pattern) {
    case "patient":
      return "Patient possession";
    case "direct":
      return "Direct attack";
    case "wide":
      return "Wide overload";
    case "counter":
      return "Counter attack";
    case "highPress":
      return "High-press regain";
    case "setPiece":
      return "Set piece";
    case "circulation":
      return "Open play";
    default:
      return "Balanced build-up";
  }
}

function tempoScale(plan: MatchTeamPlan): number {
  return plan.tempo === "High" ? 0.84 : plan.tempo === "Low" ? 1.16 : 1;
}

function action(
  sequenceId: string,
  index: number,
  values: Omit<MatchSequenceAction, "id">,
): MatchSequenceAction {
  return {
    id: `${sequenceId}:a${index}`,
    ...values,
    possessionSide: values.possessionSide ?? values.side,
  };
}

function passCommentary(
  kind: FootballActionKind,
  holder: MatchLineupPlayer,
  receiver: MatchLineupPlayer,
): string {
  const from = surname(holder.name);
  const to = surname(receiver.name);
  switch (kind) {
    case "recycle":
      return `${from} recycles possession to ${to}.`;
    case "switch":
      return `${from} switches play towards ${to}.`;
    case "throughBall":
      return `${from} slips ${to} through.`;
    case "overlap":
      return `${from} releases ${to} on the overlap.`;
    case "cutback":
      return `${from} cuts it back for ${to}.`;
    case "cross":
      return `${from} delivers towards ${to}.`;
    default:
      return `${from} finds ${to}.`;
  }
}

type DefensiveSecondPhase =
  | "none"
  | "challenge"
  | "clearanceRecovery"
  | "blockRecovery";

function defensiveSecondPhase(
  event: MatchEvent,
  participantCount: number,
  defendingPlan: MatchTeamPlan,
): DefensiveSecondPhase {
  if (participantCount < 2) return "none";

  const pressureThreshold =
    defendingPlan.pressing === "High"
      ? 8
      : defendingPlan.pressing === "Low"
        ? 4
        : 6;
  const eventThreshold = Math.max(
    2,
    pressureThreshold -
      (event.type === "goal" ? 2 : 0) +
      (defendingPlan.philosophy === "Defensive" ? 1 : 0),
  );
  const interventionRoll = seedOf(event, "defensive-second-phase") % 10;
  if (interventionRoll >= eventThreshold) return "none";
  if (participantCount < 3) return "challenge";

  const modeRoll = seedOf(event, "defensive-second-phase-mode") % 3;
  if (modeRoll === 0) return "clearanceRecovery";
  if (modeRoll === 1) return "challenge";
  return "blockRecovery";
}

function clearanceDestination(
  point: MatchPitchPoint,
  defendingSide: Side,
  event: MatchEvent,
  salt: string,
): MatchPitchPoint {
  const direction = defendingSide === "us" ? 1 : -1;
  const seed = seedOf(event, salt);
  return {
    x: clamp(point.x + direction * (9 + (seed % 7)), 8, 92),
    y: clamp(point.y + (seed % 2 === 0 ? -1 : 1) * (8 + (seed % 11)), 9, 91),
  };
}

function shouldShowPressure(event: MatchEvent, defendingPlan: MatchTeamPlan): boolean {
  if (defendingPlan.pressing === "High") return true;
  if (defendingPlan.pressing === "Low") return seedOf(event, "pressure") % 5 === 0;
  return seedOf(event, "pressure") % 2 === 0;
}

/* ================================================================== */
/* Spatial model                                                       */
/* ================================================================== */

/** Pitch units are percentages of a ~105 × 68 m pitch. */
const XM = 1.05;
const YM = 0.68;

function metres(a: MatchPitchPoint, b: MatchPitchPoint): number {
  return Math.hypot((a.x - b.x) * XM, (a.y - b.y) * YM);
}

/** Shortest distance (metres) from p to the segment a→b. */
function distanceToLane(p: MatchPitchPoint, a: MatchPitchPoint, b: MatchPitchPoint): number {
  const ax = a.x * XM;
  const ay = a.y * YM;
  const bx = b.x * XM;
  const by = b.y * YM;
  const px = p.x * XM;
  const py = p.y * YM;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const LEFT_ROLES = new Set<TacticalPosition>(["LB", "LWB", "LM", "LW"]);
const RIGHT_ROLES = new Set<TacticalPosition>(["RB", "RWB", "RM", "RW"]);
const FULL_BACKS = new Set<TacticalPosition>(["LB", "RB", "LWB", "RWB"]);const FORWARD_ROLES = new Set<TacticalPosition>(["ST", "LW", "RW", "CAM", "LM", "RM"]);
const DEEP_ROLES = new Set<TacticalPosition>(["GK", "CB"]);

/** Neutral depth used only for the canonical touch points of scorer/creator. */
const TOUCH_DEPTH: Record<TacticalPosition, number> = {
  GK: 6,
  CB: 22,
  LB: 26,
  RB: 26,
  LWB: 34,
  RWB: 34,
  CDM: 36,
  CM: 45,
  CAM: 55,
  LM: 50,
  RM: 50,
  LW: 60,
  RW: 60,
  ST: 64,
};

const CENTRAL_SPREAD: Partial<Record<TacticalPosition, [number, number]>> = {
  CB: [34, 66],
  CDM: [40, 60],
  CM: [34, 66],
  CAM: [40, 60],
  ST: [40, 60],
};

function roleLane(role: TacticalPosition, occurrence = 0, count = 1): number {
  if (LEFT_ROLES.has(role)) return role === "LW" ? 17 : 15;
  if (RIGHT_ROLES.has(role)) return role === "RW" ? 83 : 85;
  if (role !== "GK" && count > 1) {
    const [low, high] = CENTRAL_SPREAD[role] ?? [38, 62];
    return low + ((high - low) * occurrence) / (count - 1);
  }
  return 50;
}

function rolePitchPoint(
  role: TacticalPosition,
  side: Side,
  occurrence = 0,
  count = 1,
): MatchPitchPoint {
  const depth = TOUCH_DEPTH[role];
  return { x: side === "us" ? depth : 100 - depth, y: roleLane(role, occurrence, count) };
}

/** The side's formation shape: shared with off-ball motion so both agree. */
function baseShape(lineup: MatchLineupPlayer[], side: Side, formation: string): Map<string, MatchPitchPoint> {
  return formationPitchShape(lineup, resolveManagerFormation(formation), side);
}

/** Team shape around the ball: in possession the block pushes up and spreads, out of it the block drops and narrows. */
function teamShape(
  lineup: MatchLineupPlayer[],
  base: Map<string, MatchPitchPoint>,
  side: Side,
  ball: MatchPitchPoint,
  inPossession: boolean,
  plan: MatchTeamPlan,
): Map<string, MatchPitchPoint> {
  const dir = side === "us" ? 1 : -1;
  const formation = resolveManagerFormation(plan.formation);
  const possessionMinded = plan.philosophy === "Possession" || plan.directness === "Low";
  const result = new Map<string, MatchPitchPoint>();
  for (const player of lineup) {
    const home = base.get(player.playerId) ?? { x: 50, y: 50 };
    if (player.role === "GK") {
      result.set(player.playerId, { x: side === "us" ? 6 : 94, y: 50 });
      continue;
    }
    const wide = wideDefenderMovement(player.role, formation, possessionMinded);
    let x: number;
    let y: number;
    if (inPossession) {
      const push = plan.directness === "High" ? 5 : 7;
      x = home.x * 0.35 + (ball.x + (home.x - 50) * 0.75) * 0.65 + dir * (push + wide.push);
      y = 50 + (home.y - 50) * 1.1 + (ball.y - 50) * 0.14;
    } else {
      const drop = plan.pressing === "High" ? 1 : plan.pressing === "Low" ? 7 : 4;
      // Wing-backs in a back three drop in to make a back five without the ball.
      x = home.x * 0.35 + (ball.x + (home.x - 50) * 0.6) * 0.65 - dir * (drop + wide.recover);
      y = 50 + (home.y - 50) * 0.8 + (ball.y - 50) * 0.32;
    }
    result.set(player.playerId, { x: clamp(x, 4, 96), y: clamp(y, 6, 94) });
  }
  return result;
}

/** Keeps wide players on their own flank when they receive. */
function flankClamp(role: TacticalPosition, point: MatchPitchPoint): MatchPitchPoint {
  if (LEFT_ROLES.has(role)) return { x: point.x, y: Math.min(point.y, 40) };
  if (RIGHT_ROLES.has(role)) return { x: point.x, y: Math.max(point.y, 60) };
  return point;
}

/** Where the scorer takes his shot from, by position. */
function shootingSpot(role: TacticalPosition, event: MatchEvent, dir: number): MatchPitchPoint {
  const seed = seedOf(event, "shooting-spot");
  const quality = clamp(event.xg ?? 0.12, 0, 0.6);
  let depth: number;
  let y: number;
  if (role === "ST") {
    depth = 85 + quality * 10;
    y = 42 + (seed % 17);
  } else if (role === "CAM" || role === "CM" || role === "CDM") {
    depth = 78 + quality * 8;
    y = 38 + (seed % 25);
  } else if (LEFT_ROLES.has(role)) {
    depth = 81 + quality * 8;
    y = 33 + (seed % 9);
  } else if (RIGHT_ROLES.has(role)) {
    depth = 81 + quality * 8;
    y = 59 + (seed % 9);
  } else {
    // Centre-backs and keepers only arrive from set pieces.
    depth = 90;
    y = 43 + (seed % 15);
  }
  depth = clamp(depth, 74, 93);
  return { x: dir > 0 ? depth : 100 - depth, y };
}

interface Candidate {
  player: MatchLineupPlayer;
  point: MatchPitchPoint;
  through: boolean;
  score: number;
}

interface PossessionConfig {
  event: MatchEvent;
  salt: string;
  side: Side;
  plan: MatchTeamPlan;
  opponentPlan: MatchTeamPlan;
  attackers: MatchLineupPlayer[];
  defenders: MatchLineupPlayer[];
  pattern: MatchSequencePattern;
  sequenceId: string;
  actions: MatchSequenceAction[];
  counter: { next: number };
  /** Flow possessions never enter the final third. */
  maxDepth?: number;
}

/**
 * One team in possession, choosing passes from the picture in front of it.
 * Every decision weighs distance, passing lane, space at the receiver and
 * progress, with a seeded random pick among the good options.
 */
class Possession {
  readonly cfg: PossessionConfig;
  readonly dir: number;
  readonly rand: () => number;
  readonly tempo: number;
  private readonly attackBase: Map<string, MatchPitchPoint>;
  private readonly defenceBase: Map<string, MatchPitchPoint>;
  holder: MatchLineupPlayer;
  ball: MatchPitchPoint;
  lastPasser: string | undefined;
  flank: "left" | "right";
  readonly touches = new Map<string, number>();

  constructor(cfg: PossessionConfig, holder: MatchLineupPlayer, ball: MatchPitchPoint) {
    this.cfg = cfg;
    this.dir = cfg.side === "us" ? 1 : -1;
    this.rand = rng(seedOf(cfg.event, `possession:${cfg.salt}`));
    this.tempo = tempoScale(cfg.plan);
    this.attackBase = baseShape(cfg.attackers, cfg.side, cfg.plan.formation);
    this.defenceBase = baseShape(cfg.defenders, otherSide(cfg.side), cfg.opponentPlan.formation);
    this.holder = holder;
    this.ball = { ...ball };
    this.flank = seedOf(cfg.event, `flank:${cfg.salt}`) % 2 === 0 ? "left" : "right";
    this.touches.set(holder.playerId, 1);
  }

  attackPositions(): Map<string, MatchPitchPoint> {
    return teamShape(this.cfg.attackers, this.attackBase, this.cfg.side, this.ball, true, this.cfg.plan);
  }

  defencePositions(): Map<string, MatchPitchPoint> {
    return teamShape(this.cfg.defenders, this.defenceBase, otherSide(this.cfg.side), this.ball, false, this.cfg.opponentPlan);
  }

  /** Depth of a point measured towards the opponent's goal (0-100). */
  depth(point: MatchPitchPoint): number {
    return this.dir > 0 ? point.x : 100 - point.x;
  }

  private push(values: Omit<MatchSequenceAction, "id">) {
    this.cfg.actions.push(action(this.cfg.sequenceId, this.cfg.counter.next++, values));
  }

  nearestDefender(point: MatchPitchPoint, exclude = new Set<string>()): MatchLineupPlayer | undefined {
    const positions = this.defencePositions();
    let best: MatchLineupPlayer | undefined;
    let bestDistance = Infinity;
    for (const player of this.cfg.defenders) {
      if (player.role === "GK" || exclude.has(player.playerId)) continue;
      const position = positions.get(player.playerId);
      if (!position) continue;
      const distance = metres(position, point);
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  nearestAttacker(point: MatchPitchPoint, exclude: Set<string>, eligible?: (player: MatchLineupPlayer) => boolean): MatchLineupPlayer | undefined {
    const positions = this.attackPositions();
    let best: MatchLineupPlayer | undefined;
    let bestDistance = Infinity;
    for (const player of this.cfg.attackers) {
      if (exclude.has(player.playerId) || (eligible && !eligible(player))) continue;
      const position = positions.get(player.playerId);
      if (!position) continue;
      const distance = metres(position, point);
      if (distance < bestDistance) {
        best = player;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Depth of the defending back line (the offside line), in attacking terms. */
  lastLineDepth(): number {
    let deepest = 0;
    for (const player of this.cfg.defenders) {
      if (player.role === "GK") continue;
      const position = this.defencePositions().get(player.playerId);
      if (position) deepest = Math.max(deepest, this.depth(position));
    }
    return deepest || 80;
  }

  private space(point: MatchPitchPoint): number {
    let nearest = Infinity;
    for (const position of this.defencePositions().values()) nearest = Math.min(nearest, metres(position, point));
    return nearest;
  }

  private laneSafety(from: MatchPitchPoint, to: MatchPitchPoint): number {
    let nearest = Infinity;
    for (const [id, position] of this.defencePositions()) {
      const player = this.cfg.defenders.find((p) => p.playerId === id);
      if (player?.role === "GK") continue;
      nearest = Math.min(nearest, distanceToLane(position, from, to));
    }
    return nearest;
  }

  start(kind: "receive" | "interception" | "recovery", commentary: string, weight: number) {
    this.push({
      kind,
      side: this.cfg.side,
      possessionSide: this.cfg.side,
      playerId: this.holder.playerId,
      playerName: this.holder.name,
      start: { ...this.ball },
      end: { ...this.ball },
      weight: weight * (kind === "receive" ? this.tempo : 1),
      commentary,
    });
  }

  /** The nearest defender closes the ball down without winning it. */
  press(event: MatchEvent): MatchLineupPlayer | undefined {
    const presser = this.nearestDefender(this.ball);
    if (!presser || event.side === "neutral") return undefined;
    this.push({
      kind: "press",
      side: otherSide(this.cfg.side),
      possessionSide: event.side,
      playerId: presser.playerId,
      playerName: presser.name,
      targetPlayerId: this.holder.playerId,
      targetPlayerName: this.holder.name,
      start: { ...this.ball },
      end: { ...this.ball },
      weight: 0.42,
      commentary: `${surname(presser.name)} closes down ${surname(this.holder.name)}.`,
    });
    return presser;
  }

  /** Drives into space when there is room ahead. */
  maybeCarry(force = false): boolean {
    const pattern = this.cfg.pattern;
    const ahead = { x: this.ball.x + this.dir * 7, y: this.ball.y };
    const room = this.space(ahead);
    const eager = pattern === "counter" || pattern === "highPress" || pattern === "direct";
    const want = force || (room > 8 && this.rand() < (eager ? 0.75 : 0.32));
    if (!want) return false;
    const distance = clamp(room * 0.6, 3, eager || force ? 12 : 7);
    const drift = (this.rand() - 0.5) * 6;
    let end = {
      x: clamp(this.ball.x + (this.dir * distance) / XM, 6, 94),
      y: clamp(this.ball.y + drift, 9, 91),
    };
    if (this.cfg.maxDepth !== undefined && this.depth(end) > this.cfg.maxDepth) {
      end = { ...end, x: this.dir > 0 ? this.cfg.maxDepth : 100 - this.cfg.maxDepth };
    }
    if (metres(end, this.ball) < 1.5) return false;
    end = flankClamp(this.holder.role, end);
    this.push({
      kind: "carry",
      side: this.cfg.side,
      possessionSide: this.cfg.side,
      playerId: this.holder.playerId,
      playerName: this.holder.name,
      start: { ...this.ball },
      end,
      weight: (0.3 + metres(end, this.ball) * 0.035) * this.tempo,
      commentary: eager
        ? `${surname(this.holder.name)} drives into the space.`
        : `${surname(this.holder.name)} carries it forward.`,
    });
    this.ball = end;
    return true;
  }

  /** Scores every sensible receiver from the current picture. */
  candidates(options: {
    exclude: Set<string>;
    steer?: MatchPitchPoint;
    remaining?: number;
    preferBackward?: boolean;
  }): Candidate[] {
    const attack = this.attackPositions();
    const defence = this.defencePositions();
    const pattern = this.cfg.pattern;
    const progressWeight: Record<MatchSequencePattern, number> = {
      patient: 0.03,
      circulation: 0.02,
      balanced: 0.08,
      wide: 0.06,
      direct: 0.15,
      counter: 0.16,
      highPress: 0.13,
      setPiece: 0.05,
    };
    const result: Candidate[] = [];
    for (const player of this.cfg.attackers) {
      if (player.playerId === this.holder.playerId || options.exclude.has(player.playerId)) continue;
      const home = attack.get(player.playerId);
      if (!home) continue;
      if (player.role === "GK" && this.depth(this.ball) > 32) continue;

      // Show for the ball: step towards the passer and away from the nearest marker.
      let nearestMarker: MatchPitchPoint | undefined;
      let markerDistance = Infinity;
      for (const position of defence.values()) {
        const distance = metres(position, home);
        if (distance < markerDistance) {
          markerDistance = distance;
          nearestMarker = position;
        }
      }
      const toBall = { x: this.ball.x - home.x, y: this.ball.y - home.y };
      const toBallLength = Math.hypot(toBall.x, toBall.y) || 1;
      const away = nearestMarker ? { x: home.x - nearestMarker.x, y: home.y - nearestMarker.y } : { x: 0, y: 0 };
      const awayLength = Math.hypot(away.x, away.y) || 1;
      const jitter = (this.rand() - 0.5) * 3;
      const show: MatchPitchPoint = flankClamp(player.role, {
        x: clamp(home.x + (toBall.x / toBallLength) * 2.5 + (away.x / awayLength) * 2 + jitter, 5, 95),
        y: clamp(home.y + (toBall.y / toBallLength) * 2.5 + (away.y / awayLength) * 2.5, 7, 93),
      });

      const line = Math.max(this.lastLineDepth(), this.depth(this.ball));
      if (this.depth(show) > line) show.x = this.dir > 0 ? line : 100 - line;
      const options2: Array<{ point: MatchPitchPoint; through: boolean }> = [{ point: show, through: false }];
      // Runners ahead of the ball can be played in behind the last line.
      const aheadOfBall = (home.x - this.ball.x) * this.dir;
      const runner = FORWARD_ROLES.has(player.role) || (FULL_BACKS.has(player.role) && pattern === "wide");
      if (runner && pattern !== "patient" && pattern !== "circulation") {
        if (aheadOfBall > 4 && this.depth(home) > this.lastLineDepth() - 8 && this.depth(this.ball) > 38) {
          const run = flankClamp(player.role, {
            x: clamp(home.x + this.dir * 10, 8, 92),
            y: clamp(home.y + (50 - home.y) * (player.role === "ST" ? 0.25 : 0.1), 8, 92),
          });
          options2.push({ point: run, through: true });
        }
      }

      for (const option of options2) {
        const point = option.point;
        if (this.cfg.maxDepth !== undefined && this.depth(point) > this.cfg.maxDepth) continue;
        const distance = metres(this.ball, point);
        const maxDistance = option.through ? 42 : pattern === "patient" || pattern === "wide" ? 48 : 38;
        if (distance < 6 || distance > maxDistance) continue;

        const progress = (point.x - this.ball.x) * this.dir * XM;
        const lane = this.laneSafety(this.ball, point);
        const room = this.space(point);        let score = progressWeight[pattern] * progress;
        score += Math.min(room, 12) * 0.13;
        score -= lane < 2 ? 2.4 : lane < 4.5 ? 0.9 : 0;
        const comfortable = pattern === "wide" || pattern === "patient" ? 28 : 24;
        score -= distance > comfortable ? (distance - comfortable) * 0.11 : 0;
        score -= distance < 9 ? (9 - distance) * 0.12 : 0;
        score -= (this.touches.get(player.playerId) ?? 0) * 1.25;
        if (player.playerId === this.lastPasser) {
          // A one-two is good football; a square ball straight back is not.
          score += progress > 4 && pattern !== "patient" ? 0.35 : -1.1;
        }
        if (option.through) score += pattern === "direct" || pattern === "counter" ? 0.7 : -0.2;
        if (pattern === "wide") {
          const onFlank = this.flank === "left" ? point.y < 38 : point.y > 62;
          if (onFlank) score += 0.7;
        }
        if (options.preferBackward && progress < -2) score += 1.4;
        if (player.role === "GK") score -= 1.2;
        if (options.steer && options.remaining) {
          score -= (metres(point, options.steer) * 0.06) / options.remaining;
        }
        result.push({ player, point, through: option.through, score });
      }
    }
    return result;
  }

  /** Seeded soft-max pick: usually a good option, not always the best. */
  pick(candidates: Candidate[]): Candidate | undefined {
    if (!candidates.length) return undefined;
    const temperature = 0.55;
    const best = Math.max(...candidates.map((c) => c.score));
    const weights = candidates.map((c) => Math.exp((c.score - best) / temperature));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = this.rand() * total;
    for (let i = 0; i < candidates.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  classify(from: MatchPitchPoint, to: MatchPitchPoint, receiver: MatchLineupPlayer, through: boolean): FootballActionKind {
    const forward = (to.x - from.x) * this.dir;
    const lateral = Math.abs(to.y - from.y);
    if (through) return "throughBall";
    if (forward < -3) return "recycle";
    if (lateral > 34) return "switch";
    if (FULL_BACKS.has(receiver.role) && forward > 4 && (to.y < 34 || to.y > 66) && this.depth(to) > 55) return "overlap";
    return "pass";
  }

  pass(receiver: MatchLineupPlayer, point: MatchPitchPoint, kind: FootballActionKind): void {
    const distance = metres(this.ball, point);
    const base = kind === "cross" ? 1 : kind === "switch" ? 0.62 : 0.38;
    const weight = Math.max(kind === "switch" ? 0.85 : 0.5, base + distance * 0.012) * this.tempo;
    this.push({
      kind,
      side: this.cfg.side,
      possessionSide: this.cfg.side,
      playerId: this.holder.playerId,
      playerName: this.holder.name,
      targetPlayerId: receiver.playerId,
      targetPlayerName: receiver.name,
      start: { ...this.ball },
      end: { ...point },
      weight,
      commentary: passCommentary(kind, this.holder, receiver),
    });
    this.lastPasser = this.holder.playerId;
    this.holder = receiver;
    this.ball = { ...point };
    this.touches.set(receiver.playerId, (this.touches.get(receiver.playerId) ?? 0) + 1);
  }

  /** One decision: maybe carry, then play the best available pass. */
  step(options: { exclude: Set<string>; steer?: MatchPitchPoint; remaining?: number; preferBackward?: boolean; only?: MatchLineupPlayer; push?: boolean }): boolean {
    this.maybeCarry(Boolean(options.push) && this.rand() < 0.65);
    let choice: Candidate | undefined;
    if (options.only) {
      const exclude = new Set(this.cfg.attackers.map((p) => p.playerId).filter((id) => id !== options.only?.playerId));
      const list = this.candidates({ exclude });
      choice = list.sort((a, b) => b.score - a.score)[0];
      if (!choice) {
        const position = this.attackPositions().get(options.only.playerId);
        if (!position) return false;
        choice = { player: options.only, point: flankClamp(options.only.role, position), through: false, score: 0 };
      }
    } else {
      let list = this.candidates(options);
      if (options.push) {
        const forward = list.filter((c) => (c.point.x - this.ball.x) * this.dir > 3);
        if (forward.length) list = forward;
      }
      if (options.preferBackward) {
        const backward = list.filter((c) => (c.point.x - this.ball.x) * this.dir < -3 || Math.abs(c.point.y - this.ball.y) > 34);
        if (backward.length) list = backward;
      }
      choice = this.pick(list);
    }
    if (!choice) return false;
    this.pass(choice.player, choice.point, this.classify(this.ball, choice.point, choice.player, choice.through));
    return true;
  }
}

function touchPoints(
  event: MatchEvent,
  participants: MatchLineupPlayer[],
  pattern: MatchSequencePattern,
): Map<string, MatchPitchPoint> {
  const side: Side = event.side === "them" ? "them" : "us";
  const dir = side === "us" ? 1 : -1;
  const points = new Map<string, MatchPitchPoint>();
  participants.forEach((player, index) => {
    const base = rolePitchPoint(player.role, side, index, participants.length);
    const phasePush =
      pattern === "highPress" || pattern === "counter"
        ? 18
        : pattern === "direct"
          ? 12
          : pattern === "setPiece"
            ? 24
            : 8;
    points.set(player.playerId, {
      x: clamp(base.x + dir * phasePush, 6, 94),
      y: base.y,
    });
  });
  return points;
}

function nameOrFallback(lineup: MatchLineupPlayer[], id: string | undefined): MatchLineupPlayer | undefined {
  return id ? lineup.find((player) => player.playerId === id) : undefined;
}

function fallbackScorer(event: MatchEvent, lineup: MatchLineupPlayer[]): MatchLineupPlayer | undefined {
  const order: TacticalPosition[] = ["ST", "CAM", "LW", "RW", "CM", "LM", "RM"];
  for (const role of order) {
    const options = lineup.filter((player) => player.role === role);
    if (options.length) return options[seedOf(event, "fallback-scorer") % options.length];
  }
  return lineup.find((player) => player.role !== "GK") ?? lineup[0];
}

export function buildMatchSequence(input: MatchSequenceInput): MatchSequence | null {
  const { event } = input;
  if (event.side === "neutral" || (event.type !== "goal" && event.type !== "chance")) return null;
  const side: Side = event.side;
  const dir = side === "us" ? 1 : -1;

  const attackingStarters = side === "us" ? input.userLineup : input.opponentLineup;
  const attackingBench = side === "us" ? input.userBench ?? [] : input.opponentBench ?? [];
  const defendingStarters = side === "us" ? input.opponentLineup : input.userLineup;
  const defendingBench = side === "us" ? input.opponentBench ?? [] : input.userBench ?? [];
  const attackingPlan = planForSide(input, side);
  const defendingPlan = planForSide(input, otherSide(side));

  const attackingLineup = activeMatchLineupAtMinute(attackingStarters, attackingBench, input.substitutions ?? [], side, event.minute);
  const defendingLineup = activeMatchLineupAtMinute(defendingStarters, defendingBench, input.substitutions ?? [], otherSide(side), event.minute);
  if (!attackingLineup.length) return null;

  const scorer = nameOrFallback(attackingLineup, event.actorPlayerId) ?? fallbackScorer(event, attackingLineup);
  if (!scorer) return null;
  let creator = nameOrFallback(attackingLineup, event.secondaryPlayerId);
  if (creator?.playerId === scorer.playerId) creator = undefined;

  let pattern = sequencePattern(event, attackingPlan);
  // Centre-backs and keepers score from dead balls, not by sprinting through the team.
  if (DEEP_ROLES.has(scorer.role)) pattern = "setPiece";

  const sequenceId = event.sequenceId ?? `match-sequence:${event.minute}:${side}:${event.type}`;
  const actions: MatchSequenceAction[] = [];
  const counter = { next: 0 };
  const tempo = tempoScale(attackingPlan);
  const exclude = new Set([scorer.playerId]);
  const base = baseShape(attackingLineup, side, attackingPlan.formation);
  const shape = (ball: MatchPitchPoint) => teamShape(attackingLineup, base, side, ball, true, attackingPlan);

  const cfg: PossessionConfig = {
    event,
    salt: "canonical",
    side,
    plan: attackingPlan,
    opponentPlan: defendingPlan,
    attackers: attackingLineup,
    defenders: defendingLineup,
    pattern,
    sequenceId,
    actions,
    counter,
  };

  const participants = [scorer, ...(creator ? [creator] : [])];
  const canonicalTouches = touchPoints(event, participants, pattern);
  const spot = shootingSpot(scorer.role, event, dir);
  canonicalTouches.set(scorer.playerId, spot);
  let possession: Possession;

  const setPiece = pattern === "setPiece" ? setPieceKind(event) : undefined;
  if (setPiece === "penalty") {
    // Penalty: the scorer places the ball on the spot and takes it himself.
    possession = new Possession(cfg, scorer, { x: dir > 0 ? 89.5 : 10.5, y: 50 });
    possession.start("receive", `${surname(scorer.name)} places the ball on the spot.`, 1.1);
  } else if (setPiece === "freeKick") {
    // Free-kick 25-30 yards out. With a creator it is delivered into the box;
    // without one the scorer goes for goal himself.
    const depth = 70 + (seedOf(event, "fk-depth") % 7);
    const fkSpot = { x: dir > 0 ? depth : 100 - depth, y: 34 + (seedOf(event, "fk-y") % 33) };
    if (creator) {
      possession = new Possession(cfg, creator, fkSpot);
      possession.start("receive", `${surname(creator.name)} stands over the free-kick.`, 0.8);
      const landing = { x: dir > 0 ? 88 + (seedOf(event, "fk-landing") % 4) : 12 - (seedOf(event, "fk-landing") % 4), y: 40 + (seedOf(event, "fk-landing-y") % 21) };
      possession.pass(scorer, landing, "cross");
    } else {
      possession = new Possession(cfg, scorer, fkSpot);
      possession.start("receive", `${surname(scorer.name)} lines up the free-kick.`, 0.9);
    }
  } else if (setPiece === "corner") {
    // Corner routine: taker at the flag, delivery onto the scorer's run.
    const taker =
      (creator && creator.playerId !== scorer.playerId ? creator : undefined) ??
      attackingLineup.find((p) => ["CAM", "LW", "RW", "LM", "RM", "CM"].includes(p.role) && p.playerId !== scorer.playerId) ??
      attackingLineup.find((p) => p.playerId !== scorer.playerId) ??
      scorer;
    const cornerY = seedOf(event, "corner-side") % 2 === 0 ? 1.5 : 98.5;
    possession = new Possession(cfg, taker, { x: dir > 0 ? 99.2 : 0.8, y: cornerY });
    possession.start("receive", `${surname(taker.name)} stands over the corner.`, 0.7);
    const landing = { x: dir > 0 ? 90 + (seedOf(event, "corner-landing") % 4) : 10 - (seedOf(event, "corner-landing") % 4), y: 42 + (seedOf(event, "corner-y") % 17) };
    possession.pass(scorer, landing, "cross");
  } else {
    // Where the move begins.
    const startDepth =
      pattern === "highPress" ? 66 : pattern === "counter" ? 30 : event.phase === "buildUp" ? 16 : event.phase === "finalThird" ? 52 : event.phase === "progression" ? 30 : 36;
    const startY = 28 + (seedOf(event, "start-y") % 45);
    const startPoint = { x: dir > 0 ? startDepth : 100 - startDepth, y: startY };
    const shapeAtStart = shape(startPoint);
    const eligible = (player: MatchLineupPlayer) =>
      player.playerId !== scorer.playerId &&
      (player.role !== "GK" || (event.phase === "buildUp" && pattern === "patient"));
    let holder: MatchLineupPlayer | undefined;
    let bestDistance = Infinity;
    for (const player of attackingLineup) {
      if (!eligible(player)) continue;
      const position = shapeAtStart.get(player.playerId);
      if (!position) continue;
      const distance = metres(position, startPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        holder = player;
      }
    }
    holder ??= scorer;
    const regain = pattern === "highPress" || pattern === "counter";
    const holderPoint = regain ? startPoint : flankClamp(holder.role, shapeAtStart.get(holder.playerId) ?? startPoint);
    possession = new Possession(cfg, holder, holderPoint);
    possession.start(
      regain ? "interception" : "receive",
      pattern === "highPress"
        ? `${surname(holder.name)} wins it high up the pitch.`
        : pattern === "counter"
          ? `${surname(holder.name)} wins possession and looks forward immediately.`
          : `${surname(holder.name)} takes possession.`,
      regain ? 0.55 : 0.45,
    );

    if (shouldShowPressure(event, defendingPlan)) possession.press(event);

    // How many passes the move takes before the final ball.
    const passRange: Record<MatchSequencePattern, [number, number]> = {
      patient: [4, 6],
      wide: [3, 5],
      balanced: [2, 4],
      circulation: [3, 5],
      direct: [1, 2],
      counter: [1, 2],
      highPress: [0, 1],
      setPiece: [0, 0],
    };
    const [minPasses, maxPasses] = passRange[pattern];
    const plannedPasses = minPasses + (seedOf(event, "pass-count") % (maxPasses - minPasses + 1));
    const secondPhase = defensiveSecondPhase(event, plannedPasses + 2, defendingPlan);
    const interventionAt = Math.max(0, plannedPasses - 2);
    const intervener = secondPhase !== "none" ? possession.nearestDefender(possession.ball) : undefined;

    // Where the move is heading: down the flank for a wide overload, into the
    // pocket in front of the box otherwise.
    const flankY = possession.flank === "left" ? 14 : 86;
    const approach =
      pattern === "wide"
        ? { x: dir > 0 ? 80 : 20, y: flankY }
        : { x: dir > 0 ? 70 : 30, y: clamp(spot.y, 35, 65) };
    const finalThirdDepth = pattern === "counter" || pattern === "direct" || pattern === "highPress" ? 54 : 62;

    let passesPlayed = 0;
    let guard = 0;
    let creatorDone = !creator || possession.holder.playerId === creator.playerId;
    while (guard < 14) {
      guard += 1;
      const plannedDone = passesPlayed >= plannedPasses;
      const advanced = possession.depth(possession.ball) >= finalThirdDepth;
      if (plannedDone && advanced && creatorDone) break;
      if (plannedDone && guard > plannedPasses + 3 && creatorDone) break;
      // The creator receives once the ball is in a dangerous area.
      const toCreator = !creatorDone && creator && (advanced || passesPlayed >= plannedPasses + 2) && plannedDone;
      const remaining = Math.max(1, plannedPasses - passesPlayed);
      const moved = possession.step({
        exclude,
        steer: approach,
        remaining: plannedDone ? 1 : remaining,
        preferBackward: pattern === "patient" && passesPlayed === 1,
        only: toCreator ? creator : undefined,
        push: plannedDone && !advanced,
      });
      if (!moved) break;
      passesPlayed += 1;
      if (creator && possession.holder.playerId === creator.playerId) creatorDone = true;

      const finalLink = passesPlayed >= plannedPasses && advanced;
      if (intervener && passesPlayed - 1 === interventionAt) {
        const receiver = possession.holder;
        const defender = possession.nearestDefender(possession.ball) ?? intervener;
        if (secondPhase === "challenge") {
          actions.push(
            action(sequenceId, counter.next++, {
              kind: "challenge",
              side: otherSide(side),
              possessionSide: side,
              playerId: defender.playerId,
              playerName: defender.name,
              targetPlayerId: receiver.playerId,
              targetPlayerName: receiver.name,
              start: { ...possession.ball },
              end: { ...possession.ball },
              weight: 0.45,
              commentary: `${surname(defender.name)} challenges, but ${surname(receiver.name)} keeps the move alive.`,
            }),
          );
        } else if (!finalLink && (secondPhase === "clearanceRecovery" || secondPhase === "blockRecovery")) {
          const block = secondPhase === "blockRecovery";
          const loose = block
            ? {
                x: clamp(possession.ball.x - dir * (4 + (seedOf(event, `block:${passesPlayed}`) % 5)), 8, 92),
                y: clamp(possession.ball.y + (seedOf(event, `block-y:${passesPlayed}`) % 2 === 0 ? -1 : 1) * 7, 9, 91),
              }
            : clearanceDestination(possession.ball, otherSide(side), event, `clearance:${passesPlayed}`);
          actions.push(
            action(sequenceId, counter.next++, {
              kind: block ? "blockPass" : "clearance",
              side: otherSide(side),
              possessionSide: block ? side : otherSide(side),
              playerId: defender.playerId,
              playerName: defender.name,
              targetPlayerId: receiver.playerId,
              targetPlayerName: receiver.name,
              start: { ...possession.ball },
              end: loose,
              weight: block ? 0.5 : 0.72,
              commentary: block
                ? `${surname(defender.name)} gets a foot in.`
                : `${surname(defender.name)} gets there and clears the danger.`,
            }),
          );
          possession.ball = loose;
          const recoverer =
            possession.nearestAttacker(loose, new Set([scorer.playerId]), (p) => p.role !== "GK") ?? receiver;
          possession.holder = recoverer;
          possession.lastPasser = undefined;
          actions.push(
            action(sequenceId, counter.next++, {
              kind: "recovery",
              side,
              possessionSide: side,
              playerId: recoverer.playerId,
              playerName: recoverer.name,
              start: loose,
              end: loose,
              weight: block ? 0.42 : 0.48,
              commentary: block
                ? `${surname(recoverer.name)} reacts first to the loose ball.`
                : `${surname(recoverer.name)} gathers the second ball and the attack starts again.`,
            }),
          );
        }
      }
    }

    // A patient move shows at least one recycle or switch.
    if (pattern === "patient" && !actions.some((a) => a.kind === "recycle" || a.kind === "switch")) {
      possession.step({ exclude, preferBackward: true });
    }
  }

  // Final ball onto the scorer, if he is not already on it.
  if (possession.holder.playerId !== scorer.playerId) {
    if (pattern !== "setPiece") {
      possession.maybeCarry(pattern === "counter" || pattern === "highPress" || metres(possession.ball, spot) > 28);
    }
    const from = possession.ball;
    const wideDelivery = (from.y < 26 || from.y > 74) && possession.depth(from) > 66;    const byline = possession.depth(from) > 86;
    let kind: FootballActionKind;
    const vertical = pattern === "direct" || pattern === "counter" || pattern === "highPress";
    const behindLine = possession.depth(spot) > possession.lastLineDepth() - 2;
    if (wideDelivery) {
      kind = vertical ? "cross" : byline || (pattern !== "wide" && seedOf(event, "delivery") % 2 === 0) ? "cutback" : "cross";
    } else if (vertical) {
      kind = Math.abs(spot.y - from.y) > 30 ? "cross" : "throughBall";
    } else kind = behindLine && possession.depth(spot) - possession.depth(from) > 10 ? "throughBall" : "pass";
    const target =
      kind === "cutback"
        ? { x: dir > 0 ? Math.min(spot.x, 84) : Math.max(spot.x, 16), y: clamp(spot.y, 38, 62) }
        : spot;
    possession.pass(scorer, flankClamp(scorer.role, target), kind);
  }

  // The shot and its canonical outcome.
  const shotStart = { ...possession.ball };
  const destination = shotDestination(event);
  actions.push(
    action(sequenceId, counter.next++, {
      kind: "shot",
      side,
      possessionSide: event.side,
      playerId: scorer.playerId,
      playerName: scorer.name,
      start: shotStart,
      end: destination,
      weight: 0.9 * tempo,
      commentary: event.type === "goal" ? `${surname(scorer.name)} shoots…` : `${surname(scorer.name)} gets the shot away…`,
    }),
  );
  if (event.type === "goal") {
    actions.push(
      action(sequenceId, counter.next++, {
        kind: "goal",
        side,
        playerId: scorer.playerId,
        playerName: scorer.name,
        start: destination,
        end: destination,
        weight: 0.8,
        commentary: event.text,
      }),
    );
  } else {
    const outcome = chanceOutcome(event);
    actions.push(
      action(sequenceId, counter.next++, {
        kind: outcome === "save" ? "save" : outcome === "blocked" ? "block" : "miss",
        side,
        playerId: scorer.playerId,
        playerName: scorer.name,
        start: destination,
        end: destination,
        weight: 0.65,
        commentary:
          outcome === "save"
            ? "Saved by the goalkeeper."
            : outcome === "blocked"
              ? "The effort is blocked."
              : outcome === "over"
                ? "The shot goes over."
                : "The shot goes wide.",
      }),
    );
  }

  // Preserve first-touch order for stable replay identity while ensuring canonical participants remain present.
  const participantOrder = [
    ...actions.flatMap((item) => [item.playerId, item.targetPlayerId]),
    creator?.playerId,
  ].filter(Boolean) as string[];
  const participantIds = [...new Set(participantOrder)];
  return {
    id: sequenceId,
    minute: event.minute,
    side,
    phase: event.phase,
    sourceType: event.type,
    sourceText: event.text,
    pattern,
    setPiece,
    styleLabel:
      setPiece === "penalty" ? "Penalty" : setPiece === "freeKick" ? "Free-kick" : setPiece === "corner" ? "Corner" : styleLabel(pattern),
    actions,
    participantIds,
    totalWeight: actions.reduce((sum, item) => sum + item.weight, 0),
  };
}

export interface MatchFlowSequenceInput {
  nextEvent: MatchEvent;
  previousEvent?: MatchEvent;
  /** Canonical next highlight sequence. Open play lands on its first touch; set pieces are earned before it. */
  nextSequence?: MatchSequence;
  userLineup: MatchLineupPlayer[];
  opponentLineup: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
  userPlan?: MatchTeamPlan;
  opponentPlan?: MatchTeamPlan;
  /**
   * The user's real possession share for the match (0-100), from the engine's
   * team stats. Flow play is budgeted so that highlights plus quiet play show
   * the ball roughly this often. Defaults to an even 50.
   */
  userPossession?: number;
  /**
   * Visible possession already shown earlier in the match (milliseconds of
   * playback per side). Lets each quiet spell repay any drift so the whole
   * match, not just this gap, matches the possession stat.
   */
  possessionLedger?: PossessionLedger;
  /**
   * How much open play to show between moments. 1 = condensed (default),
   * 2 = extended (twice the passing). Presentation only.
   */
  detail?: number;
}

export interface PossessionLedger {
  us: number;
  them: number;
}

/** Playback time each side has the ball in a sequence played over `durationMs`. */
export function visiblePossessionMs(sequence: MatchSequence | null, durationMs: number): PossessionLedger {
  const out = { us: 0, them: 0 };
  if (!sequence || sequence.totalWeight <= 0) return out;
  for (const item of sequence.actions) {
    const share = (item.weight / sequence.totalWeight) * durationMs;
    if ((item.possessionSide ?? item.side) === "us") out.us += share;
    else out.them += share;
  }
  return out;
}

type RestartKind = "kickoff" | "keeper" | "goalKick" | "loose" | "open";

/** Who restarts after the previous moment, and how. */
function restartAfter(previous: MatchEvent | undefined): { side: Side | null; kind: RestartKind } {
  if (!previous) return { side: null, kind: "kickoff" };
  if (previous.side === "neutral") return { side: null, kind: "open" };
  if (previous.type === "goal") return { side: otherSide(previous.side), kind: "kickoff" };
  if (previous.type === "chance") {
    const outcome = chanceOutcome(previous);
    const kind: RestartKind = outcome === "save" ? "keeper" : outcome === "blocked" ? "loose" : "goalKick";
    return { side: otherSide(previous.side), kind };
  }
  return { side: null, kind: "open" };
}

/** Rough playback time of a flow before it is built, for possession budgeting. */
function estimatedFlowMs(gap: number): number {
  return clamp(4_200 + gap * 420, 5_500, 22_000);
}

/** Share of this flow the user should have the ball, so the match overall lands on its possession stat. */
function flowUserShare(input: MatchFlowSequenceInput, gap: number): number {
  const target = clamp((input.userPossession ?? 50) / 100, 0.2, 0.8);
  const flow = estimatedFlowMs(gap);
  // The next highlight is (almost entirely) its attacking side's possession.
  const highlight = input.nextSequence ? visiblePossessionMs(input.nextSequence, sequenceDurationMs(input.nextSequence)) : { us: 0, them: 0 };
  const shown = input.possessionLedger ?? { us: 0, them: 0 };
  // Aim for the stat across everything shown so far, this flow and the highlight after it.
  const total = shown.us + shown.them + highlight.us + highlight.them + flow;
  return clamp((target * total - shown.us - highlight.us) / flow, 0.05, 0.95);
}

/**
 * Open play between canonical highlights. It never creates a shot or changes
 * a result. It restarts the game the way the previous moment demands, shares
 * the ball between the teams in line with the match's real possession, and
 * earns any set piece that follows (a corner is won, a foul is given) so the
 * next highlight never appears from nowhere.
 */
export function buildMatchFlowSequence(input: MatchFlowSequenceInput): MatchSequence | null {
  const gap = input.nextEvent.minute - (input.previousEvent?.minute ?? 0);
  if (gap <= 1) return null;
  const desired = flowUserShare(input, gap);
  const first = buildFlowOnce(input, gap, desired);
  if (!first) return null;
  // Spells are sized in passes, but carries, restarts and turnovers take time
  // too. Measure the real split and, if it clearly misses, rebuild once with a
  // corrected budget. Deterministic: same inputs, same two attempts.
  const measured = visiblePossessionMs(first, estimatedFlowMs(gap));
  const actual = measured.us / Math.max(1, measured.us + measured.them);
  if (Math.abs(actual - desired) < 0.12) return first;
  const corrected = clamp(desired + (desired - actual), 0.05, 0.95);
  const second = buildFlowOnce(input, gap, corrected);
  if (!second) return first;
  const secondMeasured = visiblePossessionMs(second, estimatedFlowMs(gap));
  const secondActual = secondMeasured.us / Math.max(1, secondMeasured.us + secondMeasured.them);
  return Math.abs(secondActual - desired) < Math.abs(actual - desired) ? second : first;
}

function buildFlowOnce(input: MatchFlowSequenceInput, gap: number, userShare: number): MatchSequence | null {

  const substitutions = input.substitutions ?? [];
  const sequenceId =
    `flow:${input.previousEvent?.sequenceId ?? "kickoff"}:${input.nextEvent.sequenceId ?? input.nextEvent.minute}`;
  const actions: MatchSequenceAction[] = [];
  const counter = { next: 0 };
  const seedEvent = input.nextEvent;

  const lineupFor = (side: Side) =>
    activeMatchLineupAtMinute(
      side === "us" ? input.userLineup : input.opponentLineup,
      side === "us" ? input.userBench ?? [] : input.opponentBench ?? [],
      substitutions,
      side,
      Math.max(0, input.nextEvent.minute - 1),
    );
  const planFor = (side: Side) =>
    side === "us" ? input.userPlan ?? DEFAULT_PLAN : input.opponentPlan ?? DEFAULT_PLAN;
  const flowPattern = (event: MatchEvent, plan: MatchTeamPlan): MatchSequencePattern =>
    plan.directness === "High"
      ? "direct"
      : plan.directness === "Low" || plan.philosophy === "Possession"
        ? "patient"
        : seedOf(event, "flow-pattern") % 3 === 0
          ? "wide"
          : "circulation";
  const push = (values: Omit<MatchSequenceAction, "id">) => actions.push(action(sequenceId, counter.next++, values));

  /* ---------------- possession plan ---------------- */
  const shareOf = (side: Side) => (side === "us" ? userShare : 1 - userShare);
  const restart = restartAfter(input.previousEvent);
  const nextSequence = input.nextSequence;
  const nextSide: Side | null = nextSequence?.side ?? (input.nextEvent.side === "neutral" ? null : input.nextEvent.side);
  const startSide: Side = restart.side ?? (seedOf(seedEvent, "flow-start-side") % 1000 < userShare * 1000 ? "us" : "them");
  const endSide: Side = nextSide ?? (seedOf(seedEvent, "flow-end-side") % 1000 < userShare * 1000 ? "us" : "them");
  const detail = clamp(input.detail ?? 1, 1, 3);
  const totalPasses = clamp(Math.round((Math.ceil(gap / 4) + 2) * detail), 3, 9 * detail);

  const spells: { side: Side; passes: number }[] = [];
  if (startSide === endSide) {
    const otherShare = shareOf(otherSide(startSide));
    if (otherShare >= 0.28 && totalPasses >= 4) {
      const middle = Math.max(1, Math.round(totalPasses * otherShare));
      const first = Math.max(1, Math.floor((totalPasses - middle) / 2));
      spells.push(
        { side: startSide, passes: first },
        { side: otherSide(startSide), passes: middle },
        { side: endSide, passes: Math.max(1, totalPasses - middle - first) },
      );
    } else {
      spells.push({ side: startSide, passes: totalPasses });
    }
  } else {
    const first = clamp(Math.round(totalPasses * shareOf(startSide)), 1, totalPasses - 1);
    spells.push({ side: startSide, passes: first }, { side: endSide, passes: totalPasses - first });
  }

  const setPiece = nextSequence?.setPiece;
  const makePossession = (side: Side, salt: string, holder: MatchLineupPlayer, ball: MatchPitchPoint, finalSpell: boolean) => {
    const event: MatchEvent = { minute: input.nextEvent.minute, type: "info", side, text: "Open play", phase: "buildUp", zone: "middleThird", sequenceId: `${sequenceId}:${salt}` };
    return new Possession(
      {
        event,
        salt,
        side,
        plan: planFor(side),
        opponentPlan: planFor(otherSide(side)),
        attackers: lineupFor(side),
        defenders: lineupFor(otherSide(side)),
        pattern: flowPattern(event, planFor(side)),
        sequenceId,
        actions,
        counter,
        // Quiet play stays out of the final third, unless it is about to win a set piece.
        maxDepth: finalSpell && setPiece ? 84 : 70,
      },
      holder,
      ball,
    );
  };

  /* ---------------- restart ---------------- */
  const firstLineup = lineupFor(startSide);
  if (firstLineup.length < 2) return null;
  const firstDir = startSide === "us" ? 1 : -1;
  const at = (depth: number, y: number): MatchPitchPoint => ({ x: firstDir > 0 ? depth : 100 - depth, y });
  const keeper = firstLineup.find((player) => player.role === "GK");
  const byRole = (roles: TacticalPosition[]) => firstLineup.find((player) => roles.includes(player.role));
  let holder: MatchLineupPlayer;
  let ball: MatchPitchPoint;
  let opening: string;
  let openingKind: "receive" | "recovery" = "receive";
  switch (restart.kind) {
    case "kickoff":
      holder = byRole(["ST", "CAM", "CM"]) ?? firstLineup[0];
      ball = { x: 50, y: 50 };
      opening = input.previousEvent ? `${surname(holder.name)} gets the game going again.` : `${surname(holder.name)} gets us under way.`;
      break;
    case "keeper":
      holder = keeper ?? firstLineup[0];
      ball = at(8, 50);
      opening = `${surname(holder.name)} gathers and looks to distribute.`;
      break;
    case "goalKick":
      holder = keeper ?? firstLineup[0];
      ball = at(5.5, seedOf(seedEvent, "goal-kick-side") % 2 === 0 ? 42 : 58);
      opening = "Goal kick.";
      break;
    case "loose":
      holder = byRole(["CB", "CDM", "LB", "RB"]) ?? firstLineup[0];
      ball = at(19, 34 + (seedOf(seedEvent, "loose-y") % 33));
      opening = `${surname(holder.name)} mops up the loose ball.`;
      openingKind = "recovery";
      break;
    default: {
      const startPoint = at(18 + (seedOf(seedEvent, "flow-start") % 12), 30 + (seedOf(seedEvent, "flow-start-y") % 41));
      const plan = planFor(startSide);
      const shape = teamShape(firstLineup, baseShape(firstLineup, startSide, plan.formation), startSide, startPoint, true, plan);
      let best = firstLineup[0];
      let bestDistance = Infinity;
      for (const player of firstLineup) {
        if (player.role === "GK") continue;
        const position = shape.get(player.playerId);
        if (!position) continue;
        const distance = metres(position, startPoint);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = player;
        }
      }
      holder = best;
      ball = flankClamp(best.role, shape.get(best.playerId) ?? startPoint);
      opening = `${surname(holder.name)} has it in open play.`;
    }
  }

  let possession = makePossession(startSide, "flow-0", holder, ball, spells.length === 1);
  possession.start(openingKind, opening, restart.kind === "goalKick" || restart.kind === "kickoff" ? 0.55 : 0.4);

  /* ---------------- spells and turnovers ---------------- */
  spells.forEach((spell, index) => {
    if (index > 0) {
      // Change of possession: a tackle, an intercepted pass or a clearance.
      const winner = spell.side;
      const loser = possession.holder;
      const from = { ...possession.ball };
      const deep = possession.depth(from) > 55;
      const style = deep ? "clearance" : seedOf(seedEvent, `turnover-${index}`) % 2 === 0 ? "tackle" : "interception";
      const defender = possession.nearestDefender(from);
      if (!defender) return;
      if (style === "tackle") {
        push({
          kind: "tackle",
          side: winner,
          possessionSide: winner,
          playerId: defender.playerId,
          playerName: defender.name,
          targetPlayerId: loser.playerId,
          targetPlayerName: loser.name,
          start: from,
          end: from,
          weight: 0.5,
          commentary: `${surname(defender.name)} steps in and wins it from ${surname(loser.name)}.`,
        });
        possession = makePossession(winner, `flow-${index}`, defender, from, index === spells.length - 1);
      } else {
        const loose =
          style === "clearance"
            ? clearanceDestination(from, winner, seedEvent, `flow-clear-${index}`)
            : { x: clamp(from.x + possession.dir * 7, 6, 94), y: clamp(from.y + (seedOf(seedEvent, `cut-${index}`) % 2 === 0 ? -6 : 6), 8, 92) };
        push({
          kind: style === "clearance" ? "clearance" : "blockPass",
          side: winner,
          possessionSide: winner,
          playerId: defender.playerId,
          playerName: defender.name,
          targetPlayerId: loser.playerId,
          targetPlayerName: loser.name,
          start: from,
          end: loose,
          weight: style === "clearance" ? 0.72 : 0.5,
          commentary:
            style === "clearance"
              ? `${surname(defender.name)} heads it clear.`
              : `${surname(defender.name)} reads it and cuts out the pass.`,
        });
        const winnerLineup = lineupFor(winner);
        const winnerPlan = planFor(winner);
        const shape = teamShape(winnerLineup, baseShape(winnerLineup, winner, winnerPlan.formation), winner, loose, true, winnerPlan);
        let collector = style === "interception" ? defender : winnerLineup[0];
        if (style === "clearance") {
          let best = Infinity;
          for (const player of winnerLineup) {
            if (player.role === "GK" || player.playerId === defender.playerId) continue;
            const position = shape.get(player.playerId);
            if (!position) continue;
            const distance = metres(position, loose);
            if (distance < best) {
              best = distance;
              collector = player;
            }          }
        }
        push({
          kind: "recovery",
          side: winner,
          possessionSide: winner,
          playerId: collector.playerId,
          playerName: collector.name,
          start: loose,
          end: loose,
          weight: 0.42,
          commentary:
            style === "clearance"
              ? `${surname(collector.name)} picks up the second ball.`
              : `${surname(collector.name)} takes it away.`,
        });
        possession = makePossession(winner, `flow-${index}`, collector, loose, index === spells.length - 1);
      }
    }
    const patient = possession.cfg.pattern === "patient";
    for (let i = 0; i < spell.passes; i += 1) {
      const moved = possession.step({
        exclude: new Set(),
        // A kick-off goes backwards first; keepers play short to defenders.
        preferBackward: (index === 0 && i === 0 && restart.kind === "kickoff") || (patient && i === 2),
      });
      if (!moved) break;
    }
  });

  /* ---------------- earn the set piece / land on the next highlight ---------------- */
  const nextAction = nextSequence?.actions[0];
  const finalSide = possession.cfg.side;
  if (setPiece && nextAction && finalSide === nextSequence.side) {
    const attacker = possession.holder;
    const attackDir = finalSide === "us" ? 1 : -1;
    const carryTo = (to: MatchPitchPoint, commentary: string) => {
      if (metres(possession.ball, to) < 1) return;
      push({
        kind: "carry",
        side: finalSide,
        possessionSide: finalSide,
        playerId: attacker.playerId,
        playerName: attacker.name,
        start: { ...possession.ball },
        end: to,
        weight: (0.35 + metres(possession.ball, to) * 0.028) * possession.tempo,
        commentary,
      });
      possession.ball = to;
    };
    const defender = possession.nearestDefender(nextAction.start) ?? possession.nearestDefender(possession.ball);
    if (setPiece === "corner") {
      // Work it wide, cross, and a defender turns it behind.
      const cornerTop = nextAction.start.y < 50;
      const wide = { x: attackDir > 0 ? 84 : 16, y: cornerTop ? 12 : 88 };
      carryTo(wide, `${surname(attacker.name)} drives down the flank.`);
      const box = { x: attackDir > 0 ? 92 : 8, y: 50 + (cornerTop ? -6 : 6) };
      if (defender) {
        push({
          kind: "cross",
          side: finalSide,
          possessionSide: finalSide,
          playerId: attacker.playerId,
          playerName: attacker.name,
          start: wide,
          end: box,
          weight: 0.9 * possession.tempo,
          commentary: `${surname(attacker.name)} whips a cross in.`,
        });
        push({
          kind: "clearance",
          side: otherSide(finalSide),
          possessionSide: finalSide,
          playerId: defender.playerId,
          playerName: defender.name,
          start: box,
          end: { x: attackDir > 0 ? 99.6 : 0.4, y: cornerTop ? 5 : 95 },
          weight: 0.6,
          commentary: `${surname(defender.name)} heads it behind. Corner.`,
        });
      }
    } else if (defender) {
      // Carry to where the foul happens; the defender brings him down.
      carryTo(nextAction.start, setPiece === "penalty" ? `${surname(attacker.name)} darts into the box.` : `${surname(attacker.name)} drives at the defence.`);
      push({
        kind: "challenge",
        side: otherSide(finalSide),
        possessionSide: finalSide,
        playerId: defender.playerId,
        playerName: defender.name,
        targetPlayerId: attacker.playerId,
        targetPlayerName: attacker.name,
        start: nextAction.start,
        end: nextAction.start,
        weight: 0.75,
        commentary:
          setPiece === "penalty"
            ? `${surname(defender.name)} brings down ${surname(attacker.name)} in the box. Penalty!`
            : `${surname(defender.name)} brings down ${surname(attacker.name)}. Free-kick in a dangerous area.`,
      });
    }
  } else if (nextAction?.playerId && actions.length > 0) {
    // Open play: land exactly on the first touch of the next highlight.
    const finalAction = actions[actions.length - 1];
    const currentPoint = finalAction.end;
    const desiredSide = nextAction.side;
    const desiredLineup = lineupFor(desiredSide);
    const receiver = desiredLineup.find((player) => player.playerId === nextAction.playerId);
    if (receiver) {
      const passKinds: FootballActionKind[] = ["pass", "recycle", "switch", "throughBall", "overlap", "cutback", "cross"];
      const currentHolderId = passKinds.includes(finalAction.kind)
        ? finalAction.targetPlayerId
        : ["receive", "carry", "interception", "recovery", "tackle"].includes(finalAction.kind)
          ? finalAction.playerId
          : undefined;
      const currentHolderSide = finalAction.possessionSide ?? finalAction.side;
      const current =
        currentHolderSide === desiredSide
          ? desiredLineup.find((player) => player.playerId === currentHolderId)
          : undefined;
      if (!current) {
        push({
          kind: "recovery",
          side: desiredSide,
          possessionSide: desiredSide,
          playerId: receiver.playerId,
          playerName: receiver.name,
          start: currentPoint,
          end: currentPoint,
          weight: 0.45,
          commentary: `${surname(receiver.name)} gathers the loose ball.`,
        });
      } else if (current.playerId !== receiver.playerId) {
        push({
          kind: "pass",
          side: desiredSide,
          possessionSide: desiredSide,
          playerId: current.playerId,
          playerName: current.name,
          targetPlayerId: receiver.playerId,
          targetPlayerName: receiver.name,
          start: currentPoint,
          end: nextAction.start,
          weight: (0.38 + metres(currentPoint, nextAction.start) * 0.012) * tempoScale(planFor(desiredSide)),
          commentary: `${surname(current.name)} works it on to ${surname(receiver.name)}.`,
        });
      }
      const landingStart = !current || current.playerId === receiver.playerId ? currentPoint : nextAction.start;
      if (Math.abs(nextAction.start.x - landingStart.x) + Math.abs(nextAction.start.y - landingStart.y) > 0.001) {
        push({
          kind: "carry",
          side: desiredSide,
          possessionSide: desiredSide,
          playerId: receiver.playerId,
          playerName: receiver.name,
          start: landingStart,
          end: nextAction.start,
          weight: (0.3 + metres(landingStart, nextAction.start) * 0.03) * tempoScale(planFor(desiredSide)),
          commentary: `${surname(receiver.name)} carries into the next phase.`,
        });
      }
    }
  }

  const participantIds = [
    ...new Set(actions.flatMap((item) => [item.playerId, item.targetPlayerId]).filter(Boolean) as string[]),
  ];
  const changes = spells.length - 1;
  return {
    id: sequenceId,
    minute: input.nextEvent.minute,
    side: startSide,
    phase: "buildUp",
    sourceType: "info",
    sourceText: "Open play",
    pattern: "circulation",
    restart: restart.kind,
    styleLabel:
      restart.kind === "kickoff" && input.previousEvent
        ? "Kick-off"
        : setPiece === "corner"
          ? "Pressure builds"
          : setPiece
            ? "Foul"
            : changes > 0
              ? "Open play · turnovers"
              : "Open play",
    actions,
    participantIds,
    totalWeight: actions.reduce((sum, item) => sum + item.weight, 0),
  };
}

export function flowSequenceDurationMs(sequence: MatchSequence, gapMinutes: number, detail = 1): number {
  const gap = Math.max(0, gapMinutes);
  // Extended viewing shows more play, so its longest quiet spells run longer.
  const scale = clamp(detail, 1, 3);
  return clamp(
    Math.round(sequence.totalWeight * 1_650 + Math.max(0, gap - 4) * 220 * scale),
    5_500,
    22_000 * scale,
  );
}

function curvedPoint(
  start: MatchPitchPoint,
  end: MatchPitchPoint,
  progress: number,
  curve: number,
): MatchPitchPoint {
  const t = clamp(progress, 0, 1);
  const x = start.x + (end.x - start.x) * t;
  const y = start.y + (end.y - start.y) * t - Math.sin(t * Math.PI) * curve;
  return { x: clamp(x, 0.5, 99.5), y: clamp(y, 2, 98) };
}

const MOVING_BALL_ACTIONS = new Set<FootballActionKind>([
  "carry",
  "clearance",
  "blockPass",
  "pass",
  "recycle",
  "switch",
  "throughBall",
  "overlap",
  "cutback",
  "cross",
  "shot",
]);

export function frameForSequence(
  sequence: MatchSequence,
  progress: number,
): MatchSequenceFrame {
  const total = Math.max(0.0001, sequence.totalWeight);
  const target = clamp(progress, 0, 0.999999) * total;
  let cursor = 0;
  for (let i = 0; i < sequence.actions.length; i += 1) {
    const current = sequence.actions[i];
    const next = cursor + current.weight;
    if (target <= next || i === sequence.actions.length - 1) {
      const localProgress = clamp((target - cursor) / Math.max(0.0001, current.weight), 0, 1);
      const curve =
        current.kind === "cross"
          ? 5
          : current.kind === "switch"
            ? 2.8
            : current.kind === "throughBall"
              ? 2.1
              : current.kind === "cutback"
                ? 1.4
                : current.kind === "pass" || current.kind === "overlap"
                  ? 1
                  : 0;
      return {
        action: current,
        actionIndex: i,
        localProgress,
        ball: MOVING_BALL_ACTIONS.has(current.kind)
          ? curvedPoint(current.start, current.end, localProgress, curve)
          : current.end,
      };
    }
    cursor = next;
  }
  const last = sequence.actions[sequence.actions.length - 1];
  return { action: last, actionIndex: sequence.actions.length - 1, localProgress: 1, ball: last.end };
}

export function sequenceDurationMs(sequence: MatchSequence): number {
  // Richer sequences are deliberately readable at 1×. Tempo already changes
  // action weights, while the playback control scales the final duration.
  return clamp(Math.round(sequence.totalWeight * 1_420), 7_800, 15_500);
}

export function sequenceResultVisible(sequence: MatchSequence, progress: number): boolean {
  const frame = frameForSequence(sequence, progress);
  return (
    (frame.action.kind === "goal" ||
      frame.action.kind === "save" ||
      frame.action.kind === "block" ||
      frame.action.kind === "miss") &&
    frame.localProgress >= 0.2
  );
}