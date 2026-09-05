import type { FootballPlayer, GameState, PlayerContract, Position, SquadRole } from "./types";
import { hashString, seededRng, rngInt, rngRange } from "./rng";
import {
  FREE_AGENT_POOL,
  SQUAD_SIZE,
  ageOf,
  playerName,
  syncLegacySquad,
  valueForPlayer,
  wageForAbility,
} from "./recruitment";
import { buildWorldSimulationPlan } from "./world";
import { clubReputation } from "./reputation";
import { tierOfClub } from "./economy";
import { WEEKS_PER_SEASON } from "./time";
import { isUserClubReference, sameClubReference } from "./clubReference";
import {
  ensurePlayerRegistrationStateInPlace,
  playerOwnerClubId,
  playerRegisteredClubId,
  setPlayerClubIdentityInPlace,
} from "./playerRegistration";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value);
const MAX_FREE_AGENTS = FREE_AGENT_POOL * 2;
const MIN_AI_SELLER_SQUAD = Math.max(18, SQUAD_SIZE - 4);
const POSITIONS_FOR_BALANCE: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_TARGET: Record<Position, number> = {
  GK: 2,
  DEF: 7,
  MID: 7,
  FWD: 5,
};
const FIRST = [
  "Aaron",
  "Ben",
  "Cameron",
  "Daniel",
  "Elliot",
  "Fraser",
  "Jamie",
  "Lewis",
  "Michael",
  "Nathan",
  "Owen",
  "Ryan",
  "Scott",
  "Thomas",
  "Adam",
  "Jack",
];
const LAST = [
  "Campbell",
  "Clark",
  "Douglas",
  "Ferguson",
  "Graham",
  "Hamilton",
  "Johnston",
  "Murray",
  "Robertson",
  "Stewart",
  "Taylor",
  "Wallace",
  "Wilson",
  "Young",
  "McLean",
  "MacDonald",
];
const NATIONS = ["England", "Scotland", "Wales", "Ireland"];
const POSITIONS: Position[] = ["GK", "DEF", "DEF", "MID", "MID", "FWD"];

/**
 * Season-boundary lifecycle for detailed Focus players.
 * Retired player detail is not retained in the hot core; immutable transfer
 * and contract records preserve the career event instead.
 */
export function runPlayerCareerRollover(s: GameState): void {
  if (!s.football?.players?.length) return;
  ensurePlayerRegistrationStateInPlace(s);

  const focus = new Set(buildWorldSimulationPlan(s).focusClubIds);
  for (const player of s.football.players) {
    const registeredClubId = playerRegisteredClubId(player);
    if (!registeredClubId || !focus.has(registeredClubId)) continue;
    progressPlayerForSeason(s, player);
  }

  processRetirements(s, focus);
  pruneDeadContracts(s);
  pruneFreeAgentPool(s);
  runAiCareerTransfers(s, focus);
  pruneDeadContracts(s);
  runYouthIntake(s, focus);
  syncLegacySquad(s);
}

export function progressPlayerForSeason(s: GameState, player: FootballPlayer): number {
  const age = ageOf(player, s.season);
  const before = player.currentAbility;
  const rng = seededRng(s.saveSeed, "careerProgress", player.id, s.season);
  let delta = 0;

  if (age <= 20) {
    delta = Math.min(Math.max(0, player.potentialAbility - before), round(rngRange(rng, 0.5, 3)));
  } else if (age <= 23) {
    delta = Math.min(Math.max(0, player.potentialAbility - before), round(rngRange(rng, 0, 2)));
  } else if (age <= 27) {
    delta = Math.min(Math.max(0, player.potentialAbility - before), rng() < 0.45 ? 1 : 0);
  } else if (age <= 30) {
    const roll = rng();
    delta = roll < 0.12 ? 1 : roll > 0.9 ? -1 : 0;
  } else if (age <= 33) {
    delta = rng() < 0.62 ? -1 : 0;
  } else if (age <= 35) {
    delta = -round(rngRange(rng, 0.5, 1.8));
  } else {
    delta = -round(rngRange(rng, 1, 2.8));
  }

  if (delta > 0 && player.personality === "Professional" && rng() < 0.35) delta += 1;
  if (delta > 0 && player.personality === "Temperamental" && rng() < 0.3) delta -= 1;
  if (delta < 0 && player.personality === "Professional" && rng() < 0.35) delta += 1;

  player.currentAbility = clamp(before + delta, 30, Math.max(before, player.potentialAbility));
  player.reputation = clamp(
    player.reputation + clamp(round((player.currentAbility - player.reputation) * 0.12), -2, 2),
    1,
    100,
  );
  return player.currentAbility - before;
}

/**
 * Cheap deterministic AI market for detailed Focus clubs. It only reacts to
 * real squad vacancies, never moves a player into or out of the user's club,
 * and never invents club cash. AI finances remain an aggregate concern while
 * immutable transfer/contract history records the football-world event.
 */
export function runAiCareerTransfers(s: GameState, focusOverride?: Set<string>): number {
  if (!s.football?.players?.length) return 0;

  const focus = focusOverride ?? new Set(buildWorldSimulationPlan(s).focusClubIds);
  const aiClubs = [...focus]
    .filter((club) => !isUserClubReference(s, club))
    .sort((a, b) => a.localeCompare(b));
  let completed = 0;
  const movedPlayerIds = new Set<string>();

  for (const buyer of aiClubs) {
    const buyerSquad = clubPlayers(s, buyer);
    if (buyerSquad.length >= SQUAD_SIZE) continue;

    const targetPosition = positionNeed(buyerSquad);
    const candidate = chooseAiTransferCandidate(s, buyer, targetPosition, aiClubs, movedPlayerIds);
    const seller = candidate ? playerOwnerClubId(candidate) : null;
    if (!candidate || !seller) continue;

    const rng = seededRng(s.saveSeed, "aiCareerTransfer", buyer, candidate.id, s.season);
    if (rng() > 0.72) continue;

    completeAiCareerTransfer(s, candidate, seller, buyer, rng);
    movedPlayerIds.add(candidate.id);
    completed++;
  }

  return completed;
}

function clubPlayers(s: GameState, club: string): FootballPlayer[] {
  return s.football.players.filter((player) =>
    sameClubReference(s, playerRegisteredClubId(player), club),
  );
}

function positionNeed(squad: FootballPlayer[]): Position {
  const count = (position: Position) =>
    squad.filter((player) => player.primaryPosition === position).length;
  return [...POSITIONS_FOR_BALANCE].sort((a, b) => {
    const needA = POSITION_TARGET[a] - count(a);
    const needB = POSITION_TARGET[b] - count(b);
    return needB - needA || a.localeCompare(b);
  })[0];
}

function chooseAiTransferCandidate(
  s: GameState,
  buyer: string,
  position: Position,
  aiClubs: string[],
  movedPlayerIds: Set<string>,
): FootballPlayer | null {
  const buyerRep = clubReputation(s, buyer);
  const candidates = s.football.players.filter((player) => {
    if (movedPlayerIds.has(player.id)) return false;
    const seller = playerOwnerClubId(player);
    if (
      !seller ||
      sameClubReference(s, seller, buyer) ||
      isUserClubReference(s, seller) ||
      !aiClubs.some((club) => sameClubReference(s, club, seller))
    ) {
      return false;
    }
    if (player.primaryPosition !== position || player.availability !== "available") return false;
    const age = ageOf(player, s.season);
    if (age < 18 || age > 31) return false;
    if (clubPlayers(s, seller).length <= MIN_AI_SELLER_SQUAD) return false;
    return true;
  });

  if (!candidates.length) return null;

  return candidates
    .map((player) => {
      const rng = seededRng(s.saveSeed, "aiCareerTarget", buyer, player.id, s.season);
      const ambitionFit =
        player.personality === "Ambitious" ? Math.max(0, buyerRep - player.reputation) * 0.25 : 0;
      const loyaltyPenalty = player.personality === "Loyal" ? 5 : 0;
      const development = Math.max(0, player.potentialAbility - player.currentAbility) * 0.18;
      const score =
        player.currentAbility + development + ambitionFit - loyaltyPenalty + rngRange(rng, -4, 4);
      return { player, score };
    })
    .sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id))[0].player;
}

function completeAiCareerTransfer(
  s: GameState,
  player: FootballPlayer,
  seller: string,
  buyer: string,
  rng: () => number,
): void {
  const oldContract = s.football.contracts.find(
    (contract) =>
      contract.playerId === player.id &&
      contract.clubId === seller &&
      (contract.status === "Active" || contract.status === "Expiring"),
  );

  // Dense-world saves can contain more than one legacy live contract for a
  // player. A transfer closes every previous deal before the new one starts.
  for (const contract of s.football.contracts) {
    if (
      contract.playerId === player.id &&
      (contract.status === "Active" || contract.status === "Expiring")
    ) {
      contract.status = "Expired";
    }
  }

  if (oldContract) {
    s.football.contractHistory.push({
      id: nextRecord(s, "CR"),
      contractId: oldContract.id,
      playerId: player.id,
      playerName: playerName(player),
      clubId: seller,
      weeklyWage: oldContract.weeklyWage,
      startSeason: oldContract.startSeason,
      endSeason: s.season,
      seasons: Math.max(1, s.season - oldContract.startSeason + 1),
      outcome: "transferred",
      season: s.season,
      week: s.week,
    });
  }

  const buyerRep = clubReputation(s, buyer);
  const buyerTier = tierOfClub(s, buyer);
  const age = ageOf(player, s.season);
  const fee = Math.max(
    0,
    Math.round((player.marketValue * rngRange(rng, 0.82, 1.14)) / 1_000) * 1_000,
  );
  const wage = Math.max(
    150,
    Math.round(
      wageForAbility(player.currentAbility, buyerRep, buyerTier, age, player.potentialAbility) / 25,
    ) * 25,
  );
  const newContract: PlayerContract = {
    id: `PC-${String(s.football.nextContractId++).padStart(6, "0")}`,
    playerId: player.id,
    clubId: buyer,
    startSeason: s.season,
    startWeek: s.week,
    expirySeason: s.season + rngInt(rng, 2, 4) - 1,
    expiryWeek: WEEKS_PER_SEASON,
    weeklyWage: wage,
    squadRole: roleForAiSigning(s, buyer, player),
    signingBonus: 0,
    agreedTransferFee: fee,
    status: "Active",
  };

  s.football.contracts.push(newContract);
  setPlayerClubIdentityInPlace(player, buyer);
  player.contractId = newContract.id;
  player.transferStatus = "unlisted";
  player.wageExpectation = wage;
  player.marketValue = valueForPlayer(
    player.currentAbility,
    player.potentialAbility,
    age,
    buyerTier,
  );

  s.football.transferHistory = s.football.transferHistory.concat({
    id: nextRecord(s, "TR"),
    playerId: player.id,
    playerName: playerName(player),
    position: player.primaryPosition,
    fromClubId: seller,
    toClubId: buyer,
    fee,
    weeklyWage: wage,
    signingBonus: 0,
    season: s.season,
    week: s.week,
    absoluteWeek: (s.season - 1) * WEEKS_PER_SEASON + s.week,
    type: "transfer",
  });
}

function roleForAiSigning(s: GameState, buyer: string, player: FootballPlayer): SquadRole {
  const squad = clubPlayers(s, buyer);
  const average = squad.length
    ? squad.reduce((sum, member) => sum + member.currentAbility, 0) / squad.length
    : player.currentAbility;
  if (player.currentAbility >= average + 7) return "Key Player";
  if (player.currentAbility >= average + 1) return "First Team";
  if (ageOf(player, s.season) <= 21) return "Prospect";
  return "Rotation";
}

function shouldRetire(s: GameState, player: FootballPlayer): boolean {
  const age = ageOf(player, s.season);
  if (age < 34) return false;
  if (age >= 40) return true;

  const rng = seededRng(s.saveSeed, "retirement", player.id, s.season);
  let chance =
    age === 34
      ? 0.02
      : age === 35
        ? 0.06
        : age === 36
          ? 0.16
          : age === 37
            ? 0.34
            : age === 38
              ? 0.58
              : 0.82;

  if (player.personality === "Professional") chance -= 0.08;
  if (player.currentAbility >= 75) chance -= 0.06;
  if (player.currentAbility <= 48) chance += 0.08;
  return rng() < clamp(chance, 0, 0.95);
}

function processRetirements(s: GameState, focus: Set<string>): void {
  const retiredIds = new Set<string>();

  for (const player of s.football.players) {
    const club = playerRegisteredClubId(player);
    if (!club || !focus.has(club) || !shouldRetire(s, player)) continue;

    const contract = s.football.contracts.find(
      (row) => row.playerId === player.id && (row.status === "Active" || row.status === "Expiring"),
    );

    if (contract) {
      contract.status = "Expired";
      s.football.contractHistory.push({
        id: nextRecord(s, "CR"),
        contractId: contract.id,
        playerId: player.id,
        playerName: playerName(player),
        clubId: contract.clubId,
        weeklyWage: contract.weeklyWage,
        startSeason: contract.startSeason,
        endSeason: s.season,
        seasons: Math.max(1, s.season - contract.startSeason + 1),
        outcome: "expired",
        season: s.season,
        week: s.week,
      });
    }

    s.football.transferHistory = s.football.transferHistory.concat({
      id: nextRecord(s, "TR"),
      playerId: player.id,
      playerName: playerName(player),
      position: player.primaryPosition,
      fromClubId: club,
      toClubId: null,
      fee: 0,
      weeklyWage: 0,
      signingBonus: 0,
      season: s.season,
      week: s.week,
      absoluteWeek: (s.season - 1) * WEEKS_PER_SEASON + s.week,
      type: "contractExpiry",
    });

    retiredIds.add(player.id);
  }

  if (!retiredIds.size) return;

  s.football.players = s.football.players.filter((player) => !retiredIds.has(player.id));
  s.football.shortlist = s.football.shortlist.filter((id) => !retiredIds.has(id));
  s.football.negotiations = s.football.negotiations.filter(
    (negotiation) => !retiredIds.has(negotiation.playerId),
  );
}

/** Remove redundant dead contract rows once no live object references them. */
function pruneDeadContracts(s: GameState): void {
  const referenced = new Set<string>();
  for (const player of s.football.players) if (player.contractId) referenced.add(player.contractId);
  for (const negotiation of s.football.negotiations) {
    const row = negotiation as unknown as Record<string, unknown>;
    if (typeof row.contractId === "string") referenced.add(row.contractId);
  }

  s.football.contracts = s.football.contracts.filter((contract) => {
    const dead = contract.status === "Expired" || contract.status === "Released";
    return !dead || referenced.has(contract.id);
  });
}

/**
 * Contract expiries can create hundreds of persistent free-agent rows over a
 * long save. Keep a useful deterministic market while preserving every player
 * currently involved in user activity. Historical moves remain in immutable
 * transfer/contract history; discarded free-agent detail is not authoritative.
 */
function pruneFreeAgentPool(s: GameState): void {
  const free = s.football.players.filter(
    (player) => playerOwnerClubId(player) === null && playerRegisteredClubId(player) === null,
  );
  if (free.length <= MAX_FREE_AGENTS) return;

  const protectedIds = new Set<string>(s.football.shortlist);
  for (const negotiation of s.football.negotiations) protectedIds.add(negotiation.playerId);

  const protectedPlayers = free.filter((player) => protectedIds.has(player.id));
  const candidates = free
    .filter((player) => !protectedIds.has(player.id))
    .sort(
      (a, b) =>
        b.createdSeason - a.createdSeason ||
        b.potentialAbility - a.potentialAbility ||
        b.currentAbility - a.currentAbility ||
        b.reputation - a.reputation ||
        a.id.localeCompare(b.id),
    );

  const marketSlots = Math.max(0, MAX_FREE_AGENTS - protectedPlayers.length);
  const retained = new Set([
    ...protectedPlayers.map((player) => player.id),
    ...candidates.slice(0, marketSlots).map((player) => player.id),
  ]);

  s.football.players = s.football.players.filter(
    (player) =>
      playerOwnerClubId(player) !== null ||
      playerRegisteredClubId(player) !== null ||
      retained.has(player.id),
  );
}

function runYouthIntake(s: GameState, focus: Set<string>): void {
  for (const club of [...focus].sort()) {
    const active = s.football.players.filter(
      (player) => playerRegisteredClubId(player) === club,
    );
    const count = clamp(SQUAD_SIZE - active.length, 0, 3);

    for (let index = 0; index < count; index++) {
      const player = makeYouth(s, club, index);
      if (s.football.players.some((existing) => existing.id === player.id)) continue;

      const contract = makeYouthContract(s, club, player, index);
      player.contractId = contract.id;
      s.football.players.push(player);
      s.football.contracts.push(contract);
      s.football.transferHistory = s.football.transferHistory.concat({
        id: nextRecord(s, "TR"),
        playerId: player.id,
        playerName: playerName(player),
        position: player.primaryPosition,
        fromClubId: null,
        toClubId: club,
        fee: 0,
        weeklyWage: contract.weeklyWage,
        signingBonus: 0,
        season: s.season,
        week: s.week,
        absoluteWeek: (s.season - 1) * WEEKS_PER_SEASON + s.week,
        type: "freeTransfer",
      });
    }
  }
}

function makeYouth(s: GameState, club: string, index: number): FootballPlayer {
  const rng = seededRng(s.saveSeed, "youthIntake", club, s.season, index);
  const rep = clubReputation(s, club);
  const tier = tierOfClub(s, club);
  const age = rngInt(rng, 16, 18);
  const ability = clamp(round(34 + rep * 0.28 + rngRange(rng, -5, 6)), 32, 67);
  const potential = clamp(ability + rngInt(rng, 8, 28), ability + 4, 92);

  return {
    id: `y-${s.season}-${hashString(`${s.saveSeed}|youth|${club}|${s.season}|${index}`).toString(
      36,
    )}`,
    firstName: FIRST[rngInt(rng, 0, FIRST.length - 1)],
    lastName: LAST[rngInt(rng, 0, LAST.length - 1)],
    dateOfBirth: {
      year: 2000 + s.season - 1 - age,
      month: rngInt(rng, 1, 12),
      day: rngInt(rng, 1, 28),
    },
    nationality: NATIONS[rngInt(rng, 0, NATIONS.length - 1)],
    preferredFoot: rng() < 0.2 ? "Left" : "Right",
    primaryPosition: POSITIONS[rngInt(rng, 0, POSITIONS.length - 1)],
    secondaryPositions: [],
    currentClubId: club,
    reputation: clamp(round(ability * 0.72), 5, 70),
    currentAbility: ability,
    potentialAbility: potential,
    marketValue: valueForPlayer(ability, potential, age, tier),
    wageExpectation: wageForAbility(ability, rep, tier, age, potential),
    personality: "Balanced",
    contractId: null,
    transferStatus: "unlisted",
    availability: "available",
    createdSeason: s.season,
  };
}

function makeYouthContract(
  s: GameState,
  club: string,
  player: FootballPlayer,
  index: number,
): PlayerContract {
  const rng = seededRng(s.saveSeed, "youthContract", club, s.season, index);
  const rep = clubReputation(s, club);
  const tier = tierOfClub(s, club);
  const wage = Math.max(
    150,
    Math.round(
      (wageForAbility(
        player.currentAbility,
        rep,
        tier,
        ageOf(player, s.season),
        player.potentialAbility,
      ) *
        0.55) /
        25,
    ) * 25,
  );
  const role: SquadRole = "Prospect";

  return {
    id: `PC-Y-${s.season}-${hashString(`${s.saveSeed}|yc|${club}|${s.season}|${index}`).toString(
      36,
    )}`,
    playerId: player.id,
    clubId: club,
    startSeason: s.season,
    startWeek: s.week,
    expirySeason: s.season + rngInt(rng, 2, 4) - 1,
    expiryWeek: WEEKS_PER_SEASON,
    weeklyWage: wage,
    squadRole: role,
    signingBonus: 0,
    agreedTransferFee: 0,
    status: "Active",
  };
}

function nextRecord(s: GameState, prefix: string): string {
  const next = s.football.nextRecordId ?? 1;
  s.football.nextRecordId = next + 1;
  return `${prefix}-${String(next).padStart(6, "0")}`;
}
