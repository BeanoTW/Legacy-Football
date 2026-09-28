import type { TacticalPosition } from "./types";
import type { ManagerFormation } from "./managerIdentity";

export const MANAGER_FORMATIONS: readonly ManagerFormation[] = [
  "4-4-2",
  "4-2-3-1",
  "4-3-3",
  "3-4-3",
  "3-5-2",
  "5-3-2",
];

export const MANAGER_FORMATION_SLOTS: Record<ManagerFormation, readonly TacticalPosition[]> = {
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LW", "CAM", "RW", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "LWB", "CM", "CM", "RWB", "LW", "ST", "RW"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LM", "CDM", "CAM", "CDM", "RM", "ST", "ST"],
  "5-3-2": ["GK", "LWB", "CB", "CB", "CB", "RWB", "CM", "CM", "CM", "ST", "ST"],
};

export const MANAGER_FORMATION_ROWS: Record<ManagerFormation, readonly (readonly number[])[]> = {
  "4-4-2": [[9, 10], [5, 6, 7, 8], [1, 2, 3, 4], [0]],
  "4-3-3": [[8, 9, 10], [5, 6, 7], [1, 2, 3, 4], [0]],
  "4-2-3-1": [[10], [7, 8, 9], [5, 6], [1, 2, 3, 4], [0]],
  "3-4-3": [[8, 9, 10], [4, 5, 6, 7], [1, 2, 3], [0]],
  "3-5-2": [[9, 10], [6], [4, 5, 7, 8], [1, 2, 3], [0]],
  "5-3-2": [[9, 10], [6, 7, 8], [1, 2, 3, 4, 5], [0]],
};


export interface FormationPitchPoint {
  x: number;
  y: number;
}

/**
 * Visual squad-board coordinates, expressed as pitch percentages from the
 * attacking goal (top) to our goal (bottom). These are deliberately more
 * nuanced than simple rows: holding midfielders sit deeper than CMs, wing-backs
 * sit between full-backs and wide midfielders, and attacking midfielders live
 * between the lines.
 */
export const MANAGER_FORMATION_POINTS: Record<ManagerFormation, readonly FormationPitchPoint[]> = {
  "4-4-2": [
    { x: 50, y: 91 },
    { x: 15, y: 68 }, { x: 39, y: 72 }, { x: 61, y: 72 }, { x: 85, y: 68 },
    { x: 15, y: 45 }, { x: 39, y: 51 }, { x: 61, y: 51 }, { x: 85, y: 45 },
    { x: 36, y: 14 }, { x: 64, y: 14 },
  ],
  "4-2-3-1": [
    { x: 50, y: 91 },
    { x: 15, y: 68 }, { x: 39, y: 72 }, { x: 61, y: 72 }, { x: 85, y: 68 },
    { x: 38, y: 60 }, { x: 62, y: 60 },
    { x: 18, y: 34 }, { x: 50, y: 31 }, { x: 82, y: 34 },
    { x: 50, y: 12 },
  ],
  "4-3-3": [
    { x: 50, y: 91 },
    { x: 15, y: 68 }, { x: 39, y: 72 }, { x: 61, y: 72 }, { x: 85, y: 68 },
    { x: 29, y: 47 }, { x: 50, y: 53 }, { x: 71, y: 47 },
    { x: 18, y: 23 }, { x: 50, y: 13 }, { x: 82, y: 23 },
  ],
  "3-4-3": [
    { x: 50, y: 91 },
    { x: 28, y: 70 }, { x: 50, y: 74 }, { x: 72, y: 70 },
    { x: 13, y: 56 }, { x: 40, y: 49 }, { x: 60, y: 49 }, { x: 87, y: 56 },
    { x: 19, y: 22 }, { x: 50, y: 13 }, { x: 81, y: 22 },
  ],
  "3-5-2": [
    { x: 50, y: 91 },
    { x: 24, y: 70 }, { x: 50, y: 74 }, { x: 76, y: 70 },
    { x: 13, y: 40 }, { x: 37, y: 57 }, { x: 50, y: 30 }, { x: 63, y: 57 }, { x: 87, y: 40 },
    { x: 37, y: 13 }, { x: 63, y: 13 },
  ],
  "5-3-2": [
    { x: 50, y: 91 },
    { x: 11, y: 56 }, { x: 29, y: 70 }, { x: 50, y: 74 }, { x: 71, y: 70 }, { x: 89, y: 56 },
    { x: 32, y: 47 }, { x: 50, y: 52 }, { x: 68, y: 47 },
    { x: 37, y: 14 }, { x: 63, y: 14 },
  ],
};

/* ==========================================================================
   Match-engine additions (formation pass). Everything above is unchanged.
   ========================================================================== */

export function isManagerFormation(value: string | undefined | null): value is ManagerFormation {
  return Boolean(value && (MANAGER_FORMATIONS as readonly string[]).includes(value));
}

/** Any stored/legacy formation label resolves to a supported shape. */
export function resolveManagerFormation(value: string | undefined | null): ManagerFormation {
  return isManagerFormation(value) ? value : "4-4-2";
}

/*
 * Wing-back posture
 * -----------------
 * Only shapes that actually field LWB/RWB have a posture. 3-4-3 wing-backs
 * are the side's only width and live high; 5-3-2 wing-backs are defenders
 * first and drop into a back five. 3-5-2 uses genuine LM/RM, not wing-backs,
 * so it has no wing-back posture at all. Derived from the slots so it can
 * never drift from the layout.
 */
export type WingBackPosture = "attacking" | "defensive" | null;

function postureFor(formation: ManagerFormation): WingBackPosture {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  if (!slots.includes("LWB") && !slots.includes("RWB")) return null;
  const centreBacks = slots.filter((role) => role === "CB").length;
  const forwards = slots.filter((role) => role === "ST" || role === "LW" || role === "RW").length;
  return centreBacks >= 3 && forwards <= 2 ? "defensive" : "attacking";
}

export const FORMATION_WING_BACK_POSTURE: Record<ManagerFormation, WingBackPosture> = Object.fromEntries(
  MANAGER_FORMATIONS.map((formation) => [formation, postureFor(formation)]),
) as Record<ManagerFormation, WingBackPosture>;

/** 3 = back three, 4 = back four, 5 = back five (5-3-2's defensive wing-backs). */
export function formationBackLineSize(formation: ManagerFormation): 3 | 4 | 5 {
  const centreBacks = MANAGER_FORMATION_SLOTS[formation].filter((role) => role === "CB").length;
  if (centreBacks >= 3) return FORMATION_WING_BACK_POSTURE[formation] === "defensive" ? 5 : 3;
  return 4;
}

/* ------------------------------------------------------------------ */
/* Match-viewer shape                                                  */
/* ------------------------------------------------------------------ */

function boardDepth(boardY: number): number {
  return 6 + (91 - boardY) * (60 / 79);
}

export function formationPitchShape(
  lineup: readonly import("./types").MatchLineupPlayer[],
  formation: ManagerFormation,
  side: "us" | "them",
): Map<string, FormationPitchPoint> {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const points = MANAGER_FORMATION_POINTS[formation];
  const slotsByRole = new Map<TacticalPosition, FormationPitchPoint[]>();
  slots.forEach((role, index) => {
    const list = slotsByRole.get(role) ?? [];
    list.push(points[index]);
    slotsByRole.set(role, list);
  });
  const used = new Map<TacticalPosition, number>();
  const result = new Map<string, FormationPitchPoint>();
  for (const player of lineup) {
    const occurrence = used.get(player.role) ?? 0;
    used.set(player.role, occurrence + 1);
    const point = slotsByRole.get(player.role)?.[occurrence] ?? fallbackBoardPoint(player.role, occurrence);
    const depth = boardDepth(point.y);
    result.set(player.playerId, { x: side === "us" ? depth : 100 - depth, y: point.x });
  }
  return result;
}

function fallbackBoardPoint(role: TacticalPosition, occurrence: number): FormationPitchPoint {
  const y: Record<TacticalPosition, number> = {
    GK: 91, CB: 72, LB: 68, RB: 68, LWB: 56, RWB: 56, CDM: 60, CM: 50,
    CAM: 31, LM: 45, RM: 45, LW: 22, RW: 22, ST: 13,
  };
  const left = role === "LB" || role === "LWB" || role === "LM" || role === "LW";
  const right = role === "RB" || role === "RWB" || role === "RM" || role === "RW";
  return { x: left ? 15 : right ? 85 : 40 + (occurrence % 3) * 10, y: y[role] };
}

export function wideDefenderMovement(
  role: TacticalPosition,
  formation: ManagerFormation | undefined,
  possessionMinded: boolean,
): { push: number; recover: number } {
  const wingBack = role === "LWB" || role === "RWB";
  const fullBack = role === "LB" || role === "RB";
  if (!wingBack && !fullBack) return { push: 0, recover: 0 };
  const posture = formation ? FORMATION_WING_BACK_POSTURE[formation] : null;
  if (wingBack && posture === "attacking") return { push: possessionMinded ? 15 : 12, recover: 8 };
  if (wingBack && posture === "defensive") return { push: possessionMinded ? 9 : 6, recover: 3 };
  return { push: possessionMinded ? 12 : 8, recover: 0 };
}

