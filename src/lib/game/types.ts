export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Priority = "low" | "medium" | "high";

export interface TransferTarget {
  id: string;
  player: Player;
  askingFee: number;
  wageDemand: number;
  scoutedByName: string;
  scoutedByRole: string;
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

export interface MatchEvent {
  minute: number;
  type: "goal" | "chance" | "card" | "info";
  side: "us" | "them";
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
  status: "brief" | "firstHalf" | "halfTime" | "secondHalf" | "fullTime";
  halfTimeOptions?: HalfTimeOption[];
  chosenNudgeId?: string;
  attendance: number;
  gateReceipts: number;
  tvIncome: number;
  matchdayOps: number;
  winBonus: number;
}


export type Priority = "low" | "medium" | "high";

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
  version: 1;
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
  liveMatch: LiveMatch | null;
}
