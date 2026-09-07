import { AlertTriangle, ChevronRight, Inbox, Mail, Pause, Trophy, X } from "lucide-react";
import type { GameState, InboxItem } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requiresInboxDecision } from "@/lib/game/inbox";
import { calendarDay } from "@/lib/game/calendar";
import { clubDisplayName } from "@/lib/game/clubReference";

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
  const fixture = state.fixtures.find((item) => item.week === state.week);
  const currentDay = calendarDay(state);
  const matchdayLabel = fixture ? `${fixture.home ? "Home" : "Away"} vs ${clubDisplayName(state, fixture.opponent)}. The week pauses here until the match is played.` : undefined;

  return (
    <div className="fixed inset-0 z-40 bg-black/45 px-3 pb-20 pt-20 backdrop-blur-[2px] md:px-6 md:pb-24">
      <section className="mx-auto flex h-full max-h-[34rem] w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl">
        <header className={cn("shrink-0 border-b px-4 py-3", isMatchday ? "bg-emerald-500/10" : interrupted ? "bg-amber-500/10" : "bg-primary/5")}>
          <div className="flex items-start gap-3">
            <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", isMatchday ? "bg-emerald-500/15 text-emerald-700" : interrupted ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary")}>
              {isMatchday ? <Trophy className="size-5" /> : interrupted ? <AlertTriangle className="size-5" /> : <Inbox className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl">{isMatchday ? "It’s matchday" : interrupted ? "Time stopped" : "Time is moving"}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isMatchday ? (matchdayLabel ?? "The week pauses here. Your team is ready and the fixture is waiting.") : interrupted ? reason : "New club updates will appear here as the days pass."}
              </p>
            </div>
            {!isContinuing && <button onClick={onClose} aria-label="Close preview" className="grid size-9 place-items-center rounded-xl hover:bg-muted"><X className="size-5" /></button>}
          </div>
        </header>

        <div className="grid shrink-0 grid-cols-4 divide-x border-b bg-muted/25 text-center">
          <PreviewMetric label="Week" value={`${state.week}`} />
          <PreviewMetric label="Today" value={DAYS[currentDay].slice(0, 3)} />
          <PreviewMetric label="New" value={`${items.length}`} />
          <PreviewMetric label="Status" value={isMatchday ? "MATCH" : isContinuing ? "LIVE" : "PAUSED"} accent={isMatchday || isContinuing} />
        </div>

        <div className="shrink-0 border-b bg-background/60 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <span>Week {state.week}</span>
            <span>{isContinuing ? "Advancing day by day" : "Calendar paused"}</span>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-7 transition-all duration-300 ease-out" aria-label="Current week">
              {SHORT_DAYS.map((dayLabel, index) => {
                const active = index === currentDay;
                const passed = index < currentDay;
                return (
                  <div
                    key={dayLabel}
                    className={cn(
                      "relative grid min-h-12 place-items-center border-r last:border-r-0 text-center transition-colors duration-300",
                      active && "bg-primary text-primary-foreground",
                      passed && !active && "bg-muted/55 text-muted-foreground",
                      !passed && !active && "bg-card text-foreground",
                    )}
                  >
                    <span className="text-[8px] font-bold tracking-[0.12em]">{dayLabel}</span>
                    <span className={cn("mt-0.5 size-1.5 rounded-full", active ? "bg-current" : passed ? "bg-muted-foreground/40" : "bg-border")} />
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
          {items.length === 0 ? (
            <div className="grid h-full min-h-36 place-items-center text-center">
              <div><Mail className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="text-sm font-semibold">Nothing new yet</p><p className="mt-1 text-xs text-muted-foreground">The calendar is advancing day by day.</p></div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const decision = requiresInboxDecision(item);
                return (
                  <button key={item.id} onClick={onOpenInbox} className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left", decision ? "border-amber-500/50 bg-amber-500/5" : "bg-background")}>
                    <span className={cn("size-2 shrink-0 rounded-full", decision ? "bg-amber-500" : "bg-primary")} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[10px] text-muted-foreground"><span>{item.department}</span>{decision && <span className="font-bold text-amber-600">Decision</span>}<span className="ml-auto">W{item.week}</span></span><span className="mt-0.5 block truncate text-sm font-semibold">{item.subject}</span></span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t bg-card p-3">
          {isContinuing ? (
            <Button variant="destructive" className="col-span-2 h-12" onClick={onStop}><Pause className="mr-2 size-5" /> Stop advancing</Button>
          ) : (
            <><Button variant="outline" className="h-12" onClick={onClose}>Close</Button><Button className="h-12" onClick={isMatchday ? onOpenMatchday : onOpenInbox}>{isMatchday ? "Go to matchday" : "Open inbox"} <ChevronRight className="ml-1 size-4" /></Button></>
          )}
        </footer>
      </section>
    </div>
  );
}

function PreviewMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="px-2 py-2"><div className="text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</div><div className={cn("mt-0.5 font-display text-base leading-none", accent && "text-primary")}>{value}</div></div>;
}
