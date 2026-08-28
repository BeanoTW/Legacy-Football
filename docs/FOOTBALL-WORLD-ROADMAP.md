# Football World Roadmap

## North star

Build a persistent football world in which a chairman can begin at Banbury-level non-league football and climb to the top of the English game. Every promotion must change the club's sporting standard, employment model, wage pressure, transfer reach, facilities, media attention and financial risk.

The game remains a chairman simulation. The player sets policy, approves consequential commitments and intervenes at pressure points; staff can handle routine recruitment work within that authority.

## World shape

### Playable England

The target playable structure is levels 1–8:

1. Premier Division
2. Championship
3. League One
4. League Two
5. National League
6. National North / National South
7. Northern Premier / Southern Premier Central / Southern Premier South / Isthmian Premier
8. Regional feeder divisions

Levels 1–5 are national and linear. Levels 6–8 branch geographically, so promotion and relegation must use league relationships and regional allocation rather than `tier + 1` alone.

The first expanded playable release should start at level 7. Level 8 is part of the model from day one but can remain background-simulated until regional allocation and club volume are proven.

### Outside England

Foreign and neighbouring markets exist without being playable competitions. Their clubs can:

- own players and contracts;
- scout, bid, loan, release and sell;
- value nationality, age, reputation and work-permit risk differently;
- produce free agents and academy releases;
- compete with the user and English AI clubs for players.

Initial market-only regions: Scotland, Wales, Ireland, Northern Ireland, Western Europe, Northern Europe, Southern Europe, Eastern Europe, Africa, North America, South America and Asia-Pacific. Only individual clubs and market behaviour are required initially; full foreign fixtures and tables are not.

## Simulation fidelity

| World area | Fidelity |
|---|---|
| User club | Full squad, contracts, finances, staff, facilities and decisions |
| User division | Full clubs, squads, fixtures, table and transfer activity |
| Adjacent English levels | Persistent squads, seasonal results, promotion and active transfer market |
| Other English levels | Persistent clubs and players with compressed weekly/seasonal simulation |
| Foreign regions | Market-only clubs, player production, contracts and transfers |

Simulation fidelity is independent from competition level. Moving leagues must not rewrite club identity or player history.

## Player and contract model

### Player identity

- Current ability, potential and position remain core inputs.
- Add professionalism, ambition, loyalty, adaptability, consistency and injury susceptibility.
- Add preferred role/style, home region, nationality and relocation willingness.
- External ability is knowledge-limited: hidden → broad range → narrow range → trusted estimate.
- Career history records appearances, performance, injuries, contracts and transfers.

### Employment status

- Non-contract/amateur
- Part-time
- Full-time professional
- Loan

Moving through the pyramid changes which employment types players will accept. Turning professional becomes a major club decision with operating and facility consequences.

### Contract terms

Phase one terms: wage, duration, squad role and signing bonus.

Later terms: appearance fee, goal/clean-sheet bonus, promotion rise, relegation reduction, release clause, optional extension, agent fee and loan contribution.

Wage demand is derived from ability, potential, age, employment type, current wage, league level, club reputation, squad role, contract security, competing interest, agent stance and willingness to relocate.

## Transfer market

The canonical deal flow is:

`discovery → scouting → enquiry → club agreement → agent negotiation → medical/registration → completion`

The market must support:

- free agents and released academy players;
- loans with wage contribution and playing-time expectations;
- listed, unwanted and unsettled players;
- AI bids, counters and competing offers;
- sell-on clauses and instalments later;
- domestic and foreign buyers/sellers;
- deadlines and decisions surfaced through the live inbox/time system.

AI recruitment is need-led. Clubs assess position, squad depth, age profile, affordability, employment status, reputation and resale potential before acting.

## Economic calibration

The current code has two incompatible meanings for `tier`: the active world uses 1–4 from top to bottom, while the economic model uses -1–3 analogues. These must be unified before activating the expanded pyramid.

The replacement scale uses football levels 1–8 everywhere. Each level owns:

- revenue and attendance bands;
- full-time/part-time expectations;
- wage bands by squad role;
- sustainable wage-to-revenue ratio;
- typical fee behaviour;
- broadcast, solidarity, prize and parachute income;
- staffing and facility expectations.

Values must be broad club bands, not a single league multiplier. A large National League club and a small League Two club should overlap.

## Delivery plan

### Phase 1 — Canonical world foundation

- Introduce stable level and division definitions, including regional parents.
- Add save-safe identity rules and validation.
- Replace ambiguous economic tier terminology with football level terminology.
- Define the migration path for existing four-division saves.
- Decide fictional club allocation and the level-7 starting experience.

### Phase 2 — Economy and employment overhaul

- Calibrate levels 1–8.
- Introduce professional status and club wage structures.
- Rebuild player wage expectations and valuations.
- Make promotion/relegation recalculate expectations without rewriting contracts.

### Phase 3 — Contracts and negotiations

- Separate club fee agreement from player/agent agreement.
- Add negotiable terms, counters, patience and walk-away states.
- Show immediate cash, weekly commitment and total guaranteed liability.
- Add chairman delegation policies.

### Phase 4 — Living domestic market

- Give every English club squad needs, affordability and recruitment preferences.
- Add listings, AI bids, loans, releases and competing interest.
- Connect all deadlines and decisions to the live advance feed.

### Phase 5 — Full pyramid activation

- Activate levels 1–7 with regional promotion/relegation.
- Add compressed simulation for distant divisions.
- Add professional-status transitions, registrations and league-specific rules.
- Expand club, player and staff pools without breaking deterministic saves.

### Phase 6 — Foreign market layer

- Add market-only foreign clubs and regions.
- Generate realistic inbound/outbound interest and player movement.
- Add scouting reach, adaptability and work-permit constraints.
- Promote selected foreign competitions to deeper simulation only if gameplay warrants it.

## Release guardrails

- Existing careers must load and retain their club, league membership, history and finances.
- No system may key behaviour from a display name.
- Competition identity, football level and simulation fidelity remain separate concepts.
- Financial figures route through one canonical level/economy model.
- Every new transfer feature must create a meaningful choice, cost or consequence.
- Large-world additions require deterministic and save-size checks before activation.

## Immediate implementation slice

1. Add the canonical level-1-to-8 competition graph as code.
2. Validate stable IDs, levels, regional parents and promotion targets.
3. Keep the graph dormant beside the current live four-division world.
4. Map the legacy world and economy scales explicitly before save migration.
5. Activate the new scale only when economy and migration checks pass together.

