# Football Management Game Design Research

## Product position

Football Finances Empire should be a mobile-first football chairman game, not a reduced copy of Football Manager. Its distinctive promise is that sporting ambition, cash flow, contracts, infrastructure and board pressure are one connected decision system.

The repeatable player loop is:

1. Review what changed and what needs attention.
2. Inspect the evidence behind a decision.
3. Commit money, time, reputation or sporting opportunity.
4. Continue through individual days until the next meaningful stop.
5. See the sporting and financial consequences accumulate over seasons.

## Reference patterns

### Football Manager

- Recruitment begins with interest and expected demands before formal talks.
- Scouting knowledge controls how precise player information is.
- Contract talks are a conversation: demands, counters, negotiable items and consequences for walking away.
- Squad planning surfaces expiring contracts and positional needs rather than presenting an undifferentiated player list.
- Depth is valuable, but frequently used information must remain easy to reach.

Sources:

- https://www.footballmanager.com/features/recruitment-revamp
- https://www.footballmanager.com/fm26/features/powered-transferroom-fm26s-recruitment-revamp
- https://www.footballmanager.com/features/introducing-intermediaries-and-offloading-players

### Football Club Management 2026

- Strong mobile hierarchy: compact summaries lead into dedicated screens.
- Transfers are treated as a primary activity, with dense lists and explicit filters.
- Club, staff, confidence, squad and facility health are visible at a glance.
- The useful lesson is density and prioritisation, not copying its visual identity.

Source:

- https://play.google.com/store/apps/details?id=com.GoPlayGames.FCM26

### EA Sports FC Career

- Uses profiles and short decision flows to make transfers approachable.
- Narrative events and changing personnel help seasons feel different.
- Delegation is useful when the player wants outcomes without handling every negotiation.

Sources:

- https://help.ea.com/en/articles/ea-sports-fc/career-mode/
- https://www.ea.com/games/ea-sports-fc/fc-26/features/fc-26-career-mode

### Modern browser management games

- ManageFC demonstrates the effective stop-on-event loop: advance by days, simulate the world, and pause for decisions or matches.
- Procedural clubs and players support large, persistent worlds without licensing constraints.
- AI clubs need their own squad needs, finances and reputation so the transfer market feels alive.

Sources:

- https://managefc.com/guide
- https://managefc.com/
- https://matchdayzero.com/en/about-matchday-zero

## System principles

### Information hierarchy

- Lists answer “who needs attention?” and remain compact.
- Profiles answer “is this person good enough?” and contain abilities and history.
- Decision screens answer “what will this cost and what could happen?”
- Dashboards show exceptions and priorities, not every available record.

### Players and scouting

- Never expose exact external-player ability without sufficient knowledge.
- Unknown information progresses from hidden, to broad range, to narrow range, to exact.
- A scout report should include suitability, strengths, weaknesses, value range, wage range, interest and confidence.
- The database should be bottom-heavy: many ordinary players, progressively fewer elite ones.
- The user's own players can have known abilities, but those belong on profiles rather than every squad row.

### Squad management

- Default view groups players by position and shows name, age, role, wage, value and contract urgency.
- Add optional views later for squad depth, contracts, wages and development.
- Selection opens a consistent player profile used throughout squad, scouting and negotiations.
- Positional shortages, bloated wage groups and expiring contracts should be immediately visible.

### Transfers and contracts

- Separate club agreement from player agreement.
- Both parties may accept, reject or counter.
- Show current offer, latest demand, remaining negotiating room and the financial effect.
- Negotiable terms should grow in phases: wage and length first; then role, signing bonus, appearance bonuses, release clauses and agent fees.
- Walking away and repeated low offers can affect interest, agent relationships or future demands.
- Selling should include listing, asking price, incoming bids, counter-offers and optional delegation.

### Time and inbox

- Continue moves through visible days and stops for matches, deadlines and decisions.
- The inbox is the decision queue; it should distinguish required action from information.
- Weekly processing remains an internal simulation boundary, not a competing user-facing control.

### Finance-first identity

- Use one club cash balance rather than an artificial transfer wallet.
- Board limits are policies and warnings, not separate money.
- Every major decision should show immediate cash, weekly commitment and longer-term liability.
- Forecasts should include known contract payments, transfer instalments, debt, facility projects and expected operating cash flow.
- Financial strength should create opportunities, while overspending creates pressure rather than an arbitrary game-over.

### World and progression

- AI clubs need coherent squads, budgets, recruitment preferences, staff and infrastructure.
- Promotion changes revenue, wage expectations, player interest and board ambition.
- Relegation should create a genuine restructuring problem.
- Player and staff careers need ageing, development, decline, movement and retirement.
- Youth, loans, injuries, morale, tactics and match depth should be layered onto a stable world rather than built as isolated minigames.

## Recommended delivery sequence

1. Finish the player profile, squad hierarchy and two-sided contract negotiation loop.
2. Add squad planning: depth, positional needs, contract expiry and wage structure.
3. Make the transfer market active: AI listings, bids, counters, interest and outgoing sales.
4. Deepen scouting: assignments, report confidence, regions, scout strengths and shortlist workflow.
5. Connect match preparation: lineup, simple tactics, fitness, morale and selection consequences.
6. Add debt and committed-payment forecasting to complete the chairman capital-allocation loop.
7. Expand club progression: staff departments, facilities, academy, promotion and relegation economics.
8. Add season texture: injuries, form, press, supporter stories, board reviews and transfer deadlines.

## Design guardrail

Before adding a feature, define:

- What decision does it create?
- What information supports that decision?
- What does it cost or risk?
- What future systems react to it?
- Where does the game stop to let the player respond?

If those answers are weak, the feature is probably decoration rather than management gameplay.

