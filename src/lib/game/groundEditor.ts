/* =========================================================================
   Ground Studio editing
   -------------------------------------------------------------------------
   Progression buys capability; customisation chooses appearance.

   - What a side can be is decided by its real stand's Facilities level.
   - Within that, the club chooses the architecture and the look, for free.
   - Corners develop believably: infill needs real stands beside it.

   All functions return a new state (never mutate the input). Edits persist
   the canonical GroundDesign (ensureGroundDesign) the first time they are used.
========================================================================= */

import type { GameState } from "./types";
import {
  ensureGroundDesign,
  groundDesign,
  groundIdentity,
  type CornerForm,
  type CornerSize,
  type CornerSlot,
  type GroundDesign,
  type GroundStandDesign,
  type StandForm,
  type StandLook,
  type StandMaterial,
  type StandSide,
  type Standing,
} from "./groundIdentity";

export const STAND_FORMS: { id: StandForm; label: string; minLevel: number }[] = [
  { id: "open", label: "Open side", minLevel: 0 },
  { id: "shelter", label: "Small shelter", minLevel: 0 },
  { id: "terrace", label: "Terrace", minLevel: 0 },
  { id: "traditional", label: "Traditional stand", minLevel: 2 },
  { id: "cantilever", label: "Cantilever stand", minLevel: 3 },
  { id: "twoTier", label: "Two-tier stand", minLevel: 4 },
];

export const CORNER_FORMS: { id: CornerForm; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "access", label: "Access gate" },
  { id: "pylon", label: "Floodlight pylon" },
  { id: "terrace", label: "Terrace infill" },
  { id: "seated", label: "Seated infill" },
];

const LEVEL_NAME = ["Basic terrace", "Basic terrace", "Seated stand", "Modern stand", "Premium stand", "Landmark stand"];
const isTouchline = (side: StandSide) => side === "W" || side === "E";
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export interface FormOption {
  id: StandForm;
  label: string;
  allowed: boolean;
  /** Why it's locked, e.g. "Needs a Modern stand". */
  reason?: string;
}

/** The architectures this side's real stand can support. */
export function standFormOptions(design: GroundDesign, side: StandSide): FormOption[] {
  const level = design.stands[side].level;
  return STAND_FORMS.map((form) => ({
    id: form.id,
    label: form.label,
    allowed: level >= form.minLevel,
    reason: level >= form.minLevel ? undefined : `Needs a ${LEVEL_NAME[form.minLevel]}`,
  }));
}

/** Span/depth envelope the club has actually paid to build. A stand can be
 * drawn smaller for character, never larger than its real capacity supports. */
export function standSizeLimits(design: GroundDesign, side: StandSide, capacity?: number) {
  const level = design.stands[side].level;
  const structuralSpan = Math.min(isTouchline(side) ? 100 : 64, 30 + level * 16);
  const structuralDepth = Math.min(26, 6 + level * 4);
  const cap = Math.max(0, capacity ?? 0);
  const capacitySpan = cap > 0 ? Math.round(Math.max(18, Math.min(isTouchline(side) ? 96 : 58, 16 + cap * 0.04))) : structuralSpan;
  const capacityDepth = cap > 0 ? Math.round(Math.max(4, Math.min(24, 4 + cap / 180))) : structuralDepth;
  return {
    span: { min: 14, max: Math.max(14, Math.min(structuralSpan, capacitySpan)) },
    depth: { min: 3, max: Math.max(3, Math.min(structuralDepth, capacityDepth)) },
  };
}

/** Which standing/roof choices make sense for a form. */
export function standingOptions(form: StandForm): Standing[] {
  if (form === "open" || form === "terrace") return ["terrace"];
  if (form === "shelter") return ["terrace", "seated"];
  return ["seated", "safeStanding", "terrace"];
}
export function roofOptions(form: StandForm): GroundStandDesign["roof"][] {
  if (form === "open") return ["open"];
  if (form === "terrace" || form === "traditional") return ["pitched", "open"];
  if (form === "shelter") return ["pitched"];
  if (form === "cantilever") return ["cantilever"];
  return ["twoTier"];
}

export function defaultMaterial(form: StandForm): StandMaterial {
  if (form === "shelter") return "timber";
  if (form === "terrace") return "concrete";
  if (form === "traditional") return "brick";
  return "cladding";
}

function adjacentSides(slot: CornerSlot): [StandSide, StandSide] {
  return [slot.startsWith("N") ? "N" : "S", slot.endsWith("W") ? "W" : "E"];
}

/** Corner options, with believable development rules. */
export function cornerFormOptions(design: GroundDesign, slot: CornerSlot): { id: CornerForm; label: string; allowed: boolean; reason?: string }[] {
  const [end, touch] = adjacentSides(slot);
  const a = design.stands[end];
  const b = design.stands[touch];
  const built = (d: GroundStandDesign) => d.form !== "open" && d.form !== "shelter";
  return CORNER_FORMS.map((form) => {
    if (form.id === "terrace") {
      const ok = (built(a) && a.level >= 2) || (built(b) && b.level >= 2);
      return { ...form, allowed: ok, reason: ok ? undefined : "Needs a Seated stand next to it" };
    }
    if (form.id === "seated") {
      const ok = built(a) && built(b) && a.level >= 3 && b.level >= 3;
      return { ...form, allowed: ok, reason: ok ? undefined : "Needs Modern stands either side" };
    }
    return { ...form, allowed: true };
  });
}

export interface EditResult {
  state: GameState;
  ok: boolean;
  reason?: string;
}

function editDesign(s: GameState, edit: (design: GroundDesign) => string | undefined): EditResult {
  const next = structuredClone(s);
  const design = ensureGroundDesign(next);
  const error = edit(design);
  if (error) return { state: s, ok: false, reason: error };
  // Persist the edited design (ensureGroundDesign stored a copy).
  next.groundIdentity = { ...groundIdentity(next), design };
  return { state: next, ok: true };
}

/** Change one side's architecture or size. Free; limited by the real stand's level. */
export function updateStand(s: GameState, side: StandSide, patch: Partial<Omit<GroundStandDesign, "level">>): EditResult {
  return editDesign(s, (design) => {
    const current = design.stands[side];
    const nextForm = patch.form ?? current.form;
    const option = standFormOptions(design, side).find((o) => o.id === nextForm);
    if (!option?.allowed) return option?.reason ?? "Not available";
    const asset = (s.infrastructure?.assets ?? []).find((candidate) => candidate.type === "stand" && candidate.location === side);
    const limits = standSizeLimits(design, side, asset?.capacity);
    const standing = patch.standing ?? (standingOptions(nextForm).includes(current.standing) ? current.standing : standingOptions(nextForm)[0]);
    const roofs = roofOptions(nextForm);
    const roof = patch.roof && roofs.includes(patch.roof) ? patch.roof : roofs.includes(current.roof) && !patch.form ? current.roof : roofs[0];
    design.stands[side] = {
      ...current,
      ...patch,
      form: nextForm,
      standing: standingOptions(nextForm).includes(standing) ? standing : standingOptions(nextForm)[0],
      roof,
      span: clamp(Math.round(patch.span ?? current.span), limits.span.min, limits.span.max),
      depth: clamp(Math.round(patch.depth ?? current.depth), limits.depth.min, limits.depth.max),
      material: patch.material ?? (patch.form && patch.form !== current.form ? defaultMaterial(nextForm) : current.material),
    };
    return undefined;
  });
}

export function updateCorner(s: GameState, slot: CornerSlot, patch: { form?: CornerForm; size?: CornerSize; shape?: "angled" | "rounded" }): EditResult {
  return editDesign(s, (design) => {
    if (patch.form) {
      const option = cornerFormOptions(design, slot).find((o) => o.id === patch.form);
      if (!option?.allowed) return option?.reason ?? "Not available";
    }
    design.corners[slot] = { ...design.corners[slot], ...patch };
    return undefined;
  });
}

export function updatePerimeter(s: GameState, patch: Partial<GroundDesign["perimeter"]>): EditResult {
  return editDesign(s, (design) => {
    design.perimeter = { ...design.perimeter, ...patch };
    return undefined;
  });
}

export function updateSurroundings(s: GameState, patch: Partial<GroundDesign["surroundings"]>): EditResult {
  return editDesign(s, (design) => {
    design.surroundings = { ...design.surroundings, ...patch };
    return undefined;
  });
}

export function updateFixtures(s: GameState, patch: NonNullable<GroundDesign["fixtures"]>): EditResult {
  return editDesign(s, (design) => {
    design.fixtures = { ...(design.fixtures ?? {}), ...patch };
    return undefined;
  });
}

/** Per-stand cosmetics. Pass `undefined` for a field to fall back to the ground-wide look. */
export function updateStandLook(s: GameState, side: StandSide, patch: StandLook): EditResult {
  const next = structuredClone(s);
  const identity = groundIdentity(next);
  const merged: StandLook = { ...(identity.standLooks?.[side] ?? {}), ...patch };
  for (const key of Object.keys(merged) as (keyof StandLook)[]) if (merged[key] === undefined) delete merged[key];
  const standLooks = { ...(identity.standLooks ?? {}) };
  if (Object.keys(merged).length) standLooks[side] = merged;
  else delete standLooks[side];
  next.groundIdentity = { ...identity, standLooks };
  return { state: next, ok: true };
}

/** Read-only convenience for UIs. */
export function editableDesign(s: GameState): GroundDesign {
  return groundDesign(s);
}
