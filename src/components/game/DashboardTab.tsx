import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact, hiredStaffWagesWeekly } from "@/lib/game/engine";
import { canonicalPlayerWagesWeekly, clubKpi } from "@/lib/game/selectors/club";
import { commitmentProgress, sustainabilitySnapshot } from "@/lib/game/sustainability";
import { WEEKS_PER_SEASON } from "@/lib/game/time";
import { HEALTH_TONE, Meter, Row, ord, sum } from "./shared/primitives";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { medicalSupport, playerFitness, playerIsAvailable, squadAverageFitness } from "@/lib/game/playerHealth";
import { userSquad } from "@/lib/game/recruitment";
import { inFormPlayers } from "@/lib/game/playerForm";

/** Charts need a few points before they say anything; until then, a summary reads better. */
const MIN_CHART_WEEKS = 3;

const TOOLTIP_STYLE = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 11,
  padding: "4px 8px",
} as const;

const signed = (value: number) => `${value >= 0 ? "+" : "−"}${fmtMoney(Math.abs(value))}`;

export function DashboardTab({ state }: { state: GameState }) {
  const last12 = state.ledger.slice(-12);
  const chartData = last12.map((l) => ({
    w: `W${l.week}`,
    balance: l.balance,
    net: l.net,
  }));

  const lastLedger = state.ledger[state.ledger.length - 1];
  const squad = userSquad(state);
  const medical = medicalSupport(state);
  const avgFitness = squadAverageFitness(state);
  const injured = squad.filter((player) => Boolean(player.injury));
  const formLeaders = inFormPlayers(state, 3);
  const unavailable = squad.filter((player) => !playerIsAvailable(player, state));
  const tired = squad.filter((player) => playerIsAvailable(player, state) && playerFitness(player) < 72);
  const lastResult = state.results[state.results.length - 1];

  const seasonTotals = state.ledger.reduce(
    (acc, l) => {
      acc.income += Object.values(l.income).reduce((a, b) => a + b, 0);
      acc.expenses += Object.values(l.expenses).reduce((a, b) => a + b, 0);
      return acc;
    },
    { income: 0, expenses: 0 },
  );
  const seasonNet = seasonTotals.income - seasonTotals.expenses;

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myPos = leagueSorted.findIndex((r) => isUserClubReference(state, r.team)) + 1;

  // Scale the balance chart to its own range so real movement is visible.
  const balanceDomain = useMemo(() => {
    if (!chartData.length) return [0, 1] as [number, number];
    const values = chartData.map((d) => d.balance);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(1_000, (hi - lo) * 0.15);
    return [Math.floor((lo - pad) / 1_000) * 1_000, Math.ceil((hi + pad) / 1_000) * 1_000] as [number, number];
  }, [chartData]);

  const showCharts = chartData.length >= MIN_CHART_WEEKS;
  const weekIncome = lastLedger ? sum(lastLedger.income) : 0;
  const weekExpenses = lastLedger ? sum(lastLedger.expenses) : 0;

  return (
    <div className="lf-reports grid gap-2 lg:grid-cols-2 lg:gap-3">
      <div className="space-y-2 lg:space-y-3">
        {/* Season at a glance */}
        <section className="grid grid-cols-4 divide-x overflow-hidden rounded-xl border bg-card text-center shadow-sm">
          <Figure label="Income" value={fmtMoney(seasonTotals.income)} tone="good" />
          <Figure label="Expenses" value={fmtMoney(seasonTotals.expenses)} tone="bad" />
          <Figure label="Season net" value={signed(seasonNet)} tone={seasonNet >= 0 ? "good" : "bad"} />
          <Figure label={`of ${state.league.length}`} value={myPos ? `${myPos}${ord(myPos)}` : "—"} />
        </section>

        {/* Money */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <CardTitle title="Money" aside={lastLedger ? `Week ${lastLedger.week}` : undefined} />
          <div className="px-3 pb-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground">In the bank</div>
                <div className={cn("font-display text-2xl leading-tight tnum", state.cash < 0 && "text-[color:var(--color-expense)]")}>
                  {fmtMoneyExact(state.cash)}
                </div>
              </div>
              {lastLedger && (
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">This week</div>
                  <div className={cn("font-display text-lg leading-tight tnum", lastLedger.net >= 0 ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]")}>
                    {signed(lastLedger.net)}
                  </div>
                  <div className="text-[10px] text-muted-foreground tnum">
                    in {fmtMoney(weekIncome)} · out {fmtMoney(weekExpenses)}
                  </div>
                </div>
              )}
            </div>
            {lastLedger?.matchdayNote && (
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{lastLedger.matchdayNote}</p>
            )}

            {showCharts ? (
              <>
                <div className="mt-2 h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="lf-balance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="w" hide />
                      <YAxis
                        domain={balanceDomain}
                        tick={{ fontSize: 9 }}
                        stroke="var(--color-muted-foreground)"
                        tickFormatter={(v) => fmtMoney(v as number)}
                        width={44}
                        tickCount={3}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtMoneyExact(v), "Balance"]} />
                      <Area type="monotone" dataKey="balance" stroke="var(--color-primary)" fill="url(#lf-balance)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                      <XAxis dataKey="w" tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)" axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis width={44} tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => fmtMoney(v as number)} tickCount={3} axisLine={false} tickLine={false} />
                      <ReferenceLine y={0} stroke="var(--color-border)" />
                      <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [signed(v), "Week net"]} />
                      <Bar dataKey="net" radius={[2, 2, 0, 0]}>
                        {chartData.map((d) => (
                          <Cell key={d.w} fill={d.net >= 0 ? "var(--color-income)" : "var(--color-expense)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between text-[9px] uppercase tracking-wider text-muted-foreground">
                  <span>Balance · last {chartData.length} weeks</span>
                  <span>Weekly net</span>
                </div>
              </>
            ) : (
              <p className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                Balance and weekly trend charts appear after week {MIN_CHART_WEEKS}.
              </p>
            )}
          </div>
        </section>

        <details className="lf-reports-costs overflow-hidden rounded-xl border bg-card shadow-sm">
          <summary className="flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weekly running costs</span>
            <RecurringNet state={state} />
          </summary>
          <div className="border-t px-3 pb-1">
            <RecurringBreakdown state={state} />
          </div>
        </details>
      </div>

      <div className="space-y-2 lg:space-y-3">
        {/* Last match */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <CardTitle title="Last match" />
          {lastResult ? (
            <div className="px-3 pb-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate font-display text-lg leading-tight">
                  {lastResult.home ? "H" : "A"} vs {clubDisplayName(state, lastResult.opponent)}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-2 py-0.5 text-xs font-bold tnum",
                    lastResult.result === "W" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                    lastResult.result === "D" && "bg-muted text-muted-foreground",
                    lastResult.result === "L" && "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {lastResult.result} {lastResult.goalsFor}-{lastResult.goalsAgainst}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-4 divide-x rounded-lg bg-muted/40 text-center">
                <Mini label="Crowd" value={lastResult.home ? lastResult.attendance.toLocaleString() : "Away"} />
                <Mini label="Gate" value={lastResult.home ? fmtMoney(lastResult.gateReceipts) : "—"} tone={lastResult.home ? "good" : undefined} />
                <Mini label="TV" value={fmtMoney(lastResult.tvIncome)} tone="good" />
                <Mini label="Fans" value={`${state.fanHappiness}%`} />
              </div>
            </div>
          ) : (
            <p className="px-3 pb-2.5 text-xs text-muted-foreground">No matches yet. Continue to play your opener.</p>
          )}
        </section>

        {/* Squad health */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <CardTitle title="Squad health" aside={`${medical.label} medical · ${medical.score}/100`} />
          <div className="px-3 pb-2.5">
            <div className="grid grid-cols-3 divide-x rounded-lg bg-muted/40 text-center">
              <Mini label="Fitness" value={`${avgFitness}%`} tone={avgFitness >= 80 ? "good" : avgFitness >= 68 ? undefined : "bad"} />
              <Mini label="Unavailable" value={String(unavailable.length)} tone={unavailable.length === 0 ? "good" : "bad"} />
              <Mini label="Tired" value={String(tired.length)} tone={tired.length === 0 ? "good" : undefined} />
            </div>
            {injured.length > 0 && (
              <div className="mt-2">
                <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Injured</div>
                {injured.slice(0, 4).map((player) => (
                  <div key={player.id} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                    <span className="truncate font-semibold">{player.firstName} {player.lastName}</span>
                    <span className="shrink-0 text-muted-foreground">{player.injury?.type}</span>
                  </div>
                ))}
              </div>
            )}
            {formLeaders.length > 0 && (
              <div className="mt-2">
                <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">In form</div>
                {formLeaders.map((form) => {
                  const player = squad.find((candidate) => candidate.id === form.playerId);
                  return (
                    <div key={form.playerId} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
                      <span className="truncate font-semibold">{player ? `${player.firstName} ${player.lastName}` : form.playerId}</span>
                      <span className="shrink-0 text-muted-foreground tnum">{form.band} · {form.averageRating.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              Recovery +{medical.recoveryPerWeek}/wk · injury risk {medical.injuryRiskMultiplier.toFixed(2)}×
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CardTitle({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 pb-1 pt-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
      {aside && <span className="truncate text-[10px] text-muted-foreground">{aside}</span>}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 px-1 py-1.5">
      <div
        className={cn(
          "truncate font-display text-base leading-tight tnum",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 px-1 py-1.5">
      <div
        className={cn(
          "truncate font-display text-sm leading-tight tnum",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
        )}
      >
        {value}
      </div>
      <div className="truncate text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

/** Net of the recurring breakdown, for the collapsed summary line. */
function RecurringNet({ state }: { state: GameState }) {
  const net = clubKpi(state).weeklyIncome - clubKpi(state).weeklyExpenses;
  return (
    <span className={cn("text-xs font-semibold tnum", net >= 0 ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]")}>
      {signed(net)}/wk before matchday
    </span>
  );
}

export function RecurringBreakdown({ state }: { state: GameState }) {
  const canonical = clubKpi(state);
  const playerWages = canonicalPlayerWagesWeekly(state);
  const hiredStaffWages = hiredStaffWagesWeekly(state);
  const rows = [
    { label: "Recurring income", v: canonical.weeklyIncome, tone: "good" as const },
    { label: "Player wages", v: -playerWages, tone: "bad" as const },
    { label: "Admin staff wages", v: -state.staffWagesWeekly, tone: "bad" as const },
    { label: "Hired staff wages", v: -hiredStaffWages, tone: "bad" as const },
    { label: "Stadium utilities", v: -state.utilitiesWeekly, tone: "bad" as const },
    { label: "Training ops", v: -state.trainingWeeklyCost, tone: "bad" as const },
    { label: "Maintenance", v: -state.maintenanceWeekly, tone: "bad" as const },
    {
      label: "Club administration",
      v:
        -canonical.weeklyExpenses +
        playerWages +
        state.staffWagesWeekly +
        hiredStaffWages +
        state.utilitiesWeekly +
        state.trainingWeeklyCost +
        state.maintenanceWeekly,
      tone: "bad" as const,
    },
  ];
  const net = rows.reduce((a, r) => a + r.v, 0);
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span
            className={cn(
              "tnum",
              r.v > 0 && "text-[color:var(--color-income)]",
              r.v < 0 && "text-[color:var(--color-expense)]",
            )}
          >
            {fmtMoneyExact(r.v)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2 font-semibold text-sm">
        <span>Net (before matchday)</span>
        <span
          className={cn(
            "tnum",
            net >= 0 ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]",
          )}
        >
          {fmtMoneyExact(net)}
        </span>
      </div>
    </div>
  );
}

export function FinancialHealthPanel({ state }: { state: GameState }) {
  const snap = useMemo(() => sustainabilitySnapshot(state), [state]);
  const { health, reserve, pressure, needs, capacity, openCommitments: commitments } = snap;
  const reservePct = reserve.recommended > 0 ? (reserve.cash / reserve.recommended) * 100 : 100;

  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden md:col-span-2">
      <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
        <span>Financial health</span>
        <span className="opacity-80 capitalize">{health.trajectory}</span>
      </div>
      <div className="p-4 grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <div className={cn("text-2xl font-display leading-none", HEALTH_TONE[health.state])}>
            {health.label}
          </div>
          <p className="text-xs text-muted-foreground">{health.summary}</p>
          <div className="text-xs space-y-1 pt-1">
            <Row k="Cash" v={fmtMoneyExact(reserve.cash)} />
            <Row k="Recommended reserve" v={fmtMoneyExact(reserve.recommended)} />
            <Row
              k={reserve.excess > 0 ? "Above reserve" : "Short of reserve"}
              v={fmtMoneyExact(reserve.excess > 0 ? reserve.excess : reserve.deficit)}
            />
            <Row k="Operating cover" v={`${health.coverMonths.toFixed(1)} months`} />
            <Row k="Wage to revenue" v={`${health.wageRatio}%`} />
          </div>
          <Meter
            value={reservePct}
            tone={
              reservePct >= 100
                ? "bg-emerald-500"
                : reservePct >= 60
                  ? "bg-amber-500"
                  : "bg-rose-500"
            }
          />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold">Reinvestment pressure</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-display tabular-nums">{pressure.score}</span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <Meter
            value={pressure.score}
            tone={
              pressure.score >= 70
                ? "bg-rose-500"
                : pressure.score >= 40
                  ? "bg-amber-500"
                  : "bg-teal-500"
            }
          />
          <p className="text-xs text-muted-foreground">{pressure.headline}</p>
          <div className="text-[11px] space-y-1 pt-1">
            {(
              [
                ["Infrastructure", needs.infrastructure, pressure.byArea.infrastructure],
                ["Squad", needs.squad, pressure.byArea.squad],
                ["Supporters", needs.supporters, pressure.byArea.supporters],
                ["Commercial", needs.commercial, pressure.byArea.commercial],
              ] as const
            ).map(([label_, need, score]) => (
              <div key={label_} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-muted-foreground">{label_}</span>
                <div className="flex-1">
                  <Meter value={score} tone={score >= 60 ? "bg-orange-500" : "bg-primary/60"} />
                </div>
                <span className="w-8 text-right tabular-nums">{Math.round(need * 100)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold">Commitments to the board</div>
          {commitments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No promises outstanding. Anything you agree to in the inbox is tracked here and judged
              on real spending, not intentions.
            </p>
          ) : (
            commitments.map((c) => {
              const pct = Math.round(commitmentProgress(state, c) * 100);
              return (
                <div key={c.id} className="text-[11px] space-y-1 border-b last:border-0 pb-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">{c.category}</span>
                    <span className="text-muted-foreground">
                      due week {c.deadlineAbsoluteWeek % WEEKS_PER_SEASON || WEEKS_PER_SEASON}
                    </span>
                  </div>
                  <Meter value={pct} tone={pct >= 100 ? "bg-emerald-500" : "bg-amber-500"} />
                  <div className="text-muted-foreground">
                    {c.targetInvestment > 0
                      ? `${fmtMoneyExact(Math.round(commitmentProgress(state, c) * c.targetInvestment))} of ${fmtMoneyExact(c.targetInvestment)}`
                      : c.description}
                  </div>
                </div>
              );
            })
          )}
          <div className="text-[11px] text-muted-foreground pt-1 space-y-1">
            <Row k="Committed wages" v={fmtMoneyExact(snap.committedWages)} />
            <Row k="Capital committed" v={fmtMoneyExact(snap.capitalCommitments)} />
            <Row k="Ground utilisation" v={`${Math.round(capacity.occupancy * 100)}%`} />
          </div>
        </div>
      </div>
    </section>
  );
}
