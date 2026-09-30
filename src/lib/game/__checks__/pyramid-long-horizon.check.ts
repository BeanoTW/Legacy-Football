import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { tickSeasonRollover } from "../tick/rollover";
import { pyramidIntegrity } from "../pyramid";
import { footballLevelOfLeague, type FootballLevel } from "../footballLevel";
import { clubFootballStrength } from "../footballStrength";
import { fixtureId, leagueOf, makeRecord, simulateAiFixture } from "../league";
import { isUserClubReference } from "../clubReference";
import { overallBandForLevel } from "../playerOverall";
import { buildWorldSimulationPlan } from "../world";
import { playerRegisteredClubId } from "../playerRegistration";
import { ageOf } from "../recruitment";

const s = newGame("Drift Audit FC", "Long Horizon Auditor", "PYRAMID_DRIFT_12");
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function audit(): void {
  const integrity = pyramidIntegrity(s);
  assert.ok(integrity.ok, integrity.problems.join("; "));

  const all = s.leagues.flatMap((league) => league.clubIds);
  assert.equal(new Set(all).size, all.length, "club membership must stay unique");

  const byLevel = new Map<FootballLevel, number[]>();
  for (const league of s.leagues) {
    const level = footballLevelOfLeague(league);
    const values = byLevel.get(level) ?? [];
    for (const club of league.clubIds) values.push(clubFootballStrength(s, club));
    byLevel.set(level, values);
  }

  let previous = Infinity;
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const avg = mean(byLevel.get(level)!);
    const band = overallBandForLevel(level);
    assert.ok(Math.abs(avg - band.squadAverage) <= 7.5, `L${level} mean drift: ${avg}`);
    if (previous !== Infinity) assert.ok(previous - avg >= 1.5, `ladder flattened at L${level}`);
    previous = avg;
  }

  const focus = new Set(buildWorldSimulationPlan(s).focusClubIds);
  const detailed = s.football.players.filter((p) => {
    const club = playerRegisteredClubId(p);
    return club !== null && focus.has(club);
  });
  assert.ok(detailed.length > 0, "focus players missing");
  assert.ok(detailed.every((p) => p.currentAbility >= 20 && p.currentAbility <= 95));
  const ages = detailed.map((p) => ageOf(p, s.season));
  assert.ok(mean(ages) >= 21 && mean(ages) <= 31.5, `mean age drift: ${mean(ages)}`);
  assert.ok(ages.some((age) => age <= 22), "young players must remain");
  assert.ok(ages.some((age) => age >= 29), "experienced players must remain");
}

audit();

function settleControlledLeagueFixtures(): void {
  s.matchRecords ??= [];
  for (const fixture of s.leagueSchedule ?? []) {
    if ((fixture.competition ?? "league") !== "league") continue;
    if (!isUserClubReference(s, fixture.home) && !isUserClubReference(s, fixture.away)) continue;
    const lid = leagueOf(fixture);
    const id = fixtureId(s.season, fixture.round, fixture.home, fixture.away, lid);
    if (s.matchRecords.some((record) => record.id === id)) continue;
    const sim = simulateAiFixture(s, s.season, fixture.round, fixture.home, fixture.away, lid);
    s.matchRecords.push(
      makeRecord({
        leagueId: lid,
        season: s.season,
        week: fixture.week,
        round: fixture.round,
        home: fixture.home,
        away: fixture.away,
        homeGoals: sim.homeGoals,
        awayGoals: sim.awayGoals,
        seed: sim.seed,
        userInvolved: true,
      }),
    );
  }
}

for (let i = 0; i < 12; i += 1) {
  const before = s.season;
  settleControlledLeagueFixtures();
  tickSeasonRollover(s);
  assert.equal(s.season, before + 1, "season rollover must advance once");
  audit();
}

const moves = s.seasonHistory.reduce(
  (n, season) => n + season.promoted.length + season.relegated.length,
  0,
);
assert.ok(moves > 0, "audit must exercise promotion and relegation");
assert.ok(s.football.transferHistory.length > 0, "audit must exercise AI transfers");

console.log("pyramid-long-horizon.check.ts: PASS", {
  season: s.season,
  moves,
  transfers: s.football.transferHistory.length,
});
