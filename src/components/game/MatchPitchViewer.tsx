import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import type { MatchEvent } from "@/lib/game/types";
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

function eventPosition(event: MatchEvent | undefined): { x: number; y: number } {
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

export function MatchPitchViewer({
  events,
  usName,
  themName,
}: {
  events: MatchEvent[];
  usName: string;
  themName: string;
}) {
  const previousLength = useRef(0);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (events.length > previousLength.current) {
      setCursor(previousLength.current);
      setPlaying(true);
      previousLength.current = events.length;
    }
  }, [events.length]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    if (cursor >= events.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setCursor((current) => Math.min(events.length - 1, current + 1)),
      1_250,
    );
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, playing]);

  const active = events[Math.min(cursor, Math.max(0, events.length - 1))];
  const ball = eventPosition(active);
  const replayScore = useMemo(() => {
    const visible = events.slice(0, cursor + 1).filter((event) => event.type === "goal");
    return {
      us: visible.filter((event) => event.side === "us").length,
      them: visible.filter((event) => event.side === "them").length,
    };
  }, [cursor, events]);

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

        {HOME_SHAPE.map(([x, y], index) => (
          <PlayerDot
            key={`us-${index}`}
            x={x}
            y={y}
            ours
            active={active?.side === "us" && index > 6}
          />
        ))}
        {AWAY_SHAPE.map(([x, y], index) => (
          <PlayerDot
            key={`them-${index}`}
            x={x}
            y={y}
            active={active?.side === "them" && index > 6}
          />
        ))}

        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/25 bg-white shadow-[0_1px_5px_rgba(0,0,0,.8)] transition-[left,top] duration-700 ease-out"
          style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
        />
        {active?.type === "goal" && (
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
}: {
  x: number;
  y: number;
  ours?: boolean;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm transition-transform duration-500",
        ours ? "border-emerald-950 bg-emerald-300" : "border-rose-950 bg-rose-300",
        active && "scale-125 ring-2 ring-white/35",
      )}
      style={{ left: `${x}%`, top: `${y}%` }}
    />
  );
}
