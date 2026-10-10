# Final release checklist — updated 10 October 2026

Candidate commit/build: **not signed off**. Gameplay feature work remains frozen.
Current evidence and later candidate results:
[release ledger #315](https://github.com/BeanoTW/Legacy-Football/issues/315).
Historical evidence is retained in [PR #305](https://github.com/BeanoTW/Legacy-Football/pull/305)
and the existing dated reports; each result applies only to its tested source.

The approved public update corresponds to source
`ee7da98e25bf436a09921c7bd878bf84ab6407c5`; observed runtime build ID
`2026-10-09T21:04:32.464Z`. Proposed `0.9.0-beta.1` is not published/stamped.
A subsequent public update needs explicit approval of the validated candidate.

## Supporting evidence completed

- [x] Actual 15-season Actions soak 38044020978 on ee7da98, interval 5, fixed seed.
- [x] Automated storage/migration/protection/rollback/save-queue checks on stated sources.
- [x] Mocked cloud conflict/upload acknowledgement/deletion ordering checks.
- [x] Separate local 15-season fake-IndexedDB core/history checksum validation.
- [x] Limited signed-out deployed local save/reload and slot-separation smoke.
- [x] Public signed-out manual acknowledgement fixed and retested on approved update.
- [x] Production RLS/FK/function configuration audit; missing/invalid JWT rejected.
- [x] Ben Wilson / beanotarren@gmail.com approved and recorded in #309.
- [ ] Final combined candidate CI and fresh Actions soak; use #315 actual evidence.
- [ ] Complete all corrected candidate browser reproductions and public retests.

Disposable-account E2E was **waived by the user for this pass, not passed**.
This does not complete the RC/stable account gates. Phone authentication/save
deletion is user-reported evidence, not independently observed A/B isolation or
account deletion. No destructive production test or new auth handoff is planned.

## Beta

- [ ] Candidate build, typecheck, lint, all game shards and release guard pass.
- [ ] Review recommended 15-season Actions soak on latest candidate main,
      checkpoint 5 and RELEASE|SOAK|FIXED seed.
- [ ] First-career operational smoke and save/reload on the intended deployed build.
- [ ] Previous public-build save migration, weekly tick and season rollover.
- [ ] Installed Android PWA launch/resume/offline/reconnect/update.
- [ ] Small phone/tablet, keyboard focus, zoom/text scaling and all themes.
- [ ] Unfamiliar tester first hour, with defects recorded.
- [ ] Production two-account isolation/shared slots/conflicts/sync/sign-out/deletion
      and local preservation with authorised disposable accounts.
- [ ] Approved Privacy/Terms/Credits, release notes and compatibility information.
- [ ] Actual version/channel/build ID, origin and tested rollback plan recorded.
- [ ] Explicit approval before public deployment/release.

The user-requested account-test waiver may permit a limited beta pass, but must
remain visible and cannot be recorded as successful account validation.

## Release candidate

- [ ] All beta checks and every save-account checklist item completed.
- [ ] Successful 15-season Actions soak on final commit, checkpoint metrics reviewed.
- [ ] No remaining material save-integrity/security/progression defect.
- [ ] Revalidate affected gates after subsequent fixes.

## Stable 1.0

- [ ] Full release validation on the intended release commit.
- [ ] Separate successful 20-season soak on that commit.
- [ ] Desktop usability properly addressed and tested.
- [ ] Asset/font/dependency notices and approved legal copy present.
- [ ] No unresolved material security/save-integrity/progression defect.
- [ ] Explicit public release approval.

Automated/mocked, preview, public, user-reported and physical-device evidence must
remain separately labelled. No RC/stable declaration while required gates remain
failed, blocked, waived or unverified.
