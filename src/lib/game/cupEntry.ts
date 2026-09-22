import type { DomesticCupState, GameState } from "./types";
import { faCupEntryRound } from "./domesticCups";
import { initialiseDomesticCup } from "./domesticCupState";
import { footballLevelOfLeague } from "./footballLevel";
import { DOMESTIC_CUPS } from "./domesticCups";

function clubsAtOrBelowLevel(state: GameState, maxLevel: number): string[] {
  return state.leagues
    .filter((league) => footballLevelOfLeague(league) <= maxLevel)
    .flatMap((league) => league.clubIds);
}

export function initialiseSeasonCups(state: GameState): DomesticCupState[] {
  const all = [...state.leagues].sort((a, b) => b.tier - a.tier);
  const lowerFaEntrants = all.filter((l) => faCupEntryRound(footballLevelOfLeague(l)) === 1).flatMap((l) => l.clubIds);
  const leagueCupMaxLevel = DOMESTIC_CUPS.find((cup) => cup.id === "leagueCup")?.maxTier ?? 4;
  const leagueCupEntrants = clubsAtOrBelowLevel(state, leagueCupMaxLevel);
  const seed = `${state.saveSeed}|${state.season}`;
  const cups: DomesticCupState[] = [];
  if (leagueCupEntrants.length >= 2) cups.push(initialiseDomesticCup("leagueCup", leagueCupEntrants, seed));
  if (lowerFaEntrants.length >= 2) cups.push(initialiseDomesticCup("faCup", lowerFaEntrants, seed));
  state.domesticCups = cups;
  return cups;
}

/** Add the divisions whose National Cup entry point has just arrived. */
export function addFaCupEntrantsForRound(state: GameState, cup: DomesticCupState): DomesticCupState {
  if (cup.competition !== "faCup") return cup;
  const due = state.leagues
    .filter((league) => faCupEntryRound(footballLevelOfLeague(league)) === cup.round)
    .flatMap((league) => league.clubIds)
    .filter((club) => !cup.entrants.includes(club) && !cup.eliminated.includes(club));
  if (!due.length) return cup;

  // Re-draw this round with survivors plus newly entering clubs. This is called
  // before the round is played, so no resolved tie may be discarded.
  if (cup.ties.some((tie) => tie.winner)) return cup;
  return initialiseDomesticCup("faCup", [...cup.entrants, ...due], `${state.saveSeed}|${state.season}`, cup.round);
}


/** Backfill cup state for current saves that predate active cup persistence. */
export function ensureSeasonCups(state: GameState): DomesticCupState[] {
  if (state.domesticCups?.length) return state.domesticCups;
  // Do not invent a tournament halfway through a season after its first round.
  if (state.week > 7) return state.domesticCups ?? [];
  return initialiseSeasonCups(state);
}
