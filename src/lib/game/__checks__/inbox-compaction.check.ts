import { advanceWeek, newGame } from "../engine";
import { compactState, RETAIN_INBOX_WEEKS } from "../storage/compaction";
import type { InboxItem } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let state = newGame("Inbox City", "Ada Inbox", "INBOX|COMPACTION|FIXED");
for (let i = 0; i < RETAIN_INBOX_WEEKS + 4; i++) state = advanceWeek(state);

const base = {
  generatorId: "inbox-compaction-check",
  sender: "Club Secretary",
  department: "Club" as const,
  category: "information" as const,
  subject: "Retention check",
  body: "Synthetic verification message.",
  priority: "normal" as const,
  week: 1,
  season: state.season,
};

const resolved: InboxItem = {
  ...base,
  id: "check:resolved",
  eventKey: `check:resolved:s${state.season}`,
  status: "read",
};
const unread: InboxItem = {
  ...base,
  id: "check:unread",
  eventKey: `check:unread:s${state.season}`,
  status: "unread",
};
const awaitingDecision: InboxItem = {
  ...base,
  id: "check:decision",
  eventKey: `check:decision:s${state.season}`,
  category: "decision",
  status: "awaitingDecision",
  choices: [{ id: "ok", label: "OK", effects: [] }],
};
const unresolvedConsequence: InboxItem = {
  ...base,
  id: "check:consequence",
  eventKey: `check:consequence:s${state.season}`,
  status: "read",
  consequenceOnExpire: [{ kind: "fanHappiness", delta: -1 }],
  consequenceApplied: false,
};

state = { ...state, inbox: [...state.inbox, resolved, unread, awaitingDecision, unresolvedConsequence] };
const { core, chunks } = compactState(state);
const hotIds = new Set(core.inbox.map((item) => item.id));
const archivedIds = new Set(
  chunks
    .filter((chunk) => chunk.kind === "history:inbox")
    .flatMap((chunk) => chunk.rows)
    .map((row) => (row as InboxItem).id),
);

assert(archivedIds.has(resolved.id), "aged resolved communication should leave the hot core");
assert(!hotIds.has(resolved.id), "aged resolved communication should not remain duplicated in hot inbox");
assert(hotIds.has(unread.id), "unread communication must remain hot regardless of age");
assert(hotIds.has(awaitingDecision.id), "awaiting decision must remain hot regardless of age");
assert(hotIds.has(unresolvedConsequence.id), "unapplied expiry consequence must remain hot");

console.log("inbox-compaction.check.ts: PASS");
