import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { HEALTH_TONE, Meter, Row, Section, Stat, ord, sum } from "./shared/primitives";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { medicalSupport, playerFitness, playerIsAvailable, squadAverageFitness } from "@/lib/game/playerHealth";
import { userSquad } from "@/lib/game/recruitment";

export function DashboardTab({ state }: { state: GameState }) {
  const last12 = state.ledger.slice(-12);
  const chartData = last12.map((l) => ({
    w: `W${l.week}`,
    balance: l.balance,
    income: Object.values(l.income).reduce((a, b) => a + b, 0),
    expenses: -Object.values(l.expenses).reduce((a, b) => a + b, 0),
    net: l.net,
  }));

  const lastLedger = state.ledger[state.ledger.length - 1];
  const squad = userSquad(state);
  const medical = medicalSupport(state);
  const avgFitness = squadAverageFitness(state);
  const injured = squad.filter((player) => Boolean(player.injury));
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

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myPos = leagueSorted.findIndex((r) => isUserClubReference(state, r.team)) + 1;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Section title="Season snapshot">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Season income" value={fmtMoney(seasonTotals.income)} tone="good" />
            <Stat label="Season expenses" value={fmtMoney(seasonTotals.expenses)} tone="bad" />
            <Stat
              label="Season net"
              value={fmtMoney(seasonTotals.income - seasonTotals.expenses)}
              tone={seasonTotals.income - seasonTotals.expenses >= 0 ? "good" : "bad"}
            />
            <Stat
              label="League position"
              value={myPos ? `${myPos}${ord(myPos)}` : "—"}
              sub={`of ${state.league.length}`}
            />
          </div>
        </Section>

        <Section title="Bank balance — last 12 weeks">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => fmtMoney(v as number)}
                  width={60}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoneyExact(v)}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--color-primary)"
                  fill="url(#bal)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Weekly cash flow">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => fmtMoney(v as number)}
                  width={60}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoneyExact(v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" stackId="s" fill="var(--color-income)" />
                <Bar dataKey="expenses" name="Expenses" stackId="s" fill="var(--color-expense)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Last match">
          {lastResult ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg">
                  {lastResult.home ? "H" : "A"} vs {clubDisplayName(state, lastResult.opponent)}
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    lastResult.result === "W" &&
                      "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                    lastResult.result === "D" && "bg-muted text-muted-foreground",
                    lastResult.result === "L" && "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {lastResult.result} {lastResult.goalsFor}-{lastResult.goalsAgainst}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm tnum">
                <div>
                  <dt className="text-muted-foreground text-xs">Attendance</dt>
                  <dd>{lastResult.attendance.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Gate receipts</dt>
                  <dd className="text-[color:var(--color-income)]">
                    {fmtMoneyExact(lastResult.gateReceipts)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">TV income</dt>
                  <dd className="text-[color:var(--color-income)]">
                    {fmtMoneyExact(lastResult.tvIncome)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Fan happiness</dt>
                  <dd>{state.fanHappiness}%</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No matches yet. Advance a week to play your opener.
            </div>
          )}
        </Section>

        <Section title="Squad health">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Average fitness" value={`${avgFitness}%`} tone={avgFitness >= 80 ? "good" : avgFitness >= 68 ? undefined : "bad"} />
            <Stat label="Medical support" value={medical.label} sub={`${medical.score}/100`} />
            <Stat label="Unavailable" value={String(unavailable.length)} tone={unavailable.length === 0 ? "good" : "bad"} />
            <Stat label="Tired players" value={String(tired.length)} tone={tired.length === 0 ? "good" : undefined} />
          </div>
          {injured.length > 0 && (
            <div className="mt-3 divide-y rounded-lg border">
              {injured.slice(0, 4).map((player) => (
                <div key={player.id} className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs">
                  <span className="truncate font-semibold">{player.firstName} {player.lastName}</span>
                  <span className="shrink-0 text-muted-foreground">{player.injury?.type}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground">
            Weekly recovery +{medical.recoveryPerWeek} · injury-risk factor {medical.injuryRiskMultiplier.toFixed(2)}×
          </div>
        </Section>

        <Section title="This week (recurring)">
          <RecurringBreakdown state={state} />
        </Section>

        {lastLedger && (
          <Section title={`Week ${lastLedger.week} totals`}>
            <div className="text-xs text-muted-foreground mb-2">
              {lastLedger.matchdayNote ?? "No match this week."}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Income" value={fmtMoney(sum(lastLedger.income))} tone="good" />
              <Stat label="Expenses" value={fmtMoney(sum(lastLedger.expenses))} tone="bad" />
              <Stat
                label="Net"
                value={fmtMoney(lastLedger.net)}
                tone={lastLedger.net >= 0 ? "good" : "bad"}
              />
              <Stat label="Balance after" value={fmtMoneyExact(lastLedger.balance)} />
            </div>
          </Section>
        )}
      </div>
    </div>
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
            <Row k="Ground utilisation" v={`${capacity.occupancy}%`} />
          </div>
        </div>
      </div>
    </section>
  );
}
