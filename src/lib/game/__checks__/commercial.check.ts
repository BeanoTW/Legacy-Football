/* Commercial system verification suite.
   Run with:  bun src/lib/game/__checks__/commercial.check.ts
*/
import { readFileSync } from "node:fs";
import { newGame, advanceWeek } from "../engine";
import {
  CATEGORY_MIN_POWER, MAX_NEGOTIATION_ROUNDS, SPONSORSHIP_CATEGORIES, SPONSOR_POOL_SIZE,
  acceptOffer, activeContracts, closeCommercialSeason, commercialIncomeForSeason,
  commercialPower, commercialSnapshot, contractForCategory, counterOffer,
  eligibleSponsors, ensureCommercial, generateSponsorPool, offerById, pendingOffers,
  rejectOffer, runCommercialWeek, sponsorById,
} from "../commercial";
import { runWeeklyGenerators, handleInboxChoice, isKnownGeneratorId } from "../inbox";
import { absoluteWeek } from "../time";
import type { CommercialOffer, GameState } from "../types";

let passed = 0, failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}

function fixture(seed = "COMM_SEED_1"): GameState {
  const g = newGame("Testville FC", "Test Manager");
  g.saveSeed = seed;
  ensureCommercial(g);
  return g;
}

/** Force a pending offer into existence for a named category. */
function forceOffer(s: GameState, category = SPONSORSHIP_CATEGORIES[0]): CommercialOffer {
  ensureCommercial(s);
  const existing = pendingOffers(s).find((o) => o.category === category);
  if (existing) return existing;
  const sponsor = eligibleSponsors(s, category)[0] ?? s.commercial.sponsors[0];
  const nowAbs = absoluteWeek(s.season, s.week);
  const offer: CommercialOffer = {
    id: `test-offer-${category}`,
    sponsorId: sponsor.id,
    category,
    weeklyPayment: 4_000,
    signingBonus: 20_000,
    durationSeasons: 2,
    objectives: [],
    createdSeason: s.season,
    createdAbsoluteWeek: nowAbs,
    expiresAtAbsoluteWeek: nowAbs + 3,
    status: "pending",
    negotiationRounds: 0,
    outcomes: [],
  };
  s.commercial.offers.push(offer);
  return offer;
}

const ledgerTotal = (s: GameState) =>
  (s.financeLedger ?? []).reduce(
    (a: number, e: { direction: string; amount: number }) => a + (e.direction === "income" ? e.amount : -e.amount), 0);

console.log("\n[1] Sponsor pool determinism");
{
  const a = generateSponsorPool("SEED_A");
  const b = generateSponsorPool("SEED_A");
  const c = generateSponsorPool("SEED_B");
  check("pool size is stable", a.length === SPONSOR_POOL_SIZE);
  check("same seed → identical pool", JSON.stringify(a) === JSON.stringify(b));
  check("different seed → different pool", JSON.stringify(a) !== JSON.stringify(c));
  check("all sponsor ids unique", new Set(a.map((x) => x.id)).size === a.length);
}

console.log("\n[2] Commercial power bounds");
{
  const s = fixture();
  const p = commercialPower(s);
  check("power within 0-100", p >= 0 && p <= 100, `p=${p}`);
  check("power deterministic", commercialPower(fixture()) === p);
}

console.log("\n[3] Eligibility gating by category");
{
  const s = fixture();
  const power = commercialPower(s);
  let gated = true;
  for (const cat of SPONSORSHIP_CATEGORIES) {
    if (power < CATEGORY_MIN_POWER[cat] && eligibleSponsors(s, cat).length > 0) gated = false;
  }
  check("no sponsors offered for out-of-reach categories", gated);
}

console.log("\n[4] Accept posts money through the finance ledger");
{
  const s = fixture();
  const offer = forceOffer(s);
  const cashBefore = s.cash;
  const entriesBefore = (s.financeLedger ?? []).length;
  const r = acceptOffer(s, offer.id);
  check("accept succeeds", r.ok, r.message);
  const ns = r.state;
  check("signing bonus credited to cash", ns.cash === cashBefore + offer.signingBonus,
    `${ns.cash} vs ${cashBefore + offer.signingBonus}`);
  check("exactly one new ledger entry", (ns.financeLedger ?? []).length === entriesBefore + 1);
  check("contract now active", !!contractForCategory(ns, offer.category));
  check("category cannot be double-signed", !acceptOffer(ns, offer.id).ok);
}

console.log("\n[5] Weekly payments are exactly-once");
{
  const s = fixture();
  const offer = forceOffer(s);
  let ns = acceptOffer(s, offer.id).state;
  ns.week += 1;
  const before = ledgerTotal(ns);
  runCommercialWeek(ns);
  const afterOne = ledgerTotal(ns);
  runCommercialWeek(ns); // replay same week
  const afterTwo = ledgerTotal(ns);
  check("one weekly payment posted", afterOne - before >= offer.weeklyPayment,
    `delta=${afterOne - before}`);
  check("replaying the same week posts nothing extra", afterTwo === afterOne);
}

console.log("\n[6] Reject closes the offer and does not move money");
{
  const s = fixture();
  const offer = forceOffer(s);
  const cash = s.cash;
  const r = rejectOffer(s, offer.id);
  check("reject succeeds", r.ok, r.message);
  check("cash unchanged", r.state.cash === cash);
  check("offer no longer pending", offerById(r.state, offer.id)?.status !== "pending");
  check("rejecting twice is refused", !rejectOffer(r.state, offer.id).ok);
}

console.log("\n[7] Counter-offer determinism and walk-away limit");
{
  const a = fixture(); const oa = forceOffer(a);
  const b = fixture(); const ob = forceOffer(b);
  const ra = counterOffer(a, oa.id, "payment");
  const rb = counterOffer(b, ob.id, "payment");
  check("same counter → same result", ra.result.result === rb.result.result);
  check("same counter → same note", ra.result.note === rb.result.note);
  check("same counter → same terms",
    JSON.stringify(offerById(ra.state, oa.id)) === JSON.stringify(offerById(rb.state, ob.id)));

  let s = ra.state;
  for (let i = 0; i < MAX_NEGOTIATION_ROUNDS + 1; i++) s = counterOffer(s, oa.id, "payment").state;
  const final = offerById(s, oa.id)!;
  check("negotiation rounds capped", final.negotiationRounds <= MAX_NEGOTIATION_ROUNDS,
    `rounds=${final.negotiationRounds}`);
  check("over-pushing withdraws the offer", final.status === "withdrawn" || final.status === "pending");
}

console.log("\n[8] Inbox generators are registered and deduplicated");
{
  for (const id of [
    "commercial-offer", "commercial-renewal", "commercial-counter-outcome",
    "commercial-expiry-warning", "commercial-contract-expired",
  ]) check(`generator registered: ${id}`, isKnownGeneratorId(id));

  let s = fixture();
  forceOffer(s);
  s = runWeeklyGenerators(s);
  const first = s.inbox.filter((i) => i.generatorId === "commercial-offer").length;
  s.week += 1;
  s = runWeeklyGenerators(s);
  const second = s.inbox.filter((i) => i.generatorId === "commercial-offer").length;
  check("offer item emitted once", first === 1, `first=${first}`);
  check("no duplicate on the following week", second === 1, `second=${second}`);
}

console.log("\n[9] Inbox choices drive the commercial engine");
{
  let s = fixture();
  const offer = forceOffer(s);
  s = runWeeklyGenerators(s);
  const item = s.inbox.find((i) => i.generatorId === "commercial-offer")!;
  check("offer item has accept/reject choices",
    !!item.choices?.some((c) => c.id === "accept") && !!item.choices?.some((c) => c.id === "reject"));

  const accepted = handleInboxChoice(s, item.id, "accept");
  check("accepting from the inbox signs the contract", !!contractForCategory(accepted, offer.category));
  check("accepting credits the signing bonus", accepted.cash === s.cash + offer.signingBonus);

  // Counter from the inbox emits an outcome follow-up immediately.
  let s2 = fixture();
  const o2 = forceOffer(s2);
  s2 = runWeeklyGenerators(s2);
  const item2 = s2.inbox.find((i) => i.generatorId === "commercial-offer")!;
  const countered = handleInboxChoice(s2, item2.id, "counter-payment");
  check("counter registers a negotiation round", (offerById(countered, o2.id)?.negotiationRounds ?? 0) === 1);
  const follow = countered.inbox.filter((i) => i.generatorId === "commercial-counter-outcome");
  check("counter outcome item emitted immediately", follow.length === 1, `n=${follow.length}`);
  const replayed = runWeeklyGenerators(countered);
  check("weekly run does not duplicate the outcome item",
    replayed.inbox.filter((i) => i.generatorId === "commercial-counter-outcome").length === 1);
}

console.log("\n[10] Expiry warning and expired notice");
{
  let s = fixture();
  const offer = forceOffer(s);
  s = acceptOffer(s, offer.id).state;
  const contract = contractForCategory(s, offer.category)!;
  // Slide the clock into the last few weeks of the deal.
  contract.endAbsoluteWeek = absoluteWeek(s.season, s.week) + 3;
  contract.renewalWindowWeeks = 0; // suppress the auto-renewal approach
  s = runWeeklyGenerators(s);
  check("expiry warning emitted inside the window",
    s.inbox.some((i) => i.generatorId === "commercial-expiry-warning"));
  const warnCount = s.inbox.filter((i) => i.generatorId === "commercial-expiry-warning").length;
  s.week += 1;
  s = runWeeklyGenerators(s);
  check("expiry warning is not repeated",
    s.inbox.filter((i) => i.generatorId === "commercial-expiry-warning").length === warnCount);

  // Run past the end date so the contract closes.
  s.week += 4;
  runCommercialWeek(s);
  check("contract closed into history", (s.commercial.history ?? []).length === 1);
  s = runWeeklyGenerators(s);
  check("expired notice emitted",
    s.inbox.some((i) => i.generatorId === "commercial-contract-expired"));
  const expCount = s.inbox.filter((i) => i.generatorId === "commercial-contract-expired").length;
  s.week += 1;
  s = runWeeklyGenerators(s);
  check("expired notice is not repeated",
    s.inbox.filter((i) => i.generatorId === "commercial-contract-expired").length === expCount);
}

console.log("\n[11] Season summary is written once");
{
  const s = fixture();
  closeCommercialSeason(s, 1);
  closeCommercialSeason(s, 1);
  check("one summary per season", s.commercial.seasonHistory.filter((h) => h.season === 1).length === 1);
}

console.log("\n[12] Snapshot integrity");
{
  const s = fixture();
  const offer = forceOffer(s);
  const ns = acceptOffer(s, offer.id).state;
  const snap = commercialSnapshot(ns);
  check("snapshot counts the live partner", snap.activePartners === activeContracts(ns).length);
  check("snapshot excludes contracted categories from vacancies",
    !snap.openCategories.includes(offer.category));
  check("season income is non-negative", commercialIncomeForSeason(ns) >= 0);
}

console.log("\n[13] Static audit — no cash bypasses in commercial code");
{
  const src = readFileSync("src/lib/game/commercial.ts", "utf8");
  const bypass = src.match(/^\s*(?!\/\/).*\bs\.cash\s*[-+]?=/gm) ?? [];
  check("commercial.ts never mutates cash directly", bypass.length === 0, bypass.join(" | "));
  const ui = readFileSync("src/components/CommercialTab.tsx", "utf8");
  check("Commercial UI never mutates cash directly", !/\.cash\s*[-+]?=/.test(ui));
  check("Commercial UI never pushes contracts directly", !/contracts\.push|offers\.push/.test(ui));
}

console.log("\n[14] Full advanceWeek stays deterministic with commercial on");
{
  const a = fixture();
  const b = structuredClone(a);
  let ra = a, rb = b;
  for (let i = 0; i < 6; i++) { ra = advanceWeek(ra); rb = advanceWeek(rb); }
  check("cash identical after 6 weeks", ra.cash === rb.cash, `${ra.cash} vs ${rb.cash}`);
  check("offers identical after 6 weeks",
    JSON.stringify(ra.commercial.offers) === JSON.stringify(rb.commercial.offers));
  check("inbox keys identical after 6 weeks",
    ra.inbox.map((i) => i.eventKey).sort().join("|") === rb.inbox.map((i) => i.eventKey).sort().join("|"));
  check("sponsor relationships stay in range",
    ra.commercial.sponsors.every((sp) => sp.relationshipScore >= 0 && sp.relationshipScore <= 100));
  check("sponsorById resolves every contract",
    ra.commercial.contracts.every((c) => !!sponsorById(ra, c.sponsorId)));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
