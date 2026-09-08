import { newGame } from "../newGame";
import { currentAbsoluteDay, upcomingTimelineEvents } from "../timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[SCOUT-TIMELINE] Dated deeper scouting reports");

const state = newGame("Dalton Town", "Scout Timeline", "scout-timeline-check");
if (!state.football) throw new Error("football state missing");

const target = state.football.players.find((player) => player.currentClubId !== state.clubName);
if (!target) throw new Error("scouting target missing");

const now = currentAbsoluteDay(state);
state.football.scouting = {
  assignments: [
    {
      playerId: target.id,
      startedAtAbsoluteWeek: 1,
      weeksObserved: 2,
      lastProgressAbsoluteWeek: 1,
      status: "active",
      startedAtDay: now - 2,
      lastProgressDay: now,
    },
  ],
};

const partial = upcomingTimelineEvents(state, 7).find(
  (event) => event.id === `scouting:player:${target.id}:update`,
);
assert(Boolean(partial), "active deeper scouting exposes the next report on the club timeline");
assert(partial!.absoluteDay === now + 2, "two observed days schedule the partial update two days ahead");
assert(partial!.label === "Scout update due", "partial milestone has a chairman-readable label");

state.football.scouting.assignments[0].weeksObserved = 4;
state.football.scouting.assignments[0].startedAtDay = now - 4;
const final = upcomingTimelineEvents(state, 7).find(
  (event) => event.id === `scouting:player:${target.id}:final`,
);
assert(Boolean(final), "four observed days expose the final-report milestone");
assert(final!.absoluteDay === now + 2, "the full six-day report is dated two days after a four-day assessment");
assert(final!.label === "Final scout report due", "final milestone is distinguished from an interim update");

state.football.scouting.assignments[0].status = "complete";
const completed = upcomingTimelineEvents(state, 7).some((event) =>
  event.id.startsWith(`scouting:player:${target.id}:`),
);
assert(!completed, "completed scout assignments disappear from upcoming events");

console.log("\n7 passed, 0 failed");
