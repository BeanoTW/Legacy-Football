import { useState } from "react";
import { ArrowLeft, Binoculars, ClipboardList } from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import { scoutingSearchPlan } from "@/lib/game/scoutingDiscovery";
import { managerSquadFit } from "@/lib/game/managerSquadFit";
import {
  createChairmanScoutingBrief,
  SCOUTING_PLAYER_LEVELS,
  type ScoutingPlayerLevel,
} from "@/lib/game/chairmanScoutingBrief";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "./shared/layout";

const POSITIONS: Array<{ value: "" | Position; label: string }> = [
  { value: "", label: "Any position" },
  { value: "GK", label: "Goalkeeper" },
  { value: "DEF", label: "Defender" },
  { value: "MID", label: "Midfielder" },
  { value: "FWD", label: "Forward" },
];

export function ScoutingBriefBuilder({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [position, setPosition] = useState<"" | Position>("");
  const [playerLevel, setPlayerLevel] = useState<ScoutingPlayerLevel>("firstTeam");
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(32);
  const [clubStatus, setClubStatus] = useState<"" | "free" | "contracted">("");
  const [maxFee, setMaxFee] = useState("");
  const [maxWage, setMaxWage] = useState("");
  const plan = scoutingSearchPlan(state);
  const selectedLevel = SCOUTING_PLAYER_LEVELS.find((item) => item.value === playerLevel)!;
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const managerFit = manager ? managerSquadFit(state, manager) : null;
  const managerNeed = managerFit?.needs[0] ?? null;

  const useManagerRecommendation = () => {
    if (!managerNeed) return;
    setPosition(managerNeed.position);
    setPlayerLevel("firstTeam");
  };

  const dispatch = () => {
    const sequence = state.football?.scoutingDiscovery?.briefs.length ?? 0;
    update((s) =>
      createChairmanScoutingBrief(s, {
        id: `chairman-brief:s${s.season}:w${s.week}:r${sequence + 1}`,
        position: position || undefined,
        playerLevel,
        minAge,
        maxAge,
        clubStatus: clubStatus || undefined,
        maxMarketValue: maxFee ? Math.max(0, Number(maxFee)) : undefined,
        maxWeeklyWage: maxWage ? Math.max(0, Number(maxWage)) : undefined,
      }),
    );
  };

  return (
    <DetailScreen
      title="Set scouting brief"
      subtitle="Tell the recruitment team what kind of player you want. Nothing is searched until you send the brief."
      actions={
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
      }
    >
      <section className="max-w-2xl rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex items-start gap-3">
          <Binoculars className="mt-0.5 size-7 shrink-0" />
          <div>
            <div className="font-display text-xl">What should the scouts look for?</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Give the football staff a broad recruitment brief. They interpret what "first-team"
              or "star" quality means for your current squad rather than asking you for hidden
              ability numbers.
            </p>
          </div>
        </div>

        {manager && managerFit && (
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.04] p-3.5">
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Manager recruitment view
                    </div>
                    <div className="font-semibold">
                      {manager.name} · {managerFit.formation} · {managerFit.band} squad fit
                    </div>
                  </div>
                  {managerNeed && (
                    <Button type="button" size="sm" variant="outline" onClick={useManagerRecommendation}>
                      Use recommendation
                    </Button>
                  )}
                </div>
                {managerNeed ? (
                  <div className="mt-2 text-sm">
                    <span className="font-semibold">Priority:</span>{" "}
                    {POSITIONS.find((item) => item.value === managerNeed.position)?.label}.{" "}
                    <span className="text-muted-foreground">{managerNeed.reason}</span>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">
                    The manager has no obvious positional shortage in his preferred system right now.
                  </div>
                )}
                {managerFit.needs.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {managerFit.needs.slice(1).map((need) => (
                      <span key={need.position} className="rounded-full border bg-background/70 px-2 py-1 text-[10px]">
                        Also: {POSITIONS.find((item) => item.value === need.position)?.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">
            Position
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              value={position}
              onChange={(e) => setPosition(e.target.value as "" | Position)}
            >
              {POSITIONS.map((item) => (
                <option key={item.value || "any"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Player level
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              value={playerLevel}
              onChange={(e) => setPlayerLevel(e.target.value as ScoutingPlayerLevel)}
            >
              {SCOUTING_PLAYER_LEVELS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <span className="font-normal text-muted-foreground">{selectedLevel.description}</span>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Player status
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              value={clubStatus}
              onChange={(e) => setClubStatus(e.target.value as "" | "free" | "contracted")}
            >
              <option value="">Any</option>
              <option value="contracted">Under contract</option>
              <option value="free">Free agents</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Minimum age
            <input
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              type="number"
              min={16}
              max={40}
              value={minAge}
              onChange={(e) => setMinAge(Number(e.target.value))}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Maximum age
            <input
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              type="number"
              min={16}
              max={45}
              value={maxAge}
              onChange={(e) => setMaxAge(Number(e.target.value))}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Maximum transfer fee <span className="font-normal text-muted-foreground">Optional · £</span>
            <input
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              inputMode="numeric"
              placeholder="No limit"
              value={maxFee}
              onChange={(e) => setMaxFee(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Maximum weekly wage <span className="font-normal text-muted-foreground">Optional · £/wk</span>
            <input
              className="h-10 rounded-md border bg-background px-3 text-sm font-normal"
              inputMode="numeric"
              placeholder="No limit"
              value={maxWage}
              onChange={(e) => setMaxWage(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-semibold">Brief:</span>{" "}
          {position ? POSITIONS.find((item) => item.value === position)?.label : "Any position"} ·{" "}
          {selectedLevel.label} · age {minAge}–{maxAge}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted p-2">
            <div className="font-display text-lg">{plan.quality}</div>
            <div className="text-muted-foreground">Scout quality</div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="font-display text-lg">{plan.searchDays}d</div>
            <div className="text-muted-foreground">Expected search</div>
          </div>
          <div className="rounded-lg bg-muted p-2">
            <div className="font-display text-lg">Up to {plan.candidateLimit}</div>
            <div className="text-muted-foreground">Options</div>
          </div>
        </div>

        {minAge > maxAge && (
          <p className="mt-3 text-xs text-destructive">
            Maximum age must be at least the minimum age.
          </p>
        )}
        <Button className="mt-5 w-full sm:w-auto" disabled={minAge > maxAge} onClick={dispatch}>
          <Binoculars className="mr-2 size-4" /> Send scouts
        </Button>
      </section>
    </DetailScreen>
  );
}
