import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Archive,
  BadgePoundSterling,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Filter,
  HeartPulse,
  Landmark,
  MailOpen,
  Megaphone,
  MessageSquareMore,
  MessagesSquare,
  Newspaper,
  ShieldCheck,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Trophy,
  UserRoundCog,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
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
import { absoluteWeek, fromAbsoluteWeek } from "@/lib/game/time";
import { inboxConversationCount, inboxConversationItems } from "@/lib/game/inboxCommunication";
import { SeasonObjectivesDashboard } from "./SeasonObjectivesDashboard";

export type InboxFilter = "all" | "unread" | "decisions" | "archive";

type DepartmentPresentation = {
  short: string;
  tone: string;
  icon: ComponentType<{ className?: string }>;
};

const DEPARTMENT_PRESENTATION: Record<InboxDepartment, DepartmentPresentation> = {
  "Board of Directors": { short: "Board", tone: "board", icon: Landmark },
  Manager: { short: "Manager", tone: "manager", icon: UserRoundCog },
  "Director of Football": { short: "Recruitment", tone: "recruitment", icon: BriefcaseBusiness },
  Finance: { short: "Finance", tone: "finance", icon: WalletCards },
  Commercial: { short: "Commercial", tone: "commercial", icon: BadgePoundSterling },
  "Head Scout": { short: "Scouting", tone: "recruitment", icon: ClipboardList },
  Medical: { short: "Medical", tone: "medical", icon: Stethoscope },
  Groundskeeper: { short: "Facilities", tone: "facilities", icon: Building2 },
  "Fan Liaison": { short: "Supporters", tone: "supporters", icon: UsersRound },
  Sponsors: { short: "Sponsors", tone: "commercial", icon: ShieldCheck },
  League: { short: "Competition", tone: "league", icon: Trophy },
  Media: { short: "Media", tone: "media", icon: Newspaper },
  Club: { short: "Club", tone: "club", icon: Building2 },
};

function departmentPresentation(department: InboxDepartment) {
  return DEPARTMENT_PRESENTATION[department];
}

function itemStatus(item: InboxItem, decision: boolean) {
  if (item.status === "expired") return { label: "Expired", tone: "expired" };
  if (item.status === "completed") return { label: "Completed", tone: "completed" };
  if (decision) return { label: "Decision required", tone: "decision" };
  if (item.priority === "urgent") return { label: "Urgent", tone: "urgent" };
  if (item.priority === "high") return { label: "Priority", tone: "priority" };
  if (item.status === "unread") return { label: "New briefing", tone: "unread" };
  return { label: "Read", tone: "read" };
}

function deadlineCopy(item: InboxItem, state: GameState) {
  if (item.expiresAtAbsoluteWeek == null) return null;
  const remaining = item.expiresAtAbsoluteWeek - absoluteWeek(state.season, state.week);
  if (remaining < 0) return "Deadline passed";
  if (remaining === 0) return "Due this week";
  if (remaining === 1) return "1 week remaining";
  return `${remaining} weeks remaining`;
}

function bodySections(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function financeRows(body: string) {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed = lines.map((line) => {
    const match = line.match(/^[-•]?\s*([^:]+):\s*(£?-?[£\\d,.]+[kKmM]?)\.?$/);
    return match ? { label: match[1].trim(), value: match[2].replace(/\.$/, "") } : null;
  });
  const rows = parsed.filter((row): row is { label: string; value: string } => row !== null);
  return rows.length >= 6 ? rows : null;
}

function boardObjectiveRows(body: string) {
  const sections = bodySections(body);
  const rows: { title: string; detail?: string }[] = [];
  for (const section of sections) {
    const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      if (!/^[-•]/.test(lines[i])) continue;
      const title = lines[i].replace(/^[-•]\s*/, "");
      const details: string[] = [];
      while (i + 1 < lines.length && !/^[-•]/.test(lines[i + 1])) details.push(lines[++i]);
      rows.push({ title, detail: details.join(" ") || undefined });
    }
  }
  return rows.length >= 3 ? rows : null;
}

function BriefingBody({ body, department }: { body: string; department?: InboxDepartment }) {
  const financial = department === "Finance" ? financeRows(body) : null;
  const objectives = department === "Board of Directors" ? boardObjectiveRows(body) : null;
  if (objectives) {
    return <SeasonObjectivesDashboard objectives={objectives.map((row, index) => ({ id: `${index}-${row.title}`, title: row.title, detail: row.detail }))} />;
  }
  if (financial) {
    return (
      <div className="lf-finance-summary">
        {financial.map((row) => (
          <div className={cn("lf-finance-row", /^(income|outgoings|closing balance)$/i.test(row.label) && "is-total")} key={row.label}>
            <span>{row.label}</span><strong>{row.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  const sections = bodySections(body);
  return (
    <div className="lf-briefing-copy">
      {sections.map((section, index) => {
        const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
        const looksStructured = lines.length > 1 || /^[-•]/.test(section);
        if (looksStructured) {
          return (
            <div className="lf-briefing-facts" key={`${index}-${section.slice(0, 12)}`}>
              {lines.map((line) => {
                const cleaned = line.replace(/^[-•]\s*/, "");
                const [headline, ...detailParts] = cleaned.split(/(?<=\.|:)(?:\s+)/);
                return (
                  <div className="lf-briefing-fact" key={line}>
                    <span className="lf-briefing-fact-mark" aria-hidden="true" />
                    <div><strong>{headline}</strong>{detailParts.length > 0 && <p>{detailParts.join(" ")}</p>}</div>
                  </div>
                );
              })}
            </div>
          );
        }
        return <p key={`${index}-${section.slice(0, 12)}`}>{section}</p>;
      })}
    </div>
  );
}

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
    if (openId && state.inbox.some((item) => item.id === openId && requiresInboxDecision(item))) return;
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
    return all.filter((item) => {
      if (filter === "unread" && item.status !== "unread" && item.status !== "awaitingDecision") return false;
      if (filter === "decisions" && !requiresInboxDecision(item)) return false;
      if (filter === "archive" && !["completed", "expired", "read"].includes(item.status)) return false;
      if (category !== "any" && item.category !== category) return false;
      if (department !== "any" && item.department !== department) return false;
      return true;
    });
  }, [state.inbox, filter, category, department]);

  const open = openId ? (state.inbox.find((item) => item.id === openId) ?? null) : null;
  const unread = unreadCount(state);
  const urgent = state.inbox.filter(
    (item) => item.status !== "completed" && item.status !== "expired" && (item.priority === "urgent" || item.priority === "high"),
  ).length;
  const decisionItems = items.filter(requiresInboxDecision);
  const updateItems = items.filter((item) => !requiresInboxDecision(item));

  const openItem = (item: InboxItem) => {
    setOpenId(item.id);
    if (item.status === "unread" || (item.status === "awaitingDecision" && !requiresInboxDecision(item))) {
      update((current) => markInboxRead(current, item.id));
    }
  };

  return (
    <div className="lf-inbox-shell">
      <header className="lf-inbox-header">
        <div className="min-w-0">
          <p className="lf-inbox-kicker">Club communications</p>
          <h1>Inbox</h1>
          <p>Decisions, reports and opportunities from across the club.</p>
        </div>
        {decisionQueue && awaiting.length > 0 && <span className="lf-inbox-blocking">{awaiting.length} blocking</span>}
      </header>

      <div className="lf-attention-rail" aria-label="Inbox summary">
        <Button variant="ghost" className={cn("lf-attention-stat", filter === "decisions" && "is-active")} onClick={() => setFilter("decisions")}>
          <span className="lf-attention-icon"><TriangleAlert /></span>
          <span><strong>{awaiting.length}</strong><small>Decisions</small></span>
        </Button>
        <Button variant="ghost" className={cn("lf-attention-stat", filter === "unread" && "is-active")} onClick={() => setFilter("unread")}>
          <span className="lf-attention-icon"><MessageSquareMore /></span>
          <span><strong>{unread}</strong><small>Unread</small></span>
        </Button>
        <div className="lf-attention-stat is-static">
          <span className="lf-attention-icon"><CalendarClock /></span>
          <span><strong>{urgent}</strong><small>Priority</small></span>
        </div>
      </div>

      <div className="lf-inbox-tools">
        <div className="lf-filter-tabs" role="group" aria-label="Message view">
          {(["all", "decisions", "unread", "archive"] as InboxFilter[]).map((value) => (
            <Button key={value} size="sm" variant="ghost" className={cn("lf-filter-tab", filter === value && "is-active")} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : value === "decisions" ? "Actions" : value === "unread" ? "New" : "Archive"}
            </Button>
          ))}
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="outline" className="lf-filter-button" aria-label="Filter inbox"><Filter /></Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="lf-filter-sheet">
            <SheetHeader><SheetTitle>Filter communications</SheetTitle></SheetHeader>
            <div className="mt-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value as InboxCategory | "any")} className="h-12 w-full rounded-md border bg-card px-3">
                  <option value="any">All categories</option>
                  {(Object.keys(CATEGORY_META) as InboxCategory[]).map((value) => <option key={value} value={value}>{CATEGORY_META[value].label}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Department</span>
                <select value={department} onChange={(event) => setDepartment(event.target.value as InboxDepartment | "any")} className="h-12 w-full rounded-md border bg-card px-3">
                  <option value="any">All departments</option>
                  {DEPARTMENTS_ALL.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <Button variant="outline" className="h-12 w-full" onClick={() => setFilter("archive")}><Archive /> View archive</Button>
            </div>
          </SheetContent>
        </Sheet>
        {items.some((item) => ["read", "completed", "expired"].includes(item.status)) && (
          <Button size="sm" variant="ghost" className="lf-clear-read" onClick={() => update((current) => clearReadInbox(current))}>Clear read</Button>
        )}
      </div>

      <div className="lf-inbox-feed contained-scroll touch-pan-y">
        {items.length === 0 ? (
          <div className="lf-inbox-empty">
            <MailOpen />
            <h2>Nothing waiting here</h2>
            <p>You can get back to running the club.</p>
          </div>
        ) : (
          <>
            {decisionItems.length > 0 && (
              <InboxLane title="Needs your decision" count={decisionItems.length} urgent>
                {decisionItems.map((item) => <InboxRow key={item.id} item={item} state={state} onOpen={openItem} conversationCount={inboxConversationCount(state.inbox, item)} />)}
              </InboxLane>
            )}
            {updateItems.length > 0 && (
              <InboxLane title={decisionItems.length > 0 ? "Club briefings" : filter === "archive" ? "Filed briefings" : "Latest briefings"} count={updateItems.length}>
                {updateItems.map((item) => <InboxRow key={item.id} item={item} state={state} onOpen={openItem} conversationCount={inboxConversationCount(state.inbox, item)} />)}
              </InboxLane>
            )}
          </>
        )}
      </div>

      {open && (
        <InboxDetail
          item={open}
          state={state}
          onClose={() => !decisionQueue && setOpenId(null)}
          onChoose={(choiceId) => { update((current) => handleInboxChoice(current, open.id, choiceId)); setOpenId(null); }}
          onDismiss={() => { update((current) => dismissInboxItem(current, open.id)); setOpenId(null); }}
          onDelete={() => { update((current) => deleteInboxItem(current, open.id)); setOpenId(null); }}
        />
      )}
    </div>
  );
}

function InboxLane({ title, count, urgent = false, children }: { title: string; count: number; urgent?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("lf-inbox-lane", urgent && "is-urgent")}>
      <div className="lf-inbox-lane-heading"><h2>{title}</h2><span>{count}</span></div>
      <div className="lf-inbox-lane-list">{children}</div>
    </section>
  );
}

function InboxRow({ item, state, onOpen, conversationCount }: { item: InboxItem; state: GameState; onOpen: (item: InboxItem) => void; conversationCount: number }) {
  const decision = requiresInboxDecision(item);
  const department = departmentPresentation(item.department);
  const status = itemStatus(item, decision);
  const deadline = deadlineCopy(item, state);
  const Icon = department.icon;
  return (
    <Button variant="ghost" className={cn("lf-message-row", `tone-${department.tone}`, `status-${status.tone}`)} onClick={() => onOpen(item)}>
      <span className="lf-message-source"><Icon /></span>
      <span className="lf-message-main">
        <span className="lf-message-meta">
          <span>{department.short}</span>
          <span className={cn("lf-message-status", `status-${status.tone}`)}>{status.label}</span>
          <span className="lf-message-week">S{item.season} W{item.week}</span>
        </span>
        <strong>{item.subject}</strong>
        <span className="lf-message-subline">
          <span>{item.sender}</span>
          {deadline && <span className="lf-message-deadline"><CalendarClock /> {deadline}</span>}
          {conversationCount > 1 && <span><MessagesSquare /> {conversationCount}</span>}
        </span>
      </span>
      <ChevronRight className="lf-message-chevron" />
    </Button>
  );
}

export function InboxDetail({ item, state, onClose, onChoose, onDismiss, onDelete }: { item: InboxItem; state: GameState; onClose: () => void; onChoose: (choiceId: string) => void; onDismiss: () => void; onDelete: () => void }) {
  const decision = requiresInboxDecision(item);
  const conversation = inboxConversationItems(state.inbox, item);
  const hasConversation = conversation.length > 1;
  const department = departmentPresentation(item.department);
  const status = itemStatus(item, decision);
  const deadline = deadlineCopy(item, state);
  const DepartmentIcon = department.icon;

  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="bottom" hideClose className={cn("lf-briefing-sheet", `tone-${department.tone}`)}>
        <div className="lf-briefing-handle" aria-hidden="true" />
        <header className="lf-briefing-header">
          <div className="lf-briefing-department"><DepartmentIcon /><span>{department.short}</span></div>
          <Button variant="ghost" size="icon" className="lf-briefing-close" onClick={onClose} aria-label="Close briefing"><X /></Button>
          <div className="lf-briefing-statusline">
            <span className={cn("lf-message-status", `status-${status.tone}`)}>{status.label}</span>
            <span>S{item.season} W{item.week}</span>
            {deadline && <span><CalendarClock /> {deadline}</span>}
          </div>
          <SheetHeader className="text-left">
            <SheetTitle className="lf-briefing-title">{item.subject}</SheetTitle>
            <p className="lf-briefing-sender">Briefing from <strong>{item.sender}</strong></p>
          </SheetHeader>
        </header>

        <div className="lf-briefing-scroll">
          {hasConversation ? (
            <section className="lf-conversation">
              <div className="lf-briefing-section-title"><MessagesSquare /> Conversation · {conversation.length}</div>
              {conversation.map((message) => (
                <article key={message.id} className={cn("lf-conversation-entry", message.id === item.id && "is-current")}>
                  <div><strong>{message.sender}</strong><span>S{message.season} W{message.week}</span></div>
                  <h3>{message.subject}</h3>
                  <BriefingBody body={message.body} department={message.department} />
                </article>
              ))}
            </section>
          ) : (
            <article className="lf-briefing-document">
              <div className="lf-briefing-section-title"><Megaphone /> Club briefing</div>
              <BriefingBody body={item.body} department={item.department} />
            </article>
          )}

          {item.reward && (
            <aside className="lf-briefing-note"><CircleCheck /><div><strong>Potential outcome</strong><p>{item.reward}</p></div></aside>
          )}

          {decision && item.choices && item.choices.length > 0 && (
            <section className="lf-decision-section">
              {item.status === "completed" && item.chosenChoiceId ? (
                <div className="lf-resolution"><CircleCheck /><div><strong>Decision recorded</strong><p>{item.choices.find((choice) => choice.id === item.chosenChoiceId)?.label}</p></div></div>
              ) : item.status === "expired" ? (
                <div className="lf-resolution is-expired"><TriangleAlert /><div><strong>Deadline passed</strong><p>This decision expired before you responded.</p></div></div>
              ) : (
                <>
                  <div className="lf-decision-heading"><div><span>Chairman action</span><h2>Choose your response</h2></div>{deadline && <small>{deadline}</small>}</div>
                  <div className="lf-decision-grid">
                    {item.choices.map((choice) => {
                      const availability = evaluateChoice(state, choice);
                      return (
                        <Button key={choice.id} variant="ghost" onClick={() => availability.available && onChoose(choice.id)} disabled={!availability.available} className="lf-decision-card">
                          <span><strong>{choice.label}</strong>{choice.hint && <small>{choice.hint}</small>}{!availability.available && <em>{availability.reasons.join(" ")}</em>}</span>
                          <ChevronRight />
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          <div className="lf-briefing-secondary-actions">
            {!decision && item.status !== "completed" && <Button variant="ghost" onClick={onDelete}><Trash2 /> Delete briefing</Button>}
            {item.status === "completed" && <Button className="lf-completed-close" onClick={onDismiss}>Close briefing</Button>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}