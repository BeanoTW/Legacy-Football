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
  | "replacement-signing"
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

export interface ManagerReplacementExpectation {
  active: boolean;
  position: Position | "";
  soldPlayerName: string;
  previousRole: SquadRole | "";
  createdAtAbsoluteWeek: number;
  stage: 0 | 1 | 2;
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

export function managerReplacementExpectation(
  state: GameState,
  manager: Staff,
): ManagerReplacementExpectation {
  const position = String(state.inboxFlags[key(manager.id, "replacementPosition")] ?? "") as Position | "";
  const role = String(state.inboxFlags[key(manager.id, "replacementRole")] ?? "") as SquadRole | "";
  return {
    active: Boolean(state.inboxFlags[key(manager.id, "replacementActive")]),
    position,
    soldPlayerName: String(state.inboxFlags[key(manager.id, "replacementPlayer")] ?? ""),
    previousRole: role,
    createdAtAbsoluteWeek: Math.max(0, Number(state.inboxFlags[key(manager.id, "replacementCreatedAbs")] ?? 0)),
    stage: Math.max(0, Math.min(2, Number(state.inboxFlags[key(manager.id, "replacementStage")] ?? 0))) as 0 | 1 | 2,
  };
}

function setManagerReplacementExpectationInPlace(
  state: GameState,
  manager: Staff,
  input: { position: Position; playerName: string; previousRole: SquadRole },
): void {
  state.inboxFlags[key(manager.id, "replacementActive")] = true;
  state.inboxFlags[key(manager.id, "replacementPosition")] = input.position;
  state.inboxFlags[key(manager.id, "replacementPlayer")] = input.playerName;
  state.inboxFlags[key(manager.id, "replacementRole")] = input.previousRole;
  state.inboxFlags[key(manager.id, "replacementCreatedAbs")] = absoluteWeek(state.season, state.week);
  state.inboxFlags[key(manager.id, "replacementStage")] = 0;
}

function clearManagerReplacementExpectationInPlace(state: GameState, manager: Staff): void {
  state.inboxFlags[key(manager.id, "replacementActive")] = false;
  state.inboxFlags[key(manager.id, "replacementStage")] = 0;
}

export function advanceManagerReplacementExpectationInPlace(
  state: GameState,
): ManagerReplacementExpectation | null {
  const manager = currentManager(state);
  if (!manager) return null;
  const expectation = managerReplacementExpectation(state, manager);
  if (!expectation.active) return expectation;

  const age = Math.max(0, absoluteWeek(state.season, state.week) - expectation.createdAtAbsoluteWeek);
  const firstThreshold = expectation.previousRole === "Key Player" ? 2 : 3;
  const secondThreshold = expectation.previousRole === "Key Player" ? 4 : 5;
  const targetStage: 0 | 1 | 2 =
    age >= secondThreshold ? 2 : age >= firstThreshold ? 1 : 0;

  if (targetStage > expectation.stage) {
    if (targetStage === 1) {
      adjustManagerRelationshipInPlace(state, manager.id, { trust: -1, backing: -2 });
    } else {
      adjustManagerRelationshipInPlace(state, manager.id, { trust: -2, backing: -4, autonomy: -1 });
    }
    state.inboxFlags[key(manager.id, "replacementStage")] = targetStage;
  }

  return managerReplacementExpectation(state, manager);
}


export interface ManagerRelationshipClimate {
  episode: number;
  stage: 0 | 1 | 2;
  strainedWeeks: number;
  lastProcessedAbsoluteWeek: number;
}

/**
 * Weekly, idempotent relationship climate. One bad transfer can cause a private
 * argument; sustained strain becomes a club-level problem. The episode counter
 * lets a future breakdown create fresh events after a genuine recovery.
 */
export function advanceManagerRelationshipClimateInPlace(state: GameState): ManagerRelationshipClimate | null {
  const manager = currentManager(state);
  if (!manager) return null;

  const now = absoluteWeek(state.season, state.week);
  const lastKey = key(manager.id, "climateLastAbs");
  const streakKey = key(manager.id, "climateStrainedWeeks");
  const stageKey = key(manager.id, "climateStage");
  const episodeKey = key(manager.id, "climateEpisode");

  const last = Number(state.inboxFlags[lastKey] ?? 0);
  const existing: ManagerRelationshipClimate = {
    episode: Number(state.inboxFlags[episodeKey] ?? 0),
    stage: Math.max(0, Math.min(2, Number(state.inboxFlags[stageKey] ?? 0))) as 0 | 1 | 2,
    strainedWeeks: Math.max(0, Number(state.inboxFlags[streakKey] ?? 0)),
    lastProcessedAbsoluteWeek: last,
  };
  if (last === now) return existing;

  const relationship = managerRelationship(state, manager);
  const personality = managerPersonality(manager);
  let strainedWeeks = existing.strainedWeeks;
  let stage: 0 | 1 | 2 = existing.stage;
  let episode = existing.episode;

  if (relationship.band === "Strained") strainedWeeks += 1;
  else if (relationship.band === "Uneasy") strainedWeeks = Math.max(0, strainedWeeks - 1);
  else {
    if (stage > 0) episode += 1;
    strainedWeeks = 0;
    stage = 0;
  }

  const fastEscalator =
    personality.temperament === "Fiery" || personality.ambition === "Relentless";
  const firstThreshold = fastEscalator ? 2 : 3;
  const crisisThreshold = fastEscalator ? 4 : 5;
  if (relationship.band === "Strained") {
    if (strainedWeeks >= crisisThreshold) stage = 2;
    else if (strainedWeeks >= firstThreshold && stage < 1) stage = 1;
  }

  state.inboxFlags[lastKey] = now;
  state.inboxFlags[streakKey] = strainedWeeks;
  state.inboxFlags[stageKey] = stage;
  state.inboxFlags[episodeKey] = episode;

  return { episode, stage, strainedWeeks, lastProcessedAbsoluteWeek: now };
}

export function managerRelationshipClimate(state: GameState, manager: Staff): ManagerRelationshipClimate {
  return {
    episode: Math.max(0, Number(state.inboxFlags[key(manager.id, "climateEpisode")] ?? 0)),
    stage: Math.max(0, Math.min(2, Number(state.inboxFlags[key(manager.id, "climateStage")] ?? 0))) as 0 | 1 | 2,
    strainedWeeks: Math.max(0, Number(state.inboxFlags[key(manager.id, "climateStrainedWeeks")] ?? 0)),
    lastProcessedAbsoluteWeek: Math.max(0, Number(state.inboxFlags[key(manager.id, "climateLastAbs")] ?? 0)),
  };
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
    const replacement = managerReplacementExpectation(state, manager);
    const replacesSoldPlayer =
      replacement.active && replacement.position === input.player.primaryPosition;
    if (replacesSoldPlayer) clearManagerReplacementExpectationInPlace(state, manager);

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

    if (replacesSoldPlayer) {
      recordEvent(state, manager, {
        type: "replacement-signing",
        playerName: input.playerName,
        message: `${input.playerName} fills the ${replacement.position} gap created by the sale of ${replacement.soldPlayerName || "a first-team player"}.`,
        delta: { trust: 4, backing: 9 + youthBonus, autonomy: 2 },
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
    setManagerReplacementExpectationInPlace(state, manager, {
      position: input.player.primaryPosition,
      playerName: input.playerName,
      previousRole: role,
    });
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
    setManagerReplacementExpectationInPlace(state, manager, {
      position: input.player.primaryPosition,
      playerName: input.playerName,
      previousRole: role,
    });
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
