import type { FootballPlayer, GameState, PlayerContract } from "./types";
import { sameClubReference } from "./clubReference";
import { FRINGE_SQUAD_SIZE, type CompactFringePlayer } from "./fringePlayers";
import {
  compactDetailedPlayerForFringe,
  hydrateCompactFringePlayer,
} from "./fringePlayerFidelity";
import { buildWorldSimulationPlan } from "./world";
import { activeLoanForPlayer } from "./loans";

function isLiveContract(contract: PlayerContract): boolean {
  return contract.status === "Active" || contract.status === "Expiring";
}

function liveContractForPlayer(state: GameState, playerId: string): PlayerContract | undefined {
  return state.football?.contracts.find(
    (contract) => contract.playerId === playerId && isLiveContract(contract),
  );
}

function activeCompactPlayersForClub(state: GameState, clubId: string): CompactFringePlayer[] {
  return Object.values(state.fringePlayers ?? {})
    .filter(
      (player) =>
        !player.retired &&
        !player.departed &&
        sameClubReference(state, player.currentClubId, clubId),
    )
    .sort((a, b) => b.currentAbility - a.currentAbility || a.playerId.localeCompare(b.playerId));
}

function detailedPlayersForClub(state: GameState, clubId: string): FootballPlayer[] {
  return (state.football?.players ?? [])
    .filter(
      (player) =>
        sameClubReference(state, player.currentClubId, clubId) &&
        !activeLoanForPlayer(state, player.id),
    )
    .sort((a, b) => b.currentAbility - a.currentAbility || a.id.localeCompare(b.id));
}

/**
 * Mirror any already-known compact identity from its current detailed player.
 * This keeps transfers/development that happened while a club was in Focus
 * from being lost when that identity later drops back to Fringe.
 */
function refreshExistingCompactMirrorsInPlace(state: GameState): void {
  if (!state.football || !state.fringePlayers) return;
  const detailedById = new Map(state.football.players.map((player) => [player.id, player]));

  for (const [playerId, compact] of Object.entries(state.fringePlayers)) {
    const detailed = detailedById.get(playerId);
    if (!detailed) continue;
    if (!detailed.currentClubId) {
      compact.departed = true;
      continue;
    }
    const contract = liveContractForPlayer(state, playerId);
    const refreshed = compactDetailedPlayerForFringe(
      state,
      detailed,
      contract?.expirySeason ?? compact.contractExpirySeason,
    );
    state.fringePlayers[playerId] = {
      ...compact,
      ...refreshed,
      retired: false,
      departed: false,
    };
  }
}

/**
 * Capture detailed players before the legacy recruitment reconciler removes a
 * club that has crossed from Focus to Fringe. Historical compact identities
 * not present in the departing detailed squad are retained but marked departed
 * rather than silently counted as current squad members.
 */
export function compactDepartingFocusPlayersInPlace(state: GameState): void {
  if (!state.football) return;
  state.fringePlayers ??= {};
  refreshExistingCompactMirrorsInPlace(state);

  const plan = buildWorldSimulationPlan(state);
  for (const profile of plan.clubs) {
    if (profile.level !== "fringe") continue;
    const detailed = detailedPlayersForClub(state, profile.clubId);
    if (!detailed.length) continue;

    const currentIds = new Set(detailed.map((player) => player.id));
    for (const compact of Object.values(state.fringePlayers)) {
      if (
        !compact.retired &&
        !compact.departed &&
        sameClubReference(state, compact.currentClubId, profile.clubId) &&
        !currentIds.has(compact.playerId)
      ) {
        compact.departed = true;
      }
    }

    for (const player of detailed) {
      const contract = liveContractForPlayer(state, player.id);
      const previous = state.fringePlayers[player.id];
      const compact = compactDetailedPlayerForFringe(
        state,
        player,
        contract?.expirySeason ?? previous?.contractExpirySeason ?? state.season + 1,
      );
      state.fringePlayers[player.id] = {
        ...previous,
        ...compact,
        retired: false,
        departed: false,
      };
    }
  }
}

/**
 * Replace a freshly generated Focus squad with the persistent compact people
 * that already represented that club in Fringe. The legacy-generated contracts
 * are retained as the economic template but rebound to the persistent player
 * ids; ability/DOB/position/name continuity therefore survives the boundary
 * without changing the club's freshly calculated wage load.
 *
 * The legacy detailed generator currently creates a slightly larger squad than
 * the compact Fringe representation. That surplus is placeholder detail, not
 * additional persistent people: a clean hydration consumes only enough
 * contract templates for the compact squad and removes every generated
 * placeholder for the club.
 */
export function repairFreshFocusHydrationInPlace(state: GameState): void {
  if (!state.football || !state.fringePlayers) return;
  refreshExistingCompactMirrorsInPlace(state);
  const plan = buildWorldSimulationPlan(state);

  for (const clubId of plan.focusClubIds) {
    const compact = activeCompactPlayersForClub(state, clubId);
    if (compact.length !== FRINGE_SQUAD_SIZE) continue;

    const detailed = detailedPlayersForClub(state, clubId);
    if (detailed.length < compact.length) continue;

    const compactIds = new Set(compact.map((player) => player.playerId));
    const overlap = detailed.filter((player) => compactIds.has(player.id)).length;
    if (overlap === compact.length) continue;
    // Mixed identity sets indicate a real transfer/squad mutation, not a clean
    // fidelity hydration. Do not guess how to rewrite a partially changed squad.
    if (overlap !== 0) continue;

    const detailedIds = new Set(detailed.map((player) => player.id));
    if (
      compact.some((player) =>
        state.football!.players.some(
          (existing) => existing.id === player.playerId && !detailedIds.has(existing.id),
        ),
      )
    ) {
      continue;
    }

    const templateContracts = detailed
      .slice(0, compact.length)
      .map((player) => liveContractForPlayer(state, player.id));
    if (templateContracts.some((contract) => !contract)) continue;

    state.football.players = state.football.players.filter(
      (player) => !detailedIds.has(player.id),
    );
    state.football.contracts = state.football.contracts.filter(
      (contract) => !detailedIds.has(contract.playerId),
    );

    compact.forEach((source, index) => {
      const template = templateContracts[index]!;
      const contract: PlayerContract = {
        ...template,
        playerId: source.playerId,
        clubId: source.currentClubId,
        expirySeason: Math.max(template.expirySeason, source.contractExpirySeason),
      };
      const player = hydrateCompactFringePlayer(state, source, contract.id);
      state.football!.players.push(player);
      state.football!.contracts.push(contract);
    });
  }
}

/**
 * Safe boundary hook. Call immediately before the legacy recruitment fidelity
 * reconciliation to capture departures, and immediately after it to replace
 * generated Focus placeholders with the same persistent people.
 */
export function reconcilePersistentPlayerFidelityInPlace(state: GameState): void {
  compactDepartingFocusPlayersInPlace(state);
  repairFreshFocusHydrationInPlace(state);
}
