/* Actions for the ground identity. Imports infrastructure and finance, so it
   is used by the UI only (infrastructure.ts itself only reads
   groundIdentity.ts). All money moves through finance.postEntry. */

import type { CapitalProjectType, GameState } from "./types";
import { approveProjectInPlace, assetById, projectById, recomputeDerived, syncLegacyStadium } from "./infrastructure";
import { assessSpend, postEntry } from "./finance";
import {
  buildCapacityMultiplier,
  buildCostMultiplier,
  cosmeticCost,
  DEFAULT_GROUND_IDENTITY,
  groundIdentity,
  LEVEL_RAISING_TYPES,
  levelAfterProject,
  type GroundIdentityState,
  type StandBuild,
} from "./groundIdentity";

export interface GroundActionResult {
  state: GameState;
  ok: boolean;
  reason: string;
}

export const isLevelRaising = (type: CapitalProjectType) => (LEVEL_RAISING_TYPES as readonly string[]).includes(type);

/** The project's cost once the chosen build is applied. */
export function buildQuote(s: GameState, baseCost: number, assetId: string, type: CapitalProjectType, build: StandBuild) {
  const asset = assetById(s, assetId);
  const resulting = levelAfterProject(type, asset?.level ?? 1);
  const multiplier = buildCostMultiplier(build, resulting);
  return { cost: Math.round(baseCost * multiplier), multiplier, resultingLevel: resulting };
}

/** Approve a level-raising stand project with the club's chosen build. */
export function approveStandBuild(s: GameState, assetId: string, type: CapitalProjectType, build: StandBuild): GroundActionResult {
  const asset = assetById(s, assetId);
  if (!asset || asset.type !== "stand") return { state: s, ok: false, reason: "Builds are chosen for stands only." };
  if (!isLevelRaising(type)) return { state: s, ok: false, reason: "That work doesn't change how the stand is built." };

  const next = structuredClone(s);
  const result = approveProjectInPlace(next, assetId, type);
  if (!result.ok || !result.projectId) return { state: s, ok: false, reason: result.reason ?? "Unable to approve the project." };
  const project = projectById(next, result.projectId)!;
  const resulting = levelAfterProject(type, asset.level);
  const costMultiplier = buildCostMultiplier(build, resulting);
  const capacityMultiplier = buildCapacityMultiplier(build, resulting);

  // A dearer build must still be affordable at its real price.
  const newCost = Math.round(project.baseCost * costMultiplier);
  if (newCost > project.baseCost) {
    const check = assessSpend(s, newCost);
    if (!check.allowed) return { state: s, ok: false, reason: `This build costs £${newCost.toLocaleString("en-GB")}: ${check.reason}` };
  }

  // Rescale the payment schedule (nothing has been paid yet at approval).
  const scale = newCost / Math.max(1, project.baseCost);
  let allocated = 0;
  const instalments = project.paymentSchedule.filter((pay) => pay.kind === "instalment");
  instalments.forEach((pay, index) => {
    pay.amount = index === instalments.length - 1 ? newCost - allocated : Math.floor(pay.amount * scale);
    allocated += index === instalments.length - 1 ? 0 : pay.amount;
  });
  for (const pay of project.paymentSchedule) if (pay.kind === "overrun") pay.amount = Math.round(pay.amount * scale);
  project.costOverrun = Math.round(project.costOverrun * scale);
  project.baseCost = newCost;
  project.approvedBudget = newCost;

  // Capacity the work adds follows the build; two tiers add hospitality.
  project.effectsOnCompletion = project.effectsOnCompletion.map((effect) =>
    effect.kind === "capacity" ? { ...effect, add: Math.round((effect.add * capacityMultiplier) / 50) * 50 } : effect,
  );
  if (resulting >= 4 && build.roof === "twoTier") {
    project.effectsOnCompletion.push({ kind: "metadata", key: "hospitalityCapacity", add: 150 });
  }
  const label = `${build.standing === "terrace" ? "covered terrace" : build.standing === "safeStanding" ? "safe standing" : "all-seater"}${resulting >= 3 ? `, ${build.roof === "twoTier" ? "two tiers" : build.roof === "cantilever" ? "cantilever roof" : "traditional roof"}` : ""}`;
  project.title = `${project.title} (${label})`;
  project.history.push({
    absoluteWeek: project.approvedAtAbsoluteWeek ?? next.infrastructure?.lastTickAbsoluteWeek ?? 0,
    note: `Built as ${label}.`,
  });

  const identity = { ...groundIdentity(next) };
  identity.pending = { ...identity.pending, [assetId]: { ...build, projectId: project.id } };
  next.groundIdentity = identity;
  recomputeDerived(next);
  syncLegacyStadium(next);
  return { state: next, ok: true, reason: `Approved: ${asset.name} as ${label} · £${newCost.toLocaleString("en-GB")}.` };
}

/** Change how the ground looks. Paint and cladding cost money; names and patterns are free. */
export function setGroundLook(s: GameState, change: Partial<Omit<GroundIdentityState, "stands" | "pending" | "changes">>): GroundActionResult {
  const cost = cosmeticCost(s, change);
  if (cost > 0) {
    const check = assessSpend(s, cost);
    if (!check.allowed) return { state: s, ok: false, reason: `That costs £${cost.toLocaleString("en-GB")}: ${check.reason}` };
  }
  const next = structuredClone(s);
  const identity: GroundIdentityState = { ...DEFAULT_GROUND_IDENTITY, ...groundIdentity(next), ...change };
  if (cost > 0) {
    identity.changes += 1;
    postEntry(next, {
      category: "Facilities",
      subcategory: "Ground cosmetics",
      description: "Ground repainting and cladding",
      amount: cost,
      direction: "expense",
      sourceSystem: "facilities",
      dedupeKey: `ground-look:${identity.changes}:s${next.season}:w${next.week}`,
      metadata: { legacyBucket: "maintenance" },
    });
  }
  if (typeof change.groundName === "string") identity.groundName = change.groundName.trim().slice(0, 40) || undefined;
  next.groundIdentity = identity;
  return { state: next, ok: true, reason: cost > 0 ? `Done · £${cost.toLocaleString("en-GB")} booked to facilities.` : "Saved." };
}

export function renameStand(s: GameState, assetId: string, name: string): GroundActionResult {
  const clean = name.trim().slice(0, 32);
  if (!clean) return { state: s, ok: false, reason: "Give the stand a name." };
  const asset = assetById(s, assetId);
  if (!asset || asset.type !== "stand") return { state: s, ok: false, reason: "No such stand." };
  const next = structuredClone(s);
  assetById(next, assetId)!.name = clean;
  syncLegacyStadium(next);
  return { state: next, ok: true, reason: `Renamed: ${clean}.` };
}
