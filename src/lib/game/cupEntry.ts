import type { DomesticCupState, GameState } from "./types";
import { faCupEntryRound } from "./domesticCups";
import { initialiseDomesticCup } from "./domesticCupState";

function clubsAtOrBelowTier(state: GameState, maxTier: number): string[] {
  return state.leagues
    .filter((league) => league.tier <= maxTier)
    .flatMap((league) => league.clubIds);
}

export function initialiseSeasonCups(state: GameState): DomesticCupState[] {
  const all = [...state.leagues].sort((a, b) => b.tier - a.tier);
  const lowerFaEntrants = all.filter((l) => faCupEntryRound(l.tier) === 1).flatMap((l) => l.clubIds);
  const leagueCupEntrants = clubsAtOrBelowTier(state, 4);
  const seed = `${state.saveSeed}|${state.season}`;
  const cups: DomesticCupState[] = [];
  if (leagueCupEntrants.length >= 2) cups.push(initialiseDomesticCup("leagueCup", leagueCupEntrants, seed));
  if (lowerFaEntrants.length >= 2) cups.push(initialiseDomesticCup("faCup", lowerFaEntrants, seed));
  return cups;
}

/** Add the divisions whose National Cup entry point has just arrived. */
export function addFaCupEntrantsForRound(state: GameState, cup: DomesticCupState): DomesticCupState {
  if (cup.competition !== "faCup") return cup;
  const due = state.leagues
    .filter((league) => faCupEntryRound(league.tier) === cup.round)
    .flatMap((league) => league.clubIds)
    .filter((club) => !cup.entrants.includes(club) && !cup.eliminated.includes(club));
  if (!due.length) return cup;

  // Re-draw this round with survivors plus newly entering clubs. This is called
  // before the round is played, so no resolved tie may be discarded.
  if (cup.ties.some((tie) => tie.winner)) return cup;
  return initialiseDomesticCup("faCup", [...cup.entrants, ...due], `${state.saveSeed}|${state.season}`, cup.round);
}
