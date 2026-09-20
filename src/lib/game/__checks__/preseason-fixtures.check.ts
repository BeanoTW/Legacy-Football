import { strict as assert } from "node:assert";
import { advanceDay } from "../engine";
import { newGame } from "../newGame";
import { setCalendarDay } from "../calendar";
import {
  PRESEASON_COMPETITION_NAME,
  PRESEASON_MATCH_SLOTS,
  initialisePreseasonFixtures,
  preseasonComplete,
  preseasonTable,
  preseasonWinnerPrize,
  settlePreseasonInvitational,
} from "../preseason";

const state = newGame("Dalton Town", "Chairman", "preseason-fixtures-check");
const fixtures = state.leagueSchedule
  .filter((fixture) => fixture.competition === "preseason")
  .sort((a, b) => a.week - b.week || (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0));

assert.equal(fixtures.length, 3, "fresh careers should open with three pre-season matches");
assert.deepEqual(
  fixtures.map(({ week, dayOfWeek }) => ({ week, dayOfWeek })),
  [...PRESEASON_MATCH_SLOTS],
  "pre-season matches should use the intended 5-day then 4-day rhythm",
);
assert.ok(fixtures.every((fixture) => fixture.week < 5), "friendlies must finish before competitive league football");
assert.ok(fixtures.every((fixture) => fixture.competition === "preseason"), "friendlies need explicit competition identity");

assert.equal(PRESEASON_COMPETITION_NAME, "Summer Invitational");
const table = preseasonTable(state);
assert.equal(table.length, 4, "invitational table should contain the user and three opponents");
assert.ok(table.every((row) => row.p === 0 && row.pts === 0), "fresh invitational table starts unplayed");

const before = state.leagueSchedule.length;
initialisePreseasonFixtures(state);
assert.equal(state.leagueSchedule.length, before, "pre-season seeding must be idempotent");

const winner = structuredClone(state);
winner.results = winner.fixtures
  .filter((fixture) => fixture.competition === "preseason")
  .map((fixture) => ({
    week: fixture.week,
    dayOfWeek: fixture.dayOfWeek,
    competition: "preseason" as const,
    opponent: fixture.opponent,
    home: fixture.home,
    goalsFor: 2,
    goalsAgainst: 0,
    attendance: 0,
    gateReceipts: 0,
    tvIncome: 0,
    result: "W" as const,
  }));
assert.equal(preseasonComplete(winner), true, "all three results should complete the invitational");
const cashBefore = winner.cash;
assert.equal(settlePreseasonInvitational(winner), true, "a completed invitational should settle once");
assert.equal(winner.cash, cashBefore + preseasonWinnerPrize(winner), "the winner should receive the advertised prize");
assert.equal(
  winner.inbox.filter((item) => item.eventKey === `preseason:conclusion:s${winner.season}`).length,
  1,
  "the conclusion should be visible in Inbox",
);
assert.equal(settlePreseasonInvitational(winner), false, "settlement should be exactly once");
assert.equal(
  winner.inbox.filter((item) => item.eventKey === `preseason:conclusion:s${winner.season}`).length,
  1,
  "replaying settlement must not duplicate the conclusion",
);
assert.equal(winner.cash, cashBefore + preseasonWinnerPrize(winner), "replaying settlement must not duplicate prize money");

const throughCalendar = structuredClone(state);
const firstTwo = throughCalendar.fixtures.filter((fixture) => fixture.competition === "preseason").slice(0, 2);
throughCalendar.results = firstTwo.map((fixture) => ({
  week: fixture.week,
  dayOfWeek: fixture.dayOfWeek,
  competition: "preseason" as const,
  opponent: fixture.opponent,
  home: fixture.home,
  goalsFor: 2,
  goalsAgainst: 0,
  attendance: 0,
  gateReceipts: 0,
  tvIncome: 0,
  result: "W" as const,
}));
const finalFixture = throughCalendar.fixtures.filter((fixture) => fixture.competition === "preseason")[2];
throughCalendar.week = finalFixture.week;
setCalendarDay(throughCalendar, (finalFixture.dayOfWeek ?? 5) - 1);
const afterFinalDay = advanceDay(throughCalendar);
assert.equal(
  afterFinalDay.results.filter((result) => result.competition === "preseason").length,
  3,
  "the final dated fixture should be committed before settlement",
);
assert.ok(
  afterFinalDay.inbox.some((item) => item.eventKey === `preseason:conclusion:s${afterFinalDay.season}`),
  "playing the final dated fixture should trigger the conclusion",
);

console.log("preseason-fixtures.check: ok");
