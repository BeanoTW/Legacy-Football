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
import {
  buildWorldSimulationPlan,
  simulationLevelForClub,
  type WorldSimulationLevel,
} from "./world";

export const LEAGUE_ID = "league-1";
export const leagueOf = (f: { league?: string }) => f.league ?? LEAGUE_ID;

export function fixtureId(
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId: string = LEAGUE_ID,
): string {
  return `${leagueId}|s${season}|r${round}|${home}>${away}`;
}

export function matchSeed(
  saveSeed: string,
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId: string = LEAGUE_ID,
) {
  return `match|${saveSeed}|${leagueId}|s${season}|r${round}|${home}>${away}`;
}

export function clubStrength(s: GameState, season: number, club: string): number {
  return clubStrengthFor(s, club, season);
}

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
  return { homeGoals: goalsFrom(rng, hs, as), awayGoals: goalsFrom(rng, as, hs), seed };
}

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

/** Phase-2 fidelity gateway. Behaviour is intentionally identical while the boundary beds in. */
export function simulateAiFixtureAtLevel(
  s: GameState,
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId: string,
  level: WorldSimulationLevel,
): { homeGoals: number; awayGoals: number; seed: string } {
  if (level === "focus") return simulateAiFixture(s, season, round, home, away, leagueId);
  return simulateAiFixture(s, season, round, home, away, leagueId);
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

export function emptyRow(team: string): LeagueRow {
  return { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
}

export function buildTable(
  teams: string[],
  records: MatchRecord[],
  season: number,
  leagueId: string = LEAGUE_ID,
): LeagueRow[] {
  const rows = new Map<string, LeagueRow>(teams.map((t) => [t, emptyRow(t)]));
  for (const r of records) {
    if (r.season !== season || r.league !== leagueId) continue;
    const h = rows.get(r.home),
      a = rows.get(r.away);
    if (!h || !a) continue;
    h.p++;
    a.p++;
    h.gf += r.homeGoals;
    h.ga += r.awayGoals;
    a.gf += r.awayGoals;
    a.ga += r.homeGoals;
    if (r.outcome === "home") {
      h.w++;
      h.pts += 3;
      a.l++;
    } else if (r.outcome === "away") {
      a.w++;
      a.pts += 3;
      h.l++;
    } else {
      h.d++;
      a.d++;
      h.pts++;
      a.pts++;
    }
  }
  return teams.map((t) => rows.get(t)!);
}

export function sortTable(rows: LeagueRow[]): LeagueRow[] {
  return [...rows].sort(
    (a, b) =>
      b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team),
  );
}

export function hasFullSchedule(s: GameState): boolean {
  return Array.isArray(s.leagueSchedule) && s.leagueSchedule.length > 0;
}

export function scheduleForWeek(s: GameState, week: number, leagueId?: string): ScheduledFixture[] {
  return (s.leagueSchedule ?? []).filter(
    (f) => f.week === week && (leagueId === undefined || leagueOf(f) === leagueId),
  );
}

export const playerLeagueId = (s: GameState) => s.playerLeagueId ?? LEAGUE_ID;

export function leagueClubs(s: GameState, leagueId: string): string[] {
  const lg = (s.leagues ?? []).find((l) => l.id === leagueId);
  if (lg) return lg.clubIds;
  return s.league.map((r) => r.team);
}

export function isCompleted(
  s: GameState,
  season: number,
  round: number,
  home: string,
  away: string,
  leagueId?: string,
) {
  const id = fixtureId(season, round, home, away, leagueId ?? LEAGUE_ID);
  return (s.matchRecords ?? []).some((r) => r.id === id);
}

export function resolveWeek(s: GameState, week: number, userRecord?: MatchRecord): void {
  if (!hasFullSchedule(s)) return;
  s.matchRecords ??= [];
  const worldPlan = buildWorldSimulationPlan(s);
  for (const f of scheduleForWeek(s, week)) {
    const lid = leagueOf(f);
    const id = fixtureId(s.season, f.round, f.home, f.away, lid);
    if (s.matchRecords.some((r) => r.id === id)) continue;
    const isUser = f.home === s.clubName || f.away === s.clubName;
    if (isUser) {
      if (userRecord && userRecord.id === id) s.matchRecords.push(userRecord);
      continue;
    }
    const level: WorldSimulationLevel =
      simulationLevelForClub(worldPlan, f.home) === "focus" ||
      simulationLevelForClub(worldPlan, f.away) === "focus"
        ? "focus"
        : "fringe";
    const sim = simulateAiFixtureAtLevel(s, s.season, f.round, f.home, f.away, lid, level);
    s.matchRecords.push(
      makeRecord({
        leagueId: lid,
        season: s.season,
        week: f.week,
        round: f.round,
        home: f.home,
        away: f.away,
        homeGoals: sim.homeGoals,
        awayGoals: sim.awayGoals,
        seed: sim.seed,
        userInvolved: false,
      }),
    );
  }
}

export function resolveRemainingSeason(s: GameState): void {
  if (!hasFullSchedule(s)) return;
  const weeks = [...new Set(s.leagueSchedule.map((f) => f.week))].sort((a, b) => a - b);
  for (const w of weeks) resolveWeek(s, w);
}

export function seasonFixtureCount(s: GameState): number {
  return (s.leagueSchedule ?? []).length;
}

export function seasonCompletedCount(s: GameState): number {
  const ids = new Set(
    (s.leagueSchedule ?? []).map((f) => fixtureId(s.season, f.round, f.home, f.away, leagueOf(f))),
  );
  return (s.matchRecords ?? []).filter((r) => r.season === s.season && ids.has(r.id)).length;
}

export function isLeagueSeasonComplete(s: GameState, leagueId: string): boolean {
  const fixtures = (s.leagueSchedule ?? []).filter((f) => leagueOf(f) === leagueId);
  if (fixtures.length === 0) return false;
  const done = new Set(
    (s.matchRecords ?? [])
      .filter((r) => r.season === s.season && r.league === leagueId)
      .map((r) => r.id),
  );
  return fixtures.every((f) => done.has(fixtureId(s.season, f.round, f.home, f.away, leagueId)));
}

export function isSeasonComplete(s: GameState): boolean {
  if (!hasFullSchedule(s)) return s.week > 46;
  return seasonCompletedCount(s) >= seasonFixtureCount(s);
}

/** Build any division's live table, sorted. */
export function tableFor(s: GameState, leagueId: string): LeagueRow[] {
  return sortTable(buildTable(leagueClubs(s, leagueId), s.matchRecords ?? [], s.season, leagueId));
}

/** Backward-compatible descriptive alias for domain callers. */
export const tableForLeague = tableFor;

export function syncTable(s: GameState): void {
  if (!hasFullSchedule(s)) return;
  const lid = playerLeagueId(s);
  s.league = buildTable(leagueClubs(s, lid), s.matchRecords ?? [], s.season, lid);
}

export interface FixtureView {
  league: string;
  round: number;
  week: number;
  home: string;
  away: string;
  record?: MatchRecord;
}

export function leagueFixtures(s: GameState, leagueId: string, season = s.season): FixtureView[] {
  const records = (s.matchRecords ?? []).filter(
    (r) => r.season === season && r.league === leagueId,
  );
  if (season !== s.season) {
    return records
      .map((r) => ({
        league: leagueId,
        round: r.round,
        week: r.week,
        home: r.home,
        away: r.away,
        record: r,
      }))
      .sort((a, b) => a.round - b.round || a.home.localeCompare(b.home));
  }
  const byId = new Map(records.map((r) => [r.id, r]));
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

export function historicalTable(
  s: GameState,
  season: number,
  leagueId: string,
): LeagueRow[] | null {
  const h = (s.seasonHistory ?? []).find((e) => e.season === season && e.leagueId === leagueId);
  return h ? h.finalTable : null;
}

export function completedSeasons(s: GameState): number[] {
  return [...new Set((s.seasonHistory ?? []).map((e) => e.season))].sort((a, b) => b - a);
}
