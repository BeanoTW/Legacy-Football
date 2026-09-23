import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { MatchEvent, MatchLineupPlayer } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const HOME_SHAPE = [
  [8, 50],
  [24, 15],
  [22, 38],
  [22, 62],
  [24, 85],
  [43, 24],
  [40, 50],
  [43, 76],
  [65, 18],
  [69, 50],
  [65, 82],
] as const;
const AWAY_SHAPE = HOME_SHAPE.map(([x, y]) => [100 - x, 100 - y] as const);
const EVENT_MS = 2_450;

interface PitchPoint {
  x: number;
  y: number;
}

function eventSeed(event: MatchEvent | undefined): number {
  if (!event) return 0;
  return (
    event.sequenceId?.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) ??
    event.minute * 31
  );
}

function chanceOutcome(event: MatchEvent): "saved" | "wide" | "blocked" | "over" {
  const text = event.text.toLowerCase();
  if (text.includes("save") || text.includes("smother")) return "saved";
  if (text.includes("block") || text.includes("turned behind")) return "blocked";
  if (text.includes("over")) return "over";
  if (text.includes("wide") || text.includes("dragged")) return "wide";
  return ["saved", "wide", "blocked", "over"][eventSeed(event) % 4] as "saved" | "wide" | "blocked" | "over";
}

function eventPosition(event: MatchEvent | undefined): PitchPoint {
  if (!event) return { x: 50, y: 50 };
  const attackingX =
    event.zone === "box"
      ? 90
      : event.zone === "attackingThird"
        ? 76
        : event.zone === "middleThird"
          ? 55
          : 29;
  const phaseNudge =
    event.phase === "transition"
      ? 4
      : event.phase === "setPiece"
        ? 1
        : event.phase === "finalThird"
          ? 5
          : 0;
  const x = event.side === "them" ? 100 - attackingX - phaseNudge : attackingX + phaseNudge;
  const seed = eventSeed(event);
  return { x: Math.max(4, Math.min(96, x)), y: 16 + ((seed * 17) % 69) };
}

function attackingDirection(event: MatchEvent): 1 | -1 {
  return event.side === "them" ? -1 : 1;
}

function shotEnd(event: MatchEvent): PitchPoint {
  const direction = attackingDirection(event);
  const seed = eventSeed(event);
  if (event.type === "goal") {
    return {
      x: direction === 1 ? 99.3 : 0.7,
      y: 44 + (seed % 13),
    };
  }

  const outcome = chanceOutcome(event);
  if (outcome === "saved") {
    return {
      x: direction === 1 ? 94.5 : 5.5,
      y: 43 + (seed % 15),
    };
  }
  if (outcome === "blocked") {
    return {
      x: direction === 1 ? 86 : 14,
      y: 34 + (seed % 33),
    };
  }
  if (outcome === "over") {
    return {
      x: direction === 1 ? 98 : 2,
      y: seed % 2 === 0 ? 34 : 66,
    };
  }
  return {
    x: direction === 1 ? 98 : 2,
    y: seed % 2 === 0 ? 27 : 73,
  };
}

function eventPath(event: MatchEvent | undefined): PitchPoint[] {
  if (!event) return [{ x: 50, y: 50 }];
  const target = eventPosition(event);
  if (event.type === "card" || event.side === "neutral") return [target];

  const direction = attackingDirection(event);
  const seed = eventSeed(event);
  const shotEvent = event.type === "goal" || event.type === "chance";
  const end = shotEvent ? shotEnd(event) : target;
  const startX =
    event.phase === "transition"
      ? target.x - direction * 48
      : event.phase === "setPiece"
        ? target.x - direction * 24
        : target.x - direction * 36;
  const startY = 14 + ((seed * 11) % 73);
  const laneA = ((seed % 5) - 2) * 6;
  const laneB = (((seed >> 2) % 5) - 2) * 5;
  const clampX = (x: number) => Math.max(1, Math.min(99, x));
  const clampY = (y: number) => Math.max(7, Math.min(93, y));
  const shotOrigin = {
    x: direction === 1 ? Math.min(88, target.x - 4) : Math.max(12, target.x + 4),
    y: clampY(38 + ((seed * 7) % 25)),
  };

  const buildUp: PitchPoint[] = [
    { x: clampX(startX), y: clampY(startY) },
    {
      x: clampX(startX + direction * Math.abs(target.x - startX) * 0.22),
      y: clampY(startY + laneA),
    },
    {
      x: clampX(startX + direction * Math.abs(target.x - startX) * 0.5),
      y: clampY((startY * 0.55 + shotOrigin.y * 0.45) + laneB),
    },
  ];

  if (!shotEvent) return [...buildUp, target];

  return [
    ...buildUp,
    shotOrigin,
    {
      x: shotOrigin.x + (end.x - shotOrigin.x) * 0.52,
      y: shotOrigin.y + (end.y - shotOrigin.y) * 0.52,
    },
    end,
  ];
}
function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t2 +
    (-a + 3 * b - 3 * c + d) * t3
  );
}

function pointOnPath(path: PitchPoint[], progress: number): PitchPoint {
  if (path.length === 1) return path[0];
  const scaled = Math.max(0, Math.min(0.9999, progress)) * (path.length - 1);
  const index = Math.floor(scaled);
  const t = scaled - index;
  const p0 = path[Math.max(0, index - 1)];
  const p1 = path[index];
  const p2 = path[Math.min(path.length - 1, index + 1)];
  const p3 = path[Math.min(path.length - 1, index + 2)];
  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
  };
}

function playerPosition(
  baseX: number,
  baseY: number,
  ours: boolean,
  index: number,
  event: MatchEvent | undefined,
  ball: PitchPoint,
  progress: number,
): PitchPoint {
  if (!event || event.side === "neutral" || index === 0) return { x: baseX, y: baseY };

  const inPossession = (event.side === "us") === ours;
  const direction = ours ? 1 : -1;
  const seed = eventSeed(event) + index * 23 + (ours ? 11 : 37);
  const attackLine = index > 7 ? 10 : index > 4 ? 6 : 2.5;
  const retreatLine = index > 7 ? -5 : index > 4 ? -3 : -1;
  const phasePulse = Math.sin(progress * Math.PI);
  const lineShift = (inPossession ? attackLine : retreatLine) * phasePulse;
  const ballPull = (inPossession ? 0.18 : 0.11) * (0.55 + phasePulse * 0.45);
  const compactY = inPossession ? 0.08 : 0.15;
  const laneMotion = Math.sin(progress * Math.PI * 2 + (seed % 7)) * (index === 0 ? 0 : 1.8);

  return {
    x: Math.max(
      3,
      Math.min(97, baseX + direction * lineShift + (ball.x - baseX) * ballPull),
    ),
    y: Math.max(
      5,
      Math.min(
        95,
        baseY +
          (ball.y - baseY) * ballPull +
          (50 - baseY) * compactY * phasePulse +
          laneMotion,
      ),
    ),
  };
}

export function MatchPitchViewer({
  events,
  usName,
  themName,
  userLineup = [],
  opponentLineup = [],
  onReplayProgress,
  expanded = false,
}: {
  events: MatchEvent[];
  usName: string;
  themName: string;
  userLineup?: MatchLineupPlayer[];
  opponentLineup?: MatchLineupPlayer[];
  onReplayProgress?: (revealedEvents: number, complete: boolean) => void;
  expanded?: boolean;
}) {
  const previousLength = useRef(0);
  const animationFrame = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (events.length > previousLength.current) {
      setCursor(previousLength.current);
      setProgress(0);
      setPlaying(true);
      previousLength.current = events.length;
    }
  }, [events.length]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const timer = window.setTimeout(() => {
      if (cursor >= events.length - 1) setPlaying(false);
      else {
        setCursor((current) => Math.min(events.length - 1, current + 1));
        setProgress(0);
      }
    }, EVENT_MS);
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, playing]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    let started: number | null = null;
    const animate = (timestamp: number) => {
      started ??= timestamp;
      const elapsed = timestamp - started;
      setProgress(Math.min(1, elapsed / (EVENT_MS * 0.78)));
      if (elapsed < EVENT_MS * 0.78) {
        animationFrame.current = window.requestAnimationFrame(animate);
      }
    };
    animationFrame.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current !== null) window.cancelAnimationFrame(animationFrame.current);
    };
  }, [cursor, playing, events.length]);

  const active = events[Math.min(cursor, Math.max(0, events.length - 1))];
  const path = useMemo(() => eventPath(active), [active]);
  const ball = useMemo(() => pointOnPath(path, progress), [path, progress]);

  useEffect(() => {
    if (!playing) setProgress(1);
  }, [playing]);

  const replayScore = useMemo(() => {
    const committed = events.slice(0, cursor).filter((event) => event.type === "goal");
    const activeGoalVisible = active?.type === "goal" && progress >= 0.9 ? [active] : [];
    const visible = [...committed, ...activeGoalVisible];
    return {
      us: visible.filter((event) => event.side === "us").length,
      them: visible.filter((event) => event.side === "them").length,
    };
  }, [active, cursor, events, progress]);

  useEffect(() => {
    onReplayProgress?.(cursor + 1, !playing && cursor >= events.length - 1);
  }, [cursor, events.length, onReplayProgress, playing]);

  if (events.length === 0) return null;

  const completedPoints = Math.max(1, Math.ceil(progress * path.length));

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-[#07130f] text-white",
        expanded ? "h-full flex-1 p-3 sm:p-4" : "border-b p-2.5 sm:p-3",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          2D match replay
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

        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={path.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,.13)"
            strokeWidth="0.55"
            strokeDasharray="1.5 2"
          />
          <polyline
            points={path.slice(0, completedPoints).map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke={active?.side === "them" ? "#fda4af" : "#6ee7b7"}
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        </svg>

        {HOME_SHAPE.map(([x, y], index) => {
          const position = playerPosition(x, y, true, index, active, ball, progress);
          return (
            <PlayerDot
              key={`us-${index}`}
              x={position.x}
              y={position.y}
              ours
              active={active?.side === "us" && Math.abs(position.x - ball.x) < 18 && Math.abs(position.y - ball.y) < 22}
              player={userLineup[index]}
              expanded={expanded}
            />
          );
        })}
        {AWAY_SHAPE.map(([x, y], index) => {
          const position = playerPosition(x, y, false, index, active, ball, progress);
          return (
            <PlayerDot
              key={`them-${index}`}
              x={position.x}
              y={position.y}
              active={active?.side === "them" && Math.abs(position.x - ball.x) < 18 && Math.abs(position.y - ball.y) < 22}
              player={opponentLineup[index]}
              expanded={expanded}
            />
          );
        })}

        <span
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/25 bg-white shadow-[0_1px_7px_rgba(0,0,0,.85)]",
            expanded ? "size-3" : "size-2.5",
          )}
          style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
        />
        {active?.type === "goal" && progress > 0.9 && (
          <>
            <span
              className="absolute size-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-amber-300"
              style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
            />
            <div className="absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full border border-amber-200/50 bg-amber-300 px-4 py-1.5 font-display text-lg text-amber-950 shadow-lg">
              GOAL
            </div>
          </>
        )}

        <div className="absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[10px] font-bold tnum backdrop-blur-sm">
          {active?.minute ?? 0}'
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/45 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm">
          {active?.phase?.replace(/([A-Z])/g, " $1") ?? "match phase"}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(0);
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
            setProgress(1);
            setPlaying(false);
          }}
          aria-label="Replay event"
        />
        <button
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(events.length - 1);
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
          "mt-2 min-h-11 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-snug",
          active?.type === "goal" && progress >= 0.9 && "border-amber-300/40 bg-amber-300/10",
        )}
        aria-live="polite"
      >
        <span className="mr-2 font-bold text-emerald-300 tnum">{active?.minute}'</span>
        {active?.type === "goal" && progress < 0.9
          ? `${active.actorName ?? (active.side === "us" ? usName : themName)} attacks the box…`
          : active?.text}
      </div>
    </div>
  );
}

function PlayerDot({
  x,
  y,
  ours = false,
  active = false,
  player,
  expanded = false,
}: {
  x: number;
  y: number;
  ours?: boolean;
  active?: boolean;
  player?: MatchLineupPlayer;
  expanded?: boolean;
}) {
  return (
    <span
      className={cn(
        "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border font-black leading-none shadow-sm will-change-[left,top,transform]",
        expanded ? "size-5 text-[8px] sm:size-6 sm:text-[9px]" : "size-3.5 text-[6px] sm:size-4 sm:text-[7px]",
        ours ? "border-emerald-950 bg-emerald-300" : "border-rose-950 bg-rose-300",
        active && "scale-125 ring-2 ring-white/35",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
      title={player ? `${player.shirtNumber}. ${player.name} · ${player.role}` : undefined}
    >
      {player?.shirtNumber}
    </span>
  );
}
