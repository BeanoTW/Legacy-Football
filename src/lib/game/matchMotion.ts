import type { MatchLineupPlayer, MatchTeamPlan } from "./types";
import type {
  MatchPitchPoint,
  MatchSequence,
  MatchSequenceAction,
} from "./matchSequence";

export type MatchPositionMap = Map<string, MatchPitchPoint>;

export interface MatchMotionSide {
  lineup: MatchLineupPlayer[];
  basePositions: MatchPositionMap;
  ours: boolean;
  plan?: MatchTeamPlan;
}

export interface MatchMotionFrame {
  user: MatchPositionMap;
  opponent: MatchPositionMap;
}

/*
 * Off-ball movement model
 * -----------------------
 * Both teams are stepped together, one football action at a time, so each
 * side can react to the other:
 *
 *  - The team in possession shifts as a block towards the ball, pushes up,
 *    spreads wide, and its next receiver moves to show for the ball (or starts
 *    his run) one action before the pass is played.
 *  - The defending team drops and narrows around the ball, the nearest player
 *    presses, and the rest pick up the attacker closest to their zone and
 *    stay goal-side of him.
 *
 * Every action starts from the exact end positions of the previous one, so
 * the renderer gets continuous movement with no second result engine.
 */

type Side = "us" | "them";

const PASS_ACTIONS = new Set<MatchSequenceAction["kind"]>([
  "pass",
  "recycle",
  "switch",
  "throughBall",
  "overlap",
  "cutback",
  "cross",
]);

const DEFENSIVE_ACTIONS = new Set<MatchSequenceAction["kind"]>([
  "press",
  "challenge",
  "tackle",
  "clearance",
  "blockPass",
]);

const FULL_BACKS = new Set(["LB", "RB", "LWB", "RWB"]);
const BACK_LINE = new Set(["CB", "LB", "RB", "LWB", "RWB"]);

/** Pitch units are percentages; these convert to rough metres. */
const XM = 1.05;
const YM = 0.68;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerpPoint(a: MatchPitchPoint, b: MatchPitchPoint, t: number): MatchPitchPoint {
  if (t <= 0) return { ...a };
  if (t >= 1) return { ...b };
  const p = smoothStep(t);
  return {
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
  };
}

function metres(a: MatchPitchPoint, b: MatchPitchPoint): number {
  return Math.hypot((a.x - b.x) * XM, (a.y - b.y) * YM);
}

function copyPositions(input: MatchPositionMap): MatchPositionMap {
  return new Map([...input.entries()].map(([id, point]) => [id, { ...point }]));
}

function sideId(ours: boolean): Side {
  return ours ? "us" : "them";
}

function fallbackBase(side: MatchMotionSide, player: MatchLineupPlayer): MatchPitchPoint {
  return side.basePositions.get(player.playerId) ?? { x: side.ours ? 42 : 58, y: 50 };
}

/** Where a player would stand in his team's shape for this ball position. */
function shapeTarget(
  side: MatchMotionSide,
  player: MatchLineupPlayer,
  ball: MatchPitchPoint,
  inPossession: boolean,
): MatchPitchPoint {
  const base = fallbackBase(side, player);
  const dir = side.ours ? 1 : -1;
  if (player.role === "GK") {
    const goalX = side.ours ? 5 : 95;
    const followX = inPossession ? (ball.x - goalX) * 0.12 : (ball.x - goalX) * 0.05;
    return { x: goalX + followX, y: clamp(50 + (ball.y - 50) * 0.18, 42, 58) };
  }

  const plan = side.plan;
  if (inPossession) {
    const directness = plan?.directness ?? "Medium";
    const push = directness === "High" ? 5 : directness === "Low" ? 7 : 6;
    const fullBackPush = FULL_BACKS.has(player.role)
      ? plan?.philosophy === "Possession" || directness === "Low"
        ? 12
        : 8
      : 0;
    // The block travels with the ball and keeps roughly its formation depth.
    const blockX = base.x * 0.35 + (ball.x + (base.x - 50) * 0.75) * 0.65;
    return {
      x: clamp(blockX + dir * (push + fullBackPush), 4, 96),
      y: clamp(50 + (base.y - 50) * 1.12 + (ball.y - 50) * 0.14, 5, 95),
    };
  }

  const pressing = plan?.pressing ?? "Medium";
  const drop = pressing === "High" ? 1 : pressing === "Low" ? 7 : 4;
  // Out of possession the block compacts to roughly 35 m around the ball.
  const blockX = base.x * 0.35 + (ball.x + (base.x - 50) * 0.6) * 0.65;
  const target = {
    x: blockX - dir * drop,
    y: 50 + (base.y - 50) * 0.8 + (ball.y - 50) * 0.32,
  };
  // The back line never steps beyond the ball.
  if (BACK_LINE.has(player.role)) {
    target.x = dir > 0 ? Math.min(target.x, ball.x - 3) : Math.max(target.x, ball.x + 3);
  }
  return { x: clamp(target.x, 4, 96), y: clamp(target.y, 5, 95) };
}

interface JointState {
  user: MatchPositionMap;
  opponent: MatchPositionMap;
}

function ownGoalX(ours: boolean): number {
  return ours ? 2 : 98;
}

/** Everyone not directly involved in the action. */
function offBallTarget(
  current: MatchPitchPoint,
  player: MatchLineupPlayer,
  side: MatchMotionSide,
  action: MatchSequenceAction,
  inPossession: boolean,
  markTarget: MatchPitchPoint | undefined,
): MatchPitchPoint {
  const ball = action.end;
  const shape = shapeTarget(side, player, ball, inPossession);
  let desired = shape;

  if (!inPossession && markTarget) {
    // Stay goal-side of the attacker in this zone, a few metres off him.
    const goal = { x: ownGoalX(side.ours), y: 50 };
    const towardsGoal = { x: goal.x - markTarget.x, y: goal.y - markTarget.y };
    const length = Math.hypot(towardsGoal.x, towardsGoal.y) || 1;
    const mark = {
      x: markTarget.x + (towardsGoal.x / length) * 3,
      y: markTarget.y + (towardsGoal.y / length) * 3,
    };
    const danger = ["throughBall", "overlap", "cutback", "cross", "shot"].includes(action.kind);
    const weight = danger ? 0.75 : 0.5;
    desired = {
      x: shape.x + (mark.x - shape.x) * weight,
      y: shape.y + (mark.y - shape.y) * weight,
    };
  }

  const tempo = side.plan?.tempo ?? "Medium";
  const response = inPossession
    ? tempo === "High"
      ? 0.5
      : tempo === "Low"
        ? 0.36
        : 0.42
    : (side.plan?.pressing ?? "Medium") === "High"
      ? 0.52
      : 0.44;

  return {
    x: clamp(current.x + (desired.x - current.x) * response, 3, 97),
    y: clamp(current.y + (desired.y - current.y) * response, 5, 95),
  };
}

/** Greedy one-to-one marking: each defender picks up the nearest free attacker to his zone. */
function markingAssignments(
  defenders: MatchLineupPlayer[],
  defendingSide: MatchMotionSide,
  attackers: MatchLineupPlayer[],
  attackerPositions: MatchPositionMap,
  ball: MatchPitchPoint,
  exclude: Set<string>,
): Map<string, MatchPitchPoint> {
  const pairs: Array<{ defender: string; attacker: string; distance: number }> = [];
  for (const defender of defenders) {
    if (defender.role === "GK" || exclude.has(defender.playerId)) continue;
    const zone = shapeTarget(defendingSide, defender, ball, false);
    for (const attacker of attackers) {
      if (attacker.role === "GK") continue;
      const position = attackerPositions.get(attacker.playerId);
      if (!position) continue;
      const distance = metres(zone, position);
      if (distance < 20) pairs.push({ defender: defender.playerId, attacker: attacker.playerId, distance });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance || a.defender.localeCompare(b.defender) || a.attacker.localeCompare(b.attacker));
  const taken = new Set<string>();
  const result = new Map<string, MatchPitchPoint>();
  for (const pair of pairs) {
    if (result.has(pair.defender) || taken.has(pair.attacker)) continue;
    const position = attackerPositions.get(pair.attacker);
    if (!position) continue;
    result.set(pair.defender, position);
    taken.add(pair.attacker);
  }
  return result;
}

function nearestTo(
  lineup: MatchLineupPlayer[],
  positions: MatchPositionMap,
  point: MatchPitchPoint,
  exclude: Set<string>,
): MatchLineupPlayer | undefined {
  let best: MatchLineupPlayer | undefined;
  let bestDistance = Infinity;
  for (const player of lineup) {
    if (player.role === "GK" || exclude.has(player.playerId)) continue;
    const position = positions.get(player.playerId);
    if (!position) continue;
    const distance = metres(position, point);
    if (distance < bestDistance || (distance === bestDistance && best && player.playerId < best.playerId)) {
      best = player;
      bestDistance = distance;
    }
  }
  return best;
}

function sideTargets(
  positions: MatchPositionMap,
  side: MatchMotionSide,
  other: MatchMotionSide,
  otherPositions: MatchPositionMap,
  action: MatchSequenceAction,
  nextAction: MatchSequenceAction | undefined,
): MatchPositionMap {
  const ourSide = sideId(side.ours);
  const possessionSide = action.possessionSide ?? action.side;
  const inPossession = possessionSide === ourSide;
  const next = copyPositions(positions);

  const directlyInvolved = new Set<string>();
  if (action.side === ourSide && action.playerId) directlyInvolved.add(action.playerId);
  if (action.targetPlayerId && (action.side === ourSide || possessionSide === ourSide)) {
    directlyInvolved.add(action.targetPlayerId);
  }

  // The defending team's nearest player presses the ball.
  let presser: string | undefined;
  if (!inPossession) {
    const explicit =
      action.side === ourSide && DEFENSIVE_ACTIONS.has(action.kind) ? action.playerId : undefined;
    presser = explicit ?? nearestTo(side.lineup, positions, action.end, directlyInvolved)?.playerId;
  }

  const marks = inPossession
    ? new Map<string, MatchPitchPoint>()
    : markingAssignments(
        side.lineup,
        side,
        other.lineup,
        otherPositions,
        action.end,
        new Set([...directlyInvolved, ...(presser ? [presser] : [])]),
      );

  // The next receiver shows for the ball (or sets off on his run) a beat early.
  const nextReceiver =
    inPossession &&
    nextAction &&
    PASS_ACTIONS.has(nextAction.kind) &&
    (nextAction.possessionSide ?? nextAction.side) === ourSide
      ? nextAction.targetPlayerId
      : undefined;

  for (const player of side.lineup) {
    const id = player.playerId;
    const current = positions.get(id) ?? fallbackBase(side, player);
    const actor = action.side === ourSide && action.playerId === id;
    const target =
      action.targetPlayerId === id && (action.side === ourSide || possessionSide === ourSide);

    if (actor) {
      if (["receive", "interception", "recovery", "carry"].includes(action.kind)) {
        next.set(id, { ...action.end });
        continue;
      }
      if (PASS_ACTIONS.has(action.kind) || action.kind === "shot" || DEFENSIVE_ACTIONS.has(action.kind)) {
        next.set(id, { ...action.start });
        continue;
      }
    }
    if (target) {
      if (PASS_ACTIONS.has(action.kind)) {
        next.set(id, { ...action.end });
        continue;
      }
      if (DEFENSIVE_ACTIONS.has(action.kind)) {
        next.set(id, { ...action.start });
        continue;
      }
    }

    if (player.role === "GK" && !inPossession && action.kind === "shot") {
      next.set(id, { x: side.ours ? 5.5 : 94.5, y: clamp(action.end.y, 40, 60) });
      continue;
    }

    if (nextReceiver === id && nextAction && !actor) {
      const share = nextAction.kind === "throughBall" ? 0.7 : 0.55;
      next.set(id, {
        x: current.x + (nextAction.end.x - current.x) * share,
        y: current.y + (nextAction.end.y - current.y) * share,
      });
      continue;
    }

    if (presser === id) {
      // Close to a couple of metres, staying goal-side of the ball.
      const dir = side.ours ? 1 : -1;
      const goalSide = {
        x: action.end.x - dir * 2.2,
        y: action.end.y + (current.y > action.end.y ? 1.5 : -1.5),
      };
      next.set(id, {
        x: clamp(current.x + (goalSide.x - current.x) * 0.72, 3, 97),
        y: clamp(current.y + (goalSide.y - current.y) * 0.72, 5, 95),
      });
      continue;
    }

    let moved = offBallTarget(current, player, side, action, inPossession, marks.get(id));
    if (inPossession && player.role !== "GK") moved = onside(moved, side, other, otherPositions, action.end);
    next.set(id, moved);
  }
  return next;
}

/** Off-ball attackers hold their runs level with the second-last defender (or the ball). */
function onside(
  point: MatchPitchPoint,
  side: MatchMotionSide,
  other: MatchMotionSide,
  otherPositions: MatchPositionMap,
  ball: MatchPitchPoint,
): MatchPitchPoint {
  const depths: number[] = [];
  for (const player of other.lineup) {
    const position = otherPositions.get(player.playerId);
    if (position) depths.push(side.ours ? position.x : 100 - position.x);
  }
  if (depths.length < 2) return point;
  depths.sort((a, b) => b - a);
  const line = Math.max(depths[1], side.ours ? ball.x : 100 - ball.x);
  const depth = side.ours ? point.x : 100 - point.x;
  if (depth <= line) return point;
  return { x: side.ours ? line : 100 - line, y: point.y };
}

function applyAction(
  state: JointState,
  user: MatchMotionSide,
  opponent: MatchMotionSide,
  action: MatchSequenceAction,
  nextAction: MatchSequenceAction | undefined,
): JointState {
  // Both teams react to where the other stood at the start of the action.
  return {
    user: sideTargets(state.user, user, opponent, state.opponent, action, nextAction),
    opponent: sideTargets(state.opponent, opponent, user, state.user, action, nextAction),
  };
}

function applySequence(
  state: JointState,
  user: MatchMotionSide,
  opponent: MatchMotionSide,
  sequence: MatchSequence | null | undefined,
): JointState {
  if (!sequence) return state;
  let current = state;
  sequence.actions.forEach((action, index) => {
    current = applyAction(current, user, opponent, action, sequence.actions[index + 1]);
  });
  return current;
}

function initialState(user: MatchMotionSide, opponent: MatchMotionSide): JointState {
  const fill = (side: MatchMotionSide) => {
    const map = copyPositions(side.basePositions);
    for (const player of side.lineup) {
      if (!map.has(player.playerId)) map.set(player.playerId, fallbackBase(side, player));
    }
    return map;
  };
  return { user: fill(user), opponent: fill(opponent) };
}

/**
 * Persistent visual match state derived from structured football actions.
 *
 * Every action starts from the exact end positions of the previous action.
 * That gives the renderer iteration-like continuity without introducing a
 * second result engine or stateful UI randomness.
 */
export function motionFrameForSequence({
  sequence,
  actionIndex,
  localProgress,
  user,
  opponent,
  entrySequences = [],
}: {
  sequence: MatchSequence | null;
  actionIndex: number;
  localProgress: number;
  user: MatchMotionSide;
  opponent: MatchMotionSide;
  entrySequences?: Array<MatchSequence | null | undefined>;
}): MatchMotionFrame {
  let start = initialState(user, opponent);
  for (const entry of entrySequences) start = applySequence(start, user, opponent, entry);
  if (!sequence || sequence.actions.length === 0) return start;

  const boundedIndex = clamp(actionIndex, 0, sequence.actions.length - 1);
  for (let index = 0; index < boundedIndex; index += 1) {
    start = applyAction(start, user, opponent, sequence.actions[index], sequence.actions[index + 1]);
  }
  const end = applyAction(
    start,
    user,
    opponent,
    sequence.actions[boundedIndex],
    sequence.actions[boundedIndex + 1],
  );

  const blend = (side: MatchMotionSide, from: MatchPositionMap, to: MatchPositionMap) => {
    const frame = new Map<string, MatchPitchPoint>();
    for (const player of side.lineup) {
      const a = from.get(player.playerId) ?? fallbackBase(side, player);
      const b = to.get(player.playerId) ?? a;
      frame.set(player.playerId, lerpPoint(a, b, localProgress));
    }
    return frame;
  };

  return {
    user: blend(user, start.user, end.user),
    opponent: blend(opponent, start.opponent, end.opponent),
  };
}