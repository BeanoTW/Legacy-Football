import type { GameState, Position } from "./types";
import { ageOf } from "./recruitmentLegacy";
import {
  chairmanRecruitmentPlayerIds,
} from "./chairmanRecruitmentView";
import { isChairmanShortlisted } from "./recruitmentKnowledge";
import { scoutingAssignment, scoutingReportById } from "./scouting";
import { buildWorldSimulationPlan } from "./world";
import { isUserClubReference } from "./clubReference";
import { playerOwnerClubId, playerRegisteredClubId } from "./playerRegistration";

export type MarketKnowledgeLevel = "public" | "discovered" | "scouted";

export interface RecruitmentMarketSearchCriteria {
  query?: string;
  positions?: Position[];
  minAge?: number;
  maxAge?: number;
  contractStatus?: "free" | "contracted";
  clubId?: string;
}

export interface RecruitmentMarketIdentity {
  playerId: string;
  name: string;
  position: Position;
  age: number;
  clubId: string | null;
  knowledge: MarketKnowledgeLevel;
  shortlisted: boolean;
  scoutingStatus: "notStarted" | "active" | "complete";
}

/**
 * Public market awareness is deliberately broader than formal discovery but
 * much narrower than the whole simulation. The director can know the names
 * and basic roster facts of free agents and players at clubs inside the active
 * Focus market. Ability and financial certainty remain behind scouting.
 */
export function recruitmentMarketAwarenessPlayerIds(state: GameState): string[] {
  const ids = new Set(chairmanRecruitmentPlayerIds(state));
  const focusClubs = new Set(buildWorldSimulationPlan(state).focusClubIds);

  for (const player of state.football.players) {
    const owner = playerOwnerClubId(player);
    const registered = playerRegisteredClubId(player);
    if (isUserClubReference(state, owner) || isUserClubReference(state, registered)) continue;
    if (owner === null && registered === null) {
      ids.add(player.id);
      continue;
    }
    if ((owner && focusClubs.has(owner)) || (registered && focusClubs.has(registered))) {
      ids.add(player.id);
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function recruitmentMarketIdentity(
  state: GameState,
  playerId: string,
): RecruitmentMarketIdentity | null {
  if (!recruitmentMarketAwarenessPlayerIds(state).includes(playerId)) return null;
  const player = state.football.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;

  const discovered = chairmanRecruitmentPlayerIds(state).includes(playerId);
  const assignment = scoutingAssignment(state, playerId);
  const report = scoutingReportById(state, playerId);
  const scoutingStatus = assignment?.status ?? "notStarted";
  const knowledge: MarketKnowledgeLevel =
    report && report.knowledgePct > 0
      ? "scouted"
      : discovered
        ? "discovered"
        : "public";

  return {
    playerId,
    name: player.firstName + " " + player.lastName,
    position: player.primaryPosition,
    age: ageOf(player, state.season),
    clubId: playerRegisteredClubId(player),
    knowledge,
    shortlisted: isChairmanShortlisted(state, playerId),
    scoutingStatus,
  };
}

export function searchRecruitmentMarket(
  state: GameState,
  criteria: RecruitmentMarketSearchCriteria = {},
): RecruitmentMarketIdentity[] {
  const q = criteria.query?.trim().toLowerCase() ?? "";
  const positions = new Set(criteria.positions ?? []);

  return recruitmentMarketAwarenessPlayerIds(state)
    .flatMap((playerId) => {
      const view = recruitmentMarketIdentity(state, playerId);
      return view ? [view] : [];
    })
    .filter((view) => {
      if (q && !view.name.toLowerCase().includes(q) && !(view.clubId ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (positions.size && !positions.has(view.position)) return false;
      if (criteria.minAge !== undefined && view.age < criteria.minAge) return false;
      if (criteria.maxAge !== undefined && view.age > criteria.maxAge) return false;
      if (criteria.contractStatus === "free" && view.clubId !== null) return false;
      if (criteria.contractStatus === "contracted" && view.clubId === null) return false;
      if (criteria.clubId !== undefined && view.clubId !== criteria.clubId) return false;
      return true;
    })
    .sort((a, b) => {
      const knowledgeRank: Record<MarketKnowledgeLevel, number> = {
        scouted: 0,
        discovered: 1,
        public: 2,
      };
      return (
        knowledgeRank[a.knowledge] - knowledgeRank[b.knowledge] ||
        a.name.localeCompare(b.name) ||
        a.playerId.localeCompare(b.playerId)
      );
    });
}
