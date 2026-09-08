import type { GameState } from "../types";
import { FRIENDLY_WEEKS, MATCHDAY_INDEX } from "../calendar";
import { timelineEventsForWeek } from "../timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(FRIENDLY_WEEKS.has(2) && FRIENDLY_WEEKS.has(4), "pre-season should retain its two friendly slots");
assert(!FRIENDLY_WEEKS.has(25) && !FRIENDLY_WEEKS.has(27), "mid-season must not create friendlies");

const preseason = {
  season: 1,
  week: 1,
  inboxFlags: { "calendar.dayOfWeek": 0 },
  fixtures: [],
} as unknown as GameState;

const friendly = timelineEventsForWeek(preseason, 2).find((event) => event.kind === "fixture");
assert(friendly, "generated pre-season friendly should be visible before its week arrives");
assert(friendly.label === "Friendly", "pre-season slot must be labelled as a friendly");
assert(friendly.detail === "Pre-season friendly", "generated friendly should explain the scheduled event");
assert(friendly.day === MATCHDAY_INDEX, "friendly should use the canonical matchday index");

const midseason = {
  season: 1,
  week: 24,
  inboxFlags: { "calendar.dayOfWeek": 0 },
  fixtures: [{ week: 25, opponent: "league-opponent", home: false }],
} as unknown as GameState;

const league = timelineEventsForWeek(midseason, 25).find((event) => event.kind === "fixture");
assert(league, "mid-season league fixture should appear on the week timeline");
assert(league.label === "League match", "week 25 must not be mistaken for a friendly");
assert(league.day === MATCHDAY_INDEX, "league fixture should use the canonical matchday index");

console.log("timeline fixtures check passed");
