import type { GameState, TransferNegotiation } from "./types";
import { calendarDay } from "./calendar";
import { absoluteWeek } from "./time";
import { transferAbsoluteDay } from "./transferResponses";

export type TimelineEventKind = "fixture" | "scouting" | "transfer" | "club";

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  absoluteDay: number;
  week: number;
  day: number;
  label: string;
  detail?: string;
  fixtureOpponent?: string;
  fixtureCompetition?: GameState["fixtures"][number]["competition"];
}

export function currentAbsoluteDay(state: GameState): number {
  return transferAbsoluteDay(state);
}

function seasonWeekFromAbsoluteDay(state: GameState, absoluteDay: number): { week: number; day: number } {
  const seasonStart = absoluteWeek(state.season, 1) * 7;
  const relative = Math.max(0, absoluteDay - seasonStart);
  return { week: Math.floor(relative / 7) + 1, day: relative % 7 };
}

function playerName(state: GameState, playerId: string): string {
  const player = state.football?.players.find((candidate) => candidate.id === playerId);
  if (player) return `${player.firstName} ${player.lastName}`;
  const known = state.football?.playerLifecycle?.knownPlayers.find(
    (candidate) => candidate.playerId === playerId,
  );
  return known ? `${known.firstName} ${known.lastName}` : "Player";
}

function transferEventLabel(negotiation: TransferNegotiation): string {
  switch (negotiation.stage) {
    case "enquiry":
      return "Transfer enquiry deadline";
    case "clubTalks":
      return "Club negotiation deadline";
    case "playerTalks":
      return "Player talks deadline";
    case "agreed":
    case "registration":
      return "Transfer completion deadline";
    default:
      return "Transfer deadline";
  }
}

function transferResponseLabel(negotiation: TransferNegotiation): string {
  switch (negotiation.pendingResponseKind) {
    case "enquiry":
      return "Transfer enquiry response";
    case "player":
      return "Player response due";
    case "club":
    default:
      return "Club transfer response";
  }
}

function nextDetailedScoutingMilestone(assignment: {
  startedAtAbsoluteWeek: number;
  startedAtDay?: number;
  weeksObserved: number;
}): { absoluteDay: number; label: string; milestone: "update" | "final" } {
  const startedAtDay = assignment.startedAtDay ?? assignment.startedAtAbsoluteWeek * 7;
  if (assignment.weeksObserved < 4) {
    return {
      absoluteDay: startedAtDay + 4,
      label: "Scout update due",
      milestone: "update",
    };
  }
  return {
    absoluteDay: startedAtDay + 6,
    label: "Final scout report due",
    milestone: "final",
  };
}

/**
 * Chairman-facing projection of already-scheduled club events. This is a read
 * model only: domain systems remain responsible for resolving their events.
 */
export function upcomingTimelineEvents(state: GameState, horizonDays = 42): TimelineEvent[] {
  const now = currentAbsoluteDay(state);
  const end = now + Math.max(0, horizonDays);
  const events: TimelineEvent[] = [];

  for (const fixture of state.fixtures) {
    const fixtureDay = fixture.dayOfWeek ?? 5;
    const absoluteDay = absoluteWeek(state.season, fixture.week) * 7 + fixtureDay;
    if (absoluteDay < now || absoluteDay > end) continue;
    const competition = fixture.competition ?? "league";
    events.push({
      id: `fixture:${fixture.week}:${fixtureDay}:${competition}:${fixture.opponent}`,
      kind: "fixture",
      absoluteDay,
      week: fixture.week,
      day: fixtureDay,
      label: "Matchday",
      detail: fixture.home ? "Home fixture" : "Away fixture",
      fixtureOpponent: fixture.opponent,
      fixtureCompetition: competition,
    });
  }

  for (const brief of state.football?.scoutingDiscovery?.briefs ?? []) {
    if (brief.status !== "active") continue;
    const absoluteDay = brief.dueAtDay ?? brief.createdAtAbsoluteWeek * 7 + 4;
    if (absoluteDay < now || absoluteDay > end) continue;
    const date = seasonWeekFromAbsoluteDay(state, absoluteDay);
    events.push({
      id: `scouting:${brief.id}`,
      kind: "scouting",
      absoluteDay,
      week: date.week,
      day: date.day,
      label: "Scouting search returns",
      detail: brief.tacticalPosition ?? brief.position ?? "Player search",
    });
  }

  for (const assignment of state.football?.scouting?.assignments ?? []) {
    if (assignment.status !== "active") continue;
    const milestone = nextDetailedScoutingMilestone(assignment);
    if (milestone.absoluteDay < now || milestone.absoluteDay > end) continue;
    const date = seasonWeekFromAbsoluteDay(state, milestone.absoluteDay);
    events.push({
      id: `scouting:player:${assignment.playerId}:${milestone.milestone}`,
      kind: "scouting",
      absoluteDay: milestone.absoluteDay,
      week: date.week,
      day: date.day,
      label: milestone.label,
      detail: playerName(state, assignment.playerId),
    });
  }

  for (const negotiation of state.football?.negotiations ?? []) {
    if (
      negotiation.stage === "completed" ||
      negotiation.stage === "rejected" ||
      negotiation.stage === "withdrawn"
    ) {
      continue;
    }

    if (negotiation.pendingResponseAtDay !== undefined) {
      const absoluteDay = negotiation.pendingResponseAtDay;
      if (absoluteDay >= now && absoluteDay <= end) {
        const date = seasonWeekFromAbsoluteDay(state, absoluteDay);
        events.push({
          id: `transfer:${negotiation.id}:response`,
          kind: "transfer",
          absoluteDay,
          week: date.week,
          day: date.day,
          label: transferResponseLabel(negotiation),
          detail: playerName(state, negotiation.playerId),
        });
      }
    }

    if (negotiation.stage === "registration" && negotiation.registrationDueAtDay !== undefined) {
      const absoluteDay = negotiation.registrationDueAtDay;
      if (absoluteDay >= now && absoluteDay <= end) {
        const date = seasonWeekFromAbsoluteDay(state, absoluteDay);
        events.push({
          id: `transfer:${negotiation.id}:registration`,
          kind: "transfer",
          absoluteDay,
          week: date.week,
          day: date.day,
          label: "Medical & registration complete",
          detail: playerName(state, negotiation.playerId),
        });
      }
    }

    // Existing week-granularity expiry remains the safety net for old saves and
    // stalled talks while day-level response scheduling is introduced.
    const deadlineDay = negotiation.expiresAtAbsoluteWeek * 7 + 4;
    if (deadlineDay < now || deadlineDay > end) continue;
    const date = seasonWeekFromAbsoluteDay(state, deadlineDay);
    events.push({
      id: `transfer:${negotiation.id}:deadline`,
      kind: "transfer",
      absoluteDay: deadlineDay,
      week: date.week,
      day: date.day,
      label: transferEventLabel(negotiation),
      detail: playerName(state, negotiation.playerId),
    });
  }

  return events.sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id));
}

export function timelineEventsForWeek(state: GameState, week: number): TimelineEvent[] {
  return upcomingTimelineEvents(state).filter((event) => event.week === week);
}
