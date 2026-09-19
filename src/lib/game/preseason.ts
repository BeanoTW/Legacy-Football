import type { GameState, ScheduledFixture } from "./types";
import { canonicalClubReference, userClubReference } from "./clubReference";
import { hashString, mulberry32 } from "./rng";

/**
 * Opening invitational: three low-stakes friendlies across the first three
 * pre-season weeks. The 4/5-day rhythm leaves genuine club-working time
 * between matches and keeps week 4 clear before league football begins.
 */
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
