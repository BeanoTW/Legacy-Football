import { newGame, advanceWeek } from "../engine";
import { compactState } from "../storage/compaction";
import { serializeSave, byteLength } from "../storage/serialize";
import type { GameState } from "../types";

const SEED = "PHASE1B|HISTORY|FIXED";

function bytes(value: unknown): number {
  return byteLength(JSON.stringify(value));
}

let state = newGame("Bench City", "Ada Bench", SEED);
let archive: GameState["archive"];
for (let season = 1; season <= 20; season++) {
  for (let week = 0; week < 46; week++) state = advanceWeek(state);
  if (archive) state = { ...state, archive };
  const { core } = compactState(state);
  archive = core.archive;
  state = core;
}

const total = byteLength(serializeSave(state));
const top = Object.entries(state as unknown as Record<string, unknown>)
  .map(([key, value]) => ({ key, bytes: bytes(value) }))
  .sort((a, b) => b.bytes - a.bytes);

console.log("\n[CORE-SIZE] S20 persisted hot-core breakdown");
console.log(`  total: ${(total / 1024).toFixed(0)} KB`);
for (const item of top.slice(0, 16)) {
  console.log(`  ${item.key.padEnd(24)} ${(item.bytes / 1024).toFixed(0).padStart(6)} KB  ${((item.bytes / total) * 100).toFixed(1).padStart(5)}%`);
}

if (state.football) {
  const football = Object.entries(state.football as unknown as Record<string, unknown>)
    .map(([key, value]) => ({ key, bytes: bytes(value) }))
    .sort((a, b) => b.bytes - a.bytes);
  console.log("\n[CORE-SIZE] football breakdown");
  for (const item of football) {
    console.log(`  ${item.key.padEnd(24)} ${(item.bytes / 1024).toFixed(0).padStart(6)} KB`);
  }
}

console.log("\n[CORE-SIZE] inbox breakdown");
const statusCounts = new Map<string, number>();
const generatorCounts = new Map<string, { count: number; bytes: number; oldestSeason: number; newestSeason: number }>();
for (const item of state.inbox) {
  statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
  const cur = generatorCounts.get(item.generatorId) ?? { count: 0, bytes: 0, oldestSeason: item.season, newestSeason: item.season };
  cur.count += 1;
  cur.bytes += bytes(item);
  cur.oldestSeason = Math.min(cur.oldestSeason, item.season);
  cur.newestSeason = Math.max(cur.newestSeason, item.season);
  generatorCounts.set(item.generatorId, cur);
}
console.log(`  items: ${state.inbox.length}`);
console.log(`  statuses: ${[...statusCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
for (const [generator, info] of [...generatorCounts.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12)) {
  console.log(`  ${generator.padEnd(34)} ${String(info.count).padStart(4)} items  ${(info.bytes / 1024).toFixed(0).padStart(5)} KB  s${info.oldestSeason}-s${info.newestSeason}`);
}

const clubRecordBytes = bytes(state.clubRecords);
const seasonHistoryBytes = bytes(state.seasonHistory);
console.log("\n[CORE-SIZE] known longitudinal structures");
console.log(`  clubRecords               ${(clubRecordBytes / 1024).toFixed(0)} KB`);
console.log(`  seasonHistory             ${(seasonHistoryBytes / 1024).toFixed(0)} KB`);
console.log("core-size-diagnostics.check.ts: PASS");
