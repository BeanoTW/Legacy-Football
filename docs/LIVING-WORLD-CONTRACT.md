# Club Legacy & Living World Contract

## Product rule

The club is the protagonist. Persist facts that can materially change how the player understands a club, player, season or era later. Routine simulation exhaust is disposable once its authoritative aggregate has been written.

## Simulation layers

### 1. User club — maximum memory
Keep permanent competitive history, honours, promotions/relegations, meaningful cup/European milestones, managers, stadium/facility transformations, academy graduates who reach senior football, senior player careers, record transfers, club records and major financial milestones.

### 2. English pyramid — authoritative domestic world
England is genuinely simulated. Clubs keep stable identity, current state and season-level pyramid history. Promotion/relegation, honours and significant football-world events are facts. Routine matches and low-significance transaction detail do not need to remain hot forever once season summaries/records exist.

### 3. Foreign elite ecosystem — external world
Foreign domestic leagues are NOT simulated. We will maintain only enough persistent foreign clubs and squads to support the elite European competition and international transfer market.

A foreign club's apparent domestic form/statistics may be generated coherently from ability, role, club strength, age, availability and deterministic variance. Generated external performance must be marked GENERATED_EXTERNAL and must never be represented internally as a simulated domestic fixture/result.

Foreign clubs retain current identity/squad/reputation/economic power plus real interactions with our simulated world: transfers and European matches/results. They do not require permanent fictional domestic league histories.

## Three retention classes

### Permanent legacy
- user-club honours, promotions, relegations and records
- meaningful stadium/facility transformations
- significant managers/captains/academy careers
- record or contextually exceptional transfers
- major domestic/world competition outcomes
- real European milestones involving foreign clubs

### Season archive
- final tables and league membership
- club season summaries
- player seasonal/career aggregates where required
- financial/commercial aggregates
- generated external player form/stat lines for the season in which they are relevant

### Ephemeral
- ordinary AI fixtures after authoritative season aggregation/compaction
- rejected routine negotiations
- low-significance AI transfers once no longer needed by live systems
- weekly financial noise after canonical aggregation/archiving
- fabricated foreign match-by-match detail (do not create it in the first place)

## Contextual significance

Never use one global money threshold. Significance is relative to football level and club scale. A £30,000 move can be historic for a Level 7 club and routine higher in the pyramid.

A candidate event gains legacy significance through one or more of:
- direct user-club involvement
- record broken/set
- promotion, relegation, honour or European impact
- rarity/first occurrence
- player significance
- exceptional value relative to club/level economics
- durable change to club trajectory or infrastructure

## Player identity and academy provenance

Player IDs are permanent identities. Academy/youth players need provenance from creation: source club, intake/join season, join age where known, senior debut when it occurs, homegrown status and whether the underlying history was SIMULATED or GENERATED_EXTERNAL.

Retired notable players must be representable from durable career/legacy data even if their full live player object is later compacted.

## Naming/world identity

English and foreign clubs should use stable, authored fictional identities inspired by recognisable football geography/archetypes without relying on runtime-generated club names. Example naming direction: Manchester Devils as the universe's recognisable Manchester red-club analogue. Club IDs must remain stable even when names/presentation evolve.

## Non-negotiable integrity rule

Do not reconstruct missing history as fact. SIMULATED and GENERATED_EXTERNAL are distinct provenance states. If an event was not persisted or derivable from an authoritative aggregate, the game must not later claim that it happened.
