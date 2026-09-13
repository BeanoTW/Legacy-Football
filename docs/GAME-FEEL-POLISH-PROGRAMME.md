# Legacy Football — Game Feel, UI & Personality Pass

Status: active implementation programme

## Goal

Do not add another large standalone system yet. Make the simulation already in the game feel authored, reactive and football-specific.

The core loop is:

**anticipation → Continue → event → consequence → reaction → next decision**

Every change in this programme should strengthen at least one part of that loop.

## 1. Home / chairman shell

Use the approved premium concept as the visual target, without requiring a large image library.

- Strong club identity/header and clearer hierarchy.
- Next match is the visual centrepiece.
- Seven-day calendar remains immediately visible.
- Surface why the next match matters: league positions, streaks, promotion/relegation context, milestone context.
- Chairman tasks and club news should look like communications, not database rows.
- Keep mobile density disciplined; no decorative element may hide useful information.
- Use gradients, club colour, typography, icons and generated/reusable art before adding bespoke image dependencies.

## 2. Whole-game visual language

Propagate the Home language through Inbox, Squad, Transfers, Scouting, Competitions, Staff, Finance, Board and player profiles.

Audit each screen for:

- information hierarchy
- spacing and touch targets
- repeated controls
- empty states
- football terminology
- card density
- status/urgency communication
- whether interesting simulation state is currently invisible

## 3. Manager football identity

Manager Overall must not be the dominant hiring decision.

Each manager should expose a football identity:

- preferred formation
- one or more alternative shapes
- broad playing philosophy
- pressing tendency
- tempo/directness
- tactical adaptability
- rotation tendency
- willingness to use young players

Prefer descriptive chairman-facing traits over walls of 0–100 ratings.

### Squad fit

Calculate manager/squad suitability from the players actually available. A lower-rated manager who naturally fits the squad can be a better appointment than a higher-rated manager requiring a rebuild.

Formation should be manager-led rather than permanently static. Managers can deviate because of player availability, injuries/suspensions, squad suitability, match context, form and their adaptability.

### Recruitment connection

The manager should be able to surface football needs into the existing scouting/recruitment loop, e.g. a missing holding midfielder, wing-back or second striker. This must reuse the existing Scouting Hub rather than create a separate recruitment system.

## 4. Micro-storytelling

Prefer derived presentation over new mutable state where possible.

High-value details:

- recent form strip (WWDLW)
- winning/unbeaten/losing streak copy
- player hot/cold form and recent goal/clean-sheet summaries where data supports it
- fixture stakes such as 1st v 2nd, promotion pressure, relegation pressure and table proximity
- milestones: first goal, 50th/100th appearance, record signing, manager milestones, clean-sheet/goal streaks
- supporter reaction to major results, signings, sales and promotion
- board/director communications reflecting existing director traits
- manager satisfaction/friction around recruitment and squad construction
- richer post-match summary using existing deterministic match events
- callbacks to club history: former players/managers, repeat rivals, previous-season context

## 5. Continue should be tempting

Before advancing, show meaningful upcoming context rather than only a date.

Examples:

- Scout report due today
- Transfer reply expected in 2h
- Contract decision required
- Saturday: 2nd v 3rd — win could move the club into the promotion places

After advancing, resolve the event and visibly react through Inbox, Home or Matchday. Avoid silent state changes for events a chairman would reasonably notice.

## 6. Small celebration layer

Important achievements should receive visual weight without requiring expensive animation:

- promotion
- title/trophy
- new signing
- manager appointment
- end-of-season review
- club record or milestone

A polished modal/card, club colour, crest/initial mark and good typography are sufficient for the first pass.

## Implementation order

1. Home shell and reusable visual primitives.
2. Fixture context / form / Continue anticipation.
3. Manager identity and real squad-fit evaluation.
4. Staff UI exposes identity and fit before hiring.
5. Manager formation selection feeds match setup.
6. Inbox, supporter, board and manager micro-storytelling.
7. Propagate the visual language through remaining major screens.
8. Celebration and historical callback pass.

## Guardrails

- No giant new subsystem during this programme.
- Do not add cosmetic ratings with no gameplay consequence.
- Prefer existing canonical histories/state over duplicate presentation state.
- Mobile-first: preserve readable density and touch usability.
- Deterministic simulation remains deterministic/replay-safe.
- New personality/presentation should reveal or contextualise simulation, not obscure it.
