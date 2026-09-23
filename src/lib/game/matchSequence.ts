import type {
  MatchEvent,
  MatchLineupPlayer,
  MatchSubstitution,
  MatchTeamPlan,
  TacticalPosition,
} from "./types";

export interface MatchPitchPoint {
  x: number;
  y: number;
}

export type FootballActionKind =
  | "receive"
  | "interception"
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

function planForSide(input: MatchSequenceInput, side: "us" | "them"): MatchTeamPlan {
  return side === "us" ? input.userPlan ?? DEFAULT_PLAN : input.opponentPlan ?? DEFAULT_PLAN;
}

function otherSide(side: "us" | "them"): "us" | "them" {
  return side === "us" ? "them" : "us";
}

export function activeMatchLineupAtMinute(
  starters: MatchLineupPlayer[],
  bench: MatchLineupPlayer[],
  substitutions: MatchSubstitution[],
  side: "us" | "them",
  minute: number,
): MatchLineupPlayer[] {
  const active = new Map(starters.map((player) => [player.playerId, player]));
  for (const sub of substitutions
    .filter((item) => item.side === side && item.minute <= minute)
    .sort((a, b) => a.minute - b.minute)) {
    active.delete(sub.playerOffId);
    const incoming = bench.find((player) => player.playerId === sub.playerOnId);
    if (incoming) active.set(incoming.playerId, incoming);
  }
  return [...active.values()];
}

function chanceOutcome(event: MatchEvent): "save" | "wide" | "blocked" | "over" {
  const text = event.text.toLowerCase();
  if (text.includes("save") || text.includes("smother")) return "save";
  if (text.includes("block") || text.includes("turned behind")) return "blocked";
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

function sequencePattern(event: MatchEvent, plan: MatchTeamPlan): MatchSequencePattern {
  if (event.phase === "setPiece") return "setPiece";
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

const ROLE_PREFS: Record<MatchSequencePattern, TacticalPosition[]> = {
  patient: ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST"],
  balanced: ["CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "GK"],
  direct: ["CB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "LB", "RB", "GK"],
  wide: ["CM", "CDM", "LB", "RB", "LWB", "RWB", "LM", "RM", "LW", "RW", "CAM", "ST", "CB", "GK"],
  counter: ["CM", "CDM", "LM", "RM", "LW", "RW", "CAM", "ST", "LB", "RB", "CB", "GK"],
  highPress: ["CAM", "CM", "LM", "RM", "LW", "RW", "ST", "CDM", "LB", "RB", "CB", "GK"],
  setPiece: ["LW", "RW", "LM", "RM", "CAM", "CM", "LB", "RB", "CB", "ST", "CDM", "GK"],
  circulation: ["CB", "LB", "RB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "ST", "GK"],
};

const SUPPORT_COUNT: Record<MatchSequencePattern, number> = {
  patient: 4,
  balanced: 3,
  direct: 2,
  wide: 3,
  counter: 2,
  highPress: 2,
  setPiece: 1,
  circulation: 4,
};

function orderedSupportPool(
  event: MatchEvent,
  lineup: MatchLineupPlayer[],
  pattern: MatchSequencePattern,
  excluded: Set<string>,
): MatchLineupPlayer[] {
  const prefs = ROLE_PREFS[pattern];
  return lineup
    .filter((player) => !excluded.has(player.playerId))
    .map((player) => ({
      player,
      roleRank: Math.max(0, prefs.indexOf(player.role)),
      jitter: seedOf(event, `support:${pattern}:${player.playerId}`) % 997,
    }))
    .sort(
      (a, b) =>
        a.roleRank - b.roleRank ||
        b.player.ability - a.player.ability ||
        a.jitter - b.jitter ||
        a.player.playerId.localeCompare(b.player.playerId),
    )
    .map(({ player }) => player);
}

function participantOrder(
  event: MatchEvent,
  lineup: MatchLineupPlayer[],
  pattern: MatchSequencePattern,
): MatchLineupPlayer[] {
  if (!lineup.length) return [];
  const actor = lineup.find((player) => player.playerId === event.actorPlayerId);
  const creator = lineup.find((player) => player.playerId === event.secondaryPlayerId);
  const excluded = new Set([actor?.playerId, creator?.playerId].filter(Boolean) as string[]);
  const support = orderedSupportPool(event, lineup, pattern, excluded).slice(0, SUPPORT_COUNT[pattern]);
  const result = [...support];
  if (creator && !result.some((player) => player.playerId === creator.playerId)) result.push(creator);
  if (actor && !result.some((player) => player.playerId === actor.playerId)) result.push(actor);
  if (!actor && result.length === 0) {
    result.push(lineup[seedOf(event, "fallback-participant") % lineup.length]);
  }
  return result;
}

function startXForPattern(
  event: MatchEvent,
  pattern: MatchSequencePattern,
): number {
  const direction = event.side === "us" ? 1 : -1;
  const attackingX =
    pattern === "highPress"
      ? 61
      : pattern === "setPiece"
        ? 66
        : pattern === "counter"
          ? 28
          : pattern === "direct"
            ? 34
            : event.phase === "finalThird"
              ? 55
              : event.phase === "buildUp"
                ? 22
                : 31;
  return direction === 1 ? attackingX : 100 - attackingX;
}

function touchPoints(
  event: MatchEvent,
  count: number,
  pattern: MatchSequencePattern,
): MatchPitchPoint[] {
  if (count <= 0) return [];
  const direction = event.side === "us" ? 1 : -1;
  const startX = startXForPattern(event, pattern);
  const shotX = direction === 1 ? 84 : 16;
  const seed = seedOf(event, "touches");
  const flank = seed % 2 === 0 ? 20 : 80;
  const oppositeFlank = 100 - flank;
  const startY = pattern === "wide" || pattern === "setPiece" ? flank : 24 + (seed % 53);

  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 1 : index / (count - 1);
    let x = startX + (shotX - startX) * fraction;
    let y =
      startY * (1 - fraction * 0.58) +
      50 * fraction * 0.58 +
      Math.sin((fraction + (seed % 7) / 10) * Math.PI * 2) * 10;

    if (pattern === "patient" && index === 2 && count >= 4) {
      x -= direction * 9;
      y = oppositeFlank;
    } else if (pattern === "wide") {
      y = index < count - 1 ? flank + Math.sin(fraction * Math.PI) * (flank < 50 ? -4 : 4) : 50;
    } else if (pattern === "direct") {
      x += direction * fraction * 7;
      y = startY + (50 - startY) * fraction * 0.72;
    } else if (pattern === "counter" || pattern === "highPress") {
      x += direction * Math.sin(fraction * Math.PI) * 7;
      y = startY + (50 - startY) * fraction * 0.82;
    } else if (pattern === "setPiece") {
      y = index === count - 1 ? 50 : flank;
    }

    return { x: clamp(x, 6, 94), y: clamp(y, 9, 91) };
  });
}

function tempoScale(plan: MatchTeamPlan): number {
  return plan.tempo === "High" ? 0.84 : plan.tempo === "Low" ? 1.16 : 1;
}

function action(
  sequenceId: string,
  index: number,
  values: Omit<MatchSequenceAction, "id">,
): MatchSequenceAction {
  return { id: `${sequenceId}:a${index}`, ...values };
}

function linkKind(
  event: MatchEvent,
  pattern: MatchSequencePattern,
  from: MatchPitchPoint,
  to: MatchPitchPoint,
  linkIndex: number,
  finalLink: boolean,
): FootballActionKind {
  const direction = event.side === "us" ? 1 : -1;
  const forward = (to.x - from.x) * direction;
  const lateral = Math.abs(to.y - from.y);

  if (pattern === "patient" && forward < -2) return "recycle";
  if (pattern === "patient" && lateral > 32) return "switch";
  if (pattern === "wide" && !finalLink && linkIndex >= 1) return "overlap";
  if (pattern === "wide" && finalLink) return seedOf(event, "wide-finish") % 2 === 0 ? "cutback" : "cross";
  if (pattern === "setPiece") return "cross";
  if ((pattern === "direct" || pattern === "counter" || pattern === "highPress") && finalLink) {
    return lateral > 24 ? "cross" : "throughBall";
  }
  if (finalLink && (from.y < 28 || from.y > 72) && lateral > 12) return "cross";
  if (finalLink && forward > 13) return "throughBall";
  return "pass";
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

function pressurePlayer(
  event: MatchEvent,
  defendingLineup: MatchLineupPlayer[],
): MatchLineupPlayer | undefined {
  const preference: TacticalPosition[] = ["CDM", "CM", "CB", "LB", "RB", "LWB", "RWB", "CAM", "LM", "RM", "LW", "RW", "ST", "GK"];
  return [...defendingLineup]
    .map((player) => ({
      player,
      roleRank: Math.max(0, preference.indexOf(player.role)),
      jitter: seedOf(event, `pressure:${player.playerId}`) % 499,
    }))
    .sort((a, b) => a.roleRank - b.roleRank || b.player.ability - a.player.ability || a.jitter - b.jitter)[0]?.player;
}

function shouldShowPressure(event: MatchEvent, defendingPlan: MatchTeamPlan): boolean {
  if (defendingPlan.pressing === "High") return true;
  if (defendingPlan.pressing === "Low") return seedOf(event, "pressure") % 5 === 0;
  return seedOf(event, "pressure") % 2 === 0;
}

export function buildMatchSequence(input: MatchSequenceInput): MatchSequence | null {
  const { event } = input;
  if (event.side === "neutral" || (event.type !== "goal" && event.type !== "chance")) return null;

  const attackingStarters = event.side === "us" ? input.userLineup : input.opponentLineup;
  const attackingBench = event.side === "us" ? input.userBench ?? [] : input.opponentBench ?? [];
  const defendingStarters = event.side === "us" ? input.opponentLineup : input.userLineup;
  const defendingBench = event.side === "us" ? input.opponentBench ?? [] : input.userBench ?? [];
  const attackingPlan = planForSide(input, event.side);
  const defendingPlan = planForSide(input, otherSide(event.side));
  const pattern = sequencePattern(event, attackingPlan);

  const attackingLineup = activeMatchLineupAtMinute(
    attackingStarters,
    attackingBench,
    input.substitutions ?? [],
    event.side,
    event.minute,
  );
  const defendingLineup = activeMatchLineupAtMinute(
    defendingStarters,
    defendingBench,
    input.substitutions ?? [],
    otherSide(event.side),
    event.minute,
  );
  const participants = participantOrder(event, attackingLineup, pattern);
  if (!participants.length) return null;

  const sequenceId = event.sequenceId ?? `match-sequence:${event.minute}:${event.side}:${event.type}`;
  const points = touchPoints(event, participants.length, pattern);
  const actions: MatchSequenceAction[] = [];
  const tempo = tempoScale(attackingPlan);
  let actionIndex = 0;

  const first = participants[0];
  const regain = pattern === "counter" || pattern === "highPress";
  actions.push(
    action(sequenceId, actionIndex++, {
      kind: regain ? "interception" : "receive",
      side: event.side,
      playerId: first.playerId,
      playerName: first.name,
      start: points[0],
      end: points[0],
      weight: (regain ? 0.55 : 0.45) * tempo,
      commentary:
        pattern === "highPress"
          ? `${surname(first.name)} wins it high up the pitch.`
          : pattern === "counter"
            ? `${surname(first.name)} wins possession and looks forward immediately.`
            : `${surname(first.name)} takes possession.`,
    }),
  );

  const pressPlayer = shouldShowPressure(event, defendingPlan)
    ? pressurePlayer(event, defendingLineup)
    : undefined;
  const pressureAt = participants.length > 3 ? 1 : 0;

  for (let i = 0; i < participants.length - 1; i += 1) {
    const holder = participants[i];
    const receiver = participants[i + 1];
    const start = points[i];
    const next = points[i + 1];
    const direction = event.side === "us" ? 1 : -1;
    const carryDistance =
      pattern === "counter" || pattern === "highPress"
        ? 6.5
        : pattern === "direct"
          ? 4.2
          : pattern === "patient"
            ? 1.6
            : 2.8;
    const carried = {
      x: clamp(start.x + direction * carryDistance, 6, 94),
      y: clamp(start.y + (((seedOf(event, `carry:${i}`) % 7) - 3) * 0.7), 9, 91),
    };

    const carryNeeded =
      pattern === "counter" ||
      pattern === "highPress" ||
      pattern === "direct" ||
      i === 0 ||
      seedOf(event, `carry-show:${i}`) % 3 === 0;
    if (carryNeeded) {
      actions.push(
        action(sequenceId, actionIndex++, {
          kind: "carry",
          side: event.side,
          playerId: holder.playerId,
          playerName: holder.name,
          start,
          end: carried,
          weight: (pattern === "counter" || pattern === "highPress" ? 0.7 : 0.48) * tempo,
          commentary:
            pattern === "counter" || pattern === "highPress"
              ? `${surname(holder.name)} drives into the space.`
              : `${surname(holder.name)} carries it forward.`,
        }),
      );
    }

    if (pressPlayer && i === pressureAt) {
      actions.push(
        action(sequenceId, actionIndex++, {
          kind: "press",
          side: otherSide(event.side),
          playerId: pressPlayer.playerId,
          playerName: pressPlayer.name,
          targetPlayerId: holder.playerId,
          targetPlayerName: holder.name,
          start: carried,
          end: carried,
          weight: 0.42,
          commentary: `${surname(pressPlayer.name)} closes down ${surname(holder.name)}.`,
        }),
      );
    }

    const finalLink = i === participants.length - 2;
    const kind = linkKind(event, pattern, carryNeeded ? carried : start, next, i, finalLink);
    actions.push(
      action(sequenceId, actionIndex++, {
        kind,
        side: event.side,
        playerId: holder.playerId,
        playerName: holder.name,
        targetPlayerId: receiver.playerId,
        targetPlayerName: receiver.name,
        start: carryNeeded ? carried : start,
        end: next,
        weight:
          (kind === "cross"
            ? 1.0
            : kind === "switch"
              ? 0.95
              : kind === "throughBall" || kind === "cutback"
                ? 0.82
                : kind === "overlap"
                  ? 0.88
                  : kind === "recycle"
                    ? 0.72
                    : 0.7) * tempo,
        commentary: passCommentary(kind, holder, receiver),
      }),
    );
  }

  const shooter = participants[participants.length - 1];
  const shotStart = points[points.length - 1];
  const destination = shotDestination(event);
  actions.push(
    action(sequenceId, actionIndex++, {
      kind: "shot",
      side: event.side,
      playerId: shooter.playerId,
      playerName: shooter.name,
      start: shotStart,
      end: destination,
      weight: 0.9 * tempo,
      commentary:
        event.type === "goal"
          ? `${surname(shooter.name)} shoots…`
          : `${surname(shooter.name)} gets the shot away…`,
    }),
  );

  if (event.type === "goal") {
    actions.push(
      action(sequenceId, actionIndex++, {
        kind: "goal",
        side: event.side,
        playerId: shooter.playerId,
        playerName: shooter.name,
        start: destination,
        end: destination,
        weight: 0.8,
        commentary: event.text,
      }),
    );
  } else {
    const outcome = chanceOutcome(event);
    actions.push(
      action(sequenceId, actionIndex++, {
        kind: outcome === "save" ? "save" : outcome === "blocked" ? "block" : "miss",
        side: event.side,
        playerId: shooter.playerId,
        playerName: shooter.name,
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

  const participantIds = [...new Set(actions.flatMap((item) => [item.playerId, item.targetPlayerId]).filter(Boolean) as string[])];
  return {
    id: sequenceId,
    minute: event.minute,
    side: event.side,
    phase: event.phase,
    sourceType: event.type,
    sourceText: event.text,
    pattern,
    styleLabel: styleLabel(pattern),
    actions,
    participantIds,
    totalWeight: actions.reduce((sum, item) => sum + item.weight, 0),
  };
}

export interface MatchFlowSequenceInput {
  nextEvent: MatchEvent;
  previousEvent?: MatchEvent;
  userLineup: MatchLineupPlayer[];
  opponentLineup: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
  userPlan?: MatchTeamPlan;
  opponentPlan?: MatchTeamPlan;
}

function quietPossessionSide(input: MatchFlowSequenceInput): "us" | "them" {
  const { nextEvent, previousEvent } = input;
  if (
    previousEvent?.side !== "neutral" &&
    nextEvent.side !== "neutral" &&
    previousEvent?.side === nextEvent.side
  ) {
    return nextEvent.side;
  }
  if (nextEvent.side !== "neutral" && seedOf(nextEvent, "flow-possession") % 3 !== 0) {
    return nextEvent.side;
  }
  return nextEvent.side === "us" ? "them" : "us";
}

function circulationPoints(
  event: MatchEvent,
  side: "us" | "them",
  count: number,
  plan: MatchTeamPlan,
): MatchPitchPoint[] {
  const direction = side === "us" ? 1 : -1;
  const seed = seedOf(event, `circulation:${side}`);
  const direct = plan.directness === "High";
  const patient = plan.directness === "Low" || plan.philosophy === "Possession";
  const start = side === "us" ? 25 : 75;
  const span = direct ? 34 : patient ? 24 : 29;
  const firstLane = 26 + (seed % 49);

  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 0 : index / (count - 1);
    let x = start + direction * span * fraction;
    let y = firstLane + Math.sin((fraction + (seed % 5) * 0.13) * Math.PI * 2) * (patient ? 22 : 15);
    if (patient && index === 2 && count >= 4) x -= direction * 7;
    return { x: clamp(x, 10, 90), y: clamp(y, 12, 88) };
  });
}

/**
 * Lightweight open-play possession shown between canonical highlights.
 * It never creates a shot or result; its sole job is to keep the match visually
 * alive while the written commentary and match clock bridge quiet minutes.
 */
export function buildMatchFlowSequence(input: MatchFlowSequenceInput): MatchSequence | null {
  const gap = input.nextEvent.minute - (input.previousEvent?.minute ?? 0);
  if (gap <= 1) return null;

  const side = quietPossessionSide(input);
  const starters = side === "us" ? input.userLineup : input.opponentLineup;
  const bench = side === "us" ? input.userBench ?? [] : input.opponentBench ?? [];
  const plan = side === "us" ? input.userPlan ?? DEFAULT_PLAN : input.opponentPlan ?? DEFAULT_PLAN;
  const lineup = activeMatchLineupAtMinute(
    starters,
    bench,
    input.substitutions ?? [],
    side,
    Math.max(0, input.nextEvent.minute - 1),
  );
  if (lineup.length < 2) return null;

  const flowEvent: MatchEvent = {
    minute: input.nextEvent.minute,
    type: "info",
    side,
    text: "Open play",
    phase: "buildUp",
    zone: "middleThird",
    sequenceId: `flow:${input.previousEvent?.sequenceId ?? "kickoff"}:${input.nextEvent.sequenceId ?? input.nextEvent.minute}`,
  };
  const pattern: MatchSequencePattern =
    plan.directness === "High"
      ? "direct"
      : plan.directness === "Low" || plan.philosophy === "Possession"
        ? "patient"
        : seedOf(flowEvent, "flow-pattern") % 3 === 0
          ? "wide"
          : "circulation";
  const supportCount = pattern === "direct" ? 3 : pattern === "patient" ? 5 : 4;
  const participants = orderedSupportPool(flowEvent, lineup, pattern, new Set()).slice(0, supportCount);
  if (participants.length < 2) return null;

  const points = circulationPoints(flowEvent, side, participants.length, plan);
  const actions: MatchSequenceAction[] = [];
  const sequenceId = flowEvent.sequenceId!;
  const tempo = tempoScale(plan);
  let actionIndex = 0;

  actions.push(
    action(sequenceId, actionIndex++, {
      kind: "receive",
      side,
      playerId: participants[0].playerId,
      playerName: participants[0].name,
      start: points[0],
      end: points[0],
      weight: 0.34 * tempo,
      commentary: `${surname(participants[0].name)} has it in open play.`,
    }),
  );

  for (let i = 0; i < participants.length - 1; i += 1) {
    const holder = participants[i];
    const receiver = participants[i + 1];
    const start = points[i];
    const end = points[i + 1];
    if (
      (pattern === "direct" && i === 0) ||
      (pattern !== "patient" && seedOf(flowEvent, `flow-carry:${i}`) % 3 === 0)
    ) {
      const carryEnd = {
        x: clamp(start.x + (side === "us" ? 1 : -1) * 2.5, 8, 92),
        y: start.y,
      };
      actions.push(
        action(sequenceId, actionIndex++, {
          kind: "carry",
          side,
          playerId: holder.playerId,
          playerName: holder.name,
          start,
          end: carryEnd,
          weight: 0.35 * tempo,
          commentary: `${surname(holder.name)} moves into space.`,
        }),
      );
    }

    const direction = side === "us" ? 1 : -1;
    const forward = (end.x - start.x) * direction;
    const lateral = Math.abs(end.y - start.y);
    const kind: FootballActionKind =
      forward < -2
        ? "recycle"
        : lateral > 30
          ? "switch"
          : pattern === "direct" && i === participants.length - 2
            ? "throughBall"
            : "pass";
    actions.push(
      action(sequenceId, actionIndex++, {
        kind,
        side,
        playerId: holder.playerId,
        playerName: holder.name,
        targetPlayerId: receiver.playerId,
        targetPlayerName: receiver.name,
        start,
        end,
        weight: (kind === "switch" ? 0.75 : kind === "throughBall" ? 0.65 : 0.58) * tempo,
        commentary: passCommentary(kind, holder, receiver),
      }),
    );
  }

  return {
    id: sequenceId,
    minute: input.nextEvent.minute,
    side,
    phase: "buildUp",
    sourceType: "info",
    sourceText: "Open play",
    pattern,
    styleLabel: pattern === "circulation" ? "Open play" : styleLabel(pattern),
    actions,
    participantIds: participants.map((player) => player.playerId),
    totalWeight: actions.reduce((sum, item) => sum + item.weight, 0),
  };
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
