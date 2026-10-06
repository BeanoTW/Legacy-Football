import { useMemo, useState } from "react";
import { CalendarDays, List, Grid3X3, Circle, Trophy, RefreshCw } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { calendarRail } from "@/lib/game/advancePlanner";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { cn } from "@/lib/utils";
import { ClubBadge } from "./ClubKitArt";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { clubKitFor, clubKitForReference } from "@/lib/game/clubKit";

type CalendarDay = ReturnType<typeof calendarRail>[number] & { __state: GameState };

const FULL_DAY = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function ClubCalendar({ state }: { state: GameState }) {
  const [agenda, setAgenda] = useState(false);
  const days = useMemo(() => calendarRail(state, 12).map(day => ({
    ...day,
    __state: state,
    fixtures: day.fixtures.map(f => ({ ...f, opponent: clubPresentationName(clubDisplayName(state, f.opponentRef)) })),
  })), [state]);
  const upcoming = days;
  return <div className="mx-auto max-w-5xl space-y-4 p-3 pb-28 sm:p-6">
    <header className="overflow-hidden rounded-3xl border bg-[linear-gradient(120deg,#0c211a,#16333b_58%,#321b50)] p-5 text-white shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-violet-200"><CalendarDays className="size-4"/> Club calendar</div>
        <h1 className="mt-2 font-display text-4xl">What's ahead</h1><p className="mt-1 text-sm text-white/65">Fixtures, deadlines and club work in one timeline.</p></div>
        <button onClick={()=>setAgenda(v=>!v)} className="rounded-xl border border-white/15 bg-white/10 p-2.5" aria-label="Toggle calendar view">{agenda?<Grid3X3/>:<List/>}</button>
      </div>
    </header>
    {agenda ? <Agenda days={upcoming}/> : <MonthGrid days={upcoming}/>}
    <div className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground"><strong className="text-foreground">Calendar certainty:</strong> <span className="ml-2">● confirmed date</span><span className="ml-3">◐ expected window</span>. Expected windows will appear as more club systems expose response/completion ranges.</div>
  </div>;
}

function MonthGrid({days}:{days:CalendarDay[]}) {
  const weeks:CalendarDay[][]=[]; for(const day of days){const last=weeks[weeks.length-1]; if(last&&last[0].week===day.week)last.push(day);else weeks.push([day]);}
  return <div className="space-y-3">{weeks.map(week=><section key={week[0].week} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex justify-between border-b px-4 py-2"><strong>Week {week[0].week}</strong><span className="text-xs text-muted-foreground">{week[0].month}</span></div>
    <div className="grid grid-cols-7">{week.map(day=><div key={day.absoluteDay} className={cn("min-h-24 min-w-0 overflow-hidden border-r p-1 last:border-r-0",day.isToday&&"bg-primary/10",day.isPast&&"opacity-45")}>
      <div className="text-[10px] text-muted-foreground">{day.dayName}</div><div className="font-display text-xl">{day.date}</div>
      <DayMarks day={day} state={day.__state}/>
    </div>)}</div>
  </section>)}</div>;
}

function DayMarks({day,state}:{day:CalendarDay;state:GameState}) { return <div className="mt-1 space-y-1">
  {day.windowOpen && !day.deadlineDay ? <div className="flex items-center gap-1 text-[8px] font-medium text-violet-400" title="Transfer window open"><RefreshCw className="size-2.5"/><span className="sr-only">Transfer window open</span></div> : null}
  {day.fixtures.slice(0,1).map((f,i)=>{
    const ours=clubKitFor(state), theirs=clubKitForReference(state,f.opponentRef);
    const home=f.home?{kit:ours,name:state.clubName}:{kit:theirs,name:f.opponent};
    const away=f.home?{kit:theirs,name:f.opponent}:{kit:ours,name:state.clubName};
    return <Popover key={i}><PopoverTrigger asChild><button type="button" className="block w-full max-w-full overflow-hidden rounded-md border border-emerald-500/20 bg-emerald-500/10 px-0.5 py-1 text-emerald-700 dark:text-emerald-300" aria-label={`${home.name} versus ${away.name}`}>
      <span className="flex items-center justify-center gap-0.5"><Trophy className="size-2.5 shrink-0 opacity-80"/><ClubBadge design={home.kit.badge} clubName={home.name} size={14}/><span className="text-[7px] font-bold opacity-60">v</span><ClubBadge design={away.kit.badge} clubName={away.name} size={14}/></span>
    </button></PopoverTrigger><PopoverContent side="top" align="center" className="w-auto max-w-[calc(100vw-2rem)] rounded-xl px-3 py-2 text-sm">
      <div className="flex items-center gap-2 font-semibold"><ClubBadge design={home.kit.badge} clubName={home.name} size={22}/><span>{home.name}</span><span className="text-muted-foreground">v</span><ClubBadge design={away.kit.badge} clubName={away.name} size={22}/><span>{away.name}</span></div>
      <div className="mt-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">Home · Away</div>
    </PopoverContent></Popover>
  })}
  {day.events.slice(0,2).map((e)=><div key={e.id} className="truncate rounded bg-violet-500/10 px-1 py-0.5 text-[9px] text-violet-700 dark:text-violet-300">● {e.label}</div>)}
  {day.deadlineDay&&<div className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">● Deadline</div>}
</div>}

function Agenda({days}:{days:CalendarDay[]}) {const active=days.filter(d=>d.fixtures.length||d.events.length||d.deadlineDay);return <div className="space-y-2">{active.length?active.map(day=><div key={day.absoluteDay} className="flex gap-3 rounded-2xl border bg-card p-3">
  <div className="w-14 shrink-0 text-center"><div className="text-[10px] uppercase text-muted-foreground">{FULL_DAY[day.day].slice(0,3)}</div><div className="font-display text-2xl">{day.date}</div><div className="text-[10px] text-muted-foreground">{day.month}</div></div>
  <div className="min-w-0 flex-1 space-y-1">{day.fixtures.map((f,i)=><div key={i} className="text-sm"><Circle className="mr-2 inline size-2 fill-emerald-500 text-emerald-500"/><strong>{f.home?"Home to":"Away at"} {f.opponent}</strong></div>)}{day.events.map((e)=><div key={e.id} className="text-sm"><Circle className="mr-2 inline size-2 fill-violet-500 text-violet-500"/>{e.label}{e.detail?<span className="text-muted-foreground"> · {e.detail}</span>:null}</div>)}{day.deadlineDay?<div className="text-sm font-semibold text-amber-600">● Transfer deadline day</div>:null}</div>
</div>):<div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Nothing scheduled in the current horizon.</div>}</div>}
