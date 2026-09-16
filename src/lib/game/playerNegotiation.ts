import type { GameState, TransferNegotiation } from "./types";
import { absoluteWeek } from "./time";
import { negotiationProfile, counterPosition, statedAsk } from "./negotiationProfile";
import {
  MAX_NEGOTIATION_ROUNDS,
  playerName,
  wageDemand,
} from "./recruitmentLegacy";
import {
  recruitmentUserNegotiationWage,
  recruitmentUserNegotiationWageStep,
} from "./recruitmentEconomy";
import {
  syncTransferTargetNegotiationInPlace,
  transferTargetPlayer,
} from "./recruitmentTargetBridge";

const int = (n: number) => Math.round(n) || 0;

/**
 * The agent's visible opening position. wageDemand remains the football/economic
 * reservation point; the negotiator profile adds bargaining headroom above it.
 */
export function playerAgentOpeningWage(s: GameState, playerId: string, role: TransferNegotiation["proposedRole"]): number {
  const player = transferTargetPlayer(s, playerId);
  if (!player) return 0;
  const profile = negotiationProfile(s.saveSeed, `player-agent:${player.id}`);
  return recruitmentUserNegotiationWage(s, statedAsk(wageDemand(s, player, role), profile));
}

/**
 * Resolve a delayed personal-terms response using the shared bargaining model.
 * An explicit counter is a real offer: matching it unchanged always accepts.
 */
export function evaluatePlayerBargainInPlace(s: GameState, n: TransferNegotiation): void {
  const player = transferTargetPlayer(s, n.playerId);
  if (!player || n.stage !== "playerTalks") return;

  const profile = negotiationProfile(s.saveSeed, `player-agent:${player.id}`);
  const departmentEdge = Math.min(0.12, Math.max(0, (s.football?.department?.negotiationRating ?? 50) / 650));
  const competition = n.competingClubId ? 1.06 : 1;
  const reservation = recruitmentUserNegotiationWage(
    s,
    wageDemand(s, player, n.proposedRole) * (1 - departmentEdge) * competition,
  );
  const explicitCounter = n.playerCounterWage;
  const abs = absoluteWeek(s.season, s.week);

  // Counter-offers are commitments, not hints. This is the cross-system invariant.
  if ((explicitCounter !== undefined && n.proposedWeeklyWage >= explicitCounter) || n.proposedWeeklyWage >= reservation) {
    n.stage = "agreed";
    n.log.push({
      round: n.playerRounds,
      party: "player",
      action: "accept",
      note: `${playerName(player)} agrees personal terms at £${n.proposedWeeklyWage.toLocaleString()}/wk.`,
      absoluteWeek: abs,
    });
    delete n.playerCounterWage;
    syncTransferTargetNegotiationInPlace(s, n);
    return;
  }

  const insultFloor = reservation * 0.72;
  if (n.playerRounds >= Math.max(MAX_NEGOTIATION_ROUNDS, profile.patience) || n.proposedWeeklyWage < insultFloor) {
    n.stage = "rejected";
    n.resolvedAtAbsoluteWeek = abs;
    n.log.push({
      round: n.playerRounds,
      party: "player",
      action: "reject",
      note: `${playerName(player)} turns the club down.`,
      absoluteWeek: abs,
    });
    syncTransferTargetNegotiationInPlace(s, n);
    return;
  }

  const opening = playerAgentOpeningWage(s, player.id, n.proposedRole);
  const previousPosition = explicitCounter ?? opening;
  const concession = counterPosition(reservation, previousPosition, profile, n.playerRounds);
  const wageStep = recruitmentUserNegotiationWageStep(s, n.proposedWeeklyWage);
  n.playerCounterWage = Math.max(
    reservation,
    recruitmentUserNegotiationWage(s, concession),
    recruitmentUserNegotiationWage(s, n.proposedWeeklyWage + wageStep),
  );
  n.log.push({
    round: n.playerRounds,
    party: "player",
    action: "counter",
    note: `${playerName(player)}'s agent counters at £${n.playerCounterWage.toLocaleString()}/wk.`,
    absoluteWeek: abs,
  });
  syncTransferTargetNegotiationInPlace(s, n);
}
