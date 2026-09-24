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
  const clubhouse = chooseAsset(list, "shop", "shop");
  const lights = chooseAsset(list, "stand-N", "stand", mainStand?.id);
  const candidates: Array<[string, string, InfrastructureAsset | undefined, string]> = [
    ["main", "Main Stand", mainStand, "lf-ground-label-main"],
    ["stands", "Stands / Terracing", otherStand, "lf-ground-label-stands"],
    ["pitch", "Pitch", pitch, "lf-ground-label-pitch"],
    ["lights", "Floodlights", lights, "lf-ground-label-lights"],
    ["hospitality", "Hospitality", hospitality, "lf-ground-label-hospitality"],
    ["media", "Media / Press", media, "lf-ground-label-media"],
    ["access", "Safety / Access", access, "lf-ground-label-access"],
    ["clubhouse", "Clubhouse", clubhouse, "lf-ground-label-clubhouse"],
  ];
  const hotspots: GroundHotspot[] = candidates.flatMap(([id, label, asset, className]) => asset ? [{ id, label, asset, className }] : []);
  const open = openAssetId ? assetById(state, openAssetId) : null;
  const nextRequirements = progression.next?.requirements ?? [];
  const metCount = nextRequirements.filter((requirement) => requirement.met).length;

  return (
    <div className="lf-ground-screen flex h-full min-h-0 flex-col gap-2">
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Facilities</div>
          <h1 className="truncate font-display text-2xl leading-none md:text-3xl">{progression.current.name}</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Overall condition</div>
          <div className={cn("font-display text-xl", BAND_TONE[conditionBand(snap.averageStadiumCondition)])}>{snap.averageStadiumCondition.toFixed(0)}%</div>
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
              <GroundMetric label="Available" value={snap.usableCapacity.toLocaleString()} />
              <GroundMetric label="Weekly cost" value={fmtMoneyExact(snap.weeklyMaintenance + snap.weeklyOperating)} />
            </div>
            <Button variant="ghost" className="h-auto w-full justify-between rounded-none px-3 py-2 text-left" onClick={() => setRequirementsOpen((value) => !value)}>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase text-muted-foreground">Next evolution</span>
                <span className="block truncate font-display text-base">{progression.next?.name ?? "Elite standard reached"}</span>
                {progression.next ? <span className="block text-[11px] text-muted-foreground">{metCount} / {nextRequirements.length} requirements met</span> : null}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", requirementsOpen && "rotate-180")} />
            </Button>
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

          {view === "ground" ? <GroundStatus snap={snap} onOpen={(asset) => setOpenAssetId(asset.id)} critical={snap.criticalAssets} /> : null}
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

function GroundStatus({ snap, critical, onOpen }: { snap: ReturnType<typeof infrastructureSnapshot>; critical: InfrastructureAsset[]; onOpen: (asset: InfrastructureAsset) => void }) {
  return <section className="border bg-card p-3">
    <div className="flex items-center gap-2"><ShieldCheck className={cn("size-4", critical.length ? "text-expense" : "text-income")} /><h2 className="font-display text-base">Ground report</h2><span className="ml-auto text-xs text-muted-foreground">Risk: {snap.riskLabel}</span></div>
    {critical.length ? <div className="mt-2 space-y-1">{critical.slice(0, 3).map((asset) => <Button key={asset.id} variant="ghost" className="h-8 w-full justify-between rounded-none px-1 text-xs" onClick={() => onOpen(asset)}><span className="truncate">{asset.name}</span><span className="text-expense">{asset.condition.toFixed(0)}%</span></Button>)}</div> : <p className="mt-1 text-xs text-muted-foreground">No assets require critical intervention.</p>}
    <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">{snap.activeProjects.length} active project{snap.activeProjects.length === 1 ? "" : "s"} · {fmtMoneyExact(snap.totalCapitalSpend)} invested to date</div>
  </section>;
}

function FacilitySheet({ state, asset, onApprove }: { state: GameState; asset: InfrastructureAsset; onApprove: (type: CapitalProjectType) => void }) {
  const config = ASSET_CONFIG[asset.type];
  const catalogue = projectCatalogue(state, asset.id);
  const nextLevel = config.levels[asset.level] ?? "Maximum level reached";
  return <SheetContent side="bottom" className="lf-ground-sheet">
    <div className="border-b bg-panel px-4 py-3 text-panel-foreground">
      <div className="pr-8 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{config.label} · {asset.location}</div>
      <SheetTitle className="font-display text-2xl text-panel-foreground">{asset.name}</SheetTitle>
    </div>
    <div className="lf-ground-sheet-scroll space-y-4 p-4">
      <div className="grid grid-cols-3 gap-2">
        <GroundMetric label="Level" value={`${asset.level} / ${config.maxLevel}`} />
        <GroundMetric label="Condition" value={`${asset.condition.toFixed(0)}%`} />
        <GroundMetric label={asset.capacity ? "Usable" : "Quality"} value={asset.capacity ? asset.usableCapacity.toLocaleString() : `${asset.qualityRating}/100`} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="lf-ground-metric bg-muted/45 p-3"><div className="text-[10px] uppercase text-muted-foreground">Current effect</div><div className="mt-1 text-sm">{facilityCurrentEffect(asset)}</div></div>
        <div className="lf-ground-metric bg-muted/45 p-3"><div className="text-[10px] uppercase text-muted-foreground">Next-level effect</div><div className="mt-1 text-sm">{nextLevel}</div></div>
      </div>
      {asset.activeProjectId ? <div className="border border-banner/40 bg-banner/10 p-3 text-sm">Work is already in progress on this facility.</div> : null}
      <div>
        <h3 className="font-display text-lg">Available works</h3>
        <div className="mt-2 grid gap-2">
          {catalogue.length === 0 ? <p className="text-sm text-muted-foreground">No further work can be raised here right now.</p> : catalogue.map((spec) => {
            const evaluation = evaluateProject(state, asset.id, spec.type);
            if (!evaluation) return null;
            return <article key={spec.type} className="border bg-background p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><h4 className="truncate font-display text-base">{spec.title}</h4><p className="mt-1 text-xs text-muted-foreground">{spec.description}</p></div><strong className="tnum text-sm">{fmtMoneyExact(spec.cost)}</strong></div>
              <div className="mt-2 flex gap-3 text-[10px] uppercase text-muted-foreground"><span>{spec.durationWeeks} weeks</span><span>{Math.round(spec.risk)}% risk</span><span>{Math.round((1 - spec.disruption.capacityFactor) * 100)}% disruption</span></div>
              <p className="mt-2 text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">Requirements:</span> {evaluation.reason}</p>
              <Button className="mt-3 w-full" size="sm" disabled={!evaluation.allowed} onClick={() => onApprove(spec.type)}>{evaluation.allowed ? `Approve · ${fmtMoneyExact(spec.cost)}` : "Requirements not met"}</Button>
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
