import type { GameState, Staff, StaffRole } from "./types";
import { hashString, mulberry32 } from "./rng";
import { makeStaff, managerJoinTerms, staffJoinTermsForState } from "./staff";

const KEY_ROLES: StaffRole[] = ["Manager", "Head Coach"];
const MIN_ATTAINABLE: Record<StaffRole, number> = {
  Manager: 5,
  "Assistant Manager": 0,
  "Head Coach": 5,
  "Goalkeeping Coach": 0,
  "Fitness Coach": 0,
  "Head of Youth": 0,
  "Head of Transfers": 0,
  "Chief Scout": 0,
  Scout: 0,
  "Head Physio": 0,
  "Sports Scientist": 0,
};

function isWilling(state: GameState, staff: Staff): boolean {
  return staff.role === "Manager"
    ? managerJoinTerms(state, staff).willing
    : staffJoinTermsForState(state, staff).willing;
}

/**
 * Keeps the rolling world market broad, but guarantees that small clubs are
 * not accidentally left with no credible route to fill essential vacancies.
 * The additions are deterministic journeyman/local-level candidates; elite
 * candidates and the normal reputation refusal rules are untouched.
 */
export function ensureAttainableStaffMarket(state: GameState, market: Staff[]): Staff[] {
  const next = [...market];

  for (const role of KEY_ROLES) {
    const required = MIN_ATTAINABLE[role];
    let willing = next.filter((staff) => staff.role === role && isWilling(state, staff)).length;
    if (willing >= required) continue;

    const rand = mulberry32(
      hashString(`staff-attainable|${state.saveSeed}|${state.season}|${state.week}|${role}`),
    );
    let attempts = 0;
    while (willing < required && attempts < 80) {
      attempts += 1;
      // Low-reputation clubs should see believable journeymen rather than
      // synthetic stars. As the club grows, this band rises with it.
      const quality = Math.max(30, Math.min(68, Math.round(state.reputation + 12 + rand() * 16)));
      const candidate = makeStaff(role, quality, rand);
      if (!isWilling(state, candidate)) continue;
      next.push(candidate);
      willing += 1;
    }
  }

  return next;
}
