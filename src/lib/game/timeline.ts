import type { GameState } from "./types";
import { calendarDay } from "./calendar";
import { absoluteWeek } from "./time";

export type TimelineEventKind = "fixture" | "scouting" | "transfer" | "club";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  absoluteDay: number;
  week: number;
  day: number;
  label: string;
  detail?: string;
}

export function currentAbsoluteDay(state: GameState): number {
  return absoluteWeek(state.season, state.week) * 7 + calendarDay(state);
}

function seasonWeekFromAbsoluteDay(state: GameState, absoluteDay: number): { week: number; day: number } {
  const seasonStart = absoluteWeek(state.season, 1) * 7;
  const relative = Math.max(0, absoluteDay - seasonStart);
  return { week: Math.floor(relative / 7) + 1, day: relative % 7 };
}

/**
 * Chairman-facing projection of already-scheduled club events. This is a read
 * model only: domain systems remain responsible for resolving their events.
 */
export function upcomingTimelineEvents(state: GameState, horizonDays = 42): TimelineEvent[] {
  const now = currentAbsoluteDay(state);
  const end = now + Math.max(0, horizonDays);
  const events: TimelineEvent[] = [];

  for (const fixture of state.fixtures) {
    const absoluteDay = absoluteWeek(state.season, fixture.week) * 7 + 5;
    if (absoluteDay < now || absoluteDay > end) continue;
    events.push({
      id: `fixture:${fixture.week}:${fixture.opponent}`,
      kind: "fixture",
      absoluteDay,
      week: fixture.week,
      day: 5,
      label: "Matchday",
      detail: fixture.home ? "Home fixture" : "Away fixture",
    });
  }

  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    if (brief.status !== "active") continue;
    const absoluteDay = brief.dueAtDay ?? brief.createdAtAbsoluteWeek * 7 + 4;
    if (absoluteDay < now || absoluteDay > end) continue;
    const date = seasonWeekFromAbsoluteDay(state, absoluteDay);
    events.push({
      id: `scouting:${brief.id}`,
      kind: "scouting",
      absoluteDay,
      week: date.week,
      day: date.day,
      label: "Scouting report due",
      detail: brief.tacticalPosition ?? brief.position ?? "Player search",
    });
  }

  return events.sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id));
}

export function timelineEventsForWeek(state: GameState, week: number): TimelineEvent[] {
  return upcomingTimelineEvents(state).filter((event) => event.week === week);
}
