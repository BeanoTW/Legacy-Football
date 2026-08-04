import { newGame, usableCapacity, totalCapacity, advanceWeek } from "../../engine";
const g: any = newGame("Dalton Town","T"); g.saveSeed="PARITY_SEED";
const b: any = structuredClone(g);
for (const a of b.infrastructure.assets) a.condition = 5;
for (const st of b.stands) st.condition = 5;
console.log("immediate", totalCapacity(g), usableCapacity(g), "|", usableCapacity(b));
let G=g,B=b; for(let i=0;i<20;i++){G=advanceWeek(G);B=advanceWeek(B);}
console.log("after20", usableCapacity(G), usableCapacity(B));
console.log("cond G", G.infrastructure.assets.filter((a:any)=>a.capacity>0).map((a:any)=>a.condition));
console.log("cond B", B.infrastructure.assets.filter((a:any)=>a.capacity>0).map((a:any)=>a.condition));
