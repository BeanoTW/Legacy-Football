import { buildWorldSimulationPlan } from "../world";
import {
  freshStartDivision,
  makeWorldLeagues,
  WORLD_CLUBS_PER_DIVISION,
  WORLD_DIVISIONS,
} from "../worldPyramid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const playerClub = "Player FC";
const leagues = makeWorldLeagues(playerClub);
const expectedClubs = WORLD_DIVISIONS.length * WORLD_CLUBS_PER_DIVISION;
const startingDivision = freshStartDivision();
const playerLeague = leagues.find((league) => league.clubIds.includes(playerClub));

assert(
  leagues.length === WORLD_DIVISIONS.length,
  "fresh world must contain every persistent division",
);
assert(
  leagues.every((league) => league.clubIds.length === WORLD_CLUBS_PER_DIVISION),
  "every world division must contain 20 clubs",
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
    (league) => league.promotionPlaces === 2 && league.relegationPlaces === 2,
  ),
  "linear interior divisions must support two-way movement",
);
assert(
  new Set(WORLD_DIVISIONS.map((division) => division.tier)).size === startingDivision.tier,
  "world tier levels must remain contiguous even with parallel regional divisions",
);
assert(
  WORLD_DIVISIONS.filter((division) => division.tier === startingDivision.tier).length === 4,
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
  plan.focusClubIds.length === 40,
  "Level 7 start should fully simulate the player division and its upper neighbour",
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
