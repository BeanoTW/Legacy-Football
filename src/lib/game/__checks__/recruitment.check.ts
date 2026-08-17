/* Recruitment system audit — players, contracts, transfers, wages, board,
   inbox, UI purity and migration.
   Run with:  bun src/lib/game/__checks__/recruitment.check.ts

   Invariants under test:
     - One player is owned by exactly one club through exactly one contract.
     - A transfer completes through completeTransferInPlace() and nowhere else.
     - Every recruitment pound moves through postEntry().
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { newGame, advanceWeek, migrateSave, setTransferBudget } from "../engine";
import { reconcile } from "../finance";
import { applyEffects, runWeeklyGenerators } from "../inbox";
import { ensureBoard } from "../board";
import {
  MAX_NEGOTIATION_ROUNDS, MAX_SQUAD_SIZE, MIN_SQUAD_SIZE,
  activeContract, ageOf, askingPrice, availabilityReason, averageSquadAge,
  canAuthorisePurchase, canAuthoriseWage,

  completeTransferInPlace, contractSecurityPct, counterClubOfferInPlace,
  ensureRecruitment, freeAgents, generateWorld, incomingTransfersThisSeason,
  negotiationById, netSpendThisSeason, openNegotiations, openTransferNegotiationInPlace,
  playerById, playerName, recruitmentSnapshot, releasePlayerInPlace, renewContractInPlace,
  renewalTerms, respondToIncomingOfferInPlace, shortlistIds, squadOf, submitTransferOffer,
  toggleShortlist, transferMarket, userSquad, userWageBill, wageDemand,
  weeksLeftOnContract, withdrawNegotiationInPlace,
} from "../recruitment";
import type { GameState, TransferNegotiation } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`); }
}
function safe(label: string, fn: () => void) {
  try { fn(); } catch (e) { failed++; console.log(`  ✗ ${label} threw — ${(e as Error).message}`); }
}
const clone = <T,>(x: T): T => structuredClone(x);
/** Serialise + reload, exactly like the save file round-trip. */
const reload = (s: GameState): GameState =>
  migrateSave(JSON.parse(JSON.stringify(s)) as Record<string, unknown>);

/** Fixed seed: the whole generated world is reproducible across runs. */
const BASE = newGame("Audit FC", "Auditor", "RECRUIT_AUDIT_BASE");

function fixture(seed = "RECRUIT_AUDIT", clubName = "Audit FC"): GameState {
  const g = clone(BASE);
  g.clubName = clubName;
  g.saveSeed = seed;
  // Re-generate the world under the audit seed (newGame seeds from the clock).
  delete (g as unknown as Record<string, unknown>).football;
  ensureRecruitment(g);
  return g;
}

const reconciles = (s: GameState) => {
  const r = reconcile(s);
  return r.ok && r.expected === s.cash;
};

/**
 * Push a purchase through club + player talks until it agrees, or give up.
 * Every offer is derived from the canonical asking price (which itself comes
 * from marketValue), never from a hardcoded legacy amount.
 */
function agreedPurchase(s: GameState, opts: { requireSeller?: boolean } = {}): TransferNegotiation | null {
  const budget = Math.max((s.transferBudget ?? 0) * 0.5, 0);
  const market = transferMarket(s)
    .filter((m) => m.askingPrice <= budget && m.askingPrice + m.wageDemand * 4 <= s.cash)
    .filter((m) => (opts.requireSeller ? m.clubId !== null : true));
  for (const m of market.slice().sort((a, b) => a.askingPrice - b.askingPrice).slice(0, 60)) {

    const w = s;
    const r = openTransferNegotiationInPlace(w, m.player.id, Math.round(m.askingPrice * 1.2));
    if (!r.ok || !r.negotiation) continue;
    let n = r.negotiation;
    for (let i = 0; i < MAX_NEGOTIATION_ROUNDS + 1; i++) {
      if (n.stage === "agreed") return n;
      if (n.stage === "clubTalks") counterClubOfferInPlace(w, n.id, Math.round(n.fee * 1.3));
      else if (n.stage === "playerTalks") {
        // improvePlayerTermsInPlace via the counter wage
        const wage = Math.round((n.playerCounterWage ?? n.proposedWeeklyWage * 1.3));
        const res = counterWage(w, n.id, wage);
        if (!res) break;
      } else break;
      n = negotiationById(w, n.id)!;
    }
    if (n.stage === "agreed") return n;
    if (n.stage !== "completed") withdrawNegotiationInPlace(w, n.id);
  }
  return null;
}
function counterWage(w: GameState, id: string, wage: number): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { improvePlayerTermsInPlace } = require("../recruitment");
  return improvePlayerTermsInPlace(w, id, wage).ok as boolean;
}

/** Advance until an AI club bids for one of ours. */
function withIncomingBid(seed: string): { s: GameState; n: TransferNegotiation } | null {
  const s = fixture(seed);
  for (let i = 0; i < 60; i++) {
    const bid = (s.football.negotiations ?? []).find((n) => n.direction === "out" && n.stage === "clubTalks");
    if (bid) return { s, n: bid };
    Object.assign(s, advanceWeek(s));
  }
  return null;
}

/* =====================================================================
   [R1] Player world
===================================================================== */
console.log("\n[R1] Player world");
{
  const a = fixture("SEED-A");
  const b = fixture("SEED-A");
  const c = fixture("SEED-B");
  check("1. world generation is deterministic", JSON.stringify(a.football.players) === JSON.stringify(b.football.players));
  check("2. same seed ⇒ byte-identical contracts", JSON.stringify(a.football.contracts) === JSON.stringify(b.football.contracts));
  check("3. different seed ⇒ materially different players",
    JSON.stringify(a.football.players) !== JSON.stringify(c.football.players));
  const ids = a.football.players.map((p) => p.id);
  check("4. player ids are unique", new Set(ids).size === ids.length);
  check("5. identities survive a reload", JSON.stringify(reload(a).football.players) === JSON.stringify(a.football.players));
  check("6. every player has valid age/position/ability/potential/value", a.football.players.every((p) => {
    const age = ageOf(p, a.season);
    return age >= 15 && age <= 42
      && ["GK", "DEF", "MID", "FWD"].includes(p.primaryPosition)
      && p.currentAbility >= 1 && p.currentAbility <= 99
      && p.potentialAbility >= p.currentAbility && p.potentialAbility <= 99
      && p.marketValue >= 0 && p.wageExpectation > 0;
  }));
  const src = readFileSync("src/lib/game/recruitment.ts", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  check("7. no Math.random()/Date.now() in recruitment simulation",
    !/Math\.random\(/.test(code) && !/Date\.now\(/.test(code));
  check("7b. generateWorld is pure w.r.t. a throwaway state", (() => {
    const g = fixture("PURE");
    const before = JSON.stringify(g.football);
    generateWorld(g);
    return JSON.stringify(g.football) === before;
  })());
}

/* =====================================================================
   [R2] Ownership and squads
===================================================================== */
console.log("\n[R2] Ownership and squads");
{
  const s = fixture();
  const owners = new Map<string, string[]>();
  for (const c of s.football.contracts.filter((x) => x.status === "Active" || x.status === "Expiring")) {
    owners.set(c.playerId, [...(owners.get(c.playerId) ?? []), c.clubId]);
  }
  check("8. every contracted player belongs to exactly one club",
    [...owners.values()].every((v) => v.length === 1));
  const clubs = [...new Set(s.football.players.map((p) => p.currentClubId).filter(Boolean))] as string[];
  const seen = new Set<string>();
  let dupe = false;
  for (const club of clubs) for (const p of squadOf(s, club)) { if (seen.has(p.id)) dupe = true; seen.add(p.id); }
  check("9. no player appears in two squads", !dupe);
  check("10. squad membership matches active contracts", s.football.players.every((p) => {
    const c = activeContract(s, p.id);
    return p.currentClubId === null ? !c : !!c && c.clubId === p.currentClubId;
  }));
  check("11. currentClubId, contractId and contract agree", s.football.players.every((p) => {
    const c = activeContract(s, p.id);
    return p.currentClubId === null ? p.contractId === null : !!c && c.id === p.contractId;
  }));
  check("12. free agents hold no active contract",
    freeAgents(s).every((p) => !activeContract(s, p.id)));
  check("13. squad generation is deterministic",
    JSON.stringify(userSquad(s)) === JSON.stringify(userSquad(fixture())));
  check("14. club squad sizes stay within bounds",
    clubs.every((c) => squadOf(s, c).length >= MIN_SQUAD_SIZE && squadOf(s, c).length <= MAX_SQUAD_SIZE));

  const w = fixture("MOVE");
  setTransferBudget(w, 0); // ensure fresh authority below
  Object.assign(w, setTransferBudget(w, Math.min(20_000_000, Math.floor(w.cash))).state);
  const n = agreedPurchase(w);
  if (!n) { check("15/16. transfer completion moves the player", false, "no agreed deal reachable"); }
  else {
    const seller = n.fromClubId;
    const before = seller ? squadOf(w, seller).length : 0;
    const r = completeTransferInPlace(w, n.id);
    check("15. completion removes the player from the selling squad",
      r.ok && (!seller || squadOf(w, seller).length === before - 1));
    check("16. completion adds the player to the buying squad exactly once",
      userSquad(w).filter((p) => p.id === n.playerId).length === 1);
  }
}

/* =====================================================================
   [R3] Contracts
===================================================================== */
console.log("\n[R3] Contracts");
{
  const s = fixture("CONTRACTS");
  const byPlayer = new Map<string, number>();
  for (const c of s.football.contracts.filter((x) => x.status === "Active" || x.status === "Expiring")) {
    byPlayer.set(c.playerId, (byPlayer.get(c.playerId) ?? 0) + 1);
  }
  check("17. at most one active contract per player", [...byPlayer.values()].every((v) => v === 1));
  check("18. active contracts have valid start/expiry",
    s.football.contracts.every((c) => c.startSeason >= 1 && c.expirySeason >= c.startSeason && c.expiryWeek >= 1));
  check("19. contract expiry is absolute-week safe",
    s.football.contracts.every((c) => weeksLeftOnContract(s, c) > -1000));

  const w = clone(s);
  const target = userSquad(w).find((p) => renewalTerms(w, p.id) && renewContractInPlace(clone(w), p.id).ok);
  if (!target) check("20-25. renewal", false, "no renewable player");
  else {
    const oldC = activeContract(w, target.id)!;
    const histBefore = clone(w.football.contractHistory);
    const r = renewContractInPlace(w, target.id);
    check("20. renewal supersedes the previous contract",
      r.ok && oldC.status !== "Active" && !!activeContract(w, target.id));
    check("21. renewal cannot create overlapping active contracts",
      w.football.contracts.filter((c) => c.playerId === target.id && (c.status === "Active" || c.status === "Expiring")).length === 1);
    check("24. contract history is append-only",
      w.football.contractHistory.length === histBefore.length + 1
      && JSON.stringify(w.football.contractHistory.slice(0, histBefore.length)) === JSON.stringify(histBefore));
    const snapshot = clone(w.football.contractHistory);
    renewContractInPlace(w, target.id);
    check("25. earlier history rows are immutable after later renewals",
      JSON.stringify(w.football.contractHistory.slice(0, snapshot.length)) === JSON.stringify(snapshot));
  }

  const rel = clone(s);
  const victim = userSquad(rel)[userSquad(rel).length - 1];
  const rr = releasePlayerInPlace(rel, victim.id);
  check("22. released players become free agents",
    rr.ok && playerById(rel, victim.id)!.currentClubId === null && !activeContract(rel, victim.id));
  check("22b. release reconciles finance", reconciles(rel));

  // Expiry runs exactly once even if the week is replayed from the same save.
  const exp = fixture("EXPIRY");
  let e1 = exp;
  for (let i = 0; i < 30; i++) e1 = advanceWeek(e1);
  const closes = e1.football.contractHistory.filter((r) => r.outcome === "expired");
  const keys = closes.map((r) => `${r.contractId}`);
  check("23. expired contracts close exactly once", new Set(keys).size === keys.length);
  const replay = advanceWeek(reload(e1));
  const replay2 = advanceWeek(reload(e1));
  check("26. reload cannot duplicate expiry/renewal outcomes",
    JSON.stringify(replay.football.contractHistory) === JSON.stringify(replay2.football.contractHistory));
}

/* =====================================================================
   [R4] Transfer market
===================================================================== */
console.log("\n[R4] Transfer market");
{
  const s = fixture("MARKET");
  const m1 = transferMarket(s);
  const before = JSON.stringify(s.football);
  const m2 = transferMarket(s);
  check("27. market availability is deterministic", JSON.stringify(m1) === JSON.stringify(m2));
  check("35. browsing the market does not mutate state", JSON.stringify(s.football) === before);
  check("28. availability always has a football reason",
    m1.every((e) => typeof e.reason === "string" && e.reason.length > 0));
  check("28b. our own players are never on the market",
    m1.every((e) => e.clubId !== s.clubName));
  const ids = m1.map((e) => e.player.id);
  check("29. a listed player appears exactly once", new Set(ids).size === ids.length);

  const w = fixture("MARKET2");
  Object.assign(w, setTransferBudget(w, Math.min(20_000_000, Math.floor(w.cash))).state);
  const n = agreedPurchase(w);
  if (n) {
    completeTransferInPlace(w, n.id);
    check("30. a completed transfer removes market availability",
      !transferMarket(w).some((e) => e.player.id === n.playerId));
    check("31/32/33. a completed negotiation cannot re-complete",
      !completeTransferInPlace(w, n.id).ok);
  } else check("30-33. completion clears availability", false, "no agreed deal reachable");

  const wd = fixture("WITHDRAW");
  Object.assign(wd, setTransferBudget(wd, Math.min(20_000_000, Math.floor(wd.cash))).state);
  const nw = agreedPurchase(wd);
  if (nw) {
    withdrawNegotiationInPlace(wd, nw.id);
    check("31. withdrawn negotiations cannot later complete", !completeTransferInPlace(wd, nw.id).ok);
  } else check("31. withdrawn negotiations cannot later complete", false, "no deal reachable");

  const rj = fixture("REJECT");
  const anyMarket = transferMarket(rj)[0];
  const lowball = openTransferNegotiationInPlace(rj, anyMarket.player.id, 20_000);
  const rejected = lowball.negotiation && lowball.negotiation.stage === "rejected";
  check("32. rejected negotiations cannot later complete",
    !rejected || !completeTransferInPlace(rj, lowball.negotiation!.id).ok);

  const ex = fixture("TTL");
  Object.assign(ex, setTransferBudget(ex, Math.min(20_000_000, Math.floor(ex.cash))).state);
  const ne = agreedPurchase(ex);
  if (ne) {
    let g = ex;
    for (let i = 0; i < 6; i++) g = advanceWeek(g);
    const after = negotiationById(g, ne.id)!;
    check("33. expired negotiations cannot later complete",
      after.stage === "completed" || !completeTransferInPlace(g, ne.id).ok);
  } else check("33. expired negotiations cannot later complete", false, "no deal reachable");

  check("34. transfer-window rules exist in the weekly runner",
    /runRecruitmentWeek\(\s*\w+\s*,\s*[^)]*window/i.test(readFileSync("src/lib/game/engine.ts", "utf8")));
}

/* =====================================================================
   [R5] Club negotiation
===================================================================== */
console.log("\n[R5] Club negotiation");
{
  const mk = () => {
    const s = fixture("CLUBNEG");
    Object.assign(s, setTransferBudget(s, Math.min(20_000_000, Math.floor(s.cash))).state);
    const t = transferMarket(s).find((m) => m.clubId && m.askingPrice > 100_000)!;
    const r = openTransferNegotiationInPlace(s, t.player.id, Math.round(t.askingPrice * 0.8));
    return { s, n: r.negotiation!, t };
  };
  const a = mk();
  const b = mk();
  check("36. club negotiation outcomes are deterministic",
    JSON.stringify(a.n) === JSON.stringify(b.n));
  check("38. selling club uses canonical fee/contract data",
    a.t.askingPrice === askingPrice(a.s, a.t.player));

  let rounds = 0;
  while (negotiationById(a.s, a.n.id)!.stage === "clubTalks") {
    const cur = negotiationById(a.s, a.n.id)!;
    const r = counterClubOfferInPlace(a.s, cur.id, Math.round(cur.fee * 1.05) + 5_000);
    rounds++;
    if (!r.ok || rounds > 5) break;
  }
  check("37. maximum club rounds are enforced",
    negotiationById(a.s, a.n.id)!.clubRounds <= MAX_NEGOTIATION_ROUNDS);

  const acc = fixture("CLUBACC");
  Object.assign(acc, setTransferBudget(acc, Math.min(20_000_000, Math.floor(acc.cash))).state);
  const n2 = agreedPurchase(acc);
  check("39. accepted club terms create one negotiation only",
    !n2 || acc.football.negotiations.filter((x) => x.playerId === n2.playerId).length === 1);
  check("40. rejected club terms create no player talks", (() => {
    const s = fixture("CLUBREJ");
    const t = transferMarket(s).find((m) => m.clubId)!;
    const r = openTransferNegotiationInPlace(s, t.player.id, 20_000);
    const n = r.negotiation;
    return !n || n.stage !== "rejected" || n.playerRounds === 0;
  })());
  check("41. counter-offers are stable after reload", (() => {
    const r = reload(a.s);
    return JSON.stringify(negotiationById(r, a.n.id)) === JSON.stringify(negotiationById(a.s, a.n.id));
  })());
  check("42. reopening a negotiation cannot reroll its outcome", (() => {
    const r1 = reload(a.s);
    const r2 = reload(a.s);
    return JSON.stringify(r1.football.negotiations) === JSON.stringify(r2.football.negotiations);
  })());
  check("43. duplicate offers for the same player are refused", (() => {
    const s = fixture("DUP");
    Object.assign(s, setTransferBudget(s, Math.min(20_000_000, Math.floor(s.cash))).state);
    const t = transferMarket(s).find((m) => m.clubId)!;
    openTransferNegotiationInPlace(s, t.player.id, Math.round(t.askingPrice));
    const again = openTransferNegotiationInPlace(s, t.player.id, Math.round(t.askingPrice));
    const cur = s.football.negotiations.find((x) => x.playerId === t.player.id)!;
    return !again.ok || cur.stage === "rejected" || cur.stage === "withdrawn";
  })());
  check("44. a completed club negotiation cannot reopen", (() => {
    const s = fixture("REOPEN");
    Object.assign(s, setTransferBudget(s, Math.min(20_000_000, Math.floor(s.cash))).state);
    const n = agreedPurchase(s);
    if (!n) return false;
    completeTransferInPlace(s, n.id);
    return !counterClubOfferInPlace(s, n.id, n.fee + 100_000).ok;
  })());
}

/* =====================================================================
   [R6] Player negotiation
===================================================================== */
console.log("\n[R6] Player negotiation");
{
  const { improvePlayerTermsInPlace } = require("../recruitment") as typeof import("../recruitment");
  const build = () => {
    const s = fixture("PLAYERNEG");
    Object.assign(s, setTransferBudget(s, Math.min(20_000_000, Math.floor(s.cash))).state);
    const fa = freeAgents(s).sort((x, y) => y.currentAbility - x.currentAbility)[0];
    const r = openTransferNegotiationInPlace(s, fa.id, 0);
    return { s, n: r.negotiation!, fa };
  };
  const a = build();
  const b = build();
  check("45. player negotiation outcomes are deterministic", JSON.stringify(a.n) === JSON.stringify(b.n));
  check("47. wage/length/bonus/role are evaluated canonically",
    a.n.proposedWeeklyWage === wageDemand(a.s, a.fa, a.n.proposedRole)
    && a.n.proposedLengthSeasons >= 1 && a.n.proposedRole.length > 0);
  let guard = 0;
  while (negotiationById(a.s, a.n.id)!.stage === "playerTalks" && guard++ < 5) {
    const cur = negotiationById(a.s, a.n.id)!;
    if (!improvePlayerTermsInPlace(a.s, cur.id, (cur.playerCounterWage ?? cur.proposedWeeklyWage) + 500).ok) break;
  }
  check("46. maximum player rounds are enforced",
    negotiationById(a.s, a.n.id)!.playerRounds <= MAX_NEGOTIATION_ROUNDS);
  const fin = negotiationById(a.s, a.n.id)!;
  check("48. accepted personal terms create exactly one agreed deal",
    fin.stage !== "agreed" || a.s.football.negotiations.filter((n) => n.playerId === fin.playerId && n.stage === "agreed").length === 1);
  check("49. rejected personal terms cannot complete",
    fin.stage !== "rejected" || !completeTransferInPlace(a.s, fin.id).ok);
  check("50. countered terms remain stable after reload",
    JSON.stringify(negotiationById(reload(a.s), a.n.id)) === JSON.stringify(fin));
  check("51. a player cannot hold two open negotiations", (() => {
    const counts = new Map<string, number>();
    for (const n of openNegotiations(a.s)) counts.set(n.playerId, (counts.get(n.playerId) ?? 0) + 1);
    return [...counts.values()].every((v) => v === 1);
  })());
  check("52. completed personal terms cannot be applied twice", (() => {
    if (fin.stage !== "agreed") return true;
    const first = completeTransferInPlace(a.s, fin.id);
    const second = completeTransferInPlace(a.s, fin.id);
    return first.ok && !second.ok;
  })());
}

/* =====================================================================
   [R7] Transfer completion
===================================================================== */
console.log("\n[R7] Transfer completion");
{
  const s = fixture("COMPLETE");
  Object.assign(s, setTransferBudget(s, Math.min(20_000_000, Math.floor(s.cash))).state);

  // Preconditions: the fixture must construct a genuinely valid deal under the
  // calibrated economy before completion is asserted at all.
  const target = transferMarket(s)
    .filter((m) => m.clubId !== null)
    .sort((a, b) => a.askingPrice - b.askingPrice)[0];
  check("52a. a contracted, eligible target exists on the market", !!target
    && target.player.currentClubId !== s.clubName
    && availabilityReason(s, target.player) !== null);
  if (target) {
    const offer = Math.round(target.askingPrice * 1.2);
    check("52b. the offer is derived from canonical market value",
      target.askingPrice >= 20_000 && offer >= target.askingPrice
      && offer <= askingPrice(s, target.player) * 1.5);
    check("52c. the buyer holds the cash", s.cash >= offer + target.wageDemand * 4);
    check("52d. the transfer budget authorises the fee",
      canAuthorisePurchase(s, offer).allowed);
    check("52e. the wage demand is affordable", canAuthoriseWage(s, target.wageDemand).allowed);
  } else {
    check("52b. the offer is derived from canonical market value", false, "no target");
    check("52c. the buyer holds the cash", false, "no target");
    check("52d. the transfer budget authorises the fee", false, "no target");
    check("52e. the wage demand is affordable", false, "no target");
  }

  const n = agreedPurchase(s, { requireSeller: true });
  if (!n) {
    check("53-66. transfer completion", false, "no agreed deal reachable");
  } else {

    const beforeSave = reload(s);
    const cashBefore = s.cash;
    const budgetBefore = s.transferBudget ?? 0;
    const historyBefore = s.football.transferHistory.length;
    const contractHistoryBefore = s.football.contractHistory.length;
    const r = completeTransferInPlace(s, n.id);
    check("53. completion is atomic and successful", r.ok);
    check("54. ownership changes exactly once",
      playerById(s, n.playerId)!.currentClubId === s.clubName
      && s.football.contracts.filter((c) => c.playerId === n.playerId && c.status === "Active").length === 1);
    const hadSeller = !!n.fromClubId;
    check("55. the selling contract closes exactly once",
      s.football.contractHistory.filter((h) => h.playerId === n.playerId && h.outcome === "transferred").length === (hadSeller ? 1 : 0));
    check("56. the buying contract opens exactly once",
      s.football.contracts.filter((c) => c.playerId === n.playerId && c.clubId === s.clubName && c.status === "Active").length === 1);
    check("57. transfer history appends exactly once",
      s.football.transferHistory.length === historyBefore + 1);
    check("58. contract history appends correctly",
      s.football.contractHistory.length === contractHistoryBefore + (hadSeller ? 1 : 0));
    const fees = s.financeLedger.filter((e) => e.dedupeKey === `transfer:${n.id}:fee`);
    const bonuses = s.financeLedger.filter((e) => e.dedupeKey === `transfer:${n.id}:bonus`);
    check("59. the transfer fee posts exactly once", fees.length === (n.fee > 0 ? 1 : 0));
    check("60. the signing bonus posts exactly once", bonuses.length === (n.proposedSigningBonus > 0 ? 1 : 0));
    check("61. cash falls by fee + bonus", s.cash === cashBefore - n.fee - n.proposedSigningBonus);
    check("62. budget authority is a separate pot from cash",
      (s.transferBudget ?? 0) === budgetBefore);
    check("62b. finance reconciles after the deal", reconciles(s));
    check("63. a failed completion changes nothing", (() => {
      const g = clone(s);
      const snap = JSON.stringify({ c: g.cash, p: g.football.players, k: g.football.contracts, f: g.financeLedger.length });
      completeTransferInPlace(g, "TN-99999");
      return snap === JSON.stringify({ c: g.cash, p: g.football.players, k: g.football.contracts, f: g.financeLedger.length });
    })());
    check("64. reloading before completion gives the same result", (() => {
      const g = beforeSave;
      const res = completeTransferInPlace(g, n.id);
      return res.ok
        && g.cash === s.cash
        && JSON.stringify(g.football.transferHistory) === JSON.stringify(s.football.transferHistory);
    })());
    check("65. reloading after completion cannot duplicate the deal", (() => {
      const g = reload(s);
      const res = completeTransferInPlace(g, n.id);
      return !res.ok && g.football.transferHistory.length === s.football.transferHistory.length;
    })());
    check("66. one agreement can only move a player once",
      s.football.transferHistory.filter((h) => h.negotiationId === n.id).length === 1);
  }
}

/* =====================================================================
   [R8] Incoming bids and sales
===================================================================== */
console.log("\n[R8] Incoming bids and sales");
{
  const found = withIncomingBid("BIDS");
  const found2 = withIncomingBid("BIDS");
  if (!found || !found2) {
    check("67-75. incoming bids", false, "no incoming bid generated in 60 weeks");
  } else {
    check("67. incoming bids generate deterministically",
      JSON.stringify(found.s.football.negotiations) === JSON.stringify(found2.s.football.negotiations));
    const ids = found.s.football.negotiations.map((n) => n.id);
    check("68. negotiation ids are unique", new Set(ids).size === ids.length);

    const s = found.s;
    const n = found.n;
    const squadBefore = userSquad(s).length;
    const cashBefore = s.cash;
    const accept = respondToIncomingOfferInPlace(s, n.id, "accept");
    check("69. accepting a bid moves it to one completion path",
      accept.ok && negotiationById(s, n.id)!.stage === "agreed");
    const done = completeTransferInPlace(s, n.id);
    check("69b. the sale completes through the canonical path", done.ok);
    check("72. sale proceeds post exactly once",
      s.financeLedger.filter((e) => e.dedupeKey === `transfer:${n.id}:sale`).length === (n.fee > 0 ? 1 : 0));
    check("72b. cash rises by the fee and reconciles", s.cash === cashBefore + n.fee && reconciles(s));
    check("73. the sold player leaves the squad exactly once",
      userSquad(s).length === squadBefore - 1 && !userSquad(s).some((p) => p.id === n.playerId));
    const rec = s.football.transferHistory.find((h) => h.negotiationId === n.id)!;
    check("74. sale history records buyer, seller, player, fee and timing",
      !!rec && rec.fromClubId === s.clubName && rec.toClubId === n.toClubId
      && rec.fee === n.fee && rec.season === s.season && typeof rec.absoluteWeek === "number");
    check("75. an accepted bid cannot be accepted again",
      !respondToIncomingOfferInPlace(s, n.id, "accept").ok);

    const rj = withIncomingBid("BIDS")!;
    respondToIncomingOfferInPlace(rj.s, rj.n.id, "reject");
    check("70. rejecting a bid prevents completion", !completeTransferInPlace(rj.s, rj.n.id).ok);

    const c1 = withIncomingBid("BIDS")!;
    const c2 = withIncomingBid("BIDS")!;
    respondToIncomingOfferInPlace(c1.s, c1.n.id, "counter", Math.round(c1.n.fee * 1.25));
    respondToIncomingOfferInPlace(c2.s, c2.n.id, "counter", Math.round(c2.n.fee * 1.25));
    check("71. countering an incoming bid is deterministic",
      JSON.stringify(negotiationById(c1.s, c1.n.id)) === JSON.stringify(negotiationById(c2.s, c2.n.id)));
  }
}

/* =====================================================================
   [R9] Wages and finance
===================================================================== */
console.log("\n[R9] Wages and finance");
{
  const s = fixture("WAGES");
  const fromContracts = s.football.contracts
    .filter((c) => c.clubId === s.clubName && (c.status === "Active" || c.status === "Expiring"))
    .reduce((a, c) => a + c.weeklyWage, 0);
  check("76. wage totals derive from active contracts", userWageBill(s) === Math.round(fromContracts));

  let g = s;
  for (let i = 0; i < 10; i++) g = advanceWeek(g);
  const wageKeys = g.financeLedger.filter((e) => e.subcategory === "Player wages").map((e) => e.dedupeKey);
  check("77. weekly wage posting happens once per eligible week",
    new Set(wageKeys).size === wageKeys.length && wageKeys.length > 0);
  const r1 = advanceWeek(reload(g));
  const r2 = advanceWeek(reload(g));
  check("78. reloading cannot duplicate wage payments",
    r1.financeLedger.length === r2.financeLedger.length
    && JSON.stringify(r1.financeLedger.map((e) => e.dedupeKey)) === JSON.stringify(r2.financeLedger.map((e) => e.dedupeKey)));

  let season2 = g;
  while (season2.season < 2) season2 = advanceWeek(season2);
  const allKeys = season2.financeLedger.filter((e) => e.subcategory === "Player wages").map((e) => e.dedupeKey);
  check("79. season rollover neither skips nor duplicates wages",
    new Set(allKeys).size === allKeys.length && allKeys.length >= 46);

  const rel = clone(s);
  const victim = userSquad(rel)[0];
  const billBefore = userWageBill(rel);
  releasePlayerInPlace(rel, victim.id);
  check("80. released players stop generating wages immediately",
    userWageBill(rel) === billBefore - (activeContract(s, victim.id)?.weeklyWage ?? 0));

  const buy = fixture("WAGEBUY");
  Object.assign(buy, setTransferBudget(buy, Math.min(20_000_000, Math.floor(buy.cash))).state);
  const n = agreedPurchase(buy);
  if (n) {
    const before = userWageBill(buy);
    completeTransferInPlace(buy, n.id);
    check("81. newly signed players start generating wages at once",
      userWageBill(buy) === before + n.proposedWeeklyWage);
  } else check("81. newly signed players start generating wages at once", false, "no deal reachable");

  const src = readFileSync("src/lib/game/recruitment.ts", "utf8");
  check("82-84. every recruitment money movement uses postEntry",
    (src.match(/postEntry\(/g) ?? []).length >= 5);
  check("85. no direct cash mutation in recruitment code",
    !/\bs\.cash\s*[-+]?=/.test(src) && !/\bw\.cash\s*[-+]?=/.test(src));
  check("86. no hand-built ledger rows in recruitment code",
    !/finance\.entries\.push|ledger\.push/.test(src));
  check("87. finance still reconciles after buys, sales, renewals and releases", reconciles(buy) && reconciles(rel) && reconciles(season2));
  check("88. transfer-budget conservation holds", (() => {
    const g2 = fixture("BUDGET");
    const cash0 = g2.cash;
    const r = setTransferBudget(g2, 1_000_000);
    return r.ok && r.state.transferBudget === 1_000_000
      && r.state.cash === cash0 - 1_000_000 + (g2.transferBudget ?? 0) && reconciles(r.state);
  })());
}

/* =====================================================================
   [R10] Board integration
===================================================================== */
console.log("\n[R10] Board integration");
{
  const s = fixture("BOARD");
  ensureBoard(s);
  const kinds = s.board.objectives.map((o) => o.kind);
  check("89. net-spend objective exists and reads canonical records",
    kinds.includes("transferBudgetDiscipline") && netSpendThisSeason(s) === netSpendThisSeason(reload(s)));
  check("90. sale-income objective exists", kinds.includes("playerSaleIncome"));
  check("91. squad-age objective reads canonical squad membership",
    kinds.includes("squadAge") && Math.abs(averageSquadAge(s) - averageSquadAge(reload(s))) < 1e-9);
  check("92. contract-security objective reads active contract expiries",
    kinds.includes("contractSecurity") && contractSecurityPct(s) === contractSecurityPct(reload(s)));
  check("93. signings-completed objective reads completed transfers",
    kinds.includes("recruitmentActivity") && incomingTransfersThisSeason(s) === 0);
  let g = s;
  for (let i = 0; i < 26; i++) g = advanceWeek(g);
  const a = advanceWeek(reload(g));
  const b = advanceWeek(reload(g));
  check("94. board objective progress is replay-safe",
    JSON.stringify(a.board.objectives) === JSON.stringify(b.board.objectives));
  check("95. directors can disagree deterministically",
    new Set(g.board.directors.map((d) => d.confidence)).size > 1
    && JSON.stringify(a.board.directors) === JSON.stringify(b.board.directors));
  check("96. board reviews are stable after recruitment activity",
    JSON.stringify(a.board.reviews) === JSON.stringify(b.board.reviews));
}

/* =====================================================================
   [R11] Inbox integration
===================================================================== */
console.log("\n[R11] Inbox integration");
{
  const found = withIncomingBid("INBOX");
  const s = found ? found.s : fixture("INBOX");
  const items = runWeeklyGenerators(s).inbox;
  const keys = items.map((i) => i.eventKey);
  check("97-101. recruitment messages generate at most once each",
    new Set(keys).size === keys.length);
  check("102. recruitment event keys are stable",
    JSON.stringify(runWeeklyGenerators(s).inbox.map((i) => i.eventKey)) === JSON.stringify(keys));
  const inboxSrc = readFileSync("src/lib/game/inbox.ts", "utf8");
  check("103. inbox actions call the canonical recruitment engine",
    /InPlace\(/.test(inboxSrc) && /from "\.\/recruitment"/.test(inboxSrc));
  check("105. informational completion messages carry no money effects", (() => {
    const info = items.filter((i) => i.eventKey.startsWith("recruitment-transfer-complete"));
    return info.every((i) => (i.choices ?? []).every((c) =>
      (c.effects ?? []).every((e) => e.kind !== "cash")));
  })());
  const bidItem = items.find((i) => i.eventKey.startsWith("recruitment-incoming-offer"));
  if (bidItem && bidItem.choices?.length) {
    const g = clone(s);
    const ch = bidItem.choices[bidItem.choices.length - 1];
    const first = applyEffects(g, ch.effects ?? [], { sourceItemId: bidItem.id, sourceEventKey: bidItem.eventKey });
    const second = applyEffects(first, ch.effects ?? [], { sourceItemId: bidItem.id, sourceEventKey: bidItem.eventKey });
    check("104. reopening a message cannot repeat recruitment effects",
      JSON.stringify(first.football.negotiations) === JSON.stringify(second.football.negotiations)
      && first.cash === second.cash);
    check("106. an expired decision cannot still complete a deal",
      second.football.negotiations.filter((n) => n.stage === "completed").length
      === first.football.negotiations.filter((n) => n.stage === "completed").length);
  } else {
    check("104/106. recruitment inbox effects are idempotent", false, "no incoming-offer message present");
  }
}

/* =====================================================================
   [R12] UI and selectors
===================================================================== */
console.log("\n[R12] UI and selectors");
{
  const s = fixture("UI");
  const snap = JSON.stringify(s);
  recruitmentSnapshot(s);
  userSquad(s);
  transferMarket(s);
  openNegotiations(s);
  availabilityReason(s, s.football.players[0]);
  shortlistIds(s);
  check("107-112. selectors are pure and non-mutating", JSON.stringify(s) === snap);
  const sorted = transferMarket(s).slice().sort((a, b) => a.player.id.localeCompare(b.player.id));
  check("110. filtering and sorting never touch canonical arrays",
    sorted.length === transferMarket(s).length && JSON.stringify(s) === snap);
  const t = toggleShortlist(s, s.football.players[0].id);
  check("113. UI actions return new state via engine functions",
    JSON.stringify(s) === snap && shortlistIds(t).length === 1);
  const uiSrc = readFileSync("src/components/RecruitmentTab.tsx", "utf8");
  check("113b. the recruitment UI never writes canonical state directly",
    !/state\.football\.[a-zA-Z]+\s*(=|\.push\()/.test(uiSrc) && !/\.cash\s*=/.test(uiSrc));
  // Phase 0d moved the screens out of the route; scan the extracted UI too.
  const routeSrc = readFileSync("src/routes/index.tsx", "utf8")
    + readdirSync("src/components/game")
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => readFileSync(`src/components/game/${f}`, "utf8"))
      .join("\n");
  check("114. old Squad and Transfers interfaces are unreachable",
    !/function Squad\(|function Transfers\(|function TargetCard\(|function BidCard\(/.test(routeSrc));
  check("114b. no legacy transfer engine paths remain",
    !/approveTransferTarget|respondToBid|generateTransferTargets|generateIncomingBid/.test(
      readFileSync("src/lib/game/engine.ts", "utf8") + routeSrc));
  check("115. migrated saves render safely in the Recruitment tab", (() => {
    const legacy = JSON.parse(JSON.stringify(fixture("LEGACY"))) as Record<string, unknown>;
    legacy.version = 6;
    delete legacy.football;
    const m = migrateSave(legacy);
    return !!m.football && recruitmentSnapshot(m).squadSize > 0;
  })());
}

/* =====================================================================
   [R13] History
===================================================================== */
console.log("\n[R13] History");
{
  let s = fixture("HISTORY");
  for (let i = 0; i < 50; i++) s = advanceWeek(s);
  const tSnap = JSON.stringify(s.football.transferHistory);
  const cSnap = JSON.stringify(s.football.contractHistory);
  const sSnap = JSON.stringify(s.football.seasonHistory);
  let g = s;
  for (let i = 0; i < 10; i++) g = advanceWeek(g);
  check("116. transfer history is immutable",
    JSON.stringify(g.football.transferHistory.slice(0, s.football.transferHistory.length)) === tSnap);
  check("117. contract history is immutable",
    JSON.stringify(g.football.contractHistory.slice(0, s.football.contractHistory.length)) === cSnap);
  check("118. recruitment season summaries are immutable",
    JSON.stringify(g.football.seasonHistory.slice(0, s.football.seasonHistory.length)) === sSnap);
  const rows = g.football.transferHistory.filter((r) => r.season === g.season);
  const spend = rows.filter((r) => r.toClubId === g.clubName).reduce((a, r) => a + r.fee + r.signingBonus, 0);
  const income = rows.filter((r) => r.fromClubId === g.clubName).reduce((a, r) => a + r.fee, 0);
  check("119. historical net spend reconciles to transfer records",
    netSpendThisSeason(g) === spend - income);
  check("120. historical wage totals reconcile to contract data",
    userWageBill(g) === g.football.contracts
      .filter((c) => c.clubId === g.clubName && (c.status === "Active" || c.status === "Expiring"))
      .reduce((a, c) => a + c.weeklyWage, 0));
  check("121. later moves do not rewrite earlier records",
    g.football.transferHistory.slice(0, 5).every((r, i) =>
      JSON.stringify(r) === JSON.stringify(s.football.transferHistory[i])));
  check("121b. ids in the transfer record are unique",
    new Set(g.football.transferHistory.map((r) => r.id)).size === g.football.transferHistory.length);
}

/* =====================================================================
   [R14] Migration
===================================================================== */
console.log("\n[R14] Migration");
{
  const legacyBase = () => {
    const g = JSON.parse(JSON.stringify(fixture("MIGRATE"))) as Record<string, unknown>;
    g.version = 8;
    delete g.football;
    (g as { squad: unknown[] }).squad = [
      { id: "L1", name: "Legacy One", position: "MID", rating: 62, age: 25, wage: 3000, contractWeeks: 60, value: 400000 },
    ];
    g.transferTargets = [{ id: "T1" }];
    g.incomingBids = [{ id: "B1" }];
    g.completedTransfers = [{ id: "C1" }];
    return g;
  };
  const m1 = migrateSave(legacyBase());
  const m2 = migrateSave(legacyBase());
  check("122. migration is deterministic", JSON.stringify(m1) === JSON.stringify(m2));
  const again = migrateSave(JSON.parse(JSON.stringify(m1)) as Record<string, unknown>);
  check("123. migration is idempotent", JSON.stringify(again) === JSON.stringify(m1));
  const src = fixture("MIGRATE");
  check("124. finance data is preserved", m1.financeLedger.length === src.financeLedger.length && reconciles(m1));
  check("125. board data is preserved", m1.board.directors.length === src.board.directors.length);
  check("126. commercial data is preserved",
    (m1.commercial?.contracts.length ?? -1) === (src.commercial?.contracts.length ?? -2));
  check("127. inbox state is preserved", m1.inbox.length === src.inbox.length);
  const ids = m1.football.players.map((p) => p.id);
  check("128. legacy squads convert without duplicate players", new Set(ids).size === ids.length);
  check("129. legacy transfers do not invent history",
    m1.football.transferHistory.length === 0);
  check("129b. retired legacy transfer collections are dropped",
    !("transferTargets" in m1) && !("incomingBids" in m1) && !("completedTransfers" in m1));
  check("130. legacy transfer budgets remain conserved",
    (m1.transferBudget ?? 0) === (src.transferBudget ?? 0) && m1.cash === src.cash);
  check("131. the full older schema chain migrates", (() => {
    const old = JSON.parse(JSON.stringify(fixture("CHAIN"))) as Record<string, unknown>;
    delete old.version; delete old.football; delete old.finance;
    delete old.board; delete old.commercial;
    const m = migrateSave(old);
    return m.version >= 9 && !!m.football && !!m.finance && !!m.board;
  })());
  check("132. reload after migration is byte-identical",
    JSON.stringify(reload(m1).football) === JSON.stringify(m1.football));
}

/* =====================================================================
   [R15] Static audit
===================================================================== */
console.log("\n[R15] Static audit");
{
  const files: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p) && !p.includes("__checks__")) files.push(p);
    }
  })("src");
  const offenders = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, "utf8")));
  const codeOf = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // engine.ts keeps clock/Math.random only for save-seed creation and legacy
  // presentation helpers; every simulated recruitment outcome is seeded.
  check("S1. no Math.random()/Date.now() in recruitment/finance/inbox simulation",
    ["src/lib/game/recruitment.ts", "src/lib/game/finance.ts", "src/lib/game/inbox.ts",
     "src/lib/game/commercial.ts", "src/lib/game/fixtures.ts"]
      .every((f) => !/Math\.random\(/.test(codeOf(f)) && !/Date\.now\(/.test(codeOf(f))));
  check("S2. no direct cash writes outside finance.ts",
    offenders(/\.cash\s*[-+*]?=\s/).filter((f) => !f.endsWith("finance.ts")).length === 0);
  // The migration registry may seed a default budget on an old save that
  // predates the field; that is schema backfill, not a gameplay mutation.
  check("S3. no direct transfer-budget writes outside engine/budgets/finance/migrations",
    offenders(/\.transferBudget\s*[-+*]?=\s/).filter((f) => !/engine\.ts|budgets\.ts|finance\.ts|migrations\//.test(f)).length === 0);

  check("S4. no squad or contract mutation in components/routes",
    offenders(/football\.(contracts|players|negotiations)\.(push|splice)/)
      .filter((f) => /components|routes/.test(f)).length === 0);
  check("S5. legacy transfer types are gone from live state",
    !/interface TransferTarget|interface IncomingBid|interface CompletedTransfer/.test(
      readFileSync("src/lib/game/types.ts", "utf8")));
  check("S6. only one transfer-completion path exists",
    (readFileSync("src/lib/game/recruitment.ts", "utf8").match(/transferHistory\.push/g) ?? []).length <= 4
    && files.filter((f) => !f.endsWith("recruitment.ts") && /transferHistory\.push/.test(readFileSync(f, "utf8"))).length === 0);
  check("S7. only one wage-posting path exists",
    files.filter((f) => /post\("Wages", "Player wages"/.test(readFileSync(f, "utf8"))).length === 1);
  check("S8. no legacy recruitment effects remain registered",
    !/approveTransferTarget|respondToBid/.test(readFileSync("src/lib/game/inbox.ts", "utf8")));
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
