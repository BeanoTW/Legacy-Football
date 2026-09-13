/* World/club housekeeping stage of the weekly tick — extracted from engine.ts.
 *
 * Sponsor and staff contract clocks, the ticket-price backlash, and the
 * pre-v3 legacy AI-result fallback. Nothing here posts to the finance ledger.
 */
import type { GameState, Staff } from "../types";
import { hasFullSchedule } from "../league";
import { avgTicketPrice } from "../sim";
import { hashString } from "../rng";
import { staffPoolFor } from "../staff";
import { ensureAttainableStaffMarket } from "../staffMarketAttainability";
import { phaseOf } from "../calendar";
import { isUserClubReference } from "../clubReference";

/* Legacy-only randomness. Used exclusively by the pre-v3 fallback below, which
   never runs for a schedule-backed save. */
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T>(arr: T[]) => arr[randInt(0, arr.length - 1)];

/**
 * Pre-v3 saves have no full division schedule, so the old "sprinkle four
 * random AI results" hack keeps their table moving. Schedule-backed saves
 * resolve every real fixture in resolveWeek() instead.
 */
export function tickLegacyAiResults(s: GameState): void {
  const inLeague = phaseOf(s.week) === "firstHalf" || phaseOf(s.week) === "secondHalf";
  if (!inLeague || hasFullSchedule(s)) return;
  const others = s.league.filter((r) => !isUserClubReference(s, r.team));
  for (let i = 0; i < 4; i++) {
    const a = pick(others), b = pick(others);
    if (a === b) continue;
    const ag = randInt(0, 3), bg = randInt(0, 3);
    a.p++; b.p++; a.gf += ag; a.ga += bg; b.gf += bg; b.ga += ag;
    if (ag > bg) { a.w++; a.pts += 3; b.l++; }
    else if (ag < bg) { b.w++; b.pts += 3; a.l++; }
    else { a.d++; b.d++; a.pts++; b.pts++; }
  }
}

function staffContractMessage(s: GameState, st: Staff, kind: "warning" | "expired"): void {
  const eventKey = `staff-contract-${kind}:${st.id}:s${s.season}`;
  if (s.inbox.some((i) => i.eventKey === eventKey)) return;
  const isManager = st.role === "Manager";
  s.inbox.push({
    id: `IN-${hashString(eventKey).toString(16)}`, generatorId: "staff-contract", eventKey,
    sender: "Club", department: "Club", category: "staff",
    subject: kind === "warning" ? `${st.name}'s contract is running down` : `${st.name} leaves the club`,
    body: kind === "warning"
      ? `${st.name} (${st.role}) has 12 weeks remaining on their contract. Renew it from Staff if you want them to stay.`
      : `${st.name}'s ${st.role.toLowerCase()} contract has expired. The role is now vacant and can be filled from the staff market.`,
    priority: isManager ? "high" : kind === "expired" ? "high" : "normal",
    week: s.week, season: s.season, status: "unread",
  });
}

/** Legacy sponsor clock, staff contract lifecycle + 4-weekly staff market refresh. */
export function tickContractsAndMarkets(s: GameState): void {
  for (const sp of s.sponsors) sp.weeksLeft = Math.max(0, sp.weeksLeft - 1);
  const retained: Staff[] = [];
  for (const st of s.hiredStaff) {
    st.contractWeeks = Math.max(0, st.contractWeeks - 1);
    if (st.contractWeeks === 12) staffContractMessage(s, st, "warning");
    if (st.contractWeeks === 0) { staffContractMessage(s, st, "expired"); continue; }
    retained.push(st);
  }
  s.hiredStaff = retained;
  if (s.week - (s.staffMarketRefreshedWeek ?? 0) >= 4) {
    s.staffCandidates = ensureAttainableStaffMarket(s, staffPoolFor(s));
    s.staffMarketRefreshedWeek = s.week;
  }
}

/** Ticket-price backlash against the club's reputation-driven market reference. */
export function tickTicketBacklash(s: GameState): void {
  const refPriceNow = 15 + s.reputation * 0.4;
  const avgPriceNow = avgTicketPrice(s);
  const overRatio = avgPriceNow / refPriceNow;
  if (overRatio > 1.25) {
    const excess = overRatio - 1.25;
    s.fanHappiness = Math.max(5, Math.round(s.fanHappiness - Math.min(6, excess * 12)));
    if (overRatio > 1.5) s.reputation = Math.max(20, s.reputation - Math.min(0.6, (overRatio - 1.5) * 0.8));
  } else if (overRatio < 0.75 && s.fanHappiness < 100) {
    s.fanHappiness = Math.min(100, s.fanHappiness + 1);
  }
}
