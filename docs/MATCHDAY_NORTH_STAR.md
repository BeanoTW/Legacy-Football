# Matchday North Star

Legacy Football is a chairman simulation. Matchday is where the consequences of chairman decisions become visible.

## Product target

The long-term target is a continuous 2D football simulation in the spirit of an interactive match sim:

- all 22 players remain represented on the pitch;
- the chairman watches rather than controls tactics;
- manager identity, formation, player quality, fitness and substitutions are visible in how the team plays;
- normal play can run quickly while important passages are easier to follow;
- written commentary explains the match alongside the 2D representation;
- 1×, 2×, 4× and instant resolution are different playback modes for the same canonical match.

The system must be able to grow from structured highlights into a full-match simulation without throwing away the architecture built for highlights.

## Non-negotiable architecture

### 1. Canonical result engine

The existing match engine remains authoritative for scores, chances, cards, substitutions, injuries and match statistics.

Score RNG must remain isolated from presentation RNG. Improving commentary, 2D movement or sequence detail must never move a result.

### 2. Football sequence domain

A football sequence explains **how** a canonical event happened.

The sequence is structured data, not animation instructions. A sequence is composed from actions such as:

- receive
- carry
- pass
- through ball
- cross
- shot
- save
- block
- miss
- goal

Each action records the real lineup player involved, an optional receiving player, start/end pitch positions and a relative duration.

The sequence generator is deterministic. Given the same save state, match seed and event, it must create the same sequence.

### 3. Renderer

The 2D viewer renders a MatchSequence. It must not invent the football outcome.

React presentation is deliberately downstream from the football domain:

canonical event -> MatchSequence -> viewer frame -> UI

The viewer may interpolate motion, camera timing and presentation, but it may not decide who scores, whether a shot is saved or which canonical player is credited.

### 4. Team shape

Players without the ball still matter.

Base positions derive from tactical roles and formation rather than one fixed visual formation. Future passes should extend this into phase-specific team shapes:

- in possession;
- defensive block;
- transition;
- press;
- final-third attack;
- set piece.

Manager identity should eventually alter those shapes and the sequence templates selected.

## Playback model

At 1×, a meaningful attack should be readable rather than rushed. Passes need time to leave one player, reach another, settle, progress and culminate in the final action.

2× and 4× scale presentation time only. They do not change match events or sequence ordering.

The eventual continuous match loop is:

quiet play / commentary -> possession -> developing attack -> significant action -> reaction -> next phase

Early versions may construct only significant possessions. Later versions should steadily increase the share of the 90 minutes represented as structured football until the pitch can remain continuously active.

## Commentary

Written commentary and the 2D view must come from the same football data.

Commentary can describe:

- possession and territory;
- a passing move;
- a player finding space;
- pressure building;
- a turnover or transition;
- the final chance;
- the match state and tactical pattern.

Commentary must never reveal a goal before the visual sequence reaches the goal.

## Public engine architecture review

We have inspected public football simulation engines for architecture ideas, without copying their code.

- `GallagherAiden/footballSimulationEngine` keeps a persistent `currentPOS` for every player, separate origin/intent positions, and a ball trajectory that advances across iterations. The useful lesson for Legacy Football is that visual movement should advance from the player's previous physical state rather than recalculating each player from formation on every event.
- `openfootmanager/openfootmanager` keeps a persistent live-match state with current minute, possession and ball zone, then advances the match in small steps containing several actions. The useful lesson is to separate the persistent match state from the UI snapshot and let playback consume a sequence of state transitions.
- RoboCup engines such as `rcsoccersim/rcssserver` go further into cycle-level physics and agent commands. That is useful reference material for the eventual continuous mode, but is substantially lower-level than Legacy Football needs at this stage.

The immediate application is `matchMotion.ts`: all 22 player positions now progress through deterministic action-boundary state. The renderer interpolates between those states instead of independently snapping players back to formation targets. Future continuous-match work should extend that same state model rather than reintroducing animation-only movement.

## Required invariants

- Same seed + same match state = same canonical result.
- Same event + same active lineup = same sequence.
- A goal sequence ends with the ball crossing the goal line.
- A saved/blocked/missed sequence cannot visually become a goal.
- A player cannot pass to himself.
- Substituted-off players cannot participate after leaving.
- Substitutes may participate after entering.
- Canonical scorer and assist credit cannot be changed by presentation.
- Presentation code cannot call Math.random in the match path.
- Playback speed cannot change match logic.
- Parent scoreboards reveal a goal only when the sequence visibly reaches the result.

## Delivery stages

### Stage A — sequence foundation
Structured actions, real players, active substitutions, role-aware formations, replay/result synchronisation.

### Stage B — richer possession
More action templates, recycling, switches, overlaps, cutbacks, clearances, interceptions, tackles and turnovers.

### Stage C — team behaviour
Manager philosophy, tempo, pressing, directness and player roles influence sequence construction and off-ball shape.

### Stage D — match flow
Add non-highlight possessions and commentary bridges so the match feels continuous rather than like isolated clips.

### Stage E — continuous simulation
Represent almost all possessions on the pitch. Highlights become natural peaks in one uninterrupted match rather than a separate mode.

### Stage F — calibration and presentation
Tune repetition, realism, pacing, camera behaviour, commentary density, stats and matchday UI.

## Current checkpoint

The first Stage A implementation lives in `src/lib/game/matchSequence.ts`.

It translates canonical chance/goal events into deterministic football actions using the players who were actually active at that minute, including substitutions. `MatchPitchViewer` consumes that domain rather than inventing arbitrary waypoint football.

`src/lib/game/matchFlow.ts` now provides deterministic written commentary bridges across quieter gaps between canonical events. The on-screen clock advances through those gaps before the 2D sequence begins, so 1× matchday has room to breathe without changing the underlying result.

Stage B/C work has also begun. Sequence construction now understands patient possession, balanced build-up, direct attacks, wide overloads, counters, high-press regains and set pieces. Manager tempo, pressing and directness alter the presentation pattern without touching score RNG. The vocabulary now includes recycling, switches, overlaps, cutbacks, pressure, interceptions, failed challenges, clearances, blocked passes and second-ball recoveries.

Canonical attacks can now contain defensive resistance before the real chance: a defender may challenge without winning it, clear a developing move before the attacking side regains the second ball, or get a foot to a pass and force a loose-ball recovery. The canonical scorer, assist and final outcome remain untouched. Defensive manager identity also affects how often these interventions appear: higher pressing produces more visible challenges and blocks, while a deeper low press intervenes less often before the final action.

Quiet gaps are no longer visually static: `buildMatchFlowSequence` creates structured open-play possessions using real active players. Longer gaps contain more circulation and receive more real-time playback at 1×, while 2× and 4× still scale the same underlying match flow. Open play can now break down through a tackle or clearance, with possession changing and the next side building from the recovery rather than every passage drifting toward a shot.

The 2D defensive shape also reacts to dangerous actions: defenders retreat toward their own goal and track the target lane on through balls, overlaps, cutbacks, crosses and shots instead of remaining anchored to static formation dots.
