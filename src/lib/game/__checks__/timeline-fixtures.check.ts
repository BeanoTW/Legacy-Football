import type { GameState } from "../types";
import { MATCHDAY_INDEX } from "../calendar";
import { timelineEventsForWeek, upcomingTimelineEvents } from "../timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const state = {
  season: 1,
  week: 24,
  inboxFlags: { "calendar.dayOfWeek": 0 },
  fixtures: [
    { week: 25, opponent: "friendly-opponent", home: true },
    { week: 28, opponent: "league-opponent", home: false },
  ],
} as unknown as GameState;

const events = upcomingTimelineEvents(state, 35);
const friendly = events.find((event) => event.id === "fixture:25:friendly-opponent");
assert(friendly, "mid-season friendly should appear on the Advance timeline");
assert(friendly.label === "Friendly", "week 25 fixture must be labelled as a friendly");
assert(friendly.day === MATCHDAY_INDEX, "friendly should use the canonical matchday index");

const league = timelineEventsForWeek(state, 28).find((event) => event.kind === "fixture");
assert(league, "league fixture should appear on the week timeline");
assert(league.label === "League match", "non-friendly fixture must be labelled as a league match");
assert(league.detail === "Away league fixture", "fixture detail should retain home/away context");

console.log("timeline fixtures check passed");
