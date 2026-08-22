import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
import { Section } from "./shared/primitives";
import { FinancialHealthPanel } from "./DashboardTab";

export function CashFlowTab({ state }: { state: GameState }) {
  const totals = useMemo(() => {
    const inc = { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 };
    const exp = {
      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
      maintenance: 0, matchday: 0, transfers: 0, other: 0,
    };
    // Only the current season is guaranteed hot: older weekly roll-ups are
    // compacted out of the save, and the panel is labelled per-season anyway.
    for (const l of state.ledger.filter((r) => r.season === state.season)) {
      (Object.keys(inc) as (keyof typeof inc)[]).forEach((k) => (inc[k] += l.income[k]));
      (Object.keys(exp) as (keyof typeof exp)[]).forEach((k) => (exp[k] += l.expenses[k]));
    }
    return { inc, exp };
  }, [state.ledger, state.season]);

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
      <FinancialHealthPanel state={state} />
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
