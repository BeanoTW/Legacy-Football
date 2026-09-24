import type { GameState, InfrastructureAsset } from "@/lib/game/types";
import { ASSET_CONFIG, assets, infrastructureSnapshot, stands } from "@/lib/game/infrastructure";

export interface GroundRequirement {
  label: string;
  met: boolean;
  value: string;
}

export interface GroundStage {
  id: number;
  name: string;
  shortName: string;
  requirements: GroundRequirement[];
}

const STAGE_NAMES = [
  "Basic Non-League Ground",
  "Developed Non-League Ground",
  "Small Professional Ground",
  "Established EFL Ground",
  "Championship-Scale Ground",
  "Premier League Stadium",
  "Elite Stadium",
] as const;

const CAPACITY_TARGETS = [0, 4_000, 8_000, 15_000, 24_000, 38_000, 55_000] as const;
const LEVEL_TARGETS = [1, 1.4, 1.8, 2.35, 3, 3.7, 4.4] as const;
const CONDITION_TARGETS = [0, 45, 55, 62, 70, 78, 86] as const;

function averageLevel(list: InfrastructureAsset[]) {
  return list.length ? list.reduce((sum, asset) => sum + asset.level, 0) / list.length : 0;
}

function assetLevel(state: GameState, type: InfrastructureAsset["type"]) {
  const matching = assets(state).filter((asset) => asset.type === type);
  return matching.length ? Math.max(...matching.map((asset) => asset.level)) : 0;
}

function requirementsFor(state: GameState, stageIndex: number): GroundRequirement[] {
  const snapshot = infrastructureSnapshot(state);
  const standAssets = stands(state);
  const all = assets(state);
  const targetLevel = LEVEL_TARGETS[stageIndex];
  const conditionTarget = CONDITION_TARGETS[stageIndex];
  const developedCount = all.filter((asset) => asset.level >= Math.max(1, Math.ceil(targetLevel))).length;
  const requiredDeveloped = Math.min(8, Math.max(1, stageIndex + 1));
  const pitch = assetLevel(state, "pitch");
  const hospitality = assetLevel(state, "hospitality");
  const access = assetLevel(state, "sanitary");
  const clubhouse = Math.max(assetLevel(state, "offices"), assetLevel(state, "shop"));

  return [
    { label: "Total capacity", met: snapshot.capacity >= CAPACITY_TARGETS[stageIndex], value: `${snapshot.capacity.toLocaleString()} / ${CAPACITY_TARGETS[stageIndex].toLocaleString()}` },
    { label: "Ground condition", met: snapshot.averageStadiumCondition >= conditionTarget, value: `${snapshot.averageStadiumCondition.toFixed(0)}% / ${conditionTarget}%` },
    { label: "Stand development", met: averageLevel(standAssets) >= targetLevel, value: `${averageLevel(standAssets).toFixed(1)} / ${targetLevel.toFixed(1)}` },
    { label: "Playing surface", met: pitch >= Math.min(4, Math.max(1, stageIndex)), value: `Level ${pitch}` },
    { label: "Hospitality", met: hospitality >= Math.min(5, Math.max(1, stageIndex - 1)), value: `Level ${hospitality}` },
    { label: "Safety & access", met: access >= Math.min(4, Math.max(1, stageIndex - 1)), value: `Level ${access}` },
    { label: "Club facilities", met: clubhouse >= Math.min(4, Math.max(1, stageIndex - 1)), value: `Level ${clubhouse}` },
    { label: "Developed assets", met: developedCount >= requiredDeveloped, value: `${developedCount} / ${requiredDeveloped}` },
  ];
}

export function groundProgression(state: GameState) {
  const stages: GroundStage[] = STAGE_NAMES.map((name, index) => ({
    id: index,
    name,
    shortName: name.replace(" Ground", ""),
    requirements: requirementsFor(state, index),
  }));
  let currentIndex = 0;
  for (let index = 1; index < stages.length; index += 1) {
    if (stages[index].requirements.every((requirement) => requirement.met)) currentIndex = index;
    else break;
  }
  return {
    current: stages[currentIndex],
    next: stages[currentIndex + 1] ?? null,
    stages,
    visualStage: currentIndex,
  };
}

export function facilityCurrentEffect(asset: InfrastructureAsset) {
  const levelName = ASSET_CONFIG[asset.type].levels[asset.level - 1] ?? `Level ${asset.level}`;
  if (asset.type === "stand") return `${levelName} · ${asset.usableCapacity.toLocaleString()} usable places`;
  if (asset.type === "pitch") return `${levelName} · ${asset.condition.toFixed(0)}% surface condition`;
  if (asset.capacity > 0) return `${levelName} · ${asset.capacity.toLocaleString()} units`;
  return `${levelName} · quality ${asset.qualityRating}/100`;
}
