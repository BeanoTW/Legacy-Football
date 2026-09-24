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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerpPoint(a: MatchPitchPoint, b: MatchPitchPoint, t: number): MatchPitchPoint {
  const p = smoothStep(t);
  return {
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
  };
}

function copyPositions(input: MatchPositionMap): MatchPositionMap {
  return new Map(
    [...input.entries()].map(([id, point]) => [id, { ...point }]),
  );
}

function sideId(ours: boolean): "us" | "them" {
  return ours ? "us" : "them";
}

function fallbackBase(
  side: MatchMotionSide,
  player: MatchLineupPlayer,
): MatchPitchPoint {
  return side.basePositions.get(player.playerId) ?? {
    x: side.ours ? 42 : 58,
    y: 50,
  };
}

interface DefensiveReactionContext {
  presserId?: string;
  coverId?: string;
}

function distanceSquared(a: MatchPitchPoint, b: MatchPitchPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function defensiveReactionContext(
  positions: MatchPositionMap,
  side: MatchMotionSide,
  action: MatchSequenceAction,
): DefensiveReactionContext {
  const ourSide = sideId(side.ours);
  if (action.possessionSide === ourSide) return {};

  const candidates = side.lineup
    .filter((player) => player.role !== "GK")
    .map((player) => ({
      player,
      point: positions.get(player.playerId) ?? fallbackBase(side, player),
    }))
    .sort(
      (a, b) =>
        distanceSquared(a.point, action.end) - distanceSquared(b.point, action.end) ||
        a.player.playerId.localeCompare(b.player.playerId),
    );

  return {
    presserId: candidates[0]?.player.playerId,
    coverId: candidates[1]?.player.playerId,
  };
}

function genericShapeTarget(
  current: MatchPitchPoint,
  base: MatchPitchPoint,
  player: MatchLineupPlayer,
  side: MatchMotionSide,
  action: MatchSequenceAction,
  reaction: DefensiveReactionContext,
): MatchPitchPoint {
  const ourSide = sideId(side.ours);
  const inPossession = action.possessionSide === ourSide;
  const direction = side.ours ? 1 : -1;
  const directness = side.plan?.directness ?? "Medium";
  const pressing = side.plan?.pressing ?? "Medium";
  const philosophy = side.plan?.philosophy ?? "Balanced";
  const wideRole = ["LB", "RB", "LWB", "RWB", "LM", "RM", "LW", "RW"].includes(
    player.role,
  );

  const ball = action.end;
  const forwardShift = inPossession
    ? directness === "High"
      ? 4.2
      : directness === "Low"
        ? 2.4
        : 3.2
    : pressing === "High"
      ? 0.7
      : philosophy === "Defensive" || pressing === "Low"
        ? -2.8
        : -1.5;

  const ballPull = inPossession
    ? side.plan?.tempo === "High"
      ? 0.075
      : 0.055
    : pressing === "High"
      ? 0.085
      : pressing === "Low"
        ? 0.025
        : 0.045;

  const widthPush =
    inPossession && wideRole && directness !== "High"
      ? base.y < 50
        ? -1.8
        : 1.8
      : 0;

  const desired: MatchPitchPoint = {
    x: base.x + direction * forwardShift + (ball.x - base.x) * ballPull,
    y:
      base.y +
      widthPush +
      (ball.y - base.y) * ballPull,
  };

  const defensiveRole = ["CB", "LB", "RB", "LWB", "RWB", "CDM"].includes(
    player.role,
  );
  const midfieldRole = ["CDM", "CM", "CAM", "LM", "RM"].includes(player.role);

  if (!inPossession) {
    const ownGoalX = side.ours ? 6 : 94;
    const goalSideX = ball.x + (ownGoalX - ball.x) * 0.16;
    const ballSideShift = (ball.y - base.y) * (defensiveRole ? 0.42 : midfieldRole ? 0.34 : 0.22);
    const depthShift = (goalSideX - base.x) * (defensiveRole ? 0.3 : midfieldRole ? 0.22 : 0.12);

    desired.x = base.x + depthShift;
    desired.y = base.y + ballSideShift;

    if (reaction.presserId === player.playerId) {
      desired.x = ball.x + (ownGoalX - ball.x) * 0.06;
      desired.y = ball.y;
    } else if (reaction.coverId === player.playerId) {
      desired.x = ball.x + (ownGoalX - ball.x) * 0.2;
      desired.y = ball.y + (base.y - ball.y) * 0.35;
    } else if (defensiveRole) {
      // Back four/five slide together and narrow on the ball side.
      desired.y += (50 - desired.y) * 0.08;
    }
  }
  const dangerous =
    !inPossession &&
    defensiveRole &&
    ["throughBall", "overlap", "cutback", "cross", "shot"].includes(action.kind);

  if (dangerous) {
    const ownGoalX = side.ours ? 6 : 94;
    const retreat =
      action.kind === "shot"
        ? 0.2
        : action.kind === "cross" || action.kind === "cutback"
          ? 0.15
          : 0.1;
    const mark = player.role === "CB" || player.role === "CDM" ? 0.2 : 0.27;
    desired.x = base.x + (ownGoalX - base.x) * retreat;
    desired.y = base.y + (action.end.y - base.y) * mark;
  }

  // Off-ball players converge towards a coherent team shape instead of
  // receiving another full shift every action. This prevents the whole team
  // from drifting or snapping as the sequence advances.
  const response =
    dangerous
      ? 0.5
      : inPossession
        ? side.plan?.tempo === "High"
          ? 0.34
          : 0.28
        : reaction.presserId === player.playerId
          ? pressing === "High"
            ? 0.62
            : pressing === "Low"
              ? 0.42
              : 0.52
          : reaction.coverId === player.playerId
            ? 0.44
            : pressing === "High"
              ? 0.4
              : pressing === "Low"
                ? 0.3
                : 0.34;

  return {
    x: clamp(current.x + (desired.x - current.x) * response, 3, 97),
    y: clamp(current.y + (desired.y - current.y) * response, 5, 95),
  };
}

function endPositionForPlayer(
  current: MatchPitchPoint,
  base: MatchPitchPoint,
  player: MatchLineupPlayer,
  side: MatchMotionSide,
  action: MatchSequenceAction,
  reaction: DefensiveReactionContext,
): MatchPitchPoint {
  const ourSide = sideId(side.ours);
  const actor = action.side === ourSide && action.playerId === player.playerId;
  const target =
    action.targetPlayerId === player.playerId &&
    (action.side === ourSide || action.possessionSide === ourSide);

  if (actor) {
    if (
      action.kind === "receive" ||
      action.kind === "interception" ||
      action.kind === "recovery" ||
      action.kind === "carry"
    ) {
      return { ...action.end };
    }
    if (
      PASS_ACTIONS.has(action.kind) ||
      action.kind === "shot" ||
      DEFENSIVE_ACTIONS.has(action.kind)
    ) {
      return { ...action.start };
    }
  }

  if (target) {
    if (PASS_ACTIONS.has(action.kind)) return { ...action.end };
    if (DEFENSIVE_ACTIONS.has(action.kind)) return { ...action.start };
  }

  if (
    player.role === "GK" &&
    action.possessionSide !== ourSide &&
    action.kind === "shot"
  ) {
    const keeperX = side.ours ? 5.5 : 94.5;
    return {
      x: keeperX,
      y: clamp(action.end.y, 40, 60),
    };
  }

  return genericShapeTarget(current, base, player, side, action, reaction);
}

function applyAction(
  positions: MatchPositionMap,
  side: MatchMotionSide,
  action: MatchSequenceAction,
): MatchPositionMap {
  const next = copyPositions(positions);
  const reaction = defensiveReactionContext(positions, side, action);
  for (const player of side.lineup) {
    const current = positions.get(player.playerId) ?? fallbackBase(side, player);
    const base = fallbackBase(side, player);
    next.set(
      player.playerId,
      endPositionForPlayer(current, base, player, side, action, reaction),
    );
  }
  return next;
}

function applySequence(
  initial: MatchPositionMap,
  side: MatchMotionSide,
  sequence: MatchSequence | null | undefined,
): MatchPositionMap {
  if (!sequence) return copyPositions(initial);
  let positions = copyPositions(initial);
  for (const action of sequence.actions) {
    positions = applyAction(positions, side, action);
  }
  return positions;
}

function entryPositions(
  side: MatchMotionSide,
  entrySequences: Array<MatchSequence | null | undefined>,
): MatchPositionMap {
  let positions = copyPositions(side.basePositions);
  for (const sequence of entrySequences) {
    positions = applySequence(positions, side, sequence);
  }
  return positions;
}

function sideFrame(
  side: MatchMotionSide,
  sequence: MatchSequence | null,
  actionIndex: number,
  localProgress: number,
  entrySequences: Array<MatchSequence | null | undefined>,
): MatchPositionMap {
  let start = entryPositions(side, entrySequences);
  if (!sequence || sequence.actions.length === 0) return start;

  const boundedIndex = clamp(actionIndex, 0, sequence.actions.length - 1);
  for (let index = 0; index < boundedIndex; index += 1) {
    start = applyAction(start, side, sequence.actions[index]);
  }

  const end = applyAction(start, side, sequence.actions[boundedIndex]);
  const frame = new Map<string, MatchPitchPoint>();
  for (const player of side.lineup) {
    const from = start.get(player.playerId) ?? fallbackBase(side, player);
    const to = end.get(player.playerId) ?? from;
    frame.set(player.playerId, lerpPoint(from, to, localProgress));
  }
  return frame;
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
  return {
    user: sideFrame(user, sequence, actionIndex, localProgress, entrySequences),
    opponent: sideFrame(
      opponent,
      sequence,
      actionIndex,
      localProgress,
      entrySequences,
    ),
  };
}
