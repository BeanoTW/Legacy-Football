import type { InboxItem } from "./types";

declare module "./types" {
  interface InboxItem {
    /** Stable conversation identity for messages that belong to one ongoing club matter. */
    conversationKey?: string;
    /** Optional canonical entity the communication is about. */
    relatedEntityId?: string;
  }
}

const NEGOTIATION_ID = /(?:^|:)(TN-\d+)(?::|$)/;

/**
 * Resolve a stable conversation key without forcing every existing generator
 * to migrate at once. New systems can persist conversationKey explicitly;
 * existing transfer messages are recognised from their canonical negotiation id.
 */
export function inboxConversationKey(item: InboxItem): string {
  if (item.conversationKey) return item.conversationKey;
  const negotiation = item.eventKey.match(NEGOTIATION_ID)?.[1];
  if (negotiation) return `transfer:${negotiation}`;
  return `message:${item.id}`;
}

export function inboxConversationItems(all: InboxItem[], item: InboxItem): InboxItem[] {
  const key = inboxConversationKey(item);
  return all
    .filter((candidate) => inboxConversationKey(candidate) === key)
    .slice()
    .sort((a, b) => a.season - b.season || a.week - b.week || a.id.localeCompare(b.id));
}

export function inboxConversationCount(all: InboxItem[], item: InboxItem): number {
  return inboxConversationItems(all, item).length;
}
