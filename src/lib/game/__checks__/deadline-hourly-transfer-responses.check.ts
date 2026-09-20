import type { TransferNegotiation } from "../types";
import { newGame } from "../newGame";
import { setCalendarDay, setTransferDeadlineHour, WINDOW_PRESEASON_END } from "../calendar";
import {
  clearTransferResponseInPlace,
  scheduleTransferResponseInPlace,
  transferResponseHoursRemaining,
  transferResponseIsDue,
} from "../transferResponses";

let passed = 0;
function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(`deadline-hourly-transfer-responses: ${message}`);
  passed += 1;
}

function negotiation(id: string): TransferNegotiation {
  return {
    id,
    playerId: `player-${id}`,
    fromClubId: "seller",
    toClubId: "user",
    direction: "in",
    stage: "clubTalks",
    clubRounds: 1,
    playerRounds: 0,
    fee: 100_000,
    proposedWeeklyWage: 1_000,
    proposedLengthSeasons: 2,
    proposedSigningBonus: 5_000,
    proposedRole: "First Team",
    createdSeason: 1,
    createdAbsoluteWeek: 4,
    expiresAtAbsoluteWeek: 7,
    log: [],
  };
}

const deadline = newGame("Hourly Town", "Chairman", "deadline-hourly-response-check");
deadline.week = WINDOW_PRESEASON_END;
setCalendarDay(deadline, 6);
setTransferDeadlineHour(deadline, 11);
const hourly = negotiation("hourly");

scheduleTransferResponseInPlace(deadline, hourly, "club");
check(hourly.pendingResponseAtHour !== undefined, "deadline-day response receives a persisted due hour");
check((hourly.pendingResponseAtHour ?? 0) > 11, "deadline-day reply is scheduled after the current hour");
check((hourly.pendingResponseAtHour ?? 24) <= 23, "deadline-day reply never schedules past the closing hour");
check(!transferResponseIsDue(deadline, hourly), "reply is not due before its scheduled hour");
check(
  transferResponseHoursRemaining(deadline, hourly) === (hourly.pendingResponseAtHour ?? 11) - 11,
  "hours remaining reflects the persisted deadline clock",
);

setTransferDeadlineHour(deadline, hourly.pendingResponseAtHour ?? 11);
check(transferResponseIsDue(deadline, hourly), "reply becomes due on its exact persisted deadline hour");
check(transferResponseHoursRemaining(deadline, hourly) === 0, "hours remaining reaches zero when due");

const persistedHour = hourly.pendingResponseAtHour;
scheduleTransferResponseInPlace(deadline, hourly, "club");
check(hourly.pendingResponseAtHour === persistedHour, "rescheduling does not reroll a persisted due hour");

clearTransferResponseInPlace(hourly);
check(hourly.pendingResponseAtHour === undefined, "clearing a response also clears its deadline hour");

const ordinary = newGame("Daily Town", "Chairman", "ordinary-response-check");
ordinary.week = 3;
setCalendarDay(ordinary, 2);
const daily = negotiation("daily");
scheduleTransferResponseInPlace(ordinary, daily, "club");
check(daily.pendingResponseAtHour === undefined, "ordinary transfer replies stay on the day clock");
check(transferResponseHoursRemaining(ordinary, daily) === null, "ordinary replies do not expose an hourly countdown");

console.log(`deadline-hourly-transfer-responses.check: ${passed} checks passed`);
