import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { advanceWeek, loadGame, saveGame, clearGame, newGame } from "@/lib/game/engine";

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Persistence is async (and will stay async when storage moves to IndexedDB),
  // so writes are fire-and-forget and must never be applied out of order.
  const writeSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadGame().then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!state) return;
    const seq = ++writeSeq.current;
    void saveGame(state).then(() => {
      // A newer write already landed; nothing to do. Kept explicit so the
      // ordering guarantee is visible rather than accidental.
      if (seq !== writeSeq.current) return;
    });
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
    void clearGame();
    setState(null);
  }, []);

  return { state, hydrated, start, advance, update, reset };
}
