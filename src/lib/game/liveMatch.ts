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
  liveTvIncome,
  liveOpponentStrength,
} from "./matchday";
import { avgTicketPrice, simAttendance } from "./sim";
import { clubMatchStrength, userMatchStrength } from "./matchStrength";
import { advancePlayerClubPerformanceWeekInPlace } from "./playerClubPerformance";
import { managerMatchStyle } from "./managerMatchStyle";
import { calendarDay } from "./calendar";
import {
  createMatchEngineSnapshot,
  prepareSecondHalfManagement,
  refreshPlayerMatchStats,
  simulateMatchHalf,
} from "./matchEngine";
import { applyMatchLoadInPlace, playerInjuryRiskMultiplier } from "./playerHealth";
import { pushPlayerMatchMilestonesInPlace } from "./playerSeasonStats";

function formGuide(s: GameState): string {
  const last5 = s.results
    .slice(-5)
    .map((r) => r.result)
    .join("");
  return last5 || "—";
}

export function startMatchDay(s: GameState, requestedFixture?: GameState["fixtures"][number]): GameState {
  const today = calendarDay(s);
  const weekFixtures = s.fixtures.filter((f) => f.week === s.week);
  // Fixture cards may target a specific same-day match. Legacy callers and
  // older saves can still fall back to the sole/current-day fixture.
  const fx = requestedFixture ??
    weekFixtures.find((f) => (f.dayOfWeek ?? 5) === today && !s.results.some((r) =>
      r.week === f.week && r.opponent === f.opponent && r.home === f.home &&
      (r.dayOfWeek ?? 5) === (f.dayOfWeek ?? 5) &&
      (r.competition ?? "league") === (f.competition ?? "league")
    )) ??
    (weekFixtures.length === 1 ? weekFixtures[0] : undefined);
  if (!fx) return s;
  const ident = matchIdentity(s, fx);
  const ns: GameState = structuredClone(s);
  advancePlayerClubPerformanceWeekInPlace(ns);
  const realisedOurStrength = userMatchStrength(ns);
  const realisedOpponentStrength = clubMatchStrength(ns, fx.opponent);
  const ourStrength = realisedOurStrength + (fx.home ? 3 : 0);
  const pmKey = preMatchKey({
    squadRating: realisedOurStrength,
    opponentStrength: realisedOpponentStrength,
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
  const style = managerMatchStyle(ns);
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
    engine: createMatchEngineSnapshot(ns, style, clubDisplayName(ns, fx.opponent)),
  };
  return ns;
}

export function kickoff(s: GameState): GameState {
  if (!s.liveMatch || s.liveMatch.status !== "brief") return s;
  const ns: GameState = structuredClone(s);
  const lm = ns.liveMatch!;
  const seedBase = seedOf(lm);
  const style = managerMatchStyle(ns);
  const preparedEngine = createMatchEngineSnapshot(
    ns,
    style,
    clubDisplayName(ns, lm.fixture.opponent),
  );
  lm.engine ??= preparedEngine;
  lm.engine.userLineup ??= preparedEngine.userLineup;
  lm.engine.opponentLineup ??= preparedEngine.opponentLineup;
  lm.engine.playerStats ??= preparedEngine.playerStats;
  const half = simulateMatchHalf({
    seedBase,
    half: 1,
    fromMinute: 0,
    toMinute: 45,
    ourStrength: lm.ourStrength,
    opponentStrength: lm.oppStrength,
    opponentName: clubDisplayName(ns, lm.fixture.opponent),
    style,
    userLineup: lm.engine?.userLineup,
    opponentLineup: lm.engine?.opponentLineup,
    userBench: lm.engine?.userBench,
    opponentBench: lm.engine?.opponentBench,
    substitutions: lm.engine?.substitutions,
  });
  const { usGoals, themGoals } = half.snapshot;
  lm.events = half.events;
  lm.engine.halves = [half.snapshot];
  refreshPlayerMatchStats(lm.engine, lm.events);
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.status = "halfTime";

  // Keep the established IDs for save/check compatibility, but these are now
  // chairman-facing messages rather than tactical instructions. All three
  // leave the manager's football modifiers untouched.
  lm.halfTimeOptions = [
    {
      id: "steady",
      label: "Back the manager's plan",
      desc: `Let ${style.formation} ${style.philosophy.toLowerCase()} football play out without boardroom interference.`,
      attackMod: 1,
      defenseMod: 1,
      fanMod: 0,
      winBonusCost: 0,
    },
    {
      id: "attack",
      label: "Show confidence",
      desc: "Publicly back the manager and the side. The manager still decides how to approach the second half.",
      attackMod: 1,
      defenseMod: 1,
      fanMod: 1,
      winBonusCost: 0,
    },
    {
      id: "shutup",
      label: "Keep it in-house",
      desc: "Say nothing publicly at half-time and leave the football entirely with the manager.",
      attackMod: 1,
      defenseMod: 1,
      fanMod: -1,
      winBonusCost: 0,
    },
  ];
  return ns;
}

export function continueSecondHalf(s: GameState): GameState {
  return applyHalfTimeChoice(s, "steady");
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
  const preparedEngine = createMatchEngineSnapshot(
    ns,
    style,
    clubDisplayName(ns, lm.fixture.opponent),
  );
  lm.engine ??= preparedEngine;
  lm.engine.userLineup ??= preparedEngine.userLineup;
  lm.engine.opponentLineup ??= preparedEngine.opponentLineup;
  lm.engine.userBench ??= preparedEngine.userBench;
  lm.engine.opponentBench ??= preparedEngine.opponentBench;
  lm.engine.substitutions ??= [];
  lm.engine.injuries ??= [];
  lm.engine.playerStats ??= preparedEngine.playerStats;
  const managementEvents = prepareSecondHalfManagement(lm.engine, seedBase, playerInjuryRiskMultiplier(s));
  const half = simulateMatchHalf({
    seedBase,
    half: 2,
    fromMinute: 45,
    toMinute: 90,
    ourStrength: lm.ourStrength,
    opponentStrength: lm.oppStrength,
    opponentName: clubDisplayName(ns, lm.fixture.opponent),
    style,
    userLineup: lm.engine?.userLineup,
    opponentLineup: lm.engine?.opponentLineup,
    userBench: lm.engine?.userBench,
    opponentBench: lm.engine?.opponentBench,
    substitutions: lm.engine?.substitutions,
  });
  const { usGoals, themGoals } = half.snapshot;
  lm.events = [...lm.events, ...managementEvents, ...half.events].sort(
    (a, b) => a.minute - b.minute || (a.sequenceId ?? "").localeCompare(b.sequenceId ?? ""),
  );
  lm.engine.halves = [...lm.engine.halves.filter((item) => item.half !== 2), half.snapshot].sort(
    (a, b) => a.half - b.half,
  );
  refreshPlayerMatchStats(lm.engine, lm.events);
  lm.ourGoals += usGoals;
  lm.theirGoals += themGoals;
  lm.attendance = lm.fixture.home ? lm.projectedAttendance : 0;
  lm.gateReceipts = Math.round(lm.attendance * avgTicketPrice(ns));
  lm.tvIncome = liveTvIncome(seedBase);
  lm.matchdayOps = lm.fixture.home ? Math.round(6_500 + lm.attendance * 0.4) : 3_200;
  const result: "W" | "D" | "L" =
    lm.ourGoals > lm.theirGoals ? "W" : lm.ourGoals === lm.theirGoals ? "D" : "L";
  lm.winBonus = result === "W" ? opt.winBonusCost : 0;
  ns.fanHappiness = Math.max(5, Math.min(100, ns.fanHappiness + opt.fanMod));
  lm.status = "fullTime";
  return ns;
}

export function commitLiveMatch(
  prev: GameState,
  advance: (
    s: GameState,
    override: {
      gf: number;
      ga: number;
      attendance: number;
      gate: number;
      tv: number;
      matchdayOps: number;
      winBonus: number;
    },
  ) => GameState,
): GameState {
  if (!prev.liveMatch || prev.liveMatch.status !== "fullTime") return prev;
  const lm = prev.liveMatch;
  if (lm.committed) return { ...prev, liveMatch: null };
  if (lm.fixtureId && (prev.matchRecords ?? []).some((r) => r.id === lm.fixtureId))
    return { ...prev, liveMatch: null };
  const cleared: GameState = structuredClone(prev);
  cleared.liveMatch = null;
  if (lm.engine?.playerStats?.length) {
    applyMatchLoadInPlace(cleared, lm.engine.playerStats, lm.engine.injuries ?? []);
    const key = `${lm.season ?? prev.season}|${lm.fixture.week}|${lm.fixture.dayOfWeek ?? 5}|${lm.fixture.competition ?? "league"}|${lm.fixture.opponent}|${lm.fixture.home}`;
    cleared.playerMatchHistory = {
      ...prev.playerMatchHistory,
      [key]: {
        season: lm.season ?? prev.season,
        week: lm.fixture.week,
        opponent: lm.fixture.opponent,
        players: structuredClone(lm.engine.playerStats),
      },
    };
    pushPlayerMatchMilestonesInPlace(cleared, lm.engine.playerStats);
  }
  return advance(cleared, {
    gf: lm.ourGoals,
    ga: lm.theirGoals,
    attendance: lm.attendance,
    gate: lm.gateReceipts,
    tv: lm.tvIncome,
    matchdayOps: lm.matchdayOps,
    winBonus: lm.winBonus,
  });
}

export function cancelLiveMatch(s: GameState): GameState {
  return { ...s, liveMatch: null };
}
