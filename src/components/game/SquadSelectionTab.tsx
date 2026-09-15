import { useMemo, useState } from "react";
import { ArrowLeft, List, Shield, Sparkles, Users } from "lucide-react";
import type { FootballPlayer, GameState } from "@/lib/game/types";
import type { ManagerFormation } from "@/lib/game/managerIdentity";
import {
  MANAGER_FORMATION_ROWS,
  MANAGER_FORMATION_SLOTS,
} from "@/lib/game/managerFormationLayout";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";
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
import { absoluteWeek } from "@/lib/game/time";
import { clubDisplayName } from "@/lib/game/clubReference";
import { POSITION_BADGE_CLASS, POSITION_PITCH_CLASS } from "./playerPosition";
import {
  clubOperatingModel,
  contractEmploymentType,
  professionaliseUserClub,
  userProfessionalisationReadiness,
} from "@/lib/game/employment";
import { userClubReference } from "@/lib/game/clubReference";
import { positionFamiliarity, positionUnit, tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import {
  PLAYER_COHESION_DEFAULT,
  PLAYER_MORALE_DEFAULT,
  playerManagerQuality,
} from "@/lib/game/playerClubPerformance";

type Preset = "strongest" | "rested" | "youth";
type SquadView = "pitch" | "details";

const employmentLabel = (value: "PartTime" | "FullTime") =>
  value === "PartTime" ? "Part-time" : "Full-time";

export function SquadSelectionTab({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack?: () => void;
}) {
  const stored = state.inboxFlags["chairman.selection.preset"];
  const [preset, setPreset] = useState<Preset>(
    stored === "rested" || stored === "youth" ? stored : "strongest",
  );
  const [view, setView] = useState<SquadView>("pitch");
  const [professionalisationReview, setProfessionalisationReview] = useState(false);
  const [employmentNote, setEmploymentNote] = useState<string | null>(null);
  const squad = useMemo(() => userSquad(state), [state]);
  const matchPrep = useMemo(() => managerMatchPrep(state), [state]);
  const formation = matchPrep.selectedFormation;
  const xi = useMemo(() => chooseXi(squad, preset, state.season, formation), [squad, preset, state.season, formation]);
  const selected = new Set(xi.map((player) => player.id));
  const bench = squad
    .filter((player) => !selected.has(player.id))
    .sort((a, b) => b.currentAbility - a.currentAbility);
  const clubEmployment = employmentLabel(
    clubOperatingModel(state, userClubReference(state)),
  );
  const professionalisation = userProfessionalisationReadiness(state);
  const cohesion = state.playerClubPerformance?.cohesion ?? PLAYER_COHESION_DEFAULT;
  const morale = state.playerClubPerformance?.morale ?? PLAYER_MORALE_DEFAULT;
  const managerQuality = playerManagerQuality(state);

  const professionalise = () =>
    update((s) => {
      const outcome = professionaliseUserClub(s);
      setEmploymentNote(outcome.result.reason);
      if (outcome.result.ok) setProfessionalisationReview(false);
      return outcome.state;
    });

  const choose = (next: Preset) => {
    setPreset(next);
    update((s) => ({
      ...s,
      inboxFlags: {
        ...s.inboxFlags,
        "chairman.selection.preset": next,
        "chairman.selection.ids": chooseXi(userSquad(s), next, s.season, managerMatchPrep(s).selectedFormation)
          .map((player) => player.id)
          .join(","),
      },
    }));
  };

  return (
    <div className="lf-squad-screen flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        {onBack ? (
          <Button className="w-fit" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" /> Back to transfers
          </Button>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Football department</div>
            <h1 className="font-display text-2xl">Squad</h1>
          </div>
        )}
        <div className="flex rounded-lg border bg-card p-1">
          <button onClick={() => setView("pitch")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "pitch" && "bg-primary text-primary-foreground")}>Pitch</button>
          <button onClick={() => setView("details")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "details" && "bg-primary text-primary-foreground")}><List className="mr-1 inline size-3.5" /> Details</button>
        </div>
      </div>

      <div className="contained-scroll touch-pan-y grid min-h-0 flex-1 auto-rows-max gap-3 pr-0.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <section className="lf-squad-overview overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1">
          <div className="panel-strip p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Football department</div>
                <h2 className="font-display text-2xl">Squad & selection</h2>
                <p className="mt-1 max-w-2xl text-sm opacity-80">Pitch view for the XI; details view for quick contract and squad review.</p>
                <div className="mt-2 inline-flex rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-xs font-semibold">
                  Club operating model · {clubEmployment}
                </div>
              </div>
              <Shield className="size-8 opacity-70" />
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x border-t text-center md:grid-cols-6">
            <Summary label="Players" value={String(squad.length)} />
            <Summary label="Manager's XI" value={String(xi.length)} />
            <Summary label="Avg ability" value={averageAbility(xi).toFixed(1)} />
            <Summary label="Cohesion" value={Math.round(cohesion).toString()} />
            <Summary label="Morale" value={Math.round(morale).toString()} />
            <Summary label="Manager" value={Math.round(managerQuality).toString()} />
          </div>
        </section>

        {professionalisation.currentModel === "PartTime" && (
          <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Employment model</div>
                <div className="font-display text-xl">Move to full-time football</div>
              </div>
              <Shield className="size-5 text-primary" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Full-time status improves access to stronger players, but future signings and renewals expect professional wages. Existing player contracts stay exactly as signed.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.trainingLabel}</div><div className="text-[10px] text-muted-foreground">Training ground</div></div>
              <div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.recruitmentReputationBonus > 0 ? `+${professionalisation.recruitmentReputationBonus} appeal` : "Professional level"}</div><div className="text-[10px] text-muted-foreground">Player interest</div></div>
              <div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.futureWageFactor > 1 ? `~+${Math.round((professionalisation.futureWageFactor - 1) * 100)}%` : "Level baseline"}</div><div className="text-[10px] text-muted-foreground">Future wages</div></div>
            </div>
            {!professionalisation.allowed ? (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">{professionalisation.reason}</div>
            ) : professionalisationReview ? (
              <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-sm font-semibold">Confirm permanent transition?</div>
                <p className="mt-1 text-xs text-muted-foreground">This changes the club's employment model immediately. Existing contracts remain valid; future recruitment and renewals use full-time terms.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={professionalise}>Confirm full-time</Button>
                  <Button size="sm" variant="outline" onClick={() => setProfessionalisationReview(false)}>Not yet</Button>
                </div>
              </div>
            ) : (
              <Button className="mt-3 w-full" size="sm" onClick={() => setProfessionalisationReview(true)}>Review transition</Button>
            )}
            {employmentNote && <div className="mt-2 text-xs text-muted-foreground">{employmentNote}</div>}
          </section>
        )}

        <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Selection preset</div>
              <div className="font-display text-lg">Manager's shortlist</div>
            </div>
            <Sparkles className="size-4 text-primary" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PresetButton active={preset === "strongest"} onClick={() => choose("strongest")} title="Strongest" detail="Ability first" />
            <PresetButton active={preset === "rested"} onClick={() => choose("rested")} title="Fresh" detail="Condition first" />
            <PresetButton active={preset === "youth"} onClick={() => choose("youth")} title="Youth" detail="Development" />
          </div>
        </section>

        <section className="min-h-[34rem] overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-2 lg:row-span-3 lg:row-start-1">
          {view === "pitch" ? (
            <Pitch xi={xi} formation={formation} managerName={matchPrep.managerName} />
          ) : (
            <SquadDetails squad={squad} selected={selected} season={state.season} />
          )}
        </section>

        <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Wider squad</div>
              <div className="font-display text-lg">Bench & depth</div>
            </div>
            <Users className="size-4 text-muted-foreground" />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {bench.slice(0, 12).map((player) => (
              <button key={player.id} onClick={() => openPlayerProfile(player.id)} className="flex items-center justify-between rounded-lg border bg-muted/20 px-2.5 py-2 text-left hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{playerName(player)}</div>
                  <div className="text-[10px] text-muted-foreground">{player.position} · {ageOf(player, state.season)} yrs</div>
                </div>
                <div className="text-sm font-bold">{Math.round(player.currentAbility)}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Pitch({ xi, formation, managerName }: { xi: FootballPlayer[]; formation: ManagerFormation; managerName: string }) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  return (
    <div className="flex h-full min-h-[34rem] flex-col">
      <div className="border-b px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Manager's XI · {formation}</div>
        <div className="font-display text-xl">{managerName}</div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col justify-evenly overflow-hidden bg-emerald-950/90 px-3 py-5 text-white">
        <div className="pointer-events-none absolute inset-4 rounded-[2rem] border border-white/35" />
        <div className="pointer-events-none absolute left-1/2 top-4 bottom-4 w-px bg-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
        {MANAGER_FORMATION_ROWS[formation].map((row, rowIndex) => (
          <div key={rowIndex} className="relative z-10 flex items-center justify-evenly gap-2">
            {row.map((index) => {
              const player = xi[index];
              if (!player) return <div key={index} className="w-20" />;
              const position = slots[index];
              return (
                <button key={player.id} onClick={() => openPlayerProfile(player.id)} className="group flex w-20 flex-col items-center text-center">
                  <div className="mb-1 flex size-10 items-center justify-center rounded-full border border-white/40 bg-black/35 text-xs font-bold shadow">{Math.round(player.currentAbility)}</div>
                  <div className="w-full truncate rounded bg-black/45 px-1.5 py-1 text-[10px] font-semibold shadow-sm">{playerName(player)}</div>
                  <div className={cn("mt-1 rounded px-1.5 py-0.5 text-[9px] font-bold", POSITION_PITCH_CLASS[position])}>{position}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SquadDetails({ squad, selected, season }: { squad: FootballPlayer[]; selected: Set<string>; season: number }) {
  return (
    <div className="contained-scroll h-full overflow-y-auto p-3">
      <div className="space-y-1.5">
        {squad.map((player) => {
          const contract = activeContract(player);
          const loan = activeLoanForPlayer(player.id);
          const mood = playerMood(player);
          return (
            <button key={player.id} onClick={() => openPlayerProfile(player.id)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border bg-muted/15 px-2.5 py-2 text-left hover:bg-muted/35">
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", POSITION_BADGE_CLASS[player.position])}>{player.position}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{playerName(player)}</span><span className="block truncate text-[10px] text-muted-foreground">{selected.has(player.id) ? "XI" : "Squad"} · {mood.label}{loan ? ` · Loan: ${clubDisplayName(loan.parentClubId)}` : ""}</span></span>
              <span className="text-right"><span className="block text-sm font-bold">{Math.round(player.currentAbility)}</span><span className={cn("block text-[10px]", MOOD_TONE_CLASS[mood.tone])}>{contract ? `${weeksLeftOnContract(contract, season)}w` : "No deal"}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PresetButton({ active, onClick, title, detail }: { active: boolean; onClick: () => void; title: string; detail: string }) {
  return <button onClick={onClick} className={cn("rounded-lg border px-2 py-2 text-left", active ? "border-primary bg-primary/10" : "bg-muted/15 hover:bg-muted/35")}><div className="text-xs font-semibold">{title}</div><div className="text-[10px] text-muted-foreground">{detail}</div></button>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="px-2 py-2.5"><div className="text-lg font-bold">{value}</div><div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div></div>;
}

function averageAbility(players: FootballPlayer[]): number {
  return players.length ? players.reduce((sum, player) => sum + player.currentAbility, 0) / players.length : 0;
}

function chooseXi(
  players: FootballPlayer[],
  preset: Preset,
  season: number,
  formation: ManagerFormation,
): FootballPlayer[] {
  const available = [...players];
  const selected: FootballPlayer[] = [];
  for (const position of MANAGER_FORMATION_SLOTS[formation]) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    available.forEach((player, index) => {
      const familiarity = positionFamiliarity(player.position, position);
      const profile = tacticalPositionProfile(player.position);
      const targetUnit = positionUnit(position);
      const unitPenalty = profile.unit === targetUnit ? 0 : -22;
      const age = ageOf(player, season);
      const presetAdjustment = preset === "youth" ? Math.max(0, 25 - age) * 0.9 : preset === "rested" ? (player.condition ?? 100) * 0.08 : 0;
      const score = player.currentAbility + familiarity * 18 + unitPenalty + presetAdjustment;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) selected.push(available.splice(bestIndex, 1)[0]);
  }
  return selected;
}