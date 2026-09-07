import type {
  DetailedPosition,
  FootballPlayer,
  Position,
  PositionFamiliarity,
} from "./types";

export const DETAILED_POSITIONS: readonly DetailedPosition[] = [
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

export const POSITION_RELATIONSHIPS: Record<DetailedPosition, readonly DetailedPosition[]> = {
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

export type PositionUnit = "GK" | "DEF" | "MID" | "FWD";

export function positionUnit(position: Position): PositionUnit {
  if (position === "GK") return "GK";
  if (position === "DEF" || ["RB", "CB", "LB", "RWB", "LWB"].includes(position)) return "DEF";
  if (position === "MID" || ["CDM", "CM", "CAM", "RM", "LM"].includes(position)) return "MID";
  return "FWD";
}

export function positionFamiliarity(
  player: Pick<FootballPlayer, "primaryPosition" | "secondaryPositions" | "positionFamiliarity">,
  position: Position,
): PositionFamiliarity | "Unfamiliar" {
  if (player.primaryPosition === position) return "Natural";
  const explicit = player.positionFamiliarity?.[position];
  if (explicit) return explicit;
  if (player.secondaryPositions.includes(position)) return "Comfortable";
  return "Unfamiliar";
}

export const POSITION_EFFECTIVENESS: Record<PositionFamiliarity | "Unfamiliar", number> = {
  Natural: 1,
  Accomplished: 0.97,
  Comfortable: 0.9,
  Unfamiliar: 0.75,
};

export function positionEffectiveness(player: FootballPlayer, position: Position): number {
  return POSITION_EFFECTIVENESS[positionFamiliarity(player, position)];
}
