import { newGame, advanceWeek } from "../../engine";
let s: any = newGame("Dalton Town","Test Boss"); s.saveSeed="INTEGRATION_SEED";
for (let i=1;i<5;i++) s = advanceWeek(s);
const a = advanceWeek(structuredClone(s));
const b = advanceWeek(structuredClone(s));
function diff(x:any,y:any,p=""){ 
  if (JSON.stringify(x)===JSON.stringify(y)) return;
  if (x&&y&&typeof x==="object"){ for(const k of new Set([...Object.keys(x),...Object.keys(y)])) diff(x[k],y[k],p+"."+k); return;}
  console.log(p, JSON.stringify(x), "!=", JSON.stringify(y));
}
diff(a,b);
