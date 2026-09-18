import { CalendarDays } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { calendarDay, DAY_NAMES } from "@/lib/game/calendar";
import { cn } from "@/lib/utils";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { CALENDAR } from "@/lib/game/engine";
import { timelineEventsForWeek } from "@/lib/game/timeline";
import {
  competitionLabel,
  fixtureCompetition,
  fixtureDate,
  fixtureKey,
  resultForFixture,
} from "./fixturePresentation";

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
          const fixtures = state.fixtures
            .filter((item) => item.week === week)
            .sort((a, b) => (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5));
          const active = index === 0;
          const events = timelineEventsForWeek(state, week);
          const nonFixtureEvents = events.filter((event) => event.kind !== "fixture");
          const nextEvent = nonFixtureEvents[0];
          const extraEvents = Math.max(0, nonFixtureEvents.length - 1);
          return (
            <div
              key={week}
              className={cn(
                "lf-week-card",
                active && "is-active",
                active && isContinuing && "is-advancing",
              )}
            >
              <div className="lf-week-head">
                <div className="lf-week-number">W{week}</div>
                {fixtures.length > 1 && <span>{fixtures.length} matches</span>}
              </div>
              {fixtures.length > 0 ? (
                <div className="lf-week-fixtures">
                  {fixtures.map((fixture) => {
                    const date = fixtureDate(fixture);
                    const result = resultForFixture(state, fixture);
                    const competition = fixtureCompetition(fixture);
                    return (
                      <div key={fixtureKey(fixture)} className={cn("lf-week-fixture", `is-${competition}`)}>
                        <span className="lf-week-fixture-day">{date.dayName} {date.day}</span>
                        <span className="lf-week-fixture-opponent">
                          {fixture.home ? "H" : "A"} · {clubPresentationName(clubDisplayName(state, fixture.opponent))}
                        </span>
                        <span className="lf-week-fixture-status">
                          {result ? `${result.goalsFor}–${result.goalsAgainst}` : competitionLabel(competition)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="lf-week-meta">
                  {nextEvent
                    ? `${DAY_NAMES[nextEvent.day]} · ${nextEvent.label}${extraEvents ? ` +${extraEvents}` : ""}`
                    : active
                      ? `${DAY_NAMES[day]} · No fixture`
                      : "Open week"}
                </div>
              )}
              {fixtures.length > 0 && nextEvent ? <div className="lf-week-meta">{DAY_NAMES[nextEvent.day]} · {nextEvent.label}{extraEvents ? ` +${extraEvents}` : ""}</div> : null}
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
