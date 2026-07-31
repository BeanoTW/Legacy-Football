export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Priority = "low" | "medium" | "high";

/* ---------------- Inbox / Communication framework ----------------
   Backbone every department uses to talk to the player. Generators
   live in src/lib/game/inbox.ts and are registered in a single array
   — adding a new department = adding a generator. Effects are atomic
   and applied through applyEffects; no generator mutates state directly.
------------------------------------------------------------------- */

export type InboxCategory =
  | "information" | "decision" | "warning" | "opportunity"
  | "financial" | "staff" | "facilities" | "transfers"
  | "board" | "fans" | "league" | "media";

export type InboxDepartment =
  | "Board of Directors" | "Manager" | "Director of Football"
  | "Finance" | "Commercial" | "Head Scout" | "Medical"
  | "Groundskeeper" | "Fan Liaison" | "Sponsors"
  | "League" | "Media" | "Club";

export type InboxPriority = "low" | "normal" | "high" | "urgent";
export type InboxStatus =
  | "unread" | "read" | "awaitingDecision" | "completed" | "expired";

/** Ledger buckets an inbox cash effect may be booked against. */
export type LedgerIncomeCategory =
  | "gate" | "tv" | "sponsor" | "merchandise" | "prize" | "transfers" | "other";
export type LedgerExpenseCategory =
  | "playerWages" | "staffWages" | "stadiumOps" | "trainingOps"
  | "maintenance" | "matchday" | "transfers" | "other";

export type InboxEffect =
  | {
      kind: "cash";
      amount: number;
      note?: string;
      /** Income bucket when amount >= 0. Defaults to "other". */
      incomeCategory?: LedgerIncomeCategory;
      /** Expense bucket when amount < 0. Defaults to "other". */
      expenseCategory?: LedgerExpenseCategory;
    }
  | { kind: "fanHappiness"; delta: number }
  | { kind: "reputation"; delta: number }
  | { kind: "pitch"; delta: number }
  | { kind: "standCondition"; standKey: "N" | "E" | "S" | "W"; delta: number }
  | { kind: "sponsorExtend"; sponsorName: string; addWeeks: number; newWeekly?: number }
  | { kind: "commercialAccept"; offerId: string }
  | { kind: "commercialReject"; offerId: string }
  | { kind: "commercialCounter"; offerId: string; counter: "payment" | "duration" | "bonus" }
  | { kind: "flag"; key: string; value: string | number | boolean }

  /* Recruitment. Every one of these routes into the canonical engine
     functions in recruitment.ts — the inbox never mutates football state. */
  | { kind: "recruitmentAcceptOffer"; negotiationId: string }
  | { kind: "recruitmentRejectOffer"; negotiationId: string }
  | { kind: "recruitmentCounterOffer"; negotiationId: string; fee?: number }
  | { kind: "recruitmentWithdraw"; negotiationId: string }
  | { kind: "recruitmentAcceptPlayerTerms"; negotiationId: string }
  | { kind: "recruitmentImproveTerms"; negotiationId: string }
  | { kind: "recruitmentCompleteTransfer"; negotiationId: string }
  | { kind: "recruitmentRenewContract"; playerId: string; upliftPct?: number; seasons?: number }
  | { kind: "recruitmentReleasePlayer"; playerId: string }


  | {
      kind: "scheduleGenerator";
      generatorId: string;
      inWeeks: number;
      /** Stable payload passed to the follow-up generator. Serialised into the save. */
      payload?: Record<string, string | number | boolean>;
    };

/** Structured, declarative preconditions for a choice. */
export type InboxRequirement =
  | { kind: "cash"; amount: number }
  | { kind: "fanHappiness"; min?: number; max?: number }
  | { kind: "reputation"; min?: number; max?: number }
  | { kind: "flag"; key: string; equals?: string | number | boolean }
  | { kind: "staffRole"; role: string };

export interface InboxChoice {
  id: string;
  label: string;
  hint?: string;
  effects: InboxEffect[];
  /**
   * Preconditions. Cash requirements are also inferred automatically from
   * the choice's own net negative cash effects — the club has no debt or
   * overdraft facility, so it can never spend money it does not hold.
   */
  requirements?: InboxRequirement[];
}


export interface InboxItem {
  id: string;
  /** Generator that emitted this item. Used for dedup + routing. */
  generatorId: string;
  /**
   * Stable, deterministic key identifying the underlying event this item
   * represents (e.g. "commercial-sponsor-renewal:Main Kit Sponsor:s2").
   * Used to prevent duplicate unresolved events across weeks/reloads.
   */
  eventKey: string;
  sender: string;
  department: InboxDepartment;
  category: InboxCategory;
  subject: string;
  body: string;
  priority: InboxPriority;
  week: number;
  season: number;
  status: InboxStatus;
  choices?: InboxChoice[];
  chosenChoiceId?: string;
  /** @deprecated retained for UI display of week-of-season; canonical value is expiresAtAbsoluteWeek. */
  expiresWeek?: number;
  /** Canonical expiry deadline on the absolute timeline. */
  expiresAtAbsoluteWeek?: number;
  reward?: string;
  consequenceOnExpire?: InboxEffect[];
  /** Set once the expiry consequence has been applied. Guarantees exactly-once. */
  consequenceApplied?: boolean;
  /** Absolute week the player's choice was applied. Guards against double-apply. */
  resolvedAtAbsoluteWeek?: number;
}


export interface ScheduledGenerator {
  generatorId: string;
  /** Canonical due time on the absolute timeline. */
  dueAtAbsoluteWeek: number;
  /** @deprecated retained for legacy saves; canonical value is dueAtAbsoluteWeek. */
  dueWeek?: number;
  /** @deprecated retained for legacy saves; canonical value is dueAtAbsoluteWeek. */
  dueSeason?: number;
  payload?: Record<string, string | number | boolean>;
}




export interface Player {
  id: string;
  name: string;
  position: Position;
  rating: number;      // 40-95
  age: number;
  wage: number;        // £/week
  contractWeeks: number;
  value: number;       // transfer value £
}

export interface Stand {
  key: "N" | "E" | "S" | "W";
  name: string;
  capacity: number;
  condition: number;   // 0-100
  ticketPrice: number; // £
}

export interface Sponsor {
  name: string;
  weekly: number;
  weeksLeft: number;
}

export type StaffRole =
  | "Manager"
  | "Assistant Manager"
  | "Head Coach"
  | "Goalkeeping Coach"
  | "Fitness Coach"
  | "Head of Youth"
  | "Head of Transfers"
  | "Chief Scout"
  | "Scout"
  | "Head Physio"
  | "Sports Scientist";

export interface StaffStats {
  tactics: number;
  attack: number;
  defense: number;
  development: number;
  scouting: number;
  negotiation: number;
  medical: number;
  motivation: number;
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  age: number;
  rating: number;
  stats: StaffStats;
  wage: number;
  contractWeeks: number;
  reputation: number;
}

export interface WeekLedger {
  week: number;
  season: number;
  income: {
    gate: number;
    tv: number;
    sponsor: number;
    merchandise: number;
    prize: number;
    transfers: number;
    other: number;
  };
  expenses: {
    playerWages: number;
    staffWages: number;
    stadiumOps: number;
    trainingOps: number;
    maintenance: number;
    matchday: number;
    transfers: number;
    other: number;
  };
  net: number;
  balance: number;
  matchdayNote?: string;
  /** True when the row was created outside advanceWeek (e.g. by an inbox cash effect). */
  synthetic?: boolean;
  /** Human-readable notes attached by inbox effects, with their source item/event. */
  inboxNotes?: { note: string; amount: number; sourceItemId?: string; sourceEventKey?: string }[];
}


export interface FixtureResult {
  week: number;
  opponent: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  attendance: number;
  gateReceipts: number;
  tvIncome: number;
  result: "W" | "D" | "L";
}

/** Immutable historical record of one completed league fixture. */
export interface MatchRecord {
  /** Stable fixture identity: league|season|round|home>away */
  id: string;
  league: string;
  season: number;
  week: number;
  round: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  outcome: "home" | "away" | "draw";
  /** Seed string used for AI simulation (absent for user-played matches). */
  seed?: string;
  userInvolved: boolean;
}

/** One scheduled league fixture (all clubs, all divisions). */
export interface ScheduledFixture {
  /** Owning league id. Absent on pre-v4 saves = tier-1 division. */
  league?: string;
  round: number;
  week: number;
  home: string;
  away: string;
}

/* -------- Football pyramid -------- */

/** A division. Membership changes only at season rollover. */
export interface League {
  id: string;
  name: string;
  /** 1 = top division. */
  tier: number;
  /** Clubs contesting the CURRENT season, in no particular order. */
  clubIds: string[];
  /** Top N clubs promoted to the league one tier above (0 for the top tier). */
  promotionPlaces: number;
  /** Bottom N clubs relegated to the league one tier below (0 for the lowest). */
  relegationPlaces: number;
  /** Base seasonal distribution for this division, £. See LeaguePrizeRules. */
  prizeMoney: number;
  /** Optional per-league prize configuration. Defaults derived from tier. */
  prizeRules?: LeaguePrizeRules;
  /** Placeholder — [min, max] club reputation typical of this tier. */
  reputationRange: [number, number];
}

/** Configurable, division-agnostic prize-money rules. Never keyed on names. */
export interface LeaguePrizeRules {
  /** Paid to every club in the division. */
  basePayment: number;
  /** Paid per place above the bottom position. */
  positionStep: number;
  /** Extra for finishing 1st. */
  championBonus: number;
  /** Extra for finishing inside the division's promotion places. */
  promotionBonus: number;
  /** Paid to clubs finishing inside the relegation places. */
  relegationSupport: number;
}


/** Immutable record of one completed league season. Never overwritten. */
export interface SeasonHistoryEntry {
  season: number;
  leagueId: string;
  leagueName: string;
  tier: number;
  champion: string;
  runnerUp: string | null;
  promoted: string[];
  relegated: string[];
  /** Final standings, already sorted 1st → last. */
  finalTable: LeagueRow[];
}

/* -------- Club identity: reputation, strength, predictions -------- */

/** Seasonal objective handed to a club, derived from predicted strength. */
export type ExpectationLevel =
  | "winLeague"
  | "promotion"
  | "topHalf"
  | "midTable"
  | "avoidRelegation"
  | "survival";

/** One club's pre-season projection inside a division. */
export interface ClubPrediction {
  club: string;
  /** Calculated seasonal strength at the time the prediction was made. */
  strength: number;
  /** Predicted finishing position, 1 = predicted champion. */
  rank: number;
  expectation: ExpectationLevel;
}

/** Pre-season prediction for one division in one season. */
export interface SeasonPrediction {
  season: number;
  leagueId: string;
  predictedChampion: string;
  promotionFavourites: string[];
  relegationFavourites: string[];
  /** Every club in the division, sorted strongest first. */
  clubs: ClubPrediction[];
}

/** Immutable yearly snapshot of one club's competitive identity. */
export interface ClubSeasonSnapshot {
  season: number;
  club: string;
  leagueId: string;
  tier: number;
  /** Reputation held at the START of the season. */
  reputation: number;
  /** Calculated strength used for that season. */
  strength: number;
  /** Predicted finishing position. */
  expectedFinish: number;
  expectation: ExpectationLevel;
  /** Actual finishing position. */
  actualFinish: number;
  /** Reputation after the rollover adjustment. */
  reputationAfter: number;
}

/** Per-club permanent pyramid record. */
export interface ClubRecord {
  club: string;
  currentLeagueId: string;
  promotions: number;
  relegations: number;
  /** One entry per completed season. */
  leagueHistory: { season: number; leagueId: string; position: number }[];
}

export interface LeagueRow {
  team: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
}

/* -------- Board of Directors --------
   The board is a group of individuals, not a single approval bar. Each
   director owns a slice of the club, judges the chairman against the
   objectives inside that slice, and carries their own confidence. The
   headline board confidence is an influence-weighted blend of theirs.
------------------------------------------------------------------------ */

export type DirectorRole =
  | "Chairman"
  | "Finance Director"
  | "Football Director"
  | "Commercial Director"
  | "Supporters' Director";

export type DirectorTrait =
  | "patient"      // slower confidence swings
  | "ruthless"     // faster confidence swings, punishes misses hard
  | "ambitious"    // raises objective targets
  | "frugal"       // weights finance heavily, hates spending
  | "pragmatic"    // rewards being on track rather than perfection
  | "loyal"        // confidence floor is higher
  | "populist"     // weights fans heavily
  | "traditionalist"; // weights facilities and continuity

/** The areas of the club a director can care about. */
export type BoardPriority =
  | "results" | "finance" | "fans" | "facilities" | "squad" | "commercial";

export interface Director {
  id: string;
  name: string;
  role: DirectorRole;
  age: number;
  traits: DirectorTrait[];
  /** Relative weights 0-100, one per priority. Sums are not normalised. */
  priorities: Record<BoardPriority, number>;
  /** Share of the boardroom voice, 0-100. */
  influence: number;
  /** Current confidence in the chairman, 0-100. */
  confidence: number;
  /** How long they tolerate underperformance before confidence falls, 0-100. */
  patience: number;
  /** One-line characterisation shown in the UI. */
  bio: string;
}

export type ObjectiveKind =
  | "leaguePosition"
  | "cashReserve"
  | "wageControl"
  | "fanHappiness"
  | "stadiumCondition"
  | "squadRating"
  | "commercialIncome"
  /* Recruitment-aware objectives, measured from canonical football state. */
  | "transferBudgetDiscipline"
  | "playerSaleIncome"
  | "squadAge"
  | "contractSecurity"
  | "recruitmentActivity";


export type ObjectiveStatus = "active" | "met" | "missed";

export interface BoardObjective {
  id: string;
  season: number;
  kind: ObjectiveKind;
  priority: BoardPriority;
  ownerRole: DirectorRole;
  label: string;
  description: string;
  /** Target value. For leaguePosition this is "finish this position or better". */
  target: number;
  /** Importance to the board overall, 0-100. */
  weight: number;
  status: ObjectiveStatus;
}

/** Live evaluation of one objective. Derived — never stored. */
export interface ObjectiveProgress {
  objectiveId: string;
  current: number;
  target: number;
  /** 0-1 satisfaction. 1 = fully met. */
  progress: number;
  onTrack: boolean;
  detail: string;
}

export interface BoardReview {
  id: string;
  season: number;
  week: number;
  type: "midSeason" | "endSeason";
  confidenceBefore: number;
  confidenceAfter: number;
  verdict: string;
  lines: string[];
  /** Confidence per director id after the review. */
  directorConfidence: Record<string, number>;
  /** Objective outcomes captured at review time. */
  outcomes: { objectiveId: string; label: string; progress: number; met: boolean }[];
}

export interface BoardState {
  directors: Director[];
  /** Objectives for the CURRENT season. Replaced at rollover. */
  objectives: BoardObjective[];
  /** Season the current objectives belong to. */
  objectivesSeason: number;
  /** Append-only review history. */
  reviews: BoardReview[];
  /** Influence-weighted headline confidence, 0-100. */
  confidence: number;
}


/* -------- Transfers -------- */
export interface TransferTarget {
  id: string;
  player: Player;
  askingFee: number;
  wageDemand: number;
  scoutedByName: string;
  scoutedByRole: StaffRole;
  scoutRating: number;
  note: string;
  positionPriority: Priority;
  createdWeek: number;
  createdSeason: number;
}

export interface IncomingBid {
  id: string;
  playerId: string;
  playerName: string;
  position: Position;
  fromClub: string;
  fee: number;
  createdWeek: number;
  createdSeason: number;
}

export interface CompletedTransfer {
  week: number;
  season: number;
  direction: "in" | "out";
  playerName: string;
  position: Position;
  fee: number;
  wage: number;
  otherClub: string;
  handledBy?: string;
}

/* -------- Match day -------- */
export interface MatchEvent {
  minute: number;
  type: "goal" | "chance" | "card" | "info" | "sub" | "injury";
  side: "us" | "them" | "neutral";
  text: string;
}

export interface HalfTimeOption {
  id: string;
  label: string;
  desc: string;
  attackMod: number;
  defenseMod: number;
  fanMod: number;
  winBonusCost: number;
}

export interface LiveMatch {
  fixture: { week: number; opponent: string; home: boolean };
  weather: "Clear" | "Overcast" | "Wet" | "Windy";
  projectedAttendance: number;
  boardExpectation: "Win" | "Avoid defeat" | "Any result";
  ourStrength: number;
  oppStrength: number;
  formGuide: string;
  events: MatchEvent[];
  ourGoals: number;
  theirGoals: number;
  status: "brief" | "halfTime" | "fullTime";
  halfTimeOptions?: HalfTimeOption[];
  chosenNudgeId?: string;
  attendance: number;
  gateReceipts: number;
  tvIncome: number;
  matchdayOps: number;
  winBonus: number;
}

/* =========================================================================
   CLUB FINANCE
   -------------------------------------------------------------------------
   Every pound that moves creates exactly one FinanceEntry. The entry log is
   append-only and reconciles to GameState.cash at all times:

       cash === sum(income entries) - sum(expense entries)

   All stored currency values are integers in pounds sterling.
========================================================================= */

export type FinanceDirection = "income" | "expense";

export type FinanceCategory =
  | "Matchday" | "Wages" | "Prize Money" | "Commercial" | "Facilities"
  | "Operations" | "Board" | "Staff" | "Transfers" | "Miscellaneous";

/** Which system authored the movement. Used for ledger filtering + audits. */
export type FinanceSource =
  | "engine.opening" | "engine.recurring" | "engine.matchday" | "engine.prize"
  | "inbox" | "transfers" | "staff" | "board" | "facilities" | "migration"
  | "commercial";


export interface FinanceEntry {
  id: string;
  season: number;
  /** Week of season the movement was booked in. */
  week: number;
  /** Canonical position on the absolute timeline. */
  absoluteWeek: number;
  category: FinanceCategory;
  subcategory: string;
  description: string;
  /** Always a positive integer. Direction carries the sign. */
  amount: number;
  direction: FinanceDirection;
  sourceSystem: FinanceSource;
  /** Fixture id, sponsor name, staff id, inbox item id … */
  linkedEntityId?: string;
  /** Cash balance immediately after this entry was posted. */
  balanceAfter: number;
  recurring: boolean;
  /** Stable identity for exactly-once posting. Replays are ignored. */
  dedupeKey?: string;
  metadata?: Record<string, string | number | boolean>;
}

export type BoardSpendingPolicy =
  | "Aggressive Investment" | "Controlled Growth" | "Balanced"
  | "Cautious" | "Emergency Cost Control";

export type FinancialRiskLevel =
  | "Secure" | "Stable" | "Watch" | "High Risk" | "Critical";

/** Board-approved authorisation limits. Budgets never create cash. */
export type BudgetKey = "wages" | "transfers" | "facilities" | "commercial" | "contingency";

export interface FinanceState {
  /** Cash held at the first week of the current season. */
  openingSeasonBalance: number;
  /** Season the opening balance belongs to. */
  openingSeasonNumber: number;
  /** Cash the board expects to remain untouched. Derived from policy. */
  minimumCashReserve: number;
  boardSpendingPolicy: BoardSpendingPolicy;
  /** Season the current policy + budgets were approved for. */
  policySeason: number;
  /** Authorisation limits. `wages` is £/week; the rest are seasonal £ pots. */
  budgets: Record<BudgetKey, number>;
  /** Monotonic counter used for deterministic ledger ids. */
  nextEntryId: number;
}

/** Immutable close-of-season financial record. Never rewritten. */
export interface SeasonFinancialSummary {
  season: number;
  leagueId: string;
  openingBalance: number;
  totalIncome: number;
  totalExpenditure: number;
  operatingProfit: number;
  closingBalance: number;
  wageCost: number;
  matchdayIncome: number;
  prizeMoney: number;
  averageAttendance: number;
  financialRiskAtClose: FinancialRiskLevel;
  boardPolicy: BoardSpendingPolicy;
  budgetPerformance: { key: BudgetKey; approved: number; committed: number }[];
}

export type AffordabilityVerdict =
  | "affordable" | "affordableButRisky" | "requiresBoardApproval" | "unaffordable";

export interface AffordabilityResult {
  verdict: AffordabilityVerdict;
  /** True only for "affordable" and "affordableButRisky". */
  allowed: boolean;
  amount: number;
  cashNow: number;
  cashAfter: number;
  minimumReserve: number;
  projectedSeasonEndBalance: number;
  projectedAfterSpend: number;
  reason: string;
}

export interface CashFlowForecast {
  season: number;
  fromWeek: number;
  weeksRemaining: number;
  currentBalance: number;
  expectedRecurringIncome: number;
  expectedRecurringExpenditure: number;
  expectedMatchdayIncome: number;
  scheduledKnownPayments: number;
  prizeMoneyAssumption: number;
  projectedSeasonEndBalance: number;
  /** Always true — forecasts are deterministic estimates, never promises. */
  estimate: true;
}

export interface WageSummary {
  playerWagesWeekly: number;
  staffWagesWeekly: number;
  totalWeekly: number;
  annualised: number;
  budgetWeekly: number;
  utilisationPct: number;
  wageToRevenuePct: number;
}

/* =========================================================================
   COMMERCIAL DEPARTMENT & SPONSORSHIP
   -------------------------------------------------------------------------
   Sponsors are club-agnostic entities generated deterministically from the
   save seed. A contract binds one sponsor to one category for a fixed number
   of seasons; every pound it moves is posted through finance.ts.
========================================================================= */

export type SponsorshipCategory =
  | "Shirt Front" | "Shirt Sleeve" | "Training Kit"
  | "Stadium Advertising" | "Matchday Programme" | "Club Partner";

export type SponsorIndustry =
  | "Banking" | "Insurance" | "Energy" | "Telecoms" | "Brewery"
  | "Automotive" | "Retail" | "Airline" | "Technology" | "Construction"
  | "Food & Drink" | "Logistics";

/** How big a club the sponsor is typically comfortable backing. */
export type SponsorScale = "local" | "regional" | "national";

export interface CommercialSponsor {
  id: string;
  companyName: string;
  industry: SponsorIndustry;
  /** 0-100 brand standing. Drives the money they can commit. */
  reputation: number;
  /** Maximum weekly spend, £, across any single agreement. */
  budget: number;
  preferredClubSize: SponsorScale;
  preferredLeagueTier: number;
  /** Placeholder until regions exist in the world model. */
  preferredRegions: string[];
  /** 0-100 standing with the player's club. Persistent across contracts. */
  relationshipScore: number;
  /** Ids of every contract this sponsor has ever signed with any club. */
  contractHistory: string[];
}

export type CommercialObjectiveKind =
  | "topHalf" | "promotion" | "avoidRelegation" | "maintainAttendance";

export interface CommercialObjective {
  id: string;
  kind: CommercialObjectiveKind;
  label: string;
  /** League position, or attendance figure, depending on kind. */
  target: number;
  /** One-off payment if met at contract close, £. */
  bonus: number;
  status: "active" | "met" | "missed";
}

export type CommercialContractStatus =
  | "Active" | "Negotiating" | "Expired" | "Terminated";

export interface CommercialContract {
  id: string;
  sponsorId: string;
  category: SponsorshipCategory;
  clubId: string;
  startSeason: number;
  startAbsoluteWeek: number;
  /** Length in seasons. endAbsoluteWeek is the canonical deadline. */
  durationSeasons: number;
  endAbsoluteWeek: number;
  weeklyPayment: number;
  signingBonus: number;
  /** Weeks before expiry the renewal conversation opens. */
  renewalWindowWeeks: number;
  objectives: CommercialObjective[];
  /** Relationship snapshot at signing. Live value lives on the sponsor. */
  relationshipScore: number;
  status: CommercialContractStatus;
  /** True once expiry has been processed. Guarantees exactly-once close. */
  closed?: boolean;
}

export type CommercialOfferStatus =
  | "pending" | "accepted" | "rejected" | "expired" | "withdrawn";

export type CommercialCounterKind = "payment" | "duration" | "bonus";

export interface CommercialOfferOutcome {
  round: number;
  counter: CommercialCounterKind;
  result: "improved" | "held" | "withdrawn";
  note: string;
}

export interface CommercialOffer {
  id: string;
  sponsorId: string;
  category: SponsorshipCategory;
  weeklyPayment: number;
  signingBonus: number;
  durationSeasons: number;
  objectives: CommercialObjective[];
  createdSeason: number;
  createdAbsoluteWeek: number;
  expiresAtAbsoluteWeek: number;
  status: CommercialOfferStatus;
  /** Number of counters already used by the player. */
  negotiationRounds: number;
  outcomes: CommercialOfferOutcome[];
  /** Set when this offer renews an existing contract. */
  renewalOfContractId?: string;
}

/** Immutable record of a finished agreement. Never rewritten. */
export interface CommercialContractRecord {
  contractId: string;
  sponsorId: string;
  sponsorName: string;
  category: SponsorshipCategory;
  startSeason: number;
  endSeason: number;
  weeksActive: number;
  weeklyPayment: number;
  /** Signing bonus + all weekly payments + objective bonuses actually paid. */
  totalValue: number;
  objectives: { label: string; met: boolean; bonus: number }[];
  outcome: "completed" | "renewed" | "terminated";
}

export interface CommercialSeasonSummary {
  season: number;
  totalIncome: number;
  newSponsors: number;
  renewals: number;
  lostSponsors: number;
  commercialReputationAtClose: number;
  activePartnersAtClose: number;
}

export interface CommercialDepartment {
  directorName: string;
  /** Department capability, 0-100. Improves with investment and success. */
  rating: number;
  /** Negotiation skill, 0-100. Improves counter-offer outcomes. */
  negotiation: number;
  /** Commercial standing, 0-100. Separate from footballing reputation. */
  commercialReputation: number;
  /** Club-agnostic sponsor universe, generated from the save seed. */
  sponsors: CommercialSponsor[];
  contracts: CommercialContract[];
  offers: CommercialOffer[];
  history: CommercialContractRecord[];
  seasonHistory: CommercialSeasonSummary[];
  /** Season the per-season counters below belong to. */
  seasonCountersSeason: number;
  newSponsorsThisSeason: number;
  renewalsThisSeason: number;
  lostSponsorsThisSeason: number;
}

/* =========================================================================
   FOOTBALL OPERATION — PLAYERS, CONTRACTS, SQUADS, TRANSFERS
   -------------------------------------------------------------------------
   GameState.football is the canonical source of truth for every player,
   contract, squad membership, wage and transfer in the world. The legacy
   GameState.squad array is a DERIVED PROJECTION of the user's first team,
   rebuilt by syncLegacySquad() after every recruitment mutation, exactly as
   GameState.ledger is a projection of the finance ledger. Never write to
   GameState.squad directly.
========================================================================= */

export type PreferredFoot = "Left" | "Right" | "Both";

export type PlayerPersonality =
  | "Balanced" | "Ambitious" | "Loyal" | "Professional" | "Mercenary" | "Temperamental";

export type PlayerTransferStatus =
  | "unlisted" | "listed" | "wanted" | "agreedTransfer";

export type PlayerAvailability = "available" | "unavailable";

export type SquadRole =
  | "Key Player" | "First Team" | "Rotation" | "Prospect";

export type SquadGroup =
  | "firstTeam" | "reserve" | "transferListed" | "contractExpiring";

/** A persistent human being. Ids never change; players survive forever. */
export interface FootballPlayer {
  id: string;
  firstName: string;
  lastName: string;
  /** In-world calendar. Season 1 == year 2000. */
  dateOfBirth: { year: number; month: number; day: number };
  nationality: string;
  preferredFoot: PreferredFoot;
  primaryPosition: Position;
  secondaryPositions: Position[];
  /** Club name, or null while unattached (free agent). */
  currentClubId: string | null;
  /** Standing in the game world, 0-100. */
  reputation: number;
  currentAbility: number;
  potentialAbility: number;
  marketValue: number;
  /** £/week the player believes he is worth. */
  wageExpectation: number;
  personality: PlayerPersonality;
  /** Active contract id, or null when out of contract. */
  contractId: string | null;
  transferStatus: PlayerTransferStatus;
  availability: PlayerAvailability;
  createdSeason: number;
}

export type PlayerContractStatus =
  | "Active" | "Agreed" | "Expiring" | "Expired" | "Released";

export interface PlayerContract {
  id: string;
  playerId: string;
  clubId: string;
  startSeason: number;
  startWeek: number;
  expirySeason: number;
  expiryWeek: number;
  weeklyWage: number;
  squadRole: SquadRole;
  signingBonus: number;
  /** Fee agreed for the transfer that created this contract, if any. */
  agreedTransferFee: number;
  status: PlayerContractStatus;
}

export type NegotiationStage =
  | "clubTalks" | "playerTalks" | "agreed" | "completed" | "rejected" | "withdrawn";

export type NegotiationParty = "club" | "player";

export interface NegotiationLogEntry {
  round: number;
  party: NegotiationParty;
  action: "offer" | "accept" | "reject" | "counter" | "withdraw" | "complete";
  note: string;
  absoluteWeek: number;
}

/** A live transfer conversation. Deterministic from (saveSeed, id, round). */
export interface TransferNegotiation {
  id: string;
  playerId: string;
  /** Selling club, null for a free agent. */
  fromClubId: string | null;
  toClubId: string;
  /** Relative to the USER's club. */
  direction: "in" | "out";
  stage: NegotiationStage;
  clubRounds: number;
  playerRounds: number;
  /** Fee currently on the table. */
  fee: number;
  /** Selling club's latest counter, if it made one. */
  clubCounterFee?: number;
  proposedWeeklyWage: number;
  proposedLengthSeasons: number;
  proposedSigningBonus: number;
  proposedRole: SquadRole;
  /** Player's latest wage counter, if he made one. */
  playerCounterWage?: number;
  createdSeason: number;
  createdAbsoluteWeek: number;
  expiresAtAbsoluteWeek: number;
  resolvedAtAbsoluteWeek?: number;
  /** Set once completeTransfer has run. Guarantees exactly-once completion. */
  completedTransferId?: string;
  log: NegotiationLogEntry[];
}

/** Immutable record of one completed movement. Never rewritten. */
export interface TransferRecord {
  id: string;
  playerId: string;
  playerName: string;
  position: Position;
  fromClubId: string | null;
  toClubId: string | null;
  fee: number;
  weeklyWage: number;
  signingBonus: number;
  season: number;
  week: number;
  absoluteWeek: number;
  type: "transfer" | "freeTransfer" | "release" | "contractExpiry";
  negotiationId?: string;
}

/** Immutable record of one finished contract. Never rewritten. */
export interface PlayerContractRecord {
  id: string;
  contractId: string;
  playerId: string;
  playerName: string;
  clubId: string;
  weeklyWage: number;
  startSeason: number;
  endSeason: number;
  seasons: number;
  outcome: "renewed" | "expired" | "released" | "transferred";
  season: number;
  week: number;
}

/** Immutable per-season recruitment record. */
export interface RecruitmentSeasonSummary {
  season: number;
  spend: number;
  income: number;
  netSpend: number;
  playersIn: number;
  playersOut: number;
  wageBillAtClose: number;
}

export interface RecruitmentDepartment {
  headOfRecruitment: string;
  footballDirector: string;
  /** Ability to identify and value players, 0-100. */
  recruitmentRating: number;
  /** Ability to win negotiations, 0-100. */
  negotiationRating: number;
  /** Standing with other clubs and agents, 0-100. */
  recruitmentReputation: number;
  /** Count of transfers concluded by this club. */
  historicTransfers: number;
}

export interface RecruitmentState {
  /** Every player in the world. Append-only; players are never deleted. */
  players: FootballPlayer[];
  /** Every contract ever issued. Append-only; status changes, rows do not. */
  contracts: PlayerContract[];
  negotiations: TransferNegotiation[];
  /** Player ids the chairman is tracking. UI-facing, never affects simulation. */
  shortlist: string[];
  department: RecruitmentDepartment;
  /** Append-only immutable histories. */
  transferHistory: TransferRecord[];
  contractHistory: PlayerContractRecord[];
  seasonHistory: RecruitmentSeasonSummary[];
  /** Monotonic counters used for deterministic ids. */
  nextContractId: number;
  nextNegotiationId: number;
  nextRecordId: number;
  /** Season the world database was generated for. */
  generatedSeason: number;
}

export interface GameState {
  /** Save schema version. Bump + add a migration in loadGame when persisted shape changes. */
  version: 9;




  /** Stable per-save seed. Used for deterministic inbox generation. */
  saveSeed: string;
  clubName: string;
  managerName: string;

  season: number;
  week: number;
  cash: number;
  reputation: number;
  fanHappiness: number;

  stands: Stand[];
  pitchCondition: number;
  trainingRating: number;
  trainingWeeklyCost: number;

  staffWagesWeekly: number;
  utilitiesWeekly: number;
  maintenanceWeekly: number;

  squad: Player[];
  sponsors: Sponsor[];

  fixtures: { week: number; opponent: string; home: boolean }[];
  results: FixtureResult[];

  /** All divisions in the pyramid. */
  leagues: League[];
  /** League the user's club competes in this season. */
  playerLeagueId: string;
  /** Full schedule for the current season — every division, every club. */
  leagueSchedule: ScheduledFixture[];
  /** Permanent per-season league history. Append-only. */
  seasonHistory: SeasonHistoryEntry[];
  /** Permanent per-club pyramid record, keyed by club name. */
  clubRecords: Record<string, ClubRecord>;
  /** Permanent history of every completed fixture, all seasons. */
  matchRecords: MatchRecord[];

  /** Persistent club reputation (0-100), keyed by club name. Never reset. */
  clubReputations: Record<string, number>;
  /** Pre-season predictions, one entry per division per season. Append-only. */
  seasonPredictions: SeasonPrediction[];
  /** Immutable yearly per-club identity snapshots. Append-only. */
  clubSnapshots: ClubSeasonSnapshot[];

  ledger: WeekLedger[];
  league: LeagueRow[];

  hiredStaff: Staff[];
  staffCandidates: Staff[];
  staffMarketRefreshedWeek: number;

  // Transfers
  transferBudget: number;
  wageBudgetWeekly: number;
  positionPriorities: Record<Position, Priority>;
  transferTargets: TransferTarget[];
  incomingBids: IncomingBid[];
  completedTransfers: CompletedTransfer[];

  // Match day
  // Match day
  liveMatch: LiveMatch | null;

  /** Board of Directors — objectives, confidence and reviews. */
  board: BoardState;

  /** Persistent finance state: policy, budgets, opening balance. */
  finance: FinanceState;
  /** Append-only record of every cash movement. Reconciles to `cash`. */
  financeLedger: FinanceEntry[];
  /** Immutable per-season financial summaries. Append-only. */
  financeHistory: SeasonFinancialSummary[];

  // Inbox / communication backbone
  inbox: InboxItem[];
  inboxFlags: Record<string, string | number | boolean>;
  scheduledGenerators: ScheduledGenerator[];

  /** Commercial department: sponsors, contracts, offers and history. */
  commercial: CommercialDepartment;

  /** Canonical football operation: players, contracts, squads, transfers. */
  football: RecruitmentState;


}


