import type { FootballPlayer, GameState, Position } from "./types";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";

export type PlayerAttributeKey =
  | "pace"
  | "strength"
  | "stamina"
  | "agility"
  | "passing"
  | "dribbling"
  | "finishing"
  | "tackling"
  | "positioning"
  | "goalkeeping";
export type PlayerAttributes = Record<PlayerAttributeKey, number>;
export interface ScoutingAssignment {
  playerId: string;
  startedAtAbsoluteWeek: number;
  weeksObserved: number;
  lastProgressAbsoluteWeek: number;
  status: "active" | "complete";
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

const LABELS: Record<PlayerAttributeKey, string> = {
  pace: "Pace",
  strength: "Strength",
  stamina: "Stamina",
  agility: "Agility",
  passing: "Passing",
  dribbling: "Dribbling",
  finishing: "Finishing",
  tackling: "Tackling",
  positioning: "Positioning",
  goalkeeping: "Goalkeeping",
};
const KEYS = Object.keys(LABELS) as PlayerAttributeKey[];
const clamp = (n: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
function noise(player: FootballPlayer, key: string, spread: number): number {
  const raw = hashString(`${player.id}|attribute|${key}`) % (spread * 2 + 1);
  return raw - spread;
}

export function playerAttributes(player: FootballPlayer): PlayerAttributes {
  const ca = player.currentAbility;
  const positional: Record<Position, Partial<Record<PlayerAttributeKey, number>>> = {
    GK: { goalkeeping: 14, positioning: 6, finishing: -22, tackling: -8, dribbling: -8 },
    DEF: { tackling: 10, positioning: 8, strength: 6, finishing: -10, goalkeeping: -25 },
    MID: { passing: 10, dribbling: 7, stamina: 6, positioning: 4, goalkeeping: -25 },
    FWD: { finishing: 12, pace: 7, dribbling: 6, tackling: -12, goalkeeping: -25 },
  };
  const mods = positional[player.primaryPosition];
  return Object.fromEntries(
    KEYS.map((key) => [key, clamp(ca + (mods[key] ?? 0) + noise(player, key, 9))]),
  ) as PlayerAttributes;
}

export function scoutingState(state: GameState): ScoutingState {
  return state.football?.scouting ?? { assignments: [] };
}
export function scoutingAssignment(state: GameState, playerId: string): ScoutingAssignment | null {
  return scoutingState(state).assignments.find((a) => a.playerId === playerId) ?? null;
}
export function startScouting(state: GameState, playerId: string): GameState {
  const next = structuredClone(state);
  if (!next.football) return next;
  const player = next.football.players.find((p) => p.id === playerId);
  if (!player || player.currentClubId === next.clubName) return next;
  next.football.scouting ??= { assignments: [] };
  if (next.football.scouting.assignments.some((a) => a.playerId === playerId)) return next;
  const now = absoluteWeek(next.season, next.week);
  next.football.scouting.assignments.push({
    playerId,
    startedAtAbsoluteWeek: now,
    weeksObserved: 0,
    lastProgressAbsoluteWeek: now - 1,
    status: "active",
  });
  return next;
}

function scoutingSpeed(state: GameState): number {
  const dept = state.football?.department.recruitmentRating ?? 50;
  const chief = state.hiredStaff.find((s) => s.role === "Chief Scout")?.stats.scouting ?? 0;
  const scouts = state.hiredStaff.filter((s) => s.role === "Scout");
  const scoutQuality = scouts.length
    ? scouts.reduce((sum, s) => sum + s.stats.scouting, 0) / scouts.length
    : 0;
  return Math.max(1, Math.min(3, 1 + Math.floor((dept + chief + scoutQuality) / 115)));
}

function pushScoutingReport(state: GameState, player: FootballPlayer, weeks: number): void {
  const complete = weeks >= 8;
  const milestone = complete ? 8 : weeks >= 6 ? 6 : weeks >= 4 ? 4 : weeks >= 2 ? 2 : 0;
  if (!milestone) return;
  const eventKey = `scouting:${player.id}:s${state.season}:m${milestone}`;
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
      ? "Our scouting work is complete. We now have a full attribute picture, tighter valuation and personality information."
      : "We have gathered enough new information to improve the player's report. More observation will narrow the remaining uncertainty.",
    priority: "high",
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

export function progressScoutingWeekInPlace(state: GameState): void {
  if (!state.football?.scouting) return;
  const now = absoluteWeek(state.season, state.week);
  const speed = scoutingSpeed(state);
  for (const assignment of state.football.scouting.assignments) {
    if (assignment.status !== "active" || assignment.lastProgressAbsoluteWeek >= now) continue;
    const before = assignment.weeksObserved;
    assignment.weeksObserved = Math.min(8, assignment.weeksObserved + speed);
    assignment.lastProgressAbsoluteWeek = now;
    if (assignment.weeksObserved >= 8) assignment.status = "complete";
    const player = state.football.players.find((p) => p.id === assignment.playerId);
    if (!player) continue;
    for (const milestone of [2, 4, 6, 8])
      if (before < milestone && assignment.weeksObserved >= milestone)
        pushScoutingReport(state, player, milestone);
  }
}

function rangeAround(value: number, width: number): [number, number] {
  return [clamp(value - width), clamp(value + width)];
}
export function scoutingReport(state: GameState, player: FootballPlayer): ScoutingReport {
  const owned = player.currentClubId === state.clubName;
  const assignment = scoutingAssignment(state, player.id);
  const weeks = owned ? 8 : (assignment?.weeksObserved ?? 0);
  const knowledgePct = owned ? 100 : Math.min(100, Math.round((weeks / 8) * 100));
  const attrs = playerAttributes(player);
  const revealedCount = owned ? KEYS.length : Math.min(KEYS.length, 2 + Math.floor(weeks * 1.1));
  const width = weeks >= 8 ? 0 : weeks >= 6 ? 2 : weeks >= 4 ? 5 : weeks >= 2 ? 9 : 14;
  const order = [...KEYS].sort(
    (a, b) => hashString(`${player.id}|reveal|${a}`) - hashString(`${player.id}|reveal|${b}`),
  );
  const visible = new Set(order.slice(0, revealedCount));
  const attributes = KEYS.map((key): AttributeKnowledge => {
    if (!visible.has(key)) return { key, label: LABELS[key], known: false };
    if (width === 0) return { key, label: LABELS[key], known: true, exact: attrs[key] };
    const [min, max] = rangeAround(attrs[key], width);
    return { key, label: LABELS[key], known: true, min, max };
  });
  const moneyWidth = weeks >= 8 ? 0.05 : weeks >= 5 ? 0.15 : weeks >= 2 ? 0.3 : 0.5;
  return {
    playerId: player.id,
    knowledgePct,
    weeksObserved: weeks,
    complete: owned || weeks >= 8,
    attributes,
    valueRange: [
      Math.max(0, Math.round(player.marketValue * (1 - moneyWidth))),
      Math.round(player.marketValue * (1 + moneyWidth)),
    ],
    wageRange: [
      Math.max(0, Math.round(player.wageExpectation * (1 - moneyWidth))),
      Math.round(player.wageExpectation * (1 + moneyWidth)),
    ],
    personalityKnown: owned || weeks >= 7,
  };
}
