import { AlertCircle, CalendarDays, ChevronsRight, Mail, Pause, Play, Repeat2 } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { actionableInbox, importantUnread } from "@/lib/game/attention";
import {
  CALENDAR,
  DAY_NAMES,
  MATCHDAY_INDEX,
  calendarDay,
  isTransferWindowOpen,
} from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChairmanContinuePanel({
  state,
  isContinuing,
  startContinue,
  stopContinue,
  openInbox,
}: {
  state: GameState;
  isContinuing: boolean;
  startContinue: () => void;
  stopContinue: () => void;
  openInbox: () => void;
}) {
  const actionable = actionableInbox(state).slice(0, 2);
  const important = importantUnread(state).slice(0, Math.max(0, 2 - actionable.length));
  const cards = [...actionable, ...important];
  const currentDay = calendarDay(state);
  const hasFixture = state.fixtures.some((fixture) => fixture.week === state.week);
  const windowOpen = isTransferWindowOpen(state);
  const deadlineWeek = state.week === CALENDAR.preSeasonEnd || state.week === CALENDAR.midSeasonEnd;
  const deadlineDay = deadlineWeek && currentDay === 6;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border bg-card shadow-sm">
      <div className="panel-strip p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] opacity-70">
              <CalendarDays className="size-4" /> Week {state.week}
            </div>
            <div className="mt-1 font-display text-3xl leading-none sm:text-4xl">
              {isContinuing ? `${DAY_NAMES[currentDay]} — time is running` : DAY_NAMES[currentDay]}
            </div>
            <div className="mt-2 max-w-xl text-sm opacity-80">
              {deadlineDay
                ? "Transfer deadline day · final 24 hours of the window."
                : isContinuing
                  ? "Days move at a readable pace. Stop whenever you want; the game pauses itself for matches and important decisions."
                  : cards.length
                    ? `${cards.length} item${cards.length === 1 ? "" : "s"} worth checking before you move on.`
                    : "Nothing is blocking you. Continue until something genuinely needs your attention."}
            </div>
          </div>
          <div className="hidden size-14 shrink-0 place-items-center rounded-2xl bg-black/20 sm:grid">
            {isContinuing ? <Pause className="size-7" /> : <ChevronsRight className="size-7" />}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-1.5">
          {DAY_NAMES.map((day, index) => {
            const active = index === currentDay;
            const passed = index < currentDay;
            const matchday = hasFixture && index === MATCHDAY_INDEX;
            const closesWindow = windowOpen && deadlineWeek && index === 6;
            return (
              <div
                key={day}
                title={closesWindow ? "Transfer window closes · final 24 hours" : windowOpen ? "Transfer window open" : undefined}
                className={cn(
                  "relative rounded-xl border px-1 py-2 text-center transition-all",
                  active && "scale-[1.04] border-white/70 bg-white text-foreground shadow-md",
                  !active && passed && "border-white/10 bg-black/20 opacity-60",
                  !active && !passed && "border-white/15 bg-black/10",
                  closesWindow && !active && "ring-1 ring-amber-300/70",
                )}
              >
                <div className="text-[10px] font-bold uppercase tracking-wide">{day}</div>
                <div className="mt-1 flex min-h-3 items-center justify-center gap-1">
                  {windowOpen ? (
                    <Repeat2
                      aria-label={closesWindow ? "Transfer window closes" : "Transfer window open"}
                      className={cn("size-3", closesWindow && "animate-pulse")}
                    />
                  ) : null}
                  {matchday ? (
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        active ? "bg-amber-500" : "bg-amber-300",
                      )}
                    />
                  ) : null}
                </div>
                {closesWindow ? (
                  <div className="mt-1 text-[8px] font-black uppercase leading-none tracking-tight">
                    Last 24h
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <Button
          className="mt-5 h-16 w-full rounded-2xl text-lg font-bold shadow-lg"
          variant={isContinuing ? "destructive" : "secondary"}
          onClick={isContinuing ? stopContinue : startContinue}
        >
          {isContinuing ? <Pause className="mr-2 size-6" /> : <Play className="mr-2 size-6" />}
          {isContinuing ? "Stop" : "Continue"}
        </Button>
      </div>

      {cards.length > 0 && (
        <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {cards.map((item) => (
            <button
              key={item.id}
              onClick={openInbox}
              className="flex min-w-0 items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
                {item.status === "awaitingDecision" ? (
                  <AlertCircle className="size-5" />
                ) : (
                  <Mail className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.status === "awaitingDecision" ? "Action required" : "Important update"}
                </div>
                <div className="mt-0.5 truncate font-semibold">{item.subject}</div>
              </div>
              <ChevronsRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
