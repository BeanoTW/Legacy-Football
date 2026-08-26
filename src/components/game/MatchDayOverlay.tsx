import type { GameState } from "@/lib/game/types";
import { ChevronsRight, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  applyHalfTimeChoice,
  cancelLiveMatch,
  commitLiveMatchAndAdvance,
  fmtMoney,
  kickoff,
} from "@/lib/game/engine";
import { Info2, initials } from "./shared/primitives";

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
  const homeName = lm.fixture.home ? usName : themName;
  const awayName = lm.fixture.home ? themName : usName;
  const homeGoals = lm.fixture.home ? lm.ourGoals : lm.theirGoals;
  const awayGoals = lm.fixture.home ? lm.theirGoals : lm.ourGoals;
  const statusLabel =
    lm.status === "brief"
      ? "PRE-MATCH"
      : lm.status === "halfTime"
        ? "HALF TIME"
        : lm.status === "fullTime"
          ? "FULL TIME"
          : "LIVE";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="mx-auto max-w-3xl min-h-screen px-3 py-4 sm:py-8">
        <div className="rounded-3xl border bg-card shadow-xl overflow-hidden">
          <div className="panel-strip px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Matchday</div>
              <div className="text-sm font-semibold mt-0.5">
                Week {lm.fixture.week} · {lm.fixture.home ? "Home" : "Away"}
              </div>
            </div>
            <button
              className="size-10 rounded-xl bg-black/15 grid place-items-center hover:bg-black/25 transition-colors"
              aria-label="Close matchday"
              onClick={() => {
                if (confirm("Abandon the match? Progress this fixture will be lost.")) {
                  update((s) => cancelLiveMatch(s));
                }
              }}
            >
              <X className="size-5" />
            </button>
          </div>

          <section className="p-5 sm:p-7 text-center">
            <div className="inline-flex rounded-full bg-muted px-3 py-1 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
              {statusLabel}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6 mt-5">
              <TeamBadge name={homeName} label="Home" active={lm.fixture.home} />
              <div>
                <div className="font-display text-5xl sm:text-6xl tnum leading-none whitespace-nowrap">
                  {homeGoals}
                  <span className="text-muted-foreground mx-2 sm:mx-3">–</span>
                  {awayGoals}
                </div>
                <div className="text-xs text-muted-foreground mt-2">League</div>
              </div>
              <TeamBadge name={awayName} label="Away" active={!lm.fixture.home} />
            </div>
          </section>

          {lm.status === "brief" && (
            <section className="border-t p-4 sm:p-5 space-y-4">
              <div>
                <h2 className="font-display text-2xl">Ready for kick-off</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  The essentials are here. You can get straight into the match.
                </p>
              </div>
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StrengthCard label="Your team" value={Math.round(lm.ourStrength)} />
                <StrengthCard label="Opposition" value={Math.round(lm.oppStrength)} />
              </div>
              <Button
                className="w-full h-14 text-base font-semibold"
                onClick={() => update((s) => kickoff(s))}
              >
                <Play className="size-5 mr-2" /> Kick off
              </Button>
            </section>
          )}

          {lm.status === "halfTime" && lm.halfTimeOptions && (
            <section className="border-t p-4 sm:p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Half time
                </div>
                <h2 className="font-display text-2xl mt-1">Your call</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick the chairman response. The match continues immediately.
                </p>
              </div>
              <div className="grid gap-3">
                {lm.halfTimeOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => update((s) => applyHalfTimeChoice(s, o.id))}
                    className="min-h-24 text-left rounded-2xl border p-4 hover:border-primary hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display text-xl">{o.label}</span>
                      {o.winBonusCost > 0 && (
                        <span className="shrink-0 rounded-lg bg-[color:var(--color-expense)]/10 px-2 py-1 text-xs text-[color:var(--color-expense)] tnum">
                          {fmtMoney(o.winBonusCost)} bonus
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{o.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {lm.status === "fullTime" && (
            <section className="border-t p-4 sm:p-5 space-y-4">
              <div className="text-center py-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Result
                </div>
                <div className="font-display text-3xl mt-1">
                  {lm.ourGoals > lm.theirGoals
                    ? "Victory"
                    : lm.ourGoals < lm.theirGoals
                      ? "Defeat"
                      : "Draw"}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm tnum">
                <Info2 label="Attendance" value={lm.attendance.toLocaleString()} />
                <Info2 label="Gate" value={fmtMoney(lm.gateReceipts)} />
                <Info2 label="TV" value={fmtMoney(lm.tvIncome)} />
                <Info2 label="Matchday ops" value={`-${fmtMoney(lm.matchdayOps)}`} tone="bad" />
                {lm.winBonus > 0 && (
                  <Info2 label="Win bonus" value={`-${fmtMoney(lm.winBonus)}`} tone="bad" />
                )}
              </div>
              <Button
                className="w-full h-14 text-base font-semibold"
                onClick={() => update((s) => commitLiveMatchAndAdvance(s))}
              >
                Continue to next week <ChevronsRight className="size-5 ml-1" />
              </Button>
            </section>
          )}

          <section className="border-t bg-muted/20">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Match feed
              </div>
              <div className="text-xs text-muted-foreground">{lm.events.length} events</div>
            </div>
            <div className="max-h-64 overflow-y-auto border-t">
              {lm.events.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground text-center">
                  {lm.status === "brief" ? "Pre-match — ready to kick off." : "No events yet."}
                </div>
              ) : (
                <ul className="text-sm divide-y">
                  {lm.events.map((e, i) => (
                    <li key={i} className="px-4 py-3 flex items-center gap-3">
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
          </section>
        </div>
      </div>
    </div>
  );
}

function TeamBadge({ name, label, active }: { name: string; label: string; active: boolean }) {
  return (
    <div className="min-w-0 flex flex-col items-center gap-2">
      <div
        className={cn(
          "size-14 sm:size-16 rounded-2xl grid place-items-center font-display text-xl sm:text-2xl",
          active ? "bg-panel text-panel-foreground" : "bg-muted text-foreground",
        )}
      >
        {initials(name)}
      </div>
      <div className="font-display text-base sm:text-lg leading-tight truncate max-w-full">
        {name}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function StrengthCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
      <div className="h-1.5 rounded-full bg-background mt-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(8, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
