import { TriangleAlert } from "lucide-react";
import type { GameState, Stand } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { avgTicketPrice, fmtMoney, totalCapacity } from "@/lib/game/engine";
import { InfoTip } from "./shared/primitives";
import { DetailScreen } from "./shared/layout";

export function TicketsTab({
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
  // Each stand's recommendation nudges around the market ref based on its
  // condition (better stand → fans tolerate slightly higher prices).
  const recFor = (st: Stand) => Math.max(5, Math.round(refPrice * (0.85 + st.condition / 400)));
  // A rough "league average" — slight variance around the market ref.
  const leagueAvg = refPrice * 0.98;

  const rows = state.stands.map((st) => {
    const priceFactor = Math.max(
      0.15,
      1 - Math.pow(Math.max(0, st.ticketPrice - refPrice) / refPrice, 1.4),
    );
    const happiness = 0.55 + state.fanHappiness / 200;
    const estAtt = Math.round(st.capacity * priceFactor * happiness);
    const revenue = estAtt * st.ticketPrice;
    const rec = recFor(st);
    const delta = st.ticketPrice - rec;
    return { st, estAtt, revenue, priceFactor, rec, delta };
  });
  const totalEstAtt = rows.reduce((a, r) => a + r.estAtt, 0);
  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
  const avgPrice = avgTicketPrice(state);
  const overRatio = avgPrice / refPrice;
  const allRecommended = rows.every((row) => row.delta === 0);
  const setAllRecommended = () => update((s) => ({
    ...s,
    stands: s.stands.map((st) => ({ ...st, ticketPrice: Math.max(5, Math.min(120, recFor(st))) })),
  }));

  const backlash =
    overRatio > 1.5
      ? {
          tone: "bad" as const,
          title: "Fans are furious",
          body: "Your average ticket is more than 50% above the market. Happiness drops each week and your reputation is starting to slide.",
        }
      : overRatio > 1.25
        ? {
            tone: "warn" as const,
            title: "Prices biting",
            body: "You're pricing 25%+ above the market. Attendance is soft and fan happiness ticks down every week you leave it here.",
          }
        : overRatio < 0.75
          ? {
              tone: "good" as const,
              title: "Bargain pricing",
              body: "You're well under the market. Attendance is strong and fans are slowly warming to you — but you're leaving revenue on the table.",
            }
          : null;

  return (
    <DetailScreen title="Ticket pricing" subtitle="Set stand prices and watch demand respond."
      actions={<InfoTip label="How ticket pricing works">
        Fans compare prices with a market reference of <strong>£{refPrice.toFixed(2)}</strong>, based on reputation ({state.reputation.toFixed(0)}).
        Stand recommendations also reflect condition. High prices reduce demand and can affect fan happiness and reputation.
        League average is approximately £{leagueAvg.toFixed(2)}.
      </InfoTip>}>
      <div className="lf-tickets space-y-2">
        <section className="grid grid-cols-4 divide-x overflow-hidden rounded-xl border bg-card text-center shadow-sm">
          <TicketFigure label="Market" value={`£${refPrice.toFixed(2)}`} />
          <TicketFigure label={`Yours ${overRatio >= 1 ? "+" : ""}${((overRatio - 1) * 100).toFixed(0)}%`}
            value={`£${avgPrice.toFixed(2)}`} tone={overRatio > 1.25 ? "bad" : overRatio < 0.9 ? "good" : undefined} />
          <TicketFigure label="Est. crowd" value={`${totalEstAtt.toLocaleString()}/${totalCapacity(state).toLocaleString()}`} />
          <TicketFigure label="Next gate" value={fmtMoney(totalRev)} tone="good" />
        </section>
        {backlash && <div className={cn(
          "flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px]",
          backlash.tone === "bad" && "border-rose-500/40 bg-rose-500/10",
          backlash.tone === "warn" && "border-amber-500/40 bg-amber-500/10",
          backlash.tone === "good" && "border-emerald-500/40 bg-emerald-500/10",
        )}>
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span><strong>{backlash.title}.</strong> <span className="text-muted-foreground">{backlash.body}</span></span>
        </div>}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Stands</span>
            <button type="button" disabled={allRecommended} onClick={setAllRecommended}
              className="text-[11px] font-semibold text-primary disabled:text-muted-foreground">
              {allRecommended ? "All at recommended" : "Set all to recommended"}
            </button>
          </div>
          <div className="divide-y md:grid md:grid-cols-2 md:divide-y-0">
            {rows.map(({ st, estAtt, revenue, priceFactor, rec, delta }) => {
              const ratio = st.ticketPrice / rec;
              const tone = ratio > 1.25 ? "bad" : ratio > 1.08 ? "warn" : ratio < 0.9 ? "under" : "ok";
              return <div key={st.key} className="lf-stand-row px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-base leading-tight">{st.name}</div>
                    <div className="text-[10px] text-muted-foreground tnum">{st.capacity.toLocaleString()} seats · condition {st.condition}%</div>
                  </div>
                  <span className="font-display text-2xl leading-none tnum">£{st.ticketPrice}</span>
                </div>
                <Slider className="mt-2" min={5} max={80} step={1} value={[st.ticketPrice]}
                  onValueChange={([value]) => setPrice(st.key, value)} aria-label={`${st.name} ticket price`} />
                <div className="mt-1.5 flex items-center gap-2 text-[11px] tnum">
                  <span className="text-muted-foreground">Demand{" "}
                    <span className={cn("font-semibold",
                      priceFactor > 0.75 && "text-[color:var(--color-income)]",
                      priceFactor > 0.4 && priceFactor <= 0.75 && "text-amber-600",
                      priceFactor <= 0.4 && "text-[color:var(--color-expense)]",
                    )}>{(priceFactor * 100).toFixed(0)}%</span>
                  </span>
                  <button type="button" onClick={() => setPrice(st.key, rec)}
                    title="Set to recommended"
                    className={cn("rounded-full border px-1.5 py-px font-semibold",
                      tone === "bad" && "border-rose-500/40 text-rose-600",
                      tone === "warn" && "border-amber-500/40 text-amber-600",
                      tone === "under" && "border-emerald-500/40 text-emerald-600",
                      tone === "ok" && "text-muted-foreground",
                    )}>
                    Rec £{rec}{delta !== 0 && ` (${delta > 0 ? "+" : ""}${delta})`}
                  </button>
                  <span className="ml-auto whitespace-nowrap text-muted-foreground">
                    {estAtt.toLocaleString()} · <span className="text-[color:var(--color-income)]">{fmtMoney(revenue)}</span>
                  </span>
                </div>
              </div>;
            })}
          </div>
        </section>
      </div>
    </DetailScreen>
  );
}

function TicketFigure({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="min-w-0 px-1 py-1.5">
    <div className={cn("truncate font-display text-base leading-tight tnum",
      tone === "good" && "text-[color:var(--color-income)]",
      tone === "bad" && "text-[color:var(--color-expense)]",
    )}>{value}</div>
    <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
  </div>;
}
