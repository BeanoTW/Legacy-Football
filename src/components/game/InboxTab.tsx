import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronRight, Filter, MailOpen, MessagesSquare, Trash2 } from "lucide-react";
import type { GameState, InboxItem, InboxCategory, InboxDepartment } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  CATEGORY_META,
  DEPARTMENTS_ALL,
  clearReadInbox,
  deleteInboxItem,
  dismissInboxItem,
  evaluateChoice,
  handleInboxChoice,
  markInboxRead,
  requiresInboxDecision,
  unreadCount,
} from "@/lib/game/inbox";
import {
  inboxConversationCount,
  inboxConversationItems,
} from "@/lib/game/inboxCommunication";

export type InboxFilter = "all" | "unread" | "decisions" | "archive";

export function InboxTab({
  state,
  update,
  decisionQueue = false,
  onDecisionQueueCleared,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  decisionQueue?: boolean;
  onDecisionQueueCleared?: () => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [category, setCategory] = useState<InboxCategory | "any">("any");
  const [department, setDepartment] = useState<InboxDepartment | "any">("any");
  const [openId, setOpenId] = useState<string | null>(null);

  const awaiting = useMemo(
    () =>
      state.inbox
        .filter(requiresInboxDecision)
        .slice()
        .sort(
          (a, b) =>
            (a.expiresAtAbsoluteWeek ?? Number.POSITIVE_INFINITY) -
              (b.expiresAtAbsoluteWeek ?? Number.POSITIVE_INFINITY) ||
            a.season - b.season ||
            a.week - b.week ||
            a.id.localeCompare(b.id),
        ),
    [state.inbox],
  );

  useEffect(() => {
    if (!decisionQueue) return;
    if (openId && state.inbox.some((item) => item.id === openId && requiresInboxDecision(item))) {
      return;
    }
    const next = awaiting[0];
    if (next) {
      setFilter("decisions");
      setOpenId(next.id);
      return;
    }
    setOpenId(null);
    onDecisionQueueCleared?.();
  }, [awaiting, decisionQueue, onDecisionQueueCleared, openId, state.inbox]);

  const items = useMemo(() => {
    const all = [...state.inbox].sort(
      (a, b) => b.season - a.season || b.week - a.week || b.id.localeCompare(a.id),
    );
    return all.filter((i) => {
      if (filter === "unread" && i.status !== "unread" && i.status !== "awaitingDecision") return false;
      if (filter === "decisions" && !requiresInboxDecision(i)) return false;
      if (filter === "archive" && !["completed", "expired", "read"].includes(i.status)) return false;
      if (category !== "any" && i.category !== category) return false;
      if (department !== "any" && i.department !== department) return false;
      return true;
    });
  }, [state.inbox, filter, category, department]);

  const open = openId ? (state.inbox.find((i) => i.id === openId) ?? null) : null;
  const unread = unreadCount(state);
  const decisions = awaiting.length;

  const openItem = (item: InboxItem) => {
    setOpenId(item.id);
    if (item.status === "unread" || (item.status === "awaitingDecision" && !requiresInboxDecision(item))) {
      update((s) => markInboxRead(s, item.id));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden md:gap-3">
      <div className="flex shrink-0 items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl">Inbox</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
            Deal with decisions first. Everything else can wait.
          </p>
        </div>
        {decisionQueue && decisions > 0 && (
          <div className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            {decisions} blocking
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 md:gap-3">
        <button
          onClick={() => setFilter("decisions")}
          className={cn(
            "min-h-12 rounded-xl border p-2.5 text-left flex items-center justify-between transition-colors md:min-h-28 md:rounded-2xl md:p-4 md:flex-col md:items-start",
            filter === "decisions" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary/40",
          )}
        >
          <span className="text-xs md:text-sm font-semibold">Needs decision</span>
          <span className="font-display text-2xl md:text-3xl">{decisions}</span>
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={cn(
            "min-h-12 rounded-xl border p-2.5 text-left flex items-center justify-between transition-colors md:min-h-28 md:rounded-2xl md:p-4 md:flex-col md:items-start",
            filter === "unread" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:border-primary/40",
          )}
        >
          <span className="text-xs md:text-sm font-semibold">Unread</span>
          <span className="font-display text-2xl md:text-3xl">{unread}</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All messages</Button>
        <Sheet>
          <SheetTrigger asChild><Button size="sm" variant="outline"><Filter className="size-4 mr-1.5" /> Filters</Button></SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader><SheetTitle>Filter inbox</SheetTitle></SheetHeader>
            <div className="space-y-4 mt-5">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value as InboxCategory | "any")} className="w-full h-12 px-3 rounded-xl border bg-card">
                  <option value="any">All categories</option>
                  {(Object.keys(CATEGORY_META) as InboxCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Department</span>
                <select value={department} onChange={(e) => setDepartment(e.target.value as InboxDepartment | "any")} className="w-full h-12 px-3 rounded-xl border bg-card">
                  <option value="any">All departments</option>
                  {DEPARTMENTS_ALL.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <Button variant="outline" className="w-full h-12" onClick={() => setFilter("archive")}><Archive className="size-4 mr-2" /> View archive</Button>
            </div>
          </SheetContent>
        </Sheet>
        {items.some((i) => ["read", "completed", "expired"].includes(i.status)) && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => update((s) => clearReadInbox(s))}>Clear read</Button>}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card py-10 md:py-14 text-center">
          <MailOpen className="size-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-display text-xl">Nothing waiting here</div>
          <div className="text-sm text-muted-foreground mt-1">You can get back to running the club.</div>
        </div>
      ) : (
        <div className="contained-scroll touch-pan-y min-h-0 flex-1 space-y-1.5 pr-0.5 md:space-y-3">
          {items.map((it) => {
            const decision = requiresInboxDecision(it);
            const conversationCount = inboxConversationCount(state.inbox, it);
            return (
            <button
              key={it.id}
              onClick={() => openItem(it)}
              className={cn(
                "flex min-h-12 w-full items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-left transition-colors hover:border-primary/40 md:min-h-24 md:gap-4 md:rounded-2xl md:p-4",
                decision && "border-amber-500/60 bg-amber-500/5",
              )}
            >
              <div className={cn("size-2 md:size-3 rounded-full shrink-0", decision ? "bg-amber-500" : (it.status === "unread" || it.status === "awaitingDecision") ? "bg-primary" : "bg-muted-foreground/30")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10px] md:text-xs text-muted-foreground">
                  <span>{it.department}</span>
                  {decision && <span className="font-semibold text-amber-600">Decision</span>}
                  {conversationCount > 1 && (
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
                      <MessagesSquare className="size-3" /> {conversationCount}
                    </span>
                  )}
                  <span className="ml-auto">W{it.week}</span>
                </div>
                <div className={cn("truncate text-sm leading-tight md:mt-1 md:text-base", (it.status === "unread" || it.status === "awaitingDecision") && "font-semibold")}>{it.subject}</div>
                <div className="hidden truncate text-xs text-muted-foreground sm:block md:text-sm">{it.sender}</div>
              </div>
              <ChevronRight className="size-4 md:size-5 text-muted-foreground shrink-0" />
            </button>
          );})}
        </div>
      )}

      {open && (
        <InboxDetail
          item={open}
          state={state}
          onClose={() => !decisionQueue && setOpenId(null)}
          onChoose={(choiceId) => {
            update((s) => handleInboxChoice(s, open.id, choiceId));
            setOpenId(null);
          }}
          onDismiss={() => {
            update((s) => dismissInboxItem(s, open.id));
            setOpenId(null);
          }}
          onDelete={() => {
            update((s) => deleteInboxItem(s, open.id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

export function InboxDetail({ item, state, onClose, onChoose, onDismiss, onDelete }: { item: InboxItem; state: GameState; onClose: () => void; onChoose: (choiceId: string) => void; onDismiss: () => void; onDelete: () => void }) {
  const decision = requiresInboxDecision(item);
  const conversation = inboxConversationItems(state.inbox, item);
  const hasConversation = conversation.length > 1;
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><span>{item.department}</span><span>·</span><span>S{item.season} W{item.week}</span></div>
          <SheetTitle className="text-xl leading-tight">{item.subject}</SheetTitle>
          <div className="text-sm text-muted-foreground">From {item.sender}</div>
        </SheetHeader>
        {hasConversation ? (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessagesSquare className="size-4" /> Conversation · {conversation.length} messages
            </div>
            {conversation.map((message) => {
              const current = message.id === item.id;
              return (
                <div
                  key={message.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    current ? "border-primary/40 bg-primary/5" : "bg-muted/25",
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{message.sender}</span>
                    <span>·</span>
                    <span>S{message.season} W{message.week}</span>
                    {current && <span className="ml-auto font-semibold text-primary">Latest</span>}
                  </div>
                  <div className="mt-1 font-semibold">{message.subject}</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{message.body}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 text-base whitespace-pre-wrap leading-relaxed">{item.body}</div>
        )}
        {decision && item.choices && item.choices.length > 0 && (
          <div className="mt-6 space-y-3">
            {item.status === "completed" && item.chosenChoiceId ? (
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">Decided: {item.choices.find((c) => c.id === item.chosenChoiceId)?.label}</div>
            ) : item.status === "expired" ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">This decision expired before you responded.</div>
            ) : (
              <>
                <div className="font-display text-lg">Choose your response</div>
                {item.choices.map((c) => {
                  const avail = evaluateChoice(state, c);
                  return (
                    <button key={c.id} onClick={() => avail.available && onChoose(c.id)} disabled={!avail.available} className={cn("w-full min-h-16 md:min-h-20 text-left rounded-2xl border p-3 md:p-4 transition-colors", avail.available ? "hover:border-primary hover:bg-muted/50" : "opacity-60 cursor-not-allowed bg-muted/30")}>
                      <div className="text-sm md:text-base font-semibold">{c.label}</div>
                      {c.hint && <div className="text-xs md:text-sm text-muted-foreground mt-1">{c.hint}</div>}
                      {!avail.available && <div className="text-xs md:text-sm text-rose-600 mt-2">{avail.reasons.join(" ")}</div>}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
        {!decision && item.status !== "completed" && (
          <Button variant="outline" className="w-full h-12 mt-6 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 size-4" /> Delete message
          </Button>
        )}
        {item.status === "completed" && <Button variant="outline" className="w-full h-12 mt-6" onClick={onDismiss}>Close</Button>}
      </SheetContent>
    </Sheet>
  );
}
