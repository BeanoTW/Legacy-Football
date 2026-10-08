import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Armchair,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Fence,
  Hammer,
  HardHat,
  LayoutGrid,
  Lightbulb,
  Lock,
  Paintbrush,
  PencilLine,
  Plus,
  Sprout,
  Wrench,
  X,
} from "lucide-react";
import type { CapitalProjectType, GameState, InfrastructureAsset } from "@/lib/game/types";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
import { assessSpend } from "@/lib/game/finance";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundProgression } from "@/lib/game/groundPresentation";
import {
  ASSET_CONFIG,
  activateNextQueuedProjectInPlace,
  approveProject as approveProjectCompat,
  assetById,
  ensureInfrastructure,
  evaluateProject,
  projectCatalogue,
  queueProject,
  stadiumCapacity,
  stands as standAssets,
  type ProjectSpec,
} from "@/lib/game/infrastructure";
import {
  BUILDING_STYLES,
  CLADDINGS,
  DUGOUT_STYLES,
  FLOODLIGHT_STYLES,
  MOWING_PATTERNS,
  PERIMETER_COLOURS,
  PERIMETER_STYLES,
  ROOF_COLOURS,
  SCOREBOARD_STYLES,
  SEAT_SCHEMES,
  STAND_MATERIALS,
  STANDING_OPTIONS,
  STAND_VARIANTS,
  buildCapacityMultiplier,
  groundDesign,
  groundIdentity,
  levelAfterProject,
  roofOptionsFor,
  sceneLook,
  standBuild,
  type Cladding,
  type CornerSlot,
  type DugoutStyle,
  type GroundDesign,
  type GroundIdentityState,
  type Mowing,
  type RoofColour,
  type ScoreboardStyle,
  type SeatScheme,
  type StandBuild,
  type StandMaterial,
  type StandSide,
  type StandVariant,
} from "@/lib/game/groundIdentity";
import { cornerFormOptions, defaultMaterial, updateCorner, updateFixtures, updatePerimeter, updateStand, updateStandLook, updateSurroundings } from "@/lib/game/groundEditor";
import { buildQuote, queueStandBuild, renameStand, setGroundLook } from "@/lib/game/groundBuild";
import {
  CORNER_LADDER,
  STAND_LADDER,
  activeProjectFor,
  conditionSummary,
  developmentOptions,
  groundComponents,
  lockReason,
  maintenanceOptions,
  nextStageVerb,
  standOwnership,
  weeksLabel,
  type ComponentStatus,
  type ConditionSummary,
  type ProjectOption,
} from "@/lib/game/stadiumUx";
import { StadiumGround, type ComponentMarker } from "./StadiumGround";
import {
  BAND_HEX,
  CapacityGrowth,
  ConditionDot,
  ConditionLabel,
  ConditionMeter,
  FreeTag,
  KitStyles,
  Ladder,
  LockChip,
  ProjectProgress,
  Silhouette,
  WorkCard,
  priceLabel,
} from "./StudioKit";

/* =========================================================================
   Ground Studio
   -------------------------------------------------------------------------
   The stadium is the navigation. Tap a stand, a corner or a fixture; the
   panel underneath answers, in order: what you own, its condition, what you
   can change for free, what you can build next, what it costs and why it
   might not be possible yet.

     Customize = appearance, free and instant (teal)
     Maintain  = condition and repairs (paid)
     Develop   = physical growth: capacity, stage, roof, layout (paid, purple)
     Facilities (elsewhere) = services inside and around the ground
========================================================================= */

type Tab = "customize" | "maintain" | "develop";
type ApplyResult = { state: GameState; ok: boolean; reason?: string };
type Apply = (edit: (s: GameState) => ApplyResult, success?: string) => void;

type DevelopmentPlanItem = {
  id: string;
  assetId: string;
  assetName: string;
  spec: ProjectSpec;
  build?: StandBuild;
};

function previewDevelopmentState(state: GameState, items: DevelopmentPlanItem[]): GameState {
  if (!items.length) return state;
  const next = structuredClone(state);
  for (const item of items) {
    const asset = assetById(next, item.assetId);
    if (!asset) continue;
    const resultingLevel = item.build ? levelAfterProject(item.spec.type, asset.level) : null;
    for (const effect of item.spec.effects) {
      if (effect.kind === "capacity") {
        const multiplier = item.build && resultingLevel != null ? buildCapacityMultiplier(item.build, resultingLevel) : 1;
        asset.capacity = Math.max(0, asset.capacity + Math.round((effect.add * multiplier) / 50) * 50);
        asset.usableCapacity = asset.capacity;
      } else if (effect.kind === "level") {
        asset.level = Math.min(ASSET_CONFIG[asset.type].maxLevel, asset.level + effect.add);
      } else if (effect.kind === "condition") {
        asset.condition = Math.min(asset.maximumCondition, effect.to ?? asset.condition + (effect.add ?? 0));
      }
    }
    if (resultingLevel != null) asset.level = resultingLevel;
    if (item.build) {
      const identity = groundIdentity(next);
      next.groundIdentity = { ...identity, stands: { ...identity.stands, [item.assetId]: { ...item.build } } };
    }
  }
  return next;
}

const SIDES: StandSide[] = ["W", "E", "N", "S"];
const CORNERS: CornerSlot[] = ["NW", "NE", "SE", "SW"];
const SIDE_ROLE: Record<StandSide, string> = { W: "West side · main stand", E: "East side", N: "North end", S: "South end" };
const CORNER_NAME: Record<CornerSlot, string> = { NW: "North-West corner", NE: "North-East corner", SW: "South-West corner", SE: "South-East corner" };

const FIXTURES = {
  pitch: { label: "Pitch", icon: Sprout },
  lights: { label: "Floodlights", icon: Lightbulb },
  perimeter: { label: "Perimeter", icon: Fence },
  dugouts: { label: "Dugouts", icon: Armchair },
  scoreboard: { label: "Scoreboard", icon: Clock },
  surroundings: { label: "Car park & buildings", icon: Car },
  ground: { label: "Ground-wide look", icon: Paintbrush },
} as const;
type FixtureId = keyof typeof FIXTURES;

const GROUPS: { id: string; label: string; items: string[] }[] = [
  { id: "stands", label: "Stands", items: SIDES.map((side) => `stand:${side}`) },
  { id: "corners", label: "Corners", items: CORNERS.map((slot) => `corner:${slot}`) },
  { id: "ground", label: "Ground", items: ["pitch", "lights", "perimeter", "dugouts", "scoreboard"] },
  { id: "surroundings", label: "Surroundings", items: ["surroundings", "ground"] },
];
const groupOf = (id: string) => GROUPS.find((group) => group.items.includes(id)) ?? GROUPS[0];

/** Dark broadcast surface. Tokens feed the shared kit (StudioKit). */
const STUDIO_CSS = `@layer components {
.lf-studio { --lf-fg: #e7f1ec; --lf-muted: #8fa89e; --lf-card: #12251f; --lf-sunk: rgb(255 255 255 / 5.5%); --lf-line: rgb(196 232 216 / 11%);
  --lf-paid: #7657f2; --lf-paid-fg: #ffffff; --lf-paid-soft: rgb(140 112 255 / 15%); --lf-paid-text: #b9a6ff;
  --lf-free: #4fd6b4; --lf-free-soft: rgb(79 214 180 / 13%); --lf-warn: #fbbf24; --lf-bad: #fb7185;
  background: #0a1713; color: var(--lf-fg); color-scheme: dark; }
.lf-studio-head { background: linear-gradient(180deg, #11302a 0%, #0c1e19 100%); border-bottom: 1px solid var(--lf-line); }
.lf-studio-bar { background: #0d1d18; border-top: 1px solid var(--lf-line); border-bottom: 1px solid var(--lf-line); }
.lf-studio-input { height: 40px; width: 100%; min-width: 0; border-radius: 12px; border: 1px solid var(--lf-line); background: rgb(0 0 0 / 22%); padding: 0 12px; font-size: 14px; color: var(--lf-fg); }
.lf-studio-input:focus { outline: 2px solid #ffc53d; outline-offset: 1px; }
.lf-seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: rgb(0 0 0 / 28%); border: 1px solid var(--lf-line); }
.lf-seg > button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px; border-radius: 10px; font-size: 13px; font-weight: 700; color: var(--lf-muted); }
.lf-seg > button[aria-selected="true"] { background: #1d3a31; color: var(--lf-fg); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 8%); }
.lf-tile { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; border-radius: 12px; border: 1px solid var(--lf-line); background: var(--lf-sunk); padding: 9px 10px; text-align: left; font-size: 12.5px; font-weight: 650; color: var(--lf-fg); }
.lf-tile[aria-pressed="true"] { border-color: #ffc53d; box-shadow: inset 0 0 0 1px #ffc53d; background: rgb(255 197 61 / 8%); }
.lf-tile:disabled { opacity: .5; }
.lf-swatch { position: relative; flex: none; width: 36px; height: 36px; border-radius: 999px; border: 2px solid rgb(255 255 255 / 14%); overflow: hidden; display: flex; }
.lf-swatch[aria-pressed="true"] { border-color: #ffc53d; box-shadow: 0 0 0 3px rgb(255 197 61 / 28%); }
.lf-map-tile { position: relative; display: flex; flex-direction: column; justify-content: space-between; gap: 2px; min-width: 0; overflow: hidden; border-radius: 10px; border: 1px solid rgb(255 255 255 / 14%);
  background: rgb(18 37 31 / 92%); padding: 6px 7px 8px; text-align: left; color: var(--lf-fg); }
.lf-map-tile[aria-pressed="true"] { border-color: #ffc53d; box-shadow: 0 0 0 2px rgb(255 197 61 / 45%); }
.lf-map-empty { border: 1.5px dashed #a78bfa; background: rgb(91 63 196 / 26%); align-items: center; justify-content: center; text-align: center; color: #e4dcff; }
.lf-map-pitch { background: repeating-linear-gradient(180deg, #2f7a3c 0 14px, #2a6f36 14px 28px); border-color: rgb(255 255 255 / 30%); align-items: center; justify-content: center; }
.lf-scroll-x { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 2px 4px; }
.lf-scroll-x::-webkit-scrollbar { display: none; }
.lf-scroll-x > * { flex: none; }
@keyframes lf-toast-in { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
.lf-toast { animation: lf-toast-in .18s ease-out; }
}`;

/* ------------------------------------------------------------------ */
/* Build planner (also used by older Facilities code paths)            */
/* ------------------------------------------------------------------ */

/** The build the planner opens with: like-for-like where the new stage allows it. */
function defaultBuild(state: GameState, asset: InfrastructureAsset, spec: ProjectSpec): StandBuild {
  const roofs = roofOptionsFor(levelAfterProject(spec.type, asset.level));
  const current = standBuild(state, asset.id, asset.level);
  return {
    standing: current.standing,
    roof: roofs.some((r) => r.id === current.roof) ? current.roof : roofs[0]?.id ?? "pitched",
    variant: current.variant ?? "traditional",
  };
}

/** Price, places and lock of a level-raising option at a given build. */
function plannedOption(state: GameState, asset: InfrastructureAsset, option: ProjectOption, build: StandBuild): ProjectOption {
  const quote = buildQuote(state, option.spec.cost, asset.id, option.spec.type as CapitalProjectType, build);
  const capacityEffect = option.spec.effects.find((e) => e.kind === "capacity") as { add: number } | undefined;
  const places = capacityEffect ? Math.round((capacityEffect.add * buildCapacityMultiplier(build, quote.resultingLevel)) / 50) * 50 : 0;
  return {
    ...option,
    spec: { ...option.spec, cost: quote.cost },
    addsPlaces: places,
    lock: lockReason(state, asset.id, option.spec, option.evaluation, quote.cost),
  };
}

export function StandBuildChooser({
  state,
  asset,
  spec,
  onConfirm,
  onCancel,
  onBuildChange,
}: {
  state: GameState;
  asset: InfrastructureAsset;
  spec: ProjectSpec;
  onConfirm: (build: StandBuild) => void;
  onCancel: () => void;
  onBuildChange?: (build: StandBuild) => void;
}) {
  const resulting = levelAfterProject(spec.type, asset.level);
  const roofs = roofOptionsFor(resulting);
  const [build, setBuild] = useState<StandBuild>(() => defaultBuild(state, asset, spec));
  useEffect(() => { onBuildChange?.(build); }, [build, onBuildChange]);
  const quote = buildQuote(state, spec.cost, asset.id, spec.type as CapitalProjectType, build);
  const capacityEffect = spec.effects.find((e) => e.kind === "capacity") as { add: number } | undefined;
  const addedCapacity = capacityEffect ? Math.round((capacityEffect.add * buildCapacityMultiplier(build, resulting)) / 50) * 50 : 0;
  const lock = lockReason(state, asset.id, spec, evaluateProject(state, asset.id, spec.type), quote.cost);
  const toName = ASSET_CONFIG.stand.levels[resulting - 1];
  const delta = (multiplier: number) => (multiplier === 1 ? "Base" : `${multiplier > 1 ? "+" : "−"}${Math.abs(Math.round((multiplier - 1) * 100))}%`);
  const variantShape = (id: StandVariant) => (id === "longLow" ? [46, 8] : id === "compact" ? [28, 16] : [38, 11]);

  return (
    <div className="lfk space-y-4">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onCancel} className="lfk-btn-quiet size-10 shrink-0 p-0" aria-label="Back"><ChevronLeft className="size-5" /></button>
        <div className="min-w-0">
          <div className="lfk-eyebrow" style={{ color: "var(--k-paid-text)" }}>Plan the build</div>
          <div className="font-display text-[19px] leading-tight">{asset.name} → {toName}</div>
        </div>
      </div>

      {resulting >= 2 ? (
        <PlannerGroup title="Layout" note={STAND_VARIANTS.find((o) => o.id === (build.variant ?? "traditional"))}>
          {STAND_VARIANTS.map((option) => {
            const [w, h] = variantShape(option.id);
            return (
              <PlannerOption key={option.id} active={(build.variant ?? "traditional") === option.id} onClick={() => setBuild((b) => ({ ...b, variant: option.id }))} label={option.label} cost={delta(option.cost)}>
                <svg viewBox="0 0 56 24" className="h-6 w-14" aria-hidden><rect x={(56 - w) / 2} y={22 - h} width={w} height={h} rx={1.5} fill="currentColor" fillOpacity={0.55} /><path d="M2 22.5H54" stroke="currentColor" strokeOpacity={0.4} /></svg>
              </PlannerOption>
            );
          })}
        </PlannerGroup>
      ) : null}

      <PlannerGroup title="Spectators" note={STANDING_OPTIONS.find((o) => o.id === build.standing)}>
        {STANDING_OPTIONS.map((option) => (
          <PlannerOption key={option.id} active={build.standing === option.id} onClick={() => setBuild((b) => ({ ...b, standing: option.id }))} label={option.label} cost={delta(option.cost)}>
            <span className="text-[10.5px] font-semibold lfk-muted">×{option.capacity.toFixed(2)} places</span>
          </PlannerOption>
        ))}
      </PlannerGroup>

      {roofs.length > 0 ? (
        <PlannerGroup title="Roof" note={roofs.find((o) => o.id === build.roof)}>
          {roofs.map((option) => (
            <PlannerOption key={option.id} active={build.roof === option.id} onClick={() => setBuild((b) => ({ ...b, roof: option.id }))} label={option.label.replace(" + hospitality", "")} cost={delta(option.cost)}>
              <Silhouette shape={option.id === "pitched" ? "pitched" : option.id === "cantilever" ? "cantilever" : "twoTier"} />
            </PlannerOption>
          ))}
        </PlannerGroup>
      ) : (
        <div className="lfk-sunk flex items-center gap-3 px-3 py-2.5 text-[12px]">
          <Silhouette shape={resulting >= 2 ? "pitched" : "cover"} />
          <span><strong>{resulting >= 2 ? "Proper roof included." : "Basic cover included."}</strong> <span className="lfk-muted">Cantilever roofs open up at {ASSET_CONFIG.stand.levels[2]}.</span></span>
        </div>
      )}

      <div className="lfk-card sticky bottom-0 z-[1] p-2.5 shadow-[0_-14px_24px_-14px_rgb(0_0_0/60%)]">
        <div className="flex items-baseline justify-between gap-2 px-1 text-[12px]">
          <span className="lfk-num"><strong className="font-display text-[18px]">{priceLabel(quote.cost)}</strong></span>
          <span className="lfk-num lfk-muted font-semibold">{addedCapacity ? `+${addedCapacity.toLocaleString("en-GB")} places` : "No new places"} · {weeksLabel(spec.durationWeeks)}</span>
        </div>
        {lock ? <LockChip lock={lock} className="mt-1 px-1" /> : null}
        <button type="button" className="lfk-btn-paid mt-2 w-full" disabled={Boolean(lock)} onClick={() => onConfirm(build)}>
          {lock ? <><Lock className="size-4" /> Not available yet</> : `Add to plan · ${fmtMoneyExact(quote.cost)}`}
        </button>
      </div>
    </div>
  );
}

function PlannerGroup({ title, note, children }: { title: string; note?: { pros: string; cons: string }; children: ReactNode }) {
  return (
    <section>
      <div className="lfk-eyebrow mb-1.5">{title}</div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
      {note ? (
        <div className="mt-1.5 text-[11px] leading-snug">
          <span style={{ color: "var(--lf-free, #13896f)" }}>+ {note.pros}</span>
          <span className="lfk-muted"> · − {note.cons}</span>
        </div>
      ) : null}
    </section>
  );
}

function PlannerOption({ active, onClick, label, cost, children }: { active: boolean; onClick: () => void; label: string; cost: string; children?: ReactNode }) {
  return (
    <button type="button" className="lf-tile min-h-[84px] items-center justify-between text-center" aria-pressed={active} onClick={onClick}>
      <span className="grid h-7 w-full place-items-center">{children}</span>
      <span className="w-full text-[12px] leading-tight">{label}</span>
      <span className="lfk-muted text-[10px] font-bold">{cost}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The sheet                                                           */
/* ------------------------------------------------------------------ */

export function GroundStudioSheet({
  open,
  onOpenChange,
  state,
  update,
  initialSelection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  /** Open on a component, e.g. "stand:E" or "corner:SW". */
  initialSelection?: string;
}) {
  const [selection, setSelection] = useState<string>(initialSelection ?? "stand:W");
  // A part that is costing places opens on its repairs; otherwise on Develop.
  const tabFor = (id: string): Tab | null => {
    if (!id.startsWith("stand:") && !id.startsWith("corner:")) return null;
    const status = state.infrastructure ? groundComponents(state)[id] : undefined;
    return status?.condition?.urgent && !status.works ? "maintain" : null;
  };
  // The player's own tab choice is remembered; an urgent part only borrows Maintain.
  const [userTab, setUserTab] = useState<Tab>("develop");
  const [tab, setTabState] = useState<Tab>(() => tabFor(initialSelection ?? "stand:W") ?? "develop");
  const setTab = (next: Tab) => { setUserTab(next); setTabState(next); };
  const [picker, setPicker] = useState(false);
  const [planning, setPlanning] = useState<{ assetId: string; spec: ProjectSpec } | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const [planItems, setPlanItems] = useState<DevelopmentPlanItem[]>([]);
  const [draftBuild, setDraftBuild] = useState<StandBuild | null>(null);
  const [showPlanned, setShowPlanned] = useState(true);
  const [reviewingPlan, setReviewingPlan] = useState(false);
  const hasCornerAssets = Boolean(state.infrastructure?.assets.some((asset) => asset.type === "cornerStand"));

  // Old saves may already have infrastructure but pre-date dedicated corner
  // assets. Upgrade them as soon as Ground Studio opens instead of requiring
  // the player to advance a week before corner development appears.
  useEffect(() => {
    if (!open || !state.infrastructure || hasCornerAssets) return;
    update((current) => {
      const next = structuredClone(current);
      ensureInfrastructure(next);
      return next;
    });
  }, [open, hasCornerAssets, state.infrastructure, update]);

  useEffect(() => {
    if (!initialSelection) return;
    setSelection(initialSelection);
    setTabState(tabFor(initialSelection) ?? userTab);
    // Only when the caller asks for a different part, not on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelection]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.tone === "ok" ? 3200 : 4600);
    return () => clearTimeout(timer);
  }, [toast]);

  const identity = groundIdentity(state);
  const kit = clubKitFor(state).home;
  const look = useMemo(() => sceneLook(state, { body: kit.body, secondary: kit.secondary }), [state, kit.body, kit.secondary]);
  const planningAssetLive = planning ? assetById(state, planning.assetId) : undefined;
  const draftItem: DevelopmentPlanItem | null = planning && planningAssetLive && draftBuild
    ? { id: `draft:${planning.assetId}`, assetId: planning.assetId, assetName: planningAssetLive.name, spec: planning.spec, build: draftBuild }
    : null;
  const previewItems = draftItem ? [...planItems.filter((item) => item.assetId !== draftItem.assetId), draftItem] : planItems;
  const previewState = useMemo(() => previewDevelopmentState(state, previewItems), [state, previewItems]);
  const displayState = showPlanned && previewItems.length ? previewState : state;
  const design = groundDesign(displayState);
  const stage = displayState.infrastructure ? groundProgression(displayState).visualStage : 0;
  const components = useMemo(() => groundComponents(state), [state]);
  const standBySide = new Map(standAssets(state).map((asset) => [asset.location, asset]));
  const totalPlaces = stadiumCapacity(state);
  const plannedPlaces = stadiumCapacity(previewState);
  const planCost = planItems.reduce((sum, item) => {
    if (!item.build) return sum + item.spec.cost;
    return sum + buildQuote(state, item.spec.cost, item.assetId, item.spec.type as CapitalProjectType, item.build).cost;
  }, 0);

  const labels: Record<string, string> = {
    ...Object.fromEntries(SIDES.map((side) => [`stand:${side}`, standBySide.get(side)?.name ?? SIDE_ROLE[side]])),
    ...Object.fromEntries(CORNERS.map((slot) => [`corner:${slot}`, CORNER_NAME[slot]])),
    ...Object.fromEntries(Object.entries(FIXTURES).map(([id, fixture]) => [id, fixture.label])),
  };

  const markers: Record<string, ComponentMarker> = {};
  const works: string[] = [];
  const wear: Partial<Record<StandSide, number>> = {};
  for (const item of Object.values(components)) {
    if (item.works) { markers[item.id] = "works"; works.push(item.id); }
    else if (item.empty) markers[item.id] = "empty";
    else if (item.condition?.urgent) markers[item.id] = "urgent";
    else if (item.condition?.attention) markers[item.id] = "attention";
    if (item.id.startsWith("stand:") && item.condition) wear[item.id.slice(6) as StandSide] = item.condition.pct;
  }
  const attentionCount = Object.values(components).filter((item) => item.condition?.attention && item.id !== "pitch").length;

  const choose = (id: string | null) => {
    const next = id ?? "ground";
    setPlanning(null);
    setDraftBuild(null);
    setPicker(false);
    setSelection(next);
    setTabState(tabFor(next) ?? userTab);
  };

  const apply: Apply = (edit, success) => {
    const preview = edit(state);
    if (!preview.ok) { setToast({ tone: "error", text: preview.reason ?? "Not available" }); return; }
    if (success) setToast({ tone: "ok", text: success });
    update((current) => {
      const result = edit(current);
      return result.ok ? result.state : current;
    });
  };
  const approve = (asset: InfrastructureAsset, option: ProjectOption) =>
    apply((s) => approveProjectCompat(s, asset.id, option.spec.type), `Approved · ${option.title} · ${fmtMoneyExact(option.spec.cost)}`);
  const applyLook = (change: Parameters<typeof setGroundLook>[1]) => apply((s) => setGroundLook(s, change));

  const group = groupOf(selection);
  const step = (dir: 1 | -1) => {
    const items = group.items;
    choose(items[(items.indexOf(selection) + dir + items.length) % items.length]);
  };
  const status = components[selection];
  const planningAsset = planning ? assetById(state, planning.assetId) : undefined;

  const addSimplePlan = (asset: InfrastructureAsset, option: ProjectOption) => {
    setPlanItems((items) => [...items.filter((item) => item.assetId !== asset.id), {
      id: `${asset.id}:${option.spec.type}`,
      assetId: asset.id,
      assetName: asset.name,
      spec: option.spec,
    }]);
    setShowPlanned(true);
    setReviewingPlan(false);
    setToast({ tone: "ok", text: `Added ${asset.name} to the development plan.` });
  };

  const approveDevelopmentPlan = () => {
    const combinedSpend = assessSpend(state, planCost);
    if (!combinedSpend.allowed) {
      setToast({ tone: "error", text: `Development plan · ${combinedSpend.reason}` });
      return;
    }
    let next = state;
    for (const item of planItems) {
      const result = item.build
        ? queueStandBuild(next, item.assetId, item.spec.type as CapitalProjectType, item.build)
        : queueProject(next, item.assetId, item.spec.type as CapitalProjectType);
      if (!result.ok) {
        setToast({ tone: "error", text: `${item.assetName}: ${result.reason ?? "Unable to queue project."}` });
        return;
      }
      next = result.state;
    }
    activateNextQueuedProjectInPlace(next);
    update(() => next);
    setPlanItems([]);
    setDraftBuild(null);
    setPlanning(null);
    setReviewingPlan(false);
    setShowPlanned(false);
    setToast({ tone: "ok", text: "Development plan approved. Free major and minor construction lanes will start now; remaining stages stay queued." });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="lf-studio lfk flex h-[96dvh] flex-col gap-0 overflow-hidden rounded-t-2xl border-0 bg-[#0a1713] p-0 text-[#e7f1ec] [color-scheme:dark]">
        <style>{STUDIO_CSS}</style>
        <KitStyles />

        {/* Header: the ground and what it holds. */}
        <header className="lf-studio-head flex items-center gap-3 px-4 pb-2.5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="lfk-eyebrow">Ground Studio</div>
            <SheetTitle className="truncate font-display text-[21px] leading-tight text-[var(--lf-fg)]">{identity.groundName ?? "Your ground"}</SheetTitle>
          </div>
          <div className="mr-9 shrink-0 text-right">
            <div className="lfk-num font-display text-[17px] leading-none">{(showPlanned && previewItems.length ? plannedPlaces : totalPlaces).toLocaleString("en-GB")}</div>
            <div className="lfk-eyebrow mt-0.5">{showPlanned && previewItems.length ? "planned places" : "places"}</div>
          </div>
        </header>

        {/* The ground is the navigation. */}
        <div className={cn("relative min-h-0 overflow-hidden transition-[flex-grow] duration-300 [&_.lf-ground-viewport]:!h-full [&_.lf-ground-viewport]:!min-h-0 [&_.lf-ground-viewport]:!rounded-none", planning ? "flex-[0.42]" : "flex-[1.05]")}>
          <StadiumGround
            stage={stage}
            hotspots={[]}
            selectedId={null}
            onSelect={() => {}}
            look={look}
            design={design}
            selection={selection === "ground" ? null : selection}
            onSelectComponent={(id) => { setTouched(true); if (id) choose(id); }}
            componentLabels={labels}
            componentMarkers={markers}
            works={works}
            wear={wear}
            pitchCondition={assetById(state, "pitch")?.condition}
          />
          {!touched ? (
            <div className="pointer-events-none absolute bottom-2.5 left-1/2 z-[8] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-[10.5px] font-semibold text-white backdrop-blur-sm">
              Tap any part of the ground
            </div>
          ) : null}
          {picker ? (
            <GroundMap
              components={components}
              labels={labels}
              selection={selection}
              totalPlaces={totalPlaces}
              attentionCount={attentionCount}
              onPick={choose}
              onClose={() => setPicker(false)}
            />
          ) : null}
        </div>

        {planItems.length || draftItem ? (
          <div className="lf-studio-bar flex items-center gap-2 px-2.5 py-2">
            <div className="lf-seg min-w-0 flex-1 !grid-cols-2">
              <button type="button" aria-selected={!showPlanned} onClick={() => setShowPlanned(false)}>Current</button>
              <button type="button" aria-selected={showPlanned} onClick={() => setShowPlanned(true)}>Planned</button>
            </div>
            <button
              type="button"
              className="lfk-btn-paid h-10 shrink-0 px-3"
              disabled={!planItems.length}
              onClick={() => { setReviewingPlan(true); setPlanning(null); setDraftBuild(null); }}
            >
              {planItems.length ? `Review plan · ${planItems.length}` : "Previewing"}
            </button>
          </div>
        ) : null}

        {/* Selected component: name, status, quick stepping, full map. */}
        <div className="lf-studio-bar flex items-center gap-2 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setPicker((value) => !value)}
            className={cn("relative grid size-10 shrink-0 place-items-center rounded-xl border", picker ? "border-[#ffc53d] bg-[#ffc53d]/15 text-[#ffc53d]" : "border-[var(--lf-line)] bg-white/5")}
            aria-label="Show every part of the ground"
            aria-expanded={picker}
          >
            {picker ? <X className="size-4" /> : <LayoutGrid className="size-4" />}
            {!picker && attentionCount > 0 ? <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-400 text-[9px] font-black text-amber-950">{attentionCount}</span> : null}
          </button>
          <button type="button" onClick={() => setPicker(true)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <SelectionGlyph id={selection} status={status} />
              <span className="truncate text-[15px] font-bold">{labels[selection]}</span>
            </div>
            <div className="lfk-muted truncate text-[11px]">{selectionSubtitle(selection, state, status)}</div>
          </button>
          <div className="flex shrink-0 gap-1">
            <button type="button" className="grid size-9 place-items-center rounded-lg bg-white/5" aria-label={`Previous in ${group.label}`} onClick={() => step(-1)}><ChevronLeft className="size-4" /></button>
            <button type="button" className="grid size-9 place-items-center rounded-lg bg-white/5" aria-label={`Next in ${group.label}`} onClick={() => step(1)}><ChevronRight className="size-4" /></button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-3 scroll-pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {planning && planningAsset ? (
            <StandBuildChooser
              key={`${planning.assetId}:${planning.spec.type}`}
              state={state}
              asset={planningAsset}
              spec={planning.spec}
              onCancel={() => { setPlanning(null); setDraftBuild(null); }}
              onBuildChange={(build) => { setDraftBuild(build); setShowPlanned(true); }}
              onConfirm={(build) => {
                const quote = buildQuote(state, planning.spec.cost, planningAsset.id, planning.spec.type as CapitalProjectType, build);
                setPlanItems((items) => [...items.filter((item) => item.assetId !== planningAsset.id), {
                  id: `${planningAsset.id}:${planning.spec.type}`,
                  assetId: planningAsset.id,
                  assetName: planningAsset.name,
                  spec: planning.spec,
                  build,
                }]);
                setToast({ tone: "ok", text: `Added ${planningAsset.name} · ${fmtMoneyExact(quote.cost)} to the development plan.` });
                setDraftBuild(null);
                setPlanning(null);
                setShowPlanned(true);
                setTab("develop");
              }}
            />
          ) : reviewingPlan ? (
            <DevelopmentPlanReview
              items={planItems}
              state={state}
              currentPlaces={totalPlaces}
              plannedPlaces={plannedPlaces}
              totalCost={planCost}
              onRemove={(id) => setPlanItems((items) => items.filter((item) => item.id !== id))}
              onBack={() => setReviewingPlan(false)}
              onApprove={approveDevelopmentPlan}
            />
          ) : (
            <SelectionPanel
              selection={selection}
              state={state}
              design={design}
              identity={identity}
              kit={kit}
              tab={tab}
              setTab={setTab}
              apply={apply}
              approve={approve}
              applyLook={applyLook}
              plan={(asset, spec) => { setReviewingPlan(false); setPlanning({ assetId: asset.id, spec }); setDraftBuild(null); }}
              planSimple={addSimplePlan}
              standBySide={standBySide}
              totalPlaces={totalPlaces}
            />
          )}
        </div>

        {toast ? (
          <div
            role="status"
            className={cn(
              "lf-toast absolute inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[12.5px] font-semibold shadow-2xl",
              toast.tone === "ok" ? "bg-[#d9fbef] text-[#06372b]" : "bg-[#ffe4e8] text-[#5f0a1d]",
            )}
          >
            {toast.tone === "ok" ? <Check className="mt-0.5 size-4 shrink-0" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
            <span className="min-w-0 flex-1">{toast.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}><X className="size-4 opacity-60" /></button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DevelopmentPlanReview({
  items,
  state,
  currentPlaces,
  plannedPlaces,
  totalCost,
  onRemove,
  onBack,
  onApprove,
}: {
  items: DevelopmentPlanItem[];
  state: GameState;
  currentPlaces: number;
  plannedPlaces: number;
  totalCost: number;
  onRemove: (id: string) => void;
  onBack: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onBack} className="lfk-btn-quiet size-10 shrink-0 p-0" aria-label="Back"><ChevronLeft className="size-5" /></button>
        <div className="min-w-0 flex-1">
          <div className="lfk-eyebrow" style={{ color: "var(--k-paid-text)" }}>Development plan</div>
          <div className="font-display text-[20px] leading-tight">Review before approval</div>
          <div className="mt-1 text-[11.5px] lfk-muted">Nothing below is permanent until you approve the plan.</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="lfk-sunk px-2.5 py-2">
          <div className="lfk-eyebrow">Projects</div>
          <div className="lfk-num font-display text-[19px]">{items.length}</div>
        </div>
        <div className="lfk-sunk px-2.5 py-2">
          <div className="lfk-eyebrow">Capacity</div>
          <div className="lfk-num font-display text-[19px]">+{Math.max(0, plannedPlaces - currentPlaces).toLocaleString("en-GB")}</div>
        </div>
        <div className="lfk-sunk px-2.5 py-2">
          <div className="lfk-eyebrow">Planned cost</div>
          <div className="lfk-num font-display text-[16px]">{priceLabel(totalCost)}</div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => {
          const asset = assetById(state, item.assetId);
          const quote = item.build
            ? buildQuote(state, item.spec.cost, item.assetId, item.spec.type as CapitalProjectType, item.build).cost
            : item.spec.cost;
          return (
            <div key={item.id} className="lfk-card flex items-center gap-3 p-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[12px] font-black text-violet-200">{index + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{asset?.name ?? item.assetName}</div>
                <div className="truncate text-[11px] lfk-muted">{item.spec.title.replace(`${asset?.name ?? item.assetName} — `, "")} · {weeksLabel(item.spec.durationWeeks)}</div>
                {item.build ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="lfk-tag lfk-tag-plain">{item.build.variant ?? "traditional"}</span>
                    <span className="lfk-tag lfk-tag-plain">{item.build.standing}</span>
                    <span className="lfk-tag lfk-tag-plain">{item.build.roof}</span>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="lfk-num text-[12px] font-bold">{fmtMoneyExact(quote)}</div>
                <button type="button" className="mt-1 text-[10.5px] font-semibold text-rose-300" onClick={() => onRemove(item.id)}>Remove</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="lfk-sunk px-3 py-2.5 text-[11.5px] lfk-muted">
        Major stadium work is staged. The first project starts now; each remaining major project stays queued and begins automatically when the previous stage finishes.
      </div>

      <button type="button" className="lfk-btn-paid w-full" disabled={!items.length} onClick={onApprove}>
        <Check className="size-4" /> Approve development plan · {fmtMoneyExact(totalCost)}
      </button>
    </div>
  );
}

function selectionSubtitle(id: string, state: GameState, status?: ComponentStatus): string {
  if (id.startsWith("stand:") && status?.assetId) {
    const asset = assetById(state, status.assetId);
    if (!asset) return "";
    return `${SIDE_ROLE[asset.location as StandSide].replace(" · main stand", " · main")} · ${asset.capacity.toLocaleString("en-GB")} places`;
  }
  if (id.startsWith("corner:")) {
    if (!status || status.empty) return status?.works ? "Corner stand being built" : "Empty · no places yet";
    const asset = status.assetId ? assetById(state, status.assetId) : undefined;
    return asset ? `${ASSET_CONFIG.cornerStand.levels[asset.level - 1]} · ${asset.capacity.toLocaleString("en-GB")} places` : "";
  }
  if (id === "pitch") return "Mowing pattern · free";
  if (id === "ground") return "Name and default colours · free";
  return "Appearance · free";
}

function SelectionGlyph({ id, status }: { id: string; status?: ComponentStatus }) {
  if (status?.works) return <HardHat className="size-3.5 shrink-0 text-amber-400" />;
  if (status?.empty) return <span className="grid size-4 shrink-0 place-items-center rounded-full border border-dashed border-violet-300 text-[10px] font-black text-violet-200">+</span>;
  if (status?.condition) return <ConditionDot band={status.condition.band} />;
  const fixture = FIXTURES[id as FixtureId];
  if (fixture) { const Icon = fixture.icon; return <Icon className="size-3.5 shrink-0 text-[var(--lf-free)]" />; }
  return null;
}

/* ------------------------------------------------------------------ */
/* The ground at a glance: grouped navigation + status in one picture  */
/* ------------------------------------------------------------------ */

function GroundMap({
  components,
  labels,
  selection,
  totalPlaces,
  attentionCount,
  onPick,
  onClose,
}: {
  components: Record<string, ComponentStatus>;
  labels: Record<string, string>;
  selection: string;
  totalPlaces: number;
  attentionCount: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const live = Object.values(components).filter((item) => item.works).length;
  const empty = Object.values(components).filter((item) => item.empty && !item.works).length;
  const tile = (id: string, area: string) => {
    const item = components[id];
    const active = id === selection;
    const isCorner = id.startsWith("corner:");
    if (isCorner && item?.empty && !item.works) {
      return (
        <button key={id} type="button" style={{ gridArea: area }} className="lf-map-tile lf-map-empty" aria-pressed={active} onClick={() => onPick(id)} aria-label={`${labels[id]}: empty, build a corner stand`}>
          <Plus className="size-4" />
          <span className="text-[9.5px] font-extrabold uppercase tracking-wide">Build</span>
        </button>
      );
    }
    return (
      <button key={id} type="button" style={{ gridArea: area }} className={cn("lf-map-tile", item?.works && "lfk-hatch")} aria-pressed={active} onClick={() => onPick(id)}>
        <span className={cn("block min-w-0 font-bold leading-tight [overflow-wrap:anywhere]", isCorner ? "text-[9.5px]" : id === "stand:W" || id === "stand:E" ? "text-[10.5px]" : "text-[11.5px]", item?.works && "rounded bg-black/70 px-1")}>
          {isCorner ? id.slice(7) : labels[id]}
        </span>
        <span className={cn("flex items-center gap-1 text-[10px] font-semibold", item?.works && "rounded bg-black/70 px-1")}>
          {item?.works ? <HardHat className="size-3 text-amber-300" /> : item?.condition ? <ConditionDot band={item.condition.band} size={7} /> : null}
          <span className="lfk-num">{item ? item.capacity.toLocaleString("en-GB") : ""}</span>
        </span>
        {item?.condition && !item.works ? <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: BAND_HEX[item.condition.band] }} /> : null}
      </button>
    );
  };
  return (
    <div className="absolute inset-0 z-[12] flex flex-col gap-2 overflow-y-auto bg-[#08130f]/95 px-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-2">
        <div className="lfk-eyebrow">Every part · north at top</div>
        <button type="button" className="text-[11px] font-semibold text-[var(--lf-muted)]" onClick={onClose}>Close</button>
      </div>
      <div className="lf-scroll-x -mx-0.5 !gap-1.5 !pb-0">
        <span className="lfk-tag lfk-tag-plain lfk-num">{totalPlaces.toLocaleString("en-GB")} places</span>
        {attentionCount ? <span className="lfk-tag" style={{ background: "rgb(250 204 21 / 14%)", color: "#fde68a" }}>{attentionCount} need{attentionCount === 1 ? "s" : ""} repair</span> : null}
        {live ? <span className="lfk-tag" style={{ background: "rgb(245 158 11 / 14%)", color: "#fcd34d" }}><HardHat className="size-3" />{live} under way</span> : null}
        {empty ? <span className="lfk-tag lfk-tag-paid"><Plus className="size-3" />{empty} empty corner{empty === 1 ? "" : "s"}</span> : null}
      </div>
      <div
        className="mx-auto grid w-full max-w-[360px] min-h-0 flex-1 gap-1.5"
        style={{ gridTemplateColumns: "68px minmax(0,1fr) 68px", gridTemplateRows: "46px minmax(84px,1fr) 46px", gridTemplateAreas: `"nw n ne" "w p e" "sw s se"` }}
      >
        {tile("corner:NW", "nw")}
        {tile("stand:N", "n")}
        {tile("corner:NE", "ne")}
        {tile("stand:W", "w")}
        <button type="button" style={{ gridArea: "p" }} className="lf-map-tile lf-map-pitch" aria-pressed={selection === "pitch"} onClick={() => onPick("pitch")}>
          <span className="rounded bg-black/35 px-1.5 text-[11px] font-bold">Pitch</span>
        </button>
        {tile("stand:E", "e")}
        {tile("corner:SW", "sw")}
        {tile("stand:S", "s")}
        {tile("corner:SE", "se")}
      </div>
      <div className="lf-scroll-x -mx-0.5 snap-x scroll-px-3 !gap-1.5 !pb-1 !pr-5" aria-label="Ground and surroundings">
        {[...GROUPS[2].items, ...GROUPS[3].items].filter((id) => id !== "pitch").map((id) => {
          const fixture = FIXTURES[id as FixtureId];
          const Icon = fixture.icon;
          return (
            <button key={id} type="button" className="lf-tile snap-start shrink-0 flex-row items-center whitespace-nowrap px-2.5 py-1.5 text-[12px]" aria-pressed={selection === id} onClick={() => onPick(id)}>
              <Icon className="size-3.5 text-[var(--lf-free)]" />{fixture.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

interface PanelProps {
  selection: string;
  state: GameState;
  design: GroundDesign;
  identity: GroundIdentityState;
  kit: { body: string; secondary: string };
  tab: Tab;
  setTab: (tab: Tab) => void;
  apply: Apply;
  approve: (asset: InfrastructureAsset, option: ProjectOption) => void;
  applyLook: (change: Parameters<typeof setGroundLook>[1]) => void;
  plan: (asset: InfrastructureAsset, spec: ProjectSpec) => void;
  planSimple: (asset: InfrastructureAsset, option: ProjectOption) => void;
  standBySide: Map<string, InfrastructureAsset>;
  totalPlaces: number;
}

function SelectionPanel(props: PanelProps) {
  const { selection, state } = props;
  if (selection.startsWith("stand:")) {
    const asset = props.standBySide.get(selection.slice(6));
    return asset ? <StandPanel key={asset.id} {...props} asset={asset} /> : <EmptyNote text="This side has no stand record yet. Advance a week to survey the ground." />;
  }
  if (selection.startsWith("corner:")) {
    const asset = assetById(state, `corner-${selection.slice(7)}`);
    return asset ? <CornerPanel key={asset.id} {...props} asset={asset} slot={selection.slice(7) as CornerSlot} /> : <EmptyNote text="Corner records appear once the ground has been surveyed." />;
  }
  return <FixturePanel {...props} id={selection as FixtureId} />;
}

function EmptyNote({ text }: { text: string }) {
  return <div className="lfk-sunk px-3 py-3 text-[12px] lfk-muted">{text}</div>;
}

/** Owned · condition · stage, readable before any tab is opened. */
function StatusStrip({ capacity, usable, condition, stageName, stage, maxStage }: { capacity: number; usable: number; condition: ConditionSummary; stageName: string; stage: number; maxStage: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="lfk-sunk px-2.5 py-2">
        <div className="lfk-eyebrow">Places</div>
        <div className="lfk-num font-display text-[18px] leading-tight">{capacity.toLocaleString("en-GB")}</div>
        <div className={cn("text-[10px] font-semibold", usable < capacity ? "text-amber-300" : "lfk-muted")}>{usable < capacity ? `${(capacity - usable).toLocaleString("en-GB")} unusable` : "All open"}</div>
      </div>
      <div className="lfk-sunk px-2.5 py-2">
        <div className="lfk-eyebrow">Condition</div>
        <div className="truncate text-[13px] font-bold leading-[22px]" style={{ color: BAND_HEX[condition.band] }}>{condition.label}</div>
        <ConditionMeter summary={condition} className="mt-0.5" />
      </div>
      <div className="lfk-sunk px-2.5 py-2">
        <div className="lfk-eyebrow">Stage {stage}/{maxStage}</div>
        <div className="text-[12.5px] font-bold leading-tight">{stageName}</div>
      </div>
    </div>
  );
}

function Tabs({ tab, setTab, condition, works }: { tab: Tab; setTab: (tab: Tab) => void; condition: ConditionSummary; works: boolean }) {
  return (
    <div className="lf-seg" role="tablist" aria-label="What to do">
      <button type="button" role="tab" aria-selected={tab === "customize"} onClick={() => setTab("customize")}>
        <Paintbrush className="size-3.5" />Customize
      </button>
      <button type="button" role="tab" aria-selected={tab === "maintain"} onClick={() => setTab("maintain")}>
        <Wrench className="size-3.5" />Maintain{condition.attention ? <ConditionDot band={condition.band} size={7} /> : null}
      </button>
      <button type="button" role="tab" aria-selected={tab === "develop"} onClick={() => setTab("develop")}>
        {works ? <HardHat className="size-3.5 text-amber-400" /> : <Hammer className="size-3.5" />}Develop
      </button>
    </div>
  );
}

function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <div className="lfk-eyebrow">{title}</div>
      {right}
    </div>
  );
}

/* ---------------- Stand ---------------- */

function StandPanel({ asset, ...props }: PanelProps & { asset: InfrastructureAsset }) {
  const { state, tab, setTab } = props;
  const side = asset.location as StandSide;
  const condition = conditionSummary(asset);
  const owned = standOwnership(state, asset);
  const project = activeProjectFor(state, asset.id);
  return (
    <div className="space-y-3">
      <StatusStrip capacity={owned.capacity} usable={owned.usable} condition={condition} stageName={owned.levelName} stage={owned.level} maxStage={owned.maxLevel} />
      <Tabs tab={tab} setTab={setTab} condition={condition} works={Boolean(project)} />
      {tab === "customize" ? <StandCustomize {...props} asset={asset} side={side} /> : null}
      {tab === "maintain" ? <Maintain {...props} asset={asset} condition={condition} /> : null}
      {tab === "develop" ? <StandDevelop {...props} asset={asset} /> : null}
    </div>
  );
}

function StandCustomize({ asset, side, design, identity, kit, apply }: PanelProps & { asset: InfrastructureAsset; side: StandSide }) {
  const d = design.stands[side];
  const own = identity.standLooks?.[side] ?? {};
  const material = d.material ?? defaultMaterial(d.form);
  const sw = swatches(kit);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] lfk-muted">Looks only · changes show instantly</div>
        <FreeTag />
      </div>
      <NameField key={asset.id} label="Stand name" initial={asset.name} onSave={(name) => apply((s) => renameStand(s, asset.id, name), `Renamed · ${name.trim()}`)} />
      {d.form === "open" ? <EmptyNote text="Nothing is built on this side yet. Develop it to give it a look." /> : (
        <>
          <section>
            <SectionHead title="Material" />
            <div className="grid grid-cols-4 gap-2">
              {STAND_MATERIALS.map((option) => (
                <button key={option.id} type="button" className="lf-tile items-center px-1 py-2 text-center text-[11px]" aria-pressed={material === option.id} onClick={() => apply((s) => updateStand(s, side, { material: option.id as StandMaterial }))}>
                  <span className="h-5 w-full rounded-md" style={{ background: MATERIAL_SWATCH[option.id] }} />
                  <span className="w-full leading-tight">{option.label.replace("Steel cladding", "Steel")}</span>
                </button>
              ))}
            </div>
          </section>
          <SwatchRow
            title="Seats"
            value={own.seats ? SEAT_SCHEMES.find((o) => o.id === own.seats)?.label : "Ground default"}
            options={SEAT_SCHEMES.map((o) => ({ id: o.id, label: o.label, colours: sw.seat(o.id) }))}
            selected={own.seats ?? "default"}
            fallback={sw.seat(identity.seats)}
            onPick={(id) => apply((s) => updateStandLook(s, side, { seats: id === "default" ? undefined : (id as SeatScheme) }))}
          />
          <SwatchRow
            title="Roof colour"
            value={own.roof ? ROOF_COLOURS.find((o) => o.id === own.roof)?.label : "Ground default"}
            options={ROOF_COLOURS.map((o) => ({ id: o.id, label: o.label, colours: [sw.roof(o.id)] }))}
            selected={own.roof ?? "default"}
            fallback={[sw.roof(identity.roof)]}
            onPick={(id) => apply((s) => updateStandLook(s, side, { roof: id === "default" ? undefined : (id as RoofColour) }))}
          />
          <SwatchRow
            title="Cladding & fascia"
            value={own.cladding ? CLADDINGS.find((o) => o.id === own.cladding)?.label : "From material"}
            options={CLADDINGS.map((o) => ({ id: o.id, label: o.label, colours: [sw.cladding(o.id)] }))}
            selected={own.cladding ?? "default"}
            fallback={[MATERIAL_SWATCH[material]]}
            onPick={(id) => apply((s) => updateStandLook(s, side, { cladding: id === "default" ? undefined : (id as Cladding) }))}
          />
        </>
      )}
    </div>
  );
}

function StandDevelop({ asset, state, plan }: PanelProps & { asset: InfrastructureAsset }) {
  const owned = standOwnership(state, asset);
  const project = activeProjectFor(state, asset.id);
  const options = developmentOptions(state, asset);
  // Show what the planner will open with, so the numbers match on the next screen.
  const planned = (option: ProjectOption) => (option.choosesBuild ? plannedOption(state, asset, option, defaultBuild(state, asset, option.spec)) : option);
  const next = options.next ? planned(options.next) : null;
  const others = options.others.map(planned);
  const toName = next ? ASSET_CONFIG.stand.levels[next.toLevel - 1] : null;
  return (
    <div className="space-y-3">
      <section>
        <SectionHead title="Structure" right={<span className="text-[10.5px] font-semibold lfk-muted">Roof is part of the build</span>} />
        <Ladder steps={STAND_LADDER} current={asset.level} next={next && !project ? next.toLevel : null} currentSub={owned.roof} />
      </section>
      <div className="flex flex-wrap gap-1.5">
        <span className="lfk-tag lfk-tag-plain">{owned.standing}</span>
        <span className="lfk-tag lfk-tag-plain">{owned.roof}</span>
        <span className="lfk-tag lfk-tag-plain">{owned.variant} layout</span>
        <span className="lfk-tag lfk-tag-plain lfk-num">{owned.span} × {owned.depth} m</span>
      </div>
      {project ? <ProjectProgress state={state} project={project} assetName={asset.name} /> : null}
      {project ? (
        <div className="text-[11.5px] lfk-muted">The next stage opens once this work is complete.</div>
      ) : next ? (
        <WorkCard
          featured
          eyebrow={`Next stage · ${nextStageVerb(asset.level)}`}
          option={next}
          approveLabel="Plan the build"
          previewLabel="Preview the build options"
          onApprove={() => plan(asset, options.next!.spec)}
          extra={
            <>
              <CapacityGrowth from={asset.capacity} add={next.addsPlaces} />
              <div className="text-[11.5px] lfk-muted">
                Becomes a <strong className="text-[var(--k-fg)]">{toName}</strong> · you choose layout, spectators{next.toLevel >= 3 ? " and roof" : ""}.
              </div>
            </>
          }
        />
      ) : (
        <div className="lfk-sunk flex items-center gap-3 px-3 py-3">
          <Check className="size-5 text-[var(--lf-free)]" />
          <div><div className="text-[13px] font-semibold">Fully developed</div><div className="text-[11.5px] lfk-muted">This side has reached its site envelope.</div></div>
        </div>
      )}
      {others.length && !project ? (
        <section className="space-y-2">
          <SectionHead title="Or start again" />
          {others.map((option) => (
            <WorkCard
              key={option.spec.type}
              option={option.spec.type === "replacement" ? { ...option, title: "Demolish and rebuild" } : option}
              approveLabel="Plan the rebuild"
              previewLabel="Preview the rebuild options"
              onApprove={() => plan(asset, options.others.find((o) => o.spec.type === option.spec.type)!.spec)}
              extra={option.toLevel > asset.level ? <div className="text-[11.5px] lfk-muted">Becomes a <strong className="text-[var(--k-fg)]">{ASSET_CONFIG.stand.levels[option.toLevel - 1]}</strong> · most of the stand closes while it's rebuilt.</div> : null}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/* ---------------- Maintain (stands and corners) ---------------- */

function Maintain({ asset, condition, state, approve }: PanelProps & { asset: InfrastructureAsset; condition: ConditionSummary }) {
  const project = activeProjectFor(state, asset.id);
  const options = maintenanceOptions(state, asset);
  const [showOptional, setShowOptional] = useState(false);
  const policy = state.infrastructure?.maintenancePolicy ?? "Standard";
  const healthy = !condition.attention;
  const needsNothing = !options.some((option) => option.spec.type === "minorRepair" || option.spec.type === "majorRepair");
  const rebuild = asset.type === "stand" && projectCatalogue(state, asset.id).some((spec) => spec.type === "replacement");
  const list = options.map((option) => (
    <WorkCard key={option.spec.type} option={option} condition={asset.condition} onApprove={() => approve(asset, option)} />
  ));
  return (
    <div className="space-y-3">
      <div className="lfk-card p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display text-[24px] leading-none" style={{ color: BAND_HEX[condition.band] }}>{condition.label}</div>
          <div className="lfk-num font-display text-[20px] leading-none">{condition.pct}%</div>
        </div>
        <ConditionMeter summary={condition} className="mt-2.5" />
        <div className="mt-2 text-[12.5px] font-semibold">{condition.consequence}</div>
        <div className="mt-1 text-[11px] lfk-muted">{asset.ageYears} yrs old · club upkeep: {policy}</div>
      </div>
      {project ? <ProjectProgress state={state} project={project} assetName={asset.name} /> : null}
      {healthy ? (
        <>
          <div className="lfk-sunk flex items-center gap-3 px-3 py-3">
            <span className="grid size-8 place-items-center rounded-full bg-emerald-400/15"><Check className="size-4 text-emerald-300" /></span>
            <div className="text-[13px] font-semibold">{needsNothing ? "No maintenance needed" : "No urgent work"}</div>
          </div>
          {options.length ? (
            <button type="button" className="text-[12px] font-semibold lfk-muted" onClick={() => setShowOptional((value) => !value)}>
              {showOptional ? "Hide" : "Show"} optional work ({options.length})
            </button>
          ) : null}
          {showOptional ? <div className="space-y-2">{list}</div> : null}
        </>
      ) : (
        <section className="space-y-2">
          <SectionHead title="Repair options" />
          {list}
        </section>
      )}
      {rebuild ? <div className="text-[11.5px] lfk-muted">Past saving? A full rebuild is planned in <strong className="text-[var(--k-fg)]">Develop</strong>.</div> : null}
    </div>
  );
}

/* ---------------- Corner ---------------- */

function CornerPanel({ asset, slot, ...props }: PanelProps & { asset: InfrastructureAsset; slot: CornerSlot }) {
  const { state, design, tab, setTab, apply, approve, planSimple, totalPlaces } = props;
  const c = design.corners[slot];
  const project = activeProjectFor(state, asset.id);
  const built = asset.capacity > 0;
  const { next } = developmentOptions(state, asset);

  if (!built) {
    return (
      <div className="space-y-3">
        {project ? <ProjectProgress state={state} project={project} assetName={asset.name} /> : (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-violet-300/50 bg-violet-500/10 px-3.5 py-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-500/20 text-violet-200"><Plus className="size-5" /></span>
            <div className="min-w-0">
              <div className="font-display text-[18px] leading-tight">Empty corner</div>
              <div className="text-[11.5px] lfk-muted">No spectator places yet · build one to add capacity</div>
            </div>
          </div>
        )}
        {next && !project ? (
          <WorkCard
            featured
            eyebrow="Build"
            option={next}
            approveLabel={`Add corner to plan · ${fmtMoneyExact(next.spec.cost)}`}
            onApprove={() => planSimple(asset, next)}
            extra={<CapacityGrowth from={totalPlaces} add={next.addsPlaces} />}
          />
        ) : null}
        <section>
          <SectionHead title="Corner stages" />
          <Ladder steps={CORNER_LADDER} current={project ? -1 : 0} next={1} labelNext={project ? "Building" : "Next"} />
        </section>
        <section>
          <SectionHead title="While it's empty" right={<FreeTag />} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="lf-tile" aria-pressed={c.form !== "pylon"} onClick={() => apply((s) => updateCorner(s, slot, { form: "open" }))}>Open corner</button>
            <button type="button" className="lf-tile" aria-pressed={c.form === "pylon"} onClick={() => apply((s) => updateCorner(s, slot, { form: "pylon" }))}>Floodlight pylon</button>
          </div>
        </section>
      </div>
    );
  }

  const condition = conditionSummary(asset);
  const options = cornerFormOptions(design, slot);
  const terraceOption = options.find((o) => o.id === "terrace");
  const seatedOption = options.find((o) => o.id === "seated");
  return (
    <div className="space-y-3">
      <StatusStrip capacity={asset.capacity} usable={asset.usableCapacity} condition={condition} stageName={ASSET_CONFIG.cornerStand.levels[asset.level - 1]} stage={asset.level} maxStage={ASSET_CONFIG.cornerStand.maxLevel} />
      <Tabs tab={tab} setTab={setTab} condition={condition} works={Boolean(project)} />
      {tab === "customize" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[12px] lfk-muted">Looks only · capacity stays as built</div>
            <FreeTag />
          </div>
          <section>
            <SectionHead title="Presentation" />
            <div className="grid grid-cols-2 gap-2">
              {[terraceOption, seatedOption].map((option) => option ? (
                <button key={option.id} type="button" className="lf-tile" aria-pressed={c.form === option.id} disabled={!option.allowed} onClick={() => apply((s) => updateCorner(s, slot, { form: option.id }))}>
                  {option.id === "terrace" ? "Terrace" : "Seated"}
                  {!option.allowed && option.reason ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold lfk-muted"><Lock className="size-3" />{option.reason}</span> : null}
                </button>
              ) : null)}
            </div>
          </section>
          <section>
            <SectionHead title="Shape" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="lf-tile" aria-pressed={(c.shape ?? "angled") === "angled"} onClick={() => apply((s) => updateCorner(s, slot, { shape: "angled" }))}>Angled</button>
              <button type="button" className="lf-tile" aria-pressed={c.shape === "rounded"} onClick={() => apply((s) => updateCorner(s, slot, { shape: "rounded" }))}>Rounded</button>
            </div>
          </section>
          <section>
            <SectionHead title="Access tunnel" />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="lf-tile" aria-pressed={!c.accessTunnel} onClick={() => apply((s) => updateCorner(s, slot, { accessTunnel: false }))}>None</button>
              <button type="button" className="lf-tile" aria-pressed={Boolean(c.accessTunnel)} onClick={() => apply((s) => updateCorner(s, slot, { accessTunnel: true }))}>Tunnel</button>
            </div>
          </section>
        </div>
      ) : null}
      {tab === "maintain" ? <Maintain {...props} asset={asset} condition={condition} /> : null}
      {tab === "develop" ? (
        <div className="space-y-3">
          <section>
            <SectionHead title="Corner stages" />
            <Ladder steps={CORNER_LADDER} current={asset.level} next={next && !project ? next.toLevel : null} />
          </section>
          {project ? <ProjectProgress state={state} project={project} assetName={asset.name} /> : null}
          {project ? null : next ? (
            <WorkCard
              featured
              eyebrow="Next stage · Expand"
              option={next}
              approveLabel={`Add to plan · ${fmtMoneyExact(next.spec.cost)}`}
              onApprove={() => planSimple(asset, next)}
              extra={<CapacityGrowth from={asset.capacity} add={next.addsPlaces} />}
            />
          ) : (
            <div className="lfk-sunk flex items-center gap-3 px-3 py-3">
              <Check className="size-5 text-[var(--lf-free)]" />
              <div className="text-[13px] font-semibold">Full corner · fully developed</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Fixtures and the whole ground (all free) ---------------- */

function FixturePanel({ id, state, design, identity, kit, apply, applyLook }: PanelProps & { id: FixtureId }) {
  const sw = swatches(kit);
  const head = (
    <div className="flex items-center justify-between">
      <div className="text-[12px] lfk-muted">Looks only · changes show instantly</div>
      <FreeTag />
    </div>
  );
  if (id === "pitch") {
    const pitch = assetById(state, "pitch");
    const condition = pitch ? conditionSummary(pitch) : null;
    return (
      <div className="space-y-4">
        {head}
        <section>
          <SectionHead title="Mowing pattern" />
          <div className="grid grid-cols-5 gap-1.5">
            {MOWING_PATTERNS.map((pattern) => (
              <button key={pattern.id} type="button" onClick={() => applyLook({ mowing: pattern.id })} className="lf-tile items-center gap-1 p-1.5 text-center text-[10px]" aria-pressed={identity.mowing === pattern.id}>
                <MowingIcon pattern={pattern.id} />
                <span className="w-full text-[9.5px] leading-tight">{pattern.label}</span>
              </button>
            ))}
          </div>
        </section>
        {pitch && condition ? (
          <div className="lfk-sunk flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <div className="lfk-eyebrow">Surface · {ASSET_CONFIG.pitch.levels[pitch.level - 1]}</div>
              <ConditionLabel summary={condition} className="text-[12.5px]" />
            </div>
            <span className="text-right text-[10.5px] lfk-muted">Surface upgrades<br />are in Facilities</span>
          </div>
        ) : null}
      </div>
    );
  }
  if (id === "lights") {
    return (
      <div className="space-y-4">
        {head}
        <OptionGrid options={FLOODLIGHT_STYLES} value={identity.floodlights} onPick={(value) => applyLook({ floodlights: value })} />
        <div className="text-[11px] lfk-muted">Corners set to Floodlight pylon always keep their pylon.</div>
      </div>
    );
  }
  if (id === "perimeter") {
    const gates = design.perimeter.gates ?? ["N", "S"];
    return (
      <div className="space-y-4">
        {head}
        <section><SectionHead title="Style" /><OptionGrid options={PERIMETER_STYLES} value={design.perimeter.style} onPick={(style) => apply((s) => updatePerimeter(s, { style }))} /></section>
        <SwatchRow
          title="Colour"
          value={PERIMETER_COLOURS.find((c) => c.id === design.perimeter.colour)?.label}
          options={PERIMETER_COLOURS.map((c) => ({ id: c.id, label: c.label, colours: [c.id === "club" ? kit.body : c.hex] }))}
          selected={design.perimeter.colour}
          onPick={(colour) => apply((s) => updatePerimeter(s, { colour: colour as GroundDesign["perimeter"]["colour"] }))}
        />
        <section>
          <SectionHead title="Gates" />
          <div className="grid grid-cols-4 gap-2">
            {SIDES.map((side) => (
              <button key={side} type="button" className="lf-tile items-center text-center" aria-pressed={gates.includes(side)} onClick={() => apply((s) => updatePerimeter(s, { gates: gates.includes(side) ? gates.filter((g) => g !== side) : [...gates, side] }))}>
                {{ N: "North", E: "East", S: "South", W: "West" }[side]}
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }
  if (id === "dugouts") {
    return <div className="space-y-4">{head}<OptionGrid options={DUGOUT_STYLES} value={design.fixtures?.dugouts ?? "auto"} onPick={(value) => apply((s) => updateFixtures(s, { dugouts: value as DugoutStyle }))} /></div>;
  }
  if (id === "scoreboard") {
    return <div className="space-y-4">{head}<OptionGrid options={SCOREBOARD_STYLES} value={design.fixtures?.scoreboard ?? "auto"} onPick={(value) => apply((s) => updateFixtures(s, { scoreboard: value as ScoreboardStyle }))} /></div>;
  }
  if (id === "surroundings") {
    const sur = design.surroundings;
    const coach = sur.coachBay ?? design.stands.W.level >= 2;
    return (
      <div className="space-y-4">
        {head}
        <section>
          <SectionHead title="Car park" />
          <div className="grid grid-cols-3 gap-2">
            {(["gravel", "tarmac"] as const).map((surface) => (
              <button key={surface} type="button" className="lf-tile" aria-pressed={sur.carParkSurface === surface} onClick={() => apply((s) => updateSurroundings(s, { carParkSurface: surface }))}>{surface === "gravel" ? "Gravel" : "Tarmac"}</button>
            ))}
            <button type="button" className="lf-tile" aria-pressed={coach} onClick={() => apply((s) => updateSurroundings(s, { coachBay: !coach }))}>Coach bay</button>
          </div>
        </section>
        <section>
          <SectionHead title="Car park position" />
          <div className="grid grid-cols-4 gap-2">
            {CORNERS.map((slot) => (
              <button key={slot} type="button" className="lf-tile items-center text-center" aria-pressed={sur.carParkLocation === slot} onClick={() => apply((s) => updateSurroundings(s, { carParkLocation: slot }))}>{slot}</button>
            ))}
          </div>
        </section>
        <section><SectionHead title="Club buildings" /><OptionGrid options={BUILDING_STYLES} value={sur.buildings ?? "auto"} onPick={(buildings) => apply((s) => updateSurroundings(s, { buildings }))} /></section>
      </div>
    );
  }
  // Whole ground
  return (
    <div className="space-y-4">
      {head}
      <NameField key={`ground-${identity.groundName ?? ""}`} label="Ground name" placeholder="e.g. Station Park" initial={identity.groundName ?? ""} onSave={(groundName) => applyLook({ groundName })} />
      <SwatchRow title="Seats · every stand" value={SEAT_SCHEMES.find((o) => o.id === identity.seats)?.label} options={SEAT_SCHEMES.map((o) => ({ id: o.id, label: o.label, colours: sw.seat(o.id) }))} selected={identity.seats} onPick={(seats) => applyLook({ seats: seats as SeatScheme })} />
      <SwatchRow title="Roofs · every stand" value={ROOF_COLOURS.find((o) => o.id === identity.roof)?.label} options={ROOF_COLOURS.map((o) => ({ id: o.id, label: o.label, colours: [sw.roof(o.id)] }))} selected={identity.roof} onPick={(roof) => applyLook({ roof: roof as RoofColour })} />
      <SwatchRow title="Brick & buildings" value={CLADDINGS.find((o) => o.id === identity.cladding)?.label} options={CLADDINGS.map((o) => ({ id: o.id, label: o.label, colours: [sw.cladding(o.id)] }))} selected={identity.cladding} onPick={(cladding) => applyLook({ cladding: cladding as Cladding })} />
      <section>
        <SectionHead title="Home end" />
        <div className="grid grid-cols-3 gap-2">
          {([null, "N", "S"] as const).map((end) => (
            <button key={String(end)} type="button" className="lf-tile items-center text-center" aria-pressed={identity.homeEnd === end} onClick={() => applyLook({ homeEnd: end })}>{end === null ? "None" : end === "N" ? "North end" : "South end"}</button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Small pieces ---------------- */

const MATERIAL_SWATCH: Record<StandMaterial, string> = { brick: "#9a5d42", timber: "#8a6a45", concrete: "#b5b1a6", cladding: "#cfd3d6" };

function swatches(kit: { body: string; secondary: string }) {
  return {
    seat: (id: SeatScheme): string[] => (id === "club" ? [kit.body, kit.body] : id === "twoTone" ? [kit.body, kit.secondary] : SEAT_SCHEMES.find((o) => o.id === id)?.colours ?? ["#1f6f69", "#185a55"]),
    roof: (id: RoofColour) => (id === "club" ? kit.body : ROOF_COLOURS.find((r) => r.id === id)?.hex ?? "#56616c"),
    cladding: (id: Cladding) => (id === "club" ? kit.body : CLADDINGS.find((c) => c.id === id)?.hex ?? "#9a5d42"),
  };
}

/** One-tap colour choice: label + current value, then a strip of swatches. */
function SwatchRow<T extends string>({
  title,
  value,
  options,
  selected,
  fallback,
  onPick,
}: {
  title: string;
  value?: string;
  options: { id: T; label: string; colours: string[] }[];
  selected: T | "default";
  /** Show a "default" swatch with these colours. */
  fallback?: string[];
  onPick: (id: T | "default") => void;
}) {
  return (
    <section>
      <SectionHead title={title} right={<span className="text-[11.5px] font-semibold">{value}</span>} />
      <div className="lf-scroll-x">
        {fallback ? (
          <button type="button" className="lf-swatch" aria-pressed={selected === "default"} aria-label="Use the default" title="Default" onClick={() => onPick("default")}>
            {fallback.map((colour, index) => <span key={index} className="flex-1" style={{ background: colour }} />)}
            <span className="absolute inset-0 grid place-items-center bg-black/35 text-[8.5px] font-black uppercase tracking-wide text-white">Auto</span>
          </button>
        ) : null}
        {options.map((option) => (
          <button key={option.id} type="button" className="lf-swatch" aria-pressed={selected === option.id} aria-label={option.label} title={option.label} onClick={() => onPick(option.id)}>
            {option.colours.map((colour, index) => <span key={index} className="flex-1" style={{ background: colour }} />)}
          </button>
        ))}
      </div>
    </section>
  );
}

function OptionGrid<T extends string>({ options, value, onPick }: { options: readonly { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => (
        <button key={option.id} type="button" className="lf-tile flex-row items-center justify-between" aria-pressed={value === option.id} onClick={() => onPick(option.id)}>
          <span>{option.label}</span>
          {value === option.id ? <Check className="size-3.5 text-[#ffc53d]" /> : null}
        </button>
      ))}
    </div>
  );
}

function NameField({ initial, onSave, label, placeholder }: { initial: string; onSave: (name: string) => void; label: string; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const dirty = value.trim() !== initial.trim();
  return (
    <section>
      <SectionHead title={label} />
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (dirty) { onSave(value); input.current?.blur(); } }}>
        <div className="relative min-w-0 flex-1">
          <input ref={input} value={value} placeholder={placeholder} maxLength={40} onChange={(event) => setValue(event.target.value)} className="lf-studio-input pr-9" />
          <PencilLine className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 lfk-muted" />
        </div>
        {dirty ? <button type="submit" className="lfk-btn-quiet h-10 shrink-0 border-[#ffc53d] text-[#ffc53d]">Save</button> : null}
      </form>
    </section>
  );
}

/** Tiny preview of each mowing pattern. */
function MowingIcon({ pattern }: { pattern: Mowing }) {
  const a = "#45a04b";
  const b = "#33893a";
  const cells: ReactNode[] = [];
  if (pattern === "checks") for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) cells.push(<rect key={`${i}-${j}`} x={i * 6} y={j * 5} width="6" height="5" fill={(i + j) % 2 ? a : b} />);
  else if (pattern === "vertical") for (let j = 0; j < 5; j++) cells.push(<rect key={j} x="0" y={j * 4} width="36" height="4" fill={j % 2 ? a : b} />);
  else if (pattern === "diagonal") { cells.push(<rect key="bg" width="36" height="20" fill={b} />); for (let k = -4; k < 8; k += 2) cells.push(<polygon key={k} points={`${k * 5},20 ${k * 5 + 5},20 ${k * 5 + 25},0 ${k * 5 + 20},0`} fill={a} />); }
  else { const n = pattern === "wide" ? 3 : 6; for (let i = 0; i < n; i++) cells.push(<rect key={i} x={(i * 36) / n} y="0" width={36 / n} height="20" fill={i % 2 ? a : b} />); }
  return <svg viewBox="0 0 36 20" className="h-6 w-full overflow-hidden rounded">{cells}</svg>;
}

export function standForAsset(state: GameState, assetId: string) {
  return assetById(state, assetId);
}

