import { useMemo } from "react";
import { ArrowRight, Briefcase, ChevronsRight, Heart, Play, ShieldCheck } from "lucide-react";
import type { GameState, Staff } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CALENDAR, fmtMoney, phaseOf, startMatchDay, totalCapacity, totalWeeklyExpenses,
  weeklySponsorIncome,
} from "@/lib/game/engine";
import { financialHealth as canonicalFinancialHealth, sustainabilitySnapshot } from "@/lib/game/sustainability";
import { HEALTH_TONE, initials, ord } from "./shared/primitives";
import type { Tab } from "./tabs";

/**
 * Presentation wrapper only. Every number and every rating comes from the
 * canonical sustainability selectors — the UI must never compute its own
 * view of the club's finances.
 */
export function financialHealth(state: GameState): { label: string; tone: "good" | "bad" | "muted" } {
  const h = canonicalFinancialHealth(state);
  const tone: "good" | "bad" | "muted" =
    h.state === "secure" || h.state === "healthy" ? "good"
      : h.state === "stressed" || h.state === "critical" ? "bad" : "muted";
  return { label: h.label, tone };
}


export function fanbaseEstimate(state: GameState): number {
  const cap = totalCapacity(state);
  const factor = 0.35 + state.fanHappiness / 220 + state.reputation / 260;
  return Math.round(cap * factor);
}

export function HubStrategicStrip({
  state, onOpenFinance,
}: { state: GameState; onOpenFinance: () => void }) {
  const snap = useMemo(() => sustainabilitySnapshot(state), [state]);
  const { health, reserve, pressure } = snap;
  return (
    <button
      onClick={onOpenFinance}
      className="w-full text-left rounded-xl border bg-card shadow-sm p-3 grid gap-3 sm:grid-cols-3 hover:bg-muted/40 transition-colors"
    >
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Financial health</div>
        <div className={cn("font-display text-lg leading-none", HEALTH_TONE[health.state])}>
          {health.label}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {health.coverMonths.toFixed(1)} months cover · wages {health.wageRatio}%
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reserve</div>
        <div className="font-display text-lg leading-none">{fmtMoney(reserve.recommended)}</div>
        <div className="text-[11px] text-muted-foreground">
          {reserve.excess > 0
            ? `${fmtMoney(reserve.excess)} above recommended`
            : `${fmtMoney(reserve.deficit)} short`}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Board pressure</div>
        <div className="font-display text-lg leading-none tabular-nums">{pressure.score}/100</div>
        <div className="text-[11px] text-muted-foreground line-clamp-2">{pressure.headline}</div>
      </div>
    </button>
  );
}

export function ClubHub({
  state,
  advance,
  update,
  setTab,
}: {
  state: GameState;
  advance: (w?: number) => void;
  update: (fn: (s: GameState) => GameState) => void;
  setTab: (t: Tab) => void;
}) {

  const nextFixture = state.fixtures.find((f) => f.week === state.week);
  const health = financialHealth(state);
  const fanbase = fanbaseEstimate(state);
  const staffCount = state.hiredStaff.length;
  const staffAvg = staffCount
    ? Math.round(state.hiredStaff.reduce((a, s) => a + s.rating, 0) / staffCount)
    : 0;
  const manager = state.hiredStaff.find((s) => s.role === "Manager");
  const boardConf = Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 4 + (state.cash > 0 ? 15 : -20))));
  const mgrConf = manager
    ? Math.max(20, Math.min(99, Math.round(60 + (manager.rating - 60) + state.fanHappiness / 8)))
    : Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 5)));
  const weeklyNet = weeklySponsorIncome(state) - totalWeeklyExpenses(state);

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myIdx = leagueSorted.findIndex((r) => r.team === state.clubName);
  const miniLeague = leagueSorted.slice(
    Math.max(0, myIdx - 2),
    Math.min(leagueSorted.length, myIdx + 3),
  );

  return (
    <div className="space-y-4">
      {/* Header banner: club identity */}
      <div className="rounded-xl overflow-hidden border shadow-sm">
        <div className="panel-strip px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-12 rounded-md bg-black/25 grid place-items-center font-display text-xl shrink-0">
              {initials(state.clubName)}
            </div>
            <div className="min-w-0">
              <div className="font-display text-2xl leading-none truncate">{state.clubName}</div>
              <div className="text-xs opacity-80 mt-1">
                {myIdx >= 0 ? `${myIdx + 1}${ord(myIdx + 1)}` : "—"} · Season {state.season} · Week {state.week}/{CALENDAR.seasonEnd}
              </div>
            </div>
          </div>
          <div className="size-14 rounded-md bg-black/25 grid place-items-center font-display text-3xl leading-none shrink-0">
            {Math.round(state.reputation)}
          </div>
        </div>
      </div>

      {/* Strategic financial picture — canonical selectors, no local maths */}
      <HubStrategicStrip state={state} onOpenFinance={() => setTab("cashflow")} />

      {/* Central portrait + side tiles */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-3 py-2 text-xs">Director of Football</div>
          <div className="relative">
            {/* Portrait area */}
            <div className="aspect-[4/5] max-h-[420px] w-full bg-gradient-to-b from-panel/25 to-panel/5 grid place-items-center">
              <div className="size-40 rounded-full bg-panel/80 text-panel-foreground grid place-items-center font-display text-6xl shadow-inner">
                {initials(state.managerName)}
              </div>
            </div>
            <div className="absolute inset-x-3 bottom-3 rounded-lg banner-strip px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-display text-lg leading-none truncate">{state.managerName}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">
                  Chairman
                </div>
              </div>
              <div className="flex flex-col items-end text-[10px] uppercase tracking-wider opacity-90">
                <span>Reputation</span>
                <span className="font-display text-base">{Math.round(state.reputation)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3">
          <HubTile
            onClick={() => setTab("staff")}
            icon={<Briefcase className="size-5" />}
            title="Staff"
            value={staffCount ? `${staffCount}` : "Hire"}
            sub={staffCount ? `Avg ${staffAvg}` : "No staff hired"}
            badge={staffCount ? String(staffAvg) : "—"}
          />
          <HubTile
            onClick={() => setTab("tickets")}
            icon={<Heart className="size-5" />}
            title="Fanbase"
            value={fanbase.toLocaleString()}
            sub={`Happiness ${state.fanHappiness}%`}
            badge={`${state.fanHappiness}`}
          />
          <HubTile
            onClick={() => setTab("dashboard")}
            icon={<ShieldCheck className="size-5" />}
            title="Confidence"
            value={`${boardConf} / ${mgrConf}`}
            sub="Board · Manager"
            badge={String(Math.round((boardConf + mgrConf) / 2))}
          />
        </div>
      </div>

      {/* Financial strip */}
      <div className="grid grid-cols-3 gap-3">
        <HubMini
          label="Financial health"
          value={health.label}
          tone={health.tone}
          onClick={() => setTab("cashflow")}
        />
        <HubMini
          label="Available funds"
          value={fmtMoney(state.cash)}
          tone={state.cash >= 0 ? "good" : "bad"}
          onClick={() => setTab("cashflow")}
        />
        <HubMini
          label="Weekly net"
          value={fmtMoney(weeklyNet)}
          tone={weeklyNet >= 0 ? "good" : "bad"}
          onClick={() => setTab("cashflow")}
        />
      </div>

      {/* Next match */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
          <span>Next match</span>
          <span className="opacity-80">Week {state.week}</span>
        </div>
        {nextFixture ? (
          <div className="p-4 flex items-center gap-4">
            <div className="flex-1 flex items-center justify-between gap-3">
              <MatchSide
                name={nextFixture.home ? state.clubName : nextFixture.opponent}
                sub={nextFixture.home ? "Home" : "Away"}
                self={nextFixture.home}
              />
              <div className="text-center px-2">
                <div className="font-display text-2xl">VS</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  League
                </div>
              </div>
              <MatchSide
                name={nextFixture.home ? nextFixture.opponent : state.clubName}
                sub={nextFixture.home ? "Away" : "Home"}
                self={!nextFixture.home}
              />
            </div>
            <Button size="sm" onClick={() => update((s) => startMatchDay(s))}>
              <ChevronsRight className="size-4 mr-1" /> Play
            </Button>

          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {(() => {
              const p = phaseOf(state.week);
              if (p === "preseason")
                return `Pre-season week ${state.week} of ${CALENDAR.preSeasonEnd}. Transfer window OPEN — build your squad. League kicks off week ${CALENDAR.firstHalfStart}.`;
              if (p === "midseason")
                return `Mid-season break (week ${state.week} of ${CALENDAR.midSeasonEnd}). Transfer window OPEN. League resumes week ${CALENDAR.secondHalfStart}.`;
              return "No fixture this week. Advance to continue the season.";
            })()}
          </div>
        )}
      </section>

      {/* Mini league table */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
          <span>League</span>
          <button
            className="opacity-90 hover:opacity-100 inline-flex items-center gap-1"
            onClick={() => setTab("fixtures")}
          >
            Full table <ArrowRight className="size-3" />
          </button>
        </div>
        <table className="w-full text-sm tnum">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-2 px-3 w-8">#</th>
              <th className="text-left py-2 px-3">Team</th>
              <th className="text-right py-2 px-2">P</th>
              <th className="text-right py-2 px-2">GD</th>
              <th className="text-right py-2 px-3">Pts</th>
            </tr>
          </thead>
          <tbody>
            {miniLeague.map((r) => {
              const pos = leagueSorted.indexOf(r) + 1;
              const isMe = r.team === state.clubName;
              return (
                <tr
                  key={r.team}
                  className={cn("border-b last:border-0", isMe && "bg-primary/10 font-medium")}
                >
                  <td className="py-2 px-3 text-muted-foreground">{pos}</td>
                  <td className="py-2 px-3 truncate">{r.team}</td>
                  <td className="py-2 px-2 text-right">{r.p}</td>
                  <td className="py-2 px-2 text-right">{r.gf - r.ga}</td>
                  <td className="py-2 px-3 text-right font-display">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export function HubTile({
  icon,
  title,
  value,
  sub,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border bg-card shadow-sm p-3 flex items-center gap-3 hover:border-primary/50 transition-colors"
    >
      <div className="size-10 rounded-md bg-panel/15 text-panel grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="font-display text-lg leading-tight truncate">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      <div className="size-9 rounded-md bg-panel text-panel-foreground grid place-items-center font-display text-base shrink-0">
        {badge}
      </div>
    </button>
  );
}

export function HubMini({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "muted";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border bg-card shadow-sm px-3 py-3 text-left hover:border-primary/50 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-lg leading-tight mt-0.5",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
        )}
      >
        {value}
      </div>
    </button>
  );
}

export function MatchSide({ name, sub, self }: { name: string; sub: string; self: boolean }) {
  return (
    <div className={cn("flex-1 min-w-0 flex flex-col items-center text-center gap-1")}>
      <div
        className={cn(
          "size-12 rounded-md grid place-items-center font-display text-lg shrink-0",
          self ? "bg-panel text-panel-foreground" : "bg-muted text-foreground",
        )}
      >
        {initials(name)}
      </div>
      <div className="font-display text-sm leading-tight truncate max-w-full">{name}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{sub}</div>
    </div>
  );
}
