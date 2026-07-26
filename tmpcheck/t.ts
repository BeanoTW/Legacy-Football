import { newGame } from "../src/lib/game/engine";
import { initClubReputations, clubStrengthFor, strengthParts } from "../src/lib/game/reputation";
const g:any = newGame("Dalton Town","T"); g.saveSeed="REP_SEED_4";
g.clubReputations = initClubReputations(g.leagues,"REP_SEED_4");
const t1=g.leagues[0].clubIds.map((c:string)=>clubStrengthFor(g,c,1));
const t2=g.leagues[1].clubIds.map((c:string)=>clubStrengthFor(g,c,1));
console.log("t1 min",Math.min(...t1),"t2 max",Math.max(...t2));
console.log(strengthParts(g,g.leagues[0].clubIds[0],1));
