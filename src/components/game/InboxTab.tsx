import { useMemo, useState } from "react";
import type { GameState, InboxItem, InboxCategory, InboxDepartment } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CATEGORY_META, DEPARTMENTS_ALL, PRIORITY_META, clearReadInbox, dismissInboxItem,
  evaluateChoice, handleInboxChoice, markInboxRead, unreadCount,
} from "@/lib/game/inbox";
import { Section } from "./shared/primitives";

export type InboxFilter = "all" | "unread" | "decisions" | "archive";

export function InboxTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [category, setCategory] = useState<InboxCategory | "any">("any");
  const [department, setDepartment] = useState<InboxDepartment | "any">("any");
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    // Newest first
    const all = [...state.inbox].sort(
      (a, b) =>
        b.season - a.season ||
        b.week - a.week ||
        b.id.localeCompare(a.id),
    );
    return all.filter((i) => {
      if (filter === "unread" && i.status !== "unread" && i.status !== "awaitingDecision") return false;
      if (filter === "decisions" && i.status !== "awaitingDecision") return false;
      if (filter === "archive" && i.status !== "completed" && i.status !== "expired" && i.status !== "read") return false;
      if (category !== "any" && i.category !== category) return false;
      if (department !== "any" && i.department !== department) return false;
      return true;
    });
  }, [state.inbox, filter, category, department]);

  const open = openId ? state.inbox.find((i) => i.id === openId) ?? null : null;
  const unread = unreadCount(state);
  const decisions = state.inbox.filter((i) => i.status === "awaitingDecision").length;

  return (
    <div className="space-y-4">
      <Section
        title="Inbox — Club communications"
        info="Every department, sponsor, journalist and official routes their reports and decisions through here. This is the club's central nervous system. Unread items are shown first; decisions won't disappear until you answer them."
        right={
          <span className="flex items-center gap-2 text-[10px]">
            <span className="rounded-full bg-rose-500 text-white px-2 py-0.5">{unread} unread</span>
            {decisions > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5">{decisions} decision{decisions > 1 ? "s" : ""}</span>
            )}
          </span>
        }
      >
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(["all", "unread", "decisions", "archive"] as InboxFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted",
              )}
            >
              {f === "all" ? "All" : f === "unread" ? "Unread" : f === "decisions" ? "Decisions" : "Archive"}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InboxCategory | "any")}
            className="text-xs px-2 py-1 rounded-md border bg-card"
          >
            <option value="any">All categories</option>
            {(Object.keys(CATEGORY_META) as InboxCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as InboxDepartment | "any")}
            className="text-xs px-2 py-1 rounded-md border bg-card"
          >
            <option value="any">All departments</option>
            {DEPARTMENTS_ALL.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {items.some((i) => i.status === "read" || i.status === "completed" || i.status === "expired") && (
            <button
              onClick={() => update((s) => clearReadInbox(s))}
              className="ml-auto text-xs px-2.5 py-1 rounded-full border text-muted-foreground hover:text-foreground"
            >
              Clear read
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nothing to show under this filter.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => {
                    setOpenId(it.id);
                    if (it.status === "unread") update((s) => markInboxRead(s, it.id));
                  }}
                  className={cn(
                    "w-full text-left py-2.5 px-1 flex items-start gap-3 hover:bg-muted/60 transition-colors",
                    (it.status === "unread" || it.status === "awaitingDecision") && "bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 shrink-0 size-2 rounded-full",
                      it.status === "unread" ? "bg-primary" :
                      it.status === "awaitingDecision" ? "bg-amber-500" :
                      it.status === "expired" ? "bg-rose-400" :
                      "bg-transparent border border-muted-foreground/40",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className={cn("rounded px-1.5 py-0.5 text-white text-[9px]", CATEGORY_META[it.category].color)}>
                        {CATEGORY_META[it.category].label}
                      </span>
                      <span className="truncate">{it.department}</span>
                      <span className="ml-auto shrink-0">S{it.season} · W{it.week}</span>
                    </div>
                    <div className={cn(
                      "text-sm mt-0.5 truncate",
                      (it.status === "unread" || it.status === "awaitingDecision") ? "font-medium" : "text-muted-foreground",
                    )}>
                      {it.subject}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="truncate">{it.sender}</span>
                      <span className={PRIORITY_META[it.priority].className}>· {PRIORITY_META[it.priority].label}</span>
                      {it.expiresWeek != null && it.status === "awaitingDecision" && (
                        <span className="text-amber-600 ml-auto shrink-0">
                          Expires W{it.expiresWeek}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {open && (
        <InboxDetail
          item={open}
          state={state}
          onClose={() => setOpenId(null)}
          onChoose={(choiceId) => {
            update((s) => handleInboxChoice(s, open.id, choiceId));
            setOpenId(null);
          }}
          onDismiss={() => {
            update((s) => dismissInboxItem(s, open.id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

export function InboxDetail({
  item,
  state,
  onClose,
  onChoose,
  onDismiss,
}: {
  item: InboxItem;
  state: GameState;
  onClose: () => void;
  onChoose: (choiceId: string) => void;
  onDismiss: () => void;
}) {

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <span className={cn("rounded px-1.5 py-0.5 text-white text-[9px]", CATEGORY_META[item.category].color)}>
              {CATEGORY_META[item.category].label}
            </span>
            <span>{item.department}</span>
            <span className="ml-auto">S{item.season} · W{item.week}</span>
          </div>
          <SheetTitle className="text-base leading-tight">{item.subject}</SheetTitle>
          <div className="text-xs text-muted-foreground">
            From <span className="font-medium text-foreground">{item.sender}</span>
            <span className={cn("ml-2", PRIORITY_META[item.priority].className)}>
              · {PRIORITY_META[item.priority].label} priority
            </span>
            {item.status === "expired" && (
              <span className="ml-2 text-rose-500">· Expired</span>
            )}
            {item.status === "completed" && (
              <span className="ml-2 text-emerald-600">· Completed</span>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">
          {item.body}
        </div>

        {item.choices && item.choices.length > 0 && (
          <div className="mt-5 space-y-2">
            {item.status === "completed" && item.chosenChoiceId ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                Decided: {item.choices.find((c) => c.id === item.chosenChoiceId)?.label}
              </div>
            ) : item.status === "expired" ? (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                This message expired before you responded. Consequences have been applied.
              </div>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Decision required
                </div>
                {item.choices.map((c) => {
                  const avail = evaluateChoice(state, c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => avail.available && onChoose(c.id)}
                      disabled={!avail.available}
                      className={cn(
                        "w-full text-left rounded-md border p-3 transition-colors",
                        avail.available
                          ? "hover:border-primary hover:bg-muted/50"
                          : "opacity-60 cursor-not-allowed bg-muted/30",
                      )}
                    >
                      <div className="text-sm font-medium">{c.label}</div>
                      {c.hint && (
                        <div className="text-xs text-muted-foreground mt-0.5">{c.hint}</div>
                      )}
                      {!avail.available && (
                        <div className="text-[11px] text-rose-600 mt-1">
                          {avail.reasons.join(" ")}
                        </div>
                      )}
                    </button>
                  );
                })}

              </>
            )}
          </div>
        )}

        {(!item.choices || item.status === "read" || item.status === "completed") && (
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onDismiss}>Close</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
