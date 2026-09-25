import type { GameState } from "./types";
import {
  CALENDAR,
  DAY_NAMES,
  WINDOW_PRESEASON_END,
  calendarDay,
  phaseOf,
  seasonDateForSlot,
  seasonMonthName,
} from "./calendar";
import { currentAbsoluteDay, upcomingTimelineEvents, type TimelineEvent } from "./timeline";
import { clubDisplayName, isUserClubReference } from "./clubReference";
import { clubPresentationName } from "./clubPresentation";

/*
 * Read-only planning helpers for the calendar rail and the time-advance
 * screen. Nothing here changes state; the engine still decides what happens
 * on each day and when time must stop.
 */

type Fixture = GameState["fixtures"][number];
type Result = GameState["results"][number];

export interface RailFixture {
  opponent: string;
  home: boolean;
  competition: NonNullable<Fixture["competition"]> | "league" | "preseason";
  result?: { goalsFor: number; goalsAgainst: number; outcome: "W" | "D" | "L" };
}

export interface RailDay {
  absoluteDay: number;
  week: number;
  day: number;
  dayName: (typeof DAY_NAMES)[number];
  date: number;
  month: string;
  /** First day of a month, used to print the month name on the rail. */
  monthStart: boolean;
  isToday: boolean;
  isPast: boolean;
  fixtures: RailFixture[];
  events: TimelineEvent[];
  windowOpen: boolean;
  deadlineDay: boolean;
  phase: ReturnType<typeof phaseOf>;
}

function windowOpenInWeek(week: number): boolean {
  return week <= WINDOW_PRESEASON_END || phaseOf(week) === "midseason";
}

function isDeadlineSlot(week: number, day: number): boolean {
  return windowOpenInWeek(week) && (week === WINDOW_PRESEASON_END || week === CALENDAR.midSeasonEnd) && day === 6;
}

function fixtureCompetitionOf(fixture: Fixture): RailFixture["competition"] {
  return fixture.competition ?? (fixture.week <= CALENDAR.preSeasonEnd ? "preseason" : "league");
}

function resultFor(state: GameState, fixture: Fixture): Result | undefined {
  const competition = fixtureCompetitionOf(fixture);
  return state.results.find(
    (result) =>
      result.week === fixture.week &&
      (result.competition ?? "league") === competition &&
      (result.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
      result.opponent === fixture.opponent,
  );
}

function outcome(goalsFor: number, goalsAgainst: number): "W" | "D" | "L" {
  return goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";
}

export function opponentName(state: GameState, reference: string): string {
  return clubPresentationName(clubDisplayName(state, reference));
}

/**
 * Day-by-day view of the coming weeks, starting at the Monday of the current
 * week so the rail always reads in whole weeks.
 */
export function calendarRail(state: GameState, weeks = 3): RailDay[] {
  const today = calendarDay(state);
  const nowAbsolute = currentAbsoluteDay(state);
  const mondayAbsolute = nowAbsolute - today;
  const horizon = weeks * 7;
  const events = upcomingTimelineEvents(state, horizon).filter((event) => event.kind !== "fixture");
  const days: RailDay[] = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const week = state.week + Math.floor(offset / 7);
    if (week > CALENDAR.seasonEnd) break;
    const day = offset % 7;
    const absoluteDay = mondayAbsolute + offset;
    const date = seasonDateForSlot(week, day);
    const fixtures = state.fixtures
      .filter((fixture) => fixture.week === week && (fixture.dayOfWeek ?? 5) === day)
      .map((fixture): RailFixture => {
        const result = resultFor(state, fixture);
        return {
          opponent: opponentName(state, fixture.opponent),
          home: fixture.home,
          competition: fixtureCompetitionOf(fixture),
          result: result
            ? {
                goalsFor: result.goalsFor,
                goalsAgainst: result.goalsAgainst,
                outcome: outcome(result.goalsFor, result.goalsAgainst),
              }
            : undefined,
        };
      });
    days.push({
      absoluteDay,
      week,
      day,
      dayName: DAY_NAMES[day],
      date: date.day,
      month: seasonMonthName(date.month).slice(0, 3),
      monthStart: date.day === 1,
      isToday: absoluteDay === nowAbsolute,
      isPast: absoluteDay < nowAbsolute,
      fixtures,
      events: events.filter((event) => event.absoluteDay === absoluteDay),
      windowOpen: windowOpenInWeek(week),
      deadlineDay: isDeadlineSlot(week, day),
      phase: phaseOf(week),
    });
  }
  return days;
}

export type AdvanceTargetId = "anything" | "matchday" | "weekEnd" | "deadline" | "day";

export interface AdvanceTarget {
  id: AdvanceTargetId;
  label: string;
  detail: string;
  /** Absolute day to stop on. Undefined means "until something needs me". */
  untilAbsoluteDay?: number;
  daysAway?: number;
}

function daysAwayLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** Sensible places to advance to from today. Time still stops early for decisions and matches. */
export function advanceTargets(state: GameState): AdvanceTarget[] {
  const now = currentAbsoluteDay(state);
  const today = calendarDay(state);
  const targets: AdvanceTarget[] = [
    { id: "anything", label: "Continue", detail: "Until something needs you" },
  ];

  const nextMatch = calendarRail(state, 6)
    .filter((day) => day.absoluteDay > now)
    .find((day) => day.fixtures.some((fixture) => !fixture.result));
  if (nextMatch) {
    const fixture = nextMatch.fixtures.find((item) => !item.result)!;
    const days = nextMatch.absoluteDay - now;
    targets.push({
      id: "matchday",
      label: "Next match",
      detail: `${nextMatch.dayName} ${fixture.home ? "vs" : "at"} ${fixture.opponent} · ${daysAwayLabel(days)}`,
      untilAbsoluteDay: nextMatch.absoluteDay,
      daysAway: days,
    });
  }

  if (today < 6) {
    targets.push({
      id: "weekEnd",
      label: "End of week",
      detail: `Sunday · ${daysAwayLabel(6 - today)}`,
      untilAbsoluteDay: now + (6 - today),
      daysAway: 6 - today,
    });
  }

  const deadlineWeek = state.week <= WINDOW_PRESEASON_END ? WINDOW_PRESEASON_END : phaseOf(state.week) === "midseason" ? CALENDAR.midSeasonEnd : null;
  if (deadlineWeek !== null) {
    const days = (deadlineWeek - state.week) * 7 + (6 - today);
    if (days > 0) {
      targets.push({
        id: "deadline",
        label: "Deadline day",
        detail: `Transfer window closes · ${daysAwayLabel(days)}`,
        untilAbsoluteDay: now + days,
        daysAway: days,
      });
    }
  }
  return targets;
}

export function dayTarget(state: GameState, day: RailDay): AdvanceTarget | null {
  const now = currentAbsoluteDay(state);
  if (day.absoluteDay <= now) return null;
  return {
    id: "day",
    label: `${day.dayName} ${day.date} ${day.month}`,
    detail: daysAwayLabel(day.absoluteDay - now),
    untilAbsoluteDay: day.absoluteDay,
    daysAway: day.absoluteDay - now,
  };
}

export function leaguePosition(state: GameState): number | null {
  const sorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const index = sorted.findIndex((row) => isUserClubReference(state, row.team));
  return index >= 0 && sorted[index].p > 0 ? index + 1 : null;
}

export interface AdvanceDigest {
  daysPassed: number;
  cashDelta: number;
  fanDelta: number;
  reputationDelta: number;
  positionBefore: number | null;
  positionAfter: number | null;
  results: Array<{ opponent: string; home: boolean; goalsFor: number; goalsAgainst: number; outcome: "W" | "D" | "L"; week: number; day: number }>;
  newItems: GameState["inbox"];
  decisions: number;
}

/** What changed between pressing Continue and now. */
export function advanceDigest(before: GameState, after: GameState): AdvanceDigest {
  const known = new Set(before.inbox.map((item) => item.id));
  const newItems = after.inbox
    .filter((item) => !known.has(item.id))
    .sort((a, b) => b.season - a.season || b.week - a.week || b.id.localeCompare(a.id));
  const resultKey = (result: Result) => `${result.week}:${result.dayOfWeek ?? 5}:${result.competition ?? "league"}:${result.opponent}`;
  const played = new Set(before.season === after.season ? before.results.map(resultKey) : []);
  const results = after.results.filter((result) => !played.has(resultKey(result))).map((result) => ({
    opponent: opponentName(after, result.opponent),
    home: result.home,
    goalsFor: result.goalsFor,
    goalsAgainst: result.goalsAgainst,
    outcome: outcome(result.goalsFor, result.goalsAgainst),
    week: result.week,
    day: result.dayOfWeek ?? 5,
  }));
  return {
    daysPassed: Math.max(0, currentAbsoluteDay(after) - currentAbsoluteDay(before)),
    cashDelta: after.cash - before.cash,
    fanDelta: after.fanHappiness - before.fanHappiness,
    reputationDelta: after.reputation - before.reputation,
    positionBefore: leaguePosition(before),
    positionAfter: leaguePosition(after),
    results,
    newItems,
    decisions: newItems.filter((item) => item.status === "awaitingDecision").length,
  };
}