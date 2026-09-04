/* Verification for club reputation, strength, predictions, expectations and
   the league-browser data layer.
   Run with:  bun src/lib/game/__checks__/reputation.check.ts
*/
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import {
  clubReputation,
  clubStrengthFor,
  strengthParts,
  predictLeague,
  predictSeason,
  predictionFor,
  expectationFor,
  applySeasonIdentity,
  reputationDelta,
  MAX_REP_CHANGE_PER_SEASON,
  REP_MIN,
  REP_MAX,
  initClubReputations,
  storePredictions,
} from "../reputation";
import {
  simulateAiFixture,
  tableFor,
  leagueFixtures,
  historicalTable,
  completedSeasons,
} from "../league";
import { DIVISION_ONE, DIVISION_TWO, makePyramidSchedule } from "../pyramid";
import type { GameState, ExpectationLevel } from "../types";
import { clubFootballStrength } from "../footballStrength";
import { isUserClubReference } from "../clubReference";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

function fresh(seed = "REP_SEED_1"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  g.leagueSchedule = makePyramidSchedule(g.leagues, `${seed}|season1`);
  g.fixtures = g.leagueSchedule
    .filter((f) => isUserClubReference(g, f.home) || isUserClubReference(g, f.away))
    .map((f) => ({
      week: f.week,
      opponent: isUserClubReference(g, f.home) ? f.away : f.home,
      home: isUserClubReference(g, f.home),
    }))
    .sort((a, b) => a.week - b.week);
  // Re-seed the identity layer under the fixed test seed.
  g.clubReputations = initClubReputations(g.leagues, seed);
  g.seasonPredictions = [];
  storePredictions(g, 1);
  return g;
}

function playSeason(g0: GameState): GameState {
  let s = g0;
  for (let i = 0; i < 46; i++) s = advanceWeek(s);
  return s;
}

/* ------------------------------------------------------------------ */
console.log("\n[R1] Reputation persistence");
{
  const g = fresh();
  const worldClubCount = g.leagues.reduce((sum, league) => sum + league.clubIds.length, 0);
  const before = Object.fromEntries(
    Object.keys(g.clubReputations).map((c) => [c, clubReputation(g, c)]),
  );
  check(
    "every pyramid club has a reputation",
    Object.keys(g.clubReputations).length === worldClubCount,
  );
  check(
    "reputations sit inside 0-100",
    Object.values(before).every((v) => v >= REP_MIN && v <= REP_MAX),
  );
  const s2 = playSeason(g);
  check("season rolled over", s2.season === 2);
  check(
    "reputation map survives the rollover (no reset)",
    Object.keys(s2.clubReputations).length === worldClubCount,
  );
  const moved = Object.keys(before).filter((c) => s2.clubReputations[c] !== before[c]);
  check(
    "reputation carries over, adjusted not rebuilt",
    moved.length > 0 && moved.length <= worldClubCount,
  );
  const s3 = playSeason(s2);
  check(
    "still persistent after a second season",
    s3.season === 3 && Object.keys(s3.clubReputations).length === worldClubCount,
  );
}

console.log("\n[R2] Promotion raises reputation, relegation lowers it");
{
  const g = fresh("REP_SEED_2");
  const before = { ...g.clubReputations };
  const s2 = playSeason(g);
  const hist = s2.seasonHistory.filter((h) => h.season === 1);
  const promoted = hist.flatMap((h) => h.promoted);
  const relegated = hist.flatMap((h) => h.relegated);
  check(
    "promotion + relegation happened",
    promoted.length > 0 && relegated.length > 0 && promoted.length === relegated.length,
    `${promoted.length} promoted / ${relegated.length} relegated`,
  );
  check(
    "every promoted club gained reputation",
    promoted.every((c) => s2.clubReputations[c] > before[c]),
    promoted.map((c) => `${c} ${before[c]}->${s2.clubReputations[c]}`).join(", "),
  );
  check(
    "every relegated club lost reputation",
    relegated.every((c) => s2.clubReputations[c] < before[c]),
    relegated.map((c) => `${c} ${before[c]}->${s2.clubReputations[c]}`).join(", "),
  );
}

console.log("\n[R3] Reputation changes stay inside configured limits");
{
  const g = fresh("REP_SEED_3");
  let s = g;
  let prev = { ...s.clubReputations };
  for (let season = 0; season < 4; season++) {
    s = playSeason(s);
    for (const club of Object.keys(s.clubReputations)) {
      const d = Math.abs(s.clubReputations[club] - (prev[club] ?? 0));
      if (d > MAX_REP_CHANGE_PER_SEASON + 1e-9) {
        check(`season delta cap respected for ${club}`, false, `moved ${d}`);
      }
    }
    prev = { ...s.clubReputations };
  }
  check("no club moved more than the per-season cap in 4 seasons", true);
  check(
    "all reputations remain within 0-100",
    Object.values(s.clubReputations).every((v) => v >= REP_MIN && v <= REP_MAX),
  );
  check(
    "delta formula is hard-capped",
    [
      reputationDelta({
        actualFinish: 1,
        expectedFinish: 20,
        size: 20,
        champion: true,
        runnerUp: false,
        promoted: true,
        relegated: false,
        streak: 3,
      }),
      reputationDelta({
        actualFinish: 20,
        expectedFinish: 1,
        size: 20,
        champion: false,
        runnerUp: false,
        promoted: false,
        relegated: true,
        streak: -3,
      }),
    ].every((d) => Math.abs(d) <= MAX_REP_CHANGE_PER_SEASON),
  );
}

console.log("\n[R4] Strength is deterministic and derived");
{
  const a = fresh("REP_SEED_4");
  const b = fresh("REP_SEED_4");
  const clubs = a.leagues.flatMap((l) => l.clubIds);
  check(
    "same save => identical strengths",
    clubs.every((c) => clubStrengthFor(a, c, 1) === clubStrengthFor(b, c, 1)),
  );
  check(
    "repeated calls are stable",
    clubs.every((c) => clubStrengthFor(a, c, 1) === clubStrengthFor(a, c, 1)),
  );
  const other = fresh("REP_SEED_4X");
  check(
    "different save seed changes strengths",
    clubs.some((c) => clubStrengthFor(other, c, 1) !== clubStrengthFor(a, c, 1)),
  );
  const src = require("fs").readFileSync("src/lib/game/reputation.ts", "utf8");
  check("reputation module contains no Math.random", !/Math\.random/.test(src));
  check("strength is not persisted on state", !Object.keys(a).some((k) => /strength/i.test(k)));
  // Tier influences the average but does not hard-limit either division.
  const t1 = a.leagues[0].clubIds.map((c) => clubStrengthFor(a, c, 1));
  const t2 = a.leagues[1].clubIds.map((c) => clubStrengthFor(a, c, 1));
  const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  check("Division One is stronger on average", avg(t1) > avg(t2));
  check(
    "no hard tier boundary (best tier-2 beats worst tier-1)",
    Math.max(...t2) > Math.min(...t1),
  );
  const parts = strengthParts(a, a.clubName, 1);
  check(
    "strength decomposes into named parts",
    Math.abs(
      parts.base + parts.tier + parts.form + parts.movement + parts.variation - parts.total,
    ) < 0.02,
  );
}

console.log("\n[R5] Stronger clubs win more often over large simulations");
{
  const g = fresh("REP_SEED_5");
  const clubs = g.leagues[0].clubIds;
  const ranked = [...clubs].sort(
    (x, y) => clubFootballStrength(g, y, 1) - clubFootballStrength(g, x, 1),
  );
  const strong = ranked[0];
  const weak = ranked[ranked.length - 1];
  let strongWins = 0,
    weakWins = 0;
  for (let round = 1; round <= 400; round++) {
    const r = simulateAiFixture(g, 1, round, strong, weak, DIVISION_ONE);
    if (r.homeGoals > r.awayGoals) strongWins++;
    else if (r.homeGoals < r.awayGoals) weakWins++;
    const r2 = simulateAiFixture(g, 1, round, weak, strong, DIVISION_ONE);
    if (r2.awayGoals > r2.homeGoals) strongWins++;
    else if (r2.awayGoals < r2.homeGoals) weakWins++;
  }
  check(
    "strongest club beats weakest far more often",
    strongWins > weakWins * 1.8,
    `${strongWins} vs ${weakWins}`,
  );

  // Table-level: canonical football strength is the actual match-simulation input.
  // Verify that quality remains positively associated with final position in the
  // player's current Focus division, where detailed squad state is available.
  let rankScore = 0;
  let samples = 0;
  for (const seed of ["REP_SEED_5A", "REP_SEED_5B", "REP_SEED_5C", "REP_SEED_5D"]) {
    const sample = fresh(seed);
    const focusLeague = sample.leagues.find((league) => league.id === sample.playerLeagueId)!;
    const sampleClubs = focusLeague.clubIds;
    const preRank = new Map(
      [...sampleClubs]
        .sort(
          (x, y) =>
            clubFootballStrength(sample, y, 1) - clubFootballStrength(sample, x, 1),
        )
        .map((club, index) => [club, index + 1]),
    );
    const played = playSeason(sample);
    const finalTable = played.seasonHistory.find(
      (h) => h.season === 1 && h.leagueId === focusLeague.id,
    )!.finalTable;
    const finalRank = new Map(finalTable.map((row, index) => [row.team, index + 1]));
    for (const club of sampleClubs) {
      const pre = preRank.get(club)!;
      const post = finalRank.get(club)!;
      rankScore += (10.5 - pre) * (10.5 - post);
      samples++;
    }
  }
  check(
    "canonical focus strength is positively associated with final position",
    samples > 0 && rankScore > 0,
    `rank association ${rankScore.toFixed(1)} across ${samples} club-seasons`,
  );
}

console.log("\n[R6] Predictions are deterministic and complete");
{
  const a = fresh("REP_SEED_6");
  const b = fresh("REP_SEED_6");
  check(
    "predictions stored for every division at kick-off",
    a.seasonPredictions.filter((p) => p.season === 1).length === a.leagues.length,
  );
  const pa = predictSeason(a, 1);
  const pb = predictSeason(b, 1);
  check("same save => identical predictions", JSON.stringify(pa) === JSON.stringify(pb));
  check(
    "stored predictions match a fresh calculation",
    JSON.stringify(a.seasonPredictions.filter((p) => p.season === 1)) === JSON.stringify(pa),
  );
  for (const p of pa) {
    check(
      `${p.leagueId}: predicted champion is the strongest club`,
      p.predictedChampion === p.clubs[0].club && p.clubs[0].rank === 1,
    );
    check(
      `${p.leagueId}: ranks are 1..n with no gaps`,
      p.clubs.every((c, i) => c.rank === i + 1) && p.clubs.length === 20,
    );
  }
  const t2 = pa.find((p) => p.leagueId === DIVISION_TWO)!;
  check("tier 2 has promotion favourites", t2.promotionFavourites.length >= 2);
  const t1 = pa.find((p) => p.leagueId === DIVISION_ONE)!;
  check("tier 1 has relegation favourites", t1.relegationFavourites.length >= 2);
  const s2 = playSeason(a);
  check(
    "next season is projected at rollover",
    s2.seasonPredictions.filter((p) => p.season === 2).length === s2.leagues.length,
  );
  check(
    "previous season's prediction is not rewritten",
    JSON.stringify(s2.seasonPredictions.filter((p) => p.season === 1)) === JSON.stringify(pa),
  );
}

console.log("\n[R7] Every club receives exactly one expectation");
{
  const g = fresh("REP_SEED_7");
  const preds = predictSeason(g, 1);
  const all = preds.flatMap((p) => p.clubs);
  check(
    "every world club projected",
    all.length === g.leagues.reduce((sum, league) => sum + league.clubIds.length, 0),
  );
  const seen = new Map<string, number>();
  for (const c of all) seen.set(c.club, (seen.get(c.club) ?? 0) + 1);
  check(
    "no club appears twice",
    [...seen.values()].every((n) => n === 1),
  );
  const levels: ExpectationLevel[] = [
    "winLeague",
    "promotion",
    "topHalf",
    "midTable",
    "avoidRelegation",
    "survival",
  ];
  check(
    "every club has a valid expectation",
    all.every((c) => levels.includes(c.expectation)),
  );
  const t1 = g.leagues[0];
  check("expectation is a pure function of rank", expectationFor(1, t1) === expectationFor(1, t1));
  check("top of tier 1 is asked to win the league", expectationFor(1, t1) === "winLeague");
  check("bottom of tier 1 is asked to survive", expectationFor(20, t1) === "survival");
  check(
    "top of tier 2 is asked to push for promotion",
    expectationFor(1, g.leagues[1]) === "promotion",
  );
}

console.log("\n[R8] Auto-resolved user matches are reproducible");
{
  const g = fresh("REP_SEED_8");
  // advance to the first user league fixture
  let s = g;
  while (!s.fixtures.some((f) => f.week === s.week)) s = advanceWeek(s);
  const snapshot = structuredClone(s); // simulates a save/reload
  const a = advanceWeek(s);
  const b = advanceWeek(snapshot);
  const ra = a.results[a.results.length - 1];
  const rb = b.results[b.results.length - 1];
  check(
    "same state => same scoreline",
    ra.goalsFor === rb.goalsFor && ra.goalsAgainst === rb.goalsAgainst,
    `${ra.goalsFor}-${ra.goalsAgainst} vs ${rb.goalsFor}-${rb.goalsAgainst}`,
  );
  check(
    "same attendance and gate",
    ra.attendance === rb.attendance && ra.gateReceipts === rb.gateReceipts,
  );
  check(
    "same stored match record",
    JSON.stringify(a.matchRecords.filter((r) => r.userInvolved)) ===
      JSON.stringify(b.matchRecords.filter((r) => r.userInvolved)),
  );
  const src = require("fs").readFileSync("src/lib/game/engine.ts", "utf8");
  const userBlock = src.slice(
    src.indexOf("Auto-resolved user match"),
    src.indexOf("Single matchday-finance path"),
  );
  check("auto-resolve path contains no Math.random", !/Math\.random/.test(userBlock));
}

console.log("\n[R9] Historical snapshots are immutable");
{
  const g = fresh("REP_SEED_9");
  const s2 = playSeason(g);
  const snaps1 = s2.clubSnapshots.filter((x) => x.season === 1);
  const worldClubCount = g.leagues.reduce((sum, league) => sum + league.clubIds.length, 0);
  check("one snapshot per club for season 1", snaps1.length === worldClubCount);
  check(
    "snapshot carries reputation, strength, expected + actual finish",
    snaps1.every(
      (x) =>
        typeof x.reputation === "number" &&
        typeof x.strength === "number" &&
        x.expectedFinish >= 1 &&
        x.actualFinish >= 1 &&
        typeof x.reputationAfter === "number",
    ),
  );
  const frozen = JSON.stringify(snaps1);
  const s3 = playSeason(s2);
  check(
    "season 1 snapshots untouched after season 2",
    JSON.stringify(s3.clubSnapshots.filter((x) => x.season === 1)) === frozen,
  );
  check(
    "season 2 snapshots appended",
    s3.clubSnapshots.filter((x) => x.season === 2).length === worldClubCount,
  );
  // Re-running the identity pass for an already-recorded season adds nothing.
  const before = s3.clubSnapshots.length;
  applySeasonIdentity(s3, 1, [
    {
      leagueId: DIVISION_ONE,
      tier: 1,
      table: s3.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_ONE)!
        .finalTable,
      champion: "",
      runnerUp: null,
      promoted: [],
      relegated: [],
    },
  ]);
  check("identity pass is idempotent per season", s3.clubSnapshots.length === before);
}

console.log("\n[R10] League browser data layer");
{
  const g = fresh("REP_SEED_10");
  for (const lid of [DIVISION_ONE, DIVISION_TWO]) {
    const t = tableFor(g, lid);
    check(`${lid}: table has 20 rows`, t.length === 20);
    check(
      `${lid}: reads live state (all zeroed pre-season)`,
      t.every((r) => r.p === 0),
    );
    const fx = leagueFixtures(g, lid);
    check(`${lid}: 380 fixtures listed`, fx.length === 380);
    check(
      `${lid}: nothing played yet`,
      fx.every((f) => !f.record),
    );
    check(
      `${lid}: fixtures only from this division`,
      fx.every((f) => f.league === lid),
    );
  }
  const s2 = playSeason(g);
  for (const lid of [DIVISION_ONE, DIVISION_TWO]) {
    const played = leagueFixtures(s2, lid, 1).filter((f) => f.record);
    check(`${lid}: season 1 fully played in the browser view`, played.length === 380);
    const hist = historicalTable(s2, 1, lid)!;
    check(`${lid}: historical final table available`, !!hist && hist.length === 20);
    check(`${lid}: history matches the played fixtures`, hist.reduce((a, r) => a + r.p, 0) === 760);
    check(
      `${lid}: history is sorted by points`,
      hist.every((r, i) => i === 0 || hist[i - 1].pts >= r.pts),
    );
  }
  check("completed seasons listed", completedSeasons(s2).join(",") === "1");
  // Viewing history must not disturb the live season.
  const liveBefore = JSON.stringify(tableFor(s2, DIVISION_ONE));
  historicalTable(s2, 1, DIVISION_ONE);
  leagueFixtures(s2, DIVISION_TWO, 1);
  check(
    "browsing history leaves current season untouched",
    JSON.stringify(tableFor(s2, DIVISION_ONE)) === liveBefore,
  );
  check(
    "current season table is empty again after rollover",
    tableFor(s2, DIVISION_ONE).every((r) => r.p === 0),
  );
}

console.log("\n[R11] Save migration (v4 → v5)");
{
  const g = fresh("REP_SEED_11") as unknown as Record<string, unknown>;
  g.version = 4;
  delete g.clubReputations;
  delete g.seasonPredictions;
  delete g.clubSnapshots;
  const m = migrateSave(structuredClone(g));
  const migratedClubCount = m.leagues.reduce((sum, league) => sum + league.clubIds.length, 0);
  check("migrated to current schema", (m.version as number) === SAVE_VERSION);
  check(
    "reputations backfilled for every club",
    Object.keys(m.clubReputations).length === migratedClubCount &&
      Object.values(m.clubReputations).every((v) => v >= REP_MIN && v <= REP_MAX),
  );
  check(
    "current season projected on migration",
    m.seasonPredictions.filter((p) => p.season === m.season).length === m.leagues.length,
  );
  check("no historical seasons invented", m.clubSnapshots.length === 0);
  const again = migrateSave(structuredClone(m) as unknown as Record<string, unknown>);
  check(
    "migration is idempotent",
    JSON.stringify(again.clubReputations) === JSON.stringify(m.clubReputations) &&
      again.seasonPredictions.length === m.seasonPredictions.length,
  );
  // An existing save with hand-set reputations keeps them.
  const kept = structuredClone(g);
  kept.clubReputations = { "Dalton Town": 12.5 };
  const m2 = migrateSave(kept);
  check("existing reputation values are preserved", m2.clubReputations["Dalton Town"] === 12.5);
  check(
    "initClubReputations is deterministic",
    JSON.stringify(initClubReputations(m.leagues, "X")) ===
      JSON.stringify(initClubReputations(m.leagues, "X")),
  );
}

console.log("\n[R12] Promoted / relegated clubs evolve rather than jump");
{
  const g = fresh("REP_SEED_12");
  const s2 = playSeason(g);
  const h = s2.seasonHistory.filter((e) => e.season === 1);
  const promoted = h.flatMap((e) => e.promoted);
  const relegated = h.flatMap((e) => e.relegated);
  const t1 = s2.leagues.find((l) => l.tier === 1)!;
  for (const c of promoted) {
    const destination = s2.leagues.find((league) => league.clubIds.includes(c))!;
    const parts = strengthParts(s2, c, 2);
    check(
      `promoted ${c} carries the promotion adaptation into tier ${destination.tier}`,
      parts.movement === -3.5,
      `movement ${parts.movement}`,
    );
  }
  for (const c of relegated) {
    const destination = s2.leagues.find((league) => league.clubIds.includes(c))!;
    const parts = strengthParts(s2, c, 2);
    check(
      `relegated ${c} retains the relegation class modifier in tier ${destination.tier}`,
      parts.movement === 3.5,
      `movement ${parts.movement}`,
    );
  }
  const pred2 = predictionFor(s2, 2, DIVISION_ONE)!;
  check(
    "season 2 projection covers the new tier-1 membership",
    pred2.clubs.length === 20 && pred2.clubs.every((c) => t1.clubIds.includes(c.club)),
  );
  const lg = predictLeague(s2, t1, 2);
  check("stored projection equals a fresh one", JSON.stringify(lg) === JSON.stringify(pred2));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);