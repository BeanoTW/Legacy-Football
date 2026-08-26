import { CalendarDays } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { calendarDay } from "@/lib/game/calendar";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MATCH_DAY = 5;

export function ContinueCalendar({ state, isContinuing }: { state: GameState; isContinuing: boolean }) {
  const day = calendarDay(state);
  const fixture = state.fixtures.find((item) => item.week === state.week);

  return (
    <div className="shrink-0 border-b bg-card">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-3 py-1.5 md:gap-3 md:px-5">
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <CalendarDays className={cn("size-4 text-primary", isContinuing && "animate-pulse")} />
          <div className="leading-tight">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Calendar</div>
            <div className="text-xs font-semibold">Week {state.week}</div>
          </div>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {DAYS.map((label, index) => {
            const active = index === day;
            const passed = index < day;
            const isMatch = !!fixture && index === MATCH_DAY;
            return (
              <div
                key={label}
                className={cn(
                  "relative rounded border px-0.5 py-1 text-center transition-all duration-300",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm",
                  passed && "border-primary/20 bg-primary/5 text-muted-foreground",
                  !active && !passed && "bg-background text-muted-foreground",
                  active && isContinuing && "ring-2 ring-primary/20",
                )}
              >
                <span className="text-[9px] font-semibold uppercase sm:text-[10px]">{label}</span>
                {isMatch && (
                  <span className={cn("absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-amber-500 ring-1 ring-card", active && "ring-primary")} />
                )}
              </div>
            );
          })}
        </div>
        <div className="hidden min-w-28 text-right text-[10px] leading-tight text-muted-foreground md:block">
          {isContinuing ? `Advancing · ${DAYS[day]}` : fixture ? `${fixture.home ? "Home" : "Away"} vs ${fixture.opponent}` : "No fixture this week"}
        </div>
      </div>
    </div>
  );
}
