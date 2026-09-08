import type { GameState, TransferNegotiation } from "./types";
import { calendarDay, FRIENDLY_WEEKS, MATCHDAY_INDEX } from "./calendar";
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

function fixtureEventLabel(week: number): string {
  return FRIENDLY_WEEKS.has(week) ? "Friendly" : "League match";
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
    const absoluteDay = absoluteWeek(state.season, fixture.week) * 7 + MATCHDAY_INDEX;
    if (absoluteDay < now || absoluteDay > end) continue;
    const friendly = FRIENDLY_WEEKS.has(fixture.week);
    events.push({
      id: `fixture:${fixture.week}:${fixture.opponent}`,
      kind: "fixture",
      absoluteDay,
      week: fixture.week,
      day: MATCHDAY_INDEX,
      label: fixtureEventLabel(fixture.week),
      detail: `${fixture.home ? "Home" : "Away"} ${friendly ? "friendly" : "league fixture"}`,
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
      label: "Scouting report due",
      detail: brief.tacticalPosition ?? brief.position ?? "Player search",
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
