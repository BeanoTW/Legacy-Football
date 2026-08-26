import { advanceWeek, newGame } from "../engine";
import { compactState, RETAIN_INBOX_WEEKS } from "../storage/compaction";
import { absoluteWeek } from "../time";
import type { InboxItem } from "../types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let state = newGame("Inbox City", "Ada Inbox", "INBOX|COMPACTION|FIXED");
for (let i = 0; i < 46 + RETAIN_INBOX_WEEKS + 4; i++) state = advanceWeek(state);
assert(state.season > 1, "verification must reach a later season");
assert(RETAIN_INBOX_WEEKS === 1, "ordinary inbox retention must remain a one-week feed");

const priorSeason = state.season - 1;
const nowAbs = absoluteWeek(state.season, state.week);
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
const informationalUnread: InboxItem = {
  ...base,
  id: "check:info-unread",
  eventKey: `check:info-unread:s${state.season}`,
  status: "unread",
};
const freshInformational: InboxItem = {
  ...base,
  id: "check:fresh-info",
  eventKey: `check:fresh-info:s${state.season}:w${state.week}`,
  status: "unread",
  week: state.week,
};
const justOneWeekOld: InboxItem = {
  ...base,
  id: "check:one-week-old",
  eventKey: `check:one-week-old:s${state.season}`,
  status: "read",
  resolvedAtAbsoluteWeek: nowAbs - 1,
};
const actionableUnread: InboxItem = {
  ...base,
  id: "check:action-unread",
  eventKey: `check:action-unread:s${state.season}`,
  category: "decision",
  status: "unread",
  choices: [{ id: "ok", label: "OK", effects: [] }],
};
const awaitingDecision: InboxItem = {
  ...base,
  id: "check:decision",
  eventKey: `check:decision:s${state.season}`,
  category: "decision",
  status: "awaitingDecision",
  choices: [{ id: "ok", label: "OK", effects: [] }],
};
const staleActionable: InboxItem = {
  ...base,
  id: "check:stale-action",
  eventKey: `check:stale-action:s${priorSeason}`,
  season: priorSeason,
  category: "decision",
  status: "unread",
  choices: [{ id: "ok", label: "OK", effects: [] }],
};
const staleAwaiting: InboxItem = {
  ...base,
  id: "check:stale-awaiting",
  eventKey: `check:stale-awaiting:s${priorSeason}`,
  season: priorSeason,
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

state = {
  ...state,
  inbox: [
    ...state.inbox,
    resolved,
    informationalUnread,
    freshInformational,
    justOneWeekOld,
    actionableUnread,
    awaitingDecision,
    staleActionable,
    staleAwaiting,
    unresolvedConsequence,
  ],
};
const { core, chunks } = compactState(state);
const hotIds = new Set(core.inbox.map((item) => item.id));
const archivedRows = chunks
  .filter((chunk) => chunk.kind === "history:inbox")
  .flatMap((chunk) => chunk.rows) as InboxItem[];
const archivedById = new Map(archivedRows.map((item) => [item.id, item]));
const archivedIds = new Set(archivedById.keys());
const guards = new Set(core.archive?.inbox.guardKeys ?? []);

assert(archivedIds.has(resolved.id), "aged resolved communication should leave the hot core");
assert(archivedIds.has(informationalUnread.id), "aged informational unread should leave the hot core");
assert(!hotIds.has(resolved.id), "aged resolved communication should not remain duplicated in hot inbox");
assert(!hotIds.has(informationalUnread.id), "aged informational unread should not remain duplicated in hot inbox");
assert(hotIds.has(freshInformational.id), "mail from the current week must remain visible");
assert(archivedIds.has(justOneWeekOld.id), "ordinary mail should archive at the next weekly boundary");
assert(hotIds.has(actionableUnread.id), "current-season unread actionable communication must remain hot");
assert(hotIds.has(awaitingDecision.id), "current-season awaiting decision must remain hot");
assert(archivedIds.has(staleActionable.id), "prior-season untimed unread decision should become history");
assert(archivedIds.has(staleAwaiting.id), "prior-season untimed awaiting decision should become history");
assert(archivedById.get(staleActionable.id)?.status === "expired", "stale unread decision must archive as expired");
assert(archivedById.get(staleAwaiting.id)?.status === "expired", "stale awaiting decision must archive as expired");
assert(!hotIds.has(staleActionable.id) && !hotIds.has(staleAwaiting.id), "stale decisions must not remain duplicated in hot inbox");
assert(hotIds.has(unresolvedConsequence.id), "unapplied expiry consequence must remain hot");
assert(
  guards.has(informationalUnread.eventKey),
  "same-season archived communication must keep its season-scoped dedupe guard",
);

console.log("inbox-compaction.check.ts: PASS");
