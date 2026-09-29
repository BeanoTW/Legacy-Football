import { useMemo } from "react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { commitmentProgress, sustainabilitySnapshot } from "@/lib/game/sustainability";
import { WEEKS_PER_SEASON } from "@/lib/game/time";
import { HEALTH_TONE, Meter } from "./shared/primitives";

/** The existing sustainability data in a compact, phone-first financial report. */
export function FinancialHealthPanel({ state }: { state: GameState }) {
  const snap = useMemo(() => sustainabilitySnapshot(state), [state]);
  const { health, reserve, pressure, needs, capacity, openCommitments } = snap;
  const reservePct = reserve.recommended > 0 ? (reserve.cash / reserve.recommended) * 100 : 100;
  const reserveTone = reservePct >= 100 ? "bg-emerald-500" : reservePct >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="lf-health space-y-2">
      <section className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <strong className={cn("font-display text-2xl leading-none", HEALTH_TONE[health.state])}>{health.label}</strong>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{health.trajectory}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{health.summary}</p>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-2 [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+2)]:border-t">
          <Figure label="Cash" value={fmtMoneyExact(reserve.cash)} />
          <Figure label="Recommended reserve" value={fmtMoneyExact(reserve.recommended)} />
          <Figure label={reserve.excess > 0 ? "Above reserve" : "Short of reserve"} value={fmtMoneyExact(reserve.excess > 0 ? reserve.excess : reserve.deficit)} tone={reserve.excess > 0 ? "good" : "bad"} />
          <Figure label="Operating cover" value={`${health.coverMonths.toFixed(1)} months`} sub={`Wage/revenue ${health.wageRatio}%`} />
        </div>
        <div className="border-t px-3 py-2">
          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>Cash against reserve</span><span className="tnum">{Math.round(reservePct)}%</span></div>
          <Meter value={reservePct} tone={reserveTone} />
        </div>
      </section>
      <section className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reinvestment pressure</div>
            <div className="flex items-baseline gap-1"><strong className="font-display text-2xl leading-none tnum">{pressure.score}</strong><span className="text-[10px] text-muted-foreground">/ 100</span></div>
          </div>
          <div className="min-w-0 flex-1">
            <Meter value={pressure.score} tone={pressure.score >= 70 ? "bg-rose-500" : pressure.score >= 40 ? "bg-amber-500" : "bg-teal-500"} />
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{pressure.headline}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
          {([
            ["Infrastructure", needs.infrastructure, pressure.byArea.infrastructure],
            ["Squad", needs.squad, pressure.byArea.squad],
            ["Supporters", needs.supporters, pressure.byArea.supporters],
            ["Commercial", needs.commercial, pressure.byArea.commercial],
          ] as const).map(([label, need, score]) => (
            <div key={label} className="min-w-0">
              <div className="flex justify-between gap-1"><span className="truncate text-muted-foreground">{label}</span><span className="tnum">{Math.round(need * 100)}</span></div>
              <Meter value={score} tone={score >= 60 ? "bg-orange-500" : "bg-primary/60"} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="text-[10px] uppercase tracking-wider text-muted-foreground">Commitments to the board</strong>
          <span className="text-[10px] text-muted-foreground">{openCommitments.length ? `${openCommitments.length} open` : "None open"}</span>
        </div>
        {openCommitments.length === 0 ? <p className="mt-1 text-[11px] text-muted-foreground">Promises made in the inbox are tracked against real spending.</p> : (
          <div className="mt-1.5 space-y-2">
            {openCommitments.map((commitment) => {
              const progress = commitmentProgress(state, commitment);
              const pct = Math.round(progress * 100);
              return <div key={commitment.id} className="text-[11px]">
                <div className="flex justify-between gap-2"><span className="font-medium capitalize">{commitment.category}</span><span className="text-muted-foreground">due w{commitment.deadlineAbsoluteWeek % WEEKS_PER_SEASON || WEEKS_PER_SEASON}</span></div>
                <Meter value={pct} tone={pct >= 100 ? "bg-emerald-500" : "bg-amber-500"} />
                <div className="mt-0.5 truncate text-muted-foreground">{commitment.targetInvestment > 0 ? `${fmtMoney(Math.round(progress * commitment.targetInvestment))} of ${fmtMoney(commitment.targetInvestment)}` : commitment.description}</div>
              </div>;
            })}
          </div>
        )}
        <div className="mt-2 grid grid-cols-3 divide-x rounded-lg bg-muted/40 text-center">
          <Mini label="Committed wages" value={fmtMoney(snap.committedWages)} />
          <Mini label="Capital" value={fmtMoney(snap.capitalCommitments)} />
          <Mini label="Ground use" value={`${Math.round(capacity.occupancy * 100)}%`} />
        </div>
      </section>
    </div>
  );
}
function Figure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return <div className="min-w-0 px-3 py-2">
    <div className="truncate text-[10px] text-muted-foreground">{label}</div>
    <div className={cn("truncate font-display text-lg leading-tight tnum", tone === "good" && "text-[color:var(--color-income)]", tone === "bad" && "text-[color:var(--color-expense)]")}>{value}</div>
    {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
  </div>;
}
function Mini({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-1 py-1.5"><div className="truncate font-display text-sm leading-tight tnum">{value}</div><div className="truncate text-[9px] text-muted-foreground">{label}</div></div>;
}
