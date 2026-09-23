import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type {
  MatchEvent,
  MatchLineupPlayer,
  MatchSubstitution,
  TacticalPosition,
} from "@/lib/game/types";
import { bridgeMinute, commentaryBridge } from "@/lib/game/matchFlow";
import {
  activeMatchLineupAtMinute,
  buildMatchSequence,
  frameForSequence,
  sequenceDurationMs,
  sequenceResultVisible,
  type MatchPitchPoint,
  type MatchSequence,
  type MatchSequenceAction,
} from "@/lib/game/matchSequence";
import { cn } from "@/lib/utils";

const PLAYBACK_SPEEDS = [1, 2, 4] as const;
const BASE_EVENT_MS = 4_800;

const ROLE_X: Record<TacticalPosition, number> = {
  GK: 8,
  LB: 24,
  CB: 22,
  RB: 24,
  LWB: 35,
  RWB: 35,
  CDM: 40,
  CM: 48,
  CAM: 59,
  LM: 52,
  RM: 52,
  LW: 68,
  RW: 68,
  ST: 74,
};

function roleY(role: TacticalPosition, occurrence: number, count: number): number {
  if (role === "LB" || role === "LWB" || role === "LM" || role === "LW") return 16;
  if (role === "RB" || role === "RWB" || role === "RM" || role === "RW") return 84;
  if (role === "GK" || role === "CAM") return 50;
  if (count <= 1) return 50;
  const low = role === "CB" ? 32 : role === "ST" ? 37 : 28;
  const high = 100 - low;
  return low + ((high - low) * occurrence) / Math.max(1, count - 1);
}

function formationPositions(
  lineup: MatchLineupPlayer[],
  ours: boolean,
): Map<string, MatchPitchPoint> {
  const totals = new Map<TacticalPosition, number>();
  for (const player of lineup) totals.set(player.role, (totals.get(player.role) ?? 0) + 1);
  const seen = new Map<TacticalPosition, number>();
  const result = new Map<string, MatchPitchPoint>();
  for (const player of lineup) {
    const occurrence = seen.get(player.role) ?? 0;
    seen.set(player.role, occurrence + 1);
    const x = ROLE_X[player.role];
    result.set(player.playerId, {
      x: ours ? x : 100 - x,
      y: roleY(player.role, occurrence, totals.get(player.role) ?? 1),
    });
  }
  return result;
}

function eventSeed(event: MatchEvent | undefined): number {
  if (!event) return 0;
  const input = event.sequenceId ?? `${event.minute}:${event.type}:${event.side}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackEventPosition(event: MatchEvent | undefined): MatchPitchPoint {
  if (!event) return { x: 50, y: 50 };
  const attackingX =
    event.zone === "box"
      ? 90
      : event.zone === "attackingThird"
        ? 76
        : event.zone === "middleThird"
          ? 55
          : 29;
  const x = event.side === "them" ? 100 - attackingX : attackingX;
  return { x: Math.max(4, Math.min(96, x)), y: 18 + ((eventSeed(event) * 17) % 65) };
}

function eventDurationMs(event: MatchEvent | undefined, sequence: MatchSequence | null): number {
  if (sequence) return sequenceDurationMs(sequence);
  if (!event) return BASE_EVENT_MS;
  if (event.type === "sub" || event.type === "injury" || event.type === "card") return 3_200;
  return BASE_EVENT_MS;
}

function actionStage(action: MatchSequenceAction | undefined, event: MatchEvent | undefined): string {
  if (!action) return event?.phase?.replace(/([A-Z])/g, " $1") ?? event?.type ?? "Match phase";
  switch (action.kind) {
    case "receive":
      return "Possession";
    case "carry":
      return "Carry";
    case "pass":
      return "Passing move";
    case "throughBall":
      return "Through ball";
    case "cross":
      return "Cross";
    case "shot":
      return "Shot";
    case "save":
      return "Saved";
    case "block":
      return "Blocked";
    case "miss":
      return "Missed";
    case "goal":
      return "Goal";
  }
}

function isTerminalAction(action: MatchSequenceAction | undefined): boolean {
  return Boolean(action && ["goal", "save", "block", "miss"].includes(action.kind));
}

function playerPosition(
  base: MatchPitchPoint,
  ours: boolean,
  player: MatchLineupPlayer,
  action: MatchSequenceAction | undefined,
  ball: MatchPitchPoint,
  localProgress: number,
  inPossession: boolean,
  sourceType: MatchEvent["type"] | undefined,
): MatchPitchPoint {
  const clampX = (value: number) => Math.max(3, Math.min(97, value));
  const clampY = (value: number) => Math.max(5, Math.min(95, value));
  const direction = ours ? 1 : -1;

  if (inPossession && action?.playerId === player.playerId) {
    if (action.kind === "carry") {
      return {
        x: clampX(ball.x - direction * 1.8),
        y: clampY(ball.y + Math.sin(localProgress * Math.PI) * 1.2),
      };
    }
    if (["pass", "throughBall", "cross"].includes(action.kind)) {
      return { x: action.start.x, y: action.start.y };
    }
    if (action.kind === "shot") {
      return {
        x: clampX(action.start.x + direction * localProgress * 1.8),
        y: action.start.y,
      };
    }
  }

  if (inPossession && action?.targetPlayerId === player.playerId) {
    const settle = Math.max(0.2, localProgress);
    return {
      x: clampX(base.x + (action.end.x - base.x) * settle),
      y: clampY(base.y + (action.end.y - base.y) * settle),
    };
  }

  const defendingKeeper =
    player.role === "GK" &&
    !inPossession &&
    (sourceType === "goal" || sourceType === "chance") &&
    action &&
    (action.kind === "shot" || isTerminalAction(action));
  if (defendingKeeper && action) {
    const react = action.kind === "shot" ? localProgress : 1;
    const keeperX = ours ? 5.5 : 94.5;
    const goalY = Math.max(40, Math.min(60, action.end.y));
    return {
      x: base.x + (keeperX - base.x) * react,
      y: base.y + (goalY - base.y) * react,
    };
  }

  if (player.role === "GK") return base;

  const attackShift = inPossession ? 7 : -3;
  const ballPull = inPossession ? 0.1 : 0.07;
  return {
    x: clampX(base.x + direction * attackShift + (ball.x - base.x) * ballPull),
    y: clampY(base.y + (ball.y - base.y) * ballPull + (50 - base.y) * (inPossession ? 0.04 : 0.09)),
  };
}

function PlayerDot({
  x,
  y,
  ours = false,
  active = false,
  receiver = false,
  player,
  expanded = false,
}: {
  x: number;
  y: number;
  ours?: boolean;
  active?: boolean;
  receiver?: boolean;
  player: MatchLineupPlayer;
  expanded?: boolean;
}) {
  return (
    <span
      className={cn(
        "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border font-black leading-none shadow-sm transition-[left,top] duration-150 will-change-[left,top,transform]",
        expanded ? "size-5 text-[8px] sm:size-6 sm:text-[9px]" : "size-3.5 text-[6px] sm:size-4 sm:text-[7px]",
        ours ? "border-emerald-950 bg-emerald-300" : "border-rose-950 bg-rose-300",
        active && "z-20 scale-125 ring-2 ring-white/55",
        receiver && !active && "z-10 ring-2 ring-white/25",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
      title={`${player.shirtNumber}. ${player.name} · ${player.role}`}
    >
      {player.shirtNumber}
    </span>
  );
}

export function MatchPitchViewer({
  events,
  usName,
  themName,
  userLineup = [],
  opponentLineup = [],
  userBench = [],
  opponentBench = [],
  substitutions = [],
  onReplayProgress,
  expanded = false,
}: {
  events: MatchEvent[];
  usName: string;
  themName: string;
  userLineup?: MatchLineupPlayer[];
  opponentLineup?: MatchLineupPlayer[];
  userBench?: MatchLineupPlayer[];
  opponentBench?: MatchLineupPlayer[];
  substitutions?: MatchSubstitution[];
  onReplayProgress?: (revealedEvents: number, complete: boolean) => void;
  expanded?: boolean;
}) {
  const previousLength = useRef(0);
  const animationFrame = useRef<number | null>(null);
  const progressRef = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);

  useEffect(() => {
    if (events.length > previousLength.current) {
      setCursor(previousLength.current);
      progressRef.current = 0;
      setProgress(0);
      setPlaying(true);
      previousLength.current = events.length;
    }
  }, [events.length]);

  const active = events[Math.min(cursor, Math.max(0, events.length - 1))];
  const previousEvent = cursor > 0 ? events[cursor - 1] : undefined;
  const sequence = useMemo(
    () =>
      active
        ? buildMatchSequence({
            event: active,
            userLineup,
            opponentLineup,
            userBench,
            opponentBench,
            substitutions,
          })
        : null,
    [active, opponentBench, opponentLineup, substitutions, userBench, userLineup],
  );
  const bridge = useMemo(
    () => (active ? commentaryBridge(previousEvent, active, usName, themName) : null),
    [active, previousEvent, themName, usName],
  );
  const sequenceBaseDuration = eventDurationMs(active, sequence);
  const activeDuration = sequenceBaseDuration + (bridge?.durationMs ?? 0);
  const bridgeFraction = bridge ? bridge.durationMs / Math.max(1, activeDuration) : 0;
  const inBridge = Boolean(bridge && progress < bridgeFraction);
  const bridgeProgress = bridgeFraction > 0 ? Math.min(1, progress / bridgeFraction) : 1;
  const contentProgress =
    bridgeFraction < 1
      ? Math.max(0, Math.min(1, (progress - bridgeFraction) / Math.max(0.0001, 1 - bridgeFraction)))
      : 0;
  const frame = useMemo(
    () => (sequence && !inBridge ? frameForSequence(sequence, contentProgress) : null),
    [contentProgress, inBridge, sequence],
  );
  const ball = frame?.ball ?? (inBridge ? { x: 50, y: 50 } : fallbackEventPosition(active));
  const activeAction = frame?.action;

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const remaining = Math.max(0.06, 1 - progressRef.current);
    const duration = (activeDuration * remaining) / playbackSpeed;
    const timer = window.setTimeout(() => {
      if (cursor >= events.length - 1) {
        progressRef.current = 1;
        setProgress(1);
        setPlaying(false);
      } else {
        setCursor((current) => Math.min(events.length - 1, current + 1));
        progressRef.current = 0;
        setProgress(0);
      }
    }, duration);
    return () => window.clearTimeout(timer);
  }, [activeDuration, cursor, events.length, playbackSpeed, playing]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    let started: number | null = null;
    const startProgress = progressRef.current;
    const animate = (timestamp: number) => {
      started ??= timestamp;
      const elapsed = timestamp - started;
      const duration = activeDuration / playbackSpeed;
      const next = Math.min(1, startProgress + elapsed / (duration * 0.92));
      progressRef.current = next;
      setProgress(next);
      if (next < 1) animationFrame.current = window.requestAnimationFrame(animate);
    };
    animationFrame.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
    };
  }, [activeDuration, cursor, events.length, playbackSpeed, playing]);

  const activeResultVisible =
    sequence
      ? !inBridge && sequenceResultVisible(sequence, contentProgress)
      : !inBridge && contentProgress >= 0.88;
  const replayScore = useMemo(() => {
    const committed = events.slice(0, cursor).filter((event) => event.type === "goal");
    const activeGoal =
      active?.type === "goal" && activeResultVisible ? [active] : [];
    const visible = [...committed, ...activeGoal];
    return {
      us: visible.filter((event) => event.side === "us").length,
      them: visible.filter((event) => event.side === "them").length,
    };
  }, [active, activeResultVisible, cursor, events]);

  useEffect(() => {
    const revealed = Math.min(events.length, cursor + (activeResultVisible ? 1 : 0));
    const complete =
      events.length > 0 &&
      !playing &&
      cursor >= events.length - 1 &&
      progressRef.current >= 0.99;
    onReplayProgress?.(revealed, complete);
  }, [activeResultVisible, cursor, events.length, onReplayProgress, playing, progress]);

  if (events.length === 0) return null;

  const activeUserLineup = activeMatchLineupAtMinute(
    userLineup,
    userBench,
    substitutions,
    "us",
    active?.minute ?? 0,
  );
  const activeOpponentLineup = activeMatchLineupAtMinute(
    opponentLineup,
    opponentBench,
    substitutions,
    "them",
    active?.minute ?? 0,
  );
  const userShape = formationPositions(activeUserLineup, true);
  const opponentShape = formationPositions(activeOpponentLineup, false);
  const possessionSide = active?.side;
  const passLabel =
    activeAction?.targetPlayerName && activeAction.playerName
      ? `${activeAction.playerName.split(" ").pop()} → ${activeAction.targetPlayerName.split(" ").pop()}`
      : null;
  const actionCommentary =
    inBridge && bridge
      ? bridge.text
      : sequence && activeAction
        ? activeAction.commentary
        : active?.text ?? "The match settles into shape.";
  const displayMinute =
    inBridge && bridge
      ? bridgeMinute(bridge, bridgeProgress)
      : active?.minute ?? 0;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-[#07130f] text-white",
        expanded ? "h-full flex-1 p-3 sm:p-4" : "border-b p-2.5 sm:p-3",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          Live match simulation
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold tnum">
          <span className="max-w-24 truncate">{usName}</span>
          <strong className="rounded bg-black/25 px-2 py-0.5 font-display text-base">
            {replayScore.us}–{replayScore.them}
          </strong>
          <span className="max-w-24 truncate text-white/65">{themName}</span>
        </div>
      </div>

      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-white/25 bg-[linear-gradient(90deg,#17764f_0%,#17764f_12.5%,#1b8056_12.5%,#1b8056_25%,#17764f_25%,#17764f_37.5%,#1b8056_37.5%,#1b8056_50%,#17764f_50%,#17764f_62.5%,#1b8056_62.5%,#1b8056_75%,#17764f_75%,#17764f_87.5%,#1b8056_87.5%,#1b8056_100%)] shadow-inner",
          expanded ? "aspect-[1.58/1] max-h-[calc(100dvh-17rem)] flex-1" : "aspect-[1.62/1] max-h-52",
        )}
      >
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/55" />
        <div className="absolute left-1/2 top-1/2 aspect-square h-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55" />
        <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
        <div className="absolute inset-y-[22%] -left-px w-[15%] border border-white/55" />
        <div className="absolute inset-y-[22%] -right-px w-[15%] border border-white/55" />
        <div className="absolute inset-y-[36%] -left-px w-[6%] border border-white/55" />
        <div className="absolute inset-y-[36%] -right-px w-[6%] border border-white/55" />
        <div className="absolute left-[10%] top-1/2 size-1 -translate-y-1/2 rounded-full bg-white/60" />
        <div className="absolute right-[10%] top-1/2 size-1 -translate-y-1/2 rounded-full bg-white/60" />
        <div className="absolute left-0 top-[42%] h-[16%] w-[1.8%] border-y border-r border-white/70 bg-white/10" />
        <div className="absolute right-0 top-[42%] h-[16%] w-[1.8%] border-y border-l border-white/70 bg-white/10" />

        {sequence && (
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {sequence.actions
              .filter((item) => item.start.x !== item.end.x || item.start.y !== item.end.y)
              .map((item, index) => (
                <line
                  key={item.id}
                  x1={item.start.x}
                  y1={item.start.y}
                  x2={item.end.x}
                  y2={item.end.y}
                  stroke={
                    index < (frame?.actionIndex ?? 0)
                      ? active?.side === "them"
                        ? "#fda4af"
                        : "#6ee7b7"
                      : "rgba(255,255,255,.12)"
                  }
                  strokeWidth={index <= (frame?.actionIndex ?? -1) ? 0.75 : 0.45}
                  strokeDasharray={item.kind === "carry" ? "1 1.5" : undefined}
                  opacity={index <= (frame?.actionIndex ?? -1) ? 0.7 : 0.5}
                />
              ))}
          </svg>
        )}

        {activeUserLineup.map((player) => {
          const base = userShape.get(player.playerId) ?? { x: 45, y: 50 };
          const position = playerPosition(
            base,
            true,
            player,
            activeAction,
            ball,
            frame?.localProgress ?? progress,
            possessionSide === "us",
            active?.type,
          );
          return (
            <PlayerDot
              key={`us-${player.playerId}`}
              x={position.x}
              y={position.y}
              ours
              active={activeAction?.playerId === player.playerId}
              receiver={activeAction?.targetPlayerId === player.playerId}
              player={player}
              expanded={expanded}
            />
          );
        })}
        {activeOpponentLineup.map((player) => {
          const base = opponentShape.get(player.playerId) ?? { x: 55, y: 50 };
          const position = playerPosition(
            base,
            false,
            player,
            activeAction,
            ball,
            frame?.localProgress ?? progress,
            possessionSide === "them",
            active?.type,
          );
          return (
            <PlayerDot
              key={`them-${player.playerId}`}
              x={position.x}
              y={position.y}
              active={activeAction?.playerId === player.playerId}
              receiver={activeAction?.targetPlayerId === player.playerId}
              player={player}
              expanded={expanded}
            />
          );
        })}

        <span
          className={cn(
            "absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/25 bg-white shadow-[0_1px_7px_rgba(0,0,0,.85)]",
            expanded ? "size-3" : "size-2.5",
          )}
          style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
        />

        {passLabel && activeAction && ["pass", "throughBall", "cross"].includes(activeAction.kind) && (
          <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-bold text-white/85 shadow-sm backdrop-blur-sm">
            {passLabel}
          </div>
        )}

        {activeAction?.kind === "goal" && frame && frame.localProgress >= 0.2 && (
          <>
            <span
              className="absolute z-30 size-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-amber-300"
              style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
            />
            <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-amber-200/50 bg-amber-300 px-4 py-1.5 font-display text-lg text-amber-950 shadow-lg">
              GOAL
            </div>
          </>
        )}
        {activeAction && ["save", "block", "miss"].includes(activeAction.kind) && frame && frame.localProgress >= 0.2 && (
          <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-white/20 bg-black/70 px-3 py-1 font-display text-sm uppercase tracking-wide text-white shadow-lg">
            {activeAction.kind === "save" ? "SAVED" : activeAction.kind === "block" ? "BLOCKED" : "MISSED"}
          </div>
        )}

        <div className="absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[10px] font-bold tnum backdrop-blur-sm">
          {displayMinute}'
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm">
          {inBridge ? "Match flow" : actionStage(activeAction, active)}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(0);
            progressRef.current = 0;
            setProgress(0);
            setPlaying(true);
          }}
          aria-label="Restart replay"
        >
          <RotateCcw className="size-4" />
        </button>
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-400 text-[#07130f] hover:bg-emerald-300"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <input
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-400"
          type="range"
          min={0}
          max={events.length - 1}
          value={cursor}
          onChange={(event) => {
            setCursor(Number(event.target.value));
            progressRef.current = 1;
            setProgress(1);
            setPlaying(false);
          }}
          aria-label="Replay event"
        />
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => setPlaybackSpeed(speed)}
              className={cn(
                "min-w-8 px-1.5 py-2 text-[9px] font-bold",
                playbackSpeed === speed ? "bg-white text-[#07130f]" : "text-white/65 hover:bg-white/10",
              )}
              aria-label={`Replay speed ${speed} times`}
            >
              {speed}×
            </button>
          ))}
        </div>
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(events.length - 1);
            progressRef.current = 1;
            setProgress(1);
            setPlaying(false);
          }}
          aria-label="Skip replay"
        >
          <SkipForward className="size-4" />
        </button>
      </div>

      <div
        className={cn(
          "mt-2 min-h-12 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-snug",
          activeAction?.kind === "goal" && "border-amber-300/40 bg-amber-300/10",
        )}
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 font-bold text-emerald-300 tnum">{displayMinute}'</span>
          <span>{actionCommentary}</span>
        </div>
      </div>
    </div>
  );
}
