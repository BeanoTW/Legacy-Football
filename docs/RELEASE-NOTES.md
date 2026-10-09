# Unpublished beta candidate — 9 October 2026

**Not a released version or release sign-off.** Proposed engineering version:
`0.9.0-beta.1`, channel `beta`. Stamp the approved deployment with its actual
commit-derived build ID. Current public build diagnostics reported timestamp
2026-10-09T10:54:40.155Z; its Git SHA remains unverified. No rollback build has
been approved or deployment authorised.

## Candidate changes and verification

- Long-career world simulation hardening in merged PR #300 fixes depleted squads
  following retirement/season rollover and applies the intended Focus squad floor.
- Save protection, recovery diagnostics, cloud conflict choices, account deletion
  and deploy-stamped metadata are present in source. Live account deletion and
  cross-device behaviour remain unverified.
- PR #304 changes manual-save confirmation to claim cloud success only after a
  confirmed write or identical cloud copy; signed-out saves report device-only.
- PR #306 orders manual sync, automatic uploads and deletions together and rejects
  stale queued work, addressing the reproduced cloud-slot resurrection race.
- These two fixes remain subject to full CI, merge and deployed reproduction
  checks. Keep the corresponding P1 entries open until deployed verification.
- No gameplay feature expansion or desktop redesign is included in this pass.

## Save compatibility and migration

Current save schema is **24**. Automated migration checks passed (337 assertions),
along with corruption/future-version protection and rollback checks. A newer
schema is rejected and protected instead of silently overwritten. Opening an
older supported save migrates it through the registry; reverse migration is not
promised. Loading an actual career from the previous public build, then advancing
a week and rolling over a season, still requires deployed validation.

Compaction moves historical detail out of the active core. Deployed week-2
reload preserved cash, the complete displayed squad and the current compact inbox;
the initial full live inbox was not identical after compaction. Do not describe
that observation as full-inbox equality or verified player-facing archive recovery.

General playable-career export/import has not been verified. Protected-record
recovery export is a separate mechanism. Confirm a usable cloud backup before
clearing browser storage or changing devices; do not assume the signed-out
Cloud synced message proves a backup exists.

## Actual completed evidence

- Actions run **37963939196** passed 15 seasons on exact main
  **b1d12d79d5a9b8342a687312d64cc3bcaa9c1a26**, checkpoint 5, seed
  RELEASE|SOAK|FIXED. Raw checkpoints: 17.05 / 29.92 / 42.49 MiB at seasons
  5 / 10 / 15. This is not evidence for a later candidate commit.
- Supporting local 15-season fake-IndexedDB persistence passed: 4.71 MiB active
  core, 41.69 MiB total, 102 history chunks, exact compact-core reload and valid
  checksums. This does not test Android/browser quota.
- Signed-out public-browser local save/reload and three-slot isolation smoke passed.
- Production RLS, foreign-key cascade and deployed deletion-function configuration
  passed inspection; missing/literally invalid JWT requests returned 401.
- See the linked evidence files in FINAL-RELEASE-CHECKLIST.md. A fresh 15-season
  Actions run is required after the candidate fixes merge.

## Remaining release gates and known issues

KNOWN-ISSUES.md retains P1 misleading cloud-save status and the manual-sync
deletion race until deployed fixes are tested; P2 desktop Settings overlap remains
parked during beta hardening; a P3 Home briefing can expose a raw club ID.
Production two-account isolation, shared slot IDs, both conflict choices,
cross-device sync, sign-out/deletion with local preservation and real expired
authentication require authorised disposable accounts.

Installed Android PWA launch/resume/offline/reconnect/update, previous-public-build
migration, phone/tablet usability, complete keyboard/contrast/text scaling checks
and an unfamiliar tester's first hour remain open. Legal operator/contact,
retention/provider arrangements, terms approval and outstanding asset/dependency
notices remain unresolved. No RC or stable sign-off is granted. Stable 1.0 also
requires desktop usability and a separate successful 20-season soak on its
intended release commit.

---

# Legacy Football release notes

Use this document as the source template for each public beta, release candidate
and 1.0 release. The exact build ID should always be copied from the deployed
build so reports can be tied back to one commit.

## Release header

- Version:
- Channel: Beta / Release Candidate / Stable
- Build:
- Release date:
- Minimum save schema:
- Migration notes:

## Headline changes

Summarise the few changes a returning player will actually notice.

- 
- 
- 

## Gameplay and simulation

- 

## Transfers / recruitment / staff

- 

## Facilities / finances / club operations

- 

## Matchday / calendar / presentation

- 

## Saves / cloud / updates

- 

## UI / accessibility

- 

## Fixed

- 

## Save compatibility

State this explicitly for every release:

- Can saves from the previous public build load?
- Does opening the save migrate it?
- Can a save opened in this release still be loaded by the previous release?
- Is there any known migration risk?
- Was the release soak completed, and for how many seasons?

## Known issues

Link to `docs/KNOWN-ISSUES.md` and copy only player-relevant issues here.

## Validation completed

Record the actual release gates completed on the final commit:

- [ ] Build / typecheck / lint / game checks
- [ ] Release soak
- [ ] Save/account release checklist
- [ ] First-hour cold beta test
- [ ] Accessibility/mobile release gate
- [ ] Update-from-previous-build test
- [ ] Production cloud/account test
- [ ] Legal / credits review

## Rollback note

If the release causes save, migration or update problems, record the last known
good build here before deployment so rollback is unambiguous.

- Last known good version:
- Last known good build:
