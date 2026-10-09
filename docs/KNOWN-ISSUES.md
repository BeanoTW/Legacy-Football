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
| P1 | Manual save status | Signed-out Save now reports Cloud synced despite no authenticated cloud upload. | Treat this confirmation as device-only; verify cloud backup separately after signing in. | Public build timestamp 2026-10-09T10:54:40.155Z | PR #304; deployed retest required |
| P3 | Home briefings | Preseason match recap preview can show a raw club ID, although the Inbox title resolves the club name. | Open Inbox for the readable title. | Public build observed 9 October 2026 | Beta follow-up |
| P2 | Desktop UI | PC layout is not yet considered release-ready/coherent at common laptop/desktop sizes. At 1363×936, Settings cards overlap the save manager and obscure slot buttons. Keyboard Enter can activate the obscured slot control. | Mobile/tablet layouts remain the preferred polished experience while the desktop layout is redesigned. | Current beta development | Before stable 1.0 |

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
