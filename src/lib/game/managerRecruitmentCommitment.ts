import type { GameState, Position, TacticalPosition } from "./types";
import { absoluteWeek } from "./time";

export interface ManagerRecruitmentCommitment {
  managerId: string;
  position: Position;
  tacticalPosition?: TacticalPosition;
  playerLevel?: "backup" | "firstTeam" | "startingXI";
  acceptedAtAbsoluteWeek: number;
  dueAtAbsoluteWeek: number;
  active: boolean;
  fulfilled: boolean;
  fulfilledPlayerName?: string;
}

const key = (managerId: string, field: string) => `managerRecruitmentCommitment:${managerId}:${field}`;

export function managerRecruitmentCommitment(
  state: GameState,
  managerId: string,
): ManagerRecruitmentCommitment | null {
  const position = String(state.inboxFlags[key(managerId, "position")] ?? "") as Position | "";
  const acceptedAtAbsoluteWeek = Number(state.inboxFlags[key(managerId, "acceptedAtAbsoluteWeek")] ?? NaN);
  const dueAtAbsoluteWeek = Number(state.inboxFlags[key(managerId, "dueAtAbsoluteWeek")] ?? NaN);
  if (!position || !Number.isFinite(acceptedAtAbsoluteWeek) || !Number.isFinite(dueAtAbsoluteWeek)) return null;

  const tacticalPositionRaw = String(state.inboxFlags[key(managerId, "tacticalPosition")] ?? "");
  const playerLevelRaw = String(state.inboxFlags[key(managerId, "playerLevel")] ?? "");
  return {
    managerId,
    position,
    tacticalPosition: tacticalPositionRaw ? tacticalPositionRaw as TacticalPosition : undefined,
    playerLevel:
      playerLevelRaw === "backup" || playerLevelRaw === "firstTeam" || playerLevelRaw === "startingXI"
        ? playerLevelRaw
        : undefined,
    acceptedAtAbsoluteWeek,
    dueAtAbsoluteWeek,
    active: Boolean(state.inboxFlags[key(managerId, "active")] ?? false),
    fulfilled: Boolean(state.inboxFlags[key(managerId, "fulfilled")] ?? false),
    fulfilledPlayerName: String(state.inboxFlags[key(managerId, "fulfilledPlayerName")] ?? "") || undefined,
  };
}

export function managerRecruitmentCommitmentFlag(
  managerId: string,
  field: "position" | "tacticalPosition" | "playerLevel" | "acceptedAtAbsoluteWeek" | "dueAtAbsoluteWeek" | "active" | "fulfilled" | "fulfilledPlayerName",
): string {
  return key(managerId, field);
}

export function markManagerRecruitmentCommitmentFulfilledInPlace(
  state: GameState,
  managerId: string,
  position: Position,
  playerName: string,
): boolean {
  const commitment = managerRecruitmentCommitment(state, managerId);
  if (!commitment?.active || commitment.fulfilled) return false;
  if (absoluteWeek(state.season, state.week) > commitment.dueAtAbsoluteWeek) return false;
  if (commitment.position !== position) return false;

  state.inboxFlags[key(managerId, "fulfilled")] = true;
  state.inboxFlags[key(managerId, "active")] = false;
  state.inboxFlags[key(managerId, "fulfilledPlayerName")] = playerName;
  return true;
}

export function clearManagerRecruitmentCommitmentInPlace(
  state: GameState,
  managerId: string,
): void {
  state.inboxFlags[key(managerId, "active")] = false;
}
