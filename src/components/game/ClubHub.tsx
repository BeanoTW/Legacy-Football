import { useMemo } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Mail,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CALENDAR, fmtMoney, phaseOf, startMatchDay } from "@/lib/game/engine";
import { weeklyNetRecurring } from "@/lib/game/selectors/club";
import { recomputeConfidence } from "@/lib/game/board";
import { financialHealth as canonicalFinancialHealth } from "@/lib/game/sustainability";
import type { FixtureResult, GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { initials, ord } from "./shared/primitives";
import type { Tab } from "./tabs";

export function ClubHub({
  state,
  matchReady,
  update,
  setTab,
}: {
  state: GameState;
  matchReady: boolean;
  update: (fn: (state: GameState) => GameState) => void;
  setTab: (tab: Tab) => void;
}) {
  const nextFixture = state.fixtures.find((fixture) => fixture.week === state.week);
  const health = useMemo(() => canonicalFinancialHealth(state), [state]);
  const boardConfidence = state.board?.directors?.length ? recomputeConfidence(state.board) : 50;
  const decisions = state.inbox.filter((item) => item.status === "awaitingDecision");
  const unread = state.inbox.filter(
    (item) => item.status === "unread" || item.status === "awaitingDecision",
  ).length;
  const recentResults = state.results.slice(-5).reverse();
  const weeklyNet = useMemo(() => weeklyNetRecurring(state), [state]);

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myIndex = leagueSorted.findIndex((row) => row.team === state.clubName);
  const miniLeague = leagueSorted.slice(
    Math.max(0, myIndex - 2),
    Math.min(leagueSorted.length, myIndex + 3),
  );
  const division = state.leagues.find((league) => league.id === state.playerLeagueId)?.name;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="panel-strip px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-black/20 font-display text-xl sm:size-16 sm:text-2xl">
                {initials(state.clubName)}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">
                  {division ?? "League football"}
                </p>
                <h2 className="truncate font-display text-2xl leading-none sm:text-4xl">
                  {state.clubName}
                </h2>
                <p className="mt-1 text-xs opacity-80">
                  Season {state.season} · Week {state.week}/{CALENDAR.seasonEnd} ·{" "}
                  {phaseLabel(state.week)}
                </p>
              </div>
            </div>
            <div className="hidden text-right sm:block">
              <div className="font-display text-3xl">{state.reputation}</div>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Reputation</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
          <HeadlineStat
            label="League position"
            value={myIndex >= 0 ? `${myIndex + 1}${ord(myIndex + 1)}` : "—"}
            sub={`of ${state.league.length}`}
            onClick={() => setTab("fixtures")}
          />
          <HeadlineStat
            label="Bank balance"
            value={fmtMoney(state.cash)}
            sub={`${fmtMoney(weeklyNet)} weekly net`}
            tone={state.cash >= 0 ? "good" : "bad"}
            onClick={() => setTab("cashflow")}
          />
          <HeadlineStat
            label="Board confidence"
            value={`${boardConfidence}%`}
            sub={boardConfidence >= 60 ? "On your side" : "Under scrutiny"}
            tone={boardConfidence >= 60 ? "good" : boardConfidence < 40 ? "bad" : undefined}
            onClick={() => setTab("board")}
          />
          <HeadlineStat
            label="Needs attention"
            value={decisions.length ? String(decisions.length) : "Clear"}
            sub={decisions.length ? "decisions waiting" : `${unread} unread messages`}
            tone={decisions.length ? "bad" : "good"}
            onClick={() => setTab("inbox")}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.85fr)]">
        <div className="space-y-4">
          <NextMatch
            state={state}
            fixture={nextFixture}
            matchReady={matchReady}
            onPlay={() => update((current) => startMatchDay(current))}
            onFixtures={() => setTab("fixtures")}
          />

          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <SectionHeading
              title="League picture"
              action="Full table"
              onClick={() => setTab("fixtures")}
            />
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Club</th>
                  <th className="px-2 py-2 text-right">P</th>
                  <th className="px-2 py-2 text-right">GD</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {miniLeague.map((row) => {
                  const position = leagueSorted.indexOf(row) + 1;
                  const isPlayer = row.team === state.clubName;
                  return (
                    <tr
                      key={row.team}
                      className={cn(
                        "border-b last:border-0",
                        isPlayer && "bg-primary/10 font-semibold",
                      )}
                    >
                      <td className="px-3 py-2.5 text-muted-foreground">{position}</td>
                      <td className="max-w-0 truncate px-2 py-2.5">{row.team}</td>
                      <td className="px-2 py-2.5 text-right">{row.p}</td>
                      <td className="px-2 py-2.5 text-right">{row.gf - row.ga}</td>
                      <td className="px-3 py-2.5 text-right font-display">{row.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <SectionHeading
              title="Chairman's desk"
              action={unread ? "Open inbox" : undefined}
              onClick={() => setTab("inbox")}
            />
            <div className="space-y-2 p-3">
              {decisions.length > 0 ? (
                decisions.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab("inbox")}
                    className="flex w-full items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-left transition-colors hover:bg-amber-500/15"
                  >
                    <Mail className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold">Decision required</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.subject}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              ) : (
                <div className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  No urgent decisions. The desk is clear.
                </div>
              )}
              <QuickLink
                icon={<Users className="size-4" />}
                label="Review the squad"
                detail={`${state.squad.length} registered players`}
                onClick={() => setTab("recruitment")}
              />
              <QuickLink
                icon={<CircleDollarSign className="size-4" />}
                label="Financial position"
                detail={`${health.label} · ${health.coverMonths.toFixed(1)} months cover`}
                onClick={() => setTab("cashflow")}
              />
              <QuickLink
                icon={<ShieldCheck className="size-4" />}
                label="Board objectives"
                detail={`${state.board.objectives?.length ?? 0} targets this season`}
                onClick={() => setTab("board")}
              />
            </div>
          </section>

          <RecentForm results={recentResults} onClick={() => setTab("fixtures")} />
        </aside>
      </div>
    </div>
  );
}

function HeadlineStat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
  onClick: () => void;
}) {
  return (
    <button className="p-3 text-left transition-colors hover:bg-muted/50 sm:p-4" onClick={onClick}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate font-display text-xl sm:text-2xl",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[10px] text-muted-foreground sm:text-xs">{sub}</div>
    </button>
  );
}

function NextMatch({
  state,
  fixture,
  matchReady,
  onPlay,
  onFixtures,
}: {
  state: GameState;
  fixture: GameState["fixtures"][number] | undefined;
  matchReady: boolean;
  onPlay: () => void;
  onFixtures: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <SectionHeading title="Next match" action="All fixtures" onClick={onFixtures} />
      {fixture ? (
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Team name={fixture.home ? state.clubName : fixture.opponent} player={fixture.home} />
            <div className="text-center">
              <div className="font-display text-2xl text-muted-foreground">VS</div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                Week {state.week}
              </div>
            </div>
            <Team name={fixture.home ? fixture.opponent : state.clubName} player={!fixture.home} />
          </div>
          {matchReady ? (
            <Button className="mt-5 w-full sm:mx-auto sm:flex sm:w-auto" onClick={onPlay}>
              <Play className="mr-2 size-4 fill-current" /> Start matchday
            </Button>
          ) : (
            <div className="mt-5 text-center text-xs font-medium text-primary">
              Use Continue above to reach matchday.
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
            <CalendarDays className="size-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">No match this week</div>
            <p className="text-xs text-muted-foreground">{breakMessage(state.week)}</p>
          </div>
          <div className="text-xs font-medium text-primary">
            Use Continue above to move time on.
          </div>
        </div>
      )}
    </section>
  );
}

function Team({ name, player }: { name: string; player: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <div
        className={cn(
          "grid size-14 place-items-center rounded-xl font-display text-xl sm:size-16",
          player ? "bg-panel text-panel-foreground" : "bg-muted",
        )}
      >
        {initials(name)}
      </div>
      <div className="max-w-full truncate text-sm font-semibold">{name}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {player ? "Your club" : "Opponent"}
      </div>
    </div>
  );
}

function RecentForm({ results, onClick }: { results: FixtureResult[]; onClick: () => void }) {
  const latest = results[0];
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <SectionHeading title="Recent form" action="Results" onClick={onClick} />
      <div className="p-4">
        {latest ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{latest.opponent}</div>
                <div className="text-xs text-muted-foreground">
                  {latest.home ? "Home" : "Away"} · Week {latest.week}
                </div>
              </div>
              <div className="font-display text-2xl">
                {latest.goalsFor}–{latest.goalsAgainst}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {results.map((result, index) => (
                <span
                  key={`${result.week}-${index}`}
                  className={cn(
                    "grid size-8 place-items-center rounded-full text-xs font-bold text-white",
                    result.result === "W"
                      ? "bg-emerald-500"
                      : result.result === "D"
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                >
                  {result.result}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your season has not produced a result yet.
          </p>
        )}
      </div>
    </section>
  );
}

function QuickLink({
  icon,
  label,
  detail,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-muted"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function SectionHeading({
  title,
  action,
  onClick,
}: {
  title: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="banner-strip flex items-center justify-between px-3 py-2 text-xs">
      <span>{title}</span>
      {action && (
        <button
          className="inline-flex items-center gap-1 opacity-80 hover:opacity-100"
          onClick={onClick}
        >
          {action} <ArrowRight className="size-3" />
        </button>
      )}
    </div>
  );
}

function phaseLabel(week: number) {
  const phase = phaseOf(week);
  return phase === "preseason"
    ? "Pre-season"
    : phase === "midseason"
      ? "Mid-season break"
      : phase === "firstHalf"
        ? "First half"
        : "Second half";
}

function breakMessage(week: number) {
  const phase = phaseOf(week);
  if (phase === "preseason") return `League football begins in week ${CALENDAR.firstHalfStart}.`;
  if (phase === "midseason") return `League football resumes in week ${CALENDAR.secondHalfStart}.`;
  return "Use the week to review the squad and club finances.";
}
