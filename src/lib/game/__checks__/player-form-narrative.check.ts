import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { isUserClubReference } from "../clubReference";
import { playerRecentForm } from "../playerForm";
import { userMatchLineup } from "../matchLineup";
import { userSelectionStrengthPenalty } from "../matchStrength";
import { applyMatchLoadInPlace, recoverPlayerHealthWeekInPlace } from "../playerHealth";
import { fromAbsoluteWeek } from "../time";
import { closePlayerSeasonInPlace, pushPlayerSeasonAwardsInboxInPlace } from "../playerSeasonStats";
import { tickSelectedMatchday } from "../tick/matchday";

const formState = newGame("Form FC", "Chair", "player-form-regression");
const squad = formState.football.players.filter((player) =>
  isUserClubReference(formState, player.currentClubId),
);
const outfield = squad.filter((player) => player.primaryPosition !== "GK");
assert(outfield.length >= 2);
const hot = outfield[0];
const cold = outfield[1];
hot.currentAbility = 60;
cold.currentAbility = 60;
cold.primaryPosition = hot.primaryPosition;

formState.playerMatchHistory = {};
for (let week = 1; week <= 4; week++) {
  const key = `1|${week}|5|league|Opponent ${week}|true`;
  formState.playerMatchHistory[key] = {
    season: 1,
    week,
    opponent: `Opponent ${week}`,
    players: [
      {
        playerId: hot.id,
        name: `${hot.firstName} ${hot.lastName}`,
        shirtNumber: 9,
        role: "ST",
        minutes: 90,
        started: true,
        goals: 1,
        assists: 0,
        chances: 2,
        shots: 2,
        shotsOnTarget: 1,
        yellowCards: 0,
        rating: 7.6,
      },
      {
        playerId: cold.id,
        name: `${cold.firstName} ${cold.lastName}`,
        shirtNumber: 10,
        role: "ST",
        minutes: 90,
        started: true,
        goals: 0,
        assists: 0,
        chances: 1,
        shots: 1,
        shotsOnTarget: 0,
        yellowCards: 0,
        rating: 5.8,
      },
    ],
  };
}
const hotForm = playerRecentForm(formState, hot.id);
const coldForm = playerRecentForm(formState, cold.id);
assert.equal(hotForm.band, "Hot");
assert.equal(coldForm.band, "Poor");
assert(hotForm.selectionAdjustment > 0);
assert(coldForm.selectionAdjustment < 0);
assert.deepEqual(playerRecentForm(structuredClone(formState), hot.id), hotForm);
assert(userSelectionStrengthPenalty(formState) <= 0);
assert.equal(
  userSelectionStrengthPenalty(structuredClone(formState)),
  userSelectionStrengthPenalty(formState),
  "selected-XI strength adjustment must be deterministic",
);

const xi = userMatchLineup(formState, "4-4-2");
assert(
  xi.some((player) => player.playerId === hot.id),
  "strong recent form should be able to separate otherwise equal selection candidates",
);

const healthState = newGame("Medical Mail FC", "Chair", "medical-mail-regression");
const medicalPlayer = healthState.football.players.find((player) =>
  isUserClubReference(healthState, player.currentClubId),
)!;
applyMatchLoadInPlace(
  healthState,
  [
    {
      playerId: medicalPlayer.id,
      name: `${medicalPlayer.firstName} ${medicalPlayer.lastName}`,
      shirtNumber: 4,
      role: "CB",
      minutes: 72,
      started: true,
      goals: 0,
      assists: 0,
      chances: 0,
      shots: 0,
      shotsOnTarget: 0,
      yellowCards: 0,
      rating: 6.1,
    },
  ],
  [
    {
      minute: 72,
      side: "us",
      playerId: medicalPlayer.id,
      playerName: `${medicalPlayer.firstName} ${medicalPlayer.lastName}`,
      type: "Hamstring strain",
      severity: "moderate",
      weeksOut: 4,
    },
  ],
);
const injuryMail = healthState.inbox.filter((item) => item.generatorId === "medical-player-health");
assert.equal(injuryMail.length, 1);
assert.match(injuryMail[0].subject, /injured/i);
const returnAbs = medicalPlayer.injury!.returnAbsoluteWeek;
const returnAt = fromAbsoluteWeek(returnAbs);
healthState.season = returnAt.season;
healthState.week = returnAt.week;
recoverPlayerHealthWeekInPlace(healthState);
const medicalMail = healthState.inbox.filter((item) => item.generatorId === "medical-player-health");
assert.equal(medicalMail.length, 2);
assert(medicalMail.some((item) => /available again/i.test(item.subject)));
recoverPlayerHealthWeekInPlace(healthState);
assert.equal(
  healthState.inbox.filter((item) => item.generatorId === "medical-player-health").length,
  2,
  "medical notifications must be exactly-once",
);

const awardsState = newGame("Awards FC", "Chair", "player-awards-regression");
const fixture = awardsState.fixtures[0];
tickSelectedMatchday(awardsState, fixture);
const summary = closePlayerSeasonInPlace(awardsState, awardsState.season);
assert(summary);
awardsState.season += 1;
awardsState.week = 1;
pushPlayerSeasonAwardsInboxInPlace(awardsState, summary!);
pushPlayerSeasonAwardsInboxInPlace(awardsState, summary!);
const awardsMail = awardsState.inbox.filter((item) => item.generatorId === "club-player-awards");
assert.equal(awardsMail.length, 1);
assert.match(awardsMail[0].subject, /player awards/i);

console.log("player-form-narrative: passed");
