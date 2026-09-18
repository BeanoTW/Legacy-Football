/* Club-scoped league/fixture projections — extracted from engine.ts (Phase 0c).
 *
 * These build the *compatibility projections* the UI and legacy saves still
 * read (`GameState.fixtures`, `GameState.league`). The canonical sources are
 * `leagueSchedule` (world) and `matchRecords` (world); nothing here is
 * authoritative.
 */
import type { GameState, League, LeagueRow, ScheduledFixture } from "./types";
import { makeLeagues, makePyramidSchedule, scheduleForLeague } from "./pyramid";
import { leagueClubs, playerLeagueId } from "./league";

/** Default tier-1 membership for a club (new games / legacy helpers). */
export function leagueTeams(clubName: string): string[] {
  return makeLeagues(clubName)[0].clubIds;
}

/** Clubs in the user's division this season. */
export function userLeagueTeams(s: GameState): string[] {
  return leagueClubs(s, playerLeagueId(s));
}

/** Whole-pyramid schedule for a season. */
export function makeLeagueSchedule(leagues: League[], seed: string): ScheduledFixture[] {
  return makePyramidSchedule(leagues, seed);
}

/** User-club fixtures for a fresh tier-1 season (kept for legacy callers/tests). */
export function makeFixtures(clubName: string, seed: string) {
  const leagues = makeLeagues(clubName);
  return fixturesForClub(scheduleForLeague(leagues[0], seed), clubName);
}

/** The user's own fixture list, derived from the pyramid schedule so it can
 *  never drift from the division's real fixtures. */
export function fixturesForClub(
  schedule: ScheduledFixture[],
  club: string,
): { week: number; opponent: string; home: boolean; competition?: ScheduledFixture["competition"] }[] {
  return schedule
    .filter((f) => f.home === club || f.away === club)
    .map((f) => ({
      week: f.week,
      opponent: f.home === club ? f.away : f.home,
      home: f.home === club,
      competition: f.competition ?? "league",
    }))
    .sort((a, b) => a.week - b.week);
}

/** Empty table rows for a set of clubs. */
export function makeLeagueRows(teams: string[]): LeagueRow[] {
  return teams.map((team) => ({ team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
}
