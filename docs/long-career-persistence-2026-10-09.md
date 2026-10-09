# Long-career persisted save validation — 9 October 2026

PASS, automated local tier. Not production account, physical-device quota or final Actions-candidate evidence.

Run the release-soak source for 15 seasons, checkpoints every 5, seed RELEASE|SOAK|FIXED, then save its final season-16 state through createIdbSaveStore/createIdbRecordStore using fake-indexeddb. The original simulation and storage source match b1d12d79; the instrumented copy adds persistence assertions only. Full script, log and source hashes are in docs/evidence/local-persistence-15-*.

| Metric | Actual result |
| --- | ---: |
| Raw canonical state | 44,553,902 bytes (42.49 MiB) |
| Persisted active core | 4,943,154 bytes (4.71 MiB) |
| Persisted total including historical chunks | 43,716,081 bytes (41.69 MiB) |
| Historical chunks | 102 |
| Save duration | 682.36 ms |
| Load duration | 88.44 ms |

Verified: successful write without diagnostics; exact compact-core reload; next tick identical from loaded versus expected compact core; every stored historical chunk matches its manifest checksum. Compaction reduces the active core; it does not eliminate the storage required by historical detail. Browser/device storage limits and three-slot aggregate usage require actual device testing.

To reproduce this supporting local check, copy the preserved instrumentation text to src/lib/game/__release__/local-persistence-soak.ts and run it with Bun and the same three SOAK_* environment values. It is deliberately not added as another expensive CI suite. Never attribute this local PASS to a later release commit or treat it as the required 20-season stable gate.
