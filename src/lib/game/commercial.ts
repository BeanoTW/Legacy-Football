/* =========================================================================
   Commercial Department & Sponsorship
   -------------------------------------------------------------------------
   Rules of this module:

     1. Sponsors are club-agnostic and generated deterministically from the
        save seed. The same seed always produces the same sponsor universe.
     2. No Math.random(), no Date.now(). All randomness comes from seededRng
        with stable inputs (saveSeed, entity id, season, week).
     3. Every pound moves through finance.postEntry() with a dedupeKey, so
        replaying a week, reloading or re-migrating can never double-pay.
     4. Imports flow one way: commercial → finance → types. This module never
        imports inbox.ts, board.ts or engine.ts.
     5. Ids are derived from stable hashes, never counters that could drift.
========================================================================= */

import type {
  CommercialContract,
  CommercialContractRecord,
  CommercialCounterKind,
  CommercialDepartment,
  CommercialObjective,
  CommercialObjectiveKind,
  CommercialOffer,
  CommercialSeasonSummary,
  CommercialSponsor,
  GameState,
  SponsorIndustry,
  SponsorScale,
  SponsorshipCategory,
} from "./types";
import { absoluteWeek } from "./time";
import { hashString, rngInt, seededRng } from "./rng";
import { averageHomeAttendance, leagueTierOf, postEntry } from "./finance";
import { facilityModifiers } from "./infrastructure";
import { isUserClubReference, userClubReference } from "./clubReference";
import { archivedCommercialIncome } from "./archive";

const int = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const SEASON_WEEKS = 46;

/* =========================================================================
   1. Static configuration
========================================================================= */

export const SPONSORSHIP_CATEGORIES: SponsorshipCategory[] = [
  "Shirt Front",
  "Shirt Sleeve",
  "Training Kit",
  "Stadium Advertising",
  "Matchday Programme",
  "Club Partner",
];

/** Share of a club's total commercial pull each category commands. */
export const CATEGORY_WEIGHT: Record<SponsorshipCategory, number> = {
  "Shirt Front": 1,
  "Shirt Sleeve": 0.42,
  "Training Kit": 0.3,
  "Stadium Advertising": 0.36,
  "Matchday Programme": 0.12,
  "Club Partner": 0.2,
};

/** Minimum club commercial power a sponsor will consider for a category. */
export const CATEGORY_MIN_POWER: Record<SponsorshipCategory, number> = {
  "Shirt Front": 0,
  "Shirt Sleeve": 18,
  "Training Kit": 10,
  "Stadium Advertising": 8,
  "Matchday Programme": 0,
  "Club Partner": 6,
};

const INDUSTRIES: SponsorIndustry[] = [
  "Banking",
  "Insurance",
  "Energy",
  "Telecoms",
  "Brewery",
  "Automotive",
  "Retail",
  "Airline",
  "Technology",
  "Construction",
  "Food & Drink",
  "Logistics",
];

/* Company names are assembled from neutral word banks so no sponsor is ever
   hard-coded to a club. */
const NAME_A = [
  "North",
  "Vale",
  "Iron",
  "Crown",
  "Harbour",
  "Summit",
  "Orchard",
  "Granite",
  "Silver",
  "Beacon",
  "Foundry",
  "Meridian",
  "Halcyon",
  "Pioneer",
  "Kestrel",
  "Bramble",
  "Cinder",
  "Anchor",
  "Redwood",
  "Lantern",
  "Quarry",
  "Amber",
];
const NAME_B = [
  "Mutual",
  "Union",
  "Group",
  "Holdings",
  "Partners",
  "Industries",
  "Works",
  "Assurance",
  "Logistics",
  "Brewing",
  "Motors",
  "Telecom",
  "Energy",
  "Foods",
  "Systems",
  "Bank",
  "Airways",
  "Build",
  "Retail",
  "Labs",
];
const NAME_SUFFIX = ["", " plc", " Ltd", " Co.", " International", " & Sons"];

const SCALES: SponsorScale[] = ["local", "regional", "national"];

const REGION_POOL = ["North", "South", "East", "West", "Central", "Coastal"];

/* =========================================================================
   2. Sponsor generation — deterministic, club-agnostic
========================================================================= */

export const SPONSOR_POOL_SIZE = 60;

function makeSponsor(saveSeed: string, index: number): CommercialSponsor {
  const id = `spn-${hashString(`${saveSeed}|sponsor|${index}`).toString(36)}`;
  const rng = seededRng(saveSeed, "sponsor", index);

  // Reputation band: index-driven so the universe always spans the pyramid.
  const band = index % 5; // 0 = local minnow … 4 = national brand
  const lo = 18 + band * 16;
  const reputation = clamp(int(lo + rng() * 14), 5, 98);

  const industry = INDUSTRIES[rngInt(rng, 0, INDUSTRIES.length - 1)];
  const companyName =
    `${NAME_A[rngInt(rng, 0, NAME_A.length - 1)]} ` +
    `${NAME_B[rngInt(rng, 0, NAME_B.length - 1)]}` +
    `${NAME_SUFFIX[rngInt(rng, 0, NAME_SUFFIX.length - 1)]}`;

  const scale: SponsorScale =
    reputation >= 70 ? "national" : reputation >= 45 ? "regional" : "local";
  const preferredLeagueTier = reputation >= 62 ? 1 : 2;
  // Weekly spending ceiling scales with brand standing.
  const budget = int((900 + reputation * reputation * 4.2) * (0.85 + rng() * 0.4));

  return {
    id,
    companyName,
    industry,
    reputation,
    budget,
    preferredClubSize: scale,
    preferredLeagueTier,
    preferredRegions: [REGION_POOL[rngInt(rng, 0, REGION_POOL.length - 1)]],
    relationshipScore: clamp(int(45 + rng() * 15), 0, 100),
    contractHistory: [],
  };
}

/** The full sponsor universe for a save. Pure function of the seed. */
export function generateSponsorPool(
  saveSeed: string,
  count = SPONSOR_POOL_SIZE,
): CommercialSponsor[] {
  const out: CommercialSponsor[] = [];
  for (let i = 0; i < count; i++) out.push(makeSponsor(saveSeed, i));
  // Stable ordering by id keeps iteration deterministic regardless of insert order.
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function makeDirectorName(saveSeed: string): string {
  const first = [
    "Alan",
    "Marie",
    "Derek",
    "Priya",
    "Colin",
    "Nadia",
    "Ruth",
    "Owen",
    "Sian",
    "Malcolm",
  ];
  const last = [
    "Fraser",
    "Okafor",
    "Whitlock",
    "Ahmed",
    "Lennox",
    "Baptiste",
    "Kerr",
    "Doyle",
    "Mercer",
    "Vance",
  ];
  const rng = seededRng(saveSeed, "commercial-director");
  return `${first[rngInt(rng, 0, first.length - 1)]} ${last[rngInt(rng, 0, last.length - 1)]}`;
}

/** Create an empty department with a deterministic sponsor pool. */
export function defaultCommercialDepartment(s: GameState): CommercialDepartment {
  const seed = s.saveSeed ?? `${userClubReference(s)}|fallback`;
  const rng = seededRng(seed, "commercial-department");
  return {
    directorName: makeDirectorName(seed),
    rating: clamp(int(38 + rng() * 24), 1, 100),
    negotiation: clamp(int(38 + rng() * 24), 1, 100),
    // Commercial standing starts near, but independent of, football reputation.
    commercialReputation: clamp(int((s.reputation ?? 50) * 0.8 + rng() * 10), 1, 100),
    sponsors: generateSponsorPool(seed),
    contracts: [],
    offers: [],
    history: [],
    seasonHistory: [],
    seasonCountersSeason: s.season ?? 1,
    newSponsorsThisSeason: 0,
    renewalsThisSeason: 0,
    lostSponsorsThisSeason: 0,
  };
}

/** Idempotent. Safe to call on every load, migration and week. */
export function ensureCommercial(s: GameState): void {
  if (!s.commercial || typeof s.commercial !== "object") {
    s.commercial = defaultCommercialDepartment(s);
    return;
  }
  const c = s.commercial;
  if (!Array.isArray(c.sponsors) || c.sponsors.length === 0) {
    c.sponsors = generateSponsorPool(s.saveSeed ?? `${userClubReference(s)}|fallback`);
  }
  if (!Array.isArray(c.contracts)) c.contracts = [];
  if (!Array.isArray(c.offers)) c.offers = [];
  if (!Array.isArray(c.history)) c.history = [];
  if (!Array.isArray(c.seasonHistory)) c.seasonHistory = [];
  if (typeof c.directorName !== "string")
    c.directorName = makeDirectorName(s.saveSeed ?? userClubReference(s));
  if (typeof c.rating !== "number") c.rating = 50;
  if (typeof c.negotiation !== "number") c.negotiation = 50;
  if (typeof c.commercialReputation !== "number") {
    c.commercialReputation = clamp(int((s.reputation ?? 50) * 0.8), 1, 100);
  }
  if (typeof c.seasonCountersSeason !== "number") c.seasonCountersSeason = s.season ?? 1;
  if (typeof c.newSponsorsThisSeason !== "number") c.newSponsorsThisSeason = 0;
  if (typeof c.renewalsThisSeason !== "number") c.renewalsThisSeason = 0;
  if (typeof c.lostSponsorsThisSeason !== "number") c.lostSponsorsThisSeason = 0;
}

/* =========================================================================
   3. Derived reads (never mutate)
========================================================================= */

export const sponsorById = (s: GameState, id: string): CommercialSponsor | undefined =>
  (s.commercial?.sponsors ?? []).find((x) => x.id === id);

export const sponsorName = (s: GameState, id: string): string =>
  sponsorById(s, id)?.companyName ?? "Unknown partner";

export const activeContracts = (s: GameState): CommercialContract[] =>
  (s.commercial?.contracts ?? []).filter((c) => c.status === "Active");

export const contractForCategory = (
  s: GameState,
  category: SponsorshipCategory,
): CommercialContract | undefined => activeContracts(s).find((c) => c.category === category);

export const pendingOffers = (s: GameState): CommercialOffer[] =>
  (s.commercial?.offers ?? []).filter((o) => o.status === "pending");

export const commercialWeeklyIncome = (s: GameState): number =>
  int(activeContracts(s).reduce((a, c) => a + c.weeklyPayment, 0));

/** Current league position of the user's club (1 = top). */
export function leaguePosition(s: GameState): number {
  const sorted = [...(s.league ?? [])].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const i = sorted.findIndex((r) => isUserClubReference(s, r.team));
  return i >= 0 ? i + 1 : sorted.length || 20;
}

/**
 * How attractive the club is to sponsors, 0-100. Blends football reputation,
 * commercial reputation, league tier, attendance, fan mood and recent results.
 */
export function commercialPower(s: GameState): number {
  ensureCommercial(s);
  const tier = leagueTierOf(s);
  const tierScore = tier <= 1 ? 100 : Math.max(0, 100 - (tier - 1) * 32);
  const capacity = (s.stands ?? []).reduce((a, b) => a + b.capacity, 0) || 1;
  const attendance = averageHomeAttendance(s, s.season) || Math.round(capacity * 0.5);
  const attendanceScore = clamp((attendance / capacity) * 100, 0, 100);
  const recent = (s.results ?? []).slice(-6);
  const form = recent.length
    ? ((recent.filter((r) => r.result === "W").length * 3 +
        recent.filter((r) => r.result === "D").length) /
        (recent.length * 3)) *
      100
    : 50;
  // Canonical infrastructure signal (shop, hospitality, offices, stands).
  // Additive and capped so facilities nudge commercial standing without
  // outweighing reputation, tier or recent success.
  const facilities = clamp(facilityModifiers(s).commercialPower, -12, 12);
  const power =
    (s.reputation ?? 50) * 0.32 +
    s.commercial.commercialReputation * 0.26 +
    tierScore * 0.16 +
    attendanceScore * 0.12 +
    (s.fanHappiness ?? 60) * 0.08 +
    form * 0.06 +
    facilities;
  return clamp(Math.round(power * 10) / 10, 1, 100);
}

/** Total commercial income banked in a season, read from the finance ledger. */
export function commercialIncomeForSeason(s: GameState, season = s.season): number {
  return int(
    archivedCommercialIncome(s, season) +
      (s.financeLedger ?? [])
        .filter(
          (e) => e.sourceSystem === "commercial" && e.direction === "income" && e.season === season,
        )
        .reduce((a, e) => a + e.amount, 0),
  );
}

/** Total value already paid out under one contract. */
export function contractPaidToDate(s: GameState, contractId: string): number {
  return int(
    (s.financeLedger ?? [])
      .filter((e) => e.sourceSystem === "commercial" && e.linkedEntityId === contractId)
      .reduce((a, e) => a + (e.direction === "income" ? e.amount : -e.amount), 0),
  );
}

export interface CommercialSnapshot {
  commercialReputation: number;
  power: number;
  weeklyIncome: number;
  seasonIncome: number;
  activePartners: number;
  openCategories: SponsorshipCategory[];
  pendingOffers: number;
  nextRenewal: { contract: CommercialContract; weeksLeft: number } | null;
}

export function commercialSnapshot(s: GameState): CommercialSnapshot {
  const nowAbs = absoluteWeek(s.season, s.week);
  const live = activeContracts(s);
  const next = [...live].sort((a, b) => a.endAbsoluteWeek - b.endAbsoluteWeek)[0];
  return {
    commercialReputation: s.commercial?.commercialReputation ?? 0,
    power: commercialPower(s),
    weeklyIncome: commercialWeeklyIncome(s),
    seasonIncome: commercialIncomeForSeason(s),
    activePartners: live.length,
    openCategories: SPONSORSHIP_CATEGORIES.filter((c) => !live.some((x) => x.category === c)),
    pendingOffers: pendingOffers(s).length,
    nextRenewal: next
      ? { contract: next, weeksLeft: Math.max(0, next.endAbsoluteWeek - nowAbs) }
      : null,
  };
}

/* =========================================================================
   4. Offer construction
========================================================================= */

function objectiveFor(
  s: GameState,
  kind: CommercialObjectiveKind,
  weekly: number,
  idSeed: string,
): CommercialObjective {
  const size = (s.league ?? []).length || 20;
  const capacity = (s.stands ?? []).reduce((a, b) => a + b.capacity, 0) || 1;
  const currentAtt = averageHomeAttendance(s, s.season) || Math.round(capacity * 0.5);
  const bonus = int(weekly * 12);
  const id = `cob-${hashString(idSeed + kind).toString(36)}`;
  switch (kind) {
    case "topHalf":
      return {
        id,
        kind,
        target: Math.floor(size / 2),
        bonus,
        status: "active",
        label: `Finish in the top half (${Math.floor(size / 2)} or better)`,
      };
    case "promotion":
      return {
        id,
        kind,
        target: 2,
        bonus: int(bonus * 2),
        status: "active",
        label: "Win promotion",
      };
    case "avoidRelegation":
      return {
        id,
        kind,
        target: Math.max(1, size - 3),
        bonus: int(bonus * 0.6),
        status: "active",
        label: `Avoid relegation (${Math.max(1, size - 3)} or better)`,
      };
    case "maintainAttendance": {
      const target = int(Math.max(500, currentAtt * 0.95));
      return {
        id,
        kind,
        target,
        bonus: int(bonus * 0.7),
        status: "active",
        label: `Average home attendance of ${target.toLocaleString()}+`,
      };
    }
  }
}

/** Deterministic monetary terms a sponsor would put on the table. */
export function offerTerms(
  s: GameState,
  sponsor: CommercialSponsor,
  category: SponsorshipCategory,
  rng: () => number,
): { weeklyPayment: number; signingBonus: number; durationSeasons: number } {
  const power = commercialPower(s);
  const weight = CATEGORY_WEIGHT[category];
  const tier = leagueTierOf(s);
  const tierFactor = tier <= 1 ? 1 : 0.55;
  const relationship = sponsor.relationshipScore / 100;
  const negotiationEdge = 1 + (s.commercial.negotiation - 50) / 500; // ±10%

  const base = (1_500 + power * power * 3.2) * weight * tierFactor;
  const brand = 0.7 + (sponsor.reputation / 100) * 0.6;
  const goodwill = 0.92 + relationship * 0.16;
  const noise = 0.9 + rng() * 0.2;

  const raw = base * brand * goodwill * noise * negotiationEdge;
  const ceiling = sponsor.budget * weight;
  const weeklyPayment = Math.max(50, int(Math.min(raw, ceiling) / 50) * 50);

  const durationSeasons = 1 + rngInt(rng, 0, 2);
  const signingBonus = int((weeklyPayment * (6 + rngInt(rng, 0, 8))) / 100) * 100;
  return { weeklyPayment, signingBonus, durationSeasons };
}

function buildObjectives(
  s: GameState,
  sponsor: CommercialSponsor,
  weekly: number,
  rng: () => number,
  idSeed: string,
): CommercialObjective[] {
  // Bigger brands attach conditions; small local backers rarely do.
  const appetite = sponsor.reputation / 100;
  const n = appetite > 0.7 ? 2 : appetite > 0.4 ? 1 : rng() < 0.4 ? 1 : 0;
  if (n === 0) return [];
  const tier = leagueTierOf(s);
  const pool: CommercialObjectiveKind[] =
    tier > 1
      ? ["promotion", "topHalf", "maintainAttendance"]
      : ["topHalf", "avoidRelegation", "maintainAttendance"];
  const picked: CommercialObjectiveKind[] = [];
  for (let i = 0; i < n; i++) {
    const k = pool[rngInt(rng, 0, pool.length - 1)];
    if (!picked.includes(k)) picked.push(k);
  }
  return picked.map((k) => objectiveFor(s, k, weekly, `${idSeed}|${k}`));
}

/** Sponsors whose standing sits within reach of the club's commercial power. */
export function eligibleSponsors(s: GameState, category: SponsorshipCategory): CommercialSponsor[] {
  const power = commercialPower(s);
  if (power < CATEGORY_MIN_POWER[category]) return [];
  const tier = leagueTierOf(s);
  return (s.commercial.sponsors ?? []).filter((sp) => {
    const reach = sp.reputation - power;
    // Slightly bigger brands will stretch when the relationship is good.
    const stretch = 8 + (sp.relationshipScore - 50) / 5;
    if (reach > stretch) return false;
    if (power - sp.reputation > 45) return false; // far too small to bother
    if (sp.preferredLeagueTier < tier && sp.reputation > power + 4) return false;
    // One category per sponsor at a time.
    return !activeContracts(s).some((c) => c.sponsorId === sp.id);
  });
}

function makeOffer(
  s: GameState,
  sponsor: CommercialSponsor,
  category: SponsorshipCategory,
  key: string,
  renewalOfContractId?: string,
): CommercialOffer {
  const rng = seededRng(s.saveSeed, "commercial-offer", key);
  const terms = offerTerms(s, sponsor, category, rng);
  const nowAbs = absoluteWeek(s.season, s.week);
  return {
    id: `off-${hashString(key).toString(36)}`,
    sponsorId: sponsor.id,
    category,
    weeklyPayment: terms.weeklyPayment,
    signingBonus: terms.signingBonus,
    durationSeasons: terms.durationSeasons,
    objectives: buildObjectives(s, sponsor, terms.weeklyPayment, rng, key),
    createdSeason: s.season,
    createdAbsoluteWeek: nowAbs,
    expiresAtAbsoluteWeek: nowAbs + 3,
    status: "pending",
    negotiationRounds: 0,
    outcomes: [],
    renewalOfContractId,
  };
}

/* =========================================================================
   5. Negotiation — deterministic outcomes
========================================================================= */

export const MAX_NEGOTIATION_ROUNDS = 2;

export interface NegotiationResult {
  ok: boolean;
  result: "improved" | "held" | "withdrawn";
  note: string;
}

export const offerById = (s: GameState, id: string): CommercialOffer | undefined =>
  (s.commercial?.offers ?? []).find((o) => o.id === id);

/**
 * Counter an offer on an already-cloned working state, in place.
 * Outcome is a pure function of (saveSeed, offerId, counter, round), so
 * replaying the same counter always gives the same answer.
 */
export function counterOfferInPlace(
  ns: GameState,
  offerId: string,
  counter: CommercialCounterKind,
): NegotiationResult {
  ensureCommercial(ns);
  const offer = ns.commercial.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { ok: false, result: "held", note: "That offer is no longer on the table." };
  }
  const sponsor = sponsorById(ns, offer.sponsorId);
  if (!sponsor) {
    return { ok: false, result: "held", note: "Sponsor unavailable." };
  }
  if (offer.negotiationRounds >= MAX_NEGOTIATION_ROUNDS) {
    offer.status = "withdrawn";
    const note = `${sponsor.companyName} have walked away — they were pushed once too often.`;
    offer.outcomes.push({ round: offer.negotiationRounds + 1, counter, result: "withdrawn", note });
    sponsor.relationshipScore = clamp(sponsor.relationshipScore - 8, 0, 100);
    return { ok: true, result: "withdrawn", note };
  }

  const round = offer.negotiationRounds + 1;
  const rng = seededRng(ns.saveSeed, "commercial-counter", offer.id, counter, round);
  const skill = ns.commercial.negotiation / 100;
  const goodwill = sponsor.relationshipScore / 100;
  const patience = 1 - (sponsor.reputation / 100) * 0.35;
  const successChance = clamp(
    0.18 + skill * 0.45 + goodwill * 0.2 + patience * 0.15 - (round - 1) * 0.18,
    0.05,
    0.9,
  );
  const roll = rng();

  offer.negotiationRounds = round;

  if (roll < successChance) {
    const gain = 0.06 + skill * 0.09;
    let note = "";
    if (counter === "payment") {
      const before = offer.weeklyPayment;
      const ceiling = int(sponsor.budget * CATEGORY_WEIGHT[offer.category]);
      offer.weeklyPayment = Math.max(
        before,
        Math.min(ceiling, int((before * (1 + gain)) / 50) * 50),
      );
      note =
        offer.weeklyPayment > before
          ? `${sponsor.companyName} improve the weekly fee to £${offer.weeklyPayment.toLocaleString()}.`
          : `${sponsor.companyName} say the fee is already at the top of their budget.`;
      if (offer.weeklyPayment === before) {
        offer.outcomes.push({ round, counter, result: "held", note });
        return { ok: true, result: "held", note };
      }
    } else if (counter === "duration") {
      offer.durationSeasons = Math.min(5, offer.durationSeasons + 1);
      note = `${sponsor.companyName} agree to extend the term to ${offer.durationSeasons} season(s).`;
    } else {
      const before = offer.signingBonus;
      offer.signingBonus = int((before * (1 + gain * 2.2)) / 100) * 100;
      note = `${sponsor.companyName} raise the signing bonus to £${offer.signingBonus.toLocaleString()}.`;
    }
    sponsor.relationshipScore = clamp(sponsor.relationshipScore - 1, 0, 100);
    offer.outcomes.push({ round, counter, result: "improved", note });
    return { ok: true, result: "improved", note };
  }

  const note = `${sponsor.companyName} hold firm — the original terms stand.`;
  sponsor.relationshipScore = clamp(sponsor.relationshipScore - 3, 0, 100);
  offer.outcomes.push({ round, counter, result: "held", note });
  return { ok: true, result: "held", note };
}

/** Immutable wrapper around counterOfferInPlace. */
export function counterOffer(
  s: GameState,
  offerId: string,
  counter: CommercialCounterKind,
): { state: GameState; result: NegotiationResult } {
  const ns = structuredClone(s);
  const result = counterOfferInPlace(ns, offerId, counter);
  return { state: result.ok ? ns : s, result };
}

/* =========================================================================
   6. Accept / reject
========================================================================= */

export interface CommercialActionResult {
  state: GameState;
  ok: boolean;
  message: string;
  contractId?: string;
}

function contractIdFor(offer: CommercialOffer): string {
  return `ctr-${hashString(`contract|${offer.id}`).toString(36)}`;
}

/** Accept an offer in place on an already-cloned state. */
export function acceptOfferInPlace(s: GameState, offerId: string): CommercialActionResult {
  ensureCommercial(s);
  const offer = s.commercial.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { state: s, ok: false, message: "That offer is no longer available." };
  }
  const sponsor = sponsorById(s, offer.sponsorId);
  if (!sponsor) return { state: s, ok: false, message: "Sponsor unavailable." };
  if (contractForCategory(s, offer.category) && !offer.renewalOfContractId) {
    return { state: s, ok: false, message: `${offer.category} is already contracted.` };
  }

  const id = contractIdFor(offer);
  if (s.commercial.contracts.some((c) => c.id === id)) {
    return { state: s, ok: false, message: "That agreement is already signed." };
  }

  // A renewal replaces the outgoing contract immediately.
  if (offer.renewalOfContractId) {
    const old = s.commercial.contracts.find((c) => c.id === offer.renewalOfContractId);
    if (old && old.status === "Active") closeContract(s, old, "renewed");
    s.commercial.renewalsThisSeason += 1;
  } else {
    s.commercial.newSponsorsThisSeason += 1;
  }

  const nowAbs = absoluteWeek(s.season, s.week);
  const contract: CommercialContract = {
    id,
    sponsorId: sponsor.id,
    category: offer.category,
    clubId: userClubReference(s),
    startSeason: s.season,
    startAbsoluteWeek: nowAbs,
    durationSeasons: offer.durationSeasons,
    endAbsoluteWeek: nowAbs + offer.durationSeasons * SEASON_WEEKS,
    weeklyPayment: offer.weeklyPayment,
    signingBonus: offer.signingBonus,
    renewalWindowWeeks: 8,
    objectives: offer.objectives.map((o) => ({ ...o })),
    relationshipScore: sponsor.relationshipScore,
    status: "Active",
  };
  s.commercial.contracts.push(contract);
  sponsor.contractHistory.push(contract.id);
  sponsor.relationshipScore = clamp(sponsor.relationshipScore + 6, 0, 100);
  offer.status = "accepted";

  // Signing bonus — exactly once, guarded by dedupeKey.
  if (contract.signingBonus > 0) {
    postEntry(s, {
      category: "Commercial",
      subcategory: "Signing bonus",
      description: `${sponsor.companyName} — ${contract.category} signing bonus`,
      amount: contract.signingBonus,
      direction: "income",
      sourceSystem: "commercial",
      linkedEntityId: contract.id,
      dedupeKey: `commercial:bonus:${contract.id}`,
      metadata: { sponsorId: sponsor.id, category: contract.category },
    });
  }

  // Signing a partner lifts commercial standing a little.
  s.commercial.commercialReputation = clamp(
    s.commercial.commercialReputation + Math.min(3, contract.weeklyPayment / 6000),
    1,
    100,
  );

  return {
    state: s,
    ok: true,
    contractId: contract.id,
    message: `${sponsor.companyName} signed as ${contract.category} partner.`,
  };
}

export function acceptOffer(s: GameState, offerId: string): CommercialActionResult {
  const ns = structuredClone(s);
  const r = acceptOfferInPlace(ns, offerId);
  return r.ok ? r : { ...r, state: s };
}

export function rejectOfferInPlace(s: GameState, offerId: string): CommercialActionResult {
  ensureCommercial(s);
  const offer = s.commercial.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== "pending") {
    return { state: s, ok: false, message: "That offer is no longer available." };
  }
  offer.status = "rejected";
  const sponsor = sponsorById(s, offer.sponsorId);
  if (sponsor) sponsor.relationshipScore = clamp(sponsor.relationshipScore - 6, 0, 100);
  return {
    state: s,
    ok: true,
    message: `${sponsor?.companyName ?? "The sponsor"}'s ${offer.category} offer was turned down.`,
  };
}

export function rejectOffer(s: GameState, offerId: string): CommercialActionResult {
  const ns = structuredClone(s);
  const r = rejectOfferInPlace(ns, offerId);
  return r.ok ? r : { ...r, state: s };
}

/* =========================================================================
   7. Objectives, contract close and historical records
========================================================================= */

export function evaluateCommercialObjective(
  s: GameState,
  o: CommercialObjective,
): { met: boolean; detail: string } {
  const pos = leaguePosition(s);
  switch (o.kind) {
    case "topHalf":
      return { met: pos <= o.target, detail: `Finished ${pos}` };
    case "promotion": {
      const league = (s.leagues ?? []).find((l) => l.id === s.playerLeagueId);
      const places = league?.promotionPlaces ?? 0;
      return { met: places > 0 && pos <= places, detail: `Finished ${pos}` };
    }
    case "avoidRelegation":
      return { met: pos <= o.target, detail: `Finished ${pos}` };
    case "maintainAttendance": {
      const att = averageHomeAttendance(s, s.season);
      return { met: att >= o.target, detail: `Average ${att.toLocaleString()}` };
    }
  }
}

/**
 * Close one contract exactly once: settle objective bonuses, write the
 * immutable record and move the relationship.
 */
export function closeContract(
  s: GameState,
  contract: CommercialContract,
  outcome: "completed" | "renewed" | "terminated",
): void {
  if (contract.closed) return;
  contract.closed = true;
  contract.status = outcome === "terminated" ? "Terminated" : "Expired";

  const sponsor = sponsorById(s, contract.sponsorId);
  const nowAbs = absoluteWeek(s.season, s.week);
  const objectiveRows: CommercialContractRecord["objectives"] = [];
  let metCount = 0;

  for (const o of contract.objectives) {
    const { met } = evaluateCommercialObjective(s, o);
    o.status = met ? "met" : "missed";
    if (met) {
      metCount++;
      postEntry(s, {
        category: "Commercial",
        subcategory: "Objective bonus",
        description: `${sponsor?.companyName ?? "Partner"} — ${o.label} bonus`,
        amount: o.bonus,
        direction: "income",
        sourceSystem: "commercial",
        linkedEntityId: contract.id,
        dedupeKey: `commercial:objective:${contract.id}:${o.id}`,
        metadata: { objective: o.kind },
      });
    }
    objectiveRows.push({ label: o.label, met, bonus: o.bonus });
  }

  if (sponsor) {
    const swing =
      outcome === "renewed"
        ? 8
        : outcome === "terminated"
          ? -18
          : contract.objectives.length === 0
            ? 3
            : metCount === contract.objectives.length
              ? 7
              : metCount > 0
                ? 1
                : -7;
    sponsor.relationshipScore = clamp(sponsor.relationshipScore + swing, 0, 100);
  }

  const record: CommercialContractRecord = {
    contractId: contract.id,
    sponsorId: contract.sponsorId,
    sponsorName: sponsor?.companyName ?? "Unknown partner",
    category: contract.category,
    startSeason: contract.startSeason,
    endSeason: s.season,
    weeksActive: Math.max(0, nowAbs - contract.startAbsoluteWeek),
    weeklyPayment: contract.weeklyPayment,
    totalValue: contractPaidToDate(s, contract.id),
    objectives: objectiveRows,
    outcome,
  };
  if (!s.commercial.history.some((h) => h.contractId === record.contractId)) {
    s.commercial.history.push(record);
  }
  if (outcome !== "renewed") s.commercial.lostSponsorsThisSeason += 1;

  s.commercial.commercialReputation = clamp(
    s.commercial.commercialReputation + (outcome === "renewed" ? 1 : metCount > 0 ? 0 : -1),
    1,
    100,
  );
}

/* =========================================================================
   8. Weekly tick
========================================================================= */

/** Gradual drift target for commercial reputation. */
export function commercialReputationTarget(s: GameState): number {
  const capacity = (s.stands ?? []).reduce((a, b) => a + b.capacity, 0) || 1;
  const attendance = averageHomeAttendance(s, s.season) || Math.round(capacity * 0.5);
  const attendanceScore = clamp((attendance / capacity) * 100, 0, 100);
  const tier = leagueTierOf(s);
  const exposure = tier <= 1 ? 100 : Math.max(0, 100 - (tier - 1) * 30);
  const partners = activeContracts(s);
  const portfolio = clamp(partners.length * 12 + commercialWeeklyIncome(s) / 900, 0, 100);
  const confidence = s.board?.confidence ?? 50;
  const solvency = clamp(((s.cash ?? 0) / 2_000_000) * 100, 0, 100);
  return clamp(
    (s.reputation ?? 50) * 0.24 +
      exposure * 0.16 +
      attendanceScore * 0.14 +
      portfolio * 0.24 +
      confidence * 0.12 +
      solvency * 0.1,
    1,
    100,
  );
}

/**
 * One commercial week. Called by advanceWeek AFTER the recurring finance
 * posting. Everything here is exactly-once and replay safe.
 */
export function runCommercialWeek(s: GameState): void {
  ensureCommercial(s);
  const c = s.commercial;
  const nowAbs = absoluteWeek(s.season, s.week);

  // Season counters roll with the season.
  if (c.seasonCountersSeason !== s.season) {
    c.seasonCountersSeason = s.season;
    c.newSponsorsThisSeason = 0;
    c.renewalsThisSeason = 0;
    c.lostSponsorsThisSeason = 0;
  }

  // 1. Weekly payments — one entry per contract per week.
  for (const contract of c.contracts) {
    if (contract.status !== "Active") continue;
    if (nowAbs >= contract.endAbsoluteWeek) continue;
    postEntry(s, {
      category: "Commercial",
      subcategory: contract.category,
      description: `${sponsorName(s, contract.sponsorId)} — ${contract.category} sponsorship`,
      amount: contract.weeklyPayment,
      direction: "income",
      sourceSystem: "commercial",
      linkedEntityId: contract.id,
      recurring: true,
      dedupeKey: `commercial:weekly:s${s.season}:w${s.week}:${contract.id}`,
      metadata: { sponsorId: contract.sponsorId, category: contract.category },
    });
  }

  // 2. Expiries — exactly once per contract.
  for (const contract of [...c.contracts]) {
    if (contract.status === "Active" && nowAbs >= contract.endAbsoluteWeek) {
      closeContract(s, contract, "completed");
    }
  }

  // 3. Expire stale offers.
  for (const o of c.offers) {
    if (o.status === "pending" && nowAbs > o.expiresAtAbsoluteWeek) o.status = "expired";
  }

  // 4. Renewal approaches: an existing partner tables new terms first.
  for (const contract of c.contracts) {
    if (contract.status !== "Active") continue;
    if (nowAbs < contract.endAbsoluteWeek - contract.renewalWindowWeeks) continue;
    const already = c.offers.some(
      (o) =>
        o.renewalOfContractId === contract.id &&
        (o.status === "pending" || o.status === "accepted"),
    );
    if (already) continue;
    const sponsor = sponsorById(s, contract.sponsorId);
    if (!sponsor) continue;
    if (sponsor.relationshipScore < 25) continue; // soured — they walk away
    const key = `renewal|${contract.id}`;
    const offer = makeOffer(s, sponsor, contract.category, key, contract.id);
    if (!c.offers.some((o) => o.id === offer.id)) c.offers.push(offer);
  }

  // 5. New approaches. At most one per week, deterministic.
  const openCategories = SPONSORSHIP_CATEGORIES.filter((cat) => !contractForCategory(s, cat));
  if (openCategories.length > 0) {
    const rng = seededRng(s.saveSeed, "commercial-approach", s.season, s.week);
    const power = commercialPower(s);
    const pendingCount = pendingOffers(s).length;
    const chance = clamp(0.1 + power / 260 + c.rating / 900 - pendingCount * 0.08, 0.02, 0.5);
    if (rng() < chance) {
      const category = openCategories[rngInt(rng, 0, openCategories.length - 1)];
      const pool = eligibleSponsors(s, category).filter(
        (sp) => !c.offers.some((o) => o.sponsorId === sp.id && o.status === "pending"),
      );
      if (pool.length > 0) {
        // Weight the draw towards sponsors with the best relationship.
        const sorted = [...pool].sort(
          (a, b) => b.relationshipScore - a.relationshipScore || (a.id < b.id ? -1 : 1),
        );
        const window = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
        const sponsor = window[rngInt(rng, 0, window.length - 1)];
        const key = `approach|s${s.season}|w${s.week}|${category}|${sponsor.id}`;
        const offer = makeOffer(s, sponsor, category, key);
        if (!c.offers.some((o) => o.id === offer.id)) c.offers.push(offer);
      }
    }
  }

  // 6. Gradual commercial reputation drift (max 0.4 per week).
  const target = commercialReputationTarget(s);
  const delta = clamp(target - c.commercialReputation, -0.4, 0.4);
  c.commercialReputation = clamp(Math.round((c.commercialReputation + delta) * 100) / 100, 1, 100);

  // 7. Department improves slowly with a healthy portfolio.
  if (s.week % 12 === 0) {
    const partners = activeContracts(s).length;
    if (partners >= 3 && c.rating < 92) c.rating = Math.min(92, c.rating + 1);
    if (partners >= 4 && c.negotiation < 92) c.negotiation = Math.min(92, c.negotiation + 1);
  }

  // Keep the offer log bounded but never lose live rows.
  if (c.offers.length > 120) {
    const live = c.offers.filter((o) => o.status === "pending");
    const done = c.offers.filter((o) => o.status !== "pending").slice(-80);
    c.offers = [...done, ...live];
  }
}

/** Immutable per-season commercial record. Called at rollover. */
export function closeCommercialSeason(s: GameState, season: number): void {
  ensureCommercial(s);
  const c = s.commercial;
  if (c.seasonHistory.some((h) => h.season === season)) return;
  const summary: CommercialSeasonSummary = {
    season,
    totalIncome: commercialIncomeForSeason(s, season),
    newSponsors: c.seasonCountersSeason === season ? c.newSponsorsThisSeason : 0,
    renewals: c.seasonCountersSeason === season ? c.renewalsThisSeason : 0,
    lostSponsors: c.seasonCountersSeason === season ? c.lostSponsorsThisSeason : 0,
    commercialReputationAtClose: c.commercialReputation,
    activePartnersAtClose: activeContracts(s).length,
  };
  c.seasonHistory.push(summary);
}

/* =========================================================================
   9. Display helpers
========================================================================= */

export function relationshipLabel(score: number): string {
  if (score >= 85) return "Delighted";
  if (score >= 70) return "Strong";
  if (score >= 50) return "Steady";
  if (score >= 32) return "Strained";
  return "Poor";
}

export function weeksRemaining(s: GameState, contract: CommercialContract): number {
  return Math.max(0, contract.endAbsoluteWeek - absoluteWeek(s.season, s.week));
}
