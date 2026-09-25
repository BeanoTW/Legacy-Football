import { useMemo } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Flag,
  Mail,
  Pause,
  Play,
  Repeat2,
  Trophy,
  X,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/game/engine";
import {
  calendarDay,
  isTransferDeadlineDay,
  seasonDateForSlot,
  seasonMonthName,
  transferDeadlineHoursRemaining,
} from "@/lib/game/calendar";
import { currentAbsoluteDay } from "@/lib/game/timeline";
import { requiresInboxDecision } from "@/lib/game/inbox";
import {
  advanceDigest,
  calendarRail,
  opponentName,
  type AdvanceTarget,
} from "@/lib/game/advancePlanner";
import type { ContinueSpeed } from "@/hooks/useGame";

const FULL_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const OVERLAY_CSS = `
@keyframes lf-day-flip { from { opacity: 0; transform: translateY(-40%) rotateX(55deg); } to { opacity: 1; transform: none; } }
@keyframes lf-feed-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.lf-day-flip { animation: lf-day-flip .38s cubic-bezier(.2,.8,.2,1); transform-origin: 50% 0; }
.lf-feed-in { animation: lf-feed-in .3s ease-out; }
@media (prefers-reduced-motion: reduce) { .lf-day-flip, .lf-feed-in { animation: none; } }
`;

export function AdvanceOverlay({
  state,
  startState,
  isContinuing,
  reason,
  target,
  speed,
  onSpeed,
  onStop,
  onContinue,
  onClose,
  onOpenInbox,
  onOpenMatchday,
}: {
  state: GameState;
  /** The state when Continue was pressed, for the running digest. */
  startState: GameState | null;
  isContinuing: boolean;
  reason: string | null;
  target: AdvanceTarget | null;
  speed: ContinueSpeed;
  onSpeed: (speed: ContinueSpeed) => void;
  onStop: () => void;
  onContinue: () => void;
  onClose: () => void;
  onOpenInbox: () => void;
  onOpenMatchday: () => void;
}) {
  const day = calendarDay(state);
  const date = seasonDateForSlot(state.week, day);
  const now = currentAbsoluteDay(state);
  const deadline = isTransferDeadlineDay(state);
  const hoursLeft = transferDeadlineHoursRemaining(state);
  const digest = useMemo(() => (startState ? advanceDigest(startState, state) : null), [startState, state]);
  const stopped = !isContinuing;
  const decisions = state.inbox.filter(requiresInboxDecision);
  const matchday = stopped && !!reason && reason.toLowerCase().includes("matchday");
  const todaysFixture = matchday
    ? state.fixtures.find((fixture) => fixture.week === state.week && (fixture.dayOfWeek ?? 5) === day)
    : undefined;
  const reachedTarget = stopped && !!reason?.startsWith("Reached");

  // Progress from the day Continue was pressed to the stop (or the end of the week).
  const startDay = startState ? currentAbsoluteDay(startState) : now;
  const endDay = target?.untilAbsoluteDay ?? Math.max(now, startDay + (6 - (startState ? calendarDay(startState) : day)));
  const span = Math.max(1, endDay - startDay);
  const rail = useMemo(() => {
    const all = calendarRail(startState ?? state, Math.ceil((span + 8) / 7) + 1);
    return all.filter((cell) => cell.absoluteDay >= startDay && cell.absoluteDay <= endDay).slice(0, 14);
  }, [endDay, span, startDay, startState, state]);
  const progress = Math.min(1, Math.max(0, (now - startDay) / span));

  const status = deadline ? "Deadline day" : matchday ? "Matchday" : isContinuing ? "Time running" : "Paused";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 px-2 pb-[calc(4.5rem+env(safe-area-inset-bottom))] pt-16 backdrop-blur-[2px] md:items-center md:px-6 md:pb-6">
      <style>{OVERLAY_CSS}</style>
      <section
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Time advance"
      >
        {/* Date header */}
        <header className="panel-strip relative shrink-0 px-5 pb-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 [perspective:600px]" aria-live="polite">
              <div key={now} className="lf-day-flip">
                <div className="font-display text-4xl leading-none">{deadline ? `${hoursLeft}h left` : FULL_DAY[day]}</div>
                <div className="mt-1 text-sm opacity-80">
                  {date.day} {seasonMonthName(date.month)} · Week {state.week}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                  isContinuing ? "bg-white/15" : deadline ? "bg-amber-400 text-amber-950" : matchday ? "bg-emerald-400 text-emerald-950" : "bg-black/25",
                )}
              >
                {isContinuing ? <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" /> : null}
                {status}
              </span>
              {stopped ? (
                <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg hover:bg-white/10">
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Journey to the stop */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] opacity-75">
              <span>{target ? `Heading to ${target.label.toLowerCase() === "next match" ? "the next match" : target.label}` : "Until something needs you"}</span>
              {target?.untilAbsoluteDay !== undefined ? <span>{Math.max(0, target.untilAbsoluteDay - now)} days to go</span> : null}
            </div>
            {rail.length > 1 && rail.length <= 14 ? (
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${rail.length}, minmax(0, 1fr))` }}>
                {rail.map((cell) => {
                  const passed = cell.absoluteDay < now;
                  const current = cell.absoluteDay === now;
                  const isStop = cell.absoluteDay === endDay && !!target;
                  return (
                    <div key={cell.absoluteDay} className="flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          "relative h-1.5 w-full rounded-full transition-colors duration-300",
                          passed ? "bg-white/85" : current ? "bg-white" : "bg-white/20",
                          current && isContinuing && "animate-pulse",
                        )}
                      />
                      <span className={cn("text-[9px] leading-none", current ? "font-bold" : "opacity-60")}>{cell.dayName[0]}</span>
                      {cell.fixtures.length ? <Trophy className="size-2.5 opacity-80" aria-label="Match" /> : isStop ? <Flag className="size-2.5" aria-label="Stop" /> : <span className="size-2.5" />}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
          </div>
        </header>

        {/* What changed since Continue */}
        {digest ? (
          <div className="grid shrink-0 grid-cols-4 divide-x border-b text-center">
            <Metric label="Days" value={String(digest.daysPassed)} />
            <Metric
              label="Cash"
              value={`${digest.cashDelta > 0 ? "+" : digest.cashDelta < 0 ? "−" : ""}${fmtMoney(Math.abs(digest.cashDelta))}`}
              tone={digest.cashDelta > 0 ? "up" : digest.cashDelta < 0 ? "down" : undefined}
            />
            <Metric
              label="League"
              value={digest.positionAfter ? ordinal(digest.positionAfter) : "–"}
              tone={
                digest.positionBefore && digest.positionAfter
                  ? digest.positionAfter < digest.positionBefore
                    ? "up"
                    : digest.positionAfter > digest.positionBefore
                      ? "down"
                      : undefined
                  : undefined
              }
              arrow
            />
            <Metric label="Messages" value={String(digest.newItems.length)} tone={digest.decisions ? "alert" : undefined} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {/* Why time stopped */}
          {stopped && reason ? (
            <div
              className={cn(
                "mb-3 rounded-2xl border p-3",
                matchday ? "border-emerald-500/40 bg-emerald-500/5" : reachedTarget ? "border-primary/40 bg-primary/5" : "border-amber-500/40 bg-amber-500/5",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-xl",
                    matchday ? "bg-emerald-500/15 text-emerald-700" : reachedTarget ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-700",
                  )}
                >
                  {matchday ? <Trophy className="size-4" /> : reachedTarget ? <Flag className="size-4" /> : <AlertCircle className="size-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {matchday
                      ? todaysFixture
                        ? `${todaysFixture.home ? "Home to" : "Away at"} ${opponentName(state, todaysFixture.opponent)}`
                        : "It's matchday"
                      : reachedTarget
                        ? reason
                        : decisions.length
                          ? "A decision needs you"
                          : "Something needs your attention"}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {matchday
                      ? "The week waits here until the match is played."
                      : reachedTarget
                        ? "Time has stopped where you asked."
                        : reason}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {deadline ? (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs">
              <Repeat2 className="size-4 shrink-0 text-amber-600" />
              Deadline day runs hour by hour. The window shuts when the clock reaches midnight.
            </div>
          ) : null}

          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">
            {startState ? "Since you pressed Continue" : "Latest"}
          </h3>
          <Feed digest={digest} onOpenInbox={onOpenInbox} />
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t bg-card p-3">
          {isContinuing ? (
            <>
              <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Speed">
                {([1, 2, 4] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={speed === option}
                    onClick={() => onSpeed(option)}
                    className={cn("rounded-md px-2.5 py-1.5 text-xs tnum", speed === option ? "bg-background font-semibold shadow-sm" : "text-muted-foreground")}
                  >
                    {option}×
                  </button>
                ))}
              </div>
              <Button variant="destructive" className="ml-auto h-11 min-w-32" onClick={onStop}>
                <Pause /> {deadline ? "Pause" : "Stop"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-11" onClick={onClose}>
                Close
              </Button>
              {matchday ? (
                <Button className="ml-auto h-11" onClick={onOpenMatchday}>
                  Go to matchday <ChevronRight />
                </Button>
              ) : decisions.length || (!reachedTarget && reason) ? (
                <Button className="ml-auto h-11" onClick={onOpenInbox}>
                  Open inbox <ChevronRight />
                </Button>
              ) : (
                <Button className="ml-auto h-11" onClick={onContinue}>
                  <Play /> Keep going
                </Button>
              )}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function Metric({ label, value, tone, arrow = false }: { label: string; value: string; tone?: "up" | "down" | "alert"; arrow?: boolean }) {
  return (
    <div className="px-1.5 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 flex items-center justify-center gap-0.5 font-display text-base leading-none tnum",
          tone === "up" && "text-emerald-600",
          tone === "down" && "text-rose-600",
          tone === "alert" && "text-amber-600",
        )}
      >
        {arrow && tone === "up" ? <ArrowUp className="size-3" /> : null}
        {arrow && tone === "down" ? <ArrowDown className="size-3" /> : null}
        {value}
      </div>
    </div>
  );
}

function Feed({ digest, onOpenInbox }: { digest: ReturnType<typeof advanceDigest> | null; onOpenInbox: () => void }) {
  if (!digest || (digest.results.length === 0 && digest.newItems.length === 0)) {
    return (
      <div className="rounded-2xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
        News, results and messages appear here as the days pass.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {digest.results
        .slice()
        .reverse()
        .map((result) => (
          <li key={`r-${result.week}-${result.day}-${result.opponent}`} className="lf-feed-in flex items-center gap-3 rounded-xl border bg-background px-3 py-2">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
                result.outcome === "W" ? "bg-emerald-600" : result.outcome === "L" ? "bg-rose-600" : "bg-slate-500",
              )}
            >
              {result.outcome}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {result.home ? "vs" : "at"} <strong className="font-semibold">{result.opponent}</strong>
            </span>
            <span className="font-display text-base tnum">
              {result.goalsFor}–{result.goalsAgainst}
            </span>
          </li>
        ))}
      {digest.newItems.map((item) => {
        const decision = item.status === "awaitingDecision";
        return (
          <li key={item.id} className="lf-feed-in">
            <button
              type="button"
              onClick={onOpenInbox}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-muted/50",
                decision ? "border-amber-500/50 bg-amber-500/5" : "bg-background",
              )}
            >
              {decision ? <AlertCircle className="size-4 shrink-0 text-amber-600" /> : <Mail className="size-4 shrink-0 text-primary" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.subject}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.department}
                  {decision ? " · decision needed" : ""}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ordinal(value: number): string {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}