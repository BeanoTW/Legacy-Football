import { DAY_NAMES, seasonDateForSlot, seasonMonthName } from "./calendar";
import { fromAbsoluteWeek } from "./time";
import { SUPPORTER_EVENTS, type ScheduledSupporterEvent, type SupporterEventId } from "./supporterEvents";

export type EventOutcome = "strong" | "average" | "weak";
export type EventTexturePattern =
  | "grid"
  | "script"
  | "dots"
  | "school"
  | "herringbone"
  | "quote"
  | "bunting"
  | "chevron"
  | "timeline"
  | "laurel";
export type EventBorderStyle = "solid" | "rounded" | "dashed" | "accent";
export type SarahEventRole = "organizer" | "coordinator" | "mentor" | "facilitator" | "host" | "custodian";

export const EVENT_OUTCOME_LABEL: Record<EventOutcome, string> = {
  strong: "Strong turnout",
  average: "Steady turnout",
  weak: "Quiet turnout",
};

/** Read-only presentation of the existing resolver's turnout denominator. */
export function supporterEventOutcome(event: ScheduledSupporterEvent): EventOutcome | null {
  const definition = SUPPORTER_EVENTS.find((entry) => entry.id === event.eventId);
  if (event.status !== "completed" || event.attendance == null || !definition) return null;
  const ratio = event.attendance / (80 + definition.fanGain * 50);
  return ratio >= 1.1 ? "strong" : ratio < 0.8 ? "weak" : "average";
}

export function eventDateSlot(absoluteDay: number) {
  return { ...fromAbsoluteWeek(Math.floor(absoluteDay / 7)), day: absoluteDay % 7 };
}

export function eventDateLabel(absoluteDay: number): string {
  const slot = eventDateSlot(absoluteDay);
  const date = seasonDateForSlot(slot.week, slot.day);
  return `${DAY_NAMES[slot.day]} ${date.day} ${seasonMonthName(date.month)} · S${slot.season}`;
}

export interface EventVisualDefinition {
  category: string;
  motif: "pitch" | "signing" | "coaching" | "school" | "tools" | "forum" | "festival" | "shirt" | "archive" | "trophy";
  tone: string;
  texturePattern: EventTexturePattern;
  borderStyle: EventBorderStyle;
  sarahMalikRole?: SarahEventRole;
}

export const EVENT_VISUALS: Record<SupporterEventId, EventVisualDefinition> = {
  "open-training": {
    category: "Inside the club", motif: "pitch", tone: "text-primary", texturePattern: "grid", borderStyle: "solid", sarahMalikRole: "organizer",
  },
  "meet-team": {
    category: "Squad & supporters", motif: "signing", tone: "text-chart-4", texturePattern: "script", borderStyle: "rounded", sarahMalikRole: "coordinator",
  },
  "kids-coaching": {
    category: "Grassroots football", motif: "coaching", tone: "text-income", texturePattern: "dots", borderStyle: "dashed", sarahMalikRole: "mentor",
  },
  "school-visits": {
    category: "Next generation", motif: "school", tone: "text-chart-1", texturePattern: "school", borderStyle: "solid", sarahMalikRole: "facilitator",
  },
  "volunteer-ground": {
    category: "Our ground", motif: "tools", tone: "text-chart-2", texturePattern: "herringbone", borderStyle: "solid", sarahMalikRole: "coordinator",
  },
  "supporters-evening": {
    category: "Supporter voices", motif: "forum", tone: "text-chart-5", texturePattern: "quote", borderStyle: "rounded", sarahMalikRole: "facilitator",
  },
  "family-day": {
    category: "A club for everyone", motif: "festival", tone: "text-chart-4", texturePattern: "bunting", borderStyle: "rounded", sarahMalikRole: "host",
  },
  "preseason-launch": {
    category: "A new season", motif: "shirt", tone: "text-primary", texturePattern: "chevron", borderStyle: "accent", sarahMalikRole: "coordinator",
  },
  "heritage-day": {
    category: "Club history", motif: "archive", tone: "text-chart-2", texturePattern: "timeline", borderStyle: "solid",
  },
  "legends-day": {
    category: "Former favourites", motif: "trophy", tone: "text-chart-5", texturePattern: "laurel", borderStyle: "accent", sarahMalikRole: "custodian",
  },
};
