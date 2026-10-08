import { readFileSync } from "node:fs";
import { newGame } from "../engine";
import { handleInboxChoice } from "../inbox";
import { newsFeed } from "../newsFeed";
import {
  SARAH_MALIK_FLAG,
  SARAH_MALIK_ID,
  eventCoordinationSupport,
} from "../supporterEvents";

let passed=0,failed=0;
const check=(label:string,ok:boolean)=>{if(ok){passed++;console.log("  ✓ "+label)}else{failed++;console.log("  ✗ "+label)}};

console.log("\n[SARAH MALIK ONBOARDING]");

const volunteerStart=newGame("Community Town","Director Test","sarah-volunteer-seed");
const volunteerItem=volunteerStart.inbox.find((item)=>item.generatorId==="community-events-onboarding");
check("Sarah introduces the event system in week one",Boolean(volunteerItem));
check("opening message offers three choices",volunteerItem?.choices?.length===3);
check(
  "Sarah choices do not preview hidden outcomes",
  Boolean(volunteerItem?.choices?.every((choice)=>!choice.hint)),
);

const volunteer=volunteerItem
  ? handleInboxChoice(volunteerStart,volunteerItem.id,"volunteer")
  : volunteerStart;
const volunteerSarah=volunteer.hiredStaff.find((staff)=>staff.id===SARAH_MALIK_ID);
check("volunteer choice keeps Sarah at the club",Boolean(volunteerSarah));
check("volunteer choice pays no wage",volunteerSarah?.wage===0);
check("volunteer status is persisted",volunteer.inboxFlags?.[SARAH_MALIK_FLAG]==="volunteer");
check("volunteer Sarah still supports events",eventCoordinationSupport(volunteer).coordinator?.id===SARAH_MALIK_ID);
check("volunteer decision becomes a news story",newsFeed(volunteer).some((article)=>article.headline.includes("Sarah Malik")&&article.headline.includes("unpaid")));

const paidStart=newGame("Community Town","Director Test","sarah-paid-seed");
const paidItem=paidStart.inbox.find((item)=>item.generatorId==="community-events-onboarding");
const paid=paidItem
  ? handleInboxChoice(paidStart,paidItem.id,"paid")
  : paidStart;
const paidSarah=paid.hiredStaff.find((staff)=>staff.id===SARAH_MALIK_ID);
check("paid choice appoints Sarah",Boolean(paidSarah));
check("paid role has the intended starter wage",paidSarah?.wage===275);
check("paid status is persisted",paid.inboxFlags?.[SARAH_MALIK_FLAG]==="paid");
check("paid appointment creates positive media coverage",newsFeed(paid).some((article)=>article.headline.includes("Sarah Malik")&&article.headline.includes("payroll")));
check("paid appointment gives stronger event support",eventCoordinationSupport(paid).score>eventCoordinationSupport(volunteer).score);

const dismissedStart=newGame("Community Town","Director Test","sarah-dismissed-seed");
const dismissedItem=dismissedStart.inbox.find((item)=>item.generatorId==="community-events-onboarding");
const dismissed=dismissedItem
  ? handleInboxChoice(dismissedStart,dismissedItem.id,"dismissed")
  : dismissedStart;
check("dismissal status is persisted",dismissed.inboxFlags?.[SARAH_MALIK_FLAG]==="dismissed");
check("dismissal removes Sarah from club staff",!dismissed.hiredStaff.some((staff)=>staff.id===SARAH_MALIK_ID));
check("dismissal leaves events director-led",!eventCoordinationSupport(dismissed).coordinator);
check(
  "dismissal becomes visible only after the decision",
  newsFeed(dismissed).some((article)=>article.headline.includes("Sarah Malik")&&article.headline.includes("leaves")),
);

const inboxUi=readFileSync(new URL("../../../components/game/InboxTab.tsx",import.meta.url),"utf8");
check("decision UI never renders choice hint spoilers",!inboxUi.includes("choice.hint"));
check("potential outcome preview is hidden while a decision is pending",inboxUi.includes("item.reward && !decision"));
check("Sarah inbox portrait is explicitly female",inboxUi.includes('item.sender === "Sarah Malik" ? "female"'));

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if(failed) process.exit(1);
