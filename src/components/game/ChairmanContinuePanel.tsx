import {
  AlertCircle,
  CalendarDays,
  ChevronsRight,
  Mail,
  Pause,
  Play,
  RefreshCcw,
  Trophy,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { actionableInbox, importantUnread } from "@/lib/game/attention";
import { DAY_NAMES, calendarDay, isTransferWindowOpen } from "@/lib/game/engine";
import { timelineEventsForWeek } from "@/lib/game/timeline";
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
  const weekEvents = timelineEventsForWeek(state, state.week);
  const transferOpen = isTransferWindowOpen(state);

  return (
    <section className="overflow-hidden rounded-[1.75rem] border bg-card shadow-sm">
      <div className="panel-strip p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] opacity-70">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="size-4" /> Week {state.week}
              </span>
              {transferOpen && (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/10 px-2 py-1 tracking-normal">
                  <RefreshCcw className="size-3.5" /> Transfer window open
                </span>
              )}
            </div>
            <div className="mt-1 font-display text-3xl leading-none sm:text-4xl">
              {isContinuing ? `${DAY_NAMES[currentDay]} — time is running` : DAY_NAMES[currentDay]}
            </div>
            <div className="mt-2 max-w-xl text-sm opacity-80">
              {isContinuing
                ? "Days move at a readable pace. Stop whenever you want; the game pauses itself for matches and important decisions."
                : cards.length
                  ? `${cards.length} item${cards.length === 1 ? "" : "s"} worth checking before you move on.`
                  : weekEvents.length
                    ? `${weekEvents.length} scheduled item${weekEvents.length === 1 ? "" : "s"} this week.`
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
            const dayEvents = weekEvents.filter((event) => event.day === index);
            const fixture = dayEvents.find((event) => event.kind === "fixture");
            const deadline = dayEvents.find((event) => event.label.toLowerCase().includes("deadline"));
            const primary = fixture ?? deadline ?? dayEvents[0];
            return (
              <div
                key={day}
                className={cn(
                  "relative min-h-16 rounded-xl border px-1 py-2 text-center transition-all",
                  active && "scale-[1.04] border-white/70 bg-white text-foreground shadow-md",
                  !active && passed && "border-white/10 bg-black/20 opacity-60",
                  !active && !passed && "border-white/15 bg-black/10",
                )}
              >
                <div className="text-[10px] font-bold uppercase tracking-wide">{day}</div>
                {transferOpen && (
                  <RefreshCcw
                    aria-label="Transfer window open"
                    className={cn(
                      "absolute right-1 top-1 size-2.5",
                      active ? "text-primary" : "text-white/65",
                    )}
                  />
                )}
                <div className="mt-2 flex items-center justify-center gap-1">
                  {primary ? (
                    primary.kind === "fixture" ? (
                      <Trophy className={cn("size-4", active ? "text-emerald-700" : "text-amber-300")} />
                    ) : primary.label.toLowerCase().includes("deadline") ? (
                      <AlertCircle className={cn("size-4", active ? "text-amber-700" : "text-amber-300")} />
                    ) : (
                      <CalendarDays className="size-4" />
                    )
                  ) : (
                    <span className={cn("size-1.5 rounded-full", active ? "bg-muted-foreground/40" : "bg-white/20")} />
                  )}
                  {dayEvents.length > 1 && <span className="text-[9px] font-bold">+{dayEvents.length - 1}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {weekEvents.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {weekEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/10 px-3 py-2 text-xs">
                {event.kind === "fixture" ? (
                  <Trophy className="size-3.5 shrink-0" />
                ) : event.label.toLowerCase().includes("deadline") ? (
                  <AlertCircle className="size-3.5 shrink-0" />
                ) : (
                  <CalendarDays className="size-3.5 shrink-0" />
                )}
                <span className="font-bold">{DAY_NAMES[event.day]}</span>
                <span className="font-semibold">{event.label}</span>
                {event.detail && <span className="min-w-0 truncate opacity-75">· {event.detail}</span>}
              </div>
            ))}
          </div>
        )}

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
