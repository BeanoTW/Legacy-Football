import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { advanceDay, advanceWeek, loadGame, saveGame, clearGame, newGame } from "@/lib/game/engine";
import { continuationInterrupt } from "@/lib/game/attention";

const CONTINUE_STEP_MS = 800;

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueReason, setContinueReason] = useState<string | null>(null);
  const writeSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadGame().then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const seq = ++writeSeq.current;
    void saveGame(state).then(() => {
      if (seq !== writeSeq.current) return;
    });
  }, [state]);

  const start = useCallback((clubName: string, managerName: string) => {
    setState(newGame(clubName, managerName));
  }, []);

  const advance = useCallback((weeks = 1) => {
    setIsContinuing(false);
    setContinueReason(null);
    setState((prev) => {
      if (!prev) return prev;
      let s = prev;
      for (let i = 0; i < weeks; i++) s = advanceWeek(s);
      return s;
    });
  }, []);

  const startContinue = useCallback(() => {
    setContinueReason(null);
    setIsContinuing(true);
  }, []);

  const stopContinue = useCallback(() => {
    setIsContinuing(false);
    setContinueReason("Stopped by you");
  }, []);

  useEffect(() => {
    if (!isContinuing || !state) return;
    const before = continuationInterrupt(state);
    if (before) {
      setIsContinuing(false);
      setContinueReason(before);
      return;
    }

    const timer = window.setTimeout(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = advanceDay(prev);
        const reason = continuationInterrupt(next);
        if (reason) {
          setIsContinuing(false);
          setContinueReason(reason);
        }
        return next;
      });
    }, CONTINUE_STEP_MS);

    return () => window.clearTimeout(timer);
  }, [isContinuing, state]);

  const update = useCallback((updater: (s: GameState) => GameState) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  const reset = useCallback(() => {
    void clearGame();
    setIsContinuing(false);
    setContinueReason(null);
    setState(null);
  }, []);

  return {
    state,
    hydrated,
    start,
    advance,
    update,
    reset,
    isContinuing,
    continueReason,
    startContinue,
    stopContinue,
  };
}
