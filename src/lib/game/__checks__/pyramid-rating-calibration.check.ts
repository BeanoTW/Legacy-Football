import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { clubFootballStrength } from "../footballStrength";
import { advanceFringeWorldToSeason, ensureFringeWorldState } from "../fringe";
import {
  advancePersistentFringePlayersToSeason,
  ensurePersistentFringePlayers,
} from "../fringePlayers";
import { footballLevelOfClub, footballLevelOfLeague, type FootballLevel } from "../footballLevel";
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

// Promotion/relegation must change the STANDARD a club is judged against,
 // not magically rewrite the squad on the day the club changes division.
 {
  const lowerLeague = state.leagues.find((league) => footballLevelOfLeague(league) === 7)!;
  const upperLeague = state.leagues.find((league) => footballLevelOfLeague(league) === 6)!;
  const promotedClub = lowerLeague.clubIds.find(
    (club) => !sameClubReference(state, club, state.clubName),
  )!;
  const relegatedClub = upperLeague.clubIds[0]!;
  const promotedStrengthBefore = clubFootballStrength(state, promotedClub);
  const relegatedStrengthBefore = clubFootballStrength(state, relegatedClub);
  const promotedTargetBefore = clubOverallProfile(state, promotedClub).average;
  const relegatedTargetBefore = clubOverallProfile(state, relegatedClub).average;

  lowerLeague.clubIds = lowerLeague.clubIds.map((club) =>
    sameClubReference(state, club, promotedClub) ? relegatedClub : club,
  );
  upperLeague.clubIds = upperLeague.clubIds.map((club) =>
    sameClubReference(state, club, relegatedClub) ? promotedClub : club,
  );

  assert.equal(footballLevelOfClub(state, promotedClub), 6, "promoted club moves up one level");
  assert.equal(footballLevelOfClub(state, relegatedClub), 7, "relegated club moves down one level");
  assert.equal(
    clubFootballStrength(state, promotedClub),
    promotedStrengthBefore,
    "promotion does not grant an instant squad-rating boost",
  );
  assert.equal(
    clubFootballStrength(state, relegatedClub),
    relegatedStrengthBefore,
    "relegation does not instantly delete squad quality",
  );
  assert.ok(
    clubOverallProfile(state, promotedClub).average >= promotedTargetBefore + 4,
    "promoted club now recruits against a meaningfully stronger level benchmark",
  );
  assert.ok(
    clubOverallProfile(state, relegatedClub).average <= relegatedTargetBefore - 4,
    "relegated club now recruits against a meaningfully lower level benchmark",
  );
 }

// Compact clubs should then ADAPT toward the standard of their new division
// over subsequent seasons instead of staying frozen forever.
{
  const upper = state.leagues.find((league) => footballLevelOfLeague(league) === 2)!;
  const lower = state.leagues.find((league) => footballLevelOfLeague(league) === 3)!;
  const promotedClub = lower.clubIds.find((club) => state.fringeWorld?.[club])!;
  const relegatedClub = upper.clubIds.find((club) => state.fringeWorld?.[club])!;
  assert.ok(promotedClub && relegatedClub, "fringe adaptation fixture requires outer-world clubs");

  const promotedBefore = state.fringeWorld![promotedClub].strength;
  const relegatedBefore = state.fringeWorld![relegatedClub].strength;

  lower.clubIds = lower.clubIds.map((club) => (club === promotedClub ? relegatedClub : club));
  upper.clubIds = upper.clubIds.map((club) => (club === relegatedClub ? promotedClub : club));

  for (let season = 0; season < 3; season += 1) {
    state.season += 1;
    advanceFringeWorldToSeason(state);
    advancePersistentFringePlayersToSeason(state);
  }

  const promotedAfter = state.fringeWorld![promotedClub].strength;
  const relegatedAfter = state.fringeWorld![relegatedClub].strength;
  assert.ok(
    promotedAfter > promotedBefore,
    `promoted fringe club should strengthen gradually: ${promotedBefore} -> ${promotedAfter}`,
  );
  assert.ok(
    relegatedAfter < relegatedBefore,
    `relegated fringe club should soften gradually: ${relegatedBefore} -> ${relegatedAfter}`,
  );
}

state.season += 9;
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
