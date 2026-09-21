import { strict as assert } from "node:assert";
import { newGame, commitLiveMatchAndAdvance, advanceWeek } from "../engine";
import { applyHalfTimeChoice, kickoff, startMatchDay } from "../liveMatch";
import { setCalendarDay } from "../calendar";
import { absoluteWeek } from "../time";
import { applyMatchLoadInPlace, medicalSupport } from "../playerHealth";
import { isUserClubReference } from "../clubReference";
import { makeStaff } from "../staff";
import { userMatchLineup } from "../matchLineup";

function matchState(seed: string) {
  const game = newGame("Health FC", "Chair", seed);
  const opponent = game.fixtures[0].opponent;
  game.fixtures = [
    {
      week: game.week,
      dayOfWeek: 5,
      competition: "preseason",
      opponent,
      home: true,
    },
  ];
  setCalendarDay(game, 5);
  const userPlayers = game.football.players.filter(
    (player) => isUserClubReference(game, player.currentClubId),
  );
  for (const player of userPlayers.slice(0, 4)) player.fitness = 68;
  return game;
}

const base = matchState("health-match-regression");
const full = applyHalfTimeChoice(kickoff(startMatchDay(base)), "steady");
const engine = full.liveMatch?.engine;
assert(engine);
const userSubs = (engine.substitutions ?? []).filter((sub) => sub.side === "us");
assert(userSubs.length >= 1 && userSubs.length <= 3, "manager should use a realistic number of subs");
assert.equal(
  full.liveMatch?.events.filter((event) => event.type === "sub" && event.side === "us").length,
  userSubs.length,
  "every substitution must be visible in the match event stream",
);
assert(
  (engine.playerStats ?? []).some((player) => player.minutes < 90),
  "substitutions must change individual minutes",
);
assert.equal(
  (engine.playerStats ?? []).reduce((sum, player) => sum + player.minutes, 0),
  11 * 90,
  "one-for-one substitutions must preserve total team minutes",
);

const replay = applyHalfTimeChoice(kickoff(startMatchDay(matchState("health-match-regression"))), "steady");
assert.deepEqual(
  replay.liveMatch?.engine?.substitutions,
  engine.substitutions,
  "match management must be deterministic",
);
assert.deepEqual(
  replay.liveMatch?.engine?.injuries,
  engine.injuries,
  "injury outcomes must be deterministic",
);

const committed = commitLiveMatchAndAdvance(full);
const usedIds = new Set(
  (engine.playerStats ?? []).filter((player) => player.minutes > 0).map((player) => player.playerId),
);
const loaded = committed.football.players.filter((player) => usedIds.has(player.id));
assert(
  loaded.some((player) => (player.fitness ?? 100) < 100),
  "played minutes must persist fatigue into the football database",
);

let injuryState = newGame("Recovery FC", "Chair", "injury-recovery-regression");
const injured = injuryState.football.players.find(
  (player) => isUserClubReference(injuryState, player.currentClubId),
)!;
applyMatchLoadInPlace(
  injuryState,
  [
    {
      playerId: injured.id,
      name: `${injured.firstName} ${injured.lastName}`,
      shirtNumber: 4,
      role: "CB",
      minutes: 90,
      goals: 0,
      assists: 0,
      chances: 0,
      shots: 0,
      shotsOnTarget: 0,
      yellowCards: 0,
      rating: 6,
    },
  ],
  [
    {
      minute: 72,
      side: "us",
      playerId: injured.id,
      playerName: `${injured.firstName} ${injured.lastName}`,
      type: "Hamstring strain",
      severity: "moderate",
      weeksOut: 4,
    },
  ],
);
assert.equal(injured.availability, "unavailable");
assert.equal(injured.injury?.returnAbsoluteWeek, absoluteWeek(injuryState.season, injuryState.week) + 4);
for (let i = 0; i < 4; i++) injuryState = advanceWeek(injuryState);
const recovered = injuryState.football.players.find((player) => player.id === injured.id)!;
assert.equal(recovered.availability, "available");
assert.equal(recovered.injury, null);
assert((recovered.fitness ?? 0) > 45, "recovery weeks must restore fitness");

console.log("player-health-match: passed");


const basicMedical = newGame("Basic Medical FC", "Chair", "medical-support-basic");
const eliteMedical = newGame("Elite Medical FC", "Chair", "medical-support-elite");
const fixed = () => 0.5;
const physio = makeStaff("Head Physio", 90, fixed);
const scientist = makeStaff("Sports Scientist", 88, fixed);
const fitnessCoach = makeStaff("Fitness Coach", 86, fixed);
physio.stats.medical = 92;
scientist.stats.medical = 88;
fitnessCoach.stats.medical = 85;
eliteMedical.hiredStaff = [physio, scientist, fitnessCoach];
assert(
  medicalSupport(eliteMedical).score > medicalSupport(basicMedical).score,
  "specialist medical staff must improve the club medical score",
);
assert(
  medicalSupport(eliteMedical).recoveryPerWeek > medicalSupport(basicMedical).recoveryPerWeek,
  "better medical departments must recover fitness faster",
);
assert(
  medicalSupport(eliteMedical).injuryRiskMultiplier < medicalSupport(basicMedical).injuryRiskMultiplier,
  "better medical departments must reduce injury risk",
);

const rotationState = newGame("Rotation FC", "Chair", "rotation-fatigue-regression");
const manager = makeStaff("Manager", 74, fixed);
manager.stats = {
  ...manager.stats,
  development: 90,
  motivation: 82,
  tactics: 82,
};
rotationState.hiredStaff = [manager];
const eligible = rotationState.football.players.filter((player) =>
  isUserClubReference(rotationState, player.currentClubId),
);
const strongest = eligible
  .filter((player) => player.primaryPosition !== "GK")
  .sort((a, b) => b.currentAbility - a.currentAbility)[0];
if (strongest) strongest.fitness = 38;
const rotated = userMatchLineup(rotationState, "4-4-2");
assert(
  !strongest || !rotated.some((player) => player.playerId === strongest.id) || rotated.find((player) => player.playerId === strongest.id)!.fitness! >= 38,
  "high-rotation managers must account for fatigue when selecting a side",
);
