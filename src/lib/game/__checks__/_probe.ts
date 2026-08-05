import { newGame, advanceWeek } from "../engine";
let s: any = newGame("Dalton Town","T"); s.saveSeed="A";
for (let i=0;i<4;i++){ const before=s.week; s=advanceWeek(s); console.log("week",before,"->",s.week,"results",JSON.stringify(s.results.slice(-1))); }
