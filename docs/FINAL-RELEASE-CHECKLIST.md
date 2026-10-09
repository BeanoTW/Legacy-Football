# Final release checklist

Candidate commit/build: **not signed off**. Gameplay feature work remains frozen.
The successful 15-season Actions run 37963939196 belongs exactly to
b1d12d79d5a9b8342a687312d64cc3bcaa9c1a26. PRs #304–#306 require full CI before
merge and a fresh 15-season Actions run on the resulting main; this document does
not claim that later gate passed.

Evidence: release-actions-validation-2026-10-09.md (actual Actions log),
deployed-validation-2026-10-09.md (signed-out browser results),
long-career-persistence-2026-10-09.md (automated fake-IndexedDB evidence),
cloud-deletion-ordering-2026-10-09.md (mock reproduction and fix).
Each report identifies its tested source and limitations. Proposed next version:
0.9.0-beta.1, channel beta; unpublished, deployment metadata/rollback unverified.

## Evidence completed before final candidate selection

- [x] Actual 15-season Actions soak, checkpoint 5, fixed release seed, on b1d12d79.
- [x] Automated storage/migration/protection/rollback/save-queue checks.
- [x] Automated cloud planning, upload acknowledgements and deletion-order regression.
- [x] Separate local 15-season persisted IndexedDB core/history checksum validation.
- [x] Signed-out deployed local save/reload and three-slot isolation smoke.
- [x] Production RLS/FK/function configuration audit; invalid/missing JWT rejected.
- [ ] Production disposable-account end-to-end tests (authorisation required).
- [ ] Deployed verification of the two P1 cloud fixes.
- [ ] Final candidate CI and fresh Actions soak (pending; use actual run evidence).

The checked supporting evidence does not complete all items below.

## Beta

- [ ] Candidate build, typecheck, lint, all game shards and release guard pass.
- [ ] Review the recommended 15-season Actions soak with checkpoint 5 and
      RELEASE|SOAK|FIXED seed on the latest candidate main.
- [ ] Verify first-career operational smoke and save/reload on the deployed build.
- [ ] Migrate a previous public-build save; verify a tick and season rollover.
- [ ] Run installed Android PWA launch/resume/offline/reconnect/update checks.
- [ ] Check small phone/tablet, keyboard focus, zoom/text scaling and all themes.
- [ ] Complete the unfamiliar tester first hour and record defects.
- [ ] Verify production two-account isolation, shared slots, cloud conflicts,
      sign-out, deletion and local save preservation with authorised accounts.
- [ ] Complete approved Privacy/Terms/Credits and release/compatibility notes.
- [ ] Record actual version/channel/build ID, host/origin and rollback build.
- [ ] Obtain explicit authorisation before public deployment/release.

## Release candidate

- [ ] All beta checks and every save-account checklist item completed.
- [ ] Successful 15-season Actions soak on the final candidate commit, with
      checkpoint metrics reviewed (a local pass is supporting evidence only).
- [ ] No remaining material save-integrity, security or progression defect.
- [ ] Revalidate affected gates after any subsequent fix.

## Stable 1.0

- [ ] All release validation completed on the intended release commit.
- [ ] Separate successful 20-season soak on that commit.
- [ ] Desktop usability properly addressed and tested.
- [ ] Asset/font/dependency notices and legal copy approved and present.
- [ ] No unresolved material security, save-integrity or progression defect.
- [ ] Explicit public release authorisation.

No checkbox above is a claim that the corresponding gate ran. Automated, mocked
client, deployed account and physical-device evidence remain separately labelled
in the validation ledger. Do not announce stable 1.0 while any required gate is
blocked or failed.
