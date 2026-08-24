import { buildWorldSimulationPlan } from "../world";
import { makeWorldLeagues, WORLD_CLUBS_PER_DIVISION, WORLD_DIVISIONS } from "../worldPyramid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const playerClub = "Player FC";
const leagues = makeWorldLeagues(playerClub);

assert(leagues.length === 4, "fresh world must contain four persistent divisions");
assert(
  leagues.every((league) => league.clubIds.length === WORLD_CLUBS_PER_DIVISION),
  "every world division must contain 20 clubs",
);
assert(
  new Set(leagues.flatMap((league) => league.clubIds)).size === 80,
  "world must contain 80 unique clubs",
);
assert(leagues[3]?.clubIds.includes(playerClub), "player club must start in Division Four");
assert(
  leagues[3]?.relegationPlaces === 0,
  "bottom world division must not relegate outside the modelled pyramid",
);
assert(
  leagues[1]?.relegationPlaces === 2 && leagues[2]?.relegationPlaces === 2,
  "interior divisions must support two-way movement",
);
assert(
  WORLD_DIVISIONS.map((division) => division.tier).join(",") === "1,2,3,4",
  "world tiers must remain contiguous",
);

const plan = buildWorldSimulationPlan({
  season: 1,
  clubName: playerClub,
  playerLeagueId: leagues[3]!.id,
  leagues,
});

assert(plan.clubs.length === 80, "simulation plan must cover every persistent club");
assert(
  plan.focusClubIds.length === 40,
  "tier-4 start should fully simulate player and adjacent divisions",
);
assert(
  plan.fringeClubIds.length === 40,
  "tier-4 start should leave distant divisions in fringe simulation",
);
assert(
  plan.clubs.filter((club) => club.tier <= 2).every((club) => club.level === "fringe"),
  "distant upper tiers should start fringe",
);

console.log("world-pyramid.check.ts: PASS");
