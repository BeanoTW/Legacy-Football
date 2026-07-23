import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronsRight,
  CircleDollarSign,
  LineChart as LineIcon,
  Play,
  RotateCcw,
  Save,
  Ticket,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { useGame } from "@/hooks/useGame";
import type { GameState, Stand, Staff, StaffRole } from "@/lib/game/types";
import {
  avgTicketPrice,
  fmtMoney,
  fmtMoneyExact,
  hiredStaffWagesWeekly,
  playerWagesWeekly,
  squadRating,
  totalCapacity,
  totalWeeklyExpenses,
  weeklySponsorIncome,
} from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chairman FC — Football Finance Sim" },
      {
        name: "description",
        content:
          "Run the books of a football club: set ticket prices, manage wages, upgrade facilities and watch every pound flow through the season.",
      },
      { property: "og:title", content: "Chairman FC — Football Finance Sim" },
      {
        property: "og:description",
        content:
          "A finance-first football chairman game. Cash flow, P&L, ticket demand — every decision hits the books.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Tab =
  | "dashboard"
  | "cashflow"
  | "tickets"
  | "squad"
  | "staff"
  | "stadium"
  | "fixtures"
  | "history";

function Page() {
  const { state, hydrated, start, advance, update, reset } = useGame();

  if (!hydrated) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!state) return <NewGame onStart={start} />;
  return <Game state={state} advance={advance} update={update} reset={reset} />;
}

/* =========================================================================
   NEW GAME
   ========================================================================= */
function NewGame({ onStart }: { onStart: (club: string, manager: string) => void }) {
  const [club, setClub] = useState("Dalton Town");
  const [manager, setManager] = useState("N. Cahill");
  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Chairman FC" subtitle="A football finance simulator" />
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm">New Club Setup</div>
          <div className="p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              You take over a mid-table club with £2.5M in the bank. Set ticket prices,
              control the wage bill, invest in the ground and try to survive the season
              in the black.
            </p>
            <div className="space-y-2">
              <Label htmlFor="club">Club name</Label>
              <Input id="club" value={club} onChange={(e) => setClub(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr">Chairman name</Label>
              <Input id="mgr" value={manager} onChange={(e) => setManager(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={!club.trim()}
              onClick={() => onStart(club.trim(), manager.trim() || "Chairman")}
            >
              <Play className="mr-2 size-4" /> Start Season
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   MAIN GAME SHELL
   ========================================================================= */
function Game({
  state,
  advance,
  update,
  reset,
}: {
  state: GameState;
  advance: (w?: number) => void;
  update: (fn: (s: GameState) => GameState) => void;
  reset: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");

  const kpi = useMemo(() => {
    const wIncome = weeklySponsorIncome(state); // recurring
    const wExpenses = totalWeeklyExpenses(state);
    return {
      cash: state.cash,
      weeklyIncome: wIncome,
      weeklyExpenses: wExpenses,
      weeklyNetRecurring: wIncome - wExpenses,
      wageBill: playerWagesWeekly(state),
      capacity: totalCapacity(state),
      avgTicket: avgTicketPrice(state),
      rating: squadRating(state),
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={state.clubName}
        subtitle={`${state.managerName} · Season ${state.season} · Week ${state.week}/38`}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => advance(1)}>
              <ChevronsRight className="size-4 mr-1" /> Advance week
            </Button>
            <Button size="sm" onClick={() => advance(4)}>
              Advance 4
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="border-b bg-panel text-panel-foreground">
        <div className="mx-auto max-w-6xl px-3 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 tnum">
          <Kpi
            icon={<Wallet className="size-4" />}
            label="Bank balance"
            value={fmtMoneyExact(kpi.cash)}
            tone={kpi.cash >= 0 ? "good" : "bad"}
          />
          <Kpi
            icon={<CircleDollarSign className="size-4" />}
            label="Weekly net (fixed)"
            value={fmtMoney(kpi.weeklyNetRecurring)}
            tone={kpi.weeklyNetRecurring >= 0 ? "good" : "bad"}
          />
          <Kpi
            icon={<Users className="size-4" />}
            label="Squad rating"
            value={kpi.rating.toFixed(1)}
          />
          <Kpi
            icon={<Ticket className="size-4" />}
            label="Avg ticket"
            value={`£${kpi.avgTicket.toFixed(2)}`}
          />
        </div>
      </div>

      {/* Tabs */}
      <nav className="border-b bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-2 overflow-x-auto">
          <ul className="flex gap-1 text-sm">
            {(
              [
                ["dashboard", "Overview", LineIcon],
                ["cashflow", "Cash flow", CircleDollarSign],
                ["tickets", "Tickets", Ticket],
                ["squad", "Squad & wages", Users],
                ["staff", "Staff", Briefcase],
                ["stadium", "Stadium", Building2],
                ["fixtures", "Fixtures", Calendar],
                ["history", "Ledger", Save],
              ] as [Tab, string, typeof LineIcon][]
            ).map(([id, label, Icon]) => (
              <li key={id}>
                <button
                  onClick={() => setTab(id)}
                  className={cn(
                    "px-3 py-3 flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap transition-colors",
                    tab === id
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-3 py-5">
        {tab === "dashboard" && <Dashboard state={state} />}
        {tab === "cashflow" && <CashFlow state={state} />}
        {tab === "tickets" && <Tickets state={state} update={update} />}
        {tab === "squad" && <Squad state={state} />}
        {tab === "staff" && <StaffTab state={state} update={update} />}
        {tab === "stadium" && <StadiumTab state={state} update={update} />}
        {tab === "fixtures" && <Fixtures state={state} />}
        {tab === "history" && <History state={state} />}
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-3 py-4 flex flex-wrap gap-2 items-center justify-between text-sm text-muted-foreground">
          <span>Autosaved to this device.</span>
          <Button variant="ghost" size="sm" onClick={() => {
            if (confirm("Reset game and lose all progress?")) reset();
          }}>
            <RotateCcw className="size-4 mr-1" /> Reset game
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================================
   UI HELPERS
   ========================================================================= */
function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="panel-strip">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <Trophy className="size-6 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl leading-none truncate">{title}</h1>
          {subtitle && (
            <div className="text-xs opacity-80 mt-0.5 truncate">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-black/10 px-3 py-2">
      <div className="opacity-80">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
        <div
          className={cn(
            "font-display text-lg leading-tight",
            tone === "good" && "text-emerald-300",
            tone === "bad" && "text-rose-300",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden mb-4">
      <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
        <span>{title}</span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-display text-2xl tnum leading-tight",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
function Dashboard({ state }: { state: GameState }) {
  const last12 = state.ledger.slice(-12);
  const chartData = last12.map((l) => ({
    w: `W${l.week}`,
    balance: l.balance,
    income: Object.values(l.income).reduce((a, b) => a + b, 0),
    expenses: -Object.values(l.expenses).reduce((a, b) => a + b, 0),
    net: l.net,
  }));

  const lastLedger = state.ledger[state.ledger.length - 1];
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
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myPos = leagueSorted.findIndex((r) => r.team === state.clubName) + 1;

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
                  {lastResult.home ? "H" : "A"} vs {lastResult.opponent}
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    lastResult.result === "W" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
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

        <Section title="This week (recurring)">
          <RecurringBreakdown state={state} />
        </Section>

        {lastLedger && (
          <Section title={`Week ${lastLedger.week} totals`}>
            <div className="text-xs text-muted-foreground mb-2">
              {lastLedger.matchdayNote ?? "No match this week."}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Income"
                value={fmtMoney(sum(lastLedger.income))}
                tone="good"
              />
              <Stat
                label="Expenses"
                value={fmtMoney(sum(lastLedger.expenses))}
                tone="bad"
              />
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

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function RecurringBreakdown({ state }: { state: GameState }) {
  const rows = [
    { label: "Sponsors (weekly)", v: weeklySponsorIncome(state), tone: "good" as const },
    { label: "Player wages", v: -playerWagesWeekly(state), tone: "bad" as const },
    { label: "Admin staff wages", v: -state.staffWagesWeekly, tone: "bad" as const },
    { label: "Hired staff wages", v: -hiredStaffWagesWeekly(state), tone: "bad" as const },
    { label: "Stadium utilities", v: -state.utilitiesWeekly, tone: "bad" as const },
    { label: "Training ops", v: -state.trainingWeeklyCost, tone: "bad" as const },
    { label: "Maintenance", v: -state.maintenanceWeekly, tone: "bad" as const },
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

/* =========================================================================
   CASH FLOW
   ========================================================================= */
function CashFlow({ state }: { state: GameState }) {
  const totals = useMemo(() => {
    const inc = { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 };
    const exp = {
      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
      maintenance: 0, matchday: 0, transfers: 0, other: 0,
    };
    for (const l of state.ledger) {
      (Object.keys(inc) as (keyof typeof inc)[]).forEach((k) => (inc[k] += l.income[k]));
      (Object.keys(exp) as (keyof typeof exp)[]).forEach((k) => (exp[k] += l.expenses[k]));
    }
    return { inc, exp };
  }, [state.ledger]);

  const incomePie = Object.entries(totals.inc)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: label(k), value: v }));
  const expensePie = Object.entries(totals.exp)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: label(k), value: v }));

  const CHART_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-primary)",
    "var(--color-accent)",
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Season income">
        <PieBlock data={incomePie} colors={CHART_COLORS} />
        <BreakdownTable totals={totals.inc} tone="income" />
      </Section>
      <Section title="Season expenses">
        <PieBlock data={expensePie} colors={CHART_COLORS} />
        <BreakdownTable totals={totals.exp} tone="expense" />
      </Section>
    </div>
  );
}

function label(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function PieBlock({
  data,
  colors,
}: {
  data: { name: string; value: number }[];
  colors: string[];
}) {
  if (data.length === 0) {
    return (
      <div className="h-48 grid place-items-center text-sm text-muted-foreground">
        No data yet — advance a week.
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
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
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownTable({
  totals,
  tone,
}: {
  totals: Record<string, number>;
  tone: "income" | "expense";
}) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <div className="mt-3 divide-y text-sm">
      {Object.entries(totals).map(([k, v]) => (
        <div key={k} className="flex justify-between py-1.5">
          <span className="text-muted-foreground">{label(k)}</span>
          <span
            className={cn(
              "tnum",
              tone === "income" ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]",
            )}
          >
            {fmtMoneyExact(v)}
          </span>
        </div>
      ))}
      <div className="flex justify-between py-2 font-semibold">
        <span>Total</span>
        <span className="tnum">{fmtMoneyExact(total)}</span>
      </div>
    </div>
  );
}

/* =========================================================================
   TICKETS
   ========================================================================= */
function Tickets({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const setPrice = (key: Stand["key"], price: number) =>
    update((s) => ({
      ...s,
      stands: s.stands.map((st) =>
        st.key === key ? { ...st, ticketPrice: Math.max(5, Math.min(120, price)) } : st,
      ),
    }));

  const refPrice = 15 + state.reputation * 0.4;
  // Simple demand estimate for each stand
  const rows = state.stands.map((st) => {
    const priceFactor = Math.max(
      0.15,
      1 - Math.pow(Math.max(0, st.ticketPrice - refPrice) / refPrice, 1.4),
    );
    const happiness = 0.55 + state.fanHappiness / 200;
    const estAtt = Math.round(st.capacity * priceFactor * happiness);
    const revenue = estAtt * st.ticketPrice;
    return { st, estAtt, revenue, priceFactor };
  });
  const totalEstAtt = rows.reduce((a, r) => a + r.estAtt, 0);
  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);

  return (
    <div className="space-y-4">
      <Section title="Ticket pricing model">
        <p className="text-xs text-muted-foreground mb-3">
          Fans compare your prices against a market reference of{" "}
          <strong>£{refPrice.toFixed(2)}</strong> (driven by club reputation of{" "}
          {state.reputation.toFixed(0)}). Push prices too far above that and demand collapses.
          Fan happiness ({state.fanHappiness}%) also nudges attendance.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ st, estAtt, revenue, priceFactor }) => (
            <div key={st.key} className="rounded-lg border bg-background/40 p-3">
              <div className="flex items-baseline justify-between">
                <div className="font-display text-lg">{st.name}</div>
                <div className="text-xs text-muted-foreground tnum">
                  Cap {st.capacity.toLocaleString()}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="font-display text-3xl tnum">£{st.ticketPrice}</div>
                <div className="text-xs text-muted-foreground">
                  demand{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      priceFactor > 0.75 && "text-[color:var(--color-income)]",
                      priceFactor > 0.4 && priceFactor <= 0.75 && "text-amber-600",
                      priceFactor <= 0.4 && "text-[color:var(--color-expense)]",
                    )}
                  >
                    {(priceFactor * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <Slider
                className="mt-3"
                min={5}
                max={80}
                step={1}
                value={[st.ticketPrice]}
                onValueChange={([v]) => setPrice(st.key, v)}
              />
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm tnum">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Est. attendance</div>
                  <div>{estAtt.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Est. gate</div>
                  <div className="text-[color:var(--color-income)]">{fmtMoneyExact(revenue)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border bg-secondary p-3 grid grid-cols-3 gap-2 text-sm tnum">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Total capacity</div>
            <div className="font-display text-lg">{totalCapacity(state).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Est. next home att.</div>
            <div className="font-display text-lg">{totalEstAtt.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Est. next home gate</div>
            <div className="font-display text-lg text-[color:var(--color-income)]">
              {fmtMoney(totalRev)}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   SQUAD
   ========================================================================= */
function Squad({ state }: { state: GameState }) {
  const totalWage = playerWagesWeekly(state);
  const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
  for (const p of state.squad) byPos[p.position] += p.wage;

  const wageBars = Object.entries(byPos).map(([k, v]) => ({ pos: k, wage: v }));

  return (
    <div className="space-y-4">
      <Section title="Wage bill">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Weekly wage bill" value={fmtMoneyExact(totalWage)} tone="bad" />
          <Stat label="Annualised" value={fmtMoney(totalWage * 52)} tone="bad" />
          <Stat
            label="Wages / recurring income"
            value={`${((totalWage / Math.max(1, weeklySponsorIncome(state))) * 100).toFixed(0)}%`}
            sub="vs sponsors alone"
          />
        </div>
        <div className="h-40 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={wageBars} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtMoney(v as number)}
                stroke="var(--color-muted-foreground)"
                tick={{ fontSize: 11 }}
              />
              <YAxis dataKey="pos" type="category" stroke="var(--color-muted-foreground)" tick={{ fontSize: 11 }} />
              <RTooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtMoneyExact(v)}
              />
              <Bar dataKey="wage" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title={`Squad · ${state.squad.length} players`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Name</th>
                <th className="text-left py-2 pr-3">Pos</th>
                <th className="text-right py-2 pr-3">Age</th>
                <th className="text-right py-2 pr-3">Rat</th>
                <th className="text-right py-2 pr-3">Wage/wk</th>
                <th className="text-right py-2 pr-3">Value</th>
                <th className="text-right py-2">Contract</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[...state.squad]
                .sort((a, b) => b.rating - a.rating)
                .map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="py-1.5 pr-3">{p.name}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold",
                          p.position === "GK" && "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                          p.position === "DEF" && "bg-sky-500/20 text-sky-700 dark:text-sky-300",
                          p.position === "MID" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                          p.position === "FWD" && "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {p.position}
                      </span>
                    </td>
                    <td className="text-right py-1.5 pr-3">{p.age}</td>
                    <td className="text-right py-1.5 pr-3 font-semibold">{p.rating}</td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                      {fmtMoneyExact(p.wage)}
                    </td>
                    <td className="text-right py-1.5 pr-3">{fmtMoney(p.value)}</td>
                    <td className="text-right py-1.5 text-xs text-muted-foreground">
                      {p.contractWeeks < 8 ? (
                        <span className="text-[color:var(--color-expense)] font-semibold">
                          {p.contractWeeks}w left
                        </span>
                      ) : (
                        `${p.contractWeeks}w`
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   STADIUM
   ========================================================================= */
function StadiumTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const expandStand = (key: Stand["key"], addSeats: number) => {
    const cost = addSeats * 350;
    if (state.cash < cost) return alert("Not enough cash.");
    update((s) => ({
      ...s,
      cash: s.cash - cost,
      stands: s.stands.map((st) =>
        st.key === key ? { ...st, capacity: st.capacity + addSeats, condition: Math.max(50, st.condition - 5) } : st,
      ),
      ledger: [
        ...s.ledger,
        {
          week: s.week, season: s.season,
          income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
          expenses: {
            playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
            maintenance: 0, matchday: 0, transfers: 0, other: cost,
          },
          net: -cost, balance: s.cash - cost,
          matchdayNote: `Expanded ${key} stand +${addSeats} seats`,
        },
      ],
    }));
  };

  return (
    <div className="space-y-4">
      <Section title="Stadium">
        <div className="grid gap-3 md:grid-cols-2">
          {state.stands.map((st) => (
            <div key={st.key} className="rounded-lg border bg-background/40 p-3">
              <div className="flex items-baseline justify-between">
                <div className="font-display text-lg">{st.name}</div>
                <div className="text-xs text-muted-foreground">
                  Condition <span className="font-semibold">{st.condition}%</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm tnum">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Capacity</div>
                  <div className="font-display text-xl">{st.capacity.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Ticket price</div>
                  <div className="font-display text-xl">£{st.ticketPrice}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => expandStand(st.key, 500)}>
                  +500 seats (£{(500 * 350).toLocaleString()})
                </Button>
                <Button size="sm" variant="secondary" onClick={() => expandStand(st.key, 1500)}>
                  +1500 seats (£{(1500 * 350).toLocaleString()})
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Training facilities">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Training rating" value={String(state.trainingRating)} />
          <Stat label="Pitch condition" value={`${state.pitchCondition}%`} />
          <Stat
            label="Weekly cost"
            value={fmtMoneyExact(state.trainingWeeklyCost)}
            tone="bad"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              const cost = 250_000;
              if (state.cash < cost) return alert("Not enough cash.");
              update((s) => ({
                ...s,
                cash: s.cash - cost,
                trainingRating: Math.min(95, s.trainingRating + 3),
                trainingWeeklyCost: Math.round(s.trainingWeeklyCost * 1.08),
                ledger: [
                  ...s.ledger,
                  {
                    week: s.week, season: s.season,
                    income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
                    expenses: {
                      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
                      maintenance: 0, matchday: 0, transfers: 0, other: cost,
                    },
                    net: -cost, balance: s.cash - cost,
                    matchdayNote: "Upgraded training facilities +3",
                  },
                ],
              }));
            }}
          >
            Upgrade +3 (£250k)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const cost = 40_000;
              if (state.cash < cost) return alert("Not enough cash.");
              update((s) => ({
                ...s,
                cash: s.cash - cost,
                pitchCondition: Math.min(99, s.pitchCondition + 15),
                ledger: [
                  ...s.ledger,
                  {
                    week: s.week, season: s.season,
                    income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
                    expenses: {
                      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
                      maintenance: cost, matchday: 0, transfers: 0, other: 0,
                    },
                    net: -cost, balance: s.cash - cost,
                    matchdayNote: "Pitch relaid",
                  },
                ],
              }));
            }}
          >
            Relay pitch (£40k)
          </Button>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   FIXTURES
   ========================================================================= */
function Fixtures({ state }: { state: GameState }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Fixtures">
        <div className="max-h-[520px] overflow-y-auto divide-y text-sm">
          {state.fixtures.map((f) => {
            const result = state.results.find((r) => r.week === f.week);
            const isNext = f.week === state.week;
            return (
              <div
                key={f.week}
                className={cn(
                  "flex items-center justify-between py-2",
                  isNext && "bg-accent/20 -mx-4 px-4 border-y border-accent",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs w-10 text-muted-foreground tnum">W{f.week}</span>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      f.home ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {f.home ? "H" : "A"}
                  </span>
                  <span>{f.opponent}</span>
                </div>
                {result ? (
                  <span
                    className={cn(
                      "text-xs font-bold tnum",
                      result.result === "W" && "text-[color:var(--color-income)]",
                      result.result === "L" && "text-[color:var(--color-expense)]",
                    )}
                  >
                    {result.goalsFor}-{result.goalsAgainst}
                  </span>
                ) : isNext ? (
                  <span className="text-xs font-semibold text-accent-foreground bg-accent px-2 py-0.5 rounded">
                    Next
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="League table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-2">#</th>
                <th className="text-left py-2 pr-2">Club</th>
                <th className="text-right py-2 pr-2">P</th>
                <th className="text-right py-2 pr-2">W</th>
                <th className="text-right py-2 pr-2">D</th>
                <th className="text-right py-2 pr-2">L</th>
                <th className="text-right py-2 pr-2">GD</th>
                <th className="text-right py-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {[...state.league]
                .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
                .map((r, i) => (
                  <tr
                    key={r.team}
                    className={cn(
                      "border-b last:border-b-0",
                      r.team === state.clubName && "bg-accent/20 font-semibold",
                    )}
                  >
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2">{r.team}</td>
                    <td className="text-right py-1.5 pr-2">{r.p}</td>
                    <td className="text-right py-1.5 pr-2">{r.w}</td>
                    <td className="text-right py-1.5 pr-2">{r.d}</td>
                    <td className="text-right py-1.5 pr-2">{r.l}</td>
                    <td className="text-right py-1.5 pr-2">{r.gf - r.ga}</td>
                    <td className="text-right py-1.5 font-semibold">{r.pts}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   HISTORY / LEDGER
   ========================================================================= */
function History({ state }: { state: GameState }) {
  const rows = [...state.ledger].reverse();
  return (
    <Section title="Weekly ledger">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No entries yet. Advance a week to begin recording finances.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Week</th>
                <th className="text-left py-2 pr-3">Note</th>
                <th className="text-right py-2 pr-3">Income</th>
                <th className="text-right py-2 pr-3">Expenses</th>
                <th className="text-right py-2 pr-3">Net</th>
                <th className="text-right py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const inc = sum(l.income);
                const exp = sum(l.expenses);
                return (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      S{l.season} W{l.week}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.matchdayNote ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-income)]">
                      {fmtMoneyExact(inc)}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                      {fmtMoneyExact(exp)}
                    </td>
                    <td
                      className={cn(
                        "text-right py-1.5 pr-3 font-semibold",
                        l.net >= 0
                          ? "text-[color:var(--color-income)]"
                          : "text-[color:var(--color-expense)]",
                      )}
                    >
                      {fmtMoneyExact(l.net)}
                    </td>
                    <td className="text-right py-1.5">{fmtMoneyExact(l.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
