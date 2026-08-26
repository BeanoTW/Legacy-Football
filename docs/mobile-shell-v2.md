# Mobile game shell v2

## Contract

- Primary navigation lives at the top of the mobile game shell.
- Continue is the persistent primary action at the bottom, within thumb reach.
- The active game screen owns the space between those two controls.
- Home should target a single viewport without document scrolling on common phone sizes.
- Long collections (players, messages, tables, transactions) scroll inside bounded panels rather than extending the page.
- Continue changes to Stop while time is advancing and stops automatically for actionable events.
- Do not achieve density by making core text illegibly small; reduce duplicated chrome, padding, gaps and card height first.
