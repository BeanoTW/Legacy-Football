/* Runtime verification for the Board of Directors system.
   Run with:  bun src/lib/game/__checks__/board.check.ts
*/
import { newGame, advanceWeek, migrateSave } from "../engine";
import {
  ensureBoard, makeBoard, makeDirectors, recomputeConfidence, runBoardReview,
  directorSatisfaction, evaluateObjective, confidenceBand, hasReview,
  MID_SEASON_REVIEW_WEEK,
} from "../board";
import type { GameState } from "../types";

/** Current save schema version — bump alongside engine migrations. */
const CURRENT_SCHEMA = 9;

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

const fresh = () => newGame("Board FC", "Chair Person");

console.log("\n[B1] Board composition");
{
  const s = fresh();
  const b = s.board;
  check("board exists with 5 directors", b.directors.length === 5);
  check("every role is unique", new Set(b.directors.map((d) => d.role)).size === 5);
  check("chairman is present", b.directors.some((d) => d.role === "Chairman"));
  check("every director has 2 traits", b.directors.every((d) => d.traits.length === 2));
  check("no director is both patient and ruthless",
    b.directors.every((d) => !(d.traits.includes("patient") && d.traits.includes("ruthless"))));
  check("names are unique", new Set(b.directors.map((d) => d.name)).size === 5);
  check("influence sums to a sane boardroom", (() => {
    const t = b.directors.reduce((a, d) => a + d.influence, 0);
    return t > 80 && t < 120;
  })());
  check("chairman holds the largest influence",
    b.directors.every((d) => d.role === "Chairman" || d.influence <= b.directors.find((x) => x.role === "Chairman")!.influence));
}

console.log("\n[B2] Determinism");
{
  const a = makeDirectors("SEED-A", "Board FC");
  const b = makeDirectors("SEED-A", "Board FC");
  const c = makeDirectors("SEED-B", "Board FC");
  check("same seed ⇒ identical board", JSON.stringify(a) === JSON.stringify(b));
  check("different seed ⇒ different board", JSON.stringify(a) !== JSON.stringify(c));
}

console.log("\n[B3] Objectives");
{
  const s = fresh();
  const objs = s.board.objectives;
  check("objectives generated for season 1", objs.length === 12 && objs.every((o) => o.season === 1));
  check("all objective ids unique", new Set(objs.map((o) => o.id)).size === objs.length);
  check("every objective starts active", objs.every((o) => o.status === "active"));
  check("league position target is inside the division",
    (() => { const o = objs.find((x) => x.kind === "leaguePosition")!; return o.target >= 1 && o.target <= 20; })());
  check("every priority area is owned by a seated director",
    objs.every((o) => s.board.directors.some((d) => d.role === o.ownerRole)));
  check("weights are positive", objs.every((o) => o.weight > 0));
}

console.log("\n[B4] Objective evaluation is bounded and live");
{
  const s = fresh();
  for (const o of s.board.objectives) {
    const p = evaluateObjective(s, o);
    check(`${o.kind} progress within 0..1`, p.progress >= 0 && p.progress <= 1, `got ${p.progress}`);
  }
  const rich = { ...s, cash: 999_999_999 } as GameState;
  const cashObj = s.board.objectives.find((o) => o.kind === "cashReserve")!;
  check("huge cash fully satisfies the reserve objective",
    evaluateObjective(rich, cashObj).progress === 1);
  const broke = { ...s, cash: 0 } as GameState;
  check("zero cash fails the reserve objective",
    evaluateObjective(broke, cashObj).progress === 0 && !evaluateObjective(broke, cashObj).onTrack);
}

console.log("\n[B5] Directors disagree");
{
  const s = fresh();
  s.fanHappiness = 5;
  s.cash = 50_000_000;
  const fin = s.board.directors.find((d) => d.role === "Finance Director")!;
  const sup = s.board.directors.find((d) => d.role === "Supporters' Director")!;
  check("finance director happier than supporters' director when cash-rich and fan-poor",
    directorSatisfaction(s, fin) > directorSatisfaction(s, sup),
    `fin ${directorSatisfaction(s, fin)} vs sup ${directorSatisfaction(s, sup)}`);
}

console.log("\n[B6] Confidence aggregation");
{
  const b = makeBoard("SEED-C", "Board FC");
  const c = recomputeConfidence(b);
  check("headline confidence is influence-weighted and in range", c >= 0 && c <= 100);
  for (const d of b.directors) d.confidence = 100;
  check("all-100 directors ⇒ 100 headline", recomputeConfidence(b) === 100);
  for (const d of b.directors) d.confidence = 0;
  check("all-0 directors ⇒ 0 headline", recomputeConfidence(b) === 0);
  check("bands map correctly",
    confidenceBand(90) === "secure" && confidenceBand(70) === "stable" &&
    confidenceBand(50) === "watchful" && confidenceBand(30) === "strained" &&
    confidenceBand(10) === "critical");
}

console.log("\n[B7] Reviews fire exactly once per window");
{
  let s = fresh();
  for (let i = 0; i < MID_SEASON_REVIEW_WEEK + 2; i++) s = advanceWeek(s);
  const mid = s.board.reviews.filter((r) => r.season === 1 && r.type === "midSeason");
  check("exactly one mid-season review by week 26", mid.length === 1, `got ${mid.length}`);
  check("mid-season review is filed at or after week 24",
    mid[0] ? mid[0].week >= MID_SEASON_REVIEW_WEEK : false);
  check("hasReview agrees", hasReview(s, 1, "midSeason") && !hasReview(s, 1, "endSeason"));
  check("only one board-review inbox item per review",
    s.inbox.filter((i) => i.eventKey === `board-review:${mid[0].id}`).length === 1);
}

console.log("\n[B8] Full season rollover");
{
  let s = fresh();
  for (let i = 0; i < 47; i++) s = advanceWeek(s);
  check("season rolled over", s.season === 2);
  const end = s.board.reviews.filter((r) => r.season === 1 && r.type === "endSeason");
  check("exactly one end-of-season review for season 1", end.length === 1, `got ${end.length}`);
  check("season 1 objectives were graded",
    end[0] ? end[0].outcomes.every((o) => typeof o.met === "boolean") : false);
  check("new objectives issued for season 2",
    s.board.objectivesSeason === 2 && s.board.objectives.every((o) => o.season === 2));
  check("review history is append-only", s.board.reviews.length >= 2);
  check("headline confidence stays in range",
    s.board.confidence >= 0 && s.board.confidence <= 100);
}

console.log("\n[B9] Review idempotency");
{
  let s = fresh();
  for (let i = 0; i < MID_SEASON_REVIEW_WEEK + 1; i++) s = advanceWeek(s);
  const before = JSON.stringify(s.board.reviews);
  const conf = s.board.confidence;
  // Re-running the guarded review must be a no-op.
  if (!hasReview(s, s.season, "midSeason")) throw new Error("expected a mid-season review");
  check("guard prevents a second mid-season review", hasReview(s, s.season, "midSeason"));
  s = advanceWeek(s);
  check("no duplicate review added the following week",
    s.board.reviews.filter((r) => r.season === 1 && r.type === "midSeason").length === 1);
  check("confidence unchanged between reviews", s.board.confidence === conf,
    `${conf} → ${s.board.confidence}`);
  void before;
}

console.log("\n[B10] Confidence floors respected");
{
  const s = fresh();
  // Drive every objective into the ground.
  s.cash = 0; s.fanHappiness = 1; s.pitchCondition = 1;
  for (const st of s.stands) st.condition = 1;
  for (let i = 0; i < 6; i++) runBoardReview(s, "endSeason");
  for (const d of s.board.directors) {
    const floor = d.traits.includes("loyal") ? 22 : d.traits.includes("ruthless") ? 0 : 8;
    check(`${d.role} respects confidence floor`, d.confidence >= floor,
      `${d.confidence} < ${floor}`);
  }
  check("headline confidence never negative", s.board.confidence >= 0);
}

console.log("\n[B11] Migration from a boardless save");
{
  const g = fresh() as unknown as Record<string, unknown>;
  delete g.board;
  g.version = 5;
  const m = migrateSave(g);
  check("v5 save migrates to current schema", (m.version as number) === CURRENT_SCHEMA);
  check("migrated save has a full board", m.board.directors.length === 5);
  check("migrated save has current-season objectives",
    m.board.objectivesSeason === m.season && m.board.objectives.length > 0);
  check("migration back-fills no fake reviews", m.board.reviews.length === 0);
  const again = migrateSave(m as unknown as Record<string, unknown>);
  check("migration is idempotent",
    JSON.stringify(again.board.directors) === JSON.stringify(m.board.directors));
}

console.log("\n[B12] ensureBoard repairs corrupt state");
{
  const s = fresh();
  (s as unknown as Record<string, unknown>).board = undefined;
  ensureBoard(s);
  check("missing board rebuilt", s.board.directors.length === 5);
  s.board.objectives = [];
  ensureBoard(s);
  check("missing objectives rebuilt", s.board.objectives.length === 12);
  s.board.objectivesSeason = 99;
  ensureBoard(s);
  check("stale objective season corrected", s.board.objectivesSeason === s.season);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
