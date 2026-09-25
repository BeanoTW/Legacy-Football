import type { GameState } from "./types";
import { assetById, averageStadiumCondition, stadiumCapacity, stadiumUsableCapacity, stands } from "./infrastructure";

export type FaCapacityGrade = 1 | 2 | 3 | 4 | null;
export interface GroundStandard { label: string; met: boolean; current: number | string; required: number | string; }
export interface StadiumAccreditation {
  capacity: number; usableCapacity: number; seatedCapacity: number; averageCondition: number;
  faCapacityGrade: FaCapacityGrade; faCapacityLabel: string;
  professionalisationReady: boolean; professionalisationRequirements: GroundStandard[];
  eflQualificationReady: boolean; eflQualificationRequirements: GroundStandard[];
}

export function stadiumAccreditation(state: GameState): StadiumAccreditation {
  const capacity = stadiumCapacity(state);
  const usableCapacity = stadiumUsableCapacity(state);
  const seatedCapacity = stands(state).filter((stand) => stand.status !== "closed" && stand.level >= 2).reduce((total, stand) => total + stand.usableCapacity, 0);
  const averageCondition = averageStadiumCondition(state);
  const sanitary = assetById(state, "sanitary");
  const accessReady = Boolean(sanitary && sanitary.status !== "closed" && sanitary.condition >= 40);
  const faCapacityGrade: FaCapacityGrade = usableCapacity >= 4000 ? 1 : usableCapacity >= 3000 ? 2 : usableCapacity >= 1950 ? 3 : usableCapacity >= 1300 ? 4 : null;
  const professionalisationRequirements: GroundStandard[] = [
    { label: "Usable ground capacity", met: usableCapacity >= 1950, current: usableCapacity, required: 1950 },
    { label: "Ground condition", met: averageCondition >= 50, current: Math.round(averageCondition), required: "50%+" },
    { label: "Spectator facilities", met: accessReady, current: accessReady ? "Open" : "Needs work", required: "Open" },
  ];
  const eflQualificationRequirements: GroundStandard[] = [
    { label: "Ground capacity", met: capacity >= 4000, current: capacity, required: 4000 },
    { label: "Covered seating", met: seatedCapacity >= 500, current: seatedCapacity, required: 500 },
    { label: "Usable capacity", met: usableCapacity >= 4000, current: usableCapacity, required: 4000 },
  ];
  return {
    capacity, usableCapacity, seatedCapacity, averageCondition, faCapacityGrade,
    faCapacityLabel: faCapacityGrade ? `FA Grade ${faCapacityGrade} capacity standard` : "Below FA Grade 4 capacity",
    professionalisationReady: professionalisationRequirements.every((item) => item.met),
    professionalisationRequirements,
    eflQualificationReady: eflQualificationRequirements.every((item) => item.met),
    eflQualificationRequirements,
  };
}
