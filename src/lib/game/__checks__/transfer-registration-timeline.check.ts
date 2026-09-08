import { advanceDay } from "../engine";
import { newGame } from "../newGame";
import { beginTransferRegistration, completeTransferInPlace } from "../recruitment";
import { userClubReference } from "../clubReference";
import { absoluteWeek } from "../time";
import { currentAbsoluteDay, upcomingTimelineEvents } from "../timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[TRANSFER-REGISTRATION-TIMELINE] Dated incoming completion");

const state = newGame("Dalton Town", "Registration Timeline", "registration-timeline-check");
if (!state.football) throw new Error("football state missing");

const target = state.football.players.find((player) => player.currentClubId === null);
if (!target) throw new Error("free-agent target missing");

const absWeek = absoluteWeek(state.season, state.week);
state.football.negotiations.push({
  id: "TN-REG-CHECK",
  playerId: target.id,
  fromClubId: null,
  toClubId: userClubReference(state),
  direction: "in",
  stage: "agreed",
  clubRounds: 1,
  playerRounds: 1,
  fee: 0,
  proposedWeeklyWage: 1,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 0,
  proposedRole: "First Team",
  createdSeason: state.season,
  createdAbsoluteWeek: absWeek,
  expiresAtAbsoluteWeek: absWeek + 3,
  log: [],
});

const started = beginTransferRegistration(state, "TN-REG-CHECK");
assert(started.result.ok, "agreed incoming deal can open registration");
const negotiation = started.state.football?.negotiations.find((item) => item.id === "TN-REG-CHECK");
if (!negotiation) throw new Error("registration negotiation missing");
assert(negotiation.stage === "registration", "opening registration persists the registration stage");
assert(
  negotiation.registrationDueAtDay === currentAbsoluteDay(started.state) + 1,
  "registration completion is scheduled one game day ahead",
);

const event = upcomingTimelineEvents(started.state, 7).find(
  (item) => item.id === "transfer:TN-REG-CHECK:registration",
);
assert(Boolean(event), "registration completion appears on the club timeline");
assert(event!.label === "Medical & registration complete", "registration timeline label is chairman-readable");

const manual = completeTransferInPlace(started.state, "TN-REG-CHECK");
assert(!manual.ok, "inbox/in-place callers cannot bypass a dated registration clock");
assert(
  started.state.football?.negotiations.find((item) => item.id === "TN-REG-CHECK")?.stage === "registration",
  "blocked manual completion leaves player and negotiation untouched",
);

const advanced = advanceDay(started.state);
const completed = advanced.football?.negotiations.find((item) => item.id === "TN-REG-CHECK");
if (!completed) throw new Error("completed negotiation missing");
assert(completed.stage === "completed", "Advance resolves due registration through canonical completion");
assert(Boolean(completed.completedTransferId), "canonical transfer record is linked to the negotiation");
const completionMessage = advanced.inbox.find(
  (item) => item.subject === `Transfer completed: ${target.firstName} ${target.lastName}`,
);
assert(Boolean(completionMessage), "completed registration generates a high-priority transfer inbox message");
assert(
  completionMessage!.eventKey === `recruitment-transfer-complete:${completed.completedTransferId}`,
  "completion uses the weekly generator's canonical event key to prevent duplicate messages",
);
assert(
  completionMessage!.conversationKey === "transfer:TN-REG-CHECK",
  "completion remains attached to the same transfer conversation",
);
assert(
  !upcomingTimelineEvents(advanced, 7).some((item) => item.id === "transfer:TN-REG-CHECK:registration"),
  "completed registration disappears from upcoming events",
);

console.log("\n12 passed, 0 failed");
