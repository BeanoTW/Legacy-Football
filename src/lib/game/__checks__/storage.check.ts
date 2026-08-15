/* Storage abstraction verification — Phase 0.
   Run with:  bun src/lib/game/__checks__/storage.check.ts
*/
import { newGame, migrateSave, SAVE_VERSION } from "../engine";
import { createLocalSaveStore, STORAGE_KEY, BACKUP_KEY } from "../storage/localStore";
import { serializeSave, parseSave, byteLength } from "../storage/serialize";
import { stateHash } from "../diagnostics/stateHash";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

/** In-memory stand-in for localStorage. */
function memoryBackend(opts: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
  };
}

const store = (backend: ReturnType<typeof memoryBackend>) =>
  createLocalSaveStore({ migrate: migrateSave, currentVersion: SAVE_VERSION, backend });

const SEED = "PHASE0|STORAGE|FIXED";

console.log("\n[T1] Serialization round-trip");
{
  const s = newGame("Store City", "Persis Tence", SEED);
  const raw = serializeSave(s);
  const { parsed, diagnostics } = parseSave(raw);
  check("parse succeeds with no diagnostics", parsed !== null && diagnostics.length === 0);
  const back = migrateSave(parsed as Record<string, unknown>);
  check("round-trip preserves state exactly", stateHash(back) === stateHash(s));
  check("byteLength matches the serialized string", byteLength(raw) >= raw.length);
}

console.log("\n[T2] SaveStore contract");
{
  const backend = memoryBackend();
  const st = store(backend);
  const empty = await st.load();
  check("empty store loads null", empty.state === null && empty.diagnostics.length === 0);

  const s = newGame("Store City", "Persis Tence", SEED);
  const diags = await st.save(s);
  check("save reports no diagnostics for a small save", diags.length === 0, JSON.stringify(diags));
  check("save wrote under the canonical key", backend.map.has(STORAGE_KEY));

  const loaded = await st.load();
  check("load returns an equivalent state", loaded.state !== null && stateHash(loaded.state!) === stateHash(s));

  await st.clear();
  check("clear removes the save", (await st.load()).state === null);
}

console.log("\n[T3] Failure behaviour");
{
  const backend = memoryBackend({ failWrites: true });
  const diags = await store(backend).save(newGame("Store City", "Persis Tence", SEED));
  check("quota failure is surfaced, not swallowed",
    diags.some((d) => d.code === "save/write-failed" && d.level === "error"));
}
{
  const backend = memoryBackend();
  backend.map.set(STORAGE_KEY, "{not json");
  const res = await store(backend).load();
  check("corrupt save loads null with a diagnostic",
    res.state === null && res.diagnostics.some((d) => d.code === "save/parse-failed"));
}
{
  const backend = memoryBackend();
  const s = newGame("Store City", "Persis Tence", SEED) as unknown as Record<string, unknown>;
  s.version = SAVE_VERSION + 5;
  backend.map.set(STORAGE_KEY, JSON.stringify(s));
  const res = await store(backend).load();
  check("future-version save is refused with a diagnostic",
    res.state === null && res.diagnostics.some((d) => d.code === "save/future-version"));
}
{
  // Regression: the old loader hard-coded `v > 10` and silently discarded
  // every save written by schema v11/v12.
  const backend = memoryBackend();
  const s = newGame("Store City", "Persis Tence", SEED);
  backend.map.set(STORAGE_KEY, serializeSave(s));
  const res = await store(backend).load();
  check(`current-version (v${SAVE_VERSION}) save still loads`, res.state !== null);
}
{
  // A genuine legacy save must migrate on load.
  const backend = memoryBackend();
  const s = newGame("Store City", "Persis Tence", SEED) as unknown as Record<string, unknown>;
  s.version = 6;
  delete s.finance; delete s.financeLedger; delete s.financeHistory;
  delete s.commercial; delete s.football; delete s.infrastructure; delete s.sustainability;
  backend.map.set(STORAGE_KEY, JSON.stringify(s));
  const res = await store(backend).load();
  check("legacy v6 save loads and is migrated to the current schema",
    res.state?.version === SAVE_VERSION);
}

console.log("\n[T3b] An unreadable save is preserved, never overwritten");
{
  const backend = memoryBackend();
  backend.map.set(STORAGE_KEY, "{not json");
  const st = store(backend);
  const res = await st.load();
  check("original raw save is kept verbatim", backend.map.get(STORAGE_KEY) === "{not json");
  check("a backup copy is written", backend.map.get(BACKUP_KEY) === "{not json");
  check("preservation is reported", res.diagnostics.some((d) => d.code === "save/preserved"));

  const diags = await st.save(newGame("Store City", "Persis Tence", SEED));
  check("writes are blocked while an unreadable save is present",
    diags.some((d) => d.code === "save/write-blocked"));
  check("the unreadable save survived the blocked write", backend.map.get(STORAGE_KEY) === "{not json");

  await st.clear();
  const after = await st.save(newGame("Store City", "Persis Tence", SEED));
  check("an explicit clear unblocks writing", after.length === 0, JSON.stringify(after));
}
{
  const backend = memoryBackend();
  const s = newGame("Store City", "Persis Tence", SEED) as unknown as Record<string, unknown>;
  s.version = SAVE_VERSION + 5;
  const raw = JSON.stringify(s);
  backend.map.set(STORAGE_KEY, raw);
  const st = store(backend);
  const res = await st.load();
  check("future-version message explains the newer game version",
    res.diagnostics.some((d) => d.code === "save/future-version" && /newer version/.test(d.detail ?? "")));
  check("future-version save is preserved untouched", backend.map.get(STORAGE_KEY) === raw);
  const diags = await st.save(newGame("Store City", "Persis Tence", SEED));
  check("a future-version save is never overwritten",
    diags.some((d) => d.code === "save/write-blocked") && backend.map.get(STORAGE_KEY) === raw);
}


console.log("\n[T4] Storage choice does not leak into domain code");
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = `${dir}/${e}`;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      if (p.includes("/lib/game/storage/") || p.includes("/__checks__/")) continue;
      // Only real usage counts; the word may legitimately appear in comments.
      if (/localStorage\s*[.[]/.test(readFileSync(p, "utf8"))) offenders.push(p);
    }
  };
  walk("src");
  check("no localStorage outside lib/game/storage", offenders.length === 0, offenders.join(", "));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
