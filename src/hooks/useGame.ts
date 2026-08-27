import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import {
  advanceDay,
  advanceWeek,
  loadGame,
  saveGame,
  clearGame,
  newGame,
  listSaveSlots,
  SAVE_SLOT_IDS,
  type SaveSlotId,
  type SaveSlotSummary,
} from "@/lib/game/engine";
import { continuationInterrupt } from "@/lib/game/attention";

const CONTINUE_STEP_MS = 800;
const ACTIVE_SLOT_KEY = "chairman.active-save-slot";

function initialSlot(): SaveSlotId {
  if (typeof localStorage === "undefined") return "slot-1";
  const stored = localStorage.getItem(ACTIVE_SLOT_KEY);
  return SAVE_SLOT_IDS.includes(stored as SaveSlotId) ? (stored as SaveSlotId) : "slot-1";
}

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueReason, setContinueReason] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<SaveSlotId>(initialSlot);
  const [saveSlots, setSaveSlots] = useState<SaveSlotSummary[]>([]);
  const writeSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    void loadGame(activeSlot).then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setHydrated(true);
      void listSaveSlots().then(setSaveSlots);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSlot]);

  useEffect(() => {
    if (!state || !hydrated) return;
    const seq = ++writeSeq.current;
    void saveGame(state, activeSlot).then(() => {
      if (seq !== writeSeq.current) return;
      void listSaveSlots().then(setSaveSlots);
    });
  }, [activeSlot, hydrated, state]);

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
    setContinueReason(null);
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
    void clearGame(activeSlot).then(() => listSaveSlots().then(setSaveSlots));
    setIsContinuing(false);
    setContinueReason(null);
    setState(null);
  }, [activeSlot]);

  const switchSlot = useCallback((slot: SaveSlotId) => {
    setIsContinuing(false);
    setContinueReason(null);
    setState(null);
    setHydrated(false);
    localStorage.setItem(ACTIVE_SLOT_KEY, slot);
    setActiveSlot(slot);
  }, []);

  const deleteSlot = useCallback(async (slot: SaveSlotId) => {
    await clearGame(slot);
    if (slot === activeSlot) setState(null);
    setSaveSlots(await listSaveSlots());
  }, [activeSlot]);

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
    activeSlot,
    saveSlots,
    switchSlot,
    deleteSlot,
  };
}
