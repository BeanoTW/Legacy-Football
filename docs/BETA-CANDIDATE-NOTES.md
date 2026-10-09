# Beta candidate notes — pending validation

This is a candidate preparation document, not an announced release. The proposed
next beta label is `0.9.0-beta.1`; do not deploy or stamp it until authorised and
validated. The exact candidate commit, public build ID, release date and rollback
build remain to be recorded from the deployment. No stable 1.0 claim is made.

## Player-facing changes prepared

- Safer handling of unreadable/corrupt and newer-version saves, with protected
  recovery copies and visible save diagnostics.
- Copyable build-aware crash details and beta diagnostic reports.
- Optional cloud account deletion designed to remove that account's cloud careers
  while preserving careers on the current device; deployed positive-path testing
  is still required.
- Deployment-specific version/channel/build identity.
- Merged fix #299: differing device/cloud careers require a choice; automatic
  uploads refuse to replace an unacknowledged cloud revision.
- Proposed fix #300: emergency squad cover restores the senior floor after batch
  departures and season rollover, using normal paid contracts and registration.

The cloud conflict fix is merged but deployment is unverified. The squad fix remains under validation and must pass CI and the soak before merge.

## Save compatibility

- Current game save schema: **24**. Storage manifest format: **2**.
- Older supported saves are upgraded by the migration registry when loaded.
  The registry's automated compatibility suite reports 337 passes.
- Device testing with a save from the previous public deployment and a weekly tick/
  season rollover remains outstanding. Do not advertise that deployment path as
  tested yet.
- An older client may refuse a save created by a newer schema. Do not assume that
  a migrated save can be reopened by the previous release.
- A refused save is protected against replacement until an explicit reset. Keep
  its recovery copy and avoid clearing browser storage while investigating.
- Local careers are stored in this browser/device. Optional cloud sync adds an
  account-linked copy; sign-out is designed to preserve the local copy.

## Known issues and release holds

- Desktop layout is a known P2 issue and remains parked during beta hardening.
  Stable 1.0 requires desktop usability to be addressed.
- The 15-season Actions soak has not been dispatched because GitHub browser
  authentication is blocked. Local candidate soak evidence is tracked separately.
- Two-account cloud isolation, real account deletion, conflicts across independent
  devices and update-from-previous-build checks are not completed.
- Physical Android PWA, accessibility/zoom/theme matrix and an unfamiliar tester's
  first hour remain required.
- Privacy/Terms/Credits cannot be declared final while operator/contact/audience,
  deployment provider details and asset/notice obligations remain unresolved.

Refer to release-validation-2026-10-09.md for evidence and status. Final RC requires
all release validation and a successful 15-season soak on its final commit. Stable
1.0 additionally requires a separate successful 20-season soak on the intended
release commit and all remaining gates.

## Deployment metadata (after sign-off)

```text
LEGACY_FOOTBALL_RELEASE_VERSION=0.9.0-beta.1
LEGACY_FOOTBALL_RELEASE_CHANNEL=beta
```

Record the generated build ID from the actual deployment; do not substitute a
branch name or local timestamp for an intended commit-derived production build.

## Rollback

Previous public version/build: **not yet identified**. Preserve the known-good
artifact and existing player saves before any authorised deployment. Do not roll
back to a client that cannot read saves already migrated by a newer build.
