/* =========================================================================
   Football pyramid: divisions, scheduling, promotion/relegation, history
   -------------------------------------------------------------------------
   Rules of this module:

     * A club belongs to exactly one league per season. Membership changes
       ONLY inside applySeasonRollover(), never mid-season.
     * Every division simulates independently of the player.
     * Season finalisation is one atomic transaction:
         1. resolve every outstanding fixture in every league
         2. finalise standings
         3. append immutable history
         4. process promotion/relegation
         5. generate next season's schedules
       It is guarded by seasonHistory so a reload cannot double-promote.
     * All randomness is seeded (saveSeed, season, league) — never Math.random.
========================================================================= */

import type {
  GameState,
  League,
  LeagueRow,
  ScheduledFixture,
  SeasonHistoryEntry,
  ClubRecord,
  InboxItem,
} from "./types";
import { CLUBS } from "./clubs";
import { buildSeasonSchedule } from "./fixtures";
import {
  LEAGUE_ID,
  leagueOf,
  sortTable,
  buildTable,
  resolveRemainingSeason,
  hasFullSchedule,
  isLeagueSeasonComplete,
} from "./league";
import { hashString } from "./rng";
import { applySeasonIdentity, storePredictions, initClubReputations } from "./reputation";
export { initClubReputations };

export const DIVISION_ONE = LEAGUE_ID;
export const DIVISION_TWO = "league-2";
export const CLUBS_PER_DIVISION = 20;

/** Rounds 1-19 -> weeks 5-23, rounds 20-38 -> weeks 28-46. */
export function weekForLeagueRound(round: number): number {
  return round <= 19 ? 4 + round : 27 + (round - 19);
}

/* ---------- League construction ---------- */

function leagueShell(id: string, name: string, tier: number, clubIds: string[]): League {
  return {
    id,
    name,
    tier,
    clubIds,
    promotionPlaces: tier === 1 ? 0 : 2,
    relegationPlaces: tier === 1 ? 2 : 0,
    prizeMoney: 0, // placeholder — financial scaling not implemented yet
    reputationRange: tier === 1 ? [55, 90] : [35, 62],
  };
}

/** Fresh pyramid for a new game: user's club in the top tier. */
export function makeLeagues(clubName: string): League[] {
  const pool = CLUBS.filter((c) => c !== clubName);
  const tier1 = [clubName, ...pool.slice(0, CLUBS_PER_DIVISION - 1)];
  const tier2 = pool.slice(CLUBS_PER_DIVISION - 1, CLUBS_PER_DIVISION * 2 - 1);
  return [
    leagueShell(DIVISION_ONE, "Division One", 1, tier1),
    leagueShell(DIVISION_TWO, "Division Two", 2, tier2),
  ];
}

export const findLeague = (s: GameState, id: string) => (s.leagues ?? []).find((l) => l.id === id);
export const leagueOfClub = (s: GameState, club: string) =>
  (s.leagues ?? []).find((l) => l.clubIds.includes(club));

/* ---------- Scheduling ---------- */

/** Full schedule for one division. */
export function scheduleForLeague(league: League, seed: string): ScheduledFixture[] {
  return buildSeasonSchedule(league.clubIds, `${seed}|${league.id}`).flatMap((round, idx) =>
    round.map((m) => ({
      league: league.id,
      round: idx + 1,
      week: weekForLeagueRound(idx + 1),
      home: m.home,
      away: m.away,
    })),
  );
}

/** Full schedule for every division in the pyramid. */
export function makePyramidSchedule(leagues: League[], seed: string): ScheduledFixture[] {
  return leagues.flatMap((l) => scheduleForLeague(l, seed));
}

/* ---------- Club records ---------- */

export function emptyClubRecord(club: string, leagueId: string): ClubRecord {
  return { club, currentLeagueId: leagueId, promotions: 0, relegations: 0, leagueHistory: [] };
}

export function makeClubRecords(leagues: League[]): Record<string, ClubRecord> {
  const out: Record<string, ClubRecord> = {};
  for (const l of leagues) for (const c of l.clubIds) out[c] = emptyClubRecord(c, l.id);
  return out;
}

/* ---------- Season finalisation ---------- */

export interface LeagueOutcome {
  leagueId: string;
  leagueName: string;
  tier: number;
  table: LeagueRow[];
  champion: string;
  runnerUp: string | null;
  promoted: string[];
  relegated: string[];
}

/** Final standings + movement for one division. Pure. */
export function finaliseLeague(s: GameState, league: League): LeagueOutcome {
  const table = sortTable(buildTable(league.clubIds, s.matchRecords ?? [], s.season, league.id));
  const promoted =
    league.promotionPlaces > 0 ? table.slice(0, league.promotionPlaces).map((r) => r.team) : [];
  const relegated =
    league.relegationPlaces > 0
      ? table.slice(table.length - league.relegationPlaces).map((r) => r.team)
      : [];
  return {
    leagueId: league.id,
    leagueName: league.name,
    tier: league.tier,
    table,
    champion: table[0]?.team ?? "",
    runnerUp: table[1]?.team ?? null,
    promoted,
    relegated,
  };
}

/** True once this season has already been finalised (idempotency guard). */
export function seasonAlreadyFinalised(s: GameState, season: number): boolean {
  return (s.seasonHistory ?? []).some((h) => h.season === season);
}

/**
 * Atomic season rollover.
 *
 * Mutates `s` in place and returns the inbox items announcing the outcome.
 * Safe to call twice: the seasonHistory guard makes the second call a no-op.
 * Does NOT advance s.season — the caller owns the clock.
 */
export function applySeasonRollover(s: GameState): {
  outcomes: LeagueOutcome[];
  items: InboxItem[];
} {
  if (!hasFullSchedule(s) || !s.leagues?.length) return { outcomes: [], items: [] };
  if (seasonAlreadyFinalised(s, s.season)) return { outcomes: [], items: [] };

  // 1. every league finishes its fixtures
  resolveRemainingSeason(s);
  // Second guard: a reload that lands here mid-season (no fixtures resolvable
  // yet, e.g. straight after a rollover) must not finalise anything.
  if (!s.leagues.every((l) => isLeagueSeasonComplete(s, l.id))) return { outcomes: [], items: [] };

  // 2. finalise standings
  const outcomes = s.leagues.map((l) => finaliseLeague(s, l));

  // 3. immutable history (append-only)
  const history: SeasonHistoryEntry[] = outcomes.map((o) => ({
    season: s.season,
    leagueId: o.leagueId,
    leagueName: o.leagueName,
    tier: o.tier,
    champion: o.champion,
    runnerUp: o.runnerUp,
    promoted: [...o.promoted],
    relegated: [...o.relegated],
    finalTable: o.table.map((r) => ({ ...r })),
  }));
  s.seasonHistory = [...(s.seasonHistory ?? []), ...history];

  // 3b. club identity: reputation movement + immutable yearly snapshots.
  //     Runs before membership changes so positions map to the league played.
  applySeasonIdentity(
    s,
    s.season,
    outcomes.map((o) => ({
      leagueId: o.leagueId,
      tier: o.tier,
      table: o.table,
      champion: o.champion,
      runnerUp: o.runnerUp,
      promoted: o.promoted,
      relegated: o.relegated,
    })),
  );

  // 4. promotion / relegation — computed first, applied as one transaction
  s.clubRecords ??= {};
  const moveTo = new Map<string, string>(); // club -> destination league id
  for (const o of outcomes) {
    const above = s.leagues.find((l) => l.tier === o.tier - 1);
    const below = s.leagues.find((l) => l.tier === o.tier + 1);
    if (above) for (const c of o.promoted) moveTo.set(c, above.id);
    if (below) for (const c of o.relegated) moveTo.set(c, below.id);
  }

  // record positions before membership changes
  for (const o of outcomes) {
    o.table.forEach((row, idx) => {
      const rec = (s.clubRecords[row.team] ??= emptyClubRecord(row.team, o.leagueId));
      if (!rec.leagueHistory.some((h) => h.season === s.season)) {
        rec.leagueHistory.push({ season: s.season, leagueId: o.leagueId, position: idx + 1 });
      }
    });
  }

  const membership = new Map<string, string>();
  for (const l of s.leagues) for (const c of l.clubIds) membership.set(c, moveTo.get(c) ?? l.id);

  for (const l of s.leagues) {
    // rebuild from the single source of truth so no club can end up in two
    // divisions or vanish from the pyramid
    l.clubIds = [...membership.entries()].filter(([, lid]) => lid === l.id).map(([c]) => c);
  }
  for (const [club, lid] of membership) {
    const rec = (s.clubRecords[club] ??= emptyClubRecord(club, lid));
    if (rec.currentLeagueId !== lid) {
      const from = findLeague(s, rec.currentLeagueId);
      const to = findLeague(s, lid);
      if (from && to) {
        if (to.tier < from.tier) rec.promotions += 1;
        else if (to.tier > from.tier) rec.relegations += 1;
      }
    }
    rec.currentLeagueId = lid;
  }
  s.playerLeagueId = membership.get(s.clubName) ?? s.playerLeagueId;

  // 4b. next season's pre-season predictions, from post-movement membership
  //     and freshly updated reputations.
  storePredictions(s, s.season + 1);

  // 5. inbox announcements (communication only — no financial effects yet)
  const items = rolloverInboxItems(s, outcomes);
  return { outcomes, items };
}

/* ---------- Inbox announcements ---------- */

const idFor = (key: string) => `inbox-${hashString(key).toString(36)}`;

function item(
  s: GameState,
  key: string,
  sender: string,
  department: InboxItem["department"],
  category: InboxItem["category"],
  priority: InboxItem["priority"],
  subject: string,
  body: string,
): InboxItem {
  return {
    id: idFor(key),
    generatorId: "league-rollover",
    eventKey: key,
    sender,
    department,
    category,
    subject,
    body,
    priority,
    week: s.week,
    season: s.season,
    status: "unread",
  };
}

/** Season-outcome mail for the player's club plus the league announcements. */
export function rolloverInboxItems(s: GameState, outcomes: LeagueOutcome[]): InboxItem[] {
  const out: InboxItem[] = [];
  const season = s.season;

  for (const o of outcomes) {
    if (o.champion) {
      out.push(
        item(
          s,
          `league-champion:${o.leagueId}:s${season}`,
          "Football Association",
          "League",
          "league",
          "normal",
          `${o.leagueName} champions: ${o.champion}`,
          `${o.champion} are confirmed as ${o.leagueName} champions for season ${season}.` +
            (o.runnerUp ? ` ${o.runnerUp} finish as runners-up.` : "") +
            (o.promoted.length ? ` Promoted: ${o.promoted.join(", ")}.` : "") +
            (o.relegated.length ? ` Relegated: ${o.relegated.join(", ")}.` : ""),
        ),
      );
    }
  }

  const mine = outcomes.find((o) => o.table.some((r) => r.team === s.clubName));
  if (mine) {
    const pos = mine.table.findIndex((r) => r.team === s.clubName) + 1;
    if (mine.promoted.includes(s.clubName)) {
      out.push(
        item(
          s,
          `club-promoted:${s.clubName}:s${season}`,
          "The Board",
          "Board of Directors",
          "board",
          "high",
          `Promoted from ${mine.leagueName}`,
          `Congratulations — finishing ${pos}${ordinal(pos)} in ${mine.leagueName} takes us up. ` +
            `A revised budget and a higher revenue settlement will follow, and expectations rise with them. ` +
            `The board will set new targets before the first fixture of season ${season + 1}.`,
        ),
      );
    } else if (mine.relegated.includes(s.clubName)) {
      out.push(
        item(
          s,
          `club-relegated:${s.clubName}:s${season}`,
          "The Board",
          "Board of Directors",
          "board",
          "urgent",
          `Relegated from ${mine.leagueName}`,
          `Finishing ${pos}${ordinal(pos)} means relegation. The board is deeply disappointed. ` +
            `Central income will fall next season and the wage bill must be reviewed accordingly. ` +
            `Supporters will want to hear from the club quickly.`,
        ),
      );
      out.push(
        item(
          s,
          `fans-relegation:${s.clubName}:s${season}`,
          "Supporters' Trust",
          "Fan Liaison",
          "fans",
          "high",
          "Supporters seek answers after relegation",
          `The trust has requested a meeting following relegation from ${mine.leagueName}. ` +
            `Season-ticket renewals are expected to slow until the club sets out a plan.`,
        ),
      );
    } else if (mine.champion === s.clubName) {
      out.push(
        item(
          s,
          `club-champions:${s.clubName}:s${season}`,
          "The Board",
          "Board of Directors",
          "board",
          "high",
          `${mine.leagueName} champions!`,
          `We finished top of ${mine.leagueName} in season ${season}. A remarkable campaign.`,
        ),
      );
    }
  }
  return out;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ---------- Integrity helpers (used by tests and dev checks) ---------- */

export function pyramidClubs(s: GameState): string[] {
  return (s.leagues ?? []).flatMap((l) => l.clubIds);
}

export function pyramidIntegrity(s: GameState): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const all = pyramidClubs(s);
  const seen = new Set<string>();
  for (const c of all) {
    if (seen.has(c)) problems.push(`duplicate club: ${c}`);
    seen.add(c);
  }
  for (const l of s.leagues ?? []) {
    if (l.clubIds.length !== CLUBS_PER_DIVISION)
      problems.push(`${l.id} has ${l.clubIds.length} clubs`);
  }
  if (!all.includes(s.clubName)) problems.push("user club is not in any league");
  const fixtureLeagues = new Set((s.leagueSchedule ?? []).map(leagueOf));
  for (const l of s.leagues ?? [])
    if (!fixtureLeagues.has(l.id)) problems.push(`${l.id} has no fixtures`);
  return { ok: problems.length === 0, problems };
}
