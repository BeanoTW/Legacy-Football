# Beta candidate notes — updated 10 October 2026

This is candidate preparation, not an RC/stable sign-off. Proposed next label:
`0.9.0-beta.1`, channel `beta`; it has not been published or stamped.
The current public update was explicitly approved for source
`ee7da98e25bf436a09921c7bd878bf84ab6407c5`. Its observed runtime build ID is
`2026-10-09T21:04:32.464Z`, a timestamp rather than an independently exposed Git SHA.
Any subsequent public update needs approval of the concrete tested candidate.

The current pass/fail/blocked evidence is maintained in
[release ledger #315](https://github.com/BeanoTW/Legacy-Football/issues/315).
Historical reports remain evidence only for their stated commits.

## Player-facing changes prepared

- Protected unreadable/corrupt and future-version saves, recovery copies and diagnostics.
- Build-aware crash reports and beta diagnostic downloads.
- Optional account deletion designed to remove the authenticated account/cloud
  careers while retaining careers on this device; real positive-path E2E is unverified.
- Merged #299: differing cloud/device copies require a decision; automatic upload
  refuses an unacknowledged cloud revision.
- Merged #300: emergency paid/registered squad cover after departures and rollover.
- Merged #304: signed-out Save now reports device-only success; the original
  signed-out reproduction passed on the approved public update.
- Merged #306: sync/upload/deletion ordering prevents the mocked resurrection race.
  Authenticated deployed deletion remains unverified.
- Merged #310: Inbox briefing focus returns to its opener or the selected visible
  filter; preview Escape/Close, unread-row and resolved-decision fallback passed.
  Boardroom navigation completed; public verification remains pending in #315.
- Merged #311: live header labels Featured chances / Featured xG and explains
  that match summaries include every shot. Updated wording was observed in preview.
- Merged #313: opening ownership questions/answers aligned, including existing
  saved conference display. All eight CI jobs passed; new/existing preview
  conferences completed successfully. Financial-journalist variant is automated
  coverage; public retests remain pending in #315.
- Merged #309: approved public operator/contact recorded as Ben Wilson,
  beanotarren@gmail.com.
- Merged #314: natural-compare notice evidence preserved; five root-package
  notice gaps remain. This is not distribution/legal clearance.

Gameplay feature development remains frozen. No desktop redesign is included.

## Save compatibility

- Game save schema **24**; storage manifest format **2**.
- Supported older saves migrate through the registry. The automated suite
  previously passed 337 assertions; current-candidate reruns are recorded in #315.
- A previous-public-build save followed by a weekly tick and season rollover
  still needs deployed/device validation.
- Reverse migration is not promised; older clients can refuse newer-schema saves.
- A refused save is protected against replacement until explicit reset. Preserve
  its recovery copy and avoid clearing browser storage.
- Local careers belong to this browser/device. Cloud sync adds an account copy.
  Sign-out/account deletion are designed to retain local careers; authenticated
  positive-path preservation is not independently verified.
- Protected-record recovery export is separate from playable-career import/export.
  Do not advertise general portable export/import as tested.

## Completed supporting evidence and holds

Actions run **38044020978** passed 15 normal weekly seasons on exact source
**ee7da98e25bf436a09921c7bd878bf84ab6407c5**, checkpoint interval 5, seed
RELEASE|SOAK|FIXED. Checkpoints 5/10/15 were 17.05 / 29.92 / 42.49 MiB raw.
This is not a pass for later commits; a fresh final-main soak is pending in #315.
GitHub workflow authentication now works.

Automated save/migration/queue results, limited preview local slot/reload smoke,
public signed-out acknowledgement and production RLS/FK/function configuration
are recorded separately in #315 and the historical reports.
The user waived disposable-account setup/E2E for this pass. It is **not passed**:
A/B isolation, same slots, two-device sync/conflicts, deletion/local preservation
and expired auth remain unverified. No further game-auth handoff unless reopened.

Installed Android PWA/offline/reconnect/prior-build update, small phone/tablet,
full keyboard/contrast/text scaling and an unfamiliar tester's first hour remain
open. Desktop Settings overlap is known P2 and parked for beta; it blocks stable.
Operator/contact are approved; audience/eligibility, retention/provider details,
final Privacy/Terms approval, asset/notice rights and player-facing legal surfaces
remain unresolved. No legal identity or policy is inferred.

## Deployment metadata and rollback

After validation and explicit approval, configure:

```text
LEGACY_FOOTBALL_RELEASE_VERSION=0.9.0-beta.1
LEGACY_FOOTBALL_RELEASE_CHANNEL=beta
```

Record the actual deployed build identity and its source relationship. A branch
name is not a build ID. The current approved public source above is a comparison
reference, not a tested rollback artifact for a later candidate. Preserve saves
and verify rollback compatibility/artifact availability before a future rollout.

RC requires full release validation and a successful 15-season soak on its final
commit. Stable 1.0 additionally requires desktop usability and a separate actual
successful 20-season soak on the intended release commit. Projected metrics are
not a 20-season pass.
