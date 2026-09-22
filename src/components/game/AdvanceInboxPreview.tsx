import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  Inbox,
  Mail,
  Pause,
  RefreshCw,
  Repeat2,
  Trophy,
  X,
} from "lucide-react";
import type { GameState, InboxItem } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requiresInboxDecision } from "@/lib/game/inbox";
import {
  calendarDay,
  FRIENDLY_WEEKS,
  isTransferDeadlineDay,
  isTransferDeadlineWeek,
  transferDeadlineHoursRemaining,
  windowStatus,
} from "@/lib/game/calendar";
import { clubDisplayName } from "@/lib/game/clubReference";
import { timelineEventsForWeek } from "@/lib/game/timeline";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const SHORT_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export function AdvanceInboxPreview({
  items,
  isContinuing,
  reason,
  onStop,
  onClose,
  onOpenInbox,
  onOpenMatchday,
  state,
}: {
  items: InboxItem[];
  isContinuing: boolean;
  reason: string | null;
  onStop: () => void;
  onClose: () => void;
  onOpenInbox: () => void;
  onOpenMatchday: () => void;
  state: GameState;
}) {
  const interrupted = !isContinuing && !!reason;
  const isMatchday = interrupted && reason?.toLowerCase().includes("matchday");
  const fixture = state.fixtures.find((item) => item.week === state.week && (item.dayOfWeek ?? 5) === currentDay && !state.results.some((result) => result.week === item.week && result.opponent === item.opponent && result.home === item.home && (result.dayOfWeek ?? 5) === (item.dayOfWeek ?? 5) && (result.competition ?? "league") === (item.competition ?? "league")));
  const currentDay = calendarDay(state);
  const weekEvents = timelineEventsForWeek(state, state.week);
  const transferWindow = windowStatus(state);
  const deadlineWeek = isTransferDeadlineWeek(state);
  const deadlineDay = isTransferDeadlineDay(state);
  const deadlineHours = transferDeadlineHoursRemaining(state);
  const isFriendlyWeek = FRIENDLY_WEEKS.has(state.week);
  const newIds = new Set(items.map((item) => item.id));
  const inboxItems = state.inbox
    .slice()
    .sort((a, b) => {
      const aDecision = requiresInboxDecision(a) ? 1 : 0;
      const bDecision = requiresInboxDecision(b) ? 1 : 0;
      const aUnread = a.status === "unread" ? 1 : 0;
      const bUnread = b.status === "unread" ? 1 : 0;
      return (
        bDecision - aDecision ||
        bUnread - aUnread ||
        b.season - a.season ||
        b.week - a.week ||
        b.id.localeCompare(a.id)
      );
    });
  const unread = inboxItems.filter(
    (item) => item.status === "unread" || item.status === "awaitingDecision",
  ).length;
  const matchdayLabel = fixture
    ? `${fixture.home ? "Home" : "Away"} vs ${clubDisplayName(state, fixture.opponent)}. The week pauses here until the match is played.`
    : undefined;

  return (
    <div className="fixed inset-0 z-40 bg-black/45 px-3 pb-20 pt-20 backdrop-blur-[2px] md:px-6 md:pb-24">
      <section className="mx-auto flex h-full max-h-[36rem] w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl">
        <header
          className={cn(
            "shrink-0 border-b px-4 py-3",
            deadlineDay
              ? "bg-amber-500/10"
              : isMatchday
                ? "bg-emerald-500/10"
                : interrupted
                  ? "bg-amber-500/10"
                  : "bg-primary/5",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                deadlineDay
                  ? "bg-amber-500/15 text-amber-700"
                  : isMatchday
                    ? "bg-emerald-500/15 text-emerald-700"
                    : interrupted
                      ? "bg-amber-500/15 text-amber-700"
                      : "bg-primary/10 text-primary",
              )}
            >
              {deadlineDay ? (
                <Repeat2 className="size-5" />
              ) : isMatchday ? (
                <Trophy className="size-5" />
              ) : interrupted ? (
                <AlertTriangle className="size-5" />
              ) : (
                <Inbox className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-display text-xl">
                  {deadlineDay
                    ? "Transfer deadline day"
                    : isMatchday
                      ? "It’s matchday"
                      : interrupted
                        ? "Time stopped"
                        : "Time is moving"}
                </div>
                {transferWindow.open && (
                  <span
                    title={transferWindow.detail}
                    aria-label={transferWindow.label}
                    className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-primary"
                  >
                    <RefreshCw className="size-3 animate-[spin_4s_linear_infinite]" />
                    Window open
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {deadlineDay
                  ? `${deadlineHours} hour${deadlineHours === 1 ? "" : "s"} remaining. Time now advances one hour at a time until the window closes.`
                  : isMatchday
                    ? (matchdayLabel ??
                      "The week pauses here. Your team is ready and the fixture is waiting.")
                    : interrupted
                      ? reason
                      : "Your schedule and inbox stay visible while the days pass."}
              </p>
            </div>
            {!isContinuing && (
              <button
                onClick={onClose}
                aria-label="Close preview"
                className="grid size-9 place-items-center rounded-xl hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        </header>

        <div className="grid shrink-0 grid-cols-4 divide-x border-b bg-muted/25 text-center">
          <PreviewMetric label="Week" value={`${state.week}`} />
          <PreviewMetric label={deadlineDay ? "Time left" : "Today"} value={deadlineDay ? `${deadlineHours}H` : DAYS[currentDay].slice(0, 3)} accent={deadlineDay} />
          <PreviewMetric label="Inbox" value={`${unread}`} />
          <PreviewMetric
            label="Status"
            value={deadlineDay ? "DEADLINE" : isMatchday ? "MATCH" : isContinuing ? "LIVE" : "PAUSED"}
            accent={deadlineDay || isMatchday || isContinuing}
          />
        </div>

        <div className="shrink-0 border-b bg-background/60 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <span>Week {state.week}</span>
            <span>
              {deadlineDay
                ? `Deadline day · ${deadlineHours}h left`
                : isContinuing
                  ? "Advancing day by day"
                  : "Calendar paused"}
            </span>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-7 transition-all duration-300 ease-out" aria-label="Current week">
              {SHORT_DAYS.map((dayLabel, index) => {
                const active = index === currentDay;
                const passed = index < currentDay;
                const dayEvents = weekEvents.filter((event) => event.day === index);
                const fixtureEvent = dayEvents.find((event) => event.kind === "fixture");
                const deadlineEvent = dayEvents.find((event) => event.kind !== "fixture");
                const closesWindow = transferWindow.open && deadlineWeek && index === 6;
                return (
                  <div
                    key={dayLabel}
                    title={closesWindow ? "Transfer window closes · final 24 hours" : transferWindow.open ? "Transfer window open" : undefined}
                    className={cn(
                      "relative flex min-h-[4.9rem] min-w-0 flex-col items-center border-r px-0.5 py-2 last:border-r-0 text-center transition-colors duration-300",
                      active && "bg-primary text-primary-foreground",
                      passed && !active && "bg-muted/55 text-muted-foreground",
                      !passed && !active && "bg-card text-foreground",
                      closesWindow && !active && "ring-1 ring-inset ring-amber-400/70",
                    )}
                  >
                    <span className="text-[8px] font-bold tracking-[0.12em]">{dayLabel}</span>
                    {transferWindow.open && (
                      <Repeat2
                        aria-label={closesWindow ? "Transfer window closes" : "Transfer window open"}
                        className={cn("mt-1 size-3", closesWindow && "animate-pulse", active ? "text-current" : "text-primary")}
                      />
                    )}
                    {fixtureEvent ? (
                      <>
                        <Trophy className={cn("mt-0.5 size-3", active ? "text-current" : "text-emerald-600")} />
                        <span className="mt-0.5 max-w-full truncate text-[7px] font-bold leading-tight">
                          {event.fixtureCompetition === "preseason" ? "FRIENDLY" : "MATCH"}
                        </span>
                      </>
                    ) : deadlineEvent ? (
                      <>
                        <CalendarDays className={cn("mt-0.5 size-3", active ? "text-current" : "text-primary")} />
                        <span className="mt-0.5 max-w-full truncate text-[7px] font-bold leading-tight">
                          {deadlineEvent.kind === "transfer" ? "TRANSFER" : deadlineEvent.kind === "scouting" ? "SCOUT" : "EVENT"}
                        </span>
                      </>
                    ) : !transferWindow.open ? (
                      <span
                        className={cn(
                          "mt-3 size-1.5 rounded-full",
                          active ? "bg-current/40" : passed ? "bg-muted-foreground/30" : "bg-border",
                        )}
                      />
                    ) : null}
                    {closesWindow && (
                      <span className="mt-auto max-w-full text-[6px] font-black uppercase leading-none tracking-tight">
                        Last 24h
                      </span>
                    )}
                    {!closesWindow && dayEvents.length > 1 && (
                      <span className="mt-auto text-[7px] font-bold opacity-75">+{dayEvents.length - 1}</span>
                    )}
                    {active && isContinuing && (
                      <span className="absolute inset-x-1 bottom-0 h-0.5 animate-pulse rounded-full bg-current" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <div className="space-y-4">
            {deadlineDay && (
              <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                  <Repeat2 className="size-3.5" /> Final 24 hours
                </div>
                <div className="mt-1 font-display text-2xl">{deadlineHours} hours remaining</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Transfer activity can continue during these hourly ticks. The normal week settles once, when the final hour expires.
                </p>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <CalendarDays className="size-3.5" /> This week
              </div>
              {weekEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No scheduled club events this week.
                </div>
              ) : (
                <div className="space-y-2">
                  {weekEvents.map((event) => {
                    const eventFixture =
                      event.kind === "fixture"
                        ? state.fixtures.find(
                            (candidate) =>
                              candidate.week === event.week &&
                              (candidate.dayOfWeek ?? 5) === event.day &&
                              candidate.opponent === event.fixtureOpponent &&
                              (candidate.competition ?? "league") === (event.fixtureCompetition ?? "league"),
                          )
                        : undefined;
                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border p-3",
                          event.day === currentDay && "border-primary/50 bg-primary/5",
                          event.kind === "fixture" && "border-emerald-500/40 bg-emerald-500/5",
                        )}
                      >
                        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted">
                          {event.kind === "fixture" ? (
                            <Trophy className="size-4 text-emerald-600" />
                          ) : (
                            <CalendarDays className="size-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                            <span>{DAYS[event.day]}</span>
                            {event.kind === "fixture" && (
                              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] text-emerald-700">
                                {event.fixtureCompetition === "preseason" ? "Friendly" : "Match"}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-sm font-semibold">
                            {event.kind === "fixture" && eventFixture
                              ? `${eventFixture.home ? "vs" : "at"} ${clubDisplayName(state, eventFixture.opponent)}`
                              : event.label}
                          </div>
                          {event.kind === "fixture" && eventFixture ? (
                            <div className="truncate text-xs text-muted-foreground">
                              {eventFixture.home ? "Home" : "Away"} · {event.fixtureCompetition === "preseason" ? "Pre-season friendly" : "Competitive fixture"}
                            </div>
                          ) : event.detail ? (
                            <div className="truncate text-xs text-muted-foreground">{event.detail}</div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <Mail className="size-3.5" /> Inbox
                </div>
                {items.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {items.length} new while advancing
                  </span>
                )}
              </div>

              {inboxItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-3 py-4 text-center">
                  <Mail className="mx-auto mb-2 size-6 text-muted-foreground" />
                  <p className="text-sm font-semibold">Inbox is clear</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    New club messages will appear here as they arrive.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inboxItems.map((item) => {
                    const decision = requiresInboxDecision(item);
                    const isNew = newIds.has(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={onOpenInbox}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border p-3 text-left",
                          decision
                            ? "border-amber-500/50 bg-amber-500/5"
                            : isNew
                              ? "border-primary/40 bg-primary/5"
                              : "bg-background",
                        )}
                      >
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            decision
                              ? "bg-amber-500"
                              : item.status === "unread"
                                ? "bg-primary"
                                : "bg-muted-foreground/30",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{item.department}</span>
                            {decision && <span className="font-bold text-amber-600">Decision</span>}
                            {isNew && <span className="font-bold text-primary">New</span>}
                            <span className="ml-auto">W{item.week}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-sm font-semibold">{item.subject}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t bg-card p-3">
          {isContinuing ? (
            <Button variant="destructive" className="col-span-2 h-12" onClick={onStop}>
              <Pause className="mr-2 size-5" /> {deadlineDay ? "Pause deadline day" : "Stop advancing"}
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-12" onClick={onClose}>
                Close
              </Button>
              <Button className="h-12" onClick={isMatchday ? onOpenMatchday : onOpenInbox}>
                {isMatchday ? "Go to matchday" : "Open inbox"}{" "}
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-2 py-2">
      <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 font-display text-base leading-none", accent && "text-primary")}>{value}</div>
    </div>
  );
}
