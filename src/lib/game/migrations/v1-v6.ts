/* Migration steps v1 -> v6: inbox absolute-time axis, league simulation,
 * multi-division pyramid, club identity, board of directors.
 *
 * Bodies are the originals from engine.ts, moved verbatim. Behaviour parity is
 * proven by migration.check.ts plus migrations.check.ts.
 */
import type { GameState } from "../types";
import type { Migration } from "./types";
import { CLUBS } from "../clubs";
import { makeLeagues, makeClubRecords, DIVISION_ONE, CLUBS_PER_DIVISION } from "../pyramid";
import { initClubReputations, storePredictions } from "../reputation";
import { makeBoard, ensureBoard } from "../board";

/** Local copy of the absolute-week axis (time.ts is imported via inbox.ts). */
export function absoluteWeekLocal(season: number, week: number): number {
  return (season - 1) * 46 + week;
}

export const V1_TO_V2: Migration = {
  from: 1,
  to: 2,
  describe: "Inbox determinism: eventKeys + absolute-week scheduling",
  up(p, ctx) {
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
    const before = p.scheduledGenerators.length;
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
    if (p.scheduledGenerators.length !== before) {
      ctx.warn("scheduled-generators/dropped", `${before - p.scheduledGenerators.length} malformed entries`);
    }

    // Cooldown flag: convert week-of-season → absolute (using saved season)
    const legacyWarn = p.inboxFlags["fansWarnedAtWeek"];
    if (legacyWarn != null && p.inboxFlags["fansWarnedAtAbsoluteWeek"] == null) {
      p.inboxFlags["fansWarnedAtAbsoluteWeek"] = absoluteWeekLocal(p.season, Number(legacyWarn));
      delete p.inboxFlags["fansWarnedAtWeek"];
    }
  },
};

export const V2_TO_V3: Migration = {
  from: 2,
  to: 3,
  describe: "League simulation foundation",
  // Completed history is never rewritten. A v2 save has no full division
  // schedule and no match records, so its CURRENT season stays on the legacy
  // user-only path. Full simulation switches on at the next rollover.
  up(p) {
    if (!Array.isArray(p.matchRecords)) p.matchRecords = [];
    if (!Array.isArray(p.leagueSchedule)) p.leagueSchedule = [];
  },
};

export const V3_TO_V4: Migration = {
  from: 3,
  to: 4,
  describe: "Multi-division pyramid",
  // The ACTIVE season is never restructured; division two is created without
  // fixtures and starts playing at the next rollover.
  up(p, ctx) {
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
      ctx.warn("pyramid/user-club-reseated", `${p.clubName} was not in any division`);
    }
    if (Object.keys(p.clubRecords).length === 0) p.clubRecords = makeClubRecords(p.leagues);
  },
};

export const V4_TO_V5: Migration = {
  from: 4,
  to: 5,
  describe: "Club identity: reputation, strength, predictions",
  // Additive only. Reputation is seeded deterministically from each club's
  // current tier, so an existing save keeps a sensible pyramid shape.
  up(p) {
    if (!p.clubReputations || typeof p.clubReputations !== "object") p.clubReputations = {};
    const seeded = initClubReputations(p.leagues ?? [], p.saveSeed);
    for (const [club, rep0] of Object.entries(seeded)) {
      if (typeof p.clubReputations[club] !== "number") p.clubReputations[club] = rep0;
    }
    if (!Array.isArray(p.clubSnapshots)) p.clubSnapshots = [];
    if (!Array.isArray(p.seasonPredictions)) p.seasonPredictions = [];
    // Project the current season if it has not been projected yet.
    if (!p.seasonPredictions.some((x) => x.season === p.season)) {
      storePredictions(p as unknown as GameState, p.season);
    }
  },
};

export const V5_TO_V6: Migration = {
  from: 5,
  to: 6,
  describe: "Board of Directors",
  // Directors are generated from the save's own seed, so the boardroom is
  // stable across reloads. No review is back-filled.
  up(p) {
    const st = p as unknown as GameState;
    if (!st.board || !Array.isArray(st.board.directors) || st.board.directors.length === 0) {
      st.board = makeBoard(p.saveSeed, p.clubName);
    }
    ensureBoard(st);
  },
};

export const EARLY_MIGRATIONS: Migration[] = [V1_TO_V2, V2_TO_V3, V3_TO_V4, V4_TO_V5, V5_TO_V6];
