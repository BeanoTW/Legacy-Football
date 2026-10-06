import { useMemo, useState } from "react";
import { BriefcaseBusiness, Building2, Check, ChevronDown, CircleAlert, Hammer, History, Palette, ShieldCheck, Wrench, X } from "lucide-react";
import { StadiumGround, type GroundHotspot } from "@/components/game/StadiumGround";
import { GroundStudioSheet, StandBuildChooser } from "@/components/game/GroundStudio";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CapitalProject, CapitalProjectType, GameState, InfrastructureAsset } from "@/lib/game/types";
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
  infrastructureSnapshot,
  maintenanceCostUnder,
  projectCatalogue,
  projectedSeasonDecay,
  setMaintenancePolicy,
  type ProjectSpec,
  facilityProgressionSpec,
} from "@/lib/game/infrastructure";
import { facilityCurrentEffect, groundProgression } from "@/lib/game/groundPresentation";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { fromAbsoluteWeek } from "@/lib/game/time";
import { stadiumAccreditation } from "@/lib/game/stadiumAccreditation";
import { clubOperatingModel, professionaliseUserClub, userProfessionalisationReadiness } from "@/lib/game/employment";
import { userClubReference } from "@/lib/game/clubReference";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundDesign, sceneLook, type StandBuild } from "@/lib/game/groundIdentity";
import { approveStandBuild, isLevelRaising } from "@/lib/game/groundBuild";

type SupportingView = "ground" | "projects" | "maintenance" | "history";

const BAND_TONE: Record<string, string> = {
  excellent: "text-income",
  good: "text-income",
  worn: "text-foreground",
  poor: "text-expense",
  critical: "text-expense",
  closed: "text-muted-foreground",
};

function chooseAsset(list: InfrastructureAsset[], id: string, fallbackType: InfrastructureAsset["type"], excludeId?: string) {
  return list.find((asset) => asset.id === id)
    ?? list.find((asset) => asset.type === fallbackType && asset.id !== excludeId)
    ?? list[0];
}

export function FacilitiesTab({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [view, setView] = useState<SupportingView>("ground");
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
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
  const unmetCount = Math.max(0, nextRequirements.length - metCount);
  const evolutionPercent = progression.next && nextRequirements.length
    ? Math.round((metCount / nextRequirements.length) * 100)
    : 100;
  const nextUnlock = nextRequirements.find((requirement) => !requirement.met) ?? null;

  return (
    <div className="lf-ground-screen flex h-full min-h-0 flex-col gap-2">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Facilities</div>
          <h1 className="truncate font-display text-2xl leading-none md:text-3xl">{progression.current.name}</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Overall condition</div>
          <div className={cn("font-display text-xl leading-none", BAND_TONE[conditionBand(snap.averageStadiumCondition)])}>{snap.averageStadiumCondition.toFixed(0)}%</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">{BAND_LABEL[conditionBand(snap.averageStadiumCondition)]}</div>
        </div>
      </header>

      {note ? (
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border border-primary/30 bg-secondary px-3 py-2 text-xs">
          <span className="min-w-0 truncate">{note}</span>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Dismiss message" onClick={() => setNote(null)}><X /></Button>
        </div>
      ) : null}

      <div className="flex shrink-0 justify-end">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setStudioOpen(true)}>
          <Palette className="size-3.5" /> Ground Studio
        </Button>
      </div>

      <div className="lf-ground-layout min-h-0 flex-1">
        <StadiumGround stage={progression.visualStage} hotspots={hotspots} selectedId={openAssetId} onSelect={(hotspot) => setOpenAssetId(hotspot.asset.id)} look={look} design={design} />

        <aside className="lf-ground-sidebar space-y-2 pt-2 md:pt-0">
          <section className="border bg-card">
            <div className="grid grid-cols-3 divide-x border-b">
              <GroundMetric label="Capacity" value={snap.capacity.toLocaleString()} />
              <GroundMetric label="Open capacity" value={snap.usableCapacity.toLocaleString()} />
              <GroundMetric label="Weekly cost" value={fmtMoneyExact(snap.weeklyMaintenance + snap.weeklyOperating)} />
            </div>
            <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-3 py-2 text-left" onClick={() => setRequirementsOpen((value) => !value)}>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase text-muted-foreground">Next evolution</span>
                <span className="block truncate font-display text-base">{progression.next?.name ?? "Elite standard reached"}</span>
                {progression.next ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {metCount} / {nextRequirements.length} requirements met · {unmetCount} remaining
                  </span>
                ) : null}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", requirementsOpen && "rotate-180")} />
            </Button>
            {progression.next ? (
              <div className="px-3 pb-3">
                <div className="lf-ground-evolution-track" aria-label={`${evolutionPercent}% of next ground evolution requirements met`}>
                  <div className="lf-ground-evolution-fill" style={{ width: `${evolutionPercent}%` }} />
                </div>
                {nextUnlock ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-muted-foreground">
                    <span className="truncate">Next unlock · {nextUnlock.label}</span>
                    <span className="shrink-0 font-mono normal-case tracking-normal">{nextUnlock.value}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
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

          <nav className="grid grid-cols-4 gap-1" aria-label="Facilities sections">
            {([
              ["ground", Building2, "Ground"],
              ["projects", Hammer, "Works"],
              ["maintenance", Wrench, "Upkeep"],
              ["history", History, "History"],
            ] as const).map(([key, Icon, label]) => (
              <Button key={key} variant={view === key ? "default" : "outline"} className="h-12 min-w-0 flex-col gap-0 rounded-sm px-1 text-[10px]" onClick={() => setView(key)}>
                <Icon className="size-4" /><span className="truncate">{label}</span>
              </Button>
            ))}
          </nav>

          {view === "ground" ? <>
            <GroundStatus snap={snap} assets={list} onOpen={(asset) => setOpenAssetId(asset.id)} critical={snap.criticalAssets} />
            {accreditation && professional ? <ClubStatusPanel state={state} accreditation={accreditation} professional={professional} onProfessionalise={() => {
              const outcome = professionaliseUserClub(state);
              setNote(outcome.result.reason);
              if (outcome.result.ok) update(() => outcome.state);
            }} /> : null}
          </> : null}
          {view === "projects" ? <ProjectsPanel state={state} projects={snap.activeProjects} commitments={snap.commitments} onCancel={(project) => {
            const result = cancelProject(state, project.id);
            setNote(result.ok ? `${project.title} cancelled — a penalty was booked.` : (result.reason ?? "Unable to cancel project."));
            if (result.ok) update(() => result.state);
          }} /> : null}
          {view === "maintenance" ? <MaintenancePanel state={state} current={snap.maintenancePolicy} onAdopt={(policy) => {
            update(() => setMaintenancePolicy(state, policy));
            setNote(`Maintenance policy set to ${policy}.`);
          }} /> : null}
          {view === "history" ? <HistoryPanel state={state} /> : null}
        </aside>
      </div>

      <GroundStudioSheet open={studioOpen} onOpenChange={setStudioOpen} state={state} update={update} />

      <Sheet open={Boolean(open)} onOpenChange={(isOpen) => { if (!isOpen) setOpenAssetId(null); }}>
        {open ? <FacilitySheet
          state={state}
          asset={open}
          onApprove={(type) => {
            const result = approveProject(state, open.id, type);
            setNote(result.ok ? `Project approved on ${open.name}.` : (result.reason ?? "Unable to approve project."));
            if (result.ok) { update(() => result.state); setOpenAssetId(null); }
          }}
          onApproveBuild={(type, build) => {
            const result = approveStandBuild(state, open.id, type, build);
            setNote(result.reason);
            if (result.ok) { update(() => result.state); setOpenAssetId(null); }
          }}
        /> : null}
      </Sheet>
    </div>
  );
}

function GroundMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-2 py-2"><div className="truncate text-[9px] uppercase text-muted-foreground">{label}</div><div className="truncate font-display text-sm tnum">{value}</div></div>;
}

function GroundStatus({ snap, assets, critical, onOpen }: { snap: ReturnType<typeof infrastructureSnapshot>; assets: InfrastructureAsset[]; critical: InfrastructureAsset[]; onOpen: (asset: InfrastructureAsset) => void }) {
  const watchlist = [...assets].sort((a, b) => a.condition - b.condition).slice(0, 3);
  const availabilityLoss = Math.max(0, snap.capacity - snap.usableCapacity);
  return <section className="border bg-card p-3">
    <div className="flex items-center gap-2">
      <ShieldCheck className={cn("size-4", critical.length ? "text-expense" : "text-income")} />
      <h2 className="font-display text-base">Ground report</h2>
      <span className="ml-auto text-xs text-muted-foreground">Risk: {snap.riskLabel}</span>
    </div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-sm bg-muted/45 px-2 py-1.5">
        <span className="block text-[9px] uppercase text-muted-foreground">Capacity unavailable</span>
        <strong className={cn("font-display text-sm tnum", availabilityLoss ? "text-expense" : "text-income")}>{availabilityLoss.toLocaleString()}</strong>
      </div>
      <div className="rounded-sm bg-muted/45 px-2 py-1.5">
        <span className="block text-[9px] uppercase text-muted-foreground">Live works</span>
        <strong className="font-display text-sm tnum">{snap.activeProjects.length}</strong>
      </div>
    </div>
    <div className="mt-2 border-t pt-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{critical.length ? "Needs attention" : "Lowest condition"}</span>
        <span className="text-[9px] text-muted-foreground">Tap to inspect</span>
      </div>
      <div className="grid gap-1">
        {(critical.length ? critical.slice(0, 3) : watchlist).map((asset) => (
          <button key={asset.id} type="button" className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-muted/60" onClick={() => onOpen(asset)}>
            <span className="min-w-0 truncate text-xs">{asset.name}</span>
            <span className={cn("font-mono text-[10px]", BAND_TONE[conditionBand(asset.condition)])}>{asset.condition.toFixed(0)}%</span>
          </button>
        ))}
      </div>
    </div>
    <div className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">{fmtMoneyExact(snap.totalCapitalSpend)} invested in the ground to date</div>
  </section>;
}
function ClubStatusPanel({ state, accreditation, professional, onProfessionalise }: { state: GameState; accreditation: ReturnType<typeof stadiumAccreditation>; professional: ReturnType<typeof userProfessionalisationReadiness>; onProfessionalise: () => void }) {
  const fullTime = clubOperatingModel(state, userClubReference(state)) === "FullTime";
  return <section className="border bg-card p-3">
    <div className="flex items-center gap-2"><BriefcaseBusiness className={cn("size-4", fullTime ? "text-income" : "text-muted-foreground")} /><h2 className="font-display text-base">Club status</h2><span className={cn("ml-auto text-xs font-semibold", fullTime ? "text-income" : "text-muted-foreground")}>{fullTime ? "Full-time" : "Semi-professional"}</span></div>
    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
      <div className="rounded-sm bg-muted/45 px-2 py-1.5"><span className="block text-[9px] uppercase text-muted-foreground">Ground accreditation</span><strong className="font-display text-sm">{accreditation.faCapacityLabel}</strong></div>
      <div className="rounded-sm bg-muted/45 px-2 py-1.5"><span className="block text-[9px] uppercase text-muted-foreground">EFL qualification</span><strong className={cn("font-display text-sm", accreditation.eflQualificationReady ? "text-income" : "text-muted-foreground")}>{accreditation.eflQualificationReady ? "Ready" : "Not yet"}</strong></div>
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

type WorksGroup = "repair" | "improve" | "rebuild";

const GROUP_OF: Partial<Record<CapitalProjectType, WorksGroup>> = {
  minorRepair: "repair",
  majorRepair: "repair",
  refurbishment: "repair",
  replacement: "rebuild",
  capacityExpansion: "rebuild",
  standRedevelopment: "rebuild",
  cornerBuild: "rebuild",
  cornerExpansion: "rebuild",
};
const GROUP_LABEL: Record<WorksGroup, string> = { repair: "Repair", improve: "Improve", rebuild: "Rebuild & expand" };

const BAND_CHIP: Record<string, string> = {
  excellent: "bg-emerald-500 text-white",
  good: "bg-emerald-500 text-white",
  worn: "bg-amber-400 text-amber-950",
  poor: "bg-rose-500 text-white",
  critical: "bg-rose-600 text-white",
  closed: "bg-slate-500 text-white",
};
const BAND_BAR: Record<string, string> = {
  excellent: "bg-emerald-500",
  good: "bg-emerald-500",
  worn: "bg-amber-400",
  poor: "bg-rose-500",
  critical: "bg-rose-600",
  closed: "bg-slate-400",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a piece of work actually does, as short chips. */
function effectChips(spec: ProjectSpec, asset: InfrastructureAsset): string[] {
  const out: string[] = [];
  for (const effect of spec.effects) {
    if (effect.kind === "condition") {
      if (effect.to != null) out.push(`Condition to ${effect.to}%`);
      else if ((effect.add ?? 0) > 0) out.push(`+${effect.add} condition`);
    } else if (effect.kind === "level") out.push(effect.add > 1 ? `+${effect.add} levels` : "+1 level");
    else if (effect.kind === "capacity") out.push(`+${effect.add.toLocaleString("en-GB")} ${asset.type === "stand" ? "places" : "capacity"}`);
    else if (effect.kind === "quality") out.push(`Quality +${effect.add}`);
    else if (effect.kind === "resetAge") out.push("Like new");
    else if (effect.kind === "metadata") {
      const amount = "add" in effect && typeof effect.add === "number" ? effect.add : 0;
      const label: Record<string, string> = {
        roofQuality: "Better roof",
        seatingQuality: "New seats",
        concourseQuality: "Better concourse",
        accessibility: "Fully accessible",
        hospitalityCapacity: amount ? `+${amount} hospitality places` : "Hospitality",
        commercialSpace: "More retail space",
      };
      if (label[effect.key]) out.push(label[effect.key]);
    }
  }
  return [...new Set(out)].slice(0, 4);
}

function riskLevel(risk: number) {
  return risk >= 50 ? { label: "High risk", tone: "text-rose-600" } : risk >= 25 ? { label: "Medium risk", tone: "text-amber-600" } : { label: "Low risk", tone: "text-emerald-600" };
}

/** A short, human reason a project can't go ahead. */
function blockedReason(state: GameState, spec: ProjectSpec, evaluation: NonNullable<ReturnType<typeof evaluateProject>>): string {
  if (!evaluation.assetFree) return "Work already under way here";
  if (!evaluation.capacityOk) return spec.major ? "One major project at a time" : "A minor repair is already running";
  const shortfall = spec.cost - Math.round(state.cash);
  if (shortfall > 0) return `${fmtMoney(shortfall)} short`;
  const reserve = state.finance?.minimumCashReserve ?? 0;
  if (reserve > 0) return `Would break the board's ${fmtMoney(reserve)} reserve`;
  return evaluation.reason;
}

export function FacilitySheet({ state, asset, onApprove, onApproveBuild }: { state: GameState; asset: InfrastructureAsset; onApprove: (type: CapitalProjectType) => void; onApproveBuild: (type: CapitalProjectType, build: StandBuild) => void }) {
  const config = ASSET_CONFIG[asset.type];
  const catalogue = projectCatalogue(state, asset.id);
  // Structural stand development is owned by Ground Studio. Facilities owns
  // non-visual capability and every non-stand facility upgrade.
  const visibleCatalogue = asset.type === "stand" || asset.type === "cornerStand"
    ? catalogue.filter((spec) => ["minorRepair", "majorRepair", "refurbishment", "replacement"].includes(spec.type))
    : catalogue;
  const band = conditionBand(asset.condition);
  const progressionSpec = facilityProgressionSpec(state, asset);
  const activeProject = asset.activeProjectId
    ? state.infrastructure?.projects.find((project) => project.id === asset.activeProjectId) ?? null
    : null;
  // Raising a stand's level asks how it should be built first.
  const [choosing, setChoosing] = useState<ProjectSpec | null>(null);
  const groupOf = (type: CapitalProjectType): WorksGroup => GROUP_OF[type] ?? "improve";
  const groups = (["repair", "improve", "rebuild"] as WorksGroup[]).filter((group) => visibleCatalogue.some((spec) => groupOf(spec.type) === group));
  const [group, setGroup] = useState<WorksGroup>(() => (asset.condition < 60 && groups.includes("repair") ? "repair" : groups.includes("improve") ? "improve" : groups[0] ?? "repair"));
  const [expanded, setExpanded] = useState<CapitalProjectType | null>(null);

  const rows = visibleCatalogue
    .filter((spec) => groupOf(spec.type) === group)
    .map((spec) => ({ spec, evaluation: evaluateProject(state, asset.id, spec.type) }))
    .filter((row): row is { spec: ProjectSpec; evaluation: NonNullable<ReturnType<typeof evaluateProject>> } => Boolean(row.evaluation))
    // What you can do first, then by cost.
    .sort((a, b) => Number(b.evaluation.allowed) - Number(a.evaluation.allowed) || a.spec.cost - b.spec.cost);

  return <SheetContent side="bottom" className="lf-ground-sheet">
    <div className="border-b bg-panel px-4 pb-3 pt-3 text-panel-foreground">
      <div className="flex items-center gap-2 pr-9 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
        <span>{config.label}</span><span>·</span><span className="truncate">{asset.location}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3 pr-9">
        <SheetTitle className="min-w-0 truncate font-display text-2xl text-panel-foreground">{asset.name}</SheetTitle>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", BAND_CHIP[band])}>{BAND_LABEL[band]}</span>
      </div>
      {/* The ladder of standards this facility can reach. */}
      <div className="mt-2.5 flex gap-1" aria-label={`Level ${asset.level} of ${config.maxLevel}`}>
        {config.levels.map((name, index) => (
          <div key={name} className="min-w-0 flex-1">
            <div className={cn("h-1.5 rounded-full", index < asset.level ? "bg-emerald-400" : "bg-white/20")} />
            <div className={cn("mt-1 truncate text-[8px] font-bold uppercase tracking-wide", index === asset.level - 1 ? "text-white" : "text-white/45")}>{name}</div>
          </div>
        ))}
      </div>
    </div>
    <div className="lf-ground-sheet-scroll space-y-3 p-3">
      {choosing ? (
        <StandBuildChooser
          state={state}
          asset={asset}
          spec={choosing}
          onCancel={() => setChoosing(null)}
          onConfirm={(build) => { onApproveBuild(choosing.type, build); setChoosing(null); }}
        />
      ) : <>
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Now</div>
            <div className="truncate font-display text-base leading-tight">{config.levels[asset.level - 1] ?? `Level ${asset.level}`}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-base leading-tight tnum">{asset.capacity ? asset.usableCapacity.toLocaleString("en-GB") : `${asset.qualityRating}/100`}</div>
            <div className="text-[9px] uppercase text-muted-foreground">{asset.capacity ? (asset.type === "stand" ? "Usable places" : "Capacity") : "Quality"}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${Math.max(2, Math.min(100, asset.condition))}%` }} />
          </div>
          <span className="shrink-0 whitespace-nowrap text-right text-[10px] font-semibold tnum text-muted-foreground">{asset.condition.toFixed(0)}% condition</span>
        </div>
        {asset.level < config.maxLevel && !activeProject ? (
          <div className="mt-1.5 text-[10.5px] text-muted-foreground">Next standard: <strong className="text-foreground">{progressionSpec.next}</strong></div>
        ) : null}
        {asset.type !== "stand" ? (
          <div className="mt-2 border-t pt-2">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">What this facility does</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {progressionSpec.benefits.map((benefit) => <span key={benefit} className="rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold">{benefit}</span>)}
            </div>
            {progressionSpec.dependency ? (
              <p className={cn("mt-1.5 text-[10px]", progressionSpec.dependencyMet ? "text-muted-foreground" : "font-semibold text-rose-600")}>
                {progressionSpec.dependencyMet ? "Structure ready · " : "Locked · "}{progressionSpec.dependency}
              </p>
            ) : null}
            {progressionSpec.nextImpact.length > 0 ? (
              <div className="mt-2 border-t pt-2">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Next upgrade changes</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {progressionSpec.nextImpact.map((impact) => <span key={impact} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary">{impact}</span>)}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {activeProject ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-primary">Work in progress</div>
              <div className="truncate text-sm font-semibold">{activeProject.title.replace(`${asset.name} — `, "")}</div>
            </div>
            <strong className="font-mono text-xs">{Math.round(activeProject.progress)}%</strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(activeProject.progress))}%` }} />
          </div>
        </div>
      ) : null}

      <div>
        {groups.length > 1 && (
          <div className="mb-2 flex rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label="Kind of work">
            {groups.map((id) => {
              const count = visibleCatalogue.filter((spec) => groupOf(spec.type) === id).length;
              return (
                <button key={id} type="button" role="tab" aria-selected={group === id} onClick={() => { setGroup(id); setExpanded(null); }}
                  className={cn("flex-1 rounded-md px-1 py-1.5 text-[11px] font-bold", group === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                  {GROUP_LABEL[id]} <span className="font-semibold opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {visibleCatalogue.length === 0 ? <p className="rounded-lg bg-muted/35 p-3 text-sm text-muted-foreground">{asset.type === "stand" || asset.type === "cornerStand" ? "Structural development is handled in Ground Studio. Facilities tracks condition and maintenance." : "No further work can be raised here right now."}</p> : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {rows.map(({ spec, evaluation }) => {
              const choosesBuild = asset.type === "stand" && isLevelRaising(spec.type);
              const risk = riskLevel(spec.risk);
              const open = expanded === spec.type;
              const chips = effectChips(spec, asset);
              const supporters = evaluation.positions.filter((p) => p.stance === "supports").length;
              const opponents = evaluation.positions.filter((p) => p.stance === "opposes").length;
              const title = spec.title.replace(`${asset.name} — `, "");
              return (
                <div key={spec.type} className={cn("border-t first:border-t-0", !evaluation.allowed && "bg-muted/25")}>
                  <button type="button" onClick={() => setExpanded(open ? null : spec.type)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left" aria-expanded={open}>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px] font-semibold first-letter:uppercase", !evaluation.allowed && "text-muted-foreground")}>{title}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {chips.map((chip) => (
                          <span key={chip} className={cn("rounded px-1.5 py-0.5 text-[9.5px] font-bold", evaluation.allowed ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground")}>{chip}</span>
                        ))}
                        {choosesBuild && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold text-primary">You choose the build</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                        <span>{plural(spec.durationWeeks, "week")}</span>
                        <span className={risk.tone}>{risk.label}</span>
                        {spec.disruption.capacityFactor < 1 && <span>{Math.round((1 - spec.disruption.capacityFactor) * 100)}% closed during works</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={cn("block font-display text-[15px] leading-tight tnum", !evaluation.allowed && "text-muted-foreground")}>{fmtMoneyExact(spec.cost)}</span>
                      {!evaluation.allowed ? (
                        <span className="mt-0.5 block max-w-[8.5rem] text-[10px] font-semibold leading-tight text-rose-600">{blockedReason(state, spec, evaluation)}</span>
                      ) : evaluation.affordability.verdict === "affordableButRisky" ? (
                        <span className="mt-0.5 block text-[10px] font-semibold text-amber-600">Stretches the budget</span>
                      ) : (
                        <ChevronDown className={cn("ml-auto mt-1 size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                      )}
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-2 px-3 pb-3">
                      <p className="text-[11.5px] leading-snug text-muted-foreground">{spec.description}</p>
                      {evaluation.positions.length > 0 && (
                        <div className="text-[10.5px] text-muted-foreground">
                          Board: <span className="font-semibold text-emerald-700">{supporters} for</span> · <span className="font-semibold text-rose-700">{opponents} against</span> · {evaluation.positions.length - supporters - opponents} undecided
                        </div>
                      )}
                      {evaluation.allowed && evaluation.affordability.verdict === "affordableButRisky" && (
                        <p className="text-[10.5px] text-amber-700">{evaluation.reason}</p>
                      )}
                      <Button className="w-full" size="sm" disabled={!evaluation.allowed} onClick={() => choosesBuild ? setChoosing(spec) : onApprove(spec.type)}>
                        {!evaluation.allowed ? blockedReason(state, spec, evaluation) : choosesBuild ? "Choose the build…" : `Approve · ${fmtMoneyExact(spec.cost)}`}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>}
    </div>
  </SheetContent>;
}
function ProjectsPanel({ state, projects, commitments, onCancel }: { state: GameState; projects: CapitalProject[]; commitments: number; onCancel: (project: CapitalProject) => void }) {
  return <section className="space-y-2 border bg-card p-3"><div className="flex justify-between"><h2 className="font-display text-base">Capital works</h2><span className="text-xs text-muted-foreground">{fmtMoneyExact(commitments)} committed</span></div>{projects.length === 0 ? <p className="text-xs text-muted-foreground">No work in progress. Select an area of the ground to begin.</p> : projects.map((project) => {
    const eta = project.expectedCompletionAbsoluteWeek == null ? null : fromAbsoluteWeek(project.expectedCompletionAbsoluteWeek);
    return <div key={project.id} className="border-t pt-2"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-medium">{project.title}</span><span className="tnum">{Math.round(project.progress * 100)}%</span></div><div className="mt-1 h-1 bg-secondary"><div className="h-full bg-primary" style={{ width: `${Math.max(2, Math.round(project.progress * 100))}%` }} /></div><div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{eta ? `Due S${eta.season} W${eta.week}` : "Schedule pending"}</span><Button variant="link" className="h-auto p-0 text-[10px]" onClick={() => onCancel(project)}>Cancel</Button></div></div>;
  })}</section>;
}

function MaintenancePanel({ state, current, onAdopt }: { state: GameState; current: GameState["infrastructure"] extends infer T ? T extends { maintenancePolicy: infer P } ? P : never : never; onAdopt: (policy: (typeof MAINTENANCE_POLICIES)[number]) => void }) {
  return <section className="space-y-2 border bg-card p-3"><h2 className="font-display text-base">Maintenance policy</h2>{MAINTENANCE_POLICIES.map((policy) => <Button key={policy} variant={current === policy ? "default" : "outline"} className="h-auto w-full justify-between px-3 py-2 text-left" disabled={current === policy} onClick={() => onAdopt(policy)}><span><span className="block text-xs font-semibold">{policy}</span><span className="block whitespace-normal text-[10px] opacity-70">{POLICY_CONFIG[policy].label}</span></span><span className="ml-2 text-right text-[10px] tnum">{fmtMoneyExact(maintenanceCostUnder(state, policy))}/wk<br />−{projectedSeasonDecay(state, policy).toFixed(1)} pts</span></Button>)}</section>;
}

function HistoryPanel({ state }: { state: GameState }) {
  const records = [...(state.infrastructure?.history ?? [])].sort((a, b) => b.absoluteWeek - a.absoluteWeek).slice(0, 12);
  return <section className="space-y-2 border bg-card p-3"><h2 className="font-display text-base">Works history</h2>{records.length === 0 ? <p className="text-xs text-muted-foreground">No works recorded yet.</p> : records.map((record) => <div key={record.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t pt-2 text-xs"><div className="min-w-0"><div className="truncate">{record.description}</div><div className="text-[10px] text-muted-foreground">S{record.season} W{record.week} · {record.assetName}</div></div><span className="tnum text-expense">{record.cost ? fmtMoneyExact(record.cost) : "—"}</span></div>)}</section>;
}
