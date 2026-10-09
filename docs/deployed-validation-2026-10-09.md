# Deployed save and usability validation — 9 October 2026

Release remains NOT SIGNED OFF. Public origin: https://legacy-football.lovable.app/.
The deployed Git SHA is unverified; earlier downloaded diagnostics reported build timestamp 2026-10-09T10:54:40.155Z and schema 24. Tests below use signed-out disposable LOCAL careers only. No production account or real-player career was created, read, changed or deleted.

## Deployed browser results

Cloud Chrome browser, 1363×936 viewport, normal browser mode (not installed Android PWA).

| Check | Result | Actual evidence / limit |
| --- | --- | --- |
| Initial local save/reload | PASS | Release Validation FC, season 1/week 1, £220,000, 30 players, initial inbox survived reload. |
| Career progression | PASS smoke | Resolved opening decisions, simulated Brackley United 1–0, advanced into week 2, accepted simulated sponsorship. This is a smoke test, not human cold-beta evidence. |
| Week-2 cash and squad reload | PASS | £229,402 and entire displayed squad text (all 30 profiles, ratings/positions/fitness) matched before/after reload. |
| Current live inbox repeat reload | PASS | Four current messages, three unread; entire displayed Inbox text matched after completed manual save/reload. |
| Entire initial inbox unchanged after first week-2 reload | NOT IDENTICAL | Live feed went from 11 messages/7 unread to 4 messages/3 unread. Repository compaction deliberately moves week-old messages to history chunks. Deployed recovery of those archived chunks through a player-facing UI was not tested. Do not report full inbox equality or unproven archive recovery. |
| Three local slot isolation | PASS smoke | Career 1 Release Validation FC remained week 2; Career 2 Release Slot Two FC and Career 3 Release Slot Three FC remained week 1. Slot 3 survived reload. Returning to slot 1 preserved identical squad and current inbox, with original £229,402. No deletions were performed. |
| Signed-out manual cloud status | FAIL P1 | Not signed in alongside Saved on device · Cloud synced. Fix PR #304; deployed correction unverified. |
| Keyboard More menu | PASS smoke | Tab moved Close → Academy; Escape dismissed menu and restored focus to More. Keyboard Enter activated obscured slot controls. Not a full keyboard/screen-reader audit. |
| Desktop Settings pointer access | FAIL P2 | Cards overlap the save manager at 1363×936; a slot-3 pointer click did not activate the control. Keyboard Enter worked. Existing parked desktop issue; no redesign undertaken. |
| Match briefing preview | FAIL P3 | Home preview displayed a raw club ID; Inbox resolved Brackley United correctly. |

## Save/account checklist mapping

| Requirement | Automated tier | Deployed/device tier |
| --- | --- | --- |
| Save/reload | Storage and queue checks | Browser smoke above; physical device pending |
| Existing-save migration | Migration registry and fake-IndexedDB migration checks | Previous public-build career migration pending |
| Corrupted and future-version protection, recovery export | Storage protection and rollback checks preserve original records; export implementation reviewed previously | Corrupt/future deployed record and UI recovery export not injected/tested |
| Quota/write failure | Simulated failure and rollback checks | Actual device quota and offline write interruption pending |
| Multiple slots | Automated isolation/queue checks | Three disposable local slots smoke passed |
| Pending uploads and deletion resurrection | Network-prohibited mock queue checks | Authenticated production pending-upload deletion not performed |
| Conflict decision | Mock planning/conditional-write checks | Two authenticated devices and both explicit choices pending |
| Sign-out and account deletion preserve local saves | Mock account/queue checks and executable source comparison | Live disposable account sign-out/deletion pending explicit authorisation |
| Cross-account RLS and shared cloud slot IDs | Production configuration audit only | Two disposable account end-to-end tests pending explicit authorisation |
| Invalid/expired auth | Missing and literally invalid JWT requests rejected 401 previously | Real expired session test pending |

Installed Android PWA launch/resume, offline/reconnect, update from previous public build, small phone/tablet, text scaling, complete theme contrast and an unfamiliar tester's first hour remain pending. Cloud browser results cannot complete physical-device or human gates.

No public release or deployment is authorised by this report. The 15-season Actions PASS belongs to b1d12d79d5a9b8342a687312d64cc3bcaa9c1a26; record later candidate checks against their actual SHAs.
