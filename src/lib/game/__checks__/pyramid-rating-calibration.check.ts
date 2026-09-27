import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { clubFootballStrength } from "../footballStrength";
import { advanceFringeWorldToSeason, ensureFringeWorldState } from "../fringe";
import {
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
} from "../fringePlayers";
import { footballLevelOfLeague, type FootballLevel } from "../footballLevel";
import { clubOverallProfile, overallBandForLevel } from "../playerOverall";
import { clubReputation } from "../reputation";
import { sameClubReference } from "../clubReference";

const state = newGame("Pyramid Calibration FC", "Calibration Auditor", "PYRAMID_RATING_CALIBRATION");
ensureFringeWorldState(state);
ensurePersistentFringePlayers(state);

const mean = (values: readonly number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function squadAverage(clubId: string): number {
  const detailed = state.football.players.filter(
    (player) => player.currentClubId && sameClubReference(state, player.currentClubId, clubId),
  );
  if (detailed.length) return mean(detailed.map((player) => player.currentAbility));

  const compact = Object.values(state.fringePlayers ?? {}).filter(
    (player) =>
      !player.retired &&
      !player.departed &&
      sameClubReference(state, player.currentClubId, clubId),
  );
  if (compact.length) return mean(compact.map((player) => player.currentAbility));

  return clubFootballStrength(state, clubId);
}

const levelClubAverages = new Map<FootballLevel, number[]>();

for (const league of state.leagues) {
  const level = footballLevelOfLeague(league);
  const [repLo, repHi] = league.reputationRange;

  for (const clubId of league.clubIds) {
    const reputation = clubReputation(state, clubId);
    assert.ok(
      reputation >= repLo && reputation <= repHi,
      `${league.name}: ${clubId} reputation ${reputation} escaped calibrated band ${repLo}-${repHi}`,
    );

    const profile = clubOverallProfile(state, clubId);
    const avg = squadAverage(clubId);
    const values = levelClubAverages.get(level) ?? [];
    values.push(avg);
    levelClubAverages.set(level, values);

    assert.ok(
      avg >= profile.floor && avg <= profile.star,
      `${league.name}: ${clubId} squad average ${avg.toFixed(2)} outside ${profile.floor}-${profile.star}`,
    );
    assert.ok(
      Math.abs(avg - profile.average) <= 3.5,
      `${league.name}: ${clubId} squad average ${avg.toFixed(2)} drifted from target ${profile.average}`,
    );
  }
}

const liveLevels = [...levelClubAverages.keys()].sort((a, b) => a - b);
let previousMean = Infinity;
for (const level of liveLevels) {
  const values = levelClubAverages.get(level)!;
  const levelMean = mean(values);
  const band = overallBandForLevel(level);
  assert.ok(
    levelMean >= band.squadAverage - 5 && levelMean <= band.squadAverage + 5,
    `Level ${level} mean OVR ${levelMean.toFixed(2)} is not centred on ${band.squadAverage}`,
  );
  assert.ok(
    previousMean === Infinity || previousMean - levelMean >= 3,
    `Rating ladder too flat between levels ${level - 1} and ${level}: ${previousMean.toFixed(2)} -> ${levelMean.toFixed(2)}`,
  );
  assert.ok(
    Math.max(...values) - Math.min(...values) >= 2,
    `Level ${level} clubs have collapsed to an identical squad rating`,
  );
  previousMean = levelMean;
}

state.season += 12;
advanceFringeWorldToSeason(state);
advancePersistentFringePlayersToSeason(state);

for (const club of Object.values(state.fringeWorld ?? {})) {
  const profile = clubOverallProfile(state, club.clubId);
  const players = Object.values(state.fringePlayers ?? {}).filter(
    (player) =>
      !player.retired &&
      !player.departed &&
      sameClubReference(state, player.currentClubId, club.clubId),
  );
  assert.ok(players.length > 0, `${club.clubId}: compact squad disappeared over long horizon`);
  const avg = mean(players.map((player) => player.currentAbility));
  assert.ok(
    Math.abs(avg - profile.average) <= 7,
    `${club.clubId}: long-run compact OVR ${avg.toFixed(2)} drifted too far from target ${profile.average}`,
  );
  assert.ok(
    club.strength >= profile.floor - 3 && club.strength <= profile.star + 3,
    `${club.clubId}: compact club strength ${club.strength} left the level band`,
  );
}

console.log("pyramid-rating-calibration.check.ts: PASS");
