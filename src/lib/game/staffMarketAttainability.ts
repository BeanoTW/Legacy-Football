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

function calibrateReputationToClub(state: GameState, candidate: Staff): Staff {
  if (isWilling(state, candidate)) return candidate;

  // Ability and wage remain those of the generated journeyman. Reputation is
  // the market-facing quantity that determines whether the move is beneath
  // them, so lower only that until this locally sourced candidate is genuinely
  // attainable under the canonical join rules.
  for (let reputation = candidate.reputation - 1; reputation >= 20; reputation -= 1) {
    const calibrated = { ...candidate, reputation };
    if (isWilling(state, calibrated)) return calibrated;
  }
  return { ...candidate, reputation: 20 };
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
    while (willing < required) {
      // Low-reputation clubs should see believable journeymen rather than
      // synthetic stars. As the club grows, this band rises with it.
      const quality = Math.max(30, Math.min(68, Math.round(state.reputation + 8 + rand() * 12)));
      const candidate = calibrateReputationToClub(state, makeStaff(role, quality, rand));
      next.push(candidate);
      if (isWilling(state, candidate)) willing += 1;
    }
  }

  return next;
}
