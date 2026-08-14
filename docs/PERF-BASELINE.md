# Phase 0 Performance & Save-Size Baseline

Recorded before any Phase 0 refactor, on the sandbox runner with Bun.
Regenerate with:

```
bun src/lib/game/__checks__/perf.check.ts
bun src/lib/game/__checks__/save-size.check.ts
```

Envelopes are deliberately loose; the recorded column is the real signal.
Phase 1 is compared against the recorded numbers, not against the envelope.

## Timings (median of 5, warm-up discarded, seed `PHASE0|PERF|FIXED`)

| Operation | Recorded | Envelope |
| --- | --- | --- |
| newGame | 31.0 ms | 1500 ms |
| advanceWeek (single) | 24.5 ms | 250 ms |
| full season (46 weeks) | 1296.3 ms | 8000 ms |
| serializeSave (season 3) | 16.9 ms | 500 ms |
| parseSave (season 3) | 12.7 ms | 500 ms |
| migrateSave (current-version save) | 12.7 ms | 1500 ms |

A weekly tick is ~24 ms at 40 clubs. At 116 clubs (Phase 2) a naive scale-up
lands around 70 ms — inside the 50 ms mobile budget only if the per-club work
is reduced or fringe clubs are aggregated, which is what Phase 1 sets up.

## Save size (seed `PHASE0|SIZE|FIXED`)

| Point | Bytes |
| --- | --- |
| new game | 757 KB |
| after season 1 | 1.41 MB |
| after season 2 | 2.13 MB |
| after season 3 | 2.87 MB |
| after season 4 | 3.63 MB |
| after season 5 | 4.28 MB |
| projected season 20 | ~14.9 MB |

**This is the headline Phase 0 finding.** Growth is ~700 KB per season, linear
but steep. The practical localStorage ceiling (~5 MB) is reached during
**season 6** — today, at 40 clubs, before any world expansion.

Top growth drivers at season 5:

| Domain | Bytes | Rows |
| --- | --- | --- |
| matchRecords | 1024 KB | 3,800 |
| financeLedger | 969 KB | 2,588 |
| football.contracts | 594 KB | 2,514 |
| inbox | 518 KB | 708 |
| football.contractHistory | 436 KB | 1,910 |
| football.players | 412 KB | 904 |

Implication for Phase 1: chunked storage alone is not enough — a history
rollup/prune policy for `matchRecords`, `financeLedger`, `contractHistory` and
`inbox` is required, and `contracts` needs compaction (expired contracts are
retained in full today).
