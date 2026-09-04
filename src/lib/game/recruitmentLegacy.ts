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
  FootballPlayer,
  GameState,
  PlayerContract,
  PlayerContractRecord,
  Player,
  Position,
  RecruitmentDepartment,
  RecruitmentSeasonSummary,
  RecruitmentState,
  SquadRole,
  TransferNegotiation,
  TransferRecord,
  PreferredFoot,
  PlayerPersonality,
  NegotiationLogEntry,
  SquadGroup,
} from "./types";
import { hashString, seededRng, rngInt, rngRange } from "./rng";
import { absoluteWeek, WEEKS_PER_SEASON } from "./time";
import { isTransferWindowOpen } from "./calendar";
import { postEntry } from "./finance";
import { clubReputation } from "./reputation";
import { facilityModifiers } from "./infrastructure";
import { buildWorldSimulationPlan } from "./world";
import { ensureFringeWorldState, makeFringeClubState } from "./fringe";
import { legacyTierToFootballLevel, type FootballLevel } from "./footballLevel";
import {
  recruitmentContractWageForLevel,
  recruitmentLevelOfClub,
  recruitmentLevelOfUser,
  recruitmentNormaliseTransferFeeForClub,
  recruitmentNormaliseTransferFeeForUser,
  recruitmentPlayerValue,
  recruitmentSustainableWageBill,
  recruitmentTransferFeePolicyForClub,
  recruitmentTransferFeePolicyForUser,
  recruitmentUserNegotiationWage,
  recruitmentUserNegotiationWageStep,
  recruitmentWageForClub,
  recruitmentWageForLevel,
} from "./recruitmentEconomy";
import {
  materializeTransferTargetForCompletionInPlace,
  recordCompletedTransferLifecycleInPlace,
  syncTransferTargetNegotiationInPlace,
  transferTargetAskingPrice,
  transferTargetAvailabilityReason,
  transferTargetPlayer,
} from "./recruitmentTargetBridge";

const int = (n: number) => Math.round(n) || 0;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Compatibility edge: persisted leagues still store legacy tiers. */
function deepestWorldFootballLevel(s: GameState): FootballLevel {
  const deepestLegacyTier = Math.max(...(s.leagues ?? []).map((league) => league.tier ?? 1), 1);
  return legacyTierToFootballLevel(deepestLegacyTier);
}

/* ---------- Constants ---------- */

export const SQUAD_TEMPLATE: Record<Position, number> = { GK: 3, DEF: 8, MID: 7, FWD: 4 };
export const SQUAD_SIZE =
  SQUAD_TEMPLATE.GK + SQUAD_TEMPLATE.DEF + SQUAD_TEMPLATE.MID + SQUAD_TEMPLATE.FWD;
export const MIN_SQUAD_SIZE = 16;
export const MAX_SQUAD_SIZE = 30;
/**
 * A deep, persistent unattached-player market. This is deliberately large:
 * lower-league recruitment should be about finding the right player among
 * hundreds of plausible options, not choosing between a couple of names.
 */
export const FREE_AGENT_POOL = 900;
/** Both club and player talks allow at most this many negotiation rounds. */
export const MAX_NEGOTIATION_ROUNDS = 2;

/** Share of a club's sustainable wage bill that goes to players (rest = staff). */
export const PLAYER_WAGE_SHARE = 0.78;
/** How heavily a freshly generated squad is already committed against that share. */
export const OPENING_WAGE_LOAD = 0.82;

/**
 * Converts compact financial identity into a conservative hydration modifier.
 * Even the strongest band remains below the club's sustainable total wage
 * bill after the player/staff split and opening-load factors are applied.
 */
export function fringeFinanceWageFactor(financeBand: number | undefined): number {
  if (financeBand === undefined) return 1;
  return clamp(0.85 + (clamp(int(financeBand), 1, 5) - 1) * 0.075, 0.85, 1.15);
}

/** Weeks before expiry a contract is flagged as expiring / renewable. */
export const RENEWAL_WINDOW_WEEKS = 20;
/** Weeks an untouched negotiation stays on the table. */
export const NEGOTIATION_TTL_WEEKS = 3;
/** Season 1 is played in this in-world year. */
export const BASE_YEAR = 2000;

const SQUAD_ROLES: SquadRole[] = ["Key Player", "First Team", "Rotation", "Prospect"];
const FOOT: PreferredFoot[] = ["Right", "Right", "Right", "Left", "Both"];
const PERSONALITIES: PlayerPersonality[] = [
  "Balanced",
  "Ambitious",
  "Loyal",
  "Professional",
  "Mercenary",
  "Temperamental",
];
const NATIONS = [
  "England",
  "Scotland",
  "Wales",
  "Ireland",
  "France",
  "Spain",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Germany",
  "Italy",
  "Denmark",
  "Norway",
  "Sweden",
  "Poland",
  "Brazil",
  "Argentina",
  "Nigeria",
  "Ghana",
  "Senegal",
  "Japan",
  "USA",
];
const FIRST_NAMES = [
  "Alfie",
  "Callum",
  "Declan",
  "Ethan",
  "Finlay",
  "George",
  "Harvey",
  "Isaac",
  "Jacob",
  "Kieran",
  "Liam",
  "Mason",
  "Noah",
  "Oliver",
  "Patrick",
  "Reuben",
  "Samuel",
  "Theo",
  "Vincent",
  "William",
  "Andres",
  "Bruno",
  "Diogo",
  "Emile",
  "Fabio",
  "Gustav",
  "Hugo",
  "Ibrahim",
  "Joris",
  "Kasper",
  "Lars",
  "Matteo",
  "Nikola",
  "Omar",
  "Pedro",
  "Rafael",
  "Stefan",
  "Tomas",
  "Viktor",
  "Yannick",
];
const LAST_NAMES = [
  "Ainsworth",
  "Barlow",
  "Cartwright",
  "Dunne",
  "Eastwood",
  "Fenton",
  "Gallagher",
  "Hollis",
  "Irvine",
  "Jarvis",
  "Kendall",
  "Lockhart",
  "Marsden",
  "Naylor",
  "Ogden",
  "Pemberton",
  "Quigley",
  "Radcliffe",
  "Sutcliffe",
  "Thornton",
  "Underwood",
  "Vickers",
  "Whitfield",
  "Yates",
  "Almeida",
  "Bergkamp",
  "Cardoso",
  "De Vries",
  "Eriksen",
  "Ferrari",
  "Gundogan",
  "Haugen",
  "Ivanov",
  "Jansen",
  "Kovac",
  "Lindqvist",
  "Moreno",
  "Nowak",
  "Oduya",
  "Petit",
  "Rossi",
  "Silva",
  "Toure",
  "Vidal",
  "Weiss",
  "Zanetti",
];

/* ---------- Small helpers ---------- */

export const playerName = (p: FootballPlayer) => `${p.firstName} ${p.lastName}`;

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export function ageOf(p: FootballPlayer, season: number): number {
  return BASE_YEAR + season - 1 - p.dateOfBirth.year;
}

/**
 * Wage a given ability commands, £/week. Single definition, used everywhere.
 * The real economics live in economy.ts: the level of football a club plays
 * at sets the scale, the club's own standing nudges it up or down.
 */
/** @deprecated Compatibility boundary: tier is the persisted legacy economic tier. */
export function wageForAbility(
  ability: number,
  clubRep = 55,
  tier = 1,
  age?: number,
  potential?: number,
): number {
  return recruitmentWageForLevel(legacyTierToFootballLevel(tier), ability, clubRep, age, potential);
}

/** Market value of an ability/age pair, £. Single definition. */
/** @deprecated Compatibility boundary: tier is the persisted legacy economic tier. */
export function valueForPlayer(ability: number, potential: number, age: number, tier = 1): number {
  return recruitmentPlayerValue(ability, potential, age, legacyTierToFootballLevel(tier));
}

/* =========================================================================
   1. Deterministic world generation
========================================================================= */

function makePlayerFor(
  saveSeed: string,
  clubId: string | null,
  index: number,
  tierRating: number,
  season: number,
  level: FootballLevel = 3,
  clubRep = 50,
): FootballPlayer {
  const key = `${saveSeed}|player|${clubId ?? "free"}|${index}`;
  const rng = seededRng(key);
  const id = `p-${slug(clubId ?? "free")}-${index}-${hashString(key).toString(36)}`;

  const slots: Position[] = [];
  (Object.keys(SQUAD_TEMPLATE) as Position[]).forEach((pos) => {
    for (let i = 0; i < SQUAD_TEMPLATE[pos]; i++) slots.push(pos);
  });
  const primaryPosition = slots[index % slots.length];

  // Free-agent ability is bottom-heavy across a broad band. Most are ordinary
  // professionals, good players are uncommon and elite unattached players are
  // exceptional. Club squads remain centred on the level of their division.
  const currentAbility =
    clubId === null
      ? clamp(int(35 + Math.pow(rng(), 1.85) * 52), 35, 89)
      : clamp(int(tierRating + rngRange(rng, -9, 9)), 35, 94);
  const age = rngInt(rng, 17, 35);
  const potentialAbility = clamp(
    int(currentAbility + (age < 24 ? rngRange(rng, 2, 16) : rngRange(rng, -1, 4))),
    currentAbility,
    96,
  );
  const reputation = clamp(int(currentAbility * 0.85 + rngRange(rng, -6, 8)), 5, 98);
  const secondary: Position[] =
    rng() > 0.65
      ? [
          (["GK", "DEF", "MID", "FWD"] as Position[]).filter((p) => p !== primaryPosition)[
            rngInt(rng, 0, 2)
          ],
        ]
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
    marketValue: recruitmentPlayerValue(currentAbility, potentialAbility, age, level),
    wageExpectation: recruitmentWageForLevel(level, currentAbility, clubRep, age, potentialAbility),
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

/** Build detailed squads for the current Focus bubble plus a free-agent pool. */
export function generateWorld(s: GameState): {
  players: FootballPlayer[];
  contracts: PlayerContract[];
} {
  const players: FootballPlayer[] = [];
  const contracts: PlayerContract[] = [];
  let contractSeq = 1;

  const clubs = buildWorldSimulationPlan(s).focusClubIds;

  for (const club of clubs) {
    const rep = clubReputation(s, club);
    const level = recruitmentLevelOfClub(s, club);
    const tierRating = clamp(42 + rep * 0.42, 40, 88);
    const squad: FootballPlayer[] = [];
    for (let i = 0; i < SQUAD_SIZE; i++) {
      squad.push(makePlayerFor(s.saveSeed, club, i, tierRating, s.season, level, rep));
    }
    squad.sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));

    // Opening contracts are normalised to the club's sustainable player wage
    // load. The tier wage curve still sets the SHAPE of the squad's pay
    // hierarchy; this only decides how heavily the club is already committed,
    // so a fresh save never starts above its own board wage ceiling with no
    // room to sign anybody. Bounded so the curve stays authoritative.
    const rawBill = squad.reduce(
      (a, p) =>
        a +
        recruitmentWageForLevel(
          level,
          p.currentAbility,
          rep,
          ageOf(p, s.season),
          p.potentialAbility,
        ),
      0,
    );
    const targetBill =
      recruitmentSustainableWageBill(s, club) * PLAYER_WAGE_SHARE * OPENING_WAGE_LOAD;
    const wageScalar = rawBill > 0 ? clamp(targetBill / rawBill, 0.6, 1.5) : 1;

    squad.forEach((p, i) => {
      const rng = seededRng(`${s.saveSeed}|contract|${p.id}`);
      const seasons = rngInt(rng, 1, 4);
      const base = recruitmentWageForLevel(
        level,
        p.currentAbility,
        rep,
        ageOf(p, s.season),
        p.potentialAbility,
      );
      const contract: PlayerContract = {
        id: `PC-${String(contractSeq++).padStart(6, "0")}`,
        playerId: p.id,
        clubId: club,
        startSeason: s.season,
        startWeek: 1,
        expirySeason: s.season + seasons - 1,
        expiryWeek: WEEKS_PER_SEASON,
        weeklyWage: recruitmentContractWageForLevel(level, base, wageScalar),
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

  const freeAgentLevel = deepestWorldFootballLevel(s);
  for (let i = 0; i < FREE_AGENT_POOL; i++) {
    const p = makePlayerFor(s.saveSeed, null, i, 52, s.season, freeAgentLevel, 45);
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

function hydrationContractId(s: GameState, clubId: string, playerId: string): string {
  return `PC-H-${(hashString(`${s.saveSeed}|hydrate|${clubId}|${playerId}`) >>> 0).toString(36)}`;
}

/**
 * Moves the fidelity boundary without maintaining duplicate club state.
 * A newly focused club is hydrated once; a club leaving Focus is reduced to
 * its compact Fringe snapshot on the next recruitment reconciliation.
 */
export function reconcileRecruitmentFidelity(s: GameState): void {
  if (!s.football) return;
  const plan = buildWorldSimulationPlan(s);
  const focus = new Set(plan.focusClubIds);
  const fringe = new Set(plan.fringeClubIds);
  const previousFringe = s.fringeWorld ?? {};

  // Preserve the football identity of clubs leaving Focus before their
  // detailed players and contracts are discarded. The compact strength is the
  // rounded squad average, so returning clubs hydrate from what they actually
  // were rather than being regenerated from reputation alone.
  for (const profile of plan.clubs) {
    if (profile.level !== "fringe") continue;
    const squad = s.football.players.filter((player) => player.currentClubId === profile.clubId);
    if (!squad.length) continue;
    const compact = makeFringeClubState(s, profile.clubId, profile.leagueId, profile.tier);
    compact.strength = clamp(
      int(squad.reduce((total, player) => total + player.currentAbility, 0) / squad.length),
      1,
      100,
    );
    compact.form = previousFringe[profile.clubId]?.form ?? compact.form;
    s.fringeWorld ??= {};
    s.fringeWorld[profile.clubId] = compact;
  }

  const removedPlayerIds = new Set(
    s.football.players
      .filter((player) => player.currentClubId !== null && fringe.has(player.currentClubId))
      .map((player) => player.id),
  );
  if (removedPlayerIds.size) {
    s.football.players = s.football.players.filter((player) => !removedPlayerIds.has(player.id));
    s.football.contracts = s.football.contracts.filter(
      (contract) => !removedPlayerIds.has(contract.playerId),
    );
  }
  // A negotiation can reference a departing club without referencing one of
  // its players (for example, an incoming bid for the user's player). Keeping
  // that row would allow a later completion to recreate detailed ownership in
  // Fringe. Remove every negotiation crossing the new boundary, then prune
  // shortlist ids whose detailed player record no longer exists.
  s.football.negotiations = s.football.negotiations.filter(
    (negotiation) =>
      !removedPlayerIds.has(negotiation.playerId) &&
      (negotiation.fromClubId === null || !fringe.has(negotiation.fromClubId)) &&
      (negotiation.toClubId === null || !fringe.has(negotiation.toClubId)),
  );
  const retainedPlayerIds = new Set(s.football.players.map((player) => player.id));
  s.football.shortlist = s.football.shortlist.filter((playerId) => retainedPlayerIds.has(playerId));

  const detailedClubs = new Set(
    s.football.players
      .map((player) => player.currentClubId)
      .filter((clubId): clubId is string => clubId !== null),
  );

  for (const club of plan.focusClubIds) {
    if (detailedClubs.has(club)) continue;
    const rep = clubReputation(s, club);
    const level = recruitmentLevelOfClub(s, club);
    const tierRating = clamp(previousFringe[club]?.strength ?? 42 + rep * 0.42, 40, 88);
    const squad = Array.from({ length: SQUAD_SIZE }, (_, index) =>
      makePlayerFor(s.saveSeed, club, index, tierRating, s.season, level, rep),
    ).sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));

    const rawBill = squad.reduce(
      (sum, player) =>
        sum +
        recruitmentWageForLevel(
          level,
          player.currentAbility,
          rep,
          ageOf(player, s.season),
          player.potentialAbility,
        ),
      0,
    );
    const targetBill =
      recruitmentSustainableWageBill(s, club) * PLAYER_WAGE_SHARE * OPENING_WAGE_LOAD;
    const baseWageScalar = rawBill > 0 ? clamp(targetBill / rawBill, 0.6, 1.5) : 1;
    const wageScalar = clamp(
      baseWageScalar * fringeFinanceWageFactor(previousFringe[club]?.financeBand),
      0.5,
      1.5,
    );

    squad.forEach((player, index) => {
      if (s.football.players.some((existing) => existing.id === player.id)) return;
      const rng = seededRng(`${s.saveSeed}|contract|${player.id}`);
      const base = recruitmentWageForLevel(
        level,
        player.currentAbility,
        rep,
        ageOf(player, s.season),
        player.potentialAbility,
      );
      const contract: PlayerContract = {
        id: hydrationContractId(s, club, player.id),
        playerId: player.id,
        clubId: club,
        startSeason: s.season,
        startWeek: s.week,
        expirySeason: s.season + rngInt(rng, 1, 4) - 1,
        expiryWeek: WEEKS_PER_SEASON,
        weeklyWage: recruitmentContractWageForLevel(level, base, wageScalar),
        squadRole: roleFor(index),
        signingBonus: 0,
        agreedTransferFee: 0,
        status: "Active",
      };
      player.contractId = contract.id;
      s.football.players.push(player);
      s.football.contracts.push(contract);
    });
  }

  ensureFringeWorldState(s);
}

/** Persistently track/untrack a club and reconcile its fidelity immediately. */
export function setWorldClubTrackedInPlace(s: GameState, clubId: string, tracked: boolean): void {
  const exists = s.leagues.some((league) => league.clubIds.includes(clubId));
  if (!exists) throw new Error(`Cannot track unknown world club: ${clubId}`);
  const ids = new Set(s.trackedClubIds ?? []);
  if (tracked) ids.add(clubId);
  else ids.delete(clubId);
  s.trackedClubIds = [...ids].sort((a, b) => a.localeCompare(b));
  reconcileRecruitmentFidelity(s);
  syncLegacySquad(s);
}

export function setWorldClubTracked(s: GameState, clubId: string, tracked: boolean): GameState {
  const next = structuredClone(s);
  setWorldClubTrackedInPlace(next, clubId, tracked);
  return next;
}

/** Idempotent. Builds the football world once, then leaves it alone. */
export function ensureRecruitment(s: GameState): void {
  if (s.football && Array.isArray(s.football.players) && s.football.players.length > 0) {
    s.football.negotiations ??= [];
    s.football.shortlist ??= [];
    s.football.transferHistory ??= [];
    s.football.contractHistory ??= [];
    s.football.seasonHistory ??= [];
    s.football.scoutingReports ??= [];
    // Expand older saves without replacing any existing player or history.
    // Stable ids make this idempotent and preserve signed/released free agents.
    const knownPlayerIds = new Set(s.football.players.map((player) => player.id));
    const freeAgentLevel = deepestWorldFootballLevel(s);
    for (let index = 0; index < FREE_AGENT_POOL; index++) {
      const player = makePlayerFor(s.saveSeed, null, index, 52, s.season, freeAgentLevel, 45);
      if (knownPlayerIds.has(player.id)) continue;
      player.contractId = null;
      player.transferStatus = "listed";
      s.football.players.push(player);
    }
    reconcileRecruitmentFidelity(s);
    syncLegacySquad(s);
    return;
  }
  const { players, contracts } = generateWorld(s);
  const state: RecruitmentState = {
    players,
    contracts,
    negotiations: [],
    shortlist: [],
    scoutingReports: [],
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

export interface ScoutingView {
  knowledge: number;
  assigned: boolean;
  complete: boolean;
  ability: { min: number; max: number };
  potential: { min: number; max: number };
}

function scoutingStaff(s: GameState) {
  return (s.hiredStaff ?? [])
    .filter((staff) => ["Scout", "Chief Scout", "Head of Transfers"].includes(staff.role))
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
}

/** Knowledge is derived from persistent assignment time, so advancing a week is enough. */
export function scoutingView(s: GameState, player: FootballPlayer): ScoutingView {
  if (player.currentClubId === s.clubName) {
    return {
      knowledge: 100,
      assigned: false,
      complete: true,
      ability: { min: player.currentAbility, max: player.currentAbility },
      potential: { min: player.potentialAbility, max: player.potentialAbility },
    };
  }

  const report = s.football?.scoutingReports?.find((item) => item.playerId === player.id);
  const baseKnowledge = player.currentClubId === null ? 38 : 18;
  const scout = report?.scoutId
    ? (s.hiredStaff ?? []).find((staff) => staff.id === report.scoutId)
    : undefined;
  const rating = scout?.rating ?? s.football?.department.recruitmentRating ?? 45;
  const elapsed = report
    ? Math.max(0, absoluteWeek(s.season, s.week) - report.assignedAbsoluteWeek)
    : 0;
  const weeklyGain = 10 + Math.round(rating / 10);
  const knowledge = clamp(baseKnowledge + elapsed * weeklyGain, baseKnowledge, 100);
  const abilityRadius = knowledge >= 90 ? 0 : knowledge >= 65 ? 2 : knowledge >= 40 ? 5 : 9;
  const potentialRadius = knowledge >= 90 ? 0 : knowledge >= 65 ? 4 : knowledge >= 40 ? 8 : 13;
  return {
    knowledge,
    assigned: Boolean(report),
    complete: knowledge >= 90,
    ability: {
      min: clamp(player.currentAbility - abilityRadius, 1, 99),
      max: clamp(player.currentAbility + abilityRadius, 1, 99),
    },
    potential: {
      min: clamp(player.potentialAbility - potentialRadius, 1, 99),
      max: clamp(player.potentialAbility + potentialRadius, 1, 99),
    },
  };
}

export function activeScoutingAssignments(s: GameState): number {
  return (s.football?.scoutingReports ?? []).filter((report) => {
    const player = playerById(s, report.playerId);
    return player ? !scoutingView(s, player).complete : false;
  }).length;
}

export function scoutingCapacity(s: GameState): number {
  return 1 + scoutingStaff(s).length * 2;
}

export function assignScout(
  s: GameState,
  playerId: string,
): { state: GameState; result: { ok: boolean; reason: string } } {
  const next = structuredClone(s);
  ensureRecruitment(next);
  const player = playerById(next, playerId);
  if (!player) return { state: s, result: { ok: false, reason: "Player not found" } };
  if (player.currentClubId === next.clubName) {
    return { state: s, result: { ok: false, reason: "Your own players are already fully known" } };
  }
  const existing = next.football.scoutingReports.find((report) => report.playerId === playerId);
  if (existing) {
    return { state: s, result: { ok: false, reason: "This player is already being scouted" } };
  }
  if (activeScoutingAssignments(next) >= scoutingCapacity(next)) {
    return {
      state: s,
      result: { ok: false, reason: "All scouting assignments are currently occupied" },
    };
  }
  const scout = scoutingStaff(next)[0];
  next.football.scoutingReports.push({
    playerId,
    assignedAbsoluteWeek: absoluteWeek(next.season, next.week),
    scoutId: scout?.id ?? null,
  });
  if (!next.football.shortlist.includes(playerId)) next.football.shortlist.push(playerId);
  return {
    state: next,
    result: {
      ok: true,
      reason: `${scout?.name ?? "Recruitment team"} has started scouting ${playerName(player)}`,
    },
  };
}

export const contractById = (
  s: GameState,
  id: string | null | undefined,
): PlayerContract | undefined => (id ? s.football?.contracts.find((c) => c.id === id) : undefined);

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
  if (p.transferStatus === "listed" || p.transferStatus === "agreedTransfer")
    return "transferListed";
  if (c && weeksLeftOnContract(s, c) <= RENEWAL_WINDOW_WEEKS) return "contractExpiring";
  if (c && c.squadRole === "Prospect") return "reserve";
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
  return int(
    (s.football?.contracts ?? [])
      .filter((c) => c.clubId === club && (c.status === "Active" || c.status === "Expiring"))
      .reduce((a, c) => a + c.weeklyWage, 0),
  );
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
      (c) =>
        c.clubId === s.clubName &&
        (c.status === "Active" || c.status === "Expiring") &&
        c.expirySeason >= season &&
        c.startSeason <= season,
    );
    const weekly = int(live.reduce((a, c) => a + c.weeklyWage, 0));
    out.push({
      season,
      weeklyWage: weekly,
      annualised: weekly * WEEKS_PER_SEASON,
      players: live.length,
    });
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
  return int(
    (s.football?.transferHistory ?? [])
      .filter((r) => r.season === s.season && r.toClubId === s.clubName)
      .reduce((a, r) => a + r.fee + r.signingBonus, 0),
  );
}

export function transferIncomeThisSeason(s: GameState): number {
  return int(
    (s.football?.transferHistory ?? [])
      .filter((r) => r.season === s.season && r.fromClubId === s.clubName)
      .reduce((a, r) => a + r.fee, 0),
  );
}

export const netSpendThisSeason = (s: GameState) =>
  transferSpendThisSeason(s) - transferIncomeThisSeason(s);

/** Available transfer spending is simply the club's cash balance. */
export function remainingTransferBudget(s: GameState): number {
  return Math.max(0, int(s.cash));
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
  if (c > cashAvailable) {
    return {
      allowed: false,
      reason: "The club does not hold the cash — budget authority is not money",
      cost: c,
      cashAvailable,
      budgetRemaining,
    };
  }
  return { allowed: true, reason: "Affordable", cost: c, cashAvailable, budgetRemaining };
}

export function canAuthoriseWage(
  s: GameState,
  weeklyWage: number,
): { allowed: boolean; reason: string } {
  const cap = int(s.finance?.budgets?.wages ?? 0);
  if (cap <= 0) return { allowed: true, reason: "No wage ceiling set" };
  const projected = userWageBill(s) + int(weeklyWage);
  if (projected > cap) {
    return {
      allowed: false,
      reason: `Wage bill would reach £${projected.toLocaleString()}/wk against a £${cap.toLocaleString()}/wk ceiling`,
    };
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
  const importance =
    c.squadRole === "Key Player"
      ? 1.4
      : c.squadRole === "First Team"
        ? 1.15
        : c.squadRole === "Rotation"
          ? 0.95
          : 0.8;
  const listed = p.transferStatus === "listed" ? 0.8 : 1;
  const sellerRep = p.currentClubId ? clubReputation(s, p.currentClubId) : 50;
  const ambition = 0.9 + sellerRep / 250;
  const rawAsk = p.marketValue * contractFactor * importance * listed * ambition;
  const sellerClub = p.currentClubId ?? s.clubName;
  return recruitmentNormaliseTransferFeeForClub(s, sellerClub, rawAsk, "asking");
}

/**
 * Growth pressure on wage expectations at NEGOTIATION time.
 *
 * A club that rises through the pyramid discovers that keeping the same
 * players costs more. This deliberately measures CHANGE, not level: the
 * absolute reputation of the club is already priced into `ambitionGap`
 * below, so counting it twice would double-charge every club.
 *
 * Signed contracts are never touched by this — it only bends what a player
 * asks for when new terms are being agreed.
 */
export function clubGrowthFactor(s: GameState): number {
  const history = s.seasonHistory ?? [];
  let moves = 0;
  for (const h of history) {
    if (h.season < s.season - 3) continue;
    if (h.promoted?.includes?.(s.clubName)) moves += 1;
    if (h.relegated?.includes?.(s.clubName)) moves -= 1;
  }
  // Reputation trend over the same window, from the immutable snapshots.
  const snaps = (s.clubSnapshots ?? [])
    .filter((x) => x.club === s.clubName)
    .sort((a, b) => a.season - b.season);
  const now = clubReputation(s, s.clubName);
  const then = snaps.length ? snaps[Math.max(0, snaps.length - 4)].reputation : now;
  const repTrend = clamp((now - then) / 100, -0.1, 0.15);
  // Recent success: a club winning things is a club players charge more to join.
  const recent = history.filter(
    (h) => h.season >= s.season - 2 && h.champion === s.clubName,
  ).length;
  const factor = 1 + clamp(moves * 0.07, -0.14, 0.21) + repTrend + recent * 0.03;
  return Math.round(clamp(factor, 0.85, 1.35) * 1000) / 1000;
}

export function wageDemand(
  s: GameState,
  p: FootballPlayer,
  role: SquadRole = "First Team",
): number {
  const roleFactor =
    role === "Key Player" ? 1.15 : role === "First Team" ? 1 : role === "Rotation" ? 0.9 : 0.8;
  const ambitionGap = clamp(1 + (clubReputation(s, s.clubName) - p.reputation) / 240, 0.85, 1.2);
  const personality = p.personality === "Mercenary" ? 1.15 : p.personality === "Loyal" ? 0.92 : 1;
  // Canonical infrastructure signal: good training/medical/pitch facilities
  // shave a little off wage demands, poor ones add to them. Capped at +/-6%.
  const attraction = clamp(facilityModifiers(s).recruitmentAttraction, -15, 15);
  const facilityFactor = clamp(1 - attraction / 250, 0.94, 1.06);
  const growth = clubGrowthFactor(s);
  const rawDemand =
    (p.wageExpectation * roleFactor * personality * facilityFactor * growth) / ambitionGap;
  return recruitmentUserNegotiationWage(s, rawDemand);
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
  if (squad.length > SQUAD_SIZE && rankInPosition >= 2)
    return "Surplus to requirements in a crowded squad";
  if (
    rankInPosition >= SQUAD_TEMPLATE[p.primaryPosition] - 1 &&
    squad.length > MIN_SQUAD_SIZE + 2
  ) {
    return "Behind others in the pecking order";
  }

  const sellerRep = clubReputation(s, club);
  if (p.reputation > sellerRep + 18) return "Ambition outgrowing his club";
  if (
    sellerRep < 35 &&
    c.weeklyWage >
      recruitmentWageForClub(
        s,
        club,
        p.currentAbility,
        ageOf(p, s.season),
        p.potentialAbility,
      ) *
        1.1
  ) {
    return "His club needs the wage off the books";
  }
  return null;
}

export interface PlayerInterestAssessment {
  level: "keen" | "open" | "uncertain" | "unlikely";
  label: string;
  reason: string;
}

/** A readable pre-negotiation interest signal; precise terms still require talks. */
export function playerInterestAssessment(
  s: GameState,
  p: FootballPlayer,
): PlayerInterestAssessment {
  if (p.currentClubId === s.clubName)
    return { level: "keen", label: "At your club", reason: "Already contracted to the club." };
  const gap = clubReputation(s, s.clubName) - p.reputation;
  if (p.currentClubId === null && gap >= -4)
    return {
      level: "keen",
      label: "Keen",
      reason: "A suitable free agent who wants a route back into football.",
    };
  if (gap >= 8)
    return {
      level: "keen",
      label: "Keen",
      reason: "The club's standing represents a clear step up.",
    };
  if (gap >= -4)
    return {
      level: "open",
      label: "Open to talks",
      reason: "The move broadly matches his current reputation.",
    };
  if (gap >= -12)
    return {
      level: "uncertain",
      label: "Needs convincing",
      reason: "Wages, role and the club's plans will matter.",
    };
  return {
    level: "unlikely",
    label: "Unlikely",
    reason: "He currently expects a club with a stronger reputation.",
  };
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
  return out.sort(
    (a, b) =>
      b.player.currentAbility - a.player.currentAbility || a.player.id.localeCompare(b.player.id),
  );
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

function log(
  n: TransferNegotiation,
  entry: Omit<NegotiationLogEntry, "absoluteWeek">,
  abs: number,
): void {
  n.log.push({ ...entry, absoluteWeek: abs });
}

export function negotiationById(s: GameState, id: string): TransferNegotiation | undefined {
  return s.football?.negotiations.find((n) => n.id === id);
}

export const openNegotiations = (s: GameState) =>
  (s.football?.negotiations ?? []).filter(
    (n) =>
      n.stage === "enquiry" ||
      n.stage === "clubTalks" ||
      n.stage === "playerTalks" ||
      n.stage === "agreed" ||
      n.stage === "registration",
  );

function nextNegotiationId(s: GameState): string {
  const n = s.football.nextNegotiationId ?? 1;
  s.football.nextNegotiationId = n + 1;
  return `TN-${String(n).padStart(5, "0")}`;
}

function targetOpeningWeeklyWage(
  s: GameState,
  player: FootballPlayer,
  role: SquadRole,
  openingWeeklyWage?: number,
): number {
  if (openingWeeklyWage === undefined) return wageDemand(s, player, role);
  return recruitmentUserNegotiationWage(s, Math.max(0, openingWeeklyWage));
}

interface CompetingTransferBid {
  clubId: string;
  fee: number;
}

/**
 * Find one plausible rival bid from the already-simulated Focus market.
 *
 * A rival must have room in its squad, an actual positional shortage and
 * enough reputation to plausibly attract the target. The result is seeded
 * from stable world facts and then persisted on the negotiation, so reloads
 * never reroll who the chairman is competing against.
 */
function competingTransferBid(
  s: GameState,
  player: FootballPlayer,
  sellerPosition: number,
): CompetingTransferBid | null {
  const seller = player.currentClubId;
  if (!seller) return null;

  const candidates = buildWorldSimulationPlan(s).focusClubIds
    .filter((clubId) => clubId !== s.clubName && clubId !== seller)
    .map((clubId) => {
      const squad = squadOf(s, clubId);
      const positionalPlayers = squad.filter(
        (candidate) => candidate.primaryPosition === player.primaryPosition,
      );
      const positionalCount = positionalPlayers.length;
      const positionalNeed = Math.max(0, SQUAD_TEMPLATE[player.primaryPosition] - positionalCount);
      const weakestPositionAbility = positionalPlayers.length
        ? Math.min(...positionalPlayers.map((candidate) => candidate.currentAbility))
        : 0;
      const upgradeNeed = Math.max(0, player.currentAbility - weakestPositionAbility);
      return {
        clubId,
        positionalNeed,
        upgradeNeed,
        squadSize: squad.length,
        reputation: clubReputation(s, clubId),
      };
    })
    .filter(
      (candidate) =>
        candidate.squadSize < MAX_SQUAD_SIZE &&
        (candidate.positionalNeed > 0 || candidate.upgradeNeed >= 4) &&
        candidate.reputation >= player.reputation - 12,
    )
    .sort(
      (a, b) =>
        b.positionalNeed - a.positionalNeed ||
        b.upgradeNeed - a.upgradeNeed ||
        Math.abs(a.reputation - player.reputation) -
          Math.abs(b.reputation - player.reputation) ||
        a.clubId.localeCompare(b.clubId),
    );

  if (!candidates.length) return null;

  const rng = seededRng(
    s.saveSeed,
    "competingTransferBid",
    player.id,
    seller,
    nowAbs(s),
  );
  const chance = player.transferStatus === "listed" ? 0.62 : 0.38;
  if (rng() > chance) return null;

  const shortlist = candidates.slice(0, Math.min(3, candidates.length));
  const rival = shortlist[rngInt(rng, 0, shortlist.length - 1)];
  const sellerPolicy = recruitmentTransferFeePolicyForClub(s, seller);
  const fee = Math.max(
    sellerPolicy.askingFloor,
    recruitmentNormaliseTransferFeeForClub(
      s,
      seller,
      sellerPosition * rngRange(rng, 0.88, 1.02),
      "asking",
    ),
  );

  return { clubId: rival.clubId, fee };
}

/**
 * Ask a contracted player's club for its current position without tabling a
 * bid. Free agents skip the seller and go directly to personal terms.
 */
export function openTransferEnquiryInPlace(
  s: GameState,
  playerId: string,
  role: SquadRole = "First Team",
  openingWeeklyWage?: number,
): NegotiationResult {
  ensureRecruitment(s);
  const p = transferTargetPlayer(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId === s.clubName) return { ok: false, reason: "He is already our player" };
  if (openNegotiations(s).some((n) => n.playerId === playerId)) {
    return { ok: false, reason: "Talks for this player are already open" };
  }
  if (!transferTargetAvailabilityReason(s, p, availabilityReason)) {
    return { ok: false, reason: "His club will not entertain an approach" };
  }
  if (userSquad(s).length >= MAX_SQUAD_SIZE) {
    return { ok: false, reason: "The squad is already full" };
  }

  const proposedWeeklyWage = targetOpeningWeeklyWage(s, p, role, openingWeeklyWage);
  const wageAuth = canAuthoriseWage(s, proposedWeeklyWage);
  if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };

  if (p.currentClubId === null) {
    return openTransferNegotiationInPlace(s, playerId, 0, role, proposedWeeklyWage);
  }

  const abs = nowAbs(s);
  const sellerPosition = transferTargetAskingPrice(s, p, askingPrice);
  const competingBid = competingTransferBid(s, p, sellerPosition);
  const n: TransferNegotiation = {
    id: nextNegotiationId(s),
    playerId,
    fromClubId: p.currentClubId,
    toClubId: s.clubName,
    direction: "in",
    stage: "enquiry",
    clubRounds: 0,
    playerRounds: 0,
    fee: 0,
    clubCounterFee: sellerPosition,
    competingClubId: competingBid?.clubId,
    competingOfferFee: competingBid?.fee,
    proposedWeeklyWage,
    proposedLengthSeasons: 3,
    proposedSigningBonus: 0,
    proposedRole: role,
    createdSeason: s.season,
    createdAbsoluteWeek: abs,
    expiresAtAbsoluteWeek: abs + NEGOTIATION_TTL_WEEKS,
    log: [],
  };
  log(
    n,
    {
      round: 0,
      party: "club",
      action: "enquiry",
      note: `${p.currentClubId} indicate they would consider offers around £${sellerPosition.toLocaleString()}.`,
    },
    abs,
  );
  s.football.negotiations.push(n);
  syncTransferTargetNegotiationInPlace(s, n);
  return { ok: true, reason: "Club valuation received", negotiation: n };
}

/** Turn a live enquiry into the user's first actual transfer bid. */
export function submitEnquiryOfferInPlace(
  s: GameState,
  negotiationId: string,
  fee?: number,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage !== "enquiry") return { ok: false, reason: "The enquiry is no longer open" };

  const offerFee = Math.max(0, int(fee ?? n.clubCounterFee ?? 0));
  if (offerFee <= 0) return { ok: false, reason: "Enter a transfer fee" };
  const auth = canAuthorisePurchase(s, offerFee);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  n.fee = offerFee;
  n.proposedSigningBonus = int(offerFee * 0.05);
  n.clubRounds = 1;
  n.stage = "clubTalks";
  log(
    n,
    {
      round: 1,
      party: "club",
      action: "offer",
      note: `Offer of £${offerFee.toLocaleString()} tabled after enquiry.`,
    },
    nowAbs(s),
  );
  evaluateClubResponseInPlace(s, n);
  return { ok: true, reason: "Offer submitted", negotiation: n };
}

/**
 * Open club talks for a player. Buying side = the user.
 * Mutates in place — callers own the clone.
 */
export function openTransferNegotiationInPlace(
  s: GameState,
  playerId: string,
  fee: number,
  role: SquadRole = "First Team",
  openingWeeklyWage?: number,
): NegotiationResult {
  ensureRecruitment(s);
  const p = transferTargetPlayer(s, playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  if (p.currentClubId === s.clubName) return { ok: false, reason: "He is already our player" };
  if (openNegotiations(s).some((n) => n.playerId === playerId)) {
    return { ok: false, reason: "Talks for this player are already open" };
  }
  if (!transferTargetAvailabilityReason(s, p, availabilityReason))
    return { ok: false, reason: "His club will not entertain an approach" };
  if (userSquad(s).length >= MAX_SQUAD_SIZE)
    return { ok: false, reason: "The squad is already full" };

  const offerFee = p.currentClubId === null ? 0 : Math.max(0, int(fee));
  const auth = canAuthorisePurchase(s, offerFee);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  const proposedWeeklyWage = targetOpeningWeeklyWage(s, p, role, openingWeeklyWage);
  const wageAuth = canAuthoriseWage(s, proposedWeeklyWage);
  if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };

  const abs = nowAbs(s);
  const n: TransferNegotiation = {
    id: nextNegotiationId(s),
    playerId,
    fromClubId: p.currentClubId,
    toClubId: s.clubName,
    direction: "in",
    stage: p.currentClubId === null ? "playerTalks" : "clubTalks",
    clubRounds: 1,
    playerRounds: p.currentClubId === null ? 1 : 0,
    fee: offerFee,
    proposedWeeklyWage,
    proposedLengthSeasons: 3,
    proposedSigningBonus: int(offerFee * 0.05),
    proposedRole: role,
    createdSeason: s.season,
    createdAbsoluteWeek: abs,
    expiresAtAbsoluteWeek: abs + NEGOTIATION_TTL_WEEKS,
    log: [],
  };
  log(
    n,
    {
      round: 1,
      party: "club",
      action: "offer",
      note: `Offer of £${offerFee.toLocaleString()} tabled.`,
    },
    abs,
  );
  s.football.negotiations.push(n);
  syncTransferTargetNegotiationInPlace(s, n);

  if (n.stage === "clubTalks") {
    evaluateClubResponseInPlace(s, n);
  } else {
    log(
      n,
      {
        round: 1,
        party: "player",
        action: "offer",
        note: "Free agent — straight to personal terms.",
      },
      abs,
    );
    evaluatePlayerResponseInPlace(s, n);
  }
  return { ok: true, reason: "Offer submitted", negotiation: n };
}

/** Selling club's deterministic answer to the fee on the table. */
export function evaluateClubResponseInPlace(s: GameState, n: TransferNegotiation): void {
  const p = transferTargetPlayer(s, n.playerId);
  if (!p || n.stage !== "clubTalks") return;
  syncTransferTargetNegotiationInPlace(s, n);
  const ask = transferTargetAskingPrice(s, p, askingPrice);
  const rng = seededRng(s.saveSeed, "clubEval", n.id, n.clubRounds);
  const negotiationEdge = (s.football.department?.negotiationRating ?? 50) / 500; // up to 20%
  const baseThreshold = int(
    ask * (0.97 - negotiationEdge + rngRange(rng, -0.03, 0.05)),
  );
  // A seller with a live alternative does not accept less than that standing bid.
  const threshold = Math.max(baseThreshold, n.competingOfferFee ?? 0);
  const abs = nowAbs(s);

  if (n.fee >= threshold) {
    n.stage = "playerTalks";
    n.playerRounds = 1;
    log(
      n,
      {
        round: n.clubRounds,
        party: "club",
        action: "accept",
        note: `${n.fromClubId} accept £${n.fee.toLocaleString()}. Personal terms next.`,
      },
      abs,
    );
    evaluatePlayerResponseInPlace(s, n);
    return;
  }
  if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS || n.fee < threshold * 0.7) {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    log(
      n,
      {
        round: n.clubRounds,
        party: "club",
        action: "reject",
        note: `${n.fromClubId} reject the approach.`,
      },
      abs,
    );
    syncTransferTargetNegotiationInPlace(s, n);
    return;
  }
  const sellerClub = n.fromClubId ?? p.currentClubId ?? s.clubName;
  const feePolicy = recruitmentTransferFeePolicyForClub(s, sellerClub);
  n.clubCounterFee = Math.max(
    n.fee + feePolicy.feeStep,
    recruitmentNormaliseTransferFeeForClub(s, sellerClub, threshold),
  );
  log(
    n,
    {
      round: n.clubRounds,
      party: "club",
      action: "counter",
      note: `${n.fromClubId} want £${n.clubCounterFee.toLocaleString()}.`,
    },
    abs,
  );
}

/** Improve the fee. Counts as a round; two rounds maximum. */
export function counterClubOfferInPlace(
  s: GameState,
  negotiationId: string,
  fee?: number,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage !== "clubTalks") return { ok: false, reason: "Club talks are closed" };
  if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS)
    return { ok: false, reason: "No negotiating rounds left" };
  const newFee = int(fee ?? n.clubCounterFee ?? n.fee);
  if (newFee <= n.fee) return { ok: false, reason: "An improved offer must be higher" };
  const auth = canAuthorisePurchase(s, newFee);
  if (!auth.allowed) return { ok: false, reason: auth.reason };

  n.fee = newFee;
  n.proposedSigningBonus = int(newFee * 0.05);
  n.clubRounds += 1;
  log(
    n,
    {
      round: n.clubRounds,
      party: "club",
      action: "offer",
      note: `Improved offer of £${newFee.toLocaleString()}.`,
    },
    nowAbs(s),
  );
  evaluateClubResponseInPlace(s, n);
  return { ok: true, reason: "Improved offer submitted", negotiation: n };
}

/** Player's deterministic answer to the personal terms on the table. */
export function evaluatePlayerResponseInPlace(s: GameState, n: TransferNegotiation): void {
  const p = transferTargetPlayer(s, n.playerId);
  if (!p || n.stage !== "playerTalks") return;
  syncTransferTargetNegotiationInPlace(s, n);
  const demand = wageDemand(s, p, n.proposedRole);
  const rng = seededRng(s.saveSeed, "playerEval", n.id, n.playerRounds);
  const persuasion = (s.football.department?.negotiationRating ?? 50) / 600;
  const competingPressure = n.competingClubId ? 1.06 : 1;
  const threshold = int(
    demand * (1.0 - persuasion + rngRange(rng, -0.04, 0.06)) * competingPressure,
  );
  const abs = nowAbs(s);

  if (n.proposedWeeklyWage >= threshold) {
    n.stage = "agreed";
    log(
      n,
      {
        round: n.playerRounds,
        party: "player",
        action: "accept",
        note: `${playerName(p)} agrees personal terms at £${n.proposedWeeklyWage.toLocaleString()}/wk.`,
      },
      abs,
    );
    syncTransferTargetNegotiationInPlace(s, n);
    return;
  }
  if (n.playerRounds >= MAX_NEGOTIATION_ROUNDS || n.proposedWeeklyWage < threshold * 0.75) {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    log(
      n,
      {
        round: n.playerRounds,
        party: "player",
        action: "reject",
        note: `${playerName(p)} turns the club down.`,
      },
      abs,
    );
    syncTransferTargetNegotiationInPlace(s, n);
    return;
  }
  const wageStep = recruitmentUserNegotiationWageStep(s, n.proposedWeeklyWage);
  n.playerCounterWage = Math.max(
    recruitmentUserNegotiationWage(s, threshold),
    recruitmentUserNegotiationWage(s, n.proposedWeeklyWage + wageStep),
  );
  log(
    n,
    {
      round: n.playerRounds,
      party: "player",
      action: "counter",
      note: `${playerName(p)} wants £${n.playerCounterWage.toLocaleString()}/wk.`,
    },
    abs,
  );
}

/** Improve personal terms. Counts as a round; two rounds maximum. */
export function improvePlayerTermsInPlace(
  s: GameState,
  negotiationId: string,
  wage?: number,
  seasons?: number,
  role?: SquadRole,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage !== "playerTalks") return { ok: false, reason: "Personal terms are closed" };
  if (n.playerRounds >= MAX_NEGOTIATION_ROUNDS)
    return { ok: false, reason: "No negotiating rounds left" };
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
  log(
    n,
    {
      round: n.playerRounds,
      party: "club",
      action: "offer",
      note: `Terms improved to £${n.proposedWeeklyWage.toLocaleString()}/wk.`,
    },
    nowAbs(s),
  );
  evaluatePlayerResponseInPlace(s, n);
  return { ok: true, reason: "Terms improved", negotiation: n };
}

export function withdrawNegotiationInPlace(s: GameState, negotiationId: string): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.stage === "completed")
    return { ok: false, reason: "The transfer has already gone through" };
  if (n.stage === "withdrawn" || n.stage === "rejected")
    return { ok: false, reason: "Talks are already closed" };
  n.stage = "withdrawn";
  n.resolvedAtAbsoluteWeek = nowAbs(s);
  log(
    n,
    {
      round: n.clubRounds,
      party: "club",
      action: "withdraw",
      note: "The club has withdrawn from talks.",
    },
    n.resolvedAtAbsoluteWeek,
  );
  syncTransferTargetNegotiationInPlace(s, n);
  return { ok: true, reason: "Withdrawn" };
}

/* ---------- Outgoing: an AI club bids for one of ours ---------- */

/** Respond to an incoming bid. Accepting moves straight to completion. */
export function respondToIncomingOfferInPlace(
  s: GameState,
  negotiationId: string,
  action: "accept" | "reject" | "counter",
  counterFee?: number,
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
    log(
      n,
      { round: n.clubRounds, party: "club", action: "reject", note: "We turned the offer down." },
      abs,
    );
    return { ok: true, reason: "Offer rejected" };
  }
  if (action === "counter") {
    if (n.clubRounds >= MAX_NEGOTIATION_ROUNDS)
      return { ok: false, reason: "No negotiating rounds left" };
    const feePolicy = recruitmentTransferFeePolicyForUser(s);
    const ask = Math.max(
      int(counterFee ?? askingPrice(s, p) * 1.15),
      n.fee + feePolicy.feeStep,
    );
    n.clubRounds += 1;
    n.clubCounterFee = ask;
    log(
      n,
      {
        round: n.clubRounds,
        party: "club",
        action: "counter",
        note: `We want £${ask.toLocaleString()}.`,
      },
      abs,
    );
    // Buying club's deterministic answer.
    const rng = seededRng(s.saveSeed, "aiBuyer", n.id, n.clubRounds);
    const ceiling = int(askingPrice(s, p) * rngRange(rng, 0.95, 1.3));
    if (ask <= ceiling) {
      n.fee = ask;
      n.stage = "agreed";
      log(
        n,
        {
          round: n.clubRounds,
          party: "club",
          action: "accept",
          note: `${n.toClubId} meet our valuation.`,
        },
        abs,
      );
    } else {
      n.stage = "rejected";
      n.resolvedAtAbsoluteWeek = abs;
      log(
        n,
        { round: n.clubRounds, party: "club", action: "reject", note: `${n.toClubId} walk away.` },
        abs,
      );
    }
    return { ok: true, reason: "Counter submitted" };
  }

  n.stage = "agreed";
  log(
    n,
    {
      round: n.clubRounds,
      party: "club",
      action: "accept",
      note: `We accepted £${n.fee.toLocaleString()}.`,
    },
    abs,
  );
  return { ok: true, reason: "Offer accepted" };
}

/* =========================================================================
   7. Registration — agreed incoming deals must still be eligible to register
========================================================================= */

export interface TransferRegistrationReadiness {
  allowed: boolean;
  reason: string;
}

export function transferRegistrationReadiness(
  s: GameState,
  negotiationId: string,
): TransferRegistrationReadiness {
  const n = negotiationById(s, negotiationId);
  if (!n) return { allowed: false, reason: "Unknown negotiation" };
  if (n.direction !== "in") {
    return { allowed: false, reason: "The buying club handles registration for outgoing deals" };
  }
  if (n.stage !== "agreed" && n.stage !== "registration") {
    return { allowed: false, reason: "Club and player terms must be agreed first" };
  }
  if (!isTransferWindowOpen(s)) {
    return { allowed: false, reason: "The transfer window is closed" };
  }
  if (userSquad(s).length >= MAX_SQUAD_SIZE) {
    return { allowed: false, reason: "The squad is already full" };
  }
  const purchase = canAuthorisePurchase(s, n.fee + n.proposedSigningBonus);
  if (!purchase.allowed) return purchase;
  const wage = canAuthoriseWage(s, n.proposedWeeklyWage);
  if (!wage.allowed) return wage;
  if (!transferTargetPlayer(s, n.playerId)) {
    return { allowed: false, reason: "The player is no longer available to register" };
  }
  return { allowed: true, reason: "Medical and registration checks can proceed" };
}

/**
 * Persist the post-agreement registration stage for an incoming signing.
 *
 * This is intentionally administrative rather than a random medical roll:
 * the current player model has no injury/medical state worth pretending to
 * simulate. The stage does enforce the real constraints Legacy Football does
 * model today — window, squad capacity and chairman financial authority.
 */
export function beginTransferRegistrationInPlace(
  s: GameState,
  negotiationId: string,
): NegotiationResult {
  const n = negotiationById(s, negotiationId);
  if (!n) return { ok: false, reason: "Unknown negotiation" };
  if (n.direction !== "in") {
    return { ok: false, reason: "Outgoing registration is handled by the buying club" };
  }
  if (n.stage !== "agreed") {
    return { ok: false, reason: "The deal is not ready for registration" };
  }
  const readiness = transferRegistrationReadiness(s, negotiationId);
  if (!readiness.allowed) return { ok: false, reason: readiness.reason };

  n.stage = "registration";
  log(
    n,
    {
      round: Math.max(n.clubRounds, n.playerRounds),
      party: "club",
      action: "register",
      note: "Terms agreed. Medical and registration paperwork opened.",
    },
    nowAbs(s),
  );
  syncTransferTargetNegotiationInPlace(s, n);
  return { ok: true, reason: "Medical and registration opened", negotiation: n };
}

/* =========================================================================
   8. Completion — the single place a player changes club
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
  s: GameState,
  c: PlayerContract,
  outcome: PlayerContractRecord["outcome"],
  status: PlayerContract["status"],
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
  s: GameState,
  playerId: string,
  clubId: string,
  wage: number,
  seasons: number,
  role: SquadRole,
  signingBonus: number,
  fee: number,
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
  if (n.direction === "in" && n.stage !== "registration") {
    return { ok: false, reason: "Medical and registration must be opened first" };
  }
  if (n.direction === "out" && n.stage !== "agreed") {
    return { ok: false, reason: "Nothing has been agreed" };
  }
  let p = transferTargetPlayer(s, n.playerId);
  if (!p) return { ok: false, reason: "Unknown player" };
  const abs = nowAbs(s);

  if (n.direction === "in") {
    const readiness = transferRegistrationReadiness(s, negotiationId);
    if (!readiness.allowed) return { ok: false, reason: readiness.reason };
    const auth = canAuthorisePurchase(s, n.fee + n.proposedSigningBonus);
    if (!auth.allowed) return { ok: false, reason: auth.reason };
    const wageAuth = canAuthoriseWage(s, n.proposedWeeklyWage);
    if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };

    const materialized = materializeTransferTargetForCompletionInPlace(s, n);
    if (!materialized) return { ok: false, reason: "Unable to materialize transfer target" };
    p = materialized;

    if (n.fee > 0 && n.fromClubId) {
      postEntry(s, {
        category: "Transfers",
        subcategory: "Transfer fee",
        description: `${playerName(p)} signed from ${n.fromClubId}`,
        amount: n.fee,
        direction: "expense",
        sourceSystem: "transfers",
        linkedEntityId: n.id,
        dedupeKey: `transfer:${n.id}:fee`,
      });
    }
    if (n.proposedSigningBonus > 0) {
      postEntry(s, {
        category: "Transfers",
        subcategory: "Signing bonus",
        description: `Signing bonus — ${playerName(p)}`,
        amount: n.proposedSigningBonus,
        direction: "expense",
        sourceSystem: "transfers",
        linkedEntityId: n.id,
        dedupeKey: `transfer:${n.id}:bonus`,
      });
    }

    const old = activeContract(s, p.id);
    if (old) closeContract(s, old, "transferred", "Expired");
    const fresh = issueContract(
      s,
      p.id,
      s.clubName,
      n.proposedWeeklyWage,
      n.proposedLengthSeasons,
      n.proposedRole,
      n.proposedSigningBonus,
      n.fee,
    );
    p.currentClubId = s.clubName;
    p.contractId = fresh.id;
    p.transferStatus = "unlisted";
  } else {
    if (n.fee > 0) {
      postEntry(s, {
        category: "Transfers",
        subcategory: "Player sale",
        description: `${playerName(p)} sold to ${n.toClubId}`,
        amount: n.fee,
        direction: "income",
        sourceSystem: "transfers",
        linkedEntityId: n.id,
        dedupeKey: `transfer:${n.id}:sale`,
      });
    }
    const old = activeContract(s, p.id);
    if (old) closeContract(s, old, "transferred", "Expired");
    const fresh = issueContract(
      s,
      p.id,
      n.toClubId,
      recruitmentWageForClub(
        s,
        n.toClubId,
        p.currentAbility,
        ageOf(p, s.season),
        p.potentialAbility,
      ),
      3,
      "First Team",
      0,
      n.fee,
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
  recordCompletedTransferLifecycleInPlace(s, n, p);

  n.stage = "completed";
  n.completedTransferId = record.id;
  n.resolvedAtAbsoluteWeek = abs;
  log(
    n,
    {
      round: n.clubRounds,
      party: "club",
      action: "complete",
      note: `Deal done: ${playerName(p)} to ${n.toClubId}.`,
    },
    abs,
  );
  syncTransferTargetNegotiationInPlace(s, n);

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
  const wage = Math.max(
    c.weeklyWage,
    recruitmentUserNegotiationWage(s, wageDemand(s, p, c.squadRole) * uplift),
  );
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
  s: GameState,
  playerId: string,
  override?: Partial<RenewalTerms>,
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
    return {
      ok: false,
      reason: `${playerName(p)} wants at least £${required.toLocaleString()}/wk`,
    };
  }
  const wageAuth = canAuthoriseWage(s, terms.weeklyWage - old.weeklyWage);
  if (!wageAuth.allowed) return { ok: false, reason: wageAuth.reason };
  if (terms.signingBonus > 0 && terms.signingBonus > int(s.cash)) {
    return { ok: false, reason: "The club cannot pay the signing bonus" };
  }

  if (terms.signingBonus > 0) {
    postEntry(s, {
      category: "Transfers",
      subcategory: "Signing bonus",
      description: `Renewal bonus — ${playerName(p)}`,
      amount: terms.signingBonus,
      direction: "expense",
      sourceSystem: "transfers",
      linkedEntityId: old.id,
      dedupeKey: `renewal:${old.id}:s${s.season}:bonus`,
    });
  }

  closeContract(s, old, "renewed", "Expired");
  const fresh = issueContract(
    s,
    p.id,
    s.clubName,
    terms.weeklyWage,
    terms.seasons,
    terms.role,
    terms.signingBonus,
    0,
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
      category: "Transfers",
      subcategory: "Compensation",
      description: `Contract settlement — ${playerName(p)}`,
      amount: compensation,
      direction: "expense",
      sourceSystem: "transfers",
      linkedEntityId: c.id,
      dedupeKey: `release:${c.id}`,
    });
  }
  closeContract(s, c, "released", "Released");
  p.currentClubId = null;
  p.contractId = null;
  p.transferStatus = "listed";
  s.football.transferHistory.push({
    id: nextRecordId(s, "TR"),
    playerId: p.id,
    playerName: playerName(p),
    position: p.primaryPosition,
    fromClubId: s.clubName,
    toClubId: null,
    fee: 0,
    weeklyWage: 0,
    signingBonus: 0,
    season: s.season,
    week: s.week,
    absoluteWeek: nowAbs(s),
    type: "release",
  });
  syncLegacySquad(s);
  return { ok: true, reason: `Released. Settlement £${compensation.toLocaleString()}` };
}

export function setTransferStatusInPlace(
  s: GameState,
  playerId: string,
  status: FootballPlayer["transferStatus"],
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

/** Would an AI club keep this player? Deterministic, football-shaped. */
function aiRenews(s: GameState, c: PlayerContract, p: FootballPlayer): boolean {
  const squad = squadOf(s, c.clubId);
  if (squad.length > SQUAD_SIZE + 2) return false;
  const rng = seededRng(s.saveSeed, "aiRenew", c.id, s.season);
  const rep = clubReputation(s, c.clubId);
  const age = ageOf(p, s.season);
  const wanted = p.currentAbility >= rep * 0.6 + 25;
  const tooOld = age >= 35;
  if (tooOld) return false;
  if (squad.length <= MIN_SQUAD_SIZE + 2) return true;
  return wanted ? rng() < 0.85 : rng() < 0.45;
}

/** Roll one AI contract over onto fresh, level-appropriate terms. */
function renewAiContract(s: GameState, c: PlayerContract, p: FootballPlayer): void {
  const rng = seededRng(s.saveSeed, "aiRenewTerms", c.id, s.season);
  const age = ageOf(p, s.season);
  closeContract(s, c, "renewed", "Expired");
  const fresh = issueContract(
    s,
    p.id,
    c.clubId,
    recruitmentWageForClub(s, c.clubId, p.currentAbility, age, p.potentialAbility),
    rngInt(rng, 1, 4),
    c.squadRole,
    0,
    0,
  );
  p.currentClubId = c.clubId;
  p.contractId = fresh.id;
  p.transferStatus = "unlisted";
}

/** Contracts that have run out: player leaves, records are written. */
function processExpiries(s: GameState): void {
  const abs = nowAbs(s);
  for (const c of s.football.contracts) {
    if (c.status !== "Active" && c.status !== "Expiring") continue;
    const left = contractExpiresAbs(c) - abs;
    if (left <= 0) {
      const p = playerById(s, c.playerId);
      // AI clubs run their own squads: rather than let a squad dissolve, they
      // renew players they still need. Only the user's club is left exposed
      // to its own inaction.
      if (p && c.clubId !== s.clubName && aiRenews(s, c, p)) {
        renewAiContract(s, c, p);
        continue;
      }
      c.status = "Expired";
      s.football.contractHistory.push({
        id: nextRecordId(s, "CR"),
        contractId: c.id,
        playerId: c.playerId,
        playerName: p ? playerName(p) : c.playerId,
        clubId: c.clubId,
        weeklyWage: c.weeklyWage,
        startSeason: c.startSeason,
        endSeason: s.season,
        seasons: Math.max(1, s.season - c.startSeason + 1),
        outcome: "expired",
        season: s.season,
        week: s.week,
      });
      if (p && p.contractId === c.id) {
        p.currentClubId = null;
        p.contractId = null;
        p.transferStatus = "listed";
        s.football.transferHistory.push({
          id: nextRecordId(s, "TR"),
          playerId: p.id,
          playerName: playerName(p),
          position: p.primaryPosition,
          fromClubId: c.clubId,
          toClubId: null,
          fee: 0,
          weeklyWage: 0,
          signingBonus: 0,
          season: s.season,
          week: s.week,
          absoluteWeek: abs,
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
      log(
        n,
        {
          round: n.clubRounds,
          party: "club",
          action: "withdraw",
          note: "Talks lapsed without agreement.",
        },
        abs,
      );
      syncTransferTargetNegotiationInPlace(s, n);
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

  const rivals = buildWorldSimulationPlan(s).focusClubIds.filter((c) => c !== s.clubName);
  if (!rivals.length) return;
  // Clubs that can plausibly afford him show interest first.
  const suitors = rivals.filter((c) => clubReputation(s, c) >= p.reputation - 12);
  const buyer = (suitors.length ? suitors : rivals)[
    rngInt(rng, 0, (suitors.length ? suitors : rivals).length - 1)
  ];

  const listedBoost = p.transferStatus === "listed" ? 1.0 : rngRange(rng, 0.72, 1.02);
  const fee = recruitmentNormaliseTransferFeeForUser(
    s,
    askingPrice(s, p) * listedBoost,
    "asking",
  );

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
  log(
    n,
    {
      round: 1,
      party: "club",
      action: "offer",
      note: `${buyer} bid £${fee.toLocaleString()} for ${playerName(p)}.`,
    },
    abs,
  );
  s.football.negotiations.push(n);
}

/**
 * The single free-transfer registration path. Both the AI department and the
 * user's emergency squad cover route here so ownership, the contract and the
 * history record are always written together, exactly once.
 */
function registerFreeSigning(
  s: GameState,
  pick: FootballPlayer,
  club: string,
  c: PlayerContract,
): void {
  pick.currentClubId = club;
  pick.contractId = c.id;
  pick.transferStatus = "unlisted";
  s.football.transferHistory.push({
    id: nextRecordId(s, "TR"),
    playerId: pick.id,
    playerName: playerName(pick),
    position: pick.primaryPosition,
    fromClubId: null,
    toClubId: club,
    fee: 0,
    weeklyWage: c.weeklyWage,
    signingBonus: 0,
    season: s.season,
    week: s.week,
    absoluteWeek: nowAbs(s),
    type: "freeTransfer",
  });
}

/**
 * AI recruitment. Believable, not optimal: clubs only act when they are
 * short of bodies, and they sign the best free agent they can plausibly pay.
 */

function runAiRecruitment(s: GameState, windowOpen: boolean): void {
  if (!windowOpen) return;
  const rng = seededRng(s.saveSeed, "aiRecruit", s.season, s.week);
  const clubs = buildWorldSimulationPlan(s).focusClubIds.filter((c) => c !== s.clubName);

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
      s,
      pick.id,
      club,
      recruitmentWageForClub(
        s,
        club,
        pick.currentAbility,
        ageOf(pick, s.season),
        pick.potentialAbility,
      ),
      rngInt(rng, 1, 3),
      "Rotation",
      0,
      0,
    );
    registerFreeSigning(s, pick, club, c);
  }
}

/**
 * The club must be able to field a team. When the squad falls below the
 * minimum, the recruitment department signs the best free agent it can
 * plausibly attract — a chairman who ignores the squad still pays wages.
 */
function coverSquadShortfall(s: GameState): void {
  const squad = userSquad(s);
  if (squad.length >= MIN_SQUAD_SIZE) return;
  const rng = seededRng(s.saveSeed, "squadCover", s.season, s.week);
  const rep = clubReputation(s, s.clubName);
  const level = recruitmentLevelOfUser(s);
  const needed = Math.min(2, MIN_SQUAD_SIZE - squad.length);

  for (let k = 0; k < needed; k++) {
    // Emergency cover is bought within the club's means, not on ambition:
    // the department signs the best player the wage structure can carry.
    const ceiling = Math.max(
      level <= 6 ? 600 : 25,
      recruitmentSustainableWageBill(s, s.clubName) - userWageBill(s),
    );
    const affordable = (p: FootballPlayer) =>
      recruitmentWageForClub(
        s,
        s.clubName,
        p.currentAbility,
        ageOf(p, s.season),
        p.potentialAbility,
      ) <= ceiling;
    const all = freeAgents(s).filter((p) => p.reputation <= rep + 6);
    if (!all.length) return;
    const within = all
      .filter(affordable)
      .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));
    const pool = within.length
      ? within
      : [...all].sort((a, b) => a.currentAbility - b.currentAbility || a.id.localeCompare(b.id));
    const pick = pool[Math.min(pool.length - 1, rngInt(rng, 0, 2))];
    const age = ageOf(pick, s.season);
    const c = issueContract(
      s,
      pick.id,
      s.clubName,
      recruitmentWageForClub(s, s.clubName, pick.currentAbility, age, pick.potentialAbility),
      rngInt(rng, 1, 3),
      "Rotation",
      0,
      0,
    );
    registerFreeSigning(s, pick, s.clubName, c);
  }
}

/**
 * Free agents dry up as contracts are handed out. Top up the pool so the
 * market never empties — released players, academy leavers and foreign
 * arrivals all keep it stocked in a real football economy.
 */
function replenishFreeAgents(s: GameState): void {
  const pool = freeAgents(s);
  if (pool.length >= 12) return;
  const level = deepestWorldFootballLevel(s);
  const seq = s.football.players.length;
  for (let i = 0; i < 12 - pool.length; i++) {
    const p = makePlayerFor(s.saveSeed, null, seq + i, 50, s.season, level, 45);
    p.id = `${p.id}-fa${s.season}-${s.week}-${i}`;
    p.contractId = null;
    p.transferStatus = "listed";
    s.football.players.push(p);
  }
}

/** Called once per week from advanceWeek, before the inbox runs. */
export function runRecruitmentWeek(s: GameState, windowOpen: boolean): void {
  ensureRecruitment(s);
  processExpiries(s);
  expireNegotiations(s);
  replenishFreeAgents(s);
  generateIncomingOffers(s, windowOpen);
  runAiRecruitment(s, windowOpen);
  coverSquadShortfall(s);
  syncLegacySquad(s);
}

/** Season rollover: age the world, refresh values, write the season record. */
export function closeRecruitmentSeason(
  s: GameState,
  season: number,
): RecruitmentSeasonSummary | null {
  ensureRecruitment(s);
  if (s.football.seasonHistory.some((x) => x.season === season)) return null;
  const rows = s.football.transferHistory.filter((r) => r.season === season);
  const summary: RecruitmentSeasonSummary = {
    season,
    spend: int(
      rows.filter((r) => r.toClubId === s.clubName).reduce((a, r) => a + r.fee + r.signingBonus, 0),
    ),
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
    const level = p.currentClubId
      ? recruitmentLevelOfClub(s, p.currentClubId)
      : recruitmentLevelOfUser(s);
    p.marketValue = recruitmentPlayerValue(p.currentAbility, p.potentialAbility, age, level);
    p.wageExpectation = p.currentClubId
      ? recruitmentWageForClub(s, p.currentClubId, p.currentAbility, age, p.potentialAbility)
      : recruitmentWageForLevel(level, p.currentAbility, 45, age, p.potentialAbility);
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
  /** @deprecated transfer spending now comes directly from cash. */
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
    transferBudget: 0,
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
  return (s.football?.transferHistory ?? []).filter(
    (r) => r.season === s.season && r.toClubId === s.clubName,
  ).length;
}

/** Count of contracts renewed at the user's club this season. */
export function renewalsThisSeason(s: GameState): number {
  return (s.football?.contractHistory ?? []).filter(
    (r) => r.season === s.season && r.clubId === s.clubName && r.outcome === "renewed",
  ).length;
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

const cloned = (
  s: GameState,
  fn: (w: GameState) => unknown,
): { state: GameState; result: NegotiationResult } => {
  const w = structuredClone(s);
  const result = fn(w) as NegotiationResult;
  syncLegacySquad(w);
  return { state: w, result };
};

export const submitTransferOffer = (
  s: GameState,
  playerId: string,
  fee: number,
  role?: SquadRole,
  openingWeeklyWage?: number,
) =>
  cloned(s, (w) =>
    openTransferNegotiationInPlace(w, playerId, fee, role, openingWeeklyWage),
  );
export const submitTransferEnquiry = (
  s: GameState,
  playerId: string,
  role?: SquadRole,
  openingWeeklyWage?: number,
) =>
  cloned(s, (w) =>
    openTransferEnquiryInPlace(w, playerId, role, openingWeeklyWage),
  );
export const submitEnquiryOffer = (s: GameState, id: string, fee?: number) =>
  cloned(s, (w) => submitEnquiryOfferInPlace(w, id, fee));
export const improveTransferOffer = (s: GameState, id: string, fee?: number) =>
  cloned(s, (w) => counterClubOfferInPlace(w, id, fee));
export const improvePersonalTerms = (
  s: GameState,
  id: string,
  wage?: number,
  seasons?: number,
  role?: SquadRole,
) => cloned(s, (w) => improvePlayerTermsInPlace(w, id, wage, seasons, role));
export const withdrawFromTalks = (s: GameState, id: string) =>
  cloned(s, (w) => withdrawNegotiationInPlace(w, id));
export const beginTransferRegistration = (s: GameState, id: string) =>
  cloned(s, (w) => beginTransferRegistrationInPlace(w, id));
export const completeTransfer = (s: GameState, id: string) =>
  cloned(s, (w) => completeTransferInPlace(w, id));
export const respondToIncomingOffer = (
  s: GameState,
  id: string,
  action: "accept" | "reject" | "counter",
  fee?: number,
) => cloned(s, (w) => respondToIncomingOfferInPlace(w, id, action, fee));
export const renewContract = (s: GameState, playerId: string, override?: Partial<RenewalTerms>) =>
  cloned(s, (w) => renewContractInPlace(w, playerId, override));
export const releasePlayer = (s: GameState, playerId: string) =>
  cloned(s, (w) => releasePlayerInPlace(w, playerId));
export const setTransferStatus = (
  s: GameState,
  playerId: string,
  status: FootballPlayer["transferStatus"],
) => cloned(s, (w) => setTransferStatusInPlace(w, playerId, status));

export { SQUAD_ROLES };
