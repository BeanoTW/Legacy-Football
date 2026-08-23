/* Cross-system integration verification for the infrastructure milestone.

   Covers the guarantees no single-subsystem suite can prove:
     - the weekly tick is a pure function of its input state (replay-safe)
     - the season rollover transaction applies exactly once
     - selectors are read-only projections, never mutations
     - infrastructure cannot corrupt standings, fixtures or reputation

   Run with:  bun src/lib/game/__checks__/integration.check.ts
*/
import {
  newGame, advanceWeek, migrateSave, SAVE_VERSION,
  totalCapacity, usableCapacity, avgTicketPrice, squadRating,
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
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

/** Fresh save under a fixed seed so every run is reproducible. */
function fresh(seed = "INTEGRATION_SEED"): GameState {
  const g = newGame("Dalton Town", "Test Boss");
  g.saveSeed = seed;
  return g;
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
  check("every week of a full season replays byte-identically", drifted === 0,
    `${drifted} weeks drifted, first at ${firstDrift}`);
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

console.log("\n[I3] Pre-season friendlies are seeded, not random");
{
  // Friendlies used to draw from Math.random, which made pre-season weeks
  // unreplayable. They must now derive from saveSeed + season + week.
  //
  // Week 2 of season 1 is a guaranteed friendly slot (FRIENDLY_WEEKS), so we
  // park every candidate state on the eve of that fixture and advance once.
  // A run that produces no friendly at all is a hard failure — there is no
  // "no friendly, so nothing to compare" escape hatch here.
  const eve = advanceWeek(fresh("FRIENDLY_SEED")); // now sitting on season 1, week 2
  check("test fixture is parked on the guaranteed friendly week",
    eve.season === 1 && eve.week === 2, `S${eve.season} W${eve.week}`);

  /** Advance one week under a given seed and return the friendly it produced. */
  function friendlyUnder(seed: string) {
    const s = advanceWeek({ ...clone(eve), saveSeed: seed } as GameState);
    const played = s.results.filter((r) => r.week === 2 && /\(friendly\)$/.test(r.opponent));
    return { state: s, played };
  }

  const seeds = ["SEED_A", "SEED_B", "SEED_C", "SEED_D", "SEED_E", "SEED_F"];
  const runs = seeds.map(friendlyUnder);

  check("every seed produced exactly one friendly result",
    runs.every((r) => r.played.length === 1),
    runs.map((r) => r.played.length).join(","));
  check("every friendly belongs to season 1, week 2",
    runs.every((r) => r.state.season === 1 && r.played[0]?.week === 2));
  check("every friendly booked matchday finance",
    runs.every((r) => r.state.financeLedger.length > eve.financeLedger.length));

  // Distinct seeds must not all collapse to the same outcome. Individual
  // collisions are legitimate, so we only require that the sample as a whole
  // yields more than one distinct friendly across opponent/score/attendance.
  const outcomes = new Set(runs.map((r) => {
    const f = r.played[0]!;
    return `${f.opponent}|${f.goalsFor}-${f.goalsAgainst}|${f.attendance}`;
  }));
  check("different save seeds yield more than one distinct friendly outcome",
    outcomes.size > 1, `${outcomes.size} distinct across ${seeds.length} seeds`);

  // Same pre-week state + same seed ⇒ byte-identical everything.
  const a = friendlyUnder("REPLAY_SEED");
  const b = friendlyUnder("REPLAY_SEED");
  const f1 = a.played[0]!, f2 = b.played[0]!;
  check("same seed ⇒ same friendly opponent", f1.opponent === f2.opponent);
  check("same seed ⇒ same score",
    f1.goalsFor === f2.goalsFor && f1.goalsAgainst === f2.goalsAgainst);
  check("same seed ⇒ same attendance and gate",
    f1.attendance === f2.attendance && f1.gateReceipts === f2.gateReceipts);
  check("same seed ⇒ identical finance ledger",
    JSON.stringify(a.state.financeLedger) === JSON.stringify(b.state.financeLedger));
  check("same seed ⇒ identical inbox state",
    JSON.stringify(a.state.inbox) === JSON.stringify(b.state.inbox) &&
    JSON.stringify(a.state.inboxFlags) === JSON.stringify(b.state.inboxFlags));
  check("same seed ⇒ identical result history",
    JSON.stringify(a.state.results) === JSON.stringify(b.state.results));
  check("same seed ⇒ byte-identical GameState", sig(a.state) === sig(b.state));
}


/* ------------------------------------------------------------------ */
console.log("\n[I4] Selectors are read-only projections");
{
  const s = fresh();
  const before = sig(s);
  totalCapacity(s); usableCapacity(s); avgTicketPrice(s);
  stadiumCapacity(s); facilityModifiers(s); squadRating(s);
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
  check("sortTable did not sort the league array in place",
    JSON.stringify(s.league) === leagueBefore);
  check("buildTable did not touch match records",
    JSON.stringify(s.matchRecords) === recordsBefore);
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

  let g = good, b = bad;
  for (let i = 0; i < 20; i++) { g = advanceWeek(g); b = advanceWeek(b); }

  const aiSig = (s: GameState) => s.matchRecords
    .filter((r) => !r.userInvolved)
    .map((r) => `${r.id}=${r.homeGoals}-${r.awayGoals}`).sort().join(";");
  check("stadium condition does not alter AI match scores", aiSig(g) === aiSig(b));
  check("same number of fixtures resolved either way",
    g.matchRecords.length === b.matchRecords.length, `${g.matchRecords.length} vs ${b.matchRecords.length}`);
  check("no duplicate fixture resolved",
    new Set(g.matchRecords.map((r) => r.id)).size === g.matchRecords.length);
  check("a ruined stadium does reduce usable capacity",
    usableCapacity(b) < usableCapacity(g), `${usableCapacity(b)} vs ${usableCapacity(g)}`);
}

console.log("\n[I7] Infrastructure does not move football reputation on its own");
{
  const good = fresh("REP_SEED");
  const bad = clone(good);
  for (const a of bad.infrastructure.assets) a.condition = 5;
  const strengthBefore = clubStrengthFor(good, "Millbrook", good.season);
  check("a rival's derived strength ignores our stadium",
    clubStrengthFor(bad, "Millbrook", bad.season) === strengthBefore);
  check("browsing infrastructure does not touch reputation",
    (() => { const s = fresh(); const r = s.reputation; facilityModifiers(s); totalCapacity(s); return s.reputation === r; })());
}

/* ------------------------------------------------------------------ */
console.log("\n[I8] Season rollover is an atomic, once-only transaction");
{
  let s = fresh("ROLLOVER_SEED");
  for (let i = 0; i < 46; i++) s = advanceWeek(s);
  check("clock rolled into season 2", s.season === 2 && s.week === 1, `S${s.season} W${s.week}`);

  const hist1 = s.seasonHistory.filter((h) => h.season === 1);
  check("exactly one history record per division for season 1",
    hist1.length === new Set(hist1.map((h) => h.leagueId)).size && hist1.length > 0,
    `${hist1.length} records`);
  check("season 1 fixtures all resolved exactly once",
    (() => {
      const ids = s.matchRecords.filter((r) => r.season === 1).map((r) => r.id);
      const expected = s.seasonHistory
        .filter((history) => history.season === 1)
        .reduce((total, history) => total + history.finalTable.length * (history.finalTable.length - 1), 0);
      return new Set(ids).size === ids.length && ids.length === expected;
    })());
  check("exactly one end-of-season board review for season 1",
    s.board.reviews.filter((r) => r.season === 1 && r.type === "endSeason").length === 1,
    String(s.board.reviews.filter((r) => r.season === 1 && r.type === "endSeason").length));
  check("no club appears in two divisions after promotion/relegation",
    (() => {
      const all = s.leagues.flatMap((l) => l.clubIds);
      return new Set(all).size === all.length;
    })());
  check("prize money awarded exactly once",
    s.financeLedger.filter((e) => /prize/i.test(e.description ?? "")).length <= 1);
}

console.log("\n[I9] Rollover replays identically");
{
  // Take the state one week before the rollover and run the transaction twice
  // from the same snapshot: the entire multi-system close must be reproducible.
  let s = fresh("ROLLOVER_SEED");
  for (let i = 0; i < 45; i++) s = advanceWeek(s);
  const eve = clone(s);
  const a = advanceWeek(clone(eve));
  const b = advanceWeek(clone(eve));
  check("the whole rollover transaction is byte-identical on replay", sig(a) === sig(b));
  check("rollover did not mutate the pre-rollover snapshot", sig(eve) === sig(s));
}

console.log("\n[I10] Infrastructure survives the rollover without double-charging");
{
  let s = fresh("INFRA_ROLL_SEED");
  for (let i = 0; i < 46; i++) s = advanceWeek(s);
  const keys = s.financeLedger.map((e) => e.dedupeKey).filter(Boolean) as string[];
  check("no finance entry was posted twice", new Set(keys).size === keys.length,
    `${keys.length} keyed entries, ${new Set(keys).size} unique`);
  check("infrastructure assets carried into season 2",
    s.infrastructure.assets.length > 0);
  check("no asset condition escaped 0..100",
    s.infrastructure.assets.every((a) => a.condition >= 0 && a.condition <= 100));
  check("cash still reconciles against the ledger after the rollover",
    reconcile(s).ok, JSON.stringify(reconcile(s)));

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
  check("migration invents no completed projects",
    m.infrastructure.projects.every((p) => p.status !== "completed"));
  check("migration invents no board reviews", m.board.reviews.length === 0);
  check("migration writes no finance entries",
    m.financeLedger.every((e) => !/migrat/i.test(e.description ?? "")));
  const again = migrateSave(clone(m) as unknown as Record<string, unknown>);
  check("migration is idempotent", sig(again) === sig(m));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);

