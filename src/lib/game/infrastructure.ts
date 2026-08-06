/* =========================================================================
   Facilities, Stadium & Capital Projects
   -------------------------------------------------------------------------
   Rules of this module (enforced by __checks__/infrastructure.check.ts):

     1. GameState.infrastructure is the ONLY source of truth for physical
        assets, their condition, their costs and every capital project.
        GameState.stands / pitchCondition / trainingRating are projections
        rebuilt by syncLegacyStadium().
     2. Every pound moves through finance.postEntry(). Nothing here writes
        GameState.cash and nothing here builds a WeekLedger row by hand.
     3. Deterioration runs on a stable four-week period identity; routine
        maintenance runs on a stable weekly identity. Both are replay-safe
        and cannot be applied twice for the same period.
     4. No Math.random(), no Date.now(). Every risk outcome is decided once,
        deterministically, from (saveSeed, projectId) and then stored.
     5. This module imports finance/time/rng only, so board, commercial,
        inbox, engine and the UI may all import it.
========================================================================= */

import type {
  AssetModifiers,
  CapitalProject,
  CapitalProjectType,
  DirectorPosition,
  GameState,
  InfrastructureAsset,
  InfrastructureAssetStatus,
  InfrastructureAssetType,
  InfrastructureRecord,
  InfrastructureRecordKind,
  InfrastructureState,
  MaintenancePolicy,
  ProjectEffect,
  ProjectPayment,
  Stand,
} from "./types";
import { absoluteWeek } from "./time";
import { seededRng, rngRange } from "./rng";
import { assessSpend, postEntry } from "./finance";

const int = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Four playing weeks = one deterioration period. */
export const DETERIORATION_PERIOD_WEEKS = 4;

export const periodIndexFor = (abs: number) =>
  Math.floor((Math.max(1, abs) - 1) / DETERIORATION_PERIOD_WEEKS);

/* =========================================================================
   1. Configuration
========================================================================= */

export const MAINTENANCE_POLICIES: MaintenancePolicy[] =
  ["Minimal", "Reduced", "Standard", "Preventative", "Premium"];

/** Cost multiplier and deterioration multiplier per policy. */
export const POLICY_CONFIG: Record<MaintenancePolicy, {
  cost: number; decay: number; faultRisk: number; label: string;
}> = {
  "Minimal":      { cost: 0.40, decay: 1.75, faultRisk: 1.9, label: "Only fix what breaks. Costs least, ages fastest." },
  "Reduced":      { cost: 0.70, decay: 1.30, faultRisk: 1.4, label: "Trimmed upkeep. Noticeable long-term wear." },
  "Standard":     { cost: 1.00, decay: 1.00, faultRisk: 1.0, label: "Industry-standard upkeep across the club." },
  "Preventative": { cost: 1.35, decay: 0.72, faultRisk: 0.7, label: "Planned inspections. Slows decline markedly." },
  "Premium":      { cost: 1.75, decay: 0.52, faultRisk: 0.45, label: "Best-in-class upkeep. Expensive but assets hold." },
};

export interface AssetTypeConfig {
  label: string;
  /** Condition lost per four-week period at Standard policy, level 1, new. */
  decayPerPeriod: number;
  /** Weekly operating cost at level 1. */
  operatingCost: number;
  /** Weekly maintenance cost at level 1, Standard policy. */
  maintenanceCost: number;
  maintenanceRequirement: number;
  maxLevel: number;
  /** Which legacy weekly-ledger bucket the running costs belong in. */
  bucket: "stadiumOps" | "trainingOps" | "maintenance";
  /** Usable-capacity factors by condition band [excellent, good, worn, poor, critical, closed]. */
  capacityBands: [number, number, number, number, number, number];
  /** Level names shown in the UI. */
  levels: string[];
}

const BAND_FULL: AssetTypeConfig["capacityBands"] = [1, 1, 1, 1, 1, 0];

export const ASSET_CONFIG: Record<InfrastructureAssetType, AssetTypeConfig> = {
  stand: {
    label: "Stand", decayPerPeriod: 1.9, operatingCost: 1_450, maintenanceCost: 900,
    maintenanceRequirement: 60, maxLevel: 5, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.95, 0.72, 0.35, 0],
    levels: ["Basic terrace", "Seated stand", "Modern stand", "Premium stand", "Landmark stand"],
  },
  pitch: {
    label: "Pitch", decayPerPeriod: 4.6, operatingCost: 900, maintenanceCost: 1_250,
    maintenanceRequirement: 85, maxLevel: 4, bucket: "maintenance",
    capacityBands: BAND_FULL,
    levels: ["Grass", "Reinforced grass", "Hybrid surface", "Elite hybrid"],
  },
  shop: {
    label: "Club Shop", decayPerPeriod: 1.5, operatingCost: 1_100, maintenanceCost: 350,
    maintenanceRequirement: 40, maxLevel: 4, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.9, 0.65, 0.3, 0],
    levels: ["Kiosk", "Club shop", "Retail store", "Megastore"],
  },
  parking: {
    label: "Parking", decayPerPeriod: 2.1, operatingCost: 480, maintenanceCost: 260,
    maintenanceRequirement: 35, maxLevel: 5, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.92, 0.7, 0.4, 0],
    levels: ["Gravel", "Surfaced", "Expanded", "Managed matchday", "Premium multi-use"],
  },
  hospitality: {
    label: "Hospitality", decayPerPeriod: 1.7, operatingCost: 1_600, maintenanceCost: 520,
    maintenanceRequirement: 55, maxLevel: 5, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.9, 0.6, 0.25, 0],
    levels: ["Function room", "Lounge", "Executive suites", "Corporate boxes", "Premium hospitality"],
  },
  concessions: {
    label: "Food & Concessions", decayPerPeriod: 2.4, operatingCost: 1_250, maintenanceCost: 430,
    maintenanceRequirement: 55, maxLevel: 4, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.9, 0.65, 0.3, 0],
    levels: ["Serving hatches", "Concourse kiosks", "Full catering", "Destination food hall"],
  },
  sanitary: {
    label: "Toilets & Accessibility", decayPerPeriod: 2.8, operatingCost: 620, maintenanceCost: 380,
    maintenanceRequirement: 70, maxLevel: 4, bucket: "stadiumOps",
    capacityBands: BAND_FULL,
    levels: ["Dated blocks", "Adequate", "Modern", "Fully accessible"],
  },
  training: {
    label: "Training Ground", decayPerPeriod: 1.6, operatingCost: 3_100, maintenanceCost: 1_100,
    maintenanceRequirement: 60, maxLevel: 5, bucket: "trainingOps",
    capacityBands: BAND_FULL,
    levels: ["Public pitches", "Basic ground", "Good ground", "Modern complex", "Elite campus"],
  },
  medical: {
    label: "Medical Centre", decayPerPeriod: 1.3, operatingCost: 1_450, maintenanceCost: 520,
    maintenanceRequirement: 50, maxLevel: 4, bucket: "trainingOps",
    capacityBands: BAND_FULL,
    levels: ["Treatment room", "Physio suite", "Medical centre", "Sports science hub"],
  },
  offices: {
    label: "Commercial Offices", decayPerPeriod: 1.1, operatingCost: 1_250, maintenanceCost: 340,
    maintenanceRequirement: 35, maxLevel: 4, bucket: "stadiumOps",
    capacityBands: BAND_FULL,
    levels: ["Portacabins", "Club offices", "Commercial floor", "Business hub"],
  },
  fanZone: {
    label: "Fan Zone", decayPerPeriod: 2.2, operatingCost: 540, maintenanceCost: 240,
    maintenanceRequirement: 40, maxLevel: 4, bucket: "stadiumOps",
    capacityBands: [1, 1, 0.9, 0.6, 0.25, 0],
    levels: ["Car-park stalls", "Marquee zone", "Permanent fan zone", "Matchday village"],
  },
};

export type ConditionBand = "excellent" | "good" | "worn" | "poor" | "critical" | "closed";

export const BAND_ORDER: ConditionBand[] =
  ["excellent", "good", "worn", "poor", "critical", "closed"];

export function conditionBand(condition: number): ConditionBand {
  if (condition <= 0) return "closed";
  if (condition < 20) return "critical";
  if (condition < 40) return "poor";
  if (condition < 60) return "worn";
  if (condition < 80) return "good";
  return "excellent";
}

export const BAND_LABEL: Record<ConditionBand, string> = {
  excellent: "Excellent", good: "Good", worn: "Worn",
  poor: "Poor", critical: "Critical", closed: "Closed",
};

/** Operating-cost multiplier caused by a degraded asset. */
const BAND_COST: Record<ConditionBand, number> = {
  excellent: 1, good: 1, worn: 1.08, poor: 1.22, critical: 1.45, closed: 0.35,
};

/** Status implied by condition alone (construction overrides it). */
function statusForCondition(condition: number): InfrastructureAssetStatus {
  const band = conditionBand(condition);
  if (band === "closed") return "closed";
  if (band === "critical") return "partiallyClosed";
  if (band === "poor") return "restricted";
  if (band === "worn") return "degraded";
  return "operational";
}

export function capacityFactorFor(type: InfrastructureAssetType, condition: number): number {
  const bands = ASSET_CONFIG[type].capacityBands;
  return bands[BAND_ORDER.indexOf(conditionBand(condition))];
}

/* =========================================================================
   2. Asset seeding + migration
========================================================================= */

const STAND_META = () => ({
  roofQuality: 60, seatingQuality: 60, concourseQuality: 55,
  accessibility: 50, hospitalityCapacity: 0, commercialSpace: 0,
});

function baseAsset(
  id: string, type: InfrastructureAssetType, name: string, location: string,
  season: number, level: number, condition: number, capacity: number,
  metadata: Record<string, number> = {},
): InfrastructureAsset {
  const cfg = ASSET_CONFIG[type];
  const a: InfrastructureAsset = {
    id, type, name, location,
    level: clamp(level, 1, cfg.maxLevel),
    condition: clamp(int(condition), 0, 100),
    maximumCondition: 100,
    ageYears: 0,
    openedSeason: season,
    lastRefurbishedSeason: null,
    status: "operational",
    capacity: int(capacity),
    usableCapacity: int(capacity),
    qualityRating: 50,
    maintenanceRequirement: cfg.maintenanceRequirement,
    weeklyOperatingCost: 0,
    weeklyMaintenanceCost: 0,
    revenueModifiers: {},
    supporterModifiers: {},
    commercialModifiers: {},
    sportingModifiers: {},
    upgradePath: [],
    activeProjectId: null,
    metadata,
  };
  return a;
}

/** Deterministic seed for a non-stadium facility on a fresh/migrated save. */
function seedFacility(
  s: GameState, id: string, type: InfrastructureAssetType, name: string,
  location: string, baseLevel: number, capacity: number,
  metadata: Record<string, number> = {},
): InfrastructureAsset {
  const rng = seededRng(s.saveSeed ?? "seed", "infra-seed", id);
  const level = clamp(baseLevel, 1, ASSET_CONFIG[type].maxLevel);
  const condition = clamp(int(58 + rngRange(rng, 0, 34)), 20, 96);
  const age = Math.floor(rngRange(rng, 2, 26));
  const a = baseAsset(id, type, name, location, s.season ?? 1, level, condition, capacity, metadata);
  a.ageYears = age;
  a.openedSeason = Math.max(1, (s.season ?? 1) - age);
  return a;
}

const TRAINING_LEVEL_FROM_RATING = (rating: number) =>
  clamp(Math.round((rating - 40) / 13) + 1, 1, 5);

export const TRAINING_RATING_FOR_LEVEL = (level: number, condition: number) =>
  clamp(int(40 + (level - 1) * 13 + (condition - 70) * 0.12), 30, 95);

/**
 * Create or repair GameState.infrastructure. Deterministic and idempotent:
 * running it twice never changes a value and never invents project history.
 */
export function ensureInfrastructure(s: GameState): void {
  const season = s.season ?? 1;
  const nowAbs = absoluteWeek(season, s.week ?? 1);
  const existing = s.infrastructure as InfrastructureState | undefined;

  if (!existing || !Array.isArray(existing.assets) || existing.assets.length === 0) {
    const infra: InfrastructureState = {
      assets: [],
      projects: [],
      history: [],
      maintenancePolicy: "Standard",
      policyChangedAtAbsoluteWeek: nowAbs,
      // Mid-season saves must not receive a backlog of deterioration ticks.
      lastDeteriorationPeriod: periodIndexFor(nowAbs),
      lastTickAbsoluteWeek: nowAbs,
      nextProjectId: 1,
      nextRecordId: 1,
      seededSeason: season,
    };

    // --- Stands: migrated 1:1 from the legacy stadium model ---
    const stands: Stand[] = Array.isArray(s.stands) && s.stands.length
      ? s.stands
      : [
          { key: "N", name: "North Stand", capacity: 6000, condition: 92, ticketPrice: 22 },
          { key: "E", name: "East Stand", capacity: 5000, condition: 88, ticketPrice: 26 },
          { key: "S", name: "South Stand", capacity: 6000, condition: 90, ticketPrice: 22 },
          { key: "W", name: "West Stand", capacity: 7000, condition: 94, ticketPrice: 30 },
        ];
    for (const st of stands) {
      const rng = seededRng(s.saveSeed ?? "seed", "infra-stand", st.key);
      const a = baseAsset(
        `stand-${st.key}`, "stand", st.name, st.key, season,
        2, st.condition, st.capacity, STAND_META(),
      );
      a.ageYears = Math.floor(rngRange(rng, 8, 40));
      a.openedSeason = Math.max(1, season - a.ageYears);
      a.metadata.roofQuality = clamp(int(rngRange(rng, 35, 80)), 0, 100);
      a.metadata.seatingQuality = clamp(int(st.condition * 0.8 + 10), 0, 100);
      a.metadata.concourseQuality = clamp(int(rngRange(rng, 30, 72)), 0, 100);
      a.metadata.accessibility = clamp(int(rngRange(rng, 28, 68)), 0, 100);
      infra.assets.push(a);
    }

    // --- Pitch: condition migrated exactly ---
    const pitch = baseAsset(
      "pitch", "pitch", "Playing Surface", "Stadium bowl", season,
      2, s.pitchCondition ?? 90, 0,
      { drainage: 55, surface: 60, usage: 0 },
    );
    pitch.ageYears = 3;
    pitch.openedSeason = Math.max(1, season - 3);
    infra.assets.push(pitch);

    // --- Training ground: level derived from the legacy training rating ---
    const trainingLevel = TRAINING_LEVEL_FROM_RATING(s.trainingRating ?? 65);
    const training = seedFacility(
      s, "training", "training", "Training Ground", "Club training site",
      trainingLevel, 0, { pitches: 3 + trainingLevel },
    );
    training.level = trainingLevel;
    infra.assets.push(training);

    // --- Remaining facilities: deterministic seeding from the save seed ---
    const totalCap = stands.reduce((a, b) => a + b.capacity, 0);
    infra.assets.push(seedFacility(s, "shop", "shop", "Club Shop", "Main entrance", 2, 0, { floorArea: 180 }));
    infra.assets.push(seedFacility(s, "parking", "parking", "Car Parking", "Stadium perimeter", 2, Math.round(totalCap * 0.05), {}));
    infra.assets.push(seedFacility(s, "hospitality", "hospitality", "Hospitality", "West side", 2, Math.round(totalCap * 0.012), {}));
    infra.assets.push(seedFacility(s, "concessions", "concessions", "Food & Concessions", "Concourses", 2, Math.round(totalCap * 0.08), {}));
    infra.assets.push(seedFacility(s, "sanitary", "sanitary", "Toilets & Accessibility", "Concourses", 2, 0, {}));
    infra.assets.push(seedFacility(s, "medical", "medical", "Medical Centre", "Training Ground", 2, 0, {}));
    infra.assets.push(seedFacility(s, "offices", "offices", "Commercial Offices", "West Stand", 2, 0, {}));
    infra.assets.push(seedFacility(s, "fanZone", "fanZone", "Fan Zone", "Stadium forecourt", 1, 0, {}));

    s.infrastructure = infra;
  }

  const infra = s.infrastructure;
  if (!Array.isArray(infra.projects)) infra.projects = [];
  if (!Array.isArray(infra.history)) infra.history = [];
  if (!MAINTENANCE_POLICIES.includes(infra.maintenancePolicy)) infra.maintenancePolicy = "Standard";
  if (typeof infra.lastDeteriorationPeriod !== "number") infra.lastDeteriorationPeriod = periodIndexFor(nowAbs);
  if (typeof infra.lastTickAbsoluteWeek !== "number") infra.lastTickAbsoluteWeek = nowAbs;
  if (typeof infra.nextProjectId !== "number") infra.nextProjectId = infra.projects.length + 1;
  if (typeof infra.nextRecordId !== "number") infra.nextRecordId = infra.history.length + 1;

  recomputeDerived(s);
  syncLegacyStadium(s);
}

/* =========================================================================
   3. Derived values, modifiers and selectors (pure)
========================================================================= */

export const assets = (s: GameState): InfrastructureAsset[] => s.infrastructure?.assets ?? [];
export const assetById = (s: GameState, id: string): InfrastructureAsset | undefined =>
  assets(s).find((a) => a.id === id);
export const assetsOfType = (s: GameState, type: InfrastructureAssetType) =>
  assets(s).filter((a) => a.type === type);
export const stands = (s: GameState) => assetsOfType(s, "stand");

export const projects = (s: GameState): CapitalProject[] => s.infrastructure?.projects ?? [];
export const projectById = (s: GameState, id: string) => projects(s).find((p) => p.id === id);
export const activeProjects = (s: GameState) =>
  projects(s).filter((p) => p.status === "approved" || p.status === "active" || p.status === "delayed");
export const projectForAsset = (s: GameState, assetId: string) =>
  activeProjects(s).find((p) => p.assetId === assetId);

/** Temporary construction effect on one asset. Never stored on the asset. */
export function disruptionFor(s: GameState, assetId: string) {
  const p = projectForAsset(s, assetId);
  if (!p) return { capacityFactor: 1, revenueFactor: 1, fanHappiness: 0 };
  return p.disruption;
}

/** Usable capacity = nominal × condition band × live construction disruption. */
export function usableCapacityOf(s: GameState, a: InfrastructureAsset): number {
  if (a.capacity <= 0) return 0;
  const factor = capacityFactorFor(a.type, a.condition) * disruptionFor(s, a.id).capacityFactor;
  return clamp(int(a.capacity * factor), 0, a.capacity);
}

export const stadiumCapacity = (s: GameState) =>
  stands(s).reduce((t, a) => t + a.capacity, 0);
export const stadiumUsableCapacity = (s: GameState) =>
  stands(s).reduce((t, a) => t + usableCapacityOf(s, a), 0);

export function averageStadiumCondition(s: GameState): number {
  const st = stands(s);
  if (!st.length) return 0;
  return Math.round((st.reduce((t, a) => t + a.condition, 0) / st.length) * 10) / 10;
}

export function averageAssetCondition(s: GameState): number {
  const all = assets(s);
  if (!all.length) return 0;
  return Math.round((all.reduce((t, a) => t + a.condition, 0) / all.length) * 10) / 10;
}

export const criticalAssets = (s: GameState) =>
  assets(s).filter((a) => a.condition < 20);

/** Level+condition score of one asset, 0-100. */
export function assetScore(a: InfrastructureAsset): number {
  const cfg = ASSET_CONFIG[a.type];
  const levelPct = ((a.level - 1) / Math.max(1, cfg.maxLevel - 1)) * 100;
  return clamp(Math.round(levelPct * 0.6 + a.condition * 0.4), 0, 100);
}

export interface FacilityModifiers {
  /** Multipliers around 1.0. */
  hospitalityIncome: number;
  concessionSpend: number;
  parkingIncome: number;
  attendanceConvenience: number;
  matchdayOperatingCost: number;
  /** Additive points. */
  fanHappiness: number;
  commercialPower: number;
  staffAttraction: number;
  recruitmentAttraction: number;
  sportingQuality: number;
}

const scoreMult = (score: number, span: number) => 1 + ((score - 50) / 50) * span;

/** The single place infrastructure turns into effects for other systems. */
export function facilityModifiers(s: GameState): FacilityModifiers {
  const get = (id: string) => assetById(s, id);
  const scoreOf = (id: string) => {
    const a = get(id);
    if (!a) return 50;
    const d = disruptionFor(s, id);
    return clamp(Math.round(assetScore(a) * d.revenueFactor), 0, 100);
  };

  const hosp = scoreOf("hospitality");
  const conc = scoreOf("concessions");
  const park = scoreOf("parking");
  const shop = scoreOf("shop");
  const san = scoreOf("sanitary");
  const zone = scoreOf("fanZone");
  const off = scoreOf("offices");
  const train = scoreOf("training");
  const med = scoreOf("medical");
  const standAvg = stands(s).length
    ? stands(s).reduce((t, a) => t + assetScore(a), 0) / stands(s).length
    : 50;

  const disruptionFans = activeProjects(s).reduce((t, p) => t + p.disruption.fanHappiness, 0);

  return {
    hospitalityIncome: clamp(scoreMult(hosp, 0.85), 0.15, 2.0),
    concessionSpend: clamp(scoreMult(conc, 0.55), 0.3, 1.7),
    parkingIncome: clamp(scoreMult(park, 0.7), 0.2, 1.8),
    attendanceConvenience: clamp(1 + ((park - 50) * 0.0012) + ((zone - 50) * 0.0008), 0.9, 1.12),
    matchdayOperatingCost: clamp(1 + ((50 - standAvg) * 0.0022), 0.85, 1.3),
    fanHappiness: Math.round(((san - 50) * 0.05 + (zone - 50) * 0.035 + (conc - 50) * 0.03
      + (standAvg - 50) * 0.04) * 10) / 10 + disruptionFans,
    commercialPower: Math.round(((shop - 50) * 0.12 + (hosp - 50) * 0.12 + (off - 50) * 0.1
      + (standAvg - 50) * 0.06) * 10) / 10,
    staffAttraction: Math.round(((train - 50) * 0.14 + (med - 50) * 0.1) * 10) / 10,
    recruitmentAttraction: Math.round(((train - 50) * 0.12 + (med - 50) * 0.06
      + (standAvg - 50) * 0.05) * 10) / 10,
    sportingQuality: Math.round(((train - 50) * 0.1 + (scoreOf("pitch") - 50) * 0.1) * 10) / 10,
  };
}

/** Weekly cost of one asset under the club's current policy. */
export function assetCosts(s: GameState, a: InfrastructureAsset): {
  operating: number; maintenance: number;
} {
  const cfg = ASSET_CONFIG[a.type];
  const policy = POLICY_CONFIG[s.infrastructure?.maintenancePolicy ?? "Standard"];
  const band = conditionBand(a.condition);
  const levelScale = 1 + (a.level - 1) * 0.42;
  const capScale = a.type === "stand" ? Math.max(0.5, a.capacity / 6000) : 1;
  const closed = a.status === "closed";
  const operating = closed ? 0 : int(cfg.operatingCost * levelScale * capScale * BAND_COST[band]);
  // A closed asset is still made safe, but is not fully maintained.
  const maintenance = int(
    cfg.maintenanceCost * levelScale * capScale * policy.cost *
    (1 + a.maintenanceRequirement / 200) * (closed ? 0.3 : 1),
  );
  return { operating, maintenance };
}

export const weeklyMaintenanceCost = (s: GameState) =>
  assets(s).reduce((t, a) => t + assetCosts(s, a).maintenance, 0);
export const weeklyOperatingCost = (s: GameState) =>
  assets(s).reduce((t, a) => t + assetCosts(s, a).operating, 0);

/** Recompute every cached projection on the assets. Pure derivation. */
export function recomputeDerived(s: GameState): void {
  for (const a of assets(s)) {
    const cfg = ASSET_CONFIG[a.type];
    const costs = assetCosts(s, a);
    a.weeklyOperatingCost = costs.operating;
    a.weeklyMaintenanceCost = costs.maintenance;
    a.qualityRating = clamp(int(
      ((a.level - 1) / Math.max(1, cfg.maxLevel - 1)) * 70 + a.condition * 0.3,
    ), 0, 100);
    a.usableCapacity = usableCapacityOf(s, a);
    a.upgradePath = availableProjectTypes(a);
    const live = projectForAsset(s, a.id);
    a.activeProjectId = live?.id ?? null;
    a.status = live ? "underConstruction" : statusForCondition(a.condition);
  }
}

/** Rebuild the legacy stadium projection read by older screens. */
export function syncLegacyStadium(s: GameState): void {
  const st = stands(s);
  if (st.length && Array.isArray(s.stands)) {
    s.stands = s.stands.map((legacy) => {
      const a = st.find((x) => x.location === legacy.key || x.id === `stand-${legacy.key}`);
      return a ? { ...legacy, capacity: a.capacity, condition: int(a.condition) } : legacy;
    });
  }
  const pitch = assetById(s, "pitch");
  if (pitch) s.pitchCondition = int(pitch.condition);
  const training = assetById(s, "training");
  if (training) s.trainingRating = TRAINING_RATING_FOR_LEVEL(training.level, training.condition);
  s.maintenanceWeekly = weeklyMaintenanceCost(s);
  s.trainingWeeklyCost = assets(s)
    .filter((a) => ASSET_CONFIG[a.type].bucket === "trainingOps")
    .reduce((t, a) => t + a.weeklyOperatingCost, 0);
}

/* =========================================================================
   4. Deterioration — deterministic, four-week cadence, replay-safe
========================================================================= */

/** Home fixtures played inside one deterioration period. */
function homeMatchesInPeriod(s: GameState, period: number): number {
  const from = period * DETERIORATION_PERIOD_WEEKS + 1;
  const to = from + DETERIORATION_PERIOD_WEEKS - 1;
  return (s.financeLedger ?? []).filter(
    (e) => e.category === "Matchday" && e.subcategory === "Ticket sales" &&
      e.metadata?.home === true && e.absoluteWeek >= from && e.absoluteWeek <= to,
  ).length;
}

/** Condition an asset loses across one period. Pure. */
export function deteriorationFor(
  s: GameState, a: InfrastructureAsset, period: number,
): number {
  if (a.status === "closed" || a.condition <= 0) return 0; // closed assets are frozen
  const cfg = ASSET_CONFIG[a.type];
  const policy = POLICY_CONFIG[s.infrastructure?.maintenancePolicy ?? "Standard"];
  const ageFactor = 1 + Math.min(1.2, a.ageYears * 0.022);
  const neglectFactor = a.condition < 40 ? 1.35 : a.condition < 60 ? 1.12 : 1;
  const qualityFactor = clamp(1 - a.qualityRating / 260, 0.55, 1);
  const usage = (a.type === "stand" || a.type === "pitch" || a.type === "concessions" ||
    a.type === "sanitary" || a.type === "parking")
    ? 1 + homeMatchesInPeriod(s, period) * 0.075
    : 1;
  const construction = a.activeProjectId ? 1.4 : 1;
  const rng = seededRng(s.saveSeed ?? "seed", "infra-decay", a.id, period);
  const variation = rngRange(rng, 0.78, 1.22);
  const loss = cfg.decayPerPeriod * policy.decay * ageFactor * neglectFactor *
    qualityFactor * usage * construction * variation;
  return Math.round(loss * 100) / 100;
}

/** Apply every outstanding deterioration period. Exactly once per period. */
export function applyDeterioration(s: GameState): void {
  const infra = s.infrastructure;
  const nowPeriod = periodIndexFor(absoluteWeek(s.season, s.week));
  if (infra.lastDeteriorationPeriod >= nowPeriod) return;
  for (let p = infra.lastDeteriorationPeriod + 1; p <= nowPeriod; p++) {
    for (const a of infra.assets) {
      const loss = deteriorationFor(s, a, p);
      if (loss <= 0) continue;
      a.condition = clamp(Math.round((a.condition - loss) * 100) / 100, 0, a.maximumCondition);
      // Age advances one period-year equivalent every season.
      if (p % Math.ceil(46 / DETERIORATION_PERIOD_WEEKS) === 0) a.ageYears += 1;
    }
    infra.lastDeteriorationPeriod = p;
  }
  recomputeDerived(s);
  syncLegacyStadium(s);
}

/* =========================================================================
   5. Maintenance policy + routine payments
========================================================================= */

export function setMaintenancePolicyInPlace(s: GameState, policy: MaintenancePolicy): void {
  ensureInfrastructure(s);
  if (!MAINTENANCE_POLICIES.includes(policy)) return;
  if (s.infrastructure.maintenancePolicy === policy) return;
  const before = s.infrastructure.maintenancePolicy;
  s.infrastructure.maintenancePolicy = policy;
  s.infrastructure.policyChangedAtAbsoluteWeek = absoluteWeek(s.season, s.week);
  // Policy changes future decay and future cost. It repairs nothing.
  recomputeDerived(s);
  syncLegacyStadium(s);
  pushRecord(s, {
    kind: "policyChange", assetId: "club", assetName: "Club-wide",
    projectId: null, cost: 0,
    description: `Maintenance policy changed from ${before} to ${policy}`,
    capacityBefore: 0, capacityAfter: 0, conditionBefore: 0, conditionAfter: 0,
  });
}

export function setMaintenancePolicy(s: GameState, policy: MaintenancePolicy): GameState {
  const ns = structuredClone(s);
  setMaintenancePolicyInPlace(ns, policy);
  return ns;
}

/** Estimated condition lost per season under a given policy. Pure preview. */
export function projectedSeasonDecay(s: GameState, policy: MaintenancePolicy): number {
  const periods = Math.round(46 / DETERIORATION_PERIOD_WEEKS);
  const ratio = POLICY_CONFIG[policy].decay /
    POLICY_CONFIG[s.infrastructure?.maintenancePolicy ?? "Standard"].decay;
  const perPeriod = assets(s).length
    ? assets(s).reduce((t, a) => t + deteriorationFor(s, a, periodIndexFor(absoluteWeek(s.season, s.week)) + 1), 0) / assets(s).length
    : 0;
  return Math.round(perPeriod * ratio * periods * 10) / 10;
}

export function maintenanceCostUnder(s: GameState, policy: MaintenancePolicy): number {
  const ratio = POLICY_CONFIG[policy].cost /
    POLICY_CONFIG[s.infrastructure?.maintenancePolicy ?? "Standard"].cost;
  return int(weeklyMaintenanceCost(s) * ratio);
}

/** Post this week's routine maintenance + facility operating costs. */
export function postInfrastructureWeek(s: GameState): void {
  const key = (what: string) => `infra:s${s.season}:w${s.week}:${what}`;
  const byBucket: Record<string, number> = { stadiumOps: 0, trainingOps: 0, maintenance: 0 };
  for (const a of assets(s)) {
    byBucket[ASSET_CONFIG[a.type].bucket] += a.weeklyOperatingCost;
  }
  const maintenance = weeklyMaintenanceCost(s);

  postEntry(s, {
    category: "Facilities", subcategory: "Routine maintenance",
    description: `Routine maintenance — ${s.infrastructure.maintenancePolicy} policy`,
    amount: maintenance, direction: "expense", sourceSystem: "facilities",
    recurring: true, dedupeKey: key("maintenance"),
    metadata: { legacyBucket: "maintenance", policy: s.infrastructure.maintenancePolicy },
  });
  postEntry(s, {
    category: "Operations", subcategory: "Stadium operations",
    description: "Stadium and matchday facility running costs",
    amount: byBucket.stadiumOps + byBucket.maintenance, direction: "expense",
    sourceSystem: "facilities", recurring: true, dedupeKey: key("stadiumOps"),
    metadata: { legacyBucket: "stadiumOps" },
  });
  postEntry(s, {
    category: "Facilities", subcategory: "Training ground",
    description: "Training ground and medical centre running costs",
    amount: byBucket.trainingOps, direction: "expense",
    sourceSystem: "facilities", recurring: true, dedupeKey: key("trainingOps"),
    metadata: { legacyBucket: "trainingOps" },
  });
}

/* =========================================================================
   6. Project catalogue
========================================================================= */

export interface ProjectSpec {
  type: CapitalProjectType;
  title: string;
  description: string;
  /** Cost before scale factors. */
  cost: number;
  durationWeeks: number;
  major: boolean;
  risk: number;
  disruption: { capacityFactor: number; revenueFactor: number; fanHappiness: number };
  effects: ProjectEffect[];
}

export const PROJECT_LABEL: Record<CapitalProjectType, string> = {
  minorRepair: "Minor repair",
  majorRepair: "Major repair",
  refurbishment: "Full refurbishment",
  replacement: "Replacement",
  capacityExpansion: "Capacity expansion",
  roofUpgrade: "Roof upgrade",
  seatingRefurbishment: "Seating refurbishment",
  concourseUpgrade: "Concourse upgrade",
  accessibilityUpgrade: "Accessibility improvements",
  hospitalityInstallation: "Hospitality installation",
  corporateBoxes: "Corporate boxes",
  retailExpansion: "Food & retail expansion",
  standRedevelopment: "Full stand redevelopment",
  facilityUpgrade: "Facility upgrade",
};

const REPAIR_TYPES: CapitalProjectType[] = ["minorRepair", "majorRepair", "refurbishment", "replacement"];
export const isMinorWork = (t: CapitalProjectType) => t === "minorRepair";

const STAND_TYPES: CapitalProjectType[] = [
  "capacityExpansion", "roofUpgrade", "seatingRefurbishment", "concourseUpgrade",
  "accessibilityUpgrade", "hospitalityInstallation", "corporateBoxes",
  "retailExpansion", "standRedevelopment",
];

function availableProjectTypes(a: InfrastructureAsset): CapitalProjectType[] {
  const out: CapitalProjectType[] = [];
  if (a.condition < a.maximumCondition - 2) out.push("minorRepair", "majorRepair");
  out.push("refurbishment");
  if (a.condition < 35 || a.ageYears > 45) out.push("replacement");
  if (a.type === "stand") out.push(...STAND_TYPES);
  else if (a.level < ASSET_CONFIG[a.type].maxLevel) out.push("facilityUpgrade");
  return out;
}

/** Deterministic expansion allowance for a stand. Site + club constrained. */
export function expansionAllowance(s: GameState, a: InfrastructureAsset): number {
  if (a.type !== "stand") return 0;
  const cfg = ASSET_CONFIG.stand;
  if (a.level >= cfg.maxLevel) return 0;
  const rep = s.reputation ?? 50;
  const tierBonus = (s.leagues ?? []).find((l) => l.id === s.playerLeagueId)?.tier === 1 ? 1.15 : 1;
  const siteCap = int((3_000 + rep * 90) * tierBonus);
  const headroom = Math.max(0, 16_000 - a.capacity);
  return int(Math.min(siteCap, headroom) / 250) * 250;
}

/** Every project the club could raise against one asset, costed. */
export function projectCatalogue(s: GameState, assetId: string): ProjectSpec[] {
  const a = assetById(s, assetId);
  if (!a) return [];
  const cfg = ASSET_CONFIG[a.type];
  const scale = a.type === "stand" ? Math.max(0.6, a.capacity / 6000) : 1;
  const levelScale = 1 + (a.level - 1) * 0.35;
  const missing = Math.max(0, a.maximumCondition - a.condition);
  const out: ProjectSpec[] = [];
  const has = (t: CapitalProjectType) => a.upgradePath.includes(t);

  if (has("minorRepair")) out.push({
    type: "minorRepair",
    title: `${a.name} — minor repair`,
    description: "Patch-up works by the club's own contractors. Restores up to 15 points of condition.",
    cost: int((6_000 + cfg.maintenanceCost * 8) * scale * levelScale),
    durationWeeks: 1, major: false, risk: 10,
    disruption: { capacityFactor: 1, revenueFactor: 1, fanHappiness: 0 },
    effects: [{ kind: "condition", add: Math.min(15, Math.max(4, missing)) }],
  });

  if (has("majorRepair")) out.push({
    type: "majorRepair",
    title: `${a.name} — major repair`,
    description: "Structural repair programme. Restores up to 35 points of condition.",
    cost: int((28_000 + cfg.maintenanceCost * 26) * scale * levelScale),
    durationWeeks: 3, major: true, risk: 28,
    disruption: { capacityFactor: 0.85, revenueFactor: 0.9, fanHappiness: -1 },
    effects: [{ kind: "condition", add: Math.min(35, Math.max(10, missing)) }],
  });

  if (has("refurbishment")) out.push({
    type: "refurbishment",
    title: `${a.name} — full refurbishment`,
    description: "Strip back and rebuild the interior. Restores condition to near new and slows future wear.",
    cost: int((120_000 + cfg.maintenanceCost * 90) * scale * levelScale),
    durationWeeks: 8, major: true, risk: 42,
    disruption: { capacityFactor: 0.55, revenueFactor: 0.6, fanHappiness: -3 },
    effects: [
      { kind: "condition", to: 96 }, { kind: "refurbish" },
      { kind: "quality", add: 6 }, { kind: "resetAge" },
    ],
  });

  if (has("replacement")) out.push({
    type: "replacement",
    title: `${a.name} — replacement`,
    description: "Demolish and rebuild the asset from scratch. Very expensive and very disruptive.",
    cost: int((420_000 + cfg.maintenanceCost * 260) * scale * levelScale),
    durationWeeks: 16, major: true, risk: 62,
    disruption: { capacityFactor: 0.1, revenueFactor: 0.15, fanHappiness: -6 },
    effects: [
      { kind: "condition", to: 100 }, { kind: "refurbish" }, { kind: "resetAge" },
      { kind: "level", add: 1 }, { kind: "quality", add: 12 },
    ],
  });

  if (a.type === "stand") {
    const seats = expansionAllowance(s, a);
    if (seats > 0) out.push({
      type: "capacityExpansion",
      title: `${a.name} — capacity expansion (+${seats.toLocaleString("en-GB")})`,
      description: `Add ${seats.toLocaleString("en-GB")} seats within the site's planning envelope.`,
      cost: int(seats * 420 + 90_000),
      durationWeeks: 12, major: true, risk: 50,
      disruption: { capacityFactor: 0.6, revenueFactor: 0.8, fanHappiness: -2 },
      effects: [{ kind: "capacity", add: seats }, { kind: "condition", add: -4 }, { kind: "level", add: 1 }],
    });
    if (has("roofUpgrade")) out.push({
      type: "roofUpgrade",
      title: `${a.name} — roof upgrade`,
      description: "Replace the roof structure and cladding. Supporters stay dry, wear slows.",
      cost: int(180_000 * scale), durationWeeks: 6, major: true, risk: 34,
      disruption: { capacityFactor: 0.8, revenueFactor: 0.9, fanHappiness: -1 },
      effects: [{ kind: "metadata", key: "roofQuality", to: 95 }, { kind: "quality", add: 5 }],
    });
    if (has("seatingRefurbishment")) out.push({
      type: "seatingRefurbishment",
      title: `${a.name} — seating refurbishment`,
      description: "New seats throughout the stand.",
      cost: int(95_000 * scale), durationWeeks: 4, major: true, risk: 22,
      disruption: { capacityFactor: 0.7, revenueFactor: 0.85, fanHappiness: -1 },
      effects: [{ kind: "metadata", key: "seatingQuality", to: 92 }, { kind: "condition", add: 10 }],
    });
    if (has("concourseUpgrade")) out.push({
      type: "concourseUpgrade",
      title: `${a.name} — concourse upgrade`,
      description: "Widen and modernise the concourse. Better flow, better spend.",
      cost: int(140_000 * scale), durationWeeks: 6, major: true, risk: 30,
      disruption: { capacityFactor: 0.75, revenueFactor: 0.8, fanHappiness: -2 },
      effects: [{ kind: "metadata", key: "concourseQuality", to: 90 }, { kind: "quality", add: 4 }],
    });
    if (has("accessibilityUpgrade")) out.push({
      type: "accessibilityUpgrade",
      title: `${a.name} — accessibility improvements`,
      description: "Ramps, lifts, dedicated bays and improved sightlines.",
      cost: int(85_000 * scale), durationWeeks: 4, major: false, risk: 18,
      disruption: { capacityFactor: 0.92, revenueFactor: 0.96, fanHappiness: 0 },
      effects: [{ kind: "metadata", key: "accessibility", to: 92 }],
    });
    if (has("hospitalityInstallation")) out.push({
      type: "hospitalityInstallation",
      title: `${a.name} — hospitality installation`,
      description: "Install matchday hospitality space inside the stand.",
      cost: int(260_000 * scale), durationWeeks: 9, major: true, risk: 40,
      disruption: { capacityFactor: 0.7, revenueFactor: 0.75, fanHappiness: -1 },
      effects: [{ kind: "metadata", key: "hospitalityCapacity", add: 180 }, { kind: "quality", add: 6 }],
    });
    if (has("corporateBoxes")) out.push({
      type: "corporateBoxes",
      title: `${a.name} — corporate boxes`,
      description: "Executive boxes along the back of the stand.",
      cost: int(340_000 * scale), durationWeeks: 11, major: true, risk: 46,
      disruption: { capacityFactor: 0.65, revenueFactor: 0.7, fanHappiness: -2 },
      effects: [{ kind: "metadata", key: "hospitalityCapacity", add: 120 },
        { kind: "metadata", key: "commercialSpace", add: 200 }, { kind: "quality", add: 7 }],
    });
    if (has("retailExpansion")) out.push({
      type: "retailExpansion",
      title: `${a.name} — food & retail expansion`,
      description: "Extra retail and catering units inside the stand.",
      cost: int(120_000 * scale), durationWeeks: 5, major: true, risk: 26,
      disruption: { capacityFactor: 0.85, revenueFactor: 0.85, fanHappiness: -1 },
      effects: [{ kind: "metadata", key: "commercialSpace", add: 260 }, { kind: "quality", add: 3 }],
    });
    if (has("standRedevelopment")) out.push({
      type: "standRedevelopment",
      title: `${a.name} — full redevelopment`,
      description: "Complete rebuild: bigger, covered, modern concourse and hospitality.",
      cost: int(1_200_000 * scale), durationWeeks: 22, major: true, risk: 75,
      disruption: { capacityFactor: 0.05, revenueFactor: 0.1, fanHappiness: -8 },
      effects: [
        { kind: "condition", to: 100 }, { kind: "refurbish" }, { kind: "resetAge" },
        { kind: "capacity", add: Math.max(1_500, Math.round(a.capacity * 0.35 / 250) * 250) },
        { kind: "level", add: 2 }, { kind: "quality", add: 18 },
        { kind: "metadata", key: "roofQuality", to: 98 },
        { kind: "metadata", key: "seatingQuality", to: 96 },
        { kind: "metadata", key: "concourseQuality", to: 95 },
        { kind: "metadata", key: "accessibility", to: 95 },
        { kind: "metadata", key: "hospitalityCapacity", add: 240 },
        { kind: "maximumCondition", add: 0 },
      ],
    });
  } else if (has("facilityUpgrade")) {
    const next = clamp(a.level + 1, 1, cfg.maxLevel);
    const capAdd = a.capacity > 0 ? Math.round(a.capacity * 0.45) : 0;
    out.push({
      type: "facilityUpgrade",
      title: `${a.name} — upgrade to ${cfg.levels[next - 1]}`,
      description: `Take the ${cfg.label.toLowerCase()} from ${cfg.levels[a.level - 1]} to ${cfg.levels[next - 1]}.`,
      cost: int((150_000 + cfg.operatingCost * 130) * levelScale),
      durationWeeks: a.type === "training" || a.type === "medical" ? 14 : 8,
      major: true, risk: 38,
      disruption: { capacityFactor: 0.6, revenueFactor: 0.65, fanHappiness: -1 },
      effects: [
        { kind: "level", add: 1 }, { kind: "quality", add: 8 },
        { kind: "condition", add: 12 },
        ...(capAdd ? [{ kind: "capacity" as const, add: capAdd }] : []),
      ],
    });
  }

  return out;
}

export function specFor(
  s: GameState, assetId: string, type: CapitalProjectType,
): ProjectSpec | undefined {
  return projectCatalogue(s, assetId).find((p) => p.type === type);
}

/* =========================================================================
   7. Board positions, affordability and project capacity
========================================================================= */

const TYPE_INTEREST: Record<InfrastructureAssetType, string[]> = {
  stand: ["Supporters' Director", "Chairman"],
  pitch: ["Football Director"],
  shop: ["Commercial Director"],
  parking: ["Supporters' Director"],
  hospitality: ["Commercial Director"],
  concessions: ["Commercial Director", "Supporters' Director"],
  sanitary: ["Supporters' Director"],
  training: ["Football Director"],
  medical: ["Football Director"],
  offices: ["Commercial Director"],
  fanZone: ["Supporters' Director"],
};

/** Deterministic director stances on a costed proposal. */
export function directorPositions(
  s: GameState, assetId: string, spec: ProjectSpec,
): DirectorPosition[] {
  const a = assetById(s, assetId);
  const interested = a ? TYPE_INTEREST[a.type] : [];
  const reserve = s.finance?.minimumCashReserve ?? 0;
  const headroom = int(s.cash) - reserve - spec.cost;
  return (s.board?.directors ?? []).map((d) => {
    let score = 0;
    if (interested.includes(d.role)) score += 3;
    if (d.role === "Finance Director") {
      score += headroom > 0 ? 1 : -3;
      if (spec.cost > Math.max(1, int(s.cash)) * 0.4) score -= 2;
      if (spec.type === "minorRepair" || spec.type === "majorRepair") score += 1;
      if (d.traits.includes("frugal")) score -= 2;
    }
    if (d.role === "Football Director") {
      // Sporting quality is the canonical infrastructure signal the Football
      // Director judges sporting proposals against: weak facilities make the
      // case, strong ones make it less urgent.
      const sq = facilityModifiers(s).sportingQuality;
      const sporting = a?.type === "training" || a?.type === "medical" || a?.type === "pitch";
      if (sporting) score += sq < -5 ? 2 : sq > 10 ? -1 : 0;
    }
    if (d.role === "Chairman") {
      score += spec.major ? 1 : 0;
      if (d.traits.includes("ambitious")) score += 1;
    }
    if (d.traits.includes("traditionalist")) score += 1;
    if (d.traits.includes("populist") && (a?.type === "stand" || a?.type === "sanitary" || a?.type === "fanZone")) score += 2;
    if (headroom < 0) score -= 2;
    if (a && a.condition < 30 && REPAIR_TYPES.includes(spec.type)) score += 3;
    const stance: DirectorPosition["stance"] = score >= 2 ? "supports" : score <= -1 ? "opposes" : "neutral";
    const note = stance === "supports"
      ? `${d.name} backs the work.`
      : stance === "opposes"
        ? `${d.name} is against committing this money now.`
        : `${d.name} has no strong view.`;
    return { directorId: d.id, role: d.role, stance, note };
  });
}

export interface ProjectCapacity {
  majorActive: number; minorActive: number;
  majorLimit: number; minorLimit: number;
  canStartMajor: boolean; canStartMinor: boolean;
}

export const MAJOR_PROJECT_LIMIT = 1;
export const MINOR_PROJECT_LIMIT = 1;

export function projectCapacity(s: GameState): ProjectCapacity {
  const live = activeProjects(s);
  const majorActive = live.filter((p) => p.major).length;
  const minorActive = live.filter((p) => !p.major).length;
  return {
    majorActive, minorActive,
    majorLimit: MAJOR_PROJECT_LIMIT, minorLimit: MINOR_PROJECT_LIMIT,
    canStartMajor: majorActive < MAJOR_PROJECT_LIMIT,
    canStartMinor: minorActive < MINOR_PROJECT_LIMIT,
  };
}

export interface ProjectEvaluation {
  spec: ProjectSpec;
  affordability: ReturnType<typeof assessSpend>;
  capacityOk: boolean;
  assetFree: boolean;
  positions: DirectorPosition[];
  allowed: boolean;
  reason: string;
  /** Facilities budget headroom, for information only. Budgets never pay. */
  budgetRemaining: number;
}

/** The single evaluator used by BOTH the engine and the UI. */
export function evaluateProject(
  s: GameState, assetId: string, type: CapitalProjectType,
): ProjectEvaluation | null {
  const spec = specFor(s, assetId, type);
  if (!spec) return null;
  const cap = projectCapacity(s);
  const capacityOk = spec.major ? cap.canStartMajor : cap.canStartMinor;
  const assetFree = !projectForAsset(s, assetId);
  const affordability = assessSpend(s, spec.cost);
  const committed = activeProjects(s)
    .reduce((t, p) => t + Math.max(0, p.approvedBudget + p.costOverrun - p.spentToDate), 0);
  const budgetRemaining = int((s.finance?.budgets?.facilities ?? 0) - committed);

  let reason = "Ready to approve.";
  let allowed = true;
  if (!assetFree) { allowed = false; reason = "This asset already has work in progress."; }
  else if (!capacityOk) {
    allowed = false;
    reason = spec.major
      ? "The club can only run one major construction project at a time."
      : "A minor repair is already under way.";
  } else if (!affordability.allowed) { allowed = false; reason = affordability.reason; }
  else if (affordability.verdict === "affordableButRisky") { reason = affordability.reason; }

  return {
    spec, affordability, capacityOk, assetFree,
    positions: directorPositions(s, assetId, spec),
    allowed, reason, budgetRemaining,
  };
}

/* =========================================================================
   8. Project lifecycle
========================================================================= */

function pushRecord(
  s: GameState,
  r: Omit<InfrastructureRecord, "id" | "season" | "week" | "absoluteWeek">,
): InfrastructureRecord {
  const infra = s.infrastructure;
  const rec: InfrastructureRecord = {
    ...r,
    id: `IR-${String(infra.nextRecordId).padStart(5, "0")}`,
    season: s.season, week: s.week,
    absoluteWeek: absoluteWeek(s.season, s.week),
  };
  infra.nextRecordId += 1;
  infra.history.push(rec);
  return rec;
}

export const projectKey = (s: GameState, assetId: string, type: CapitalProjectType) =>
  `infra-project:${assetId}:${type}:s${s.season}:w${s.week}`;

/** Deterministic, decided once: delay weeks and cost overrun. */
export function riskOutcome(
  saveSeed: string, projectId: string, spec: ProjectSpec,
): { delayWeeks: number; overrunPct: number } {
  const rng = seededRng(saveSeed, "infra-risk", projectId);
  const r1 = rng();
  const r2 = rng();
  const severity = spec.risk / 100;
  let delayWeeks = 0;
  if (r1 < severity * 0.35) delayWeeks = Math.max(1, Math.round(spec.durationWeeks * 0.45));
  else if (r1 < severity * 0.8) delayWeeks = Math.max(1, Math.round(spec.durationWeeks * 0.18));
  let overrunPct = 0;
  if (r2 < severity * 0.3) overrunPct = 0.12 + severity * 0.18;
  else if (r2 < severity * 0.7) overrunPct = 0.04 + severity * 0.05;
  return { delayWeeks, overrunPct: Math.round(overrunPct * 1000) / 1000 };
}

export interface ProjectActionResult { ok: boolean; reason?: string; projectId?: string }

/** Approve and schedule a project. Mutates an owned working state. */
export function approveProjectInPlace(
  s: GameState, assetId: string, type: CapitalProjectType,
): ProjectActionResult {
  ensureInfrastructure(s);
  const evaluation = evaluateProject(s, assetId, type);
  if (!evaluation) return { ok: false, reason: "That project is not available on this asset." };
  if (!evaluation.allowed) return { ok: false, reason: evaluation.reason };

  const a = assetById(s, assetId)!;
  const spec = evaluation.spec;
  const infra = s.infrastructure;
  const id = `CP-${String(infra.nextProjectId).padStart(4, "0")}`;
  infra.nextProjectId += 1;

  const nowAbs = absoluteWeek(s.season, s.week);
  const risk = riskOutcome(s.saveSeed ?? "seed", id, spec);
  const overrun = int(spec.cost * risk.overrunPct);
  const instalments = Math.max(1, spec.durationWeeks);
  const per = Math.floor(spec.cost / instalments);
  const schedule: ProjectPayment[] = [];
  for (let i = 0; i < instalments; i++) {
    schedule.push({
      index: i,
      dueAbsoluteWeek: nowAbs + i,
      amount: i === instalments - 1 ? spec.cost - per * (instalments - 1) : per,
      paid: false, kind: "instalment",
    });
  }
  if (overrun > 0) {
    schedule.push({
      index: instalments,
      dueAbsoluteWeek: nowAbs + spec.durationWeeks + risk.delayWeeks - 1,
      amount: overrun, paid: false, kind: "overrun",
    });
  }

  const project: CapitalProject = {
    id, type, assetId,
    title: spec.title,
    description: spec.description,
    status: "approved",
    requestedBy: "Chairman",
    approvedAtAbsoluteWeek: nowAbs,
    startedAtAbsoluteWeek: nowAbs,
    expectedCompletionAbsoluteWeek: nowAbs + spec.durationWeeks + risk.delayWeeks,
    completedAtAbsoluteWeek: null,
    baseCost: spec.cost,
    approvedBudget: spec.cost,
    spentToDate: 0,
    paymentSchedule: schedule,
    durationWeeks: spec.durationWeeks,
    weeksWorked: 0,
    progress: 0,
    disruption: spec.disruption,
    riskProfile: spec.risk,
    effectsOnCompletion: spec.effects,
    delayWeeks: risk.delayWeeks,
    costOverrun: overrun,
    major: spec.major,
    directorPositions: evaluation.positions,
    history: [{ absoluteWeek: nowAbs, note: `Approved at £${spec.cost.toLocaleString("en-GB")}.` }],
    eventKey: `infra-project:${id}`,
  };
  infra.projects.push(project);
  a.activeProjectId = id;
  recomputeDerived(s);
  syncLegacyStadium(s);
  return { ok: true, projectId: id };
}

export function approveProject(
  s: GameState, assetId: string, type: CapitalProjectType,
): { state: GameState; ok: boolean; reason?: string; projectId?: string } {
  const ns = structuredClone(s);
  const r = approveProjectInPlace(ns, assetId, type);
  return r.ok ? { state: ns, ...r } : { state: s, ...r };
}

const RECORD_KIND: Partial<Record<CapitalProjectType, InfrastructureRecordKind>> = {
  minorRepair: "repair", majorRepair: "repair", refurbishment: "refurbishment",
  replacement: "redevelopment", capacityExpansion: "expansion",
  standRedevelopment: "redevelopment", facilityUpgrade: "newFacility",
};

function applyProjectEffects(s: GameState, p: CapitalProject): void {
  if (p.effectsApplied) return;
  const a = assetById(s, p.assetId);
  if (!a) return;
  for (const e of p.effectsOnCompletion) {
    switch (e.kind) {
      case "condition":
        a.condition = clamp(
          e.to != null ? e.to : a.condition + (e.add ?? 0), 0, a.maximumCondition);
        break;
      case "maximumCondition":
        a.maximumCondition = clamp(a.maximumCondition + e.add, 50, 100);
        a.condition = Math.min(a.condition, a.maximumCondition);
        break;
      case "capacity":
        a.capacity = Math.max(0, a.capacity + e.add);
        break;
      case "level":
        a.level = clamp(a.level + e.add, 1, ASSET_CONFIG[a.type].maxLevel);
        break;
      case "quality":
        a.qualityRating = clamp(a.qualityRating + e.add, 0, 100);
        a.maintenanceRequirement = clamp(a.maintenanceRequirement - e.add * 0.3, 10, 100);
        break;
      case "metadata":
        a.metadata[e.key] = e.to != null
          ? e.to
          : clamp((a.metadata[e.key] ?? 0) + (e.add ?? 0), 0, 100_000);
        break;
      case "refurbish":
        a.lastRefurbishedSeason = s.season;
        break;
      case "resetAge":
        a.ageYears = 0;
        a.openedSeason = s.season;
        break;
    }
  }
  p.effectsApplied = true;
}

/** Advance every live project one week: payments, progress, completion. */
function advanceProjects(s: GameState): void {
  const infra = s.infrastructure;
  const nowAbs = absoluteWeek(s.season, s.week);

  for (const p of infra.projects) {
    if (p.status !== "approved" && p.status !== "active" && p.status !== "delayed") continue;
    const a = assetById(s, p.assetId);
    if (!a) continue;

    // --- Payments due this week ---
    let blocked = false;
    for (const pay of p.paymentSchedule) {
      if (pay.paid || pay.dueAbsoluteWeek > nowAbs) continue;
      if (int(s.cash) < pay.amount) { blocked = true; break; }
      const posted = postEntry(s, {
        category: "Facilities",
        subcategory: subcategoryFor(p.type, pay.kind),
        description: pay.kind === "overrun"
          ? `${p.title} — cost overrun`
          : `${p.title} — payment ${pay.index + 1}`,
        amount: pay.amount, direction: "expense", sourceSystem: "facilities",
        linkedEntityId: p.id,
        dedupeKey: `infra-pay:${p.id}:${pay.kind}:${pay.index}`,
        metadata: { legacyBucket: "maintenance", projectId: p.id, assetId: p.assetId },
      });
      pay.paid = true;
      if (posted) p.spentToDate += pay.amount;
      if (pay.kind === "overrun") {
        p.history.push({ absoluteWeek: nowAbs, note: `Cost overrun of £${pay.amount.toLocaleString("en-GB")} booked.` });
        pushRecord(s, {
          kind: "overrun", assetId: a.id, assetName: a.name, projectId: p.id,
          description: `${p.title} ran over budget`, cost: pay.amount,
          capacityBefore: a.capacity, capacityAfter: a.capacity,
          conditionBefore: a.condition, conditionAfter: a.condition,
        });
      }
    }

    if (blocked) {
      if (p.status !== "delayed") {
        p.history.push({ absoluteWeek: nowAbs, note: "Work paused — the club could not fund this week's payment." });
        pushRecord(s, {
          kind: "delay", assetId: a.id, assetName: a.name, projectId: p.id,
          description: `${p.title} delayed by cash shortage`, cost: 0,
          capacityBefore: a.capacity, capacityAfter: a.capacity,
          conditionBefore: a.condition, conditionAfter: a.condition,
        });
      }
      p.status = "delayed";
      // Everything slips one week, including the remaining payment schedule.
      p.expectedCompletionAbsoluteWeek = (p.expectedCompletionAbsoluteWeek ?? nowAbs) + 1;
      for (const pay of p.paymentSchedule) if (!pay.paid) pay.dueAbsoluteWeek += 1;
      continue;
    }

    // --- Progress ---
    p.status = "active";
    p.weeksWorked += 1;
    const total = p.durationWeeks + p.delayWeeks;
    p.progress = clamp(Math.round((p.weeksWorked / Math.max(1, total)) * 100), 0, 100);
    if (p.weeksWorked === p.durationWeeks && p.delayWeeks > 0) {
      p.history.push({ absoluteWeek: nowAbs, note: `Programme running ${p.delayWeeks} week(s) late.` });
      pushRecord(s, {
        kind: "delay", assetId: a.id, assetName: a.name, projectId: p.id,
        description: `${p.title} delayed by ${p.delayWeeks} week(s)`, cost: 0,
        capacityBefore: a.capacity, capacityAfter: a.capacity,
        conditionBefore: a.condition, conditionAfter: a.condition,
      });
    }

    // --- Completion: only when the work AND every payment are done ---
    const allPaid = p.paymentSchedule.every((x) => x.paid);
    if (p.weeksWorked >= total && allPaid) {
      const capBefore = a.capacity;
      const condBefore = a.condition;
      applyProjectEffects(s, p);
      p.status = "completed";
      p.progress = 100;
      p.completedAtAbsoluteWeek = nowAbs;
      p.history.push({ absoluteWeek: nowAbs, note: `Completed. Total cost £${(p.spentToDate).toLocaleString("en-GB")}.` });
      a.activeProjectId = null;
      pushRecord(s, {
        kind: RECORD_KIND[p.type] ?? "repair",
        assetId: a.id, assetName: a.name, projectId: p.id,
        description: `${p.title} completed`, cost: p.spentToDate,
        capacityBefore: capBefore, capacityAfter: a.capacity,
        conditionBefore: Math.round(condBefore), conditionAfter: Math.round(a.condition),
      });
      if (a.capacity !== capBefore) {
        pushRecord(s, {
          kind: "capacityChange", assetId: a.id, assetName: a.name, projectId: p.id,
          description: `${a.name} capacity ${capBefore.toLocaleString("en-GB")} → ${a.capacity.toLocaleString("en-GB")}`,
          cost: 0, capacityBefore: capBefore, capacityAfter: a.capacity,
          conditionBefore: Math.round(condBefore), conditionAfter: Math.round(a.condition),
        });
      }
    }
  }
}

function subcategoryFor(type: CapitalProjectType, kind: ProjectPayment["kind"]): string {
  if (kind === "overrun") return "Project overrun";
  if (kind === "cancellation") return "Cancellation penalty";
  switch (type) {
    case "minorRepair": return "Minor repair";
    case "majorRepair": return "Major repair";
    case "refurbishment": return "Refurbishment";
    case "replacement":
    case "standRedevelopment": return "Redevelopment";
    case "capacityExpansion": return "Stadium expansion";
    case "facilityUpgrade": return "New facility";
    default: return "Stadium improvement";
  }
}

export const CANCELLATION_PENALTY_PCT = 0.15;

export function cancelProjectInPlace(s: GameState, projectId: string): ProjectActionResult {
  ensureInfrastructure(s);
  const p = projectById(s, projectId);
  if (!p) return { ok: false, reason: "No such project." };
  if (p.status === "completed") return { ok: false, reason: "That project has already completed." };
  if (p.status === "cancelled") return { ok: true, projectId }; // idempotent

  const a = assetById(s, p.assetId);
  const remaining = p.paymentSchedule.filter((x) => !x.paid).reduce((t, x) => t + x.amount, 0);
  const penalty = int(remaining * CANCELLATION_PENALTY_PCT);
  const nowAbs = absoluteWeek(s.season, s.week);

  if (penalty > 0 && int(s.cash) >= penalty) {
    postEntry(s, {
      category: "Facilities", subcategory: "Cancellation penalty",
      description: `${p.title} — cancellation penalty`,
      amount: penalty, direction: "expense", sourceSystem: "facilities",
      linkedEntityId: p.id, dedupeKey: `infra-cancel:${p.id}`,
      metadata: { legacyBucket: "maintenance", projectId: p.id },
    });
    p.spentToDate += penalty;
  }
  // Unpaid instalments are simply never posted. Spent money is not refunded.
  for (const pay of p.paymentSchedule) if (!pay.paid) pay.amount = 0;
  p.status = "cancelled";
  p.completedAtAbsoluteWeek = nowAbs;
  p.history.push({ absoluteWeek: nowAbs, note: `Cancelled. £${p.spentToDate.toLocaleString("en-GB")} already spent is not recoverable.` });
  if (a) {
    // Cancelled work leaves the asset knocked about but operational again.
    a.condition = clamp(Math.round((a.condition - 4) * 100) / 100, 0, a.maximumCondition);
    a.activeProjectId = null;
    pushRecord(s, {
      kind: "cancellation", assetId: a.id, assetName: a.name, projectId: p.id,
      description: `${p.title} cancelled`, cost: penalty,
      capacityBefore: a.capacity, capacityAfter: a.capacity,
      conditionBefore: Math.round(a.condition + 4), conditionAfter: Math.round(a.condition),
    });
  }
  s.fanHappiness = clamp(int((s.fanHappiness ?? 60) - (p.major ? 3 : 1)), 0, 100);
  recomputeDerived(s);
  syncLegacyStadium(s);
  return { ok: true, projectId };
}

export function cancelProject(s: GameState, projectId: string): { state: GameState; ok: boolean; reason?: string } {
  const ns = structuredClone(s);
  const r = cancelProjectInPlace(ns, projectId);
  return r.ok ? { state: ns, ok: true } : { state: s, ok: false, reason: r.reason };
}

/* =========================================================================
   9. Emergency closures and reopening
========================================================================= */

export function closeAssetInPlace(s: GameState, assetId: string): ProjectActionResult {
  ensureInfrastructure(s);
  const a = assetById(s, assetId);
  if (!a) return { ok: false, reason: "No such asset." };
  if (a.status === "closed") return { ok: true };
  a.status = "closed";
  a.usableCapacity = 0;
  pushRecord(s, {
    kind: "emergencyClosure", assetId: a.id, assetName: a.name, projectId: null,
    description: `${a.name} closed on safety grounds`, cost: 0,
    capacityBefore: a.capacity, capacityAfter: 0,
    conditionBefore: Math.round(a.condition), conditionAfter: Math.round(a.condition),
  });
  syncLegacyStadium(s);
  return { ok: true };
}

export function reopenAssetInPlace(s: GameState, assetId: string): ProjectActionResult {
  ensureInfrastructure(s);
  const a = assetById(s, assetId);
  if (!a) return { ok: false, reason: "No such asset." };
  if (a.status !== "closed") return { ok: true };
  if (a.condition < 20) return { ok: false, reason: "Condition is still unsafe — repair it first." };
  a.status = statusForCondition(a.condition);
  recomputeDerived(s);
  pushRecord(s, {
    kind: "reopening", assetId: a.id, assetName: a.name, projectId: null,
    description: `${a.name} reopened to supporters`, cost: 0,
    capacityBefore: 0, capacityAfter: a.usableCapacity,
    conditionBefore: Math.round(a.condition), conditionAfter: Math.round(a.condition),
  });
  syncLegacyStadium(s);
  return { ok: true };
}

/* =========================================================================
   10. Weekly tick
========================================================================= */

/**
 * The club's physical week. Called once from advanceWeek(), before matchday,
 * so the fixture is played against the state the player actually owns.
 */
export function runInfrastructureWeek(s: GameState): void {
  ensureInfrastructure(s);
  const nowAbs = absoluteWeek(s.season, s.week);
  const infra = s.infrastructure;
  if (infra.lastTickAbsoluteWeek === nowAbs) {
    // Already ticked this week (reload / replay). Costs are dedupe-guarded
    // anyway, but progress and deterioration must not run twice.
    postInfrastructureWeek(s);
    return;
  }
  infra.lastTickAbsoluteWeek = nowAbs;

  applyDeterioration(s);
  advanceProjects(s);
  recomputeDerived(s);

  // Critical assets shut themselves down; recovered ones come back.
  for (const a of infra.assets) {
    if (a.condition <= 0 && a.status !== "closed") closeAssetInPlace(s, a.id);
  }

  recomputeDerived(s);
  syncLegacyStadium(s);
  postInfrastructureWeek(s);

  // Supporters notice the state of the ground.
  const mods = facilityModifiers(s);
  if (mods.fanHappiness !== 0) {
    s.fanHappiness = clamp(
      Math.round((s.fanHappiness ?? 60) + clamp(mods.fanHappiness * 0.06, -1.2, 0.6)),
      0, 100,
    );
  }
}

/** Season rollover hook: ages assets by one year. Idempotent per season. */
export function rollInfrastructureToNewSeason(s: GameState): void {
  ensureInfrastructure(s);
  if (s.infrastructure.seededSeason === s.season) return;
  s.infrastructure.seededSeason = s.season;
  recomputeDerived(s);
  syncLegacyStadium(s);
}

/* =========================================================================
   11. Snapshot for the UI (derived, never stored)
========================================================================= */

export interface InfrastructureSnapshot {
  capacity: number;
  usableCapacity: number;
  averageStadiumCondition: number;
  averageAssetCondition: number;
  pitchCondition: number;
  maintenancePolicy: MaintenancePolicy;
  weeklyMaintenance: number;
  weeklyOperating: number;
  activeProjects: CapitalProject[];
  commitments: number;
  criticalAssets: InfrastructureAsset[];
  riskLabel: string;
  nextCompletionAbsoluteWeek: number | null;
  totalCapitalSpend: number;
  modifiers: FacilityModifiers;
}

export function totalCapitalSpend(s: GameState): number {
  return (s.financeLedger ?? [])
    .filter((e) => e.sourceSystem === "facilities" && e.direction === "expense" &&
      e.subcategory !== "Routine maintenance" && e.subcategory !== "Training ground")
    .reduce((t, e) => t + e.amount, 0);
}

export function infrastructureSnapshot(s: GameState): InfrastructureSnapshot {
  const live = activeProjects(s);
  const crit = criticalAssets(s);
  const commitments = live.reduce(
    (t, p) => t + Math.max(0, p.approvedBudget + p.costOverrun - p.spentToDate), 0);
  const completions = live
    .map((p) => p.expectedCompletionAbsoluteWeek)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  const avg = averageAssetCondition(s);
  return {
    capacity: stadiumCapacity(s),
    usableCapacity: stadiumUsableCapacity(s),
    averageStadiumCondition: averageStadiumCondition(s),
    averageAssetCondition: avg,
    pitchCondition: assetById(s, "pitch")?.condition ?? 0,
    maintenancePolicy: s.infrastructure?.maintenancePolicy ?? "Standard",
    weeklyMaintenance: weeklyMaintenanceCost(s),
    weeklyOperating: weeklyOperatingCost(s),
    activeProjects: live,
    commitments,
    criticalAssets: crit,
    riskLabel: crit.length ? "Critical" : avg < 45 ? "High" : avg < 62 ? "Elevated" : "Sound",
    nextCompletionAbsoluteWeek: completions[0] ?? null,
    totalCapitalSpend: totalCapitalSpend(s),
    modifiers: facilityModifiers(s),
  };
}
