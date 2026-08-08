/* Passive chairman economy audit — reporting only, no code changes. */
import { newGame, advanceWeek, squadRating, playerWagesWeekly } from "./src/lib/game/engine";
import { seasonTotals, entriesFor, reconcile } from "./src/lib/game/finance";
import { avgStandCondition } from "./src/lib/game/board";
import { clubReputation } from "./src/lib/game/reputation";
import { userWageBill, userSquad } from "./src/lib/game/recruitment";
import { assets } from "./src/lib/game/infrastructure";
import type { GameState } from "./src/lib/game/types";

const N = Number(process.argv[2] ?? 10);
let s: GameState = newGame("Audit FC", "Auditor");
s.saveSeed = "PASSIVE_AUDIT";

const catSum = (st: GameState, season: number, dir: "income" | "expense", pred: (c: string, sub: string) => boolean) =>
  entriesFor(st, season).filter((e) => e.direction === dir && pred(e.category, e.subcategory))
    .reduce((a, e) => a + e.amount, 0);

const rows: Record<string, unknown>[] = [];
for (let season = 1; season <= N; season++) {
  const opening = s.cash;
  while (!(s.season === season + 1 && s.week === 1)) {
    const before = `${s.season}:${s.week}`;
    s = advanceWeek(s);
    if (`${s.season}:${s.week}` === before) throw new Error("stuck at " + before);
    if (s.season > season) break;
  }
  const t = seasonTotals(s, season);
  const inf = assets(s);
  const pos = (() => {
    const lg = s.leagues?.find((l) => l.clubs?.includes?.(s.clubName));
    const tbl = s.leagueTable ?? [];
    const i = tbl.findIndex((r: { team: string }) => r.team === s.clubName);
    return i >= 0 ? i + 1 : -1;
  })();
  rows.push({
    season,
    open: opening,
    close: s.cash,
    net: s.cash - opening,
    income: t.income,
    expend: t.expenditure,
    gate: catSum(s, season, "income", (c) => c === "Matchday" || c === "Gate Receipts"),
    commercial: catSum(s, season, "income", (c) => /Sponsor|Commercial|Merch/i.test(c)),
    prize: catSum(s, season, "income", (c) => /Prize|Distribution|TV/i.test(c)),
    transfersIn: catSum(s, season, "income", (c) => /Transfer/i.test(c)),
    playerWages: catSum(s, season, "expense", (c) => /Player Wages/i.test(c)),
    staffWages: catSum(s, season, "expense", (c) => /Staff/i.test(c)),
    ops: catSum(s, season, "expense", (c) => /Operat|Stadium|Facil/i.test(c)),
    maint: catSum(s, season, "expense", (c) => /Maint/i.test(c)),
    matchdayCost: catSum(s, season, "expense", (c) => /Matchday/i.test(c)),
    transfersOut: catSum(s, season, "expense", (c) => /Transfer/i.test(c)),
    capex: catSum(s, season, "expense", (c) => /Capital|Project/i.test(c)),
    squad: Math.round(squadRating(s)),
    avgWage: Math.round(userWageBill(s) / Math.max(1, userSquad(s).length)),
    wageBill: userWageBill(s),
    standCond: Math.round(avgStandCondition(s)),
    trainCond: Math.round((inf.find((a) => a.type === "training") ?? { condition: 0 }).condition),
    fans: Math.round(s.fanHappiness),
    boardConf: Math.round(s.board?.confidence ?? 0),
    pos,
    rep: Math.round(clubReputation(s, s.clubName)),
    tier: s.leagues?.find((l) => l.clubs?.includes?.(s.clubName))?.tier ?? "?",
    recon: reconcile(s).ok,
  });
}
const cats = new Map<string, number>();
for (const e of s.financeLedger) {
  const k = `${e.direction}|${e.category}`;
  cats.set(k, (cats.get(k) ?? 0) + e.amount);
}
console.log(JSON.stringify(rows, null, 1));
console.log("\nCATEGORY TOTALS (all seasons)");
[...cats.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(k.padEnd(40), v.toLocaleString()));
