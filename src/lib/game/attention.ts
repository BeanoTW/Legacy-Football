import type { GameState, InboxItem } from "./types";
import { isMatchday } from "./calendar";
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
  return state.fixtures.some((fixture) => fixture.week === state.week);
}

export function continuationInterrupt(state: GameState): string | null {
  const decisions = actionableInbox(state);
  if (decisions.length) return decisions[0].subject;
  const important = importantUnread(state);
  if (important.length) return important[0].subject;
  if (hasCurrentFixture(state) && isMatchday(state)) return "Matchday";
  if (state.liveMatch) return "Matchday in progress";
  return null;
}
