import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  FOOTBALL_STRENGTH_MAX,
  FOOTBALL_STRENGTH_MIN,
  clubFootballStrength,
  compactSquadStrength,
  detailedSquadStrength,
} from "../footballStrength";
import { clubStrengthAtLevel, simulateAiFixtureAtLevel } from "../league";

assert.equal(detailedSquadStrength([60, 70, 80]), 70);
assert.equal(compactSquadStrength([60, 70, 80]), 70);
assert.equal(detailedSquadStrength([100, 100]), FOOTBALL_STRENGTH_MAX);
assert.equal(detailedSquadStrength([1, 1]), FOOTBALL_STRENGTH_MIN);
assert.equal(detailedSquadStrength([]), null);

const state = newGame("Strength FC", "Strength Auditor", "FOOTBALL_STRENGTH");
const ownExpected = detailedSquadStrength(state.squad.map((player) => player.rating));
assert.equal(clubFootballStrength(state, state.clubName), ownExpected);

const fringeClubs = Object.values(state.fringeWorld ?? {});
const fringeClub = fringeClubs[0];
if (fringeClub) {
  state.fringePlayers = {
    fp_a: {
      playerId: "fp_a",
      dateOfBirth: { year: 1975, month: 1, day: 1 },
      primaryPosition: "GK",
      currentAbility: 60,
      potentialAbility: 60,
      currentClubId: fringeClub.clubId,
      contractExpirySeason: state.season + 1,
      lastDevelopedSeason: state.season,
    },
    fp_b: {
      playerId: "fp_b",
      dateOfBirth: { year: 1975, month: 1, day: 1 },
      primaryPosition: "DEF",
      currentAbility: 70,
      potentialAbility: 70,
      currentClubId: fringeClub.clubId,
      contractExpirySeason: state.season + 1,
      lastDevelopedSeason: state.season,
    },
    fp_c: {
      playerId: "fp_c",
      dateOfBirth: { year: 1975, month: 1, day: 1 },
      primaryPosition: "FWD",
      currentAbility: 80,
      potentialAbility: 80,
      currentClubId: fringeClub.clubId,
      contractExpirySeason: state.season + 1,
      lastDevelopedSeason: state.season,
    },
  };
  assert.equal(clubFootballStrength(state, fringeClub.clubId), 70);
  assert.equal(clubStrengthAtLevel(state, state.season, fringeClub.clubId, "focus"), 70);
  assert.equal(clubStrengthAtLevel(state, state.season, fringeClub.clubId, "fringe"), 70);

  const opponent = fringeClubs[1];
  if (opponent) {
    const focus = simulateAiFixtureAtLevel(
      state,
      state.season,
      1,
      fringeClub.clubId,
      opponent.clubId,
      fringeClub.leagueId,
      "focus",
    );
    const fringe = simulateAiFixtureAtLevel(
      state,
      state.season,
      1,
      fringeClub.clubId,
      opponent.clubId,
      fringeClub.leagueId,
      "fringe",
    );
    assert.deepEqual(fringe, focus, "simulation fidelity must not change the same fixture outcome");
  }
}

console.log("\nfootball-strength: passed");
