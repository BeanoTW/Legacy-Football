import { newGame } from "../engine";
import { runAiCareerTransfers } from "../careers";
import { buildWorldSimulationPlan } from "../world";
import { SQUAD_SIZE } from "../recruitment";
import type { GameState } from "../types";
import { isUserClubReference } from "../clubReference";
import {
  playerRegisteredClubId,
  setPlayerClubIdentityInPlace,
} from "../playerRegistration";

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
const seedState = (): GameState => newGame("Career Market FC", "Chair", "CAREER_AI_MARKET");

function prepareVacancies(state: GameState): Set<string> {
  const focus = new Set(buildWorldSimulationPlan(state).focusClubIds);
  const buyers = [...focus]
    .filter((club) => !isUserClubReference(state, club))
    .sort()
    .slice(0, 8);
  for (const buyer of buyers) {
    const squad = state.football.players.filter(
      (player) => playerRegisteredClubId(player) === buyer,
    );
    for (const player of squad.slice(0, 3)) {
      const contract = state.football.contracts.find((row) => row.id === player.contractId);
      if (contract) contract.status = "Expired";
      setPlayerClubIdentityInPlace(player, null);
      player.contractId = null;
    }
  }
  return focus;
}

console.log("\n[CT1] Deterministic AI market");
{
  const a = seedState();
  const focusA = prepareVacancies(a);
  const b = clone(a);
  const beforeCash = a.cash;
  const userIds = new Set(
    a.football.players
      .filter((p) => isUserClubReference(a, playerRegisteredClubId(p)))
      .map((p) => p.id),
  );
  const movedA = runAiCareerTransfers(a, focusA);
  const movedB = runAiCareerTransfers(b, new Set(focusA));

  check(
    "same prepared state completes the same number of moves",
    movedA === movedB,
    `${movedA} vs ${movedB}`,
  );
  check(
    "same prepared state produces byte-identical players",
    JSON.stringify(a.football.players) === JSON.stringify(b.football.players),
  );
  check(
    "same prepared state produces byte-identical contracts",
    JSON.stringify(a.football.contracts) === JSON.stringify(b.football.contracts),
  );
  check(
    "same prepared state produces byte-identical histories",
    JSON.stringify(a.football.transferHistory) === JSON.stringify(b.football.transferHistory),
  );
  check("test actually exercises AI movement", movedA > 0, String(movedA));
  check("AI movement never changes the user's cash", a.cash === beforeCash);
  check(
    "no user player is autonomously moved",
    a.football.players
      .filter((p) => userIds.has(p.id))
      .every((p) => isUserClubReference(a, playerRegisteredClubId(p))),
  );
}

console.log("\n[CT2] Transfer records and squad safety");
{
  const s = seedState();
  const focus = prepareVacancies(s);
  const historyBefore = s.football.transferHistory.length;
  const contractHistoryBefore = s.football.contractHistory.length;
  const moved = runAiCareerTransfers(s, focus);
  const newTransfers = s.football.transferHistory.slice(historyBefore);
  const newContracts = s.football.contractHistory.slice(contractHistoryBefore);

  check("every completed AI move writes one immutable transfer row", newTransfers.length === moved);
  check(
    "AI transfer rows are normal transfers with two AI clubs",
    newTransfers.every(
      (r) =>
        r.type === "transfer" &&
        !!r.fromClubId &&
        !!r.toClubId &&
        !isUserClubReference(s, r.fromClubId) &&
        !isUserClubReference(s, r.toClubId),
    ),
  );
  check(
    "AI transfer fees and wages are non-negative",
    newTransfers.every((r) => r.fee >= 0 && r.weeklyWage >= 0),
  );
  check(
    "moved contracted players close prior contract history",
    newContracts.length <= moved && newContracts.every((r) => r.outcome === "transferred"),
  );
  check(
    "no Focus squad grows above the canonical squad size",
    [...focus].every(
      (club) =>
        s.football.players.filter((p) => playerRegisteredClubId(p) === club).length <= SQUAD_SIZE,
    ),
  );
  check(
    "every moved player has exactly one live contract at the destination",
    newTransfers.every((r) => {
      const player = s.football.players.find((p) => p.id === r.playerId);
      if (!player || playerRegisteredClubId(player) !== r.toClubId || !player.contractId)
        return false;
      return (
        s.football.contracts.filter(
          (c) => c.playerId === player.id && (c.status === "Active" || c.status === "Expiring"),
        ).length === 1
      );
    }),
  );
}

console.log(`\nPASS — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
