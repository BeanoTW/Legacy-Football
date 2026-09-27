import type { FootballPlayer, GameState, Position } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";
import { calendarDay } from "./calendar";
import { preserveKnownPlayerInPlace } from "./playerLifecycle";
import {
  preserveScoutingCandidateProfileInPlace,
  scoutingInitialKnowledge,
  scoutingQuality,
} from "./scoutingDiscovery";
import { progressSemanticScoutingDiscoveryDayInPlace } from "./semanticScoutingSelection";
import { knownPlayerDetail } from "./knownPlayerDetail";
import { isUserClubReference } from "./clubReference";

export type PlayerAttributeCategory = "Technical" | "Mental" | "Physical";

export type PlayerAttributeKey =
  | "shortPassing"
  | "longPassing"
  | "crossing"
  | "firstTouch"
  | "dribbling"
  | "finishing"
  | "tackling"
  | "goalkeeping"
  | "positioning"
  | "decisions"
  | "vision"
  | "composure"
  | "aggression"
  | "leadership"
  | "workRate"
  | "pace"
  | "acceleration"
  | "strength"
  | "stamina"
  | "agility"
  | "jumping"
  | "balance";
export type PlayerAttributes = Record<PlayerAttributeKey, number>;

export interface ScoutingAssignment {
  playerId: string;
  startedAtAbsoluteWeek: number;
  weeksObserved: number;
  lastProgressAbsoluteWeek: number;
  status: "active" | "complete";
  startedAtDay?: number;
  lastProgressDay?: number;
}

export interface ScoutingState {
  assignments: ScoutingAssignment[];
}

export interface AttributeKnowledge {
  key: PlayerAttributeKey;
  label: string;
  exact?: number;
  min?: number;
  max?: number;
  known: boolean;
}

export interface ScoutingReport {
  playerId: string;
  knowledgePct: number;
  weeksObserved: number;
  complete: boolean;
  attributes: AttributeKnowledge[];
  valueRange?: [number, number];
  wageRange?: [number, number];
  personalityKnown: boolean;
}

declare module "./types" {
  interface RecruitmentState {
    scouting?: ScoutingState;
  }
}

export const PLAYER_ATTRIBUTE_GROUPS: Readonly<Record<PlayerAttributeCategory, readonly PlayerAttributeKey[]>> = {
  Technical: ["shortPassing", "longPassing", "crossing", "firstTouch", "dribbling", "finishing", "tackling", "goalkeeping"],
  Mental: ["positioning", "decisions", "vision", "composure", "aggression", "leadership", "workRate"],
  Physical: ["pace", "acceleration", "strength", "stamina", "agility", "jumping", "balance"],
};

export const PLAYER_ATTRIBUTE_LABELS: Record<PlayerAttributeKey, string> = {
  shortPassing: "Short passing",
  longPassing: "Long passing",
  crossing: "Crossing",
  firstTouch: "First touch",
  dribbling: "Dribbling",
  finishing: "Finishing",
  tackling: "Tackling",
  goalkeeping: "Goalkeeping",
  positioning: "Positioning",
  decisions: "Decisions",
  vision: "Vision",
  composure: "Composure",
  aggression: "Aggression",
  leadership: "Leadership",
  workRate: "Work rate",
  pace: "Pace",
  acceleration: "Acceleration",
  strength: "Strength",
  stamina: "Stamina",
  agility: "Agility",
  jumping: "Jumping",
  balance: "Balance",
};
const KEYS = (Object.keys(PLAYER_ATTRIBUTE_LABELS) as PlayerAttributeKey[]);
const clamp = (n: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const PARTIAL_REPORT_DAYS = 4;
const FULL_REPORT_DAYS = 6;

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

function noise(player: FootballPlayer, key: string, spread: number): number {
  const raw = unsignedHash(`${player.id}|attribute|${key}`) % (spread * 2 + 1);
  return raw - spread;
}

function absoluteDay(state: GameState): number {
  return absoluteWeek(state.season, state.week) * 7 + calendarDay(state);
}

export function playerAttributes(player: FootballPlayer): PlayerAttributes {
  const ca = player.currentAbility;
  const positional: Record<Position, Partial<Record<PlayerAttributeKey, number>>> = {
    GK: {
      goalkeeping: 15,
      positioning: 7,
      decisions: 5,
      composure: 5,
      jumping: 5,
      strength: 3,
      shortPassing: -3,
      longPassing: 2,
      firstTouch: -4,
      crossing: -18,
      dribbling: -12,
      finishing: -24,
      tackling: -10,
    },
    DEF: {
      tackling: 11,
      positioning: 9,
      strength: 7,
      jumping: 7,
      aggression: 5,
      workRate: 4,
      shortPassing: 1,
      longPassing: -1,
      crossing: -1,
      dribbling: -5,
      finishing: -12,
      goalkeeping: -28,
    },
    MID: {
      shortPassing: 10,
      longPassing: 7,
      firstTouch: 8,
      vision: 8,
      decisions: 5,
      dribbling: 6,
      stamina: 6,
      workRate: 5,
      positioning: 3,
      finishing: -2,
      goalkeeping: -28,
    },
    FWD: {
      finishing: 12,
      composure: 7,
      positioning: 7,
      pace: 7,
      acceleration: 7,
      dribbling: 7,
      firstTouch: 5,
      agility: 5,
      crossing: 3,
      tackling: -13,
      goalkeeping: -28,
    },
  };
  const mods = positional[player.primaryPosition];
  return Object.fromEntries(
    KEYS.map((key) => [key, clamp(ca + (mods[key] ?? 0) + noise(player, key, 9))]),
  ) as PlayerAttributes;
}

export function scoutingState(state: GameState): ScoutingState {
  return state.football?.scouting ?? { assignments: [] };
}

export function scoutingAssignment(
  state: GameState,
  playerId: string,
): ScoutingAssignment | null {
  return scoutingState(state).assignments.find((assignment) => assignment.playerId === playerId) ?? null;
}

export function startScouting(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  const player = knownPlayerDetail(next, playerId);
  if (!player || isUserClubReference(next, player.currentClubId)) return next;

  const detailed = next.football.players.find((candidate) => candidate.id === playerId);
  if (detailed) {
    preserveKnownPlayerInPlace(next, detailed, ["scouted"]);
    preserveScoutingCandidateProfileInPlace(next, detailed);
  }

  next.football.scouting ??= { assignments: [] };
  if (next.football.scouting.assignments.some((assignment) => assignment.playerId === playerId)) {
    return next;
  }
  const nowWeek = absoluteWeek(next.season, next.week);
  const nowDay = absoluteDay(next);
  const initial = scoutingInitialKnowledge(next, playerId);
  next.football.scouting.assignments.push({
    playerId,
    startedAtAbsoluteWeek: nowWeek,
    weeksObserved: initial.days,
    lastProgressAbsoluteWeek: nowWeek,
    status: initial.days >= FULL_REPORT_DAYS ? "complete" : "active",
    startedAtDay: nowDay - initial.days,
    lastProgressDay: nowDay,
  });
  return next;
}

function pushScoutingReport(state: GameState, player: FootballPlayer, days: number): void {
  const complete = days >= FULL_REPORT_DAYS;
  const milestone = complete
    ? FULL_REPORT_DAYS
    : days >= PARTIAL_REPORT_DAYS
      ? PARTIAL_REPORT_DAYS
      : 0;
  if (!milestone) return;
  const eventKey = `scouting:${player.id}:s${state.season}:d${milestone}`;
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  state.inbox.push({
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "scouting-report",
    eventKey,
    sender: state.football?.department.headOfRecruitment || "Head Scout",
    department: "Head Scout",
    category: "transfers",
    subject: complete
      ? `Final scout report: ${player.firstName} ${player.lastName}`
      : `Scout update: ${player.firstName} ${player.lastName}`,
    body: complete
      ? "Six days of scouting are complete. We now have the full player report, tighter valuation and personality information."
      : "Four days of scouting are complete. We now have a useful partial report; two more days will complete the assessment.",
    priority: "high",
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

function progressScoutingToDayInPlace(state: GameState, targetDay: number): void {
  progressSemanticScoutingDiscoveryDayInPlace(state, targetDay);
  if (!state.football?.scouting) return;
  const nowWeek = absoluteWeek(state.season, state.week);
  for (const assignment of state.football.scouting.assignments) {
    if (assignment.status !== "active") continue;
    assignment.startedAtDay ??= assignment.startedAtAbsoluteWeek * 7;
    assignment.lastProgressDay ??= assignment.startedAtDay;
    if (assignment.lastProgressDay >= targetDay) continue;
    const before = assignment.weeksObserved;
    const observed = Math.max(0, targetDay - assignment.startedAtDay);
    assignment.weeksObserved = Math.min(FULL_REPORT_DAYS, observed);
    assignment.lastProgressDay = targetDay;
    assignment.lastProgressAbsoluteWeek = nowWeek;
    const player = knownPlayerDetail(state, assignment.playerId);
    if (!player) continue;
    if (before < PARTIAL_REPORT_DAYS && assignment.weeksObserved >= PARTIAL_REPORT_DAYS) {
      pushScoutingReport(state, player, PARTIAL_REPORT_DAYS);
    }
    if (assignment.weeksObserved >= FULL_REPORT_DAYS) {
      assignment.status = "complete";
      if (before < FULL_REPORT_DAYS) pushScoutingReport(state, player, FULL_REPORT_DAYS);
    }
  }
}

export function progressScoutingDayInPlace(state: GameState): void {
  progressScoutingToDayInPlace(state, absoluteDay(state));
}

/**
 * Backwards-compatible weekly settlement hook. A direct advanceWeek call must
 * account for the unvisited days remaining in the visible week; daily callers
 * may already have reached Sunday, in which case this is naturally a no-op.
 */
export function progressScoutingWeekInPlace(state: GameState): void {
  progressScoutingToDayInPlace(state, absoluteWeek(state.season, state.week) * 7 + 6);
}

function rangeAround(value: number, width: number): [number, number] {
  return [clamp(value - width), clamp(value + width)];
}

export function scoutingReport(state: GameState, player: FootballPlayer): ScoutingReport {
  const owned = isUserClubReference(state, player.currentClubId);
  const assignment = scoutingAssignment(state, player.id);
  const initial = scoutingInitialKnowledge(state, player.id);
  const days = owned
    ? FULL_REPORT_DAYS
    : Math.max(assignment?.weeksObserved ?? 0, initial.days);
  const reportQuality = owned
    ? 100
    : initial.days > 0
      ? initial.quality
      : scoutingQuality(state);
  const knowledgePct = owned
    ? 100
    : Math.min(100, Math.round((days / FULL_REPORT_DAYS) * 100));
  const attrs = playerAttributes(player);
  const revealedCount = owned
    ? KEYS.length
    : days >= FULL_REPORT_DAYS
      ? KEYS.length
      : days >= PARTIAL_REPORT_DAYS
        ? 7
        : days > 0
          ? Math.min(4, 2 + days)
          : 0;
  const qualityFactor = 1.2 - reportQuality / 200;
  const baseWidth =
    days >= FULL_REPORT_DAYS ? 0 : days >= PARTIAL_REPORT_DAYS ? 5 : days >= 3 ? 8 : 12;
  const width =
    days >= FULL_REPORT_DAYS ? 0 : Math.max(3, Math.round(baseWidth * qualityFactor));
  const order = [...KEYS].sort(
    (a, b) => hashString(`${player.id}|reveal|${a}`) - hashString(`${player.id}|reveal|${b}`),
  );
  const visible = new Set(order.slice(0, revealedCount));
  const attributes = KEYS.map((key): AttributeKnowledge => {
    if (!visible.has(key)) return { key, label: PLAYER_ATTRIBUTE_LABELS[key], known: false };
    if (width === 0) return { key, label: LABELS[key], known: true, exact: attrs[key] };
    const [min, max] = rangeAround(attrs[key], width);
    return { key, label: LABELS[key], known: true, min, max };
  });
  const baseMoneyWidth =
    days >= FULL_REPORT_DAYS ? 0.05 : days >= PARTIAL_REPORT_DAYS ? 0.18 : days >= 3 ? 0.28 : 0.5;
  const moneyWidth =
    days >= FULL_REPORT_DAYS ? baseMoneyWidth : baseMoneyWidth * qualityFactor;
  return {
    playerId: player.id,
    knowledgePct,
    weeksObserved: days,
    complete: owned || days >= FULL_REPORT_DAYS,
    attributes,
    valueRange: [
      Math.max(0, Math.round(player.marketValue * (1 - moneyWidth))),
      Math.round(player.marketValue * (1 + moneyWidth)),
    ],
    wageRange: [
      Math.max(0, Math.round(player.wageExpectation * (1 - moneyWidth))),
      Math.round(player.wageExpectation * (1 + moneyWidth)),
    ],
    personalityKnown: owned || days >= FULL_REPORT_DAYS,
  };
}

/** Report entry point for detailed or compact known identities. */
export function scoutingReportById(state: GameState, playerId: string): ScoutingReport | null {
  const player = knownPlayerDetail(state, playerId);
  return player ? scoutingReport(state, player) : null;
}
