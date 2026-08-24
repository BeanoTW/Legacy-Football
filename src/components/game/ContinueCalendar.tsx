import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, MailWarning, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { Tab } from "./tabs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MATCH_DAY = 5;

export function ContinueCalendar({
  state,
  day,
  setDay,
  advanceWeek,
  startMatch,
  setTab,
}: {
  state: GameState;
  day: number;
  setDay: (day: number) => void;
  advanceWeek: () => void;
  startMatch: () => void;
  setTab: (tab: Tab) => void;
}) {
  const [animating, setAnimating] = useState(false);
  const fixture = state.fixtures.find((item) => item.week === state.week);
  const decisions = state.inbox.filter((item) => item.status === "awaitingDecision").length;
  const matchReady = !!fixture && day >= MATCH_DAY;

  useEffect(() => {
    setDay(0);
    setAnimating(false);
  }, [setDay, state.season, state.week]);

  const moveTo = async (target: number) => {
    setAnimating(true);
    for (let next = day + 1; next <= target; next++) {
      await new Promise((resolve) => window.setTimeout(resolve, 110));
      setDay(next);
    }
    setAnimating(false);
  };

  const handleContinue = async () => {
    if (animating) return;
    if (decisions > 0) {
      setTab("inbox");
      return;
    }
    if (matchReady) {
      startMatch();
      return;
    }
    if (fixture && day < MATCH_DAY) {
      await moveTo(MATCH_DAY);
      return;
    }
    if (day < DAYS.length - 1) await moveTo(DAYS.length - 1);
    advanceWeek();
  };

  const buttonLabel = decisions
    ? `Review ${decisions} decision${decisions === 1 ? "" : "s"}`
    : animating
      ? "Continuing…"
      : matchReady
        ? "Start match"
        : "Continue";

  return (
    <div className="border-b bg-card">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5">
        <div className="hidden shrink-0 items-center gap-2 pr-2 sm:flex">
          <CalendarDays className="size-4 text-primary" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Calendar
            </div>
            <div className="text-xs font-semibold">Week {state.week}</div>
          </div>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {DAYS.map((label, index) => {
            const isMatch = !!fixture && index === MATCH_DAY;
            const active = index === day;
            const passed = index < day;
            return (
              <div
                key={label}
                className={cn(
                  "relative rounded-md border px-1 py-1.5 text-center transition-all",
                  active && "border-primary bg-primary text-primary-foreground shadow-sm",
                  passed && "border-primary/20 bg-primary/5 text-muted-foreground",
                  !active && !passed && "bg-background text-muted-foreground",
                )}
              >
                <div className="text-[9px] font-semibold uppercase tracking-wide sm:text-[10px]">
                  {label}
                </div>
                {isMatch && (
                  <span
                    className={cn(
                      "absolute -right-1 -top-1 size-2 rounded-full bg-amber-500 ring-2 ring-card",
                      active && "ring-primary",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        <Button
          size="sm"
          className={cn("min-w-28 shrink-0", decisions > 0 && "bg-amber-500 hover:bg-amber-600")}
          disabled={animating}
          onClick={() => void handleContinue()}
        >
          {decisions ? (
            <MailWarning className="mr-1 size-4" />
          ) : matchReady ? (
            <Play className="mr-1 size-4 fill-current" />
          ) : null}
          <span className="hidden sm:inline">{buttonLabel}</span>
          <span className="sm:hidden">
            {matchReady ? "Match" : decisions ? "Review" : "Continue"}
          </span>
          {!decisions && !matchReady && <ChevronRight className="ml-1 size-4" />}
        </Button>
      </div>
      <div className="mx-auto max-w-6xl px-3 pb-2 text-[10px] text-muted-foreground">
        {decisions > 0
          ? "A club decision needs your attention before time moves on."
          : matchReady
            ? `${fixture?.home ? "Home" : "Away"} match against ${fixture?.opponent} is ready.`
            : fixture
              ? `Continue to Saturday for ${fixture.home ? "the home match" : `the trip to ${fixture.opponent}`}.`
              : "Continue moves through the week and stops when something needs you."}
      </div>
    </div>
  );
}
