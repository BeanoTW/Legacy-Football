/* =========================================================================
   Club Sustainability — strategic pressure, derived not invented
   -------------------------------------------------------------------------
   Rules of this module (enforced by __checks__/sustainability.check.ts):

     1. Every financial number here is DERIVED from the canonical systems:
        finance.ts owns cash and the ledger, recruitment.ts owns contracts,
        commercial.ts owns sponsorship, infrastructure.ts owns the physical
        club, board.ts owns the directors. Nothing is duplicated or cached.
     2. NOTHING in this file may change GameState.cash. There is no wealth
        tax, no idle-money penalty and no hidden drain. Pressure is
        political and competitive, never a debit.
     3. Selectors are pure. Reading financial health can never change board
        confidence, fan happiness or any other piece of state.
     4. The only state this layer owns is SustainabilityState: the
        chairman's stated commitments, and how long excess cash has sat
        idle. Both are settled exactly once and survive a reload.
     5. No Math.random(), no Date.now(). Anything variable is seeded.
========================================================================= */

import type {
  CommitmentCategory,
  DirectorRole,
  FinancialHealthState,
  GameState,
  StrategicCommitment,
  SustainabilityState,
} from "./types";

import {
  FINANCE_PERIOD_WEEKS,
  entriesFor,
  leagueTierOf,
  leagueDistributionWeekly,
  staffWageBill,
  playerWageBill,
} from "./finance";
import {
  activeProjects,
  assetById,
  assets as infraAssets,
  facilityModifiers,
  stands,
  usableCapacityOf,
  weeklyMaintenanceCost,
  weeklyOperatingCost,
} from "./infrastructure";
import { activeContracts, commercialWeeklyIncome } from "./commercial";
import { squadOf, userWageBill } from "./recruitment";
import { clubReputation, clubStrengthFor } from "./reputation";
import { absoluteWeek } from "./time";
import { archivedBucketSum } from "./archive";
import { isUserClubReference, userClubReference } from "./clubReference";

const int = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n: number) => clamp(n, 0, 1);

/** Number of trailing weeks used for every "recent operating" measurement. */
export const TRAILING_WEEKS = 8;
/** Cadence of the periodic reserve report, in weeks. */
export const RESERVE_REPORT_WEEKS = 12;

/* =========================================================================
   0. State
========================================================================= */

export function defaultSustainability(): SustainabilityState {
  return {
    commitments: [],
    history: [],
    excessWeeks: 0,
    peakExcessWeeks: 0,
    lastTickAbsoluteWeek: 0,
    nextCommitmentId: 1,
  };
}

export function ensureSustainability(s: GameState): void {
  const cur = s.sustainability as SustainabilityState | undefined;
  if (!cur || typeof cur !== "object") {
    s.sustainability = defaultSustainability();
    return;
  }
  if (!Array.isArray(cur.commitments)) cur.commitments = [];
  if (!Array.isArray(cur.history)) cur.history = [];
  if (typeof cur.excessWeeks !== "number") cur.excessWeeks = 0;
  if (typeof cur.peakExcessWeeks !== "number") cur.peakExcessWeeks = cur.excessWeeks;
  if (typeof cur.lastTickAbsoluteWeek !== "number") cur.lastTickAbsoluteWeek = 0;
  if (typeof cur.nextCommitmentId !== "number") {
    cur.nextCommitmentId = cur.commitments.length + 1;
  }
}

/* =========================================================================
   1. Operating picture — trailing, from the canonical ledger
   -------------------------------------------------------------------------
   "Operating" deliberately excludes transfers and capital projects. Selling
   a striker is not operating income and rebuilding a stand is not an
   operating cost; mixing them in makes a club look profitable in the exact
   season it liquidated its future.
========================================================================= */

const NON_OPERATING = new Set(["Transfers", "Capital"]);

export interface OperatingPicture {
  weeksSampled: number;
  income: number;
  expenditure: number;
  /** Positive = the club funds itself from its own trading. */
  profit: number;
  weeklyIncome: number;
  weeklyExpenditure: number;
  weeklyProfit: number;
  /** Standard deviation of weekly net, £. Revenue volatility. */
  volatility: number;
}

/** Ledger entries for the trailing window, most recent first in the save. */
function trailingEntries(s: GameState, weeks = TRAILING_WEEKS) {
  const now = absoluteWeek(s.season, s.week);
  const from = now - weeks;
  return (s.financeLedger ?? []).filter((e) => {
    const abs = absoluteWeek(e.season, e.week);
    return abs > from && abs <= now && !NON_OPERATING.has(e.category);
  });
}

export function operatingPicture(s: GameState, weeks = TRAILING_WEEKS): OperatingPicture {
  const es = trailingEntries(s, weeks);
  const byWeek = new Map<number, number>();
  let income = 0;
  let expenditure = 0;
  for (const e of es) {
    const abs = absoluteWeek(e.season, e.week);
    const signed = e.direction === "income" ? e.amount : -e.amount;
    byWeek.set(abs, (byWeek.get(abs) ?? 0) + signed);
    if (e.direction === "income") income += e.amount;
    else expenditure += e.amount;
  }
  const sampled = Math.max(1, byWeek.size);
  const nets = [...byWeek.values()];
  const mean = nets.reduce((a, b) => a + b, 0) / sampled;
  const variance = nets.reduce((a, b) => a + (b - mean) ** 2, 0) / sampled;

  // A brand-new save has no banked weeks. Fall back to the structural run
  // rate rather than reporting an infinitely healthy club with no costs.
  if (!es.length) {
    const wkExp = structuralWeeklyExpenditure(s);
    const wkInc = structuralWeeklyIncome(s);
    return {
      weeksSampled: 0,
      income: int(wkInc * weeks),
      expenditure: int(wkExp * weeks),
      profit: int((wkInc - wkExp) * weeks),
      weeklyIncome: int(wkInc),
      weeklyExpenditure: int(wkExp),
      weeklyProfit: int(wkInc - wkExp),
      volatility: 0,
    };
  }

  return {
    weeksSampled: byWeek.size,
    income: int(income),
    expenditure: int(expenditure),
    profit: int(income - expenditure),
    weeklyIncome: int(income / sampled),
    weeklyExpenditure: int(expenditure / sampled),
    weeklyProfit: int((income - expenditure) / sampled),
    volatility: int(Math.sqrt(variance)),
  };
}

/** Run-rate weekly cost of simply existing: wages, staff, ops, maintenance. */
export function structuralWeeklyExpenditure(s: GameState): number {
  return int(
    playerWageBill(s) + staffWageBill(s) + weeklyOperatingCost(s) + weeklyMaintenanceCost(s),
  );
}

/** Run-rate weekly income excluding matchday spikes and one-off windfalls. */
export function structuralWeeklyIncome(s: GameState): number {
  return int(commercialWeeklyIncome(s) + leagueDistributionWeekly(s));
}

/* =========================================================================
   2. Commitments already made — money that is morally spent
========================================================================= */

/** Unpaid instalments on every live capital project, £. */
export function capitalCommitments(s: GameState): number {
  return int(
    activeProjects(s).reduce(
      (t, p) => t + p.paymentSchedule.filter((x) => !x.paid).reduce((a, x) => a + x.amount, 0),
      0,
    ),
  );
}

/** Unpaid instalments falling due inside `weeks`, £. */
export function capitalCommitmentsWithin(s: GameState, weeks: number): number {
  const now = absoluteWeek(s.season, s.week);
  return int(
    activeProjects(s).reduce(
      (t, p) =>
        t +
        p.paymentSchedule
          .filter((x) => !x.paid && x.dueAbsoluteWeek <= now + weeks)
          .reduce((a, x) => a + x.amount, 0),
      0,
    ),
  );
}

/** Total wages the club is contractually obliged to pay over `weeks`. */
export function committedWages(s: GameState, weeks = 52): number {
  const now = absoluteWeek(s.season, s.week);
  let total = 0;
  for (const c of s.football?.contracts ?? []) {
    if (!isUserClubReference(s, c.clubId) || c.status !== "Active") continue;
    const expiry = absoluteWeek(c.expirySeason, c.expiryWeek);
    const left = clamp(expiry - now, 0, weeks);
    total += c.weeklyWage * left;
  }
  total += staffWageBill(s) * weeks; // staff run on rolling terms
  return int(total);
}

/**
 * Share of the wage bill expiring inside a season. High = the squad could
 * walk; low = the club is locked into its cost base.
 */
export function contractExposure(s: GameState): number {
  const now = absoluteWeek(s.season, s.week);
  let expiring = 0;
  let total = 0;
  for (const c of s.football?.contracts ?? []) {
    if (!isUserClubReference(s, c.clubId) || c.status !== "Active") continue;
    total += c.weeklyWage;
    if (absoluteWeek(c.expirySeason, c.expiryWeek) - now <= 46) expiring += c.weeklyWage;
  }
  return total > 0 ? clamp(int((expiring / total) * 100), 0, 100) : 0;
}

/** Largest single commercial contract as a share of commercial income, %. */
export function commercialConcentration(s: GameState): number {
  const cs = activeContracts(s);
  const total = cs.reduce((a, c) => a + c.weeklyPayment, 0);
  if (total <= 0) return 0;
  const biggest = cs.reduce((a, c) => Math.max(a, c.weeklyPayment), 0);
  return clamp(int((biggest / total) * 100), 0, 100);
}

/* =========================================================================
   3. Recommended reserve
   -------------------------------------------------------------------------
   Not a threshold to punish. It is what a sensible finance director would
   want in the bank given THIS club's cost base, commitments and exposure.
========================================================================= */

export interface ReservePicture {
  cash: number;
  recommended: number;
  /** cash − recommended, clamped at 0. */
  excess: number;
  /** recommended − cash, clamped at 0. */
  deficit: number;
  /** Weeks of operating cover the current cash provides. */
  coverWeeks: number;
  coverMonths: number;
  /** Weeks of cover the reserve is sized for. */
  targetCoverWeeks: number;
  /** Cash genuinely free to deploy after reserve and commitments. */
  strategicCapital: number;
}

export function recommendedReserve(s: GameState): number {
  const op = operatingPicture(s);
  const weekly = Math.max(1, Math.max(op.weeklyExpenditure, structuralWeeklyExpenditure(s)));

  // Base cover: a lower-division club can run on a few months, a bigger
  // operation carries more fixed cost and needs more headroom.
  const tier = leagueTierOf(s);
  let coverWeeks = 12 + (tier === 1 ? 4 : 0);

  // Volatile revenue means a bigger buffer.
  coverWeeks += clamp((op.volatility / weekly) * 4, 0, 4);

  // A squad that can all leave at once is a re-signing bill waiting to land.
  coverWeeks += clamp(contractExposure(s) / 25, 0, 4);

  // One sponsor carrying the club is a risk the FD prices in.
  coverWeeks += commercialConcentration(s) > 55 ? 2 : 0;

  const base = weekly * coverWeeks;
  // Capital already promised to builders is not a reserve, so the reserve
  // has to cover the next six months of instalments on top.
  const capital = capitalCommitmentsWithin(s, 26);
  return int(base + capital);
}

export function reservePicture(s: GameState): ReservePicture {
  const cash = int(s.cash);
  const recommended = recommendedReserve(s);
  const op = operatingPicture(s);
  const weekly = Math.max(1, Math.max(op.weeklyExpenditure, structuralWeeklyExpenditure(s)));
  const commitments = capitalCommitments(s);
  return {
    cash,
    recommended,
    excess: Math.max(0, cash - recommended),
    deficit: Math.max(0, recommended - cash),
    coverWeeks: Math.round((cash / weekly) * 10) / 10,
    coverMonths: Math.round((cash / weekly / FINANCE_PERIOD_WEEKS) * 10) / 10,
    targetCoverWeeks: Math.round((recommended / weekly) * 10) / 10,
    strategicCapital: Math.max(
      0,
      cash - recommended - Math.max(0, commitments - capitalCommitmentsWithin(s, 26)),
    ),
  };
}

/* =========================================================================
   4. Where the club is being neglected
   -------------------------------------------------------------------------
   Each "need" is 0..1. They are read by the directors, by the reinvestment
   model and by the Inbox — one definition, no competing opinions.
========================================================================= */

export interface NeedPicture {
  infrastructure: number;
  squad: number;
  supporters: number;
  commercial: number;
  /** Worst single need, used for headline messaging. */
  worst: { area: keyof Omit<NeedPicture, "worst" | "overall">; value: number };
  overall: number;
}

const scoreOfAsset = (s: GameState, id: string): number => {
  const a = assetById(s, id);
  if (!a) return 50;
  return clamp(a.qualityRating, 0, 100);
};

/** How far the physical club has been let go. */
export function infrastructureNeed(s: GameState): number {
  const all = infraAssets(s);
  if (!all.length) return 0;
  const avg = all.reduce((t, a) => t + a.condition, 0) / all.length;
  const worst = all.reduce((m, a) => Math.min(m, a.condition), 100);
  // Average matters, but one crumbling asset is a story on its own.
  return clamp01(((100 - avg) * 0.6 + (100 - worst) * 0.4) / 100);
}

/** How far the squad sits below what this division expects of the club. */
export function squadNeed(s: GameState): number {
  const squad = squadOf(s, userClubReference(s));
  if (!squad.length) return 1;
  const ours = squad.reduce((t, p) => t + p.currentAbility, 0) / squad.length;
  const league = s.leagues?.find((l) => l.id === s.playerLeagueId);
  const rivals = (league?.clubIds ?? []).filter((club: string) => !isUserClubReference(s, club));
  if (!rivals.length) return clamp01((60 - ours) / 25);
  const par =
    rivals.reduce((a: number, c: string) => a + clubStrengthFor(s, c, s.season), 0) / rivals.length;
  // clubStrength and player ability share a 0-100 scale by construction.
  return clamp01((par - ours) / 20);
}

/** Visible, supporter-facing neglect: stands, toilets, fan zone, access. */
export function supporterNeed(s: GameState): number {
  const st = stands(s);
  const standCond = st.length ? st.reduce((t, a) => t + a.condition, 0) / st.length : 100;
  const sanitary = scoreOfAsset(s, "sanitary");
  const fanZone = scoreOfAsset(s, "fanZone");
  const parking = scoreOfAsset(s, "parking");
  const facilities =
    (100 - standCond) * 0.45 +
    (100 - sanitary) * 0.25 +
    (100 - fanZone) * 0.15 +
    (100 - parking) * 0.15;
  const mood = clamp(60 - (s.fanHappiness ?? 60), 0, 60) / 60;
  const capacity = capacityPressure(s) / 100;
  return clamp01((facilities / 100) * 0.55 + mood * 0.25 + capacity * 0.2);
}

/** Untapped revenue-generating capacity: shop, hospitality, offices. */
export function commercialNeed(s: GameState): number {
  const shop = scoreOfAsset(s, "shop");
  const hosp = scoreOfAsset(s, "hospitality");
  const off = scoreOfAsset(s, "offices");
  const conc = scoreOfAsset(s, "concessions");
  const gap = (100 - shop) * 0.3 + (100 - hosp) * 0.3 + (100 - off) * 0.2 + (100 - conc) * 0.2;
  // A bigger club is expected to monetise more, so the same shop is a
  // bigger failing at the top of the pyramid.
  const ambition = leagueTierOf(s) === 1 ? 1.15 : 1;
  return clamp01((gap / 100) * ambition);
}

export function needs(s: GameState): NeedPicture {
  const infrastructure = infrastructureNeed(s);
  const squad = squadNeed(s);
  const supporters = supporterNeed(s);
  const commercial = commercialNeed(s);
  const entries: [keyof Omit<NeedPicture, "worst" | "overall">, number][] = [
    ["infrastructure", infrastructure],
    ["squad", squad],
    ["supporters", supporters],
    ["commercial", commercial],
  ];
  const worst = entries.reduce((m, e) => (e[1] > m[1] ? e : m), entries[0]);
  return {
    infrastructure,
    squad,
    supporters,
    commercial,
    worst: { area: worst[0], value: Math.round(worst[1] * 100) / 100 },
    overall:
      Math.round(
        (infrastructure * 0.3 + squad * 0.3 + supporters * 0.25 + commercial * 0.15) * 100,
      ) / 100,
  };
}

/* =========================================================================
   5. Stadium capacity pressure
========================================================================= */

export interface CapacityPicture {
  usableCapacity: number;
  averageAttendance: number;
  occupancy: number;
  sellOutRate: number;
  pressure: number;
}

export function capacityPicture(s: GameState): CapacityPicture {
  const usable = stands(s).reduce((t, a) => t + usableCapacityOf(s, a), 0);
  // Attendance is owned by the finance ledger (gate receipts carry it as
  // metadata); we never keep a second copy of it.
  const gates = (s.financeLedger ?? [])
    .filter(
      (e) =>
        e.category === "Matchday" && e.subcategory === "Ticket sales" && e.metadata?.home === true,
    )
    .slice(-19);
  const atts = gates.map((e) => Number(e.metadata?.attendance ?? 0)).filter((n) => n > 0);
  const avg = atts.length ? atts.reduce((a, b) => a + b, 0) / atts.length : 0;
  const occupancy = usable > 0 ? clamp01(avg / usable) : 0;
  const sellOuts = usable > 0 ? atts.filter((a) => a >= usable * 0.97).length : 0;
  const sellOutRate = atts.length ? sellOuts / atts.length : 0;
  // Selling out repeatedly is the signal; high occupancy alone is healthy.
  const pressure = clamp(int(clamp01((occupancy - 0.82) / 0.18) * 60 + sellOutRate * 40), 0, 100);
  return {
    usableCapacity: usable,
    averageAttendance: int(avg),
    occupancy: Math.round(occupancy * 100) / 100,
    sellOutRate: Math.round(sellOutRate * 100) / 100,
    pressure,
  };
}

export const capacityPressure = (s: GameState): number => capacityPicture(s).pressure;

/* =========================================================================
   6. Reinvestment pressure
   -------------------------------------------------------------------------
   Deliberately NOT `cash > X`. Pressure only exists where means and need
   coincide: £8m against £7m of commitments is not spare money, and £8m
   spare at a club with nothing wrong with it is only mild pressure.
========================================================================= */

export interface ReinvestmentPressure {
  /** 0-100 overall political pressure to deploy capital. */
  score: number;
  /** 0-1: how much genuinely deployable capital exists. */
  means: number;
  /** 0-1: how much the club needs something. */
  need: number;
  /** Multiplier from how long the money has sat there. */
  patience: number;
  strategicCapital: number;
  byArea: { infrastructure: number; squad: number; supporters: number; commercial: number };
  headline: string;
}

export function reinvestmentPressure(s: GameState): ReinvestmentPressure {
  const res = reservePicture(s);
  const n = needs(s);
  const op = operatingPicture(s);
  const weekly = Math.max(1, Math.max(op.weeklyExpenditure, structuralWeeklyExpenditure(s)));

  // Means: half a season of operating cost sitting spare = full means.
  const means = clamp01(res.strategicCapital / (weekly * 23));

  // Idle money becomes a talking point over time, but the effect saturates:
  // it is a nudge, not a runaway clock.
  const weeksIdle = s.sustainability?.excessWeeks ?? 0;
  const patience = clamp(0.6 + weeksIdle / 90, 0.6, 1.25);

  // A club that just went up is expected to back it up.
  const promoted =
    (s.clubRecords?.[userClubReference(s)]?.promotions ?? 0) > 0 &&
    (s.seasonHistory ?? []).some(
      (h) =>
        h.season === s.season - 1 && h.promoted?.some((club) => isUserClubReference(s, club)),
    );
  const ambition = promoted ? 1.15 : 1;

  const area = (need: number) => clamp(int(100 * means * need * patience * ambition), 0, 100);

  const byArea = {
    infrastructure: area(n.infrastructure),
    squad: area(n.squad),
    supporters: area(n.supporters),
    commercial: area(n.commercial),
  };

  const score = clamp(int(100 * means * n.overall * patience * ambition), 0, 100);

  const headline =
    score < 15
      ? "No pressure to spend — the club's means and needs are in balance."
      : score < 40
        ? `Some spare capital and a case for ${labelFor(n.worst.area)} work.`
        : score < 70
          ? `The Board expects reinvestment, particularly in ${labelFor(n.worst.area)}.`
          : `Serious pressure: money is sitting idle while ${labelFor(n.worst.area)} is being neglected.`;

  return {
    score,
    means: Math.round(means * 100) / 100,
    need: n.overall,
    patience: Math.round(patience * 100) / 100,
    strategicCapital: res.strategicCapital,
    byArea,
    headline,
  };
}

function labelFor(area: string): string {
  return area === "infrastructure"
    ? "the facilities"
    : area === "squad"
      ? "the squad"
      : area === "supporters"
        ? "supporter facilities"
        : "commercial development";
}

/* =========================================================================
   7. Financial health
========================================================================= */

export function wageToRevenue(s: GameState): number {
  const op = operatingPicture(s);
  const income = Math.max(1, op.weeklyIncome || structuralWeeklyIncome(s));
  return clamp(int(((userWageBill(s) + staffWageBill(s)) / income) * 100), 0, 400);
}

export function staffCostRatio(s: GameState): number {
  const op = operatingPicture(s);
  const income = Math.max(1, op.weeklyIncome || structuralWeeklyIncome(s));
  return clamp(int((staffWageBill(s) / income) * 100), 0, 300);
}

export function infrastructureCostRatio(s: GameState): number {
  const op = operatingPicture(s);
  const income = Math.max(1, op.weeklyIncome || structuralWeeklyIncome(s));
  return clamp(int(((weeklyOperatingCost(s) + weeklyMaintenanceCost(s)) / income) * 100), 0, 300);
}

export type FinancialTrajectory = "improving" | "steady" | "declining";

export function financialTrajectory(s: GameState): FinancialTrajectory {
  const recent = operatingPicture(s, TRAILING_WEEKS);
  const older = operatingPicture(s, TRAILING_WEEKS * 2);
  // The wide window contains the narrow one, so compare weekly run rates.
  const delta = recent.weeklyProfit - older.weeklyProfit;
  const scale = Math.max(1, Math.abs(older.weeklyProfit) * 0.1, older.weeklyExpenditure * 0.02);
  if (delta > scale) return "improving";
  if (delta < -scale) return "declining";
  return "steady";
}

export interface HealthPicture {
  state: FinancialHealthState;
  label: string;
  summary: string;
  coverWeeks: number;
  coverMonths: number;
  wageRatio: number;
  operatingWeeklyProfit: number;
  trajectory: FinancialTrajectory;
}

export function financialHealth(s: GameState): HealthPicture {
  const res = reservePicture(s);
  const op = operatingPicture(s);
  const wr = wageToRevenue(s);
  const traj = financialTrajectory(s);

  // Cover is the spine of the rating; trading result and wage load bend it.
  let score = clamp(res.coverWeeks / res.targetCoverWeeks, 0, 2) * 50; // 0-100
  score += op.weeklyProfit >= 0 ? 12 : -18;
  score += wr > 85 ? -18 : wr > 65 ? -8 : wr < 45 ? 6 : 0;
  score += traj === "declining" ? -8 : traj === "improving" ? 4 : 0;
  score -= capitalCommitments(s) > Math.max(1, res.cash) ? 15 : 0;

  const state: FinancialHealthState =
    score >= 92
      ? "secure"
      : score >= 68
        ? "healthy"
        : score >= 46
          ? "tight"
          : score >= 24
            ? "stressed"
            : "critical";

  const label =
    state === "secure"
      ? "Secure"
      : state === "healthy"
        ? "Healthy"
        : state === "tight"
          ? "Tight"
          : state === "stressed"
            ? "Stressed"
            : "Critical";

  const cover = `${res.coverMonths.toFixed(1)} months operating cover`;
  const summary =
    state === "critical"
      ? `Critical — ${cover}. The club cannot meet its commitments for long.`
      : state === "stressed"
        ? `Stressed — wage and running commitments are high relative to recurring revenue (${cover}).`
        : state === "tight"
          ? `Tight — ${cover}. There is little room for a bad run of results.`
          : state === "healthy"
            ? `Healthy — ${cover}.`
            : `Secure — ${cover}, and trading comfortably.`;

  return {
    state,
    label,
    summary,
    coverWeeks: res.coverWeeks,
    coverMonths: res.coverMonths,
    wageRatio: wr,
    operatingWeeklyProfit: op.weeklyProfit,
    trajectory: traj,
  };
}

/**
 * Future hook. Administration / ownership intervention is deliberately NOT
 * implemented in this milestone; this predicate is the single place a later
 * milestone should read to decide that the club has run out of road.
 */
export function insolvencyRisk(s: GameState): boolean {
  const h = financialHealth(s);
  return h.state === "critical" && s.cash < 0;
}

/* =========================================================================
   8. Director stances on capital allocation
   -------------------------------------------------------------------------
   Directors are supposed to disagree. The Finance Director being delighted
   with £12m in the bank while the Supporters' Director is furious about the
   East Stand is the point of the system, not a bug in it.
========================================================================= */

export interface DirectorStance {
  role: DirectorRole;
  /** -100 (wants restraint) .. +100 (wants investment now). */
  stance: number;
  /** What this director would spend on, if anything. */
  wants: CommitmentCategory | null;
  note: string;
}

export function directorStance(s: GameState, role: DirectorRole): DirectorStance {
  const res = reservePicture(s);
  const p = reinvestmentPressure(s);
  const h = financialHealth(s);
  const n = needs(s);
  const covered = res.deficit === 0;

  const mk = (stance: number, wants: CommitmentCategory | null, note: string): DirectorStance => ({
    role,
    stance: clamp(int(stance), -100, 100),
    wants,
    note,
  });

  switch (role) {
    case "Finance Director": {
      // Rewards reserves and positive trading; resists spending the club
      // cannot fund. Not a blanket opponent of investment: with deep cover
      // and healthy trading he will concede the case for it.
      const reserveComfort = clamp((res.cash / Math.max(1, res.recommended)) * 50 - 50, -60, 60);
      const tradingComfort = h.operatingWeeklyProfit >= 0 ? 15 : -25;
      const wageStrain = h.wageRatio > 80 ? -20 : h.wageRatio < 50 ? 8 : 0;
      // Only supports deployment once cover is comfortably beyond target.
      const willingness =
        covered && res.coverWeeks > res.targetCoverWeeks * 1.6
          ? clamp(p.score * 0.4, 0, 35)
          : -clamp((res.deficit / Math.max(1, res.recommended)) * 60, 0, 60);
      const stance =
        willingness - clamp(reserveComfort * 0.25, -15, 15) + (tradingComfort + wageStrain) * 0.3;
      return mk(
        stance,
        covered ? "financial" : "financial",
        covered
          ? `Reserves cover ${res.coverMonths.toFixed(1)} months. ${stance > 10 ? "There is room to invest, carefully." : "I would protect the position."}`
          : `We are ${Math.round(res.deficit / 1000)}k short of a sensible reserve. Now is not the time to spend.`,
      );
    }
    case "Football Director": {
      const stance = p.byArea.squad * 0.8 + n.squad * 40 - (covered ? 0 : 25);
      return mk(
        stance,
        n.squad > n.infrastructure ? "football" : "infrastructure",
        n.squad > 0.4
          ? "We are behind this division on the pitch and the money is sitting in the bank."
          : "The squad is competitive for now, but standing still is a decision too.",
      );
    }
    case "Commercial Director": {
      const stance =
        p.byArea.commercial * 0.9 +
        (res.excess > 0 ? 15 : -10) +
        (commercialConcentration(s) > 55 ? 10 : 0);
      return mk(
        stance,
        "commercial",
        n.commercial > 0.4
          ? "Our retail and hospitality are leaving money on the table every matchday."
          : "The commercial operation is holding up; I'd still like room to grow it.",
      );
    }
    case "Supporters' Director": {
      // Especially sensitive to visible neglect alongside big reserves.
      const optics = res.excess > 0 && n.supporters > 0.35 ? 25 : 0;
      const stance =
        p.byArea.supporters * 0.9 + optics + clamp(40 - (s.fanHappiness ?? 60), -10, 30);
      return mk(
        stance,
        "supporters",
        n.supporters > 0.4
          ? "Supporters can see the balance sheet and they can see the state of the ground."
          : "The ground is in reasonable order and ticket prices are bearable.",
      );
    }
    default: {
      // Chairman: balances growth, ambition, security and reputation.
      const stance =
        p.score * 0.5 -
        (covered ? 0 : 30) +
        (clubReputation(s, userClubReference(s)) < 45 ? 10 : 0);
      return mk(
        stance,
        n.worst.area === "squad"
          ? "football"
          : n.worst.area === "supporters"
            ? "supporters"
            : n.worst.area === "commercial"
              ? "commercial"
              : "infrastructure",
        covered
          ? "We have to grow the club without gambling it."
          : "Security first. Ambition follows solvency.",
      );
    }
  }
}

export function boardStances(s: GameState): DirectorStance[] {
  return (s.board?.directors ?? []).map((d) => directorStance(s, d.role));
}

/** True when the board genuinely splits on what to do with the money. */
export function boardDisagrees(s: GameState): boolean {
  const st = boardStances(s).map((x) => x.stance);
  if (st.length < 2) return false;
  return Math.max(...st) - Math.min(...st) >= 40;
}

/* =========================================================================
   9. Strategic commitments
   -------------------------------------------------------------------------
   A promise, not a quest. It records what the chairman told the Board, and
   the Board judges it once. It never reserves, spends or refunds cash.
========================================================================= */

const CATEGORY_OWNER: Record<CommitmentCategory, DirectorRole> = {
  football: "Football Director",
  infrastructure: "Chairman",
  commercial: "Commercial Director",
  supporters: "Supporters' Director",
  financial: "Finance Director",
};

const CATEGORY_LABEL: Record<CommitmentCategory, string> = {
  football: "squad investment",
  infrastructure: "infrastructure investment",
  commercial: "commercial development",
  supporters: "supporter facilities",
  financial: "financial stability",
};

/**
 * Spend measured against a commitment category, £, cumulative over the save.
 * Derived from the canonical ledger — commitments never keep their own tally.
 */
export function categorySpendToDate(s: GameState, category: CommitmentCategory): number {
  const entries = s.financeLedger ?? [];
  const match = (c: string, sub: string): boolean => {
    switch (category) {
      case "football":
        return c === "Transfers" || (c === "Wages" && /player/i.test(sub));
      case "infrastructure":
      case "supporters":
        return c === "Facilities" || c === "Capital";
      case "commercial":
        return c === "Capital" || c === "Operations";
      case "financial":
        return false;
    }
  };
  const archived = archivedBucketSum(
    s,
    (b) => b.direction === "expense" && match(b.category, b.subcategory),
  );
  return int(
    archived +
      entries
        .filter((e) => e.direction === "expense" && match(e.category, e.subcategory))
        .reduce((a, e) => a + e.amount, 0),
  );
}

export function openCommitments(s: GameState): StrategicCommitment[] {
  return (s.sustainability?.commitments ?? []).filter((c) => c.status === "open");
}

export function commitmentProgress(s: GameState, c: StrategicCommitment): number {
  if (c.targetInvestment <= 0) return c.status === "fulfilled" ? 1 : 0;
  const spent = categorySpendToDate(s, c.category) - c.baseline;
  return clamp01(spent / c.targetInvestment);
}

/**
 * Record a promise. In place, exactly-once per (category, week) so a replayed
 * inbox choice cannot stack up duplicate promises.
 */
export function createCommitmentInPlace(
  s: GameState,
  category: CommitmentCategory,
  weeks: number,
  targetInvestment: number,
  description?: string,
): StrategicCommitment | null {
  ensureSustainability(s);
  const now = absoluteWeek(s.season, s.week);
  const st = s.sustainability;
  const dup = st.commitments.find((c) => c.category === category && c.createdAbsoluteWeek === now);
  if (dup) return dup;
  const c: StrategicCommitment = {
    id: `commit-${st.nextCommitmentId++}`,
    category,
    description: description ?? `Chairman committed to ${CATEGORY_LABEL[category]}.`,
    createdAbsoluteWeek: now,
    deadlineAbsoluteWeek: now + Math.max(1, int(weeks)),
    targetInvestment: Math.max(0, int(targetInvestment)),
    baseline: categorySpendToDate(s, category),
    owningDirectorRole: CATEGORY_OWNER[category],
    status: "open",
    resolvedAbsoluteWeek: null,
    settled: false,
  };
  st.commitments.push(c);
  return c;
}

export interface CommitmentSettlement {
  commitment: StrategicCommitment;
  outcome: "fulfilled" | "failed";
  confidenceDelta: number;
  fanDelta: number;
  reputationDelta: number;
}

/**
 * Settle every commitment that has been delivered or has run out of time.
 * Applies director confidence, fan feeling and reputation consequences
 * EXACTLY ONCE, guarded by `settled`, so a reload or a replayed week cannot
 * apply them twice. Never touches cash.
 */
export function settleCommitmentsInPlace(s: GameState): CommitmentSettlement[] {
  ensureSustainability(s);
  const now = absoluteWeek(s.season, s.week);
  const out: CommitmentSettlement[] = [];

  for (const c of s.sustainability.commitments) {
    if (c.status !== "open" || c.settled) continue;
    const progress = commitmentProgress(s, c);
    const delivered = c.targetInvestment > 0 && progress >= 1;
    const expired = now >= c.deadlineAbsoluteWeek;
    if (!delivered && !expired) continue;

    const outcome: "fulfilled" | "failed" = delivered ? "fulfilled" : "failed";
    // Repeated empty promises cost more than the first one.
    const priorFailures = s.sustainability.history.filter(
      (h) => h.outcome === "failed" && h.category === c.category,
    ).length;
    const confidenceDelta = outcome === "fulfilled" ? 4 : -(3 + Math.min(4, priorFailures));
    const fanDelta =
      c.category === "supporters"
        ? outcome === "fulfilled"
          ? 3
          : -3
        : outcome === "fulfilled"
          ? 1
          : -1;
    const reputationDelta = outcome === "failed" && priorFailures >= 1 ? -1 : 0;

    c.status = outcome;
    c.settled = true;
    c.resolvedAbsoluteWeek = now;
    s.sustainability.history.push({
      id: c.id,
      category: c.category,
      outcome,
      absoluteWeek: now,
      note:
        outcome === "fulfilled"
          ? `Delivered on ${CATEGORY_LABEL[c.category]}.`
          : `Promised ${CATEGORY_LABEL[c.category]} and did not deliver.`,
    });

    // Consequences: political and emotional only. No cash movement here.
    const owner = (s.board?.directors ?? []).find((d) => d.role === c.owningDirectorRole);
    if (owner) owner.confidence = clamp(owner.confidence + confidenceDelta, 0, 100);
    s.fanHappiness = clamp((s.fanHappiness ?? 60) + fanDelta, 0, 100);
    if (reputationDelta) s.reputation = clamp((s.reputation ?? 50) + reputationDelta, 0, 100);

    out.push({ commitment: c, outcome, confidenceDelta, fanDelta, reputationDelta });
  }
  return out;
}

/* =========================================================================
   10. Weekly tick
   -------------------------------------------------------------------------
   Idempotent by absolute week. Ages the excess-cash clock and settles
   commitments. Deliberately posts nothing to the ledger.
========================================================================= */

export function runSustainabilityWeek(s: GameState): void {
  ensureSustainability(s);
  const now = absoluteWeek(s.season, s.week);
  if (s.sustainability.lastTickAbsoluteWeek >= now) return;
  s.sustainability.lastTickAbsoluteWeek = now;

  const res = reservePicture(s);
  if (res.excess > 0) {
    s.sustainability.excessWeeks += 1;
    s.sustainability.peakExcessWeeks = Math.max(
      s.sustainability.peakExcessWeeks,
      s.sustainability.excessWeeks,
    );
  } else {
    s.sustainability.excessWeeks = 0;
  }

  settleCommitmentsInPlace(s);
}

/* =========================================================================
   11. One snapshot for the UI and the Inbox
========================================================================= */

export interface SustainabilitySnapshot {
  health: HealthPicture;
  reserve: ReservePicture;
  operating: OperatingPicture;
  pressure: ReinvestmentPressure;
  needs: NeedPicture;
  capacity: CapacityPicture;
  wageToRevenue: number;
  staffCostRatio: number;
  infrastructureCostRatio: number;
  capitalCommitments: number;
  committedWages: number;
  contractExposure: number;
  commercialConcentration: number;
  stances: DirectorStance[];
  openCommitments: StrategicCommitment[];
  facilityModifiers: ReturnType<typeof facilityModifiers>;
}

export function sustainabilitySnapshot(s: GameState): SustainabilitySnapshot {
  return {
    health: financialHealth(s),
    reserve: reservePicture(s),
    operating: operatingPicture(s),
    pressure: reinvestmentPressure(s),
    needs: needs(s),
    capacity: capacityPicture(s),
    wageToRevenue: wageToRevenue(s),
    staffCostRatio: staffCostRatio(s),
    infrastructureCostRatio: infrastructureCostRatio(s),
    capitalCommitments: capitalCommitments(s),
    committedWages: committedWages(s),
    contractExposure: contractExposure(s),
    commercialConcentration: commercialConcentration(s),
    stances: boardStances(s),
    openCommitments: openCommitments(s),
    facilityModifiers: facilityModifiers(s),
  };
}

/* =========================================================================
   12. Tier movement — promotion / relegation shock
   -------------------------------------------------------------------------
   Promotion and relegation are NOT cash events. They change the club's
   operating environment: distributions, sponsor appetite, attendance
   potential and wage expectations all move through their own canonical
   systems. This selector only tells the rest of the game which way the club
   just moved, so the Board and Inbox can say something about it once.
========================================================================= */

export type TierMovement = "promoted" | "relegated" | null;

/** What happened to the club at the end of `season - 1`. Pure lookup. */
export function tierMovement(s: GameState, season = s.season): TierMovement {
  const prev = (s.seasonHistory ?? []).filter((h) => h.season === season - 1);
  for (const h of prev) {
    if (h.promoted?.some((club) => isUserClubReference(s, club))) return "promoted";
    if (h.relegated?.some((club) => isUserClubReference(s, club))) return "relegated";
  }
  return null;
}

export interface TierShockPicture {
  movement: TierMovement;
  tier: number;
  /** Structural weekly income at the new tier, £. */
  weeklyIncome: number;
  /** Weekly wage + running cost the club carries into the new tier, £. */
  weeklyCost: number;
  committedWages: number;
  reserve: ReservePicture;
  health: HealthPicture;
  needs: NeedPicture;
  summary: string;
}

/**
 * One derived picture of what a division change means. Reads canonical
 * numbers only; changes nothing.
 */
export function tierShock(s: GameState): TierShockPicture {
  const movement = tierMovement(s);
  const reserve = reservePicture(s);
  const health = financialHealth(s);
  const n = needs(s);
  const weeklyIncome = structuralWeeklyIncome(s);
  const weeklyCost = structuralWeeklyExpenditure(s);
  const summary =
    movement === "promoted"
      ? "Promotion changes the club's operating environment. Revenue potential has increased, but squad and infrastructure requirements are now significantly higher."
      : movement === "relegated"
        ? "Relegation cuts the club's revenue potential immediately. Existing wages, maintenance and project commitments do not fall with it."
        : "The club remains in the same division.";
  return {
    movement,
    tier: leagueTierOf(s),
    weeklyIncome,
    weeklyCost,
    committedWages: committedWages(s, 46),
    reserve,
    health,
    needs: n,
    summary,
  };
}

/* =========================================================================
   13. Director reaction to the strategic picture
   -------------------------------------------------------------------------
   This is NOT a global confidence penalty. Each director reads the SAME
   canonical selectors through their own portfolio, so the Finance Director
   can be delighted in the same week the Supporters' Director is furious.
   Bounded, deterministic, and applied only inside a board review (which is
   itself guarded to run exactly once per window).
========================================================================= */

/** Hard bound on how far the strategic picture can move one director. */
export const SUSTAINABILITY_CONFIDENCE_BOUND = 6;

export function sustainabilityConfidenceAdjustment(s: GameState, role: DirectorRole): number {
  const res = reservePicture(s);
  const h = financialHealth(s);
  const p = reinvestmentPressure(s);
  const n = needs(s);
  const cap = capacityPicture(s);
  const B = SUSTAINABILITY_CONFIDENCE_BOUND;
  let v = 0;

  switch (role) {
    case "Finance Director": {
      // Rewards cover and control. Deliberately never penalises a club for
      // simply holding cash — that is the FD's own preference, not a failing.
      const coverRatio = res.targetCoverWeeks > 0 ? res.coverWeeks / res.targetCoverWeeks : 1;
      v += coverRatio >= 1.6 ? 4 : coverRatio >= 1 ? 2 : -clamp((1 - coverRatio) * 8, 0, 6);
      v += h.wageRatio > 85 ? -3 : h.wageRatio > 65 ? -1 : h.wageRatio < 50 ? 1 : 0;
      v += h.trajectory === "improving" ? 1 : h.trajectory === "declining" ? -1 : 0;
      v += capitalCommitments(s) > Math.max(1, res.cash) ? -3 : 0;
      break;
    }
    case "Football Director": {
      v -= (p.byArea.squad / 100) * 5;
      v -= n.squad > 0.5 ? 1 : 0;
      v += n.squad < 0.2 ? 2 : 0;
      v -= res.excess > 0 && n.squad > 0.4 ? 1 : 0;
      break;
    }
    case "Commercial Director": {
      v -= (p.byArea.commercial / 100) * 5;
      v += n.commercial < 0.25 ? 2 : 0;
      // Sell-outs the club cannot monetise are a commercial failing too.
      v -= cap.pressure > 60 && n.commercial > 0.4 ? 1 : 0;
      break;
    }
    case "Supporters' Director": {
      v -= (p.byArea.supporters / 100) * 5;
      v -= n.supporters > 0.6 ? 1 : 0;
      v += n.supporters < 0.25 ? 2 : 0;
      v -= cap.pressure > 60 ? 1 : 0;
      break;
    }
    default: {
      // Chairman balances security against visible ambition.
      v -= (p.score / 100) * 4;
      v += h.state === "secure" ? 2 : h.state === "healthy" ? 1 : h.state === "critical" ? -3 : 0;
      v += tierMovement(s) === "promoted" ? 1 : tierMovement(s) === "relegated" ? -1 : 0;
      break;
    }
  }
  return clamp(Math.round(v), -B, B);
}

/** Every director's strategic adjustment, for the UI and verification. */
export function boardSustainabilityAdjustments(s: GameState): Record<DirectorRole, number> {
  const out = {} as Record<DirectorRole, number>;
  for (const d of s.board?.directors ?? []) {
    out[d.role] = sustainabilityConfidenceAdjustment(s, d.role);
  }
  return out;
}

/* =========================================================================
   14. Staff wage pressure — DEFERRED HOOK
   -------------------------------------------------------------------------
   Staff currently run on rolling terms with no renewal negotiation, so there
   is no negotiation moment to attach growth pressure to. Rather than build a
   staff-contract subsystem inside a sustainability pass, this selector is the
   single place a future staff-renewal milestone should read. Nothing calls it
   to change money today, and nothing should until staff contracts exist.
========================================================================= */

export function staffWagePressureFactor(s: GameState): number {
  const tier = leagueTierOf(s);
  const rep = clubReputation(s, userClubReference(s));
  const move = tierMovement(s);
  const growth =
    1 +
    clamp((rep - 50) / 250, -0.2, 0.2) +
    (tier === 1 ? 0.08 : 0) +
    (move === "promoted" ? 0.06 : move === "relegated" ? -0.04 : 0);
  return Math.round(clamp(growth, 0.8, 1.4) * 100) / 100;
}
