/* Deterministic shippability regression for the first playable promotion.
   Run with: bun src/lib/game/__checks__/level7-promotion-economy.check.ts
*/
import { newGame, advanceWeek } from "../engine";
import { footballLevelOfUser } from "../footballLevel";
import { economicProfileForLevel, transferFeePolicyForLevel } from "../levelEconomy";
import { makePyramidSchedule, pyramidClubs, pyramidIntegrity } from "../pyramid";
import { initClubReputations, storePredictions } from "../reputation";
import type { GameState } from "../types";

const SEED = "LEVEL7_PROMOTION_ECONOMY";

function fresh(): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = SEED;
  g.leagueSchedule = makePyramidSchedule(g.leagues, `${SEED}|season1`);
  g.fixtures = g.leagueSchedule
    .filter((f) => f.home === g.clubName || f.away === g.clubName)
    .map((f) => ({
      week: f.week,
      opponent: f.home === g.clubName ? f.away : f.home,
      home: f.home === g.clubName,
    }))
    .sort((a, b) => a.week - b.week);
  g.clubReputations = initClubReputations(g.leagues, SEED);
  g.seasonPredictions = [];
  storePredictions(g, 1);
  return g;
}

function promoteUser(g0: GameState): GameState {
  let s = g0;
  for (let i = 0; i < 46; i++) {
    const fx = s.fixtures.find((f) => f.week === s.week);
    s = fx
      ? advanceWeek(s, {
          gf: 8,
          ga: 0,
          attendance: 900,
          gate: 1,
          tv: 1,
          matchdayOps: 1,
          winBonus: 0,
        })
      : advanceWeek(s);
  }
  return s;
}

const before = fresh();
const startingLeague = before.leagues.find((l) => l.id === before.playerLeagueId)!;
if (startingLeague.tier !== 5 || footballLevelOfUser(before) !== 7) {
  throw new Error("Fresh career is not starting at canonical Level 7");
}
const clubsBefore = pyramidClubs(before);
const level7Profile = economicProfileForLevel(7);
const level7FeePolicy = transferFeePolicyForLevel(7);

const after = promoteUser(before);
const destination = after.leagues.find((l) => l.clubIds.includes(after.clubName));
const history = after.seasonHistory.find(
  (h) => h.season === 1 && h.leagueId === startingLeague.id,
);

if (after.season !== 2) throw new Error(`Expected season 2 after rollover, got ${after.season}`);
if (!history?.promoted.includes(after.clubName)) {
  throw new Error("Forced Level 7 champion was not recorded as promoted");
}
if (!destination || destination.id !== "league-4" || destination.tier !== 4) {
  throw new Error(`Promoted user did not enter league-4/tier 4: ${destination?.id}/${destination?.tier}`);
}
if (after.playerLeagueId !== destination.id) {
  throw new Error("playerLeagueId did not follow the promoted club");
}
if (footballLevelOfUser(after) !== 6) {
  throw new Error(`Promoted user did not resolve to canonical Level 6: ${footballLevelOfUser(after)}`);
}
if (!after.leagues.every((l) => l.clubIds.length === 20)) {
  throw new Error("A division lost its 20-club capacity during Level 7 promotion");
}
const clubsAfter = pyramidClubs(after);
if (
  clubsAfter.length !== clubsBefore.length ||
  new Set(clubsAfter).size !== clubsAfter.length ||
  !clubsBefore.every((club) => clubsAfter.includes(club))
) {
  throw new Error("Club membership was not conserved through Level 7 promotion");
}
const integrity = pyramidIntegrity(after);
if (!integrity.ok) throw new Error(`Pyramid integrity failed: ${integrity.problems.join("; ")}`);

const level6Profile = economicProfileForLevel(footballLevelOfUser(after));
const level6FeePolicy = transferFeePolicyForLevel(footballLevelOfUser(after));
if (level6Profile.label === level7Profile.label) {
  throw new Error("Promotion left the user on the Level 7 economic profile");
}
if (level6Profile.typicalRevenue[0] <= level7Profile.typicalRevenue[0]) {
  throw new Error("Level 6 promotion did not increase the canonical revenue floor");
}
if (level6Profile.broadcastSeason <= level7Profile.broadcastSeason) {
  throw new Error("Level 6 promotion did not increase canonical broadcast income");
}
if (level6Profile.wageMultiplier <= level7Profile.wageMultiplier) {
  throw new Error("Level 6 promotion did not increase canonical wage pressure");
}
if (
  level6FeePolicy.askingFloor !== 20_000 ||
  level6FeePolicy.feeStep !== 5_000 ||
  level7FeePolicy.askingFloor !== 1_000 ||
  level7FeePolicy.feeStep !== 500
) {
  throw new Error("Promotion did not cross from Level 7 to the canonical Level 6 transfer market");
}

console.log("level7-promotion-economy.check.ts: PASS");
