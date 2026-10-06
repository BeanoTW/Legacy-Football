import { CalendarPlus, CalendarDays, Heart, Star, Users, Pencil, GraduationCap, School, Paintbrush, MessagesSquare, Flag, Shirt, Landmark, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/game/types";
import { SUPPORTER_EVENTS, eventAvailable, eventCost, scheduleSupporterEvent, supporterEvents, type SupporterEventId, type ScheduledSupporterEvent } from "@/lib/game/supporterEvents";
import { EVENT_VISUALS, EVENT_OUTCOME_LABEL, eventDateLabel, supporterEventOutcome } from "@/lib/game/supporterEventPresentation";
import { currentAbsoluteDay } from "@/lib/game/timeline";
import { fmtMoneyExact } from "@/lib/game/format";
import { cn } from "@/lib/utils";
import { EventArtTexture, TurnoutIndicator } from "./EventVisualPrimitives";

const MOTIF_ICONS = { pitch: Users, signing: Pencil, coaching: GraduationCap, school: School, tools: Paintbrush, forum: MessagesSquare, festival: Flag, shirt: Shirt, archive: Landmark, trophy: Trophy };

/** One small vector family shared by booking cards, results and news. */
export function SupporterEventArt({ eventId }: { eventId: SupporterEventId }) {
  const visual = EVENT_VISUALS[eventId];
  const Icon = MOTIF_ICONS[visual.motif];
  return <div className={cn("lf-event-art", visual.tone, `border-${visual.borderStyle}`)} aria-hidden="true">
    <EventArtTexture pattern={visual.texturePattern} />
    <svg viewBox="0 0 160 100" focusable="false" className="relative z-10">
      <path d="M0 76H160V100H0Z" fill="currentColor" opacity=".12" />
      <path d="M8 76V56H35V47H125V56H152V76M8 63H152M35 47L45 36H115L125 47" fill="none" stroke="currentColor" strokeWidth="2" opacity=".3" />
      <path d="M16 87H144M40 78V97M120 78V97" fill="none" stroke="currentColor" opacity=".3" />
      {visual.motif === "pitch" || visual.motif === "coaching" ? <g fill="currentColor"><path d="M26 78L31 64L36 78ZM124 78L129 64L134 78Z"/><circle cx="80" cy="85" r="4"/></g> : null}
      {visual.motif === "festival" || visual.motif === "shirt" ? <path d="M12 15Q80 40 148 15M27 21L34 35L41 25M62 29L70 43L78 30M102 28L110 40L118 23" fill="none" stroke="currentColor" strokeWidth="2"/> : null}
      {visual.motif === "archive" || visual.motif === "trophy" ? <path d="M24 26L28 33L36 33L30 38L32 46L24 41L17 46L19 38L12 33L21 33M136 26L140 33L148 33L142 38L144 46L136 41L129 46L131 38L124 33L133 33" fill="currentColor" opacity=".5"/> : null}
    </svg>
    <Icon className="lf-event-art-icon" strokeWidth={1.5}/>
  </div>;
}

function ResultMetrics({ event }: { event: ScheduledSupporterEvent }) {
  const metrics = [
    { label: "Turnout", value: event.attendance?.toLocaleString() ?? "—", Icon: Users },
    { label: "Fan gain", value: event.fanGain == null ? "—" : `+${event.fanGain}`, Icon: Heart },
    { label: "Reputation", value: event.reputationGain == null ? "—" : `+${event.reputationGain.toFixed(1)}`, Icon: Star },
  ];
  return <dl className="grid grid-cols-3 divide-x border-t pt-3">{metrics.map(({label,value,Icon}) => <div key={label} className="min-w-0 px-2 first:pl-0">
    <dt className="flex items-center gap-1 text-[10px] text-muted-foreground"><Icon className="size-3 shrink-0"/>{label}</dt>
    <dd className="mt-1 font-display text-xl tabular-nums">{value}</dd>
  </div>)}</dl>;
}

export function SupporterEventSummary({ event }: { event: ScheduledSupporterEvent }) {
  const definition = SUPPORTER_EVENTS.find((entry) => entry.id === event.eventId);
  if (!definition) return null;
  const outcome = supporterEventOutcome(event);
  const visual = EVENT_VISUALS[event.eventId];
  return <article className={cn("lf-event-summary overflow-hidden rounded-lg border bg-card", `border-${visual.borderStyle}`, outcome && `outcome-${outcome}`)}>
    <div className="flex items-center gap-3 p-3">
      <div className="w-24 shrink-0"><SupporterEventArt eventId={event.eventId}/></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className={cn("text-[10px] font-semibold uppercase", outcome === "strong" ? "text-income" : outcome === "weak" ? "text-chart-2" : "text-primary")}>
            {outcome ? EVENT_OUTCOME_LABEL[outcome] : event.status === "completed" ? "Event completed" : "Booked · coming up"}
          </p>
          <TurnoutIndicator outcome={outcome} size="sm" />
        </div>
        <h3 className="font-display text-xl leading-tight">{definition.name}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{eventDateLabel(event.scheduledAbsoluteDay)}</p>
      </div>
    </div>
    <div className="px-3 pb-3">{event.status === "completed" ? <ResultMetrics event={event}/> : <p className="border-t pt-2 text-xs text-muted-foreground">{fmtMoneyExact(event.cost)} committed</p>}</div>
  </article>;
}

export function SupporterEventsPanel({ state, act }: { state: GameState; act: (fn: (s: GameState) => { state: GameState; message: string }) => void }) {
  const events = supporterEvents(state);
  const scheduled = events.find((event) => event.status === "scheduled");
  const completed = events.filter((event) => event.status === "completed").sort((a,b) => b.scheduledAbsoluteDay-a.scheduledAbsoluteDay);
  const daysLeft = scheduled ? Math.max(0, scheduled.scheduledAbsoluteDay-currentAbsoluteDay(state)) : 0;
  return <div className="space-y-4">
    {scheduled && <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="text-xs font-semibold">Coming up</h2><span className="text-[11px] text-muted-foreground">{daysLeft === 0 ? "Today" : `In ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}</span></div><SupporterEventSummary event={scheduled}/></section>}
    {completed.length > 0 && <section className="space-y-2"><h2 className="text-xs font-semibold">Latest occasion</h2><SupporterEventSummary event={completed[0]}/>{completed.length > 1 && <details><summary className="cursor-pointer py-2 text-xs text-primary">Past occasions ({completed.length-1})</summary><div className="grid gap-2 sm:grid-cols-2">{completed.slice(1).map((event) => <SupporterEventSummary key={event.id} event={event}/>)}</div></details>}</section>}
    <section><h2 className="mb-2 text-xs font-semibold">Community & supporter events</h2><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {SUPPORTER_EVENTS.map((event) => {
        const available = eventAvailable(state, event);
        return <article key={event.id} className={cn("lf-event-booking-card flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card", `border-${EVENT_VISUALS[event.id].borderStyle}`, !available.ok && "is-unavailable")}>
          <div className="lf-event-card-top"><SupporterEventArt eventId={event.id}/><span className="text-[10px] font-semibold uppercase text-muted-foreground">{EVENT_VISUALS[event.id].category}</span></div>
          <div className="flex flex-1 flex-col p-3 pt-0"><h3 className="font-display text-xl leading-tight">{event.name}</h3><p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{event.description}</p>
            <div className="mt-3 flex items-center justify-between gap-2"><strong className="text-xs tabular-nums">{fmtMoneyExact(eventCost(state,event))}</strong><Button size="sm" className="min-h-10" disabled={!available.ok} onClick={() => act((s) => scheduleSupporterEvent(s,event.id,7))}><CalendarPlus/>Schedule</Button></div>
            <p className="mt-2 min-h-4 text-[10px] text-muted-foreground">{available.ok ? <span className="flex items-center gap-1"><CalendarDays className="size-3"/>{eventDateLabel(currentAbsoluteDay(state)+7)}</span> : available.reason}</p>
          </div>
        </article>;
      })}
    </div></section>
  </div>;
}