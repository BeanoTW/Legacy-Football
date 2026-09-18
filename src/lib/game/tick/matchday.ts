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
import { CLUBS } from "../clubs";
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
import { avgTicketPrice, simAttendance, simGoals, usableCapacity } from "../sim";
import { FRIENDLY_WEEKS } from "../calendar";
import { advanceDomesticCup, resolveDomesticCupTie } from "../domesticCupState";

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

/** The user's fixture for this week (league match or scheduled friendly). */
export function tickMatchday(s: GameState, override?: MatchOverride): MatchdayOutcome {
  const fixture = s.fixtures.find((f) => f.week === s.week);
  let matchdayNote: string | undefined;
  let fxResult: FixtureResult | null = null;

  if (fixture) {
    const userRef = userClubReference(s);
    let gf: number, ga: number, attendance: number, gate: number, tv: number, matchdayOps: number;
    // The scheduled fixture this result belongs to (schedule-backed saves).
    const sched = hasFullSchedule(s)
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
        sched ? leagueOf(sched) : playerLeagueId(s),
      ),
      modifiers: facilityModifiers(s),
    });

    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    fxResult = {
      week: s.week,
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
    if ((fixture.competition === "leagueCup" || fixture.competition === "faCup") && result !== "D") {
      const cupIndex = s.domesticCups?.findIndex((cup) => cup.competition === fixture.competition) ?? -1;
      if (cupIndex >= 0 && s.domesticCups) {
        const cup = s.domesticCups[cupIndex];
        const winner = result === "W" ? userRef : fixture.opponent;
        const resolved = resolveDomesticCupTie(cup, homeClub, awayClub, winner);
        s.domesticCups[cupIndex] = advanceDomesticCup(resolved, `${s.saveSeed}|${s.season}`);
      }
    }

    const swing = result === "W" ? 4 : result === "D" ? 0 : -5;
    s.fanHappiness = Math.max(5, Math.min(100, s.fanHappiness + swing));
    s.reputation = Math.max(
      20,
      Math.min(95, s.reputation + (result === "W" ? 0.4 : result === "L" ? -0.3 : 0)),
    );

    if (hasFullSchedule(s)) {
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
    } else {
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
  } else if (!override && FRIENDLY_WEEKS.has(s.week)) {
    // ---- Friendly (pre-season / mid-season windows) ----
    // Seeded from the save + calendar slot so replaying the same pre-week
    // state reproduces the same friendly, exactly like a league fixture.
    const rng = mulberry32(hashString(`friendly|${s.saveSeed}|${s.season}|${s.week}`));
    const others = CLUBS.filter((c) => c !== s.clubName);
    const opp = others[Math.floor(rng() * others.length)];
    const oppStrength = 50 + rng() * 25;
    const myStrength = clubMatchStrength(s, userClubReference(s), s.season);
    const gf = simGoals(myStrength + 2, oppStrength, rng);
    const ga = simGoals(oppStrength, myStrength + 2, rng);
    // Friendly attendance is a fraction of a league day
    const cap = usableCapacity(s);
    const attendance = Math.round(cap * (0.28 + rng() * 0.18) * (0.6 + s.fanHappiness / 200));
    const gate = Math.round(attendance * avgTicketPrice(s) * 0.7);
    const matchdayOps = Math.round(4_200 + attendance * 0.3);
    postMatchdayFinance(s, {
      season: s.season,
      week: s.week,
      opponent: `${opp} (friendly)`,
      home: true,
      attendance,
      gate,
      tv: 0,
      matchdayOps,
      modifiers: facilityModifiers(s),
    });
    const result: "W" | "D" | "L" = gf > ga ? "W" : gf === ga ? "D" : "L";
    // Friendlies don't touch the league table; tiny happiness swing only
    s.fanHappiness = Math.max(
      5,
      Math.min(100, s.fanHappiness + (result === "W" ? 1 : result === "L" ? -1 : 0)),
    );
    fxResult = {
      week: s.week,
      opponent: `${opp} (friendly)`,
      home: true,
      goalsFor: gf,
      goalsAgainst: ga,
      attendance,
      gateReceipts: gate,
      tvIncome: 0,
      result,
    };
    matchdayNote = `Friendly vs ${opp} — ${gf}-${ga} ${result}`;
  }

  return { fxResult, matchdayNote };
}
