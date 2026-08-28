import type { GameState } from "@/lib/game/types";
import { Activity, ChevronsRight, Flame, Landmark, Newspaper, Play, Target, Users, X } from "lucide-react";
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
  const ourMoments = lm.events.filter((event) => event.side === "us" && event.type !== "card").length;
  const theirMoments = lm.events.filter((event) => event.side === "them" && event.type !== "card").length;
  const possession = Math.max(34, Math.min(66, Math.round(50 + (lm.ourStrength - lm.oppStrength) * 0.7)));
  const result = lm.ourGoals > lm.theirGoals ? "Victory" : lm.ourGoals < lm.theirGoals ? "Defeat" : "Draw";
  const expectationMet = lm.boardExpectation === "Any result" || (lm.boardExpectation === "Win" ? result === "Victory" : result !== "Defeat");
  const atmosphere = lm.fixture.home ? Math.round((lm.projectedAttendance / Math.max(1, lm.projectedAttendance + 1200)) * 100) : 72;

  return (
    <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-[#07130f] text-white">
      <div className="mx-auto h-full max-w-5xl p-0 sm:px-4 sm:py-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground shadow-2xl sm:rounded-[2rem] sm:border">
          <div className="flex shrink-0 items-center justify-between gap-3 bg-[#0c211a] px-4 py-2 text-white sm:px-6 sm:py-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Chairman match centre</div>
              <div className="text-sm font-semibold mt-0.5">
                Week {lm.fixture.week} · {lm.fixture.home ? "Home" : "Away"}
              </div>
            </div>
            <button
              className="grid size-9 place-items-center rounded-xl bg-black/15 transition-colors hover:bg-black/25 sm:size-10"
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

          <section className="relative shrink-0 overflow-hidden bg-[radial-gradient(circle_at_50%_120%,#258660_0%,#123d2e_36%,#07130f_78%)] px-3 py-3 text-center text-white sm:px-8 sm:py-6">
            <div className="absolute inset-x-10 bottom-0 h-px bg-white/20" />
            <div className="inline-flex rounded-full border border-white/15 bg-black/20 px-3 py-1 text-[10px] font-bold tracking-[0.2em] text-emerald-100 backdrop-blur">
              {statusLabel}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:mt-5 sm:gap-6">
              <TeamBadge name={homeName} label="Home" active={lm.fixture.home} />
              <div>
                <div className="whitespace-nowrap font-display text-4xl leading-none tnum sm:text-6xl">
                  {homeGoals}
                  <span className="text-muted-foreground mx-2 sm:mx-3">–</span>
                  {awayGoals}
                </div>
                <div className="mt-2 text-xs text-white/60">Division Four · {lm.weather}</div>
              </div>
              <TeamBadge name={awayName} label="Away" active={!lm.fixture.home} />
            </div>
          </section>

          {lm.status !== "brief" && (
            <section className="grid shrink-0 grid-cols-3 border-b bg-[#0c211a] text-white">
              <MatchPulse icon={Activity} label="Possession" value={`${possession}%`} />
              <MatchPulse icon={Target} label="Moments" value={`${ourMoments}–${theirMoments}`} />
              <MatchPulse icon={Users} label="Atmosphere" value={`${atmosphere}%`} />
            </section>
          )}

          <div className={cn("min-h-0 flex-1", lm.status === "brief" ? "block" : "grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)] lg:grid-rows-1", lm.status === "halfTime" ? "grid-rows-[minmax(0,4fr)_minmax(6rem,1fr)]" : "grid-rows-[minmax(0,3fr)_minmax(8rem,2fr)]")}>

          {lm.status === "brief" && (
            <section className="h-full overflow-y-auto overscroll-contain border-t p-3 sm:p-5 space-y-3 sm:space-y-4">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">The boardroom view</div>
                <h2 className="font-display text-3xl">The doors close. The noise rises.</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  You picked the squad and funded the club. Now watch what your decisions have built.
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
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left">
                <div className="flex items-center gap-2 font-semibold"><Landmark className="size-4 text-primary" /> Boardroom pressure</div>
                <p className="mt-1 text-sm text-muted-foreground">The board expects <strong className="text-foreground">{lm.boardExpectation.toLowerCase()}</strong>. Supporters want intent as much as points.</p>
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
            <section className="min-h-0 overflow-hidden border-t p-2.5 sm:overflow-y-auto sm:p-5 space-y-2 sm:space-y-4">
              <div>
                <div className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:block">
                  Half time
                </div>
                <h2 className="font-display text-2xl leading-tight sm:mt-1 sm:text-3xl">The dressing-room door opens</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:mt-1 sm:text-sm">
                  One message. No tactical whiteboard. Decide what sort of club walks back out.
                </p>
              </div>
              <div className="grid gap-1.5 sm:gap-3">
                {lm.halfTimeOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => update((s) => applyHalfTimeChoice(s, o.id))}
                    className="group min-h-0 rounded-xl border px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md sm:min-h-24 sm:rounded-2xl sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-display text-lg leading-tight sm:text-xl">{o.label}</span>
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground sm:size-8"><ChevronsRight className="size-4" /></span>
                    </div>
                    <div className="mt-0.5 truncate pr-8 text-[11px] leading-tight text-muted-foreground sm:mt-1 sm:whitespace-normal sm:pr-0 sm:text-sm">{o.desc}</div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {lm.status === "fullTime" && (
            <section className="min-h-0 overflow-y-auto overscroll-contain border-t p-3 sm:p-5 space-y-3 sm:space-y-4">
              <div className="text-center py-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Result
                </div>
                <div className="font-display text-4xl mt-1">{result}</div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm tnum">
                <Info2 label="Attendance" value={lm.attendance.toLocaleString()} />
                <Info2 label="Gate" value={fmtMoney(lm.gateReceipts)} />
                <Info2 label="TV" value={fmtMoney(lm.tvIncome)} />
                <Info2 label="Matchday ops" value={`-${fmtMoney(lm.matchdayOps)}`} tone="bad" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <ReactionCard icon={Users} label="Supporters" text={result === "Victory" ? "They spill out singing. Belief is building." : result === "Defeat" ? "Frustrated, but they noticed the level of intent." : "Respectful applause, with a sense of opportunity missed."} tone={result === "Victory" ? "good" : "neutral"} />
                <ReactionCard icon={Landmark} label="Board" text={expectationMet ? "Expectation met. The room stays calm." : "Expectation missed. Questions will follow."} tone={expectationMet ? "good" : "bad"} />
                <ReactionCard icon={Newspaper} label="Back page" text={result === "Victory" ? `${state.clubName} make their point.` : result === "Defeat" ? `${state.clubName} leave with hard lessons.` : `Nothing settled after a tense draw.`} tone="neutral" />
              </div>
              <Button
                className="w-full h-14 text-base font-semibold"
                onClick={() => update((s) => commitLiveMatchAndAdvance(s))}
              >
                Continue to next week <ChevronsRight className="size-5 ml-1" />
              </Button>
            </section>
          )}

          {lm.status !== "brief" && <section className="flex min-h-0 flex-col border-t bg-muted/20 lg:border-l lg:border-t-0">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                The story of the match
              </div>
              <div className="text-xs text-muted-foreground">{lm.events.length} events</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
              {lm.events.length === 0 ? (
                <div className="p-5 text-sm text-muted-foreground text-center">
                  No events yet.
                </div>
              ) : (
                <ul className="text-sm divide-y">
                  {lm.events.map((e, i) => (
                    <li key={i} className={cn("flex items-center gap-3 border-l-4 px-4 py-3", e.type === "goal" ? e.side === "us" ? "border-l-emerald-500 bg-emerald-500/5" : "border-l-rose-500 bg-rose-500/5" : "border-l-transparent")}>
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
          </section>}
          </div>
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
          active ? "bg-emerald-400 text-[#07130f] shadow-lg shadow-emerald-950/40" : "border border-white/15 bg-white/10 text-white",
        )}
      >
        {initials(name)}
      </div>
      <div className="font-display text-base sm:text-lg leading-tight truncate max-w-full text-white">
        {name}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-white/50">{label}</div>
    </div>
  );
}

function MatchPulse({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="flex items-center justify-center gap-2 border-r border-white/10 px-2 py-3 last:border-r-0"><Icon className="size-4 text-emerald-300" /><div className="text-left"><div className="text-sm font-bold tabular-nums">{value}</div><div className="text-[8px] uppercase tracking-wider text-white/45">{label}</div></div></div>;
}

function ReactionCard({ icon: Icon, label, text, tone }: { icon: typeof Flame; label: string; text: string; tone: "good" | "bad" | "neutral" }) {
  return <div className={cn("rounded-2xl border p-3", tone === "good" ? "border-emerald-500/20 bg-emerald-500/5" : tone === "bad" ? "border-rose-500/20 bg-rose-500/5" : "bg-muted/40")}><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><Icon className={cn("size-4", tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-primary")} />{label}</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{text}</p></div>;
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
