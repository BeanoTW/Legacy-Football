import type {
  TacticalPosition,
  FootballPlayer,
  Position,
  PositionFamiliarity,
} from "./types";

export const DETAILED_POSITIONS: readonly TacticalPosition[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "RWB",
  "LWB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "ST",
] as const;

export const POSITION_RELATIONSHIPS: Record<TacticalPosition, readonly TacticalPosition[]> = {
  GK: [],
  RB: ["RWB", "CB", "RM"],
  CB: ["RB", "LB", "CDM"],
  LB: ["LWB", "CB", "LM"],
  RWB: ["RB", "RM", "RW"],
  LWB: ["LB", "LM", "LW"],
  CDM: ["CM", "CB", "CAM"],
  CM: ["CDM", "CAM", "RM", "LM"],
  CAM: ["CM", "RW", "LW", "ST"],
  RM: ["RW", "RWB", "CM"],
  LM: ["LW", "LWB", "CM"],
  RW: ["RM", "CAM", "ST"],
  LW: ["LM", "CAM", "ST"],
  ST: ["CAM", "RW", "LW"],
};

export type PositionUnit = Position;

export function positionUnit(position: TacticalPosition | Position): PositionUnit {
  if (position === "GK") return "GK";
  if (position === "DEF" || ["RB", "CB", "LB", "RWB", "LWB"].includes(position)) return "DEF";
  if (position === "MID" || ["CDM", "CM", "CAM", "RM", "LM"].includes(position)) return "MID";
  return "FWD";
}

export function positionFamiliarity(
  player: Pick<FootballPlayer, "tacticalPrimaryPosition" | "tacticalSecondaryPositions" | "naturalTacticalPositions">,
  position: TacticalPosition,
): PositionFamiliarity | "Unfamiliar" {
  if (player.tacticalPrimaryPosition === position) return "Natural";
  if (player.naturalTacticalPositions?.includes(position)) return "Natural";
  const index = player.tacticalSecondaryPositions?.indexOf(position) ?? -1;
  if (index === 0) return "Accomplished";
  if (index > 0) return "Comfortable";
  return "Unfamiliar";
}

export const POSITION_EFFECTIVENESS: Record<PositionFamiliarity | "Unfamiliar", number> = {
  Natural: 1,
  Accomplished: 0.97,
  Comfortable: 0.9,
  Unfamiliar: 0.75,
};

export function positionEffectiveness(player: FootballPlayer, position: TacticalPosition): number {
  return POSITION_EFFECTIVENESS[positionFamiliarity(player, position)];
}
