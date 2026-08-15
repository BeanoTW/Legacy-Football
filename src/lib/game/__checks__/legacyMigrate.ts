/* FROZEN COPY of the pre-Phase-0b inline migration chain.
 *
 * DEV/TEST ONLY. This module is NOT imported by any production path — it
 * exists solely so migrations.check.ts can prove that the migration registry
 * produces a bit-identical result to the chain it replaced.
 *
 * REMOVAL: delete this file (and the parity section of migrations.check.ts)
 * at the end of Phase 0c, once the registry has shipped for a full phase.
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

export function legacyMigrateSave(parsed: Record<string, unknown>): GameState {
  const p = parsed as unknown as Omit<GameState, "version"> & { version: number };

  // Treat a save with no version field as v1 (versioning was introduced late,
  // so pre-versioning saves must still migrate rather than be discarded).
  if (typeof p.version !== "number" || !Number.isFinite(p.version)) p.version = 1;

  const arr = <T,>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);

  p.hiredStaff = arr(p.hiredStaff, []);
  if (!Array.isArray(p.staffCandidates)) p.staffCandidates = staffPoolFor(p as unknown as GameState);
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

    // Inbox items: fill eventKey + convert expiresWeek → expiresAtAbsoluteWeek
    for (const it of p.inbox) {
      if (!it.eventKey) it.eventKey = `legacy:${it.generatorId}:${it.id}`;
      if (it.expiresAtAbsoluteWeek == null && it.expiresWeek != null) {
        // Legacy expiresWeek was week-of-season within the item's own season.
        it.expiresAtAbsoluteWeek = absoluteWeekLocal(it.season, it.expiresWeek);
      }
    }

    // Scheduled generators: convert (dueSeason, dueWeek) → dueAtAbsoluteWeek.
    // A malformed entry must not silently disappear — if we can't recover a
    // due time we make it due immediately so the follow-up still fires.
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


    // Cooldown flag: convert week-of-season → absolute (using saved season)
    const legacyWarn = p.inboxFlags["fansWarnedAtWeek"];
    if (legacyWarn != null && p.inboxFlags["fansWarnedAtAbsoluteWeek"] == null) {
      p.inboxFlags["fansWarnedAtAbsoluteWeek"] = absoluteWeekLocal(p.season, Number(legacyWarn));
      delete p.inboxFlags["fansWarnedAtWeek"];
    }

    p.version = 2;
  }

  // v2 → v3: league simulation foundation.
  //
  // Completed history is never rewritten. A v2 save has no full division
  // schedule and no match records, so its CURRENT season stays on the legacy
  // user-only path (existing table and results are left exactly as they are).
  // The full schedule + AI simulation switch on at the next season rollover.
  if (p.version < 3) {
    if (!Array.isArray(p.matchRecords)) p.matchRecords = [];
    if (!Array.isArray(p.leagueSchedule)) p.leagueSchedule = [];
    p.version = 3;
  }

  // v3 → v4: multi-division pyramid.
  //
  // The ACTIVE season is never restructured. A v3 save keeps its existing
  // single-division schedule, table, records and results exactly as they are;
  // the second division is created empty-of-fixtures alongside it and only
  // starts playing at the next season rollover, when the whole pyramid is
  // rescheduled. Existing tier-1 fixtures have no `league` field, which
  // leagueOf() reads as the tier-1 id, so old records stay valid.
  if (p.version < 4) {
    if (!Array.isArray(p.seasonHistory)) p.seasonHistory = [];
    if (!p.clubRecords || typeof p.clubRecords !== "object") p.clubRecords = {};
    if (!Array.isArray(p.leagues) || p.leagues.length === 0) {
      const fresh = makeLeagues(p.clubName);
      // Preserve the save's actual tier-1 membership if it has one.
      const existing = Array.isArray(p.league) ? p.league.map((r) => r.team) : [];
      if (existing.length === CLUBS_PER_DIVISION) fresh[0].clubIds = existing;
      // Tier 2 must never contain a tier-1 club.
      const t1 = new Set(fresh[0].clubIds);
      const pool = CLUBS.filter((c) => !t1.has(c));
      fresh[1].clubIds = pool.slice(0, CLUBS_PER_DIVISION);
      p.leagues = fresh;
    }
    if (!p.playerLeagueId) {
      p.playerLeagueId =
        p.leagues.find((l) => l.clubIds.includes(p.clubName))?.id ?? DIVISION_ONE;
    }
    if (!p.leagues.some((l) => l.clubIds.includes(p.clubName))) {
      const home = p.leagues.find((l) => l.id === p.playerLeagueId) ?? p.leagues[0];
      home.clubIds = [p.clubName, ...home.clubIds.slice(0, CLUBS_PER_DIVISION - 1)];
    }
    if (Object.keys(p.clubRecords).length === 0) p.clubRecords = makeClubRecords(p.leagues);
    p.version = 4;
  }

  // v4 → v5: club identity (reputation, derived strength, predictions).
  //
  // Only additive persistent fields. Historical seasons are never rewritten:
  // snapshots start empty and accumulate from the next completed season.
  // Reputation is seeded deterministically from each club's current tier, so
  // an existing save keeps a sensible pyramid shape immediately.
  if (p.version < 5) {
    if (!p.clubReputations || typeof p.clubReputations !== "object") p.clubReputations = {};
    const seeded = initClubReputations(p.leagues ?? [], p.saveSeed);
    for (const [club, rep0] of Object.entries(seeded)) {
      if (typeof p.clubReputations[club] !== "number") p.clubReputations[club] = rep0;
    }
    if (!Array.isArray(p.clubSnapshots)) p.clubSnapshots = [];
    if (!Array.isArray(p.seasonPredictions)) p.seasonPredictions = [];
    p.version = 5;
    // Project the current season if it has not been projected yet.
    if (!p.seasonPredictions.some((x) => x.season === p.season)) {
      storePredictions(p as unknown as GameState, p.season);
    }
  }

  // v5 → v6: Board of Directors.
  //
  // Purely additive. Directors are generated deterministically from the
  // save's own seed, so an existing save gets a stable boardroom that never
  // changes on reload. Objectives are built from the CURRENT season's stored
  // projection; no historical season is rewritten and no review is
  // back-filled — the board starts judging from the next review window.
  if (p.version < 6) {
    const st = p as unknown as GameState;
    if (!st.board || !Array.isArray(st.board.directors) || st.board.directors.length === 0) {
      st.board = makeBoard(p.saveSeed, p.clubName);
    }
    ensureBoard(st);
    p.version = 6;
  }

  // v6 → v7: club finance system.
  //
  // The legacy weekly ledger is converted into itemised finance entries with
  // a balancing opening position, so the rebuilt books reconcile exactly to
  // the save's real cash figure. No historical season summary is invented.
  if (p.version < 7) {
    const st = p as unknown as GameState;
    ensureFinance(st);
    migrateLegacyLedger(st);
    p.version = 7;
  }

  // v7 → v8: commercial department & sponsorship.
  //
  // Purely additive and deterministic: an empty department is created with a
  // sponsor pool seeded from the save's own seed. No historic sponsorship
  // contract is fabricated, and finance/board history is left untouched.
  if (p.version < 8) {
    ensureCommercial(p as unknown as GameState);
    p.version = 8;
  }

  // v8 → v9: football operation (players, contracts, squads, transfers).
  //
  // Additive, deterministic and idempotent. The world player database and
  // valid opening contracts are generated from the save's own seed; finance,
  // commercial, board, inbox and every history are left untouched, and no
  // transfer or contract history is invented for seasons already played.
  if (p.version < 9) {
    ensureRecruitment(p as unknown as GameState);
    p.version = 9;
  }

  // v9 → v10: infrastructure (physical assets, capital projects, maintenance).
  //
  // ensureInfrastructure() converts the legacy `stands`, `pitchCondition` and
  // `trainingRating` fields into canonical assets, preserving capacity and
  // condition exactly, then re-projects the legacy fields back from them so
  // older screens keep reading the same numbers. No cash moves, no ledger
  // entry is written and no history is invented — it is purely structural.
  if (p.version < 10) {
    const st = p as unknown as GameState;
    ensureInfrastructure(st);
    p.version = 10;
  }

  // v10 → v11: canonical live-match identity.
  //
  // LiveMatch gained a persisted seed root plus fixture/league/round identity
  // and a `committed` flag so an interactive match is deterministic,
  // resumable and exactly-once. Purely additive:
  //   - Saves with no match in flight are untouched.
  //   - An in-flight legacy match keeps its already-shown score, events,
  //     weather and attendance; only the missing identity fields are
  //     backfilled, derived from the save itself (no clock, no randomness),
  //     so the migration is deterministic and idempotent.
  //   - No historical MatchRecord, ledger entry or result is created, altered
  //     or fabricated.
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

  // v11 -> v12: strategic pressure layer.
  //   - Adds SustainabilityState only. No cash, ledger entry, board review or
  //     historical record is created or altered, so the step is a pure
  //     structural upgrade and is idempotent by construction.
  if (p.version < 12) {
    ensureSustainability(p as unknown as GameState);
    p.version = 12;
  }

  // Every step above has run: the save is now at the current schema.
  p.version = SAVE_VERSION;


  return p as GameState;
}

// Local copy to avoid a circular import (time.ts is imported by inbox.ts,
// which is imported by engine.ts).
function absoluteWeekLocal(season: number, week: number): number {
  return (season - 1) * 46 + week;
}

