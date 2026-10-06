import { newGame } from "../engine";
import { makeStaff, staffPoolFor, staffRoleAvailable } from "../staff";
import {
  SUPPORTER_EVENTS,
  eventCoordinationSupport,
  eventCost,
  resolveDueSupporterEvents,
  scheduleSupporterEvent,
  supporterEvents,
} from "../supporterEvents";
import { currentAbsoluteDay } from "../timeline";

let passed=0,failed=0;
const check=(label:string,ok:boolean)=>{if(ok){passed++;console.log("  ✓ "+label)}else{failed++;console.log("  ✗ "+label)}};

console.log("\n[COMMUNITY & EVENTS OFFICER]");

const base=newGame("Community Town","Director Test");
base.cash=250000;
const family=SUPPORTER_EVENTS.find((event)=>event.id==="open-training")!;

check("role is available to grassroots clubs",staffRoleAvailable(base,"Community & Events Officer"));
check("grassroots staff market includes event specialists",staffPoolFor(base).some((staff)=>staff.role==="Community & Events Officer"));

const staffed=structuredClone(base);
const coordinator=makeStaff("Community & Events Officer",82,()=>0.72);
staffed.hiredStaff=[...(staffed.hiredStaff??[]),coordinator];

const support=eventCoordinationSupport(staffed);
check("coordinator is detected",support.coordinator?.id===coordinator.id);
check("coordinator gives a cost discount",support.costDiscountPct>0);
check("coordinator improves turnout",support.turnoutBoostPct>0);
check("coordinator shortens cooldowns",support.cooldownReductionPct>0);
check("staffed event costs less",eventCost(staffed,family)<eventCost(base,family));

const plainBooked=scheduleSupporterEvent(base,"open-training",3).state;
const staffedBooked=scheduleSupporterEvent(staffed,"open-training",3).state;
const plainEvent=supporterEvents(plainBooked)[0];
const staffedEvent=supporterEvents(staffedBooked)[0];
plainEvent.scheduledAbsoluteDay=currentAbsoluteDay(plainBooked);
staffedEvent.scheduledAbsoluteDay=currentAbsoluteDay(staffedBooked);
resolveDueSupporterEvents(plainBooked);
resolveDueSupporterEvents(staffedBooked);

check("both events resolve",plainEvent.status==="completed"&&staffedEvent.status==="completed");
check("coordinator lifts resolved attendance",(staffedEvent.attendance??0)>(plainEvent.attendance??0));
check("coordinator never reduces fan reward",(staffedEvent.fanGain??0)>=(plainEvent.fanGain??0));

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if(failed) process.exit(1);
