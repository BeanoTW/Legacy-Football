import { buildWorldSimulationPlan } from "../world";
import {
  freshStartDivision,
  makeWorldLeagues,
  WORLD_DIVISIONS,
  worldClubCount,
} from "../worldPyramid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const playerClub = "Player FC";
const leagues = makeWorldLeagues(playerClub);
const expectedClubs = worldClubCount();
const startingDivision = freshStartDivision();
const playerLeague = leagues.find((league) => league.clubIds.includes(playerClub));

assert(
  leagues.length === WORLD_DIVISIONS.length,
  "fresh world must contain every persistent division",
);
assert(
  leagues.every((league) => league.clubIds.length === WORLD_DIVISIONS.find((division) => division.id === league.id)?.clubCount),
  "every world division must use its configured club count",
);
assert(
  new Set(leagues.flatMap((league) => league.clubIds)).size === expectedClubs,
  `world must contain ${expectedClubs} unique clubs`,
);
assert(
  playerLeague?.id === startingDivision.id,
  "player club must start in the explicit fresh-start regional division",
);
assert(
  playerLeague?.relegationPlaces === 0,
  "deepest regional starting division must not relegate outside the modelled pyramid",
);
assert(
  leagues.filter((league) => league.tier > 1 && league.tier < startingDivision.tier).every(
    (league) => league.promotionPlaces > 0 && league.relegationPlaces > 0,
  ),
  "interior divisions must support two-way movement",
);
assert(
  new Set(WORLD_DIVISIONS.map((division) => division.tier)).size === 7,
  "world tier levels must remain contiguous even with parallel regional divisions",
);
assert(
  WORLD_DIVISIONS.filter((division) => division.tier === 7).length === 4,
  "deepest Level 7 tier must contain four regional divisions",
);

const plan = buildWorldSimulationPlan({
  season: 1,
  clubName: playerClub,
  playerLeagueId: playerLeague!.id,
  leagues,
});

assert(plan.clubs.length === expectedClubs, "simulation plan must cover every persistent club");
assert(
  plan.focusClubIds.length >= playerLeague!.clubIds.length,
  "Level 7 start must fully simulate the player division",
);
assert(
  plan.fringeClubIds.length === expectedClubs - plan.focusClubIds.length,
  "every persistent club outside the Level 7 Focus bubble must remain fringe",
);
assert(
  plan.clubs.filter((club) => club.tier <= 3).every((club) => club.level === "fringe"),
  "distant upper tiers should start fringe",
);

console.log("world-pyramid.check.ts: PASS");
