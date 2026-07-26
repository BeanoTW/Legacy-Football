import { newGame } from "../engine";
import { runWeeklyGenerators } from "../inbox";
let s = newGame("T FC","M"); s.saveSeed="P"; s.fanHappiness = 20;
for (let i=0;i<5;i++){ s = runWeeklyGenerators(s); s.week += 1; }
const w = s.inbox.filter(i=>i.generatorId==="fans-happiness-warning");
console.log("fan warnings:", w.length, w.map(i=>i.eventKey));
