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
import { clubDisplayName, userClubReference } from "./clubReference";
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
import { clubMatchStrength } from "./matchStrength";
import { advancePlayerClubPerformanceWeekInPlace } from "./playerClubPerformance";
import { managerMatchStyle } from "./managerMatchStyle";

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
  advancePlayerClubPerformanceWeekInPlace(ns);
  const realisedOurStrength = clubMatchStrength(ns, userClubReference(ns));
  const realisedOpponentStrength = clubMatchStrength(ns, fx.opponent);
  const ourStrength = realisedOurStrength + (fx.home ? 3 : 0);
  const pmKey = preMatchKey({ squadRating: realisedOurStrength, opponentStrength: realisedOpponentStrength });
  const seedBase = ident
    ? matchSeedBase(ns.saveSeed, ident, pmKey)
    : `${ns.saveSeed}|live-match|s${ns.season}|w${ns.week}|${fx.opponent}|${pmKey}`;
  const oppStrength = liveOpponentStrength(seedBase);
  const projectedAttendance = simAttendance(ns, fx.home, oppStrength, matchStream(seedBase, "attendance"));
  const weather = weatherFor(seedBase);
  const boardExpectation: LiveMatch["boardExpectation"] =
    ourStrength > oppStrength + 5 ? "Win" : ourStrength > oppStrength - 3 ? "Avoid defeat" : "Any result";
  ns.liveMatch = {
    fixture: fx, weather, projectedAttendance, boardExpectation, ourStrength, oppStrength,
    formGuide: formGuide(ns), events: [], ourGoals: 0, theirGoals: 0, status: "brief",
    attendance: 0, gateReceipts: 0, tvIncome: 0, matchdayOps: 0, winBonus: 0,
    matchSeed: seedBase, fixtureId: ident?.fixtureId, leagueId: ident?.leagueId,
    season: ns.season, round: ident?.round, homeClub: ident?.homeClub, awayClub: ident?.awayClub,
    committed: false,
  };
  return ns;
}

export function kickoff(s: GameState): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "brief") return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const seedBase = seedOf(lm);
  const style = managerMatchStyle(ns);
  const { usGoals, themGoals } = halfGoals(seedBase, 1, lm.ourStrength, lm.oppStrength, style.attackModifier, style.defenseModifier);
  lm.events = halfPresentation(seedBase, 1, 0, 45, usGoals, themGoals, clubDisplayName(ns, lm.fixture.opponent));
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.status = "halfTime";
  const trailing = lm.ourGoals < lm.theirGoals;
  lm.halfTimeOptions = [
    { id: "steady", label: "Back the manager's plan", desc: `Let ${style.formation} ${style.philosophy.toLowerCase()} football play out without boardroom interference.`, attackMod: 1, defenseMod: 1, fanMod: 0, winBonusCost: 0 },
  ];
  if (trailing) {
    lm.halfTimeOptions.push({ id: "belief", label: "Back the manager publicly", desc: "No tactical instruction — make it clear the manager has your confidence to chase the game his way.", attackMod: 1, defenseMod: 1, fanMod: 1, winBonusCost: 0 });
  }
  return ns;
}

export function applyHalfTimeChoice(s: GameState, choiceId: string): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "halfTime" || !s.liveMatch.halfTimeOptions) return s;
  const opt0 = s.liveMatch.halfTimeOptions.find((o) => o.id === choiceId);
  if (!opt0) return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const opt = lm.halfTimeOptions!.find((o) => o.id === choiceId)!;
  lm.chosenNudgeId = choiceId;
  const seedBase = seedOf(lm);
  const style = managerMatchStyle(ns);
  const { usGoals, themGoals } = halfGoals(seedBase, 2, lm.ourStrength, lm.oppStrength, style.attackModifier * opt.attackMod, style.defenseModifier * opt.defenseMod);
  lm.events = [...lm.events, ...halfPresentation(seedBase, 2, 45, 90, usGoals, themGoals, clubDisplayName(ns, lm.fixture.opponent))];
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
