import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe2 } from "lucide-react";

import type { GameState } from "@/lib/game/types";
import { playerLeagueId, tableFor } from "@/lib/game/league";
import { cn } from "@/lib/utils";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { footballLevelOfLeague } from "@/lib/game/footballLevel";
import { clubPresentationName, leaguePresentationName } from "@/lib/game/clubPresentation";

export function WorldInspector({ state }: { state: GameState }) {
  const leagues = useMemo(
    () => [...state.leagues].sort((a, b) => a.tier - b.tier),
    [state.leagues],
  );
  const playerLeague = playerLeagueId(state);
  const initialIndex = Math.max(
    0,
    leagues.findIndex((league) => league.id === playerLeague),
  );
  const [index, setIndex] = useState(initialIndex);
  const safeIndex = Math.min(index, Math.max(0, leagues.length - 1));
  const league = leagues[safeIndex];
  const rows = league ? tableFor(state, league.id) : [];

  if (!league) return null;

  const move = (delta: number) => {
    setIndex((current) => Math.max(0, Math.min(leagues.length - 1, current + delta)));
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-full">
      <header className="flex shrink-0 items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
            <Globe2 className="size-4" /> Football world
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <h1 className="font-display text-2xl sm:text-3xl">League tables</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Slide sideways to change division.
            </p>
          </div>
        </div>
        <div className="hidden text-right text-xs text-muted-foreground sm:block">
          Season {state.season} · {leagues.length} divisions
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {leagues.map((item, itemIndex) => (
          <button
            key={item.id}
            onClick={() => setIndex(itemIndex)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              itemIndex === safeIndex
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {leaguePresentationName(item.name)}
          </button>
        ))}
      </div>

      <div
        className="touch-pan-y flex flex-col rounded-2xl border bg-card shadow-sm lg:min-h-0 lg:flex-1 lg:overflow-hidden"
        onTouchStart={(event) => {
          event.currentTarget.dataset.touchX = String(event.touches[0]?.clientX ?? 0);
        }}
        onTouchEnd={(event) => {
          const start = Number(event.currentTarget.dataset.touchX ?? 0);
          const end = event.changedTouches[0]?.clientX ?? start;
          if (Math.abs(end - start) < 55) return;
          move(end < start ? 1 : -1);
        }}
      >
        <div className="panel-strip flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <button
            aria-label="Previous division"
            disabled={safeIndex === 0}
            onClick={() => move(-1)}
            className="grid size-8 place-items-center rounded-lg bg-black/15 disabled:opacity-25"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate font-display text-lg sm:text-xl">{leaguePresentationName(league.name)}</div>
            <div className="text-[11px] opacity-70">
              Football Level {footballLevelOfLeague(league)} · {league.clubIds.length} clubs
              {league.id === playerLeague ? " · Your division" : ""}
            </div>
          </div>
          <button
            aria-label="Next division"
            disabled={safeIndex === leagues.length - 1}
            onClick={() => move(1)}
            className="grid size-8 place-items-center rounded-lg bg-black/15 disabled:opacity-25"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="overflow-x-auto lg:contained-scroll lg:flex-1">
          <table className="w-full min-w-[430px] text-sm tnum">
            <thead className="sticky top-0 z-[1] border-b bg-card text-[10px] uppercase tracking-wide text-muted-foreground shadow-sm">
              <tr>
                <th className="w-10 px-3 py-1.5 text-left">#</th>
                <th className="py-1.5 text-left">Club</th>
                <th className="px-2 py-1.5 text-right">P</th>
                <th className="px-2 py-1.5 text-right">W</th>
                <th className="px-2 py-1.5 text-right">D</th>
                <th className="px-2 py-1.5 text-right">L</th>
                <th className="px-2 py-1.5 text-right">GD</th>
                <th className="px-3 py-1.5 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const isMe = isUserClubReference(state, row.team);
                const promotion = league.promotionPlaces > 0 && rowIndex < league.promotionPlaces;
                const relegation =
                  league.relegationPlaces > 0 && rowIndex >= rows.length - league.relegationPlaces;
                return (
                  <tr
                    key={row.team}
                    className={cn("border-b last:border-0", isMe && "bg-primary/10 font-semibold")}
                  >
                    <td className="px-3 py-1.5 text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex min-w-6 justify-center rounded-md px-1 py-0.5",
                          promotion && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                          relegation && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {rowIndex + 1}
                      </span>
                    </td>
                    <td className="max-w-48 truncate py-1.5 pr-2">
                      {clubPresentationName(clubDisplayName(state, row.team))}
                      {isMe ? " · YOU" : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{row.p}</td>
                    <td className="px-2 py-1.5 text-right">{row.w}</td>
                    <td className="px-2 py-1.5 text-right">{row.d}</td>
                    <td className="px-2 py-1.5 text-right">{row.l}</td>
                    <td className="px-2 py-1.5 text-right">{row.gf - row.ga}</td>
                    <td className="px-3 py-1.5 text-right font-display text-base">{row.pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-1.5">
        {leagues.map((item, itemIndex) => (
          <button
            key={item.id}
            aria-label={`Open ${leaguePresentationName(item.name)}`}
            onClick={() => setIndex(itemIndex)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              itemIndex === safeIndex ? "w-7 bg-primary" : "w-1.5 bg-muted-foreground/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}
