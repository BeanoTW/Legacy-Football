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
import { runEndOfSeasonReview, rollBoardToNewSeason } from "../board";
import {
  awardPrizeMoney, closeSeasonFinance, openSeasonFinance,
} from "../finance";
import { closeCommercialSeason } from "../commercial";
import { closeRecruitmentSeason, rollRecruitmentToNewSeason } from "../recruitment";
import { rollInfrastructureToNewSeason } from "../infrastructure";
import { SEASON_END_WEEK } from "../calendar";
import { ordinal } from "../format";
import {
  fixturesForClub, makeFixtures, makeLeagueRows, leagueTeams, userLeagueTeams,
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
  // End of season: configuration-driven league prize money, awarded exactly
  // once (guarded by a ledger dedupe key, not by the calendar).
  const sorted = [...s.league].sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
  const pos = sorted.findIndex((r) => r.team === s.clubName) + 1;
  if (closingLeague && pos > 0) {
    const award = awardPrizeMoney(s, closingSeason, closingLeague, pos);
    if (award) {
      const row = s.ledger.find((l) => l.season === closingSeason && l.week === SEASON_END_WEEK);
      if (row) {
        row.matchdayNote =
          `SEASON END — Finished ${pos}${ordinal(pos)}. Prize £${award.total.toLocaleString()}`;
      }
    }
  }
  // Board's final judgement on the season just completed. Must run before
  // the season counter moves so it is filed against the correct season.
  runEndOfSeasonReview(s);
  // Immutable financial record of the season just closed.
  closeSeasonFinance(s, closingSeason, closingLeagueId);
  // Immutable commercial record of the season just closed.
  closeCommercialSeason(s, closingSeason);
  // Immutable recruitment record of the season just closed.
  closeRecruitmentSeason(s, closingSeason);

  // reset
  s.season += 1;
  s.week = 1;
  if (s.leagues?.length) {
    s.leagueSchedule = makePyramidSchedule(s.leagues, `${s.saveSeed}|season${s.season}`);
    s.fixtures = fixturesForClub(s.leagueSchedule, s.clubName);
    s.league = makeLeagueRows(userLeagueTeams(s));
  } else {
    s.fixtures = makeFixtures(s.clubName, `${s.saveSeed}|season${s.season}`);
    s.leagueSchedule = [];
    s.league = makeLeagueRows(leagueTeams(s.clubName));
  }
  // matchRecords and seasonHistory are permanent — never cleared.
  s.results = [];
  // Season-outcome mail (announcement only — no financial effects yet).
  for (const it of rollover.items) {
    if (!s.inbox.some((x) => x.eventKey === it.eventKey)) s.inbox.push({ ...it, week: 1, season: s.season });
  }
  // Player ageing and revaluation happen in the canonical football world;
  // GameState.squad is re-projected from it.
  rollRecruitmentToNewSeason(s);
  // Physical plant ages one year and re-derives its projections.
  rollInfrastructureToNewSeason(s);
  // New season objectives, derived from the freshly stored projection.
  rollBoardToNewSeason(s);
  // Open the new season's books: opening balance, policy and budgets.
  openSeasonFinance(s, s.season);
}
