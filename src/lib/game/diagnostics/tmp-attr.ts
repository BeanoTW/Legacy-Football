import { newGame, advanceWeek } from "../engine";
import { serializeSave, byteLength } from "../storage/serialize";
import type { GameState } from "../types";

function walk(v: unknown, path: string, out: {k:string;b:number;n?:number}[], depth: number) {
  const b = byteLength(JSON.stringify(v ?? null));
  out.push({ k: path, b, n: Array.isArray(v) ? v.length : undefined });
  if (depth <= 0) return;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (byteLength(JSON.stringify(val ?? null)) > 2000) walk(val, path ? `${path}.${k}` : k, out, depth - 1);
    }
  }
}

const SEED = "PHASE1B|ATTR";
let s: GameState = newGame("Size City", "Meter Maid", SEED);
const marks: Record<string, GameState> = { new: structuredClone(s) };
for (let season = 1; season <= 5; season++) {
  for (let i = 0; i < 46; i++) s = advanceWeek(s);
  if ([1,3,5].includes(season)) marks[`s${season}`] = structuredClone(s);
}
const report: Record<string, Record<string, number>> = {};
for (const [label, st] of Object.entries(marks)) {
  const total = byteLength(serializeSave(st));
  const out: {k:string;b:number;n?:number}[] = [];
  walk(st, "", out, 3);
  out.sort((a,b)=>b.b-a.b);
  console.log(`\n=== ${label}: total ${(total/1048576).toFixed(3)} MB`);
  for (const e of out.slice(0, 30)) {
    if (!e.k) continue;
    console.log(`  ${((e.b/total)*100).toFixed(1).padStart(5)}%  ${(e.b/1024).toFixed(1).padStart(9)} KB  ${e.k}${e.n!=null?` [${e.n}]`:""}`);
  }
  report[label] = Object.fromEntries(out.map(e=>[e.k, e.b]));
}
const keys = new Set<string>();
for (const r of Object.values(report)) for (const k of Object.keys(r)) if (k) keys.add(k);
console.log("\n=== growth per season (new -> s5, bytes/season)");
const rows = [...keys].map(k => ({k, g: ((report.s5[k]??0)-(report.new[k]??0))/5})).sort((a,b)=>b.g-a.g);
for (const r of rows.slice(0,20)) console.log(`  ${(r.g/1024).toFixed(1).padStart(9)} KB/season  ${r.k}`);
