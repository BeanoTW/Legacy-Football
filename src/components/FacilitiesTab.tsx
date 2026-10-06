import { useMemo, useState } from "react";
import {
  Accessibility,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Flag,
  Hammer,
  HardHat,
  History,
  ShieldCheck,
  ShoppingBag,
  Sprout,
  Stethoscope,
  UtensilsCrossed,
  Wine,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { StadiumGround, type GroundHotspot } from "@/components/game/StadiumGround";
import { GroundStudioSheet } from "@/components/game/GroundStudio";
import { BAND_HEX, ConditionDot, ConditionLabel, ConditionMeter, KitStyles, ProjectProgress, WorkCard, priceLabel } from "@/components/game/StudioKit";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CapitalProject, CapitalProjectType, GameState, InfrastructureAsset, InfrastructureAssetType } from "@/lib/game/types";
import {
  ASSET_CONFIG,
  BAND_LABEL,
  MAINTENANCE_POLICIES,
  POLICY_CONFIG,
  approveProject,
  assetById,
  assets as allAssets,
  cancelProject,
  conditionBand,
  evaluateProject,
  facilityProgressionSpec,
  infrastructureSnapshot,
  maintenanceCostUnder,
  projectCatalogue,
  projectedSeasonDecay,
  setMaintenancePolicy,
} from "@/lib/game/infrastructure";
import { groundProgression } from "@/lib/game/groundPresentation";
import { fmtMoneyExact } from "@/lib/game/engine";
import { stadiumAccreditation } from "@/lib/game/stadiumAccreditation";
import { clubOperatingModel, professionaliseUserClub, userProfessionalisationReadiness } from "@/lib/game/employment";
import { userClubReference } from "@/lib/game/clubReference";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundDesign, sceneLook, type StandBuild, type StandSide } from "@/lib/game/groundIdentity";
import { activeProjectFor, conditionSummary, facilityNeed, lockReason, maintenanceOptions, standToDevelopFor, type ProjectOption } from "@/lib/game/stadiumUx";

/*
 * Facilities is the capability layer: hospitality, food, toilets and
 * accessibility, retail, parking, fan zone, pitch, training, medical, offices.
 * Physical spectator structures (stands and corners) live in Ground Studio;
 * tapping one here opens it there, so there is one place to build them.
 */

type SupportingView = "services" | "projects" | "maintenance" | "status" | "history";

const BAND_TONE: Record<string, string> = {
  excellent: "text-income",
  good: "text-income",
  worn: "text-foreground",
  poor: "text-expense",
  critical: "text-expense",
  closed: "text-muted-foreground",
};

const SERVICE_ICON: Partial<Record<InfrastructureAssetType, LucideIcon>> = {
  hospitality: Wine,
  concessions: UtensilsCrossed,
  sanitary: Accessibility,
  shop: ShoppingBag,
  parking: Car,
  fanZone: Flag,
  pitch: Sprout,
  training: Dumbbell,
  medical: Stethoscope,
  offices: BriefcaseBusiness,
};

const SERVICE_GROUPS: { label: string; types: InfrastructureAssetType[] }[] = [
  { label: "Matchday", types: ["hospitality", "concessions", "sanitary", "shop", "parking", "fanZone"] },
  { label: "Football", types: ["pitch", "training", "medical"] },
  { label: "Club", types: ["offices"] },
];

const isStructure = (asset: InfrastructureAsset) => asset.type === "stand" || asset.type === "cornerStand";
const studioId = (asset: InfrastructureAsset) => (asset.type === "cornerStand" ? `corner:${asset.location}` : `stand:${asset.location}`);

function chooseAsset(list: InfrastructureAsset[], id: string, fallbackType: InfrastructureAsset["type"], excludeId?: string) {
  return list.find((asset) => asset.id === id)
    ?? list.find((asset) => asset.type === fallbackType && asset.id !== excludeId)
    ?? list[0];
}

export function FacilitiesTab({
  state,
  update,
  onOpenStudio,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  /** Open Ground Studio on a component ("stand:E", "corner:SW"). Omitted: this tab hosts its own studio. */
  onOpenStudio?: (selection?: string) => void;
}) {
  const [view, setView] = useState<SupportingView>("services");
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [ownStudio, setOwnStudio] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const snap = useMemo(() => state.infrastructure ? infrastructureSnapshot(state) : null, [state]);
  const progression = useMemo(() => state.infrastructure ? groundProgression(state) : null, [state]);
  const accreditation = useMemo(() => state.infrastructure ? stadiumAccreditation(state) : null, [state]);
  const professional = useMemo(() => state.infrastructure ? userProfessionalisationReadiness(state) : null, [state]);
  const look = useMemo(() => {
    const kit = clubKitFor(state).home;
    return sceneLook(state, { body: kit.body, secondary: kit.secondary });
  }, [state]);
  // The ground is drawn stand-by-stand from the club's slot-based design.
  const design = useMemo(() => groundDesign(state), [state]);

  if (!state.infrastructure || !snap || !progression) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">The club's physical assets have not been surveyed yet. Advance a week to open the ground.</div>;
  }

  const openStudio = (selection?: string) => (onOpenStudio ? onOpenStudio(selection) : setOwnStudio(selection ?? "stand:W"));
  const openAsset = (asset: InfrastructureAsset) => (isStructure(asset) ? openStudio(studioId(asset)) : setOpenAssetId(asset.id));

  const list = allAssets(state);
  const mainStand = chooseAsset(list, "stand-W", "stand");
  const otherStand = chooseAsset(list, "stand-E", "stand", mainStand?.id);
  const pitch = chooseAsset(list, "pitch", "pitch");
  const hospitality = chooseAsset(list, "hospitality", "hospitality");
  const media = chooseAsset(list, "offices", "offices");
  const access = chooseAsset(list, "sanitary", "sanitary");
  const shop = chooseAsset(list, "shop", "shop");
  const parking = chooseAsset(list, "parking", "parking");
  const isGrassroots = progression.visualStage === 0;
  const candidates: Array<[string, string, InfrastructureAsset | undefined, string]> = [
    ["main", isGrassroots ? "West Side" : "Main Stand", mainStand, "lf-ground-label-main"],
    ["stands", isGrassroots ? "East Side" : "Terrace / Stand", otherStand, "lf-ground-label-stands"],
    ["pitch", "Pitch", pitch, "lf-ground-label-pitch"],
    ["hospitality", "Hospitality", hospitality, "lf-ground-label-hospitality"],
    ["shop", "Club Shop", shop, "lf-ground-label-shop"],
    ["parking", "Car Park", parking, "lf-ground-label-parking"],
    ["access", "Access", access, "lf-ground-label-access"],
    ["offices", "Club Offices", media, "lf-ground-label-offices"],
  ];
  const hotspots: GroundHotspot[] = candidates.flatMap(([id, label, asset, className]) => asset ? [{ id, label, asset, className }] : []);
  const open = openAssetId ? assetById(state, openAssetId) : null;
  const nextRequirements = progression.next?.requirements ?? [];
  const metCount = nextRequirements.filter((requirement) => requirement.met).length;
  const evolutionPercent = progression.next && nextRequirements.length
    ? Math.round((metCount / nextRequirements.length) * 100)
    : 100;
  const nextUnlock = nextRequirements.find((requirement) => !requirement.met) ?? null;
  const wear = Object.fromEntries(list.filter((asset) => asset.type === "stand").map((asset) => [asset.location, asset.condition])) as Partial<Record<StandSide, number>>;
  const works = list.filter((asset) => asset.activeProjectId && isStructure(asset)).map(studioId);

  return (
    <div className="lf-ground-screen lfk flex h-full min-h-0 flex-col gap-2">
      <KitStyles />
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Facilities</div>
          <h1 className="truncate font-display text-2xl leading-none md:text-3xl">{progression.current.name}</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Ground condition</div>
          <div className={cn("font-display text-xl leading-none", BAND_TONE[conditionBand(snap.averageStadiumCondition)])}>{snap.averageStadiumCondition.toFixed(0)}%</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{BAND_LABEL[conditionBand(snap.averageStadiumCondition)]}</div>
        </div>
      </header>

      {note ? (
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-primary/30 bg-secondary px-3 py-2 text-xs">
          <span className="min-w-0">{note}</span>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Dismiss message" onClick={() => setNote(null)}><X /></Button>
        </div>
      ) : null}

      {!onOpenStudio ? (
        <div className="flex shrink-0 justify-end">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openStudio()}>
            <Building2 className="size-3.5" /> Ground Studio
          </Button>
        </div>
      ) : null}

      <div className="lf-ground-layout min-h-0 flex-1">
        <StadiumGround
          stage={progression.visualStage}
          hotspots={hotspots}
          selectedId={openAssetId}
          onSelect={(hotspot) => openAsset(hotspot.asset)}
          look={look}
          design={design}
          works={works}
          wear={wear}
        />

        <aside className="lf-ground-sidebar space-y-2 pt-2 md:pt-0">
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-3 divide-x border-b">
              <GroundMetric label="Capacity" value={snap.capacity.toLocaleString("en-GB")} />
              <GroundMetric label="Open now" value={snap.usableCapacity.toLocaleString("en-GB")} tone={snap.usableCapacity < snap.capacity ? "text-expense" : undefined} />
              <GroundMetric label="Running / wk" value={fmtMoneyExact(snap.weeklyMaintenance + snap.weeklyOperating)} />
            </div>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left" onClick={() => setRequirementsOpen((value) => !value)} aria-expanded={requirementsOpen}>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Next ground grade</span>
                <span className="block truncate font-display text-base">{progression.next?.name ?? "Elite standard reached"}</span>
                {progression.next ? (
                  <span className="mt-1 block">
                    <span className="lf-ground-evolution-track block" aria-label={`${evolutionPercent}% of next ground grade requirements met`}>
                      <span className="lf-ground-evolution-fill block" style={{ width: `${evolutionPercent}%` }} />
                    </span>
                    <span className="mt-1 flex justify-between gap-2 text-[10.5px] text-muted-foreground">
                      <span className="truncate">{nextUnlock ? `Next: ${nextUnlock.label}` : "All requirements met"}</span>
                      <span className="shrink-0 tnum">{metCount}/{nextRequirements.length}</span>
                    </span>
                  </span>
                ) : null}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", requirementsOpen && "rotate-180")} />
            </button>
            {requirementsOpen && progression.next ? (
              <div className="grid gap-1 border-t p-2">
                {nextRequirements.map((requirement) => (
                  <div key={requirement.label} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1 text-[11px]">
                    {requirement.met ? <Check className="size-3.5 text-income" /> : <CircleAlert className="size-3.5 text-muted-foreground" />}
                    <span className="truncate">{requirement.label}</span>
                    <span className="tnum text-muted-foreground">{requirement.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <nav className="grid grid-cols-5 gap-1 rounded-xl bg-muted/60 p-1" aria-label="Facilities sections">
            {([
              ["services", Building2, "Services"],
              ["projects", Hammer, "Works"],
              ["maintenance", Wrench, "Upkeep"],
              ["status", ShieldCheck, "Status"],
              ["history", History, "History"],
            ] as const).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                className={cn("relative flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[10.5px] font-semibold", view === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                <Icon className="size-4" /><span className="truncate">{label}</span>
                {key === "projects" && snap.activeProjects.length ? <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-amber-500" /> : null}
              </button>
            ))}
          </nav>

          {view === "services" ? <ServicesPanel state={state} onOpen={(asset) => setOpenAssetId(asset.id)} /> : null}
          {view === "projects" ? <ProjectsPanel state={state} projects={snap.activeProjects} commitments={snap.commitments} onOpen={(project) => { const asset = assetById(state, project.assetId); if (asset) openAsset(asset); }} onCancel={(project) => {
            const result = cancelProject(state, project.id);
            setNote(result.ok ? `${project.title} cancelled — a penalty was booked.` : (result.reason ?? "Unable to cancel project."));
            if (result.ok) update(() => result.state);
          }} /> : null}
          {view === "maintenance" ? <MaintenancePanel state={state} current={snap.maintenancePolicy} onAdopt={(policy) => {
            update(() => setMaintenancePolicy(state, policy));
            setNote(`Maintenance policy set to ${policy}.`);
          }} /> : null}
          {view === "status" ? <>
            <GroundStatus snap={snap} assets={list} onOpen={openAsset} critical={snap.criticalAssets} />
            {accreditation && professional ? <ClubStatusPanel state={state} accreditation={accreditation} professional={professional} onProfessionalise={() => {
              const outcome = professionaliseUserClub(state);
              setNote(outcome.result.reason);
              if (outcome.result.ok) update(() => outcome.state);
            }} /> : null}
          </> : null}
          {view === "history" ? <HistoryPanel state={state} /> : null}
        </aside>
      </div>

      {!onOpenStudio && ownStudio ? <GroundStudioSheet open onOpenChange={(isOpen) => { if (!isOpen) setOwnStudio(null); }} state={state} update={update} initialSelection={ownStudio} /> : null}

      <Sheet open={Boolean(open)} onOpenChange={(isOpen) => { if (!isOpen) setOpenAssetId(null); }}>
        {open ? <FacilitySheet
          state={state}
          asset={open}
          onOpenStudio={(selection) => { setOpenAssetId(null); openStudio(selection); }}
          onApprove={(type) => {
            const result = approveProject(state, open.id, type);
            setNote(result.ok ? `Approved · ${open.name}.` : (result.reason ?? "Unable to approve project."));
            if (result.ok) { update(() => result.state); setOpenAssetId(null); }
          }}
        /> : null}
      </Sheet>
    </div>
  );
}

function GroundMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="min-w-0 px-2.5 py-2"><div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div><div className={cn("truncate font-display text-[15px] tnum", tone)}>{value}</div></div>;
}

/* ------------------------------------------------------------------ */
/* Services: the capability layer                                      */
/* ------------------------------------------------------------------ */

function ServicesPanel({ state, onOpen }: { state: GameState; onOpen: (asset: InfrastructureAsset) => void }) {
  const list = allAssets(state);
  return (
    <div className="space-y-3">
      {SERVICE_GROUPS.map((group) => {
        const items = group.types.flatMap((type) => list.filter((asset) => asset.type === type));
        if (!items.length) return null;
        return (
          <section key={group.label}>
            <div className="lfk-eyebrow mb-1.5 px-0.5">{group.label}</div>
            <div className="overflow-hidden rounded-xl border bg-card">
              {items.map((asset) => <ServiceRow key={asset.id} state={state} asset={asset} onOpen={() => onOpen(asset)} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ServiceRow({ state, asset, onOpen }: { state: GameState; asset: InfrastructureAsset; onOpen: () => void }) {
  const config = ASSET_CONFIG[asset.type];
  const Icon = SERVICE_ICON[asset.type] ?? Building2;
  const condition = conditionSummary(asset);
  const project = activeProjectFor(state, asset.id);
  const upgrade = projectCatalogue(state, asset.id).find((spec) => spec.type === "facilityUpgrade");
  const need = facilityNeed(state, asset);
  const lock = upgrade ? lockReason(state, asset.id, upgrade, evaluateProject(state, asset.id, upgrade.type)) : null;
  return (
    <button type="button" onClick={onOpen} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t px-3 py-2.5 text-left first:border-t-0 hover:bg-muted/40">
      <span className="grid size-9 place-items-center rounded-lg bg-muted/70"><Icon className="size-4" /></span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <strong className="truncate text-[13px]">{config.label}</strong>
          {condition.attention ? <ConditionDot band={condition.band} size={7} /> : null}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{config.levels[asset.level - 1]}</span>
          <LevelPips level={asset.level} max={config.maxLevel} />
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold">
          {project ? (
            <span className="inline-flex items-center gap-1 text-amber-700"><HardHat className="size-3" />Upgrading · {Math.round(project.progress)}%</span>
          ) : !upgrade ? (
            <span className="text-income">Top standard</span>
          ) : need ? (
            <span className="text-muted-foreground">Next: {config.levels[asset.level]} · {need.replace("Needs", "needs")}</span>
          ) : (
            <span style={{ color: "var(--k-paid-text)" }}>Next: {config.levels[asset.level]} · {priceLabel(upgrade.cost)}{lock && lock.kind !== "dependency" ? <span className="text-muted-foreground"> · {SHORT_LOCK[lock.kind] ?? lock.text}</span> : null}</span>
          )}
        </span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

const SHORT_LOCK: Partial<Record<string, string>> = { reserve: "breaks reserve", club: "after current works", asset: "work under way" };

function LevelPips({ level, max }: { level: number; max: number }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5" aria-label={`Level ${level} of ${max}`}>
      {Array.from({ length: max }, (_, index) => <i key={index} className={cn("block h-1.5 w-2.5 rounded-full", index < level ? "bg-primary" : "bg-muted")} />)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Status (ground report + club status)                                */
/* ------------------------------------------------------------------ */

function GroundStatus({ snap, assets, critical, onOpen }: { snap: ReturnType<typeof infrastructureSnapshot>; assets: InfrastructureAsset[]; critical: InfrastructureAsset[]; onOpen: (asset: InfrastructureAsset) => void }) {
  const watchlist = [...assets].sort((a, b) => a.condition - b.condition).slice(0, 4);
  const availabilityLoss = Math.max(0, snap.capacity - snap.usableCapacity);
  return <section className="rounded-xl border bg-card p-3">
    <div className="flex items-center gap-2">
      <ShieldCheck className={cn("size-4", critical.length ? "text-expense" : "text-income")} />
      <h2 className="font-display text-base">Ground report</h2>
      <span className="ml-auto text-xs text-muted-foreground">Risk: {snap.riskLabel}</span>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-lg bg-muted/45 px-2 py-1.5">
        <span className="block text-[9px] uppercase text-muted-foreground">Places unusable</span>
        <strong className={cn("font-display text-sm tnum", availabilityLoss ? "text-expense" : "text-income")}>{availabilityLoss.toLocaleString("en-GB")}</strong>
      </div>
      <div className="rounded-lg bg-muted/45 px-2 py-1.5">
        <span className="block text-[9px] uppercase text-muted-foreground">Live works</span>
        <strong className="font-display text-sm tnum">{snap.activeProjects.length}</strong>
      </div>
    </div>
    <div className="mt-2 border-t pt-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{critical.length ? "Needs attention" : "Lowest condition"}</div>
      <div className="grid gap-1">
        {(critical.length ? critical.slice(0, 4) : watchlist).map((asset) => {
          const summary = conditionSummary(asset);
          return (
            <button key={asset.id} type="button" className="grid w-full grid-cols-[minmax(0,1fr)_72px_auto] items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/60" onClick={() => onOpen(asset)}>
              <span className="min-w-0 truncate text-xs">{asset.name}{isStructure(asset) ? <span className="text-muted-foreground"> · Ground Studio</span> : null}</span>
              <ConditionMeter summary={summary} />
              <span className="w-9 text-right font-mono text-[10px]" style={{ color: BAND_HEX[summary.band] }}>{summary.pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
    <div className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">{fmtMoneyExact(snap.totalCapitalSpend)} invested in the ground to date</div>
  </section>;
}

function ClubStatusPanel({ state, accreditation, professional, onProfessionalise }: { state: GameState; accreditation: ReturnType<typeof stadiumAccreditation>; professional: ReturnType<typeof userProfessionalisationReadiness>; onProfessionalise: () => void }) {
  const fullTime = clubOperatingModel(state, userClubReference(state)) === "FullTime";
  return <section className="rounded-xl border bg-card p-3">
    <div className="flex items-center gap-2"><BriefcaseBusiness className={cn("size-4", fullTime ? "text-income" : "text-muted-foreground")} /><h2 className="font-display text-base">Club status</h2><span className={cn("ml-auto text-xs font-semibold", fullTime ? "text-income" : "text-muted-foreground")}>{fullTime ? "Full-time" : "Semi-professional"}</span></div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-lg bg-muted/45 px-2 py-1.5"><span className="block text-[9px] uppercase text-muted-foreground">Ground accreditation</span><strong className="font-display text-sm">{accreditation.faCapacityLabel}</strong></div>
      <div className="rounded-lg bg-muted/45 px-2 py-1.5"><span className="block text-[9px] uppercase text-muted-foreground">EFL qualification</span><strong className={cn("font-display text-sm", accreditation.eflQualificationReady ? "text-income" : "text-muted-foreground")}>{accreditation.eflQualificationReady ? "Ready" : "Not yet"}</strong></div>
    </div>
    {!fullTime ? <div className="mt-2 border-t pt-2">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Full-time requirements</div>
      <StatusRequirement label="Training ground" met={professional.trainingLevel >= professional.minimumTrainingLevel} current={professional.trainingLabel} required="Basic ground+" />
      {accreditation.professionalisationRequirements.map((item) => <StatusRequirement key={item.label} label={item.label} met={item.met} current={String(item.current)} required={String(item.required)} />)}
      <Button className="mt-2 w-full" size="sm" disabled={!professional.allowed} onClick={onProfessionalise}>{professional.allowed ? "Turn club full-time" : professional.reason}</Button>
    </div> : null}
    <div className="mt-2 border-t pt-2"><div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">EFL entry benchmark</div>{accreditation.eflQualificationRequirements.map((item) => <StatusRequirement key={item.label} label={item.label} met={item.met} current={String(item.current)} required={String(item.required)} />)}</div>
  </section>;
}

function StatusRequirement({ label, met, current, required }: { label: string; met: boolean; current: string; required: string }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-0.5 text-[10px]">{met ? <Check className="size-3.5 text-income" /> : <CircleAlert className="size-3.5 text-muted-foreground" />}<span className="truncate">{label}</span><span className="text-right font-mono text-muted-foreground">{current} / {required}</span></div>;
}

/* ------------------------------------------------------------------ */
/* One facility                                                        */
/* ------------------------------------------------------------------ */

export function FacilitySheet({
  state,
  asset,
  onApprove,
  onOpenStudio,
}: {
  state: GameState;
  asset: InfrastructureAsset;
  onApprove: (type: CapitalProjectType) => void;
  /** Kept for older callers; stand builds are chosen in Ground Studio. */
  onApproveBuild?: (type: CapitalProjectType, build: StandBuild) => void;
  /** Jump to Ground Studio (structural dependencies, stands and corners). */
  onOpenStudio?: (selection?: string) => void;
}) {
  const config = ASSET_CONFIG[asset.type];
  const condition = conditionSummary(asset);
  const project = activeProjectFor(state, asset.id);
  const progressionSpec = useMemo(() => facilityProgressionSpec(state, asset), [state, asset]);
  const upgradeSpec = projectCatalogue(state, asset.id).find((spec) => spec.type === "facilityUpgrade");
  const upgradeEvaluation = upgradeSpec ? evaluateProject(state, asset.id, upgradeSpec.type) : null;
  const upgrade: ProjectOption | null = upgradeSpec ? {
    spec: upgradeSpec,
    evaluation: upgradeEvaluation,
    lock: lockReason(state, asset.id, upgradeSpec, upgradeEvaluation),
    title: config.levels[asset.level] ?? "Upgrade",
    addsPlaces: 0,
    toLevel: asset.level + 1,
    conditionAfter: null,
    choosesBuild: false,
  } : null;
  const repairs = maintenanceOptions(state, asset);
  const [showRepairs, setShowRepairs] = useState(condition.attention);
  const developStand = standToDevelopFor(state, asset);
  const Icon = SERVICE_ICON[asset.type] ?? Building2;
  const supporters = upgradeEvaluation?.positions.filter((position) => position.stance === "supports").length ?? 0;
  const opponents = upgradeEvaluation?.positions.filter((position) => position.stance === "opposes").length ?? 0;

  return <SheetContent side="bottom" className="lf-ground-sheet lfk">
    <KitStyles />
    <div className="border-b bg-panel px-4 pb-3 pt-3 text-panel-foreground">
      <div className="flex items-center gap-2 pr-9 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
        <Icon className="size-3.5" /><span>{config.label}</span><span>·</span><span className="truncate">{asset.location}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3 pr-9">
        <SheetTitle className="min-w-0 truncate font-display text-2xl text-panel-foreground">{asset.name}</SheetTitle>
      </div>
      {/* The ladder of standards this facility can reach. */}
      <div className="mt-2.5 flex gap-1" aria-label={`Level ${asset.level} of ${config.maxLevel}`}>
        {config.levels.map((name, index) => (
          <div key={name} className="min-w-0 flex-1">
            <div className={cn("h-1.5 rounded-full", index < asset.level ? "bg-emerald-400" : index === asset.level ? "bg-violet-400/70" : "bg-white/20")} />
            <div className={cn("mt-1 truncate text-[8px] font-bold uppercase tracking-wide", index === asset.level - 1 ? "text-white" : index === asset.level ? "text-violet-200" : "text-white/45")}>{name}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="lf-ground-sheet-scroll space-y-3 p-3">
      <div className="lfk-card p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="lfk-eyebrow">Now</div>
            <div className="font-display text-[17px] leading-tight">{config.levels[asset.level - 1] ?? `Level ${asset.level}`}</div>
          </div>
          <ConditionLabel summary={condition} className="text-[12px]" />
        </div>
        <ConditionMeter summary={condition} className="mt-2" />
        <div className="mt-1.5 text-[11.5px] text-muted-foreground">{condition.consequence}</div>
        {isStructure(asset) ? null : (
          <div className="mt-2 flex flex-wrap gap-1">
            {progressionSpec.benefits.map((benefit) => <span key={benefit} className="lfk-tag lfk-tag-plain">{benefit}</span>)}
          </div>
        )}
      </div>

      {isStructure(asset) && onOpenStudio ? (
        <button type="button" className="lfk-btn-quiet w-full" onClick={() => onOpenStudio(studioId(asset))}>
          Open in Ground Studio <ArrowRight className="size-4" />
        </button>
      ) : null}

      {project ? <ProjectProgress state={state} project={project} assetName={asset.name} /> : null}

      {upgrade && !project ? (
        <WorkCard
          featured
          eyebrow="Upgrade to"
          option={upgrade}
          onApprove={() => onApprove("facilityUpgrade")}
          extra={
            <div className="space-y-2">
              {progressionSpec.nextImpact.length ? (
                <div className="flex flex-wrap gap-1">
                  {progressionSpec.nextImpact.map((impact) => <span key={impact} className="lfk-tag lfk-tag-paid lfk-num">{impact}</span>)}
                </div>
              ) : null}
              {upgrade.lock?.kind === "dependency" ? (
                <div className="lfk-sunk space-y-2 p-2.5">
                  <div className="text-[11.5px] leading-snug">
                    This upgrade is fitted out inside a bigger stand.
                    {developStand ? <> Your most developed is <strong>{developStand.name}</strong> ({ASSET_CONFIG.stand.levels[developStand.level - 1]}).</> : null}
                  </div>
                  {developStand && onOpenStudio ? (
                    <button type="button" className="lfk-btn-quiet h-9 w-full text-[12.5px]" onClick={() => onOpenStudio(`stand:${developStand.location}`)}>
                      Develop {developStand.name} <ArrowRight className="size-4" />
                    </button>
                  ) : null}
                </div>
              ) : null}
              {upgradeEvaluation?.positions.length ? (
                <div className="text-[11px] text-muted-foreground">Board: <span className="font-semibold text-income">{supporters} for</span> · <span className="font-semibold text-expense">{opponents} against</span></div>
              ) : null}
              {upgradeEvaluation?.allowed && upgradeEvaluation.affordability.verdict === "affordableButRisky" ? (
                <div className="text-[11px] font-semibold text-amber-700">Stretches the budget · {upgradeEvaluation.reason}</div>
              ) : null}
            </div>
          }
        />
      ) : !upgrade && !project ? (
        <div className="lfk-sunk flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold"><Check className="size-4 text-income" />Top standard reached</div>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="lfk-eyebrow">Maintain</div>
          {!condition.attention && repairs.length ? (
            <button type="button" className="text-[11px] font-semibold text-muted-foreground" onClick={() => setShowRepairs((value) => !value)}>{showRepairs ? "Hide" : "Show"} optional work ({repairs.length})</button>
          ) : null}
        </div>
        {!condition.attention ? (
          <div className="lfk-sunk flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold"><Check className="size-4 text-income" />{repairs.some((option) => option.spec.type === "minorRepair") ? "No urgent work" : "No maintenance needed"}</div>
        ) : null}
        {showRepairs ? repairs.map((option) => (
          <WorkCard key={option.spec.type} option={option} condition={asset.condition} onApprove={() => onApprove(option.spec.type)} />
        )) : null}
      </section>
    </div>
  </SheetContent>;
}

/* ------------------------------------------------------------------ */
/* Works, upkeep, history                                              */
/* ------------------------------------------------------------------ */

function ProjectsPanel({ state, projects, commitments, onCancel, onOpen }: { state: GameState; projects: CapitalProject[]; commitments: number; onCancel: (project: CapitalProject) => void; onOpen: (project: CapitalProject) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return <section className="space-y-2 pb-16 md:pb-2">
    <div className="flex items-baseline justify-between px-0.5"><h2 className="font-display text-base">Capital works</h2><span className="text-xs text-muted-foreground tnum">{fmtMoneyExact(commitments)} still to pay</span></div>
    {projects.length === 0 ? <p className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">Nothing under way. Stands and corners are built in Ground Studio; services are upgraded from Services.</p> : projects.map((project) => {
      const asset = assetById(state, project.assetId);
      return <div key={project.id} className="space-y-1.5">
        <button type="button" className="block w-full text-left" onClick={() => onOpen(project)} aria-label={`Open ${asset?.name ?? "project"}`}>
          <div className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{asset?.name}</div>
          <ProjectProgress state={state} project={project} assetName={asset?.name} />
        </button>
        <div className="flex justify-end px-0.5">
          {confirming === project.id ? (
            <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">Cancel? 15% of what's left is charged.</span>
              <button type="button" className="font-semibold text-expense" onClick={() => { onCancel(project); setConfirming(null); }}>Cancel works</button>
              <button type="button" className="font-semibold" onClick={() => setConfirming(null)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="text-[11px] font-semibold text-muted-foreground" onClick={() => setConfirming(project.id)}>Cancel…</button>
          )}
        </div>
      </div>;
    })}
  </section>;
}

function MaintenancePanel({ state, current, onAdopt }: { state: GameState; current: GameState["infrastructure"] extends infer T ? T extends { maintenancePolicy: infer P } ? P : never : never; onAdopt: (policy: (typeof MAINTENANCE_POLICIES)[number]) => void }) {
  return <section className="space-y-2 rounded-xl border bg-card p-3">
    <div><h2 className="font-display text-base">Upkeep policy</h2><p className="text-[11px] text-muted-foreground">Applies to the whole ground. More upkeep costs more each week and slows wear.</p></div>
    {MAINTENANCE_POLICIES.map((policy) => {
      const active = current === policy;
      return <button key={policy} type="button" disabled={active} onClick={() => onAdopt(policy)} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 text-left", active ? "border-primary bg-primary/10" : "bg-background")}>
        <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-semibold">{policy}{active ? <Check className="size-3.5 text-primary" /> : null}</span><span className="block text-[10.5px] text-muted-foreground">{POLICY_CONFIG[policy].label}</span></span>
        <span className="text-right text-[10.5px] tnum"><strong className="block text-xs">{fmtMoneyExact(maintenanceCostUnder(state, policy))}/wk</strong><span className="text-muted-foreground">−{projectedSeasonDecay(state, policy).toFixed(1)} pts/season</span></span>
      </button>;
    })}
  </section>;
}

function HistoryPanel({ state }: { state: GameState }) {
  const records = [...(state.infrastructure?.history ?? [])].sort((a, b) => b.absoluteWeek - a.absoluteWeek).slice(0, 12);
  return <section className="space-y-2 rounded-xl border bg-card p-3"><h2 className="font-display text-base">Works history</h2>{records.length === 0 ? <p className="text-xs text-muted-foreground">No works recorded yet.</p> : records.map((record) => <div key={record.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t pt-2 text-xs"><div className="min-w-0"><div className="truncate">{record.description}</div><div className="text-[10px] text-muted-foreground">S{record.season} W{record.week} · {record.assetName}</div></div><span className="tnum text-expense">{record.cost ? fmtMoneyExact(record.cost) : "—"}</span></div>)}</section>;
}

