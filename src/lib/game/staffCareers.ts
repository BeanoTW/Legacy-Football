import type { GameState, Staff, StaffRole, StaffStats } from "./types";
import { hashString, mulberry32 } from "./rng";
import { hasEntry, postEntry } from "./finance";
import { staffPoolFor } from "./staff";

const clamp = (n: number, lo = 20, hi = 95) => Math.max(lo, Math.min(hi, Math.round(n)));

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

function overallFor(role: StaffRole, stats: StaffStats): number {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(ROLE_WEIGHTS[role]) as [keyof StaffStats, number][]) {
    sum += stats[key] * w;
    weight += w;
  }
  return Math.round(sum / Math.max(1, weight));
}

function retirementChance(age: number): number {
  if (age < 63) return 0;
  if (age >= 69) return 1;
  return Math.min(0.72, 0.08 + (age - 63) * 0.11);
}

function careerDelta(age: number, rand01: () => number): number {
  const r = rand01();
  if (age <= 34) return r < 0.52 ? 1 : r < 0.58 ? 2 : r > 0.94 ? -1 : 0;
  if (age <= 49) return r < 0.2 ? 1 : r > 0.9 ? -1 : 0;
  if (age <= 57) return r < 0.1 ? 1 : r > 0.7 ? -1 : 0;
  if (age <= 62) return r > 0.45 ? -1 : 0;
  return r < 0.28 ? -2 : -1;
}

function evolveStaffMember(s: GameState, staff: Staff): { staff: Staff; retired: boolean } {
  const next = structuredClone(staff);
  next.age += 1;
  const rand = mulberry32(hashString(`staff-career|${s.saveSeed}|${s.season}|${staff.id}`));

  for (const key of Object.keys(next.stats) as (keyof StaffStats)[]) {
    next.stats[key] = clamp(next.stats[key] + careerDelta(next.age, rand), 25, 95);
  }
  next.rating = overallFor(next.role, next.stats);
  next.reputation = clamp(next.reputation + Math.sign(next.rating - staff.rating), 20, 95);

  return { staff: next, retired: rand() < retirementChance(next.age) };
}

function retirementMessage(s: GameState, staff: Staff): void {
  const eventKey = `staff-retirement:${staff.id}:s${s.season}`;
  if (s.inbox.some((i) => i.eventKey === eventKey)) return;
  s.inbox.push({
    id: `IN-${hashString(eventKey).toString(16)}`,
    generatorId: "staff-career",
    eventKey,
    sender: staff.name,
    department: "Club",
    category: "staff",
    subject: `${staff.name} retires`,
    body: `${staff.name}, your ${staff.role.toLowerCase()}, has retired from football at age ${staff.age}. The role is now vacant and the staff market has been refreshed for the new season.`,
    priority: staff.role === "Manager" ? "high" : "normal",
    week: s.week,
    season: s.season,
    status: "unread",
  });
}

export interface StaffRenewalResult {
  state: GameState;
  ok: boolean;
  reason?: string;
  bonus?: number;
}

/** Extend an existing staff contract with a small retention bonus. */
export function renewStaffContract(s: GameState, id: string, seasons = 2): StaffRenewalResult {
  const current = s.hiredStaff.find((st) => st.id === id);
  if (!current) return { state: s, ok: false, reason: "Staff member is no longer employed." };
  const years = Math.max(1, Math.min(4, Math.round(seasons)));
  const bonus = current.wage * 2;
  const dedupeKey = `staff-renew:${current.id}:s${s.season}:w${s.week}`;
  if (hasEntry(s, dedupeKey)) return { state: s, ok: true, bonus: 0 };
  if (s.cash < bonus)
    return { state: s, ok: false, reason: "Not enough cash for the renewal bonus." };

  const ns = structuredClone(s);
  const target = ns.hiredStaff.find((st) => st.id === id)!;
  target.contractWeeks = Math.max(target.contractWeeks, 0) + years * 52;
  postEntry(ns, {
    category: "Staff",
    subcategory: "Renewal bonus",
    description: `Contract renewal — ${target.name} (${target.role})`,
    amount: bonus,
    direction: "expense",
    sourceSystem: "staff",
    linkedEntityId: target.id,
    dedupeKey,
  });
  return { state: ns, ok: true, bonus };
}

/**
 * Annual staff-world step. Runs once after the season counter advances.
 * Hired staff age, develop/decline deterministically and may retire late in
 * their careers. The candidate market is regenerated for the new season.
 */
export function runStaffCareerRollover(s: GameState): void {
  const survivors: Staff[] = [];
  for (const current of s.hiredStaff ?? []) {
    const evolved = evolveStaffMember(s, current);
    if (evolved.retired) retirementMessage(s, evolved.staff);
    else survivors.push(evolved.staff);
  }
  s.hiredStaff = survivors;
  s.staffCandidates = staffPoolFor(s);
  s.staffMarketRefreshedWeek = s.week;
}
