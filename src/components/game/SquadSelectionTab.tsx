import { useMemo, useState } from "react";
import { ArrowLeft, Shield, Sparkles, Users } from "lucide-react";
import type { FootballPlayer, GameState, TacticalPosition } from "@/lib/game/types";
import type { ManagerFormation } from "@/lib/game/managerIdentity";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";
import { MANAGER_FORMATION_ROWS, MANAGER_FORMATION_SLOTS } from "@/lib/game/managerFormationLayout";
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
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";
import { fitnessLabel, fixtureLoadThisWeek, medicalSupport, playerFitness, playerIsAvailable, squadAverageFitness } from "@/lib/game/playerHealth";
import { playerSeasonLeaders, playerSeasonStats } from "@/lib/game/playerSeasonStats";
import { playerRecentForm } from "@/lib/game/playerForm";
import {
  PLAYER_COHESION_DEFAULT,
  PLAYER_MORALE_DEFAULT,
  playerManagerQuality,
} from "@/lib/game/playerClubPerformance";

type Preset = "strongest" | "rested" | "youth";
type SquadView = "pitch" | "stats";

const employmentLabel = (value: "PartTime" | "FullTime") =>
  value === "PartTime" ? "Part-time" : "Full-time";

const managerFormation = (state: GameState): ManagerFormation => {
  const selected = managerMatchPrep(state).selectedFormation;
  return selected in MANAGER_FORMATION_SLOTS ? selected as ManagerFormation : "4-4-2";
};

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
  const [preset, setPreset] = useState<Preset>(stored === "rested" || stored === "youth" ? stored : "strongest");
  const [view, setView] = useState<SquadView>("pitch");
  const [professionalisationReview, setProfessionalisationReview] = useState(false);
  const [employmentNote, setEmploymentNote] = useState<string | null>(null);
  const squad = useMemo(() => userSquad(state), [state]);
  const matchPrep = useMemo(() => managerMatchPrep(state), [state]);
  const formation = managerFormation(state);
  const xi = useMemo(() => chooseXi(squad, preset, state, formation), [squad, preset, state, formation]);
  const selected = new Set(xi.map((player) => player.id));
  const bench = squad.filter((player) => !selected.has(player.id)).sort((a, b) => b.currentAbility - a.currentAbility);
  const clubEmployment = employmentLabel(clubOperatingModel(state, userClubReference(state)));
  const professionalisation = userProfessionalisationReadiness(state);
  const cohesion = state.playerClubPerformance?.cohesion ?? PLAYER_COHESION_DEFAULT;
  const morale = state.playerClubPerformance?.morale ?? PLAYER_MORALE_DEFAULT;
  const managerQuality = playerManagerQuality(state);
  const seasonStats = useMemo(() => playerSeasonStats(state), [state]);
  const leaders = useMemo(() => playerSeasonLeaders(state), [state]);
  const medical = medicalSupport(state);
  const averageFitness = squadAverageFitness(state);
  const fixtureLoad = fixtureLoadThisWeek(state);

  const professionalise = () => update((s) => {
    const outcome = professionaliseUserClub(s);
    setEmploymentNote(outcome.result.reason);
    if (outcome.result.ok) setProfessionalisationReview(false);
    return outcome.state;
  });

  const choose = (next: Preset) => {
    setPreset(next);
    update((s) => ({ ...s, inboxFlags: { ...s.inboxFlags, "chairman.selection.preset": next, "chairman.selection.ids": chooseXi(userSquad(s), next, s, managerFormation(s)).map((player) => player.id).join(",") } }));
  };

  return (
    <div className="lf-squad-screen flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2">
        {onBack ? <Button className="w-fit" variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back to transfers</Button> : <div><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Football department</div><h1 className="font-display text-2xl">Squad</h1></div>}
        <div className="flex rounded-lg border bg-card p-1"><button onClick={() => setView("pitch")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "pitch" && "bg-primary text-primary-foreground")}>Pitch</button><button onClick={() => setView("stats")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "stats" && "bg-primary text-primary-foreground")}>Stats</button></div>
      </div>
      <div className="contained-scroll touch-pan-y grid min-h-0 flex-1 auto-rows-max gap-3 pr-0.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <section className="lf-squad-overview overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1">
          <div className="panel-strip p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Football department</div><h2 className="font-display text-2xl">Squad & selection</h2><p className="mt-1 max-w-2xl text-sm opacity-80">Pitch view for the XI; details view for quick contract and squad review.</p><div className="mt-2 inline-flex rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-xs font-semibold">Club operating model · {clubEmployment}</div></div><Shield className="size-8 opacity-70" /></div></div>
          <div className="grid grid-cols-3 divide-x border-t text-center md:grid-cols-6"><Summary label="Available" value={`${squad.filter((player) => playerIsAvailable(player, state)).length}/${squad.length}`} /><Summary label="Manager's XI" value={String(xi.length)} /><Summary label="Avg ability" value={averageAbility(xi).toFixed(1)} /><Summary label="Cohesion" value={Math.round(cohesion).toString()} /><Summary label="Morale" value={Math.round(morale).toString()} /><Summary label="Manager" value={Math.round(managerQuality).toString()} /></div>
        </section>
        {professionalisation.currentModel === "PartTime" && <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Employment model</div><div className="font-display text-xl">Move to full-time football</div></div><Shield className="size-5 text-primary" /></div><p className="mt-2 text-sm text-muted-foreground">Full-time status improves access to stronger players, but future signings and renewals expect professional wages. Existing player contracts stay exactly as signed.</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.trainingLabel}</div><div className="text-[10px] text-muted-foreground">Training ground</div></div><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.recruitmentReputationBonus > 0 ? `+${professionalisation.recruitmentReputationBonus} appeal` : "Professional level"}</div><div className="text-[10px] text-muted-foreground">Player interest</div></div><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.futureWageFactor > 1 ? `~+${Math.round((professionalisation.futureWageFactor - 1) * 100)}%` : "Level baseline"}</div><div className="text-[10px] text-muted-foreground">Future wages</div></div></div>{!professionalisation.allowed ? <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">{professionalisation.reason}</div> : professionalisationReview ? <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3"><div className="text-sm font-semibold">Confirm permanent transition?</div><div className="mt-1 text-xs text-muted-foreground">The club will operate full-time from now on. Existing part-time contracts remain part-time until each player signs new terms.</div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={professionalise}>Confirm full-time transition</Button><Button size="sm" variant="outline" onClick={() => setProfessionalisationReview(false)}>Keep part-time</Button></div></div> : <Button className="mt-3" size="sm" variant="outline" onClick={() => setProfessionalisationReview(true)}>Review full-time transition</Button>}{employmentNote && <div className="mt-3 text-xs text-muted-foreground">{employmentNote}</div>}</section>}
        <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="font-display text-xl">Chairman&apos;s preference</div><div className="text-xs text-muted-foreground">The manager retains final team selection unless ownership rules say otherwise.</div></div><Sparkles className="size-5 text-primary" /></div><div className="grid grid-cols-3 gap-2"><PresetButton active={preset === "strongest"} onClick={() => choose("strongest")} title="Strongest" sub="Best XI" /><PresetButton active={preset === "rested"} onClick={() => choose("rested")} title="Rested" sub="Rotate depth" /><PresetButton active={preset === "youth"} onClick={() => choose("youth")} title="Youth" sub="Favour U23s" /></div></section>
        {view === "pitch" ? <section className="lf-pitch-card overflow-hidden rounded-xl border border-emerald-900/40 bg-[#06251c] text-white shadow-sm lg:col-start-1"><div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3"><div><div className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-200/55">{matchPrep.managerId ? "Manager selection" : "Caretaker selection"}</div><div className="mt-0.5 flex items-end gap-2"><div className="font-display text-2xl">First XI</div><span className="mb-0.5 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-white/75">{formation}</span></div></div><div className="grid grid-cols-2 gap-1.5 text-right"><div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1"><div className="font-display text-base">{averageAbility(xi).toFixed(1)}</div><div className="text-[7px] uppercase tracking-wide text-white/40">Avg OVR</div></div><div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1"><div className="font-display text-base">{Math.round(xi.reduce((sum, player) => sum + playerFitness(player), 0) / Math.max(1, xi.length))}%</div><div className="text-[7px] uppercase tracking-wide text-white/40">Avg fit</div></div></div></div><Pitch state={state} xi={xi} formation={formation} /></section> : <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1"><div className="border-b px-3 py-3"><div className="font-display text-xl">Season performance</div><div className="text-xs text-muted-foreground">Recorded appearances from watched and simulated matches.</div></div><div className="grid grid-cols-3 divide-x border-b text-center"><Summary label="Avg fitness" value={`${averageFitness}%`} /><Summary label="Medical" value={medical.label} /><Summary label="Fixtures this week" value={String(fixtureLoad)} /></div><div className="grid grid-cols-2 gap-2 border-b p-3 text-xs sm:grid-cols-4"><Leader label="Top scorer" name={leaders.topScorer?.name} value={leaders.topScorer ? `${leaders.topScorer.goals} goals` : "—"} /><Leader label="Top assists" name={leaders.topAssister?.name} value={leaders.topAssister ? `${leaders.topAssister.assists} assists` : "—"} /><Leader label="Top rated" name={leaders.topRated?.name} value={leaders.topRated ? leaders.topRated.averageRating.toFixed(2) : "—"} /><Leader label="Most used" name={leaders.mostUsed?.name} value={leaders.mostUsed ? `${leaders.mostUsed.minutes} min` : "—"} /></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 text-left">Player</th><th className="px-2 py-2 text-right">Apps</th><th className="px-2 py-2 text-right">Starts</th><th className="px-2 py-2 text-right">Sub</th><th className="px-2 py-2 text-right">Min</th><th className="px-2 py-2 text-right">G</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">Rat</th><th className="px-2 py-2 text-right">Form</th></tr></thead><tbody>{seasonStats.map((row) => <tr key={row.playerId} className="border-b last:border-b-0"><td className="px-3 py-2 font-semibold">{row.name}</td><td className="px-2 py-2 text-right">{row.appearances}</td><td className="px-2 py-2 text-right">{row.starts}</td><td className="px-2 py-2 text-right">{row.substituteAppearances}</td><td className="px-2 py-2 text-right">{row.minutes}</td><td className="px-2 py-2 text-right">{row.goals}</td><td className="px-2 py-2 text-right">{row.assists}</td><td className="px-2 py-2 text-right">{row.averageRating.toFixed(2)}</td><td className="px-2 py-2 text-right">{playerRecentForm(state, row.playerId).appearances ? `${playerRecentForm(state, row.playerId).band} ${playerRecentForm(state, row.playerId).averageRating.toFixed(2)}` : "—"}</td></tr>)}{seasonStats.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No player match records yet.</td></tr>}</tbody></table></div><div className="border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">Medical score {medical.score}/100 · weekly fitness recovery +{medical.recoveryPerWeek} · injury-risk factor {medical.injuryRiskMultiplier.toFixed(2)}×</div></section>}
        <section className="lf-squad-list flex min-h-0 flex-col rounded-xl border bg-card shadow-sm lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:overflow-hidden"><div className="border-b px-4 py-3"><div className="font-display text-xl">Substitutes</div><div className="text-xs text-muted-foreground">Players outside the starting XI and available from the bench.</div></div><div className="min-h-0 flex-1 divide-y lg:overflow-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]">{bench.map((player) => <PlayerRow key={player.id} state={state} player={player} />)}</div></section>
      </div>
    </div>
  );
}

function chooseXi(players: FootballPlayer[], preset: Preset, state: GameState, formation: ManagerFormation): FootballPlayer[] {
  const used = new Set<string>();
  const score = (player: FootballPlayer, position: TacticalPosition) => {
    const familiarity = positionFamiliarity(player, position);
    const familiarityBonus = familiarity === "Natural" ? 12 : familiarity === "Accomplished" ? 7 : familiarity === "Comfortable" ? 2 : -20;
    const presetScore = preset === "youth" ? Math.max(0, 25 - ageOf(player, state.season)) * 2.4 + player.potentialAbility * 0.12 : preset === "rested" ? (playerFitness(player) - 70) * 0.28 + (ageOf(player, state.season) <= 24 ? 4 : 0) : 0;
    return player.currentAbility + familiarityBonus + presetScore + (playerFitness(player) - 80) * 0.08;
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
}: {
  state: GameState;
  xi: FootballPlayer[];
  formation: ManagerFormation;
}) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const rows = MANAGER_FORMATION_ROWS[formation]
    .map((indices) => indices.map((index) => ({ player: xi[index], slot: slots[index] })))
    .map((row) => row.filter((entry): entry is { player: FootballPlayer; slot: TacticalPosition } => Boolean(entry.player)));

  return (
    <div className="relative min-h-[24rem] overflow-hidden bg-[linear-gradient(90deg,rgba(16,112,74,.96)_0%,rgba(16,112,74,.96)_12.5%,rgba(19,122,81,.96)_12.5%,rgba(19,122,81,.96)_25%,rgba(16,112,74,.96)_25%,rgba(16,112,74,.96)_37.5%,rgba(19,122,81,.96)_37.5%,rgba(19,122,81,.96)_50%,rgba(16,112,74,.96)_50%,rgba(16,112,74,.96)_62.5%,rgba(19,122,81,.96)_62.5%,rgba(19,122,81,.96)_75%,rgba(16,112,74,.96)_75%,rgba(16,112,74,.96)_87.5%,rgba(19,122,81,.96)_87.5%,rgba(19,122,81,.96)_100%)] px-2 py-4 sm:min-h-[27rem] sm:px-4">
      <div className="pointer-events-none absolute inset-3 rounded-xl border border-white/35" />
      <div className="pointer-events-none absolute inset-y-3 left-1/2 w-px bg-white/35" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/35" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/55" />
      <div className="pointer-events-none absolute inset-x-[27%] top-3 h-[14%] border-x border-b border-white/35" />
      <div className="pointer-events-none absolute inset-x-[39%] top-3 h-[6%] border-x border-b border-white/35" />
      <div className="pointer-events-none absolute inset-x-[27%] bottom-3 h-[14%] border-x border-t border-white/35" />
      <div className="pointer-events-none absolute inset-x-[39%] bottom-3 h-[6%] border-x border-t border-white/35" />

      <div className="relative flex min-h-[22rem] flex-col justify-between gap-2 py-3 sm:min-h-[25rem]">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-center justify-evenly gap-1 px-1 sm:gap-2 sm:px-3">
            {row.map(({ player, slot }) => {
              const fitness = playerFitness(player);
              const familiarity = positionFamiliarity(player, slot);
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
                  onClick={() => openPlayerProfile(player.id)}
                  className="group w-[4.4rem] rounded-xl text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:w-[5.4rem]"
                  aria-label={`Open ${playerName(player)} profile`}
                >
                  <div className={cn(
                    "relative mx-auto grid size-11 place-items-center rounded-full border-2 font-display text-base shadow-lg sm:size-12",
                    POSITION_PITCH_CLASS[positionUnit(slot)],
                    familiarityTone,
                  )}>
                    {player.currentAbility}
                    <span className={cn("absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border border-emerald-950", fitnessTone)} />
                  </div>
                  <div className="mt-1 rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 backdrop-blur-[1px]">
                    <div className="truncate font-display text-[11px] leading-none sm:text-xs">{player.lastName}</div>
                    <div className="mt-0.5 flex items-center justify-center gap-1 text-[8px] font-bold text-white/60">
                      <span>{slot}</span>
                      {form.appearances > 0 && <span>· {form.averageRating.toFixed(1)}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-white/45">
        Tap a player for profile
      </div>
    </div>
  );
}

function CompactPlayerRow({ state, player, inXi }: { state: GameState; player: FootballPlayer; inXi: boolean }) {
  return <TacticalPlayerCard state={state} player={player} mode="compact" selected={inXi} className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0" />;
}

function PlayerRow({ state, player }: { state: GameState; player: FootballPlayer }) {
  return <TacticalPlayerCard state={state} player={player} mode="squad" className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0" />;
}

function PresetButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) { return <button onClick={onClick} className={cn("rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}><div className="font-semibold">{title}</div><div className={cn("text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{sub}</div></button>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="p-3"><div className="font-display text-2xl">{value}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div>; }
function averageAbility(players: FootballPlayer[]): number { return players.length ? players.reduce((sum, player) => sum + player.currentAbility, 0) / players.length : 0; }

function Leader({ label, name, value }: { label: string; name?: string; value: string }) { return <div className="rounded-lg border bg-muted/20 p-2"><div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 truncate font-semibold">{name ?? "No data"}</div><div className="text-[10px] text-muted-foreground">{value}</div></div>; }
