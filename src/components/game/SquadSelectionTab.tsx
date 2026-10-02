import { useMemo, useState } from "react";
import { ArrowLeft, FlaskConical, TriangleAlert } from "lucide-react";
import type { FootballPlayer, GameState, TacticalPosition } from "@/lib/game/types";
import type { ManagerFormation } from "@/lib/game/managerIdentity";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";
import { MANAGER_FORMATION_POINTS, MANAGER_FORMATION_SLOTS } from "@/lib/game/managerFormationLayout";
import {
  activeContract,
  ageOf,
  playerName,
  userSquad,
  weeksLeftOnContract,
} from "@/lib/game/recruitment";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOOD_TONE_CLASS, playerMood } from "@/lib/game/character";
import { fmtMoney } from "@/lib/game/engine";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { absoluteWeek, fromAbsoluteWeek } from "@/lib/game/time";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubKitFor } from "@/lib/game/clubKit";
import { POSITION_BADGE_CLASS, POSITION_PITCH_CLASS } from "./playerPosition";
import { contractEmploymentType } from "@/lib/game/employment";
import { positionEffectiveness, positionFamiliarity, positionUnit, tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";
import { CharacterPortrait, type PortraitKit } from "./CharacterPortrait";
import { fitnessLabel, fixtureLoadThisWeek, medicalSupport, playerFitness, playerIsAvailable, squadAverageFitness } from "@/lib/game/playerHealth";
import { playerSeasonLeaders, playerSeasonStats } from "@/lib/game/playerSeasonStats";
import { playerRecentForm } from "@/lib/game/playerForm";
import {
  PLAYER_COHESION_DEFAULT,
  PLAYER_MORALE_DEFAULT,
  playerManagerQuality,
} from "@/lib/game/playerClubPerformance";

type SquadView = "pitch" | "stats";
type PlannerSelection = { formation: ManagerFormation; playerIds: string[] };
type Unit = ReturnType<typeof positionUnit>;

const UNIT_GROUPS: { unit: Unit; label: string; minimum: number }[] = [
  { unit: "GK", label: "Goalkeepers", minimum: 2 },
  { unit: "DEF", label: "Defenders", minimum: 6 },
  { unit: "MID", label: "Midfielders", minimum: 6 },
  { unit: "FWD", label: "Forwards", minimum: 3 },
];

const UNIT_CHIP: Record<Unit, string> = {
  GK: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  DEF: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200",
  MID: "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200",
  FWD: "bg-rose-100 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200",
};

function useDisplayNames(squad: FootballPlayer[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of squad) counts.set(player.lastName, (counts.get(player.lastName) ?? 0) + 1);
    return (player: FootballPlayer) =>
      (counts.get(player.lastName) ?? 0) > 1
        ? `${player.firstName.charAt(0)}. ${player.lastName}`
        : player.lastName;
  }, [squad]);
}


const managerFormation = (state: GameState): ManagerFormation => {
  const selected = managerMatchPrep(state).selectedFormation;
  return selected in MANAGER_FORMATION_SLOTS ? selected as ManagerFormation : "4-4-2";
};

const sandboxPositionOverall = (player: FootballPlayer, slot: TacticalPosition): number => {
  const natural = tacticalPositionProfile(player).primary;
  // Goalkeeper/outfield mismatches should look as severe as they are rather
  // than inheriting the generic "unfamiliar" outfield penalty.
  const goalkeeperMismatch = (natural === "GK") !== (slot === "GK");
  const effectiveness = goalkeeperMismatch ? 0.38 : positionEffectiveness(player, slot);
  return Math.max(1, Math.round(player.currentAbility * effectiveness));
};

const SUB_POSITION_ORDER: Record<TacticalPosition, number> = {
  GK: 0,
  CB: 1,
  LB: 2,
  RB: 2,
  LWB: 3,
  RWB: 3,
  CDM: 4,
  CM: 5,
  CAM: 6,
  LM: 7,
  RM: 7,
  LW: 8,
  RW: 8,
  ST: 9,
};

const sortSubsByPosition = (players: FootballPlayer[]): FootballPlayer[] =>
  [...players].sort((a, b) => {
    const aPosition = tacticalPositionProfile(a).primary;
    const bPosition = tacticalPositionProfile(b).primary;
    return (
      SUB_POSITION_ORDER[aPosition] - SUB_POSITION_ORDER[bPosition] ||
      aPosition.localeCompare(bPosition) ||
      b.currentAbility - a.currentAbility ||
      a.lastName.localeCompare(b.lastName)
    );
  });

const SUB_CARD_TONE: Record<ReturnType<typeof positionUnit>, string> = {
  GK: "border-amber-300/35 bg-amber-400/[0.09]",
  DEF: "border-emerald-300/35 bg-emerald-400/[0.09]",
  MID: "border-blue-300/35 bg-blue-400/[0.09]",
  FWD: "border-rose-300/35 bg-rose-400/[0.09]",
};

const SUB_TEXT_TONE: Record<ReturnType<typeof positionUnit>, string> = {
  GK: "text-amber-200/80",
  DEF: "text-emerald-200/80",
  MID: "text-blue-200/80",
  FWD: "text-rose-200/80",
};

export function SquadSelectionTab({
  state,
  update: _update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack?: () => void;
}) {
  const [view, setView] = useState<SquadView>("pitch");
  const [planner, setPlanner] = useState<PlannerSelection | null>(null);
  const squad = useMemo(() => userSquad(state), [state]);
  const matchPrep = useMemo(() => managerMatchPrep(state), [state]);
  const managerShape = managerFormation(state);
  const formation = planner?.formation ?? managerShape;
  const automaticXi = useMemo(() => chooseXi(squad, state, formation), [squad, state, formation]);
  const xi = useMemo(() => {
    if (!planner || planner.formation !== formation) return automaticXi;
    const byId = new Map(squad.map((player) => [player.id, player]));
    const planned = planner.playerIds.map((id) => byId.get(id)).filter((player): player is FootballPlayer => Boolean(player));
    return planned.length === 11 ? planned : automaticXi;
  }, [automaticXi, formation, planner, squad]);
  const selected = new Set(xi.map((player) => player.id));
  const cohesion = state.playerClubPerformance?.cohesion ?? PLAYER_COHESION_DEFAULT;
  const morale = state.playerClubPerformance?.morale ?? PLAYER_MORALE_DEFAULT;
  const managerQuality = playerManagerQuality(state);
  const seasonStats = useMemo(() => playerSeasonStats(state), [state]);
  const leaders = useMemo(() => playerSeasonLeaders(state), [state]);
  const medical = medicalSupport(state);
  const averageFitness = squadAverageFitness(state);
  const fixtureLoad = fixtureLoadThisWeek(state);
  const available = squad.filter((player) => playerIsAvailable(player, state)).length;
  const displayName = useDisplayNames(squad);
  const kit = useMemo<PortraitKit>(() => {
    const identity = clubKitFor(state);
    return { kit: identity.home, badge: identity.badge, clubName: state.clubName };
  }, [state]);
  const xiFitness = Math.round(
    xi.reduce((sum, player) => sum + playerFitness(player), 0) / Math.max(1, xi.length),
  );

  const startPlanner = () => {
    const baseFormation = planner?.formation ?? managerShape;
    const baseXi = planner?.playerIds.length === 11
      ? planner.playerIds
      : chooseXi(squad, state, baseFormation).map((player) => player.id);
    setPlanner({ formation: baseFormation, playerIds: baseXi });
  };

  const changePlannerFormation = (next: ManagerFormation) => {
    setPlanner({
      formation: next,
      playerIds: chooseXi(squad, state, next).map((player) => player.id),
    });
  };

  const swapPlannerPlayer = (slotIndex: number, incomingId: string) => {
    setPlanner((current) => {
      if (!current) return current;
      const next = [...current.playerIds];
      const existingIndex = next.indexOf(incomingId);
      if (existingIndex >= 0) {
        [next[slotIndex], next[existingIndex]] = [next[existingIndex], next[slotIndex]];
      } else {
        next[slotIndex] = incomingId;
      }
      return { ...current, playerIds: next };
    });
  };

  return (
    <div className={cn(
      "lf-squad-screen flex h-full min-h-0 flex-col gap-3",
      planner && "fixed inset-0 z-[80] overflow-y-auto bg-background p-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] sm:p-3",
    )}>
      {planner ? (
        <div className="shrink-0 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Squad planning</div>
              <div className="font-display text-xl leading-none">Lineup Sandbox</div>
              <div className="mt-1 text-[10px] text-muted-foreground">Planning only · does not change the manager&apos;s real XI</div>
            </div>
            <button
              type="button"
              onClick={() => setPlanner(null)}
              className="min-h-10 shrink-0 rounded-lg border bg-background px-3 text-xs font-bold"
            >
              Exit
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t pt-2">
            <label htmlFor="sandbox-formation" className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Formation</label>
            <select
              id="sandbox-formation"
              value={formation}
              onChange={(event) => changePlannerFormation(event.target.value as ManagerFormation)}
              className="min-h-10 min-w-[7.5rem] rounded-lg border bg-background px-3 text-sm font-bold"
            >
              {Object.keys(MANAGER_FORMATION_SLOTS).map((shape) => <option key={shape} value={shape}>{shape}</option>)}
            </select>
            <span className="min-w-0 text-[10px] text-muted-foreground">Change shape without affecting the manager.</span>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2">
          {onBack ? <Button className="w-fit" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back to transfers</Button> : <div><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Football department</div><h1 className="font-display text-2xl">Squad</h1></div>}
          <div className="flex rounded-lg border bg-card p-1"><button onClick={() => setView("pitch")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "pitch" && "bg-primary text-primary-foreground")}>Pitch</button><button onClick={() => setView("stats")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "stats" && "bg-primary text-primary-foreground")}>Stats</button></div>
        </div>
      )}
      <div className={cn(
        "contained-scroll touch-pan-y grid min-h-0 flex-1 auto-rows-max gap-3 pr-0.5",
        planner ? "grid-cols-1" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]",
      )}>
        {!planner && (
          <section className="grid grid-cols-5 divide-x overflow-hidden rounded-xl border bg-card text-center shadow-sm lg:col-start-1" aria-label="Squad pulse">
            <Pulse label="Available" value={`${available}/${squad.length}`} pct={(available / Math.max(1, squad.length)) * 100} />
            <Pulse label="XI avg" value={averageAbility(xi).toFixed(1)} />
            <Pulse label="Cohesion" value={String(Math.round(cohesion))} pct={cohesion} />
            <Pulse label="Morale" value={String(Math.round(morale))} pct={morale} />
            <Pulse label="Manager" value={String(Math.round(managerQuality))} pct={managerQuality} />
          </section>
        )}

        {view === "pitch" ? (
          <section className={cn("lf-pitch-card overflow-hidden rounded-xl border border-emerald-900/40 bg-[#06251c] text-white shadow-sm lg:col-start-1", planner && "col-span-1 w-full")}>
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/55">{matchPrep.managerId ? "Manager's selection" : "Caretaker selection"}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="font-display text-2xl leading-none">First XI</div>
                  <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/75">{formation}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1 text-right">
                  <div className="font-display text-base leading-none">{averageAbility(xi).toFixed(1)}</div>
                  <div className="text-[7px] uppercase tracking-wide text-white/40">OVR</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1 text-right">
                  <div className="font-display text-base leading-none">{xiFitness}%</div>
                  <div className="text-[7px] uppercase tracking-wide text-white/40">Fit</div>
                </div>
                {!planner && (
                  <button
                    type="button"
                    onClick={startPlanner}
                    className="flex h-[2.35rem] items-center gap-1 rounded-lg border border-cyan-200/35 bg-cyan-400/20 px-2.5 text-[10px] font-black uppercase tracking-wide text-white hover:bg-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80"
                    title="Test formations and swaps without changing the manager's XI"
                  >
                    <FlaskConical className="size-3.5" /> Sandbox
                  </button>
                )}
              </div>
            </div>
            <div className="px-3 py-1.5 text-[10px] text-white/50">
              {planner
                ? "Drag players onto each other to swap · tap works on mobile. The badge is the player's effectiveness in that slot."
                : "Tap a player for his profile · badge shows effectiveness in that position."}
            </div>
            <Pitch
              state={state}
              xi={xi}
              formation={formation}
              planner={Boolean(planner)}
              onSwap={swapPlannerPlayer}
              squad={squad}
              kit={kit}
              displayName={displayName}
            />
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1">
            <div className="border-b px-3 py-2.5">
              <div className="font-display text-xl leading-none">Season performance</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">Recorded appearances from watched and simulated matches.</div>
            </div>
            <div className="grid grid-cols-3 divide-x border-b text-center">
              <Pulse label="Avg fitness" value={`${averageFitness}%`} pct={averageFitness} />
              <Pulse label="Medical" value={medical.label} />
              <Pulse label="Fixtures this wk" value={String(fixtureLoad)} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-b p-2.5 text-xs sm:grid-cols-4">
              <Leader label="Top scorer" name={leaders.topScorer?.name} value={leaders.topScorer ? `${leaders.topScorer.goals} goals` : "—"} />
              <Leader label="Top assists" name={leaders.topAssister?.name} value={leaders.topAssister ? `${leaders.topAssister.assists} assists` : "—"} />
              <Leader label="Top rated" name={leaders.topRated?.name} value={leaders.topRated ? leaders.topRated.averageRating.toFixed(2) : "—"} />
              <Leader label="Most used" name={leaders.mostUsed?.name} value={leaders.mostUsed ? `${leaders.mostUsed.minutes} min` : "—"} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2 text-left">Player</th><th className="px-2 py-2 text-right">Apps</th><th className="px-2 py-2 text-right">Starts</th><th className="px-2 py-2 text-right">Sub</th><th className="px-2 py-2 text-right">Min</th><th className="px-2 py-2 text-right">G</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">Rat</th><th className="px-2 py-2 text-right">Form</th></tr>
                </thead>
                <tbody>
                  {seasonStats.map((row) => {
                    const form = playerRecentForm(state, row.playerId);
                    return (
                      <tr key={row.playerId} className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30" onClick={() => openPlayerProfile(row.playerId)}>
                        <td className="px-3 py-2 font-semibold">{row.name}</td>
                        <td className="px-2 py-2 text-right">{row.appearances}</td>
                        <td className="px-2 py-2 text-right">{row.starts}</td>
                        <td className="px-2 py-2 text-right">{row.substituteAppearances}</td>
                        <td className="px-2 py-2 text-right">{row.minutes}</td>
                        <td className="px-2 py-2 text-right">{row.goals}</td>
                        <td className="px-2 py-2 text-right">{row.assists}</td>
                        <td className="px-2 py-2 text-right">{row.averageRating.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">{form.appearances ? `${form.band} ${form.averageRating.toFixed(2)}` : "—"}</td>
                      </tr>
                    );
                  })}
                  {seasonStats.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No player match records yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
              Medical score {medical.score}/100 · weekly fitness recovery +{medical.recoveryPerWeek} · injury-risk factor {medical.injuryRiskMultiplier.toFixed(2)}×
            </div>
          </section>
        )}

        {!(planner && view === "pitch") && (
          <SquadPositionRails
            state={state}
            squad={squad}
            selected={selected}
            kit={kit}
            displayName={displayName}
            className="lg:col-start-2 lg:row-span-3 lg:row-start-1"
          />
        )}
      </div>
    </div>
  );
}

function chooseXi(players: FootballPlayer[], state: GameState, formation: ManagerFormation): FootballPlayer[] {
  const used = new Set<string>();
  const score = (player: FootballPlayer, position: TacticalPosition) => {
    const familiarity = positionFamiliarity(player, position);
    const familiarityBonus = familiarity === "Natural" ? 12 : familiarity === "Accomplished" ? 7 : familiarity === "Comfortable" ? 2 : -20;
    return player.currentAbility + familiarityBonus + (playerFitness(player) - 80) * 0.08;
  };
  return MANAGER_FORMATION_SLOTS[formation].map((position) => {
    const broadUnit = positionUnit(position);
    const available = players.filter((player) => !used.has(player.id) && playerIsAvailable(player, state));
    const specialists = available.filter((player) => position === "GK" ? player.primaryPosition === "GK" : player.primaryPosition !== "GK" && positionFamiliarity(player, position) !== "Unfamiliar").sort((a, b) => score(b, position) - score(a, position));
    const sameUnitFallback = available.filter((player) => position === "GK" ? player.primaryPosition === "GK" : player.primaryPosition !== "GK" && player.primaryPosition === broadUnit).sort((a, b) => score(b, position) - score(a, position));
    const outfieldFallback = available.filter((player) => position !== "GK" && player.primaryPosition !== "GK").sort((a, b) => score(b, position) - score(a, position));
    const chosen = specialists[0] ?? sameUnitFallback[0] ?? outfieldFallback[0];
    if (chosen) used.add(chosen.id);
    return chosen;
  }).filter((player): player is FootballPlayer => Boolean(player));
}

function Pitch({
  state,
  xi,
  formation,
  planner = false,
  onSwap,
  squad = [],
}: {
  state: GameState;
  xi: FootballPlayer[];
  formation: ManagerFormation;
  planner?: boolean;
  onSwap?: (slotIndex: number, incomingId: string) => void;
  squad?: FootballPlayer[];
}) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const [swapSlot, setSwapSlot] = useState<number | null>(null);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const selectedIds = new Set(xi.map((player) => player.id));
  const sandboxBench = sortSubsByPosition(
    squad.filter((player) => !selectedIds.has(player.id)),
  );

  const swapPlayers = (draggedId: string, targetId: string) => {
    if (!onSwap || draggedId === targetId) return;
    const draggedSlot = xi.findIndex((player) => player.id === draggedId);
    const targetSlot = xi.findIndex((player) => player.id === targetId);
    if (targetSlot >= 0) {
      onSwap(targetSlot, draggedId);
    } else if (draggedSlot >= 0) {
      onSwap(draggedSlot, targetId);
    }
  };

  const finishPointerDrag = (event: React.PointerEvent, draggedId: string) => {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-planner-player]");
    const targetId = target?.dataset.plannerPlayer;
    if (targetId) swapPlayers(draggedId, targetId);
    setDraggedPlayerId(null);
    setDragOverKey(null);
  };

  const pitchPlayers = xi
    .map((player, index) => ({
      player,
      slot: slots[index],
      point: MANAGER_FORMATION_POINTS[formation][index],
      index,
    }))
    .filter((entry): entry is { player: FootballPlayer; slot: TacticalPosition; point: { x: number; y: number }; index: number } =>
      Boolean(entry.player && entry.slot && entry.point),
    );

  return (
    <>
    <div
      className={cn(
        "relative overflow-hidden bg-[linear-gradient(90deg,rgba(16,112,74,.96)_0%,rgba(16,112,74,.96)_12.5%,rgba(19,122,81,.96)_12.5%,rgba(19,122,81,.96)_25%,rgba(16,112,74,.96)_25%,rgba(16,112,74,.96)_37.5%,rgba(19,122,81,.96)_37.5%,rgba(19,122,81,.96)_50%,rgba(16,112,74,.96)_50%,rgba(16,112,74,.96)_62.5%,rgba(19,122,81,.96)_62.5%,rgba(19,122,81,.96)_75%,rgba(16,112,74,.96)_75%,rgba(16,112,74,.96)_87.5%,rgba(19,122,81,.96)_87.5%,rgba(19,122,81,.96)_100%)] px-2 py-4 sm:px-4",
        planner ? "min-h-[31rem] sm:min-h-[36rem]" : "min-h-[24rem] sm:min-h-[27rem]",
      )}
    >
      <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/35" />
      <div className="pointer-events-none absolute inset-y-3 left-1/2 w-px bg-white/35" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/55" />
      <div className="pointer-events-none absolute inset-x-[27%] top-3 h-[14%] border-x border-b border-white/35" />
      <div className="pointer-events-none absolute inset-x-[39%] top-3 h-[6%] border-x border-b border-white/35" />
      <div className="pointer-events-none absolute inset-x-[27%] bottom-3 h-[14%] border-x border-t border-white/35" />
      <div className="pointer-events-none absolute inset-x-[39%] bottom-3 h-[6%] border-x border-t border-white/35" />

      <div className={cn("relative", planner ? "min-h-[29rem] sm:min-h-[34rem]" : "min-h-[22rem] sm:min-h-[25rem]")}>
        {pitchPlayers.map(({ player, slot, point, index }) => {
          const fitness = playerFitness(player);
          const familiarity = positionFamiliarity(player, slot);
          const tactical = tacticalPositionProfile(player);
          const effectiveOverall = sandboxPositionOverall(player, slot);
          const form = playerRecentForm(state, player.id);
          const fitnessTone =
            fitness >= 90 ? "bg-emerald-300" : fitness >= 75 ? "bg-amber-300" : "bg-rose-300";
          const familiarityTone =
            familiarity === "Natural"
              ? "border-white/35"
              : familiarity === "Accomplished"
                ? "border-amber-200/60"
                : "border-rose-200/70";

          return (
            <button
              key={player.id}
              type="button"
              data-planner-player={planner ? player.id : undefined}
              draggable={planner}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onDragStart={(event) => {
                if (!planner) return;
                event.dataTransfer.setData("text/plain", player.id);
                event.dataTransfer.effectAllowed = "move";
                setDraggedPlayerId(player.id);
              }}
              onDragEnd={() => { setDraggedPlayerId(null); setDragOverKey(null); }}
              onDragOver={(event) => {
                if (!planner || !draggedPlayerId || draggedPlayerId === player.id) return;
                event.preventDefault();
                setDragOverKey(player.id);
              }}
              onDrop={(event) => {
                if (!planner) return;
                event.preventDefault();
                const draggedId = event.dataTransfer.getData("text/plain") || draggedPlayerId;
                if (draggedId) swapPlayers(draggedId, player.id);
                setDraggedPlayerId(null);
                setDragOverKey(null);
              }}
              onPointerDown={(event) => {
                if (!planner || event.pointerType === "mouse") return;
                event.currentTarget.setPointerCapture(event.pointerId);
                setDraggedPlayerId(player.id);
              }}
              onPointerUp={(event) => {
                if (!planner || event.pointerType === "mouse" || !draggedPlayerId) return;
                finishPointerDrag(event, player.id);
              }}
              onClick={() => planner ? setSwapSlot(index) : openPlayerProfile(player.id)}
              className={cn(
                "group absolute w-[4.1rem] -translate-x-1/2 -translate-y-1/2 rounded-xl text-center transition-[transform,opacity,filter] duration-150 hover:z-10 hover:-translate-y-[54%] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-[5rem]",
                planner && "cursor-grab touch-none active:cursor-grabbing",
                draggedPlayerId === player.id && "scale-95 opacity-55",
                dragOverKey === player.id && "z-20 ring-2 ring-white/90 ring-offset-2 ring-offset-emerald-900",
              )}
              aria-label={planner ? `Move ${playerName(player)}` : `Open ${playerName(player)} profile`}
            >
              <div className={cn(
                "relative mx-auto grid size-11 place-items-center rounded-full border-2 font-display text-base shadow-lg sm:size-12",
                POSITION_PITCH_CLASS[positionUnit(slot)],
                familiarityTone,
              )}>
                {effectiveOverall}
                {planner && effectiveOverall !== player.currentAbility && (
                  <span className="absolute -left-1.5 -top-1.5 rounded-md border border-white/20 bg-black/60 px-1 py-0.5 text-[7px] font-bold text-white/75">
                    {player.currentAbility}
                  </span>
                )}
                <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-emerald-950", fitnessTone)} />
              </div>
              <div className="mt-0.5 rounded-md border border-white/10 bg-black/35 px-1 py-0.5 shadow-sm backdrop-blur-[1px]">
                <div className="truncate font-display text-[10px] leading-none sm:text-[11px]">{player.lastName}</div>
                <div className="mt-0.5 flex items-center justify-center gap-1 text-[7px] font-bold leading-none text-white/60">
                  <span>{slot}</span>
                  {planner && tactical.primary !== slot && <span>· NAT {tactical.primary}</span>}
                  {!planner && form.appearances > 0 && <span>· {form.averageRating.toFixed(1)}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!planner && (
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
          Tap a player for profile
        </div>
      )}
      {planner && swapSlot !== null && onSwap && <div className="absolute inset-x-2 bottom-8 z-20 max-h-44 overflow-auto rounded-xl border border-white/15 bg-[#071713]/95 p-2 shadow-xl"><div className="mb-1 flex items-center justify-between"><div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Replace {xi[swapSlot]?.lastName ?? "player"} · {slots[swapSlot]}</div><button type="button" onClick={() => setSwapSlot(null)} className="rounded px-2 py-1 text-xs text-white/60">Close</button></div>{squad.filter((candidate) => candidate.id !== xi[swapSlot]?.id).sort((a,b) => sandboxPositionOverall(b, slots[swapSlot]) - sandboxPositionOverall(a, slots[swapSlot])).map((candidate) => {
  const natural = tacticalPositionProfile(candidate).primary;
  const effective = sandboxPositionOverall(candidate, slots[swapSlot]);
  return <button type="button" key={candidate.id} onClick={() => { onSwap(swapSlot, candidate.id); setSwapSlot(null); }} className="flex min-h-10 w-full items-center justify-between border-t border-white/10 px-2 text-left text-xs"><span><b>{candidate.lastName}</b> <span className="text-white/45">NAT {natural}</span></span><span className="text-right"><span className="block font-display text-base">{effective}</span>{effective !== candidate.currentAbility && <span className="block text-[8px] text-white/40">base {candidate.currentAbility}</span>}</span></button>;
})}</div>}
    </div>
      {planner && (
        <div className="border-t border-white/10 bg-[#071713] px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">Bench & squad</div>
              <div className="text-[10px] text-white/60">Side-scroll · drag a player onto anyone in the XI or bench to swap.</div>
            </div>
            <div className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-bold text-white/50">{sandboxBench.length} players</div>
          </div>
          <div className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
            {sandboxBench.map((player) => {
              const tactical = tacticalPositionProfile(player);
              const unit = positionUnit(tactical.primary);
              const fitness = playerFitness(player);
              const dragging = draggedPlayerId === player.id;
              const over = dragOverKey === player.id;
              return (
                <button
                  key={player.id}
                  type="button"
                  data-planner-player={player.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", player.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedPlayerId(player.id);
                  }}
                  onDragEnd={() => { setDraggedPlayerId(null); setDragOverKey(null); }}
                  onDragOver={(event) => {
                    if (!draggedPlayerId || draggedPlayerId === player.id) return;
                    event.preventDefault();
                    setDragOverKey(player.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData("text/plain") || draggedPlayerId;
                    if (draggedId) swapPlayers(draggedId, player.id);
                    setDraggedPlayerId(null);
                    setDragOverKey(null);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse") return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggedPlayerId(player.id);
                  }}
                  onPointerUp={(event) => {
                    if (event.pointerType === "mouse" || !draggedPlayerId) return;
                    finishPointerDrag(event, player.id);
                  }}
                  onClick={() => {
                    if (swapSlot !== null && onSwap) {
                      onSwap(swapSlot, player.id);
                      setSwapSlot(null);
                    } else {
                      openPlayerProfile(player.id);
                    }
                  }}
                  className={cn(
                    "min-w-[5.2rem] snap-start rounded-xl border px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
                    SUB_CARD_TONE[unit],
                    "cursor-grab touch-pan-x active:cursor-grabbing",
                    dragging && "scale-95 opacity-55",
                    over && "ring-2 ring-white/90",
                  )}
                  aria-label={`Move ${playerName(player)}`}
                >
                  <SquadRailCardContent player={player} unit={unit} tacticalPosition={tactical.primary} fitness={fitness} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function SquadRailCardContent({
  player,
  unit,
  tacticalPosition,
  fitness,
}: {
  player: FootballPlayer;
  unit: ReturnType<typeof positionUnit>;
  tacticalPosition: TacticalPosition;
  fitness: number;
}) {
  return (
    <>
      <div className={cn(
        "mx-auto grid size-10 place-items-center rounded-full border-2 font-display text-base shadow-sm",
        POSITION_PITCH_CLASS[unit],
      )}>{player.currentAbility}</div>
      <div className="mt-1 max-w-[4.7rem] truncate font-display text-[11px] text-white/95">{player.lastName}</div>
      <div className={cn("mt-0.5 text-[8px] font-bold", SUB_TEXT_TONE[unit])}>NAT {tacticalPosition} · {fitness}%</div>
    </>
  );
}

function CompactPlayerRow({ state, player, inXi }: { state: GameState; player: FootballPlayer; inXi: boolean }) {
  return <TacticalPlayerCard state={state} player={player} mode="compact" selected={inXi} className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0" />;
}

function PlayerRow({ state, player }: { state: GameState; player: FootballPlayer }) {
  return <TacticalPlayerCard state={state} player={player} mode="squad" className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0" />;
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="p-3"><div className="font-display text-2xl">{value}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div>; }
function averageAbility(players: FootballPlayer[]): number { return players.length ? players.reduce((sum, player) => sum + player.currentAbility, 0) / players.length : 0; }

function Leader({ label, name, value }: { label: string; name?: string; value: string }) { return <div className="rounded-lg border bg-muted/20 p-2"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 truncate font-semibold">{name ?? "No data"}</div><div className="text-[10px] text-muted-foreground">{value}</div></div>; }
