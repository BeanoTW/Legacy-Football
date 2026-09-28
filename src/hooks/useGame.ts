import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/lib/game/types";
import {
  advanceDay,
  advanceWeek,
  skipTransferDeadlineDay,
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
import { currentAbsoluteDay } from "@/lib/game/timeline";
import type { AdvanceTarget } from "@/lib/game/advancePlanner";
import { deleteCloudCareer, markLocalSaveModified, uploadCareer } from "@/lib/cloud/sync";

/** Real time per game day at 1×. */
const CONTINUE_STEP_MS = 800;
const ACTIVE_SLOT_KEY = "chairman.active-save-slot";
const SPEED_KEY = "chairman.continue-speed";

export type ContinueSpeed = 1 | 2 | 4;

function initialSlot(): SaveSlotId {
  if (typeof localStorage === "undefined") return "slot-1";
  const stored = localStorage.getItem(ACTIVE_SLOT_KEY);
  return SAVE_SLOT_IDS.includes(stored as SaveSlotId) ? (stored as SaveSlotId) : "slot-1";
}

function initialSpeed(): ContinueSpeed {
  if (typeof localStorage === "undefined") return 1;
  const stored = Number(localStorage.getItem(SPEED_KEY));
  return stored === 2 || stored === 4 ? stored : 1;
}

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueReason, setContinueReason] = useState<string | null>(null);
  const [continueTarget, setContinueTarget] = useState<AdvanceTarget | null>(null);
  const [continueSpeed, setContinueSpeedState] = useState<ContinueSpeed>(initialSpeed);
  const [activeSlot, setActiveSlot] = useState<SaveSlotId>(initialSlot);
  const [saveSlots, setSaveSlots] = useState<SaveSlotSummary[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const writeSeq = useRef(0);
  const cloudTimer = useRef<number | null>(null);
  const skipCloudWrite = useRef(true);
  const targetRef = useRef<AdvanceTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setSaveError(null);
    void loadGame(activeSlot).then((loaded) => {
      if (cancelled) return;
      skipCloudWrite.current = true;
      setState(loaded);
      setHydrated(true);
      void listSaveSlots().then((slots) => { if (!cancelled) setSaveSlots(slots); }).catch((error: unknown) => {
        if (!cancelled) setSaveError(`Could not read save slots: ${(error as Error).message}`);
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setSaveError(`Could not load your career: ${(error as Error).message}`);
      setState(null);
      setHydrated(true);
      void listSaveSlots().then((slots) => { if (!cancelled) setSaveSlots(slots); }).catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSlot]);

  useEffect(() => {
    if (!state || !hydrated) return;
    const seq = ++writeSeq.current;
    const localOnly = skipCloudWrite.current;
    skipCloudWrite.current = false;
    if (!localOnly) markLocalSaveModified(activeSlot);
    void saveGame(state, activeSlot).then(() => {
      if (seq !== writeSeq.current) return;
      setSaveError(null);
      void listSaveSlots().then(setSaveSlots).catch((error: unknown) =>
        setSaveError(`Could not refresh save slots: ${(error as Error).message}`),
      );
      if (localOnly) return;
      if (cloudTimer.current) window.clearTimeout(cloudTimer.current);
      cloudTimer.current = window.setTimeout(() => {
        void uploadCareer(activeSlot, state).then(() => setCloudError(null)).catch((error: unknown) =>
          setCloudError(`Cloud sync failed: ${(error as Error).message}`),
        );
      }, 2_000);
    }).catch((error: unknown) => {
      if (seq === writeSeq.current) setSaveError((error as Error).message);
    });
    return () => {
      if (cloudTimer.current) window.clearTimeout(cloudTimer.current);
    };
  }, [activeSlot, hydrated, state]);

  const start = useCallback((clubName: string, managerName: string, startingDivisionId?: string) => {
    skipCloudWrite.current = false;
    setSaveError(null);
    setState(newGame(clubName, managerName, undefined, startingDivisionId));
  }, []);

  const clearTarget = useCallback(() => {
    targetRef.current = null;
    setContinueTarget(null);
  }, []);

  const advance = useCallback((weeks = 1) => {
    setIsContinuing(false);
    setContinueReason(null);
    clearTarget();
    setState((prev) => {
      if (!prev) return prev;
      let s = prev;
      for (let i = 0; i < weeks; i++) s = advanceWeek(s);
      return s;
    });
  }, [clearTarget]);

  /**
   * Starts time. With a target, time stops on that day (or earlier if the
   * engine needs the chairman). Without one, it runs until something does.
   */
  const startContinue = useCallback((target?: AdvanceTarget | null) => {
    const next = target?.untilAbsoluteDay !== undefined ? target : null;
    targetRef.current = next;
    setContinueTarget(next);
    setContinueReason(null);
    setIsContinuing(true);
  }, []);

  const stopContinue = useCallback(() => {
    setIsContinuing(false);
    setContinueReason(null);
    clearTarget();
  }, [clearTarget]);

  const setContinueSpeed = useCallback((speed: ContinueSpeed) => {
    setContinueSpeedState(speed);
    if (typeof localStorage !== "undefined") localStorage.setItem(SPEED_KEY, String(speed));
  }, []);

  const skipDeadlineDay = useCallback(() => {
    setIsContinuing(false);
    setContinueReason(null);
    clearTarget();
    setState((prev) => (prev ? skipTransferDeadlineDay(prev) : prev));
  }, [clearTarget]);

  useEffect(() => {
    if (!isContinuing || !state) return;
    const reachedTarget = (s: GameState) => {
      const target = targetRef.current;
      return target?.untilAbsoluteDay !== undefined && currentAbsoluteDay(s) >= target.untilAbsoluteDay
        ? `Reached ${target.label.toLowerCase() === "continue" ? "your stop" : target.label}`
        : null;
    };
    const before = continuationInterrupt(state) ?? reachedTarget(state);
    if (before) {
      setIsContinuing(false);
      setContinueReason(before);
      return;
    }

    const timer = window.setTimeout(() => {
      setState((prev) => {
        if (!prev) return prev;
        const next = advanceDay(prev);
        const reason = continuationInterrupt(next) ?? reachedTarget(next);
        if (reason) {
          setIsContinuing(false);
          setContinueReason(reason);
        }
        return next;
      });
    }, CONTINUE_STEP_MS / continueSpeed);

    return () => window.clearTimeout(timer);
  }, [continueSpeed, isContinuing, state]);

  const update = useCallback((updater: (s: GameState) => GameState) => {
    setState((prev) => (prev ? updater(prev) : prev));
  }, []);

  const reset = useCallback(() => {
    setIsContinuing(false);
    setContinueReason(null);
    clearTarget();
    if (cloudTimer.current) window.clearTimeout(cloudTimer.current);
    void deleteCloudCareer(activeSlot)
      .then(() => clearGame(activeSlot))
      .then(() => listSaveSlots())
      .then((slots) => { setSaveSlots(slots); setState(null); })
      .catch((error: unknown) => setSaveError(`Could not clear career: ${(error as Error).message}`));
  }, [activeSlot, clearTarget]);

  const switchSlot = useCallback((slot: SaveSlotId) => {
    setIsContinuing(false);
    setContinueReason(null);
    clearTarget();
    setState(null);
    setHydrated(false);
    localStorage.setItem(ACTIVE_SLOT_KEY, slot);
    setActiveSlot(slot);
  }, [clearTarget]);

  const deleteSlot = useCallback(async (slot: SaveSlotId) => {
    if (slot === activeSlot && cloudTimer.current) {
      window.clearTimeout(cloudTimer.current);
      cloudTimer.current = null;
    }
    await deleteCloudCareer(slot);
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
    continueTarget,
    continueSpeed,
    setContinueSpeed,
    startContinue,
    stopContinue,
    skipDeadlineDay,
    activeSlot,
    saveSlots,
    saveError,
    cloudError,
    switchSlot,
    deleteSlot,
  };
}