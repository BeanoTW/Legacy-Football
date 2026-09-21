import { strict as assert } from "node:assert";
import { newGame, commitLiveMatchAndAdvance, advanceWeek } from "../engine";
import { applyHalfTimeChoice, kickoff, startMatchDay } from "../liveMatch";
import { setCalendarDay } from "../calendar";
import { absoluteWeek } from "../time";
import { applyMatchLoadInPlace } from "../playerHealth";
import { isUserClubReference } from "../clubReference";

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
