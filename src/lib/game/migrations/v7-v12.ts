/* Migration steps v6 -> v12: finance, commercial, football operation,
 * infrastructure, live-match identity, sustainability.
 *
 * Bodies are the originals from engine.ts, moved verbatim.
 */
import type { GameState } from "../types";
import type { Migration } from "./types";
import { ensureFinance, migrateLegacyLedger } from "../finance";
import { ensureCommercial } from "../commercial";
import { ensureRecruitment } from "../recruitment";
import { ensureInfrastructure } from "../infrastructure";
import { ensureSustainability } from "../sustainability";
import { matchIdentity, matchSeedBase, preMatchKey } from "../matchday";

export const V6_TO_V7: Migration = {
  from: 6,
  to: 7,
  describe: "Club finance system",
  // The legacy weekly ledger becomes itemised finance entries with a balancing
  // opening position, so rebuilt books reconcile to the save's real cash.
  up(p) {
    const st = p as unknown as GameState;
    ensureFinance(st);
    migrateLegacyLedger(st);
  },
};

export const V7_TO_V8: Migration = {
  from: 7,
  to: 8,
  describe: "Commercial department & sponsorship",
  // Additive: an empty department with a seed-derived sponsor pool. No historic
  // contract is fabricated.
  up(p) {
    ensureCommercial(p as unknown as GameState);
  },
};

export const V8_TO_V9: Migration = {
  from: 8,
  to: 9,
  describe: "Football operation: players, contracts, squads",
  // The world player database and valid opening contracts are generated from
  // the save's own seed. No transfer history is invented for played seasons.
  up(p) {
    ensureRecruitment(p as unknown as GameState);
  },
};

export const V9_TO_V10: Migration = {
  from: 9,
  to: 10,
  describe: "Infrastructure: assets, capital projects, maintenance",
  // Converts legacy `stands`/`pitchCondition`/`trainingRating` into canonical
  // assets, preserving capacity and condition exactly, then re-projects the
  // legacy fields. No cash moves and no history is invented.
  up(p) {
    ensureInfrastructure(p as unknown as GameState);
  },
};

export const V10_TO_V11: Migration = {
  from: 10,
  to: 11,
  describe: "Canonical live-match identity",
  // Saves with no match in flight are untouched. An in-flight legacy match
  // keeps its shown score/events/weather/attendance; only missing identity
  // fields are backfilled, derived from the save itself.
  up(p, ctx) {
    const st = p as unknown as GameState;
    const lm = st.liveMatch;
    if (lm) {
      const ident = matchIdentity(st);
      lm.matchSeed ??= ident
        ? matchSeedBase(st.saveSeed, ident, preMatchKey({ squadRating: ctx.deps.squadRating(st) }))
        : `${st.saveSeed}|live-match|s${st.season}|w${st.week}|${lm.fixture.opponent}`;
      lm.fixtureId ??= ident?.fixtureId;
      lm.leagueId ??= ident?.leagueId;
      lm.season ??= st.season;
      lm.round ??= ident?.round;
      lm.homeClub ??= ident?.homeClub;
      lm.awayClub ??= ident?.awayClub;
      lm.committed ??= false;
      if (!ident) ctx.warn("live-match/identity-derived", "no matching fixture; seed derived from calendar slot");
    }
  },
};

export const V11_TO_V12: Migration = {
  from: 11,
  to: 12,
  describe: "Strategic pressure layer (sustainability)",
  // Adds SustainabilityState only — a pure structural upgrade.
  up(p) {
    ensureSustainability(p as unknown as GameState);
  },
};

export const LATE_MIGRATIONS: Migration[] = [
  V6_TO_V7, V7_TO_V8, V8_TO_V9, V9_TO_V10, V10_TO_V11, V11_TO_V12,
];
