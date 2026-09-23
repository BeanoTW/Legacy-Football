import type {
  MatchEvent,
  MatchLineupPlayer,
  MatchSubstitution,
} from "./types";

export interface MatchPitchPoint {
  x: number;
  y: number;
}

export type FootballActionKind =
  | "receive"
  | "carry"
  | "pass"
  | "throughBall"
  | "cross"
  | "shot"
  | "save"
  | "block"
  | "miss"
  | "goal";

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

function phaseStartX(event: MatchEvent): number {
  const direction = event.side === "us" ? 1 : -1;
  const attackingX =
    event.phase === "transition"
      ? 28
      : event.phase === "buildUp"
        ? 30
        : event.phase === "setPiece"
          ? 57
          : event.phase === "finalThird"
            ? 61
            : 39;
  return direction === 1 ? attackingX : 100 - attackingX;
}

function participantOrder(
  event: MatchEvent,
  lineup: MatchLineupPlayer[],
): MatchLineupPlayer[] {
  const outfield = lineup.filter((player) => player.role !== "GK");
  if (!outfield.length) return [];
  const actor = outfield.find((player) => player.playerId === event.actorPlayerId);
  const creator = outfield.find((player) => player.playerId === event.secondaryPlayerId);
  const excluded = new Set([actor?.playerId, creator?.playerId].filter(Boolean) as string[]);
  const pool = outfield.filter((player) => !excluded.has(player.playerId));
  const seed = seedOf(event, "participants");
  const rotated = pool.length
    ? [...pool.slice(seed % pool.length), ...pool.slice(0, seed % pool.length)]
    : [];
  const supportCount = event.phase === "transition" ? 2 : event.phase === "finalThird" ? 2 : 3;
  const result = rotated.slice(0, supportCount);
  if (creator && !result.some((player) => player.playerId === creator.playerId)) result.push(creator);
  if (actor && !result.some((player) => player.playerId === actor.playerId)) result.push(actor);
  if (!actor && result.length === 0) result.push(outfield[seed % outfield.length]);
  return result;
}

function touchPoints(event: MatchEvent, count: number): MatchPitchPoint[] {
  if (count <= 0) return [];
  const direction = event.side === "us" ? 1 : -1;
  const startX = phaseStartX(event);
  const shotX = direction === 1 ? 84 : 16;
  const seed = seedOf(event, "touches");
  const startY = 20 + (seed % 61);
  return Array.from({ length: count }, (_, index) => {
    const fraction = count === 1 ? 1 : index / (count - 1);
    const x = startX + (shotX - startX) * fraction;
    const wave = Math.sin((fraction + (seed % 7) / 10) * Math.PI * 2) * 14;
    const lane = ((seed >> (index % 8)) % 9) - 4;
    return {
      x: clamp(x, 7, 93),
      y: clamp(startY * (1 - fraction * 0.55) + 50 * fraction * 0.55 + wave + lane, 10, 90),
    };
  });
}

function passKind(
  from: MatchPitchPoint,
  to: MatchPitchPoint,
  finalPass: boolean,
  event: MatchEvent,
): "pass" | "throughBall" | "cross" {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (finalPass && (from.y < 30 || from.y > 70) && dy > 12) return "cross";
  if (finalPass && dx > 13) return "throughBall";
  return "pass";
}

function action(
  sequenceId: string,
  index: number,
  values: Omit<MatchSequenceAction, "id">,
): MatchSequenceAction {
  return { id: `${sequenceId}:a${index}`, ...values };
}

export function buildMatchSequence(input: MatchSequenceInput): MatchSequence | null {
  const { event } = input;
  if (
    event.side === "neutral" ||
    (event.type !== "goal" && event.type !== "chance")
  ) {
    return null;
  }

  const starters = event.side === "us" ? input.userLineup : input.opponentLineup;
  const bench = event.side === "us" ? input.userBench ?? [] : input.opponentBench ?? [];
  const lineup = activeMatchLineupAtMinute(
    starters,
    bench,
    input.substitutions ?? [],
    event.side,
    event.minute,
  );
  const participants = participantOrder(event, lineup);
  if (!participants.length) return null;

  const sequenceId = event.sequenceId ?? `match-sequence:${event.minute}:${event.side}:${event.type}`;
  const points = touchPoints(event, participants.length);
  const actions: MatchSequenceAction[] = [];
  let actionIndex = 0;

  const first = participants[0];
  actions.push(
    action(sequenceId, actionIndex++, {
      kind: "receive",
      side: event.side,
      playerId: first.playerId,
      playerName: first.name,
      start: points[0],
      end: points[0],
      weight: 0.45,
      commentary: `${surname(first.name)} takes possession.`,
    }),
  );

  for (let i = 0; i < participants.length - 1; i += 1) {
    const holder = participants[i];
    const receiver = participants[i + 1];
    const start = points[i];
    const next = points[i + 1];
    const direction = event.side === "us" ? 1 : -1;
    const carryDistance = event.phase === "transition" ? 5.5 : 2.8;
    const carried = {
      x: clamp(start.x + direction * carryDistance, 6, 94),
      y: clamp(start.y + (((seedOf(event, `carry:${i}`) % 7) - 3) * 0.8), 9, 91),
    };
    actions.push(
      action(sequenceId, actionIndex++, {
        kind: "carry",
        side: event.side,
        playerId: holder.playerId,
        playerName: holder.name,
        start,
        end: carried,
        weight: event.phase === "transition" ? 0.75 : 0.55,
        commentary: `${surname(holder.name)} carries it forward.`,
      }),
    );
    const finalPass = i === participants.length - 2;
    const kind = passKind(carried, next, finalPass, event);
    actions.push(
      action(sequenceId, actionIndex++, {
        kind,
        side: event.side,
        playerId: holder.playerId,
        playerName: holder.name,
        targetPlayerId: receiver.playerId,
        targetPlayerName: receiver.name,
        start: carried,
        end: next,
        weight: kind === "cross" ? 1.05 : kind === "throughBall" ? 0.95 : 0.8,
        commentary:
          kind === "cross"
            ? `${surname(holder.name)} delivers for ${surname(receiver.name)}.`
            : kind === "throughBall"
              ? `${surname(holder.name)} slips ${surname(receiver.name)} through.`
              : `${surname(holder.name)} finds ${surname(receiver.name)}.`,
      }),
    );
  }

  const shooter = participants[participants.length - 1];
  const shotStart = points[points.length - 1];
  const destination = shotDestination(event);
  const shotCommentary =
    event.type === "goal"
      ? `${surname(shooter.name)} shoots…`
      : `${surname(shooter.name)} gets the shot away…`;
  actions.push(
    action(sequenceId, actionIndex++, {
      kind: "shot",
      side: event.side,
      playerId: shooter.playerId,
      playerName: shooter.name,
      start: shotStart,
      end: destination,
      weight: 0.95,
      commentary: shotCommentary,
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
        kind:
          outcome === "save"
            ? "save"
            : outcome === "blocked"
              ? "block"
              : "miss",
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

  return {
    id: sequenceId,
    minute: event.minute,
    side: event.side,
    phase: event.phase,
    sourceType: event.type,
    sourceText: event.text,
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
  return { x, y };
}

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
      const movingBall = ["pass", "throughBall", "cross", "shot", "carry"].includes(current.kind);
      const curve =
        current.kind === "cross"
          ? 5
          : current.kind === "throughBall"
            ? 2.2
            : current.kind === "pass"
              ? 1.2
              : 0;
      return {
        action: current,
        actionIndex: i,
        localProgress,
        ball: movingBall
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
  // Roughly 8–13 seconds for a normal highlight at 1×. This is intentionally
  // slower than the prototype so a move can be read as football rather than a blur.
  return clamp(Math.round(sequence.totalWeight * 1_450), 7_500, 13_500);
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
