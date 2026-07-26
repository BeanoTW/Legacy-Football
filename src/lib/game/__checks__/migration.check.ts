/* Runtime verification for save migration + Pass-1 regression defects.
   Run with:  bun src/lib/game/__checks__/migration.check.ts
*/
import { newGame, migrateSave } from "../engine";
import { runWeeklyGenerators } from "../inbox";
import { absoluteWeek } from "../time";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}
function safe(label: string, fn: () => void) {
  try { fn(); } catch (e) { failed++; console.log(`  ✗ ${label} threw — ${(e as Error).message}`); }
}

/** A minimal legacy save shaped like the pre-Pass-1 schema. */
function legacy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const g = newGame("Legacy FC", "Old Boss") as unknown as Record<string, unknown>;
  delete g.saveSeed;
  delete g.version;
  g.season = 1;
  g.week = 20;
  g.inbox = [];
  g.inboxFlags = {};
  g.scheduledGenerators = [];
  return { ...g, ...overrides };
}

console.log("\n[M1] Version handling");
safe("missing version", () => {
  const m = migrateSave(legacy());
  check("missing version migrates to current schema", (m.version as number) === 4);
  check("missing version backfills saveSeed", typeof m.saveSeed === "string" && m.saveSeed.length > 0);
});
safe("version 1", () => {
  const m = migrateSave(legacy({ version: 1 }));
  check("v1 migrates to current schema", (m.version as number) === 4);
});
safe("version 2 idempotent", () => {
  const src = { ...legacy({ version: 2 }), saveSeed: "KEEP_ME" };
  const srcAny = src as Record<string, unknown>;
  delete srcAny.leagueSchedule; delete srcAny.matchRecords; // a genuine v2 save has neither
  const m = migrateSave(src);
  check("v2 upgrades to v4 keeping seed", (m.version as number) === 4 && m.saveSeed === "KEEP_ME");
  check("v2 save gets empty league schedule (legacy season preserved)",
    Array.isArray(m.leagueSchedule) && m.leagueSchedule.length === 0 &&
    Array.isArray(m.matchRecords) && m.matchRecords.length === 0);
  const again = migrateSave(m as unknown as Record<string, unknown>);
  check("migration is idempotent", again.saveSeed === "KEEP_ME" && (again.version as number) === 4);
});

console.log("\n[M2] Missing optional collections must not throw");
for (const key of ["inbox", "inboxFlags", "scheduledGenerators", "ledger", "results",
  "hiredStaff", "transferTargets", "incomingBids", "completedTransfers"]) {
  safe(`missing ${key}`, () => {
    const src = legacy();
    delete src[key];
    const m = migrateSave(src);
    check(`missing ${key} survives migration`, m !== null);
  });
}
safe("null collections", () => {
  const m = migrateSave(legacy({ inbox: null, scheduledGenerators: null, inboxFlags: null, ledger: null }));
  check("null collections coerced to empty", Array.isArray(m.inbox) && Array.isArray(m.scheduledGenerators)
    && Array.isArray(m.ledger) && typeof m.inboxFlags === "object");
});

console.log("\n[M3] Legacy field conversion");
safe("expiresWeek → expiresAtAbsoluteWeek", () => {
  const m = migrateSave(legacy({
    inbox: [{
      id: "old-1", generatorId: "grounds-south-roof", sender: "Eddie", department: "Groundskeeper",
      category: "facilities", subject: "x", body: "y", priority: "normal",
      week: 3, season: 1, status: "unread", expiresWeek: 8,
    }],
  }));
  const it = m.inbox[0];
  check("legacy item gets an eventKey", !!it.eventKey);
  check("expiresWeek → abs (s1w8 = 8)", it.expiresAtAbsoluteWeek === absoluteWeek(1, 8),
    `got ${it.expiresAtAbsoluteWeek}`);
});
safe("no legacy expiry field", () => {
  const m = migrateSave(legacy({
    inbox: [{ id: "old-2", generatorId: "finance-weekly", sender: "M", department: "Finance",
      category: "financial", subject: "x", body: "y", priority: "low", week: 5, season: 1, status: "read" }],
  }));
  check("item without expiry stays undefined", m.inbox[0].expiresAtAbsoluteWeek == null);
});
safe("dueWeek/dueSeason → dueAtAbsoluteWeek", () => {
  const m = migrateSave(legacy({
    scheduledGenerators: [{ generatorId: "grounds-south-roof-followup", dueWeek: 2, dueSeason: 2 }],
  }));
  check("s2w2 → abs 48", m.scheduledGenerators[0].dueAtAbsoluteWeek === absoluteWeek(2, 2),
    `got ${m.scheduledGenerators[0].dueAtAbsoluteWeek}`);
});
safe("malformed scheduled entry is not silently dropped", () => {
  const m = migrateSave(legacy({
    scheduledGenerators: [
      { generatorId: "grounds-south-roof-followup" },      // no due time at all
      { dueWeek: 4, dueSeason: 1 },                         // no generatorId — unusable
      { generatorId: "commercial-sponsor-pushback", dueAtAbsoluteWeek: null,
        payload: { sponsorName: "Training Wear", offered: 3000 } },
    ],
  }));
  check("recoverable entries retained with a due time",
    m.scheduledGenerators.length === 2 &&
    m.scheduledGenerators.every((g) => Number.isFinite(g.dueAtAbsoluteWeek)),
    JSON.stringify(m.scheduledGenerators));
  check("entry with no generatorId is discarded",
    !m.scheduledGenerators.some((g) => g.generatorId == null));
});
safe("legacy cooldown flag", () => {
  const m = migrateSave(legacy({ season: 2, week: 10, inboxFlags: { fansWarnedAtWeek: 40 } }));
  check("fansWarnedAtWeek → absolute using saved season",
    m.inboxFlags["fansWarnedAtAbsoluteWeek"] === absoluteWeek(2, 40),
    `got ${m.inboxFlags["fansWarnedAtAbsoluteWeek"]}`);
  check("legacy flag removed", m.inboxFlags["fansWarnedAtWeek"] === undefined);
});

console.log("\n[M4] Legacy save at season rollover");
safe("rollover save", () => {
  const m = migrateSave(legacy({
    season: 1, week: 46,
    scheduledGenerators: [{ generatorId: "grounds-south-roof-followup", dueWeek: 44, dueSeason: 1 }],
  }));
  const ticked = runWeeklyGenerators({ ...m, season: 2, week: 1 });
  check("overdue follow-up fires after rollover instead of vanishing",
    ticked.inbox.some((i) => i.generatorId === "grounds-south-roof-followup"));
});

console.log("\n[M5] Regression: fan warning must not spam while unanswered");
{
  let s = newGame("Spam FC", "Boss");
  s.saveSeed = "SPAM_SEED";
  s.fanHappiness = 20;
  for (let i = 0; i < 20; i++) { s = runWeeklyGenerators(s); s.week += 1; }
  const n = s.inbox.filter((i) => i.generatorId === "fans-happiness-warning").length;
  check("only one unanswered fan warning over 20 weeks", n === 1, `emitted ${n}`);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
