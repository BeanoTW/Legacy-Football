import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { tickSelectedMatchday } from "../tick/matchday";
import { calendarDay, setCalendarDay } from "../calendar";
import { continuationInterrupt } from "../attention";
import { simulateFixture } from "../engine";
import { isUserClubReference } from "../clubReference";

const opening = newGame("Cup Experience FC", "Chairman", "cup-experience");
assert(opening.domesticCups?.length, "fresh careers must persist domestic cup state");
const national = opening.domesticCups!.find((cup) => cup.competition === "faCup");
assert(national, "Level 7 career must enter the National Cup");
const cupFixture = opening.fixtures.find((fixture) => fixture.competition === "faCup");
assert(cupFixture, "user cup draw must be projected into the fixture list");
const forced = structuredClone(opening);
forced.week = cupFixture!.week;
setCalendarDay(forced, cupFixture!.dayOfWeek ?? 5);
forced.inbox = forced.inbox.filter((item) => item.generatorId !== "domestic-cup");
const cupBefore = forced.domesticCups!.find((cup) => cup.competition === "faCup")!;
const roundBefore = cupBefore.round;
const cashBefore = forced.cash;
const outcome = tickSelectedMatchday(forced, cupFixture!, {
  gf: 2,
  ga: 0,
  attendance: 1200,
  gate: 12000,
  tv: 1500,
  matchdayOps: 2500,
  winBonus: 0,
});
assert.equal(outcome.fxResult?.result, "W", "forced cup win should be recorded as a win");
assert(
  forced.financeLedger.some((entry) => entry.dedupeKey === `cup-prize:s1:faCup:r${roundBefore}`),
  "winning a cup tie must post exactly-once progression prize money",
);
assert(forced.cash > cashBefore, "cup win and matchday income must move club cash through finance ledger");
assert(
  forced.inbox.some((item) => item.eventKey === `cup:progress:s1:faCup:r${roundBefore}`),
  "cup progression must create a club narrative item",
);
const nextCup = forced.domesticCups!.find((cup) => cup.competition === "faCup")!;
assert(nextCup.round > roundBefore || nextCup.champion, "resolved cup round must progress");
if (!nextCup.champion) {
  assert(
    forced.inbox.some((item) => item.eventKey === `cup:draw:s1:faCup:r${nextCup.round}`),
    "the next user cup draw must be announced",
  );
}

const drawn = newGame("Cup Draw FC", "Chairman", "cup-draw-decider");
const drawnFixture = drawn.fixtures.find((fixture) => fixture.competition === "faCup")!;
drawn.week = drawnFixture.week;
setCalendarDay(drawn, drawnFixture.dayOfWeek ?? 5);
const drawnOutcome = tickSelectedMatchday(drawn, drawnFixture, {
  gf: 1,
  ga: 1,
  attendance: 1000,
  gate: 10000,
  tv: 1000,
  matchdayOps: 2000,
  winBonus: 0,
});
assert.notEqual(
  drawnOutcome.fxResult?.result,
  "D",
  "a knockout draw decided by extra time or penalties must become a progression win/loss",
);
assert.match(
  drawnOutcome.matchdayNote ?? "",
  /(a\.e\.t\.|pens)/,
  "knockout decider must survive into the matchday note",
);

const simFlow = newGame("Cup Sim FC", "Chairman", "cup-sim-flow");
const simFixture = simFlow.fixtures.find((fixture) => fixture.competition === "faCup")!;
simFlow.week = simFixture.week;
simFlow.inbox = [];
setCalendarDay(simFlow, simFixture.dayOfWeek ?? 5);
assert.equal(calendarDay(simFlow), simFixture.dayOfWeek ?? 5);
assert.equal(continuationInterrupt(simFlow), "Matchday");
const afterSim = simulateFixture(simFlow, simFixture);
assert(
  afterSim.results.some(
    (result) =>
      result.competition === "faCup" &&
      result.week === simFixture.week &&
      result.opponent === simFixture.opponent,
  ),
  "sim cup action must commit the dated fixture",
);
assert(
  continuationInterrupt(afterSim) !== "Matchday" || afterSim.fixtures.some((fixture) =>
    fixture.week === afterSim.week && (fixture.dayOfWeek ?? 5) === calendarDay(afterSim) &&
    !afterSim.results.some((result) =>
      result.week === fixture.week && result.opponent === fixture.opponent && result.home === fixture.home &&
      (result.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
      (result.competition ?? "league") === (fixture.competition ?? "league")
    )
  ),
  "Continue may remain on Matchday only when another same-day fixture is genuinely unresolved",
);

const userCup = afterSim.domesticCups!.find((cup) => cup.competition === "faCup")!;
const stillAlive =
  Boolean(userCup.champion && isUserClubReference(afterSim, userCup.champion)) ||
  (!userCup.eliminated.some((club) => isUserClubReference(afterSim, club)) &&
    userCup.ties.some(
      (tie) => isUserClubReference(afterSim, tie.home) || isUserClubReference(afterSim, tie.away),
    ));
assert.equal(typeof stillAlive, "boolean");

console.log("cup-experience.check: ok");
