import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eye, Gauge, Globe2, Search } from "lucide-react";

import type { GameState } from "@/lib/game/types";
import { buildWorldSimulationPlan, type WorldSimulationLevel } from "@/lib/game/world";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function WorldInspector({ state }: { state: GameState }) {
  const [filter, setFilter] = useState<"all" | WorldSimulationLevel>("all");
  const [query, setQuery] = useState("");
  const plan = useMemo(() => buildWorldSimulationPlan(state), [state]);
  const [expandedLeagueIds, setExpandedLeagueIds] = useState<string[]>([
    plan.playerLeagueId,
  ]);
  const leagues = useMemo(
    () => [...state.leagues].sort((a, b) => a.tier - b.tier),
    [state.leagues],
  );
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return plan.clubs.filter(
      (club) =>
        (filter === "all" || club.level === filter) &&
        (!normalizedQuery || club.clubId.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [filter, plan.clubs, query]);

  useEffect(() => {
    setExpandedLeagueIds((current) =>
      current.includes(plan.playerLeagueId) ? current : [...current, plan.playerLeagueId],
    );
  }, [plan.playerLeagueId]);

  const toggleLeague = (leagueId: string) => {
    setExpandedLeagueIds((current) =>
      current.includes(leagueId)
        ? current.filter((id) => id !== leagueId)
        : [...current, leagueId],
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Globe2 className="size-5" /> World simulation
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Live view of how the football world is being simulated. Focus clubs receive
              high-fidelity simulation; fringe clubs use the lightweight world path.
            </p>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <div>Season {plan.season}</div>
            <div>
              {plan.clubs.length} clubs · {leagues.length} divisions
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Focus clubs"
            value={plan.focusClubIds.length}
            icon={<Eye className="size-4" />}
          />
          <Stat
            label="Fringe clubs"
            value={plan.fringeClubIds.length}
            icon={<Gauge className="size-4" />}
          />
          <Stat label="Focus divisions" value={plan.focusLeagueIds.length} />
          <Stat label="Total divisions" value={leagues.length} />
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "focus", "fringe"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm capitalize transition-colors",
                  filter === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted",
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a club"
              aria-label="Find a club"
              className="pl-9"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Divisions stay collapsed until you open them. Your current division is shown first.
        </p>
      </div>

      <div className="space-y-3">
        {leagues.map((league) => {
          const clubs = visible.filter((club) => club.leagueId === league.id);
          if (!clubs.length) return null;
          const isPlayerLeague = league.id === plan.playerLeagueId;
          const expanded = query.trim().length > 0 || expandedLeagueIds.includes(league.id);
          return (
            <section key={league.id} className="overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => toggleLeague(league.id)}
                aria-expanded={expanded}
                aria-controls={`world-league-${league.id}`}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  expanded && "border-b",
                )}
              >
                <div className="min-w-0">
                  <div className="font-semibold">{league.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Tier {league.tier}
                    {isPlayerLeague ? " · Your division" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>{clubs.length} clubs</span>
                  <ChevronDown
                    className={cn("size-4 transition-transform", expanded && "rotate-180")}
                  />
                </div>
              </button>
              {expanded && (
                <div id={`world-league-${league.id}`} className="divide-y">
                  {clubs.map((club) => (
                    <div
                      key={club.clubId}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {club.clubId}
                          {club.clubId === state.clubName ? " · YOU" : ""}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {club.reasons.length
                            ? club.reasons.map(reasonLabel).join(" · ")
                            : "Distant world club"}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "w-fit rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
                          club.level === "focus"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {club.level}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tnum">{value}</div>
    </div>
  );
}

function reasonLabel(reason: string): string {
  switch (reason) {
    case "playerClub":
      return "Your club";
    case "sameLeague":
      return "Same division";
    case "promotionNeighbour":
      return "Promotion neighbour";
    case "relegationNeighbour":
      return "Relegation neighbour";
    case "recentOpponent":
      return "Recent opponent";
    case "tracked":
      return "Tracked";
    default:
      return reason;
  }
}
