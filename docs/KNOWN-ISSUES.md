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
| P1 | Cloud slot deletion | In-flight manual Sync now can finish after slot deletion and recreate the cloud save. Reproduced against a network-prohibited mock API, not production accounts. | Wait for Sync now to finish before deleting a cloud-linked slot. | Reproduced at b1d12d79; #306 merged | Production E2E waived for this pass, not passed |
| P3 | Home briefings | Preseason match recap preview can show a raw club ID, although the Inbox title resolves the club name. | Open Inbox for the readable title. | Public build observed 9 October 2026 | Beta follow-up |
| P2 | Desktop UI | PC layout is not yet considered release-ready/coherent at common laptop/desktop sizes. At 1363×936, Settings cards overlap the save manager and obscure slot buttons. Keyboard Enter can activate the obscured slot control. | Mobile/tablet layouts remain the preferred polished experience while the desktop layout is redesigned. | Current beta development | Before stable 1.0 |
| P2 | Inbox keyboard focus | Closing a briefing on the previous build leaves focus on BODY. | Use Tab to return to controls. | Preview reproduction, 10 October 2026 | #308 / merged #310; preview Escape/Close and unread fallback pass, public pending |
| P2 | Match xG scope | Live featured-chance xG can differ from full match-summary xG without explaining scope. | Use the full match summary for aggregate xG. | Preview reproduction, 10 October 2026 | #307 / merged #311; preview wording observed, public pending |
| P2 | Opening press dialogue | Ownership questions and financial-journalist follow-up can offer answers for the wrong topic. Choices remain completable. | Select a tone and finish the conference; no progression block observed. | Preview reproduction, 10 October 2026 | #312 / merged #313; new/existing preview pass, financial variant automated, public pending in #315 |

## Resolved issues

Move an issue here only after the fix is included in a deployed build and
verified against the original reproduction steps.

| Severity | Area | Issue | Fixed in version | Fixed in build |
| --- | --- | --- | --- | --- |
| P1 | Manual save status | Signed-out Save now falsely claimed Cloud synced; corrected device-only acknowledgement reproduced publicly. | Version label unstamped; #304 | Approved source ee7da98; observed runtime 2026-10-09T21:04:32.464Z |

## Rules for this ledger

- Never hide a known save-loss or migration risk from release notes.
- One issue should describe one reproducible problem.
- Include a workaround only if it is genuinely safe.
- Remove stale issues promptly after deployed verification.
- A P0/P1 issue blocks stable 1.0 unless explicitly accepted and documented.

Current evidence/status: [release ledger #315](https://github.com/BeanoTW/Legacy-Football/issues/315). Production account tests are user-waived for this pass, not passed; no RC/stable sign-off.
