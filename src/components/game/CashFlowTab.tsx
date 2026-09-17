import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleDollarSign,
  Landmark,
  PieChart as PieChartIcon,
  ReceiptText,
} from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { weeklyNetRecurring } from "@/lib/game/selectors/club";
import { financialHealth, recommendedReserve } from "@/lib/game/sustainability";
import { Button } from "@/components/ui/button";
import { Section } from "./shared/primitives";
import { DetailScreen, OverviewScreen, WorkflowTile } from "./shared/layout";
import { FinancialHealthPanel } from "./DashboardTab";

type FinanceView = "home" | "health" | "income" | "expenses";

export function CashFlowTab({ state }: { state: GameState }) {
  const [view, setView] = useState<FinanceView>("home");
  const totals = useMemo(() => {
    const inc = {
      gate: 0,
      tv: 0,
      sponsor: 0,
      merchandise: 0,
      prize: 0,
      transfers: 0,
      other: 0,
    };
    const exp = {
      playerWages: 0,
      staffWages: 0,
      stadiumOps: 0,
      trainingOps: 0,
      maintenance: 0,
      matchday: 0,
      transfers: 0,
      other: 0,
    };
    for (const l of state.ledger.filter((r) => r.season === state.season)) {
      (Object.keys(inc) as (keyof typeof inc)[]).forEach((k) => (inc[k] += l.income[k]));
      (Object.keys(exp) as (keyof typeof exp)[]).forEach((k) => (exp[k] += l.expenses[k]));
    }
    return { inc, exp };
  }, [state.ledger, state.season]);

  const incomeTotal = Object.values(totals.inc).reduce((a, b) => a + b, 0);
  const expenseTotal = Object.values(totals.exp).reduce((a, b) => a + b, 0);
  const recurringNet = weeklyNetRecurring(state);
  const health = financialHealth(state);
  const reserve = recommendedReserve(state);

  if (view !== "home") {
    return (
      <DetailScreen
        title={
          view === "health" ? "Financial health" : view === "income" ? "Season income" : "Season expenses"
        }
        subtitle="Detail behind the headline numbers"
        actions={
          <Button variant="ghost" size="sm" onClick={() => setView("home")}>
            <ArrowLeft className="mr-2 size-4" /> Back
          </Button>
        }
      >
        {view === "health" && <FinancialHealthPanel state={state} />}
        {view === "income" && (
          <div className="grid gap-3 xl:grid-cols-2">
            <Section title="Where the money came from">
              <PieBlock data={pieData(totals.inc)} colors={CHART_COLORS} />
            </Section>
            <Section title="Income by category">
              <BreakdownTable totals={totals.inc} tone="income" />
            </Section>
          </div>
        )}
        {view === "expenses" && (
          <div className="grid gap-3 xl:grid-cols-2">
            <Section title="Where the money went">
              <PieBlock data={pieData(totals.exp)} colors={CHART_COLORS} />
            </Section>
            <Section title="Expenses by category">
              <BreakdownTable totals={totals.exp} tone="expense" />
            </Section>
          </div>
        )}
      </DetailScreen>
    );
  }

  return (
    <OverviewScreen
      title="Finances"
      subtitle="See the answer first. Open the detail only when you need it."
      className="grid content-start gap-2 md:gap-3 xl:grid-cols-[minmax(300px,.9fr)_minmax(0,1.6fr)] xl:content-stretch"
    >
      <section className="flex flex-col justify-center rounded-xl border bg-card p-3 shadow-sm md:p-4">
        <div className="text-xs text-muted-foreground">Cash in the bank</div>
        <div
          className={cn(
            "font-display text-2xl leading-tight md:text-3xl xl:text-4xl",
            state.cash < 0 && "text-[color:var(--color-expense)]",
          )}
        >
          {fmtMoneyExact(state.cash)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
          <div className="rounded-lg bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground md:text-xs">Weekly fixed net</div>
            <div
              className={cn(
                "font-display text-base md:text-lg",
                recurringNet >= 0
                  ? "text-[color:var(--color-income)]"
                  : "text-[color:var(--color-expense)]",
              )}
            >
              {recurringNet >= 0 ? "+" : ""}
              {fmtMoney(recurringNet)}
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground md:text-xs">Recommended reserve</div>
            <div className="font-display text-base md:text-lg">{fmtMoney(reserve)}</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <WorkflowTile
          icon={<Landmark className="size-5 md:size-6" />}
          title="Financial health"
          value={health.label}
          sub={`${health.coverMonths.toFixed(1)} months cover`}
          onClick={() => setView("health")}
        />
        <WorkflowTile
          icon={<ArrowUpRight className="size-5 md:size-6" />}
          title="Income"
          value={`${fmtMoney(incomeTotal)} this season`}
          sub="Gate, TV, sponsors and player sales"
          onClick={() => setView("income")}
        />
        <WorkflowTile
          icon={<ReceiptText className="size-5 md:size-6" />}
          title="Expenses"
          value={`${fmtMoney(expenseTotal)} this season`}
          sub="Wages, upkeep and matchday costs"
          onClick={() => setView("expenses")}
        />
        <WorkflowTile
          icon={<CircleDollarSign className="size-5 md:size-6" />}
          title="Season result"
          value={`${incomeTotal - expenseTotal >= 0 ? "+" : ""}${fmtMoney(incomeTotal - expenseTotal)}`}
          sub="Income minus expenses"
          onClick={() => setView(incomeTotal >= expenseTotal ? "income" : "expenses")}
        />
      </div>
    </OverviewScreen>
  );
}

function FinanceAction({
  icon,
  title,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="min-h-32 rounded-2xl border bg-card p-4 text-left flex flex-col justify-between hover:border-primary/50 transition-colors"
    >
      <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold text-muted-foreground">{title}</div>
        <div className="font-display text-2xl leading-tight mt-0.5">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </div>
    </button>
  );
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
  "var(--color-accent)",
];

function pieData(totals: Record<string, number>) {
  return Object.entries(totals)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: label(k), value: v }));
}

function label(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function PieBlock({
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

export function BreakdownTable({
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
        <div key={k} className="flex justify-between py-2">
          <span className="text-muted-foreground">{label(k)}</span>
          <span
            className={cn(
              "tnum",
              tone === "income"
                ? "text-[color:var(--color-income)]"
                : "text-[color:var(--color-expense)]",
            )}
          >
            {fmtMoneyExact(v)}
          </span>
        </div>
      ))}
      <div className="flex justify-between py-3 font-semibold">
        <span>Total</span>
        <span className="tnum">{fmtMoneyExact(total)}</span>
      </div>
    </div>
  );
}
