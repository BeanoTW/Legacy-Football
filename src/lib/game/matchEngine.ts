import type {
  GameState,
  MatchEngineSnapshot,
  MatchEvent,
  MatchHalfSnapshot,
  MatchLineupPlayer,
  MatchPlayerStats,
  MatchSubstitution,
  MatchInjury,
  MatchTeamPlan,
  MatchTeamStats,
  TacticalPosition,
} from "./types";
import type { ManagerMatchStyle } from "./managerMatchStyle";
import { managerMatchPrep } from "./managerMatchPrep";
import { halfGoals, halfPresentation, matchStream } from "./matchday";
import { opponentMatchBench, opponentMatchLineup, userMatchBench, userMatchLineup } from "./matchLineup";
import { injuryWeeks } from "./playerHealth";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;
const int = (rng: () => number, min: number, max: number) =>
  Math.floor(min + rng() * (max - min + 1));

/**
 * Deterministic 0-1 value from a string. Presentation choices use this
 * rather than the seeded streams, so adding detail never shifts the streams
 * that decide scores, cards or substitutions.
 */
function hashUnit(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

function weightedPick<T>(items: T[], weight: (item: T) => number, roll: number): T | undefined {
  const weights = items.map((item) => Math.max(0, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return items[0];
  let cursor = roll * total;
  for (let i = 0; i < items.length; i += 1) {
    cursor -= weights[i];
    if (cursor <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* ------------------------------------------------------------------ */
/* Opponent identity                                                   */
/* ------------------------------------------------------------------ */

const OPPONENT_STYLES: ReadonlyArray<Pick<MatchTeamPlan, "philosophy" | "tempo" | "pressing" | "directness">> = [
  { philosophy: "Balanced", tempo: "Medium", pressing: "Medium", directness: "Medium" },
  { philosophy: "Direct", tempo: "High", pressing: "Medium", directness: "High" },
  { philosophy: "Possession", tempo: "Low", pressing: "Medium", directness: "Low" },
  { philosophy: "Defensive", tempo: "Low", pressing: "Low", directness: "High" },
  { philosophy: "Front-foot", tempo: "High", pressing: "High", directness: "Medium" },
  { philosophy: "Balanced", tempo: "Medium", pressing: "High", directness: "Medium" },
];

/**
 * Every opponent now has a recognisable way of playing, fixed per club so
 * the same side feels the same each time you meet them. Presentation only:
 * scores are still decided by strength and your manager's style.
 */
export function opponentMatchPlan(opponent: string): MatchTeamPlan {
  const style = OPPONENT_STYLES[Math.floor(hashUnit(`opponent-style|${opponent}`) * OPPONENT_STYLES.length)];
  return {
    managerId: null,
    managerName: `${opponent} staff`,
    formation: "4-4-2",
    squadFit: 60,
    rotation: "Medium",
    ...style,
  };
}

export function createMatchEngineSnapshot(
  state: GameState,
  style: ManagerMatchStyle,
  opponent: string,
): MatchEngineSnapshot {
  const prep = managerMatchPrep(state);
  const userLineup = userMatchLineup(state, style.formation);
  const opponentLineup = opponentMatchLineup(state, opponent);
  const userBench = userMatchBench(state, userLineup);
  const opponentBench = opponentMatchBench(state, opponent, opponentLineup);
  return {
    version: 1,
    userPlan: {
      managerId: prep.managerId,
      managerName: prep.managerName,
      formation: style.formation,
      philosophy: style.philosophy,
      squadFit: prep.squadFitScore,
      tempo: style.tempo,
      pressing: style.pressing,
      directness: style.directness,
      rotation: prep.rotation,
    },
    opponentPlan: opponentMatchPlan(opponent),
    halves: [],
    userLineup,
    opponentLineup,
    userBench,
    opponentBench,
    substitutions: [],
    injuries: [],
    playerStats: playerStats(userLineup, [], 0, userBench, []),
  };
}

/* ------------------------------------------------------------------ */
/* Team statistics                                                     */
/* ------------------------------------------------------------------ */

function teamStats(
  rng: () => number,
  goals: number,
  share: number,
  attackingEdge: number,
  chanceBias: number,
  featured: { shots: number; onTarget: number; xg: number },
): MatchTeamStats {
  // Same draws as before, in the same order; the highlights now act as a floor
  // so the numbers never contradict the events the viewer has watched.
  // Original draw order: chances, shots, accuracy, then (object order) territory, xG, corners, fouls.
  const rolledChances = int(rng, 2, 5) + Math.round(attackingEdge / 9 + chanceBias * 8);
  const extraShots = int(rng, 0, 3);
  const accuracy = 0.32 + rng() * 0.18;
  const territoryNoise = (rng() - 0.5) * 6;
  const xgRate = 0.1 + rng() * 0.08;
  const corners = int(rng, 0, 4);
  const fouls = int(rng, 3, 8);

  const chances = Math.max(goals, featured.shots, rolledChances);
  const shots = Math.max(chances + extraShots, featured.shots);
  const shotsOnTarget = clamp(Math.max(featured.onTarget, Math.round(shots * accuracy)), goals, shots);
  // Unseen shots are low-value efforts; the featured chances carry their own xG.
  const unseenShots = Math.max(0, shots - featured.shots);
  const xg = round2(featured.xg + unseenShots * xgRate * 0.55);
  return {
    possession: clamp(Math.round(share), 22, 78),
    territory: clamp(Math.round(share + attackingEdge * 0.35 + territoryNoise), 20, 80),
    chances,
    shots,
    shotsOnTarget,
    xg: Math.max(xg, round2(goals * 0.3)),
    corners,
    fouls,
    yellowCards: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Event detail: phase, zone and xG                                    */
/* ------------------------------------------------------------------ */

type Phase = NonNullable<MatchEvent["phase"]>;
type PlanLike = Pick<MatchTeamPlan, "philosophy" | "pressing" | "directness" | "tempo">;

/** How a team's goals and chances tend to arrive, by style. */
function phaseWeights(plan: PlanLike | undefined, goal: boolean): Record<Phase, number> {
  const weights: Record<Phase, number> = goal
    ? { buildUp: 0.06, progression: 0.24, finalThird: 0.26, transition: 0.16, setPiece: 0.28 }
    : { buildUp: 0.1, progression: 0.3, finalThird: 0.22, transition: 0.16, setPiece: 0.22 };
  if (!plan) return weights;
  if (plan.pressing === "High") weights.transition += 0.14;
  if (plan.philosophy === "Defensive") {
    weights.transition += 0.18;
    weights.setPiece += 0.06;
  }
  if (plan.philosophy === "Possession" || plan.directness === "Low") {
    weights.buildUp += 0.06;
    weights.finalThird += 0.08;
    weights.transition -= 0.06;
  }
  if (plan.philosophy === "Direct" || plan.directness === "High") {
    weights.progression += 0.12;
    weights.setPiece += 0.04;
  }
  if (plan.philosophy === "Front-foot" || plan.tempo === "High") weights.finalThird += 0.06;
  return weights;
}

function enrichEvents(
  events: MatchEvent[],
  half: 1 | 2,
  userPlan: PlanLike | undefined,
  opponentPlan: PlanLike | undefined,
): MatchEvent[] {
  let sequence = 0;
  return events.map((event, index) => {
    if (event.type !== "chance" && event.type !== "goal") return event;
    sequence += 1;
    const key = `${half}|${index}|${event.minute}|${event.side}|${event.type}`;
    const goal = event.type === "goal";
    const plan = event.side === "us" ? userPlan : event.side === "them" ? opponentPlan : undefined;
    const weights = phaseWeights(plan, goal);
    const phases = Object.keys(weights) as Phase[];
    // Commentary that already names a dead ball decides the phase.
    const namedSetPiece = /corner|free-kick|penalty/i.test(event.text);
    const phase = namedSetPiece
      ? "setPiece"
      : weightedPick(phases, (item) => weights[item], hashUnit(`${key}|phase`)) ?? "progression";

    const zoneRoll = hashUnit(`${key}|zone`);
    const zone: NonNullable<MatchEvent["zone"]> = goal
      ? zoneRoll < 0.88
        ? "box"
        : "attackingThird"
      : zoneRoll < 0.58
        ? "box"
        : "attackingThird";

    // xG from the kind of chance, not the minute on the clock.
    const quality = hashUnit(`${key}|xg`);
    const base =
      zone === "attackingThird"
        ? 0.03 + quality * 0.06
        : phase === "transition"
          ? 0.14 + quality * 0.34
          : phase === "setPiece"
            ? 0.07 + quality * 0.22
            : 0.08 + quality * 0.3;
    const xg = round2(goal ? Math.max(0.06, base) : base * 0.8);
    return { ...event, phase, zone, xg, sequenceId: `h${half}-s${sequence}` };
  });
}

/* ------------------------------------------------------------------ */
/* Who scores, who creates                                             */
/* ------------------------------------------------------------------ */

const SCORER_WEIGHT: Record<TacticalPosition, number> = {
  ST: 6,
  CAM: 3.2,
  LW: 3.4,
  RW: 3.4,
  LM: 2,
  RM: 2,
  CM: 1.4,
  CDM: 0.5,
  LB: 0.45,
  RB: 0.45,
  LWB: 0.6,
  RWB: 0.6,
  CB: 0.35,
  GK: 0,
};
const SET_PIECE_SCORER: Partial<Record<TacticalPosition, number>> = { CB: 3.2, ST: 4.5, CDM: 1.2 };

const CREATOR_WEIGHT: Record<TacticalPosition, number> = {
  CAM: 4,
  LW: 3,
  RW: 3,
  LM: 2.6,
  RM: 2.6,
  CM: 2.5,
  LWB: 2.2,
  RWB: 2.2,
  LB: 1.8,
  RB: 1.8,
  ST: 1.5,
  CDM: 1,
  CB: 0.3,
  GK: 0.05,
};
const SET_PIECE_TAKER = new Set<TacticalPosition>(["CAM", "LW", "RW", "LM", "RM", "CM"]);

const CARD_WEIGHT: Record<TacticalPosition, number> = {
  CDM: 3,
  CB: 2.6,
  CM: 2,
  LB: 1.8,
  RB: 1.8,
  LWB: 1.6,
  RWB: 1.6,
  LM: 1.2,
  RM: 1.2,
  CAM: 1,
  LW: 0.9,
  RW: 0.9,
  ST: 1.1,
  GK: 0.2,
};

function abilityFactor(player: MatchLineupPlayer, lineup: MatchLineupPlayer[]): number {
  const average = lineup.reduce((sum, p) => sum + p.ability, 0) / Math.max(1, lineup.length);
  return Math.exp((player.ability - average) / 9);
}

const eventKey = (event: MatchEvent) => `${event.sequenceId ?? event.minute}|${event.side}|${event.type}|${event.minute}`;

function eventActor(event: MatchEvent, lineup: MatchLineupPlayer[]): MatchLineupPlayer | undefined {
  const outfield = lineup.filter((player) => player.role !== "GK");
  if (!outfield.length) return undefined;
  const roll = hashUnit(`${eventKey(event)}|actor`);
  if (event.type === "card") {
    return weightedPick(outfield, (player) => CARD_WEIGHT[player.role] ?? 1, roll);
  }
  const setPiece = event.phase === "setPiece";
  return weightedPick(
    outfield,
    (player) =>
      (setPiece ? SET_PIECE_SCORER[player.role] ?? SCORER_WEIGHT[player.role] * 0.6 : SCORER_WEIGHT[player.role] ?? 1) *
      abilityFactor(player, outfield),
    roll,
  );
}

function eventCreator(event: MatchEvent, lineup: MatchLineupPlayer[], actor: MatchLineupPlayer): MatchLineupPlayer | undefined {
  const others = lineup.filter((player) => player.playerId !== actor.playerId);
  if (!others.length) return undefined;
  // Some goals are solo efforts, penalties or scrambles with no clean assist.
  if (hashUnit(`${eventKey(event)}|assisted`) > (event.phase === "setPiece" ? 0.82 : 0.78)) return undefined;
  const roll = hashUnit(`${eventKey(event)}|creator`);
  if (event.phase === "setPiece") {
    const takers = others.filter((player) => SET_PIECE_TAKER.has(player.role));
    if (takers.length) {
      // The club's set-piece taker is its most gifted creator, most of the time.
      const best = [...takers].sort((a, b) => CREATOR_WEIGHT[b.role] * b.ability - CREATOR_WEIGHT[a.role] * a.ability)[0];
      return roll < 0.7 ? best : weightedPick(takers, (player) => CREATOR_WEIGHT[player.role], hashUnit(`${eventKey(event)}|taker`));
    }
  }
  return weightedPick(others, (player) => (CREATOR_WEIGHT[player.role] ?? 1) * abilityFactor(player, others), roll);
}

function activeLineupAtMinute(
  starters: MatchLineupPlayer[],
  bench: MatchLineupPlayer[],
  substitutions: MatchSubstitution[],
  side: "us" | "them",
  minute: number,
): MatchLineupPlayer[] {
  const active = new Map(starters.map((player) => [player.playerId, player]));
  for (const sub of substitutions
    .filter((item) => item.side === side && item.minute <= minute)
    .sort((a, b) => a.minute - b.minute)) {
    active.delete(sub.playerOffId);
    const incoming = bench.find((player) => player.playerId === sub.playerOnId);
    if (incoming) active.set(incoming.playerId, incoming);
  }
  return [...active.values()];
}

function setPieceLabel(event: MatchEvent): string {
  const roll = hashUnit(`${eventKey(event)}|set-piece-kind`);
  return roll < 0.55 ? "corner" : roll < 0.85 ? "free-kick" : "penalty";
}

function linkEventActors(
  events: MatchEvent[],
  userLineup: MatchLineupPlayer[],
  opponentLineup: MatchLineupPlayer[],
  userBench: MatchLineupPlayer[] = [],
  opponentBench: MatchLineupPlayer[] = [],
  substitutions: MatchSubstitution[] = [],
): MatchEvent[] {
  return events.map((event) => {
    if (event.type !== "chance" && event.type !== "goal" && event.type !== "card") return event;
    const lineup =
      event.side === "us"
        ? activeLineupAtMinute(userLineup, userBench, substitutions, "us", event.minute)
        : event.side === "them"
          ? activeLineupAtMinute(opponentLineup, opponentBench, substitutions, "them", event.minute)
          : [];
    const actor = eventActor(event, lineup);
    if (!actor) return event;
    const creator = event.type === "goal" ? eventCreator(event, lineup, actor) : undefined;
    const setPiece = event.type === "goal" && event.phase === "setPiece" ? setPieceLabel(event) : null;
    const penalty = setPiece === "penalty";
    const how =
      penalty
        ? " from the penalty spot"
        : setPiece === "corner"
          ? creator
            ? ` from ${creator.name}'s corner`
            : " from a corner"
          : setPiece === "free-kick"
            ? creator
              ? ` from ${creator.name}'s free-kick`
              : " direct from a free-kick"
            : event.phase === "transition"
              ? creator
                ? ` on the break after ${creator.name}'s pass`
                : " on the break"
              : creator
                ? ` after ${creator.name}'s pass`
                : "";
    const text =
      event.type === "goal"
        ? event.side === "us"
          ? `GOAL — ${actor.name} finds the net${how}!`
          : `${actor.name} scores for the opposition${how}.`
        : event.type === "chance" && event.side === "us"
          ? `${actor.name}: ${event.text.charAt(0).toLowerCase()}${event.text.slice(1)}`
          : event.type === "card"
            ? `Yellow card for ${actor.name}.`
            : event.text;
    return {
      ...event,
      text,
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      // Penalties have no assist.
      secondaryPlayerId: penalty ? undefined : creator?.playerId,
      secondaryName: penalty ? undefined : creator?.name,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Player ratings                                                      */
/* ------------------------------------------------------------------ */

const DEFENSIVE_ROLES = new Set<TacticalPosition>(["CB", "LB", "RB", "LWB", "RWB", "CDM"]);

function playerStats(
  lineup: MatchLineupPlayer[],
  events: MatchEvent[],
  minutes: number,
  bench: MatchLineupPlayer[] = [],
  substitutions: MatchSubstitution[] = [],
): MatchPlayerStats[] {
  const usedBenchIds = new Set(
    substitutions.filter((sub) => sub.side === "us").map((sub) => sub.playerOnId),
  );
  const participants = [
    ...lineup,
    ...bench.filter((player) => usedBenchIds.has(player.playerId)),
  ];
  const goalsFor = events.filter((event) => event.type === "goal" && event.side === "us").length;
  const goalsAgainst = events.filter((event) => event.type === "goal" && event.side === "them");
  const resultSwing = minutes >= 90 ? (goalsFor > goalsAgainst.length ? 0.35 : goalsFor < goalsAgainst.length ? -0.3 : 0) : 0;

  return participants.map((player) => {
    const involved = events.filter((event) => event.actorPlayerId === player.playerId);
    const assists = events.filter((event) => event.secondaryPlayerId === player.playerId && event.type === "goal").length;
    const goals = involved.filter((event) => event.type === "goal").length;
    const chances = involved.filter((event) => event.type === "chance").length;
    const yellowCards = involved.filter((event) => event.type === "card").length;
    const off = substitutions
      .filter((sub) => sub.side === "us" && sub.playerOffId === player.playerId)
      .sort((a, b) => a.minute - b.minute)[0];
    const on = substitutions
      .filter((sub) => sub.side === "us" && sub.playerOnId === player.playerId)
      .sort((a, b) => a.minute - b.minute)[0];
    const started = lineup.some((starter) => starter.playerId === player.playerId);
    const fromMinute = started ? 0 : on?.minute ?? minutes;
    const toMinute = started ? Math.min(minutes, off?.minute ?? minutes) : minutes;
    const playedMinutes = Math.max(0, toMinute - fromMinute);

    // Defenders and keepers answer for goals conceded while they were on.
    const conceded = goalsAgainst.filter((event) => event.minute > fromMinute && event.minute <= toMinute).length;
    const defensive = player.role === "GK" ? 1.2 : DEFENSIVE_ROLES.has(player.role) ? 1 : 0.35;
    const cleanSheet = minutes >= 90 && playedMinutes >= 60 && conceded === 0 ? (player.role === "GK" ? 0.6 : DEFENSIVE_ROLES.has(player.role) ? 0.45 : 0.1) : 0;
    // A small, stable per-player spread so an ordinary afternoon isn't a row of 6.0s.
    const spread = playedMinutes > 0 ? (hashUnit(`rating|${player.playerId}|${events.length}|${minutes}`) - 0.5) * 0.7 : 0;
    const share = playedMinutes / Math.max(1, minutes || 90);

    const rating = round2(
      clamp(
        6.2 +
          goals * 0.9 +
          assists * 0.55 +
          chances * 0.12 -
          yellowCards * 0.25 -
          conceded * 0.28 * defensive +
          cleanSheet +
          resultSwing * share +
          spread,
        4.5,
        10,
      ),
    );
    const startingFitness = player.fitness ?? 100;
    const fitnessAfter = clamp(
      Math.round(startingFitness - (playedMinutes / 90) * 23),
      0,
      100,
    );
    return {
      ...player,
      minutes: playedMinutes,
      started,
      goals,
      assists,
      chances,
      shots: goals + chances,
      shotsOnTarget: goals,
      yellowCards,
      rating,
      fitnessAfter,
    };
  });
}

export function refreshPlayerMatchStats(engine: MatchEngineSnapshot, events: MatchEvent[]): void {
  engine.playerStats = playerStats(
    engine.userLineup ?? [],
    events,
    engine.halves.length * 45,
    engine.userBench ?? [],
    engine.substitutions ?? [],
  );
}

/* ------------------------------------------------------------------ */
/* Second-half management (unchanged)                                  */
/* ------------------------------------------------------------------ */

const broadUnit = (role: MatchLineupPlayer["role"]) =>
  role === "GK"
    ? "GK"
    : ["RB", "CB", "LB", "RWB", "LWB"].includes(role)
      ? "DEF"
      : ["CDM", "CM", "CAM", "RM", "LM", "RW", "LW"].includes(role)
        ? "MID"
        : "FWD";

function replacementFor(
  off: MatchLineupPlayer,
  bench: MatchLineupPlayer[],
  used: Set<string>,
): MatchLineupPlayer | undefined {
  const available = bench.filter((player) => !used.has(player.playerId));
  return (
    available
      .filter((player) => broadUnit(player.role) === broadUnit(off.role))
      .sort((a, b) => b.ability - a.ability)[0] ??
    available
      .filter((player) => player.role !== "GK" && off.role !== "GK")
      .sort((a, b) => b.ability - a.ability)[0]
  );
}

/**
 * Deterministic manager decisions between 46' and 90': fatigue/tactical subs
 * plus a low-frequency injury event. The result RNG remains isolated.
 */
export function prepareSecondHalfManagement(
  engine: MatchEngineSnapshot,
  seedBase: string,
  injuryRiskMultiplier = 1,
): MatchEvent[] {
  if ((engine.substitutions?.length ?? 0) > 0 || (engine.injuries?.length ?? 0) > 0) {
    return [];
  }
  const rng = matchStream(seedBase, "h2.management");
  const substitutions: MatchSubstitution[] = [];
  const injuries: MatchInjury[] = [];
  const events: MatchEvent[] = [];

  const planSide = (
    side: "us" | "them",
    starters: MatchLineupPlayer[],
    bench: MatchLineupPlayer[],
  ) => {
    const usedBench = new Set<string>();
    const alreadyOff = new Set<string>();
    const candidates = starters
      .filter((player) => player.role !== "GK")
      .slice()
      .sort(
        (a, b) =>
          (a.fitness ?? 100) - (b.fitness ?? 100) ||
          a.ability - b.ability ||
          a.playerId.localeCompare(b.playerId),
      );

    // Match injuries are deliberately uncommon but materially persistent.
    // Congested schedules matter indirectly through accumulated fitness: a tired
    // group carries a modest extra soft-tissue risk rather than a binary penalty.
    const averageFitness = candidates.length
      ? candidates.reduce((sum, player) => sum + (player.fitness ?? 100), 0) / candidates.length
      : 100;
    const fatigueRisk = 1 + Math.max(0, 78 - averageFitness) * 0.012;
    if (candidates.length && bench.length && rng() < 0.13 * injuryRiskMultiplier * fatigueRisk) {
      const injured = candidates[Math.floor(rng() * Math.min(candidates.length, 6))];
      const replacement = replacementFor(injured, bench, usedBench);
      if (replacement) {
        const minute = int(rng, 51, 78);
        const roll = rng();
        const severity = roll < 0.5 ? "knock" : roll < 0.78 ? "minor" : roll < 0.94 ? "moderate" : "serious";
        const types = severity === "knock"
          ? ["Bruised ankle", "Dead leg"]
          : severity === "minor"
            ? ["Calf strain", "Groin strain", "Twisted ankle"]
            : severity === "moderate"
              ? ["Hamstring strain", "Knee sprain"]
              : ["Ligament injury", "Serious hamstring tear"];
        const type = types[Math.floor(rng() * types.length)];
        injuries.push({
          minute,
          side,
          playerId: injured.playerId,
          playerName: injured.name,
          type,
          severity,
          weeksOut: injuryWeeks(severity),
        });
        substitutions.push({
          minute,
          side,
          playerOffId: injured.playerId,
          playerOffName: injured.name,
          playerOnId: replacement.playerId,
          playerOnName: replacement.name,
          reason: "injury",
        });
        usedBench.add(replacement.playerId);
        alreadyOff.add(injured.playerId);
        events.push({
          minute,
          type: "injury",
          side,
          text: `${injured.name} cannot continue after a ${type.toLowerCase()}.`,
          actorPlayerId: injured.playerId,
          actorName: injured.name,
          sequenceId: `h2-injury-${side}-${minute}`,
        });
        events.push({
          minute,
          type: "sub",
          side,
          text: `${replacement.name} replaces ${injured.name}.`,
          actorPlayerId: injured.playerId,
          actorName: injured.name,
          secondaryPlayerId: replacement.playerId,
          secondaryName: replacement.name,
          sequenceId: `h2-sub-${side}-${minute}-injury`,
        });
      }
    }

    const rotation =
      side === "us" ? engine.userPlan.rotation ?? "Medium" : engine.opponentPlan.rotation ?? "Medium";
    const secondSubChance = rotation === "High" ? 0.9 : rotation === "Low" ? 0.5 : 0.72;
    const thirdSubChance = rotation === "High" ? 0.58 : rotation === "Low" ? 0.18 : 0.34;
    const desiredSubs = Math.min(
      3 - substitutions.filter((sub) => sub.side === side).length,
      bench.length - usedBench.size,
      1 + (rng() < secondSubChance ? 1 : 0) + (rng() < thirdSubChance ? 1 : 0),
    );
    for (let i = 0; i < desiredSubs; i++) {
      const off = candidates.find((player) => !alreadyOff.has(player.playerId));
      if (!off) break;
      const incoming = replacementFor(off, bench, usedBench);
      if (!incoming) break;
      const minute = Math.min(84, 58 + i * 9 + int(rng, 0, 5));
      const reason = (off.fitness ?? 100) < 78 || i > 0 ? "fatigue" : "tactical";
      substitutions.push({
        minute,
        side,
        playerOffId: off.playerId,
        playerOffName: off.name,
        playerOnId: incoming.playerId,
        playerOnName: incoming.name,
        reason,
      });
      usedBench.add(incoming.playerId);
      alreadyOff.add(off.playerId);
      events.push({
        minute,
        type: "sub",
        side,
        text:
          reason === "fatigue"
            ? `${incoming.name} replaces the tiring ${off.name}.`
            : `${incoming.name} comes on for ${off.name}.`,
        actorPlayerId: off.playerId,
        actorName: off.name,
        secondaryPlayerId: incoming.playerId,
        secondaryName: incoming.name,
        sequenceId: `h2-sub-${side}-${minute}-${i}`,
      });
    }
  };

  planSide("us", engine.userLineup ?? [], engine.userBench ?? []);
  planSide("them", engine.opponentLineup ?? [], engine.opponentBench ?? []);
  engine.substitutions = substitutions.sort((a, b) => a.minute - b.minute);
  engine.injuries = injuries.sort((a, b) => a.minute - b.minute);
  return events.sort((a, b) => a.minute - b.minute || (a.type === "injury" ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Half simulation                                                     */
/* ------------------------------------------------------------------ */

function featuredShots(events: MatchEvent[], side: "us" | "them") {
  const shots = events.filter((event) => event.side === side && (event.type === "chance" || event.type === "goal"));
  const saved = shots.filter((event) => event.type === "chance" && /save|smother|tipped|parried/i.test(event.text)).length;
  return {
    shots: shots.length,
    onTarget: shots.filter((event) => event.type === "goal").length + saved,
    xg: round2(shots.reduce((sum, event) => sum + (event.xg ?? 0), 0)),
  };
}

/**
 * The single deterministic half-match contract. Score RNG stays isolated from
 * metrics and presentation, so richer views can evolve without moving results.
 */
export function simulateMatchHalf(input: {
  seedBase: string;
  half: 1 | 2;
  fromMinute: number;
  toMinute: number;
  ourStrength: number;
  opponentStrength: number;
  opponentName: string;
  style: ManagerMatchStyle;
  userLineup?: MatchLineupPlayer[];
  opponentLineup?: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
}): { snapshot: MatchHalfSnapshot; events: MatchEvent[] } {
  const goals = halfGoals(
    input.seedBase,
    input.half,
    input.ourStrength,
    input.opponentStrength,
    input.style.attackModifier,
    input.style.defenseModifier,
  );
  const strengthEdge = input.ourStrength - input.opponentStrength;
  // The stronger side features in more of the highlights.
  const usChanceShare = clamp(0.5 + strengthEdge * 0.012 + input.style.chanceBias * 0.5, 0.28, 0.72);
  const events = linkEventActors(
    enrichEvents(
      halfPresentation(
        input.seedBase,
        input.half,
        input.fromMinute,
        input.toMinute,
        goals.usGoals,
        goals.themGoals,
        input.opponentName,
        input.style,
        usChanceShare,
      ),
      input.half,
      input.style,
      opponentMatchPlan(input.opponentName),
    ),
    input.userLineup ?? [],
    input.opponentLineup ?? [],
    input.userBench ?? [],
    input.opponentBench ?? [],
    input.substitutions ?? [],
  );

  const rng = matchStream(input.seedBase, input.half === 1 ? "h1.metrics" : "h2.metrics");
  const possession = clamp(
    50 + strengthEdge * 0.45 + input.style.possessionBias * 100 + (rng() - 0.5) * 6,
    28,
    72,
  );
  const us = teamStats(rng, goals.usGoals, possession, strengthEdge, input.style.chanceBias, featuredShots(events, "us"));
  const them = teamStats(rng, goals.themGoals, 100 - possession, -strengthEdge, 0, featuredShots(events, "them"));
  them.possession = 100 - us.possession;
  us.yellowCards = events.filter((event) => event.type === "card" && event.side === "us").length;
  them.yellowCards = events.filter(
    (event) => event.type === "card" && event.side === "them",
  ).length;
  return { snapshot: { half: input.half, ...goals, us, them }, events };
}

export function totalMatchStats(
  engine: MatchEngineSnapshot | undefined,
): { us: MatchTeamStats; them: MatchTeamStats } | null {
  if (!engine?.halves.length) return null;
  const total = (side: "us" | "them"): MatchTeamStats => {
    const halves = engine.halves.map((half) => half[side]);
    const weight = halves.length;
    return {
      possession: Math.round(halves.reduce((sum, stats) => sum + stats.possession, 0) / weight),
      territory: Math.round(halves.reduce((sum, stats) => sum + stats.territory, 0) / weight),
      chances: halves.reduce((sum, stats) => sum + stats.chances, 0),
      shots: halves.reduce((sum, stats) => sum + stats.shots, 0),
      shotsOnTarget: halves.reduce((sum, stats) => sum + stats.shotsOnTarget, 0),
      xg: round2(halves.reduce((sum, stats) => sum + stats.xg, 0)),
      corners: halves.reduce((sum, stats) => sum + stats.corners, 0),
      fouls: halves.reduce((sum, stats) => sum + stats.fouls, 0),
      yellowCards: halves.reduce((sum, stats) => sum + stats.yellowCards, 0),
    };
  };
  return { us: total("us"), them: total("them") };
}