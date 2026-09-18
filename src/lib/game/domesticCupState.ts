import type { DomesticCupState, FixtureCompetition } from "./types";
import { startCupRound } from "./cupSchedule";

export function initialiseDomesticCup(
  competition: Extract<FixtureCompetition, "leagueCup" | "faCup">,
  entrants: readonly string[],
  seed: string,
  round = 1,
): DomesticCupState {
  const started = startCupRound(competition, round, entrants, seed);
  return {
    competition,
    round,
    entrants: started.entrants,
    ties: started.ties.map((tie) => ({ ...tie })),
    eliminated: [],
  };
}

export function resolveDomesticCupTie(
  cup: DomesticCupState,
  home: string,
  away: string,
  winner: string,
): DomesticCupState {
  if (winner !== home && winner !== away) return cup;
  const ties = cup.ties.map((tie) =>
    tie.home === home && tie.away === away ? { ...tie, winner } : tie,
  );
  const loser = winner === home ? away : home;
  return {
    ...cup,
    ties,
    eliminated: cup.eliminated.includes(loser) ? cup.eliminated : [...cup.eliminated, loser],
  };
}

export function domesticCupRoundComplete(cup: DomesticCupState): boolean {
  return cup.ties.length > 0 && cup.ties.every((tie) => Boolean(tie.winner));
}

export function advanceDomesticCup(cup: DomesticCupState, seed: string): DomesticCupState {
  if (!domesticCupRoundComplete(cup)) return cup;
  const winners = cup.ties.flatMap((tie) => (tie.winner ? [tie.winner] : []));
  if (winners.length === 1) return { ...cup, champion: winners[0] };

  const next = startCupRound(cup.competition, cup.round + 1, winners, seed);
  return {
    ...cup,
    round: next.round,
    entrants: next.entrants,
    ties: next.ties.map((tie) => ({ ...tie })),
  };
}
