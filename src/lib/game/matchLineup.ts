import type { FootballPlayer, GameState, MatchLineupPlayer, TacticalPosition } from "./types";
import { managerFootballIdentity, type ManagerFormation } from "./managerIdentity";
import { MANAGER_FORMATION_SLOTS } from "./managerFormationLayout";
import { positionFamiliarity, positionUnit } from "./positions";
import { isUserClubReference, sameClubReference } from "./clubReference";
import { playerRegisteredClubId } from "./playerRegistration";
import { playerFitness, playerIsAvailable } from "./playerHealth";

const playerName = (player: FootballPlayer) => `${player.firstName} ${player.lastName}`;

function roleScore(player: FootballPlayer, role: TacticalPosition, fitnessWeight = 0.12): number {
  const familiarity = positionFamiliarity(player, role);
  const familiarityBonus =
    familiarity === "Natural"
      ? 12
      : familiarity === "Accomplished"
        ? 7
        : familiarity === "Comfortable"
          ? 2
          : -20;
  return player.currentAbility + familiarityBonus + (playerFitness(player) - 75) * fitnessWeight;
}

function selectForRoles(
  state: GameState,
  players: FootballPlayer[],
  roles: readonly TacticalPosition[],
  preferredIds: string[] = [],
  fitnessWeight = 0.12,
): MatchLineupPlayer[] {
  const used = new Set<string>();
  const preference = new Map(preferredIds.map((id, index) => [id, preferredIds.length - index]));
  return roles.flatMap((role, roleIndex) => {
    const available = players.filter(
      (player) => playerIsAvailable(player, state) && !used.has(player.id),
    );
    const score = (player: FootballPlayer) =>
      roleScore(player, role, fitnessWeight) + (preference.get(player.id) ?? 0) * 1.5;
    const specialists = available
      .filter((player) =>
        role === "GK"
          ? player.primaryPosition === "GK"
          : player.primaryPosition !== "GK" && positionFamiliarity(player, role) !== "Unfamiliar",
      )
      .sort((a, b) => score(b) - score(a));
    const sameUnit = available
      .filter((player) =>
        role === "GK"
          ? player.primaryPosition === "GK"
          : player.primaryPosition !== "GK" && player.primaryPosition === positionUnit(role),
      )
      .sort((a, b) => score(b) - score(a));
    const fallback = available
      .filter((player) => role !== "GK" && player.primaryPosition !== "GK")
      .sort((a, b) => score(b) - score(a));
    const chosen = specialists[0] ?? sameUnit[0] ?? fallback[0];
    if (!chosen) return [];
    used.add(chosen.id);
    return [
      {
        playerId: chosen.id,
        name: playerName(chosen),
        shirtNumber: role === "GK" ? 1 : roleIndex + 1,
        role,
        ability: chosen.currentAbility,
        fitness: playerFitness(chosen),
      },
    ];
  });
}

export function userMatchLineup(
  state: GameState,
  formation: ManagerFormation,
): MatchLineupPlayer[] {
  const players = state.football.players.filter((player) =>
    isUserClubReference(state, playerRegisteredClubId(player)),
  );
  const storedSelection = state.inboxFlags["chairman.selection.ids"];
  const preferredIds = (typeof storedSelection === "string" ? storedSelection : "")
    .split(",")
    .filter(Boolean);
  const manager = (state.hiredStaff ?? []).find((staff) => staff.role === "Manager");
  const rotation = manager ? managerFootballIdentity(manager).rotation : "Medium";
  const fitnessWeight = rotation === "High" ? 0.28 : rotation === "Low" ? 0.08 : 0.16;
  return selectForRoles(
    state,
    players,
    MANAGER_FORMATION_SLOTS[formation],
    preferredIds,
    fitnessWeight,
  );
}

export function opponentMatchLineup(state: GameState, opponent: string): MatchLineupPlayer[] {
  const players = state.football.players.filter((player) =>
    sameClubReference(state, playerRegisteredClubId(player), opponent),
  );
  return selectForRoles(state, players, MANAGER_FORMATION_SLOTS["4-4-2"], [], 0.16);
}


function benchFromPlayers(
  state: GameState,
  players: FootballPlayer[],
  lineup: MatchLineupPlayer[],
): MatchLineupPlayer[] {
  const used = new Set(lineup.map((player) => player.playerId));
  const eligible = players
    .filter((player) => playerIsAvailable(player, state) && !used.has(player.id))
    .sort(
      (a, b) =>
        b.currentAbility + playerFitness(b) * 0.08 - (a.currentAbility + playerFitness(a) * 0.08),
    );
  const keeper = eligible.find((player) => player.primaryPosition === "GK");
  const outfield = eligible.filter((player) => player.primaryPosition !== "GK");
  const picked = [...(keeper ? [keeper] : []), ...outfield].slice(0, 7);
  return picked.map((player, index) => ({
    playerId: player.id,
    name: playerName(player),
    shirtNumber: 12 + index,
    role: player.primaryPosition === "GK" ? "GK" : player.primaryPosition === "DEF" ? "CB" : player.primaryPosition === "MID" ? "CM" : "ST",
    ability: player.currentAbility,
    fitness: playerFitness(player),
  }));
}

export function userMatchBench(
  state: GameState,
  lineup: MatchLineupPlayer[],
): MatchLineupPlayer[] {
  const players = state.football.players.filter((player) =>
    isUserClubReference(state, playerRegisteredClubId(player)),
  );
  return benchFromPlayers(state, players, lineup);
}

export function opponentMatchBench(
  state: GameState,
  opponent: string,
  lineup: MatchLineupPlayer[],
): MatchLineupPlayer[] {
  const players = state.football.players.filter((player) =>
    sameClubReference(state, playerRegisteredClubId(player), opponent),
  );
  return benchFromPlayers(state, players, lineup);
}
