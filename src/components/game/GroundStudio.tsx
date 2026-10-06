import { useMemo, useState } from "react";
import { Check, Flag, Lightbulb, Paintbrush, PencilLine, RotateCcw, Rows3, Trees, Trophy } from "lucide-react";
import type { CapitalProjectType, GameState, InfrastructureAsset } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundProgression } from "@/lib/game/groundPresentation";
import { approveProject as approveProjectCompat, assetById, evaluateProject, expansionAllowance, projectCatalogue, stands as standAssets, type ProjectSpec } from "@/lib/game/infrastructure";
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
  standFootprintForCapacity,
  standingOptions,
  updateCorner,
  updateFixtures,
  updatePerimeter,
  updateStand,
  updateStandLook,
  updateSurroundings,
} from "@/lib/game/groundEditor";
import { approveStandBuild, buildQuote, isLevelRaising, renameStand, setGroundLook } from "@/lib/game/groundBuild";
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

function StandDevelopmentPanel({
  state,
  asset,
  onApprove,
  mode = "all",
}: {
  state: GameState;
  asset: InfrastructureAsset;
  onApprove: (spec: ProjectSpec) => void;
  mode?: "all" | "maintenance";
}) {
  const projects = projectCatalogue(state, asset.id).filter((spec) =>
    (mode === "maintenance"
      ? ["minorRepair", "majorRepair", "refurbishment", "replacement"]
      : ["capacityExpansion", "roofUpgrade", "seatingRefurbishment", "concourseUpgrade", "accessibilityUpgrade", "hospitalityInstallation", "corporateBoxes", "retailExpansion", "standRedevelopment", "minorRepair", "majorRepair", "refurbishment", "replacement"]
    ).includes(spec.type),
  );
  const active = asset.activeProjectId
    ? state.infrastructure?.projects.find((project) => project.id === asset.activeProjectId)
    : undefined;

  return (
    <Field label={mode === "maintenance" ? "Maintain this stand" : "Develop this stand"}>
      {active ? (
        <div className="rounded-xl border bg-muted/35 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-xs">{active.title}</strong>
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">{active.status}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {Math.round(active.progress)}% complete · {active.durationWeeks} week project
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {projects.map((spec) => {
            const capacity = spec.effects.find((effect) => effect.kind === "capacity") as { kind: "capacity"; add: number } | undefined;
            return (
              <button
                key={spec.type}
                type="button"
                onClick={() => onApprove(spec)}
                className="rounded-xl border bg-background px-3 py-2 text-left transition-colors hover:bg-muted/45"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block text-xs">{spec.title.replace(`${asset.name} — `, "")}</strong>
                    <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{spec.description}</span>
                  </div>
                  <strong className="shrink-0 text-xs tnum">{fmtMoneyExact(spec.cost)}</strong>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-muted px-2 py-0.5">{spec.durationWeeks} wk{spec.durationWeeks === 1 ? "" : "s"}</span>
                  {capacity?.add ? <span className="rounded-full bg-muted px-2 py-0.5">+{capacity.add.toLocaleString()} capacity</span> : null}
                  <span className="rounded-full bg-muted px-2 py-0.5">{spec.major ? "Construction" : "Works"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Appearance changes remain free. Capacity, structural upgrades and repairs are real club projects with cost and construction time.
      </p>
    </Field>
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
  const [standWorkspace, setStandWorkspace] = useState<"customize" | "maintenance" | "upgrade">("customize");

  /* ---------- A stand ---------- */
  if (selection?.startsWith("stand:")) {
    const side = selection.slice(6) as StandSide;
    const d = design.stands[side];
    const asset = standBySide.get(side);
    const own = identity.standLooks?.[side] ?? {};
    const limits = standSizeLimits(design, side, asset?.capacity);
    return (
      <div className="space-y-3">
        <PanelTitle title={labels[selection]} sub={`${SIDE_LABEL[side]} · ${asset?.capacity?.toLocaleString() ?? "—"} capacity · Facilities level ${d.level}`} />
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/20 p-1">
          {(["customize", "maintenance", "upgrade"] as const).map((workspace) => (
            <button
              key={workspace}
              type="button"
              onClick={() => setStandWorkspace(workspace)}
              className={cn("rounded-lg px-2 py-2 text-xs font-semibold capitalize transition-colors", standWorkspace === workspace ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {workspace}
            </button>
          ))}
        </div>
        {standWorkspace === "maintenance" && asset ? (
          <StandDevelopmentPanel
            state={state}
            asset={asset}
            mode="maintenance"
            onApprove={(spec) => apply((s) => approveProjectCompat(s, asset.id, spec.type))}
          />
        ) : null}
        {standWorkspace === "customize" ? (
          <>
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
              {standingOptions(d.form).map((id) => <OptionChip key={id} active={d.standing === id} onClick={() => apply((s) => updateStand(s, side, { standing: id }))}>{STANDING_LABEL[id]}</OptionChip>)}
            </div>
          </Field>
        ) : null}
        {roofOptions(d.form).length > 1 ? (
          <Field label="Roof">
            <div className="flex flex-wrap gap-1.5">
              {roofOptions(d.form).map((id) => <OptionChip key={id} active={d.roof === id} onClick={() => apply((s) => updateStand(s, side, { roof: id }))}>{ROOF_LABEL[id]}</OptionChip>)}
            </div>
          </Field>
        ) : null}
        {d.form !== "open" && asset ? (
          <Field label="Physical structure">
            {(() => {
              const footprint = standFootprintForCapacity(design, side, asset.capacity);
              return (
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <strong className="block text-xs">{asset.capacity.toLocaleString("en-GB")} places</strong>
                      <span className="text-[10.5px] text-muted-foreground">Approx. {footprint.span}m × {footprint.depth}m built footprint</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Purchased</span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">Stand size is now driven by completed development. Early expansions extend the stand; later growth adds depth and taller structures.</p>
                </div>
              );
            })()}
          </Field>
        ) : null}
        {d.form !== "open" ? (
          <div className="divide-y rounded-xl border">
            <ExpandRow label="Material" value={STAND_MATERIALS.find((m) => m.id === (d.material ?? defaultMaterial(d.form)))?.label ?? ""}>
              {(close) => <Swatches options={STAND_MATERIALS.map((m) => ({ id: m.id, label: m.label, colours: [MATERIAL_SWATCH[m.id]] }))} value={d.material ?? defaultMaterial(d.form)} onChange={(material) => { apply((s) => updateStand(s, side, { material: material as StandMaterial })); close(); }} />}
            </ExpandRow>
            <ExpandRow label="Seats" value={own.seats ? SEAT_SCHEMES.find((o) => o.id === own.seats)?.label ?? "" : "Ground default"} swatch={seatSwatch(own.seats ?? identity.seats)}>
              {(close) => <Swatches withDefault options={SEAT_SCHEMES.map((o) => ({ id: o.id, label: o.label, colours: seatSwatch(o.id) }))} value={own.seats ?? "default"} onChange={(id) => { apply((s) => updateStandLook(s, side, { seats: id === "default" ? undefined : (id as SeatScheme) })); close(); }} />}
            </ExpandRow>
            <ExpandRow label="Roof colour" value={own.roof ? ROOF_COLOURS.find((o) => o.id === own.roof)?.label ?? "" : "Ground default"} swatch={[roofSwatch(own.roof ?? identity.roof)]}>
              {(close) => <Swatches withDefault options={ROOF_COLOURS.map((o) => ({ id: o.id, label: o.label, colours: [roofSwatch(o.id)] }))} value={own.roof ?? "default"} onChange={(id) => { apply((s) => updateStandLook(s, side, { roof: id === "default" ? undefined : (id as RoofColour) })); close(); }} />}
            </ExpandRow>
            <ExpandRow label="Cladding & fascia" value={own.cladding ? CLADDINGS.find((o) => o.id === own.cladding)?.label ?? "" : "From material"} swatch={[own.cladding ? claddingSwatch(own.cladding) : MATERIAL_SWATCH[d.material ?? defaultMaterial(d.form)]]}>
              {(close) => <Swatches withDefault defaultLabel="From material" options={CLADDINGS.map((o) => ({ id: o.id, label: o.label, colours: [claddingSwatch(o.id)] }))} value={own.cladding ?? "default"} onChange={(id) => { apply((s) => updateStandLook(s, side, { cladding: id === "default" ? undefined : (id as Cladding) })); close(); }} />}
            </ExpandRow>
          </div>
        ) : null}
          </>
        ) : null}
        {standWorkspace === "upgrade" && asset ? <StandDevelopment state={state} asset={asset} apply={apply} /> : null}
        {standWorkspace === "customize" && asset ? <RenameRow key={asset.id} initial={asset.name} onSave={(name) => apply((s) => renameStand(s, asset.id, name))} /> : null}
      </div>
    );
  }

function StandDevelopment({ state, asset, apply }: { state: GameState; asset: InfrastructureAsset; apply: (edit: (s: GameState) => { state: GameState; ok: boolean; reason?: string }) => void }) {
  const [choosing, setChoosing] = useState<ProjectSpec | null>(null);
  const projects = projectCatalogue(state, asset.id).filter((spec) => ["capacityExpansion", "standRedevelopment", "roofUpgrade"].includes(spec.type));
  if (!projects.length) return null;
  if (choosing) return <div className="rounded-xl border bg-muted/20 p-3">{isLevelRaising(choosing.type) ? <StandBuildChooser state={state} asset={asset} spec={choosing} onCancel={() => setChoosing(null)} onConfirm={(build) => { apply((s) => approveStandBuild(s, asset.id, choosing.type, build)); setChoosing(null); }} /> : <div className="space-y-3"><div><div className="font-display text-base">{choosing.title.replace(`${asset.name} — `, "")}</div><div className="text-xs text-muted-foreground">{choosing.description}</div></div><div className="grid grid-cols-3 divide-x rounded-lg border bg-muted/30 text-center"><div className="p-2"><strong className="block">{fmtMoneyExact(choosing.cost)}</strong><span className="text-[9px] uppercase text-muted-foreground">Cost</span></div><div className="p-2"><strong className="block">{choosing.durationWeeks}w</strong><span className="text-[9px] uppercase text-muted-foreground">Build</span></div><div className="p-2"><strong className="block">{choosing.effects.find((e) => e.kind === "capacity") ? `+${(choosing.effects.find((e) => e.kind === "capacity") as { add: number }).add.toLocaleString("en-GB")}` : "—"}</strong><span className="text-[9px] uppercase text-muted-foreground">Places</span></div></div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setChoosing(null)}>Back</Button><Button onClick={() => { apply((s) => approveProjectCompat(s, asset.id, choosing.type)); setChoosing(null); }}>Approve</Button></div></div>}</div>;
  return <Field label="Develop this stand">
    <div className="overflow-hidden rounded-xl border bg-card">
      {projects.map((spec) => {
        const evaluation = evaluateProject(state, asset.id, spec.type);
        const capacity = spec.effects.find((effect) => effect.kind === "capacity") as { kind: "capacity"; add: number } | undefined;
        return <div key={spec.type} className="flex items-center gap-2 border-t p-2.5 first:border-t-0">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{spec.title.replace(`${asset.name} — `, "")}</div>
            <div className="text-[10px] text-muted-foreground">{capacity ? `+${capacity.add.toLocaleString("en-GB")} places · ` : ""}{spec.durationWeeks} weeks · {fmtMoneyExact(spec.cost)}</div>
          </div>
          <Button size="sm" variant="outline" disabled={!evaluation?.allowed} onClick={() => setChoosing(spec)}>{evaluation?.allowed ? "Build" : "Locked"}</Button>
        </div>;
      })}
    </div>
    <p className="mt-1 text-[10.5px] text-muted-foreground">Only visible structural work lives here. Accessibility, hospitality, catering, retail and other non-visual capability are developed through Facilities.</p>
  </Field>;
}

  /* ---------- A corner ---------- */
  if (selection?.startsWith("corner:")) {
    const slot = selection.slice(7) as CornerSlot;
    const c = design.corners[slot];
    const [endSide, touchSide] = [slot.startsWith("N") ? "N" : "S", slot.endsWith("W") ? "W" : "E"] as StandSide[];
    const adjacent = [standBySide.get(endSide), standBySide.get(touchSide)].filter(Boolean) as InfrastructureAsset[];
    const host = adjacent.sort((a, b) => b.capacity - a.capacity)[0];
    const expansion = host ? projectCatalogue(state, host.id).find((spec) => spec.type === "capacityExpansion") : undefined;
    const builtInfill = c.form === "terrace" || c.form === "seated";
    return (
      <div className="space-y-3">
        <PanelTitle title={labels[selection]} sub="Design the corner here; physical infill is a real ground project" />
        <Field label="Shape · free">
          <div className="flex gap-1.5">
            <OptionChip active={(c.shape ?? "angled") === "angled"} onClick={() => apply((s) => updateCorner(s, slot, { shape: "angled" }))}>Angled</OptionChip>
            <OptionChip active={c.shape === "rounded"} onClick={() => apply((s) => updateCorner(s, slot, { shape: "rounded" }))}>Rounded</OptionChip>
          </div>
          <p className="mt-1 text-[10.5px] text-muted-foreground">Changing the geometry never costs money, including after this corner has been built.</p>
        </Field>
        <Field label="Corner use">
          <div className="flex flex-wrap gap-1.5">
            {cornerFormOptions(design, slot).filter((option) => option.id !== "access").map((option) => (
              <OptionChip
                key={option.id}
                active={c.form === option.id}
                disabled={!option.allowed}
                title={option.reason}
                onClick={() => apply((s) => updateCorner(s, slot, { form: option.id }))}
              >
                {option.label}{!option.allowed ? " 🔒" : ""}
              </OptionChip>
            ))}
          </div>
        </Field>
        {builtInfill ? (
          <>
            <Field label="Access tunnel · free">
              <div className="flex gap-1.5">
                <OptionChip active={!c.accessTunnel} onClick={() => apply((s) => updateCorner(s, slot, { accessTunnel: false }))}>None</OptionChip>
                <OptionChip active={Boolean(c.accessTunnel)} onClick={() => apply((s) => updateCorner(s, slot, { accessTunnel: true }))}>Tunnel</OptionChip>
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground">A presentation option through the corner stand, not a separate corner type.</p>
            </Field>
            <Field label="Built infill">
              <div className="flex gap-1.5">
                {(["small", "large"] as const).map((size) => <OptionChip key={size} active={(c.size ?? "small") === size} onClick={() => apply((s) => updateCorner(s, slot, { size }))}>{size === "small" ? "Compact" : "Full corner"}</OptionChip>)}
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground">You already own this corner capacity, so its presentation can be compacted or reshaped freely.</p>
            </Field>
          </>
        ) : (
          <Field label="Develop corner">
            <div className="flex flex-wrap gap-1.5">
              {cornerFormOptions(design, slot).filter((option) => option.id !== "open").map((option) => (
                <OptionChip
                  key={option.id}
                  active={c.form === option.id}
                  disabled={!option.allowed || !expansion}
                  title={option.reason ?? (!expansion ? "No physical expansion is currently available" : undefined)}
                  onClick={() => apply((s) => updateCorner(s, slot, { form: option.id }))}
                >
                  {option.label}{!option.allowed || !expansion ? " 🔒" : ""}
                </OptionChip>
              ))}
            </div>
            {expansion && host ? (
              <div className="mt-2 rounded-xl border border-dashed bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Physical corner infill</div>
                    <strong className="text-xs">Build from {host.name}</strong>
                    <p className="mt-1 text-[10.5px] text-muted-foreground">Creates real spectator capacity in this empty corner. Choose its angled or rounded presentation freely before or after construction.</p>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-sm tnum">{fmtMoneyExact(expansion.cost)}</div>
                    <div className="text-[10px] text-muted-foreground">{expansion.durationWeeks} weeks</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  disabled={!evaluateProject(state, host.id, expansion.type)?.allowed}
                  onClick={() => apply((s) => approveStandBuild(s, host.id, expansion.type, standBuild(s, host.id, host.level)))}
                >
                  Approve corner infill
                </Button>
              </div>
            ) : null}
          </Field>
        )}
      </div>
    );
  }

  /* ---------- Fixtures ---------- */
  if (selection === "pitch") {
    return (
      <div className="space-y-3">
        <PanelTitle title="Pitch" sub="Mowing pattern" />
        <div className="grid grid-cols-5 gap-1.5">
          {MOWING_PATTERNS.map((pattern) => (
            <button key={pattern.id} type="button" onClick={() => applyLook({ mowing: pattern.id })} className={cn("flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] font-semibold", identity.mowing === pattern.id ? "border-primary bg-primary/10" : "bg-background")} aria-pressed={identity.mowing === pattern.id}>
              <MowingIcon pattern={pattern.id} />
              <span className="w-full truncate text-center">{pattern.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (selection === "lights") {
    return (
      <div className="space-y-3">
        <PanelTitle title="Floodlights" sub="Pylon corners always keep their pylon" />
        <div className="flex flex-wrap gap-1.5">
          {FLOODLIGHT_STYLES.map((style) => <OptionChip key={style.id} active={identity.floodlights === style.id} onClick={() => applyLook({ floodlights: style.id })}>{style.label}</OptionChip>)}
        </div>
      </div>
    );
  }
  if (selection === "perimeter") {
    const gates = design.perimeter.gates ?? ["N", "S"];
    return (
      <div className="space-y-3">
        <PanelTitle title="Perimeter" sub="What separates the crowd from the pitch" />
        <div className="flex flex-wrap gap-1.5">
          {PERIMETER_STYLES.map((style) => <OptionChip key={style.id} active={design.perimeter.style === style.id} onClick={() => apply((s) => updatePerimeter(s, { style: style.id }))}>{style.label}</OptionChip>)}
        </div>
        <div className="divide-y rounded-xl border">
          <ExpandRow label="Colour" value={PERIMETER_COLOURS.find((c) => c.id === design.perimeter.colour)?.label ?? ""} swatch={[design.perimeter.colour === "club" ? kit.body : PERIMETER_COLOURS.find((c) => c.id === design.perimeter.colour)?.hex ?? "#fff"]}>
            {(close) => <Swatches options={PERIMETER_COLOURS.map((c) => ({ id: c.id, label: c.label, colours: [c.id === "club" ? kit.body : c.hex] }))} value={design.perimeter.colour} onChange={(colour) => { apply((s) => updatePerimeter(s, { colour: colour as GroundDesign["perimeter"]["colour"] })); close(); }} />}
          </ExpandRow>
        </div>
        <Field label="Gates (gaps in the perimeter)">
          <div className="flex gap-1.5">
            {SIDES.map((side) => (
              <OptionChip key={side} active={gates.includes(side)} onClick={() => apply((s) => updatePerimeter(s, { gates: gates.includes(side) ? gates.filter((g) => g !== side) : [...gates, side] }))}>{GATE_LABEL[side]}</OptionChip>
            ))}
          </div>
        </Field>
      </div>
    );
  }
  if (selection === "dugouts" || selection === "scoreboard") {
    const options = selection === "dugouts" ? DUGOUT_STYLES : SCOREBOARD_STYLES;
    const value = selection === "dugouts" ? design.fixtures?.dugouts ?? "auto" : design.fixtures?.scoreboard ?? "auto";
    return (
      <div className="space-y-3">
        <PanelTitle title={FIXTURE_NAME[selection]} sub="Match the ground follows how developed it is" />
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <OptionChip key={option.id} active={value === option.id} onClick={() => apply((s) => updateFixtures(s, selection === "dugouts" ? { dugouts: option.id as GroundDesign["fixtures"] extends infer F ? F extends { dugouts?: infer D } ? D : never : never } : { scoreboard: option.id as never }))}>{option.label}</OptionChip>
          ))}
        </div>
      </div>
    );
  }
  if (selection === "surroundings") {
    const sur = design.surroundings;
    return (
      <div className="space-y-3">
        <PanelTitle title="Car park & buildings" />
        <Field label="Car park">
          <div className="flex flex-wrap gap-1.5">
            {(["gravel", "tarmac"] as const).map((surface) => <OptionChip key={surface} active={sur.carParkSurface === surface} onClick={() => apply((s) => updateSurroundings(s, { carParkSurface: surface }))}>{surface === "gravel" ? "Gravel" : "Tarmac"}</OptionChip>)}
            <OptionChip active={sur.coachBay ?? design.stands.W.level >= 2} onClick={() => apply((s) => updateSurroundings(s, { coachBay: !(sur.coachBay ?? design.stands.W.level >= 2) }))}>Coach bay</OptionChip>
          </div>
        </Field>
        <Field label="Where">
          <div className="flex flex-wrap gap-1.5">
            {CORNERS.map((slot) => <OptionChip key={slot} active={sur.carParkLocation === slot} onClick={() => apply((s) => updateSurroundings(s, { carParkLocation: slot }))}>{CORNER_NAME[slot].replace(" corner", "")}</OptionChip>)}
          </div>
        </Field>
        <Field label="Club buildings">
          <div className="flex flex-wrap gap-1.5">
            {BUILDING_STYLES.map((style) => <OptionChip key={style.id} active={(sur.buildings ?? "auto") === style.id} onClick={() => apply((s) => updateSurroundings(s, { buildings: style.id }))}>{style.label}</OptionChip>)}
          </div>
        </Field>
      </div>
    );
  }

  /* ---------- Whole ground ---------- */
  return (
    <div className="space-y-3">
      <PanelTitle title="Whole ground" sub="Defaults every stand uses unless you change it" />
      <RenameRow key={`ground-${identity.groundName ?? ""}`} label="Ground name" placeholder="e.g. Station Park" initial={identity.groundName ?? ""} onSave={(groundName) => applyLook({ groundName })} />
      <div className="divide-y rounded-xl border">
        <ExpandRow label="Seats" value={SEAT_SCHEMES.find((o) => o.id === identity.seats)?.label ?? ""} swatch={seatSwatch(identity.seats)}>
          {(close) => <Swatches options={SEAT_SCHEMES.map((o) => ({ id: o.id, label: o.label, colours: seatSwatch(o.id) }))} value={identity.seats} onChange={(seats) => { applyLook({ seats: seats as SeatScheme }); close(); }} />}
        </ExpandRow>
        <ExpandRow label="Roof colour" value={ROOF_COLOURS.find((o) => o.id === identity.roof)?.label ?? ""} swatch={[roofSwatch(identity.roof)]}>
          {(close) => <Swatches options={ROOF_COLOURS.map((o) => ({ id: o.id, label: o.label, colours: [roofSwatch(o.id)] }))} value={identity.roof} onChange={(roof) => { applyLook({ roof: roof as RoofColour }); close(); }} />}
        </ExpandRow>
        <ExpandRow label="Brick & buildings" value={CLADDINGS.find((o) => o.id === identity.cladding)?.label ?? ""} swatch={[claddingSwatch(identity.cladding)]}>
          {(close) => <Swatches options={CLADDINGS.map((o) => ({ id: o.id, label: o.label, colours: [claddingSwatch(o.id)] }))} value={identity.cladding} onChange={(cladding) => { applyLook({ cladding: cladding as Cladding }); close(); }} />}
        </ExpandRow>
      </div>
      <Field label="Home end (the Kop)">
        <div className="flex gap-1.5">
          {([null, "N", "S"] as const).map((end) => <OptionChip key={String(end)} active={identity.homeEnd === end} onClick={() => applyLook({ homeEnd: end })}>{end === null ? "None" : end === "N" ? "North end" : "South end"}</OptionChip>)}
        </div>
      </Field>
    </div>
  );
}

/* ---------- Small pieces ---------- */

const MATERIAL_SWATCH: Record<StandMaterial, string> = { brick: "#9a5d42", timber: "#8a6a45", concrete: "#b5b1a6", cladding: "#cfd3d6" };

function PanelTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div data-panel-title={title}>
      <div className="font-display text-lg leading-tight">{title}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function PickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold", active ? "border-amber-400 bg-amber-100 text-amber-900" : "bg-background")} aria-pressed={active}>
      {children}
    </button>
  );
}

function OptionChip({ active, disabled, title, onClick, children }: { active: boolean; disabled?: boolean; title?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} title={title} onClick={onClick} aria-pressed={active} className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-45", active ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
      {children}
    </button>
  );
}

/** A collapsed row: "Roof colour   Slate ›". Tap to expand the palette; choosing collapses it. */
function ExpandRow({ label, value, swatch, children }: { label: string; value: string; swatch?: string[]; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left" aria-expanded={open}>
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {swatch ? <span className="flex h-4 w-6 overflow-hidden rounded border border-black/10">{swatch.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</span> : null}
          {value}
          <span className={cn("transition-transform", open && "rotate-90")}>›</span>
        </span>
      </button>
      {open ? <div className="px-3 pb-3">{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

function Swatches<T extends string>({ options, value, onChange, withDefault, defaultLabel = "Ground default" }: { options: { id: T; label: string; colours: string[] }[]; value: T | "default"; onChange: (id: T | "default") => void; withDefault?: boolean; defaultLabel?: string }) {
  const all = withDefault ? [{ id: "default" as const, label: defaultLabel, colours: ["repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px)"] }, ...options] : options;
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {all.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id as T | "default")} aria-pressed={option.id === value} className={cn("flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] font-semibold", option.id === value ? "border-primary bg-primary/10" : "bg-background")}>
          <span className="flex h-5 w-full overflow-hidden rounded border border-black/10">{option.colours.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}</span>
          <span className="w-full truncate text-center">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}<span className="text-[12px] font-semibold normal-case tracking-normal text-foreground">{value}{unit}</span>
      </span>
      <input type="range" min={min} max={max} value={Math.max(min, Math.min(max, value))} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-[var(--color-primary)]" />
    </label>
  );
}

function RenameRow({ initial, onSave, label = "Stand name", placeholder }: { initial: string; onSave: (name: string) => void; label?: string; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input value={value} placeholder={placeholder} maxLength={40} onChange={(event) => setValue(event.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm" />
        <Button size="sm" variant="outline" className="h-9" disabled={value.trim() === initial.trim()} onClick={() => onSave(value)}>Save</Button>
      </div>
    </Field>
  );
}

/** Tiny preview of each mowing pattern. */
function MowingIcon({ pattern }: { pattern: Mowing }) {
  const a = "#45a04b";
  const b = "#33893a";
  const cells: React.ReactNode[] = [];
  if (pattern === "checks") for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) cells.push(<rect key={`${i}-${j}`} x={i * 6} y={j * 5} width="6" height="5" fill={(i + j) % 2 ? a : b} />);
  else if (pattern === "vertical") for (let j = 0; j < 5; j++) cells.push(<rect key={j} x="0" y={j * 4} width="36" height="4" fill={j % 2 ? a : b} />);
  else if (pattern === "diagonal") { cells.push(<rect key="bg" width="36" height="20" fill={b} />); for (let k = -4; k < 8; k += 2) cells.push(<polygon key={k} points={`${k * 5},20 ${k * 5 + 5},20 ${k * 5 + 25},0 ${k * 5 + 20},0`} fill={a} />); }
  else { const n = pattern === "wide" ? 3 : 6; for (let i = 0; i < n; i++) cells.push(<rect key={i} x={(i * 36) / n} y="0" width={36 / n} height="20" fill={i % 2 ? a : b} />); }
  return <svg viewBox="0 0 36 20" className="h-6 w-full overflow-hidden rounded">{cells}</svg>;
}

export function standForAsset(state: GameState, assetId: string) {
  return assetById(state, assetId);
}
