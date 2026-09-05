/* =========================================================================
   Club Finance — ledger, budgets, policy, forecasting, risk
   -------------------------------------------------------------------------
   Rules of this module (enforced by src/lib/game/__checks__/finance.check.ts):

     1. postEntry() is the ONLY function allowed to change GameState.cash.
        Every movement appends exactly one append-only FinanceEntry.
     2. The ledger always reconciles:
           cash === Σ income − Σ expense
     3. All stored currency is integer pounds. Rounding happens at post time.
     4. Every repeatable movement carries a dedupeKey, so replaying a week,
        reloading a save, or re-running a migration can never double-post.
     5. Nothing here imports inbox.ts or board.ts — finance is the lowest
        layer above types/time/rng, so both of those may import it.
     6. No Math.random(), no Date.now(). Ids come from a monotonic counter
        stored in the save.
========================================================================= */

import type {
  AffordabilityResult,
  AffordabilityVerdict,
  BoardSpendingPolicy,
  BudgetKey,
  CashFlowForecast,
  FinanceCategory,
  FinanceDirection,
  FinanceEntry,
  FinanceSource,
  FinanceState,
  FinancialRiskLevel,
  GameState,
  League,
  LeaguePrizeRules,
  SeasonFinancialSummary,
  WageSummary,
  WeekLedger,
} from "./types";
import { isUserClubReference, userClubReference } from "./clubReference";
import { loanWageAdjustmentForClub } from "./loans";
import { absoluteWeek } from "./time";
import {
  profileForTier,
  clubSizeFactor,
  revenueBaseline,
  sustainableWeeklyWageBill,
  wageStructureFrom,
  tierOfUser,
  SEASON_MATCH_WEEKS,
  type WageStructure,
} from "./economy";
import { clubReputation } from "./reputation";
import { archivedFinanceGuard, archivedNet, archivedTrailingLossWeeks } from "./archive";

export const SEASON_WEEKS = 46;
/** Four playing weeks = one "month" for reporting cadence. */
export const FINANCE_PERIOD_WEEKS = 4;

const int = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* =========================================================================
   1. Ledger
========================================================================= */

export interface PostEntryInput {
  category: FinanceCategory;
  subcategory: string;
  description: string;
  /** Positive integer magnitude. */
  amount: number;
  direction: FinanceDirection;
  sourceSystem: FinanceSource;
  linkedEntityId?: string;
  recurring?: boolean;
  dedupeKey?: string;
  metadata?: Record<string, string | number | boolean>;
  /** Override the booking week (used by migration only). */
  season?: number;
  week?: number;
}

export function ensureFinance(s: GameState): void {
  if (!s.finance || typeof s.finance !== "object") {
    s.finance = defaultFinanceState(s);
  }
  if (!Array.isArray(s.financeLedger)) s.financeLedger = [];
  if (!Array.isArray(s.financeHistory)) s.financeHistory = [];
  if (!s.finance.budgets) s.finance.budgets = defaultFinanceState(s).budgets;
  if (typeof s.finance.nextEntryId !== "number") s.finance.nextEntryId = s.financeLedger.length + 1;
}

export function defaultFinanceState(s: GameState): FinanceState {
  return {
    openingSeasonBalance: int(s.cash ?? 0),
    openingSeasonNumber: s.season ?? 1,
    minimumCashReserve: 0,
    boardSpendingPolicy: "Balanced",
    policySeason: s.season ?? 1,
    budgets: { wages: 0, transfers: 0, facilities: 0, commercial: 0, contingency: 0 },
    nextEntryId: 1,
  };
}

/** Has a movement with this dedupe key already been posted? */
export function hasEntry(s: GameState, dedupeKey: string): boolean {
  if (archivedFinanceGuard(s, dedupeKey)) return true;
  return (s.financeLedger ?? []).some((e) => e.dedupeKey === dedupeKey);
}

/**
 * The single cash mutator. Returns the entry, or null when the movement was
 * skipped (zero amount, or a duplicate dedupeKey).
 */
export function postEntry(s: GameState, input: PostEntryInput): FinanceEntry | null {
  ensureFinance(s);
  const amount = Math.abs(int(input.amount));
  if (amount === 0) return null;
  if (input.dedupeKey && hasEntry(s, input.dedupeKey)) return null;

  const season = input.season ?? s.season;
  const week = input.week ?? s.week;
  const signed = input.direction === "income" ? amount : -amount;
  s.cash = int(s.cash) + signed;

  const entry: FinanceEntry = {
    id: `LE-${String(s.finance.nextEntryId).padStart(7, "0")}`,
    season,
    week,
    absoluteWeek: absoluteWeek(season, week),
    category: input.category,
    subcategory: input.subcategory,
    description: input.description,
    amount,
    direction: input.direction,
    sourceSystem: input.sourceSystem,
    linkedEntityId: input.linkedEntityId,
    balanceAfter: s.cash,
    recurring: input.recurring ?? false,
    dedupeKey: input.dedupeKey,
    metadata: input.metadata,
  };
  s.finance.nextEntryId += 1;
  s.financeLedger.push(entry);
  syncWeekLedger(s, season, week);
  return entry;
}

/** Ledger reconciliation: cash must equal income − expenditure, always. */
export function reconcile(s: GameState): { ok: boolean; expected: number; actual: number } {
  let expected = archivedNet(s);
  for (const e of s.financeLedger ?? []) {
    expected += e.direction === "income" ? e.amount : -e.amount;
  }
  return { ok: expected === int(s.cash), expected, actual: int(s.cash) };
}

export function entriesFor(s: GameState, season: number, week?: number): FinanceEntry[] {
  return (s.financeLedger ?? []).filter(
    (e) => e.season === season && (week == null || e.week === week),
  );
}

export interface PeriodTotals {
  income: number;
  expenditure: number;
  operatingResult: number;
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

export function totalsFor(entries: FinanceEntry[]): PeriodTotals {
  const t: PeriodTotals = {
    income: 0,
    expenditure: 0,
    operatingResult: 0,
    incomeByCategory: {},
    expenseByCategory: {},
  };
  for (const e of entries) {
    if (e.direction === "income") {
      t.income += e.amount;
      t.incomeByCategory[e.category] = (t.incomeByCategory[e.category] ?? 0) + e.amount;
    } else {
      t.expenditure += e.amount;
      t.expenseByCategory[e.category] = (t.expenseByCategory[e.category] ?? 0) + e.amount;
    }
  }
  t.operatingResult = t.income - t.expenditure;
  return t;
}

const operatingEntries = (entries: FinanceEntry[]) =>
  entries.filter((entry) => entry.sourceSystem !== "engine.opening");

export const seasonTotals = (s: GameState, season = s.season) =>
  totalsFor(operatingEntries(entriesFor(s, season)));

/** Operating result over the last `weeks` banked weeks (excludes this week). */
export function recentOperatingResult(s: GameState, weeks = FINANCE_PERIOD_WEEKS): number {
  const nowAbs = absoluteWeek(s.season, s.week);
  const from = nowAbs - weeks;
  const rows = operatingEntries(s.financeLedger ?? []).filter(
    (e) => e.absoluteWeek > from && e.absoluteWeek <= nowAbs,
  );
  return totalsFor(rows).operatingResult;
}

/** Number of consecutive completed weeks that closed at an operating loss. */
export function consecutiveLossWeeks(s: GameState): number {
  const byWeek = new Map<number, number>();
  for (const e of operatingEntries(s.financeLedger ?? [])) {
    const v = byWeek.get(e.absoluteWeek) ?? 0;
    byWeek.set(e.absoluteWeek, v + (e.direction === "income" ? e.amount : -e.amount));
  }
  const weeks = [...byWeek.keys()].sort((a, b) => a - b);
  let run = 0;
  let allLosses = true;
  for (const w of weeks) {
    if ((byWeek.get(w) ?? 0) < 0) run++;
    else {
      run = 0;
      allLosses = false;
    }
  }
  // When every hot week is a loss the run continues into archived history.
  if (allLosses) run += archivedTrailingLossWeeks(s);
  return run;
}

/* -------------------------------------------------------------------------
   Legacy weekly roll-up
   -------------------------------------------------------------------------
   GameState.ledger (WeekLedger[]) predates this module and is still the
   shape the Cash-flow / Ledger screens and the older inbox reports read.
   It is now a PROJECTION of the finance ledger, never an independent source
   of truth: every post rebuilds the affected week's row from entries.
------------------------------------------------------------------------- */

type IncomeBucket = keyof WeekLedger["income"];
type ExpenseBucket = keyof WeekLedger["expenses"];

export function legacyIncomeBucket(e: FinanceEntry): IncomeBucket {
  const forced = e.metadata?.legacyBucket;
  if (
    typeof forced === "string" &&
    forced in { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 }
  ) {
    return forced as IncomeBucket;
  }
  if (e.category === "Matchday") return e.subcategory === "Broadcast" ? "tv" : "gate";
  if (e.category === "Prize Money") return "prize";
  if (e.category === "Transfers") return "transfers";
  if (e.category === "Commercial") {
    if (e.subcategory === "Merchandise") return "merchandise";
    if (e.subcategory === "League distribution") return "tv";
    return "sponsor";
  }
  return "other";
}

export function legacyExpenseBucket(e: FinanceEntry): ExpenseBucket {
  const forced = e.metadata?.legacyBucket;
  if (
    typeof forced === "string" &&
    forced in
      {
        playerWages: 0,
        staffWages: 0,
        stadiumOps: 0,
        trainingOps: 0,
        maintenance: 0,
        matchday: 0,
        transfers: 0,
        other: 0,
      }
  ) {
    return forced as ExpenseBucket;
  }
  if (e.category === "Wages") return e.subcategory === "Staff wages" ? "staffWages" : "playerWages";
  if (e.category === "Staff") return "staffWages";
  if (e.category === "Matchday") return "matchday";
  if (e.category === "Transfers") return "transfers";
  if (e.category === "Facilities") {
    if (e.subcategory === "Training ground") return "trainingOps";
    if (e.subcategory === "Stadium maintenance") return "maintenance";
    return "stadiumOps";
  }
  if (e.category === "Operations")
    return e.subcategory === "Stadium operations" ? "stadiumOps" : "other";
  return "other";
}

/** Rebuild the legacy WeekLedger row for one week from the finance entries. */
export function syncWeekLedger(s: GameState, season: number, week: number): void {
  if (!Array.isArray(s.ledger)) s.ledger = [];
  const entries = entriesFor(s, season, week);
  if (!entries.length) return;
  let row = s.ledger.find((l) => l.season === season && l.week === week);
  if (!row) {
    row = {
      week,
      season,
      income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
      expenses: {
        playerWages: 0,
        staffWages: 0,
        stadiumOps: 0,
        trainingOps: 0,
        maintenance: 0,
        matchday: 0,
        transfers: 0,
        other: 0,
      },
      net: 0,
      balance: 0,
    };
    s.ledger.push(row);
  }
  row.income = { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 };
  row.expenses = {
    playerWages: 0,
    staffWages: 0,
    stadiumOps: 0,
    trainingOps: 0,
    maintenance: 0,
    matchday: 0,
    transfers: 0,
    other: 0,
  };
  for (const e of entries) {
    if (e.sourceSystem === "engine.opening") continue;
    if (e.direction === "income") row.income[legacyIncomeBucket(e)] += e.amount;
    else row.expenses[legacyExpenseBucket(e)] += e.amount;
  }
  const inc = Object.values(row.income).reduce((a, b) => a + b, 0);
  const exp = Object.values(row.expenses).reduce((a, b) => a + b, 0);
  row.net = inc - exp;
  row.balance = entries[entries.length - 1].balanceAfter;
}

/* =========================================================================
   2. Wages
========================================================================= */

/**
 * Player wages derive from CANONICAL active contracts (GameState.football).
 * GameState.squad is only a projection and is used as a fallback for saves
 * that have not yet been migrated to the recruitment schema.
 */
export const playerWageBill = (s: GameState) => {
  const contracts = s.football?.contracts;
  if (contracts) {
    const liveContracts = contracts.filter(
      (c) => c.status === "Active" || c.status === "Expiring",
    );
    const contractual = liveContracts
      .filter((c) => isUserClubReference(s, c.clubId))
      .reduce((a, c) => a + c.weeklyWage, 0);
    const adjusted = contractual + loanWageAdjustmentForClub(s, userClubReference(s));
    return int(Math.max(0, adjusted));
  }
  return int((s.squad ?? []).reduce((a, p) => a + p.wage, 0));
};

/** Contracted backroom staff plus the club's structural staff cost. */
export const staffWageBill = (s: GameState) =>
  int((s.hiredStaff ?? []).reduce((a, x) => a + x.wage, 0) + (s.staffWagesWeekly ?? 0));

export function wageSummary(s: GameState): WageSummary {
  const players = playerWageBill(s);
  const staff = staffWageBill(s);
  const total = players + staff;
  const budget = int(s.finance?.budgets?.wages ?? 0);
  const revenue = weeklyRevenueEstimate(s);
  return {
    playerWagesWeekly: players,
    staffWagesWeekly: staff,
    totalWeekly: total,
    annualised: total * SEASON_WEEKS,
    budgetWeekly: budget,
    utilisationPct: budget > 0 ? (total / budget) * 100 : 0,
    wageToRevenuePct: (total / Math.max(1, revenue)) * 100,
  };
}

/* =========================================================================
   3. Recurring income and expenditure
========================================================================= */

/**
 * Club administration: compliance, insurance, travel, ticketing operations.
 * Scales with the level of football played, not just reputation, because the
 * cost of running a club is set by the league it operates in.
 */
export const adminWeeklyCost = (s: GameState) => {
  const p = profileForTier(leagueTierOf(s));
  const size = clubSizeFactor(s.reputation ?? 50);
  return int((2_600 + (s.reputation ?? 50) * 26) * p.staffCostFactor * size);
};

/**
 * Central broadcast and solidarity payments, paid weekly across the season.
 * Driven entirely by the league's economic profile, so promotion and
 * relegation change the club's whole income base with no special casing.
 */
export function leagueDistributionWeekly(s: GameState): number {
  const base = revenueBaseline(leagueTierOf(s), s.reputation ?? 50);
  return base.weeklyBroadcast;
}

export function leagueTierOf(s: GameState): number {
  const l =
    (s.leagues ?? []).find((x) => x.id === s.playerLeagueId) ??
    (s.leagues ?? []).find((x) => x.clubIds?.some((club) => isUserClubReference(s, club)));
  return l?.tier ?? 1;
}

export const sponsorWeeklyIncome = (s: GameState) =>
  int((s.sponsors ?? []).reduce((a, sp) => a + (sp.weeksLeft > 0 ? sp.weekly : 0), 0));

/**
 * Retail and non-contracted commercial takings. Anchored to the level's
 * commercial baseline (a third of it — the rest arrives through negotiated
 * sponsorship) and moved by how happy the supporters are.
 */
export const merchandiseWeeklyIncome = (s: GameState) => {
  const base = revenueBaseline(leagueTierOf(s), s.reputation ?? 50);
  const mood = 0.6 + (s.fanHappiness ?? 60) / 150; // 0.6 - 1.27
  return int(((base.commercialSeason * 0.3) / SEASON_WEEKS) * mood);
};

export const recurringWeeklyIncome = (s: GameState) =>
  sponsorWeeklyIncome(s) + merchandiseWeeklyIncome(s) + leagueDistributionWeekly(s);

export const recurringWeeklyExpenditure = (s: GameState) =>
  playerWageBill(s) +
  staffWageBill(s) +
  int(s.utilitiesWeekly ?? 0) +
  int(s.maintenanceWeekly ?? 0) +
  int(s.trainingWeeklyCost ?? 0) +
  adminWeeklyCost(s);

/** Recurring revenue used for wage-ratio and forecasting denominators. */
export function weeklyRevenueEstimate(s: GameState): number {
  const banked = (s.financeLedger ?? []).filter(
    (e) => e.direction === "income" && e.absoluteWeek < absoluteWeek(s.season, s.week),
  );
  if (banked.length) {
    const weeks = new Set(banked.map((e) => e.absoluteWeek)).size;
    const recentAbs = [...new Set(banked.map((e) => e.absoluteWeek))]
      .sort((a, b) => b - a)
      .slice(0, 6);
    const window = banked.filter((e) => recentAbs.includes(e.absoluteWeek));
    const total = window.reduce((a, e) => a + e.amount, 0);
    return Math.max(1, int(total / Math.max(1, Math.min(6, weeks))));
  }
  // Fresh save: use the canonical economy baseline for the club's level and
  // size. The old stand-capacity projection predated economy.ts and badly
  // understated income, which starved the derived wage ceiling.
  const tier = tierOfUser(s);
  const rep = clubReputation(s, userClubReference(s));
  const baseline = revenueBaseline(tier, rep).totalSeason / SEASON_MATCH_WEEKS;
  return Math.max(1, int(Math.max(baseline, recurringWeeklyIncome(s))));
}

/**
 * Post every recurring stream for the CURRENT week. Exactly-once per week
 * via dedupe keys, so replaying a week cannot duplicate wages.
 */
export function postRecurringWeek(s: GameState): void {
  const key = (what: string) => `recurring:s${s.season}:w${s.week}:${what}`;
  const post = (
    category: FinanceCategory,
    subcategory: string,
    description: string,
    amount: number,
    direction: FinanceDirection,
    what: string,
  ) =>
    postEntry(s, {
      category,
      subcategory,
      description,
      amount,
      direction,
      sourceSystem: "engine.recurring",
      recurring: true,
      dedupeKey: key(what),
    });

  // Income
  post(
    "Commercial",
    "Sponsorship",
    "Contracted sponsorship income",
    sponsorWeeklyIncome(s),
    "income",
    "sponsor",
  );
  post(
    "Commercial",
    "Merchandise",
    "Retail and merchandise takings",
    merchandiseWeeklyIncome(s),
    "income",
    "merchandise",
  );
  post(
    "Commercial",
    "League distribution",
    "Basic league distribution (placeholder)",
    leagueDistributionWeekly(s),
    "income",
    "distribution",
  );

  // Expenditure
  post(
    "Wages",
    "Player wages",
    "Weekly playing-squad wages",
    playerWageBill(s),
    "expense",
    "playerWages",
  );
  post(
    "Wages",
    "Staff wages",
    "Weekly backroom and club staff wages",
    staffWageBill(s),
    "expense",
    "staffWages",
  );
  // Facility upkeep belongs to infrastructure.ts once the asset model exists;
  // posting the legacy mirrors as well would charge the club twice.
  const legacyUpkeep = !s.infrastructure?.assets?.length;
  post(
    "Operations",
    "Stadium operations",
    "Utilities and general operating costs",
    legacyUpkeep ? int(s.utilitiesWeekly ?? 0) : 0,
    "expense",
    "operations",
  );
  post(
    "Facilities",
    "Stadium maintenance",
    "Stadium upkeep",
    legacyUpkeep ? int(s.maintenanceWeekly ?? 0) : 0,
    "expense",
    "stadiumMaintenance",
  );
  post(
    "Facilities",
    "Training ground",
    "Training ground running costs",
    legacyUpkeep ? int(s.trainingWeeklyCost ?? 0) : 0,
    "expense",
    "trainingMaintenance",
  );
  post(
    "Operations",
    "Administration",
    "Club administration and compliance",
    adminWeeklyCost(s),
    "expense",
    "admin",
  );
}

/* =========================================================================
   4. Matchday finance
   Both the auto-resolved and the live-played path call postMatchdayFinance,
   so the two can never diverge, and the dedupe key makes a reload safe.
========================================================================= */

export interface MatchdayFinanceInput {
  season: number;
  week: number;
  opponent: string;
  home: boolean;
  attendance: number;
  /** Gross ticket receipts. */
  gate: number;
  /** Broadcast fee for this fixture (placeholder until deals are modelled). */
  tv: number;
  matchdayOps: number;
  winBonus?: number;
  fixtureId?: string;
  /**
   * Facility multipliers supplied by the caller (engine reads them from
   * infrastructure.ts). Passed in rather than imported so finance.ts stays
   * free of a circular dependency on the infrastructure module.
   */
  modifiers?: {
    hospitalityIncome?: number;
    concessionSpend?: number;
    parkingIncome?: number;
    matchdayOperatingCost?: number;
  };
}

export interface MatchdayFinanceBreakdown {
  tickets: number;
  hospitality: number;
  concessions: number;
  parking: number;
  broadcast: number;
  operatingCost: number;
  winBonus: number;
  net: number;
}

export const matchdayKey = (i: { season: number; week: number; opponent: string }) =>
  `matchday:s${i.season}:w${i.week}:${i.opponent}`;

/**
 * Deterministic ancillary matchday revenue, derived from attendance.
 * `level` scales spend per head with the level of football: supporters in the
 * top flight spend several times what a National Division crowd does.
 */
export const spendLevelFactor = (tier: number) => profileForTier(tier).ticketPriceReference / 20;

export const hospitalityFor = (attendance: number, mult = 1, level = 1) =>
  int(attendance * 1.35 * mult * level);
export const concessionsFor = (attendance: number, mult = 1, level = 1) =>
  int(attendance * 2.6 * mult * level);
export const parkingFor = (attendance: number, mult = 1, level = 1) =>
  int(attendance * 0.5 * mult * level);

export function postMatchdayFinance(
  s: GameState,
  i: MatchdayFinanceInput,
): MatchdayFinanceBreakdown {
  const base = matchdayKey(i);
  const home = i.home;
  const m = i.modifiers ?? {};
  const attendance = home ? int(i.attendance) : 0;
  const tickets = home ? int(i.gate) : 0;
  const level = spendLevelFactor(leagueTierOf(s));
  const hospitality = home ? hospitalityFor(attendance, m.hospitalityIncome ?? 1, level) : 0;
  const concessions = home ? concessionsFor(attendance, m.concessionSpend ?? 1, level) : 0;
  const parking = home ? parkingFor(attendance, m.parkingIncome ?? 1, level) : 0;
  const broadcast = int(i.tv);
  const ops = int(i.matchdayOps * (home ? (m.matchdayOperatingCost ?? 1) : 1));
  const winBonus = int(i.winBonus ?? 0);
  const meta = {
    opponent: i.opponent,
    home,
    attendance,
    tickets,
    hospitality,
    concessions,
    parking,
    broadcast,
  };
  const post = (
    sub: string,
    desc: string,
    amount: number,
    direction: FinanceDirection,
    suffix: string,
  ) =>
    postEntry(s, {
      category: "Matchday",
      subcategory: sub,
      description: desc,
      amount,
      direction,
      sourceSystem: "engine.matchday",
      linkedEntityId: i.fixtureId,
      dedupeKey: `${base}:${suffix}`,
      metadata: meta,
    });

  const where = home ? "vs" : "away at";
  post("Ticket sales", `Gate receipts ${where} ${i.opponent}`, tickets, "income", "tickets");
  post(
    "Hospitality",
    `Matchday hospitality ${where} ${i.opponent}`,
    hospitality,
    "income",
    "hospitality",
  );
  post(
    "Concessions",
    `Matchday concessions ${where} ${i.opponent}`,
    concessions,
    "income",
    "concessions",
  );
  post("Parking", `Matchday parking ${where} ${i.opponent}`, parking, "income", "parking");
  post("Broadcast", `Broadcast fee ${where} ${i.opponent}`, broadcast, "income", "broadcast");
  post("Operations", `Matchday operating costs ${where} ${i.opponent}`, ops, "expense", "ops");
  post("Win bonus", `Squad win bonus ${where} ${i.opponent}`, winBonus, "expense", "winBonus");

  return {
    tickets,
    hospitality,
    concessions,
    parking,
    broadcast,
    operatingCost: ops,
    winBonus,
    net: tickets + hospitality + concessions + parking + broadcast - ops - winBonus,
  };
}

/* =========================================================================
   5. Prize money — configuration driven, never keyed on division names
========================================================================= */

export function prizeRulesFor(league: League): LeaguePrizeRules {
  if (league.prizeRules) return league.prizeRules;
  const prize = profileForTier(league.tier ?? 1).prize;
  return {
    basePayment: prize.basePayment,
    positionStep: prize.positionStep,
    championBonus: prize.championBonus,
    promotionBonus: league.promotionPlaces > 0 ? prize.promotionBonus : 0,
    relegationSupport: league.relegationPlaces > 0 ? prize.relegationCushion : 0,
  };
}

export interface PrizeBreakdown {
  base: number;
  position: number;
  champion: number;
  promotion: number;
  relegation: number;
  total: number;
  rulesUsed: LeaguePrizeRules;
}

export function prizeMoneyFor(league: League, position: number, size: number): PrizeBreakdown {
  const r = prizeRulesFor(league);
  const base = r.basePayment + int(league.prizeMoney ?? 0);
  const positionPay = int(r.positionStep * Math.max(0, size - position));
  const champion = position === 1 ? r.championBonus : 0;
  const promotion =
    league.promotionPlaces > 0 && position <= league.promotionPlaces ? r.promotionBonus : 0;
  const relegation =
    league.relegationPlaces > 0 && position > size - league.relegationPlaces
      ? r.relegationSupport
      : 0;
  return {
    base,
    position: positionPay,
    champion,
    promotion,
    relegation,
    total: base + positionPay + champion + promotion + relegation,
    rulesUsed: r,
  };
}

export const prizeKey = (season: number, leagueId: string) => `prize:s${season}:${leagueId}`;

/** Award the user's club its end-of-season prize money. Exactly once. */
export function awardPrizeMoney(
  s: GameState,
  season: number,
  league: League,
  position: number,
): PrizeBreakdown | null {
  const size = league.clubIds?.length || 20;
  const b = prizeMoneyFor(league, position, size);
  const posted = postEntry(s, {
    category: "Prize Money",
    subcategory: "League distribution",
    description: `Season ${season} ${league.name} prize money — finished ${position} of ${size}`,
    amount: b.total,
    direction: "income",
    sourceSystem: "engine.prize",
    linkedEntityId: league.id,
    dedupeKey: prizeKey(season, league.id),
    season,
    week: SEASON_WEEKS,
    metadata: {
      position,
      size,
      base: b.base,
      positionPay: b.position,
      champion: b.champion,
      promotion: b.promotion,
      relegation: b.relegation,
    },
  });
  return posted ? b : null;
}

/* =========================================================================
   6. Board financial policy + department budgets
========================================================================= */

export const POLICIES: BoardSpendingPolicy[] = [
  "Aggressive Investment",
  "Controlled Growth",
  "Balanced",
  "Cautious",
  "Emergency Cost Control",
];

/** Weeks of outgoings the board wants held back, by policy. */
const RESERVE_WEEKS: Record<BoardSpendingPolicy, number> = {
  "Aggressive Investment": 4,
  "Controlled Growth": 6,
  Balanced: 8,
  Cautious: 12,
  "Emergency Cost Control": 14,
};

/** Wage bill the board tolerates as a share of recurring revenue. */
export const WAGE_TOLERANCE: Record<BoardSpendingPolicy, number> = {
  "Aggressive Investment": 0.78,
  "Controlled Growth": 0.68,
  Balanced: 0.6,
  Cautious: 0.5,
  "Emergency Cost Control": 0.42,
};

export const POLICY_DESC: Record<BoardSpendingPolicy, string> = {
  "Aggressive Investment": "The board will back heavy investment now and accept a thin reserve.",
  "Controlled Growth": "Spend to improve, but only from money the club is actually generating.",
  Balanced: "Steady operation — invest what the club can comfortably absorb.",
  Cautious: "Protect the balance sheet. Only clearly justified expenditure.",
  "Emergency Cost Control": "Cost control across every department until trading recovers.",
};

export function minimumReserveFor(policy: BoardSpendingPolicy, weeklyOutgoings: number): number {
  return int(Math.max(50_000, weeklyOutgoings * RESERVE_WEEKS[policy]));
}

/**
 * Derive the board's spending policy. Deterministic function of the club's
 * financial position, league standing, Finance Director temperament and
 * overall board confidence.
 */
export function derivePolicy(s: GameState): BoardSpendingPolicy {
  const outgo = Math.max(1, recurringWeeklyExpenditure(s));
  const weeksOfCash = int(s.cash) / outgo;
  const projected = forecastSeason(s).projectedSeasonEndBalance;
  const recent = recentOperatingResult(s, 6);
  const wagePct = wageSummary(s).wageToRevenuePct;
  const confidence = s.board?.confidence ?? 60;
  const fd = (s.board?.directors ?? []).find((d) => d.role === "Finance Director");
  const frugal = !!fd?.traits.includes("frugal");
  const ambitious = (s.board?.directors ?? []).filter((d) => d.traits.includes("ambitious")).length;

  let score = 0; // higher = more permissive
  score += clamp(weeksOfCash, 0, 40) / 4; // 0 – 10
  score += projected > int(s.cash) ? 3 : projected > 0 ? 1 : -4;
  score += recent >= 0 ? 2 : recent < -250_000 ? -4 : -2;
  score += wagePct > 85 ? -4 : wagePct > 70 ? -2 : wagePct < 50 ? 2 : 0;
  score += (confidence - 55) / 12;
  score += ambitious;
  if (frugal) score -= 2.5;
  if (int(s.cash) <= 0) score -= 12;

  if (score >= 12) return "Aggressive Investment";
  if (score >= 8) return "Controlled Growth";
  if (score >= 4) return "Balanced";
  if (score >= 0) return "Cautious";
  return "Emergency Cost Control";
}

/** Budgets are authorisation limits derived from policy — never new cash. */
export function deriveBudgets(
  s: GameState,
  policy: BoardSpendingPolicy,
  minimumReserve: number,
): Record<BudgetKey, number> {
  const revenue = weeklyRevenueEstimate(s);
  const headroom = Math.max(0, int(s.cash) - minimumReserve);
  const share: Record<BoardSpendingPolicy, [number, number, number]> = {
    // [transfers, facilities, commercial] as a share of discretionary headroom
    "Aggressive Investment": [0.55, 0.22, 0.13],
    "Controlled Growth": [0.42, 0.2, 0.12],
    Balanced: [0.32, 0.16, 0.1],
    Cautious: [0.18, 0.12, 0.07],
    "Emergency Cost Control": [0.06, 0.06, 0.04],
  };
  const [t, f, c] = share[policy];
  return {
    wages: int(revenue * WAGE_TOLERANCE[policy]),
    transfers: int(headroom * t),
    facilities: int(headroom * f),
    commercial: int(headroom * c),
    contingency: minimumReserve,
  };
}

/**
 * Recompute policy, minimum reserve and budgets. Called at season start and
 * whenever the board formally revisits the club's finances. Pure derivation:
 * it never moves cash.
 */
export function applyBoardPolicy(s: GameState, season = s.season): BoardSpendingPolicy {
  ensureFinance(s);
  const policy = derivePolicy(s);
  const reserve = minimumReserveFor(policy, recurringWeeklyExpenditure(s));
  s.finance.boardSpendingPolicy = policy;
  s.finance.minimumCashReserve = reserve;
  s.finance.budgets = deriveBudgets(s, policy, reserve);
  s.finance.policySeason = season;
  return policy;
}

/** Manual, deliberate budget re-allocation by the chairman. */
export function setBudget(s: GameState, key: BudgetKey, amount: number): GameState {
  const next = structuredClone(s);
  ensureFinance(next);
  const cap =
    key === "wages" ? int(weeklyRevenueEstimate(next) * 1.6) : Math.max(0, int(next.cash));
  next.finance.budgets[key] = clamp(int(amount), 0, cap);
  return next;
}

export interface BudgetUsage {
  key: BudgetKey;
  label: string;
  approved: number;
  committed: number;
  remaining: number;
  utilisationPct: number;
  /** Weekly authorisation (wages) vs seasonal pot. */
  weekly: boolean;
}

export const BUDGET_LABEL: Record<BudgetKey, string> = {
  wages: "Wages",
  transfers: "Transfers",
  facilities: "Facilities",
  commercial: "Commercial",
  contingency: "Contingency reserve",
};

const BUDGET_CATEGORIES: Record<BudgetKey, FinanceCategory[]> = {
  wages: ["Wages"],
  transfers: ["Transfers"],
  facilities: ["Facilities"],
  commercial: ["Commercial"],
  contingency: [],
};

export function budgetUsage(s: GameState, season = s.season): BudgetUsage[] {
  ensureFinance(s);
  const entries = entriesFor(s, season).filter((e) => e.direction === "expense");
  return (Object.keys(s.finance.budgets) as BudgetKey[]).map((key) => {
    const approved = int(s.finance.budgets[key]);
    let committed: number;
    if (key === "wages") committed = wageSummary(s).totalWeekly;
    else if (key === "contingency") committed = Math.max(0, approved - Math.max(0, int(s.cash)));
    else {
      const cats = BUDGET_CATEGORIES[key];
      committed = entries
        .filter((e) => cats.includes(e.category))
        .reduce((a, e) => a + e.amount, 0);
    }
    return {
      key,
      label: BUDGET_LABEL[key],
      approved,
      committed,
      remaining: approved - committed,
      utilisationPct: approved > 0 ? (committed / approved) * 100 : 0,
      weekly: key === "wages",
    };
  });
}

/* =========================================================================
   7. Affordability — the single validator used by BOTH engine and UI
========================================================================= */

export function assessSpend(
  s: GameState,
  amount: number,
  opts?: { recurringWeekly?: number },
): AffordabilityResult {
  ensureFinance(s);
  const spend = Math.max(0, int(amount));
  const cashNow = int(s.cash);
  const cashAfter = cashNow - spend;
  const reserve = int(s.finance.minimumCashReserve);
  const forecast = forecastSeason(s);
  const weeksLeft = forecast.weeksRemaining;
  const ongoing = int(opts?.recurringWeekly ?? 0) * weeksLeft;
  const projected = forecast.projectedSeasonEndBalance;
  const projectedAfter = projected - spend - ongoing;

  const base = {
    amount: spend,
    cashNow,
    cashAfter,
    minimumReserve: reserve,
    projectedSeasonEndBalance: projected,
    projectedAfterSpend: projectedAfter,
  };
  const verdict = (v: AffordabilityVerdict, reason: string): AffordabilityResult => ({
    ...base,
    verdict: v,
    allowed: v === "affordable" || v === "affordableButRisky",
    reason,
  });

  if (spend === 0) return verdict("affordable", "No cost.");
  if (spend > cashNow) {
    return verdict(
      "unaffordable",
      `The club holds ${cashNow.toLocaleString()} — ${(spend - cashNow).toLocaleString()} short.`,
    );
  }
  if (cashAfter < reserve) {
    return verdict(
      "requiresBoardApproval",
      `Funds exist, but this breaks the board's minimum reserve of £${reserve.toLocaleString()}.`,
    );
  }
  if (projectedAfter < reserve) {
    return verdict(
      "affordableButRisky",
      `Affordable today, but the forecast closes the season below the minimum reserve.`,
    );
  }
  return verdict("affordable", "Comfortably within the club's means.");
}

/* =========================================================================
   8. Cash-flow forecast — deterministic estimate for the rest of the season
========================================================================= */

export function remainingHomeFixtures(s: GameState): number {
  return (s.fixtures ?? []).filter((f) => f.home && f.week >= s.week).length;
}

/** Averaged, deterministic projection of one home gate. */
export function projectedHomeMatchIncome(s: GameState): number {
  const capacity = (s.stands ?? []).reduce((a, b) => a + b.capacity, 0);
  const avgPrice = capacity
    ? (s.stands ?? []).reduce((a, b) => a + b.ticketPrice * b.capacity, 0) / capacity
    : 0;
  const occupancy = clamp(0.35 + (s.fanHappiness ?? 60) / 250, 0.3, 0.95);
  const attendance = int(capacity * occupancy);
  const tickets = int(attendance * avgPrice);
  const ops = int(6_500 + attendance * 0.4);
  return tickets + hospitalityFor(attendance) + concessionsFor(attendance) - ops;
}

/** Payments the club already knows about: expiring inbox commitments. */
export function scheduledKnownPayments(s: GameState): number {
  // Only movements already committed on the timeline count. Speculative
  // systems (transfers, sponsorship renewals) are deliberately excluded.
  return 0;
}

export function forecastSeason(s: GameState): CashFlowForecast {
  const weeksRemaining = Math.max(0, SEASON_WEEKS - s.week + 1);
  const income = recurringWeeklyIncome(s) * weeksRemaining;
  const expenditure = recurringWeeklyExpenditure(s) * weeksRemaining;
  const matchday = projectedHomeMatchIncome(s) * remainingHomeFixtures(s);
  const known = scheduledKnownPayments(s);
  const prize = projectedPrizeMoney(s);
  const projected = int(s.cash) + income - expenditure + matchday - known + prize;
  return {
    season: s.season,
    fromWeek: s.week,
    weeksRemaining,
    currentBalance: int(s.cash),
    expectedRecurringIncome: int(income),
    expectedRecurringExpenditure: int(expenditure),
    expectedMatchdayIncome: int(matchday),
    scheduledKnownPayments: int(known),
    prizeMoneyAssumption: int(prize),
    projectedSeasonEndBalance: int(projected),
    estimate: true,
  };
}

/** Prize assumption: current league position held to the end of the season. */
export function projectedPrizeMoney(s: GameState): number {
  if (hasEntry(s, prizeKey(s.season, s.playerLeagueId))) return 0;
  const league = (s.leagues ?? []).find((l) => l.id === s.playerLeagueId);
  if (!league) return 0;
  const table = s.league ?? [];
  const idx = table.findIndex((r) => isUserClubReference(s, r.team));
  const size = league.clubIds?.length || Math.max(1, table.length);
  const position = idx >= 0 ? idx + 1 : Math.ceil(size / 2);
  return prizeMoneyFor(league, position, size).total;
}

/* =========================================================================
   9. Financial risk — always derived, never stored as an authored value
========================================================================= */

export const RISK_ORDER: FinancialRiskLevel[] = [
  "Secure",
  "Stable",
  "Watch",
  "High Risk",
  "Critical",
];

export interface RiskAssessment {
  level: FinancialRiskLevel;
  score: number;
  reasons: string[];
}

export function assessRisk(s: GameState): RiskAssessment {
  ensureFinance(s);
  const reasons: string[] = [];
  const outgo = Math.max(1, recurringWeeklyExpenditure(s));
  const weeksOfCash = int(s.cash) / outgo;
  const reserve = int(s.finance.minimumCashReserve);
  const projected = forecastSeason(s).projectedSeasonEndBalance;
  const wagePct = wageSummary(s).wageToRevenuePct;
  const losses = consecutiveLossWeeks(s);

  let score = 0;
  if (weeksOfCash < 2) {
    score += 5;
    reasons.push("Under two weeks of cash cover.");
  } else if (weeksOfCash < 6) {
    score += 3;
    reasons.push("Thin cash cover.");
  } else if (weeksOfCash < 12) {
    score += 1;
    reasons.push("Moderate cash cover.");
  }

  if (int(s.cash) < reserve) {
    score += 2;
    reasons.push("Below the board's minimum reserve.");
  }
  if (projected < 0) {
    score += 3;
    reasons.push("Forecast closes the season in deficit.");
  } else if (projected < reserve) {
    score += 1;
    reasons.push("Forecast closes below the reserve.");
  }

  if (wagePct > 95) {
    score += 3;
    reasons.push("Wages exceed recurring revenue.");
  } else if (wagePct > 75) {
    score += 2;
    reasons.push("Wage-to-revenue ratio is high.");
  } else if (wagePct > 60) {
    score += 1;
    reasons.push("Wage-to-revenue ratio is elevated.");
  }

  if (losses >= 8) {
    score += 2;
    reasons.push(`${losses} consecutive weeks of operating losses.`);
  } else if (losses >= 4) {
    score += 1;
    reasons.push(`${losses} straight weeks of operating losses.`);
  }

  if (int(s.cash) <= 0) {
    score += 4;
    reasons.push("The club has no cash.");
  }
  if (!reasons.length) reasons.push("Trading comfortably within the club's means.");

  const level: FinancialRiskLevel =
    score >= 9
      ? "Critical"
      : score >= 6
        ? "High Risk"
        : score >= 4
          ? "Watch"
          : score >= 2
            ? "Stable"
            : "Secure";
  return { level, score, reasons };
}

export const financialRisk = (s: GameState): FinancialRiskLevel => assessRisk(s).level;

export const RISK_CLASS: Record<FinancialRiskLevel, string> = {
  Secure: "text-emerald-600",
  Stable: "text-teal-600",
  Watch: "text-amber-600",
  "High Risk": "text-orange-600",
  Critical: "text-rose-600",
};

/* =========================================================================
   10. Season close + opening
========================================================================= */

export function averageHomeAttendance(s: GameState, season: number): number {
  const gates = entriesFor(s, season).filter(
    (e) =>
      e.category === "Matchday" && e.subcategory === "Ticket sales" && e.metadata?.home === true,
  );
  if (!gates.length) return 0;
  const total = gates.reduce((a, e) => a + Number(e.metadata?.attendance ?? 0), 0);
  return int(total / gates.length);
}

/** Write the immutable season summary, then open the next season's books. */
export function closeSeasonFinance(s: GameState, season: number, leagueId: string): void {
  ensureFinance(s);
  if (s.financeHistory.some((h) => h.season === season)) return; // immutable
  const t = seasonTotals(s, season);
  const entries = entriesFor(s, season);
  const summary: SeasonFinancialSummary = {
    season,
    leagueId,
    openingBalance:
      s.finance.openingSeasonNumber === season
        ? int(s.finance.openingSeasonBalance)
        : int(s.cash) - t.operatingResult,
    totalIncome: t.income,
    totalExpenditure: t.expenditure,
    operatingProfit: t.operatingResult,
    closingBalance: int(s.cash),
    wageCost: entries.filter((e) => e.category === "Wages").reduce((a, e) => a + e.amount, 0),
    matchdayIncome: entries
      .filter((e) => e.category === "Matchday" && e.direction === "income")
      .reduce((a, e) => a + e.amount, 0),
    prizeMoney: entries
      .filter((e) => e.category === "Prize Money")
      .reduce((a, e) => a + e.amount, 0),
    averageAttendance: averageHomeAttendance(s, season),
    financialRiskAtClose: financialRisk(s),
    boardPolicy: s.finance.boardSpendingPolicy,
    budgetPerformance: budgetUsage(s, season).map((b) => ({
      key: b.key,
      approved: b.approved,
      committed: b.committed,
    })),
  };
  s.financeHistory.push(summary);
}

/** Roll the books into a new season: new opening balance, fresh policy. */
export function openSeasonFinance(s: GameState, season: number): void {
  ensureFinance(s);
  s.finance.openingSeasonBalance = int(s.cash);
  s.finance.openingSeasonNumber = season;
  applyBoardPolicy(s, season);
}

/* =========================================================================
   11. Live finance snapshot for the UI (derived — never stored)
========================================================================= */

export interface FinanceSnapshot {
  cashBalance: number;
  openingSeasonBalance: number;
  currentSeasonIncome: number;
  currentSeasonExpenditure: number;
  operatingResult: number;
  projectedSeasonEndBalance: number;
  monthlyOperatingResult: number;
  minimumCashReserve: number;
  boardSpendingPolicy: BoardSpendingPolicy;
  risk: RiskAssessment;
  wages: WageSummary;
  forecast: CashFlowForecast;
  budgets: BudgetUsage[];
  reconciled: boolean;
}

export function financeSnapshot(s: GameState): FinanceSnapshot {
  ensureFinance(s);
  const t = seasonTotals(s, s.season);
  const forecast = forecastSeason(s);
  return {
    cashBalance: int(s.cash),
    openingSeasonBalance: int(s.finance.openingSeasonBalance),
    currentSeasonIncome: t.income,
    currentSeasonExpenditure: t.expenditure,
    operatingResult: t.operatingResult,
    projectedSeasonEndBalance: forecast.projectedSeasonEndBalance,
    monthlyOperatingResult: recentOperatingResult(s, FINANCE_PERIOD_WEEKS),
    minimumCashReserve: int(s.finance.minimumCashReserve),
    boardSpendingPolicy: s.finance.boardSpendingPolicy,
    risk: assessRisk(s),
    wages: wageSummary(s),
    forecast,
    budgets: budgetUsage(s),
    reconciled: reconcile(s).ok,
  };
}

/* =========================================================================
   12. Migration support
   -------------------------------------------------------------------------
   A pre-finance save holds only weekly WeekLedger roll-ups. We convert each
   bucket of each row into a finance entry, tagged sourceSystem "migration"
   and dedupeKey "migrated:s{season}:w{week}:{bucket}", then post a single
   balancing "Opening position" entry so the rebuilt ledger reconciles to the
   save's real cash figure. No historical season summary is invented.

   Mid-season saves: the current season keeps every converted row, and the
   opening balance for the season is reconstructed as
   (cash − operating result booked so far this season).
========================================================================= */

export function migrateLegacyLedger(s: GameState): void {
  if (!Array.isArray(s.financeLedger)) s.financeLedger = [];
  if (!s.finance) s.finance = defaultFinanceState(s);
  if (s.financeLedger.length > 0) return; // idempotent

  const cashTarget = int(s.cash);
  // Deep copy: postEntry() calls syncWeekLedger(), which rewrites the legacy
  // rows in place as projections — iterating the live array would read back
  // our own freshly-written entries instead of the original save data.
  const rows = (JSON.parse(JSON.stringify(s.ledger ?? [])) as typeof s.ledger).sort(
    (a, b) => absoluteWeek(a.season, a.week) - absoluteWeek(b.season, b.week),
  );

  // Cash is authoritative; the opening entry absorbs everything the legacy
  // rows cannot explain, so reconciliation holds from the first load.
  let movement = 0;
  for (const r of rows) {
    for (const v of Object.values(r.income)) movement += int(v);
    for (const v of Object.values(r.expenses)) movement -= int(v);
  }
  const opening = cashTarget - movement;

  // Start from zero so postEntry() builds the balance up to `cash`.
  s.cash = 0;
  const firstSeason = rows[0]?.season ?? s.season;
  const firstWeek = rows[0]?.week ?? s.week;
  postEntry(s, {
    category: "Board",
    subcategory: "Opening position",
    description: "Opening cash position carried into the finance ledger",
    amount: Math.abs(opening),
    direction: opening >= 0 ? "income" : "expense",
    sourceSystem: "migration",
    dedupeKey: "migrated:opening",
    season: firstSeason,
    week: firstWeek,
  });

  const INCOME_MAP: Record<string, [FinanceCategory, string, string]> = {
    gate: ["Matchday", "Ticket sales", "Historic gate receipts"],
    tv: ["Matchday", "Broadcast", "Historic broadcast income"],
    sponsor: ["Commercial", "Sponsorship", "Historic sponsorship income"],
    merchandise: ["Commercial", "Merchandise", "Historic merchandise income"],
    prize: ["Prize Money", "League distribution", "Historic prize money"],
    transfers: ["Transfers", "Player sales", "Historic transfer income"],
    other: ["Miscellaneous", "Other", "Historic miscellaneous income"],
  };
  const EXPENSE_MAP: Record<string, [FinanceCategory, string, string]> = {
    playerWages: ["Wages", "Player wages", "Historic player wages"],
    staffWages: ["Wages", "Staff wages", "Historic staff wages"],
    stadiumOps: ["Operations", "Stadium operations", "Historic stadium operations"],
    trainingOps: ["Facilities", "Training ground", "Historic training ground costs"],
    maintenance: ["Facilities", "Stadium maintenance", "Historic maintenance"],
    matchday: ["Matchday", "Operations", "Historic matchday operating costs"],
    transfers: ["Transfers", "Player purchases", "Historic transfer spend"],
    other: ["Miscellaneous", "Other", "Historic miscellaneous costs"],
  };

  for (const r of rows) {
    for (const [bucket, value] of Object.entries(r.income)) {
      const [category, subcategory, description] = INCOME_MAP[bucket];
      postEntry(s, {
        category,
        subcategory,
        description,
        amount: int(value),
        direction: "income",
        sourceSystem: "migration",
        recurring: true,
        dedupeKey: `migrated:s${r.season}:w${r.week}:in:${bucket}`,
        season: r.season,
        week: r.week,
      });
    }
    for (const [bucket, value] of Object.entries(r.expenses)) {
      const [category, subcategory, description] = EXPENSE_MAP[bucket];
      postEntry(s, {
        category,
        subcategory,
        description,
        amount: int(value),
        direction: "expense",
        sourceSystem: "migration",
        recurring: true,
        dedupeKey: `migrated:s${r.season}:w${r.week}:out:${bucket}`,
        season: r.season,
        week: r.week,
      });
    }
  }

  // Cash must land exactly where the save left it.
  s.cash = cashTarget;

  const thisSeason = seasonTotals(s, s.season);
  s.finance.openingSeasonBalance = cashTarget - thisSeason.operatingResult;
  s.finance.openingSeasonNumber = s.season;
  applyBoardPolicy(s, s.season);
}

/** Fresh-game initialisation: opening position, policy and budgets. */
export function initFinance(s: GameState): void {
  const opening = int(s.cash);
  s.finance = defaultFinanceState(s);
  s.financeLedger = [];
  s.financeHistory = [];
  s.cash = 0;
  postEntry(s, {
    category: "Board",
    subcategory: "Opening position",
    description: "Opening cash position handed over by the board",
    amount: opening,
    direction: "income",
    sourceSystem: "engine.opening",
    dedupeKey: `opening:s${s.season}`,
  });
  s.finance.openingSeasonBalance = int(s.cash);
  s.finance.openingSeasonNumber = s.season;
  applyBoardPolicy(s, s.season);
}

/* =========================================================================
   9. Economy selectors — how the club compares with its level
   Derived only. Nothing here mutates state.
========================================================================= */

/** The wage structure of the user's contracted squad, banded for its level. */
export function squadWageStructure(s: GameState): WageStructure {
  const wages = (s.football?.contracts ?? [])
    .filter((c) => isUserClubReference(s, c.clubId) && (c.status === "Active" || c.status === "Expiring"))
    .map((c) => c.weeklyWage);
  return wageStructureFrom(wages, leagueTierOf(s));
}

export interface EconomyBenchmark {
  tier: number;
  levelLabel: string;
  /** Annualised revenue actually banked, from the ledger. */
  revenueAnnualised: number;
  /** What a club of this size at this level would typically turn over. */
  revenueBenchmark: number;
  wageBillWeekly: number;
  sustainableWageBillWeekly: number;
  wageToRevenuePct: number;
  expectedWageToRevenuePct: number;
  /** Operating result excludes transfer trading; trading is shown separately. */
  operatingResultSeason: number;
  tradingResultSeason: number;
}

/** Operating vs transfer-trading split for one season, from the ledger. */
export function operatingSplit(
  s: GameState,
  season: number,
): {
  operatingIncome: number;
  operatingExpense: number;
  operatingResult: number;
  tradingIncome: number;
  tradingExpense: number;
  tradingResult: number;
} {
  const es = entriesFor(s, season);
  const isTrading = (c: string) => c === "Transfers";
  let oi = 0,
    oe = 0,
    ti = 0,
    te = 0;
  for (const e of es) {
    const trading = isTrading(e.category);
    if (e.direction === "income") {
      if (trading) ti += e.amount;
      else oi += e.amount;
    } else if (trading) te += e.amount;
    else oe += e.amount;
  }
  return {
    operatingIncome: oi,
    operatingExpense: oe,
    operatingResult: oi - oe,
    tradingIncome: ti,
    tradingExpense: te,
    tradingResult: ti - te,
  };
}

export function economyBenchmark(s: GameState): EconomyBenchmark {
  const tier = leagueTierOf(s);
  const p = profileForTier(tier);
  const rep = s.reputation ?? 50;
  const split = operatingSplit(s, s.season);
  const weeksPlayed = Math.max(1, s.week - 1);
  const annualised = int((split.operatingIncome / weeksPlayed) * SEASON_WEEKS);
  const wages = playerWageBill(s) + staffWageBill(s);
  const benchmark = revenueBaseline(tier, rep).totalSeason;
  return {
    tier,
    levelLabel: p.label,
    revenueAnnualised: annualised,
    revenueBenchmark: benchmark,
    wageBillWeekly: wages,
    sustainableWageBillWeekly: sustainableWeeklyWageBill(tier, rep),
    wageToRevenuePct: ((wages * SEASON_WEEKS) / Math.max(1, annualised || benchmark)) * 100,
    expectedWageToRevenuePct: p.expectedWageRevenueRatio * 100,
    operatingResultSeason: split.operatingResult,
    tradingResultSeason: split.tradingResult,
  };
}
