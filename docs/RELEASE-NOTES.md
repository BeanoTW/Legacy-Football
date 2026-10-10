# Unpublished beta candidate — updated 10 October 2026

Proposed version `0.9.0-beta.1`, channel `beta`, remains unpublished/unstamped.
This is not RC/stable sign-off. The current public update was approved for
`ee7da98e25bf436a09921c7bd878bf84ab6407c5`; observed runtime build ID is
`2026-10-09T21:04:32.464Z`, not an independently exposed Git SHA. New deployment
requires approval of its tested concrete candidate.

## Prepared changes

Merged #300 hardens depleted squads after retirement/rollover. Save protection,
recovery diagnostics, cloud conflict choices and build-aware crash reporting are
present. #304 signed-out Save now now reports Saved on device / Cloud unavailable,
and passed its public reproduction. #306 addresses queued-upload/deletion
resurrection in mocks; authenticated deployed reproduction remains unverified.

Merged #310 restores Inbox briefing keyboard focus to the opener or visible
selected filter, with preview Escape/Close and unread-row fallback observed.
Merged #311 clarifies Featured chances / Featured xG and explains that summaries
include all shots; updated preview wording is observed. Merged opening ownership
dialogue correction #313 passed CI and new/existing preview conference checks;
its financial-journalist variant has automated coverage. Public retests remain
pending; see the
[current release ledger #315](https://github.com/BeanoTW/Legacy-Football/issues/315)
for its actual merge and test status. No gameplay expansion or desktop redesign.

## Save compatibility

Game schema **24**, storage format **2**. Older supported saves migrate through
the registry; prior automated migration suite passed 337 assertions. Corrupt and
future-version saves are protected against replacement, with recovery copies.
Reverse migration is not promised. A real previous-public-build career followed
by a weekly tick and rollover remains unverified on devices.

History compaction means the current compact inbox need not equal the original
full inbox. Do not describe the earlier deployed smoke as full-payload equality
or verified archive recovery. Protected-record recovery export is separate from
playable-career export/import; general portable import/export is not verified.
Confirm a usable backup before clearing storage or changing devices.

## Actual evidence and outstanding gates

Actions **38044020978** passed 15 seasons on exact **ee7da98**, fixed
RELEASE|SOAK|FIXED seed, interval 5. Raw checkpoints 17.05 / 29.92 / 42.49 MiB.
A fresh final-candidate soak remains required; later status belongs in #315.
Local fake-IndexedDB 15-season persistence/checksums passed as supporting evidence,
not Android quota validation. Signed-out local save/reload/slot smoke and
production RLS/FK/function configuration were checked separately.

Production account E2E is **user-waived for this pass, not passed**. A/B isolation,
same-slot IDs, independent-device sync/conflict decisions, account deletion/local
preservation and actual expired authentication remain unverified. The user's phone
sign-in/save-deletion reports are labelled separately.

Installed Android PWA/offline/reconnect/prior-build update, phone/tablet usability,
complete accessibility/text scaling/contrast and unfamiliar-tester first hour
remain open. Desktop Settings overlap is known P2, parked for beta and required
before stable. Ben Wilson / beanotarren@gmail.com are approved operator/contact;
audience/eligibility, retention/providers, final Privacy/Terms, asset/notice rights
and legal surfaces remain unresolved. Five root-package notice gaps remain after
#314. No legal/distribution clearance is inferred.

[Known issues](KNOWN-ISSUES.md) distinguish merged/preview fixes from public
verification. RC needs all release validation plus final-commit 15-season soak.
Stable additionally needs desktop validation and a separate actual 20-season soak.
The current approved public source is a comparison reference; a later rollback
artifact and compatibility are not yet verified.

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
