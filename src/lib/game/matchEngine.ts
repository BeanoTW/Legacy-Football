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
    },
    opponentPlan: {
      managerId: null,
      managerName: `${opponent} staff`,
      formation: "4-4-2",
      philosophy: "Balanced",
      squadFit: 60,
      tempo: "Medium",
      pressing: "Medium",
      directness: "Medium",
    },
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

function teamStats(
  rng: () => number,
  goals: number,
  share: number,
  attackingEdge: number,
  chanceBias: number,
): MatchTeamStats {
  const chances = Math.max(goals, int(rng, 2, 5) + Math.round(attackingEdge / 9 + chanceBias * 8));
  const shots = Math.max(goals, chances + int(rng, 0, 3));
  const shotsOnTarget = Math.max(goals, Math.min(shots, Math.round(shots * (0.32 + rng() * 0.18))));
  return {
    possession: clamp(Math.round(share), 22, 78),
    territory: clamp(Math.round(share + attackingEdge * 0.35 + (rng() - 0.5) * 6), 20, 80),
    chances,
    shots,
    shotsOnTarget,
    xg: round2(Math.max(goals * 0.42, chances * (0.1 + rng() * 0.08) + goals * 0.18)),
    corners: int(rng, 0, 4),
    fouls: int(rng, 3, 8),
    yellowCards: 0,
  };
}

function enrichEvents(events: MatchEvent[], half: 1 | 2): MatchEvent[] {
  let sequence = 0;
  return events.map((event) => {
    if (event.type !== "chance" && event.type !== "goal") return event;
    const phase =
      event.type === "goal"
        ? "finalThird"
        : event.minute % 5 === 0
          ? "setPiece"
          : event.minute % 3 === 0
            ? "transition"
            : "progression";
    const zone = event.type === "goal" ? "box" : event.minute % 2 === 0 ? "attackingThird" : "box";
    const xg = event.type === "goal" ? 0.22 : round2(0.05 + (event.minute % 9) * 0.012);
    sequence += 1;
    return { ...event, phase, zone, xg, sequenceId: `h${half}-s${sequence}` };
  });
}

const actorSeed = (event: MatchEvent, salt: string) =>
  `${event.sequenceId ?? event.minute}|${salt}`
    .split("")
    .reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261);

function eventActor(
  event: MatchEvent,
  lineup: MatchLineupPlayer[],
  salt: string,
): MatchLineupPlayer | undefined {
  const outfield = lineup.filter((player) => player.role !== "GK");
  const preferred = outfield
    .filter((player) => event.type === "card" || /ST|LW|RW|AM|LM|RM|CM/.test(player.role))
    .sort((a, b) => b.ability - a.ability);
  const pool = (preferred.length ? preferred : outfield).slice(0, 7);
  return pool.length ? pool[actorSeed(event, salt) % pool.length] : undefined;
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
    const actor = eventActor(event, lineup, "actor");
    if (!actor) return event;
    const creator =
      event.type === "goal"
        ? eventActor(
            event,
            lineup.filter((player) => player.playerId !== actor.playerId),
            "creator",
          )
        : undefined;
    const text =
      event.type === "goal"
        ? event.side === "us"
          ? `GOAL — ${actor.name} finds the net${creator ? ` after ${creator.name}'s pass` : ""}!`
          : `${actor.name} scores for the opposition.`
        : event.type === "chance" && event.side === "us"
          ? `${actor.name}: ${event.text.charAt(0).toLowerCase()}${event.text.slice(1)}`
          : event.text;
    return {
      ...event,
      text,
      actorPlayerId: actor.playerId,
      actorName: actor.name,
      secondaryPlayerId: creator?.playerId,
      secondaryName: creator?.name,
    };
  });
}

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
    const playedMinutes = lineup.some((starter) => starter.playerId === player.playerId)
      ? Math.max(0, Math.min(minutes, off?.minute ?? minutes))
      : on && on.minute < minutes
        ? Math.max(0, minutes - on.minute)
        : 0;
    const rating = round2(
      clamp(
        6 +
          goals * 0.9 +
          assists * 0.5 +
          chances * 0.12 -
          yellowCards * 0.25 +
          (playedMinutes < 25 && playedMinutes > 0 ? 0.05 : 0),
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
    if (candidates.length && bench.length && rng() < 0.13 * injuryRiskMultiplier) {
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

    const desiredSubs = Math.min(
      3 - substitutions.filter((sub) => sub.side === side).length,
      bench.length - usedBench.size,
      1 + (rng() < 0.72 ? 1 : 0) + (rng() < 0.34 ? 1 : 0),
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
  const rng = matchStream(input.seedBase, input.half === 1 ? "h1.metrics" : "h2.metrics");
  const strengthEdge = input.ourStrength - input.opponentStrength;
  const possession = clamp(
    50 + strengthEdge * 0.45 + input.style.possessionBias * 100 + (rng() - 0.5) * 6,
    28,
    72,
  );
  const us = teamStats(rng, goals.usGoals, possession, strengthEdge, input.style.chanceBias);
  const them = teamStats(rng, goals.themGoals, 100 - possession, -strengthEdge, 0);
  them.possession = 100 - us.possession;
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
      ),
      input.half,
    ),
    input.userLineup ?? [],
    input.opponentLineup ?? [],
    input.userBench ?? [],
    input.opponentBench ?? [],
    input.substitutions ?? [],
  );
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
