import type { GameState } from "@/lib/game/types";
import { ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  applyHalfTimeChoice,
  cancelLiveMatch,
  commitLiveMatchAndAdvance,
  fmtMoney,
  kickoff,
} from "@/lib/game/engine";
import { Info2 } from "./shared/primitives";

export function MatchDayOverlay({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const lm = state.liveMatch!;
  const usName = state.clubName;
  const themName = lm.fixture.opponent;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="mx-auto max-w-3xl px-3 py-6">
        <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm flex items-center justify-between">
            <span>
              Matchday · Week {lm.fixture.week} · {lm.fixture.home ? "Home" : "Away"}
            </span>
            <button
              className="text-xs opacity-80 hover:opacity-100"
              onClick={() => {
                if (confirm("Abandon the match? Progress this fixture will be lost."))
                  update((s) => cancelLiveMatch(s));
              }}
            >
              Close
            </button>
          </div>

          {/* Scoreline */}
          <div className="p-5 grid grid-cols-3 items-center gap-3 text-center">
            <div>
              <div className="font-display text-xl truncate">
                {lm.fixture.home ? usName : themName}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lm.fixture.home ? "Home" : "Away"}
              </div>
            </div>
            <div className="font-display text-5xl tnum">
              {lm.fixture.home ? lm.ourGoals : lm.theirGoals}
              <span className="text-muted-foreground mx-2">–</span>
              {lm.fixture.home ? lm.theirGoals : lm.ourGoals}
            </div>
            <div>
              <div className="font-display text-xl truncate">
                {lm.fixture.home ? themName : usName}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lm.fixture.home ? "Away" : "Home"}
              </div>
            </div>
          </div>

          {/* Brief */}
          {lm.status === "brief" && (
            <div className="p-4 border-t space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info2 label="Weather" value={lm.weather} />
                <Info2
                  label="Projected gate"
                  value={
                    lm.fixture.home
                      ? `${lm.projectedAttendance.toLocaleString()} fans`
                      : "Away — no gate"
                  }
                />
                <Info2 label="Board expects" value={lm.boardExpectation} />
                <Info2 label="Form" value={lm.formGuide} />
                <Info2 label="Us" value={`Str ${Math.round(lm.ourStrength)}`} />
                <Info2 label="Them" value={`Str ${Math.round(lm.oppStrength)}`} />
              </div>
              <Button className="w-full" onClick={() => update((s) => kickoff(s))}>
                Kick off
              </Button>
            </div>
          )}

          {/* Half time */}
          {lm.status === "halfTime" && lm.halfTimeOptions && (
            <div className="p-4 border-t space-y-3">
              <div className="text-sm font-semibold">Half time — your call</div>
              <div className="grid gap-2">
                {lm.halfTimeOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => update((s) => applyHalfTimeChoice(s, o.id))}
                    className="text-left rounded-lg border p-3 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{o.label}</span>
                      {o.winBonusCost > 0 && (
                        <span className="text-xs text-[color:var(--color-expense)] tnum">
                          Bonus if win: {fmtMoney(o.winBonusCost)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full time */}
          {lm.status === "fullTime" && (
            <div className="p-4 border-t space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm tnum">
                <Info2 label="Attendance" value={lm.attendance.toLocaleString()} />
                <Info2 label="Gate" value={fmtMoney(lm.gateReceipts)} />
                <Info2 label="TV" value={fmtMoney(lm.tvIncome)} />
                <Info2 label="Matchday ops" value={`-${fmtMoney(lm.matchdayOps)}`} tone="bad" />
                {lm.winBonus > 0 && (
                  <Info2 label="Win bonus" value={`-${fmtMoney(lm.winBonus)}`} tone="bad" />
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => update((s) => commitLiveMatchAndAdvance(s))}
              >
                Confirm & advance week <ChevronsRight className="size-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Ticker */}
          <div className="border-t bg-muted/30 max-h-64 overflow-y-auto">
            {lm.events.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                {lm.status === "brief" ? "Pre-match — ready to kick off." : "No events yet."}
              </div>
            ) : (
              <ul className="text-sm divide-y">
                {lm.events.map((e, i) => (
                  <li key={i} className="px-3 py-2 flex items-center gap-3">
                    <span className="text-xs w-8 text-muted-foreground tnum">{e.minute}'</span>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        e.type === "goal"
                          ? "bg-[color:var(--color-income)]/20 text-[color:var(--color-income)]"
                          : e.type === "card"
                            ? "bg-yellow-500/20 text-yellow-700"
                            : "bg-muted",
                      )}
                    >
                      {e.type.toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        e.side === "us" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
