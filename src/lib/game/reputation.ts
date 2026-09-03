/* =========================================================================
   Club identity: reputation, strength, predictions, expectations
   -------------------------------------------------------------------------
   Rules of this module:

     * Reputation is the ONLY persisted identity value. It is slow-moving,
       never reset between seasons, and can only change at season rollover.
     * Strength is DERIVED, never stored on the state. It is a pure function
       of (reputation, tier, previous finish, promotion/relegation, seed).
     * Predictions and expectations are derived from strength and stored only
       because future systems (board, media, fans) must be able to read the
       projection that was made BEFORE the season was played.
     * Never uncontrolled randomness: every varying value is seeded from saveSeed.

   Import discipline: this module stays below ./league and ./pyramid. Club
   identity is safe here because it depends only on types, clubs and RNG and
   lets name→opaque-ID migration preserve deterministic reputation/strength.
========================================================================= */

import type {
  GameState,
  League,
  LeagueRow,
  ClubPrediction,
  ExpectationLevel,
  SeasonPrediction,
  ClubSeasonSnapshot,
  ClubRecord,
} from "./types";
import { clubSimulationSeedKey } from "./clubIdentity";
import { mulberry32, hashString } from "./rng";

export const REP_MIN = 0;
export const REP_MAX = 100;

/** Hard cap on how far a single season may move a club's reputation. */
export const MAX_REP_CHANGE_PER_SEASON = 8;

/** Reputation a club starts with when nothing is known about it. */
const TIER_BASE_REP: Record<number, [number, number]> = {
  1: [54, 84],
  2: [30, 62],
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------- Lookups (no ./pyramid import — avoids a cycle) ---------- */

export function leagueOfClubIn(leagues: League[] | undefined, club: string): League | undefined {
  return (leagues ?? []).find((l) => l.clubIds.includes(club));
}

export function tierOfClub(s: GameState, club: string): number {
  return leagueOfClubIn(s.leagues, club)?.tier ?? 1;
}

/* ---------- Reputation ---------- */

/** Deterministic starting reputation for a club in a given seed identity. */
export function baseReputation(saveSeed: string, clubSeedKey: string, tier: number): number {
  const [lo, hi] = TIER_BASE_REP[tier] ?? TIER_BASE_REP[2];
  const rng = mulberry32(hashString(`rep0|${saveSeed}|${clubSeedKey}`));
  return Math.round((lo + rng() * (hi - lo)) * 10) / 10;
}

/** Starting reputation map for a whole legacy-name pyramid. */
export function initClubReputations(leagues: League[], saveSeed: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of leagues) for (const c of l.clubIds) out[c] = baseReputation(saveSeed, c, l.tier);
  return out;
}

/** Persisted reputation, falling back to the deterministic immutable seed identity. */
export function clubReputation(s: GameState, club: string): number {
  const stored = s.clubReputations?.[club];
  if (typeof stored === "number" && Number.isFinite(stored)) return clamp(stored, REP_MIN, REP_MAX);
  return baseReputation(s.saveSeed, clubSimulationSeedKey(s, club), tierOfClub(s, club));
}

export function setClubReputation(s: GameState, club: string, value: number): void {
  s.clubReputations ??= {};
  s.clubReputations[club] = Math.round(clamp(value, REP_MIN, REP_MAX) * 10) / 10;
}

/* ---------- Strength ---------- */

const record = (s: GameState, club: string): ClubRecord | undefined => s.clubRecords?.[club];

/** Finishing position in the given season, if it has been played. */
export function finishIn(
  s: GameState,
  club: string,
  season: number,
): { position: number; leagueId: string } | null {
  const h = record(s, club)?.leagueHistory.find((e) => e.season === season);
  return h ? { position: h.position, leagueId: h.leagueId } : null;
}

export interface StrengthParts {
  base: number;
  tier: number;
  form: number;
  movement: number;
  variation: number;
  total: number;
}

/**
 * Seasonal strength of any club. Deterministic and derived — never stored.
 *
 *   base       reputation mapped onto the playing scale
 *   tier       top-flight clubs are stronger on average, but this is a bonus,
 *              not a floor/ceiling, so a strong Division Two club can and does
 *              out-rate a weak Division One club
 *   form       last season's finishing position
 *   movement   promoted clubs adapt downwards, relegated clubs keep some class
 *   variation  small seeded seasonal drift
 */
export function strengthParts(s: GameState, club: string, season: number): StrengthParts {
  const rep = clubReputation(s, club);
  const tier = tierOfClub(s, club);

  const base = 28 + rep * 0.52; // 28 - 80
  const tierBonus = tier === 1 ? 5 : 0;

  const prev = finishIn(s, club, season - 1);
  let form = 0;
  let movement = 0;
  if (prev) {
    const size = (s.leagues ?? []).find((l) => l.id === prev.leagueId)?.clubIds.length ?? 20;
    const mid = (size + 1) / 2;
    form = clamp(((mid - prev.position) / mid) * 4, -4, 4);
    const prevTier = (s.leagues ?? []).find((l) => l.id === prev.leagueId)?.tier;
    const nowLeague = leagueOfClubIn(s.leagues, club);
    if (prev.leagueId !== nowLeague?.id && prevTier !== undefined && nowLeague) {
      // promoted: still adjusting to the level. relegated: retains class.
      movement = nowLeague.tier < prevTier ? -3.5 : 3.5;
    }
  }

  const clubSeed = clubSimulationSeedKey(s, club);
  const rng = mulberry32(hashString(`strength|${s.saveSeed}|${clubSeed}|s${season}`));
  const variation = (rng() - 0.5) * 8; // ±4

  const total = clamp(base + tierBonus + form + movement + variation, 25, 95);
  return { base, tier: tierBonus, form, movement, variation, total: Math.round(total * 100) / 100 };
}

export function clubStrengthFor(s: GameState, club: string, season: number): number {
  return strengthParts(s, club, season).total;
}

/* ---------- Predictions & expectations ---------- */

export function expectationFor(rank: number, league: League): ExpectationLevel {
  const size = league.clubIds.length || 20;
  const releg = league.relegationPlaces;
  if (league.tier === 1) {
    if (rank <= 2) return "winLeague";
    if (releg > 0 && rank > size - releg) return "survival";
    if (releg > 0 && rank > size - (releg + 3)) return "avoidRelegation";
    if (rank <= size / 2) return "topHalf";
    return "midTable";
  }
  if (rank <= Math.max(league.promotionPlaces, 3)) return "promotion";
  if (releg > 0 && rank > size - releg) return "survival";
  if (rank <= size / 2) return "topHalf";
  return "midTable";
}

export const EXPECTATION_LABEL: Record<ExpectationLevel, string> = {
  winLeague: "Win the league",
  promotion: "Fight for promotion",
  topHalf: "Top half finish",
  midTable: "Mid-table consolidation",
  avoidRelegation: "Avoid relegation",
  survival: "Survival",
};

/** Pre-season projection for one division. Pure. */
export function predictLeague(s: GameState, league: League, season: number): SeasonPrediction {
  const clubs: ClubPrediction[] = league.clubIds
    .map((club) => ({
      club,
      strength: clubStrengthFor(s, club, season),
      rank: 0,
      expectation: "midTable" as ExpectationLevel,
    }))
    .sort((a, b) => b.strength - a.strength || a.club.localeCompare(b.club))
    .map((c, i) => ({ ...c, rank: i + 1, expectation: expectationFor(i + 1, league) }));

  const size = clubs.length;
  const promoCount = Math.max(league.promotionPlaces, league.tier === 1 ? 0 : 2);
  return {
    season,
    leagueId: league.id,
    predictedChampion: clubs[0]?.club ?? "",
    promotionFavourites: clubs.slice(0, promoCount || 0).map((c) => c.club),
    relegationFavourites:
      league.relegationPlaces > 0
        ? clubs.slice(size - Math.max(league.relegationPlaces, 3)).map((c) => c.club)
        : [],
    clubs,
  };
}

/** Build (or rebuild) predictions for every division in a season. */
export function predictSeason(s: GameState, season: number): SeasonPrediction[] {
  return (s.leagues ?? []).map((l) => predictLeague(s, l, season));
}

/**
 * Store the live season's pre-season projection. Older projection matrices are
 * redundant once season rollover has written per-club immutable snapshots, so
 * they must not accumulate in the hot save for decades.
 */
export function storePredictions(s: GameState, season: number): SeasonPrediction[] {
  const fresh = predictSeason(s, season);
  s.seasonPredictions = fresh;
  return fresh;
}

export function predictionFor(
  s: GameState,
  season: number,
  leagueId: string,
): SeasonPrediction | undefined {
  return (s.seasonPredictions ?? []).find((p) => p.season === season && p.leagueId === leagueId);
}

/** A club's own projection this season (falls back to a live calculation). */
export function clubPrediction(
  s: GameState,
  club: string,
  season: number,
): ClubPrediction | undefined {
  const lg = leagueOfClubIn(s.leagues, club);
  if (!lg) return undefined;
  const stored = predictionFor(s, season, lg.id);
  return (stored ?? predictLeague(s, lg, season)).clubs.find((c) => c.club === club);
}

/* ---------- Season rollover: reputation movement + snapshots ---------- */

export interface RolloverLeagueResult {
  leagueId: string;
  tier: number;
  table: LeagueRow[];
  champion: string;
  runnerUp: string | null;
  promoted: string[];
  relegated: string[];
}

export interface ReputationChange {
  club: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * Reputation movement for one club. Gradual by construction and hard-capped
 * at ±MAX_REP_CHANGE_PER_SEASON.
 */
export function reputationDelta(args: {
  actualFinish: number;
  expectedFinish: number;
  size: number;
  champion: boolean;
  runnerUp: boolean;
  promoted: boolean;
  relegated: boolean;
  streak: number; // +n consecutive overachieving seasons, -n underachieving
}): number {
  const diff = args.expectedFinish - args.actualFinish; // >0 = overachieved
  let d = clamp(diff * 0.25, -4, 4);
  if (args.champion) d += 3;
  else if (args.runnerUp) d += 1.2;
  if (args.promoted) d += 4;
  if (args.relegated) d -= 6;
  if (args.streak >= 2) d += 1;
  else if (args.streak <= -2) d -= 1;
  return clamp(Math.round(d * 10) / 10, -MAX_REP_CHANGE_PER_SEASON, MAX_REP_CHANGE_PER_SEASON);
}

/** Overachievement streak from the immutable snapshot history. */
function streakFor(s: GameState, club: string, season: number): number {
  const past = (s.clubSnapshots ?? [])
    .filter((x) => x.club === club && x.season < season)
    .sort((a, b) => b.season - a.season)
    .slice(0, 3);
  let up = 0,
    down = 0;
  for (const p of past) {
    if (p.actualFinish < p.expectedFinish) {
      if (down) break;
      up++;
    } else if (p.actualFinish > p.expectedFinish) {
      if (up) break;
      down++;
    } else break;
  }
  return up ? up : -down;
}

/**
 * Apply the season's reputation movement and append immutable snapshots.
 * Called once, inside the guarded rollover transaction, BEFORE membership
 * changes are applied (positions come from the finalised tables).
 */
export function applySeasonIdentity(
  s: GameState,
  season: number,
  results: RolloverLeagueResult[],
): { changes: ReputationChange[]; snapshots: ClubSeasonSnapshot[] } {
  const changes: ReputationChange[] = [];
  const snapshots: ClubSeasonSnapshot[] = [];
  const already = new Set(
    (s.clubSnapshots ?? []).filter((x) => x.season === season).map((x) => x.club),
  );

  for (const r of results) {
    const league = (s.leagues ?? []).find((l) => l.id === r.leagueId);
    const size = r.table.length || 20;
    const pred =
      predictionFor(s, season, r.leagueId) ??
      (league ? predictLeague(s, league, season) : undefined);

    r.table.forEach((row, idx) => {
      const club = row.team;
      if (already.has(club)) return;
      const actualFinish = idx + 1;
      const p = pred?.clubs.find((c) => c.club === club);
      const expectedFinish = p?.rank ?? Math.ceil(size / 2);
      const before = clubReputation(s, club);
      const delta = reputationDelta({
        actualFinish,
        expectedFinish,
        size,
        champion: r.champion === club,
        runnerUp: r.runnerUp === club,
        promoted: r.promoted.includes(club),
        relegated: r.relegated.includes(club),
        streak: streakFor(s, club, season),
      });
      const after = clamp(Math.round((before + delta) * 10) / 10, REP_MIN, REP_MAX);
      setClubReputation(s, club, after);
      changes.push({ club, before, after, delta: Math.round((after - before) * 10) / 10 });
      snapshots.push({
        season,
        club,
        leagueId: r.leagueId,
        tier: r.tier,
        reputation: before,
        strength: p?.strength ?? clubStrengthFor(s, club, season),
        expectedFinish,
        expectation: p?.expectation ?? "midTable",
        actualFinish,
        reputationAfter: after,
      });
    });
  }

  // Append-only: previous seasons are never rewritten.
  s.clubSnapshots = [...(s.clubSnapshots ?? []), ...snapshots];
  return { changes, snapshots };
}
