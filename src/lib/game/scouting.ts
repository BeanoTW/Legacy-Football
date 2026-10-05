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
import { tacticalPositionProfile } from "./positions";
import { isTransferWindowOpen } from "./calendar";

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
  Physical: ["pace", "acceleration", "strength", "stamina", "agility", "jumping", "balance"],
  Mental: ["positioning", "decisions", "vision", "composure", "aggression", "leadership", "workRate"],
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

const CATEGORY_FOR_ATTRIBUTE: Record<PlayerAttributeKey, PlayerAttributeCategory> = Object.fromEntries(
  (Object.entries(PLAYER_ATTRIBUTE_GROUPS) as [PlayerAttributeCategory, readonly PlayerAttributeKey[]][])
    .flatMap(([category, keys]) => keys.map((key) => [key, category])),
) as Record<PlayerAttributeKey, PlayerAttributeCategory>;

const DETAILED_POSITION_MODS: Partial<Record<ReturnType<typeof tacticalPositionProfile>["primary"], Partial<Record<PlayerAttributeKey, number>>>> = {
  GK: { goalkeeping: 10, positioning: 4, decisions: 3, composure: 3, jumping: 4 },
  CB: { tackling: 8, positioning: 7, strength: 6, jumping: 6, aggression: 3, pace: -3, crossing: -8, dribbling: -4 },
  LB: { crossing: 6, pace: 4, acceleration: 3, stamina: 4, workRate: 4, tackling: 3 },
  RB: { crossing: 6, pace: 4, acceleration: 3, stamina: 4, workRate: 4, tackling: 3 },
  LWB: { crossing: 8, pace: 5, acceleration: 4, stamina: 7, workRate: 5, dribbling: 3, tackling: 1 },
  RWB: { crossing: 8, pace: 5, acceleration: 4, stamina: 7, workRate: 5, dribbling: 3, tackling: 1 },
  CDM: { tackling: 7, positioning: 7, decisions: 5, shortPassing: 5, strength: 3, workRate: 4, finishing: -7 },
  CM: { shortPassing: 7, longPassing: 5, firstTouch: 4, vision: 4, decisions: 3, stamina: 4 },
  CAM: { shortPassing: 6, firstTouch: 7, vision: 8, dribbling: 5, decisions: 4, finishing: 4, tackling: -5 },
  LM: { crossing: 8, pace: 4, stamina: 4, dribbling: 4, workRate: 3 },
  RM: { crossing: 8, pace: 4, stamina: 4, dribbling: 4, workRate: 3 },
  LW: { dribbling: 8, pace: 6, acceleration: 6, agility: 5, crossing: 6, finishing: 3, tackling: -4 },
  RW: { dribbling: 8, pace: 6, acceleration: 6, agility: 5, crossing: 6, finishing: 3, tackling: -4 },
  ST: { finishing: 9, composure: 7, positioning: 7, strength: 4, jumping: 3, firstTouch: 3, crossing: -5, tackling: -6 },
};

function categoryBias(player: FootballPlayer, category: PlayerAttributeCategory): number {
  // Gives equal-OVR players different identities without changing their stored
  // ability. Bias is deliberately small enough that role remains the main signal.
  return (unsignedHash(`${player.id}|attribute-category|${category}`) % 9) - 4;
}

export function playerAttributes(player: FootballPlayer): PlayerAttributes {
  const ca = player.currentAbility;
  const positional: Record<Position, Partial<Record<PlayerAttributeKey, number>>> = {
    GK: {
      goalkeeping: 10, positioning: 5, decisions: 4, composure: 4, jumping: 3,
      shortPassing: -3, crossing: -16, dribbling: -10, finishing: -22, tackling: -8,
    },
    DEF: {
      tackling: 6, positioning: 5, strength: 4, jumping: 4, aggression: 3, workRate: 2,
      finishing: -8, goalkeeping: -25,
    },
    MID: {
      shortPassing: 5, longPassing: 3, firstTouch: 4, vision: 4, decisions: 3,
      dribbling: 3, stamina: 3, workRate: 3, goalkeeping: -25,
    },
    FWD: {
      finishing: 5, composure: 4, positioning: 4, pace: 3, acceleration: 3,
      dribbling: 3, firstTouch: 3, tackling: -8, goalkeeping: -25,
    },
  };
  const broadMods = positional[player.primaryPosition];
  const tactical = tacticalPositionProfile(player).primary;
  const roleMods = DETAILED_POSITION_MODS[tactical] ?? {};

  return Object.fromEntries(
    KEYS.map((key) => {
      const category = CATEGORY_FOR_ATTRIBUTE[key];
      return [
        key,
        clamp(
          ca +
          (broadMods[key] ?? 0) +
          (roleMods[key] ?? 0) +
          categoryBias(player, category) +
          noise(player, key, 7),
        ),
      ];
    }),
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

type ScoutingMilestoneBatch = {
  milestone: typeof PARTIAL_REPORT_DAYS | typeof FULL_REPORT_DAYS;
  players: FootballPlayer[];
};

function pushScoutingReportBatch(
  state: GameState,
  targetDay: number,
  batch: ScoutingMilestoneBatch,
): void {
  if (batch.players.length === 0) return;
  const complete = batch.milestone === FULL_REPORT_DAYS;
  const players = [...batch.players].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );
  const playerIds = players.map((player) => player.id).sort().join(",");
  const eventKey = `scouting-batch:s${state.season}:day${targetDay}:d${batch.milestone}:${playerIds}`;
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;

  const names = players.map((player) => `• ${player.firstName} ${player.lastName}`).join("\n");
  const count = players.length;
  state.inbox.push({
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "scouting-report",
    eventKey,
    sender: state.football?.department.headOfRecruitment || "Head Scout",
    department: "Head Scout",
    category: "transfers",
    subject: complete
      ? count === 1
        ? `Final scout report: ${players[0].firstName} ${players[0].lastName}`
        : `Final scout reports — ${count} players`
      : count === 1
        ? `Scout update: ${players[0].firstName} ${players[0].lastName}`
        : `Scouting update — ${count} players`,
    body: complete
      ? `Six days of scouting are complete. We now have full reports, tighter valuations and personality information.\n\n${names}`
      : `Four days of scouting are complete. These players now have useful partial reports; two more days will complete each assessment.\n\n${names}`,
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
  const partialReports: FootballPlayer[] = [];
  const finalReports: FootballPlayer[] = [];
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
      partialReports.push(player);
    }
    if (assignment.weeksObserved >= FULL_REPORT_DAYS) {
      assignment.status = "complete";
      if (before < FULL_REPORT_DAYS) finalReports.push(player);
    }
  }
  pushScoutingReportBatch(state, targetDay, { milestone: PARTIAL_REPORT_DAYS, players: partialReports });
  pushScoutingReportBatch(state, targetDay, { milestone: FULL_REPORT_DAYS, players: finalReports });
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
  const chiefScout = state.hiredStaff.find((staff) => staff.role === "Chief Scout");
  // During an open transfer window the Chief Scout becomes the quality-control
  // layer for live target reports: better chiefs narrow uncertainty faster.
  // This changes certainty only; it never changes the player's real attributes.
  const chiefWindowFactor =
    !owned && isTransferWindowOpen(state) && chiefScout
      ? Math.max(0.72, 1 - Math.max(0, chiefScout.stats.scouting - 40) / 210)
      : 1;
  const qualityFactor = (1.2 - reportQuality / 200) * chiefWindowFactor;
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
    if (width === 0) return { key, label: PLAYER_ATTRIBUTE_LABELS[key], known: true, exact: attrs[key] };
    const [min, max] = rangeAround(attrs[key], width);
    return { key, label: PLAYER_ATTRIBUTE_LABELS[key], known: true, min, max };
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
