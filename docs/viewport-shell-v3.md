# Viewport shell v3

Hard UI contract for the game shell.

- The document itself must not scroll during normal gameplay on phone, tablet, laptop or desktop.
- The shell owns exactly one viewport (`100dvh`) and reserves explicit space for top chrome/navigation and the persistent bottom Continue bar.
- Screen content fills the remaining space with `min-height: 0` so overflow is contained rather than expanding the document.
- Information-heavy areas use bounded internal panes with their own vertical/horizontal scrolling where necessary.
- Desktop must use available width rather than a narrow website-style centre column; shell content may expand to 1600px while retaining sensible gutters.
- Primary workflows get the largest buttons/icons. Secondary controls remain compact.
- Continue/Stop is the single persistent primary time control on every breakpoint. Remove duplicate top-bar and Home-page Continue controls.
- Do not show a generic `Time stopped: ...` banner. Actionable blockers should open their decision flow directly.
- While time advances, show calendar/date progression so the player can see time passing.
- Blocking decisions interrupt progression, open automatically, and chain until the blocking queue is clear.
