# Phase 0 — Foundation Hardening (Execution Plan)

No gameplay changes. Identical simulation output, identical UI feature set. Every
change is either a file move, a pure extraction, or new non-authoritative
instrumentation.

## 1. Current architectural risks

| Risk | Evidence | Impact on the roadmap |
| --- | --- | --- |
| Route monolith | `src/routes/index.tsx` = 2,686 lines, 40+ components incl. Hub, Dashboard, CashFlow, Tickets, Fixtures, History, Staff, MatchDay overlay, Inbox | Every later phase adds screens here |
| Domain logic in UI | `financialHealth`, `fanbaseEstimate`, `recFor` ticket recommendation, `positionNeed`-style maths live in the route file | UI becomes a second source of truth |
| Migration chain | 12 in-place `if (p.version < N)` blocks inside `engine.ts` (lines ~867–1110), untestable individually | Root reshape in Phase 7 lands on top of an untestable chain |
| Storage leak | `localStorage` read/write/remove sit directly in `engine.ts`; `useGame` calls `loadGame()` synchronously in an effect | Phase 1 (IndexedDB, async, chunked) touches domain code |
| No size/perf signal | Nothing measures save bytes or tick cost | We cannot detect Phase 1/2 regressions |
| Single-club implicitness | `s.cash`, `s.finance`, `s.board`, `s.infrastructure`, `s.commercial` are club-scoped but stored at world root; user club identified by `clubName` string | Owner/equity phases require a 19k-line search-and-replace |
| Grab-bag engine | `engine.ts` mixes staff generation, attendance, goals, `advanceWeek`, migration, storage, formatting, live-match control | Hard to reason about ordering when new systems join the tick |

## 2. Proposed folder/module structure

Keep the single-route mobile tab app. No route-based navigation — the bottom nav
and tab state stay exactly as they are.

```text
src/
  routes/index.tsx            ~120 lines: route def, head(), <Page/> shell
  components/
    game/
      AppShell.tsx            NewGame gate, Game frame, TopBar, MobileNav, tab switch
      hub/                    ClubHub, HubTile, HubMini, HubStrategicStrip, MatchSide
      finance/                Dashboard, CashFlow, RecurringBreakdown,
                              FinancialHealthPanel, PieBlock, BreakdownTable, Tickets
      squad/                  Fixtures, History
      staff/                  StaffTab, StaffCard
      matchday/               MatchDayOverlay, Info2
      inbox/                  InboxTab, InboxDetail
    board/ commercial/ facilities/ recruitment/ leagues/
                              existing *Tab.tsx files moved in, unchanged
    shared/game-ui/
      InfoTip.tsx Kpi.tsx Section.tsx Stat.tsx Row.tsx Meter.tsx
      format.ts               re-exports fmtMoney/fmtMoneyExact/ord/initials
      index.ts                barrel
  lib/game/
    selectors/                pure read-only derivations used by UI
    migrations/               migration registry (§6)
    storage/                  storage boundary (§7/§10)
    diagnostics/              save-size + perf instrumentation (§8/§11)
```

Rules to stop UI regrowing domain logic:
- **Components read, never derive.** Anything computing money, ratings,
  recommendations or eligibility moves to `lib/game/selectors/*` as a pure
  `(s: GameState, …) => T`. Concretely: `financialHealth`, `fanbaseEstimate`,
  ticket `recFor`/`refPrice`, `sum`, form/streak strings.
- **Mutations only via existing exported actions** (`setTransferBudget`,
  `hireStaffMember`, `applyHalfTimeChoice`, …). No component builds a new
  `GameState` object literal; `update(fn)` callbacks must delegate to a
  domain function.
- Lint guard: an ESLint `no-restricted-imports`/`no-restricted-syntax` rule
  banning `lib/game/engine` internals and inline arithmetic on `state.finance.*`
  inside `components/**` beyond formatting.
- UI state that stays local: active tab, expanded sections, filters/sorts in
  Staff & Recruitment, modal/overlay open flags, draft slider values before
  commit, scroll position.

## 3. Proposed future state boundaries

I largely agree with your three roots, with two amendments.

```text
GameState (root, versioned)
  world:  seed, season, week, phase, leagues[], clubs[] (identity + reputation),
          fixtures, results, matchRecords, seasonHistory, economy profiles,
          population registries (players, staff, sponsors)
  clubs:  Record<ClubId, ClubState>   // finance, squad refs, staff, infra,
                                      // commercial, board, supporters, identity
  owner:  cash, netWorth, holdings[], controlledClubId, acquisitionHistory, legacy
```

Amendments to challenge the suggested model:
1. **Players/staff/sponsors belong to the world registry, not to a club.**
   Clubs hold `ClubId`-keyed *references* (contracts). Otherwise a transfer has
   to move an entity between two sub-trees, which is where determinism bugs and
   duplicate-identity bugs live. `football.players` already behaves like a world
   registry with `currentClubId` — keep that shape and lift it up.
2. **`clubs` is a map, not "the player's club plus others".** Phase 0 introduces
   `ClubId` for the user club so `owner.controlledClubId` is a lookup, not an
   assumption.
3. Fixtures/results stay in world (they are inter-club), history splits: match
   and league history in world, financial/board/contract history per club.

Phase 0 does **not** perform this migration. It only: names the boundaries,
introduces `ClubId`/`LeagueId`/`PlayerId` branded types, adds a stable
`userClubId`, and adds accessor helpers (`clubCash(s)`, `clubFinance(s)`,
`clubBoard(s)`, `clubInfra(s)`, `clubCommercial(s)`) so the Phase 7 reshape is
mechanical.

## 4. Single-club assumption inventory

| Assumption | Where | Category | Phase 0 action |
| --- | --- | --- | --- |
| `s.cash` = user club cash | engine, finance, inbox, board, infra, recruitment, commercial, all tabs | must wait for Owner migration | introduce `clubCash(s)` accessor; convert reads only, leave writes on `postEntry` |
| `s.finance` is world-level | `finance.ts`, ledger, budgets | must wait | `clubFinance(s)` accessor |
| `s.board` globally unique | `board.ts`, BoardTab, sustainability | must wait | `clubBoard(s)` accessor |
| `s.infrastructure` globally unique | `infrastructure.ts`, FacilitiesTab, matchday revenue | must wait | `clubInfra(s)` accessor |
| `s.commercial` world-owned | `commercial.ts`, CommercialTab | must wait | `clubCommercial(s)` accessor |
| `s.football` holds only user-club context | `recruitment.ts` | safe to fix (partly) | already keyed by `currentClubId`; document as the future world registry, no move |
| User club identified by `clubName` string | `leagueTeams(clubName)`, fixtures, pyramid membership, table lookups | **high-risk dependency** | add `userClubId`, populate deterministically from existing club identity, keep name comparisons working via a `clubIdForName` map; do not remove name paths |
| `s.squad` legacy `Player[]` mirrors `football.players` | engine, Dashboard | compatibility alias | freeze as derived projection (§10) |
| `s.stands`/`pitchCondition`/`trainingRating` mirror `infrastructure` | engine, Tickets, Hub | compatibility alias | freeze as derived projection |
| `s.league` table = user division only | Dashboard, Fixtures | compatibility alias | project from `pyramid` state |
| `s.ledger` weekly view | CashFlow tab | compatibility alias | project from `financeLedger` |

## 5. Identity weaknesses

| Entity | Today | Verdict |
| --- | --- | --- |
| Club | name string is the de-facto key (`leagueTeams(clubName)`, table rows, `clubReputations`) | **Weakest link.** Phase 0: add explicit `ClubId` (slug of the canonical name, frozen at generation, stored in save) and an id↔name map. Keep names for display only. |
| League | `leagueId` exists and is stable | OK |
| Player | `id` from `nextPlayerId` counter persisted in state | OK — counter is persisted, so stable |
| Contract / negotiation / record | persisted counters (`nextContractId` etc.) | OK |
| Staff | generated ids; candidate pool regenerated per week | Fix: ensure *hired* staff ids are persisted and never regenerated; candidate ids may remain ephemeral but must be seed-derived, not `Math.random` |
| Fixture | derived from schedule position | Safe to fix: give each `ScheduledFixture` a deterministic `id` = `${season}-${leagueId}-${round}-${homeId}-${awayId}` |
| Director/board | `id` present, regenerated per season in places | Fix: persist director ids across season rollover |
| Infrastructure asset/project | `assetId`, `projectId` persisted | OK |
| Sponsor/contract | `sponsorId`, `id` persisted | OK |

Only club, fixture, staff-hired and director ids get touched in Phase 0, and all
four are additive (new field alongside the existing key) so gameplay is untouched.

## 6. Migration-registry design

`src/lib/game/migrations/` — **not** 12 files. Group by era to match how the
steps actually cluster:

```text
migrations/
  types.ts        Migration = { from: number; to: number; describe: string;
                                up(save: AnySave, ctx: MigrationCtx): AnySave }
  v1-v6.ts        early inbox/seed/board-era steps (existing bodies, verbatim)
  v7-v12.ts       finance/commercial/recruitment/infra/sustainability steps
  index.ts        MIGRATIONS: Migration[]; CURRENT_SCHEMA; runMigrations()
```

`runMigrations(raw)`:
- reads `version` (missing ⇒ 1), then applies steps in strict ascending order,
  asserting each step's `from` equals the current version — **no silent skipping**;
  an unknown or future version throws a typed `MigrationError`.
- deterministic: no `Math.random`, no `Date.now`; a `MigrationCtx` supplies a
  seeded rng and the target version.
- idempotent where practical: each step re-checks the field it creates.
- diagnostics: `ctx.warn(code, detail)` collects dropped/unrecoverable data into
  `result.diagnostics`, surfaced to console in dev and asserted in tests.
- `engine.ts` keeps `migrateSave()` as a thin re-export so nothing else changes.
- `SAVE_VERSION` becomes an alias of `CURRENT_SCHEMA` (one canonical constant).

Testing: `migrations.check.ts` builds a minimal fixture per version 1…12 and
asserts round-trip to current, plus idempotency (`run(run(x)) === run(x)`), plus
the existing `migration.check.ts` stays green untouched.

## 7. Storage abstraction + Phase 1 handoff

```ts
// src/lib/game/storage/types.ts
interface SaveStore {
  load(): Promise<GameState | null>;
  save(s: GameState): Promise<void>;
  clear(): Promise<void>;
}
// serialize/deserialize/migrate are separate pure functions
serializeSave(s): string
deserializeSave(raw): { state: GameState; diagnostics: Diagnostic[] }
```

- `storage/localStore.ts` implements `SaveStore` over `localStorage` (current
  behaviour + quota-exceeded handling that currently silently swallows).
- `engine.ts` keeps `loadGame/saveGame/clearGame` as sync wrappers so nothing
  breaks today; `useGame` moves to the async API behind the existing `hydrated`
  flag, which is already the right shape.
- Async-ready now, so Phase 1 swaps the implementation with zero domain edits.

Focus/fringe compatibility review (handoff notes, not implementation):
- **Must persist:** anything player-visible and historical — match records,
  league tables/history, finance ledger, contracts, transfer/contract history,
  board reviews, inbox decisions, reputations, infrastructure state, owner state.
- **Regenerable:** fringe-club squads, candidate staff pools, scouting shortlists,
  un-negotiated sponsor offers — everything derivable from
  `saveSeed | clubId | season`.
- **Never regenerate:** any entity a player has interacted with or that appears
  in a history record. Rule: *once an entity id is referenced by a persisted
  history row, that entity is promoted to persisted.*
- **Deterministic ids across materialisation:** ids must be derived
  (`hash(saveSeed, clubId, season, index)`), not counter-allocated, for
  regenerable entities. This is the one thing Phase 0 must set up: the club-id
  scheme in §5 is exactly this pattern, so fringe clubs materialise with the
  same id they had as aggregates.
- Compatible with the current engine **provided** all regeneration goes through
  `rng.ts` seeded streams — which it already does everywhere except the staff
  candidate pool (`Math.random` default arg), which Phase 0 tightens.

## 8. Save-size instrumentation

`src/lib/game/diagnostics/saveSize.ts`:
- `saveBytes(s)` — UTF-8 byte length of the serialized save.
- `saveSizeBreakdown(s)` — per-top-level-key bytes + row counts for the growth
  drivers (`matchRecords`, `financeLedger`, `inbox.history`, `transferHistory`,
  `contractHistory`, `clubSnapshots`).
- Dev-only thresholds: warn at 1 MB, error-log at 4 MB (localStorage ceiling ~5 MB).
- `save-size.check.ts`: simulate 5 and 20 seasons from a fixed seed, record
  bytes, assert < 2 MB at season 20 as a **soft** assertion (report + fail only
  above a generous hard ceiling of 4 MB in Phase 0), and assert growth is
  roughly linear, not super-linear.

## 9. Engine decomposition recommendations

Only boundaries that reduce expansion risk:
- **Split `engine.ts` (1,535 lines)** into:
  `engine/newGame.ts`, `engine/tick.ts` (`advanceWeek`), `engine/rollover.ts`,
  `engine/liveMatch.ts` (start/kickoff/halfTime/commit/cancel),
  `engine/staff.ts` (makeStaff/pool/join terms/hire/sack),
  `engine/sim.ts` (attendance/goals), `engine/format.ts`,
  with `engine.ts` re-exporting everything so no import in the app changes.
- **Document the canonical lifecycles** in `docs/LIFECYCLE.md`, extracted from
  the real ordering in `advanceWeek`: pre-tick guards → phase resolution →
  fixtures/results → matchday finance → recurring finance → recruitment week →
  commercial week → infrastructure week → board/sustainability → inbox
  generation → history append → week++ → rollover check. The ordering is
  gameplay-critical and currently only implicit.
- **Do not** refactor `advanceWeek`'s internals beyond mechanical extraction; the
  ordering is what makes results deterministic.

## 10. Compatibility aliases and retirement plan

Rule for every alias: exactly one canonical source, a pure projection function,
recomputed on write, and a test proving it cannot become authoritative.

| Alias | Canonical source | Projection | Persisted? | Removed in |
| --- | --- | --- | --- | --- |
| `s.squad` | `football.players` + contracts | `projectSquad(s)` | yes (until v14) | Phase 5 |
| `s.stands`, `pitchCondition`, `trainingRating` | `infrastructure` | `projectStands(s)` | yes | Phase 2 |
| `s.league` (user table) | `pyramid` tables | `projectUserTable(s)` | yes | Phase 2 |
| `s.ledger` weekly | `financeLedger` | `projectWeekLedger(s)` | yes | Phase 1 |

Test (`compat.check.ts`): mutate the canonical source, re-run the projections,
assert the aliases match; then mutate an alias directly and assert the next tick
overwrites it — proving no second mutable source of truth.

## 11. Performance baseline

`src/lib/game/__checks__/perf.check.ts`, fixed seed, warm-up run discarded,
median of 5:
`newGame`, `advanceWeek` (single), full 46-week season, 5-season run,
`migrateSave` from a v1 fixture, `serializeSave`, `deserializeSave`.
Thresholds are broad envelopes (e.g. season sim < 3 s, tick < 60 ms) plus a
written `docs/PERF-BASELINE.md` recording the observed numbers, so Phase 1 is
compared against recorded values, not against fragile CI limits.

## 12. Verification plan

New suites (no duplication of subsystem tests):
- `migrations.check.ts` — registry ordering, per-version round-trip, idempotency, diagnostics.
- `storage.check.ts` — `SaveStore` contract, quota-exceeded path, serialize/deserialize round-trip equality.
- `save-size.check.ts` — §8.
- `compat.check.ts` — §10.
- `identity.check.ts` — club/fixture/staff/director ids stable across save→load→season rollover; same seed ⇒ same ids.
- `perf.check.ts` — §11.
- **Determinism lock:** `snapshot.check.ts` records a hash of the full state
  after a 3-season fixed-seed run *before* refactoring, then asserts it is
  unchanged after. This is the single most important Phase 0 test.
All 15 existing suites (1,097 checks) must stay green and unmodified.

## 13. Exact files likely to change

Created: `components/game/**` (~18 files), `components/shared/game-ui/**` (~8),
`lib/game/selectors/{finance,club,squad,league}.ts`,
`lib/game/migrations/{types,v1-v6,v7-v12,index}.ts`,
`lib/game/storage/{types,localStore,serialize,index}.ts`,
`lib/game/diagnostics/saveSize.ts`, `lib/game/engine/*` (7 files),
`lib/game/ids.ts`, 7 new check suites, `docs/LIFECYCLE.md`, `docs/PERF-BASELINE.md`.

Modified: `src/routes/index.tsx` (2,686 → ~120), `src/hooks/useGame.ts` (async
store), `src/lib/game/engine.ts` (becomes a re-export barrel),
`src/lib/game/types.ts` (branded ids, `userClubId`, fixture `id`),
`src/components/{Board,Commercial,Facilities,Recruitment}Tab.tsx` +
`LeagueBrowser.tsx` (moved, import paths only), `eslint.config.js` (guard rule).

Deleted: `.tmp-passive-audit.ts`, `.tmp2.ts` (stray scratch files at repo root).

## 14. Explicitly NOT doing in Phase 0

- No root reshape to `{ owner, club, world }` (Phase 7).
- No IndexedDB, chunking or compression (Phase 1).
- No focus/fringe world model or `worldDeltas` (Phase 1).
- No history pruning/rollup — measure first, prune in Phase 1 with data.
- No removal of the compatibility aliases (only freezing them as projections).
- No route-based navigation; the tab system stays.
- No renaming `s.cash`/`s.finance` — accessors are added, call sites converted
  progressively, writes untouched.
- No rewriting `advanceWeek`'s internal ordering.
- No new gameplay, no visual redesign.

## 15. Implementation order inside Phase 0

1. Determinism lock (`snapshot.check.ts`) + perf baseline recorded. **Nothing else starts until this is green.**
2. Save-size instrumentation + storage abstraction + `useGame` async (behaviour-identical).
3. Migration registry extraction (pure move of existing bodies) + migration tests.
4. Identity hardening: `ClubId`, fixture ids, hired-staff/director id persistence, `userClubId`. Additive, ships with `identity.check.ts`.
5. Accessor helpers + selectors extraction from UI (no component moves yet).
6. UI decomposition: shared primitives → finance → hub → staff → squad → matchday → inbox, one PR-sized step each, re-running the snapshot check every step.
7. Engine file split into `engine/*` with a re-export barrel.
8. Compatibility-alias projections + `compat.check.ts`; write `LIFECYCLE.md`; final full-suite + perf comparison.

## 16. Rollback / risk strategy

- Every step is independently revertible; the snapshot hash is the gate between
  steps, so a regression is localised to the last step.
- UI moves are done as *move + re-export*, never move + edit, so a bad step is a
  one-file revert.
- The migration extraction copies existing bodies verbatim; behaviour parity is
  proven by the existing `migration.check.ts` plus new per-version fixtures.
- Highest risk: identity hardening (step 4) and the accessor sweep (step 5).
  Both are additive-only — old fields remain and old code paths keep working.
- Manual mobile smoke pass (411×746) after step 6 covering every tab and the
  match-day overlay.

## 17. Completion criteria

- `src/routes/index.tsx` under ~150 lines; no component file over ~400 lines.
- No arithmetic on domain state inside `components/**` beyond formatting; lint rule enforcing it.
- One canonical `CURRENT_SCHEMA`; all migrations in the registry; `engine.ts` holds no `if (p.version < N)` blocks.
- No `localStorage` reference outside `lib/game/storage/`.
- Save size and per-op timings recorded in `docs/PERF-BASELINE.md`.
- All existing suites green + 7 new suites green; 3-season snapshot hash identical to the pre-refactor value.
- Every compatibility alias documented with source, projection and removal phase.

## 18. Disagreements with the Owner Vision audit

- **Players belong to the world, not to `ClubState`** (§3.1). The audit's split
  implies squads live inside clubs; that makes transfers cross-tree mutations.
- **Schema v13 should not delete the legacy projections.** The audit proposes
  removing `squad`/`stands` in Phase 0; I'd keep them persisted-but-derived until
  Phase 2/5 so Phase 0 stays provably behaviour-identical. Deletion is a
  gameplay-visible risk for zero Phase 0 benefit.
- **History rollup should not be designed in Phase 0.** The audit lists a
  `historyPolicy` field; I'd measure first (§8) and set the policy in Phase 1
  with real numbers rather than guessing retention windows now.
- **Accessors, not renames.** The audit's "introduce accessor helpers" is right,
  but it should be read-only in Phase 0; converting write paths invites money leaks.

## Recommendation: three locked sub-phases

Phase 0 is too large for one pass (≈45 files created, one 2,686-line file
dismantled). Split into:

- **0a — Instrumentation & Safety Net** (steps 1–2): snapshot lock, perf baseline,
  save-size tooling, storage abstraction. Small, zero-risk, and it makes 0b/0c safe.
- **0b — Domain Hardening** (steps 3–5, 7): migration registry, identity, accessors,
  selectors, engine split. No UI moves.
- **0c — UI Decomposition** (steps 6, 8): the route split, compat projections, docs.

Each sub-phase ends green and lockable on its own.
