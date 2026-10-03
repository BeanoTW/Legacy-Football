import { useMemo, useState } from "react";
import { Check, Flag, Paintbrush, PencilLine } from "lucide-react";
import type { CapitalProjectType, GameState, InfrastructureAsset } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundProgression } from "@/lib/game/groundPresentation";
import { assetById, stands as standAssets, type ProjectSpec } from "@/lib/game/infrastructure";
import {
  CLADDINGS,
  FLOODLIGHT_STYLES,
  MOWING_PATTERNS,
  ROOF_COLOURS,
  SEAT_SCHEMES,
  STANDING_OPTIONS,
  cosmeticCost,
  groundIdentity,
  levelAfterProject,
  roofOptionsFor,
  sceneLook,
  standBuild,
  type GroundIdentityState,
  type StandBuild,
} from "@/lib/game/groundIdentity";
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

type LookDraft = Pick<GroundIdentityState, "seats" | "roof" | "cladding" | "floodlights" | "mowing" | "homeEnd">;

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
  const identity = groundIdentity(state);
  const kit = clubKitFor(state).home;
  const [draft, setDraft] = useState<LookDraft>({
    seats: identity.seats,
    roof: identity.roof,
    cladding: identity.cladding,
    floodlights: identity.floodlights,
    mowing: identity.mowing,
    homeEnd: identity.homeEnd,
  });
  const [groundName, setGroundName] = useState(identity.groundName ?? "");
  const [names, setNames] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const stage = state.infrastructure ? groundProgression(state).visualStage : 0;
  const cost = cosmeticCost(state, draft);
  const preview = useMemo(() => {
    const previewState = { ...state, groundIdentity: { ...identity, ...draft } } as GameState;
    return sceneLook(previewState, { body: kit.body, secondary: kit.secondary });
  }, [state, identity, draft, kit.body, kit.secondary]);
  const changed = (Object.keys(draft) as (keyof LookDraft)[]).some((key) => draft[key] !== identity[key]) || (groundName.trim() || undefined) !== identity.groundName;

  const apply = () =>
    update((current) => {
      const result = setGroundLook(current, { ...draft, groundName });
      setNote(result.reason);
      return result.ok ? result.state : current;
    });

  const rename = (asset: InfrastructureAsset) =>
    update((current) => {
      const result = renameStand(current, asset.id, names[asset.id] ?? asset.name);
      setNote(result.reason);
      return result.ok ? result.state : current;
    });

  const roofSwatch = (id: string) => (id === "club" ? kit.body : ROOF_COLOURS.find((r) => r.id === id)?.hex ?? "#56616c");
  const seatSwatch = (id: string) =>
    id === "club" ? [kit.body, kit.body] : id === "twoTone" ? [kit.body, kit.secondary] : id === "mono" ? ["#7d858b", "#7d858b"] : ["#1f6f69", "#1f6f69"];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl p-0">
        <div className="sticky top-0 z-10 border-b bg-card px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Make it yours</div>
          <SheetTitle className="font-display text-2xl leading-none">Ground Studio</SheetTitle>
        </div>

        <div className="relative h-56 overflow-hidden border-b">
          <StadiumGround stage={stage} hotspots={[]} selectedId={null} onSelect={() => {}} look={preview} />
        </div>

        <div className="space-y-4 p-4">
          {note && <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">{note}</div>}

          <section>
            <SectionTitle icon={<Flag className="size-3.5" />} title="Ground name" />
            <input
              value={groundName}
              onChange={(event) => setGroundName(event.target.value)}
              placeholder="e.g. Station Park"
              maxLength={40}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            />
          </section>

          <section>
            <SectionTitle icon={<PencilLine className="size-3.5" />} title="Stand names" />
            <div className="grid gap-1.5">
              {standAssets(state).map((asset) => (
                <div key={asset.id} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">{SIDE_LABEL[asset.location] ?? asset.location}</span>
                  <input
                    value={names[asset.id] ?? asset.name}
                    onChange={(event) => setNames((n) => ({ ...n, [asset.id]: event.target.value }))}
                    maxLength={32}
                    className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm"
                  />
                  <Button size="sm" variant="outline" className="h-9" disabled={(names[asset.id] ?? asset.name).trim() === asset.name} onClick={() => rename(asset)}>Save</Button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle icon={<Paintbrush className="size-3.5" />} title="Roof colour" note="Most visible from above · £6k per stand" />
            <Swatches
              options={ROOF_COLOURS.map((r) => ({ id: r.id, label: r.label, colours: [roofSwatch(r.id), roofSwatch(r.id)] }))}
              value={draft.roof}
              onChange={(roof) => setDraft((d) => ({ ...d, roof }))}
            />
          </section>

          <section>
            <SectionTitle title="Seats" note="Repainting costs £1.50 a place" />
            <Swatches
              options={SEAT_SCHEMES.map((s) => ({ id: s.id, label: s.label, colours: seatSwatch(s.id) }))}
              value={draft.seats}
              onChange={(seats) => setDraft((d) => ({ ...d, seats }))}
            />
          </section>

          <section>
            <SectionTitle title="Main stand & buildings" note="£9k to re-clad" />
            <Swatches
              options={CLADDINGS.map((c) => ({ id: c.id, label: c.label, colours: [c.hex, c.hex] }))}
              value={draft.cladding}
              onChange={(cladding) => setDraft((d) => ({ ...d, cladding }))}
            />
          </section>

          <section>
            <SectionTitle title="Floodlights" note={stage < 2 ? "From a Small Professional Ground" : "Free"} />
            <Chips options={FLOODLIGHT_STYLES} value={draft.floodlights} onChange={(floodlights) => setDraft((d) => ({ ...d, floodlights }))} />
          </section>

          <section>
            <SectionTitle title="Pitch mowing" note="Free" />
            <Chips options={MOWING_PATTERNS} value={draft.mowing} onChange={(mowing) => setDraft((d) => ({ ...d, mowing }))} />
          </section>

          <section>
            <SectionTitle title="Home end" note="A deep single-tier Kop · atmosphere bonus" />
            <Chips
              options={[{ id: "none", label: "None" }, { id: "N", label: "North end" }, { id: "S", label: "South end" }]}
              value={draft.homeEnd ?? "none"}
              onChange={(id) => setDraft((d) => ({ ...d, homeEnd: id === "none" ? null : (id as "N" | "S") }))}
            />
          </section>
        </div>

        <div className="sticky bottom-0 border-t bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Button className="w-full" disabled={!changed} onClick={apply}>
            {changed ? (cost > 0 ? `Apply · ${fmtMoneyExact(cost)}` : "Apply · free") : "No changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ icon, title, note }: { icon?: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{icon}{title}</span>
      {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
    </div>
  );
}

function Swatches<T extends string>({ options, value, onChange }: { options: { id: T; label: string; colours: string[] }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={option.id === value}
          className={cn("flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] font-semibold", option.id === value ? "border-primary bg-primary/10" : "bg-background")}
        >
          <span className="flex h-6 w-full overflow-hidden rounded-md border border-black/10">
            {option.colours.map((colour, index) => <span key={index} className="flex-1" style={{ background: colour }} />)}
          </span>
          <span className="w-full truncate text-center">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange }: { options: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={option.id === value}
          className={cn("rounded-full border px-3 py-1.5 text-[12px] font-semibold", option.id === value ? "border-primary bg-primary text-primary-foreground" : "bg-background")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function standForAsset(state: GameState, assetId: string) {
  return assetById(state, assetId);
}
