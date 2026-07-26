/* =========================================================================
   League simulation foundation
   -------------------------------------------------------------------------
   Every scheduled league fixture — user and AI — is resolved exactly once
   and stored as an immutable MatchRecord. The league table is a pure
   projection of those records, never an independently mutated accumulator.

   All randomness is seeded from (saveSeed, season, round, home, away) via
   ./rng — never unseeded randomness or wall-clock time.
========================================================================= */

import type { GameState, LeagueRow, MatchRecord, ScheduledFixture } from "./types";
import { mulberry32, hashString } from "./rng";
import { clubStrengthFor } from "./reputation";

/** Tier-1 division id. Also the id every pre-v4 record/fixture belongs to. */
export const LEAGUE_ID = "league-1";

/** League a fixture belongs to (pre-v4 fixtures have no league field). */
export const leagueOf = (f: { league?: string }) => f.league ?? LEAGUE_ID;

/** Stable identity for a fixture. A fixture is Scheduled until a record with
 *  this id exists, and Completed forever after. */
export function fixtureId(
  season: number, round: number, home: string, away: string, leagueId: string = LEAGUE_ID,
): string {
  return `${leagueId}|s${season}|r${round}|${home}>${away}`;
}

/** Deterministic seed string for one match simulation. */
export function matchSeed(
  saveSeed: string, season: number, round: number, home: string, away: string,
  leagueId: string = LEAGUE_ID,
) {
  return `match|${saveSeed}|${leagueId}|s${season}|r${round}|${home}>${away}`;
}

/**
 * Club strength for any club in a season. Delegates to the club-identity
 * model (reputation + tier + last season + seeded drift) so promoted and
 * relegated sides carry their history with them instead of being re-rolled.
 */
export function clubStrength(s: GameState, season: number, club: string): number {
  return clubStrengthFor(s, club, season);
}

/** Seeded Poisson-ish goal draw — mirrors the existing simGoals shape exactly. */
export function goalsFrom(rng: () => number, strength: number, oppStrength: number): number {
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

/**
 * Deterministic scoreline for any fixture.
 * `override` lets the caller substitute a known strength (the user's squad
 * rating) while keeping the exact same seeded engine as AI fixtures.
 */
export function simulateFixture(
  s: GameState,
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId: string = LEAGUE_ID,
  override?: { homeStrength?: number; awayStrength?: number },
): { homeGoals: number; awayGoals: number; seed: string } {
  const seed = matchSeed(s.saveSeed, season, round, home, away, leagueId);
  const rng = mulberry32(hashString(seed));
  const hs = (override?.homeStrength ?? clubStrength(s, season, home)) + HOME_ADVANTAGE;
  const as = override?.awayStrength ?? clubStrength(s, season, away);
  return {
    homeGoals: goalsFrom(rng, hs, as),
    awayGoals: goalsFrom(rng, as, hs),
    seed,
  };
}

/** Deterministic AI vs AI scoreline. */
export function simulateAiFixture(
  s: GameState,
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId: string = LEAGUE_ID,
): { homeGoals: number; awayGoals: number; seed: string } {
  return simulateFixture(s, season, round, home, away, leagueId);
}

export function outcomeOf(homeGoals: number, awayGoals: number): MatchRecord["outcome"] {
  return homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
}

export function makeRecord(args: {
  leagueId?: string;
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
  const leagueId = args.leagueId ?? LEAGUE_ID;
  return {
    id: fixtureId(args.season, args.round, args.home, args.away, leagueId),
    league: leagueId,
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

/** Rebuild one division's table from stored records. Pure projection. */
export function buildTable(
  teams: string[], records: MatchRecord[], season: number, leagueId: string = LEAGUE_ID,
): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(teams.map((t) => [t, emptyRow(t)]));
  for (const r of records) {
    if (r.season !== season || r.league !== leagueId) continue;
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

export function scheduleForWeek(s: GameState, week: number, leagueId?: string): ScheduledFixture[] {
  return (s.leagueSchedule ?? []).filter(
    (f) => f.week === week && (leagueId === undefined || leagueOf(f) === leagueId),
  );
}

/** The user's division id (falls back to the tier-1 id on pre-v4 saves). */
export const playerLeagueId = (s: GameState) => s.playerLeagueId ?? LEAGUE_ID;

/** Clubs contesting a division this season. */
export function leagueClubs(s: GameState, leagueId: string): string[] {
  const lg = (s.leagues ?? []).find((l) => l.id === leagueId);
  if (lg) return lg.clubIds;
  return s.league.map((r) => r.team); // pre-v4 save: single division
}

export function isCompleted(
  s: GameState, season: number, round: number, home: string, away: string, leagueId?: string,
) {
  const id = fixtureId(season, round, home, away, leagueId ?? LEAGUE_ID);
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
    const lid = leagueOf(f);
    const id = fixtureId(s.season, f.round, f.home, f.away, lid);
    if (s.matchRecords.some((r) => r.id === id)) continue;
    const isUser = f.home === s.clubName || f.away === s.clubName;
    if (isUser) {
      if (userRecord && userRecord.id === id) s.matchRecords.push(userRecord);
      continue; // user fixture without a result stays Scheduled
    }
    const sim = simulateAiFixture(s, s.season, f.round, f.home, f.away, lid);
    s.matchRecords.push(
      makeRecord({
        leagueId: lid,
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
  const ids = new Set((s.leagueSchedule ?? []).map((f) => fixtureId(s.season, f.round, f.home, f.away, leagueOf(f))));
  return (s.matchRecords ?? []).filter((r) => r.season === s.season && ids.has(r.id)).length;
}

/** Per-division completion — used by the rollover transaction. */
export function isLeagueSeasonComplete(s: GameState, leagueId: string): boolean {
  const fixtures = (s.leagueSchedule ?? []).filter((f) => leagueOf(f) === leagueId);
  if (fixtures.length === 0) return false;
  const done = new Set((s.matchRecords ?? []).filter((r) => r.season === s.season && r.league === leagueId).map((r) => r.id));
  return fixtures.every((f) => done.has(fixtureId(s.season, f.round, f.home, f.away, leagueId)));
}

/** A season is complete only when every scheduled fixture has a record. */
export function isSeasonComplete(s: GameState): boolean {
  if (!hasFullSchedule(s)) return s.week > 46; // legacy saves: week-based fallback
  return seasonCompletedCount(s) >= seasonFixtureCount(s);
}

/** Build any division's live table, sorted. */
export function tableFor(s: GameState, leagueId: string): LeagueRow[] {
  return sortTable(buildTable(leagueClubs(s, leagueId), s.matchRecords ?? [], s.season, leagueId));
}

/** Refresh s.league (the user's division) from stored records.
 *  No-op for legacy schedule-less saves. */
export function syncTable(s: GameState): void {
  if (!hasFullSchedule(s)) return;
  const lid = playerLeagueId(s);
  const teams = leagueClubs(s, lid);
  s.league = buildTable(teams, s.matchRecords ?? [], s.season, lid);
}

/* ---------- Read-only selectors (league browser) ----------
   The browser UI must read directly from this state; it never keeps its own
   copy of a table or fixture list. Every selector below is a pure read. */

export interface FixtureView {
  league: string;
  round: number;
  week: number;
  home: string;
  away: string;
  /** Present once the fixture has been played. */
  record?: MatchRecord;
}

/** Every fixture of a division this season, in round order, with results. */
export function leagueFixtures(s: GameState, leagueId: string, season = s.season): FixtureView[] {
  const byId = new Map((s.matchRecords ?? []).filter((r) => r.season === season).map((r) => [r.id, r]));
  return (s.leagueSchedule ?? [])
    .filter((f) => leagueOf(f) === leagueId)
    .map((f) => ({
      league: leagueId,
      round: f.round,
      week: f.week,
      home: f.home,
      away: f.away,
      record: byId.get(fixtureId(season, f.round, f.home, f.away, leagueId)),
    }))
    .sort((a, b) => a.round - b.round || a.home.localeCompare(b.home));
}

/** Final table of a completed season, straight from immutable history. */
export function historicalTable(s: GameState, season: number, leagueId: string): LeagueRow[] | null {
  const h = (s.seasonHistory ?? []).find((e) => e.season === season && e.leagueId === leagueId);
  return h ? h.finalTable : null;
}

/** Seasons that have a stored final table, newest first. */
export function completedSeasons(s: GameState): number[] {
  return [...new Set((s.seasonHistory ?? []).map((e) => e.season))].sort((a, b) => b - a);
}
