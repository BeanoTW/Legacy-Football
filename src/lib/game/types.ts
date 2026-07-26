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
  | { kind: "flag"; key: string; value: string | number | boolean }
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
  | "squadRating";

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

export interface GameState {
  /** Save schema version. Bump + add a migration in loadGame when persisted shape changes. */
  version: 6;
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

  // Inbox / communication backbone
  inbox: InboxItem[];
  inboxFlags: Record<string, string | number | boolean>;
  scheduledGenerators: ScheduledGenerator[];
}

