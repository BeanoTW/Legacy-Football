import type { GameState, Staff } from "./types";
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

export const SARAH_MALIK_ID = "ST-community-sarah-malik";
export const SARAH_MALIK_FLAG = "communityEventsSarahStatus";
const SARAH_EVENTS_COMPLETED_FLAG = "communityEventsSarahCompleted";

export function sarahMalikStarter(mode: "volunteer" | "paid"): Staff {
  return {
    id: SARAH_MALIK_ID,
    name: "Sarah Malik",
    role: "Community & Events Officer",
    age: 26,
    rating: 38,
    stats: {
      tactics: 30,
      attack: 30,
      defense: 30,
      development: 34,
      scouting: 31,
      negotiation: 36,
      medical: 30,
      motivation: 40,
    },
    wage: mode === "paid" ? 275 : 0,
    contractWeeks: 104,
    reputation: 22,
  };
}

export function applySarahMalikDecisionInPlace(s: GameState, mode: "volunteer" | "paid"): void {
  s.inboxFlags ??= {};
  s.inboxFlags[SARAH_MALIK_FLAG] = mode;
  const existing = (s.hiredStaff ?? []).find((member) => member.id === SARAH_MALIK_ID);
  const sarah = existing ?? sarahMalikStarter(mode);
  sarah.wage = mode === "paid" ? 275 : 0;
  sarah.contractWeeks = Math.max(sarah.contractWeeks, 104);
  if (!existing) s.hiredStaff = [...(s.hiredStaff ?? []), sarah];
}

function developSarahFromCompletedEvent(s: GameState, coordinator?: Staff): void {
  if (!coordinator || coordinator.id !== SARAH_MALIK_ID) return;
  const completed = Number(s.inboxFlags?.[SARAH_EVENTS_COMPLETED_FLAG] ?? 0) + 1;
  s.inboxFlags ??= {};
  s.inboxFlags[SARAH_EVENTS_COMPLETED_FLAG] = completed;
  if (completed % 3 !== 0) return;
  coordinator.stats.motivation = Math.min(72, coordinator.stats.motivation + 1);
  coordinator.stats.negotiation = Math.min(72, coordinator.stats.negotiation + 1);
  coordinator.rating = Math.round((coordinator.stats.motivation * 3 + coordinator.stats.negotiation * 2) / 5);
  coordinator.reputation = Math.min(72, Math.max(coordinator.reputation, coordinator.rating - 8));
}

export interface EventCoordinationSupport {
  coordinator?: Staff;
  volunteer: boolean;
  score: number;
  costDiscountPct: number;
  turnoutBoostPct: number;
  cooldownReductionPct: number;
}

/**
 * Community events remain director-led by default. Hiring a specialist makes
 * them cheaper to organise, improves turnout, and lets the club repeat the
 * same format a little sooner without turning the role into a hard gate.
 */
export function eventCoordinationSupport(s: GameState): EventCoordinationSupport {
  const coordinator = (s.hiredStaff ?? []).find((member) => member.role === "Community & Events Officer");
  if (!coordinator) {
    return { volunteer: false, score: 0, costDiscountPct: 0, turnoutBoostPct: 0, cooldownReductionPct: 0 };
  }
  const volunteer = coordinator.id === SARAH_MALIK_ID && s.inboxFlags?.[SARAH_MALIK_FLAG] === "volunteer";
  const rawScore = clamp(coordinator.stats.motivation * 0.6 + coordinator.stats.negotiation * 0.4, 30, 95);
  const score = Math.round(volunteer ? 30 + (rawScore - 30) * 0.65 : rawScore);
  return {
    coordinator,
    volunteer,
    score,
    costDiscountPct: Math.round(clamp((score - 30) * 0.2, 0, 13)),
    turnoutBoostPct: Math.round(clamp((score - 25) * 0.25, 0, 18)),
    cooldownReductionPct: Math.round(clamp((score - 30) * 0.18, 0, 12)),
  };
}
const store=(s:GameState):ScheduledSupporterEvent[] => {
  const raw=(s as GameState & { supporterEvents?: ScheduledSupporterEvent[] }).supporterEvents;
  return Array.isArray(raw)?raw:[];
};
export const supporterEvents=(s:GameState)=>store(s);
export const eventDefinition=(id:SupporterEventId)=>SUPPORTER_EVENTS.find(e=>e.id===id)!;
export function eventCost(s:GameState,d:SupporterEventDefinition):number {
  const level=footballLevelOfUser(s);
  const scale=Math.pow(1.7,Math.max(0,7-level));
  const support=eventCoordinationSupport(s);
  return Math.round((d.baseCost*scale*(1-support.costDiscountPct/100))/10)*10;
}
export function eventAvailable(s:GameState,d:SupporterEventDefinition):{ok:boolean;reason?:string}{
  const level=footballLevelOfUser(s);
  if(d.minLevel && level>d.minLevel) return {ok:false,reason:`Unlocks at Level ${d.minLevel}`};
  if(store(s).some(e=>e.status==="scheduled")) return {ok:false,reason:"Another club event is already scheduled"};
  const last=[...store(s)].reverse().find(e=>e.eventId===d.id);
  const support=eventCoordinationSupport(s);
  const cooldown=Math.max(1,Math.round(d.cooldownDays*(1-support.cooldownReductionPct/100)));
  if(last && currentAbsoluteDay(s)-last.bookedAbsoluteDay<cooldown) return {ok:false,reason:"Supporters have seen this event too recently"};
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
    const support=eventCoordinationSupport(s);
    const attendance=Math.max(25,Math.round((55+d.fanGain*45)*mood*rep*(1+support.turnoutBoostPct/100)));
    const turnout=clamp(attendance/(80+d.fanGain*50),0.65,1.35);
    e.status="completed"; e.attendance=attendance;
    e.fanGain=Math.max(1,Math.round(d.fanGain*turnout)); e.reputationGain=Number((d.reputationGain*turnout).toFixed(1));
    s.fanHappiness=clamp((s.fanHappiness??60)+e.fanGain,0,100);
    s.reputation=clamp((s.reputation??0)+e.reputationGain,0,100);
    developSarahFromCompletedEvent(s, support.coordinator);
  }
}
