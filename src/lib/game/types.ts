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

/** One scheduled league fixture (all clubs, not just the user's). */
export interface ScheduledFixture {
  round: number;
  week: number;
  home: string;
  away: string;
}

export interface LeagueRow {
  team: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
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
  version: 3;
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

  /** Full division schedule for the current season (all clubs). */
  leagueSchedule: ScheduledFixture[];
  /** Permanent history of every completed fixture, all seasons. */
  matchRecords: MatchRecord[];

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

  // Inbox / communication backbone
  inbox: InboxItem[];
  inboxFlags: Record<string, string | number | boolean>;
  scheduledGenerators: ScheduledGenerator[];
}

