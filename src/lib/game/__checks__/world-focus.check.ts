import {
  buildWorldSimulationPlan,
  MAX_FOCUS_CLUBS,
  simulationLevelForClub,
  worldSimulationPlanSignature,
} from "../world";
import type { League } from "../types";
import { newGame } from "../newGame";

const leagues: League[] = [
  {
    id: "prem",
    name: "Premier",
    tier: 1,
    clubIds: ["A", "B"],
    promotionPlaces: 0,
    relegationPlaces: 1,
    prizeMoney: 1,
    reputationRange: [70, 90],
  },
  {
    id: "champ",
    name: "Championship",
    tier: 2,
    clubIds: ["Player FC", "C"],
    promotionPlaces: 1,
    relegationPlaces: 1,
    prizeMoney: 1,
    reputationRange: [55, 75],
  },
  {
    id: "league1",
    name: "League One",
    tier: 3,
    clubIds: ["D", "E"],
    promotionPlaces: 1,
    relegationPlaces: 1,
    prizeMoney: 1,
    reputationRange: [40, 60],
  },
  {
    id: "league2",
    name: "League Two",
    tier: 4,
    clubIds: ["F", "G"],
    promotionPlaces: 1,
    relegationPlaces: 0,
    prizeMoney: 1,
    reputationRange: [25, 45],
  },
];

const state = { season: 7, clubName: "Player FC", playerLeagueId: "champ", leagues } as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const planA = buildWorldSimulationPlan(state);
const planB = buildWorldSimulationPlan({ ...state, leagues: [...leagues].reverse() });

assert(
  worldSimulationPlanSignature(planA) === worldSimulationPlanSignature(planB),
  "plan must be deterministic regardless of league array order",
);
assert(simulationLevelForClub(planA, "Player FC") === "focus", "player club must always be focus");
assert(
  simulationLevelForClub(planA, "A") === "focus",
  "league above player must be focus by default",
);
assert(
  simulationLevelForClub(planA, "D") === "focus",
  "league below player must be focus by default",
);
assert(simulationLevelForClub(planA, "F") === "fringe", "distant league must remain fringe");

const tracked = buildWorldSimulationPlan(state, { trackedClubIds: ["F"] });
assert(
  simulationLevelForClub(tracked, "F") === "focus",
  "tracked fringe club must promote to focus",
);
assert(
  tracked.clubs.find((club) => club.clubId === "F")?.reasons.includes("tracked"),
  "tracked reason must be recorded",
);
const persistedTracked = buildWorldSimulationPlan({ ...state, trackedClubIds: ["F"] });
assert(
  simulationLevelForClub(persistedTracked, "F") === "focus" &&
    persistedTracked.clubs.find((club) => club.clubId === "F")?.reasons.includes("tracked"),
  "persisted tracked clubs must enter Focus without temporary options",
);

const narrow = buildWorldSimulationPlan(state, { includeAdjacentLeagues: false });
assert(simulationLevelForClub(narrow, "A") === "fringe", "adjacent leagues must be optional");
assert(
  simulationLevelForClub(narrow, "C") === "focus",
  "same-league club remains focus in narrow mode",
);

let missingLeagueRejected = false;
try {
  buildWorldSimulationPlan({ ...state, playerLeagueId: "missing" });
} catch {
  missingLeagueRejected = true;
}
assert(missingLeagueRejected, "missing player league must fail loudly");

const expanded = newGame("Focus Bound FC", "Boundary Tester", "focus-bound-seed");
const bounded = buildWorldSimulationPlan({
  ...expanded,
  clubName: expanded.leagues.find((league) => league.id === "league-4")!.clubIds[0],
  playerLeagueId: "league-4",
  trackedClubIds: [],
});
assert(
  bounded.focusClubIds.length === MAX_FOCUS_CLUBS,
  "parallel adjacent lanes must never make the detailed focus boundary unbounded",
);
assert(
  bounded.focusLeagueIds.filter((leagueId) => leagueId.startsWith("regional-")).length === 1,
  "Division Four focus must select one deterministic regional lane rather than hydrating all four",
);

console.log("world-focus.check.ts: PASS");
