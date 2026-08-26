import { Ticket, TriangleAlert } from "lucide-react";
import type { GameState, Stand } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { avgTicketPrice, fmtMoney, fmtMoneyExact, totalCapacity } from "@/lib/game/engine";
import { InfoTip, Section } from "./shared/primitives";
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
    <DetailScreen title="Ticket pricing" subtitle="Set prices per stand and watch demand respond.">
      <Section
        title="Ticket pricing model"
        info={
          <>
            Fans compare each stand's price against a market reference of{" "}
            <strong>£{refPrice.toFixed(2)}</strong>, driven by your reputation (
            {state.reputation.toFixed(0)}). Recommended prices per stand also factor in that stand's
            condition. Push far above and demand collapses; push much further and fan happiness —
            then reputation — start to slide.
          </>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              Market reference
              <InfoTip label="Market reference">
                What fans consider a fair average price at your level. Grows with reputation (base
                £15 + 0.4 × rep).
              </InfoTip>
            </div>
            <div className="font-display text-lg tnum">£{refPrice.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              League average
              <InfoTip label="League average">
                Roughly what other clubs in your division are charging on average.
              </InfoTip>
            </div>
            <div className="font-display text-lg tnum">£{leagueAvg.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              Your average
              <InfoTip label="Your average">Capacity-weighted average of your four stands.</InfoTip>
            </div>
            <div
              className={cn(
                "font-display text-lg tnum",
                overRatio > 1.25 && "text-[color:var(--color-expense)]",
                overRatio < 0.9 && "text-[color:var(--color-income)]",
              )}
            >
              £{avgPrice.toFixed(2)}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({overRatio >= 1 ? "+" : ""}
                {((overRatio - 1) * 100).toFixed(0)}% vs market)
              </span>
            </div>
          </div>
        </div>

        {backlash && (
          <div
            className={cn(
              "mb-3 rounded-md border p-3 flex gap-2 text-xs",
              backlash.tone === "bad" &&
                "border-[color:var(--color-expense)]/40 bg-[color:var(--color-expense)]/10",
              backlash.tone === "warn" && "border-amber-500/40 bg-amber-500/10",
              backlash.tone === "good" &&
                "border-[color:var(--color-income)]/40 bg-[color:var(--color-income)]/10",
            )}
          >
            <TriangleAlert
              className={cn(
                "size-4 mt-0.5 shrink-0",
                backlash.tone === "bad" && "text-[color:var(--color-expense)]",
                backlash.tone === "warn" && "text-amber-600",
                backlash.tone === "good" && "text-[color:var(--color-income)]",
              )}
            />
            <div>
              <div className="font-semibold">{backlash.title}</div>
              <div className="text-muted-foreground">{backlash.body}</div>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ st, estAtt, revenue, priceFactor, rec, delta }) => {
            const overStand = st.ticketPrice / rec;
            const deltaTone =
              overStand > 1.25
                ? "bad"
                : overStand > 1.08
                  ? "warn"
                  : overStand < 0.9
                    ? "under"
                    : "ok";
            return (
              <div key={st.key} className="rounded-lg border bg-background/40 p-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-lg flex items-center gap-1">
                    {st.name}
                    <InfoTip label={st.name}>
                      Recommended reflects the market reference adjusted for this stand's condition
                      ({st.condition}%). Better stands can charge a small premium without upsetting
                      fans.
                    </InfoTip>
                  </div>
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
                <div className="mt-1 text-[11px] flex items-center gap-1">
                  <span className="text-muted-foreground">Recommended £{rec}</span>
                  <span
                    className={cn(
                      "font-semibold tnum",
                      deltaTone === "bad" && "text-[color:var(--color-expense)]",
                      deltaTone === "warn" && "text-amber-600",
                      deltaTone === "under" && "text-[color:var(--color-income)]",
                      deltaTone === "ok" && "text-muted-foreground",
                    )}
                  >
                    ({delta >= 0 ? "+" : ""}£{delta})
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrice(st.key, rec)}
                    className="ml-auto text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  >
                    Set to recommended
                  </button>
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
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Est. attendance
                    </div>
                    <div>{estAtt.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Est. gate</div>
                    <div className="text-[color:var(--color-income)]">{fmtMoneyExact(revenue)}</div>
                  </div>
                </div>
              </div>
            );
          })}
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
    </DetailScreen>
  );
}
