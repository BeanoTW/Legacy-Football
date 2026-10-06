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
      <div cl