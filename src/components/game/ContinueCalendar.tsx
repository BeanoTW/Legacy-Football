import { AlertTriangle, CalendarDays, RefreshCcw, Trophy } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { calendarDay, DAY_NAMES, isTransferWindowOpen } from "@/lib/game/calendar";
import { cn } from "@/lib/utils";
import { timelineEventsForWeek, type TimelineEvent } from "@/lib/game/timeline";

function eventIcon(event: TimelineEvent) {
  if (event.kind === "fixture") return <Trophy className="size-3.5" />;
  if (event.label.toLowerCase().includes("deadline")) return <AlertTriangle className="size-3.5" />;
  return <CalendarDays className="size-3.5" />;
}

export function ContinueCalendar({
  state,
  isContinuing,
  onOpenSchedule,
}: {
  state: GameState;
  isContinuing: boolean;
  onOpenSchedule?: () => void;
}) {
  const currentDay = calendarDay(state);
  const events = timelineEventsForWeek(state, state.week);
  const transferOpen = isTransferWindowOpen(state);

  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Week {state.week}
          </div>
          <div className="text-sm font-semibold">This week</div>
        </div>
        <div className="flex items-center gap-2">
          {transferOpen && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
              <RefreshCcw className="size-3.5" /> Transfer window
            </span>
          )}
          {onOpenSchedule && (
            <button
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
              onClick={onOpenSchedule}
            >
              <CalendarDays className="size-3.5" /> Full schedule
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border" aria-label={`Week ${state.week}`}>
        {DAY_NAMES.map((day, index) => {
          const active = index === currentDay;
          const passed = index < currentDay;
          const dayEvents = events.filter((event) => event.day === index);
          const primary = dayEvents[0];
          return (
            <div
              key={day}
              className={cn(
                "relative min-h-16 border-r px-1.5 py-2 text-center last:border-r-0",
                active && "bg-primary text-primary-foreground",
                passed && !active && "bg-muted/50 text-muted-foreground",
                !passed && !active && "bg-background",
                active && isContinuing && "ring-1 ring-inset ring-primary-foreground/50",
              )}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide">{day}</div>
              {transferOpen && (
                <RefreshCcw
                  aria-label="Transfer window open"
                  className={cn(
                    "absolute right-1 top-1 size-2.5",
                    active ? "text-primary-foreground/75" : "text-primary/70",
                  )}
                />
              )}
              <div className="mt-2 flex min-h-5 items-center justify-center gap-1">
                {primary ? (
                  <span
                    title={`${primary.label}${primary.detail ? ` — ${primary.detail}` : ""}`}
                    className={cn(
                      "grid size-6 place-items-center rounded-full",
                      primary.kind === "fixture"
                        ? active
                          ? "bg-primary-foreground/20"
                          : "bg-emerald-500/10 text-emerald-700"
                        : primary.label.toLowerCase().includes("deadline")
                          ? active
                            ? "bg-primary-foreground/20"
                            : "bg-amber-500/10 text-amber-700"
                          : active
                            ? "bg-primary-foreground/20"
                            : "bg-primary/10 text-primary",
                    )}
                  >
                    {eventIcon(primary)}
                  </span>
                ) : (
                  <span className={cn("size-1.5 rounded-full", active ? "bg-current/40" : "bg-border")} />
                )}
                {dayEvents.length > 1 && <span className="text-[9px] font-bold">+{dayEvents.length - 1}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {events.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {events.map((event) => (
            <div
              key={event.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs",
                event.kind === "fixture" && "border-emerald-500/30 bg-emerald-500/5",
                event.label.toLowerCase().includes("deadline") && "border-amber-500/30 bg-amber-500/5",
              )}
            >
              <span className="shrink-0">{eventIcon(event)}</span>
              <span className="font-bold">{DAY_NAMES[event.day]}</span>
              <span className="font-semibold">{event.label}</span>
              {event.detail && <span className="min-w-0 truncate text-muted-foreground">· {event.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
