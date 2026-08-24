/* Backroom staff — extracted from engine.ts in Phase 0c (verbatim bodies).
 *
 * Owns: staff generation, the candidate market, join terms, hiring and sacking.
 * Every random draw is supplied by the caller so the market is a pure function
 * of (saveSeed, season, week).
 */
import type { GameState, Staff, StaffRole, StaffStats } from "./types";
import { mulberry32, hashString } from "./rng";
import { facilityModifiers } from "./infrastructure";
import { postEntry } from "./finance";

/* ---------- Name pools ---------- */
const FIRST = [
  "J",
  "A",
  "M",
  "R",
  "T",
  "S",
  "D",
  "C",
  "L",
  "N",
  "P",
  "K",
  "B",
  "H",
  "O",
  "E",
  "G",
  "F",
  "W",
  "V",
];
const LAST = [
  "Cahill",
  "Potter",
  "Hughes",
  "Morris",
  "Ellis",
  "Brooks",
  "Reid",
  "Walsh",
  "Ward",
  "Kane",
  "Bailey",
  "Fraser",
  "Ainsley",
  "Palmer",
  "Foden",
  "Rice",
  "Saka",
  "Gordon",
  "Watkins",
  "Bowen",
  "Clarke",
  "Owen",
  "Sterling",
  "Grealish",
  "Maddison",
  "Toney",
  "Isak",
  "Nunes",
  "Fabian",
  "Onana",
];

export const STAFF_ROLES: StaffRole[] = [
  "Manager",
  "Assistant Manager",
  "Head Coach",
  "Goalkeeping Coach",
  "Fitness Coach",
  "Head of Youth",
  "Head of Transfers",
  "Chief Scout",
  "Scout",
  "Head Physio",
  "Sports Scientist",
];

// Which stats matter most for each role — used to weight overall rating & wage
const ROLE_WEIGHTS: Record<StaffRole, Partial<Record<keyof StaffStats, number>>> = {
  Manager: { tactics: 3, motivation: 2, attack: 1, defense: 1 },
  "Assistant Manager": { tactics: 2, motivation: 2, development: 1 },
  "Head Coach": { attack: 2, defense: 2, development: 2 },
  "Goalkeeping Coach": { defense: 3, development: 2 },
  "Fitness Coach": { medical: 2, development: 2 },
  "Head of Youth": { development: 3, scouting: 2 },
  "Head of Transfers": { negotiation: 3, scouting: 2 },
  "Chief Scout": { scouting: 3, negotiation: 1 },
  Scout: { scouting: 2 },
  "Head Physio": { medical: 3 },
  "Sports Scientist": { medical: 2, development: 2 },
};

// Base wage £/wk multiplier per role at rating 60
const ROLE_BASE_WAGE: Record<StaffRole, number> = {
  Manager: 8_500,
  "Assistant Manager": 4_200,
  "Head Coach": 3_600,
  "Goalkeeping Coach": 2_400,
  "Fitness Coach": 2_000,
  "Head of Youth": 2_800,
  "Head of Transfers": 4_500,
  "Chief Scout": 2_600,
  Scout: 1_100,
  "Head Physio": 2_100,
  "Sports Scientist": 2_300,
};

function makeStaffStats(
  role: StaffRole,
  base: number,
  rand01: () => number = Math.random,
): StaffStats {
  const rnd = (min: number, max: number) => min + rand01() * (max - min);
  const keys: (keyof StaffStats)[] = [
    "tactics",
    "attack",
    "defense",
    "development",
    "scouting",
    "negotiation",
    "medical",
    "motivation",
  ];
  const weights = ROLE_WEIGHTS[role];
  const stats = {} as StaffStats;
  for (const k of keys) {
    const boosted = weights[k] ? base + rnd(2, 10) * weights[k]! : base + rnd(-14, 6);
    stats[k] = Math.max(30, Math.min(95, Math.round(boosted)));
  }
  return stats;
}

function overallFor(role: StaffRole, stats: StaffStats): number {
  const weights = ROLE_WEIGHTS[role];
  let sum = 0,
    wsum = 0;
  for (const [k, w] of Object.entries(weights) as [keyof StaffStats, number][]) {
    sum += stats[k] * w;
    wsum += w;
  }
  return Math.round(sum / Math.max(1, wsum));
}

/**
 * Build one staff member. `rand01` supplies all randomness so the caller
 * controls reproducibility; it defaults to Math.random for ad-hoc use, but
 * every in-game path passes a seeded generator.
 */
export function makeStaff(
  role: StaffRole,
  quality = 60,
  rand01: () => number = Math.random,
): Staff {
  const rnd = (min: number, max: number) => min + rand01() * (max - min);
  const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
  const one = <T>(arr: T[]) => arr[rndInt(0, arr.length - 1)];

  const base = Math.max(35, Math.min(92, quality + rnd(-8, 10)));
  const stats = makeStaffStats(role, base, rand01);
  const rating = overallFor(role, stats);
  const wage = Math.round((ROLE_BASE_WAGE[role] * Math.pow(rating / 60, 2.4)) / 50) * 50;
  return {
    // Deterministic id: derived from the draw, never crypto.randomUUID, so a
    // replayed week produces an identical candidate list.
    id: `ST-${Math.floor(rand01() * 0xffffffff)
      .toString(16)
      .padStart(8, "0")}`,
    name: `${one(FIRST)}. ${one(LAST)}`,
    role,
    age: rndInt(28, 62),
    rating,
    stats,
    wage,
    contractWeeks: rndInt(38, 38 * 3),
    reputation: Math.max(20, Math.min(95, Math.round(rating + rnd(-8, 6)))),
  };
}

/**
 * The rolling staff market. Seeded from the save so refreshing the pool is a
 * pure function of (saveSeed, season, week) rather than wall-clock randomness.
 */
export function makeCandidatePool(rand01: () => number = Math.random): Staff[] {
  const pool: Staff[] = [];
  // Deep talent pool with wide variance — journeymen through elite.
  // Each role gets many candidates across the whole ability spectrum.
  const spec: [StaffRole, number][] = [
    ["Manager", 22],
    ["Assistant Manager", 18],
    ["Head Coach", 22],
    ["Goalkeeping Coach", 16],
    ["Fitness Coach", 16],
    ["Head of Youth", 18],
    ["Head of Transfers", 16],
    ["Chief Scout", 16],
    ["Scout", 36],
    ["Head Physio", 16],
    ["Sports Scientist", 16],
  ];
  for (const [role, n] of spec) {
    for (let i = 0; i < n; i++) {
      // Bottom-heavy across the full band: journeymen are plentiful, strong
      // specialists are scarce and elite candidates are genuine discoveries.
      const q = 35 + Math.round(Math.pow(rand01(), 1.85) * 57);
      pool.push(makeStaff(role, q, rand01));
    }
  }
  return pool;
}

/** Seeded refresh of the staff market for a given save + calendar slot. */
export function staffPoolFor(s: GameState): Staff[] {
  return makeCandidatePool(
    mulberry32(hashString(`staffmarket|${s.saveSeed}|${s.season}|${s.week}`)),
  );
}

/** Seeded opening market for a brand-new save. */
export function openingStaffPool(saveSeed: string): Staff[] {
  return makeCandidatePool(mulberry32(hashString(`staffmarket|${saveSeed}|1|1`)));
}

export const hiredStaffWagesWeekly = (s: GameState) =>
  (s.hiredStaff ?? []).reduce((a, st) => a + st.wage, 0);

/* ---------- Staff join terms ----------
 * Reputation gap between staff and club drives willingness.
 * - gap <= 5:  happy to join at listed wage
 * - gap 6-15: will join but demands a wage premium
 * - gap 16-25: will only entertain a big overpay
 * - gap > 25: refuses outright — club is too small
 */
export interface JoinTerms {
  willing: boolean;
  wageDemand: number; // £/wk they'll actually sign for
  signingBonus: number; // upfront cash
  premiumPct: number; // % over listed wage (0 = none)
  note: string;
}

export function staffJoinTerms(
  clubReputation: number,
  staff: Staff,
  /** Canonical infrastructure staffAttraction points (see facilityModifiers). */
  staffAttraction = 0,
): JoinTerms {
  // Facilities read as club standing to a prospective employee: capped so a
  // small club with a great training ground is still a small club.
  const effectiveRep = clubReputation + Math.max(-8, Math.min(8, staffAttraction));
  const gap = staff.reputation - effectiveRep;
  let premiumPct = 0;
  let willing = true;
  let note = "Happy to join";

  if (gap > 25) {
    willing = false;
    premiumPct = 1.5;
    note = "Won't consider a club this size";
  } else if (gap > 15) {
    premiumPct = 0.6 + (gap - 15) * 0.05;
    note = "Demands a huge overpay";
  } else if (gap > 5) {
    premiumPct = 0.15 + (gap - 5) * 0.03;
    note = "Wants a wage premium";
  } else if (gap < -10) {
    premiumPct = -0.05;
    note = "Keen — club is a step up";
  }

  const wageDemand = Math.max(200, Math.round((staff.wage * (1 + premiumPct)) / 50) * 50);
  const signingBonus = wageDemand * 2;
  return { willing, wageDemand, signingBonus, premiumPct, note };
}

export interface SpendResult {
  state: GameState;
  ok: boolean;
  reason?: string;
}

export function hireStaffMember(s: GameState, id: string): SpendResult {
  const cand = s.staffCandidates.find((c) => c.id === id);
  if (!cand) return { state: s, ok: false, reason: "Candidate no longer available" };
  if (s.hiredStaff.some((h) => h.role === cand.role)) {
    return { state: s, ok: false, reason: `You already employ a ${cand.role}. Sack them first.` };
  }
  const terms = staffJoinTerms(s.reputation, cand, facilityModifiers(s).staffAttraction);
  if (!terms.willing) {
    return { state: s, ok: false, reason: `${cand.name} won't join a club of this reputation.` };
  }
  if (s.cash < terms.signingBonus) {
    return { state: s, ok: false, reason: "Not enough cash for the signing bonus." };
  }
  const ns: GameState = structuredClone(s);
  ns.hiredStaff = [...ns.hiredStaff, { ...cand, wage: terms.wageDemand }];
  ns.staffCandidates = ns.staffCandidates.filter((c) => c.id !== id);
  postEntry(ns, {
    category: "Staff",
    subcategory: "Signing bonus",
    description: `Signing bonus — ${cand.name} (${cand.role})`,
    amount: terms.signingBonus,
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: cand.id,
    dedupeKey: `staff-hire:${cand.id}`,
  });
  return { state: ns, ok: true };
}

export function sackStaffMember(s: GameState, id: string): SpendResult {
  const st = s.hiredStaff.find((h) => h.id === id);
  if (!st) return { state: s, ok: false, reason: "Not on the payroll" };
  const severance = st.wage * Math.min(12, Math.max(1, st.contractWeeks));
  const ns: GameState = structuredClone(s);
  ns.hiredStaff = ns.hiredStaff.filter((h) => h.id !== id);
  postEntry(ns, {
    category: "Staff",
    subcategory: "Severance",
    description: `Severance — ${st.name} (${st.role})`,
    amount: severance,
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: st.id,
    dedupeKey: `staff-sack:${st.id}`,
  });
  return { state: ns, ok: true };
}

export function severanceFor(st: Staff): number {
  return st.wage * Math.min(12, Math.max(1, st.contractWeeks));
}
