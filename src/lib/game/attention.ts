import type { GameState, InboxItem } from "./types";
import { calendarDay } from "./calendar";
import { requiresInboxDecision } from "./inbox";

export function actionableInbox(state: GameState): InboxItem[] {
  return state.inbox
    .filter(requiresInboxDecision)
    .sort((a, b) => {
      const priority = { urgent: 4, high: 3, normal: 2, low: 1 } as const;
      return priority[b.priority] - priority[a.priority] || b.season - a.season || b.week - a.week;
    });
}

export function importantUnread(state: GameState): InboxItem[] {
  return state.inbox
    .filter(
      (item) =>
        item.status === "unread" && (item.priority === "urgent" || item.priority === "high"),
    )
    .sort((a, b) => b.season - a.season || b.week - a.week);
}

export function hasCurrentFixture(state: GameState): boolean {
  const day = calendarDay(state);
  const fixture = state.fixtures.find(
    (item) => item.week === state.week && (item.dayOfWeek ?? 5) === day,
  );
  if (!fixture) return false;
  return !state.results.some(
    (result) =>
      result.week === state.week &&
      result.opponent === fixture.opponent &&
      result.home === fixture.home &&
      (result.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
      (result.competition ?? "league") === (fixture.competition ?? "league"),
  );
}

export function continuationInterrupt(state: GameState): string | null {
  const decisions = actionableInbox(state);
  if (decisions.length) return decisions[0].subject;
  const important = importantUnread(state);
  if (important.length) return important[0].subject;
  if (hasCurrentFixture(state)) return "Matchday";
  if (state.liveMatch) return "Matchday in progress";
  return null;
}
