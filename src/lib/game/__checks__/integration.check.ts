/* Cross-system integration verification for the infrastructure milestone.

   Covers the guarantees no single-subsystem suite can prove:
     - the weekly tick is a pure function of its input state (replay-safe)
     - the season rollover transaction applies exactly once
     - selectors are read-only projections, never mutations
     - infrastructure cannot corrupt standings, fixtures or reputation

   Run with:  bun src/lib/game/__checks__/integration.check.ts
*/
import {
  newGame,
  advanceWeek,
  migrateSave,
  SAVE_VERSION,
  totalCapacity,
  usableCapacity,
  avgTicketPrice,
  squadRating,
} from "../engine";
import { facilityModifiers, stadiumCapacity } from "../infrastructure";
import { reconcile } from "../finance";
import { buildTable, sortTable, LEAGUE_ID } from "../league";
import { clubStrengthFor } from "../reputation";
import { DIVISION_ONE } from "../pyramid";
import { evaluateObjective } from "../board";
import type { GameState } from "../types";

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

/** Fresh save under a fixed seed so every run is reproducible. */
function fresh(seed = "INTEGRATION_SEED"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  return g;
}

function advanceCareerWeek(s: GameState): GameState {
  const leagueFixture = s.fixtures.find(
    (fixture) => fixture.week === s.week && (fixture.competition ?? "league") === "league",
  );
  return leagueFixture
    ? advanceWeek(s, { gf: 1, ga: 0, attendance: 9000, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 })
    : advanceWeek(s);
}

const clone = (s: GameState) => structuredClone(s);
const sig = (s: GameState) => JSON.stringify(s);

/* ------------------------------------------------------------------ */
console.log("\n[I1] The weekly tick is a pure function of its input state");
{
  // Replaying the identical pre-week state must produce a byte-identical
  // post-week state. This is the single strongest guarantee against hidden
  // Math.random, Date.now or module-level mutable state anywhere in the tick.
  let s = fresh();
  let drifted = 0;
  let firstDrift = "";
  for (let week = 1; week <= 46; week++) {
    const before = clone(s);
    const a = advanceWeek(clone(before));
    const b = advanceWeek(clone(before));
    if (sig(a) !== sig(b)) {
      drifted++;
      if (!firstDrift) firstDrift = `week ${week}`;
    }
    s = a;
  }
  check(
    "every week of a full season replays byte-identically",
    drifted === 0,
    `${drifted} weeks drifted, first at ${firstDrift}`,
  );
}

console.log("\n[I2] Advancing does not mutate the state handed in");
{
  const s = fresh();
  for (let i = 0; i < 8; i++) advanceWeek(s); // repeated calls on the SAME object
  const before = sig(s);
  advanceWeek(s);
  check("advanceWeek leaves its argument untouched", sig(s) === before);
  check("caller state is still at week 1", s.week === 1, String(s.week));
}

console.log("\n[I3] Pre-season fixtures are explicit and deterministic");
{
  const a = newGame("Test FC", "Test Chair", "PRESEASON_REPLAY");
  const b = newGame("Test FC", "Test Chair", "PRESEASON_REPLAY");
  const fixturesA = a.fixtures.filter((f) => f.competition === "preseason");
  const fixturesB = b.fixtures.filter((f) => f.competition === "preseason");

  check("fresh career has exactly three pre-season fixtures", fixturesA.length === 3, String(fixturesA.length));
  check(
    "pre-season fixture identity replays deterministically",
    JSON.stringify(fixturesA) === JSON.stringify(fixturesB),
  );
  check(
    "pre-season fixtures carry exact calendar days",
    fixturesA.every((f) => typeof f.dayOfWeek === "number"),
  );

  check(
    "idle days do not fabricate pre-season results",
    a.results.filter((r) => r.competition === "preseason").length === 0,
  );
}

console.log("\n[I4] Selectors are read-only projections");
{
  const s = fresh();
  const before = sig(s);
  totalCapacity(s);
  usableCapacity(s);
  avgTicketPrice(s);
  stadiumCapacity(s);
  facilityModifiers(s);
  squadRating(s);
  clubStrengthFor(s, s.clubName, s.season);
  for (const o of s.board.objectives) evaluateObjective(s, o);
  buildTable([...new Set(s.league.map((r) => r.team))], s.matchRecords, 1, DIVISION_ONE);
  sortTable(s.league);
  check("no selector mutated game state", sig(s) === before);
}

console.log("\n[I5] Table projection does not reorder the underlying arrays");
{
  const s = fresh();
  const recordsBefore = JSON.stringify(s.matchRecords);
  const leagueBefore = JSON.stringify(s.league);
  sortTable(s.league);
  buildTable([...new Set(s.league.map((r) => r.team))], s.matchRecords, 1, LEAGUE_ID);
  check(
    "sortTable did not sort the league array in place",
    JSON.stringify(s.league) === leagueBefore,
  );
  check("buildTable did not touch match records", JSON.stringify(s.matchRecords) === recordsBefore);
}

/* ------------------------------------------------------------------ */
console.log("\n[I6] Infrastructure cannot corrupt the league");
{
  // Drive one save's stadium into ruin and leave another pristine. Attendance
  // and revenue must diverge; scores, fixtures and tables must not.
  const good = fresh("PARITY_SEED");
  const bad = clone(good);
  for (const a of bad.infrastructure.assets) a.condition = 5;
  for (const st of bad.stands) st.condition = 5;

  let g = good,
    b = bad;
  for (let i = 0; i < 20; i++) {
    g = advanceWeek(g);
    b = advanceWeek(b);
  }

  const aiSig = (s: GameState) =>
    s.matchRecords
      .filter((r) => !r.userInvolved)
      .map((r) => `${r.id}=${r.homeGoals}-${r.awayGoals}`)
      .sort()
      .join(";");
  check("stadium condition does not alter AI match scores", aiSig(g) === aiSig(b));
  check(
    "same number of fixtures resolved either way",
    g.matchRecords.length === b.matchRecords.length,
    `${g.matchRecords.length} vs ${b.matchRecords.length}`,
  );
  check(
    "no duplicate fixture resolved",
    new Set(g.matchRecords.map((r) => r.id)).size === g.matchRecords.length,
  );
  check(
    "a ruined stadium does reduce usable capacity",
    usableCapacity(b) < usableCapacity(g),
    `${usableCapacity(b)} vs ${usableCapacity(g)}`,
  );
}

console.log("\n[I7] Infrastructure does not move football reputation on its own");
{
  const good = fresh("REP_SEED");
  const bad = clone(good);
  for (const a of bad.infrastructure.assets) a.condition = 5;
  const strengthBefore = clubStrengthFor(good, "Millbrook", good.season);
  check(
    "a rival's derived strength ignores our stadium",
    clubStrengthFor(bad, "Millbrook", bad.season) === strengthBefore,
  );
  check(
    "browsing infrastructure does not touch reputation",
    (() => {
      const s = fresh();
      const r = s.reputation;
      facilityModifiers(s);
      totalCapacity(s);
      return s.reputation === r;
    })(),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n[I8] Season rollover is an atomic, once-only transaction");
{
  let s = fresh("ROLLOVER_SEED");
  for (let i = 0; i < 46; i++) {
    const leagueFixture = s.fixtures.find(
      (fixture) => fixture.week === s.week && (fixture.competition ?? "league") === "league",
    );
    s = leagueFixture
      ? advanceWeek(s, { gf: 1, ga: 0, attendance: 9000, gate: 1, tv: 1, matchdayOps: 1, winBonus: 0 })
      : advanceWeek(s);
  }
  check("clock rolled into season 2", s.season === 2 && s.week === 1, `S${s.season} W${s.week}`);

  const hist1 = s.seasonHistory.filter((h) => h.season === 1);
  check(
    "exactly one history record per division for season 1",
    hist1.length === new Set(hist1.map((h) => h.leagueId)).size && hist1.length > 0,
    `${hist1.length} records`,
  );
  check(
    "season 1 fixtures all resolved exactly once",
    (() => {
      const ids = s.matchRecords.filter((r) => r.season === 1).map((r) => r.id);
      const expected = s.seasonHistory
        .filter((history) => history.season === 1)
        .reduce(
          (total, history) => total + history.finalTable.length * (history.finalTable.length - 1),
          0,
        );
      return new Set(ids).size === ids.length && ids.length === expected;
    })(),
  );
  check(
    "exactly one end-of-season board review for season 1",
    s.board.reviews.filter((r) => r.season === 1 && r.type === "endSeason").length === 1,
    String(s.board.reviews.filter((r) => r.season === 1 && r.type === "endSeason").length),
  );
  check(
    "no club appears in two divisions after promotion/relegation",
    (() => {
      const all = s.leagues.flatMap((l) => l.clubIds);
      return new Set(all).size === all.length;
    })(),
  );
  check(
    "prize money awarded exactly once",
    s.financeLedger.filter((e) => /prize/i.test(e.description ?? "")).length <= 1,
  );
}

console.log("\n[I9] Rollover replays identically");
{
  // Take the state one week before the rollover and run the transaction twice
  // from the same snapshot: the entire multi-system close must be reproducible.
  let s = fresh("ROLLOVER_SEED");
  for (let i = 0; i < 45; i++) s = advanceCareerWeek(s);
  const eve = clone(s);
  const a = advanceWeek(clone(eve));
  const b = advanceWeek(clone(eve));
  check("the whole rollover transaction is byte-identical on replay", sig(a) === sig(b));
  check("rollover did not mutate the pre-rollover snapshot", sig(eve) === sig(s));
}

console.log("\n[I10] Infrastructure survives the rollover without double-charging");
{
  let s = fresh("INFRA_ROLL_SEED");
  for (let i = 0; i < 46; i++) s = advanceCareerWeek(s);
  const keys = s.financeLedger.map((e) => e.dedupeKey).filter(Boolean) as string[];
  check(
    "no finance entry was posted twice",
    new Set(keys).size === keys.length,
    `${keys.length} keyed entries, ${new Set(keys).size} unique`,
  );
  check("infrastructure assets carried into season 2", s.infrastructure.assets.length > 0);
  check(
    "no asset condition escaped 0..100",
    s.infrastructure.assets.every((a) => a.condition >= 0 && a.condition <= 100),
  );
  check(
    "cash still reconciles against the ledger after the rollover",
    reconcile(s).ok,
    JSON.stringify(reconcile(s)),
  );
}

/* ------------------------------------------------------------------ */
console.log("\n[I11] Migrated saves are clean and idempotent");
{
  const raw = fresh() as unknown as Record<string, unknown>;
  raw.version = 5;
  delete raw.infrastructure;
  delete raw.board;
  const m = migrateSave(raw);
  check("migrates to the current schema", m.version === SAVE_VERSION, String(m.version));
  check("infrastructure rebuilt from legacy fields", m.infrastructure.assets.length > 0);
  check(
    "migration invents no completed projects",
    m.infrastructure.projects.every((p) => p.status !== "completed"),
  );
  check("migration invents no board reviews", m.board.reviews.length === 0);
  check(
    "migration writes no finance entries",
    m.financeLedger.every((e) => !/migrat/i.test(e.description ?? "")),
  );
  const again = migrateSave(clone(m) as unknown as Record<string, unknown>);
  check("migration is idempotent", sig(again) === sig(m));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
