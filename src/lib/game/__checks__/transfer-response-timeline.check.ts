import type { GameState, TransferNegotiation } from "../types";
import { scheduleTransferResponseInPlace, transferAbsoluteDay } from "../transferResponses";
import { upcomingTimelineEvents } from "../timeline";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const negotiation: TransferNegotiation = {
  id: "TN-TEST",
  playerId: "p-test",
  fromClubId: "club-a",
  toClubId: "club-user",
  direction: "in",
  stage: "clubTalks",
  clubRounds: 1,
  playerRounds: 0,
  fee: 100_000,
  proposedWeeklyWage: 1_000,
  proposedLengthSeasons: 3,
  proposedSigningBonus: 5_000,
  proposedRole: "First Team",
  createdSeason: 1,
  createdAbsoluteWeek: 3,
  expiresAtAbsoluteWeek: 6,
  log: [],
};

const state = {
  saveSeed: "transfer-response-check",
  season: 1,
  week: 3,
  calendarDay: 1,
  fixtures: [],
  football: {
    players: [
      {
        id: "p-test",
        firstName: "Jamie",
        lastName: "Test",
      },
    ],
    negotiations: [negotiation],
  },
} as unknown as GameState;

const now = transferAbsoluteDay(state);
const firstDue = scheduleTransferResponseInPlace(state, negotiation, "club", 2, 2);
const secondDue = scheduleTransferResponseInPlace(state, negotiation, "club", 1, 3);
assert(firstDue === now + 2, "fixed two-day response should land two days ahead");
assert(secondDue === firstDue, "an already-scheduled response must not reroll on repeat calls");
assert(negotiation.pendingResponseKind === "club", "response kind should persist on the negotiation");

const events = upcomingTimelineEvents(state, 14);
const response = events.find((event) => event.id === "transfer:TN-TEST:response");
assert(response, "pending transfer response should appear on the Advance timeline");
assert(response.absoluteDay === firstDue, "Advance must use the persisted response due day");
assert(response.label === "Club transfer response", "club reply should have a chairman-facing label");

console.log("transfer response timeline check passed");
