/* =========================================================================
   Formation tactics
   -------------------------------------------------------------------------
   Formations are football systems, not labels. This module turns each shape
   into structural numbers and lets two shapes meet.

   Design rules (keep them when extending):
   - Profiles are COMPUTED from MANAGER_FORMATION_SLOTS plus wing-back
     posture. There is no hand-written formation-vs-formation table, so a
     matchup edge only exists where the structures genuinely differ
     (midfield numbers, flank coverage, penetration against cover).
   - Every edge is scaled by execution: how well the chosen XI suits its
     slots, the manager's tactical quality and the players' fitness. A shape
     the players cannot play is worth less than no shape at all.
   - Output is a pair of goal-rate multipliers bounded to ±7% from structure,
     plus an execution term of at most ±5%. A single point of match strength moves
     goal expectation by ~4%, so squad quality always dominates.
   - It never draws random numbers. It only reshapes inputs the existing
     seeded engine already consumes, so results stay deterministic.
========================================================================= */

import type { MatchLineupPlayer, MatchTeamPlan, TacticalPosition } from "./types";
import type { ManagerFormation } from "./managerIdentity";
import {
  FORMATION_WING_BACK_POSTURE,
  MANAGER_FORMATIONS,
  MANAGER_FORMATION_SLOTS,
  resolveManagerFormation,
} from "./managerFormationLayout";
import {
  matchStyleFromTendencies,
  neutralMatchStyle,
  type ManagerMatchStyle,
} from "./managerMatchStyle";

declare module "./types" {
  interface MatchTeamPlan {
    /**
     * How well this side can carry out its shape, ~0.45-1.1. Written when the
     * match is prepared. Its presence also marks a formation-aware plan;
     * plans from older in-flight saves lack it and are treated neutrally.
     */
    shapeExecution?: number;
  }
  interface MatchLineupPlayer {
    /** Bench only: tactical roles this player can fill, best first. */
    familiarRoles?: TacticalPosition[];
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const TENDENCY = { Low: -1, Medium: 0, High: 1 } as const;

/* ------------------------------------------------------------------ */
/* Structural profile                                                  */
/* ------------------------------------------------------------------ */

export interface FormationProfile {
  formation: ManagerFormation;
  /** Bodies in the middle of the pitch (CDM/CM/CAM, wide mids count a little). */
  central: number;
  /** Width the side can create going forward. */
  width: number;
  /** How well the flanks are protected without the ball. */
  wideDefence: number;
  /** Defensive solidity: bodies behind the ball and how deep they sit. */
  cover: number;
  /** Players arriving in and around the box. */
  attack: number;
  /** Players who can press the opposition's first phase. */
  frontPress: number;
  strikers: number;
  backLine: 3 | 4 | 5;
}

type Contribution = [central: number, width: number, wideDefence: number, cover: number, attack: number, press: number];

const ROLE_CONTRIBUTION: Record<TacticalPosition, Contribution> = {
  GK: [0, 0, 0, 0, 0, 0],
  CB: [0, 0, 0.15, 1, 0.03, 0],
  LB: [0, 0.5, 1, 0.7, 0.15, 0.1],
  RB: [0, 0.5, 1, 0.7, 0.15, 0.1],
  LWB: [0, 0.75, 0.8, 0.6, 0.25, 0.15],
  RWB: [0, 0.75, 0.8, 0.6, 0.25, 0.15],
  CDM: [1, 0, 0.1, 0.7, 0.1, 0.3],
  CM: [1, 0, 0.1, 0.35, 0.25, 0.45],
  CAM: [0.8, 0, 0, 0.1, 0.6, 0.6],
  LM: [0.1, 0.8, 0.5, 0.25, 0.45, 0.4],
  RM: [0.1, 0.8, 0.5, 0.25, 0.45, 0.4],
  LW: [0, 1, 0.2, 0.05, 0.8, 0.8],
  RW: [0, 1, 0.2, 0.05, 0.8, 0.8],
  ST: [0, 0, 0, 0, 1, 0.9],
};

const WING_BACK_BY_POSTURE: Record<"attacking" | "defensive", Contribution> = {
  attacking: [0, 0.9, 0.6, 0.45, 0.35, 0.2],
  defensive: [0, 0.55, 1, 0.8, 0.15, 0.1],
};

const profileCache = new Map<ManagerFormation, FormationProfile>();

export function formationProfile(formationLabel: string): FormationProfile {
  const formation = resolveManagerFormation(formationLabel);
  const cached = profileCache.get(formation);
  if (cached) return cached;
  const posture = FORMATION_WING_BACK_POSTURE[formation];
  const totals = [0, 0, 0, 0, 0, 0];
  let strikers = 0;
  let centreBacks = 0;
  for (const role of MANAGER_FORMATION_SLOTS[formation]) {
    const wingBack = role === "LWB" || role === "RWB";
    const contribution = wingBack && posture ? WING_BACK_BY_POSTURE[posture] : ROLE_CONTRIBUTION[role];
    contribution.forEach((value, index) => (totals[index] += value));
    if (role === "ST") strikers += 1;
    if (role === "CB") centreBacks += 1;
  }
  const profile: FormationProfile = {
    formation,
    central: round3(totals[0]),
    width: round3(totals[1]),
    wideDefence: round3(totals[2]),
    cover: round3(totals[3]),
    attack: round3(totals[4]),
    frontPress: round3(totals[5]),
    strikers,
    backLine: centreBacks >= 3 ? (posture === "defensive" ? 5 : 3) : 4,
  };
  profileCache.set(formation, profile);
  return profile;
}

const REFERENCE = (() => {
  const all = MANAGER_FORMATIONS.map((formation) => formationProfile(formation));
  const mean = (pick: (profile: FormationProfile) => number) =>
    all.reduce((sum, profile) => sum + pick(profile), 0) / all.length;
  return {
    central: mean((p) => p.central),
    width: mean((p) => p.width),
    wideDefence: mean((p) => p.wideDefence),
    cover: mean((p) => p.cover),
    attack: mean((p) => p.attack),
    frontPress: mean((p) => p.frontPress),
    flank: mean((p) => p.width) - mean((p) => p.wideDefence),
  };
})();

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

export interface ShapeExecutionInput {
  suitability: number;
  managerTactics: number;
  averageFitness: number;
  pressing: "Low" | "Medium" | "High";
}

export function shapeExecution(input: ShapeExecutionInput): number {
  const suitability = clamp((input.suitability - 0.75) / 0.25, 0, 1);
  const coaching = clamp((input.managerTactics - 35) / 55, 0, 1);
  const fitnessNeed = input.pressing === "High" ? 82 : input.pressing === "Low" ? 70 : 76;
  const fitness = clamp(1 + (input.averageFitness - fitnessNeed) / 160, 0.82, 1.04);
  return round3(clamp((0.3 + suitability * 0.5 + coaching * 0.3) * fitness, 0.45, 1.1));
}

/* ------------------------------------------------------------------ */
/* Matchup                                                             */
/* ------------------------------------------------------------------ */

export interface TacticalSide {
  plan: MatchTeamPlan;
  style: ManagerMatchStyle;
}

export interface TacticalMatchModifiers {
  usGoalFactor: number;
  themGoalFactor: number;
  possessionShift: number;
  chanceShareShift: number;
  detail: {
    usStructure: number;
    themStructure: number;
    midfield: number;
    usExecution: number;
    themExecution: number;
  };
}

export function planMatchStyle(plan: MatchTeamPlan): ManagerMatchStyle {
  const formation = resolveManagerFormation(plan.formation);
  if (plan.shapeExecution === undefined) return neutralMatchStyle(formation);
  return matchStyleFromTendencies(plan, formation);
}

const centreBacks = (profile: FormationProfile) =>
  MANAGER_FORMATION_SLOTS[profile.formation].filter((role) => role === "CB").length;

function rawAttackingEdge(
  attack: FormationProfile,
  attackStyle: ManagerMatchStyle,
  defence: FormationProfile,
  defenceStyle: ManagerMatchStyle,
): number {
  const flank = Math.max(0, attack.width - defence.wideDefence) * 0.03;
  const penetration = (attack.attack / defence.cover - 0.78) * 0.22;
  const midfield = Math.tanh((attack.central - defence.central) / 0.9) * 0.012;
  const spareCentreBack = centreBacks(defence) >= 3;
  const press =
    TENDENCY[attackStyle.pressing] *
    ((attack.frontPress - REFERENCE.frontPress) * 0.012 + (spareCentreBack ? -0.01 : 0.006));
  const direct = TENDENCY[attackStyle.directness] * (attack.strikers - centreBacks(defence) + 0.5) * 0.009;
  const circulation =
    Math.max(0, attackStyle.possessionBias) * (attack.central - defence.central) * 0.1;
  const block = defenceStyle.philosophy === "Defensive" ? -(defence.cover - REFERENCE.cover) * 0.01 : 0;
  return flank + penetration + midfield + press + direct + circulation + block;
}

const FIELD_BALANCE: Record<ManagerFormation, number> = (() => {
  const profiles = MANAGER_FORMATIONS.map((formation) => formationProfile(formation));
  const neutral = (formation: ManagerFormation) => neutralMatchStyle(formation);
  const result = {} as Record<ManagerFormation, number>;
  for (const profile of profiles) {
    let net = 0;
    for (const other of profiles) {
      net +=
        rawAttackingEdge(profile, neutral(profile.formation), other, neutral(other.formation)) -
        rawAttackingEdge(other, neutral(other.formation), profile, neutral(profile.formation));
    }
    result[profile.formation] = net / profiles.length;
  }
  return result;
})();

const STRUCTURE_WEIGHT = 2.6;

function attackingEdge(attack: TacticalSide, defence: TacticalSide): { edge: number; midfield: number } {
  const attackProfile = formationProfile(attack.plan.formation);
  const defenceProfile = formationProfile(defence.plan.formation);
  const raw =
    rawAttackingEdge(attackProfile, attack.style, defenceProfile, defence.style) -
    FIELD_BALANCE[attackProfile.formation] / 2 +
    FIELD_BALANCE[defenceProfile.formation] / 2;
  const attackExecution = attack.plan.shapeExecution ?? 0.8;
  const defenceExecution = defence.plan.shapeExecution ?? 0.8;
  const scale = 0.5 * attackExecution + 0.5 * (1.7 - defenceExecution);
  return {
    edge: clamp(raw * scale * STRUCTURE_WEIGHT, -0.07, 0.07),
    midfield: attackProfile.central - defenceProfile.central,
  };
}

export function tacticalMatchModifiers(us: TacticalSide, them: TacticalSide): TacticalMatchModifiers {
  const usExecution = us.plan.shapeExecution ?? 0.8;
  const themExecution = them.plan.shapeExecution ?? 0.8;
  const usAttack = attackingEdge(us, them);
  const themAttack = attackingEdge(them, us);
  const midfield = clamp(usAttack.midfield, -1.5, 1.5);
  const executionEdge = clamp((usExecution - themExecution) * 0.12, -0.05, 0.05);

  return {
    usGoalFactor: round3(1 + usAttack.edge + executionEdge),
    themGoalFactor: round3(1 + themAttack.edge - executionEdge),
    possessionShift: round3(clamp(Math.tanh(midfield / 0.9) * 3 * ((usExecution + themExecution) / 2), -4, 4)),
    chanceShareShift: round3(clamp((usAttack.edge - themAttack.edge) * 0.35, -0.04, 0.04)),
    detail: {
      usStructure: round3(usAttack.edge),
      themStructure: round3(themAttack.edge),
      midfield: round3(midfield),
      usExecution,
      themExecution,
    },
  };
}

export function engineGoalModifiers(
  userStyle: ManagerMatchStyle,
  opponentStyle: ManagerMatchStyle,
  tactical: TacticalMatchModifiers | null,
): { attackMod: number; defenseMod: number } {
  const usFactor = tactical?.usGoalFactor ?? 1;
  const themFactor = tactical?.themGoalFactor ?? 1;
  const usRate = (userStyle.attackModifier * usFactor) / opponentStyle.defenseModifier;
  const themRate = (opponentStyle.attackModifier * themFactor) / userStyle.defenseModifier;
  return { attackMod: round3(usRate), defenseMod: round3(1 / themRate) };
}

export function tacticalStrengthEdge(goalModifiers: { attackMod: number; defenseMod: number }): number {
  const usRate = goalModifiers.attackMod;
  const themRate = 1 / goalModifiers.defenseMod;
  return Math.round(clamp(13 * (usRate - themRate), -4, 4) * 100) / 100;
}

export function lineupAverageFitness(lineup: readonly MatchLineupPlayer[]): number {
  if (!lineup.length) return 85;
  return lineup.reduce((sum, player) => sum + (player.fitness ?? 100), 0) / lineup.length;
}

export function formationPhaseNudges(formationLabel: string): {
  buildUp: number;
  finalThird: number;
  transition: number;
  progression: number;
} {
  const profile = formationProfile(formationLabel);
  return {
    buildUp: profile.strikers === 1 ? 0.03 : 0,
    finalThird: clamp((profile.width - REFERENCE.width) * 0.04, -0.03, 0.05),
    transition: profile.backLine === 5 ? 0.07 : profile.backLine === 3 ? 0.02 : 0,
    progression: profile.strikers === 2 ? 0.03 : 0,
  };
}
