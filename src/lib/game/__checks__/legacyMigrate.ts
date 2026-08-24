/* FROZEN COPY of the pre-Phase-0b inline migration chain.
 *
 * DEV/TEST ONLY. This module is NOT imported by any production path — it
 * exists solely so migrations.check.ts can prove that the migration registry
 * produces a bit-identical result to the chain it replaced.
 *
 * The frozen chain ends at v12. Newer migrations are deliberately invoked
 * through their production step after that frozen boundary so parity continues
 * to test the old chain without duplicating new migration implementations.
 *
 * REMOVAL: delete this file (and the parity section of migrations.check.ts)
 * once the registry has shipped for a full phase.
 */
import type { GameState } from "../types";
import { CLUBS } from "../clubs";
import { makeLeagues, makeClubRecords, DIVISION_ONE, CLUBS_PER_DIVISION } from "../pyramid";
import { initClubReputations, storePredictions } from "../reputation";
import { makeBoard, ensureBoard } from "../board";
import { ensureFinance, migrateLegacyLedger } from "../finance";
import { ensureCommercial } from "../commercial";
import { ensureRecruitment } from "../recruitment";
import { ensureInfrastructure } from "../infrastructure";
import { ensureSustainability } from "../sustainability";
import { matchIdentity, matchSeedBase, preMatchKey } from "../matchday";
import { SAVE_VERSION, staffPoolFor, squadRating } from "../engine";
import { V12_TO_V13 } from "../migrations/v12-v13";

export function legacyMigrateSave(parsed: Record<string, unknown>): GameState {
  const p = parsed as unknown as Omit<GameState, "version"> & { version: number };

  // Treat a save with no version field as v1 (versioning was introduced late,
  // so pre-versioning saves must still migrate rather than be discarded).
  if (typeof p.version !== "number" || !Number.isFinite(p.version)) p.version = 1;

  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);

  p.hiredStaff = arr(p.hiredStaff, []);
  if (!Array.isArray(p.staffCandidates))
    p.staffCandidates = staffPoolFor(p as unknown as GameState);
  if (p.staffMarketRefreshedWeek == null) p.staffMarketRefreshedWeek = p.week;
  if (p.transferBudget == null) p.transferBudget = 500_000;
  if (p.wageBudgetWeekly == null) p.wageBudgetWeekly = 5_000;
  // Retired with the Recruitment milestone: scouting priorities were only read
  // by the removed legacy shortlist generator.
  delete (p as unknown as Record<string, unknown>).positionPriorities;
  // Retired legacy transfer state (pre-recruitment schema). Dropped on
  // migration so no gameplay path can read two competing transfer models.
  delete (p as unknown as Record<string, unknown>).transferTargets;
  delete (p as unknown as Record<string, unknown>).incomingBids;
  delete (p as unknown as Record<string, unknown>).completedTransfers;
  p.ledger = arr(p.ledger, []);
  p.results = arr(p.results, []);
  if (p.liveMatch === undefined) p.liveMatch = null;
  p.inbox = arr(p.inbox, []);
  if (!p.inboxFlags || typeof p.inboxFlags !== "object") p.inboxFlags = {};
  p.scheduledGenerators = arr(p.scheduledGenerators, []);

  // v1 → v2
  if (p.version < 2) {
    if (!p.saveSeed) p.saveSeed = `${p.clubName}|${p.managerName}|legacy-v1`;

    for (const it of p.inbox) {
      if (!it.eventKey) it.eventKey = `legacy:${it.generatorId}:${it.id}`;
      if (it.expiresAtAbsoluteWeek == null && it.expiresWeek != null) {
        it.expiresAtAbsoluteWeek = absoluteWeekLocal(it.season, it.expiresWeek);
      }
    }

    const nowAbs = absoluteWeekLocal(p.season, p.week);
    p.scheduledGenerators = p.scheduledGenerators
      .filter((g) => g && typeof g === "object" && typeof g.generatorId === "string")
      .map((g) => {
        if (typeof g.dueAtAbsoluteWeek === "number" && Number.isFinite(g.dueAtAbsoluteWeek))
          return g;
        if (g.dueSeason != null && g.dueWeek != null) {
          return { ...g, dueAtAbsoluteWeek: absoluteWeekLocal(g.dueSeason, g.dueWeek) };
        }
        return { ...g, dueAtAbsoluteWeek: nowAbs };
      });

    const legacyWarn = p.inboxFlags["fansWarnedAtWeek"];
    if (legacyWarn != null && p.inboxFlags["fansWarnedAtAbsoluteWeek"] == null) {
      p.inboxFlags["fansWarnedAtAbsoluteWeek"] = absoluteWeekLocal(p.season, Number(legacyWarn));
      delete p.inboxFlags["fansWarnedAtWeek"];
    }

    p.version = 2;
  }

  // v2 → v3: league simulation foundation.
  if (p.version < 3) {
    if (!Array.isArray(p.matchRecords)) p.matchRecords = [];
    if (!Array.isArray(p.leagueSchedule)) p.leagueSchedule = [];
    p.version = 3;
  }

  // v3 → v4: multi-division pyramid.
  if (p.version < 4) {
    if (!Array.isArray(p.seasonHistory)) p.seasonHistory = [];
    if (!p.clubRecords || typeof p.clubRecords !== "object") p.clubRecords = {};
    if (!Array.isArray(p.leagues) || p.leagues.length === 0) {
      const fresh = makeLeagues(p.clubName);
      const existing = Array.isArray(p.league) ? p.league.map((r) => r.team) : [];
      if (existing.length === CLUBS_PER_DIVISION) fresh[0].clubIds = existing;
      const t1 = new Set(fresh[0].clubIds);
      const pool = CLUBS.filter((c) => !t1.has(c));
      fresh[1].clubIds = pool.slice(0, CLUBS_PER_DIVISION);
      p.leagues = fresh;
    }
    if (!p.playerLeagueId) {
      p.playerLeagueId = p.leagues.find((l) => l.clubIds.includes(p.clubName))?.id ?? DIVISION_ONE;
    }
    if (!p.leagues.some((l) => l.clubIds.includes(p.clubName))) {
      const home = p.leagues.find((l) => l.id === p.playerLeagueId) ?? p.leagues[0];
      home.clubIds = [p.clubName, ...home.clubIds.slice(0, CLUBS_PER_DIVISION - 1)];
    }
    if (Object.keys(p.clubRecords).length === 0) p.clubRecords = makeClubRecords(p.leagues);
    p.version = 4;
  }

  // v4 → v5: club identity (reputation, strength, predictions).
  if (p.version < 5) {
    if (!p.clubReputations || typeof p.clubReputations !== "object") p.clubReputations = {};
    const seeded = initClubReputations(p.leagues ?? [], p.saveSeed);
    for (const [club, rep0] of Object.entries(seeded)) {
      if (typeof p.clubReputations[club] !== "number") p.clubReputations[club] = rep0;
    }
    if (!Array.isArray(p.clubSnapshots)) p.clubSnapshots = [];
    if (!Array.isArray(p.seasonPredictions)) p.seasonPredictions = [];
    p.version = 5;
    if (!p.seasonPredictions.some((x) => x.season === p.season)) {
      storePredictions(p as unknown as GameState, p.season);
    }
  }

  // v5 → v6: Board of Directors.
  if (p.version < 6) {
    const st = p as unknown as GameState;
    if (!st.board || !Array.isArray(st.board.directors) || st.board.directors.length === 0) {
      st.board = makeBoard(p.saveSeed, p.clubName);
    }
    ensureBoard(st);
    p.version = 6;
  }

  // v6 → v7: club finance system.
  if (p.version < 7) {
    const st = p as unknown as GameState;
    ensureFinance(st);
    migrateLegacyLedger(st);
    p.version = 7;
  }

  // v7 → v8: commercial department & sponsorship.
  if (p.version < 8) {
    ensureCommercial(p as unknown as GameState);
    p.version = 8;
  }

  // v8 → v9: football operation (players, contracts, squads, transfers).
  if (p.version < 9) {
    ensureRecruitment(p as unknown as GameState);
    p.version = 9;
  }

  // v9 → v10: infrastructure.
  if (p.version < 10) {
    const st = p as unknown as GameState;
    ensureInfrastructure(st);
    p.version = 10;
  }

  // v10 → v11: canonical live-match identity.
  if (p.version < 11) {
    const st = p as unknown as GameState;
    const lm = st.liveMatch;
    if (lm) {
      const ident = matchIdentity(st);
      lm.matchSeed ??= ident
        ? matchSeedBase(st.saveSeed, ident, preMatchKey({ squadRating: squadRating(st) }))
        : `${st.saveSeed}|live-match|s${st.season}|w${st.week}|${lm.fixture.opponent}`;
      lm.fixtureId ??= ident?.fixtureId;
      lm.leagueId ??= ident?.leagueId;
      lm.season ??= st.season;
      lm.round ??= ident?.round;
      lm.homeClub ??= ident?.homeClub;
      lm.awayClub ??= ident?.awayClub;
      lm.committed ??= false;
    }
    p.version = 11;
  }

  // v11 → v12: strategic pressure layer.
  if (p.version < 12) {
    ensureSustainability(p as unknown as GameState);
    p.version = 12;
  }

  // The historical oracle is frozen through v12. From here forward we invoke
  // the canonical production step rather than copying its body into this file.
  if (p.version < 13 && SAVE_VERSION >= 13) {
    V12_TO_V13.up(p as never, {
      deps: { staffPoolFor, squadRating },
      warn: () => undefined,
    });
    p.version = 13;
  }

  p.version = SAVE_VERSION;
  return p as GameState;
}

function absoluteWeekLocal(season: number, week: number): number {
  return (season - 1) * 46 + week;
}
