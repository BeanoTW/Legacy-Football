/* Season rollover stage — extracted verbatim from engine.ts (Phase 0c).
 *
 * Runs once, when the clock passes SEASON_END_WEEK. Ordering here is
 * gameplay-critical: every division is finalised and history written BEFORE
 * the season counter moves, so reviews, prize money and immutable records are
 * all filed against the season that just closed.
 */
import type { GameState } from "../types";
import { resolveRemainingSeason, syncTable, playerLeagueId } from "../league";
import { makePyramidSchedule, applySeasonRollover, findLeague } from "../pyramid";
import { isUserClubReference, userClubReference } from "../clubReference";
import { runEndOfSeasonReview, rollBoardToNewSeason } from "../board";
import { awardPrizeMoney, closeSeasonFinance, openSeasonFinance } from "../finance";
import { closeCommercialSeason } from "../commercial";
import { closeRecruitmentSeason, rollRecruitmentToNewSeason } from "../recruitment";
import { runPlayerCareerRollover } from "../careers";
import { runStaffCareerRollover } from "../staffCareers";
import { advanceFringeWorldToSeason } from "../fringe";
import { advancePersistentFringePlayersToSeason } from "../fringePlayers";
import { accumulateClubLegacySeasonInPlace } from "../clubLegacy";
import { advanceAiClubPerformanceSeasonInPlace } from "../aiClubPerformance";
import {
  compactDepartingFocusPlayersInPlace,
  repairFreshFocusHydrationInPlace,
} from "../playerFidelityReconcile";
import { rollInfrastructureToNewSeason } from "../infrastructure";
import { SEASON_END_WEEK } from "../calendar";
import { ordinal } from "../format";
import { initialiseSeasonCups } from "../cupEntry";
import { initialisePreseasonFixtures } from "../preseason";
import { closePlayerSeasonInPlace, pushPlayerSeasonAwardsInboxInPlace } from "../playerSeasonStats";
import {
  fixturesForClub,
  makeFixtures,
  makeLeagueRows,
  leagueTeams,
  userLeagueTeams,
} from "../schedule";

/** Close the finished season and open the next one. Mutates the tick clone. */
export function tickSeasonRollover(s: GameState): void {
  // Season completion is defined by fixtures resolved, not by the calendar.
  // Any fixture still outstanding (e.g. a skipped week) is resolved first.
  resolveRemainingSeason(s);
  syncTable(s);
  // Atomic pyramid rollover: finalise every division, write immutable
  // history, then move promoted/relegated clubs. Guarded against replays.
  const closingSeason = s.season;
  const closingLeagueId = playerLeagueId(s);
  const closingLeague = findLeague(s, closingLeagueId);
  const rollover = applySeasonRollover(s);
  // Preserve the tiny permanent facts we would otherwise have to reconstruct
  // from large historical tables later. Only real known outcomes, transfers
  // and user attendance are accumulated; unknown history is left unknown.
  accumulateClubLegacySeasonInPlace(s, rollover.outcomes, closingSeason);
  // AI clubs carry one cheap institutional-performance value into the next
  // season. It is derived from the finished season, mean-reverting and bounded
  // to three strength points, so it cannot become a second reputation system.
  advanceAiClubPerformanceSeasonInPlace(s, rollover.outcomes, closingSeason);
  // End of season: configuration-driven league prize money, awarded exactly
  // once (guarded by a ledger dedupe key, not by the calendar).
  const sorted = [...s.league].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga));
  const pos = sorted.findIndex((r) => isUserClubReference(s, r.team)) + 1;
  if (closingLeague && pos > 0) {
    const award = awardPrizeMoney(s, closingSeason, closingLeague, pos);
    if (award) {
      const row = s.ledger.find((l) => l.season === closingSeason && l.week === SEASON_END_WEEK);
      if (row) {
        row.matchdayNote = `SEASON END — Finished ${pos}${ordinal(pos)}. Prize £${award.total.toLocaleString()}`;
      }
    }
  }
  // Board review is identity-native: presentation metadata never substitutes
  // for the user's immutable club reference during rollover.
  runEndOfSeasonReview(s);
  // Immutable financial record of the season just closed.
  closeSeasonFinance(s, closingSeason, closingLeagueId);
  // Immutable commercial record of the season just closed.
  closeCommercialSeason(s, closingSeason);
  // Immutable recruitment record of the season just closed.
  closeRecruitmentSeason(s, closingSeason);
  // Preserve a compact player-season record before detailed match rows are
  // eligible for persistence compaction. This keeps long-career history cheap.
  const playerSeasonSummary = closePlayerSeasonInPlace(s, closingSeason);

  // reset
  s.season += 1;
  s.week = 1;
  if (playerSeasonSummary) pushPlayerSeasonAwardsInboxInPlace(s, playerSeasonSummary);
  // Advance compact outer-world identity before recruitment moves the Focus
  // boundary. Clubs returning to Focus therefore hydrate the same people after
  // their cheap statistical age/development/retirement step has run.
  advanceFringeWorldToSeason(s);
  advancePersistentFringePlayersToSeason(s);
  if (s.leagues?.length) {
    s.leagueSchedule = makePyramidSchedule(s.leagues, `${s.saveSeed}|season${s.season}`);
    s.fixtures = fixturesForClub(s.leagueSchedule, userClubReference(s));
    s.league = makeLeagueRows(userLeagueTeams(s));
  } else {
    s.fixtures = makeFixtures(s.clubName, `${s.saveSeed}|season${s.season}`);
    s.leagueSchedule = [];
    s.league = makeLeagueRows(leagueTeams(s.clubName));
  }
  // The league world is now in its new-season shape. Rebuild domestic cups
  // from that world so promoted/relegated clubs enter the correct competition
  // and National Cup entry round for this season.
  s.domesticCups = undefined;
  initialiseSeasonCups(s);
  // Full pyramid saves own the explicit dated pre-season schedule. Legacy
  // saves must keep the makeFixtures projection above; replacing it from an
  // empty leagueSchedule would erase their new-season league fixtures.
  if (s.leagues?.length) {
    initialisePreseasonFixtures(s);
    s.fixtures = fixturesForClub(s.leagueSchedule, userClubReference(s));
  }

  // matchRecords and seasonHistory are permanent — never cleared.
  s.results = [];
  // Season-outcome mail (announcement only — no financial effects yet).
  for (const it of rollover.items) {
    if (!s.inbox.some((x) => x.eventKey === it.eventKey))
      s.inbox.push({ ...it, week: 1, season: s.season });
  }
  // Detailed Focus players now follow deterministic age/potential development
  // and decline curves. Fringe clubs continue to evolve statistically.
  runPlayerCareerRollover(s);
  // The pyramid has already changed, so capture every detailed club that is
  // about to fall outside Focus before recruitment removes those player rows.
  compactDepartingFocusPlayersInPlace(s);
  // Staff careers advance on the same yearly boundary: hired staff age,
  // develop/decline, may retire, and the new-season market is refreshed.
  runStaffCareerRollover(s);
  // Player values and wage expectations are then recalculated from the evolved
  // abilities; the legacy recruitment reconciler creates/removes detailed rows.
  rollRecruitmentToNewSeason(s);
  // Any newly Focused club is then rebound to its persistent compact people,
  // retaining the recruitment-calculated contract economics without rerolling
  // player identity, DOB, position or ability.
  repairFreshFocusHydrationInPlace(s);
  // Physical plant ages one year and re-derives its projections.
  rollInfrastructureToNewSeason(s);
  // New season objectives, derived from the freshly stored projection.
  rollBoardToNewSeason(s);
  // Open the new season's books: opening balance, policy and budgets.
  openSeasonFinance(s, s.season);
}
