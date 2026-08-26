import { useMemo, useState } from "react";
import { Archive, ChevronRight, Filter, MailOpen } from "lucide-react";
import type { GameState, InboxItem, InboxCategory, InboxDepartment } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  CATEGORY_META,
  DEPARTMENTS_ALL,
  clearReadInbox,
  dismissInboxItem,
  evaluateChoice,
  handleInboxChoice,
  markInboxRead,
  unreadCount,
} from "@/lib/game/inbox";

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
    const all = [...state.inbox].sort(
      (a, b) => b.season - a.season || b.week - a.week || b.id.localeCompare(a.id),
    );
    return all.filter((i) => {
      if (filter === "unread" && i.status !== "unread" && i.status !== "awaitingDecision") {
        return false;
      }
      if (filter === "decisions" && i.status !== "awaitingDecision") return false;
      if (filter === "archive" && !["completed", "expired", "read"].includes(i.status)) {
        return false;
      }
      if (category !== "any" && i.category !== category) return false;
      if (department !== "any" && i.department !== department) return false;
      return true;
    });
  }, [state.inbox, filter, category, department]);

  const open = openId ? (state.inbox.find((i) => i.id === openId) ?? null) : null;
  const unread = unreadCount(state);
  const decisions = state.inbox.filter((i) => i.status === "awaitingDecision").length;

  const openItem = (item: InboxItem) => {
    setOpenId(item.id);
    if (item.status === "unread") update((s) => markInboxRead(s, item.id));
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deal with decisions first. Everything else can wait.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFilter("decisions")}
          className={cn(
            "min-h-28 rounded-2xl border p-4 text-left flex flex-col justify-between transition-colors",
            filter === "decisions"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card hover:border-primary/40",
          )}
        >
          <span className="text-sm font-semibold">Needs your decision</span>
          <span className="font-display text-3xl">{decisions}</span>
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={cn(
            "min-h-28 rounded-2xl border p-4 text-left flex flex-col justify-between transition-colors",
            filter === "unread"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card hover:border-primary/40",
          )}
        >
          <span className="text-sm font-semibold">Unread</span>
          <span className="font-display text-3xl">{unread}</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          All messages
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <Filter className="size-4 mr-2" /> Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Filter inbox</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 mt-5">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as InboxCategory | "any")}
                  className="w-full h-12 px-3 rounded-xl border bg-card"
                >
                  <option value="any">All categories</option>
                  {(Object.keys(CATEGORY_META) as InboxCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Department</span>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as InboxDepartment | "any")}
                  className="w-full h-12 px-3 rounded-xl border bg-card"
                >
                  <option value="any">All departments</option>
                  {DEPARTMENTS_ALL.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                className="w-full h-12"
                onClick={() => setFilter("archive")}
              >
                <Archive className="size-4 mr-2" /> View archive
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        {items.some((i) => ["read", "completed", "expired"].includes(i.status)) && (
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => update((s) => clearReadInbox(s))}
          >
            Clear read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border bg-card py-14 text-center">
          <MailOpen className="size-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-display text-xl">Nothing waiting here</div>
          <div className="text-sm text-muted-foreground mt-1">
            You can get back to running the club.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => openItem(it)}
              className={cn(
                "w-full min-h-24 rounded-2xl border bg-card p-4 text-left flex items-center gap-4 hover:border-primary/40 transition-colors",
                it.status === "awaitingDecision" && "border-amber-500/60 bg-amber-500/5",
              )}
            >
              <div
                className={cn(
                  "size-3 rounded-full shrink-0",
                  it.status === "awaitingDecision"
                    ? "bg-amber-500"
                    : it.status === "unread"
                      ? "bg-primary"
                      : "bg-muted-foreground/30",
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{it.department}</span>
                  {it.status === "awaitingDecision" && (
                    <span className="font-semibold text-amber-600">Decision</span>
                  )}
                  <span className="ml-auto">W{it.week}</span>
                </div>
                <div
                  className={cn(
                    "text-base mt-1 truncate",
                    (it.status === "unread" || it.status === "awaitingDecision") && "font-semibold",
                  )}
                >
                  {it.subject}
                </div>
                <div className="text-sm text-muted-foreground truncate mt-0.5">{it.sender}</div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

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
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{item.department}</span>
            <span>·</span>
            <span>
              S{item.season} W{item.week}
            </span>
          </div>
          <SheetTitle className="text-xl leading-tight">{item.subject}</SheetTitle>
          <div className="text-sm text-muted-foreground">From {item.sender}</div>
        </SheetHeader>

        <div className="mt-5 text-base whitespace-pre-wrap leading-relaxed">{item.body}</div>

        {item.choices && item.choices.length > 0 && (
          <div className="mt-6 space-y-3">
            {item.status === "completed" && item.chosenChoiceId ? (
              <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                Decided: {item.choices.find((c) => c.id === item.chosenChoiceId)?.label}
              </div>
            ) : item.status === "expired" ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">
                This decision expired before you responded.
              </div>
            ) : (
              <>
                <div className="font-display text-lg">Choose your response</div>
                {item.choices.map((c) => {
                  const avail = evaluateChoice(state, c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => avail.available && onChoose(c.id)}
                      disabled={!avail.available}
                      className={cn(
                        "w-full min-h-20 text-left rounded-2xl border p-4 transition-colors",
                        avail.available
                          ? "hover:border-primary hover:bg-muted/50"
                          : "opacity-60 cursor-not-allowed bg-muted/30",
                      )}
                    >
                      <div className="text-base font-semibold">{c.label}</div>
                      {c.hint && <div className="text-sm text-muted-foreground mt-1">{c.hint}</div>}
                      {!avail.available && (
                        <div className="text-sm text-rose-600 mt-2">{avail.reasons.join(" ")}</div>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {(!item.choices || item.status === "read" || item.status === "completed") && (
          <Button variant="outline" className="w-full h-12 mt-6" onClick={onDismiss}>
            Close
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
