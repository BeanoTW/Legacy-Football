# Final release checklist

Candidate commit/build: **not signed off**. Latest verified merged gameplay fix: #300,
40aa5745f799896d657ee19e5be12a752b92ddf7 (all eight PR CI jobs passed). Validation ledger:
release-validation-2026-10-09.md. Gameplay feature work remains frozen.

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
