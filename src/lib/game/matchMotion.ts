import type { MatchLineupPlayer, MatchTeamPlan } from "./types";
import type {
  MatchPitchPoint,
  MatchSequence,
  MatchSequenceAction,
} from "./matchSequence";
import {
  formationPitchShape,
  resolveManagerFormation,
  wideDefenderMovement,
} from "./managerFormationLayout";

export type MatchPositionMap = Map<string, MatchPitchPoint>;

export interface MatchMotionSide {
  lineup: MatchLineupPlayer[];
  /**
   * Caller-supplied resting shape. Used only when the side has no plan; with
   * a plan, the formation's own shape (shared with matchSequence) is used so
   * the viewer always shows the formation that actually played.
   */
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
 *    stay goal-side of him. Wing-backs in a back three drop in to make five.
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

const BACK_LINE = new Set(["CB", "LB", "RB", "LWB", "RWB"]);

/** Pitch units are percentages; these convert to rough metres. */
const XM = 1.05;
const YM = 0.68;

/**
 * Playback seconds per unit of action weight. Highlights play at ~1.42 s per
 * weight and open play at ~1.65 s (see sequenceDurationMs / flowSequenceDurationMs);
 * 1.5 s is the shared planning figure for how far a player can move.
 */
const SECONDS_PER_WEIGHT = 1.5;
/** Off-ball running speed, m/s: a purposeful run, not a flat sprint. */
const RUN_SPEED = 7;
/** The ball carrier, the pass receiver and the presser may sprint. */
const SPRINT_SPEED = 9.2;
/** Teammates closer than this are pushed apart, metres. */
const MIN_SPACING = 3;

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

const formationBaseCache = new WeakMap<MatchMotionSide, MatchPositionMap>();

/** The side's resting shape: its formation when known, else the caller's map. */
function sideBase(side: MatchMotionSide): MatchPositionMap {
  if (!side.plan?.formation) return side.basePositions;
  const cached = formationBaseCache.get(side);
  if (cached) return cached;
  const shape = formationPitchShape(side.lineup, resolveManagerFormation(side.plan.formation), sideId(side.ours));
  formationBaseCache.set(side, shape);
  return shape;
}

function fallbackBase(side: MatchMotionSide, player: MatchLineupPlayer): MatchPitchPoint {
  return sideBase(side).get(player.playerId) ?? side.basePositions.get(player.playerId) ?? { x: side.ours ? 42 : 58, y: 50 };
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

  const formation = side.plan?.formation ? resolveManagerFormation(side.plan.formation) : undefined;
  const directness = side.plan?.directness ?? "Medium";
  const possessionMinded = side.plan?.philosophy === "Possession" || directness === "Low";
  const wide = wideDefenderMovement(player.role, formation, possessionMinded);

  if (inPossession) {
    const push = directness === "High" ? 5 : directness === "Low" ? 7 : 6;
    // The block travels with the ball and keeps roughly its formation depth.
    const blockX = base.x * 0.35 + (ball.x + (base.x - 50) * 0.75) * 0.65;
    return {
      x: clamp(blockX + dir * (push + wide.push), 4, 96),
      y: clamp(50 + (base.y - 50) * 1.12 + (ball.y - 50) * 0.14, 5, 95),
    };
  }

  const pressing = side.plan?.pressing ?? "Medium";
  const tempo = side.plan?.tempo ?? "Medium";
  const drop = pressing === "High" ? 1 : pressing === "Low" ? 7 : tempo === "High" ? 3 : 4;
  // Out of possession the block compacts to roughly 35 m around the ball.
  const blockX = base.x * 0.35 + (ball.x + (base.x - 50) * 0.6) * 0.65;
  const target = {
    x: blockX - dir * (drop + wide.recover),
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
    const defensiveRole = BACK_LINE.has(player.role);
    const dangerous = ["throughBall", "overlap", "cutback", "cross", "shot"].includes(action.kind);
    const retreat = defensiveRole && dangerous ? 1.35 : 1;
    const goal = { x: ownGoalX(side.ours), y: 50 };
    const towardsGoal = { x: goal.x - markTarget.x, y: goal.y - markTarget.y };
    const length = Math.hypot(towardsGoal.x, towardsGoal.y) || 1;
    const mark = {
      x: markTarget.x + (towardsGoal.x / length) * 3 * retreat,
      y: markTarget.y + (towardsGoal.y / length) * 3 * retreat,
    };
    const weight = dangerous ? 0.75 : 0.5;
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

/** Move `from` towards `to`, but no further than `metresAllowed`. */
function limitMove(from: MatchPitchPoint, to: MatchPitchPoint, metresAllowed: number): MatchPitchPoint {
  const dx = (to.x - from.x) * XM;
  const dy = (to.y - from.y) * YM;
  const d = Math.hypot(dx, dy);
  if (d <= metresAllowed || d === 0) return to;
  const k = metresAllowed / d;
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
}

/** Push teammates apart so nobody stands on top of anybody else. */
function spreadOut(positions: MatchPositionMap, lineup: MatchLineupPlayer[], fixed: Set<string>): void {
  const ids = lineup.filter((p) => p.role !== "GK").map((p) => p.playerId);
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = positions.get(ids[i]);
        const b = positions.get(ids[j]);
        if (!a || !b) continue;
        const dx = (b.x - a.x) * XM;
        const dy = (b.y - a.y) * YM;
        const d = Math.hypot(dx, dy);
        if (d >= MIN_SPACING) continue;
        // Deterministic direction when two players share a spot exactly.
        const ux = d > 1e-6 ? dx / d : 0;
        const uy = d > 1e-6 ? dy / d : ids[i] < ids[j] ? 1 : -1;
        const push = (MIN_SPACING - d) / 2;
        const aFixed = fixed.has(ids[i]);
        const bFixed = fixed.has(ids[j]);
        if (aFixed && bFixed) continue;
        const sa = aFixed ? 0 : bFixed ? 2 : 1;
        const sb = bFixed ? 0 : aFixed ? 2 : 1;
        positions.set(ids[i], { x: clamp(a.x - (ux * push * sa) / XM, 3, 97), y: clamp(a.y - (uy * push * sa) / YM, 4, 96) });
        positions.set(ids[j], { x: clamp(b.x + (ux * push * sb) / XM, 3, 97), y: clamp(b.y + (uy * push * sb) / YM, 4, 96) });
      }
    }
  }
}

function sideTargets(
  positions: MatchPositionMap,
  side: MatchMotionSide,
  other: MatchMotionSide,
  otherPositions: MatchPositionMap,
  action: MatchSequenceAction,
  nextAction: MatchSequenceAction | undefined,
  holdShape = false,
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
    // Set pieces: everyone holds the set-up until the ball is delivered.
    if (holdShape && !actor && action.targetPlayerId !== id) {
      next.set(id, { ...current });
      continue;
    }
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
      const keeperX = side.ours ? 5.5 : 94.5;
      next.set(id, { x: keeperX, y: clamp(action.end.y, 40, 60) });
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
    // The back line stays goal-side of the ball, even while marking.
    if (!inPossession && BACK_LINE.has(player.role)) {
      const dir = side.ours ? 1 : -1;
      // ...but never behind their own goal line (a ball in the net sits on it).
      const goalSide = dir > 0 ? Math.min(moved.x, action.end.x - 2.5) : Math.max(moved.x, action.end.x + 2.5);
      moved = { x: clamp(goalSide, 3, 97), y: moved.y };
    }
    next.set(id, moved);
  }

  // Human limits apply to everybody, including the nominated receiver. The old
  // receiver exemption could catapult a deep full-back 30–40 m to satisfy a
  // pre-selected diagonal endpoint. Actors already on the ball may hold their
  // touch point; anyone travelling to the ball has to get there at sprint speed.
  const seconds = Math.max(0.25, action.weight * SECONDS_PER_WEIGHT);
  const fixed = new Set<string>();
  for (const player of side.lineup) {
    const id = player.playerId;
    const actor = action.side === ourSide && action.playerId === id;
    const target = action.targetPlayerId === id && (action.side === ourSide || possessionSide === ourSide);
    const from = positions.get(id) ?? fallbackBase(side, player);
    const to = next.get(id);
    if (!to) continue;
    if (actor) {
      fixed.add(id);
      continue;
    }
    const speed = target || id === presser || id === nextReceiver ? SPRINT_SPEED : RUN_SPEED;
    const limited = limitMove(from, to, speed * seconds);
    next.set(id, limited);
    // Once a nominated receiver can physically reach the pass endpoint, keep
    // that exact first-touch position fixed while spacing moves teammates
    // around them. Otherwise spreadOut can nudge the receiver away from the
    // ball after the speed limit has already been satisfied.
    if (target && metres(limited, to) < 0.05) fixed.add(id);
  }
  if (!holdShape) spreadOut(next, side.lineup, fixed);
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
  holdShape = false,
): JointState {
  // Both teams react to where the other stood at the start of the action.
  return {
    user: sideTargets(state.user, user, opponent, state.opponent, action, nextAction, holdShape),
    opponent: sideTargets(state.opponent, opponent, user, state.user, action, nextAction, holdShape),
  };
}

/** A set piece holds its shape through the set-up and the delivery. */
const holdsShape = (sequence: MatchSequence, index: number) => Boolean(sequence.setPiece) && index <= 1;

function applySequence(
  state: JointState,
  user: MatchMotionSide,
  opponent: MatchMotionSide,
  sequence: MatchSequence | null | undefined,
): JointState {
  if (!sequence) return state;
  let current = state;
  sequence.actions.forEach((action, index) => {
    current = applyAction(current, user, opponent, action, sequence.actions[index + 1], holdsShape(sequence, index));
  });
  return current;
}

function initialState(user: MatchMotionSide, opponent: MatchMotionSide): JointState {
  const fill = (side: MatchMotionSide) => {
    const map = copyPositions(sideBase(side));
    for (const player of side.lineup) {
      if (!map.has(player.playerId)) map.set(player.playerId, fallbackBase(side, player));
    }
    return map;
  };
  return { user: fill(user), opponent: fill(opponent) };
}

/**
 * Where players stand for a dead ball near goal. Deterministic: players are
 * placed in role order, so the same set piece always sets up the same way.
 * `attackX` is the goal being attacked (100 for us, 0 for them).
 */
function setPieceLayout(
  map: MatchPositionMap,
  side: MatchMotionSide,
  attacking: boolean,
  kind: NonNullable<MatchSequence["setPiece"]>,
  ball: MatchPitchPoint,
  takerId: string | undefined,
): void {
  // The goal being attacked in this set piece.
  const attackRight = ball.x > 50;
  const toward = (depth: number) => (attackRight ? 100 - depth : depth); // depth from the attacked goal line
  const outfield = side.lineup.filter((p) => p.role !== "GK" && p.playerId !== takerId);
  const keeper = side.lineup.find((p) => p.role === "GK");
  const byHeight = [...outfield].sort((a, b) => {
    const order = ["CB", "ST", "CDM", "LB", "RB", "LWB", "RWB", "CM", "CAM", "LM", "RM", "LW", "RW"];
    return order.indexOf(a.role) - order.indexOf(b.role) || a.playerId.localeCompare(b.playerId);
  });
  const place = (id: string, depth: number, y: number) => map.set(id, { x: clamp(toward(depth), 2, 98), y: clamp(y, 6, 94) });

  if (kind === "penalty") {
    // Everyone outside the area and the arc, keeper on the line.
    byHeight.forEach((p, i) => place(p.playerId, 18.5 + (i % 2) * 2.5, 22 + (i * 56) / Math.max(1, byHeight.length - 1)));
    if (keeper && !attacking) place(keeper.playerId, 0.8, 50);
    return;
  }
  if (kind === "corner") {
    if (attacking) {
      // Five attack the box, one on the edge, the rest (two) hold back.
      const boxY = [42, 50, 58, 46, 54];
      byHeight.slice(0, 5).forEach((p, i) => place(p.playerId, 6 + (i % 3) * 3.5, boxY[i]));
      byHeight.slice(5, 6).forEach((p) => place(p.playerId, 19, 50));
      byHeight.slice(6).forEach((p, i) => place(p.playerId, 45 + i * 6, 35 + i * 30));
    } else {
      // Everyone back: zonal line on the six-yard box, markers goal-side, one up.
      const zone = [40, 47, 53, 60];
      byHeight.slice(0, 4).forEach((p, i) => place(p.playerId, 5, zone[i]));
      byHeight.slice(4, 9).forEach((p, i) => place(p.playerId, 8.5 + (i % 2) * 2, 38 + i * 6));
      byHeight.slice(9).forEach((p) => place(p.playerId, 30, 50));
      if (keeper) place(keeper.playerId, 1, 50);
    }
    return;
  }
  // Free-kick.
  const goal = { x: toward(0), y: 50 };
  if (!attacking) {
    // A wall of four, 9.15 m from the ball on the line to goal.
    const dx = (goal.x - ball.x) * XM;
    const dy = (goal.y - ball.y) * YM;
    const d = Math.hypot(dx, dy) || 1;
    const wall = { x: ball.x + ((dx / d) * 9.15) / XM, y: ball.y + ((dy / d) * 9.15) / YM };
    byHeight.slice(0, 4).forEach((p, i) => map.set(p.playerId, { x: wall.x, y: clamp(wall.y + (i - 1.5) * (0.8 / YM), 6, 94) }));
    byHeight.slice(4, 9).forEach((p, i) => place(p.playerId, 9 + (i % 2) * 2, 36 + i * 7));
    if (keeper) place(keeper.playerId, 1.2, 50 + (ball.y - 50) * 0.12);
  } else {
    byHeight.slice(0, 4).forEach((p, i) => place(p.playerId, 12 + (i % 2) * 2, 40 + i * 7));
  }
}

const RESTART_KINDS = new Set<MatchSequenceAction["kind"]>(["receive", "recovery"]);
/** How far the first player may be from a dead ball before the clip is treated as a restart. */
const RESTART_DISTANCE_M = 6;

/**
 * A clip that opens on a dead ball (kick-off, goal kick, keeper's ball, a
 * loose-ball restart after a highlight) starts from a reset: the taker is on
 * the ball and both teams stand in shape around it. The viewer shows this as
 * a deliberate cut. Clips that continue live play are left untouched.
 */
export function sequenceStartsWithReset(
  state: { user: MatchPositionMap; opponent: MatchPositionMap },
  sequence: MatchSequence,
): boolean {
  const first = sequence.actions[0];
  if (!first || !first.playerId) return false;
  // A set piece is always a dead ball: the teams set up before it is taken.
  if (sequence.setPiece) return true;
  if (!RESTART_KINDS.has(first.kind)) return false;
  const map = first.side === "us" ? state.user : state.opponent;
  const pos = map.get(first.playerId);
  return !pos || metres(pos, first.start) > RESTART_DISTANCE_M;
}

function restartState(
  state: JointState,
  user: MatchMotionSide,
  opponent: MatchMotionSide,
  sequence: MatchSequence,
): JointState {
  if (!sequenceStartsWithReset(state, sequence)) return state;
  const first = sequence.actions[0];
  const ball = first.start;
  const holding = first.possessionSide ?? first.side;
  const reset = (side: MatchMotionSide): MatchPositionMap => {
    const map = new Map<string, MatchPitchPoint>();
    const inPossession = sideId(side.ours) === holding;
    for (const player of side.lineup) {
      map.set(player.playerId, shapeTarget(side, player, ball, inPossession));
    }
    if (sequence.setPiece) setPieceLayout(map, side, inPossession, sequence.setPiece, ball, first.playerId);
    if (sideId(side.ours) === first.side && first.playerId) map.set(first.playerId, { ...ball });
    if (!sequence.setPiece) spreadOut(map, side.lineup, new Set(first.playerId ? [first.playerId] : []));
    return map;
  };
  return { user: reset(user), opponent: reset(opponent) };
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
  // Replay the clips already shown exactly as they were shown, restarts
  // included, so this clip begins from the positions the viewer last drew.
  let start = initialState(user, opponent);
  for (const entry of entrySequences) {
    if (!entry || entry.actions.length === 0) continue;
    start = applySequence(restartState(start, user, opponent, entry), user, opponent, entry);
  }
  if (!sequence || sequence.actions.length === 0) return start;
  start = restartState(start, user, opponent, sequence);

  const boundedIndex = clamp(actionIndex, 0, sequence.actions.length - 1);
  for (let index = 0; index < boundedIndex; index += 1) {
    start = applyAction(start, user, opponent, sequence.actions[index], sequence.actions[index + 1], holdsShape(sequence, index));
  }
  const end = applyAction(
    start,
    user,
    opponent,
    sequence.actions[boundedIndex],
    sequence.actions[boundedIndex + 1],
    holdsShape(sequence, boundedIndex),
  );

  const activeAction = sequence.actions[boundedIndex];
  const sideFrame = (side: MatchMotionSide, from: MatchPositionMap, to: MatchPositionMap) => {
    const frame = new Map<string, MatchPitchPoint>();
    for (const player of side.lineup) {
      // A carry means player and ball are one moving object. Drive the carrier
      // from the action's canonical start/end points so residual formation
      // spacing from the previous action can never separate him from the ball.
      if (
        activeAction.kind === "carry" &&
        activeAction.playerId === player.playerId &&
        activeAction.side === sideId(side.ours)
      ) {
        frame.set(player.playerId, lerpPoint(activeAction.start, activeAction.end, localProgress));
        continue;
      }
      const a = from.get(player.playerId) ?? fallbackBase(side, player);
      const b = to.get(player.playerId) ?? a;
      frame.set(player.playerId, lerpPoint(a, b, localProgress));
    }
    return frame;
  };

  return {
    user: sideFrame(user, start.user, end.user),
    opponent: sideFrame(opponent, start.opponent, end.opponent),
  };
}
