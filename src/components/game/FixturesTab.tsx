import { Play } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { startMatchDay } from "@/lib/game/engine";
import { Section } from "./shared/primitives";

export function Fixtures({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
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
                  <button
                    onClick={() => update((s) => startMatchDay(s))}
                    className="text-xs font-semibold text-accent-foreground bg-accent hover:brightness-95 px-2 py-0.5 rounded"
                  >
                    Play →
                  </button>
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
