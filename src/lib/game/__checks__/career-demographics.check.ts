import { newGame } from "../engine";
import { runPlayerCareerRollover } from "../careers";
import { ageOf, SQUAD_SIZE } from "../recruitment";
import { buildWorldSimulationPlan } from "../world";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const clone = <T>(value: T): T => structuredClone(value);
const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function simulateCareers(seed: string): GameState {
  const state = newGame("Twenty Season FC", "Chair", seed);
  for (let season = 2; season <= 21; season++) {
    state.season = season;
    state.week = 1;
    runPlayerCareerRollover(state);
  }
  return state;
}

console.log("\n[CD1] Twenty-season deterministic replay");
{
  const a = simulateCareers("CAREER_DEMOGRAPHICS");
  const b = simulateCareers("CAREER_DEMOGRAPHICS");
  check(
    "same seed produces byte-identical detailed players after 20 rollovers",
    JSON.stringify(a.football.players) === JSON.stringify(b.football.players),
  );
  check(
    "same seed produces byte-identical contracts after 20 rollovers",
    JSON.stringify(a.football.contracts) === JSON.stringify(b.football.contracts),
  );
  check(
    "same seed produces byte-identical career history after 20 rollovers",
    JSON.stringify(a.football.transferHistory) === JSON.stringify(b.football.transferHistory) &&
      JSON.stringify(a.football.contractHistory) === JSON.stringify(b.football.contractHistory),
  );
}

console.log("\n[CD2] Long-run demographics remain football-shaped");
{
  const initial = newGame("Twenty Season FC", "Chair", "CAREER_DEMOGRAPHICS");
  const final = simulateCareers("CAREER_DEMOGRAPHICS");
  const focus = new Set(buildWorldSimulationPlan(final).focusClubIds);
  const live = final.football.players.filter(
    (player) => player.currentClubId && focus.has(player.currentClubId),
  );
  const ages = live.map((player) => ageOf(player, final.season));
  const abilities = live.map((player) => player.currentAbility);
  const initialFocus = new Set(buildWorldSimulationPlan(initial).focusClubIds);
  const initialAbilities = initial.football.players
    .filter((player) => player.currentClubId && initialFocus.has(player.currentClubId))
    .map((player) => player.currentAbility);
  const meanAge = average(ages);
  const meanAbility = average(abilities);
  const initialMeanAbility = average(initialAbilities);

  check("detailed world still has live players", live.length > 0);
  check(
    "average age remains inside a plausible senior-football band",
    meanAge >= 21 && meanAge <= 31,
    meanAge.toFixed(2),
  );
  check(
    "young players remain present after two decades",
    ages.some((age) => age <= 21),
  );
  check(
    "experienced players remain present after two decades",
    ages.some((age) => age >= 30),
  );
  check(
    "no live player exceeds the retirement hard stop",
    ages.every((age) => age < 40),
    String(Math.max(...ages)),
  );
  check(
    "ability does not inflate uncontrollably across generations",
    meanAbility <= initialMeanAbility + 10,
    `${meanAbility.toFixed(2)} vs initial ${initialMeanAbility.toFixed(2)}`,
  );
  check(
    "ability does not collapse across generations",
    meanAbility >= initialMeanAbility - 15,
    `${meanAbility.toFixed(2)} vs initial ${initialMeanAbility.toFixed(2)}`,
  );
}

console.log("\n[CD3] Focus squad populations stay bounded");
{
  const state = simulateCareers("CAREER_DEMOGRAPHICS");
  const focus = new Set(buildWorldSimulationPlan(state).focusClubIds);
  const sizes = [...focus].map((club) => ({
    club,
    size: state.football.players.filter((player) => player.currentClubId === club).length,
  }));

  check(
    "every Focus club remains at or below canonical squad capacity",
    sizes.every(({ size }) => size <= SQUAD_SIZE),
    JSON.stringify(sizes.filter(({ size }) => size > SQUAD_SIZE)),
  );
  check(
    "every Focus club retains a viable senior squad",
    sizes.every(({ size }) => size >= SQUAD_SIZE - 3),
    JSON.stringify(sizes.filter(({ size }) => size < SQUAD_SIZE - 3)),
  );
  check(
    "live contracts remain one-per-player",
    state.football.players.every((player) => {
      if (!player.currentClubId) return true;
      return (
        state.football.contracts.filter(
          (contract) =>
            contract.playerId === player.id &&
            (contract.status === "Active" || contract.status === "Expiring"),
        ).length === 1
      );
    }),
  );
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
