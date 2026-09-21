import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { MatchEvent, MatchLineupPlayer } from "@/lib/game/types";
import { cn } from "@/lib/utils";

const HOME_SHAPE = [
  [10, 50],
  [25, 18],
  [23, 39],
  [23, 61],
  [25, 82],
  [43, 27],
  [41, 50],
  [43, 73],
  [62, 23],
  [66, 50],
  [62, 77],
] as const;
const AWAY_SHAPE = HOME_SHAPE.map(([x, y]) => [100 - x, 100 - y] as const);

interface PitchPoint {
  x: number;
  y: number;
}

function eventPosition(event: MatchEvent | undefined): PitchPoint {
  if (!event) return { x: 50, y: 50 };
  const attackingX =
    event.zone === "box"
      ? 88
      : event.zone === "attackingThird"
        ? 74
        : event.zone === "middleThird"
          ? 52
          : 28;
  const phaseNudge =
    event.phase === "transition"
      ? 5
      : event.phase === "setPiece"
        ? 2
        : event.phase === "finalThird"
          ? 7
          : 0;
  const x = event.side === "them" ? 100 - attackingX - phaseNudge : attackingX + phaseNudge;
  const seed =
    event.sequenceId?.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) ?? event.minute;
  return { x: Math.max(5, Math.min(95, x)), y: 20 + ((seed * 17) % 61) };
}

function eventPath(event: MatchEvent | undefined): PitchPoint[] {
  if (!event) return [{ x: 50, y: 50 }];
  const target = eventPosition(event);
  if (event.type === "card" || event.side === "neutral") return [target];
  const direction = event.side === "them" ? -1 : 1;
  const seed =
    event.sequenceId?.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) ?? event.minute;
  const width = event.phase === "transition" ? 38 : event.phase === "setPiece" ? 20 : 28;
  const startY = 18 + ((seed * 11) % 65);
  const middleY = Math.max(12, Math.min(88, (startY + target.y) / 2 + ((seed % 3) - 1) * 12));
  const clampX = (x: number) => Math.max(5, Math.min(95, x));
  return [
    { x: clampX(target.x - direction * width), y: startY },
    { x: clampX(target.x - direction * width * 0.48), y: middleY },
    target,
  ];
}

function playerPosition(
  baseX: number,
  baseY: number,
  ours: boolean,
  index: number,
  event: MatchEvent | undefined,
  ball: PitchPoint,
  frame: number,
): PitchPoint {
  if (!event || event.side === "neutral" || index === 0) return { x: baseX, y: baseY };
  const inPossession = (event.side === "us") === ours;
  const direction = ours ? 1 : -1;
  const frameWeight = frame / 2;
  const lineAdvance = inPossession ? (index > 7 ? 8 : index > 4 ? 5 : 2) * frameWeight : 0;
  const ballPull = inPossession ? 0.12 : 0.08;
  return {
    x: Math.max(4, Math.min(96, baseX + direction * lineAdvance + (ball.x - baseX) * ballPull)),
    y: Math.max(7, Math.min(93, baseY + (ball.y - baseY) * ballPull)),
  };
}

export function MatchPitchViewer({
  events,
  usName,
  themName,
  userLineup = [],
  opponentLineup = [],
  onReplayProgress,
}: {
  events: MatchEvent[];
  usName: string;
  themName: string;
  userLineup?: MatchLineupPlayer[];
  opponentLineup?: MatchLineupPlayer[];
  onReplayProgress?: (revealedEvents: number, complete: boolean) => void;
}) {
  const previousLength = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (events.length > previousLength.current) {
      setCursor(previousLength.current);
      setPlaying(true);
      previousLength.current = events.length;
    }
  }, [events.length]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const timer = window.setTimeout(() => {
      if (cursor >= events.length - 1) setPlaying(false);
      else setCursor((current) => Math.min(events.length - 1, current + 1));
    }, 1_850);
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, playing]);

  const active = events[Math.min(cursor, Math.max(0, events.length - 1))];
  const path = useMemo(() => eventPath(active), [active]);
  const ball = path[Math.min(frame, path.length - 1)];

  useEffect(() => {
    if (!playing) {
      setFrame(path.length - 1);
      return;
    }
    setFrame(0);
    if (path.length === 1) return;
    const middle = window.setTimeout(() => setFrame(1), 450);
    const finish = window.setTimeout(() => setFrame(path.length - 1), 950);
    return () => {
      window.clearTimeout(middle);
      window.clearTimeout(finish);
    };
  }, [active?.sequenceId, active?.minute, path.length, playing]);
  const replayScore = useMemo(() => {
    const visible = events.slice(0, cursor + 1).filter((event) => event.type === "goal");
    return {
      us: visible.filter((event) => event.side === "us").length,
      them: visible.filter((event) => event.side === "them").length,
    };
  }, [cursor, events]);

  useEffect(() => {
    onReplayProgress?.(cursor + 1, !playing && cursor >= events.length - 1);
  }, [cursor, events.length, onReplayProgress, playing]);

  if (events.length === 0) return null;

  return (
    <div className="border-b bg-[#07130f] p-2.5 text-white sm:p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
          2D match replay
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold tnum">
          <span className="max-w-20 truncate">{usName}</span>
          <strong className="rounded bg-black/25 px-2 py-0.5 font-display text-base">
            {replayScore.us}–{replayScore.them}
          </strong>
          <span className="max-w-20 truncate text-white/65">{themName}</span>
        </div>
      </div>

      <div className="relative aspect-[1.62/1] max-h-32 overflow-hidden rounded-xl border border-white/25 bg-[linear-gradient(90deg,#17764f_0%,#17764f_12.5%,#1b8056_12.5%,#1b8056_25%,#17764f_25%,#17764f_37.5%,#1b8056_37.5%,#1b8056_50%,#17764f_50%,#17764f_62.5%,#1b8056_62.5%,#1b8056_75%,#17764f_75%,#17764f_87.5%,#1b8056_87.5%,#1b8056_100%)] shadow-inner sm:max-h-52">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/55" />
        <div className="absolute left-1/2 top-1/2 aspect-square h-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/55" />
        <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70" />
        <div className="absolute inset-y-[22%] -left-px w-[15%] border border-white/55" />
        <div className="absolute inset-y-[22%] -right-px w-[15%] border border-white/55" />
        <div className="absolute inset-y-[36%] -left-px w-[6%] border border-white/55" />
        <div className="absolute inset-y-[36%] -right-px w-[6%] border border-white/55" />

        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={path.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,.2)"
            strokeWidth="0.7"
            strokeDasharray="2 2"
          />
          <polyline
            points={path
              .slice(0, frame + 1)
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke={active?.side === "them" ? "#fda4af" : "#6ee7b7"}
            strokeWidth="1.15"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {HOME_SHAPE.map(([x, y], index) => {
          const position = playerPosition(x, y, true, index, active, ball, frame);
          return (
            <PlayerDot
              key={`us-${index}`}
              x={position.x}
              y={position.y}
              ours
              active={active?.side === "us" && index > 6}
              player={userLineup[index]}
            />
          );
        })}
        {AWAY_SHAPE.map(([x, y], index) => {
          const position = playerPosition(x, y, false, index, active, ball, frame);
          return (
            <PlayerDot
              key={`them-${index}`}
              x={position.x}
              y={position.y}
              active={active?.side === "them" && index > 6}
              player={opponentLineup[index]}
            />
          );
        })}

        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/25 bg-white shadow-[0_1px_5px_rgba(0,0,0,.8)] transition-[left,top] duration-500 ease-out"
          style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
        />
        {active?.type === "goal" && frame === path.length - 1 && (
          <span
            className="absolute size-10 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-amber-300"
            style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
          />
        )}

        <div className="absolute bottom-1.5 left-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-bold tnum backdrop-blur-sm">
          {active?.minute ?? 0}'
        </div>
        <div className="absolute bottom-1.5 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/75 backdrop-blur-sm">
          {active?.phase?.replace(/([A-Z])/g, " $1") ?? "match phase"}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(0);
            setPlaying(true);
          }}
          aria-label="Restart replay"
        >
          <RotateCcw className="size-3.5" />
        </button>
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-400 text-[#07130f] hover:bg-emerald-300"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? "Pause replay" : "Play replay"}
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <input
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-emerald-400"
          type="range"
          min={0}
          max={events.length - 1}
          value={cursor}
          onChange={(event) => {
            setCursor(Number(event.target.value));
            setPlaying(false);
          }}
          aria-label="Replay event"
        />
        <button
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 hover:bg-white/20"
          onClick={() => {
            setCursor(events.length - 1);
            setPlaying(false);
          }}
          aria-label="Skip replay"
        >
          <SkipForward className="size-3.5" />
        </button>
      </div>
      <div
        className={cn(
          "mt-2 min-h-10 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-snug",
          active?.type === "goal" && "border-amber-300/40 bg-amber-300/10",
        )}
        aria-live="polite"
      >
        <span className="mr-2 font-bold text-emerald-300 tnum">{active?.minute}'</span>
        {active?.text}
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
}: {
  x: number;
  y: number;
  ours?: boolean;
  active?: boolean;
  player?: MatchLineupPlayer;
}) {
  return (
    <span
      className={cn(
        "absolute grid size-3.5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[6px] font-black leading-none shadow-sm transition-[left,top,transform] duration-500 sm:size-4 sm:text-[7px]",
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
