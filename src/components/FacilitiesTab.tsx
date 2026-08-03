import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  CapitalProject,
  CapitalProjectType,
  GameState,
  InfrastructureAsset,
} from "@/lib/game/types";
import {
  ASSET_CONFIG,
  BAND_LABEL,
  MAINTENANCE_POLICIES,
  PROJECT_LABEL,
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
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { fromAbsoluteWeek } from "@/lib/game/time";

type View = "assets" | "projects" | "maintenance" | "history";

const BAND_TONE: Record<string, string> = {
  excellent: "text-[color:var(--color-income)]",
  good: "text-[color:var(--color-income)]",
  worn: "text-foreground",
  poor: "text-[color:var(--color-expense)]",
  critical: "text-[color:var(--color-expense)]",
  closed: "text-muted-foreground",
};

export function FacilitiesTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("assets");
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const snap = useMemo(
    () => (state.infrastructure ? infrastructureSnapshot(state) : null),
    [state],
  );

  if (!state.infrastructure || !snap) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        The club's physical assets have not been surveyed yet. Advance a week to open the
        facilities department.
      </div>
    );
  }

  const list = allAssets(state);
  const open = openAssetId ? assetById(state, openAssetId) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs">Facilities &amp; Infrastructure</div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            label="Stadium capacity"
            value={snap.capacity.toLocaleString()}
            hint={`${snap.usableCapacity.toLocaleString()} usable this week`}
          />
          <Stat
            label="Average condition"
            value={`${snap.averageAssetCondition.toFixed(0)}%`}
            hint={`Stands ${snap.averageStadiumCondition.toFixed(0)}%`}
          />
          <Stat
            label="Weekly upkeep"
            value={fmtMoneyExact(snap.weeklyMaintenance + snap.weeklyOperating)}
            hint={`${fmtMoney(snap.weeklyMaintenance)} maintenance`}
          />
          <Stat
            label="Risk"
            value={snap.riskLabel}
            hint={
              snap.criticalAssets.length
                ? `${snap.criticalAssets.length} asset(s) critical`
                : "No assets in danger"
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["assets", "projects", "maintenance", "history"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs capitalize",
              view === v ? "bg-primary text-primary-foreground" : "bg-background",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {note && (
        <div className="rounded-lg border bg-secondary px-3 py-2 text-xs">{note}</div>
      )}

      {view === "assets" && (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <AssetCard
              key={a.id}
              state={state}
              asset={a}
              onOpen={() => setOpenAssetId(a.id)}
            />
          ))}
        </div>
      )}

      {view === "projects" && (
        <Panel title="Capital projects">
          {snap.activeProjects.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No work in progress. Open an asset to raise a project.
            </div>
          )}
          {snap.activeProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              onCancel={() => {
                const r = cancelProject(state, p.id);
                setNote(r.ok ? `${p.title} cancelled — a penalty was booked.` : r.reason ?? "");
                if (r.ok) update(() => r.state);
              }}
            />
          ))}
          <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground">
            Outstanding commitments: {fmtMoneyExact(snap.commitments)} · Capital spent to date:{" "}
            {fmtMoneyExact(snap.totalCapitalSpend)}
          </div>
        </Panel>
      )}

      {view === "maintenance" && (
        <Panel title="Maintenance policy">
          <div className="grid gap-3 md:grid-cols-3">
            {MAINTENANCE_POLICIES.map((p) => {
              const active = snap.maintenancePolicy === p;
              return (
                <div
                  key={p}
                  className={cn(
                    "rounded-lg border p-3",
                    active ? "border-primary bg-secondary" : "bg-background",
                  )}
                >
                  <div className="font-display text-base">{p}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {POLICY_CONFIG[p].label}
                  </div>
                  <div className="mt-2 text-xs tnum">
                    Cost {fmtMoneyExact(maintenanceCostUnder(state, p))}/wk
                    <br />
                    Projected season decay {projectedSeasonDecay(state, p).toFixed(1)} pts
                  </div>
                  <button
                    disabled={active}
                    onClick={() => {
                      update(() => setMaintenancePolicy(state, p));
                      setNote(`Maintenance policy set to ${p}.`);
                    }}
                    className="mt-3 w-full rounded-md border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
                  >
                    {active ? "Current policy" : "Adopt"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Policy changes affect future decay and future cost only. They repair nothing.
          </div>
        </Panel>
      )}

      {view === "history" && (
        <Panel title="Works history">
          {state.infrastructure.history.length === 0 && (
            <div className="text-sm text-muted-foreground">No works recorded yet.</div>
          )}
          <div className="divide-y text-sm">
            {[...state.infrastructure.history]
              .sort((a, b) => b.absoluteWeek - a.absoluteWeek)
              .map((r) => (
                <div key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                  <div>
                    <div>{r.description}</div>
                    <div className="text-[11px] text-muted-foreground">
                      S{r.season} W{r.week} · {r.assetName} · condition {r.conditionBefore}→
                      {r.conditionAfter}
                      {r.capacityAfter !== r.capacityBefore &&
                        ` · capacity ${r.capacityBefore.toLocaleString()}→${r.capacityAfter.toLocaleString()}`}
                    </div>
                  </div>
                  <div className="tnum text-[color:var(--color-expense)]">
                    {r.cost > 0 ? fmtMoneyExact(r.cost) : "—"}
                  </div>
                </div>
              ))}
          </div>
        </Panel>
      )}

      {open && (
        <AssetSheet
          state={state}
          asset={open}
          onClose={() => setOpenAssetId(null)}
          onApprove={(type) => {
            const r = approveProject(state, open.id, type);
            setNote(r.ok ? `${PROJECT_LABEL[type]} approved on ${open.name}.` : r.reason ?? "");
            if (r.ok) {
              update(() => r.state);
              setOpenAssetId(null);
            }
          }}
        />
      )}
    </div>
  );
}

function AssetCard({
  state,
  asset,
  onOpen,
}: {
  state: GameState;
  asset: InfrastructureAsset;
  onOpen: () => void;
}) {
  const band = conditionBand(asset.condition);
  const cfg = ASSET_CONFIG[asset.type];
  return (
    <button
      onClick={onOpen}
      className="rounded-lg border bg-background/40 p-3 text-left transition hover:border-primary"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-lg">{asset.name}</div>
        <div className={cn("text-xs font-semibold", BAND_TONE[band])}>{BAND_LABEL[band]}</div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm tnum">
        <Mini label="Condition" value={`${asset.condition.toFixed(0)}%`} />
        <Mini label="Level" value={`${asset.level}/${cfg.maxLevel}`} />
        <Mini
          label={asset.type === "stand" ? "Capacity" : "Units"}
          value={asset.capacity > 0 ? asset.capacity.toLocaleString() : "—"}
        />
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
        <div
          className="h-1.5 rounded-full bg-primary"
          style={{ width: `${Math.max(2, Math.min(100, asset.condition))}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        Upkeep {fmtMoneyExact(asset.weeklyMaintenanceCost + asset.weeklyOperatingCost)}/wk
        {asset.activeProjectId && " · work in progress"}
        {asset.status === "closed" && " · CLOSED"}
      </div>
    </button>
  );
}

function AssetSheet({
  state,
  asset,
  onClose,
  onApprove,
}: {
  state: GameState;
  asset: InfrastructureAsset;
  onClose: () => void;
  onApprove: (type: CapitalProjectType) => void;
}) {
  const catalogue = projectCatalogue(state, asset.id);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border bg-card md:rounded-xl">
        <div className="banner-strip flex items-center justify-between px-3 py-2 text-xs">
          <span>{asset.name}</span>
          <button onClick={onClose} className="underline">
            Close
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Condition" value={`${asset.condition.toFixed(0)}%`} />
            <Stat label="Quality" value={String(asset.qualityRating)} />
            <Stat label="Age" value={`${asset.ageYears} yrs`} />
            <Stat
              label="Usable"
              value={asset.capacity > 0 ? asset.usableCapacity.toLocaleString() : "—"}
            />
          </div>

          {catalogue.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No work can be raised on this asset right now.
            </div>
          )}

          {catalogue.map((spec) => {
            const ev = evaluateProject(state, asset.id, spec.type);
            if (!ev) return null;
            return (
              <div key={spec.type} className="rounded-lg border bg-background p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display text-base">{spec.title}</div>
                  <div className="tnum text-sm">{fmtMoneyExact(spec.cost)}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{spec.description}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] tnum">
                  <Mini label="Duration" value={`${spec.durationWeeks} wks`} />
                  <Mini label="Risk" value={`${Math.round(spec.risk * 100)}%`} />
                  <Mini
                    label="Disruption"
                    value={`${Math.round((1 - spec.disruption.capacityFactor) * 100)}% cap`}
                  />
                </div>
                {ev.positions.length > 0 && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    {ev.positions.map((p, i) => (
                      <div key={i} className="text-muted-foreground">
                        <span className="font-medium text-foreground">{p.role}:</span> {p.note}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">{ev.reason}</div>
                <button
                  disabled={!ev.allowed}
                  onClick={() => onApprove(spec.type)}
                  className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
                >
                  Approve — {fmtMoneyExact(spec.cost)}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  onCancel,
}: {
  project: CapitalProject;
  onCancel: () => void;
}) {
  const eta =
    project.expectedCompletionAbsoluteWeek != null
      ? fromAbsoluteWeek(project.expectedCompletionAbsoluteWeek)
      : null;
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-base">{project.title}</div>
        <div className="tnum text-xs">
          {fmtMoneyExact(project.spentToDate)} / {fmtMoneyExact(project.approvedBudget)}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-secondary">
        <div
          className="h-1.5 rounded-full bg-primary"
          style={{ width: `${Math.max(2, Math.round(project.progress * 100))}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {Math.round(project.progress * 100)}% complete
          {eta && ` · due S${eta.season} W${eta.week}`}
        </span>
        <button onClick={onCancel} className="underline">
          Cancel project
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="panel-strip px-3 py-2 text-xs font-semibold uppercase tracking-wide">
        {title}
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  );
}
