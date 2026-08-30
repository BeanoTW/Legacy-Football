import type { Position } from "@/lib/game/types";

/** Shared football-position colour language used across squad and scouting UI. */
export const POSITION_BADGE_CLASS: Record<Position, string> = {
  FWD: "border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  MID: "border-blue-500/35 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DEF: "border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  GK: "border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export const POSITION_PITCH_CLASS: Record<Position, string> = {
  FWD: "border-rose-300/70 bg-rose-600/90 text-white",
  MID: "border-blue-300/70 bg-blue-600/90 text-white",
  DEF: "border-emerald-300/70 bg-emerald-600/90 text-white",
  GK: "border-amber-300/70 bg-amber-500/90 text-white",
};
