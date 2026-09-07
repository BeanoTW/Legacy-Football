import type {
  FootballPlayer,
  Position,
  PositionFamiliarity,
  TacticalPosition,
} from "./types";
import { hashString } from "./rng";

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

const PRIMARY_BY_UNIT: Record<Position, readonly TacticalPosition[]> = {
  GK: ["GK"],
  DEF: ["RB", "CB", "LB", "RWB", "LWB"],
  MID: ["CDM", "CM", "CAM", "RM", "LM"],
  FWD: ["RW", "LW", "ST"],
};

function unsignedHash(value: string): number {
  return hashString(value) >>> 0;
}

export type PositionUnit = Position;

export function positionUnit(position: TacticalPosition | Position): PositionUnit {
  if (position === "GK") return "GK";
  if (position === "DEF" || ["RB", "CB", "LB", "RWB", "LWB"].includes(position)) return "DEF";
  if (position === "MID" || ["CDM", "CM", "CAM", "RM", "LM"].includes(position)) return "MID";
  return "FWD";
}

export interface TacticalPositionProfile {
  primary: TacticalPosition;
  secondary: TacticalPosition[];
  natural: TacticalPosition[];
}

/**
 * Tactical detail is deterministic presentation/simulation metadata derived
 * from the player's stable identity. It is deliberately not persisted, so the
 * richer position model costs nothing in long-run save size and old saves gain
 * the same stable profile automatically.
 */
export function tacticalPositionProfile(
  player: Pick<FootballPlayer, "id" | "primaryPosition">,
): TacticalPositionProfile {
  const candidates = PRIMARY_BY_UNIT[player.primaryPosition];
  const primary = candidates[unsignedHash(`${player.id}|tactical-primary`) % candidates.length];
  if (primary === "GK") return { primary, secondary: [], natural: [primary] };

  const related = [...POSITION_RELATIONSHIPS[primary]];
  const roll = unsignedHash(`${player.id}|tactical-versatility`) % 100;
  const secondaryCount = roll < 34 ? 0 : roll < 74 ? 1 : roll < 94 ? 2 : 3;
  const offset = related.length
    ? unsignedHash(`${player.id}|tactical-secondary-order`) % related.length
    : 0;
  const ordered = related.length
    ? [...related.slice(offset), ...related.slice(0, offset)]
    : [];
  const secondary = ordered.slice(0, secondaryCount);
  const additionalNaturalCount = roll >= 95 ? Math.min(2, secondary.length) : roll >= 78 ? Math.min(1, secondary.length) : 0;

  return {
    primary,
    secondary,
    natural: [primary, ...secondary.slice(0, additionalNaturalCount)],
  };
}

export function positionFamiliarity(
  player: Pick<FootballPlayer, "id" | "primaryPosition">,
  position: TacticalPosition,
): PositionFamiliarity | "Unfamiliar" {
  const profile = tacticalPositionProfile(player);
  if (profile.natural.includes(position)) return "Natural";
  const index = profile.secondary.indexOf(position);
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
