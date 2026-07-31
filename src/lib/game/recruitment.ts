/* =========================================================================
   FOOTBALL OPERATION — RECRUITMENT, CONTRACTS & TRANSFERS
   -------------------------------------------------------------------------
   This module is the ONLY place that may create, move, pay or retire a
   footballer. Rules of the module:

     * GameState.football is the canonical source of truth for players,
       contracts, squads, wages and transfers. GameState.squad is a derived
       projection of the user's contracted players, rebuilt by
       syncLegacySquad() after every mutation (exactly as GameState.ledger is
       a projection of the finance ledger).
     * Every pound moves through finance.postEntry(). No direct cash writes.
     * Every value that varies is seeded from (saveSeed, stable ids). No
       Math.random(), no Date.now(), no crypto.randomUUID().
     * Histories are append-only. A written record is never edited.
     * The UI and the Inbox call the SAME exported functions. Neither may
       mutate football state directly.
========================================================================= */

import type {
  FootballPlayer, GameState, PlayerContract, PlayerContractRecord, Player,
  Position, RecruitmentDepartment, RecruitmentSeasonSummary, RecruitmentState,
  SquadRole, TransferNegotiation, TransferRecord, PreferredFoot,
  PlayerPersonality, NegotiationLogEntry, SquadGroup,
} from "./types";
import { hashString, seededRng, rngInt, rngRange } from "./rng";
import { absoluteWeek, WEEKS_PER_SEASON } from "./time";
import { postEntry } from "./finance";
import { clubReputation } from "./reputation";

const int = (n: number) => Math.round(n) || 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------- Constants ---------- */

export const SQUAD_TEMPLATE: Record<Position, number> = { GK: 3, DEF: 8, MID: 7, FWD: 4 };
export const SQUAD_SIZE = SQUAD_TEMPLATE.GK + SQUAD_TEMPLATE.DEF + SQUAD_TEMPLATE.MID + SQUAD_TEMPLATE.FWD;
export const MIN_SQUAD_SIZE = 16;
export const MAX_SQUAD_SIZE = 30;
export const FREE_AGENT_POOL = 24;
/** Both club and player talks allow at most this many negotiation rounds. */
export const MAX_NEGOTIATION_ROUNDS = 2;
/** Weeks before expiry a contract is flagged as expiring / renewable. */
export const RENEWAL_WINDOW_WEEKS = 20;
/** Weeks an untouched negotiation stays on the table. */
export const NEGOTIATION_TTL_WEEKS = 3;
/** Season 1 is played in this in-world year. */
export const BASE_YEAR = 2000;

const SQUAD_ROLES: SquadRole[] = ["Key Player", "First Team", "Rotation", "Prospect"];
const FOOT: PreferredFoot[] = ["Right", "Right", "Right", "Left", "Both"];
const PERSONALITIES: PlayerPersonality[] = [
  "Balanced", "Ambitious", "Loyal", "Professional", "Mercenary", "Temperamental",
];
const NATIONS = [
  "England", "Scotland", "Wales", "Ireland", "France", "Spain", "Portugal",
  "Netherlands", "Belgium", "Germany", "Italy", "Denmark", "Norway", "Sweden",
  "Poland", "Brazil", "Argentina", "Nigeria", "Ghana", "Senegal", "Japan", "USA",
];
const FIRST_NAMES = [
  "Alfie", "Callum", "Declan", "Ethan", "Finlay", "George", "Harvey", "Isaac",
  "Jacob", "Kieran", "Liam", "Mason", "Noah", "Oliver", "Patrick", "Reuben",
  "Samuel", "Theo", "Vincent", "William", "Andres", "Bruno", "Diogo", "Emile",
  "Fabio", "Gustav", "Hugo", "Ibrahim", "Joris", "Kasper", "Lars", "Matteo",
  "Nikola", "Omar", "Pedro", "Rafael", "Stefan", "Tomas", "Viktor", "Yannick",
];
const LAST_NAMES = [
  "Ainsworth", "Barlow", "Cartwright", "Dunne", "Eastwood", "Fenton", "Gallagher",
  "Hollis", "Irvine", "Jarvis", "Kendall", "Lockhart", "Marsden", "Naylor",
  "Ogden", "Pemberton", "Quigley", "Radcliffe", "Sutcliffe", "Thornton",
  "Underwood", "Vickers", "Whitfield", "Yates", "Almeida", "Bergkamp", "Cardoso",
  "De Vries", "Eriksen", "Ferrari", "Gundogan", "Haugen", "Ivanov", "Jansen",
  "Kovac", "Lindqvist", "Moreno", "Nowak", "Oduya", "Petit", "Rossi", "Silva",
  "Toure", "Vidal", "Weiss", "Zanetti",
];

/* ---------- Small helpers ---------- */

export const playerName = (p: FootballPlayer) => `${p.firstName} ${p.lastName}`;

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function ageOf(p: FootballPlayer, season: number): number {
  return BASE_YEAR + season - 1 - p.dateOfBirth.year;
}

/** Wage a given ability commands, £/week. Single definition, used everywhere. */
export function wageForAbility(ability: number, clubRep = 55): number {
  const base = (ability ** 2.15) / 9;
  return Math.max(250, int((base * (0.75 + clubRep / 200)) / 25) * 25);
}

/** Market value of an ability/age pair, £. Single definition. */
export function valueForPlayer(ability: number, potential: number, age: number): number {
  const peak = clamp(1.25 - Math.abs(age - 25) * 0.045, 0.35, 1.25);
  const upside = 1 + Math.max(0, potential - ability) / 90;
  const raw = (ability ** 3) * 0.55 * peak * upside;
  return Math.max(25_000, int(raw / 5_000) * 5_000);
}

/* =========================================================================
   1. Deterministic world generation
========================================================================= */

function makePlayerFor(
  saveSeed: string, clubId: string | null, index: number, tierRating: number, season: number,
): FootballPlayer {
  const key = `${saveSeed}|player|${clubId ?? "free"}|${index}`;
  const rng = seededRng(key);
  const id = `p-${slug(clubId ?? "free")}-${index}-${hashString(key).toString(36)}`;

  const slots: Position[] = [];
  (Object.keys(SQUAD_TEMPLATE) as Position[]).forEach((pos) => {
    for (let i = 0; i < SQUAD_TEMPLATE[pos]; i++) slots.push(pos);
  });
  const primaryPosition = slots[index % slots.length];

  const spread = rngRange(rng, -9, 9);
  const currentAbility = clamp(int(tierRating + spread), 35, 94);
  const age = rngInt(rng, 17, 35);
  const potentialAbility = clamp(
    int(currentAbility + (age < 24 ? rngRange(rng, 2, 16) : rngRange(rng, -1, 4))),
    currentAbility, 96,
  );
  const reputation = clamp(int(currentAbility * 0.85 + rngRange(rng, -6, 8)), 5, 98);
  const secondary: Position[] = rng() > 0.65
    ? [(["GK", "DEF", "MID", "FWD"] as Position[]).filter((p) => p !== primaryPosition)[rngInt(rng, 0, 2)]]
    : [];

  return {
    id,
    firstName: FIRST_NAMES[rngInt(rng, 0, FIRST_NAMES.length - 1)],
    lastName: LAST_NAMES[rngInt(rng, 0, LAST_NAMES.length - 1)],
    dateOfBirth: {
      year: BASE_YEAR + season - 1 - age,
      month: rngInt(rng, 1, 12),
      day: rngInt(rng, 1, 28),
    },
    nationality: NATIONS[rngInt(rng, 0, NATIONS.length - 1)],
    preferredFoot: FOOT[rngInt(rng, 0, FOOT.length - 1)],
    primaryPosition,
    secondaryPositions: secondary,
    currentClubId: clubId,
    reputation,
    currentAbility,
    potentialAbility,
    marketValue: valueForPlayer(currentAbility, potentialAbility, age),
    wageExpectation: wageForAbility(currentAbility, tierRating),
    personality: PERSONALITIES[rngInt(rng, 0, PERSONALITIES.length - 1)],
    contractId: null,
    transferStatus: "unlisted",
    availability: "available",
    createdSeason: season,
  };
}

function roleFor(indexInSquad: number): SquadRole {
  if (indexInSquad < 5) return "Key Player";
  if (indexInSquad < 13) return "First Team";
  if (indexInSquad < 19) return "Rotation";
  return "Prospect";
}

/** Build the entire world: every club's squad plus a free-agent pool. */
export function generateWorld(s: GameState): { players: FootballPlayer[]; contracts: PlayerContract[] } {
  const players: FootballPlayer[] = [];
  const contracts: PlayerContract[] = [];
  let contractSeq = 1;

  const clubs = (s.leagues ?? []).flatMap((l) => l.clubIds).sort((a, b) => a.localeCompare(b));

  for (const club of clubs) {
    const rep = clubReputation(s, club);
    const tierRating = clamp(42 + rep * 0.42, 40, 88);
    const squad: FootballPlayer[] = [];
    for (let i = 0; i < SQUAD_SIZE; i++) {
      squad.push(makePlayerFor(s.saveSeed, club, i, tierRating, s.season));
    }
    squad.sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));
    squad.forEach((p, i) => {
      const rng = seededRng(`${s.saveSeed}|contract|${p.id}`);
      const seasons = rngInt(rng, 1, 4);
      const contract: PlayerContract = {
        id: `PC-${String(contractSeq++).padStart(6, "0")}`,
        playerId: p.id,
        clubId: club,
        startSeason: s.season,
        startWeek: 1,
        expirySeason: s.season + seasons - 1,
        expiryWeek: WEEKS_PER_SEASON,
        weeklyWage: wageForAbility(p.currentAbility, rep),
        squadRole: roleFor(i),
        signingBonus: 0,
        agreedTransferFee: 0,
        status: "Active",
      };
      p.contractId = contract.id;
      contracts.push(contract);
      players.push(p);
    });
  }

  for (let i = 0; i < FREE_AGENT_POOL; i++) {
    const p = makePlayerFor(s.saveSeed, null, i, 52, s.season);
    p.contractId = null;
    p.transferStatus = "listed";
    players.push(p);
  }

  return { players, contracts };
}

function defaultDepartment(s: GameState): RecruitmentDepartment {
  const rng = seededRng(`${s.saveSeed}|recruitment-dept`);
  const rep = clubReputation(s, s.clubName);
  return {
    headOfRecruitment: `${FIRST_NAMES[rngInt(rng, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[rngInt(rng, 0, LAST_NAMES.length - 1)]}`,
    footballDirector: `${FIRST_NAMES[rngInt(rng, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[rngInt(rng, 0, LAST_NAMES.length - 1)]}`,
    recruitmentRating: clamp(int(rep * 0.6 + rngRange(rng, 5, 25)), 20, 90),
    negotiationRating: clamp(int(rep * 0.55 + rngRange(rng, 5, 28)), 20, 90),
    recruitmentReputation: clamp(int(rep * 0.8 + rngRange(rng, -5, 10)), 10, 95),
    historicTransfers: 0,
  };
}

/** Idempotent. Builds the football world once, then leaves it alone. */
export function ensureRecruitment(s: GameState): void {
  if (s.football && Array.isArray(s.football.players) && s.football.players.length > 0) {
    s.football.negotiations ??= [];
    s.football.transferHistory ??= [];
    s.football.contractHistory ??= [];
    s.football.seasonHistory ??= [];
    syncLegacySquad(s);
    return;
  }
  const { players, contracts } = generateWorld(s);
  const state: RecruitmentState = {
    players,
    contracts,
    negotiations: [],
    department: defaultDepartment(s),
    transferHistory: [],
    contractHistory: [],
    seasonHistory: [],
    nextContractId: contracts.length + 1,
    nextNegotiationId: 1,
    nextRecordId: 1,
    generatedSeason: s.season,
  };
  s.football = state;
  syncLegacySquad(s);
}

/* =========================================================================
   2. Lookups and squad architecture
========================================================================= */

export const playerById = (s: GameState, id: string): FootballPlayer | undefined =>
  s.football?.players.find((p) => p.id === id);

export const contractById = (s: GameState, id: string | null | undefined): PlayerContract | undefined =>
  id ? s.football?.contracts.find((c) => c.id === id) : undefined;

/** The one live contract for a player, if any. Never more than one. */
export function activeContract(s: GameState, playerId: string): PlayerContract | undefined {
  return s.football?.contracts.find(
    (c) => c.playerId === playerId && (c.status === "Active" || c.status === "Expiring"),
  );
}

export function squadOf(s: GameState, club: string): FootballPlayer[] {
  return (s.football?.players ?? [])
    .filter((p) => p.currentClubId === club)
    .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));
}

export const userSquad = (s: GameState) => squadOf(s, s.clubName);

export const freeAgents = (s: GameState) =>
  (s.football?.players ?? []).filter((p) => p.currentClubId === null);

export function contractExpiresAbs(c: PlayerContract): number {
  return absoluteWeek(c.expirySeason, c.expiryWeek);
}

export function weeksLeftOnContract(s: GameState, c: PlayerContract): number {
  return contractExpiresAbs(c) - absoluteWeek(s.season, s.week);
}

/** Squad groups. Reserve is a placeholder bucket for the future academy. */
export function squadGroup(s: GameState, p: FootballPlayer): SquadGroup {
  const c = activeContract(s, p.id);
  if (p.transferStatus === "listed" || p.transferStatus === "agreedTransfer") return "transferListed";
  if (c && weeksLeftOnContract(s, c) <= RENEWAL_WINDOW_WEEKS) return "contractExpiring";
  if (c && (c.squadRole === "Prospect")) return "reserve";
  return "firstTeam";
}

/** Legacy projection. GameState.squad is rebuilt from canonical state. */
export function syncLegacySquad(s: GameState): void {
  if (!s.football) return;
  s.squad = userSquad(s).map((p): Player => {
    const c = activeContract(s, p.id);
    return {
      id: p.id,
      name: playerName(p),
      position: p.primaryPosition,
      rating: p.currentAbility,
      age: ageOf(p, s.season),
      wage: c?.weeklyWage ?? 0,
      contractWeeks: c ? Math.max(0, weeksLeftOnContract(s, c)) : 0,
      value: p.marketValue,
    };
  });
}

/* =========================================================================
   3. Wages
========================================================================= */

export function clubWageBill(s: GameState, club: string): number {
  return int((s.football?.contracts ?? [])
    .filter((c) => c.clubId === club && (c.status === "Active" || c.status === "Expiring"))
    .reduce((a, c) => a + c.weeklyWage, 0));
}

export const userWageBill = (s: GameState) => clubWageBill(s, s.clubName);

export interface WageCommitment {
  season: number;
  weeklyWage: number;
  annualised: number;
  players: number;
}

/** Contracted wage liability per future season. Derived, never stored. */
export function futureWageCommitments(s: GameState, seasons = 3): WageCommitment[] {
  const out: WageCommitment[] = [];
  for (let i = 0; i < seasons; i++) {
    const season = s.season + i;
    const live = (s.football?.contracts ?? []).filter(
      (c) => c.clubId === s.clubName &&
        (c.status === "Active" || c.status === "Expiring") &&
        c.expirySeason >= season && c.startSeason <= season,
    );
    const weekly = int(live.reduce((a, c) => a + c.weeklyWage, 0));
    out.push({ season, weeklyWage: weekly, annualised: weekly * WEEKS_PER_SEASON, players: live.length });
  }
  return out;
}

/* =========================================================================
   4. Transfer budget — authority, never cash
   -------------------------------------------------------------------------
   The budget authorises spending; it does not hold money. A purchase needs
   BOTH remaining authority AND real cash in the bank.
========================================================================= */

export function transferSpendThisSeason(s: GameState): number {
  return int((s.football?.transferHistory ?? [])
    .filter((r) => r.season === s.season && r.toClubId === s.clubName)
    .reduce((a, r) => a + r.fee + r.signingBonus, 0));
}

export function transferIncomeThisSeason(s: GameState): number {
  return int((s.football?.transferHistory ?? [])
    .filter((r) => r.season === s.season && r.fromClubId === s.clubName)
    .reduce((a, r) => a + r.fee, 0));
}

export const netSpendThisSeason = (s: GameState) =>
  transferSpendThisSeason(s) - transferIncomeThisSeason(s);

/** Remaining authority. Never negative, never spendable on its own. */
export function remainingTransferBudget(s: GameState): number {
  return Math.max(0, int(s.transferBudget ?? 0) - transferSpendThisSeason(s));
}

export interface PurchaseAuthority {
  allowed: boolean;
  reason: string;
  cost: number;
  cashAvailable: number;
  budgetRemaining: number;
}

export function canAuthorisePurchase(s: GameState, cost: number): PurchaseAuthority {
  const budgetRemaining = remainingTransferBudget(s);
  const cashAvailable = int(s.cash);
  const c = int(cost);
  if (c > budgetRemaining) {
    return { allowed: false, reason: "Exceeds the authorised transfer budget", cost: c, cashAvailable, budgetRemaining };
  }
  if (c > cashAvailable) {
    return { allowed: false, reason: "The club does not hold the cash — budget authority is not money", cost: c, cashAvailable, budgetRemaining };
  }
  return { allowed: true, reason: "Authorised", cost: c, cashAvailable, budgetRemaining };
}

export function canAuthoriseWage(s: GameState, weeklyWage: number): { allowed: boolean; reason: string } {
  const cap = int(s.finance?.budgets?.wages ?? 0);
  if (cap <= 0) return { allowed: true, reason: "No wage ceiling set" };
  const projected = userWageBill(s) + int(weeklyWage);
  if (projected > cap) {
    return { allowed: false, reason: `Wage bill would reach £${projected.toLocaleString()}/wk against a £${cap.toLocaleString()}/wk ceiling` };
  }
  return { allowed: true, reason: "Within the wage ceiling" };
}

/* =========================================================================
   5. Transfer market — availability for football reasons only
========================================================================= */

export interface MarketEntry {
  player: FootballPlayer;
  contract?: PlayerContract;
  clubId: string | null;
  askingPrice: number;
  wageDemand: number;
  reason: string;
}

/** Deterministic asking price for a contracted player. */
export function askingPrice(s: GameState, p: FootballPlayer): number {
  const c = activeContract(s, p.id);
  if (!c) return 0; // free agent
  const weeksLeft = Math.max(0, weeksLeftOnContract(s, c));
  const contractFactor = clamp(0.45 + weeksLeft / (WEEKS_PER_SEASON * 3), 0.45, 1.35);
  const importance = c.squadRole === "Key Player" ? 1.4
    : c.squadRole === "First Team" ? 1.15
    : c.squadRole === "Rotation" ? 0.95 : 0.8;
  const listed = p.transferStatus === "listed" ? 0.8 : 1;
  const sellerRep = p.currentClubId ? clubReputation(s, p.currentClubId) : 50;
  const ambition = 0.9 + sellerRep / 250;
  return Math.max(20_000, int((p.marketValue * contractFactor * importance * listed * ambition) / 5_000) * 5_000);
}

export function wageDemand(s: GameState, p: FootballPlayer, role: SquadRole = "First Team"): number {
  const roleFactor = role === "Key Player" ? 1.15 : role === "First Team" ? 1 : role === "Rotation" ? 0.9 : 0.8;
  const ambitionGap = clamp(1 + (clubReputation(s, s.clubName) - p.reputation) / 240, 0.85, 1.2);
  const personality = p.personality === "Mercenary" ? 1.15 : p.personality === "Loyal" ? 0.92 : 1;
  return Math.max(250, int((p.wageExpectation * roleFactor * personality) / ambitionGap / 25) * 25);
}

/**
 * Why a player is on the market. Football reasons only — never a dice roll.
 * Returns null when the player is not realistically available.
 */
export function availabilityReason(s: GameState, p: FootballPlayer): string | null {
  if (p.currentClubId === s.clubName) return null;
  if (p.currentClubId === null) return "Free agent — out of contract";
  if (p.transferStatus === "agreedTransfer") return null;
  if (p.transferStatus === "listed") return "Transfer listed by his club";

  const c = activeContract(s, p.id);
  if (!c) return "No contract in place";
  const weeksLeft = weeksLeftOnContract(s, c);
  if (weeksLeft <= RENEWAL_WINDOW_WEEKS) return "Entering the final months of his contract";

  const club = p.currentClubId;
  const squad = squadOf(s, club);
  const samePosition = squad.filter((x) => x.primaryPosition === p.primaryPosition);
  const rankInPosition = samePosition.findIndex((x) => x.id === p.id);
  if (squad.length > SQUAD_SIZE && rankInPosition >= 2) return "Surplus to requirements in a crowded squad";
  if (rankInPosition >= SQUAD_TEMPLATE[p.primaryPosition] - 1 && squad.length > MIN_SQUAD_SIZE + 2) {
    return "Behind others in the pecking order";
  }

  const sellerRep = clubReputation(s, club);
  if (p.reputation > sellerRep + 18) return "Ambition outgrowing his club";
  if (sellerRep < 35 && c.weeklyWage > wageForAbility(p.currentAbility, sellerRep) * 1.1) {
    return "His club needs the wage off the books";
  }
  return null;
}

/** Every player the user could realistically approach. Pure — no mutation. */
export function transferMarket(s: GameState): MarketEntry[] {
  const out: MarketEntry[] = [];
  for (const p of s.football?.players ?? []) {
    const reason = availabilityReason(s, p);
    if (!reason) continue;
    out.push({
      player: p,
      contract: activeContract(s, p.id),
      clubId: p.currentClubId,
      askingPrice: askingPrice(s, p),
      wageDemand: wageDemand(s, p),
      reason,
    });
  }
  return out.sort((a, b) => b.player.currentAbility - a.player.currentAbility || a.player.id.localeCompare(b.player.id));
}

/* =========================================================================
   6. Negotiation — club talks, then player talks. Deterministic.
========================================================================= */

export interface NegotiationResult {
  ok: boolean;
  reason: string;
  negotiation?: TransferNegotiation;
}

const nowAbs = (s: GameState) => absoluteWeek(s.season, s.week);

function log(n: TransferNegotiation, entry: Omit<NegotiationLogEntry, "absoluteWeek">, abs: number): void {
  n.log.push({ ...entry, absoluteWeek: abs });
}

export function negotiationById(s: GameState, id: string): TransferNegotiation | undefined {
  return s.football?.negotiations.find((n) => n.id === id);
}

export const openNegotiations = (s: GameState) =>
  (s.football?.negotiations ?? []).filter(
    (n) => n.stage === "clubTalks" || n.stage === "playerTalks" || n.stage === "agreed",
  );

function nextNegotiationId(s: GameState): string {
  const n = s.football.nextNegotiationId ?? 1;
  s.football.nextNegotiationId = n + 1;
  return `TN-${String(n).padStart(5, "0")}`;
}

/**
 * Open club talks for a player. Buying side = the user.
 * Mutates in place — callers own the clone.
 */
export function openTransferNegotiationInPlace(
  s: GameState, playerId: string, fee: number, role: SquadRole = "First Team",
): NegotiationResult {
  ensureRecruitment(s);
  const p = playerById(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId === s.clubName) return { ok: false, reason: "He is already our player" };
  if (openNegotiations(s).some((n) => n.playerId === playerId)) {
    return { ok: false, reason: "Talks for this player are already open" };
  }
  if (!availabilityReason(s, p)) return { ok: false, reason: "His club will not entertain an approach" };
  if (userSquad(s).length >= MAX_SQUAD_SIZE) return { ok: false, reason: "The squad is already full" };

  const offerFee = p.currentClubId === null ? 0 : Math.max(0, int(fee));
  const auth = canAuthorisePurchase(s, offerFee);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  const abs = nowAbs(s);
  const n: TransferNegotiation = {
    id: nextNegotiationId(s),
    playerId,
    fromClubId: p.currentClubId,
    toClubId: s.clubName,
    direction: "in",
    stage: p.currentClubId === null ? "playerTalks" : "clubTalks",
    clubRounds: 1,
    playerRounds: 0,
    fee: offerFee,
    proposedWeeklyWage: wageDemand(s, p, role),
    proposedLengthSeasons: 3,
    proposedSigningBonus: int(offerFee * 0.05),
    proposedRole: role,
    createdSeason: s.season,
    createdAbsoluteWeek: abs,
    expiresAtAbsoluteWeek: abs + NEGOTIATION_TTL_WEEKS,
    log: [],
  };
  log(n, { round: 1, party: "club", action: "offer", note: `Offer of £${offerFee.toLocaleString()} tabled.` }, abs);
  s.football.negotiations.push(n);

  if (n.stage === "clubTalks") evaluateClubResponseInPlace(s, n);
  else log(n, { round: 0, party: "player", action: "offer", note: "Free agent — straight to personal terms." }, abs);
  return { ok: true, reason: "Offer submitted", negotiation: n };
}

/** Selling club's deterministic answer to the fee on the table. */
export function evaluateClubResponseInPlace(s: GameState, n: TransferNegotiation): void {
  const p = playerById(s, n.playerId);
  if (!p || n.stage !== "clubTalks") return;
  const ask = askingPrice(s, p);
  const rng = seededRng(s.saveSeed, "clubEval", n.id, n.clubRounds);
  const negotiationEdge = (s.football.department?.negotiationRating ?? 50) / 500; // up to 20%
  const threshold = int(ask * (0.97 - negotiationEdge + rngRange(rng, -0.03, 0.05)));
  const abs = nowAbs(s);

  if (n.fee >= threshold) {
    n.stage = "playerTalks";
    n.playerRounds = 1;
    log(n, { round: n.clubRounds, party: "club", action: "accept", note: `${n.fromClubId} accept £${n.fee.toLocaleString()}. Personal terms next.` }, abs);
    evaluatePlayerResponseInPlace(s, n);
    return;
  }
  if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS || n.fee < threshold * 0.7) {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    log(n, { round: n.clubRounds, party: "club", action: "reject", note: `${n.fromClubId} reject the approach.` }, abs);
    return;
  }
  n.clubCounterFee = Math.max(n.fee + 5_000, int(threshold / 5_000) * 5_000);
  log(n, { round: n.clubRounds, party: "club", action: "counter", note: `${n.fromClubId} want £${n.clubCounterFee.toLocaleString()}.` }, abs);
}

/** Improve the fee. Counts as a round; two rounds maximum. */
export function counterClubOfferInPlace(s: GameState, negotiationId: string, fee?: number): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage !== "clubTalks") return { ok: false, reason: "Club talks are closed" };
  if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS) return { ok: false, reason: "No negotiating rounds left" };
  const newFee = int(fee ?? n.clubCounterFee ?? n.fee);
  if (newFee <= n.fee) return { ok: false, reason: "An improved offer must be higher" };
  const auth = canAuthorisePurchase(s, newFee);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  n.fee = newFee;
  n.proposedSigningBonus = int(newFee * 0.05);
  n.clubRounds += 1;
  log(n, { round: n.clubRounds, party: "club", action: "offer", note: `Improved offer of £${newFee.toLocaleString()}.` }, nowAbs(s));
  evaluateClubResponseInPlace(s, n);
  return { ok: true, reason: "Improved offer submitted", negotiation: n };
}

/** Player's deterministic answer to the personal terms on the table. */
export function evaluatePlayerResponseInPlace(s: GameState, n: TransferNegotiation): void {
  const p = playerById(s, n.playerId);
  if (!p || n.stage !== "playerTalks") return;
  const demand = wageDemand(s, p, n.proposedRole);
  const rng = seededRng(s.saveSeed, "playerEval", n.id, n.playerRounds);
  const persuasion = (s.football.department?.negotiationRating ?? 50) / 600;
  const threshold = int(demand * (1.0 - persuasion + rngRange(rng, -0.04, 0.06)));
  const abs = nowAbs(s);

  if (n.proposedWeeklyWage >= threshold) {
    n.stage = "agreed";
    log(n, { round: n.playerRounds, party: "player", action: "accept", note: `${playerName(p)} agrees personal terms at £${n.proposedWeeklyWage.toLocaleString()}/wk.` }, abs);
    return;
  }
  if (n.playerRounds >= MAX_NEGOTIATION_ROUNDS || n.proposedWeeklyWage < threshold * 0.75) {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    log(n, { round: n.playerRounds, party: "player", action: "reject", note: `${playerName(p)} turns the club down.` }, abs);
    return;
  }
  n.playerCounterWage = int(threshold / 25) * 25;
  log(n, { round: n.playerRounds, party: "player", action: "counter", note: `${playerName(p)} wants £${n.playerCounterWage.toLocaleString()}/wk.` }, abs);
}

/** Improve personal terms. Counts as a round; two rounds maximum. */
export function improvePlayerTermsInPlace(
  s: GameState, negotiationId: string, wage?: number, seasons?: number, role?: SquadRole,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage !== "playerTalks") return { ok: false, reason: "Personal terms are closed" };
  if (n.playerRounds >= MAX_NEGOTIATION_ROUNDS) return { ok: false, reason: "No negotiating rounds left" };
  const newWage = int(wage ?? n.playerCounterWage ?? n.proposedWeeklyWage);
  if (newWage <= n.proposedWeeklyWage && !seasons && !role) {
    return { ok: false, reason: "Improved terms must actually improve" };
  }
  const auth = canAuthoriseWage(s, newWage);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  n.proposedWeeklyWage = Math.max(n.proposedWeeklyWage, newWage);
  if (seasons) n.proposedLengthSeasons = clamp(int(seasons), 1, 5);
  if (role) n.proposedRole = role;
  n.playerRounds += 1;
  log(n, { round: n.playerRounds, party: "club", action: "offer", note: `Terms improved to £${n.proposedWeeklyWage.toLocaleString()}/wk.` }, nowAbs(s));
  evaluatePlayerResponseInPlace(s, n);
  return { ok: true, reason: "Terms improved", negotiation: n };
}

export function withdrawNegotiationInPlace(s: GameState, negotiationId: string): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage === "completed") return { ok: false, reason: "The transfer has already gone through" };
  if (n.stage === "withdrawn" || n.stage === "rejected") return { ok: false, reason: "Talks are already closed" };
  n.stage = "withdrawn";
  n.resolvedAtAbsoluteWeek = nowAbs(s);
  log(n, { round: n.clubRounds, party: "club", action: "withdraw", note: "The club has withdrawn from talks." }, n.resolvedAtAbsoluteWeek);
  return { ok: true, reason: "Withdrawn" };
}

/* ---------- Outgoing: an AI club bids for one of ours ---------- */

/** Respond to an incoming bid. Accepting moves straight to completion. */
export function respondToIncomingOfferInPlace(
  s: GameState, negotiationId: string, action: "accept" | "reject" | "counter", counterFee?: number,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.direction !== "out") return { ok: false, reason: "Not an incoming offer" };
  if (n.stage !== "clubTalks") return { ok: false, reason: "The offer is no longer open" };
  const abs = nowAbs(s);
  const p = playerById(s, n.playerId);
  if (!p) return { ok: false, reason: "Unknown player" };

  if (action === "reject") {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    log(n, { round: n.clubRounds, party: "club", action: "reject", note: "We turned the offer down." }, abs);
    return { ok: true, reason: "Offer rejected" };
  }
  if (action === "counter") {
    if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS) return { ok: false, reason: "No negotiating rounds left" };
    const ask = Math.max(int(counterFee ?? askingPrice(s, p) * 1.15), n.fee + 5_000);
    n.clubRounds += 1;
    n.clubCounterFee = ask;
    log(n, { round: n.clubRounds, party: "club", action: "counter", note: `We want £${ask.toLocaleString()}.` }, abs);
    // Buying club's deterministic answer.
    const rng = seededRng(s.saveSeed, "aiBuyer", n.id, n.clubRounds);
    const ceiling = int(askingPrice(s, p) * rngRange(rng, 0.95, 1.3));
    if (ask <= ceiling) {
      n.fee = ask;
      n.stage = "agreed";
      log(n, { round: n.clubRounds, party: "club", action: "accept", note: `${n.toClubId} meet our valuation.` }, abs);
    } else {
      n.stage = "rejected";
      n.resolvedAtAbsoluteWeek = abs;
      log(n, { round: n.clubRounds, party: "club", action: "reject", note: `${n.toClubId} walk away.` }, abs);
    }
    return { ok: true, reason: "Counter submitted" };
  }

  n.stage = "agreed";
  log(n, { round: n.clubRounds, party: "club", action: "accept", note: `We accepted £${n.fee.toLocaleString()}.` }, abs);
  return { ok: true, reason: "Offer accepted" };
}

/* =========================================================================
   7. Completion — the single place a player changes club
========================================================================= */

function nextRecordId(s: GameState, prefix: string): string {
  const n = s.football.nextRecordId ?? 1;
  s.football.nextRecordId = n + 1;
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

function newContractId(s: GameState): string {
  const n = s.football.nextContractId ?? 1;
  s.football.nextContractId = n + 1;
  return `PC-${String(n).padStart(6, "0")}`;
}

function closeContract(
  s: GameState, c: PlayerContract, outcome: PlayerContractRecord["outcome"], status: PlayerContract["status"],
): void {
  c.status = status;
  const p = playerById(s, c.playerId);
  const record: PlayerContractRecord = {
    id: nextRecordId(s, "CR"),
    contractId: c.id,
    playerId: c.playerId,
    playerName: p ? playerName(p) : c.playerId,
    clubId: c.clubId,
    weeklyWage: c.weeklyWage,
    startSeason: c.startSeason,
    endSeason: s.season,
    seasons: Math.max(1, s.season - c.startSeason + 1),
    outcome,
    season: s.season,
    week: s.week,
  };
  s.football.contractHistory.push(record);
}

function issueContract(
  s: GameState, playerId: string, clubId: string, wage: number, seasons: number,
  role: SquadRole, signingBonus: number, fee: number,
): PlayerContract {
  const c: PlayerContract = {
    id: newContractId(s),
    playerId,
    clubId,
    startSeason: s.season,
    startWeek: s.week,
    expirySeason: s.season + Math.max(1, seasons) - 1,
    expiryWeek: WEEKS_PER_SEASON,
    weeklyWage: int(wage),
    squadRole: role,
    signingBonus: int(signingBonus),
    agreedTransferFee: int(fee),
    status: "Active",
  };
  s.football.contracts.push(c);
  return c;
}

/**
 * Complete an agreed transfer. Exactly-once: guarded by
 * negotiation.completedTransferId AND by finance dedupe keys.
 */
export function completeTransferInPlace(s: GameState, negotiationId: string): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.completedTransferId) return { ok: false, reason: "Already completed" };
  if (n.stage !== "agreed") return { ok: false, reason: "Nothing has been agreed" };
  const p = playerById(s, n.playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  const abs = nowAbs(s);

  if (n.direction === "in") {
    const auth = canAuthorisePurchase(s, n.fee + n.proposedSigningBonus);
    if (!auth.allowed) return { ok: false, reason: auth.reason };
    const wageAuth = canAuthoriseWage(s, n.proposedWeeklyWage);
    if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };

    if (n.fee > 0 && n.fromClubId) {
      postEntry(s, {
        category: "Transfers", subcategory: "Transfer fee",
        description: `${playerName(p)} signed from ${n.fromClubId}`,
        amount: n.fee, direction: "expense", sourceSystem: "transfers",
        linkedEntityId: n.id, dedupeKey: `transfer:${n.id}:fee`,
      });
    }
    if (n.proposedSigningBonus > 0) {
      postEntry(s, {
        category: "Transfers", subcategory: "Signing bonus",
        description: `Signing bonus — ${playerName(p)}`,
        amount: n.proposedSigningBonus, direction: "expense", sourceSystem: "transfers",
        linkedEntityId: n.id, dedupeKey: `transfer:${n.id}:bonus`,
      });
    }

    const old = activeContract(s, p.id);
    if (old) closeContract(s, old, "transferred", "Expired");
    const fresh = issueContract(
      s, p.id, s.clubName, n.proposedWeeklyWage, n.proposedLengthSeasons,
      n.proposedRole, n.proposedSigningBonus, n.fee,
    );
    p.currentClubId = s.clubName;
    p.contractId = fresh.id;
    p.transferStatus = "unlisted";
  } else {
    if (n.fee > 0) {
      postEntry(s, {
        category: "Transfers", subcategory: "Player sale",
        description: `${playerName(p)} sold to ${n.toClubId}`,
        amount: n.fee, direction: "income", sourceSystem: "transfers",
        linkedEntityId: n.id, dedupeKey: `transfer:${n.id}:sale`,
      });
    }
    const old = activeContract(s, p.id);
    if (old) closeContract(s, old, "transferred", "Expired");
    const buyerRep = clubReputation(s, n.toClubId);
    const fresh = issueContract(
      s, p.id, n.toClubId, wageForAbility(p.currentAbility, buyerRep), 3, "First Team", 0, n.fee,
    );
    p.currentClubId = n.toClubId;
    p.contractId = fresh.id;
    p.transferStatus = "unlisted";
  }

  const record: TransferRecord = {
    id: nextRecordId(s, "TR"),
    playerId: p.id,
    playerName: playerName(p),
    position: p.primaryPosition,
    fromClubId: n.fromClubId,
    toClubId: n.toClubId,
    fee: n.fee,
    weeklyWage: n.direction === "in" ? n.proposedWeeklyWage : 0,
    signingBonus: n.direction === "in" ? n.proposedSigningBonus : 0,
    season: s.season,
    week: s.week,
    absoluteWeek: abs,
    type: n.fee > 0 ? "transfer" : "freeTransfer",
    negotiationId: n.id,
  };
  s.football.transferHistory.push(record);
  s.football.department.historicTransfers += 1;

  n.stage = "completed";
  n.completedTransferId = record.id;
  n.resolvedAtAbsoluteWeek = abs;
  log(n, { round: n.clubRounds, party: "club", action: "complete", note: `Deal done: ${playerName(p)} to ${n.toClubId}.` }, abs);

  syncLegacySquad(s);
  return { ok: true, reason: "Transfer completed", negotiation: n };
}

/* =========================================================================
   8. Contracts — renewal, release, expiry
========================================================================= */

export interface RenewalTerms {
  weeklyWage: number;
  seasons: number;
  role: SquadRole;
  signingBonus: number;
}

/** Deterministic terms the player would sign for right now. */
export function renewalTerms(s: GameState, playerId: string): RenewalTerms | null {
  const p = playerById(s, playerId);
  const c = p ? activeContract(s, p.id) : undefined;
  if (!p || !c) return null;
  const rng = seededRng(s.saveSeed, "renewal", p.id, c.id, s.season);
  const uplift = 1 + clamp((p.currentAbility - 55) / 120, 0, 0.5) + rngRange(rng, 0, 0.12);
  const wage = Math.max(c.weeklyWage, int((wageDemand(s, p, c.squadRole) * uplift) / 25) * 25);
  const age = ageOf(p, s.season);
  return {
    weeklyWage: wage,
    seasons: age >= 32 ? 1 : age >= 29 ? 2 : 3,
    role: c.squadRole,
    signingBonus: int(wage * 4),
  };
}

/**
 * Renew a contract. The new contract REPLACES the old one: the old row is
 * closed with a history record and exactly one contract stays active.
 */
export function renewContractInPlace(
  s: GameState, playerId: string, override?: Partial<RenewalTerms>,
): NegotiationResult {
  const p = playerById(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId !== s.clubName) return { ok: false, reason: "Not our player" };
  const old = activeContract(s, playerId);
  if (!old) return { ok: false, reason: "No contract to renew" };
  const base = renewalTerms(s, playerId);
  if (!base) return { ok: false, reason: "No terms available" };
  const terms: RenewalTerms = { ...base, ...override };

  const rng = seededRng(s.saveSeed, "renewalEval", p.id, s.season, old.id);
  const required = int(base.weeklyWage * (0.97 + rngRange(rng, -0.02, 0.06)));
  if (terms.weeklyWage < required) {
    return { ok: false, reason: `${playerName(p)} wants at least £${required.toLocaleString()}/wk` };
  }
  const wageAuth = canAuthoriseWage(s, terms.weeklyWage - old.weeklyWage);
  if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };
  if (terms.signingBonus > 0 && terms.signingBonus > int(s.cash)) {
    return { ok: false, reason: "The club cannot pay the signing bonus" };
  }

  if (terms.signingBonus > 0) {
    postEntry(s, {
      category: "Transfers", subcategory: "Signing bonus",
      description: `Renewal bonus — ${playerName(p)}`,
      amount: terms.signingBonus, direction: "expense", sourceSystem: "transfers",
      linkedEntityId: old.id, dedupeKey: `renewal:${old.id}:s${s.season}:bonus`,
    });
  }

  closeContract(s, old, "renewed", "Expired");
  const fresh = issueContract(
    s, p.id, s.clubName, terms.weeklyWage, terms.seasons, terms.role, terms.signingBonus, 0,
  );
  p.contractId = fresh.id;
  p.transferStatus = "unlisted";
  syncLegacySquad(s);
  return { ok: true, reason: `Renewed to ${fresh.expirySeason}` };
}

/** Release a player, paying out the remainder of his deal (capped). */
export function releasePlayerInPlace(s: GameState, playerId: string): NegotiationResult {
  const p = playerById(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId !== s.clubName) return { ok: false, reason: "Not our player" };
  const c = activeContract(s, playerId);
  if (!c) return { ok: false, reason: "No contract to terminate" };
  const weeksLeft = Math.max(0, weeksLeftOnContract(s, c));
  const compensation = int(c.weeklyWage * Math.min(weeksLeft, 12));
  if (compensation > int(s.cash)) return { ok: false, reason: "Cannot afford the settlement" };

  if (compensation > 0) {
    postEntry(s, {
      category: "Transfers", subcategory: "Compensation",
      description: `Contract settlement — ${playerName(p)}`,
      amount: compensation, direction: "expense", sourceSystem: "transfers",
      linkedEntityId: c.id, dedupeKey: `release:${c.id}`,
    });
  }
  closeContract(s, c, "released", "Released");
  p.currentClubId = null;
  p.contractId = null;
  p.transferStatus = "listed";
  s.football.transferHistory.push({
    id: nextRecordId(s, "TR"),
    playerId: p.id, playerName: playerName(p), position: p.primaryPosition,
    fromClubId: s.clubName, toClubId: null, fee: 0, weeklyWage: 0,
    signingBonus: 0, season: s.season, week: s.week, absoluteWeek: nowAbs(s),
    type: "release",
  });
  syncLegacySquad(s);
  return { ok: true, reason: `Released. Settlement £${compensation.toLocaleString()}` };
}

export function setTransferStatusInPlace(
  s: GameState, playerId: string, status: FootballPlayer["transferStatus"],
): NegotiationResult {
  const p = playerById(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId !== s.clubName) return { ok: false, reason: "Not our player" };
  p.transferStatus = status;
  return { ok: true, reason: status === "listed" ? "Transfer listed" : "Removed from the list" };
}

/* =========================================================================
   9. Weekly runner
========================================================================= */

/** Contracts that have run out: player leaves, records are written. */
function processExpiries(s: GameState): void {
  const abs = nowAbs(s);
  for (const c of s.football.contracts) {
    if (c.status !== "Active" && c.status !== "Expiring") continue;
    const left = contractExpiresAbs(c) - abs;
    if (left <= 0) {
      const p = playerById(s, c.playerId);
      c.status = "Expired";
      s.football.contractHistory.push({
        id: nextRecordId(s, "CR"),
        contractId: c.id, playerId: c.playerId,
        playerName: p ? playerName(p) : c.playerId,
        clubId: c.clubId, weeklyWage: c.weeklyWage,
        startSeason: c.startSeason, endSeason: s.season,
        seasons: Math.max(1, s.season - c.startSeason + 1),
        outcome: "expired", season: s.season, week: s.week,
      });
      if (p && p.contractId === c.id) {
        p.currentClubId = null;
        p.contractId = null;
        p.transferStatus = "listed";
        s.football.transferHistory.push({
          id: nextRecordId(s, "TR"),
          playerId: p.id, playerName: playerName(p), position: p.primaryPosition,
          fromClubId: c.clubId, toClubId: null, fee: 0, weeklyWage: 0,
          signingBonus: 0, season: s.season, week: s.week, absoluteWeek: abs,
          type: "contractExpiry",
        });
      }
    } else if (left <= RENEWAL_WINDOW_WEEKS) {
      c.status = "Expiring";
    }
  }
}

/** Close out negotiations nobody moved on. */
function expireNegotiations(s: GameState): void {
  const abs = nowAbs(s);
  for (const n of s.football.negotiations) {
    if (n.stage === "completed" || n.stage === "rejected" || n.stage === "withdrawn") continue;
    if (abs > n.expiresAtAbsoluteWeek) {
      n.stage = "withdrawn";
      n.resolvedAtAbsoluteWeek = abs;
      log(n, { round: n.clubRounds, party: "club", action: "withdraw", note: "Talks lapsed without agreement." }, abs);
    }
  }
}

/** Deterministic AI interest in one of our players. At most one per week. */
function generateIncomingOffers(s: GameState, windowOpen: boolean): void {
  if (!windowOpen) return;
  const abs = nowAbs(s);
  const rng = seededRng(s.saveSeed, "incoming", s.season, s.week);
  if (rng() > 0.28) return;

  const squad = userSquad(s);
  if (squad.length <= MIN_SQUAD_SIZE) return;
  const targets = squad.filter(
    (p) => !openNegotiations(s).some((n) => n.playerId === p.id) && p.currentAbility >= 55,
  );
  if (!targets.length) return;
  const p = targets[rngInt(rng, 0, targets.length - 1)];

  const rivals = (s.leagues ?? [])
    .flatMap((l) => l.clubIds)
    .filter((c) => c !== s.clubName)
    .sort((a, b) => a.localeCompare(b));
  if (!rivals.length) return;
  // Clubs that can plausibly afford him show interest first.
  const suitors = rivals.filter((c) => clubReputation(s, c) >= p.reputation - 12);
  const buyer = (suitors.length ? suitors : rivals)[rngInt(rng, 0, (suitors.length ? suitors : rivals).length - 1)];

  const listedBoost = p.transferStatus === "listed" ? 1.0 : rngRange(rng, 0.72, 1.02);
  const fee = Math.max(20_000, int((askingPrice(s, p) * listedBoost) / 5_000) * 5_000);

  const n: TransferNegotiation = {
    id: nextNegotiationId(s),
    playerId: p.id,
    fromClubId: s.clubName,
    toClubId: buyer,
    direction: "out",
    stage: "clubTalks",
    clubRounds: 1,
    playerRounds: 0,
    fee,
    proposedWeeklyWage: 0,
    proposedLengthSeasons: 3,
    proposedSigningBonus: 0,
    proposedRole: "First Team",
    createdSeason: s.season,
    createdAbsoluteWeek: abs,
    expiresAtAbsoluteWeek: abs + NEGOTIATION_TTL_WEEKS,
    log: [],
  };
  log(n, { round: 1, party: "club", action: "offer", note: `${buyer} bid £${fee.toLocaleString()} for ${playerName(p)}.` }, abs);
  s.football.negotiations.push(n);
}

/**
 * AI recruitment. Believable, not optimal: clubs only act when they are
 * short of bodies, and they sign the best free agent they can plausibly pay.
 */
function runAiRecruitment(s: GameState, windowOpen: boolean): void {
  if (!windowOpen) return;
  const rng = seededRng(s.saveSeed, "aiRecruit", s.season, s.week);
  const clubs = (s.leagues ?? [])
    .flatMap((l) => l.clubIds)
    .filter((c) => c !== s.clubName)
    .sort((a, b) => a.localeCompare(b));

  // Two clubs act each week, chosen deterministically by rotation.
  const start = (s.season * WEEKS_PER_SEASON + s.week) % Math.max(1, clubs.length);
  for (let k = 0; k < 2 && clubs.length; k++) {
    const club = clubs[(start + k) % clubs.length];
    const squad = squadOf(s, club);
    if (squad.length >= MIN_SQUAD_SIZE + 2) continue;
    const rep = clubReputation(s, club);
    const pool = freeAgents(s)
      .filter((p) => p.reputation <= rep + 8)
      .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));
    if (!pool.length) continue;
    const pick = pool[Math.min(pool.length - 1, rngInt(rng, 0, 2))];
    const c = issueContract(
      s, pick.id, club, wageForAbility(pick.currentAbility, rep),
      rngInt(rng, 1, 3), "Rotation", 0, 0,
    );
    pick.currentClubId = club;
    pick.contractId = c.id;
    pick.transferStatus = "unlisted";
    s.football.transferHistory.push({
      id: nextRecordId(s, "TR"),
      playerId: pick.id, playerName: playerName(pick), position: pick.primaryPosition,
      fromClubId: null, toClubId: club, fee: 0, weeklyWage: c.weeklyWage,
      signingBonus: 0, season: s.season, week: s.week, absoluteWeek: nowAbs(s),
      type: "freeTransfer",
    });
  }
}

/** Called once per week from advanceWeek, before the inbox runs. */
export function runRecruitmentWeek(s: GameState, windowOpen: boolean): void {
  ensureRecruitment(s);
  processExpiries(s);
  expireNegotiations(s);
  generateIncomingOffers(s, windowOpen);
  runAiRecruitment(s, windowOpen);
  syncLegacySquad(s);
}

/** Season rollover: age the world, refresh values, write the season record. */
export function closeRecruitmentSeason(s: GameState, season: number): RecruitmentSeasonSummary | null {
  ensureRecruitment(s);
  if (s.football.seasonHistory.some((x) => x.season === season)) return null;
  const rows = s.football.transferHistory.filter((r) => r.season === season);
  const summary: RecruitmentSeasonSummary = {
    season,
    spend: int(rows.filter((r) => r.toClubId === s.clubName).reduce((a, r) => a + r.fee + r.signingBonus, 0)),
    income: int(rows.filter((r) => r.fromClubId === s.clubName).reduce((a, r) => a + r.fee, 0)),
    netSpend: 0,
    playersIn: rows.filter((r) => r.toClubId === s.clubName).length,
    playersOut: rows.filter((r) => r.fromClubId === s.clubName).length,
    wageBillAtClose: userWageBill(s),
  };
  summary.netSpend = summary.spend - summary.income;
  s.football.seasonHistory.push(summary);
  return summary;
}

/** Player values drift with age at rollover. Abilities are NOT developed here. */
export function rollRecruitmentToNewSeason(s: GameState): void {
  ensureRecruitment(s);
  for (const p of s.football.players) {
    const age = ageOf(p, s.season);
    p.marketValue = valueForPlayer(p.currentAbility, p.potentialAbility, age);
    p.wageExpectation = wageForAbility(p.currentAbility, p.currentClubId ? clubReputation(s, p.currentClubId) : 45);
  }
  syncLegacySquad(s);
}

/* =========================================================================
   10. Snapshot for UI and board
========================================================================= */

export interface RecruitmentSnapshot {
  squadSize: number;
  averageAbility: number;
  averageAge: number;
  wageBillWeekly: number;
  wageBudgetWeekly: number;
  expiringContracts: number;
  transferBudget: number;
  budgetRemaining: number;
  spendThisSeason: number;
  incomeThisSeason: number;
  netSpend: number;
  openNegotiations: number;
  incomingOffers: number;
}

export function recruitmentSnapshot(s: GameState): RecruitmentSnapshot {
  const squad = userSquad(s);
  const abilities = squad.map((p) => p.currentAbility);
  const ages = squad.map((p) => ageOf(p, s.season));
  const open = openNegotiations(s);
  return {
    squadSize: squad.length,
    averageAbility: abilities.length ? abilities.reduce((a, b) => a + b, 0) / abilities.length : 0,
    averageAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0,
    wageBillWeekly: userWageBill(s),
    wageBudgetWeekly: int(s.finance?.budgets?.wages ?? 0),
    expiringContracts: squad.filter((p) => {
      const c = activeContract(s, p.id);
      return !!c && weeksLeftOnContract(s, c) <= RENEWAL_WINDOW_WEEKS;
    }).length,
    transferBudget: int(s.transferBudget ?? 0),
    budgetRemaining: remainingTransferBudget(s),
    spendThisSeason: transferSpendThisSeason(s),
    incomeThisSeason: transferIncomeThisSeason(s),
    netSpend: netSpendThisSeason(s),
    openNegotiations: open.length,
    incomingOffers: open.filter((n) => n.direction === "out" && n.stage === "clubTalks").length,
  };
}

/** Share of the squad contracted beyond this season, 0-100. */
export function contractSecurityPct(s: GameState): number {
  const squad = userSquad(s);
  if (!squad.length) return 100;
  const secure = squad.filter((p) => {
    const c = activeContract(s, p.id);
    return !!c && c.expirySeason > s.season;
  }).length;
  return (secure / squad.length) * 100;
}

/** Average age of the user's squad. 0 when the squad is empty. */
export function averageSquadAge(s: GameState): number {
  const squad = userSquad(s);
  if (!squad.length) return 0;
  return squad.reduce((a, p) => a + ageOf(p, s.season), 0) / squad.length;
}

/** Count of players signed by the user's club this season. */
export function incomingTransfersThisSeason(s: GameState): number {
  return (s.football?.transferHistory ?? [])
    .filter((r) => r.season === s.season && r.toClubId === s.clubName).length;
}

/** Count of contracts renewed at the user's club this season. */
export function renewalsThisSeason(s: GameState): number {
  return (s.football?.contractHistory ?? [])
    .filter((r) => r.season === s.season && r.clubId === s.clubName && r.outcome === "renewed").length;
}

/** Persistent shortlist of player ids the chairman is watching. */
export function shortlistIds(s: GameState): string[] {
  return s.football?.shortlist ?? [];
}

export function toggleShortlistInPlace(s: GameState, playerId: string): void {
  if (!s.football) return;
  if (!Array.isArray(s.football.shortlist)) s.football.shortlist = [];
  const i = s.football.shortlist.indexOf(playerId);
  if (i >= 0) s.football.shortlist.splice(i, 1);
  else s.football.shortlist.push(playerId);
}

export function toggleShortlist(s: GameState, playerId: string): GameState {
  const w = structuredClone(s);
  toggleShortlistInPlace(w, playerId);
  return w;
}

/* ---------- Cloning wrappers for UI callers ---------- */

const cloned = (s: GameState, fn: (w: GameState) => unknown): { state: GameState; result: NegotiationResult } => {
  const w = structuredClone(s);
  const result = fn(w) as NegotiationResult;
  syncLegacySquad(w);
  return { state: w, result };
};

export const submitTransferOffer = (s: GameState, playerId: string, fee: number, role?: SquadRole) =>
  cloned(s, (w) => openTransferNegotiationInPlace(w, playerId, fee, role));
export const improveTransferOffer = (s: GameState, id: string, fee?: number) =>
  cloned(s, (w) => counterClubOfferInPlace(w, id, fee));
export const improvePersonalTerms = (s: GameState, id: string, wage?: number, seasons?: number, role?: SquadRole) =>
  cloned(s, (w) => improvePlayerTermsInPlace(w, id, wage, seasons, role));
export const withdrawFromTalks = (s: GameState, id: string) =>
  cloned(s, (w) => withdrawNegotiationInPlace(w, id));
export const completeTransfer = (s: GameState, id: string) =>
  cloned(s, (w) => completeTransferInPlace(w, id));
export const respondToIncomingOffer = (
  s: GameState, id: string, action: "accept" | "reject" | "counter", fee?: number,
) => cloned(s, (w) => respondToIncomingOfferInPlace(w, id, action, fee));
export const renewContract = (s: GameState, playerId: string, override?: Partial<RenewalTerms>) =>
  cloned(s, (w) => renewContractInPlace(w, playerId, override));
export const releasePlayer = (s: GameState, playerId: string) =>
  cloned(s, (w) => releasePlayerInPlace(w, playerId));
export const setTransferStatus = (s: GameState, playerId: string, status: FootballPlayer["transferStatus"]) =>
  cloned(s, (w) => setTransferStatusInPlace(w, playerId, status));

export { SQUAD_ROLES };
