import type { GameState, InfrastructureAsset } from "@/lib/game/types";
import { ASSET_CONFIG, assets, infrastructureSnapshot, stands } from "@/lib/game/infrastructure";
import { groundDesign, sceneLook, type GroundDesign, type SceneLook, type StandForm } from "@/lib/game/groundIdentity";
import { clubKitFor, clubKitForReference } from "@/lib/game/clubKit";
import { hashString } from "@/lib/game/rng";

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

export interface MatchdayGroundPresentation {
  stage: number;
  stageName: string;
  shortName: string;
  capacity: number;
  attendance: number;
  fillPercent: number;
  /** Canonical home-ground architecture used by the matchday stadium shell. */
  design: GroundDesign;
  /** Club-selected visual identity for roofs, seats, mowing and floodlights. */
  look: SceneLook;
}


function generatedAwayGround(state: GameState, opponent: string, attendance: number): MatchdayGroundPresentation {
  const league = state.leagues.find((item) => item.id === state.liveMatch?.leagueId)
    ?? state.leagues.find((item) => item.clubIds.includes(opponent));
  const tier = league?.tier ?? 7;
  const reputation = state.clubReputations?.[opponent] ?? league?.reputationRange?.[0] ?? 20;
  const stage = tier <= 1 ? 5 : tier <= 2 ? 4 : tier <= 4 ? 3 : tier <= 6 ? 1 : 0;
  const seed = hashString(`away-ground|${opponent}`);
  const level = Math.max(1, Math.min(5, stage || 1));
  const forms: StandForm[] = stage >= 5 ? ["twoTier", "twoTier", "cantilever", "twoTier"]
    : stage >= 3 ? ["traditional", "cantilever", "traditional", "cantilever"]
    : stage >= 1 ? ["shelter", "traditional", "open", "terrace"]
    : ["open", "shelter", "open", "traditional"];
  const side = (n: number) => forms[(seed + n) % forms.length];
  const spanBase = 30 + stage * 10 + Math.round(reputation / 8);
  const design: GroundDesign = {
    version: 1,
    stands: {
      N: { form: side(0), level, span: Math.min(92, spanBase), depth: 6 + level * 3, setback: 4, standing: stage < 2 ? "terrace" : "seated", roof: stage >= 4 ? "cantilever" : "pitched" },
      E: { form: side(1), level, span: Math.min(96, spanBase + 8), depth: 7 + level * 3, setback: 4, standing: stage < 2 ? "terrace" : "seated", roof: stage >= 4 ? "cantilever" : "pitched" },
      S: { form: side(2), level, span: Math.min(92, spanBase - 4), depth: 6 + level * 3, setback: 4, standing: stage < 2 ? "terrace" : "seated", roof: stage >= 4 ? "cantilever" : "pitched" },
      W: { form: side(3), level, span: Math.min(96, spanBase + 12), depth: 8 + level * 3, setback: 4, standing: stage < 2 ? "terrace" : "seated", roof: stage >= 4 ? "cantilever" : "pitched" },
    },
    corners: {
      NW: { form: stage >= 4 ? "seated" : "open" }, NE: { form: stage >= 5 ? "seated" : "open" },
      SW: { form: stage >= 5 ? "seated" : "access" }, SE: { form: stage >= 4 ? "seated" : "open" },
    },
    perimeter: { style: stage >= 3 ? "hoardings" : stage >= 1 ? "barrier" : "rail", colour: "club" },
    surroundings: { carParkSurface: stage >= 2 ? "tarmac" : "gravel", carParkLocation: ["NW","NE","SW","SE"][seed % 4] as "NW"|"NE"|"SW"|"SE" },
  };
  const kit = clubKitForReference(state, opponent).home;
  const baseLook = sceneLook(state, { body: kit.body, secondary: kit.trim });
  const look: SceneLook = { ...baseLook, seat: kit.body, seatAlt: kit.trim, twoTone: true, roof: kit.body, roofDark: kit.trim, cladding: kit.body, homeEnd: null, stands: {} };
  const capacity = Math.max(1200, Math.round((2500 + stage * stage * 4500 + reputation * 120) / 250) * 250);
  const boundedAttendance = Math.max(0, Math.min(capacity, Math.round(attendance)));
  return { stage, stageName: STAGE_NAMES[stage], shortName: STAGE_NAMES[stage].replace(" Ground", ""), capacity, attendance: boundedAttendance, fillPercent: Math.round((boundedAttendance / capacity) * 100), design, look };
}

export function matchdayGroundPresentation(
  state: GameState,
  home: boolean,
  attendance: number,
): MatchdayGroundPresentation | null {
  if (!home) return generatedAwayGround(state, state.liveMatch?.fixture.opponent ?? "Opponent", attendance);
  const progression = groundProgression(state);
  const snapshot = infrastructureSnapshot(state);
  const capacity = Math.max(1, snapshot.usableCapacity || snapshot.capacity || 1);
  const boundedAttendance = Math.max(0, Math.min(capacity, Math.round(attendance)));
  return {
    stage: progression.visualStage,
    stageName: progression.current.name,
    shortName: progression.current.shortName,
    capacity,
    attendance: boundedAttendance,
    fillPercent: Math.max(0, Math.min(100, Math.round((boundedAttendance / capacity) * 100))),
    design: groundDesign(state),
    look: sceneLook(state, { body: clubKitFor(state).home.body, secondary: clubKitFor(state).home.trim }),
  };
}

export function facilityCurrentEffect(asset: InfrastructureAsset) {
  const levelName = ASSET_CONFIG[asset.type].levels[asset.level - 1] ?? `Level ${asset.level}`;
  if (asset.type === "stand") return `${levelName} · ${asset.usableCapacity.toLocaleString()} usable places`;
  if (asset.type === "pitch") return `${levelName} · ${asset.condition.toFixed(0)}% surface condition`;
  if (asset.capacity > 0) return `${levelName} · ${asset.capacity.toLocaleString()} units`;
  return `${levelName} · quality ${asset.qualityRating}/100`;
}
