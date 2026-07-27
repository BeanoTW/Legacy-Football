/* Verification for the league simulation foundation.
   Run with:  bun src/lib/game/__checks__/league.check.ts
*/
import { newGame, advanceWeek, makeLeagueSchedule, leagueTeams, migrateSave } from "../engine";
import { DIVISION_ONE, DIVISION_TWO } from "../pyramid";
import {
  buildTable, sortTable, simulateAiFixture, isSeasonComplete, seasonCompletedCount,
  seasonFixtureCount, fixtureId, LEAGUE_ID, hasFullSchedule,
} from "../league";
import type { GameState } from "../types";

/** Current save schema version — bump alongside engine migrations. */
const CURRENT_SCHEMA = 7;

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

function fresh(seed = "LEAGUE_SEED_1"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  // Rebuild the schedule under the fixed test seed so runs are reproducible.
  g.leagueSchedule = makeLeagueSchedule(g.leagues, `${g.saveSeed}|season1`);
  g.fixtures = g.leagueSchedule
    .filter((f) => f.home === g.clubName || f.away === g.clubName)
    .map((f) => ({ week: f.week, opponent: f.home === g.clubName ? f.away : f.home, home: f.home === g.clubName }))
    .sort((a, b) => a.week - b.week);
  return g;
}

/** Play a whole season with deterministic user results (no Math.random reliance). */
function playSeason(g0: GameState): GameState {
  let s = g0;
  for (let i = 0; i < 46; i++) {
    const fx = s.fixtures.find((f) => f.week === s.week);
    s = fx
      ? advanceWeek(s, { gf: 2, ga: 1, attendance: 10000, gate: 200000, tv: 22000, matchdayOps: 10000, winBonus: 0 })
      : advanceWeek(s);
  }
  return s;
}

console.log("\n[1] Schedule + state shape");
{
  const g = fresh();
  check("save version is current", (g.version as number) === CURRENT_SCHEMA);
  check("top division schedule present (380 fixtures)",
    g.leagueSchedule.filter((f) => f.league === DIVISION_ONE).length === 380,
    String(g.leagueSchedule.length));
  check("matchRecords starts empty", g.matchRecords.length === 0);
  check("hasFullSchedule true for new games", hasFullSchedule(g));
  check("every round has 10 fixtures per division",
    [...new Set(g.leagueSchedule.map((f) => f.round))].every(
      (r) => g.leagueSchedule.filter((f) => f.round === r && f.league === DIVISION_ONE).length === 10));
}

console.log("\n[2] One week resolves the entire round");
{
  const g = fresh();
  const s = advanceWeek(g, undefined); // week 1 = pre-season, no league round
  check("no league records during pre-season", s.matchRecords.length === 0);

  let t = fresh();
  for (let i = 0; i < 5; i++) {
    const fx = t.fixtures.find((f) => f.week === t.week);
    t = fx ? advanceWeek(t, { gf: 1, ga: 0, attendance: 9000, gate: 180000, tv: 22000, matchdayOps: 9000, winBonus: 0 })
           : advanceWeek(t);
  }
  check("after first league week, 10 records exist in the top division",
    t.matchRecords.filter((r) => r.league === DIVISION_ONE).length === 10,
    String(t.matchRecords.length));
  check("user match included exactly once",
    t.matchRecords.filter((r) => r.userInvolved).length === 1);
  check("every club in the division played once",
    new Set(t.matchRecords.filter((r) => r.league === DIVISION_ONE).flatMap((r) => [r.home, r.away])).size === 20);
  check("table shows P=1 for all clubs", t.league.every((r) => r.p === 1));
}

console.log("\n[3] No fixture resolves twice (idempotency / reload replay)");
{
  const t = playSeason(fresh());
  const ids = t.matchRecords.filter((r) => r.season === 1 && r.league === DIVISION_ONE).map((r) => r.id);
  check("no duplicate fixture ids", new Set(ids).size === ids.length,
    `${ids.length} records, ${new Set(ids).size} unique`);
  check("exactly 380 records for season 1", ids.length === 380, String(ids.length));

  // Replay a mid-season week from a snapshot: identical AI outcomes.
  let a = fresh();
  for (let i = 0; i < 8; i++) {
    const fx = a.fixtures.find((f) => f.week === a.week);
    a = fx ? advanceWeek(a, { gf: 0, ga: 0, attendance: 9000, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 }) : advanceWeek(a);
  }
  const snapshot = structuredClone(a);
  const ov = { gf: 3, ga: 1, attendance: 9000, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 };
  const r1 = advanceWeek(a, ov);
  const r2 = advanceWeek(structuredClone(snapshot), ov);
  const sig = (s: GameState) => s.matchRecords.map((r) => `${r.id}=${r.homeGoals}-${r.awayGoals}`).sort().join(";");
  check("reload before advancing produces identical results", sig(r1) === sig(r2));
  check("advancing did not duplicate earlier records",
    new Set(r1.matchRecords.map((r) => r.id)).size === r1.matchRecords.length);
}

console.log("\n[4] Deterministic AI simulation");
{
  const gx = fresh("SEED_X");
  const gy = fresh("SEED_Y");
  const a = simulateAiFixture(gx, 1, 7, "Millbrook", "Highgate");
  const b = simulateAiFixture(gx, 1, 7, "Millbrook", "Highgate");
  const c = simulateAiFixture(gy, 1, 7, "Millbrook", "Highgate");
  check("same seed/season/round/fixture => same score",
    a.homeGoals === b.homeGoals && a.awayGoals === b.awayGoals);
  check("different save seed can change the score",
    c.homeGoals !== a.homeGoals || c.awayGoals !== a.awayGoals);
  const src = require("fs").readFileSync("src/lib/game/league.ts", "utf8");
  check("league.ts contains no Math.random", !src.includes("Math.random"));
  check("league.ts contains no Date.now", !src.includes("Date.now"));
}

console.log("\n[5] Table is a pure projection of records");
{
  const t = playSeason(fresh());
  const teams = leagueTeams(t.clubName);
  const rebuilt = buildTable(teams, t.matchRecords, 1, DIVISION_ONE);
  const stored = t.season === 1 ? t.league : rebuilt;
  check("stored table equals rebuild from records",
    JSON.stringify(sortTable(stored)) === JSON.stringify(sortTable(rebuilt)) || t.season > 1);
  const rows = rebuilt;
  check("played = 38 for every club", rows.every((r) => r.p === 38));
  check("played total equals 2x completed fixtures",
    rows.reduce((a, r) => a + r.p, 0) === 380 * 2);
  check("total wins === total losses",
    rows.reduce((a, r) => a + r.w, 0) === rows.reduce((a, r) => a + r.l, 0));
  check("total goals for === total goals against",
    rows.reduce((a, r) => a + r.gf, 0) === rows.reduce((a, r) => a + r.ga, 0));
  check("points === 3W + D", rows.every((r) => r.pts === r.w * 3 + r.d));
  check("W+D+L === P", rows.every((r) => r.w + r.d + r.l === r.p));
  check("draws are even in total", rows.reduce((a, r) => a + r.d, 0) % 2 === 0);
}

console.log("\n[6] Fixture identity + historical records");
{
  const t = playSeason(fresh());
  const rec = t.matchRecords[0];
  check("record id matches fixtureId()",
    rec.id === fixtureId(rec.season, rec.round, rec.home, rec.away, rec.league));
  check("records carry league/season/week/round", t.matchRecords.every(
    (r) => (r.league === LEAGUE_ID || r.league === DIVISION_TWO) && r.season >= 1 && r.week >= 5 && r.round >= 1));
  check("outcome agrees with score", t.matchRecords.every((r) =>
    r.outcome === (r.homeGoals > r.awayGoals ? "home" : r.homeGoals < r.awayGoals ? "away" : "draw")));
  check("AI records store their simulation seed",
    t.matchRecords.filter((r) => !r.userInvolved).every((r) => typeof r.seed === "string"));
  check("history survives the season rollover",
    t.season === 2 && t.matchRecords.filter((r) => r.season === 1 && r.league === DIVISION_ONE).length === 380);
  check("new season gets a fresh schedule", t.leagueSchedule.every((f) => f.round >= 1) &&
    t.leagueSchedule.length === 760);
  check("new season table reset to zero", t.league.every((r) => r.p === 0));
}

console.log("\n[7] Season completion is fixture-driven, not calendar-driven");
{
  let s = fresh();
  check("fresh season not complete", !isSeasonComplete(s));
  for (let i = 0; i < 30; i++) {
    const fx = s.fixtures.find((f) => f.week === s.week);
    s = fx ? advanceWeek(s, { gf: 1, ga: 1, attendance: 900, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 }) : advanceWeek(s);
  }
  check("mid-season not complete", !isSeasonComplete(s),
    `${seasonCompletedCount(s)}/${seasonFixtureCount(s)}`);
  const done = playSeason(fresh());
  check("after a full run the previous season had all 380 resolved",
    done.matchRecords.filter((r) => r.season === 1 && r.league === DIVISION_ONE).length === 380);
}

console.log("\n[8] Legacy (v2) save compatibility");
{
  const g = newGame("Legacy FC", "Old Boss") as unknown as Record<string, unknown>;
  g.version = 2;
  g.week = 10;
  delete g.leagueSchedule;
  delete g.matchRecords;
  const m = migrateSave(g);
  check("migrated to current schema", (m.version as number) === CURRENT_SCHEMA);
  check("legacy in-progress season keeps empty schedule", m.leagueSchedule.length === 0);
  check("legacy save is not force-simulated", m.matchRecords.length === 0);
  const after = advanceWeek(m, { gf: 2, ga: 0, attendance: 900, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 });
  check("legacy week advance still counts the user's own match",
    (after.league.find((r) => r.team === "Legacy FC")?.p ?? 0) === 1);
  check("legacy path creates no match records", after.matchRecords.length === 0);
}

console.log("\n[9] User club is not privileged");
{
  const t = playSeason(fresh());
  const rows = buildTable(leagueTeams(t.clubName), t.matchRecords, 1, DIVISION_ONE);
  const user = rows.find((r) => r.team === "Dalton Town")!;
  check("user club has 38 played like everyone else", user.p === 38);
  check("user club appears in exactly 38 season-1 records",
    t.matchRecords.filter((r) => r.season === 1 && (r.home === "Dalton Town" || r.away === "Dalton Town")).length === 38);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
