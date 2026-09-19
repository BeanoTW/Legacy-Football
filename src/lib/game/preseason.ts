import type { GameState, ScheduledFixture } from "./types";
import { canonicalClubReference, userClubReference } from "./clubReference";
import { hashString, mulberry32 } from "./rng";
import { postEntry } from "./finance";

/**
 * Opening invitational: three low-stakes friendlies across the first three
 * pre-season weeks. The 4/5-day rhythm leaves genuine club-working time
 * between matches and keeps week 4 clear before league football begins.
 */
export const PRESEASON_COMPETITION_NAME = "Summer Invitational";

export const PRESEASON_MATCH_SLOTS = [
  { week: 1, dayOfWeek: 3 }, // Thu 6 Jul
  { week: 2, dayOfWeek: 1 }, // Tue 11 Jul (5 days)
  { week: 2, dayOfWeek: 5 }, // Sat 15 Jul (4 days)
] as const;

export function buildUserPreseasonFixtures(state: GameState): ScheduledFixture[] {
  const user = userClubReference(state);
  const league = (state.leagues ?? []).find((candidate) =>
    candidate.clubIds.some((club) => canonicalClubReference(state, club) === canonicalClubReference(state, user)),
  );
  if (!league) return [];

  const opponents = league.clubIds
    .map((club) => canonicalClubReference(state, club))
    .filter((club) => club !== canonicalClubReference(state, user));

  const rng = mulberry32(hashString(`preseason|${state.saveSeed}|${state.season}|${league.id}`));
  for (let i = opponents.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opponents[i], opponents[j]] = [opponents[j], opponents[i]];
  }

  return PRESEASON_MATCH_SLOTS.slice(0, opponents.length).map((slot, index) => ({
    competition: "preseason" as const,
    league: league.id,
    round: index + 1,
    week: slot.week,
    dayOfWeek: slot.dayOfWeek,
    home: index % 2 === 0 ? user : opponents[index],
    away: index % 2 === 0 ? opponents[index] : user,
  }));
}

export function initialisePreseasonFixtures(state: GameState): void {
  const existing = (state.leagueSchedule ?? []).some((fixture) => fixture.competition === "preseason");
  if (existing) return;

  const fixtures = buildUserPreseasonFixtures(state);
  state.leagueSchedule = [...(state.leagueSchedule ?? []), ...fixtures];
}


export interface PreseasonTableRow {
  club: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

/**
 * Lightweight invitational table derived entirely from played user fixtures.
 * This deliberately does not pollute the canonical league table or MatchRecord
 * store; the tournament is context for pre-season, not a parallel league.
 */
export function preseasonTable(state: GameState): PreseasonTableRow[] {
  const fixtures = (state.fixtures ?? []).filter((fixture) => fixture.competition === "preseason");
  const clubs = [userClubReference(state), ...fixtures.map((fixture) => fixture.opponent)]
    .map((club) => canonicalClubReference(state, club))
    .filter((club, index, all) => all.indexOf(club) === index);
  const rows = new Map(clubs.map((club) => [club, { club, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
  const user = canonicalClubReference(state, userClubReference(state));

  for (const result of (state.results ?? []).filter((item) => item.competition === "preseason")) {
    const opponent = canonicalClubReference(state, result.opponent);
    const mine = rows.get(user);
    const theirs = rows.get(opponent);
    if (!mine || !theirs) continue;

    mine.p += 1;
    theirs.p += 1;
    mine.gf += result.goalsFor;
    mine.ga += result.goalsAgainst;
    theirs.gf += result.goalsAgainst;
    theirs.ga += result.goalsFor;

    if (result.result === "W") {
      mine.w += 1; mine.pts += 3; theirs.l += 1;
    } else if (result.result === "L") {
      mine.l += 1; theirs.w += 1; theirs.pts += 3;
    } else {
      mine.d += 1; mine.pts += 1; theirs.d += 1; theirs.pts += 1;
    }
  }

  return [...rows.values()].sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.club.localeCompare(b.club),
  );
}


const PRESEASON_REWARD_KEY = (season: number) => `preseason:reward:s${season}`;

export function preseasonComplete(state: GameState): boolean {
  const scheduled = (state.fixtures ?? []).filter((fixture) => fixture.competition === "preseason");
  if (!scheduled.length) return false;
  const played = (state.results ?? []).filter((result) => result.competition === "preseason");
  return played.length >= scheduled.length;
}

/** Keep the invitational deliberately low stakes: useful at Level 7, trivial at the top. */
export function preseasonWinnerPrize(state: GameState): number {
  const tier = (state.leagues ?? []).find((league) =>
    league.clubIds.some((club) => canonicalClubReference(state, club) === canonicalClubReference(state, userClubReference(state))),
  )?.tier ?? 7;
  return Math.max(2_000, Math.round(14_000 / Math.max(1, tier)));
}

/**
 * Close the user's invitational exactly once. The reward is intentionally
 * modest and only paid if the user tops the table after all three matches.
 */
export function settlePreseasonInvitational(state: GameState): boolean {
  if (!preseasonComplete(state)) return false;
  const table = preseasonTable(state);
  const user = canonicalClubReference(state, userClubReference(state));
  if (table[0]?.club !== user) return false;

  const key = PRESEASON_REWARD_KEY(state.season);
  const entry = postEntry(state, {
    direction: "income",
    amount: preseasonWinnerPrize(state),
    category: "Prize Money",
    subcategory: "Pre-season",
    description: `${PRESEASON_COMPETITION_NAME} winner's prize`,
    sourceSystem: "preseason",
    dedupeKey: key,
    season: state.season,
    week: state.week,
  });
  return entry !== null;
}
