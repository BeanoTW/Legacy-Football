import { newGame } from "../src/lib/game/engine";
const g = newGame("Board FC","M");
console.log(g.board.objectives.length, g.board.objectives.map(o=>o.kind).join(","));
