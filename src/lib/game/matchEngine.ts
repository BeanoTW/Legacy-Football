import type {
  GameState,
  MatchEngineSnapshot,
  MatchEvent,
  MatchHalfSnapshot,
  MatchTeamPlan,
  MatchTeamStats,
} from "./types";
import type { ManagerMatchStyle } from "./managerMatchStyle";
import { managerMatchPrep } from "./managerMatchPrep";
import { halfGoals, halfPresentation, matchStream } from "./matchday";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const int = (rng: () => number, min: number, max: number) =>
  Math.floor(min + rng() * (max - min + 1));

export function createMatchEngineSnapshot(
  state: GameState,
  style: ManagerMatchStyle,
  opponent: string,
): MatchEngineSnapshot {
  const prep = managerMatchPrep(state);
  return {
    version: 1,
    userPlan: {
      managerId: prep.managerId,
      managerName: prep.managerName,
      formation: style.formation,
      philosophy: style.philosophy,
      squadFit: prep.squadFitScore,
      tempo: style.tempo,
      pressing: style.pressing,
      directness: style.directness,
    },
    opponentPlan: {
      managerId: null,
      managerName: `${opponent} staff`,
      formation: "4-4-2",
      philosophy: "Balanced",
      squadFit: 60,
      tempo: "Medium",
      pressing: "Medium",
      directness: "Medium",
    },
    halves: [],
  };
}

function teamStats(
  rng: () => number,
  goals: number,
  share: number,
  attackingEdge: number,
  chanceBias: number,
): MatchTeamStats {
  const chances = Math.max(goals, int(rng, 2, 5) + Math.round(attackingEdge / 9 + chanceBias * 8));
  const shots = Math.max(goals, chances + int(rng, 0, 3));
  const shotsOnTarget = Math.max(goals, Math.min(shots, Math.round(shots * (0.32 + rng() * 0.18))));
  return {
    possession: clamp(Math.round(share), 22, 78),
    territory: clamp(Math.round(share + attackingEdge * 0.35 + (rng() - 0.5) * 6), 20, 80),
    chances,
    shots,
    shotsOnTarget,
    xg: round2(Math.max(goals * 0.42, chances * (0.1 + rng() * 0.08) + goals * 0.18)),
    corners: int(rng, 0, 4),
    fouls: int(rng, 3, 8),
    yellowCards: 0,
  };
}

function enrichEvents(events: MatchEvent[], half: 1 | 2): MatchEvent[] {
  let sequence = 0;
  return events.map((event) => {
    if (event.type !== "chance" && event.type !== "goal") return event;
    const phase =
      event.type === "goal"
        ? "finalThird"
        : event.minute % 5 === 0
          ? "setPiece"
          : event.minute % 3 === 0
            ? "transition"
            : "progression";
    const zone = event.type === "goal" ? "box" : event.minute % 2 === 0 ? "attackingThird" : "box";
    const xg = event.type === "goal" ? 0.22 : round2(0.05 + (event.minute % 9) * 0.012);
    sequence += 1;
    return { ...event, phase, zone, xg, sequenceId: `h${half}-s${sequence}` };
  });
}

/**
 * The single deterministic half-match contract. Score RNG stays isolated from
 * metrics and presentation, so richer views can evolve without moving results.
 */
export function simulateMatchHalf(input: {
  seedBase: string;
  half: 1 | 2;
  fromMinute: number;
  toMinute: number;
  ourStrength: number;
  opponentStrength: number;
  opponentName: string;
  style: ManagerMatchStyle;
}): { snapshot: MatchHalfSnapshot; events: MatchEvent[] } {
  const goals = halfGoals(
    input.seedBase,
    input.half,
    input.ourStrength,
    input.opponentStrength,
    input.style.attackModifier,
    input.style.defenseModifier,
  );
  const rng = matchStream(input.seedBase, input.half === 1 ? "h1.metrics" : "h2.metrics");
  const strengthEdge = input.ourStrength - input.opponentStrength;
  const possession = clamp(
    50 + strengthEdge * 0.45 + input.style.possessionBias * 100 + (rng() - 0.5) * 6,
    28,
    72,
  );
  const us = teamStats(rng, goals.usGoals, possession, strengthEdge, input.style.chanceBias);
  const them = teamStats(rng, goals.themGoals, 100 - possession, -strengthEdge, 0);
  them.possession = 100 - us.possession;
  const events = enrichEvents(
    halfPresentation(
      input.seedBase,
      input.half,
      input.fromMinute,
      input.toMinute,
      goals.usGoals,
      goals.themGoals,
      input.opponentName,
      input.style,
    ),
    input.half,
  );
  us.yellowCards = events.filter((event) => event.type === "card" && event.side === "us").length;
  them.yellowCards = events.filter(
    (event) => event.type === "card" && event.side === "them",
  ).length;
  return { snapshot: { half: input.half, ...goals, us, them }, events };
}

export function totalMatchStats(
  engine: MatchEngineSnapshot | undefined,
): { us: MatchTeamStats; them: MatchTeamStats } | null {
  if (!engine?.halves.length) return null;
  const total = (side: "us" | "them"): MatchTeamStats => {
    const halves = engine.halves.map((half) => half[side]);
    const weight = halves.length;
    return {
      possession: Math.round(halves.reduce((sum, stats) => sum + stats.possession, 0) / weight),
      territory: Math.round(halves.reduce((sum, stats) => sum + stats.territory, 0) / weight),
      chances: halves.reduce((sum, stats) => sum + stats.chances, 0),
      shots: halves.reduce((sum, stats) => sum + stats.shots, 0),
      shotsOnTarget: halves.reduce((sum, stats) => sum + stats.shotsOnTarget, 0),
      xg: round2(halves.reduce((sum, stats) => sum + stats.xg, 0)),
      corners: halves.reduce((sum, stats) => sum + stats.corners, 0),
      fouls: halves.reduce((sum, stats) => sum + stats.fouls, 0),
      yellowCards: halves.reduce((sum, stats) => sum + stats.yellowCards, 0),
    };
  };
  return { us: total("us"), them: total("them") };
}
