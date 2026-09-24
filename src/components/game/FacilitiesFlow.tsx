import type { GameState } from "@/lib/game/types";
import { FacilitiesTab } from "@/components/FacilitiesTab";

export function FacilitiesFlow({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  return <FacilitiesTab state={state} update={update} />;
}
