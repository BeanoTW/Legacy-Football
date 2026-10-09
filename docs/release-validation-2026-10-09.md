# Release validation — 9 October 2026

## Scope and release decision

Baseline independently verified: `f70e7bf137271a4a241f8df1eabe577ba5cab9e1` on main.
PRs #289–#298 listed in the handoff are in its history; #293, #294, #296 and #297
were independently confirmed merged using GitHub metadata.

**No beta/RC/stable release sign-off.** No public deployment or production account
creation/deletion was performed. Gameplay feature expansion remains frozen.
Desktop remains the documented P2 issue and a stable-1.0 blocker.

## Pass / fail / blocked ledger

| Gate | Status | Evidence and limits |
| --- | --- | --- |
| GitHub Actions 15-season soak on latest main | BLOCKED | Workflow has no runs at initial inspection. Connector has no dispatch capability; browser signed out. Google reports device approval declined; login attempt stopped. |
| Local baseline 15-season soak | FAIL | Bun 1.4.2; RELEASE\|SOAK\|FIXED; checkpoints every 5. Failed after season 2 before any checkpoint: user club c_06ns1cr0cpl5nm has 25 players, while old gate incorrectly requires 26. Reproduced twice. |
| Local policy-corrected soak | FAIL | Shared 22–36 limits exposed season-3 user squad of 21. Weekly cover precedes rollover retirement/intake. |
| Local boundary-only fix | FAIL | Season 4 opened with 13 user players. Emergency cover had a two-signing cap. |
| Local soak with full emergency cover | RUNNING | Latest PR #300 candidate; 15 seasons, checkpoint 5, same seed. Do not treat a running process as a pass or as an Actions run. |
| Cloud conflict safety | FIX PROPOSED | PR #299. Before fix, 2 regressions fail: newer device/cloud differences silently replace the other copy. After fix, all 17 planning checks pass. Manual differing copies require an explicit choice; autosave only extends the acknowledged remote revision. |
| Cloud-fix build / TypeScript / lint | PASS locally | Full local build, tsc --noEmit and lint exit 0. GitHub CI remains separate and must pass before merge. |
| LocalStorage protection/recovery | PASS automated | storage.check.ts: corrupt/future copies, fallback recovery/export preservation and slot separation. No physical browser recovery-export interaction was tested. |
| IndexedDB save store | PASS automated | idb-storage.check.ts: 45 checks, including migration, integrity, rollback/write errors, metadata, protection and long-career persistence. Uses memory record backend. |
| IndexedDB backend | PASS automated | idb-backend.check.ts against fake-indexeddb. This is not a physical-device IndexedDB run. |
| Protection and rollback regressions | PASS automated | storage-protection-regressions.check.ts and storage-rollback.check.ts exit 0. |
| Public engine save queue | PASS automated | New save-queue.check.ts exercises rapid-write ordering, deletion after a pending write, rejected-write recovery and three-slot isolation using memory records. |
| Existing-save migrations | PASS automated / BLOCKED device | migration.check.ts passed; migrations.check.ts reports 337 passed, 0 failed. Previous public-build device update has not run. |
| Account-deletion regression | PASS source contract only | account-deletion.check.ts checks source strings. Does not prove deployed account deletion. |
| Production project/configuration | PASS configuration | ACTIVE_HEALTHY, eu-west-1 Ireland, PostgreSQL 17.6.1.155. RLS enabled; SELECT/INSERT/UPDATE/DELETE use auth.uid() = user_id, UPDATE has USING and WITH CHECK. PK (user_id, slot_id); auth.users FK ON DELETE CASCADE. Privileged rls_auto_enable() not executable by anon/authenticated. No player save contents queried. |
| Deployed delete-account function | PASS configuration | ACTIVE version 1, verify_jwt=true. Executable code matches repository source after excluding comments/whitespace. |
| Missing/invalid deletion auth | PASS deployed negative requests | Production POST without auth and with the literal invalid token release-validation-invalid-token both return HTTP 401. No valid token or real account used. |
| Expired authentication | BLOCKED | No valid disposable session whose expiry can be exercised. Invalid signature tests are not expiry tests. |
| Two-account RLS isolation / shared slot IDs | BLOCKED | Need explicitly authorised disposable accounts and email verification. Configuration does not substitute for account-level API tests. |
| Cross-device sync / explicit conflict UI | BLOCKED | Need disposable accounts and independently stored browser/device copies. |
| Pending cloud uploads / delete resurrection | NOT VERIFIED | Local write deletion queue passed. Full cloud upload/deletion races and authentication transitions still need behavioural tests. |
| Local careers after sign-out/account deletion | NOT VERIFIED deployed | Source intentionally preserves local careers; live flow requires disposable accounts. |
| Physical Android PWA / offline / resume / previous-build update | BLOCKED | Requires an actual installed Android PWA and identified public build/origin. |
| Mobile/tablet/desktop focus, zoom, themes | NOT RUN | Checklist exists, not a completed test. Desktop redesign remains parked. |
| First-hour unfamiliar tester | BLOCKED | Requires a person who has not seen development builds. Use docs/first-hour-cold-beta-protocol.md. |
| Privacy / Terms | BLOCKED | Operator identity, privacy contact, intended audience, actual deployed host/origin, retention terms and production telemetry remain unresolved. Engineering inventory is not a public legal notice. |
| Credits / licences / assets | PARTIAL | Installed frozen-lock Linux graph: 451 package versions; no missing licence declarations. Full list in dependency-license-inventory.json. Declarations are not clearance or complete distribution notices. Generated packaged notices are in OPEN-SOURCE-NOTICES.txt; 31 packages have no top-level notice file located. Fonts, art, branding and service terms still require review. |
| Client credential exposure | PASS narrow local scan | Two locally generated public JS files contain zero sb_secret_ key literals and zero decoded service_role JWT literals. Does not cover deployed bundles, repository history or secrets supplied later. |
| Version / save compatibility | PARTIAL | Current save schema is 24. Deployment metadata defaults to Development without release environment values. No public beta/RC version or rollback build asserted. |

## Open fixes

- #299: require explicit manual choice for differing device/cloud saves and protect
  automatic uploads from progress written by another device.
- #300: use canonical squad bounds in the soak and apply existing emergency cover
  after retirement/intake at season rollover, restoring the full 22-player floor
  rather than only two replacements per pass. Focused regression restores 13 to 22
  with paid, registered signings and does not duplicate them on repeat.

CI is required before either fix is merged. Repeat the soak on the final merged
candidate; a pass from an earlier or isolated branch is not final sign-off.

## Remaining authorisations / participation

1. GitHub browser sign-in to enable the exact manual Actions dispatch. Do not retry
   a declined authentication prompt without renewed user intent.
2. Permission to create two named disposable production test accounts, verify their
   email links and delete only those accounts after isolated tests. Preserve local
   snapshots and identify user IDs before any destructive action.
3. Identify the intended public game origin and previous public build for deployment
   and PWA update checks.
4. Physical Android/device tests and one unfamiliar first-hour tester.
5. Business decisions for legal copy: operator/controller name, public support/privacy
   contact, audience/minors policy, and asset provenance/licensing assertions. Provider
   retention/telemetry details should be researched from the actual deployed stack.

## Reproduction commands

```sh
SOAK_SEASONS=15 SOAK_CHECKPOINT_EVERY=5 SOAK_SEED='RELEASE|SOAK|FIXED' bun src/lib/game/__release__/release-soak.ts
bun src/lib/game/__checks__/cloud-sync.check.ts
bun src/lib/game/__checks__/rollover-squad-cover.check.ts
bun src/lib/game/__checks__/save-queue.check.ts
```

The last two files are proposed checks on their respective PRs. Do not assume they
exist on the baseline main until merged.
