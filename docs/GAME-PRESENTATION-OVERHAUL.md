# Game Presentation Overhaul

## Goal

Move Legacy Football from a functional web-app shell toward a purpose-built football chairman game interface without weakening the simulation, persistence model, or current navigation coverage.

The visual target is a dense football-management dashboard: strong club identity, an obvious next action, live club context, decision pressure, and fast access to the systems that already exist.

## Ground rules

- Presentation follows simulation state; the UI must not invent parallel state.
- Existing tabs remain reachable throughout the overhaul.
- Continue remains a first-class action and must never bypass blocking inbox decisions.
- Mobile remains a primary target, not a reduced desktop afterthought.
- The overhaul should be staged so each slice can ship independently behind the existing game shell.
- No save migration should be required for purely presentational work.

## Current systems to surface

The current root route already exposes the core chairman game areas:

- Club Hub
- Inbox / blocking decisions
- Squad
- Dashboard / club KPIs
- Cash flow
- Tickets
- Recruitment
- Staff
- Facilities / stadium
- Fixtures
- Board
- Commercial
- Leagues
- World
- History
- Settings

The shell also already has the data needed for the first presentation pass: club name, season/week/phase, bank balance, recurring weekly net, squad rating, average ticket price, unread inbox count, blocking decision state, calendar/continue state and live-match state.

## Phase 1 — Club command centre

Rework the current Club Hub into the main command centre while preserving its existing behaviour.

### Header

Create a game-specific club header with:

- club identity as the dominant element
- season, week and current phase
- compact financial and football health indicators
- inbox / attention badge
- presentation hooks for future club badge, colours and stadium imagery

The header should feel like the top of a management game, not a generic application toolbar.

### Primary focal card

The largest card on the home screen should answer: **what happens next?**

Priority order:

1. blocking chairman decision
2. live match / matchday state
3. next fixture or scheduled football event
4. next calendar milestone

The card should contain the relevant action rather than just describing the event.

### Chairman attention

Surface actionable inbox items on the home screen. These remain backed by the existing inbox and `actionableInbox()` logic; no duplicate decision system is introduced.

### Club pulse

Create a compact strip for the most important health signals. Initial signals can be derived from existing state:

- bank balance
- weekly recurring net
- squad rating
- average ticket price

Later slices can add board confidence, manager confidence, supporter mood, morale/cohesion and institutional state as those systems mature.

### Quick management grid

Provide direct cards into existing systems rather than creating new destinations. Initial grid:

- Squad
- Recruitment
- Staff
- Facilities
- Finances
- Fixtures
- Board
- Commercial

Lower-frequency destinations remain in the expanded navigation.

## Phase 2 — Navigation shell

Replace the current visually generic desktop tab row with a game navigation shell while retaining the existing `Tab` contract.

Desktop hierarchy:

- Home
- Squad
- Recruitment
- Fixtures
- Club
- Inbox
- More

Mobile hierarchy should remain deliberately smaller and optimise for thumb reach. The exact mapping should be driven by usage frequency rather than mirroring desktop.

The shell should support persistent Continue placement without obscuring content.

## Phase 3 — Visual system

Introduce presentation tokens rather than scattering one-off styling through components.

Required concepts:

- club surface
- elevated panel
- match / event hero
- attention / decision state
- positive / warning / critical status
- football stat typography
- compact metadata typography
- restrained glass / overlay treatment for imagery

The game should remain legible without photography. Images are enhancement layers, not information carriers.

## Phase 4 — Screen-by-screen conversion

After the command centre and shell are stable, convert screens in this order:

1. Inbox and chairman decisions
2. Fixtures / matchday
3. Squad
4. Recruitment
5. Finances
6. Facilities
7. Staff
8. Board / Commercial
9. League / World / History

This order follows actual chairman gameplay frequency and decision pressure.

## Phase 5 — Immersion layer

Once the information architecture is stable, add visual depth:

- club badges
- club colour theming
- competition identity
- stadium photography / generated stadium backdrops
- contextual match imagery
- richer transitions and lightweight motion

These should never block the core release path or introduce remote-image dependencies into simulation logic.

## First implementation slice

The first code slice should be intentionally small:

1. add reusable presentation primitives for the command centre
2. reshape `ClubHub` around Next Event, Chairman Attention, Club Pulse and Quick Management
3. keep all existing navigation targets and handlers intact
4. preserve current continue / decision-queue behaviour in `src/routes/index.tsx`
5. run build, typecheck, lint and all game-check shards before expanding the shell itself

## Acceptance criteria for the first slice

- No save schema changes.
- No changes to simulation outcomes.
- Blocking decisions still intercept Continue.
- Every currently reachable game area remains reachable.
- Home screen clearly exposes the next meaningful event/action.
- Mobile content has no horizontal overflow at the supported narrow viewport.
- Desktop uses the available width without turning into a sparse card grid.
- Existing CI remains green.
