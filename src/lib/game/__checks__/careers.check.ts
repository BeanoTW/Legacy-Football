/* Career lifecycle verification — deterministic ageing, retirement and intake.
   Run with: bun src/lib/game/__checks__/careers.check.ts
*/
import { newGame } from "../engine";
import { runPlayerCareerRollover } from "../careers";
import { ageOf, FREE_AGENT_POOL, SQUAD_SIZE } from "../recruitment";
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

console.log("\n[C1] Deterministic season rollover");
{
  const a = newGame("Career City", "Ada Career", "CAREERS|DETERMINISTIC");
  const b = clone(a);
  a.season = 2;
  b.season = 2;
  runPlayerCareerRollover(a);
  runPlayerCareerRollover(b);
  check(
    "same state produces byte-identical player careers",
    JSON.stringify(a.football.players) === JSON.stringify(b.football.players),
  );
  check(
    "same state produces byte-identical contracts",
    JSON.stringify(a.football.contracts) === JSON.stringify(b.football.contracts),
  );
  check(
    "same state produces byte-identical history",
    JSON.stringify(a.football.transferHistory) === JSON.stringify(b.football.transferHistory) &&
      JSON.stringify(a.football.contractHistory) === JSON.stringify(b.football.contractHistory),
  );
}

console.log("\n[C2] Ability and potential bounds");
{
  const s = newGame("Curve City", "Ada Curve", "CAREERS|CURVES");
  s.season = 2;
  const before = new Map(s.football.players.map((player) => [player.id, player.currentAbility]));
  runPlayerCareerRollover(s);
  check(
    "all surviving detailed players stay inside ability bounds",
    s.football.players.every(
      (player) => player.currentAbility >= 30 && player.currentAbility <= player.potentialAbility,
    ),
  );
  check(
    "career rollover actually changes at least one ability",
    s.football.players.some((player) => before.get(player.id) !== player.currentAbility),
  );
}

console.log("\n[C3] Retirement and youth replacement");
{
  const s = newGame("Retirement City", "Ada Retire", "CAREERS|RETIRE");
  const target = s.football.players.find((player) => player.currentClubId === s.clubName)!;
  const club = target.currentClubId!;
  const oldContractId = target.contractId!;
  target.dateOfBirth.year = 1960; // guaranteed age >= 40 at rollover
  s.season = 2;
  runPlayerCareerRollover(s);

  check(
    "forced-age player leaves the live player store",
    !s.football.players.some((p) => p.id === target.id),
  );
  check(
    "retirement leaves immutable transfer history",
    s.football.transferHistory.some(
      (row) => row.playerId === target.id && row.fromClubId === club && row.toClubId === null,
    ),
  );
  check(
    "retirement leaves immutable contract history",
    s.football.contractHistory.some((row) => row.contractId === oldContractId),
  );
  check(
    "vacancy is replenished by deterministic youth intake",
    s.football.players.filter((player) => player.currentClubId === club).length === SQUAD_SIZE,
  );
  check(
    "replacement youth is 16-18 and contracted as a live player",
    s.football.players
      .filter((player) => player.currentClubId === club && player.createdSeason === s.season)
      .some((player) => {
        const age = ageOf(player, s.season);
        const contract = s.football.contracts.find((row) => row.id === player.contractId);
        return age >= 16 && age <= 18 && contract?.status === "Active";
      }),
  );
  check(
    "retired player's dead contract is not retained in the hot contract store",
    !s.football.contracts.some((row) => row.id === oldContractId),
  );
}

console.log("\n[C4] Focus population remains bounded through repeated ageing");
{
  const s: GameState = newGame("Bounded City", "Ada Bound", "CAREERS|BOUNDED");
  const focus = new Set(buildWorldSimulationPlan(s).focusClubIds);
  const maxExpected = focus.size * SQUAD_SIZE + FREE_AGENT_POOL * 2;
  for (let season = 2; season <= 12; season++) {
    s.season = season;
    runPlayerCareerRollover(s);
  }
  const contractedFocus = s.football.players.filter(
    (player) => player.currentClubId && focus.has(player.currentClubId),
  );
  check(
    "Focus squads do not grow above their generated capacity",
    contractedFocus.length <= focus.size * SQUAD_SIZE,
    `${contractedFocus.length} / ${focus.size * SQUAD_SIZE}`,
  );
  check(
    "detailed player store remains bounded",
    s.football.players.length <= maxExpected,
    `${s.football.players.length} / ${maxExpected}`,
  );
  check(
    "old dead contracts do not accumulate",
    s.football.contracts.every(
      (row) => row.status === "Active" || row.status === "Expiring" || row.expirySeason >= s.season,
    ),
  );
}

console.log("\n[C5] Free-agent market is bounded without breaking user activity");
{
  const s = newGame("Market City", "Ada Market", "CAREERS|FREE-AGENTS");
  const source = s.football.players[0];
  const injected = Array.from({ length: 100 }, (_, index) => ({
    ...clone(source),
    id: `test-free-${index}`,
    currentClubId: null,
    contractId: null,
    transferStatus: "listed" as const,
    createdSeason: 1,
  }));
  s.football.players.push(...injected);
  s.football.shortlist.push("test-free-99");
  s.season = 2;
  runPlayerCareerRollover(s);
  const free = s.football.players.filter((player) => player.currentClubId === null);
  check(
    "free-agent detail stays at the bounded market size",
    free.length <= FREE_AGENT_POOL * 2,
    `${free.length} / ${FREE_AGENT_POOL * 2}`,
  );
  check(
    "shortlisted free agents survive pruning",
    s.football.players.some((player) => player.id === "test-free-99"),
  );
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
