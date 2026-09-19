/* Matchday stage of the weekly tick — extracted verbatim from engine.ts (0c).
 *
 * Owns ONLY the user's fixture (or pre/mid-season friendly): the result, the
 * matchday finance posting, the supporter/reputation swing, and writing the
 * MatchRecord. AI fixtures for the round are resolved by the roll-up stage.
 *
 * Mutates the working clone in place — the tick's clone-once contract lives in
 * `advanceWeek`, never here.
 */
import type { GameState, FixtureResult, MatchRecord } from "../types";
import {
  clubDisplayName,
  isUserClubReference,
  sameClubReference,
  userClubReference,
} from "../clubReference";
import { mulberry32, hashString } from "../rng";
import { profileForTier, tierOfUser } from "../economy";
import { facilityModifiers } from "../infrastructure";
import { postMatchdayFinance } from "../finance";
import { clubMatchStrength } from "../matchStrength";
import {
  makeRecord,
  resolveWeek,
  simulateFixture,
  hasFullSchedule,
  fixtureId,
  leagueOf,
  playerLeagueId,
} from "../league";
import { avgTicketPrice, simAttendance } from "../sim";
import { advanceDomesticCup, resolveDomesticCupTie } from "../domesticCupState";
import { resolveKnockoutDraw } from "../knockout";
import { resolveAllAiDomesticCups } from "../aiDomesticCups";
import { syncUserCupFixtures } from "../cupFixtures";
import { settlePreseasonInvitational } from "../preseason";

export interface MatchOverride {
  gf: number;
  ga: number;
  attendance: number;
  gate: number;
  tv: number;
  matchdayOps: number;
  winBonus: number;
}

export interface MatchdayOutcome {
  fxResult: FixtureResult | null;
  matchdayNote?: string;
}

/** Resolve one selected user fixture. Callers own calendar timing. */
export function tickSelectedMatchday(
  s: GameState,
  selectedFixture: GameState["fixtures"][number] | undefined,
  override?: MatchOverride,
): MatchdayOutcome {
  const fixture = selectedFixture;
  const fixtureAlreadyPlayed = fixture
    ? s.results.some(
        (r) =>
          r.week === s.week &&
          r.opponent === fixture.opponent &&
          r.home === fixture.home &&
          (r.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
          (r.competition ?? "league") === (fixture.competition ?? "league"),
      )
    : false;
  if (fixtureAlreadyPlayed) return { fxResult: null };
  let matchdayNote: string | undefined;
  let fxResult: FixtureResult | null = null;

  if (fixture) {
    const userRef = userClubReference(s);
    let gf: number, ga: number, attendance: number, gate: number, tv: number, matchdayOps: number;
    // The scheduled fixture this result belongs to (schedule-backed saves).
    const isLeagueFixture = (fixture.competition ?? "league") === "league";
    const sched = hasFullSchedule(s) && isLeagueFixture
      ? s.leagueSchedule.find(
          (f) =>
            f.week === s.week &&
            ((isUserClubReference(s, f.home) && sameClubReference(s, f.away, fixture.opponent)) ||
              (isUserClubReference(s, f.away) && sameClubReference(s, f.home, fixture.opponent))),
        )
      : undefined;
    const homeClub = fixture.home ? userRef : fixture.opponent;
    const awayClub = fixture.home ? fixture.opponent : userRef;
    if (override) {
      ({ gf, ga, attendance, gate, tv, matchdayOps } = override);
    } else {
      // Both sides now cross the same final match-strength gateway. Underlying
      // squad quality remains canonical; only the small asymmetric performance
      // layer differs between the player club and AI clubs.
      const myStrength = clubMatchStrength(s, userRef, s.season);
      const oppStrength = clubMatchStrength(s, fixture.opponent, s.season);
      const round = sched?.round ?? s.week;
      const lid = sched ? leagueOf(sched) : playerLeagueId(s);
      const sim = simulateFixture(s, s.season, round, homeClub, awayClub, lid, {
        homeStrength: fixture.home ? myStrength : oppStrength,
        awayStrength: fixture.home ? oppStrength : myStrength,
      });
      gf = fixture.home ? sim.homeGoals : sim.awayGoals;
      ga = fixture.home ? sim.awayGoals : sim.homeGoals;
      const rng = mulberry32(hashString(`matchday|${sim.seed}`));
      attendance = simAttendance(s, fixture.home, oppStrength, rng);
      const avgPrice = avgTicketPrice(s);
      gate = Math.round(attendance * avgPrice);
      // Central broadcast money arrives weekly through the league
      // distribution; this is only the per-fixture facility/host fee.
      const econ = profileForTier(tierOfUser(s));
      tv = Math.round(((econ.broadcastSeason * 0.07) / 23) * (0.85 + rng() * 0.3));
      matchdayOps = fixture.home
        ? Math.round((4_200 + attendance * 1.35) * econ.matchdayCostFactor)
        : Math.round(3_200 * econ.matchdayCostFactor);
    }

    // Single matchday-finance path shared by auto-resolved and live matches.
    // Away fixtures book no gate, hospitality or concessions.
    postMatchdayFinance(s, {
      season: s.season,
      week: s.week,
      dayOfWeek: fixture.dayOfWeek,
      competition: fixture.competition ?? "league",
      opponent: fixture.opponent,
      home: fixture.home,
      attendance,
      gate,
      tv,
      matchdayOps,
      winBonus: override?.winBonus ?? 0,
      fixtureId: fixtureId(
        s.season,
        sched?.round ?? s.week,
        homeClub,
        awayClub,
        sched ? leagueOf(sched) : `${fixture.competition ?? "league"}:${fixture.dayOfWeek ?? 5}`,
      ),
      modifiers: facilityModifiers(s),
    });

    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    fxResult = {
      week: s.week,
      dayOfWeek: fixture.dayOfWeek,
      competition: fixture.competition ?? "league",
      opponent: fixture.opponent,
      home: fixture.home,
      goalsFor: gf,
      goalsAgainst: ga,
      attendance: fixture.home ? attendance : 0,
      gateReceipts: fixture.home ? gate : 0,
      tvIncome: tv,
      result,
    };

    // Knockout ties feed directly back into the persistent cup lifecycle.
    // Drawn ties are deliberately left unresolved until a dedicated cup
    // decider (extra time/penalties) supplies a winner.
    if (fixture.competition === "leagueCup" || fixture.competition === "faCup") {
      const cupIndex = s.domesticCups?.findIndex((cup) => cup.competition === fixture.competition) ?? -1;
      if (cupIndex >= 0 && s.domesticCups) {
        const cup = s.domesticCups[cupIndex];
        let winner = result === "W" ? userRef : result === "L" ? fixture.opponent : undefined;
        if (!winner) {
          const decider = resolveKnockoutDraw(
            fixture.home ? gf : ga,
            fixture.home ? ga : gf,
            `${s.saveSeed}|${s.season}|${fixture.competition}|${s.week}|${homeClub}|${awayClub}`,
          );
          winner = decider.winner === "home" ? homeClub : awayClub;
          const suffix = decider.penalties
            ? ` (pens ${decider.penalties.home}-${decider.penalties.away})`
            : " (a.e.t.)";
          matchdayNote = `${fixture.home ? "H" : "A"} vs ${clubDisplayName(s, fixture.opponent)} — ${gf}-${ga}${suffix}`;
        }
        const resolved = resolveDomesticCupTie(cup, homeClub, awayClub, winner);
        s.domesticCups[cupIndex] = advanceDomesticCup(resolved, `${s.saveSeed}|${s.season}`, s);
      }
    }

    const swing = result === "W" ? 4 : result === "D" ? 0 : -5;
    s.fanHappiness = Math.max(5, Math.min(100, s.fanHappiness + swing));
    s.reputation = Math.max(
      20,
      Math.min(95, s.reputation + (result === "W" ? 0.4 : result === "L" ? -0.3 : 0)),
    );

    if (hasFullSchedule(s) && isLeagueFixture) {
      // Record-driven league: store the user's fixture, resolve every AI
      // fixture in the same round, then project the table from records.
      if (sched) {
        const home = homeClub;
        const away = awayClub;
        const lid = leagueOf(sched);
        const id = fixtureId(s.season, sched.round, home, away, lid);
        const already = s.matchRecords.some((r) => r.id === id);
        const userRecord: MatchRecord | undefined = already
          ? undefined
          : makeRecord({
              leagueId: lid,
              season: s.season,
              week: s.week,
              round: sched.round,
              home,
              away,
              homeGoals: fixture.home ? gf : ga,
              awayGoals: fixture.home ? ga : gf,
              userInvolved: true,
            });
        resolveWeek(s, s.week, userRecord);
      }
    } else if (isLeagueFixture) {
      // Legacy (pre-v3) in-progress season: no full schedule, keep the old
      // incremental two-club update so existing saves stay consistent.
      const my = s.league.find((r) => isUserClubReference(s, r.team))!;
      const opp = s.league.find((r) => sameClubReference(s, r.team, fixture.opponent))!;
      if (my && opp) {
        my.p++;
        opp.p++;
        my.gf += gf;
        my.ga += ga;
        opp.gf += ga;
        opp.ga += gf;
        if (result === "W") {
          my.w++;
          my.pts += 3;
          opp.l++;
        } else if (result === "L") {
          my.l++;
          opp.w++;
          opp.pts += 3;
        } else {
          my.d++;
          my.pts += 1;
          opp.d++;
          opp.pts += 1;
        }
      }
    }
    matchdayNote = `${fixture.home ? "H" : "A"} vs ${clubDisplayName(s, fixture.opponent)} — ${gf}-${ga} ${result}`;
    if (fixture.competition === "preseason") settlePreseasonInvitational(s);
  }

  // Cup simulation starts only once a save actually owns cup state. Legacy and
  // freshly-created saves without initialised cups keep the established weekly
  // path untouched.
  if (s.domesticCups?.length) {
    resolveAllAiDomesticCups(s);
    syncUserCupFixtures(s);
  }

  return { fxResult, matchdayNote };
}

/** Backwards-compatible weekly selector while daily execution is introduced. */
export function tickMatchday(s: GameState, override?: MatchOverride): MatchdayOutcome {
  return tickSelectedMatchday(s, s.fixtures.find((f) => f.week === s.week), override);
}
