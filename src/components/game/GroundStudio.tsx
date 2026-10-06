import { useMemo, useState } from "react";
import { Check, Flag, Lightbulb, Paintbrush, PencilLine, RotateCcw, Rows3, Trees, Trophy } from "lucide-react";
import type { CapitalProjectType, GameState, InfrastructureAsset } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundProgression } from "@/lib/game/groundPresentation";
import { assetById, stands as standAssets, type ProjectSpec } from "@/lib/game/infrastructure";
import {
  BUILDING_STYLES,
  CLADDINGS,
  DUGOUT_STYLES,
  FLOODLIGHT_STYLES,
  PERIMETER_COLOURS,
  PERIMETER_STYLES,
  SCOREBOARD_STYLES,
  STAND_MATERIALS,
  MOWING_PATTERNS,
  ROOF_COLOURS,
  SEAT_SCHEMES,
  STANDING_OPTIONS,
  cosmeticCost,
  groundIdentity,
  levelAfterProject,
  roofOptionsFor,
  groundDesign,
  sceneLook,
  standBuild,
  type Cladding,
  type CornerSlot,
  type GroundDesign,
  type GroundIdentityState,
  type Mowing,
  type RoofColour,
  type SeatScheme,
  type StandBuild,
  type StandMaterial,
  type StandSide,
} from "@/lib/game/groundIdentity";
import {
  cornerFormOptions,
  defaultMaterial,
  roofOptions,
  standFormOptions,
  standSizeLimits,
  standingOptions,
  updateCorner,
  updateFixtures,
  updatePerimeter,
  updateStand,
  updateStandLook,
  updateSurroundings,
} from "@/lib/game/groundEditor";
import { buildQuote, renameStand, setGroundLook } from "@/lib/game/groundBuild";
import { StadiumGround } from "./StadiumGround";

const SIDE_LABEL: Record<string, string> = { N: "North end", E: "East side", S: "South end", W: "West side (main)" };

/* ------------------------------------------------------------------ */
/* Choosing how a stand is built                                       */
/* ------------------------------------------------------------------ */

export function StandBuildChooser({
  state,
  asset,
  spec,
  onConfirm,
  onCancel,
}: {
  state: GameState;
  asset: InfrastructureAsset;
  spec: ProjectSpec;
  onConfirm: (build: StandBuild) => void;
  onCancel: () => void;
}) {
  const resulting = levelAfterProject(spec.type, asset.level);
  const roofs = roofOptionsFor(resulting);
  const current = standBuild(state, asset.id, asset.level);
  const [build, setBuild] = useState<StandBuild>({
    standing: current.standing,
    roof: roofs.some((r) => r.id === current.roof) ? current.roof : roofs[0]?.id ?? "pitched",
  });
  const quote = buildQuote(state, spec.cost, asset.id, spec.type as CapitalProjectType, build);
  const capacityEffect = spec.effects.find((e) => e.kind === "capacity") as { add: number } | undefined;
  const standing = STANDING_OPTIONS.find((o) => o.id === build.standing)!;
  const roof = roofs.find((o) => o.id === build.roof);
  const addedCapacity = capacityEffect ? Math.round((capacityEffect.add * standing.capacity * (roof?.capacity ?? 1)) / 50) * 50 : 0;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How should it be built?</div>
        <div className="font-display text-lg leading-tight">{asset.name}</div>
      </div>

      <OptionGroup
        title="Terracing"
        options={STANDING_OPTIONS}
        value={build.standing}
        onChange={(id) => setBuild((b) => ({ ...b, standing: id }))}
      />
      {roofs.length > 0 && (
        <OptionGroup title="Roof" options={roofs} value={build.roof} onChange={(id) => setBuild((b) => ({ ...b, roof: id }))} />
      )}

      <div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center">
        <div className="px-1 py-2"><div className="font-display text-base tnum">{fmtMoneyExact(quote.cost)}</div><div className="text-[9px] uppercase text-muted-foreground">Cost</div></div>
        <div className="px-1 py-2"><div className="font-display text-base tnum">{addedCapacity ? `+${addedCapacity.toLocaleString()}` : "—"}</div><div className="text-[9px] uppercase text-muted-foreground">Places</div></div>
        <div className="px-1 py-2"><div className="font-display text-base tnum">{quote.multiplier === 1 ? "Base" : `${quote.multiplier > 1 ? "+" : ""}${Math.round((quote.multiplier - 1) * 100)}%`}</div><div className="text-[9px] uppercase text-muted-foreground">vs base</div></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel}>Back</Button>
        <Button onClick={() => onConfirm(build)}>Approve · {fmtMoneyExact(quote.cost)}</Button>
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: readonly { id: T; label: string; blurb: string; pros: string; cons: string; cost: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid gap-1.5">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              className={cn("rounded-lg border px-3 py-2 text-left transition-colors", active ? "border-primary bg-primary/10" : "bg-background hover:bg-muted/50")}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{option.label}</strong>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                  {option.cost === 1 ? "Base cost" : `${option.cost > 1 ? "+" : ""}${Math.round((option.cost - 1) * 100)}%`}
                  {active && <Check className="size-3.5 text-primary" />}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">{option.blurb}</div>
              <div className="mt-1 text-[10px]"><span className="text-income">+ {option.pros}</span><span className="text-muted-foreground"> · </span><span className="text-expense">− {option.cons}</span></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ground Studio: name, stand names and the look                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Ground Studio: direct manipulation                                  */
/* ------------------------------------------------------------------ */
/*
 * The stadium is the navigation: tap a stand, corner, the pitch, the lights,
 * the perimeter, the dugouts, the scoreboard or the car park, and a compact
 * panel opens for just that thing. Every change is free and shows immediately.
 * Structure (what a stand can be) is unlocked by Facilities progression.
 */

type Selection = string | null;
const SIDES = ["W", "E", "N", "S"] as const;
const CORNERS = ["NW", "NE", "SW", "SE"] as const;
const CORNER_NAME: Record<string, string> = { NW: "North-West corner", NE: "North-East corner", SW: "South-West corner", SE: "South-East corner" };
const FIXTURE_NAME: Record<string, string> = { pitch: "Pitch", lights: "Floodlights", perimeter: "Perimeter", dugouts: "Dugouts", scoreboard: "Scoreboard", surroundings: "Car park & buildings" };
const STANDING_LABEL: Record<string, string> = { terrace: "Standing", safeStanding: "Safe standing", seated: "Seated" };
const ROOF_LABEL: Record<string, string> = { pitched: "Pitched", cantilever: "Cantilever", twoTier: "Two-tier", open: "No roof" };
const GATE_LABEL: Record<string, string> = { N: "North", E: "East", S: "South", W: "West" };

export function GroundStudioSheet({
  open,
  onOpenChange,
  state,
  update,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [selection, setSelection] = useState<Selection>("stand:W");
  const [note, setNote] = useState<string | null>(null);
  const identity = groundIdentity(state);
  const design = groundDesign(state);
  const kit = clubKitFor(state).home;
  const look = useMemo(() => sceneLook(state, { body: kit.body, secondary: kit.secondary }), [state, kit.body, kit.secondary]);
  const stage = state.infrastructure ? groundProgression(state).visualStage : 0;
  const standBySide = new Map(standAssets(state).map((asset) => [asset.location, asset]));
  const labels: Record<string, string> = {
    ...Object.fromEntries(SIDES.map((side) => [`stand:${side}`, standBySide.get(side)?.name ?? SIDE_LABEL[side]])),
    ...Object.fromEntries(CORNERS.map((slot) => [`corner:${slot}`, CORNER_NAME[slot]])),
    ...FIXTURE_NAME,
  };

  const apply = (edit: (s: GameState) => { state: GameState; ok: boolean; reason?: string }) =>
    update((current) => {
      const result = edit(current);
      setNote(result.ok ? null : result.reason ?? "Not available");
      return result.ok ? result.state : current;
    });
  const applyLook = (change: Parameters<typeof setGroundLook>[1]) => apply((s) => setGroundLook(s, change));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex h-[96dvh] flex-col gap-0 rounded-t-2xl p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ground Studio · free</div>
            <SheetTitle className="truncate font-display text-xl leading-none">{identity.groundName ?? "Your ground"}</SheetTitle>
          </div>
          <Button size="sm" className="mr-9" onClick={() => onOpenChange(false)}>Done</Button>
        </div>

        {/* The ground is the navigation. */}
        {/* The Facilities viewport has fixed heights; here it fills (and is clipped to) its slot. */}
        <div className="relative min-h-0 flex-[1.15] overflow-hidden border-b [&_.lf-ground-viewport]:!h-full [&_.lf-ground-viewport]:!min-h-0 [&_.lf-ground-viewport]:!rounded-none">
          <StadiumGround
            stage={stage}
            hotspots={[]}
            selectedId={null}
            onSelect={() => {}}
            look={look}
            design={design}
            selection={selection}
            onSelectComponent={(id) => { setSelection(id); setNote(null); }}
            componentLabels={labels}
          />
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white">
            Tap the ground to edit · drag to orbit · pinch to zoom
          </div>
        </div>

        {/* Quick picker for everything (also reachable by tapping the ground). */}
        <div className="flex gap-1.5 overflow-x-auto border-b px-3 py-2 [scrollbar-width:none]">
          <PickChip active={selection === null} onClick={() => setSelection(null)}>Whole ground</PickChip>
          {SIDES.map((side) => <PickChip key={side} active={selection === `stand:${side}`} onClick={() => setSelection(`stand:${side}`)}>{labels[`stand:${side}`]}</PickChip>)}
          {(["pitch", "lights", "perimeter", "dugouts", "scoreboard", "surroundings"] as const).map((id) => <PickChip key={id} active={selection === id} onClick={() => setSelection(id)}>{FIXTURE_NAME[id]}</PickChip>)}
          {CORNERS.map((slot) => <PickChip key={slot} active={selection === `corner:${slot}`} onClick={() => setSelection(`corner:${slot}`)}>{slot}</PickChip>)}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          {note ? <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{note}</div> : null}
          <SelectionPanel
            selection={selection}
            state={state}
            design={design}
            identity={identity}
            kit={kit}
            labels={labels}
            apply={apply}
            applyLook={applyLook}
            standBySide={standBySide}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SelectionPanel({
  selection,
  state,
  design,
  identity,
  kit,
  labels,
  apply,
  applyLook,
  standBySide,
}: {
  selection: Selection;
  state: GameState;
  design: GroundDesign;
  identity: GroundIdentityState;
  kit: { body: string; secondary: string };
  labels: Record<string, string>;
  apply: (edit: (s: GameState) => { state: GameState; ok: boolean; reason?: string }) => void;
  applyLook: (change: Parameters<typeof setGroundLook>[1]) => void;
  standBySide: Map<string, InfrastructureAsset>;
}) {
  const seatSwatch = (id: SeatScheme): string[] => (id === "club" ? [kit.body, kit.body] : id === "twoTone" ? [kit.body, kit.secondary] : SEAT_SCHEMES.find((o) => o.id === id)?.colours ?? ["#1f6f69", "#185a55"]);
  const roofSwatch = (id: RoofColour) => (id === "club" ? kit.body : ROOF_COLOURS.find((r) => r.id === id)?.hex ?? "#56616c");
  const claddingSwatch = (id: Cladding) => (id === "club" ? kit.body : CLADDINGS.find((c) => c.id === id)?.hex ?? "#9a5d42");

  /* ---------- A stand ---------- */
  if (selection?.startsWith("stand:")) {
    const side = selection.slice(6) as StandSide;
    const d = design.stands[side];
    const asset = standBySide.get(side);
    const own = identity.standLooks?.[side] ?? {};
    const limits = standSizeLimits(design, side);
    return (
      <div className="space-y-3">
        <PanelTitle title={labels[selection]} sub={`${SIDE_LABEL[side]} · Facilities level ${d.level}`} />
        <Field label="Structure">
          <div className="flex flex-wrap gap-1.5">
            {standFormOptions(design, side).map((option) => (
              <OptionChip key={option.id} active={d.form === option.id} disabled={!option.allowed} title={option.reason} onClick={() => apply((s) => updateStand(s, side, { form: option.id }))}>
                {option.label}{!option.allowed ? " 🔒" : ""}
              </OptionChip>
            ))}
          </div>
          {standFormOptions(design, side).some((o) => !o.allowed) ? <p className="mt-1 text-[10.5px] text-muted-foreground">Bigger structures unlock as you develop this stand in Facilities.</p> : null}
        </Field>
        {standingOptions(d.form).length > 1 ? (
          <Field label="Standing or seated">
            <div className="flex flex-wrap gap-1.5">
              {standingOptions(d.form).map((id) => <OptionChip key={id} active={d.standing === id} onClick={() => apply((s) => updateStand(s, side, { s