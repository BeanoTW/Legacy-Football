import type { GameState, MatchInjury, MatchPlayerStats } from "./types";
import { managerMatchStyle } from "./managerMatchStyle";
import { userMatchBench, userMatchLineup } from "./matchLineup";
import { applyMatchLoadInPlace, injuryWeeks, playerInjuryRiskMultiplier } from "./playerHealth";
import { hashString, mulberry32 } from "./rng";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function historyKey(
  state: GameState,
  fixture: GameState["fixtures"][number],
): string {
  return `${state.season}|${fixture.week}|${fixture.dayOfWeek ?? 5}|${fixture.competition ?? "league"}|${fixture.opponent}|${fixture.home}`;
}

/**
 * Auto-resolved user fixtures still represent real played matches, so they
 * must create player records too. This produces deterministic performance
 * rows from the actual settled score without running a second result engine.
 */
export function recordAutoResolvedPlayerMatch(
  state: GameState,
  fixture: GameState["fixtures"][number],
  goalsFor: number,
  goalsAgainst: number,
): void {
  const key = historyKey(state, fixture);
  if (state.playerMatchHistory?.[key]) return;

  const style = managerMatchStyle(state);
  const lineup = userMatchLineup(state, style.formation);
  if (!lineup.length) return;
  const bench = userMatchBench(state, lineup);

  const seed = [
    state.saveSeed,
    state.season,
    fixture.week,
    fixture.dayOfWeek ?? 5,
    fixture.competition ?? "league",
    fixture.opponent,
    fixture.home ? "H" : "A",
    goalsFor,
    goalsAgainst,
  ].join("|");
  const rng = mulberry32(hashString(`player-record|${seed}`));
  const outfield = lineup.filter((player) => player.role !== "GK");
  const attacking = outfield
    .slice()
    .sort((a, b) => b.ability - a.ability)
    .slice(0, Math.min(7, outfield.length));
  const scorers = new Map<string, number>();
  const assists = new Map<string, number>();

  for (let goal = 0; goal < goalsFor; goal++) {
    const scorerPool = attacking.length ? attacking : outfield;
    if (!scorerPool.length) break;
    const scorer = scorerPool[Math.floor(rng() * scorerPool.length)];
    scorers.set(scorer.playerId, (scorers.get(scorer.playerId) ?? 0) + 1);

    if (outfield.length > 1 && rng() < 0.76) {
      const creators = outfield.filter((player) => player.playerId !== scorer.playerId);
      const creator = creators[Math.floor(rng() * creators.length)];
      assists.set(creator.playerId, (assists.get(creator.playerId) ?? 0) + 1);
    }
  }

  const usedSubs = bench.slice(0, Math.min(3, bench.length, 1 + (rng() < 0.7 ? 1 : 0) + (rng() < 0.3 ? 1 : 0)));
  const offCandidates = outfield
    .slice()
    .sort(
      (a, b) =>
        (a.fitness ?? 100) - (b.fitness ?? 100) ||
        a.ability - b.ability ||
        a.playerId.localeCompare(b.playerId),
    );
  const subMinutes = usedSubs.map((_, index) => 61 + index * 8 + Math.floor(rng() * 5));
  const offById = new Map<string, number>();
  const onById = new Map<string, number>();
  usedSubs.forEach((player, index) => {
    const off = offCandidates[index];
    if (!off) return;
    offById.set(off.playerId, subMinutes[index]);
    onById.set(player.playerId, subMinutes[index]);
  });

  const resultLift = goalsFor > goalsAgainst ? 0.35 : goalsFor < goalsAgainst ? -0.28 : 0.05;
  const participants = [...lineup, ...usedSubs];
  const players: MatchPlayerStats[] = participants.map((player) => {
    const goals = scorers.get(player.playerId) ?? 0;
    const playerAssists = assists.get(player.playerId) ?? 0;
    const involvementNoise = (rng() - 0.5) * 0.5;
    const minutes = lineup.some((starter) => starter.playerId === player.playerId)
      ? offById.get(player.playerId) ?? 90
      : 90 - (onById.get(player.playerId) ?? 90);
    const rating = round2(
      clamp(
        6.15 +
          resultLift +
          goals * 0.85 +
          playerAssists * 0.45 +
          involvementNoise -
          goalsAgainst * 0.025,
        4.8,
        9.8,
      ),
    );
    const chances = goals + (player.role === "GK" ? 0 : Math.floor(rng() * 3));
    return {
      ...player,
      minutes,
      started: lineup.some((starter) => starter.playerId === player.playerId),
      goals,
      assists: playerAssists,
      chances,
      shots: chances,
      shotsOnTarget: goals,
      yellowCards: rng() < 0.13 ? 1 : 0,
      rating,
      fitnessAfter: clamp(Math.round((player.fitness ?? 100) - (minutes / 90) * 23), 0, 100),
    };
  });

  const injuries: MatchInjury[] = [];
  if (outfield.length && rng() < 0.08 * playerInjuryRiskMultiplier(state)) {
    const injured = outfield[Math.floor(rng() * outfield.length)];
    const roll = rng();
    const severity = roll < 0.55 ? "knock" : roll < 0.82 ? "minor" : roll < 0.96 ? "moderate" : "serious";
    const labels = severity === "knock"
      ? ["Bruised ankle", "Dead leg"]
      : severity === "minor"
        ? ["Calf strain", "Groin strain"]
        : severity === "moderate"
          ? ["Hamstring strain", "Knee sprain"]
          : ["Ligament injury", "Serious hamstring tear"];
    injuries.push({
      minute: 50 + Math.floor(rng() * 35),
      side: "us",
      playerId: injured.playerId,
      playerName: injured.name,
      type: labels[Math.floor(rng() * labels.length)],
      severity,
      weeksOut: injuryWeeks(severity),
    });
  }

  applyMatchLoadInPlace(state, players, injuries);

  state.playerMatchHistory = {
    ...state.playerMatchHistory,
    [key]: {
      season: state.season,
      week: fixture.week,
      opponent: fixture.opponent,
      players,
    },
  };
}
