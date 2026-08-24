import type { GameState } from "../types";
import type { Migration } from "./types";
import { expandExistingLeagues, WORLD_DIVISIONS } from "../worldPyramid";
import { emptyClubRecord, initClubReputations, scheduleForLeague } from "../pyramid";
import { leagueOf, resolveWeek } from "../league";
import { ensureFringeWorldState } from "../fringe";
import { ensureRecruitment } from "../recruitment";

/**
 * v12 predates the persistent four-division world. Some v12 saves were created
 * after the world builder landed and already contain all four divisions; older
 * v12 saves contain only the original two. The schema bump makes that shape
 * distinction explicit and guarantees every v13 save has one world contract.
 *
 * Existing memberships and existing fixtures are never replaced. If the save
 * already has a full-simulation schedule, only newly introduced/missing league
 * schedules are appended deterministically and their elapsed AI fixtures are
 * caught up. A legacy user-only season with no league schedule stays untouched
 * and the complete world begins at its next rollover.
 */
export const V12_TO_V13: Migration = {
  from: 12,
  to: 13,
  describe: "Scalable four-division world contract",
  up(p, ctx) {
    const s = p as unknown as GameState;
    const beforeLeagueIds = new Set((s.leagues ?? []).map((league) => league.id));
    const alreadyExpanded = WORLD_DIVISIONS.every((def) => beforeLeagueIds.has(def.id));

    s.leagues = expandExistingLeagues(s.leagues ?? [], s.clubName);
    s.clubRecords ??= {};
    for (const league of s.leagues) {
      for (const clubId of league.clubIds) {
        s.clubRecords[clubId] ??= emptyClubRecord(clubId, league.id);
      }
    }

    s.clubReputations ??= {};
    const seeded = initClubReputations(s.leagues, s.saveSeed);
    for (const [clubId, reputation] of Object.entries(seeded)) {
      if (typeof s.clubReputations[clubId] !== "number") {
        s.clubReputations[clubId] = reputation;
      }
    }

    // Build the lightweight outer layer first. Recruitment then hydrates only
    // newly relevant Focus clubs, never every club in the expanded world.
    ensureFringeWorldState(s);
    ensureRecruitment(s);

    // Once a save has opted into full league simulation, every persistent
    // division needs a schedule or season rollover would wait forever for a
    // league that has no fixtures. Preserve all existing rows and append only
    // missing league schedules using the exact canonical season seed.
    if ((s.leagueSchedule ?? []).length > 0) {
      const scheduled = new Set(s.leagueSchedule.map(leagueOf));
      const missing = s.leagues.filter((league) => !scheduled.has(league.id));
      for (const league of missing) {
        s.leagueSchedule.push(...scheduleForLeague(league, `${s.saveSeed}|season${s.season}`));
      }

      // Give newly introduced leagues a coherent current table immediately.
      // resolveWeek is deterministic/idempotent, skips an unresolved user
      // fixture, and leaves every existing completed record untouched.
      const elapsedWeeks = [...new Set(s.leagueSchedule.map((fixture) => fixture.week))]
        .filter((week) => week < s.week)
        .sort((a, b) => a - b);
      for (const week of elapsedWeeks) resolveWeek(s, week);
    }

    if (!alreadyExpanded) {
      const added = s.leagues.filter((league) => !beforeLeagueIds.has(league.id));
      ctx.warn(
        "world/expanded",
        `added ${added.length} lower divisions (${added.flatMap((league) => league.clubIds).length} clubs)`,
      );
    }
  },
};

export const WORLD_MIGRATIONS: Migration[] = [V12_TO_V13];
