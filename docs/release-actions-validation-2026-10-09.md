# Release Actions validation — 9 October 2026

This supplements the earlier release-validation snapshot. Release status remains NOT SIGNED OFF.

| Gate | Result | Evidence / scope |
| --- | --- | --- |
| Required 15-season Actions soak | PASS on b1d12d79d5a9b8342a687312d64cc3bcaa9c1a26 | [Run 37963939196](https://github.com/BeanoTW/Legacy-Football/actions/runs/37963939196); job 113933441905 completed successfully. Build, typecheck and simulation passed. |
| Deployed signed-out manual-save status | FAIL, P1 | Public game Settings says Not signed in but manual save reports Cloud synced. PR #304 fixes acknowledgment reporting; deployed correction remains unverified. |
| Local automated cloud acknowledgment | PASS | Mocked queue check: successful writes and identical cloud copies return true; unsigned uploads return false and make no cloud write. Not production RLS evidence. |
| Production two-account isolation, conflict, deletion | BLOCKED | Requires explicitly authorised disposable accounts. No real player careers were changed. |
| Physical PWA / update / reconnect / human cold beta | BLOCKED | Requires physical devices and an unfamiliar human tester. |
| Legal and asset/licence decisions | BLOCKED | Existing draft documents preserve unresolved business and permission decisions. |
| Stable 1.0 | BLOCKED | Requires all release checks, desktop usability and separate successful 20-season soak on intended release commit. |

Soak parameters: seasons 15, checkpoint interval 5, fixed seed RELEASE|SOAK|FIXED, Bun 1.4.2. Simulation ran 17:07:22–17:21:24 UTC; workflow total 14m41s.

| Checkpoint | Raw save | Players | Transfers | Inbox |
| --- | ---: | ---: | ---: | ---: |
| Season 5 | 17.05 MB | 2,818 | 1,523 | 948 |
| Season 10 | 29.92 MB | 3,316 | 3,185 | 1,816 |
| Season 15 | 42.49 MB | 3,119 | 4,786 | 2,624 |

Final season 16; seasonHistory 165. The raw S20 growth projection (53.14 MB) is diagnostic only, not a 20-season test or a measurement of persisted mobile saves. Full decoded job log: [evidence/release-soak-actions-2026-10-09.log](evidence/release-soak-actions-2026-10-09.log).

Public diagnostic build timestamp observed earlier: 2026-10-09T10:54:40.155Z, schema 24. Deployed commit SHA was not verified. Browser tests must remain separate from latest-main automated evidence. A later code merge requires candidate validation on that resulting commit; this PASS must not be attributed to an untested later SHA.
