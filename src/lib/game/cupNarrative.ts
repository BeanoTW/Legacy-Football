import type { DomesticCupState, FixtureCompetition, GameState } from "./types";
import { DOMESTIC_CUPS, cupRoundPrize } from "./domesticCups";
import { postEntry } from "./finance";
import { hashString } from "./rng";
import { clubDisplayName, isUserClubReference } from "./clubReference";
import { cupSlot } from "./cupSchedule";

type DomesticCompetition = Extract<FixtureCompetition, "leagueCup" | "faCup">;

export function domesticCupName(competition: DomesticCompetition): string {
  return DOMESTIC_CUPS.find((cup) => cup.id === competition)?.name ?? competition;
}

export function domesticCupRoundLabel(competition: DomesticCompetition, round: number): string {
  return cupSlot(competition, round)?.label ?? `Round ${round}`;
}

function pushCupInbox(
  state: GameState,
  eventKey: string,
  subject: string,
  body: string,
  priority: "low" | "normal" | "high" = "normal",
): void {
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  state.inbox.push({
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "domestic-cup",
    eventKey,
    sender: "Club Secretary",
    department: "Club",
    category: "league",
    subject,
    body,
    priority,
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

export function awardUserCupProgressInPlace(
  state: GameState,
  cupBefore: DomesticCupState,
  winner: string,
): number {
  const definition = DOMESTIC_CUPS.find((cup) => cup.id === cupBefore.competition);
  if (!definition) return 0;
  const userWon = isUserClubReference(state, winner);
  const userTie = cupBefore.ties.find(
    (tie) => isUserClubReference(state, tie.home) || isUserClubReference(state, tie.away),
  );
  if (!userTie) return 0;

  const opponent = isUserClubReference(state, userTie.home) ? userTie.away : userTie.home;
  const final = cupBefore.ties.length === 1;
  if (!userWon) {
    pushCupInbox(
      state,
      `cup:eliminated:s${state.season}:${cupBefore.competition}:r${cupBefore.round}`,
      `Eliminated from the ${definition.name}`,
      `Our ${definition.name} run has ended against ${clubDisplayName(state, opponent)} in ${domesticCupRoundLabel(cupBefore.competition, cupBefore.round)}.`,
      cupBefore.round >= 4 ? "high" : "normal",
    );
    return 0;
  }

  const amount = cupRoundPrize(definition, cupBefore.round, final);
  const posted = postEntry(state, {
    category: "Prize Money",
    subcategory: definition.name,
    description: final
      ? `${definition.name} winners prize`
      : `${definition.name} ${domesticCupRoundLabel(cupBefore.competition, cupBefore.round)} progression prize`,
    amount,
    direction: "income",
    sourceSystem: "engine.prize",
    linkedEntityId: cupBefore.competition,
    dedupeKey: `cup-prize:s${state.season}:${cupBefore.competition}:r${cupBefore.round}`,
    metadata: {
      competition: cupBefore.competition,
      round: cupBefore.round,
      final,
    },
  });

  pushCupInbox(
    state,
    `cup:progress:s${state.season}:${cupBefore.competition}:r${cupBefore.round}`,
    final ? `${definition.name} champions` : `Through in the ${definition.name}`,
    final
      ? `The club has won the ${definition.name}. Prize money of £${amount.toLocaleString()} has been added to the club accounts.`
      : `We have beaten ${clubDisplayName(state, opponent)} and progressed from ${domesticCupRoundLabel(cupBefore.competition, cupBefore.round)}. The run earns £${amount.toLocaleString()} in prize money.`,
    final ? "high" : "normal",
  );

  return posted?.amount ?? 0;
}

export function announceUserCupDrawInPlace(
  state: GameState,
  cup: DomesticCupState,
): void {
  if (cup.champion || cup.ties.some((tie) => tie.winner)) return;
  const tie = cup.ties.find(
    (candidate) =>
      isUserClubReference(state, candidate.home) || isUserClubReference(state, candidate.away),
  );
  const userBye = (cup.byes ?? []).some((club) => isUserClubReference(state, club));
  const slot = cupSlot(cup.competition, cup.round);
  if (!tie) {
    if (!userBye) return;
    pushCupInbox(
      state,
      `cup:draw:s${state.season}:${cup.competition}:r${cup.round}`,
      `${domesticCupName(cup.competition)}: bye into the next round`,
      `The club has received a bye in ${domesticCupRoundLabel(cup.competition, cup.round)} and will progress without playing a tie.`,
      "normal",
    );
    return;
  }
  const opponent = isUserClubReference(state, tie.home) ? tie.away : tie.home;
  const home = isUserClubReference(state, tie.home);
  pushCupInbox(
    state,
    `cup:draw:s${state.season}:${cup.competition}:r${cup.round}`,
    `${domesticCupName(cup.competition)} draw: ${clubDisplayName(state, opponent)}`,
    `We will face ${clubDisplayName(state, opponent)} ${home ? "at home" : "away"} in ${domesticCupRoundLabel(cup.competition, cup.round)}${slot ? `, scheduled for week ${slot.week}` : ""}.`,
    cup.round >= 5 ? "high" : "normal",
  );
}
