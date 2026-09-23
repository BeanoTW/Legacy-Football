import { AlertTriangle, ArrowUpRight, HeartPulse, Shield, Star, UserRound } from "lucide-react";
import type { FootballPlayer, GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { activeContract, ageOf, playerName, weeksLeftOnContract } from "@/lib/game/recruitment";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { fmtMoney } from "@/lib/game/engine";
import { tacticalPositionProfile, positionUnit } from "@/lib/game/positions";
import { POSITION_BADGE_CLASS } from "../playerPosition";
import { playerFitness } from "@/lib/game/playerHealth";
import { playerRecentForm } from "@/lib/game/playerForm";
import { playerSeasonStats } from "@/lib/game/playerSeasonStats";
import { scoutingReport } from "@/lib/game/scouting";
import { scoutedOverallPresentation } from "@/lib/game/scoutingPresentation";
import { chairmanRecruitmentEstimate, isChairmanShortlisted } from "@/lib/game/recruitmentKnowledge";
import { openPlayerProfile } from "./PlayerProfileSheet";
import { contractEmploymentType } from "@/lib/game/employment";

export type PlayerCardMode = "squad" | "recruitment" | "compact";

export function TacticalPlayerCard({
  state,
  player,
  mode = "squad",
  selected = false,
  actions,
  className,
  onOpen,
}: {
  state: GameState;
  player: FootballPlayer;
  mode?: PlayerCardMode;
  selected?: boolean;
  actions?: React.ReactNode;
  className?: string;
  onOpen?: () => void;
}) {
  const owned = isUserClubReference(state, player.currentClubId);
  const tactical = tacticalPositionProfile(player);
  const contract = owned ? activeContract(state, player.id) : null;
  const loan = activeLoanForPlayer(state, player.id);
  const report = owned ? null : scoutingReport(state, player);
  const overall = owned
    ? { label: String(player.currentAbility), known: true, exact: true }
    : scoutedOverallPresentation(state, player, report);
  const estimate = !owned ? chairmanRecruitmentEstimate(state, player.id) : null;
  const form = owned ? playerRecentForm(state, player.id) : null;
  const fitness = owned ? playerFitness(player) : null;
  const season = owned ? playerSeasonStats(state).find((row) => row.playerId === player.id) : undefined;
  const shortlisted = !owned && isChairmanShortlisted(state, player.id);
  const compact = mode === "compact";

  const clubLabel = player.currentClubId
    ? clubDisplayName(state, player.currentClubId)
    : "Free agent";

  if (owned && mode !== "recruitment") {
    const contractWeeks = contract ? weeksLeftOnContract(state, contract) : null;
    const injury = player.injury;
    return (
      <button
        type="button"
        onClick={() => onOpen ? onOpen() : openPlayerProfile(player.id)}
        className={cn(
          "group grid w-full grid-cols-[2.65rem_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-border/60 bg-card px-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          mode === "compact" ? "min-h-[3.75rem] py-2" : "min-h-[4.45rem] py-2.5",
          selected && "bg-primary/[0.05]",
          className,
        )}
        aria-label={`Open ${playerName(player)} profile`}
      >
        <span className="relative grid size-10 place-items-center rounded-lg border bg-muted/45">
          <span className="font-display text-sm">{tactical.primary}</span>
          {selected && <span className="absolute -right-1 -top-1 rounded bg-primary px-1 text-[7px] font-black text-primary-foreground">XI</span>}
        </span>

        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-display text-base leading-none">{playerName(player)}</span>
            {injury && <AlertTriangle className="size-3.5 shrink-0 text-rose-500" />}
            {loan && <span className="shrink-0 rounded bg-sky-500/10 px-1 py-0.5 text-[8px] font-bold text-sky-700 dark:text-sky-300">LOAN</span>}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground">
            <span>{ageOf(player, state.season)}y</span>
            <span>·</span>
            <span className="truncate">{player.nationality}</span>
            <span>·</span>
            <span className={cn(
              "font-semibold",
              injury ? "text-rose-600 dark:text-rose-300" : fitness !== null && fitness < 75 ? "text-amber-600 dark:text-amber-300" : ""
            )}>
              {injury ? injury.type : `${fitness ?? 100}% fit`}
            </span>
          </span>
          {mode !== "compact" && (
            <span className="mt-1 block truncate text-[9px] text-muted-foreground/80">
              {form?.appearances ? `${form.band} · ${form.averageRating.toFixed(2)}` : "No form"}
              {contract ? ` · ${contract.squadRole} · ${contractWeeks}w` : ""}
            </span>
          )}
        </span>

        <span className="hidden min-w-[3.8rem] text-right sm:block">
          <span className="block font-display text-sm">{form?.appearances ? form.band : "—"}</span>
          <span className="block text-[7px] uppercase tracking-wide text-muted-foreground">Form</span>
        </span>

        <span className="min-w-[2.8rem] text-right">
          <span className="block font-display text-2xl leading-none">{player.currentAbility}</span>
          <span className="mt-0.5 block text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground">OVR</span>
        </span>
      </button>
    );
  }

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-emerald-950/15 bg-[#081b18] text-white shadow-sm",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_82%_10%,rgba(45,212,191,.14),transparent_33%),linear-gradient(135deg,rgba(255,255,255,.03),transparent_45%)]",
        selected && "ring-2 ring-emerald-400/70",
        compact && "rounded-xl",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onOpen ? onOpen() : openPlayerProfile(player.id)}
        className={cn(
          "relative z-10 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300",
          compact ? "p-2.5" : "p-3.5",
        )}
        aria-label={`Open ${playerName(player)} profile`}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]",
            compact ? "size-12" : "size-16",
          )}>
            <UserRound className={cn("text-emerald-200/55", compact ? "size-7" : "size-9")} />
            <span className="absolute bottom-1 left-1 rounded bg-black/45 px-1.5 py-0.5 font-display text-[10px] text-white/85">
              {tactical.primary}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className={cn("truncate font-display leading-none", compact ? "text-lg" : "text-2xl")}>
                    {playerName(player)}
                  </h3>
                  {selected && <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-300">XI</span>}
                  {shortlisted && <Star className="size-3.5 fill-amber-300 text-amber-300" />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-white/55">
                  <span>{ageOf(player, state.season)}y</span>
                  <span>{player.nationality}</span>
                  <span className="truncate">{clubLabel}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className={cn("font-display leading-none", overall.label.length > 3 ? "text-xl" : compact ? "text-2xl" : "text-3xl")}>
                  {overall.label}
                </div>
                <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em] text-emerald-200/55">
                  {overall.exact ? "Ability" : overall.known ? "Est. ability" : "Unknown"}
                </div>
              </div>
            </div>

            {!compact && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold", POSITION_BADGE_CLASS[positionUnit(tactical.primary)])}>
                  {tactical.primary}
                </span>
                {tactical.secondary.slice(0, 3).map((position) => (
                  <span key={position} className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-semibold text-white/65">
                    {position}
                  </span>
                ))}
                {loan && <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-200">LOAN</span>}
                {player.transferStatus === "listed" && <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">LISTED</span>}
              </div>
            )}
          </div>
          <ArrowUpRight className="relative z-10 mt-1 size-4 shrink-0 text-white/30 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>

        {owned ? (
          <OwnedPlayerData
            state={state}
            player={player}
            fitness={fitness ?? 100}
            form={form}
            season={season}
            contract={contract}
            compact={compact}
          />
        ) : (
          <RecruitmentPlayerData
            report={report}
            estimate={estimate}
            compact={compact}
          />
        )}
      </button>

      {actions && (
        <div className="relative z-20 border-t border-white/10 bg-black/10 p-2.5">
          {actions}
        </div>
      )}
    </article>
  );
}

function OwnedPlayerData({
  state,
  player,
  fitness,
  form,
  season,
  contract,
  compact,
}: {
  state: GameState;
  player: FootballPlayer;
  fitness: number;
  form: ReturnType<typeof playerRecentForm> | null;
  season: ReturnType<typeof playerSeasonStats>[number] | undefined;
  contract: ReturnType<typeof activeContract> | null;
  compact: boolean;
}) {
  const injury = player.injury;
  return (
    <div className={cn("relative z-10", compact ? "mt-2" : "mt-3")}>
      {injury ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/10 px-2.5 py-1.5 text-[10px] text-rose-100">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">{injury.type} · {injury.severity}</span>
        </div>
      ) : null}

      <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-3")}>
        <DataCell
          label="Fitness"
          value={`${fitness}%`}
          meter={fitness}
          tone={fitness >= 85 ? "good" : fitness >= 70 ? "warn" : "bad"}
          icon={<HeartPulse className="size-3" />}
        />
        <DataCell
          label="Form"
          value={form?.appearances ? form.band : "No form"}
          meter={form?.appearances ? Math.max(5, Math.min(100, (form.averageRating - 5) * 25)) : 0}
          tone={form?.band === "Hot" || form?.band === "Good" ? "good" : form?.band === "Poor" ? "bad" : "neutral"}
        />
        {!compact && (
          <DataCell
            label="Potential"
            value={String(player.potentialAbility)}
            tone="neutral"
            icon={<Shield className="size-3" />}
          />
        )}
      </div>

      {!compact && (
        <div className="mt-2 grid grid-cols-4 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/10 text-center">
          <Mini label="Apps" value={String(season?.appearances ?? 0)} />
          <Mini label="Goals" value={String(season?.goals ?? 0)} />
          <Mini label="Assists" value={String(season?.assists ?? 0)} />
          <Mini label="Rating" value={season?.appearances ? season.averageRating.toFixed(2) : "—"} />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-white/45">
        <span className="truncate">
          {contract
            ? `${contract.squadRole} · ${contractEmploymentType(state, contract) === "FullTime" ? "Full-time" : "Part-time"}`
            : "No squad role"}
        </span>
        <span className="shrink-0">
          {contract ? `${fmtMoney(contract.weeklyWage)}/wk · ${weeksLeftOnContract(state, contract)}w` : "No active contract"}
        </span>
      </div>
    </div>
  );
}

function RecruitmentPlayerData({
  report,
  estimate,
  compact,
}: {
  report: ReturnType<typeof scoutingReport> | null;
  estimate: ReturnType<typeof chairmanRecruitmentEstimate>;
  compact: boolean;
}) {
  const knowledge = report?.knowledgePct ?? 0;
  return (
    <div className={cn("relative z-10", compact ? "mt-2" : "mt-3")}>
      <div className="grid grid-cols-2 gap-2">
        <DataCell label="Scouting" value={knowledge > 0 ? `${knowledge}%` : "Unknown"} meter={knowledge} tone={knowledge >= 60 ? "good" : "neutral"} />
        <DataCell
          label="Potential"
          value={report?.complete ? "Assessed" : knowledge > 0 ? "Est." : "?"}
          tone="neutral"
        />
      </div>

      {!compact && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
          <Info label="Value" value={report?.valueRange && knowledge > 0 ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}` : "Unknown"} />
          <Info label="Wage" value={report?.wageRange && knowledge > 0 ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk` : "Unknown"} />
        </div>
      )}

      <div className="mt-2 text-[9px] text-white/45">
        {report?.complete
          ? "Full report"
          : knowledge > 0
            ? "Estimated values · scout further for certainty"
            : estimate
              ? "Basic recruitment knowledge"
              : "Not yet scouted"}
      </div>
    </div>
  );
}

function DataCell({
  label,
  value,
  meter,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  meter?: number;
  tone?: "good" | "warn" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const bar =
    tone === "good"
      ? "bg-emerald-400"
      : tone === "warn"
        ? "bg-amber-300"
        : tone === "bad"
          ? "bg-rose-400"
          : "bg-cyan-300/70";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.13em] text-white/40">
        {icon}{label}
      </div>
      <div className="mt-0.5 font-display text-base">{value}</div>
      {meter !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1 py-2">
      <div className="font-display text-sm">{value}</div>
      <div className="text-[7px] font-bold uppercase tracking-wide text-white/35">{label}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/10 px-2.5 py-2">
      <div className="text-[8px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-white/85">{value}</div>
    </div>
  );
}
