import { useState } from "react";
import {
  Banknote,
  Bolt,
  Building2,
  HeartPulse,
  Inbox,
  MessageSquareWarning,
  Mic2,
  ShieldCheck,
  Sparkles,
  Users,
  WandSparkles,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import {
  DEVELOPER_INCIDENT_OPTIONS,
  developerBoostClub,
  developerBoostSquad,
  developerClearInbox,
  developerCompleteProjects,
  developerHealSquad,
  developerInstantScout,
  developerMaxFacilities,
  developerRunGenerators,
  developerSetInfiniteMoney,
  developerTriggerIncident,
  developerTriggerPressConference,
} from "@/lib/game/developerMode";

export function DeveloperModePanel({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [incidentId, setIncidentId] = useState(
    DEVELOPER_INCIDENT_OPTIONS[0]?.id ?? "",
  );
  const [message, setMessage] = useState<string | null>(null);

  const run = (label: string, fn: (state: GameState) => GameState) => {
    update(fn);
    setMessage(label);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-fuchsia-500/30 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-transparent px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <WandSparkles className="size-4 text-fuchsia-500" />
          God mode
        </div>
        <span className="rounded-full bg-fuchsia-500/15 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-fuchsia-700 dark:text-fuchsia-300">
          Developer
        </span>
      </div>

      <div className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground">
          These controls mutate the active career for testing. They are deliberately unfair and should only be used on saves you are happy to alter.
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DevButton
            icon={Banknote}
            label="Infinite money"
            detail="Set bank to £999,999,999"
            onClick={() => run("Bank balance boosted.", developerSetInfiniteMoney)}
          />
          <DevButton
            icon={ShieldCheck}
            label="Max club"
            detail="100 rep, fans & recruitment"
            onClick={() => run("Club ratings maxed.", developerBoostClub)}
          />
          <DevButton
            icon={Users}
            label="Boost squad"
            detail="88+ ability, 99 potential cap"
            onClick={() => run("Squad boosted.", developerBoostSquad)}
          />
          <DevButton
            icon={HeartPulse}
            label="Heal squad"
            detail="100 fitness, clear injuries"
            onClick={() => run("Squad fully healed.", developerHealSquad)}
          />
          <DevButton
            icon={Sparkles}
            label="Instant scout"
            detail="Complete active + shortlist reports"
            onClick={() => run("Scouting completed.", developerInstantScout)}
          />
          <DevButton
            icon={Bolt}
            label="Finish builds"
            detail="Complete all active projects now"
            onClick={() => run("Active projects completed.", developerCompleteProjects)}
          />
          <DevButton
            icon={Building2}
            label="Max facilities"
            detail="Max levels, 100 condition, huge ground"
            onClick={() => run("Facilities maxed.", developerMaxFacilities)}
          />
          <DevButton
            icon={Inbox}
            label="Run interactions"
            detail="Run weekly inbox generators now"
            onClick={() => run("Weekly generators ran.", developerRunGenerators)}
          />
          <DevButton
            icon={Mic2}
            label="Press conference"
            detail="Open a full press-room test"
            onClick={() => run("Press conference added to Inbox.", developerTriggerPressConference)}
          />
        </div>

        <div className="rounded-xl border bg-muted/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
            <MessageSquareWarning className="size-4 text-amber-500" />
            Trigger a specific incident
          </div>
          <div className="flex gap-2">
            <select
              value={incidentId}
              onChange={(event) => setIncidentId(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
            >
              {DEVELOPER_INCIDENT_OPTIONS.map((incident) => (
                <option key={incident.id} value={incident.id}>
                  {incident.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-10"
              disabled={!incidentId}
              onClick={() =>
                run(
                  "Incident added to Inbox.",
                  (current) => developerTriggerIncident(current, incidentId),
                )
              }
            >
              Trigger
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => run("Inbox and scheduled interactions cleared.", developerClearInbox)}
          >
            Clear inbox
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Useful when repeatedly testing the same event.
          </span>
        </div>

        {message && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            {message}
          </div>
        )}
      </div>
    </section>
  );
}

function DevButton({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: typeof Banknote;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[5.2rem] rounded-xl border bg-background/70 p-2.5 text-left transition-colors hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5"
    >
      <Icon className="mb-1.5 size-4 text-fuchsia-500" />
      <strong className="block text-xs">{label}</strong>
      <span className="mt-0.5 block text-[9px] leading-snug text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}
