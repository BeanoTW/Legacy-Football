import type { FootballPlayer, GameState, Position, Staff, TacticalPosition } from "./types";
import { managerFootballIdentity } from "./managerIdentity";
import { MANAGER_FORMATION_SLOTS } from "./managerFormationLayout";
import { managerSquadFit } from "./managerSquadFit";
import { positionEffectiveness, positionUnit } from "./positions";
import { userClubReference } from "./clubReference";
import { createChairmanMultiScoutingBrief, type ScoutingPlayerLevel } from "./chairmanScoutingBrief";

export interface ManagerRecruitmentPriority {
  position: Position;
  tacticalPosition?: TacticalPosition;
  playerLevel: ScoutingPlayerLevel;
  headline: string;
  rationale: string;
}

export interface ManagerRecruitmentBrief {
  managerId: string;
  managerName: string;
  headline: string;
  message: string;
  tacticalShape: string;
  priorities: ManagerRecruitmentPriority[];
}

const POSITION_NAME: Record<Position, string> = {
  GK: "goalkeeper",
  DEF: "defender",
  MID: "midfielder",
  FWD: "forward",
};

const TACTICAL_POSITION_NAME: Record<TacticalPosition, string> = {
  GK: "goalkeeper",
  RB: "right-back",
  CB: "centre-back",
  LB: "left-back",
  RWB: "right wing-back",
  LWB: "left wing-back",
  CDM: "defensive midfielder",
  CM: "central midfielder",
  CAM: "attacking midfielder",
  RM: "right midfielder",
  LM: "left midfielder",
  RW: "right winger",
  LW: "left winger",
  ST: "striker",
};

function levelForSeverity(severity: number): ScoutingPlayerLevel {
  if (severity >= 45) return "startingXI";
  if (severity >= 20) return "firstTeam";
  return "backup";
}

function styleSentence(manager: Staff): string {
  const identity = managerFootballIdentity(manager);
  const press = identity.pressing === "High" ? "I need players who can cope with our pressing demands." : identity.pressing === "Low" ? "I value positional discipline more than constant pressing." : "We need a balanced work rate without losing our shape.";
  const tempo = identity.tempo === "High" ? "We want to move the ball quickly." : identity.tempo === "Low" ? "I want us patient in possession." : "I want us able to change tempo when the game asks for it.";
  return `${press} ${tempo}`;
}

function weakestTacticalPosition(
  players: FootballPlayer[],
  formation: keyof typeof MANAGER_FORMATION_SLOTS,
  unit: Position,
): TacticalPosition | undefined {
  const slots = [...new Set(MANAGER_FORMATION_SLOTS[formation].filter((slot) => positionUnit(slot) === unit))];
  if (!slots.length) return undefined;

  return slots
    .map((slot) => {
      const bestFit = players.reduce((best, player) => {
        if (player.primaryPosition !== unit && !player.secondaryPositions.includes(unit)) return best;
        return Math.max(best, player.currentAbility * positionEffectiveness(player, slot));
      }, 0);
      return { slot, bestFit };
    })
    .sort((a, b) => a.bestFit - b.bestFit || a.slot.localeCompare(b.slot))[0]?.slot;
}

export function managerRecruitmentBrief(state: GameState, manager: Staff): ManagerRecruitmentBrief {
  const identity = managerFootballIdentity(manager);
  const fit = managerSquadFit(state, manager);
  const userClubId = userClubReference(state);
  const players = state.football.players.filter((player) => player.currentClubId === userClubId);
  const priorities = fit.needs.map((need) => {
    const playerLevel = levelForSeverity(need.severity);
    const tacticalPosition = weakestTacticalPosition(players, fit.bestFormation, need.position);
    const position = POSITION_NAME[need.position];
    const role = tacticalPosition ? TACTICAL_POSITION_NAME[tacticalPosition] : position;
    return {
      position: need.position,
      tacticalPosition,
      playerLevel,
      headline: `${role[0].toUpperCase()}${role.slice(1)} needed`,
      rationale: tacticalPosition
        ? `${need.reason} Within ${fit.bestFormation}, ${role} is the weakest role-specific fit.`
        : need.reason,
    };
  });

  const shapeLine = fit.bestFormation === identity.preferredFormation
    ? `I want to build around my ${identity.preferredFormation}.`
    : `My preference is ${identity.preferredFormation}, but with this squad I would start in ${fit.bestFormation}.`;

  const recruitmentLine = priorities.length
    ? `The first area I would improve is ${priorities[0].tacticalPosition ? TACTICAL_POSITION_NAME[priorities[0].tacticalPosition] : POSITION_NAME[priorities[0].position]}.`
    : "I do not see an urgent positional hole at the moment; we can recruit for quality rather than necessity.";

  return {
    managerId: manager.id,
    managerName: manager.name,
    headline: priorities.length ? "What I need from recruitment" : "Squad assessment",
    message: `${shapeLine} ${recruitmentLine} ${styleSentence(manager)}`,
    tacticalShape: fit.bestFormation,
    priorities,
  };
}


export interface RecruitmentDelegationAvailability {
  available: boolean;
  reason?: string;
  head?: Staff;
}

export function recruitmentDelegationAvailability(state: GameState): RecruitmentDelegationAvailability {
  const head = state.hiredStaff.find((staff) => staff.role === "Head of Transfers");
  if (!head) return { available: false, reason: "Appoint a Head of Transfers before delegating recruitment." };
  const scouts = state.hiredStaff.filter((staff) => staff.role === "Scout" || staff.role === "Chief Scout");
  if (!scouts.length) return { available: false, reason: "Recruitment needs at least one Scout or Chief Scout to execute the search." };
  return { available: true, head };
}

export function managerRecruitmentAssignmentId(state: GameState, manager: Staff): string {
  return `manager-delegated:${manager.id}:s${state.season}:w${state.week}`;
}

export function activeManagerRecruitmentAssignment(state: GameState, manager: Staff) {
  const prefix = `manager-delegated:${manager.id}:`;
  return (state.football?.scoutingDiscovery?.briefs ?? [])
    .filter((brief) => brief.id.startsWith(prefix) && brief.status === "active")
    .sort((a, b) => (b.createdAtDay ?? 0) - (a.createdAtDay ?? 0))[0] ?? null;
}

/**
 * Hands the manager's live positional priorities to the recruitment department.
 * Staff own the search; the Owner-Director still owns the eventual signing decision.
 */
export function delegateManagerRecruitmentPriorities(state: GameState, manager: Staff): GameState {
  const availability = recruitmentDelegationAvailability(state);
  const priorities = managerRecruitmentBrief(state, manager).priorities;
  if (!availability.available || !priorities.length || activeManagerRecruitmentAssignment(state, manager)) return state;
  const capacity = Math.max(1, Math.min(4, state.hiredStaff.filter((staff) => staff.role === "Scout" || staff.role === "Chief Scout").length || 1));
  return createChairmanMultiScoutingBrief(state, {
    id: managerRecruitmentAssignmentId(state, manager),
    delegatedBy: availability.head!.name,
    delegatedLabel: priorities[0]?.headline ?? "Manager recruitment request",
    positionBriefs: priorities.slice(0, capacity).map((priority) => ({
      position: priority.position,
      tacticalPosition: priority.tacticalPosition,
      playerLevel: priority.playerLevel,
    })),
  });
}
