/* Interactive match day — extracted verbatim from engine.ts (Phase 0c).
 *
 * DETERMINISM STATUS — READ BEFORE EXTENDING
 * ---------------------------------------------------------------------------
 * Both matchday paths are fully seeded and replay-safe:
 *
 *   - AUTO-RESOLVED (advanceWeek → resolveWeek, league fixtures, friendlies)
 *     seeds from (saveSeed, season, round, home, away).
 *   - INTERACTIVE (startMatchDay → kickoff → applyHalfTimeChoice → commit)
 *     seeds from `matchSeedBase(saveSeed, identity, preMatchKey)` in
 *     ./matchday, and the seed root is PERSISTED on LiveMatch.matchSeed.
 */
import type { GameState, LiveMatch } from "./types";
import {
  matchIdentity,
  matchSeedBase,
  preMatchKey,
  matchStream,
  seedOf,
  weatherFor,
  halfGoals,
  halfPresentation,
  liveTvIncome,
  liveOpponentStrength,
} from "./matchday";
import { avgTicketPrice, simAttendance } from "./sim";
import { clubFootballStrength } from "./footballStrength";

function formGuide(s: GameState): string {
  const last5 = s.results
    .slice(-5)
    .map((r) => r.result)
    .join("");
  return last5 || "—";
}

export function startMatchDay(s: GameState): GameState {
  const fx = s.fixtures.find((f) => f.week === s.week);
  if (!fx) return s;
  const ident = matchIdentity(s);
  const ns: GameState = structuredClone(s);
  const baseOurStrength = clubFootballStrength(ns, ns.clubName);
  const canonicalOpponentStrength = clubFootballStrength(ns, fx.opponent);
  const ourStrength = baseOurStrength + (fx.home ? 3 : 0);
  const pmKey = preMatchKey({
    squadRating: baseOurStrength,
    opponentStrength: canonicalOpponentStrength,
  });
  const seedBase = ident
    ? matchSeedBase(ns.saveSeed, ident, pmKey)
    : `${ns.saveSeed}|live-match|s${ns.season}|w${ns.week}|${fx.opponent}|${pmKey}`;
  const oppStrength = liveOpponentStrength(seedBase);
  const projectedAttendance = simAttendance(
    ns,
    fx.home,
    oppStrength,
    matchStream(seedBase, "attendance"),
  );
  const weather = weatherFor(seedBase);
  const boardExpectation: LiveMatch["boardExpectation"] =
    ourStrength > oppStrength + 5
      ? "Win"
      : ourStrength > oppStrength - 3
        ? "Avoid defeat"
        : "Any result";
  ns.liveMatch = {
    fixture: fx,
    weather,
    projectedAttendance,
    boardExpectation,
    ourStrength,
    oppStrength,
    formGuide: formGuide(ns),
    events: [],
    ourGoals: 0,
    theirGoals: 0,
    status: "brief",
    attendance: 0,
    gateReceipts: 0,
    tvIncome: 0,
    matchdayOps: 0,
    winBonus: 0,
    matchSeed: seedBase,
    fixtureId: ident?.fixtureId,
    leagueId: ident?.leagueId,
    season: ns.season,
    round: ident?.round,
    homeClub: ident?.homeClub,
    awayClub: ident?.awayClub,
    committed: false,
  };
  return ns;
}

export function kickoff(s: GameState): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "brief") return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const seedBase = seedOf(lm);
  const { usGoals, themGoals } = halfGoals(seedBase, 1, lm.ourStrength, lm.oppStrength, 1, 1);
  lm.events = halfPresentation(seedBase, 1, 0, 45, usGoals, themGoals, lm.fixture.opponent);
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.status = "halfTime";
  const trailing = lm.ourGoals < lm.theirGoals;
  lm.halfTimeOptions = [
    { id: "steady", label: "Stick with the plan", desc: "Trust the group, no changes.", attackMod: 1, defenseMod: 1, fanMod: 0, winBonusCost: 0 },
    { id: "attack", label: trailing ? "Demand a response" : "Turn the screw", desc: trailing ? "Send the team out on the front foot. The crowd will respond, but space opens behind." : "Insist on a statement second half. More threat, more exposure, no cheque-book shortcut.", attackMod: 1.3, defenseMod: 0.85, fanMod: 2, winBonusCost: 0 },
    { id: "shutup", label: "Shut up shop", desc: "Sit deeper, protect the result. Fans may grumble.", attackMod: 0.7, defenseMod: 1.3, fanMod: -3, winBonusCost: 0 },
  ];
  return ns;
}

export function applyHalfTimeChoice(s: GameState, choiceId: string): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "halfTime") return s;
  if (!s.liveMatch.halfTimeOptions) return s;
  const opt0 = s.liveMatch.halfTimeOptions.find((o) => o.id === choiceId);
  if (!opt0) return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const opt = lm.halfTimeOptions!.find((o) => o.id === choiceId)!;
  lm.chosenNudgeId = choiceId;
  const seedBase = seedOf(lm);
  const { usGoals, themGoals } = halfGoals(seedBase, 2, lm.ourStrength, lm.oppStrength, opt.attackMod, opt.defenseMod);
  lm.events = [...lm.events, ...halfPresentation(seedBase, 2, 45, 90, usGoals, themGoals, lm.fixture.opponent)];
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.attendance = lm.fixture.home ? lm.projectedAttendance : 0;
  lm.gateReceipts = Math.round(lm.attendance * avgTicketPrice(ns));
  lm.tvIncome = liveTvIncome(seedBase);
  lm.matchdayOps = lm.fixture.home ? Math.round(6_500 + lm.attendance * 0.4) : 3_200;
  const result: "W" | "D" | "L" = lm.ourGoals > lm.theirGoals ? "W" : lm.ourGoals === lm.theirGoals ? "D" : "L";
  lm.winBonus = result === "W" ? opt.winBonusCost : 0;
  ns.fanHappiness = Math.max(5, Math.min(100, ns.fanHappiness + opt.fanMod));
  lm.status = "fullTime";
  return ns;
}

export function commitLiveMatch(
  prev: GameState,
  advance: (s: GameState, override: { gf: number; ga: number; attendance: number; gate: number; tv: number; matchdayOps: number; winBonus: number }) => GameState,
): GameState {
  if (!prev.liveMatch || prev.liveMatch.status !== "fullTime") return prev;
  const lm = prev.liveMatch;
  if (lm.committed) return { ...prev, liveMatch: null };
  if (lm.fixtureId && (prev.matchRecords ?? []).some((r) => r.id === lm.fixtureId)) return { ...prev, liveMatch: null };
  const cleared: GameState = { ...prev, liveMatch: null };
  return advance(cleared, { gf: lm.ourGoals, ga: lm.theirGoals, attendance: lm.attendance, gate: lm.gateReceipts, tv: lm.tvIncome, matchdayOps: lm.matchdayOps, winBonus: lm.winBonus });
}

export function cancelLiveMatch(s: GameState): GameState {
  return { ...s, liveMatch: null };
}
