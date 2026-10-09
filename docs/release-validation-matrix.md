# Legacy Football release validation matrix

This is the practical pre-launch gate for beta, release candidate and 1.0.
Normal pull-request CI is necessary but not sufficient: long careers, deployed
account flows and device-specific behaviour are deliberately verified separately.

## Gate A — every pull request

These must be green before ordinary code is merged unless an explicit emergency
override is being used:

- Build
- TypeScript
- Lint
- All game-check shards
- Release guard

The ordinary suite protects deterministic simulation, migrations, storage,
economy, world integrity and UI architecture without making every PR run a
multi-decade career.

## Gate B — beta candidate

Run before giving a build to cold testers:

- Manual **Release soak** workflow: 10 seasons minimum; 15 preferred.
- Fresh-career smoke: create a Level 7 career, appoint staff, make a transfer,
  play/sim a match, advance through a transfer deadline and complete a season.
- Existing-save migration: load at least one saved career from the previous
  public build and advance it through a weekly tick and a season rollover.
- Save/reload: confirm club, season/week, cash, squad, inbox and active transfer
  negotiations are unchanged after refresh.
- Installed PWA / Android-class mobile: launch, resume, background/foreground,
  offline launch and reconnect.
- Desktop: navigation and core actions must be usable at 1280×720 even if the
  final desktop visual overhaul is still being iterated.
- First-hour test with at least one person who has not seen development builds.

## Gate C — release candidate

Feature work stops here. Try to break the game.

### Long-career
- Run the manual **Release soak** for 15 seasons.
- Before 1.0, also complete one 20-season soak.
- Review emitted checkpoint metrics for save size, player population, inbox
  growth and transfer-history growth rather than relying only on pass/fail.
- Confirm promotions/relegations, player demographics, squad populations and
  transfers remain football-shaped.

### Save safety
- Complete every item in `docs/save-account-release-checklist.md`.
- Corrupt primary / valid fallback recovery.
- Failed write / quota failure.
- Future-schema save cannot be overwritten by an older client.
- Delete cannot be resurrected by queued local/cloud work.
- Confirm visible last-saved status is accurate.
- Export/import backup if that feature is included in the release.

### Update safety
- Install previous public build, create a career, update to the RC and load it.
- Repeat with an offline-installed PWA that reconnects after the new build is
  deployed.
- Confirm update never silently creates a new empty career over an existing one.

### Device / accessibility
- Mid-range Android phone.
- Small phone width.
- Tablet.
- 1280×720 laptop.
- 1920×1080 desktop.
- Keyboard-only navigation for primary workflows.
- Focus visibility in dialogs/sheets.
- Text scaling / browser zoom.
- All themes checked for readable contrast.
- Critical state is never communicated by colour alone.

### First-hour usability
A cold tester should be able to:
- understand that they are Director of Football & Operations;
- understand Advance / Calendar;
- find Inbox decisions;
- understand manager responsibilities;
- recruit through staff-led scouting rather than expecting a global database;
- reach Squad, Transfers, Staff, Finances and Facilities without instruction;
- complete the opening tutorial without being told optimal decisions.

Record every point where the tester asks "what am I meant to do?" or "where is
that?" even if they eventually find it.

## Gate D — 1.0 sign-off

All Gate C checks pass, plus:

- 20-season Release soak is green on the intended release commit.
- Account/cloud checks have been completed against the deployed production
  Supabase project with disposable test accounts.
- Privacy, Terms and Credits are present and accurate.
- Third-party assets/licenses have been audited.
- Version number, build ID, release notes and migration notes agree.
- Known issues are written down explicitly.
- No unresolved P0/P1 save-loss, progression-blocking or update-breaking issue.
- No feature changes after final RC validation unless the release gates are run
  again for the affected area.

## Manual Release soak

Run in GitHub Actions: **Actions → Release soak → Run workflow**.

Recommended cadence:
- During hardening: 10 seasons.
- Beta candidate: 15 seasons.
- Release candidate: 15 seasons.
- Final 1.0 commit: 20 seasons.
- 30 seasons is an optional endurance test, not a routine gate.

The workflow uses normal weekly advancement rather than directly calling season
rollover logic. At checkpoints it serializes and migrates the save, verifies a
byte-stable round trip, then confirms the next weekly tick is identical before
and after reload. It also checks pyramid integrity, Focus/Fringe coverage,
player-age/ability bounds, squad populations, finite numeric state and abnormal
raw save-growth acceleration.
