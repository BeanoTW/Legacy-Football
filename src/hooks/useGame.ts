import { useCallback, useEffect, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { advanceWeek, loadGame, saveGame, clearGame, newGame } from "@/lib/game/engine";

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadGame());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (state) saveGame(state);
  }, [state]);

  const start = useCallback((clubName: string, managerName: string) => {
    setState(newGame(clubName, managerName));
  }, []);

  const advance = useCallback((weeks = 1) => {
    setState((prev) => {
      if (!prev) return prev;
      let s = prev;
      for (let i = 0; i < weeks; i++) s = advanceWeek(s);
      return s;
    });
  }, []);

  const update = useCallback((updater: (s: GameState) => GameState) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  const reset = useCallback(() => {
    clearGame();
    setState(null);
  }, []);

  return { state, hydrated, start, advance, update, reset };
}
