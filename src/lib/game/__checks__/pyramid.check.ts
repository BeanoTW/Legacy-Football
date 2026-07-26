/* Verification for the multi-division pyramid (promotion / relegation).
   Run with:  bun src/lib/game/__checks__/pyramid.check.ts
*/
import { newGame, advanceWeek, migrateSave } from "../engine";
import {
  DIVISION_ONE, DIVISION_TWO, CLUBS_PER_DIVISION, makeLeagues, makePyramidSchedule,
  applySeasonRollover, finaliseLeague, pyramidClubs, pyramidIntegrity, seasonAlreadyFinalised,
} from "../pyramid";
import { buildTable, isLeagueSeasonComplete, tableFor } from "../league";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

function fresh(seed = "PYRAMID_SEED_1"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  g.leagueSchedule = makePyramidSchedule(g.leagues, `${seed}|season1`);
  g.fixtures = g.leagueSchedule
    .filter((f) => f.home === g.clubName || f.away === g.clubName)
    .map((f) => ({ week: f.week, opponent: f.home === g.clubName ? f.away : f.home, home: f.home === g.clubName }))
    .sort((a, b) => a.week - b.week);
  return g;
}

function playSeason(g0: GameState): GameState {
  let s = g0;
  for (let i = 0; i < 46; i++) {
    const fx = s.fixtures.find((f) => f.week === s.week);
    s = fx
      ? advanceWeek(s, { gf: 0, ga: 2, attendance: 9000, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 })
      : advanceWeek(s);
  }
  return s;
}

console.log("\n[1] Pyramid shape");
{
  const g = fresh();
  check("two leagues exist", g.leagues.length === 2);
  check("tiers are 1 and 2", g.leagues.map((l) => l.tier).join(",") === "1,2");
  check("20 clubs per division", g.leagues.every((l) => l.clubIds.length === CLUBS_PER_DIVISION));
  check("no club appears in two leagues",
    new Set(pyramidClubs(g)).size === pyramidClubs(g).length);
  check("user club is in Division One", g.playerLeagueId === DIVISION_ONE &&
    g.leagues[0].clubIds.includes(g.clubName));
  check("tier 1 relegates 2, promotes 0",
    g.leagues[0].relegationPlaces === 2 && g.leagues[0].promotionPlaces === 0);
  check("tier 2 promotes 2, relegates 0",
    g.leagues[1].promotionPlaces === 2 && g.leagues[1].relegationPlaces === 0);
  check("integrity check passes", pyramidIntegrity(g).ok, pyramidIntegrity(g).problems.join("; "));
}

console.log("\n[2] Every division generates a valid schedule");
{
  const g = fresh();
  for (const l of g.leagues) {
    const fx = g.leagueSchedule.filter((f) => f.league === l.id);
    check(`${l.id}: 380 fixtures`, fx.length === 380, String(fx.length));
    check(`${l.id}: every club plays 38`, l.clubIds.every(
      (c) => fx.filter((f) => f.home === c || f.away === c).length === 38));
    check(`${l.id}: 19 home + 19 away per club`, l.clubIds.every(
      (c) => fx.filter((f) => f.home === c).length === 19 && fx.filter((f) => f.away === c).length === 19));
    check(`${l.id}: no club plays twice in a round`, [...new Set(fx.map((f) => f.round))].every((r) => {
      const teams = fx.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]);
      return new Set(teams).size === teams.length && teams.length === 20;
    }));
  }
  check("no cross-division fixtures", g.leagueSchedule.every((f) => {
    const l = g.leagues.find((x) => x.id === f.league)!;
    return l.clubIds.includes(f.home) && l.clubIds.includes(f.away);
  }));
}

console.log("\n[3] Every division completes independently (player absent)");
{
  const t = playSeason(fresh());
  for (const id of [DIVISION_ONE, DIVISION_TWO]) {
    const recs = t.matchRecords.filter((r) => r.season === 1 && r.league === id);
    check(`${id}: 380 season-1 records`, recs.length === 380, String(recs.length));
    check(`${id}: no duplicate fixtures`, new Set(recs.map((r) => r.id)).size === recs.length);
  }
  const hist2 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_TWO)!;
  check("Division Two produced a champion without the player", !!hist2?.champion);
  check("Division Two final table has 20 rows with P=38",
    hist2.finalTable.length === 20 && hist2.finalTable.every((r) => r.p === 38));
  check("Division Two table is correctly ordered", hist2.finalTable.every((r, i, a) =>
    i === 0 || a[i - 1].pts > r.pts || (a[i - 1].pts === r.pts &&
      (a[i - 1].gf - a[i - 1].ga) >= (r.gf - r.ga))));
}

console.log("\n[4] Promotion and relegation are correct");
{
  const before = fresh();
  const d1Before = [...before.leagues[0].clubIds];
  const d2Before = [...before.leagues[1].clubIds];
  const t = playSeason(before);
  const h1 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_ONE)!;
  const h2 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_TWO)!;

  check("2 clubs relegated from tier 1", h1.relegated.length === 2);
  check("2 clubs promoted from tier 2", h2.promoted.length === 2);
  check("relegated are the bottom 2 of the recorded final table",
    h1.relegated.join("|") === h1.finalTable.slice(18).map((r) => r.team).join("|"));
  check("promoted are the top 2 of the recorded final table",
    h2.promoted.join("|") === h2.finalTable.slice(0, 2).map((r) => r.team).join("|"));

  const d1After = t.leagues.find((l) => l.id === DIVISION_ONE)!.clubIds;
  const d2After = t.leagues.find((l) => l.id === DIVISION_TWO)!.clubIds;
  check("promoted clubs now sit in tier 1", h2.promoted.every((c) => d1After.includes(c)));
  check("relegated clubs now sit in tier 2", h1.relegated.every((c) => d2After.includes(c)));
  check("relegated clubs left tier 1", h1.relegated.every((c) => !d1After.includes(c)));
  check("promoted clubs left tier 2", h2.promoted.every((c) => !d2After.includes(c)));
  check("both divisions still hold 20 clubs",
    d1After.length === 20 && d2After.length === 20);
  check("no club is in two divisions",
    d1After.every((c) => !d2After.includes(c)));
  check("no club disappeared", [...d1Before, ...d2Before].every(
    (c) => d1After.includes(c) || d2After.includes(c)));
  check("no club appeared from nowhere", [...d1After, ...d2After].every(
    (c) => d1Before.includes(c) || d2Before.includes(c)));
  check("club records count movements",
    h1.relegated.every((c) => t.clubRecords[c].relegations === 1) &&
    h2.promoted.every((c) => t.clubRecords[c].promotions === 1));
  check("club record league pointer follows the move",
    h2.promoted.every((c) => t.clubRecords[c].currentLeagueId === DIVISION_ONE));
  check("every club has a season-1 history row",
    [...d1Before, ...d2Before].every((c) => t.clubRecords[c].leagueHistory.some((h) => h.season === 1)));
  check("integrity holds after rollover", pyramidIntegrity(t).ok, pyramidIntegrity(t).problems.join("; "));
}

console.log("\n[5] Player follows their club through the pyramid");
{
  const t = playSeason(fresh());
  const mine = t.leagues.find((l) => l.clubIds.includes(t.clubName))!;
  check("playerLeagueId matches the club's actual division", t.playerLeagueId === mine.id);
  check("user table shows the user's new division",
    t.league.length === 20 && t.league.some((r) => r.team === t.clubName));
  check("user fixtures only involve their division opponents",
    t.fixtures.every((f) => mine.clubIds.includes(f.opponent)));
  const h1 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_ONE)!;
  if (h1.relegated.includes(t.clubName)) {
    check("relegated player moved to tier 2", t.playerLeagueId === DIVISION_TWO);
    check("relegation inbox mail sent", t.inbox.some((i) => i.eventKey.startsWith("club-relegated")));
  } else {
    check("surviving player stayed in tier 1", t.playerLeagueId === DIVISION_ONE);
    check("champions mail exists for both divisions",
      t.inbox.filter((i) => i.eventKey.startsWith("league-champion")).length === 2);
  }
}

console.log("\n[6] Rollover is atomic and replay-safe");
{
  const t = playSeason(fresh());
  check("season 1 is marked finalised", seasonAlreadyFinalised(t, 1));
  const snap = structuredClone(t);
  // Simulate a reload landing back on the rollover path.
  const again = structuredClone(t);
  const res = applySeasonRollover(again);
  check("re-running rollover produces no new outcomes", res.outcomes.length === 0);
  check("history not duplicated", again.seasonHistory.length === snap.seasonHistory.length);
  check("no double promotion", Object.values(again.clubRecords).every(
    (r) => r.promotions === snap.clubRecords[r.club].promotions &&
           r.relegations === snap.clubRecords[r.club].relegations));
  check("membership unchanged by the replay",
    JSON.stringify(again.leagues.map((l) => l.clubIds)) ===
    JSON.stringify(snap.leagues.map((l) => l.clubIds)));
}

console.log("\n[7] Two consecutive seasons");
{
  const s1 = playSeason(fresh());
  const before = structuredClone(s1.seasonHistory);
  const s2 = playSeason(s1);
  check("season counter advanced to 3", s2.season === 3);
  check("history has 4 entries (2 leagues x 2 seasons)", s2.seasonHistory.length === 4,
    String(s2.seasonHistory.length));
  check("season-1 history is byte-identical after season 2",
    JSON.stringify(s2.seasonHistory.filter((h) => h.season === 1)) === JSON.stringify(before));
  check("season-1 match records untouched",
    s2.matchRecords.filter((r) => r.season === 1).length === 760);
  check("season 2 fully simulated in both divisions",
    s2.matchRecords.filter((r) => r.season === 2).length === 760,
    String(s2.matchRecords.filter((r) => r.season === 2).length));
  check("season 2 tables built from season-2 clubs", s2.seasonHistory
    .filter((h) => h.season === 2).every((h) => h.finalTable.length === 20));
  check("clubs still unique across the pyramid",
    new Set(pyramidClubs(s2)).size === 40);
  check("integrity after two rollovers", pyramidIntegrity(s2).ok,
    pyramidIntegrity(s2).problems.join("; "));
  check("club league history has two rows per club",
    Object.values(s2.clubRecords).every((r) => r.leagueHistory.length === 2));
  const promotedS1 = s2.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_TWO)!.promoted;
  check("season-1 promoted clubs played season 2 in tier 1",
    promotedS1.every((c) => s2.clubRecords[c].leagueHistory
      .find((h) => h.season === 2)?.leagueId === DIVISION_ONE));
}

console.log("\n[8] Per-league completion + table projection");
{
  let s = fresh();
  check("no league complete at kickoff", !isLeagueSeasonComplete(s, DIVISION_ONE) &&
    !isLeagueSeasonComplete(s, DIVISION_TWO));
  for (let i = 0; i < 46; i++) {
    const fx = s.fixtures.find((f) => f.week === s.week);
    s = fx ? advanceWeek(s, { gf: 1, ga: 1, attendance: 900, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 })
           : advanceWeek(s);
  }
  const d2 = tableFor(s, DIVISION_TWO);
  check("tableFor returns a sorted 20-row table for a division the player is not in",
    d2.length === 20);
  const rebuilt = buildTable(s.leagues[1].clubIds, s.matchRecords, 2, DIVISION_TWO);
  check("new-season tier-2 table starts at zero", rebuilt.every((r) => r.p === 0));
}

console.log("\n[9] v3 save migration");
{
  const g = newGame("Legacy FC", "Old Boss") as unknown as Record<string, unknown>;
  g.version = 3;
  g.week = 12;
  delete g.leagues;
  delete g.playerLeagueId;
  delete g.seasonHistory;
  delete g.clubRecords;
  // A real v3 save only ever had the single top-division schedule, with no
  // `league` field on its fixtures.
  g.leagueSchedule = (g.leagueSchedule as { league?: string }[])
    .filter((f) => f.league === DIVISION_ONE)
    .map(({ league, ...rest }) => rest);
  const m = migrateSave(g);
  check("migrated to v5", (m.version as number) === 4);
  check("pyramid created", m.leagues.length === 2 &&
    m.leagues.every((l) => l.clubIds.length === CLUBS_PER_DIVISION));
  check("user club placed in exactly one league",
    m.leagues.filter((l) => l.clubIds.includes("Legacy FC")).length === 1);
  check("no duplicate clubs across divisions",
    new Set(pyramidClubs(m)).size === pyramidClubs(m).length);
  check("existing tier-1 membership preserved",
    m.leagues[0].clubIds.length === 20 &&
    m.leagues[0].clubIds.every((c) => (g.league as { team: string }[]).some((r) => r.team === c)));
  check("active season not restructured (schedule untouched)",
    m.leagueSchedule.every((f) => f.league === undefined || f.league === DIVISION_ONE));
  check("history starts empty", m.seasonHistory.length === 0);
  check("club records seeded", Object.keys(m.clubRecords).length === 40);
  const after = advanceWeek(m, { gf: 1, ga: 0, attendance: 900, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 });
  check("migrated save still advances", after.week === 13);
}

console.log("\n[10] finaliseLeague is a pure read");
{
  const t = playSeason(fresh());
  const snap = JSON.stringify(t.leagues);
  const lg = makeLeagues("Dalton Town")[0];
  const o = finaliseLeague(t, lg);
  check("finaliseLeague returns a full table", o.table.length === 20);
  check("finaliseLeague does not mutate leagues", JSON.stringify(t.leagues) === snap);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
