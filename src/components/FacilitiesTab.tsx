import { useMemo, useState } from "react";
import { Building2, Check, ChevronDown, CircleAlert, Hammer, History, ShieldCheck, Wrench, X } from "lucide-react";
import { StadiumGround, type GroundHotspot } from "@/components/game/StadiumGround";
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
} from "@/lib/game/infrastructure";
import { facilityCurrentEffect, groundProgression } from "@/lib/game/groundPresentation";
import { fmtMoneyExact } from "@/lib/game/engine";
import { fromAbsoluteWeek } from "@/lib/game/time";

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
  const [note, setNote] = useState<string | null>(null);
  const snap = useMemo(() => state.infrastructure ? infrastructureSnapshot(state) : null, [state]);
  const progression = useMemo(() => state.infrastructure ? groundProgression(state) : null, [state]);

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
  const candidates: Array<[string, string, InfrastructureAsset | undefined, string]> = [
    ["main", "Main Stand", mainStand, "lf-ground-label-main"],
    ["stands", "Terrace / Stand", otherStand, "lf-ground-label-stands"],
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

      <div className="lf-ground-layout min-h-0 flex-1">
        <StadiumGround stage={progression.visualStage} hotspots={hotspots} selectedId={openAssetId} onSelect={(hotspot) => setOpenAssetId(hotspot.asset.id)} />

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

          {view === "ground" ? <GroundStatus snap={snap} assets={list} onOpen={(asset) => setOpenAssetId(asset.id)} critical={snap.criticalAssets} /> : null}
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

      <Sheet open={Boolean(open)} onOpenChange={(isOpen) => { if (!isOpen) setOpenAssetId(null); }}>
        {open ? <FacilitySheet state={state} asset={open} onApprove={(type) => {
          const result = approveProject(state, open.id, type);
          setNote(result.ok ? `Project approved on ${open.name}.` : (result.reason ?? "Unable to approve project."));
          if (result.ok) { update(() => result.state); setOpenAssetId(null); }
        }} /> : null}
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
function FacilitySheet({ state, asset, onApprove }: { state: GameState; asset: InfrastructureAsset; onApprove: (type: CapitalProjectType) => void }) {
  const config = ASSET_CONFIG[asset.type];
  const catalogue = projectCatalogue(state, asset.id);
  const levelName = config.levels[asset.level - 1] ?? `Level ${asset.level}`;
  const nextLevel = config.levels[asset.level] ?? "Maximum level reached";
  const band = conditionBand(asset.condition);
  const activeProject = asset.activeProjectId
    ? state.infrastructure?.projects.find((project) => project.id === asset.activeProjectId) ?? null
    : null;
  return <SheetContent side="bottom" className="lf-ground-sheet">
    <div className="border-b bg-panel px-4 py-3 text-panel-foreground">
      <div className="flex items-center gap-2 pr-8 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
        <span>{config.label}</span><span>·</span><span>{asset.location}</span>
      </div>
      <div className="mt-0.5 flex items-end justify-between gap-3 pr-8">
        <SheetTitle className="min-w-0 truncate font-display text-2xl text-panel-foreground">{asset.name}</SheetTitle>
        <span className={cn("shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[9px] font-semibold uppercase", BAND_TONE[band])}>{BAND_LABEL[band]}</span>
      </div>
    </div>
    <div className="lf-ground-sheet-scroll space-y-4 p-4">
      <div className="grid grid-cols-3 divide-x border bg-muted/25">
        <GroundMetric label="Level" value={`${asset.level} / ${config.maxLevel}`} />
        <GroundMetric label="Condition" value={`${asset.condition.toFixed(0)}%`} />
        <GroundMetric label={asset.capacity ? "Available" : "Quality"} value={asset.capacity ? asset.usableCapacity.toLocaleString() : `${asset.qualityRating}/100`} />
      </div>

      <div className="rounded-sm border-l-2 border-primary bg-muted/35 px-3 py-2">
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Current standard</div>
        <div className="mt-0.5 font-display text-base">{levelName}</div>
        <div className="mt-1 text-xs text-muted-foreground">{facilityCurrentEffect(asset)}</div>
      </div>

      {activeProject ? (
        <div className="border border-banner/40 bg-banner/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Work in progress</div>
              <div className="truncate font-display text-base">{activeProject.title}</div>
            </div>
            <strong className="font-mono text-xs">{Math.round(activeProject.progress)}%</strong>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round(activeProject.progress))}%` }} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm bg-muted/35 px-3 py-2">
          <div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Next standard</div>
            <div className="font-display text-base">{nextLevel}</div>
          </div>
          {asset.level < config.maxLevel ? <span className="text-[10px] text-muted-foreground">via works</span> : null}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg">Available works</h3>
          <span className="text-[10px] text-muted-foreground">{catalogue.length} option{catalogue.length === 1 ? "" : "s"}</span>
        </div>
        <div className="mt-2 grid gap-2">
          {catalogue.length === 0 ? <p className="rounded-sm bg-muted/35 p-3 text-sm text-muted-foreground">No further work can be raised here right now.</p> : catalogue.map((spec) => {
            const evaluation = evaluateProject(state, asset.id, spec.type);
            if (!evaluation) return null;
            return <article key={spec.type} className="rounded-sm border bg-background p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="min-w-0"><h4 className="truncate font-display text-base">{spec.title}</h4><p className="mt-1 text-xs leading-snug text-muted-foreground">{spec.description}</p></div>
                <strong className="tnum text-sm">{fmtMoneyExact(spec.cost)}</strong>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{spec.durationWeeks} weeks</span><span>{Math.round(spec.risk)}% risk</span><span>{Math.round((1 - spec.disruption.capacityFactor) * 100)}% disruption</span>
              </div>
              {!evaluation.allowed ? <p className="mt-2 text-[10px] text-expense">{evaluation.reason}</p> : null}
              <Button className="mt-3 w-full" size="sm" disabled={!evaluation.allowed} onClick={() => onApprove(spec.type)}>
                {evaluation.allowed ? `Approve · ${fmtMoneyExact(spec.cost)}` : "Requirements not met"}
              </Button>
            </article>;
          })}
        </div>
      </div>
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
