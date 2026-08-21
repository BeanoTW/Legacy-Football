/* Hot-core compaction — Phase 1b.
 *
 * Pure, side-effect-free derivation of:
 *
 *   1. a COMPACT CORE — the canonical state with historical detail removed,
 *      plus a minimal `archive` residue so the live simulation still has the
 *      few aggregates it genuinely needs (finance reconciliation, dedupe
 *      guards, counts);
 *   2. HISTORY CHUNKS — the removed detail, grouped by domain and season.
 *
 * This module NEVER mutates the state it is given and never runs inside
 * `advanceWeek`. It lives at the persistence boundary only.
 *
 * Retention rule of thumb: the CURRENT season stays hot in full. Older detail
 * moves out, except for narrow tails that the live simulation reads across a
 * season boundary (recent ledger weeks, recent gate receipts, the user club's
 * own transfer/contract record, live commercial contract payments).
 */
import type {
  ArchivedFinanceBucket,
  FinanceEntry,
  GameState,
  InboxItem,
  MatchRecord,
  PlayerContract,
  PlayerContractRecord,
  SaveArchive,
  TransferRecord,
  WeekLedger,
} from "../types";
import { absoluteWeek } from "../time";

/** Ledger entries newer than this many weeks always stay hot. */
export const RETAIN_LEDGER_WEEKS = 12;
/** Most recent home gate receipts kept hot (attendance/occupancy readers). */
export const RETAIN_GATE_ENTRIES = 24;
/** Trailing WeekLedger projection rows kept hot (board income estimate). */
export const RETAIN_WEEK_ROWS = 8;

export type ChunkKind =
  | "history:matches"
  | "history:finance"
  | "history:transfers"
  | "history:contracts"
  | "history:expired-contracts"
  | "history:inbox";

export const CHUNK_KINDS: ChunkKind[] = [
  "history:matches",
  "history:finance",
  "history:transfers",
  "history:contracts",
  "history:expired-contracts",
  "history:inbox",
];

export interface HistoryChunk {
  kind: ChunkKind;
  season: number;
  /** Rows removed from the hot core. */
  rows: unknown[];
}

export interface CompactionResult {
  core: GameState;
  chunks: HistoryChunk[];
  /** True when the input was already compact (nothing moved). */
  unchanged: boolean;
}

const emptyArchive = (): SaveArchive => ({
  seasons: [],
  finance: {
    net: 0, income: 0, expense: 0, entryCount: 0, buckets: [], guardKeys: [],
    trailingLossWeeks: 0, lastAbsoluteWeek: 0, commercialIncomeBySeason: {},
  },
  inbox: { guardKeys: [], count: 0 },
  matches: { count: 0 },
  transfers: { count: 0 },
  contracts: { recordCount: 0, expiredCount: 0 },
});

const bucketSignature = (b: ArchivedFinanceBucket) =>
  `${b.sourceSystem}|${b.category}|${b.subcategory}|${b.direction}`;

function mergeBuckets(into: ArchivedFinanceBucket[], entries: FinanceEntry[]): ArchivedFinanceBucket[] {
  const map = new Map<string, ArchivedFinanceBucket>();
  for (const b of into) map.set(bucketSignature(b), { ...b });
  for (const e of entries) {
    const b: ArchivedFinanceBucket = {
      sourceSystem: String(e.sourceSystem),
      category: String(e.category),
      subcategory: String(e.subcategory),
      direction: e.direction,
      amount: 0,
      count: 0,
    };
    const key = bucketSignature(b);
    const cur = map.get(key) ?? b;
    cur.amount += e.amount;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => bucketSignature(a).localeCompare(bucketSignature(b)));
}

/**
 * Would this dedupe key ever be produced again by a future week?
 * Season-scoped and absolute-week-scoped keys never can, so archiving them
 * costs nothing and keeping them would grow forever.
 */
function isReplayableKey(key: string, archivedSeasons: Set<number>): boolean {
  if (/:s(\d+)\b/.test(key)) {
    const m = key.match(/:s(\d+)\b/);
    if (m && archivedSeasons.has(Number(m[1]))) return false;
  }
  if (/^migrated:/.test(key)) return false;
  if (/:w\d+:/.test(key)) return false;
  return true;
}

/** Consecutive losing weeks at the end of a set of entries. */
function trailingLossRun(entries: FinanceEntry[]): number {
  const byWeek = new Map<number, number>();
  for (const e of entries) {
    const abs = e.absoluteWeek ?? absoluteWeek(e.season, e.week);
    byWeek.set(abs, (byWeek.get(abs) ?? 0) + (e.direction === "income" ? e.amount : -e.amount));
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let run = 0;
  for (const w of weeks) if ((byWeek.get(w) ?? 0) < 0) run++; else run = 0;
  return run;
}

function pushChunk(chunks: HistoryChunk[], kind: ChunkKind, season: number, row: unknown): void {
  let c = chunks.find((x) => x.kind === kind && x.season === season);
  if (!c) { c = { kind, season, rows: [] }; chunks.push(c); }
  c.rows.push(row);
}

/**
 * Derive a compact core + history chunks from a canonical state.
 * Idempotent: compacting an already-compact state yields no chunks.
 */
export function compactState(state: GameState): CompactionResult {
  const core: GameState = structuredClone(state);
  const chunks: HistoryChunk[] = [];
  const archive: SaveArchive = core.archive
    ? { ...emptyArchive(), ...structuredClone(core.archive) }
    : emptyArchive();

  const season = core.season;
  const nowAbs = absoluteWeek(core.season, core.week);
  const club = core.clubName;
  const ledgerFloor = nowAbs - RETAIN_LEDGER_WEEKS;

  /* ---- 1. Match records ---- */
  const hotMatches: MatchRecord[] = [];
  for (const r of core.matchRecords ?? []) {
    if (r.season >= season) hotMatches.push(r);
    else { pushChunk(chunks, "history:matches", r.season, r); archive.matches.count += 1; }
  }
  core.matchRecords = hotMatches;

  /* ---- 2. Finance ledger ---- */
  const allEntries = core.financeLedger ?? [];
  const gateKeep = new Set(
    allEntries
      .filter((e) => e.category === "Matchday" && e.subcategory === "Ticket sales" && e.metadata?.home === true)
      .slice(-RETAIN_GATE_ENTRIES)
      .map((e) => e.id),
  );
  const liveContractIds = new Set(
    (core.commercial?.contracts ?? [])
      .filter((c) => c.status === "active" || c.status === "Active" || c.status === "signed")
      .map((c) => c.id),
  );
  const hotEntries: FinanceEntry[] = [];
  const archivedEntries: FinanceEntry[] = [];
  for (const e of allEntries) {
    const abs = e.absoluteWeek ?? absoluteWeek(e.season, e.week);
    const keep =
      e.season >= season ||
      abs > ledgerFloor ||
      gateKeep.has(e.id) ||
      (e.linkedEntityId != null && liveContractIds.has(e.linkedEntityId));
    if (keep) hotEntries.push(e);
    else archivedEntries.push(e);
  }
  if (archivedEntries.length) {
    const archivedSeasons = new Set(archivedEntries.map((e) => e.season));
    for (const e of archivedEntries) {
      pushChunk(chunks, "history:finance", e.season, e);
      const signed = e.direction === "income" ? e.amount : -e.amount;
      archive.finance.net += signed;
      if (e.direction === "income") archive.finance.income += e.amount;
      else archive.finance.expense += e.amount;
      archive.finance.lastAbsoluteWeek = Math.max(
        archive.finance.lastAbsoluteWeek,
        e.absoluteWeek ?? absoluteWeek(e.season, e.week),
      );
      if (e.sourceSystem === "commercial" && e.direction === "income") {
        const k = String(e.season);
        archive.finance.commercialIncomeBySeason[k] =
          (archive.finance.commercialIncomeBySeason[k] ?? 0) + e.amount;
      }
      if (e.dedupeKey && isReplayableKey(e.dedupeKey, archivedSeasons)) {
        archive.finance.guardKeys.push(e.dedupeKey);
      }
    }
    archive.finance.entryCount += archivedEntries.length;
    archive.finance.buckets = mergeBuckets(archive.finance.buckets, archivedEntries);
    archive.finance.guardKeys = [...new Set(archive.finance.guardKeys)].sort();
    archive.finance.trailingLossWeeks = trailingLossRun(archivedEntries) || archive.finance.trailingLossWeeks;
    core.financeLedger = hotEntries;
  }

  /* ---- 3. Legacy WeekLedger projection ----
   * Archived finance detail is already in chunks; the legacy weekly roll-up
   * for those weeks is pure duplication. A short tail stays for the board's
   * trailing income estimate across a season boundary. */
  const rows = core.ledger ?? [];
  const tail = new Set(rows.slice(-RETAIN_WEEK_ROWS));
  const hotRows: WeekLedger[] = rows.filter((r) => r.season >= season || tail.has(r));
  if (hotRows.length !== rows.length) {
    archive.inboxLedgerRows = (archive.inboxLedgerRows ?? 0) + (rows.length - hotRows.length);
    core.ledger = hotRows;
  }

  /* ---- 4. Inbox ---- */
  const hotInbox: InboxItem[] = [];
  const archivedInbox: InboxItem[] = [];
  for (const it of core.inbox ?? []) {
    const unresolved = it.status === "awaitingDecision" || (it.choices?.length ? it.status === "unread" : false);
    const unappliedConsequence =
      !!it.consequenceOnExpire && it.consequenceApplied !== true && it.status !== "completed";
    const old = it.season < season;
    if (old && !unresolved && !unappliedConsequence) archivedInbox.push(it);
    else hotInbox.push(it);
  }
  if (archivedInbox.length) {
    const archivedSeasons = new Set(archivedInbox.map((i) => i.season));
    for (const it of archivedInbox) {
      pushChunk(chunks, "history:inbox", it.season, it);
      if (isReplayableKey(it.eventKey, archivedSeasons)) archive.inbox.guardKeys.push(it.eventKey);
    }
    archive.inbox.count += archivedInbox.length;
    archive.inbox.guardKeys = [...new Set(archive.inbox.guardKeys)].sort();
    core.inbox = hotInbox;
  }

  /* ---- 5. Football: transfers, contract records, expired contracts ---- */
  const f = core.football;
  if (f) {
    const hotTransfers: TransferRecord[] = [];
    for (const r of f.transferHistory ?? []) {
      const mine = r.toClubId === club || r.fromClubId === club;
      if (r.season >= season || mine) hotTransfers.push(r);
      else { pushChunk(chunks, "history:transfers", r.season, r); archive.transfers.count += 1; }
    }
    f.transferHistory = hotTransfers;

    const hotRecords: PlayerContractRecord[] = [];
    for (const r of f.contractHistory ?? []) {
      if (r.season >= season || r.clubId === club) hotRecords.push(r);
      else { pushChunk(chunks, "history:contracts", r.season, r); archive.contracts.recordCount += 1; }
    }
    f.contractHistory = hotRecords;

    const referenced = new Set<string>();
    for (const p of f.players ?? []) if (p.contractId) referenced.add(p.contractId);
    for (const n of f.negotiations ?? []) {
      const anyN = n as unknown as Record<string, unknown>;
      if (typeof anyN.contractId === "string") referenced.add(anyN.contractId);
    }
    const hotContracts: PlayerContract[] = [];
    for (const c of f.contracts ?? []) {
      const dead = c.status === "Expired" || c.status === "Released";
      if (dead && c.expirySeason < season && c.clubId !== club && !referenced.has(c.id)) {
        pushChunk(chunks, "history:expired-contracts", c.expirySeason, c);
        archive.contracts.expiredCount += 1;
      } else hotContracts.push(c);
    }
    f.contracts = hotContracts;
  }

  /* ---- 6. Archive bookkeeping ---- */
  const touched = new Set<number>([...(archive.seasons ?? []), ...chunks.map((c) => c.season)]);
  archive.seasons = [...touched].sort((a, b) => a - b);

  const unchanged = chunks.length === 0 && !state.archive;
  if (!unchanged) core.archive = archive;
  return { core, chunks, unchanged: chunks.length === 0 };
}
