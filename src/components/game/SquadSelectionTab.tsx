import { useMemo, useState } from "react";
import { ArrowLeft, List, Shield, Sparkles, Users } from "lucide-react";
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
import { fitnessLabel, fixtureLoadThisWeek, medicalSupport, playerFitness, playerIsAvailable, squadAverageFitness } from "@/lib/game/playerHealth";
import { playerSeasonStats } from "@/lib/game/playerSeasonStats";
import {
  PLAYER_COHESION_DEFAULT,
  PLAYER_MORALE_DEFAULT,
  playerManagerQuality,
} from "@/lib/game/playerClubPerformance";

type Preset = "strongest" | "rested" | "youth";
type SquadView = "pitch" | "details" | "stats";

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
        <div className="flex rounded-lg border bg-card p-1"><button onClick={() => setView("pitch")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "pitch" && "bg-primary text-primary-foreground")}>Pitch</button><button onClick={() => setView("details")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "details" && "bg-primary text-primary-foreground")}><List className="mr-1 inline size-3.5" /> Details</button><button onClick={() => setView("stats")} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === "stats" && "bg-primary text-primary-foreground")}>Stats</button></div>
      </div>
      <div className="contained-scroll touch-pan-y grid min-h-0 flex-1 auto-rows-max gap-3 pr-0.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <section className="lf-squad-overview overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1">
          <div className="panel-strip p-4"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Football department</div><h2 className="font-display text-2xl">Squad & selection</h2><p className="mt-1 max-w-2xl text-sm opacity-80">Pitch view for the XI; details view for quick contract and squad review.</p><div className="mt-2 inline-flex rounded-full border border-current/20 bg-black/10 px-2.5 py-1 text-xs font-semibold">Club operating model · {clubEmployment}</div></div><Shield className="size-8 opacity-70" /></div></div>
          <div className="grid grid-cols-3 divide-x border-t text-center md:grid-cols-6"><Summary label="Available" value={`${squad.filter((player) => playerIsAvailable(player, state)).length}/${squad.length}`} /><Summary label="Manager's XI" value={String(xi.length)} /><Summary label="Avg ability" value={averageAbility(xi).toFixed(1)} /><Summary label="Cohesion" value={Math.round(cohesion).toString()} /><Summary label="Morale" value={Math.round(morale).toString()} /><Summary label="Manager" value={Math.round(managerQuality).toString()} /></div>
        </section>
        {professionalisation.currentModel === "PartTime" && <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Employment model</div><div className="font-display text-xl">Move to full-time football</div></div><Shield className="size-5 text-primary" /></div><p className="mt-2 text-sm text-muted-foreground">Full-time status improves access to stronger players, but future signings and renewals expect professional wages. Existing player contracts stay exactly as signed.</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.trainingLabel}</div><div className="text-[10px] text-muted-foreground">Training ground</div></div><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.recruitmentReputationBonus > 0 ? `+${professionalisation.recruitmentReputationBonus} appeal` : "Professional level"}</div><div className="text-[10px] text-muted-foreground">Player interest</div></div><div className="rounded-lg border bg-muted/30 p-2"><div className="text-xs font-semibold">{professionalisation.futureWageFactor > 1 ? `~+${Math.round((professionalisation.futureWageFactor - 1) * 100)}%` : "Level baseline"}</div><div className="text-[10px] text-muted-foreground">Future wages</div></div></div>{!professionalisation.allowed ? <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">{professionalisation.reason}</div> : professionalisationReview ? <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3"><div className="text-sm font-semibold">Confirm permanent transition?</div><div className="mt-1 text-xs text-muted-foreground">The club will operate full-time from now on. Existing part-time contracts remain part-time until each player signs new terms.</div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={professionalise}>Confirm full-time transition</Button><Button size="sm" variant="outline" onClick={() => setProfessionalisationReview(false)}>Keep part-time</Button></div></div> : <Button className="mt-3" size="sm" variant="outline" onClick={() => setProfessionalisationReview(true)}>Review full-time transition</Button>}{employmentNote && <div className="mt-3 text-xs text-muted-foreground">{employmentNote}</div>}</section>}
        <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1"><div className="mb-3 flex items-center justify-between gap-3"><div><div className="font-display text-xl">Chairman&apos;s preference</div><div className="text-xs text-muted-foreground">The manager retains final team selection unless ownership rules say otherwise.</div></div><Sparkles className="size-5 text-primary" /></div><div className="grid grid-cols-3 gap-2"><PresetButton active={preset === "strongest"} onClick={() => choose("strongest")} title="Strongest" sub="Best XI" /><PresetButton active={preset === "rested"} onClick={() => choose("rested")} title="Rested" sub="Rotate depth" /><PresetButton active={preset === "youth"} onClick={() => choose("youth")} title="Youth" sub="Favour U23s" /></div></section>
        {view === "pitch" ? <section className="lf-pitch-card min-h-[29rem] overflow-hidden rounded-xl border bg-emerald-950 p-3 text-white shadow-sm lg:col-start-1"><div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[0.18em] text-white/60">{matchPrep.managerId ? `Manager's XI · ${formation}` : `Caretaker XI · ${formation}`}</div><div className="font-display text-2xl">First XI</div></div><Users className="size-6 text-white/70" /></div><Pitch xi={xi} formation={formation} /></section> : view === "details" ? <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1"><div className="border-b px-3 py-2"><div className="font-display text-xl">Squad details & contracts</div><div className="text-xs text-muted-foreground">Important football and contract information in one compact list.</div></div><div className="divide-y">{[...xi, ...bench].map((player) => <CompactPlayerRow key={player.id} state={state} player={player} inXi={selected.has(player.id)} />)}</div></section> : <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1"><div className="border-b px-3 py-3"><div className="font-display text-xl">Season performance</div><div className="text-xs text-muted-foreground">Recorded appearances from watched and simulated matches.</div></div><div className="grid grid-cols-3 divide-x border-b text-center"><Summary label="Avg fitness" value={`${averageFitness}%`} /><Summary label="Medical" value={medical.label} /><Summary label="Fixtures this week" value={String(fixtureLoad)} /></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 text-left">Player</th><th className="px-2 py-2 text-right">Apps</th><th className="px-2 py-2 text-right">Starts</th><th className="px-2 py-2 text-right">Sub</th><th className="px-2 py-2 text-right">Min</th><th className="px-2 py-2 text-right">G</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">Rat</th></tr></thead><tbody>{seasonStats.map((row) => <tr key={row.playerId} className="border-b last:border-b-0"><td className="px-3 py-2 font-semibold">{row.name}</td><td className="px-2 py-2 text-right">{row.appearances}</td><td className="px-2 py-2 text-right">{row.starts}</td><td className="px-2 py-2 text-right">{row.substituteAppearances}</td><td className="px-2 py-2 text-right">{row.minutes}</td><td className="px-2 py-2 text-right">{row.goals}</td><td className="px-2 py-2 text-right">{row.assists}</td><td className="px-2 py-2 text-right">{row.averageRating.toFixed(2)}</td></tr>)}{seasonStats.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No player match records yet.</td></tr>}</tbody></table></div><div className="border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">Medical score {medical.score}/100 · weekly fitness recovery +{medical.recoveryPerWeek} · injury-risk factor {medical.injuryRiskMultiplier.toFixed(2)}×</div></section>}
        <section className="lf-squad-list flex min-h-0 flex-col rounded-xl border bg-card shadow-sm lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:overflow-hidden"><div className="border-b px-4 py-3"><div className="font-display text-xl">Wider squad</div><div className="text-xs text-muted-foreground">Exact ability is visible because these are your contracted players.</div></div><div className="min-h-0 flex-1 divide-y lg:overflow-auto lg:overscroll-contain lg:[scrollbar-gutter:stable]">{bench.map((player) => <PlayerRow key={player.id} state={state} player={player} />)}</div></section>
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

function Pitch({ xi, formation }: { xi: FootballPlayer[]; formation: ManagerFormation }) {
  const slots = MANAGER_FORMATION_SLOTS[formation];
  const rows = MANAGER_FORMATION_ROWS[formation].map((indices) => indices.map((index) => ({ player: xi[index], slot: slots[index] }))).map((row) => row.filter((entry): entry is { player: FootballPlayer; slot: TacticalPosition } => Boolean(entry.player)));
  return <div className="relative touch-pan-y overflow-hidden rounded-xl border border-white/20 bg-emerald-800/70 px-3 py-3"><div className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-white/25" /><div className="pointer-events-none absolute left-1/2 top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" /><div className="relative space-y-3 xl:space-y-4">{rows.map((row, rowIndex) => <div key={rowIndex} className="flex justify-center gap-2 sm:gap-4">{row.map(({ player, slot }) => <button key={player.id} type="button" onClick={() => openPlayerProfile(player.id)} className="w-20 rounded-lg text-center transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:w-24" aria-label={`Open ${playerName(player)} profile`}><div className={cn("mx-auto grid size-10 place-items-center rounded-full border font-display text-sm", POSITION_PITCH_CLASS[positionUnit(slot)])}>{player.currentAbility}</div><div className="mt-1 truncate text-[11px] font-semibold">{player.lastName}</div><div className="text-[9px] font-semibold text-white/70">{slot}</div></button>)}</div>)}</div></div>;
}

function CompactPlayerRow({ state, player, inXi }: { state: GameState; player: FootballPlayer; inXi: boolean }) {
  const contract = activeContract(state, player.id); const loan = activeLoanForPlayer(state, player.id); const employment = contract ? employmentLabel(contractEmploymentType(state, contract)) : null; const wage = contract ? loan ? Math.round((contract.weeklyWage * loan.loanClubWageContributionPct) / 100) : contract.weeklyWage : null; const weeks = loan ? Math.max(0, loan.endAbsoluteWeek - absoluteWeek(state.season, state.week)) : contract ? weeksLeftOnContract(state, contract) : null; const tactical = tacticalPositionProfile(player);
  return <button type="button" onClick={() => openPlayerProfile(player.id)} className="grid w-full grid-cols-[minmax(0,1.3fr)_repeat(4,auto)] items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="truncate font-semibold">{playerName(player)}</span>{inXi && <span className="text-[9px] font-bold text-primary">XI</span>}<span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-bold", POSITION_BADGE_CLASS[positionUnit(tactical.primary)])}>{tactical.primary}</span>{loan && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">LOAN</span>}</div><div className="truncate text-[10px] text-muted-foreground">{ageOf(player, state.season)}y · {player.injury ? `${player.injury.type} · out until wk ${player.injury.returnAbsoluteWeek}` : `${fitnessLabel(playerFitness(player))} · ${playerFitness(player)}% fit`} · {loan ? `On loan from ${clubDisplayName(state, loan.parentClubId)}` : contract?.squadRole ?? "No role"}{!loan && employment ? ` · ${employment}` : ""}</div></div><div className="text-right"><div className="font-display text-base">{player.currentAbility}</div><div className="text-[9px] text-muted-foreground">OVR</div></div><div className="text-right"><div>{player.potentialAbility}</div><div className="text-[9px] text-muted-foreground">POT</div></div><div className="text-right"><div>{wage !== null ? fmtMoney(wage) : "—"}</div><div className="text-[9px] text-muted-foreground">{loan ? "our /wk" : "/wk"}</div></div><div className="text-right"><div>{weeks !== null ? `${weeks}w` : "—"}</div><div className="text-[9px] text-muted-foreground">{loan ? "loan" : "contract"}</div></div></button>;
}

function PlayerRow({ state, player }: { state: GameState; player: FootballPlayer }) {
  const contract = activeContract(state, player.id); const loan = activeLoanForPlayer(state, player.id); const employment = contract ? employmentLabel(contractEmploymentType(state, contract)) : null; const mood = playerMood(state, player); const loanWeeks = loan ? Math.max(0, loan.endAbsoluteWeek - absoluteWeek(state.season, state.week)) : null; const tactical = tacticalPositionProfile(player);
  return <button type="button" onClick={() => openPlayerProfile(player.id)} className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-semibold">{playerName(player)}</span><span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", POSITION_BADGE_CLASS[positionUnit(tactical.primary)])}>{tactical.primary}</span>{loan && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">LOAN</span>}</div><div className="mt-0.5 text-xs text-muted-foreground">{ageOf(player, state.season)}y · {player.nationality} · Ability {player.currentAbility} · Potential {player.potentialAbility} · {player.injury ? `${player.injury.type} (${player.injury.severity})` : `${playerFitness(player)}% fit`}</div><div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="truncate">{loan ? `On loan from ${clubDisplayName(state, loan.parentClubId)} · ${loanWeeks} weeks left · ${loan.loanClubWageContributionPct}% wages` : contract ? `${contract.squadRole} · ${employment} · ${weeksLeftOnContract(state, contract)} weeks left` : "No active contract"}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${MOOD_TONE_CLASS[mood.tone]}`}>{mood.label}</span></div></div><div className="text-right"><div className="font-display text-xl">{player.currentAbility}</div><div className="text-[10px] uppercase text-muted-foreground">OVR</div></div></button>;
}

function PresetButton({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) { return <button onClick={onClick} className={cn("rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}><div className="font-semibold">{title}</div><div className={cn("text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{sub}</div></button>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="p-3"><div className="font-display text-2xl">{value}</div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div></div>; }
function averageAbility(players: FootballPlayer[]): number { return players.length ? players.reduce((sum, player) => sum + player.currentAbility, 0) / players.length : 0; }
