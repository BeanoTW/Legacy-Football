# Legacy Football known issues

This file is the release-facing defect ledger. Keep it short and specific.
Development backlog items do not belong here unless they affect a shipped build.

## Severity

- **P0** — save loss, corruption, crash loop, or career cannot continue.
- **P1** — major gameplay workflow blocked or seriously misleading.
- **P2** — significant usability/gameplay defect with a workaround.
- **P3** — cosmetic or low-impact issue.

## Open issues

| Severity | Area | Issue | Workaround | First affected build | Target |
| --- | --- | --- | --- | --- | --- |
| P2 | Desktop UI | PC layout is not yet considered release-ready/coherent at common laptop/desktop sizes. | Mobile/tablet layouts remain the preferred polished experience while the desktop layout is redesigned. | Current beta development | Before stable 1.0 |

## Resolved issues

Move an issue here only after the fix is included in a deployed build and
verified against the original reproduction steps.

| Severity | Area | Issue | Fixed in version | Fixed in build |
| --- | --- | --- | --- | --- |

## Rules for this ledger

- Never hide a known save-loss or migration risk from release notes.
- One issue should describe one reproducible problem.
- Include a workaround only if it is genuinely safe.
- Remove stale issues promptly after deployed verification.
- A P0/P1 issue blocks stable 1.0 unless explicitly accepted and documented.
