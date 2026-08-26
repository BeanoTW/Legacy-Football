import { useMemo, useState } from "react";
import { ArrowLeft, Building2, Hammer, ShieldAlert, Wrench } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { FacilitiesTab } from "@/components/FacilitiesTab";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { infrastructureSnapshot } from "@/lib/game/infrastructure";

type View = "home" | "full";

export function FacilitiesFlow({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("home");
  const snap = useMemo(
    () => (state.infrastructure ? infrastructureSnapshot(state) : null),
    [state],
  );

  if (view === "full") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setView("home")}>
          <ArrowLeft className="size-4 mr-2" /> Back to facilities
        </Button>
        <FacilitiesTab state={state} update={update} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Facilities</h1>
        <p className="text-sm text-muted-foreground mt-1">
          See what needs attention before opening the engineering detail.
        </p>
      </div>

      {snap ? (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Overall condition</div>
              <div className="font-display text-4xl mt-1">
                {snap.averageAssetCondition.toFixed(0)}%
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Risk</div>
              <div className="font-display text-2xl mt-1">{snap.riskLabel}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Usable capacity</div>
              <div className="font-display text-xl">{snap.usableCapacity.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Weekly running cost</div>
              <div className="font-display text-xl">
                {fmtMoneyExact(snap.weeklyMaintenance + snap.weeklyOperating)}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Facilities are not available yet. Advance a week to open the department.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FacilityAction
          icon={<ShieldAlert className="size-7" />}
          title="Needs attention"
          sub={
            snap?.criticalAssets.length
              ? `${snap.criticalAssets.length} critical asset${snap.criticalAssets.length === 1 ? "" : "s"}`
              : "No critical assets"
          }
          onClick={() => setView("full")}
        />
        <FacilityAction
          icon={<Hammer className="size-7" />}
          title="Projects"
          sub={
            snap?.activeProjects.length
              ? `${snap.activeProjects.length} in progress`
              : "Start an upgrade"
          }
          onClick={() => setView("full")}
        />
        <FacilityAction
          icon={<Wrench className="size-7" />}
          title="Maintenance"
          sub={snap ? snap.maintenancePolicy : "Set policy"}
          onClick={() => setView("full")}
        />
        <FacilityAction
          icon={<Building2 className="size-7" />}
          title="All facilities"
          sub="Stands, training & club assets"
          onClick={() => setView("full")}
        />
      </div>

      <Button variant="outline" className="w-full h-12" onClick={() => setView("full")}>
        Open full facilities centre
      </Button>
    </div>
  );
}

function FacilityAction({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="min-h-32 rounded-2xl border bg-card p-4 text-left flex flex-col justify-between hover:border-primary/50 transition-colors"
    >
      <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="mt-4">
        <div className="font-display text-xl">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{sub}</div>
      </div>
    </button>
  );
}
