import type { FootballPlayer, GameState, SquadRole, TransferNegotiation } from "./types";
import { clubDisplayName, sameClubReference, userClubReference } from "./clubReference";
import { clubReputation } from "./reputation";
import {
  MAX_SQUAD_SIZE,
  SQUAD_TEMPLATE,
  playerName,
  squadOf,
  wageDemand,
} from "./recruitmentLegacy";
import {
  recruitmentNormaliseTransferFeeForClub,
  recruitmentUserNegotiationWage,
  recruitmentUserNegotiationWageStep,
} from "./recruitmentEconomy";
import { transferTargetAskingPrice, transferTargetPlayer } from "./recruitmentTargetBridge";
import { askingPrice } from "./recruitmentLegacy";
import { buildWorldSimulationPlan } from "./world";
import { rngRange, seededRng } from "./rng";
import { transferAbsoluteDay } from "./transferResponses";
import { absoluteWeek } from "./time";

export type PlayerTransferInterestBand = "keen" | "open" | "needsConvincing" | "notInterested";
export type TransferCompetitionStatus = "monitoring" | "bid" | "clubAccepted" | "playerTerms";

declare module "./types" {
  interface TransferNegotiation {
    /** Stable pre-talk interest reading from the player's camp. */
    playerInterest?: PlayerTransferInterestBand;
    playerInterestScore?: number;
    playerInterestReason?: string;
    playerInterestRevealed?: boolean;
    /** Rival personal-terms package when another club has reached the player. */
    competingWeeklyWage?: number;
    competitionStatus?: TransferCompetitionStatus;
    competitionEscalations?: number;
    lastCompetitionUpdateDay?: number;
    /** True once a previously agreed player has reopened terms because of rival pressure. */
    renegotiationRequested?: boolean;
  }
}

export interface PlayerTransferInterest {
  band: PlayerTransferInterestBand;
  score: number;
  reason: string;
}

const roleInterest: Record<SquadRole, number> = {
  "Key Player": 15,
  "First Team": 8,
  "Rotation": 0,
  "Prospect": -4,
};

const personalityInterest: Record<FootballPlayer["personality"], number> = {
  Balanced: 0,
  Ambitious: 4,
  Loyal: -6,
  Professional: 1,
  Mercenary: 5,
  Temperamental: -2,
};

export function playerTransferInterest(
  state: GameState,
  playerId: string,
  role: SquadRole,
): PlayerTransferInterest | null {
  const player = transferTargetPlayer(state, playerId);
  if (!player) return null;

  const userRep = clubReputation(state, userClubReference(state));
  const currentRep = player.currentClubId ? clubReputation(state, player.currentClubId) : userRep;
  const reputationGap = userRep - player.reputation;
  const clubStep = userRep - currentRep;
  const listedBoost = player.transferStatus === "listed" ? 7 : 0;
  const age = Math.max(16, state.season - player.dateOfBirth.year);
  const prospectPenalty = role === "Prospect" && age >= 24 ? -8 : 0;
  const rng = seededRng(state.saveSeed, "player-transfer-interest", player.id, userClubReference(state), role);

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        56 +
          reputationGap * 1.45 +
          clubStep * 0.35 +
          roleInterest[role] +
          personalityInterest[player.personality] +
          listedBoost +
          prospectPenalty +
          rngRange(rng, -7, 7),
      ),
    ),
  );

  if (score >= 68) {
    return {
      band: "keen",
      score,
      reason: role === "Key Player"
        ? "The agent says the player is keen on the move and likes the importance being offered."
        : "The agent says the player is keen to discuss the move.",
    };
  }
  if (score >= 45) {
    return {
      band: "open",
      score,
      reason: "The player is open to the move if the football and financial package is right.",
    };
  }
  if (score >= 25) {
    return {
      band: "needsConvincing",
      score,
      reason: "The player has reservations about the move and would need a strong role and contract package.",
    };
  }
  return {
    band: "notInterested",
    score,
    reason: "The player's camp have indicated that he is not interested in joining the club at this stage.",
  };
}

export function initialisePlayerTransferInterestInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
): PlayerTransferInterest | null {
  if (negotiation.playerInterest) {
    return {
      band: negotiation.playerInterest,
      score: negotiation.playerInterestScore ?? 50,
      reason: negotiation.playerInterestReason ?? "Player interest has been assessed.",
    };
  }
  const interest = playerTransferInterest(state, negotiation.playerId, negotiation.proposedRole);
  if (!interest) return null;
  negotiation.playerInterest = interest.band;
  negotiation.playerInterestScore = interest.score;
  negotiation.playerInterestReason = interest.reason;
  return interest;
}

export function playerInterestWageMultiplier(negotiation: TransferNegotiation): number {
  switch (negotiation.playerInterest) {
    case "keen": return 0.96;
    case "needsConvincing": return 1.1;
    case "notInterested": return 1.25;
    case "open":
    default:
      return 1;
  }
}

function plausibleRivalClub(
  state: GameState,
  player: FootballPlayer,
): string | null {
  const seller = player.currentClubId;
  const candidates = buildWorldSimulationPlan(state).focusClubIds
    .filter((clubId) =>
      !sameClubReference(state, clubId, userClubReference(state)) &&
      (!seller || !sameClubReference(state, clubId, seller)),
    )
    .map((clubId) => {
      const squad = squadOf(state, clubId);
      const positional = squad.filter((candidate) => candidate.primaryPosition === player.primaryPosition);
      const need = Math.max(0, SQUAD_TEMPLATE[player.primaryPosition] - positional.length);
      const weakest = positional.length ? Math.min(...positional.map((candidate) => candidate.currentAbility)) : 0;
      const upgrade = Math.max(0, player.currentAbility - weakest);
      return {
        clubId,
        need,
        upgrade,
        squadSize: squad.length,
        rep: clubReputation(state, clubId),
      };
    })
    .filter((candidate) =>
      candidate.squadSize < MAX_SQUAD_SIZE &&
      (candidate.need > 0 || candidate.upgrade >= 4) &&
      candidate.rep >= player.reputation - 12,
    )
    .sort((a, b) =>
      b.need - a.need ||
      b.upgrade - a.upgrade ||
      Math.abs(b.rep - player.reputation) - Math.abs(a.rep - player.reputation) ||
      a.clubId.localeCompare(b.clubId),
    );
  if (!candidates.length) return null;

  const day = transferAbsoluteDay(state);
  const rng = seededRng(state.saveSeed, "live-transfer-rival", player.id, day);
  const shortlist = candidates.slice(0, Math.min(4, candidates.length));
  return shortlist[Math.floor(rng() * shortlist.length)]?.clubId ?? null;
}

function pushCompetitionInbox(
  state: GameState,
  negotiation: TransferNegotiation,
  subject: string,
  body: string,
  high = false,
): void {
  const day = transferAbsoluteDay(state);
  const eventKey = `transfer-competition:${negotiation.id}:${day}:${subject}`;
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  state.inbox.push({
    id: `inbox-transfer-competition-${negotiation.id}-${day}-${state.inbox.length}`,
    generatorId: "transfer-competition",
    eventKey,
    sender: "Director of Football",
    department: "Director of Football",
    category: "transfers",
    subject,
    body,
    priority: high ? "high" : "normal",
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

function logCompetition(
  state: GameState,
  negotiation: TransferNegotiation,
  note: string,
): void {
  negotiation.log.push({
    round: Math.max(negotiation.clubRounds, negotiation.playerRounds),
    party: "player",
    action: "counter",
    note,
    absoluteWeek: absoluteWeek(state.season, state.week),
  });
}

function rivalOpeningFee(state: GameState, negotiation: TransferNegotiation, player: FootballPlayer): number {
  const seller = negotiation.fromClubId ?? player.currentClubId;
  if (!seller) return 0;
  const asking = transferTargetAskingPrice(state, player, askingPrice);
  const rng = seededRng(state.saveSeed, "live-rival-fee", negotiation.id, seller);
  return recruitmentNormaliseTransferFeeForClub(
    state,
    seller,
    asking * rngRange(rng, 0.9, 1.04),
    "asking",
  );
}

function ensureRivalPlayerTermsInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
  player: FootballPlayer,
): void {
  if (!negotiation.competingClubId || negotiation.competingWeeklyWage !== undefined) return;
  const rng = seededRng(state.saveSeed, "rival-player-package", negotiation.id, negotiation.competingClubId);
  const demand = wageDemand(state, player, negotiation.proposedRole);
  negotiation.competingWeeklyWage = recruitmentUserNegotiationWage(
    state,
    demand * rngRange(rng, 1.02, 1.16),
  );
  negotiation.competitionStatus = "playerTerms";
  pushCompetitionInbox(
    state,
    negotiation,
    `Rival terms offered: ${playerName(player)}`,
    `${clubDisplayName(state, negotiation.competingClubId)} have moved on to personal terms with ${playerName(player)}. Their package is believed to be around £${negotiation.competingWeeklyWage.toLocaleString()}/wk.`,
    true,
  );
}

function maybeReopenPlayerTermsInPlace(
  state: GameState,
  negotiation: TransferNegotiation,
  player: FootballPlayer,
): void {
  if (
    negotiation.stage !== "agreed" ||
    negotiation.renegotiationRequested ||
    !negotiation.competingWeeklyWage ||
    negotiation.competingWeeklyWage <= negotiation.proposedWeeklyWage * 1.04
  ) {
    return;
  }
  const wageStep = recruitmentUserNegotiationWageStep(state, negotiation.proposedWeeklyWage);
  negotiation.stage = "playerTalks";
  negotiation.playerRounds = Math.max(1, negotiation.playerRounds);
  negotiation.playerCounterWage = Math.max(
    negotiation.competingWeeklyWage,
    recruitmentUserNegotiationWage(state, negotiation.proposedWeeklyWage + wageStep),
  );
  negotiation.renegotiationRequested = true;
  const rival = clubDisplayName(state, negotiation.competingClubId!);
  const note = `${playerName(player)}'s agent has reopened terms after a stronger package from ${rival}. They now want £${negotiation.playerCounterWage.toLocaleString()}/wk.`;
  logCompetition(state, negotiation, note);
  pushCompetitionInbox(
    state,
    negotiation,
    `Terms reopened: ${playerName(player)}`,
    note,
    true,
  );
}

/**
 * Live transfer-market pressure. Runs once per presentation day for each deal.
 * Rivals can enter after the user has started talks, improve their fee and
 * reach the player's camp while our negotiation is still moving.
 */
export function processTransferMarketDynamicsInPlace(state: GameState): void {
  const day = transferAbsoluteDay(state);
  for (const negotiation of state.football?.negotiations ?? []) {
    if (
      negotiation.direction !== "in" ||
      !["clubTalks", "playerTalks", "agreed"].includes(negotiation.stage) ||
      negotiation.lastCompetitionUpdateDay === day
    ) {
      continue;
    }
    negotiation.lastCompetitionUpdateDay = day;

    const player = transferTargetPlayer(state, negotiation.playerId);
    if (!player || !negotiation.fromClubId) continue;
    const rng = seededRng(state.saveSeed, "transfer-market-day", negotiation.id, day);

    if (!negotiation.competingClubId) {
      const chance =
        negotiation.stage === "clubTalks" ? 0.12 :
        negotiation.stage === "playerTalks" ? 0.18 :
        0.22;
      if (rng() <= chance) {
        const rival = plausibleRivalClub(state, player);
        if (rival) {
          negotiation.competingClubId = rival;
          negotiation.competingOfferFee = rivalOpeningFee(state, negotiation, player);
          negotiation.competitionStatus = "bid";
          negotiation.competitionEscalations = 0;
          pushCompetitionInbox(
            state,
            negotiation,
            `Rival bid: ${playerName(player)}`,
            `${clubDisplayName(state, rival)} have entered the race with an offer believed to be worth £${negotiation.competingOfferFee.toLocaleString()}.`,
            true,
          );
        }
      }
    } else {
      negotiation.competitionStatus ??= "bid";
      negotiation.competitionEscalations ??= 0;
      if (
        negotiation.competingOfferFee !== undefined &&
        negotiation.competitionEscalations < 2 &&
        rng() < 0.28
      ) {
        const seller = negotiation.fromClubId;
        const improved = recruitmentNormaliseTransferFeeForClub(
          state,
          seller,
          negotiation.competingOfferFee * rngRange(rng, 1.04, 1.12),
          "asking",
        );
        if (improved > negotiation.competingOfferFee) {
          negotiation.competingOfferFee = improved;
          negotiation.competitionEscalations += 1;
          pushCompetitionInbox(
            state,
            negotiation,
            `Rival improves bid: ${playerName(player)}`,
            `${clubDisplayName(state, negotiation.competingClubId)} have improved their offer to around £${improved.toLocaleString()}.`,
          );
        }
      }
    }

    if (negotiation.competingClubId && ["playerTalks", "agreed"].includes(negotiation.stage)) {
      ensureRivalPlayerTermsInPlace(state, negotiation, player);
      maybeReopenPlayerTermsInPlace(state, negotiation, player);
    }
  }
}

export function transferCompetitionSummary(
  state: GameState,
  negotiation: TransferNegotiation,
): string | null {
  if (!negotiation.competingClubId) return null;
  const club = clubDisplayName(state, negotiation.competingClubId);
  if (negotiation.competingWeeklyWage) {
    return `${club} are in personal terms at about £${negotiation.competingWeeklyWage.toLocaleString()}/wk.`;
  }
  if (negotiation.competingOfferFee) {
    return `${club} have about £${negotiation.competingOfferFee.toLocaleString()} on the table.`;
  }
  return `${club} are monitoring the player.`;
}
