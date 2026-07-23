export type Position = "GK" | "DEF" | "MID" | "FWD";

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
  tactics: number;      // matchday impact
  attack: number;
  defense: number;
  development: number;  // improves training / youth
  scouting: number;     // finds better players
  negotiation: number;  // cheaper transfers/contracts
  medical: number;      // fewer injuries, faster recovery
  motivation: number;   // morale / fan happiness lift
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  age: number;
  rating: number;         // overall 40-95
  stats: StaffStats;
  wage: number;           // £/week
  contractWeeks: number;
  reputation: number;     // 20-95 (agent leverage)
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

export interface GameState {
  version: 1;
  clubName: string;
  managerName: string;
  season: number;      // e.g. 1
  week: number;        // 1..38
  cash: number;
  reputation: number;  // 1-100, affects sponsors/fans
  fanHappiness: number;// 0-100

  stands: Stand[];
  pitchCondition: number;
  trainingRating: number; // 40-95, affects player growth
  trainingWeeklyCost: number;

  staffWagesWeekly: number;   // non-player staff
  utilitiesWeekly: number;
  maintenanceWeekly: number;

  squad: Player[];
  sponsors: Sponsor[];

  fixtures: { week: number; opponent: string; home: boolean }[];
  results: FixtureResult[];

  ledger: WeekLedger[];       // most recent first-or-append: append at end
  league: LeagueRow[];
}
