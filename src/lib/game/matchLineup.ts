import type { FootballPlayer, GameState, MatchLineupPlayer, TacticalPosition } from "./types";
import type { ManagerFormation } from "./managerIdentity";
import { MANAGER_FORMATION_SLOTS } from "./managerFormationLayout";
import { positionFamiliarity, positionUnit } from "./positions";
import { isUserClubReference, sameClubReference } from "./clubReference";
import { playerRegisteredClubId } from "./playerRegistration";

const playerName = (player: FootballPlayer) => `${player.firstName} ${player.lastName}`;

function roleScore(player: FootballPlayer, role: TacticalPosition): number {
  const familiarity = positionFamiliarity(player, role);
  const familiarityBonus =
    familiarity === "Natural"
      ? 12
      : familiarity === "Accomplished"
        ? 7
        : familiarity === "Comfortable"
          ? 2
          : -20;
  return player.currentAbility + familiarityBonus;
}

function selectForRoles(
  players: FootballPlayer[],
  roles: readonly TacticalPosition[],
  preferredIds: string[] = [],
): MatchLineupPlayer[] {
  const used = new Set<string>();
  const preference = new Map(preferredIds.map((id, index) => [id, preferredIds.length - index]));
  return roles.flatMap((role, roleIndex) => {
    const available = players.filter(
      (player) => player.availability === "available" && !used.has(player.id),
    );
    const score = (player: FootballPlayer) =>
      roleScore(player, role) + (preference.get(player.id) ?? 0) * 1_000;
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
  return selectForRoles(players, MANAGER_FORMATION_SLOTS[formation], preferredIds);
}

export function opponentMatchLineup(state: GameState, opponent: string): MatchLineupPlayer[] {
  const players = state.football.players.filter((player) =>
    sameClubReference(state, playerRegisteredClubId(player), opponent),
  );
  return selectForRoles(players, MANAGER_FORMATION_SLOTS["4-4-2"]);
}
