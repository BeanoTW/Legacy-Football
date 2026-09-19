import type { FixtureCompetition, FixtureResult, GameState } from "@/lib/game/types";
import { DAY_NAMES, seasonDateForSlot, seasonMonthName } from "@/lib/game/calendar";
import { sameClubReference } from "@/lib/game/clubReference";

export type DisplayFixture = GameState["fixtures"][number];

export function fixtureCompetition(fixture: DisplayFixture): FixtureCompetition {
  return fixture.competition ?? (fixture.week <= 4 ? "preseason" : "league");
}

export function competitionLabel(competition: FixtureCompetition): string {
  return {
    league: "League",
    leagueCup: "League Cup",
    faCup: "National Cup",
    preseason: "Preseason",
  }[competition];
}

export function fixtureDate(fixture: DisplayFixture) {
  const dayOfWeek = fixture.dayOfWeek ?? 5;
  const date = seasonDateForSlot(fixture.week, dayOfWeek);
  return {
    dayName: DAY_NAMES[dayOfWeek] ?? DAY_NAMES[5],
    day: date.day,
    month: seasonMonthName(date.month).slice(0, 3),
  };
}

export function resultForFixture(state: GameState, fixture: DisplayFixture): FixtureResult | undefined {
  const competition = fixtureCompetition(fixture);
  const exact = state.results.find((result) =>
    result.week === fixture.week &&
    (result.competition ?? "league") === competition &&
    (result.dayOfWeek ?? 5) === (fixture.dayOfWeek ?? 5) &&
    sameClubReference(state, result.opponent, fixture.opponent),
  );
  if (exact) return exact;

  return state.results.find((result) =>
    result.week === fixture.week &&
    (result.competition ?? "league") === competition &&
    sameClubReference(state, result.opponent, fixture.opponent),
  );
}

export function fixtureKey(fixture: DisplayFixture): string {
  return `${fixture.week}-${fixture.dayOfWeek ?? 5}-${fixtureCompetition(fixture)}-${fixture.opponent}`;
}