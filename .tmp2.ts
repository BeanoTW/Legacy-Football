import { newGame, advanceWeek, squadRating } from "./src/lib/game/engine";
import { entriesFor, reconcile, seasonTotals } from "./src/lib/game/finance";
import { avgStandCondition } from "./src/lib/game/board";
import { clubReputation } from "./src/lib/game/reputation";
import { userWageBill, userSquad } from "./src/lib/game/recruitment";
import { assets } from "./src/lib/game/infrastructure";
let s = newGame("Audit FC","Auditor"); s.saveSeed="PASSIVE_AUDIT";
const N=Number(process.argv[2]??10);
for(let season=1;season<=N;season++){
  const open=s.cash;
  while(s.season===season) s=advanceWeek(s);
  const es=entriesFor(s,season);
  const agg=new Map<string,number>();
  for(const e of es) { const k=`${e.direction}:${e.category}/${e.subcategory}`; agg.set(k,(agg.get(k)??0)+e.amount); }
  const t=seasonTotals(s,season);
  const lg=s.leagues?.find(l=>l.clubs?.includes(s.clubName));
  console.log(`\n== S${season} tier=${lg?.tier} open=${open} close=${s.cash} net=${s.cash-open} inc=${t.income} exp=${t.expenditure}`);
  console.log(`   squad=${squadRating(s)} n=${userSquad(s).length} wageBill/wk=${userWageBill(s)} stands=${avgStandCondition(s).toFixed(1)} train=${assets(s).find(a=>a.type==="training")?.condition?.toFixed(1)} fans=${s.fanHappiness} board=${s.board?.confidence?.toFixed(0)} rep=${clubReputation(s,s.clubName).toFixed(0)} recon=${reconcile(s).ok}`);
  console.log("   "+[...agg.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${Math.round(v/1000)}k`).join("  "));
}
