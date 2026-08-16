/* World/club housekeeping stage of the weekly tick — extracted from engine.ts.
 *
 * Sponsor and staff contract clocks, the ticket-price backlash, and the
 * pre-v3 legacy AI-result fallback. Nothing here posts to the finance ledger.
 */
import type { GameState } from "../types";
import { hasFullSchedule } from "../league";
import { avgTicketPrice } from "../sim";
import { staffPoolFor } from "../staff";
import { phaseOf } from "../calendar";

/* Legacy-only randomness. Used exclusively by the pre-v3 fallback below, which
   never runs for a schedule-backed save. */
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)];

/**
 * Pre-v3 saves have no full division schedule, so the old "sprinkle four
 * random AI results" hack keeps their table moving. Schedule-backed saves
 * resolve every real fixture in resolveWeek() instead.
 */
export function tickLegacyAiResults(s: GameState): void {
  const inLeague = phaseOf(s.week) === "firstHalf" || phaseOf(s.week) === "secondHalf";
  if (!inLeague || hasFullSchedule(s)) return;
  const others = s.league.filter((r) => r.team !== s.clubName);
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

/** Legacy sponsor clock, staff contract clock + 4-weekly staff market refresh. */
export function tickContractsAndMarkets(s: GameState): void {
  for (const sp of s.sponsors) sp.weeksLeft = Math.max(0, sp.weeksLeft - 1);

  for (const st of s.hiredStaff) st.contractWeeks = Math.max(0, st.contractWeeks - 1);
  if (s.week - (s.staffMarketRefreshedWeek ?? 0) >= 4) {
    s.staffCandidates = staffPoolFor(s);
    s.staffMarketRefreshedWeek = s.week;
  }
}

/**
 * Ticket price backlash.
 * Fans compare average ticket price against a market reference driven by club
 * reputation. Push more than 25% above and happiness ticks down; more than 50%
 * above and reputation itself starts to slide.
 */
export function tickTicketBacklash(s: GameState): void {
  const refPriceNow = 15 + s.reputation * 0.4;
  const avgPriceNow = avgTicketPrice(s);
  const overRatio = avgPriceNow / refPriceNow;
  if (overRatio > 1.25) {
    const excess = overRatio - 1.25;
    s.fanHappiness = Math.max(5, Math.round(s.fanHappiness - Math.min(6, excess * 12)));
    if (overRatio > 1.5) {
      s.reputation = Math.max(20, s.reputation - Math.min(0.6, (overRatio - 1.5) * 0.8));
    }
  } else if (overRatio < 0.75 && s.fanHappiness < 100) {
    // Bargain pricing — small happiness boost
    s.fanHappiness = Math.min(100, s.fanHappiness + 1);
  }
}
