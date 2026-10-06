import type { GameState } from "./types";
import { postEntry } from "./finance";
import { footballLevelOfUser } from "./footballLevel";
import { currentAbsoluteDay } from "./timeline";

export type SupporterEventId =
  | "open-training" | "meet-team" | "kids-coaching" | "school-visits"
  | "volunteer-ground" | "supporters-evening" | "family-day"
  | "preseason-launch" | "heritage-day" | "legends-day";

export interface SupporterEventDefinition {
  id: SupporterEventId;
  name: string;
  description: string;
  baseCost: number;
  fanGain: number;
  reputationGain: number;
  minLevel?: number;
  cooldownDays: number;
}

export interface ScheduledSupporterEvent {
  id: string;
  eventId: SupporterEventId;
  scheduledAbsoluteDay: number;
  bookedAbsoluteDay: number;
  cost: number;
  status: "scheduled" | "completed";
  attendance?: number;
  fanGain?: number;
  reputationGain?: number;
}

export const SUPPORTER_EVENTS: SupporterEventDefinition[] = [
  { id:"open-training", name:"Open Training Day", description:"Invite local supporters to watch training and meet the squad.", baseCost:350, fanGain:2, reputationGain:0.3, cooldownDays:35 },
  { id:"meet-team", name:"Meet the Team", description:"Photos, autographs and a proper signing session with the first team.", baseCost:650, fanGain:3, reputationGain:0.4, cooldownDays:42 },
  { id:"kids-coaching", name:"Kids' Coaching Day", description:"Players and coaches run a community football session for local children.", baseCost:500, fanGain:3, reputationGain:0.8, cooldownDays:42 },
  { id:"school-visits", name:"School Visits", description:"Take the club into local schools and build the next generation of support.", baseCost:250, fanGain:2, reputationGain:0.7, cooldownDays:35 },
  { id:"volunteer-ground", name:"Ground Volunteer Day", description:"Supporters help spruce up the ground and strengthen the club-community bond.", baseCost:180, fanGain:3, reputationGain:0.4, cooldownDays:56 },
  { id:"supporters-evening", name:"Supporters' Evening", description:"A face-to-face forum with the director and manager.", baseCost:300, fanGain:2, reputationGain:0.3, cooldownDays:35 },
  { id:"family-day", name:"Family Fun Day", description:"A bigger matchday-style community event with food, games and player appearances.", baseCost:1400, fanGain:5, reputationGain:0.8, minLevel:6, cooldownDays:56 },
  { id:"preseason-launch", name:"Pre-season Launch", description:"Unveil the squad, kit, sponsors and ambitions for the new season.", baseCost:2200, fanGain:5, reputationGain:1, minLevel:5, cooldownDays:84 },
  { id:"heritage-day", name:"Club Heritage Day", description:"Celebrate the ground, club story and supporters who built it.", baseCost:3500, fanGain:5, reputationGain:1.2, minLevel:4, cooldownDays:98 },
  { id:"legends-day", name:"Legends Day", description:"Bring former favourites back for a major supporter event.", baseCost:9000, fanGain:7, reputationGain:1.8, minLevel:3, cooldownDays:140 },
];

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const store=(s:GameState):ScheduledSupporterEvent[] => {
  const raw=(s as GameState & { supporterEvents?: ScheduledSupporterEvent[] }).supporterEvents;
  return Array.isArray(raw)?raw:[];
};
export const supporterEvents=(s:GameState)=>store(s);
export const eventDefinition=(id:SupporterEventId)=>SUPPORTER_EVENTS.find(e=>e.id===id)!;
export function eventCost(s:GameState,d:SupporterEventDefinition):number {
  const level=footballLevelOfUser(s);
  const scale=Math.pow(1.7,Math.max(0,7-level));
  return Math.round(d.baseCost*scale/10)*10;
}
export function eventAvailable(s:GameState,d:SupporterEventDefinition):{ok:boolean;reason?:string}{
  const level=footballLevelOfUser(s);
  if(d.minLevel && level>d.minLevel) return {ok:false,reason:`Unlocks at Level ${d.minLevel}`};
  if(store(s).some(e=>e.status==="scheduled")) return {ok:false,reason:"Another club event is already scheduled"};
  const last=[...store(s)].reverse().find(e=>e.eventId===d.id);
  if(last && currentAbsoluteDay(s)-last.bookedAbsoluteDay<d.cooldownDays) return {ok:false,reason:"Supporters have seen this event too recently"};
  const cost=eventCost(s,d); if(s.cash<cost) return {ok:false,reason:"Not enough cash"};
  return {ok:true};
}
export function scheduleSupporterEvent(s:GameState,eventId:SupporterEventId,daysAhead=7):{state:GameState;message:string}{
  const next=structuredClone(s); const d=eventDefinition(eventId); const avail=eventAvailable(next,d);
  if(!avail.ok) return {state:s,message:avail.reason??"Event unavailable"};
  const cost=eventCost(next,d); const now=currentAbsoluteDay(next); const day=now+clamp(Math.round(daysAhead),3,21);
  postEntry(next,{category:"Commercial",subcategory:"Supporter event",description:d.name,amount:cost,direction:"expense",sourceSystem:"commercial",dedupeKey:`supporter-event:${next.season}:${now}:${eventId}`});
  const rec:ScheduledSupporterEvent={id:`SE-${next.season}-${now}-${eventId}`,eventId,scheduledAbsoluteDay:day,bookedAbsoluteDay:now,cost,status:"scheduled"};
  (next as GameState & {supporterEvents?:ScheduledSupporterEvent[]}).supporterEvents=[...store(next),rec];
  return {state:next,message:`${d.name} booked for ${daysAhead} days' time.`};
}
export function resolveDueSupporterEvents(s:GameState):void {
  const now=currentAbsoluteDay(s); const events=store(s);
  for(const e of events){
    if(e.status!=="scheduled"||e.scheduledAbsoluteDay>now) continue;
    const d=eventDefinition(e.eventId);
    const mood=clamp((s.fanHappiness??60)/60,0.65,1.35);
    const rep=clamp((s.reputation??20)/35,0.65,1.8);
    const attendance=Math.max(25,Math.round((55+d.fanGain*45)*mood*rep));
    const turnout=clamp(attendance/(80+d.fanGain*50),0.65,1.35);
    e.status="completed"; e.attendance=attendance;
    e.fanGain=Math.max(1,Math.round(d.fanGain*turnout)); e.reputationGain=Number((d.reputationGain*turnout).toFixed(1));
    s.fanHappiness=clamp((s.fanHappiness??60)+e.fanGain,0,100);
    s.reputation=clamp((s.reputation??0)+e.reputationGain,0,100);
  }
}
