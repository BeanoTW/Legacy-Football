import type { FootballPlayer, GameState } from "./types";
import { aiClubPerformanceModifier } from "./aiClubPerformance";
import { clubFinancialBand } from "./clubFinanceProfile";
import { canonicalClubReference, sameClubReference } from "./clubReference";
import { clubReputation } from "./reputation";

export type AiClubAmbition = "survival" | "consolidate" | "challenge" | "promotion";
export type AiClubFinancialPosture = "cut" | "cautious" | "balanced" | "spend";
export type AiClubSquadCycle = "develop" | "stable" | "refresh" | "rebuild";

export interface AiClubStrategy {
  clubId: string;
  ambition: AiClubAmbition;
  financialPosture: AiClubFinancialPosture;
  squadCycle: AiClubSquadCycle;
  financeBand: number;
  performance: number;
  previousFinish: number | null;
  previousLeagueSize: number | null;
  squadMeanAge: number | null;
  promotedLastSeason: boolean;
  relegatedLastSeason: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function currentLeague(state: GameState, clubId: string) {
  return state.leagues.find((league) =>
    league.clubIds.some((candidate) => sameClubReference(state, candidate, clubId)),
  );
}

function priorLeagueContext(state: GameState, clubId: string) {
  const history = state.clubRecords?.[canonicalClubReference(state, clubId)]?.leagueHistory ??
    state.clubRecords?.[clubId]?.leagueHistory ??
    [];
  const previous = history.find((entry) => entry.season === state.season - 1);
  const current = currentLeague(state, clubId);
  if (!previous || !current) {
    return {
      finish: null as number | null,
      size: null as number | null,
      promoted: false,
      relegated: false,
    };
  }
  const previousLeague = state.leagues.find((league) => league.id === previous.leagueId);
  const previousTier = previousLeague?.tier;
  return {
    finish: previous.position,
    size: previousLeague?.clubIds.length ?? null,
    promoted: previousTier !== undefined && current.tier < previousTier,
    relegated: previousTier !== undefined && current.tier > previousTier,
  };
}

function detailedSquadMeanAge(state: GameState, clubId: string): number | null {
  const players = (state.football?.players ?? []).filter(
    (player) =>
      player.currentClubId !== null &&
      sameClubReference(state, player.currentClubId, clubId),
  );
  if (!players.length) return null;
  const year = 2000 + state.season - 1;
  return players.reduce((sum, player) => sum + (year - player.dateOfBirth.year), 0) / players.length;
}

function squadMeanAge(state: GameState, clubId: string): number | null {
  const detailed = detailedSquadMeanAge(state, clubId);
  if (detailed !== null) return detailed;
  const canonical = canonicalClubReference(state, clubId);
  const fringe = Object.values(state.fringeWorld ?? {}).find((club) =>
    sameClubReference(state, club.clubId, canonical),
  );
  return fringe?.squadMeanAge ?? null;
}

function financeBandFor(state: GameState, clubId: string): number {
  const canonical = canonicalClubReference(state, clubId);
  const fringe = Object.values(state.fringeWorld ?? {}).find((club) =>
    sameClubReference(state, club.clubId, canonical),
  );
  return clamp(fringe?.financeBand ?? clubFinancialBand(state, clubId), 1, 5);
}

function ambitionFor(
  state: GameState,
  clubId: string,
  performance: number,
  finish: number | null,
  size: number | null,
  promoted: boolean,
  relegated: boolean,
): AiClubAmbition {
  const league = currentLeague(state, clubId);
  if (relegated) return "promotion";
  if (promoted) return "survival";
  if (!league) return "consolidate";

  const relative = finish && size ? finish / Math.max(1, size) : null;
  if (league.tier > 1 && ((relative !== null && relative <= 0.22) || performance >= 1.4)) {
    return "promotion";
  }
  if ((relative !== null && relative <= 0.45) || performance >= 0.65) return "challenge";
  if ((relative !== null && relative >= 0.78) || performance <= -1.1) return "survival";
  return "consolidate";
}

function financialPostureFor(
  financeBand: number,
  ambition: AiClubAmbition,
  performance: number,
  relegated: boolean,
): AiClubFinancialPosture {
  if (relegated && financeBand <= 3) return "cut";
  if (financeBand <= 1) return performance < 0 ? "cut" : "cautious";
  if (financeBand === 2) return ambition === "promotion" ? "balanced" : "cautious";
  if (financeBand >= 4 && (ambition === "promotion" || ambition === "challenge")) return "spend";
  if (financeBand >= 3 && performance >= 1) return "spend";
  return financeBand >= 3 ? "balanced" : "cautious";
}

function squadCycleFor(
  meanAge: number | null,
  ambition: AiClubAmbition,
  performance: number,
  relegated: boolean,
): AiClubSquadCycle {
  if (relegated || performance <= -1.5) return "rebuild";
  if (meanAge !== null && meanAge >= 28.5) return "refresh";
  if (meanAge !== null && meanAge <= 24.5) return "develop";
  if (ambition === "promotion" && performance < 0.25) return "refresh";
  return "stable";
}

/**
 * Derived AI club direction. Nothing here is persisted: the strategy is a
 * readable consequence of the club's current football and economic position.
 */
export function aiClubStrategy(state: GameState, clubRef: string): AiClubStrategy {
  const clubId = canonicalClubReference(state, clubRef);
  const performance = aiClubPerformanceModifier(state, clubId);
  const prior = priorLeagueContext(state, clubId);
  const financeBand = financeBandFor(state, clubId);
  const meanAge = squadMeanAge(state, clubId);
  const ambition = ambitionFor(
    state,
    clubId,
    performance,
    prior.finish,
    prior.size,
    prior.promoted,
    prior.relegated,
  );
  const financialPosture = financialPostureFor(
    financeBand,
    ambition,
    performance,
    prior.relegated,
  );
  const squadCycle = squadCycleFor(meanAge, ambition, performance, prior.relegated);
  return {
    clubId,
    ambition,
    financialPosture,
    squadCycle,
    financeBand,
    performance,
    previousFinish: prior.finish,
    previousLeagueSize: prior.size,
    squadMeanAge: meanAge,
    promotedLastSeason: prior.promoted,
    relegatedLastSeason: prior.relegated,
  };
}

export function aiClubTargetSquadSize(strategy: AiClubStrategy): number {
  let target = 26;
  if (strategy.ambition === "promotion") target += 1;
  if (strategy.financialPosture === "spend") target += 1;
  if (strategy.financialPosture === "cut") target -= 2;
  if (strategy.squadCycle === "develop") target -= 1;
  return clamp(target, 23, 28);
}

export function aiClubRenewalChance(
  strategy: AiClubStrategy,
  player: FootballPlayer,
  age: number,
  wanted: boolean,
): number {
  let chance = wanted ? 0.82 : 0.42;
  if (strategy.financialPosture === "cut") chance -= wanted ? 0.12 : 0.2;
  if (strategy.financialPosture === "spend") chance += wanted ? 0.08 : -0.05;
  if (strategy.squadCycle === "rebuild") chance += age <= 25 ? 0.12 : -0.18;
  if (strategy.squadCycle === "refresh") chance += age <= 27 ? 0.08 : age >= 31 ? -0.15 : 0;
  if (strategy.squadCycle === "develop") chance += age <= 23 ? 0.14 : age >= 30 ? -0.1 : 0;
  if (strategy.ambition === "promotion" && wanted) chance += 0.06;
  return clamp(chance, 0.12, 0.96);
}

export function aiClubRecruitmentScore(
  strategy: AiClubStrategy,
  player: FootballPlayer,
  age: number,
): number {
  let score = player.currentAbility * 1.7 + player.potentialAbility * 0.45;
  if (strategy.ambition === "promotion") score += player.currentAbility * 0.35;
  if (strategy.ambition === "survival") score += player.currentAbility * 0.25;
  if (strategy.squadCycle === "develop") score += Math.max(0, 25 - age) * 2.8 + (player.potentialAbility - player.currentAbility) * 1.2;
  if (strategy.squadCycle === "rebuild") score += Math.max(0, 27 - age) * 2.1 + (player.potentialAbility - player.currentAbility) * 0.8;
  if (strategy.squadCycle === "refresh") score += Math.max(0, 28 - age) * 1.25;
  if (strategy.financialPosture === "cut") score -= player.wageExpectation / 250;
  if (strategy.financialPosture === "spend") score += player.reputation * 0.18;
  return score;
}

export function aiClubAttractionGap(strategy: AiClubStrategy): number {
  if (strategy.financialPosture === "spend" && strategy.ambition === "promotion") return 12;
  if (strategy.financialPosture === "spend") return 10;
  if (strategy.financialPosture === "cut") return 4;
  return 8;
}

export function aiClubBidInterestScore(
  state: GameState,
  clubRef: string,
  player: FootballPlayer,
): number {
  const strategy = aiClubStrategy(state, clubRef);
  const repGap = clubReputation(state, clubRef) - player.reputation;
  let score = repGap;
  if (strategy.ambition === "promotion") score += 5;
  else if (strategy.ambition === "challenge") score += 2;
  if (strategy.financialPosture === "spend") score += 5;
  if (strategy.financialPosture === "cut") score -= 7;
  if (strategy.squadCycle === "develop" && player.potentialAbility > player.currentAbility + 5) score += 4;
  return score;
}
