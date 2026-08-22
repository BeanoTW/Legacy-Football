# Football Club Owner — Vision Audit & Phased Master Roadmap

Status: analysis only. No code changed.

Audited against the live codebase: save schema v12 (`src/lib/game/types.ts`),
19.2k lines across `src/lib/game/*` + 4 tab components + a 2.7k-line
`src/routes/index.tsx`, with `__checks__/*.check.ts` verification suites.

---

## 1. What fits the existing architecture naturally

These need extension, not new foundations:

| Vision item | Where it lands today | Effort |
| --- | --- | --- |
| Bigger pyramid (5 tiers, 116 clubs) | `pyramid.ts` is already tier-generic: `leagueShell(tier)`, promotion/relegation via a `moveTo` map rebuilt from a single membership source. Only `CLUBS` (44 names) and `CLUBS_PER_DIVISION` (fixed 20) are hardcoded. | Low–medium |
| Manager philosophy | `Staff` + `StaffStats` already exist with role-based effects; philosophy is extra fields plus consumers. | Low |
| Club identity/values | `clubReputations`, `ClubSeasonSnapshot`, board `BoardPriority` already model club character. | Low |
| Deeper players | `FootballPlayer` already has ability/potential/positions/personality/market value/contract. Missing: form, morale, fitness, injury, suspension, playing-time expectation. | Low–medium |
| Club valuation | Every input already exists in canonical state (`financeHistory`, `infrastructure`, `football.contracts`, `clubReputations`, tier). Valuation is a *derived function*, not new state. | Low |
| Long-term world history | `seasonHistory`, `clubSnapshots`, `matchRecords`, `transferHistory`, `contractHistory`, `infrastructure.records` already append-only. | Low |
| Squad pitch view | Pure presentation over `football.players/contracts`. | Low |
| Governance via shareholders | `board.ts` already models directors with traits, influence shares and confidence. Shareholders are the same shape with a capital claim attached. | Medium |

## 2. What requires real architectural change

1. **World scale + save size.** Today the whole world is one JSON blob in
   localStorage. 40 clubs x 24 players ≈ 960 players plus contracts. At 116
   clubs x 26 that's ~3,000 players + 3,000 contracts + growing append-only
   histories (`matchRecords` grows ~2,200 rows/season at 116 clubs). A 20-season
   save would blow past the ~5MB localStorage ceiling. This is the single
   biggest blocker and must be solved before world expansion.
2. **Owner vs club money.** `GameState` *is* the club. There is no entity above
   it. Introducing an owner layer means `GameState` becomes
   `{ owner, club, world }` — a genuine root-shape migration touching every
   module that reads `s.cash` / `s.clubName` / `s.season`.
3. **Multiple persistent clubs.** Buying/selling requires club-scoped state for
   *any* club, not just the player's. Finance, board, infrastructure and
   commercial are currently implicitly single-club (`s.finance`, `s.board`).
   Other clubs need a cheap, *abstract* financial model — not full duplicates.
4. **Careers for AI players/staff.** Ageing, retirement, intake, inter-club
   transfers currently only exist around the user's club.
5. **Visual match engine.** `matchday.ts` produces seeded events, not spatial
   state. Dots-on-a-pitch needs a positional layer derived from events.
6. **`src/routes/index.tsx` (2,686 lines)** cannot absorb a squad view, owner
   dashboard, valuation screen and equity screen. It must be split first.

## 3. What I'd modify, simplify or reject

- **Reject: 3,000–4,000 fully-simulated players as flat persistent entities.**
  Instead: two fidelity tiers (see §5). The world *feels* populated without
  paying for it.
- **Reject: literal corporate finance.** No debt instruments, no cap tables, no
  dividends-per-share maths in v1. Equity should be a single `ownershipPct`
  per stakeholder plus a valuation function. Anything more becomes the
  accounting simulator you warned against.
- **Simplify: minority stakes in other clubs.** Cut from the roadmap entirely
  until the sell-and-rebuy loop is proven fun. It doubles the state model for
  a flavour feature.
- **Simplify: match visualisation.** Don't simulate 22 positions per tick.
  Derive a possession-zone track from existing events (zone + team + tempo),
  and animate abstract dots along it. Tactical identity becomes visible from
  *tempo and zone-transition profile*, which the philosophy layer already
  determines. Cheap, deterministic, replay-safe.
- **Modify: "manager picks the XI".** Correct instinct, but the owner needs a
  lever or the tab is a spectator screen. Give the owner *policy* levers
  (youth-minutes mandate, wage-to-role policy, sell/keep directives) that the
  manager AI obeys with friction proportional to their personality.
- **Challenge: selling the club as the main progression loop.** The risk is
  that the best strategy becomes flipping clubs, and 40-season one-club play
  feels punished. Recommend both paths accrue the *same* scoring currency —
  Legacy — with an owner-wealth path and a dynasty path.

## 4. Missing from the vision (consequences you'll want)

- **Debt and financing.** Buying a club with cash only is unrealistic and
  removes the best tension: leveraged purchase, interest, covenant pressure.
  Even a simple loan facility gives capital allocation real teeth.
- **Tax / transaction costs on share sales.** Otherwise flipping is frictionless.
- **Fan ownership reaction.** Selling a stake to an unpopular investor should
  hit fan sentiment — you already have `fanHappiness`.
- **Manager sackings by *you*, and managers resigning / being poached.** A
  manager market with compensation clauses.
- **Player retirement, youth intake and a schooling/academy pipeline**, which is
  the mechanism that makes "develop academy players" a real identity.
- **Regulatory layer** (wage caps, FFP-like profitability rules per tier) — the
  cheapest way to make money have opportunity cost at the top tiers.
- **Failure state.** Administration/points deduction/forced sale. Success
  creating new problems requires a floor you can fall through.

## 5. Modelling a large persistent world affordably

Recommended model: **Focus/Fringe fidelity split + regenerable world.**

- **Focus clubs** (player's club + its division + any club with an active
  negotiation): full entities — every player, contract, morale, fitness.
  ~24–48 clubs, ~1,200 players. Same fidelity as today.
- **Fringe clubs** (rest of the pyramid): stored as a *club aggregate* —
  reputation, squad strength curve (mean/spread by position), wage bill,
  finance aggregates, a handful of named "notable" players. ~200 bytes/club.
  Full squads are **materialised on demand** (deterministically, from
  `saveSeed|club|season`) when the player scouts, plays or buys them, then
  demoted back to aggregate when out of focus, persisting only *deltas*.
- **Persistence rule:** anything the deterministic generator can rebuild is not
  saved. Only *divergences* (transfers, retirements, injuries, contract
  changes) go in a compact append-only `worldDeltas` log. This is what keeps a
  20-season save small while the world genuinely evolves.
- **Storage:** move off localStorage to IndexedDB with a chunked save
  (core state / world / history chunks) and compression. History arrays
  (`matchRecords`, `financeLedger`) get **rollup + prune**: keep full detail for
  N recent seasons, keep season summaries forever.
- **Careers on aggregates:** ageing, retirement and intake run as cheap
  statistical operations on fringe clubs, and as full per-player operations on
  focus clubs. A promoted fringe club materialises with a coherent history
  because its aggregate carried its identity all along.

Budget target: **< 2MB save at season 20**, weekly tick < 50ms on mobile.

## 6. Valuation, wealth, equity and control without an accounting sim

Keep exactly four numbers visible and one function canonical.

```
clubValuation(club) =
    revenueMultiple(tier) * trailing12mRevenue
  + squadAssetValue        (sum of market values, discounted by contract length)
  + infrastructureValue    (book value * condition)
  + cash - liabilities
  * reputationTrendFactor  (recent growth bonus/penalty)
```

- One pure function in a new `valuation.ts`, recomputed on demand, **never
  stored as mutable state** (snapshot it per season for history only).
- `owner.cash`, `owner.holdings[{clubId, pct, costBasis}]`, `owner.netWorth`
  (derived). Money moves between owner and club only through **three named
  transactions**: `injectCapital` (issue equity → club cash, owner diluted or
  pct up), `secondarySale` (owner sells shares → owner cash, no club effect),
  `dividend` (club → owner, board-gated). Every one posts through the existing
  `postEntry` finance layer on the club side. No other path exists.
- Control tiers are gameplay-first, not legal: `<10%` passive, `10–24%`
  significant, `25–49%` influential, `50–74%` control, `75%+` dominant, `100%`
  sole. Thresholds gate *which decisions the board can veto*, which is the
  actual gameplay, and reuses the board confidence machinery.

## 7. Owner vs manager/staff AI

- **Owner:** capital allocation, budgets, ticket/commercial pricing, hiring and
  firing staff, infrastructure, club identity/values, equity, accepting or
  rejecting offers, strategic directives.
- **Manager AI:** XI and formation, tactics, minutes distribution, youth
  promotion, player-development focus, who they *want* signed.
- **Recruitment staff AI:** targets, negotiation, valuations.
- **Contested middle (deliberately):** the owner can set directives (sell this
  player, give youth minutes, sign a striker) and the manager complies to a
  degree set by their personality and your relationship, with morale cost for
  overreach. That friction is the game.

## 8. Build-order dependencies

```
Tech debt (UI split, save layer)
  └─> World scale model (focus/fringe + deltas)
        └─> 5-tier pyramid
              └─> Careers (ageing/retirement/intake/AI transfers)
                    └─> Manager philosophy ──> Squad view ──> Match visualisation
                          └─> Club identity
                                └─> Valuation
                                      └─> Owner layer (owner ≠ club money)
                                            └─> Equity & control
                                                  └─> Buy/sell clubs
                                                        └─> Shareholder governance
```

Key constraints: valuation must precede the owner layer (you can't price a
club you can't value). The owner layer must precede equity. Careers must
precede buy/sell (otherwise an acquired club is a static object). The save
layer must precede everything (or every later phase re-does its migration).

## 9. Extend, don't replace

- `pyramid.ts` → parameterise tier count/size. Do not rewrite.
- `board.ts` → shareholders are directors with an equity claim. Reuse
  confidence, traits, objectives, reviews wholesale.
- `finance.ts` / `postEntry` → the *only* money mutation path, including owner
  transactions. Add categories, don't add a second ledger.
- `recruitment.ts` → keeps player/contract ownership; add lifecycle (age,
  retire, intake) as a new module consuming it.
- `reputation.ts` → the club-identity substrate already exists.
- `inbox.ts` → every new system's player-facing surface. Offers to buy the
  club, investor demands, manager complaints: all inbox generators.
- `matchday.ts` → keep as the truth source; visualisation reads it.

Replace outright: only `clubs.ts` (needs ~120 names + a name generator) and
`src/routes/index.tsx`'s monolithic structure.

## 10. Technical debt to clear first

1. **`src/routes/index.tsx` — 2,686 lines.** Split into route files per area
   (`/hub`, `/squad`, `/finance`, `/board`, …) with the bottom nav as a layout.
   Every subsequent phase adds screens; doing this later multiplies the cost.
2. **Save persistence.** Single localStorage JSON blob, no size guard, no
   quota-exceeded handling. Move to a chunked IndexedDB store with an
   async-safe `useGame` hook (currently synchronous `loadGame()` in an effect).
3. **Migration chain length.** 12 sequential in-place migrations inside
   `engine.ts`. Extract to `migrations/` with one file per step and a
   round-trip test per version, before adding the root-shape migration.
4. **Implicit single-club assumptions.** `s.cash`, `s.finance`, `s.board` etc.
   Introduce accessor helpers (`clubCash(s)`) now so the later reshape is
   mechanical rather than a 19k-line search-and-replace.
5. **Derived-projection duplication.** `stands`/`pitchCondition`/
   `trainingRating` mirror `infrastructure`; `s.squad` (legacy `Player[]`)
   mirrors `football.players`. Two sources of truth violate your own principle
   — retire the legacy projections.
6. **History unbounded growth.** No pruning/rollup policy anywhere.

---

# Phased Master Roadmap

Each phase is independently implementable, verifiable and lockable.

### Phase 0 — Foundation Hardening
- **Purpose:** make the codebase able to absorb the expansion.
- **Systems:** route/UI split; migration extraction; club-state accessors;
  retire legacy `squad`/`stands` projections; history rollup policy.
- **Dependencies:** none.
- **Schema:** v13 — remove duplicated projections; add `historyPolicy`.
- **Affected:** `index.tsx`, `engine.ts`, all tabs.
- **Risks:** UI regressions during the split; migration removal of fields other
  code silently reads.
- **Verification:** existing suites must stay green; add a save round-trip test
  for every version 1→13; visual smoke test on mobile viewport.
- **Out of scope:** any new gameplay.

### Phase 1 — Save & World Storage Layer
- **Purpose:** unlock world scale without breaking existing saves.
- **Systems:** chunked IndexedDB persistence, async `useGame`, compression,
  quota handling, `worldDeltas` log, focus/fringe representation contract.
- **Dependencies:** Phase 0.
- **Schema:** v14 — `world: { clubAggregates, deltas }`; storage format change.
- **Risks:** async load introduces hydration/SSR issues; data loss on migration
  (mitigate with a one-time localStorage backup copy).
- **Verification:** size/perf budget assertions (save < 2MB at simulated
  season 20); migration test from a real v12 localStorage payload.
- **Out of scope:** new tiers, new gameplay.

### Phase 2 — Five-Tier Pyramid
- **Purpose:** the world becomes a real football ecosystem.
- **Systems:** parameterised divisions (20/24/24/24/24), ~116 club identities,
  tier-scaled economy baselines, multi-tier promotion/relegation (incl. play-offs
  if desired), fringe-club aggregates.
- **Dependencies:** Phases 0–1.
- **Schema:** v15 — leagues array grows; economy profiles extended to 5 tiers.
- **Affected:** `pyramid.ts`, `clubs.ts`, `economy.ts`, `league.ts`,
  `reputation.ts`, `LeagueBrowser`.
- **Risks:** existing saves must map their 2 divisions into the new pyramid
  without teleporting the user's club; sim cost per week.
- **Verification:** extend `pyramid.check.ts` — integrity across 5 tiers over
  20 simulated seasons, no duplicate/lost clubs, sane promotion churn; weekly
  tick timing budget.
- **Out of scope:** cups, European competition.

### Phase 3 — Careers & World Ageing
- **Purpose:** the world evolves; players and staff have lives.
- **Systems:** ageing, development/decline curves, retirement, youth intake,
  AI-to-AI transfers, staff careers and the manager market.
- **Dependencies:** Phase 2.
- **Schema:** v16 — player lifecycle fields, `careerHistory` (compact),
  retirement records.
- **Risks:** demographic drift (squads emptying or inflating); determinism
  across the focus/fringe boundary.
- **Verification:** 20-season demographic audit — age distribution stable,
  squad sizes in band, ability distribution not inflating, same seed → same
  world.
- **Out of scope:** injuries, morale (Phase 5).

### Phase 4 — Managers, Philosophy & Club Identity
- **Purpose:** appointments become the owner's defining decision.
- **Systems:** manager philosophy + formation preferences + traits; club values;
  compatibility scoring; philosophy effects on selection, recruitment targets,
  development and match modifiers; owner directives with compliance friction.
- **Dependencies:** Phase 3.
- **Schema:** v17 — `ManagerProfile`, `club.identity`.
- **Affected:** staff hiring UI, `board.ts` expectations, `recruitment.ts`
  targeting, `matchday.ts` modifiers, `inbox.ts` generators.
- **Risks:** philosophy becoming cosmetic; over-tuned modifiers destabilising
  the calibrated economy/results.
- **Verification:** A/B simulation — clubs under differing philosophies produce
  measurably different xG profiles, squad age curves and recruitment patterns.
- **Out of scope:** visual match engine.

### Phase 5 — Player Depth & Squad View
- **Purpose:** the football operation becomes tangible.
- **Systems:** fitness, form, morale, injuries, suspensions, playing-time
  expectation; manager-selected XI; pitch squad view; player profile screen.
- **Dependencies:** Phase 4.
- **Schema:** v18 — player condition fields; `selection` per matchday.
- **Risks:** per-week cost across the world (apply full model to focus clubs
  only); UI density on mobile.
- **Verification:** injury/suspension rates within real-world bands over 10
  seasons; selection sanity (best available XI, respects philosophy).
- **Out of scope:** owner picking the XI.

### Phase 6 — Club Valuation
- **Purpose:** make growth measurable in value, not bank balance.
- **Systems:** `valuation.ts` pure function for *any* club, per-season valuation
  snapshots, valuation history chart, board/press narrative around it.
- **Dependencies:** Phases 2–5 (inputs must exist for every club).
- **Schema:** v19 — `clubValuationSnapshots` (append-only).
- **Risks:** runaway/degenerate valuations; double-counting cash vs revenue.
- **Verification:** valuation monotonicity/sensitivity tests per input; sanity
  bands per tier; 20-season run shows plausible spread across the pyramid.
- **Out of scope:** owner money, equity.

### Phase 7 — Owner Layer (separating the two wallets)
- **Purpose:** the fundamental split.
- **Systems:** `owner` root state — personal cash, holdings, net worth, cost
  basis, ownership record; the three sanctioned transaction types; owner
  dashboard; initial acquisition flow at new-game.
- **Dependencies:** Phase 6.
- **Schema:** v20 — root reshape `{ owner, club, world }` (the big one).
- **Risks:** the largest migration in the project; any missed `s.cash` path
  becomes a money leak.
- **Verification:** a **conservation-of-money audit** — every pound in the
  ledger reconciles across owner + club over a 20-season simulation; assert no
  module mutates cash outside `postEntry`.
- **Out of scope:** buying other clubs.

### Phase 8 — Equity, Control & Governance
- **Purpose:** ownership becomes a strategic dimension.
- **Systems:** shareholder register, ownership percentages, control tiers,
  capital injection vs secondary sale, dilution, shareholder priorities wired
  into the existing board, veto rules by control tier.
- **Dependencies:** Phase 7.
- **Schema:** v21 — `club.shareholders[]`, `board` gains equity linkage.
- **Risks:** confusing UX; degenerate strategies (sell 49%, spend, repeat) —
  needs friction (transaction costs, investor confidence, lockups).
- **Verification:** cap-table invariants (percentages always sum to 100, never
  negative); control-tier gating tests; dilution maths tests.
- **Out of scope:** debt instruments.

### Phase 9 — Club Acquisition Market
- **Purpose:** close the career loop.
- **Systems:** AI owners with motives and reservation prices; approach and
  negotiation; offers arriving for your club via inbox; sale execution;
  transition to a new club; owner career history; legacy scoring.
- **Dependencies:** Phase 8.
- **Schema:** v22 — `world.owners`, `owner.careerHistory`.
- **Risks:** the loop overshadowing club-building; handing your old club to AI
  must be believable.
- **Verification:** full career simulation — buy, grow, sell, rebuy; assert the
  sold club continues to evolve coherently; assert both play styles (flipper vs
  dynasty) reach comparable legacy scores.
- **Out of scope:** owning multiple clubs simultaneously.

### Phase 10 — Match Visualisation
- **Purpose:** watch what your manager built.
- **Systems:** zone/possession track derived from `matchday.ts` events; canvas
  dot rendering; tactical signature visible per philosophy; commentary overlay
  retained.
- **Dependencies:** Phases 4–5.
- **Schema:** none (pure derivation).
- **Risks:** mobile performance; the temptation to let the visualiser influence
  results (it must not).
- **Verification:** assert visual layer is a pure function of committed match
  events — same seed, same animation, identical scoreline.
- **Out of scope:** any physics or player-level ball simulation.

### Later / optional
Debt & financing, regulatory (FFP/wage caps), administration & failure states,
cups and continental competition, minority stakes in other clubs, academy
depth.

---

## Recommended single next milestone

**Phase 0 — Foundation Hardening.**

Not the exciting answer, but it is the correct one. Every later phase adds
screens to a 2,686-line route file, adds a migration to a 12-step in-place
chain, and adds fields to a state shape that assumes one club and one wallet.
Phase 0 is small, fully verifiable against the suites that already exist, and
it reduces the cost of every one of the nine phases that follow.

If you'd rather ship something visible first, the defensible alternative is
**Phase 5's squad view only** (read-only pitch + player profile) as a
self-contained UI slice — but I'd still do the route split as part of it.
