import { CalendarDays } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { calendarDay } from "@/lib/game/calendar";
import { cn } from "@/lib/utils";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { CALENDAR } from "@/lib/game/engine";

export function ContinueCalendar({
  state,
  isContinuing,
  onOpenSchedule,
}: {
  state: GameState;
  isContinuing: boolean;
  onOpenSchedule?: () => void;
}) {
  const day = calendarDay(state);
  const weeks = Array.from({ length: 6 }, (_, offset) => state.week + offset).filter(
    (week) => week <= CALENDAR.seasonEnd,
  );

  return (
    <div className="lf-week-strip">
      <div className="lf-week-cards">
        {weeks.map((week, index) => {
          const fixture = state.fixtures.find((item) => item.week === week);
          const active = index === 0;
          const opponent = fixture ? clubPresentationName(clubDisplayName(state, fixture.opponent)) : null;
          return (
            <div
              key={week}
              className={cn(
                "lf-week-card",
                active && "is-active",
                active && isContinuing && "is-advancing",
              )}
            >
              <div className="lf-week-number">W{week}</div>
              <div className="lf-week-type">
                {fixture ? (week <= 6 ? "Friendly" : "League") : active ? "This week" : "Open"}
              </div>
              <div className="lf-week-meta">
                {fixture
                  ? `${fixture.home ? "H" : "A"} · ${opponent}`
                  : active
                    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]
                    : "—"}
              </div>
            </div>
          );
        })}
        <button className="lf-full-schedule" onClick={onOpenSchedule}>
          <CalendarDays className="size-4" />
          <span>Full schedule</span>
        </button>
      </div>
    </div>
  );
}
