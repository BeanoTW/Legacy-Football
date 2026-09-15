import type { TacticalPosition } from "./types";
import type { ManagerFormation } from "./managerIdentity";

export const MANAGER_FORMATIONS: readonly ManagerFormation[] = [
  "4-4-2",
  "4-2-3-1",
  "4-3-3",
  "3-5-2",
  "5-3-2",
];

export const MANAGER_FORMATION_SLOTS: Record<ManagerFormation, readonly TacticalPosition[]> = {
  "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
  "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
  "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LW", "CAM", "RW", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "LWB", "CM", "CM", "CM", "RWB", "ST", "ST"],
  "5-3-2": ["GK", "LWB", "CB", "CB", "CB", "RWB", "CM", "CM", "CM", "ST", "ST"],
};

export const MANAGER_FORMATION_ROWS: Record<ManagerFormation, readonly (readonly number[])[]> = {
  "4-4-2": [[9, 10], [5, 6, 7, 8], [1, 2, 3, 4], [0]],
  "4-3-3": [[8, 9, 10], [5, 6, 7], [1, 2, 3, 4], [0]],
  "4-2-3-1": [[10], [7, 8, 9], [5, 6], [1, 2, 3, 4], [0]],
  "3-5-2": [[9, 10], [4, 5, 6, 7, 8], [1, 2, 3], [0]],
  "5-3-2": [[9, 10], [6, 7, 8], [1, 2, 3, 4, 5], [0]],
};
