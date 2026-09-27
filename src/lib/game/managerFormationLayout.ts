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
    { x: 50, y: 89 },
    { x: 15, y: 71 }, { x: 39, y: 75 }, { x: 61, y: 75 }, { x: 85, y: 71 },
    { x: 15, y: 45 }, { x: 39, y: 51 }, { x: 61, y: 51 }, { x: 85, y: 45 },
    { x: 36, y: 14 }, { x: 64, y: 14 },
  ],
  "4-2-3-1": [
    { x: 50, y: 89 },
    { x: 15, y: 71 }, { x: 39, y: 75 }, { x: 61, y: 75 }, { x: 85, y: 71 },
    { x: 38, y: 60 }, { x: 62, y: 60 },
    { x: 18, y: 34 }, { x: 50, y: 31 }, { x: 82, y: 34 },
    { x: 50, y: 12 },
  ],
  "4-3-3": [
    { x: 50, y: 89 },
    { x: 15, y: 71 }, { x: 39, y: 75 }, { x: 61, y: 75 }, { x: 85, y: 71 },
    { x: 29, y: 49 }, { x: 50, y: 55 }, { x: 71, y: 49 },
    { x: 18, y: 23 }, { x: 50, y: 13 }, { x: 82, y: 23 },
  ],
  "3-4-3": [
    { x: 50, y: 89 },
    { x: 28, y: 75 }, { x: 50, y: 79 }, { x: 72, y: 75 },
    { x: 13, y: 58 }, { x: 40, y: 51 }, { x: 60, y: 51 }, { x: 87, y: 58 },
    { x: 19, y: 22 }, { x: 50, y: 13 }, { x: 81, y: 22 },
  ],
  "3-5-2": [
    { x: 50, y: 89 },
    { x: 28, y: 75 }, { x: 50, y: 79 }, { x: 72, y: 75 },
    { x: 13, y: 42 }, { x: 37, y: 60 }, { x: 50, y: 32 }, { x: 63, y: 60 }, { x: 87, y: 42 },
    { x: 37, y: 13 }, { x: 63, y: 13 },
  ],
  "5-3-2": [
    { x: 50, y: 89 },
    { x: 11, y: 59 }, { x: 29, y: 75 }, { x: 50, y: 79 }, { x: 71, y: 75 }, { x: 89, y: 59 },
    { x: 32, y: 49 }, { x: 50, y: 54 }, { x: 68, y: 49 },
    { x: 37, y: 14 }, { x: 63, y: 14 },
  ],
};
