import { newGame } from "../engine";
import { reconcile } from "../finance";
import { SUPPORTER_EVENTS, eventAvailable, scheduleSupporterEvent, supporterEvents } from "../supporterEvents";

let passed=0,failed=0;
const check=(label:string,ok:boolean)=>{if(ok){passed++;console.log("  ✓ "+label)}else{failed++;console.log("  ✗ "+label)}};
const s=newGame("Community Town","Director Test");
s.cash=250000;
console.log("\n[SUPPORTER EVENTS]");
check("catalogue has a meaningful spread",SUPPORTER_EVENTS.length>=8);
const r=scheduleSupporterEvent(s,"open-training",7);
check("event can be scheduled",supporterEvents(r.state).some(e=>e.eventId==="open-training"&&e.status==="scheduled"));
check("booking costs real club cash",r.state.cash<s.cash);
check("booking reconciles through canonical finance",reconcile(r.state).ok);
check("only one event can be pending",!eventAvailable(r.state,SUPPORTER_EVENTS.find(e=>e.id==="meet-team")!).ok);
check("legacy state needs no event array",supporterEvents(s).length===0);
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if(failed) process.exit(1);
