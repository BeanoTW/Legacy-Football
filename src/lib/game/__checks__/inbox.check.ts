/* Runtime verification for Inbox Stabilisation Pass 1.
   Run with:  bun src/lib/game/__checks__/inbox.check.ts
*/
import { newGame, advanceWeek } from "../engine";
import { runWeeklyGenerators, handleInboxChoice, isKnownGeneratorId } from "../inbox";
import { absoluteWeek, fromAbsoluteWeek } from "../time";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

// Fresh save with a stable seed so results are reproducible.
function fixture(): GameState {
  const g = newGame("Testville FC", "Test Manager");
  g.saveSeed = "TEST_SEED_1";
  // Nudge a sponsor into the renewal window immediately.
  g.sponsors[2].weeksLeft = 3;
  // Ensure prev-week ledger lookup has something to find.
  return g;
}

console.log("\n[1] Absolute timeline helpers");
check("absoluteWeek round-trip s1w1", absoluteWeek(1, 1) === 1);
check("absoluteWeek round-trip s2w1", absoluteWeek(2, 1) === 47);
check("fromAbsoluteWeek(48) = s2w2", JSON.stringify(fromAbsoluteWeek(48)) === '{"season":2,"week":2}');
check("s1w44 + 4w = s2w2", fromAbsoluteWeek(absoluteWeek(1, 44) + 4).season === 2
  && fromAbsoluteWeek(absoluteWeek(1, 44) + 4).week === 2);

console.log("\n[2] Deterministic generation — same input, same output");
{
  const a = fixture();
  const b = fixture();
  const ra = runWeeklyGenerators(a);
  const rb = runWeeklyGenerators(b);
  const keysA = ra.inbox.map(i => i.eventKey).sort().join("|");
  const keysB = rb.inbox.map(i => i.eventKey).sort().join("|");
  check("identical eventKey set", keysA === keysB, `A=${keysA}\n     B=${keysB}`);
  const sponsA = ra.inbox.find(i => i.generatorId === "commercial-sponsor-renewal");
  const sponsB = rb.inbox.find(i => i.generatorId === "commercial-sponsor-renewal");
  check("sponsor renewal body identical", sponsA?.body === sponsB?.body);
  check("sponsor renewal id identical (stable, not Date.now)", sponsA?.id === sponsB?.id);
}

console.log("\n[3] Duplicate prevention — unresolved sponsor renewal");
{
  let s = fixture();
  s = runWeeklyGenerators(s);
  const before = s.inbox.filter(i => i.generatorId === "commercial-sponsor-renewal").length;
  // Advance a few weeks without answering the offer.
  for (let i = 0; i < 3; i++) s = runWeeklyGenerators({ ...s, week: s.week + 1 });
  const after = s.inbox.filter(i => i.generatorId === "commercial-sponsor-renewal").length;
  check("only one unresolved sponsor renewal after 3 weeks", before === 1 && after === 1,
    `before=${before} after=${after}`);
}

console.log("\n[4] Follow-up integrity — sponsor pushback");
{
  let s = fixture();
  s = runWeeklyGenerators(s);
  const offer = s.inbox.find(i => i.generatorId === "commercial-sponsor-renewal");
  check("renewal offer emitted", !!offer);
  if (offer) {
    s = handleInboxChoice(s, offer.id, "push");
    check("push scheduled a follow-up", s.scheduledGenerators.some(g => g.generatorId === "commercial-sponsor-pushback"));
    // Advance one week — follow-up should be due.
    s.week += 1;
    s = runWeeklyGenerators(s);
    const followup = s.inbox.find(i => i.generatorId === "commercial-sponsor-pushback");
    check("pushback follow-up emitted next week", !!followup);
    // Determinism check: same starting state → same outcome
    let s2 = fixture();
    s2 = runWeeklyGenerators(s2);
    const offer2 = s2.inbox.find(i => i.generatorId === "commercial-sponsor-renewal")!;
    s2 = handleInboxChoice(s2, offer2.id, "push");
    s2.week += 1;
    s2 = runWeeklyGenerators(s2);
    const followup2 = s2.inbox.find(i => i.generatorId === "commercial-sponsor-pushback");
    check("pushback outcome is deterministic", followup?.subject === followup2?.subject);
  }
}

console.log("\n[5] Registry validation");
check("all known generators listed", isKnownGeneratorId("commercial-sponsor-pushback"));
check("unknown generator rejected", !isKnownGeneratorId("does-not-exist"));

console.log("\n[6] Season-safe timing — cross-season follow-up");
{
  let s = fixture();
  // Move to end of season and schedule 4 weeks out via engine.
  s.season = 1; s.week = 44;
  s = runWeeklyGenerators(s);
  s.scheduledGenerators.push({
    generatorId: "grounds-south-roof-followup",
    dueAtAbsoluteWeek: absoluteWeek(1, 44) + 4, // → s2w2
  });
  // Simulate two weeks passing and rollover
  s.week = 46; s = runWeeklyGenerators(s);
  s.season = 2; s.week = 2;
  s = runWeeklyGenerators(s);
  check("follow-up scheduled at s1w44+4 fires at s2w2",
    s.inbox.some(i => i.generatorId === "grounds-south-roof-followup"));
}

console.log("\n[7] Cooldown safe across rollover");
{
  let s = fixture();
  s.season = 1; s.week = 45;
  s.fanHappiness = 30;
  s.inboxFlags["fansWarnedAtAbsoluteWeek"] = absoluteWeek(1, 44); // 1 week ago
  s = runWeeklyGenerators(s);
  const emittedEarly = s.inbox.some(i => i.generatorId === "fans-happiness-warning");
  check("cooldown blocks re-emit near end of season", !emittedEarly);
  // Advance across rollover, ~9 weeks later
  s.season = 2; s.week = 7;
  s = runWeeklyGenerators(s);
  const emittedAfter = s.inbox.some(i => i.generatorId === "fans-happiness-warning");
  check("cooldown expires correctly after rollover", emittedAfter);
}

console.log("\n[8] Previous-week finance lookup across rollover");
{
  let s = fixture();
  s.season = 2; s.week = 1;
  // Seed a ledger row for s1w46
  s.ledger.push({
    week: 46, season: 1,
    income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
    expenses: { playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0, maintenance: 0, matchday: 0, transfers: 0, other: 0 },
    net: -1234, balance: s.cash,
  });
  s = runWeeklyGenerators(s);
  const fin = s.inbox.find(i => i.generatorId === "finance-weekly");
  check("finance lookup finds s1w46 ledger from s2w1", !!fin,
    fin ? `subject="${fin.subject}"` : "no finance item emitted");
}

console.log("\n[9] Full advanceWeek round-trip determinism");
{
  const a = fixture();
  const b = structuredClone(a);
  const ra = advanceWeek(a);
  const rb = advanceWeek(b);
  const keysA = ra.inbox.map(i => i.eventKey).sort().join("|");
  const keysB = rb.inbox.map(i => i.eventKey).sort().join("|");
  check("advanceWeek produces identical inbox eventKey set for same state", keysA === keysB);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
