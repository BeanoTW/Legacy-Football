/* =========================================================================
   Stadium UX: one presentation contract for Ground Studio and Facilities
   -------------------------------------------------------------------------
   Pure read-only helpers. Nothing here mutates state, prices anything or
   decides whether work may start: costs, availability and effects all come
   from infrastructure.ts (projectCatalogue / evaluateProject). This module
   only turns that canonical data into what a player needs to see:

     what I own → its condition → what I can build next → what it costs →
     why I can or can't build it.
========================================================================= */

import type { CapitalProject, CapitalProjectType, GameState, InfrastructureAsset } from "./types";
import {
  ASSET_CONFIG,
  BAND_COST,
  BAND_LABEL,
  BAND_ORDER,
  activeProjects,
  assetById,
  conditionBand,
  cornerStands,
  evaluateProject,
  facilityDependencyStatus,
  projectCatalogue,
  stands,
  type ConditionBand,
  type ProjectEvaluation,
  type ProjectSpec,
} from "./infrastructure";
import {
  STAND_VARIANTS,
  groundDesign,
  levelAfterProject,
  roofOptionsFor,
  standBuild,
  standStructuralFootprint,
  type CornerSlot,
  type StandSide,
} from "./groundIdentity";
import { absoluteWeek } from "./time";
import { assessSpend } from "./finance";

/* ------------------------------------------------------------------ */
/* Condition                                                           */
/* ------------------------------------------------------------------ */

export interface ConditionSummary {
  band: ConditionBand;
  label: string;
  /** Rounded condition, 0-100. */
  pct: number;
  /** 5 = excellent … 1 = critical, 0 = closed. */
  segments: number;
  /** One short line: what this condition costs the club. */
  consequence: string;
  /** Worn or worse: worth the player's attention. */
  attention: boolean;
  /** Poor or worse: actively costing places. */
  urgent: boolean;
}

const SEGMENTS: Record<ConditionBand, number> = { excellent: 5, good: 4, worn: 3, poor: 2, critical: 1, closed: 0 };

export function conditionSummary(asset: Pick<InfrastructureAsset, "type" | "condition" | "status" | "capacity">): ConditionSummary {
  const band: ConditionBand = asset.status === "closed" ? "closed" : conditionBand(asset.condition);
  const capacityFactor = ASSET_CONFIG[asset.type].capacityBands[BAND_ORDER.indexOf(band)];
  const lostPlaces = Math.round((1 - capacityFactor) * 100);
  const costUp = Math.round((BAND_COST[band] - 1) * 100);
  const parts: string[] = [];
  if (band === "closed") parts.push("Closed to supporters");
  else {
    const spectators = asset.type === "stand" || asset.type === "cornerStand";
    if (asset.capacity > 0) parts.push(lostPlaces > 0 ? (spectators ? `${lostPlaces}% of places unusable` : `${lostPlaces}% of capacity lost`) : "Full capacity");
    if (costUp > 0) parts.push(`running costs +${costUp}%`);
    if (band === "critical") parts.push("closure risk");
    if (!parts.length) parts.push(band === "excellent" ? "As good as new" : "Working normally");
  }
  const sentence = parts.join(" · ");
  return {
    band,
    label: BAND_LABEL[band],
    pct: Math.round(asset.condition),
    segments: SEGMENTS[band],
    consequence: sentence.charAt(0).toUpperCase() + sentence.slice(1),
    attention: band === "worn" || band === "poor" || band === "critical" || band === "closed",
    urgent: band === "poor" || band === "critical" || band === "closed",
  };
}

/* ------------------------------------------------------------------ */
/* Why a project can't start                                           */
/* ------------------------------------------------------------------ */

export type LockKind = "asset" | "club" | "dependency" | "cash" | "reserve" | "other";

export interface LockReason {
  kind: LockKind;
  /** Money involved (shortfall or reserve), when the reason is financial. */
  amount?: number;
  /** Plain words when the reason is not about money. */
  text: string;
}

/**
 * The single reason a project can't go ahead, most actionable first.
 * Pass `cost` when the real price differs from the catalogue price (a stand
 * build chosen in the planner): the lock is then judged at that price.
 */
export function lockReason(
  state: GameState,
  assetId: string,
  spec: ProjectSpec,
  evaluation: ProjectEvaluation | null,
  cost = spec.cost,
): LockReason | null {
  if (!evaluation) return { kind: "other", text: "Not available here" };
  const asset = assetById(state, assetId);
  // A structural need outlasts any temporary block, so it is the reason to show.
  if (spec.type === "facilityUpgrade" && asset) {
    const dependency = facilityNeed(state, asset);
    if (dependency) return { kind: "dependency", text: dependency };
  }
  if (!evaluation.assetFree) {
    const where = asset?.type === "cornerStand" ? "corner" : asset?.type === "stand" ? "stand" : "facility";
    return { kind: "asset", text: `Work already under way on this ${where}` };
  }
  if (!evaluation.capacityOk) {
    const blocking = activeProjects(state).find((project) => project.major === spec.major);
    const name = blocking ? assetById(state, blocking.assetId)?.name : undefined;
    const left = blocking ? projectStatus(state, blocking).weeksLeft : 0;
    return {
      kind: "club",
      text: spec.major
        ? name ? `${name} works under way · ${weeksLabel(left)} left` : "Another major project is under way"
        : "A repair is already under way",
    };
  }
  // The canonical evaluator decides; at a different (planned) price, the
  // canonical spend check decides. This module only words the outcome.
  const spend = cost === spec.cost ? evaluation.affordability : assessSpend(state, cost);
  const blocked = cost === spec.cost ? !evaluation.allowed : !spend.allowed;
  if (!blocked) return null;
  const cash = Math.round(state.cash);
  const reserve = state.finance?.minimumCashReserve ?? 0;
  if (cost > cash) return { kind: "cash", amount: cost - cash, text: `${money(cost - cash)} short` };
  if (reserve > 0 && cash - cost < reserve) return { kind: "reserve", amount: reserve, text: `Would break the ${money(reserve)} cash reserve` };
  return { kind: "other", text: cost === spec.cost ? evaluation.reason : spend.reason };
}

/** Compact money for lock text only; screens format real prices themselves. */
function money(n: number): string {
  const a = Math.abs(Math.round(n));
  if (a >= 1_000_000) return `£${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}m`;
  if (a >= 10_000) return `£${Math.round(a / 1_000)}k`;
  return `£${a.toLocaleString("en-GB")}`;
}

export const weeksLabel = (weeks: number) => `${weeks} wk${weeks === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------ */
/* Live projects                                                       */
/* ------------------------------------------------------------------ */

export interface ProjectStatus {
  progress: number;
  weeksLeft: number;
  /** Paused this week because a payment could not be made. */
  paused: boolean;
  /** Running beyond its planned programme. */
  late: boolean;
  spent: number;
  budget: number;
  /** Places the work adds when it completes (0 if none). */
  addsPlaces: number;
  /** Share of the asset's places closed while it runs (0-100). */
  closedPct: number;
}

export function projectStatus(state: GameState, project: CapitalProject): ProjectStatus {
  const now = absoluteWeek(state.season, state.week);
  const capacity = project.effectsOnCompletion.find((effect) => effect.kind === "capacity") as { add: number } | undefined;
  return {
    progress: Math.max(0, Math.min(100, Math.round(project.progress))),
    weeksLeft: Math.max(0, (project.expectedCompletionAbsoluteWeek ?? now) - now),
    paused: project.status === "delayed",
    late: (project.expectedCompletionAbsoluteWeek ?? 0) > (project.approvedAtAbsoluteWeek ?? now) + project.durationWeeks,
    spent: project.spentToDate,
    budget: project.approvedBudget + project.costOverrun,
    addsPlaces: capacity?.add ?? 0,
    closedPct: Math.round((1 - project.disruption.capacityFactor) * 100),
  };
}

export function activeProjectFor(state: GameState, assetId: string): CapitalProject | undefined {
  return activeProjects(state).find((project) => project.assetId === assetId);
}

/** "North Stand — extend stand (+750) (traditional all-seater)" → "Extend stand". */
export function projectShortTitle(project: Pick<CapitalProject, "title" | "type">, assetName?: string): string {
  let title = project.title;
  if (assetName) title = title.replace(`${assetName} — `, "");
  else title = title.replace(/^.*? — /, "");
  title = title.replace(/\s*\([^)]*\)/g, "").trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/* ------------------------------------------------------------------ */
/* What a stand is                                                     */
/* ------------------------------------------------------------------ */

export interface StandOwnership {
  capacity: number;
  usable: number;
  level: number;
  maxLevel: number;
  levelName: string;
  standing: string;
  roof: string;
  variant: string;
  span: number;
  depth: number;
  /** 0-100, if the save records it. */
  roofCondition: number | null;
}

export function standOwnership(state: GameState, asset: InfrastructureAsset): StandOwnership {
  const side = asset.location as StandSide;
  const design = groundDesign(state).stands[side];
  const build = standBuild(state, asset.id, asset.level);
  const variant = build.variant ?? "traditional";
  const footprint = standStructuralFootprint(side, asset.capacity, design?.level ?? asset.level, variant);
  const roof = !design || design.roof === "open"
    ? "Uncovered"
    : design.form === "shelter"
      ? "Basic cover"
      : design.roof === "twoTier"
        ? "Two tiers"
        : design.roof === "cantilever"
          ? "Cantilever roof"
          : "Pitched roof";
  const standing = (design?.standing ?? build.standing) === "terrace"
    ? "Terrace"
    : (design?.standing ?? build.standing) === "safeStanding"
      ? "Safe standing"
      : "All-seater";
  return {
    capacity: asset.capacity,
    usable: asset.usableCapacity,
    level: asset.level,
    maxLevel: ASSET_CONFIG.stand.maxLevel,
    levelName: ASSET_CONFIG.stand.levels[asset.level - 1] ?? `Level ${asset.level}`,
    standing,
    roof,
    variant: STAND_VARIANTS.find((option) => option.id === variant)?.label ?? "Traditional",
    span: footprint.span,
    depth: footprint.depth,
    roofCondition: typeof asset.metadata?.roofQuality === "number" ? Math.round(asset.metadata.roofQuality) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Development ladders                                                 */
/* ------------------------------------------------------------------ */

export interface LadderStep {
  level: number;
  name: string;
  /** How the stand is covered at this stage. */
  roof: string;
  /** Silhouette key the UI draws. */
  shape: "cover" | "pitched" | "cantilever" | "twoTier" | "landmark" | "empty" | "cornerSmall" | "cornerMid" | "cornerFull";
}

/** Roofs are not a side project: each structural stage changes how the stand is covered. */
export const STAND_LADDER: LadderStep[] = ASSET_CONFIG.stand.levels.map((name, index) => {
  const level = index + 1;
  const roofs = roofOptionsFor(level).map((option) => option.id);
  const shape: LadderStep["shape"] = level >= 5 ? "landmark" : roofs.includes("twoTier") ? "twoTier" : roofs.includes("cantilever") ? "cantilever" : level >= 2 ? "pitched" : "cover";
  const roof = shape === "cover" ? "Basic cover" : shape === "pitched" ? "Proper roof" : shape === "cantilever" ? "Cantilever unlocks" : shape === "twoTier" ? "Two tiers unlock" : "Landmark scale";
  return { level, name, roof, shape };
});

export const CORNER_LADDER: LadderStep[] = [
  { level: 0, name: "Empty", roof: "No places", shape: "empty" },
  ...ASSET_CONFIG.cornerStand.levels.map((name, index): LadderStep => ({
    level: index + 1,
    name,
    roof: index === 0 ? "Terrace infill" : index === 1 ? "Covered infill" : "Fully enclosed",
    shape: index === 0 ? "cornerSmall" : index === 1 ? "cornerMid" : "cornerFull",
  })),
];

/* ------------------------------------------------------------------ */
/* Project choices, sorted into the four ideas                         */
/* ------------------------------------------------------------------ */

export interface ProjectOption {
  spec: ProjectSpec;
  evaluation: ProjectEvaluation | null;
  lock: LockReason | null;
  /** Short name without the asset prefix, e.g. "Extend stand". */
  title: string;
  addsPlaces: number;
  /** Level the asset reaches on completion. */
  toLevel: number;
  /** Condition after the work, if the work restores condition. */
  conditionAfter: number | null;
  /** The player chooses the build (variant, standing, roof) before approving. */
  choosesBuild: boolean;
}

const REPAIRS: CapitalProjectType[] = ["minorRepair", "majorRepair", "refurbishment", "replacement"];
const LEVEL_RAISING = new Set<CapitalProjectType>(["capacityExpansion", "replacement", "standRedevelopment"]);

function optionFor(state: GameState, asset: InfrastructureAsset, spec: ProjectSpec): ProjectOption {
  const evaluation = evaluateProject(state, asset.id, spec.type);
  let conditionAfter: number | null = null;
  let toLevel = asset.level;
  let addsPlaces = 0;
  for (const effect of spec.effects) {
    if (effect.kind === "condition") {
      const base = conditionAfter ?? asset.condition;
      conditionAfter = Math.min(asset.maximumCondition, Math.max(0, effect.to != null ? effect.to : base + (effect.add ?? 0)));
    }
    if (effect.kind === "level") toLevel = Math.min(ASSET_CONFIG[asset.type].maxLevel, asset.level + effect.add);
    if (effect.kind === "capacity") addsPlaces += effect.add;
  }
  if (asset.type === "stand" && LEVEL_RAISING.has(spec.type)) toLevel = levelAfterProject(spec.type, asset.level);
  const short = spec.title.replace(`${asset.name} — `, "").replace(/\s*\(\+[\d,]+\)/, "").trim();
  return {
    spec,
    evaluation,
    lock: lockReason(state, asset.id, spec, evaluation),
    title: short.charAt(0).toUpperCase() + short.slice(1),
    addsPlaces,
    toLevel,
    conditionAfter: conditionAfter == null ? null : Math.round(conditionAfter),
    choosesBuild: asset.type === "stand" && LEVEL_RAISING.has(spec.type),
  };
}

/**
 * Maintain: condition work only. Refurbishment is always in the catalogue,
 * so it is only surfaced once it would make a visible difference.
 *
 * Deliberately not here:
 *  - a stand's Replacement raises its level and needs a chosen build, so it
 *    is a rebuild and lives in Develop;
 *  - Roof Upgrade: it only sets roofQuality, which nothing in the simulation
 *    reads, so offering it would sell the player nothing (see handoff notes).
 */
export function maintenanceOptions(state: GameState, asset: InfrastructureAsset): ProjectOption[] {
  const catalogue = projectCatalogue(state, asset.id);
  const band = conditionBand(asset.condition);
  const tired = band !== "excellent" || asset.ageYears >= 30;
  return catalogue
    .filter((spec) => REPAIRS.includes(spec.type))
    .filter((spec) => !(asset.type === "stand" && spec.type === "replacement"))
    .filter((spec) => spec.type !== "refurbishment" || tired)
    .map((spec) => optionFor(state, asset, spec));
}

/** Develop: physical growth only. */
export function developmentOptions(state: GameState, asset: InfrastructureAsset): { next: ProjectOption | null; others: ProjectOption[] } {
  const catalogue = projectCatalogue(state, asset.id);
  const growth: CapitalProjectType[] = asset.type === "cornerStand" ? ["cornerBuild", "cornerExpansion"] : ["capacityExpansion", "standRedevelopment", "replacement"];
  const options = catalogue.filter((spec) => growth.includes(spec.type)).map((spec) => optionFor(state, asset, spec));
  // The next stage on the ladder is the headline; a full rebuild is the alternative.
  const next = options.find((option) => option.spec.type === "capacityExpansion" || option.spec.type === "cornerBuild" || option.spec.type === "cornerExpansion") ?? null;
  return { next, others: options.filter((option) => option !== next) };
}

/** The stage verb the player sees for a stand's next capacity step. */
export function nextStageVerb(level: number): string {
  return level <= 2 ? "Extend" : level <= 4 ? "Enlarge" : "Expand";
}

/* ------------------------------------------------------------------ */
/* The whole ground at a glance                                        */
/* ------------------------------------------------------------------ */

export interface ComponentStatus {
  id: string;
  assetId?: string;
  name: string;
  capacity: number;
  condition?: ConditionSummary;
  works: boolean;
  /** Corners only: no spectator structure yet. */
  empty: boolean;
}

export const STAND_SIDES: StandSide[] = ["W", "E", "N", "S"];
export const CORNER_SLOTS: CornerSlot[] = ["NW", "NE", "SW", "SE"];

export function groundComponents(state: GameState): Record<string, ComponentStatus> {
  const out: Record<string, ComponentStatus> = {};
  const live = new Set(activeProjects(state).map((project) => project.assetId));
  for (const asset of stands(state)) {
    const id = `stand:${asset.location}`;
    out[id] = { id, assetId: asset.id, name: asset.name, capacity: asset.capacity, condition: conditionSummary(asset), works: live.has(asset.id), empty: false };
  }
  for (const asset of cornerStands(state)) {
    const id = `corner:${asset.location}`;
    const empty = asset.capacity <= 0;
    out[id] = { id, assetId: asset.id, name: asset.name, capacity: asset.capacity, condition: empty ? undefined : conditionSummary(asset), works: live.has(asset.id), empty };
  }
  const pitch = assetById(state, "pitch");
  if (pitch) out.pitch = { id: "pitch", assetId: pitch.id, name: "Pitch", capacity: 0, condition: conditionSummary(pitch), works: live.has(pitch.id), empty: false };
  return out;
}

/** Facility upgrade dependency in a few words, or null when met (rule owned by infrastructure.ts). */
export function facilityNeed(state: GameState, asset: InfrastructureAsset): string | null {
  const dependency = facilityDependencyStatus(state, asset);
  if (dependency.met || !dependency.text) return null;
  if (asset.type === "hospitality") return `Needs a ${ASSET_CONFIG.stand.levels[2]}`;
  if (asset.type === "concessions" || asset.type === "sanitary") return `Needs a ${ASSET_CONFIG.stand.levels[1]}`;
  if (asset.type === "shop") return "Needs a 3,000-place ground";
  return dependency.text;
}

/** The stand closest to meeting a facility's structural need: the one to develop. */
export function standToDevelopFor(state: GameState, asset: InfrastructureAsset): InfrastructureAsset | null {
  if (!facilityNeed(state, asset)) return null;
  const list = [...stands(state)].sort((a, b) => b.level - a.level || b.capacity - a.capacity);
  return list[0] ?? null;
}
