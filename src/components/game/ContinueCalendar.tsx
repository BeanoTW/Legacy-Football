import { useMemo, useState } from "react";
import { ArrowLeftRight, CalendarDays, ChevronsRight, Search, Trophy } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import {
  calendarRail,
  dayTarget,
  type AdvanceTarget,
  type RailDay,
  type RailFixture,
} from "@/lib/game/advancePlanner";

const FULL_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const PHASE_LABEL = {
  preseason: "Pre-season",
  firstHalf: "League",
  midseason: "Mid-season break",
  secondHalf: "League",
} as const;
const COMPETITION = {
  league: { label: "League", bar: "bg-emerald-500" },
  leagueCup: { label: "League Cup", bar: "bg-sky-500" },
  faCup: { label: "National Cup", bar: "bg-amber-500" },
  preseason: { label: "Friendly", bar: "bg-slate-400" },
} as Record<string, { label: string; bar: string }>;

function shortCode(name: string): string {
  const main = name.replace(/^(AFC|FC|The)\s+/i, "").split(/\s+/)[0] ?? name;
  return main.slice(0, 3).toUpperCase();
}

function resultTone(outcome: "W" | "D" | "L"): string {
  return outcome === "W" ? "bg-emerald-600 text-white" : outcome === "L" ? "bg-rose-600 text-white" : "bg-slate-500 text-white";
}

/**
 * Three weeks of the club calendar, one column per day. Tap a day to see what
 * is on it and to advance straight there.
 */
export function ContinueCalendar({
  state,
  isContinuing,
  onOpenSchedule,
  onAdvanceTo,
}: {
  state: GameState;
  isContinuing: boolean;
  onOpenSchedule?: () => void;
  onAdvanceTo?: (target: AdvanceTarget) => void;
}) {
  const days = useMemo(
    () =>
      calendarRail(state, 3).map((day) => ({
        ...day,
        fixtures: day.fixtures.map((fixture) => ({
          ...fixture,
          opponent: clubPresentationName(clubDisplayName(state, fixture.opponentRef)),
        })),
      })),
    [state],
  );
  const defaultSelection = useMemo(() => {
    const upcoming = days.filter((day) => !day.isPast);
    return (upcoming.find((day) => day.fixtures.some((fixture) => !fixture.result)) ?? upcoming[0] ?? days[0])?.absoluteDay;
  }, [days]);
  const [picked, setPicked] = useState<number | null>(null);
  const selectedDay = days.find((day) => day.absoluteDay === (picked ?? defaultSelection)) ?? days[0];
  const weeks = useMemo(() => {
    const groups: RailDay[][] = [];
    for (const day of days) {
      const last = groups[groups.length - 1];
      if (last && last[0].week === day.week) last.push(day);
      else groups.push([day]);
    }
    return groups;
  }, [days]);

  if (!selectedDay) return null;
  const target = dayTarget(state, selectedDay);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Club calendar">
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" /> Calendar
        </h3>
        {onOpenSchedule ? (
          <button type="button" onClick={onOpenSchedule} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            Full schedule
          </button>
        ) : null}
      </div>

      <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-2 pb-2 [scrollbar-width:none]">
        {weeks.map((week) => (
          <div key={week[0].week} className="w-full min-w-full shrink-0 snap-start px-1 md:min-w-[26rem] md:w-auto">
            <div className="mb-1 flex items-baseline justify-between px-0.5 text-[11px]">
              <span className="font-semibold">Week {week[0].week}</span>
              <span className="text-muted-foreground">
                {PHASE_LABEL[week[0].phase]}
                {week[0].windowOpen ? " · window open" : ""}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <DayCell
                  key={day.absoluteDay}
                  day={day}
                  selected={day.absoluteDay === selectedDay.absoluteDay}
                  advancing={day.isToday && isContinuing}
                  onSelect={() => setPicked(day.absoluteDay)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <DayDetail
        day={selectedDay}
        target={target}
        disabled={isContinuing}
        onAdvanceTo={onAdvanceTo}
      />
    </section>
  );
}

function DayCell({ day, selected, advancing, onSelect }: { day: RailDay; selected: boolean; advancing: boolean; onSelect: () => void }) {
  const fixture = day.fixtures[0];
  const hasScout = day.events.some((event) => event.kind === "scouting");
  const hasTransfer = day.events.some((event) => event.kind === "transfer");
  const summary = [
    `${FULL_DAY[day.day]} ${day.date} ${day.month}`,
    fixture ? `${fixture.home ? "home to" : "away at"} ${fixture.opponent}` : null,
    day.events.length ? `${day.events.length} club event${day.events.length === 1 ? "" : "s"}` : null,
    day.deadlineDay ? "transfer deadline day" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={summary}
      className={cn(
        "relative flex min-h-[5.6rem] min-w-0 flex-col items-center overflow-hidden rounded-lg border px-0.5 pb-2 pt-1.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        day.isToday ? "border-primary bg-primary text-primary-foreground" : day.isPast ? "border-transparent bg-muted/50 text-muted-foreground" : "bg-background hover:bg-muted/60",
        selected && !day.isToday && "border-primary ring-1 ring-primary",
        selected && day.isToday && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card",
      )}
    >
      <span className="text-[10px] leading-none opacity-75">{day.dayName}</span>
      <span className="mt-0.5 font-display text-lg leading-none">{day.date}</span>
      <span className={cn("text-[9px] leading-none", day.monthStart ? "font-semibold opacity-90" : "opacity-0")}>{day.month}</span>

      {fixture ? <FixtureChip fixture={fixture} onDark={day.isToday} /> : null}

      <span className="mt-auto flex h-3 items-center gap-0.5 pt-1" aria-hidden="true">
        {hasScout ? <Search className="size-2.5" /> : null}
        {hasTransfer ? <ArrowLeftRight className="size-2.5" /> : null}
        {day.fixtures.length > 1 ? <span className="text-[9px] font-semibold">+{day.fixtures.length - 1}</span> : null}
      </span>

      {/* Transfer window band along the foot of the day */}
      {day.windowOpen ? (
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-0 bottom-0 h-1", day.deadlineDay ? "bg-amber-400" : day.isToday ? "bg-primary-foreground/40" : "bg-primary/35")}
        />
      ) : null}
      {advancing ? <span aria-hidden="true" className="absolute inset-x-2 top-0 h-0.5 animate-pulse rounded-full bg-primary-foreground" /> : null}
    </button>
  );
}

function FixtureChip({ fixture, onDark }: { fixture: RailFixture; onDark: boolean }) {
  const competition = COMPETITION[fixture.competition] ?? COMPETITION.league;
  if (fixture.result) {
    return (
      <span className={cn("mt-1.5 rounded px-1 text-[10px] font-bold leading-4 tnum", resultTone(fixture.result.outcome))}>
        {fixture.result.goalsFor}–{fixture.result.goalsAgainst}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "relative mt-1.5 flex w-full max-w-[2.9rem] items-center justify-center overflow-hidden rounded border pl-1 text-[9px] font-bold leading-4",
        onDark ? "border-primary-foreground/40 bg-primary-foreground/15" : "bg-card",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", competition.bar)} aria-hidden="true" />
      <span className="truncate">{fixture.home ? "" : "@"}{shortCode(fixture.opponent)}</span>
    </span>
  );
}

function DayDetail({
  day,
  target,
  disabled,
  onAdvanceTo,
}: {
  day: RailDay;
  target: AdvanceTarget | null;
  disabled: boolean;
  onAdvanceTo?: (target: AdvanceTarget) => void;
}) {
  const nothing = day.fixtures.length === 0 && day.events.length === 0 && !day.deadlineDay;
  return (
    <div className="border-t bg-muted/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {FULL_DAY[day.day]} {day.date} {day.month}
            {day.isToday ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">Today</span> : null}
          </div>
        </div>
        {target && onAdvanceTo ? (
          <Button size="sm" disabled={disabled} onClick={() => onAdvanceTo(target)} className="shrink-0">
            <ChevronsRight /> Advance to {day.dayName}
          </Button>
        ) : null}
      </div>
      <ul className="mt-1.5 space-y-1 text-xs">
        {day.fixtures.map((fixture, index) => (
          <li key={`${fixture.opponent}-${index}`} className="flex items-center gap-2">
            <Trophy className="size-3.5 shrink-0 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate">
              {fixture.home ? "Home to" : "Away at"} <strong className="font-semibold">{fixture.opponent}</strong>
              <span className="text-muted-foreground"> · {(COMPETITION[fixture.competition] ?? COMPETITION.league).label}</span>
            </span>
            {fixture.result ? (
              <span className={cn("rounded px-1.5 text-[11px] font-bold leading-5 tnum", resultTone(fixture.result.outcome))}>
                {fixture.result.outcome} {fixture.result.goalsFor}–{fixture.result.goalsAgainst}
              </span>
            ) : null}
          </li>
        ))}
        {day.events.map((event) => (
          <li key={event.id} className="flex items-center gap-2">
            {event.kind === "scouting" ? <Search className="size-3.5 shrink-0 text-primary" /> : <ArrowLeftRight className="size-3.5 shrink-0 text-primary" />}
            <span className="min-w-0 flex-1 truncate">
              {event.label}
              {event.detail ? <span className="text-muted-foreground"> · {event.detail}</span> : null}
            </span>
          </li>
        ))}
        {day.deadlineDay ? (
          <li className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
            <ArrowLeftRight className="size-3.5 shrink-0" /> Transfer deadline day: the window closes at midnight
          </li>
        ) : null}
        {nothing ? (
          <li className="text-muted-foreground">
            {day.isPast ? "Nothing happened on this day." : "Nothing scheduled yet."}
          </li>
        ) : null}
      </ul>
    </div>
  );
}