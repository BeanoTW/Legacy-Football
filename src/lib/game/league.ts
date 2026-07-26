/* =========================================================================
   League simulation foundation
   -------------------------------------------------------------------------
   Every scheduled league fixture — user and AI — is resolved exactly once
   and stored as an immutable MatchRecord. The league table is a pure
   projection of those records, never an independently mutated accumulator.

   All randomness is seeded from (saveSeed, season, round, home, away) via
   ./rng — never unseeded randomness or wall-clock time.
========================================================================= */

import type { GameState, LeagueRow, MatchRecord } from "./types";
import { mulberry32, hashString } from "./rng";

export const LEAGUE_ID = "league-1";

/** Stable identity for a fixture. A fixture is Scheduled until a record with
 *  this id exists, and Completed forever after. */
export function fixtureId(season: number, round: number, home: string, away: string): string {
  return `${LEAGUE_ID}|s${season}|r${round}|${home}>${away}`;
}

/** Deterministic seed string for one match simulation. */
export function matchSeed(saveSeed: string, season: number, round: number, home: string, away: string) {
  return `match|${saveSeed}|s${season}|r${round}|${home}>${away}`;
}

/**
 * Club strength for an AI club. Pure function of (saveSeed, club, season):
 * no hidden state, reproducible after any reload, drifts a little per season.
 */
export function clubStrength(saveSeed: string, season: number, club: string): number {
  const rng = mulberry32(hashString(`strength|${saveSeed}|${club}|s${season}`));
  return 48 + rng() * 26; // 48 - 74
}

/** Seeded Poisson-ish goal draw — mirrors the existing simGoals shape exactly. */
function goalsFrom(rng: () => number, strength: number, oppStrength: number): number {
  const lambda = Math.max(0.2, 1.3 + (strength - oppStrength) / 20);
  let g = 0;
  let p = Math.exp(-lambda);
  let cum = p;
  const r = rng();
  let k = 0;
  while (r > cum && k < 8) {
    k++;
    p = (p * lambda) / k;
    cum += p;
    g = k;
  }
  return g;
}

export const HOME_ADVANTAGE = 3;

/** Deterministic AI vs AI scoreline. */
export function simulateAiFixture(
  saveSeed: string,
  season: number,
  round: number,
  home: string,
  away: string,
): { homeGoals: number; awayGoals: number; seed: string } {
  const seed = matchSeed(saveSeed, season, round, home, away);
  const rng = mulberry32(hashString(seed));
  const hs = clubStrength(saveSeed, season, home) + HOME_ADVANTAGE;
  const as = clubStrength(saveSeed, season, away);
  return {
    homeGoals: goalsFrom(rng, hs, as),
    awayGoals: goalsFrom(rng, as, hs),
    seed,
  };
}

export function outcomeOf(homeGoals: number, awayGoals: number): MatchRecord["outcome"] {
  return homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
}

export function makeRecord(args: {
  season: number;
  week: number;
  round: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  seed?: string;
  userInvolved: boolean;
}): MatchRecord {
  return {
    id: fixtureId(args.season, args.round, args.home, args.away),
    league: LEAGUE_ID,
    season: args.season,
    week: args.week,
    round: args.round,
    home: args.home,
    away: args.away,
    homeGoals: args.homeGoals,
    awayGoals: args.awayGoals,
    outcome: outcomeOf(args.homeGoals, args.awayGoals),
    seed: args.seed,
    userInvolved: args.userInvolved,
  };
}

/* ---------- Standings projection ---------- */

export function emptyRow(team: string): LeagueRow {
  return { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
}

/** Rebuild the entire table from stored records. Pure projection. */
export function buildTable(teams: string[], records: MatchRecord[], season: number): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(teams.map((t) => [t, emptyRow(t)]));
  for (const r of records) {
    if (r.season !== season || r.league !== LEAGUE_ID) continue;
    const h = rows.get(r.home);
    const a = rows.get(r.away);
    if (!h || !a) continue;
    h.p++; a.p++;
    h.gf += r.homeGoals; h.ga += r.awayGoals;
    a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.outcome === "home") { h.w++; h.pts += 3; a.l++; }
    else if (r.outcome === "away") { a.w++; a.pts += 3; h.l++; }
    else { h.d++; a.d++; h.pts++; a.pts++; }
  }
  return teams.map((t) => rows.get(t)!);
}

export function sortTable(rows: LeagueRow[]): LeagueRow[] {
  return [...rows].sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team),
  );
}

/* ---------- Round resolution ---------- */

/** True when this save has a full league schedule (v3+ games). Legacy v2
 *  in-progress seasons have an empty schedule and keep user-only behaviour. */
export function hasFullSchedule(s: GameState): boolean {
  return Array.isArray(s.leagueSchedule) && s.leagueSchedule.length > 0;
}

export function scheduleForWeek(s: GameState, week: number) {
  return (s.leagueSchedule ?? []).filter((f) => f.week === week);
}

export function isCompleted(s: GameState, season: number, round: number, home: string, away: string) {
  const id = fixtureId(season, round, home, away);
  return (s.matchRecords ?? []).some((r) => r.id === id);
}

/**
 * Resolve every unresolved fixture in the given week.
 * `userRecord` is the already-played user result for that week (if any);
 * it is inserted rather than simulated. Mutates `s` in place.
 * Idempotent: fixtures that already have a record are skipped.
 */
export function resolveWeek(s: GameState, week: number, userRecord?: MatchRecord): void {
  if (!hasFullSchedule(s)) return;
  s.matchRecords ??= [];
  for (const f of scheduleForWeek(s, week)) {
    const id = fixtureId(s.season, f.round, f.home, f.away);
    if (s.matchRecords.some((r) => r.id === id)) continue;
    const isUser = f.home === s.clubName || f.away === s.clubName;
    if (isUser) {
      if (userRecord && userRecord.id === id) s.matchRecords.push(userRecord);
      continue; // user fixture without a result stays Scheduled
    }
    const sim = simulateAiFixture(s.saveSeed, s.season, f.round, f.home, f.away);
    s.matchRecords.push(
      makeRecord({
        season: s.season, week: f.week, round: f.round,
        home: f.home, away: f.away,
        homeGoals: sim.homeGoals, awayGoals: sim.awayGoals,
        seed: sim.seed, userInvolved: false,
      }),
    );
  }
}

/** Resolve every outstanding fixture of the season (used at season end). */
export function resolveRemainingSeason(s: GameState): void {
  if (!hasFullSchedule(s)) return;
  const weeks = [...new Set(s.leagueSchedule.map((f) => f.week))].sort((a, b) => a - b);
  for (const w of weeks) resolveWeek(s, w);
}

export function seasonFixtureCount(s: GameState): number {
  return (s.leagueSchedule ?? []).length;
}

export function seasonCompletedCount(s: GameState): number {
  return (s.matchRecords ?? []).filter((r) => r.season === s.season && r.league === LEAGUE_ID).length;
}

/** A season is complete only when every scheduled fixture has a record. */
export function isSeasonComplete(s: GameState): boolean {
  if (!hasFullSchedule(s)) return s.week > 46; // legacy saves: week-based fallback
  return seasonCompletedCount(s) >= seasonFixtureCount(s);
}

/** Refresh s.league from stored records (no-op for legacy schedule-less saves). */
export function syncTable(s: GameState): void {
  if (!hasFullSchedule(s)) return;
  const teams = s.league.map((r) => r.team);
  s.league = buildTable(teams, s.matchRecords ?? [], s.season);
}
