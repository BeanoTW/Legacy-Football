/* Migration registry verification — Phase 0b.
 *
 * Proves the registry (`src/lib/game/migrations`) is a behaviour-identical
 * replacement for the pre-0b inline chain in engine.ts (frozen in
 * ./legacyMigrate.ts), and that the chain itself is well-formed, deterministic,
 * idempotent and explicit about failure.
 *
 * Run with:  bun src/lib/game/__checks__/migrations.check.ts
 */
import { newGame, advanceWeek, staffPoolFor, squadRating, SAVE_VERSION } from "../engine";
import {
  MIGRATIONS,
  LATEST_MIGRATED_VERSION,
  runMigrations,
  MigrationError,
  type MigrationDeps,
} from "../migrations";
import { legacyMigrateSave } from "./legacyMigrate";
import { stateHash, stateHashParts, stableStringify } from "../diagnostics/stateHash";
import type { GameState } from "../types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
function safe(label: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.log(`  ✗ ${label} threw — ${(e as Error).message}`);
  }
}

const DEPS: MigrationDeps = { staffPoolFor, squadRating };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Raw = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Fixtures: a rich current save, then de-featured back to each schema. */
/* ------------------------------------------------------------------ */

function richSave(weeks: number, seed: string): Raw {
  let s = newGame("Parity Rovers", "P. Arity", seed);
  for (let i = 0; i < weeks; i++) s = advanceWeek(s);
  return clone(s) as unknown as Raw;
}

/** Strip everything a given schema version could not yet contain. */
function downgradeTo(version: number, src: Raw): Raw {
  const p = clone(src);
  if (version < 12) delete p.sustainability;
  if (version < 11) {
    const lm = p.liveMatch as Raw | null;
    if (lm) {
      for (const k of [
        "matchSeed",
        "fixtureId",
        "leagueId",
        "season",
        "round",
        "homeClub",
        "awayClub",
        "committed",
      ])
        delete lm[k];
    }
  }
  if (version < 10) delete p.infrastructure;
  if (version < 9) {
    delete p.football;
  }
  if (version < 8) delete p.commercial;
  if (version < 7) {
    delete p.finance;
    delete p.financeLedger;
    delete p.financeHistory;
  }
  if (version < 6) delete p.board;
  if (version < 5) {
    delete p.clubReputations;
    delete p.clubSnapshots;
    delete p.seasonPredictions;
  }
  if (version < 4) {
    delete p.leagues;
    delete p.playerLeagueId;
    delete p.clubRecords;
    delete p.seasonHistory;
  }
  if (version < 3) {
    delete p.matchRecords;
    delete p.leagueSchedule;
  }
  if (version < 2) {
    // v1 knew nothing of eventKeys or the absolute-week axis.
    const inbox = (p.inbox as Raw[]) ?? [];
    for (const it of inbox) {
      delete it.eventKey;
      if (it.expiresAtAbsoluteWeek != null) {
        it.expiresWeek = (((it.expiresAtAbsoluteWeek as number) - 1) % 46) + 1;
        delete it.expiresAtAbsoluteWeek;
      }
    }
    const sched = (p.scheduledGenerators as Raw[]) ?? [];
    p.scheduledGenerators = sched.map((g) => {
      const abs = g.dueAtAbsoluteWeek as number;
      const out: Raw = { ...g };
      delete out.dueAtAbsoluteWeek;
      out.dueSeason = Math.floor((abs - 1) / 46) + 1;
      out.dueWeek = ((abs - 1) % 46) + 1;
      return out;
    });
    const flags = (p.inboxFlags as Raw) ?? {};
    if (flags["fansWarnedAtAbsoluteWeek"] != null) {
      flags["fansWarnedAtWeek"] = (((flags["fansWarnedAtAbsoluteWeek"] as number) - 1) % 46) + 1;
      delete flags["fansWarnedAtAbsoluteWeek"];
    }
  }
  p.version = version;
  return p;
}

/** Scenarios chosen so each covers a different real-world save shape. */
const SCENARIOS: { label: string; weeks: number; seed: string }[] = [
  { label: "fresh (pre-season w1)", weeks: 0, seed: "MIG|FRESH" },
  { label: "mid-season (w20)", weeks: 19, seed: "MIG|MID" },
  { label: "season rollover boundary (w46)", weeks: 45, seed: "MIG|ROLL" },
  { label: "completed seasons (s3)", weeks: 46 * 2 + 12, seed: "MIG|HIST" },
];

const SOURCE_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/* Sanity: the richest fixture really does carry the features the brief lists. */
console.log("\n[G0] Fixture richness");
{
  const rich = richSave(46 * 2 + 12, "MIG|HIST") as unknown as GameState;
  const r = rich as unknown as Raw;
  check(
    "has completed season history",
    Array.isArray(rich.seasonHistory) && rich.seasonHistory.length >= 2,
  );
  check("has match records", Array.isArray(rich.matchRecords) && rich.matchRecords.length > 0);
  check("has inbox items", rich.inbox.length > 0);
  check("has finance ledger entries", !!r.finance && rich.financeLedger.length > 0);
  check("has contracts", !!r.football && rich.football.contracts.length > 0);
  check("has commercial state", !!r.commercial);
  check("has infrastructure assets", !!r.infrastructure && rich.infrastructure.assets.length > 0);
  check("has board review history", !!r.board && rich.board.directors.length > 0);
  check("has sustainability state", !!r.sustainability);
}

/* ------------------------------------------------------------------ */
console.log("\n[G1] Parity: registry vs frozen legacy inline chain");
/* ------------------------------------------------------------------ */
for (const sc of SCENARIOS) {
  const base = richSave(sc.weeks, sc.seed);
  for (const v of SOURCE_VERSIONS) {
    const src = downgradeTo(v, base);
    safe(`${sc.label} @v${v}`, () => {
      const legacy = legacyMigrateSave(clone(src));
      const modern = runMigrations(clone(src), SAVE_VERSION, DEPS).state;
      const lh = stateHash(legacy);
      const mh = stateHash(modern);
      const same = lh === mh;
      let drift = "";
      if (!same) {
        const a = stateHashParts(legacy);
        const b = stateHashParts(modern);
        drift = Object.keys({ ...a, ...b })
          .filter((k) => a[k] !== b[k])
          .join(", ");
      }
      check(`${sc.label} v${v}: identical state hash`, same, `drift: ${drift}`);
      check(`${sc.label} v${v}: version = ${SAVE_VERSION}`, modern.version === SAVE_VERSION);
      check(
        `${sc.label} v${v}: byte-identical canonical serialization`,
        stableStringify(legacy) === stableStringify(modern),
      );
    });
  }
}

/* ------------------------------------------------------------------ */
console.log("\n[G2] No fabricated history / domain-by-domain equality (v12 source)");
/* ------------------------------------------------------------------ */
{
  const base = richSave(46 * 2 + 12, "MIG|HIST");
  const before = clone(base) as unknown as GameState;
  const after = runMigrations(clone(base), SAVE_VERSION, DEPS).state;
  const domains: [string, (s: GameState) => unknown][] = [
    ["finance", (s) => [s.finance, s.financeLedger, s.financeHistory]],
    ["players/contracts", (s) => s.football],
    ["board", (s) => s.board],
    ["commercial", (s) => s.commercial],
    ["infrastructure", (s) => s.infrastructure],
    ["fixtures/results", (s) => [s.leagueSchedule, s.results, s.matchRecords]],
    ["inbox", (s) => [s.inbox, s.inboxFlags, s.scheduledGenerators]],
    ["season history", (s) => [s.seasonHistory, s.clubSnapshots, s.clubRecords]],
    ["sustainability", (s) => s.sustainability],
  ];
  for (const [name, sel] of domains) {
    check(
      `${name} unchanged by a no-op migration`,
      stableStringify(sel(before)) === stableStringify(sel(after)),
    );
  }
}

/* ------------------------------------------------------------------ */
console.log("\n[G3] Malformed but recoverable legacy shapes");
/* ------------------------------------------------------------------ */
{
  const base = richSave(19, "MIG|MID");
  const mk = (mut: (p: Raw) => void, version = 1): Raw => {
    const p = downgradeTo(version, base);
    mut(p);
    return p;
  };
  const cases: { label: string; make: () => Raw; assert: (s: GameState) => boolean }[] = [
    {
      label: "missing optional arrays (inbox/ledger/results/scheduled)",
      make: () =>
        mk((p) => {
          delete p.inbox;
          delete p.ledger;
          delete p.results;
          delete p.scheduledGenerators;
        }),
      assert: (s) =>
        Array.isArray(s.inbox) &&
        Array.isArray(s.ledger) &&
        Array.isArray(s.results) &&
        Array.isArray(s.scheduledGenerators),
    },
    {
      label: "missing inboxFlags",
      make: () =>
        mk((p) => {
          delete p.inboxFlags;
        }),
      assert: (s) => !!s.inboxFlags && typeof s.inboxFlags === "object",
    },
    {
      label: "missing compatibility fields (budgets, staff market)",
      make: () =>
        mk((p) => {
          delete p.transferBudget;
          delete p.wageBudgetWeekly;
          delete p.staffCandidates;
          delete p.staffMarketRefreshedWeek;
        }),
      assert: (s) =>
        s.transferBudget === 500_000 &&
        s.wageBudgetWeekly === 5_000 &&
        Array.isArray(s.staffCandidates) &&
        s.staffCandidates.length > 0,
    },
    {
      label: "null collections",
      make: () =>
        mk((p) => {
          p.inbox = null;
          p.ledger = null;
          p.inboxFlags = null;
          p.scheduledGenerators = null;
          p.hiredStaff = null;
        }),
      assert: (s) =>
        Array.isArray(s.inbox) && Array.isArray(s.hiredStaff) && typeof s.inboxFlags === "object",
    },
    {
      label: "undefined liveMatch",
      make: () =>
        mk((p) => {
          delete p.liveMatch;
        }),
      assert: (s) => s.liveMatch === null,
    },
    {
      label: "no explicit version field (pre-versioning save)",
      make: () =>
        mk((p) => {
          delete p.version;
        }),
      assert: (s) => s.version === SAVE_VERSION,
    },
    {
      label: "retired legacy fields dropped",
      make: () =>
        mk((p) => {
          p.positionPriorities = { ST: 3 };
          p.transferTargets = [{ x: 1 }];
          p.incomingBids = [{ y: 2 }];
          p.completedTransfers = [{ z: 3 }];
        }),
      assert: (s) => {
        const r = s as unknown as Raw;
        return (
          r.positionPriorities === undefined &&
          r.transferTargets === undefined &&
          r.incomingBids === undefined &&
          r.completedTransfers === undefined
        );
      },
    },
    {
      label: "unusable scheduled generator entries are reported, not silently kept",
      make: () =>
        mk((p) => {
          p.scheduledGenerators = [
            { dueWeek: 4, dueSeason: 1 },
            { generatorId: "grounds-south-roof-followup" },
          ];
        }),
      assert: (s) =>
        s.scheduledGenerators.length === 1 &&
        Number.isFinite(s.scheduledGenerators[0].dueAtAbsoluteWeek),
    },
  ];
  for (const c of cases) {
    safe(c.label, () => {
      const res = runMigrations(c.make(), SAVE_VERSION, DEPS);
      check(c.label, c.assert(res.state));
    });
  }
  // Diagnostics must surface the drop rather than swallowing it.
  const dropped = runMigrations(
    mk((p) => {
      p.scheduledGenerators = [{ dueWeek: 4, dueSeason: 1 }];
    }),
    SAVE_VERSION,
    DEPS,
  );
  check(
    "dropped legacy data produces a diagnostic",
    dropped.diagnostics.some((d) => d.code === "scheduled-generators/dropped"),
    JSON.stringify(dropped.diagnostics),
  );
  // Genuinely unrecoverable corruption must throw a documented MigrationError.
  safe("unrecoverable corruption throws MigrationError", () => {
    const bad = downgradeTo(3, base);
    bad.league = 42; // v3->v4 reads p.league as an array
    bad.leagues = "not-an-array";
    let err: unknown = null;
    try {
      runMigrations(bad, SAVE_VERSION, DEPS);
    } catch (e) {
      err = e;
    }
    const ok = err instanceof MigrationError ? err.code === "step-failed" : err === null;
    check("corrupt league shape either recovers or throws step-failed", ok, String(err));
  });
}

/* ------------------------------------------------------------------ */
console.log("\n[G4] Future-version rejection");
/* ------------------------------------------------------------------ */
{
  const base = richSave(0, "MIG|FRESH");
  const future = clone(base);
  future.version = SAVE_VERSION + 3;
  const marker = "DO-NOT-TOUCH";
  future.clubName = marker;
  let err: MigrationError | null = null;
  try {
    runMigrations(future, SAVE_VERSION, DEPS);
  } catch (e) {
    err = e as MigrationError;
  }
  check("throws MigrationError", err instanceof MigrationError);
  check("code is future-version", err?.code === "future-version");
  check(
    "message explains the newer schema",
    /version \d+ but this build understands \d+/.test(err?.message ?? ""),
  );
  check("reports the offending version", err?.atVersion === SAVE_VERSION + 3);
  check(
    "no step ran (save untouched)",
    future.clubName === marker && future.version === SAVE_VERSION + 3,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n[G5] Step-contract verification");
/* ------------------------------------------------------------------ */
{
  const froms = MIGRATIONS.map((m) => m.from);
  check("source versions unique", new Set(froms).size === froms.length);
  check(
    "targets are source + 1",
    MIGRATIONS.every((m) => m.to === m.from + 1),
  );
  check(
    "chain is ordered and gapless",
    MIGRATIONS.every((m, i) => i === 0 || m.from === MIGRATIONS[i - 1].to),
  );
  check("chain starts at v1", MIGRATIONS[0].from === 1);
  check(
    `chain reaches the current schema (v${SAVE_VERSION})`,
    LATEST_MIGRATED_VERSION === SAVE_VERSION,
    `registry tops out at v${LATEST_MIGRATED_VERSION}`,
  );
  check(
    "every step is described",
    MIGRATIONS.every((m) => m.describe.trim().length > 0),
  );

  // Each step advances the save to exactly its declared target.
  const base = richSave(19, "MIG|MID");
  for (const m of MIGRATIONS) {
    safe(`step v${m.from}->v${m.to} target`, () => {
      const res = runMigrations(downgradeTo(m.from, base), m.to, DEPS);
      check(`step v${m.from}->v${m.to} lands on v${m.to}`, res.state.version === m.to);
      check(
        `step v${m.from}->v${m.to} is the only step applied`,
        res.applied.length === 1 && res.applied[0] === `v${m.from}->v${m.to}`,
      );
    });
  }

  // Steps must not mutate the injected dependency object.
  const depsSnapshot = Object.keys(DEPS).sort().join(",");
  runMigrations(downgradeTo(1, base), SAVE_VERSION, DEPS);
  check(
    "injected deps object not mutated",
    Object.keys(DEPS).sort().join(",") === depsSnapshot &&
      DEPS.staffPoolFor === staffPoolFor &&
      DEPS.squadRating === squadRating,
  );

  // Static purity scan of the registry sources.
  const files = ["index.ts", "types.ts", "v1-v6.ts", "v7-v12.ts"].map((f) => ({
    f,
    // Comments are stripped: the rules themselves are written down in prose
    // inside these files and must not trip their own scan.
    src: readFileSync(fileURLToPath(new URL(`../migrations/${f}`, import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, ""),
  }));
  const banned: [string, RegExp][] = [
    ["Math.random", /Math\.random\s*\(/],
    ["Date.now", /Date\.now\s*\(/],
    ["new Date", /new\s+Date\s*\(/],
    ["crypto.randomUUID", /crypto\.randomUUID/],
    ["localStorage", /localStorage/],
    ["indexedDB", /indexedDB/],
    ["fetch", /\bfetch\s*\(/],
  ];
  for (const [name, re] of banned) {
    const hits = files.filter((x) => re.test(x.src)).map((x) => x.f);
    check(`registry sources free of ${name}`, hits.length === 0, hits.join(", "));
  }
}

/* ------------------------------------------------------------------ */
console.log("\n[G6] Individual-step determinism");
/* ------------------------------------------------------------------ */
{
  const base = richSave(19, "MIG|MID");
  for (const m of MIGRATIONS) {
    safe(`determinism v${m.from}->v${m.to}`, () => {
      const src = downgradeTo(m.from, base);
      const a = runMigrations(clone(src), m.to, DEPS).state;
      const b = runMigrations(clone(src), m.to, DEPS).state;
      check(`v${m.from}->v${m.to} run twice is identical`, stateHash(a) === stateHash(b));
    });
  }
}

/* ------------------------------------------------------------------ */
console.log("\n[G7] Idempotency at the latest version");
/* ------------------------------------------------------------------ */
{
  const latest = richSave(46 + 5, "MIG|IDEM");
  const before = stableStringify(latest);
  const res = runMigrations(clone(latest), SAVE_VERSION, DEPS);
  check("no steps applied to a current save", res.applied.length === 0);
  check(
    "no diagnostics for a clean current save",
    res.diagnostics.length === 0,
    JSON.stringify(res.diagnostics),
  );
  check(
    "state is byte-identical under canonical serialization",
    stableStringify(res.state) === before,
  );
  const again = runMigrations(clone(res.state) as unknown as Raw, SAVE_VERSION, DEPS);
  check("second pass is also a no-op", stableStringify(again.state) === before);
}

/* ------------------------------------------------------------------ */
console.log("\n[G8] Full chain: oldest -> current, serialize round trip");
/* ------------------------------------------------------------------ */
for (const sc of SCENARIOS) {
  safe(`full chain ${sc.label}`, () => {
    const src = downgradeTo(1, richSave(sc.weeks, sc.seed));
    const first = runMigrations(clone(src), SAVE_VERSION, DEPS);
    check(
      `${sc.label}: applied all 11 steps`,
      first.applied.length === MIGRATIONS.length,
      first.applied.join(","),
    );
    check(`${sc.label}: fromVersion recorded as 1`, first.fromVersion === 1);
    const round = JSON.parse(JSON.stringify(first.state)) as Raw;
    const second = runMigrations(round, SAVE_VERSION, DEPS);
    check(
      `${sc.label}: stable after serialize/deserialize/re-migrate`,
      stateHash(second.state) === stateHash(first.state),
    );
    const legacy = legacyMigrateSave(clone(src));
    check(`${sc.label}: matches legacy inline path`, stateHash(legacy) === stateHash(first.state));
  });
}

/* ------------------------------------------------------------------ */
console.log("\n[G9] Diagnostics reporting");
/* ------------------------------------------------------------------ */
{
  const src = downgradeTo(1, richSave(19, "MIG|MID"));
  const res = runMigrations(src, SAVE_VERSION, DEPS);
  check("reports the starting version", res.fromVersion === 1);
  check(
    "reports every step executed",
    res.applied[0] === "v1->v2" && res.applied.at(-1) === `v${SAVE_VERSION - 1}->v${SAVE_VERSION}`,
  );
  check("reports the target version", res.state.version === SAVE_VERSION);
  const stored = JSON.parse(JSON.stringify(res.state)) as Raw;
  check(
    "diagnostics are NOT stored in GameState",
    stored.diagnostics === undefined && stored.migrationReport === undefined,
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
