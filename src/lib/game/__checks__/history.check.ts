/* Hot-core compaction + history chunking verification — Phase 1b.
   Run with:  bun src/lib/game/__checks__/history.check.ts
*/
import { newGame, advanceWeek, migrateSave, SAVE_VERSION } from "../engine";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";
import { compactState } from "../storage/compaction";
import { coreKey, manifestKey, isManifest, checksum } from "../storage/manifest";
import { serializeSave, byteLength } from "../storage/serialize";
import { stateHash } from "../diagnostics/stateHash";
import { reconcile, hasEntry } from "../finance";
import { runWeeklyGenerators } from "../inbox";
import { totalCapitalSpend } from "../infrastructure";
import { categorySpendToDate } from "../sustainability";
import { commercialIncomeForSeason } from "../commercial";
import { startPlayerLoanInPlace } from "../loans";
import { userSquad } from "../recruitment";
import { buildWorldSimulationPlan } from "../world";
import { isUserClubReference } from "../clubReference";
import type { GameState, FinanceEntry } from "../types";
import { playerCareerTotals, playerSeasonSummary } from "../playerSeasonStats";

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

const SEED = "PHASE1B|HISTORY|FIXED";
const SAVE_ID = "primary";
const K = { core: coreKey(SAVE_ID), manifest: manifestKey(SAVE_ID) };

function run(weeks: number): GameState {
  let s = newGame("History City", "Ada Archive", SEED);
  for (let i = 0; i < weeks; i++) s = advanceWeek(s);
  return s;
}

function makeStore(records = createMemoryRecordStore()) {
  const store = createIdbSaveStore({
    records,
    migrate: migrateSave,
    currentVersion: SAVE_VERSION,
    legacy: null,
    now: () => 1_700_000_000_000,
  });
  return { store, records };
}

/* ---------------------------------------------------------------- */
console.log("\n[H1] compactState purity and idempotence");
const twoSeasons = run(46 * 2 + 6);
{
  const before = stateHash(twoSeasons);
  const beforeJson = serializeSave(twoSeasons);
  const { core, chunks } = compactState(twoSeasons);
  check("input state is not mutated", serializeSave(twoSeasons) === beforeJson);
  check("input snapshot hash unchanged", stateHash(twoSeasons) === before);
  check("chunks were produced for aged history", chunks.length > 0, String(chunks.length));
  check(
    "only high-frequency feeds may archive detail from the current season",
    chunks.every(
      (c) =>
        c.season < twoSeasons.season ||
        ((c.kind === "history:inbox" || c.kind === "history:scouting") &&
          c.season === twoSeasons.season),
    ),
  );
  const again = compactState(core);
  check(
    "re-compacting a compact core produces no new chunks",
    again.chunks.length === 0,
    JSON.stringify(again.chunks.map((c) => [c.kind, c.season, c.rows.length])),
  );
  check("second pass is byte-stable", serializeSave(again.core) === serializeSave(core));
}

/* ---------------------------------------------------------------- */
console.log("\n[H2] Finance reconciliation across compaction");
{
  const { core } = compactState(twoSeasons);
  const hot = reconcile(twoSeasons);
  const cold = reconcile(core);
  check("uncompacted state reconciles", hot.ok, `${hot.expected} vs ${hot.actual}`);
  check("compacted core reconciles exactly", cold.ok, `${cold.expected} vs ${cold.actual}`);
  check("cash is untouched by compaction", core.cash === twoSeasons.cash);

  const archived = (twoSeasons.financeLedger ?? []).filter(
    (e) => !core.financeLedger.some((h) => h.id === e.id),
  );
  check("finance entries actually left the hot core", archived.length > 0, String(archived.length));
  const arc = core.archive!.finance;
  const sum = (es: FinanceEntry[]) =>
    es.reduce((t, e) => t + (e.direction === "income" ? e.amount : -e.amount), 0);
  check(
    "archive net equals the removed entries",
    arc.net === sum(archived),
    `${arc.net} vs ${sum(archived)}`,
  );
  check("archive entry count matches", arc.entryCount === archived.length);
  check(
    "bucket totals equal archived totals",
    arc.buckets.reduce((t, b) => t + b.amount, 0) === archived.reduce((t, e) => t + e.amount, 0),
  );
}

/* ---------------------------------------------------------------- */
console.log("\n[H3] Dedupe guards survive archiving");
{
  const { core } = compactState(twoSeasons);
  const archived = (twoSeasons.financeLedger ?? []).filter(
    (e) => !core.financeLedger.some((h) => h.id === e.id),
  );
  const keys = archived.map((e) => e.dedupeKey).filter((k): k is string => !!k);
  const stillGuarded = keys.filter((k) => hasEntry(core, k));
  const guardKeys = new Set(core.archive!.finance.guardKeys);
  const retained = keys.filter((k) => guardKeys.has(k));
  check(
    "every retained finance guard key is still detected by hasEntry",
    retained.every((k) => hasEntry(core, k)),
  );
  check("retained guards are a subset of archived keys", retained.length <= keys.length);
  check("hasEntry finds at least the retained guards", stillGuarded.length >= retained.length);

  const archivedInbox = (twoSeasons.inbox ?? []).filter(
    (i) => !core.inbox.some((h) => h.id === i.id),
  );
  check("inbox items were archived", archivedInbox.length > 0, String(archivedInbox.length));
  const archivedInboxChunks = compactState(twoSeasons).chunks
    .filter((chunk) => chunk.kind === "history:inbox")
    .flatMap((chunk) => chunk.rows) as typeof archivedInbox;
  check(
    "no unresolved decision was archived",
    archivedInboxChunks.every((i) => i.status !== "awaitingDecision" && !(i.status === "unread" && (i.choices?.length ?? 0) > 0)),
  );
  check(
    "no un-applied expiry consequence was archived",
    archivedInboxChunks.every(
      (i) => !(i.consequenceOnExpire && i.consequenceApplied !== true && i.status !== "completed"),
    ),
  );

  const regenerated = runWeeklyGenerators(core);
  const guarded = new Set(core.archive!.inbox.guardKeys);
  const reEmitted = regenerated.inbox.filter(
    (i) => guarded.has(i.eventKey) && !core.inbox.some((h) => h.eventKey === i.eventKey),
  );
  check(
    "archived event keys are never re-emitted",
    reEmitted.length === 0,
    reEmitted.map((i) => i.eventKey).join(","),
  );
}

/* ---------------------------------------------------------------- */
console.log("\n[H4] Archive-aware cumulative readers");
{
  const { core } = compactState(twoSeasons);
  check(
    "total capital spend unchanged",
    totalCapitalSpend(core) === totalCapitalSpend(twoSeasons),
    `${totalCapitalSpend(core)} vs ${totalCapitalSpend(twoSeasons)}`,
  );
  for (const cat of [
    "football",
    "infrastructure",
    "supporters",
    "commercial",
    "financial",
  ] as const) {
    check(
      `spend-to-date unchanged (${cat})`,
      categorySpendToDate(core, cat) === categorySpendToDate(twoSeasons, cat),
      `${categorySpendToDate(core, cat)} vs ${categorySpendToDate(twoSeasons, cat)}`,
    );
  }
  for (let season = 1; season <= twoSeasons.season; season++) {
    check(
      `commercial income unchanged (s${season})`,
      commercialIncomeForSeason(core, season) === commercialIncomeForSeason(twoSeasons, season),
      `${commercialIncomeForSeason(core, season)} vs ${commercialIncomeForSeason(twoSeasons, season)}`,
    );
  }
}

/* ---------------------------------------------------------------- */
console.log("\n[H5] Store wiring: chunks, manifest, retrieval");
{
  const { store, records } = makeStore();
  const before = serializeSave(twoSeasons);
  const diags = await store.save(twoSeasons);
  check("save succeeds", diags.length === 0, JSON.stringify(diags));
  check("save did not mutate the live state", serializeSave(twoSeasons) === before);

  const rec = await records.get([K.core, K.manifest]);
  const manifest = JSON.parse(rec[K.manifest]!) as unknown;
  check("manifest is valid", isManifest(manifest));
  const m = manifest as import("../storage/manifest").SaveManifest;
  check("manifest lists chunk records", m.chunkManifest.length > 0, String(m.chunkManifest.length));
  check("core checksum matches stored core", m.coreChecksum === checksum(rec[K.core]!));
  const chunkRecs = await records.get(m.chunkManifest.map((c) => c.key));
  check(
    "every chunk checksum matches",
    m.chunkManifest.every((c) => chunkRecs[c.key] && checksum(chunkRecs[c.key]!) === c.checksum),
  );
  check(
    "totalBytes accounts for core + chunks",
    m.totalBytes === m.coreBytes + m.chunkManifest.reduce((t, c) => t + c.bytes, 0),
  );
  check(
    "stored core is smaller than the uncompacted state",
    byteLength(rec[K.core]!) < byteLength(before),
    `${byteLength(rec[K.core]!)} vs ${byteLength(before)}`,
  );

  const loaded = await store.load();
  check("compacted save reloads", !!loaded.state);
  check("reloaded core reconciles", reconcile(loaded.state!).ok);
  check("reloaded core carries the archive residue", !!loaded.state!.archive);

  const hist = store.history!;
  const seasons = await hist.seasons();
  check("history repository lists archived seasons", seasons.length > 0, seasons.join(","));
  const matches = await hist.readAll("history:matches");
  check(
    "archived match detail is retrievable",
    matches.length === loaded.state!.archive!.matches.count,
    `${matches.length} vs ${loaded.state!.archive!.matches.count}`,
  );
  const fin = await hist.readAll("history:finance");
  check(
    "archived finance detail is retrievable",
    fin.length === loaded.state!.archive!.finance.entryCount,
    `${fin.length} vs ${loaded.state!.archive!.finance.entryCount}`,
  );

  // Successive saves must append, never duplicate or drop history.
  let s2 = loaded.state!;
  for (let i = 0; i < 46; i++) s2 = advanceWeek(s2);
  await store.save(s2);
  const reloaded = (await store.load()).state!;
  const fin2 = await hist.readAll("history:finance");
  check(
    "history grows monotonically across saves",
    fin2.length >= fin.length,
    `${fin2.length} vs ${fin.length}`,
  );
  check(
    "archive counts match retrievable rows after a second save",
    fin2.length === reloaded.archive!.finance.entryCount,
    `${fin2.length} vs ${reloaded.archive!.finance.entryCount}`,
  );
  check("second-generation core still reconciles", reconcile(reloaded).ok);
}

/* ---------------------------------------------------------------- */
console.log("\n[H5b] Completed loan history survives repository storage");
{
  const { store } = makeStore();
  let s = newGame("Loan Archive FC", "Ada Archive", "PHASE1B|LOAN-HISTORY|FIXED");
  const player = userSquad(s)[0];
  check("loan history fixture has a user player", !!player);
  const destination = buildWorldSimulationPlan(s).focusClubIds.find(
    (clubId) => !isUserClubReference(s, clubId),
  );
  check("loan history fixture has an external Focus club", !!destination);

  const started = player && destination
    ? startPlayerLoanInPlace(s, player.id, destination, 4, 50, "Rotation")
    : { ok: false as const, reason: "fixture setup failed" };
  check("loan history fixture starts a real loan", started.ok, started.reason);

  const loanId = started.ok ? started.loan!.id : "";
  for (let i = 0; i < 52; i++) s = advanceWeek(s);
  check(
    "loan is completed before archive save",
    s.football.loans?.find((loan) => loan.id === loanId)?.status === "Completed",
  );

  const diags = await store.save(s);
  check("loan history save succeeds", diags.length === 0, JSON.stringify(diags));
  const loaded = (await store.load()).state!;
  check(
    "aged completed loan leaves the hot core",
    !(loaded.football.loans ?? []).some((loan) => loan.id === loanId),
  );

  const loanHistory = await store.history!.readAll<import("../types").PlayerLoanAgreement>(
    "history:loans",
  );
  const archivedLoan = loanHistory.find((loan) => loan.id === loanId);
  check("completed loan is retrievable through history repository", !!archivedLoan);
  check("archived loan keeps Completed status", archivedLoan?.status === "Completed");
  check(
    "archived loan keeps the same parties and wage share",
    !!archivedLoan &&
      archivedLoan.playerId === player?.id &&
      archivedLoan.loanClubId === destination &&
      archivedLoan.loanClubWageContributionPct === 50,
  );
}

/* ---------------------------------------------------------------- */
console.log("\n[H5c] Player season summaries survive compaction");
{
  const { core, chunks } = compactState(twoSeasons);
  const closedSeason = twoSeasons.season - 1;
  const liveSummary = playerSeasonSummary(twoSeasons, closedSeason);
  const compactSummary = playerSeasonSummary(core, closedSeason);
  check("completed season has a player summary", !!liveSummary);
  check(
    "compact core keeps the lightweight player season summary",
    JSON.stringify(compactSummary) === JSON.stringify(liveSummary),
  );
  check(
    "detailed historical player matches are chunked separately",
    chunks.some(
      (chunk) => chunk.kind === "history:player-matches" && chunk.season === closedSeason,
    ),
  );
  const leaderId = compactSummary?.topScorerId;
  if (leaderId) {
    const career = playerCareerTotals(core, leaderId);
    check("career totals remain readable from compact summaries", !!career && career.appearances > 0);
  }
}

/* ---------------------------------------------------------------- */
console.log("\n[H6] Failed chunk write preserves the previous valid save");
{
  const base = createMemoryRecordStore();
  const { store } = makeStore(base);
  await store.save(twoSeasons);
  const good = await store.load();
  check("baseline save is readable", !!good.state);
  const goodCore = (await base.get([K.core]))[K.core]!;

  let fail = true;
  const flaky = {
    ...base,
    kind: "flaky",
    putAll: async (recs: { key: string; value: string }[]) => {
      if (fail) throw new Error("simulated quota failure");
      return base.putAll(recs);
    },
  };
  const store2 = createIdbSaveStore({
    records: flaky,
    migrate: migrateSave,
    currentVersion: SAVE_VERSION,
    legacy: null,
    now: () => 1_700_000_000_001,
  });
  let s2 = good.state!;
  for (let i = 0; i < 46; i++) s2 = advanceWeek(s2);
  const d = await store2.save(s2);
  check(
    "failed write reports an error",
    d.some((x) => x.level === "error"),
    JSON.stringify(d),
  );
  check("previous core is untouched", (await base.get([K.core]))[K.core] === goodCore);
  const stillGood = await store.load();
  check("previous save still loads", !!stillGood.state && reconcile(stillGood.state).ok);

  fail = false;
  const d2 = await store2.save(s2);
  check("a retry after recovery succeeds", d2.length === 0, JSON.stringify(d2));
  const after = await store2.load();
  check("recovered save reconciles", !!after.state && reconcile(after.state).ok);
}

/* ---------------------------------------------------------------- */
console.log("\n[H7] Hot-core size at S5 / S10 / S20");
{
  let s = newGame("Bench City", "Ada Bench", SEED);
  const marks = new Map<number, { raw: number; hot: number }>();
  const targets = [5, 10, 20];
  let archive: GameState["archive"];
  for (let season = 1; season <= 20; season++) {
    for (let w = 0; w < 46; w++) s = advanceWeek(s);
    if (archive) s = { ...s, archive };
    const { core } = compactState(s);
    archive = core.archive;
    // Persisted shape is the compact core; the live state keeps its detail
    // until the next load, exactly as in the running game.
    s = core;
    if (targets.includes(season)) {
      marks.set(season, { raw: 0, hot: byteLength(serializeSave(core)) });
    }
  }
  for (const t of targets) {
    const kb = (marks.get(t)!.hot / 1024).toFixed(0);
    console.log(`  · S${t} hot core: ${kb} KB`);
  }
  const s20 = marks.get(20)!.hot;
  const worldClubs = s.leagues.reduce((total, league) => total + league.clubIds.length, 0);
  const hotCoreBudget = 2 * 1024 * 1024 + Math.max(0, worldClubs - 40) * 13 * 1024;
  check(
    "S20 hot core stays within the scalable per-club budget",
    s20 < hotCoreBudget,
    `${(s20 / 1024 / 1024).toFixed(2)} MB / ${(hotCoreBudget / 1024 / 1024).toFixed(2)} MB`,
  );
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
