import type { MatchEvent } from "./types";

export interface MatchCommentaryBridge {
  fromMinute: number;
  toMinute: number;
  durationMs: number;
  text: string;
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

export function commentaryBridge(
  previous: MatchEvent | undefined,
  next: MatchEvent,
  usName: string,
  themName: string,
): MatchCommentaryBridge | null {
  const fromMinute = previous?.minute ?? (next.minute <= 6 ? 0 : Math.max(0, next.minute - 5));
  const gap = Math.max(0, next.minute - fromMinute);
  if (gap <= 1) return null;

  const durationMs = clamp(1_900 + gap * 180, 2_200, 5_400);
  const seed = seedOf(next, "bridge");
  const attackingName = next.side === "us" ? usName : next.side === "them" ? themName : null;
  const defendingName = next.side === "us" ? themName : usName;

  let options: string[];
  if (next.phase === "transition") {
    options = [
      "The game opens up as possession changes hands.",
      "A loose spell in midfield is creating room for a break.",
      `${attackingName ?? "One side"} are looking to attack before the shape can reset.`,
    ];
  } else if (next.phase === "buildUp") {
    options = [
      `${attackingName ?? "The team in possession"} are working patiently from the back.`,
      "The tempo settles as the ball is recycled through the deeper players.",
      `${defendingName} hold their shape while the move develops.`,
    ];
  } else if (next.phase === "finalThird") {
    options = [
      `${attackingName ?? "The attacking side"} are beginning to pin the opposition back.`,
      "Pressure is building around the final third.",
      `${defendingName} are being forced deeper as another attack develops.`,
    ];
  } else if (next.phase === "setPiece") {
    options = [
      "Play slows as both sides organise for the restart.",
      `${attackingName ?? "The attacking side"} have a chance to load the area.`,
      "Players take their positions as the set piece develops.",
    ];
  } else if (gap >= 8) {
    options = [
      "A quieter spell follows, with both sides competing for control.",
      "The match settles into midfield before the next opening appears.",
      "Neither side is forcing the issue as the clock moves on.",
    ];
  } else {
    options = [
      "Possession changes hands as both sides probe for space.",
      "The shape of the game is shifting through midfield.",
      "Both teams are looking for the next route forward.",
    ];
  }

  return {
    fromMinute,
    toMinute: next.minute,
    durationMs,
    text: options[seed % options.length],
  };
}

export function bridgeMinute(
  bridge: MatchCommentaryBridge,
  progress: number,
): number {
  const t = clamp(progress, 0, 1);
  return Math.round(bridge.fromMinute + (bridge.toMinute - bridge.fromMinute) * t);
}
