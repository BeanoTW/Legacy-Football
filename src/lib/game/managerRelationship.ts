import type { FootballPlayer, GameState, Position, SquadRole, Staff } from "./types";
import { hashString } from "./rng";
import { managerFootballIdentity } from "./managerIdentity";
import { managerRecruitmentBrief } from "./managerRecruitmentBrief";
import { absoluteWeek } from "./time";
import { markManagerRecruitmentCommitmentFulfilledInPlace } from "./managerRecruitmentCommitment";

export type ManagerTemperament = "Diplomatic" | "Pragmatic" | "Fiery" | "Reserved";
export type ManagerAmbition = "Steady" | "Driven" | "Relentless";
export type ManagerControlStyle = "Flexible" | "Collaborative" | "Hands-on";
export type ManagerMediaStyle = "Calm" | "Measured" | "Confrontational";
export type ManagerRelationshipBand = "Excellent" | "Strong" | "Professional" | "Uneasy" | "Strained";

export interface ManagerPersonality {
  temperament: ManagerTemperament;
  ambition: ManagerAmbition;
  controlStyle: ManagerControlStyle;
  mediaStyle: ManagerMediaStyle;
  financialPragmatism: "Low" | "Medium" | "High";
  summary: string;
}

export interface ManagerRelationship {
  managerId: string;
  trust: number;
  backing: number;
  autonomy: number;
  overall: number;
  band: ManagerRelationshipBand;
  summary: string;
}

export interface ManagerRelationshipDelta {
  trust?: number;
  backing?: number;
  autonomy?: number;
}

export type ManagerRelationshipEventType =
  | "promise-fulfilled"
  | "priority-signing"
  | "useful-signing"
  | "chairman-signing"
  | "key-sale"
  | "first-team-sale"
  | "squad-sale"
  | "prospect-sale";

export interface ManagerRelationshipEvent {
  type: ManagerRelationshipEventType;
  playerName: string;
  message: string;
  delta: ManagerRelationshipDelta;
}

export interface ManagerTransferContext {
  managerId: string;
  priorityPositions: Position[];
}

export function managerTransferContext(state: GameState): ManagerTransferContext | null {
  const manager = currentManager(state);
  if (!manager) return null;
  return {
    managerId: manager.id,
    priorityPositions: managerRecruitmentBrief(state, manager).priorities.map((priority) => priority.position),
  };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const base = 60;
const key = (managerId: string, field: string) => `managerRel:${managerId}:${field}`;

export function currentManager(state: GameState): Staff | undefined {
  return state.hiredStaff.find((staff) => staff.role === "Manager");
}

function seededTrait(manager: Staff, namespace: string): number {
  return hashString(`${namespace}|${manager.id}`) % 100;
}

export function managerPersonality(manager: Staff): ManagerPersonality {
  const identity = managerFootballIdentity(manager);
  const temperamentSeed = seededTrait(manager, "manager-temperament");
  const controlSeed = seededTrait(manager, "manager-control");
  const { motivation, tactics, negotiation, development } = manager.stats;

  const temperament: ManagerTemperament =
    motivation >= 78 || temperamentSeed > 82
      ? "Fiery"
      : negotiation >= 72 || temperamentSeed < 24
        ? "Diplomatic"
        : tactics >= 70
          ? "Pragmatic"
          : "Reserved";

  const ambitionScore = manager.reputation * 0.45 + manager.rating * 0.35 + motivation * 0.2;
  const ambition: ManagerAmbition =
    ambitionScore >= 76 ? "Relentless" : ambitionScore >= 61 ? "Driven" : "Steady";

  const controlScore = tactics * 0.45 + motivation * 0.25 + negotiation * 0.15 + controlSeed * 0.15;
  const controlStyle: ManagerControlStyle =
    controlScore >= 72 ? "Hands-on" : controlScore >= 55 ? "Collaborative" : "Flexible";

  const mediaStyle: ManagerMediaStyle =
    temperament === "Fiery" ? "Confrontational" : temperament === "Diplomatic" ? "Calm" : "Measured";

  const financialScore = tactics * 0.38 + negotiation * 0.37 + (100 - motivation) * 0.15 + development * 0.1;
  const financialPragmatism =
    financialScore >= 66 ? "High" : financialScore >= 50 ? "Medium" : "Low";

  const controlCopy =
    controlStyle === "Hands-on"
      ? "expects a meaningful voice in recruitment"
      : controlStyle === "Collaborative"
        ? "expects recruitment decisions to be shared"
        : "is comfortable with the chairman setting the wider recruitment direction";
  const ambitionCopy =
    ambition === "Relentless"
      ? "is intensely ambitious"
      : ambition === "Driven"
        ? "wants visible progress"
        : "takes a steadier long-term view";
  const youthCopy =
    identity.youthWillingness === "High"
      ? "and is notably willing to trust young players"
      : identity.youthWillingness === "Low"
        ? "and tends to prefer established players"
        : "and has a balanced view of youth";

  return {
    temperament,
    ambition,
    controlStyle,
    mediaStyle,
    financialPragmatism,
    summary: `${temperament} manager who ${ambitionCopy}, ${controlCopy}, ${youthCopy}.`,
  };
}

export function managerRelationship(state: GameState, manager: Staff): ManagerRelationship {
  const read = (field: string) => {
    const value = Number(state.inboxFlags[key(manager.id, field)]);
    return Number.isFinite(value) ? clamp(value) : base;
  };
  const trust = read("trust");
  const backing = read("backing");
  const autonomy = read("autonomy");
  const overall = Math.round(trust * 0.4 + backing * 0.4 + autonomy * 0.2);
  const band: ManagerRelationshipBand =
    overall >= 78
      ? "Excellent"
      : overall >= 65
        ? "Strong"
        : overall >= 50
          ? "Professional"
          : overall >= 35
            ? "Uneasy"
            : "Strained";

  const summary =
    band === "Excellent"
      ? "He feels trusted, backed and fully aligned with the chairman."
      : band === "Strong"
        ? "The working relationship is healthy, even when you disagree."
        : band === "Professional"
          ? "The relationship works, but goodwill is not unlimited."
          : band === "Uneasy"
            ? "Recent decisions are creating visible tension behind the scenes."
            : "The relationship is close to breaking point and another clash could become public.";

  return { managerId: manager.id, trust, backing, autonomy, overall, band, summary };
}

export function adjustManagerRelationshipInPlace(
  state: GameState,
  managerId: string,
  delta: ManagerRelationshipDelta,
): void {
  const manager = state.hiredStaff.find((staff) => staff.id === managerId && staff.role === "Manager");
  if (!manager) return;
  const relationship = managerRelationship(state, manager);
  state.inboxFlags[key(managerId, "trust")] = clamp(relationship.trust + (delta.trust ?? 0));
  state.inboxFlags[key(managerId, "backing")] = clamp(relationship.backing + (delta.backing ?? 0));
  state.inboxFlags[key(managerId, "autonomy")] = clamp(relationship.autonomy + (delta.autonomy ?? 0));
}

function recordEvent(
  state: GameState,
  manager: Staff,
  event: ManagerRelationshipEvent,
): void {
  adjustManagerRelationshipInPlace(state, manager.id, event.delta);
  const seq = Number(state.inboxFlags[key(manager.id, "eventSeq")] ?? 0) + 1;
  state.inboxFlags[key(manager.id, "eventSeq")] = seq;
  state.inboxFlags[key(manager.id, "eventType")] = event.type;
  state.inboxFlags[key(manager.id, "eventPlayer")] = event.playerName;
  state.inboxFlags[key(manager.id, "eventMessage")] = event.message;
  state.inboxFlags[key(manager.id, "eventAbs")] = absoluteWeek(state.season, state.week);
  state.inboxFlags[key(manager.id, "eventTrust")] = event.delta.trust ?? 0;
  state.inboxFlags[key(manager.id, "eventBacking")] = event.delta.backing ?? 0;
  state.inboxFlags[key(manager.id, "eventAutonomy")] = event.delta.autonomy ?? 0;
}

export function latestManagerRelationshipEvent(state: GameState, manager: Staff): {
  seq: number;
  type: ManagerRelationshipEventType | "";
  playerName: string;
  message: string;
  delta: ManagerRelationshipDelta;
} {
  return {
    seq: Number(state.inboxFlags[key(manager.id, "eventSeq")] ?? 0),
    type: String(state.inboxFlags[key(manager.id, "eventType")] ?? "") as ManagerRelationshipEventType | "",
    playerName: String(state.inboxFlags[key(manager.id, "eventPlayer")] ?? ""),
    message: String(state.inboxFlags[key(manager.id, "eventMessage")] ?? ""),
    delta: {
      trust: Number(state.inboxFlags[key(manager.id, "eventTrust")] ?? 0),
      backing: Number(state.inboxFlags[key(manager.id, "eventBacking")] ?? 0),
      autonomy: Number(state.inboxFlags[key(manager.id, "eventAutonomy")] ?? 0),
    },
  };
}

export function managerRelationshipFlag(managerId: string, field: string): string {
  return key(managerId, field);
}

export function recordCompletedTransferManagerReactionInPlace(
  state: GameState,
  input: {
    direction: "in" | "out";
    player: FootballPlayer;
    playerName: string;
    fee: number;
    previousRole?: SquadRole;
    context?: ManagerTransferContext | null;
  },
): void {
  const manager =
    (input.context
      ? state.hiredStaff.find((staff) => staff.id === input.context!.managerId && staff.role === "Manager")
      : undefined) ?? currentManager(state);
  if (!manager) return;

  const personality = managerPersonality(manager);
  const identity = managerFootballIdentity(manager);

  if (input.direction === "in") {
    const priorities =
      input.context?.managerId === manager.id
        ? input.context.priorityPositions
        : managerRecruitmentBrief(state, manager).priorities.map((priority) => priority.position);
    const topPriority = priorities[0];
    const matchesTop = topPriority === input.player.primaryPosition;
    const matchesNeed = priorities.includes(input.player.primaryPosition);
    const young = (2000 + state.season - 1 - input.player.dateOfBirth.year) <= 21;
    const youthBonus = young && identity.youthWillingness === "High" ? 2 : 0;
    const fulfilledPromise = markManagerRecruitmentCommitmentFulfilledInPlace(
      state,
      manager.id,
      input.player.primaryPosition,
      input.playerName,
    );

    if (fulfilledPromise) {
      recordEvent(state, manager, {
        type: "promise-fulfilled",
        playerName: input.playerName,
        message: `The chairman promised ${manager.name} reinforcement in this position and delivered ${input.playerName} before the deadline.`,
        delta: { trust: 6, backing: 12 + youthBonus, autonomy: 3 },
      });
      return;
    }

    if (matchesTop) {
      recordEvent(state, manager, {
        type: "priority-signing",
        playerName: input.playerName,
        message: `${input.playerName} directly addresses the first position ${manager.name} asked the chairman to strengthen.`,
        delta: { trust: 3, backing: 8 + youthBonus, autonomy: 2 },
      });
      return;
    }
    if (matchesNeed) {
      recordEvent(state, manager, {
        type: "useful-signing",
        playerName: input.playerName,
        message: `${manager.name} sees ${input.playerName} as useful backing for an area he had identified as short.`,
        delta: { trust: 1, backing: 4 + youthBonus, autonomy: 1 },
      });
      return;
    }

    const controlPenalty = personality.controlStyle === "Hands-on" ? -2 : personality.controlStyle === "Collaborative" ? -1 : 0;
    recordEvent(state, manager, {
      type: "chairman-signing",
      playerName: input.playerName,
      message:
        personality.controlStyle === "Hands-on"
          ? `${input.playerName} was not one of ${manager.name}'s stated priorities. He will judge the chairman's call on results.`
          : `${input.playerName} was a chairman-led addition rather than one of the manager's urgent requests.`,
      delta: { trust: 0, backing: 1 + youthBonus, autonomy: controlPenalty },
    });
    return;
  }

  const role = input.previousRole ?? "Rotation";
  const feePremium = input.player.marketValue > 0 ? input.fee / input.player.marketValue : 1;
  const pragmaticRelief =
    personality.financialPragmatism === "High" && feePremium >= 1.2
      ? 2
      : personality.financialPragmatism === "Medium" && feePremium >= 1.35
        ? 1
        : 0;

  if (role === "Key Player") {
    recordEvent(state, manager, {
      type: "key-sale",
      playerName: input.playerName,
      message: `${manager.name} is angry that key player ${input.playerName} has been sold${pragmaticRelief ? ", although he accepts the fee was strong" : ""}.`,
      delta: {
        trust: -6 + pragmaticRelief,
        backing: -10 + pragmaticRelief,
        autonomy: -4,
      },
    });
    return;
  }

  if (role === "First Team") {
    recordEvent(state, manager, {
      type: "first-team-sale",
      playerName: input.playerName,
      message: `${manager.name} did not want to lose first-team player ${input.playerName} without a clear replacement plan.`,
      delta: {
        trust: -3 + pragmaticRelief,
        backing: -6 + pragmaticRelief,
        autonomy: -3,
      },
    });
    return;
  }

  if (role === "Prospect" && identity.youthWillingness === "High") {
    recordEvent(state, manager, {
      type: "prospect-sale",
      playerName: input.playerName,
      message: `${manager.name} is disappointed to lose prospect ${input.playerName}; developing young players is central to his approach.`,
      delta: { trust: -2 + pragmaticRelief, backing: -4 + pragmaticRelief, autonomy: -2 },
    });
    return;
  }

  recordEvent(state, manager, {
    type: "squad-sale",
    playerName: input.playerName,
    message: `${manager.name} accepts the sale of ${input.playerName} as manageable squad business.`,
    delta: { trust: pragmaticRelief, backing: -1 + pragmaticRelief, autonomy: 0 },
  });
}
