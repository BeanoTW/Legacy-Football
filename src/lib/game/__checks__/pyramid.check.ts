/* Verification for the multi-division pyramid (promotion / relegation).
   Run with: bun src/lib/game/__checks__/pyramid.check.ts
*/
import {
  newGame,
  advanceDay,
  advanceWeek,
  migrateSave,
  SAVE_VERSION,
  simulateFixtureToday,
} from "../engine";
import {
  DIVISION_ONE,
  DIVISION_TWO,
  CLUBS_PER_DIVISION,
  makeLeagues,
  makePyramidSchedule,
  applySeasonRollover,
  finaliseLeague,
  pyramidClubs,
  pyramidIntegrity,
  seasonAlreadyFinalised,
} from "../pyramid";
import { buildTable, isLeagueSeasonComplete, tableFor } from "../league";
import type { GameState } from "../types";
import { canonicalClubReference, clubDisplayName, isUserClubReference } from "../clubReference";
import { WORLD_DIVISIONS } from "../worldPyramid";

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

function fresh(seed = "PYRAMID_SEED_1"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  g.leagueSchedule = makePyramidSchedule(g.leagues, `${seed}|season1`);
  g.fixtures = g.leagueSchedule
    .filter((f) => isUserClubReference(g, f.home) || isUserClubReference(g, f.away))
    .map((f) => ({
      week: f.week,
      opponent: isUserClubReference(g, f.home) ? f.away : f.home,
      home: isUserClubReference(g, f.home),
      competition: f.competition ?? "league",
      dayOfWeek: f.dayOfWeek ?? 5,
    }))
    .sort((a, b) => a.week - b.week || (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5));
  return g;
}

function playSeason(g0: GameState): GameState {
  let s = g0;
  const startingSeason = s.season;
  let guard = 0;
  while (s.season === startingSeason && guard < 600) {
    const beforeResults = s.results.length;
    const played = simulateFixtureToday(s);
    if (played.results.length > beforeResults) {
      s = played;
    } else {
      s = advanceDay(s);
    }
    guard += 1;
  }
  if (s.season === startingSeason) {
    throw new Error(`Season did not roll over within ${guard} calendar advances`);
  }
  return s;
}

console.log("\n[1] Pyramid shape");
{
  const g = fresh();
  const tiers = [...new Set(g.leagues.map((l) => l.tier))].sort((a, b) => a - b);
  const deepestTier = Math.max(...tiers);
  const deepest = g.leagues.filter((l) => l.tier === deepestTier);
  const mine = g.leagues.find((l) => l.clubIds.some((club) => isUserClubReference(g, club)));
  check("expanded world has every configured division", g.leagues.length === WORLD_DIVISIONS.length, String(g.leagues.length));
  check("tier levels are contiguous even with parallel divisions", tiers.join(",") === "1,2,3,4,5,6,7");
  check("four parallel regional divisions occupy the deepest tier", deepest.length === 4);
  check("configured club counts are respected", g.leagues.every((l) => l.clubIds.length === WORLD_DIVISIONS.find((d) => d.id === l.id)?.clubCount));
  check("no club appears in two leagues", new Set(pyramidClubs(g)).size === pyramidClubs(g).length);
  check("user club starts in a deepest regional division", !!mine && mine.tier === deepestTier && g.playerLeagueId === mine.id);
  check("tier 1 relegates 3, promotes 0", g.leagues[0].relegationPlaces === 3 && g.leagues[0].promotionPlaces === 0);
  check("every deepest regional league promotes and does not relegate", deepest.every((l) => l.promotionPlaces === 2 && l.relegationPlaces === 0));
  check("integrity check passes", pyramidIntegrity(g).ok, pyramidIntegrity(g).problems.join("; "));
}

console.log("\n[2] Every division generates a valid schedule");
{
  const g = fresh();
  for (const l of g.leagues) {
    const fx = g.leagueSchedule.filter((f) => f.league === l.id);
    const expectedMatches = l.clubIds.length * (l.clubIds.length - 1);
    const expectedClubMatches = (l.clubIds.length - 1) * 2;
    const expectedHome = l.clubIds.length - 1;
    check(`${l.id}: double round-robin fixture count`, fx.length === expectedMatches, String(fx.length));
    check(`${l.id}: every club plays full double round robin`, l.clubIds.every((c) => fx.filter((f) => f.home === c || f.away === c).length === expectedClubMatches));
    check(`${l.id}: balanced home and away schedule`, l.clubIds.every((c) => fx.filter((f) => f.home === c).length === expectedHome && fx.filter((f) => f.away === c).length === expectedHome));
    check(`${l.id}: no club plays twice in a round`, [...new Set(fx.map((f) => f.round))].every((r) => {
      const teams = fx.filter((f) => f.round === r).flatMap((f) => [f.home, f.away]);
      return new Set(teams).size === teams.length && teams.length === l.clubIds.length;
    }));
  }
  check("no cross-division fixtures", g.leagueSchedule.every((f) => {
    const l = g.leagues.find((x) => x.id === f.league)!;
    return l.clubIds.includes(f.home) && l.clubIds.includes(f.away);
  }));
}

console.log("\n[3] Every division completes independently");
{
  const t = playSeason(fresh());
  for (const l of t.leagues) {
    const recs = t.matchRecords.filter((r) => r.season === 1 && r.league === l.id);
    const hist = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === l.id)!;
    check(`${l.id}: complete season record count`, recs.length === l.clubIds.length * (l.clubIds.length - 1), String(recs.length));
    check(`${l.id}: no duplicate fixtures`, new Set(recs.map((r) => r.id)).size === recs.length);
    check(`${l.id}: final table is complete`, hist.finalTable.length === l.clubIds.length && hist.finalTable.every((r) => r.p === (l.clubIds.length - 1) * 2));
    check(`${l.id}: champion recorded`, !!hist.champion);
  }
}

console.log("\n[4] Linear promotion/relegation remains correct above regional tier");
{
  const before = fresh();
  const clubsBefore = pyramidClubs(before);
  const t = playSeason(before);
  const h1 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_ONE)!;
  const h2 = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === DIVISION_TWO)!;
  const d1After = t.leagues.find((l) => l.id === DIVISION_ONE)!.clubIds;
  const d2After = t.leagues.find((l) => l.id === DIVISION_TWO)!.clubIds;
  check("3 clubs relegated from tier 1", h1.relegated.length === 3);
  check("3 clubs promoted from tier 2", h2.promoted.length === 3);
  check("tier-1 relegated clubs are bottom three", h1.relegated.join("|") === h1.finalTable.slice(-3).map((r) => r.team).join("|"));
  check("tier-2 promoted clubs are top three", h2.promoted.join("|") === h2.finalTable.slice(0, 3).map((r) => r.team).join("|"));
  check("promoted clubs moved to tier 1", h2.promoted.every((c) => d1After.includes(c) && !d2After.includes(c)));
  check("relegated clubs moved to tier 2", h1.relegated.every((c) => d2After.includes(c) && !d1After.includes(c)));
  check("both divisions retain configured sizes", d1After.length === 20 && d2After.length === 24);
  const clubsAfter = pyramidClubs(t);
  check("no club disappeared or appeared", clubsBefore.length === clubsAfter.length && clubsBefore.every((c) => clubsAfter.includes(c)));
  check("club records count movements", h1.relegated.every((c) => t.clubRecords[c].relegations === 1) && h2.promoted.every((c) => t.clubRecords[c].promotions === 1));
  check("integrity holds after rollover", pyramidIntegrity(t).ok, pyramidIntegrity(t).problems.join("; "));
}

console.log("\n[5] Parallel Level 7 feeders preserve capacity");
{
  const before = fresh();
  const regional = before.leagues.filter((l) => l.tier === 7);
  const levelSix = before.leagues.filter((l) => l.tier === 6);
  const t = playSeason(before);
  const regionalHistory = regional.map((l) => t.seasonHistory.find((h) => h.season === 1 && h.leagueId === l.id)!);

  check(
    "all four regional divisions completed",
    regionalHistory.every((h) => {
      const expected = WORLD_DIVISIONS.find((d) => d.id === h.leagueId)?.clubCount;
      return h.finalTable.length === expected;
    }),
  );

  for (const upper of levelSix) {
    const feederIds = WORLD_DIVISIONS
      .filter((d) => d.tier === 7 && (d.feedsInto ?? []).includes(upper.id))
      .map((d) => d.id);
    const feederHistories = regionalHistory.filter((h) => feederIds.includes(h.leagueId));
    const promoted = feederHistories.flatMap((h) => h.promoted);
    const upperHistory = t.seasonHistory.find((h) => h.season === 1 && h.leagueId === upper.id)!;
    check(
      `${upper.id}: feeder promotions match relegation vacancies`,
      promoted.length === upperHistory.relegated.length,
      `${promoted.length}/${upperHistory.relegated.length}`,
    );
    check(
      `${upper.id}: promoted feeder clubs occupy the destination`,
      promoted.every((club) => t.leagues.find((l) => l.id === upper.id)!.clubIds.includes(club)),
    );
  }

  check(
    "every division retains configured size after regional movement",
    t.leagues.every((l) => l.clubIds.length === WORLD_DIVISIONS.find((d) => d.id === l.id)?.clubCount),
  );
  check("regional rollover keeps every club unique", new Set(pyramidClubs(t)).size === pyramidClubs(t).length);
}

console.log("\n[6] Player follows their actual club division");
{
  const initial = fresh();
  const startingLeague = initial.leagues.find((l) => l.id === initial.playerLeagueId)!;
  const t = playSeason(initial);
  const mine = t.leagues.find((l) => l.clubIds.some((club) => isUserClubReference(t, club)))!;
  check("playerLeagueId matches actual membership", t.playerLeagueId === mine.id);
  check("user table shows the user's division", t.league.length === mine.clubIds.length && t.league.some((r) => isUserClubReference(t, r.team)));
  check("user league fixtures only involve current-division opponents", t.fixtures.filter((f) => (f.competition ?? "league") === "league").every((f) => mine.clubIds.includes(f.opponent)));
  const h = t.seasonHistory.find((x) => x.season === 1 && x.leagueId === startingLeague.id)!;
  check("player either stays or follows a recorded promotion", mine.id === startingLeague.id || h.promoted.some((club) => isUserClubReference(t, club)));
  check("champion mail exists for every division", t.inbox.filter((i) => i.eventKey.startsWith("league-champion")).length === t.leagues.length);
}

console.log("\n[7] Rollover is atomic and replay-safe");
{
  const t = playSeason(fresh());
  check("season 1 is marked finalised", seasonAlreadyFinalised(t, 1));
  const snap = structuredClone(t);
  const again = structuredClone(t);
  const res = applySeasonRollover(again);
  check("re-running rollover produces no new outcomes", res.outcomes.length === 0);
  check("history not duplicated", again.seasonHistory.length === snap.seasonHistory.length);
  check("no double movement", Object.values(again.clubRecords).every((r) => r.promotions === snap.clubRecords[r.club].promotions && r.relegations === snap.clubRecords[r.club].relegations));
  check("membership unchanged by replay", JSON.stringify(again.leagues.map((l) => l.clubIds)) === JSON.stringify(snap.leagues.map((l) => l.clubIds)));
}

console.log("\n[8] Two consecutive seasons + projections");
{
  const s1 = playSeason(fresh());
  const before = structuredClone(s1.seasonHistory);
  const s2 = playSeason(s1);
  check("season counter advanced to 3", s2.season === 3);
  check("history has one entry per league and season", s2.seasonHistory.length === s2.leagues.length * 2, String(s2.seasonHistory.length));
  check("season-1 history remains byte-identical", JSON.stringify(s2.seasonHistory.filter((h) => h.season === 1)) === JSON.stringify(before));
  const expectedSeasonRecords = s2.leagues.reduce(
    (total, league) => total + league.clubIds.length * (league.clubIds.length - 1),
    0,
  );
  check(
    "both seasons contain every division's complete schedule",
    [1, 2].every((season) => s2.matchRecords.filter((r) => r.season === season).length === expectedSeasonRecords),
  );
  check("clubs remain unique", new Set(pyramidClubs(s2)).size === pyramidClubs(s2).length);
  check("integrity after two rollovers", pyramidIntegrity(s2).ok, pyramidIntegrity(s2).problems.join("; "));
  check("club league history has two rows per club", Object.values(s2.clubRecords).every((r) => r.leagueHistory.length === 2));
  const d2 = tableFor(s2, DIVISION_TWO);
  check("tableFor returns the full non-player division", d2.length === 24);
  const rebuilt = buildTable(s2.leagues.find((l) => l.id === DIVISION_TWO)!.clubIds, s2.matchRecords, 3, DIVISION_TWO);
  check("new-season table starts at zero", rebuilt.every((r) => r.p === 0));
  check("new season is not already complete", !isLeagueSeasonComplete(s2, DIVISION_TWO));
}

console.log("\n[9] v3 save migration expands without rewriting active top flight");
{
  const modern = newGame("Legacy FC", "Old Boss");
  const g = structuredClone(modern) as unknown as Record<string, unknown>;
  g.version = 3;
  g.week = 12;

  // A genuine v3 save stored the built-in source names, before opaque IDs
  // and before later presentation aliases existed. Reconstruct that historical
  // identity boundary from each club's immutable seed key rather than today's
  // displayed parody name, otherwise an alias change can falsely look like a
  // migration membership rewrite.
  const legacyName = (ref: string) =>
    modern.clubIdentity?.clubsById[ref]?.seedKey ?? clubDisplayName(modern, ref);
  g.league = modern.league.map((row) => ({
    ...row,
    team: legacyName(row.team),
  }));
  g.fixtures = modern.fixtures.map((fixture) => ({
    ...fixture,
    opponent: legacyName(fixture.opponent),
  }));
  g.leagueSchedule = modern.leagueSchedule
    .filter((f) => f.league === DIVISION_ONE)
    .map(({ league, ...rest }) => ({
      ...rest,
      home: legacyName(rest.home),
      away: legacyName(rest.away),
    }));

  delete g.leagues;
  delete g.playerLeagueId;
  delete g.seasonHistory;
  delete g.clubRecords;
  const originalTopScheduleLength = (g.leagueSchedule as unknown[]).length;
  const m = migrateSave(g);
  check("migrated to current schema", m.version === SAVE_VERSION);
  check("full current world created", m.leagues.length === WORLD_DIVISIONS.length);
  check("four regional Level 7 divisions created", m.leagues.filter((l) => l.tier === 7).length === 4);
  check(
    "user club placed in exactly one league",
    m.leagues.filter((l) => l.clubIds.some((club) => isUserClubReference(m, club))).length === 1,
  );
  check("no duplicate clubs across divisions", new Set(pyramidClubs(m)).size === pyramidClubs(m).length);
  const expectedTopMembership = new Set(
    (g.league as { team: string }[]).map((row) => row.team),
  );
  const migratedTopSeedKeys = m.leagues[0].clubIds.map(
    (club) => m.clubIdentity?.clubsById[club]?.seedKey ?? clubDisplayName(m, club),
  );
  check(
    "existing tier-1 membership preserved",
    migratedTopSeedKeys.length === 20 &&
      migratedTopSeedKeys.every((seedKey) => expectedTopMembership.has(seedKey)),
  );
  const migratedTopSchedule = m.leagueSchedule.filter((f) => f.league === undefined || f.league === DIVISION_ONE);
  check("active top schedule preserved while lower leagues append", migratedTopSchedule.length === originalTopScheduleLength && m.leagueSchedule.some((f) => f.league === "league-4") && m.leagueSchedule.some((f) => f.league === "regional-premier-central"));
  check("history starts empty", m.seasonHistory.length === 0);
  check("club records seeded for every persistent club", Object.keys(m.clubRecords).length === new Set(m.leagues.flatMap((l) => l.clubIds)).size, String(Object.keys(m.clubRecords).length));
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
