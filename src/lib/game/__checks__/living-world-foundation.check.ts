import type { League, LeagueRow } from "../types";
import { CLUBS } from "../clubs";
import {
  WORLD_DIVISIONS,
  worldClubCount,
  deepestWorldTier,
  freshStartDivision,
  makeExpandedLeagues,
  promotionDestinationsForDefinition,
  worldDivisionsAtTier,
  type WorldDivisionDefinition,
} from "../worldPyramid";
import { clubIdentity, externalClubIdentities } from "../clubIdentities";
import { planSeasonMovements, type LeagueOutcome } from "../pyramid";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function row(team: string, pts: number, gd = 0): LeagueRow {
  return { team, p: 38, w: 0, d: 0, l: 0, gf: 50 + gd, ga: 50, pts };
}

function league(id: string, tier: number, promotionPlaces: number, relegationPlaces: number): League {
  return {
    id,
    name: id,
    tier,
    clubIds: [],
    promotionPlaces,
    relegationPlaces,
    prizeMoney: 0,
    reputationRange: [1, 99],
  };
}

function outcome(leagueId: string, tier: number, table: LeagueRow[], promoted: string[], relegated: string[]): LeagueOutcome {
  return {
    leagueId,
    leagueName: leagueId,
    tier,
    table,
    champion: table[0]?.team ?? "",
    runnerUp: table[1]?.team ?? null,
    promoted: [...promoted],
    relegated: [...relegated],
  };
}

export function runLivingWorldFoundationChecks(): void {
  const parallel: readonly WorldDivisionDefinition[] = [
    { id: "l4", name: "Level Six", tier: 4, clubCount: 20, promotionPlaces: 0, relegationPlaces: 2, reputationRange: [14, 36] },
    {
      id: "l7-central",
      name: "Regional Premier Central",
      tier: 5,
      clubCount: 20,
      promotionPlaces: 2,
      relegationPlaces: 0,
      reputationRange: [8, 24],
      lane: "central",
      feedsInto: ["l4"],
      freshStart: true,
    },
    {
      id: "l7-south",
      name: "Regional Premier South",
      tier: 5,
      clubCount: 20,
      promotionPlaces: 2,
      relegationPlaces: 0,
      reputationRange: [8, 24],
      lane: "south",
      feedsInto: ["l4"],
    },
  ];

  assert(deepestWorldTier(parallel) === 5, "parallel divisions must not inflate deepest tier");
  assert(worldDivisionsAtTier(5, parallel).length === 2, "same-tier siblings must remain distinct");
  assert(freshStartDivision(parallel).id === "l7-central", "fresh start must resolve one explicit lane");
  assert(
    promotionDestinationsForDefinition(parallel[1], parallel)[0] === "l4",
    "parallel regional division must retain explicit upward routing",
  );

  assert(WORLD_DIVISIONS.length === 11, "persistent world must contain Levels 1-7 with regional splits");
  assert(worldDivisionsAtTier(7).length === 4, "Level 7 must contain exactly four regional divisions");
  assert(deepestWorldTier() === 7, "Level 7 must be the deepest enabled world tier");
  assert(freshStartDivision().id === "regional-premier-central", "fresh saves must begin in the designated Level 7 lane");
  assert(
    CLUBS.length >= worldClubCount(),
    "stable club pool must be large enough to build the whole Level 7 world",
  );

  const freshWorld = makeExpandedLeagues("Beano Test FC");
  assert(freshWorld.length === WORLD_DIVISIONS.length, "fresh world must build every configured division");
  assert(
    freshWorld.every((division) => division.clubIds.length === WORLD_DIVISIONS.find((definition) => definition.id === division.id)?.clubCount),
    "every fresh-world division must use its configured capacity",
  );
  assert(
    freshWorld.filter((division) => division.clubIds.includes("Beano Test FC")).length === 1,
    "user club must occupy exactly one division",
  );
  assert(
    freshWorld.find((division) => division.clubIds.includes("Beano Test FC"))?.id === "regional-premier-central",
    "fresh user club must start in the Level 7 central lane",
  );
  assert(
    new Set(freshWorld.flatMap((division) => division.clubIds)).size === worldClubCount(),
    "fresh world must not duplicate clubs across regional divisions",
  );

  const leagues = [
    league("upper", 4, 2, 2),
    league("central", 5, 2, 0),
    league("north", 5, 2, 0),
    league("south", 5, 2, 0),
    league("isthmian", 5, 2, 0),
  ];
  const outcomes = [
    outcome("upper", 4, [row("u1", 80), row("u19", 35), row("u20", 30)], [], ["u19", "u20"]),
    outcome("central", 5, [row("central-champ", 88, 20), row("central-2", 82)], ["central-champ", "central-2"], []),
    outcome("north", 5, [row("north-champ", 91, 12), row("north-2", 80)], ["north-champ", "north-2"], []),
    outcome("south", 5, [row("south-champ", 86, 25), row("south-2", 84)], ["south-champ", "south-2"], []),
    outcome("isthmian", 5, [row("isthmian-champ", 83, 10), row("isthmian-2", 81)], ["isthmian-champ", "isthmian-2"], []),
  ];
  const movement = planSeasonMovements(leagues, outcomes);
  const promoted = outcomes.filter((item) => item.tier === 5).flatMap((item) => item.promoted);
  assert(promoted.length === 2, "parallel feeders must only fill the upper division's two vacancies");
  assert(promoted.includes("north-champ"), "best regional champion should win a promotion place");
  assert(promoted.includes("central-champ"), "second-best regional champion should win the other place");
  assert(movement.get("north-champ") === "upper", "selected regional champion must route upward");
  assert(movement.get("central-champ") === "upper", "second selected champion must route upward");
  assert(
    new Set([movement.get("u19"), movement.get("u20")]).size === 2,
    "relegated upper clubs must fill the two regional vacancies rather than overloading one lane",
  );

  const devils = clubIdentity("eng-manchester-devils");
  assert(devils?.displayName === "Manchester Devils", "authored club identity must be stable by id");
  assert(
    externalClubIdentities().every((club) => club.scope === "external"),
    "external club catalogue must not leak domestic clubs",
  );
}
