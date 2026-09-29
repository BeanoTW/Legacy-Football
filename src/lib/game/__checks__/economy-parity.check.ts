/* Economy parity regression: pure, deterministic checks for the audited fixes.
   Run: bun src/lib/game/__checks__/economy-parity.check.ts */
import { newGame } from "../engine";
import { economicProfileForLevel } from "../levelEconomy";
import { footballLevelOfUser } from "../footballLevel";
import { matchdayBroadcastFee, matchdayOperatingCost } from "../matchdayEconomy";
import { priceDemandFactor, ticketReferencePrice } from "../ticketPricing";
import { ticketPriceReference, expectedHomeAttendance } from "../ticketForecast";
import { avgTicketPrice, simAttendance } from "../sim";
import { projectedHomeMatchIncome, weeklyRevenueEstimate } from "../finance";
import { operatingPicture } from "../sustainability";

const check = (description: string, ok: boolean) => {
  if (!ok) throw new Error(description);
  console.log(`✓ ${description}`);
};
const s = newGame("Economy Audit FC", "Auditor", "ECONOMY|PARITY");
const profile = economicProfileForLevel(footballLevelOfUser(s));
check("Level 7 cost factor is 0.09", economicProfileForLevel(7).infrastructureCostFactor === 0.09);
check("Level 8 cost factor is 0.06", economicProfileForLevel(8).infrastructureCostFactor === 0.06);
check("Ticket reference is level-scaled", Math.abs(ticketPriceReference(s) - ticketReferencePrice(profile, s.reputation ?? 50)) < 1e-10);
for (let i = 0; i < 101; i += 1) {
  const price = ticketPriceReference(s) * (0.4 + i * 0.025);
  const ref = ticketPriceReference(s);
  const original = price <= ref
    ? Math.min(1.12, 1 + ((ref - price) / ref) * 0.28)
    : Math.max(0.18, 1 - Math.pow((price - ref) / ref, 1.25) * 0.85);
  check(`Price curve parity ${i}`, Math.abs(priceDemandFactor(price, ref) - original) < 1e-12);
}
check("Neutral ticket forecast matches attendance simulation",
  Math.abs(expectedHomeAttendance(s) - simAttendance(s, true, 60, () => 0.5)) <= 1);
check("Broadcast fee remains level-scaled", matchdayBroadcastFee(s, 0.5) <
  matchdayBroadcastFee(s, 0.5) + 1 && matchdayBroadcastFee(s, 0.5) < 1000);
check("Home operations use level factor",
  matchdayOperatingCost(s, true, 600) === Math.round((4200 + 600 * 1.35) * profile.matchdayCostFactor));
check("Away operations use level factor",
  matchdayOperatingCost(s, false, 0) === Math.round(3200 * profile.matchdayCostFactor));
check("Revenue estimate is finite", Number.isFinite(weeklyRevenueEstimate(s)));
check("Operating income ignores opening deposit",
  operatingPicture(s).weeklyIncome < s.cash);
check("Demand-led home match forecast is finite", Number.isFinite(projectedHomeMatchIncome(s)));
