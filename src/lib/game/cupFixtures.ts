import type { GameState } from "./types";
import { cupSlot } from "./cupSchedule";
import { sameClubReference, userClubReference } from "./clubReference";

/** Keep the user's compatibility fixture list in sync with live cup draws. */
export function syncUserCupFixtures(state: GameState): void {
  const user = userClubReference(state);
  const league = state.fixtures.filter((f) => f.competition !== "leagueCup" && f.competition !== "faCup");
  const cups = (state.domesticCups ?? []).flatMap((cup) => {
    if (cup.champion) return [];
    const tie = cup.ties.find(
      (candidate) =>
        sameClubReference(state, candidate.home, user) || sameClubReference(state, candidate.away, user),
    );
    const slot = cupSlot(cup.competition, cup.round);
    if (!tie || !slot || tie.winner) return [];
    return [{
      week: slot.week,
      dayOfWeek: slot.dayOfWeek,
      opponent: sameClubReference(state, tie.home, user) ? tie.away : tie.home,
      home: sameClubReference(state, tie.home, user),
      competition: cup.competition,
    }];
  });

  state.fixtures = [...league, ...cups].sort(
    (a, b) => a.week - b.week || (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5),
  );
}
