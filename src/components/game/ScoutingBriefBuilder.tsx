import { useState } from "react";
import { ArrowLeft, Binoculars, ClipboardList } from "lucide-react";
import type { GameState, Position, TacticalPosition } from "@/lib/game/types";
import { scoutingSearchPlan } from "@/lib/game/scoutingDiscovery";
import { managerSquadFit } from "@/lib/game/managerSquadFit";
import { managerRecruitmentBrief } from "@/lib/game/managerRecruitmentBrief";
import { DETAILED_POSITIONS, positionUnit } from "@/lib/game/positions";
import {
  createChairmanScoutingBrief,
  SCOUTING_PLAYER_LEVELS,
  type ScoutingPlayerLevel,
} from "@/lib/game/chairmanScoutingBrief";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "./shared/layout";

const POSITIONS: Array<{ value: Position; label: string }> = [
  { value: "GK", label: "Goalkeeper" },
  { value: "DEF", label: "Defender" },
  { value: "MID", label: "Midfielder" },
  { value: "FWD", label: "Forward" },
];

const TACTICAL_POSITION_LABEL: Record<TacticalPosition, string> = {
  GK: "Goalkeeper",
  RB: "Right-back",
  CB: "Centre-back",
  LB: "Left-back",
  RWB: "Right wing-back",
  LWB: "Left wing-back",
  CDM: "Defensive midfielder",
  CM: "Central midfielder",
  CAM: "Attacking midfielder",
  RM: "Right midfielder",
  LM: "Left midfielder",
  RW: "Right winger",
  LW: "Left winger",
  ST: "Striker",
};

const FIELD = "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-xs font-normal";

export function ScoutingBriefBuilder({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [positions, setPositions] = useState<Position[]>(["DEF"]);
  const [tacticalPosition, setTacticalPosition] = useState<"" | TacticalPosition>("");
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
  const recruitmentBrief = manager ? managerRecruitmentBrief(state, manager) : null;
  const managerPriority = recruitmentBrief?.priorities[0] ?? null;
  const tacticalOptions = DETAILED_POSITIONS.filter((item) => positions.length !== 1 || positionUnit(item) === positions[0]);

  const useManagerRecommendation = () => {
    if (!managerPriority) return;
    setPositions([managerPriority.position]);
    setTacticalPosition(managerPriority.tacticalPosition ?? "");
    setPlayerLevel(managerPriority.playerLevel);
  };

  const togglePosition = (next: Position) => {
    setPositions((current) => {
      if (current.includes(next)) {
        const reduced = current.filter((position) => position !== next);
        if (tacticalPosition && reduced.length !== 1) setTacticalPosition("");
        return reduced;
      }
      if (current.length >= plan.positionCapacity) return current;
      const expanded = [...current, next];
      if (tacticalPosition && (expanded.length !== 1 || positionUnit(tacticalPosition) !== expanded[0])) {
        setTacticalPosition("");
      }
      return expanded;
    });
  };

  const dispatch = () => {
    const sequence = state.football?.scoutingDiscovery?.briefs.length ?? 0;
    update((s) =>
      createChairmanScoutingBrief(s, {
        id: `chairman-brief:s${s.season}:w${s.week}:r${sequence + 1}`,
        positions,
        tacticalPosition: positions.length === 1 ? tacticalPosition || undefined : undefined,
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
      title="Scouting brief"
      subtitle="Tell the recruitment team what kind of player you want. Nothing is searched until you send the brief."
      actions={
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" /> Back
        </Button>
      }
    >
      <section className="lf-brief max-w-2xl rounded-xl border bg-card p-3 shadow-sm md:p-4">
        <p className="text-xs text-muted-foreground">Set a broad brief. Staff judge what "first-team" or "star" means for your squad.</p>
        {manager && managerFit && recruitmentBrief && (
          <div className="mt-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] px-2.5 py-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{manager.name} · {managerFit.bestFormation} · {managerFit.band} fit</div>
                <div className="line-clamp-2 text-sm font-semibold leading-snug">
                  {managerPriority ? `Wants: ${managerPriority.tacticalPosition ? TACTICAL_POSITION_LABEL[managerPriority.tacticalPosition] : POSITIONS.find((item) => item.value === managerPriority.position)?.label} · ${SCOUTING_PLAYER_LEVELS.find((item) => item.value === managerPriority.playerLevel)?.label}` : "No urgent positional shortage"}
                </div>
              </div>
              {managerPriority && <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2.5" onClick={useManagerRecommendation}>Use</Button>}
            </div>
            <details className="lf-brief-why mt-1">
              <summary className="cursor-pointer text-[11px] font-semibold text-primary">Why?</summary>
              <div className="mt-1.5 rounded-md border border-primary/15 bg-background/70 px-2.5 py-1.5 text-xs leading-relaxed">
                “{recruitmentBrief.message}”
                <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">— {manager.name}, Manager</div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{managerPriority ? managerPriority.rationale : "Recruitment can focus on upgrading quality rather than filling a structural hole."}</p>
              {recruitmentBrief.priorities.length > 1 && <div className="mt-1.5 flex flex-wrap gap-1">
                {recruitmentBrief.priorities.slice(1).map((priority) => <span key={`${priority.position}:${priority.tacticalPosition ?? "unit"}`} className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">
                  Also: {priority.tacticalPosition ? TACTICAL_POSITION_LABEL[priority.tacticalPosition] : POSITIONS.find((item) => item.value === priority.position)?.label}
                </span>)}
              </div>}
            </details>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-2.5">
          <div className="col-span-2 grid min-w-0 gap-1 text-[11px] font-semibold">
            <div className="flex items-center justify-between gap-2">
              <span>Positions</span>
              <span className="font-normal text-muted-foreground">
                {positions.length}/{plan.positionCapacity} slots
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {POSITIONS.map((item) => {
                const selected = positions.includes(item.value);
                const full = !selected && positions.length >= plan.positionCapacity;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={full}
                    onClick={() => togglePosition(item.value)}
                    className={`rounded-md border px-2 py-2 text-[11px] transition-colors ${selected ? "border-primary bg-primary/10 font-semibold" : "bg-background text-muted-foreground"} ${full ? "opacity-40" : "hover:bg-muted"}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="font-normal text-[10px] text-muted-foreground">
              Scout quality {plan.quality}: your team can cover up to {plan.positionCapacity} broad position{plan.positionCapacity === 1 ? "" : "s"} in one brief.
            </p>
          </div>
          <label className="col-span-2 grid min-w-0 gap-1 text-[11px] font-semibold"><span>Role <span className="font-normal text-muted-foreground">· optional · one position only</span></span>
            <select
              className={FIELD}
              value={tacticalPosition}
              disabled={positions.length !== 1}
              onChange={(e) => setTacticalPosition(e.target.value as "" | TacticalPosition)}
            >
              <option value="">Any role</option>
              {tacticalOptions.map((item) => <option key={item} value={item}>{TACTICAL_POSITION_LABEL[item]}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold">Level
            <select className={FIELD} value={playerLevel} onChange={(e) => setPlayerLevel(e.target.value as ScoutingPlayerLevel)}>
              {SCOUTING_PLAYER_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold">Status
            <select className={FIELD} value={clubStatus} onChange={(e) => setClubStatus(e.target.value as "" | "free" | "contracted")}>
              <option value="">Any</option><option value="contracted">Under contract</option><option value="free">Free agents</option>
            </select>
          </label>
          <p className="col-span-2 -mt-1 text-[10px] text-muted-foreground">{selectedLevel.label}: {selectedLevel.description}</p>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold">Age from
            <input className={FIELD} type="number" min={16} max={40} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold">Age to
            <input className={FIELD} type="number" min={16} max={45} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold"><span>Max fee <span className="font-normal text-muted-foreground">· £</span></span>
            <input className={FIELD} inputMode="numeric" placeholder="No limit" value={maxFee} onChange={(e) => setMaxFee(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold"><span>Max wage <span className="font-normal text-muted-foreground">· £/wk</span></span>
            <input className={FIELD} inputMode="numeric" placeholder="No limit" value={maxWage} onChange={(e) => setMaxWage(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
        </div>
        {minAge > maxAge && <p className="mt-2 text-xs text-destructive">Maximum age must be at least the minimum age.</p>}
        <div className="lf-brief-footer sticky bottom-0 -mx-3 mt-3 border-t bg-card px-3 pb-1 pt-2 md:-mx-4 md:px-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold">Brief:</span>{" "}
              {tacticalPosition ? TACTICAL_POSITION_LABEL[tacticalPosition] : positions.length ? positions.map((value) => POSITIONS.find((item) => item.value === value)?.label).join(" + ") : "No position selected"} · {selectedLevel.label} · {minAge}–{maxAge}
            </span>
            <span className="shrink-0 text-muted-foreground tnum">Scouts {plan.quality} · ~{plan.searchDays}d · up to {plan.candidateLimit}</span>
          </div>
          <Button className="w-full" disabled={minAge > maxAge || positions.length === 0} onClick={dispatch}><Binoculars className="mr-2 size-4" /> Send scouts</Button>
        </div>
      </section>
    </DetailScreen>
  );
}
