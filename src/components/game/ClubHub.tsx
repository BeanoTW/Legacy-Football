import { useMemo } from "react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  ChevronsRight,
  CircleDollarSign,
  Heart,
  Mail,
  Play,
  Users,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fmtMoney, phaseOf, startMatchDay, totalCapacity } from "@/lib/game/engine";
import { weeklyNetRecurring } from "@/lib/game/selectors/club";
import { unreadCount } from "@/lib/game/inbox";
import {
  financialHealth as canonicalFinancialHealth,
  sustainabilitySnapshot,
} from "@/lib/game/sustainability";
import { HEALTH_TONE, initials, ord } from "./shared/primitives";
import type { Tab } from "./tabs";

function financialHealth(state: GameState): { label: string; tone: "good" | "bad" | "muted" } {
  const h = canonicalFinancialHealth(state);
  const tone =
    h.state === "secure" || h.state === "healthy"
      ? "good"
      : h.state === "stressed" || h.state === "critical"
        ? "bad"
        : "muted";
  return { label: h.label, tone };
}

function fanbaseEstimate(state: GameState): number {
  const cap = totalCapacity(state);
  return Math.round(cap * (0.35 + state.fanHappiness / 220 + state.reputation / 260));
}

export function HubStrategicStrip({
  state,
  onOpenFinance,
}: {
  state: GameState;
  onOpenFinance: () => void;
}) {
  const { health, reserve, pressure } = useMemo(() => sustainabilitySnapshot(state), [state]);
  return (
    <button
      onClick={onOpenFinance}
      className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
        Club health
      </div>
      <div className="grid grid-cols-3 divide-x">
        <Metric
          label="Finance"
          value={health.label}
          detail={`${health.coverMonths.toFixed(1)} mo cover`}
          className={HEALTH_TONE[health.state]}
        />
        <Metric
          label="Reserve"
          value={fmtMoney(reserve.recommended)}
          detail={
            reserve.excess > 0
              ? `${fmtMoney(reserve.excess)} spare`
              : `${fmtMoney(reserve.deficit)} short`
          }
        />
        <Metric label="Pressure" value={`${pressure.score}/100`} detail={pressure.headline} />
      </div>
    </button>
  );
}

function Metric({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 truncate font-display text-lg sm:text-2xl", className)}>
        {value}
      </div>
      <div className="truncate text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

export function ClubHub({
  state,
  update,
  setTab,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  setTab: (t: Tab) => void;
}) {
  const nextFixture = state.fixtures.find((f) => f.week === state.week);
  const health = financialHealth(state);
  const fanbase = fanbaseEstimate(state);
  const staffCount = state.hiredStaff.length;
  const manager = state.hiredStaff.find((s) => s.role === "Manager");
  const boardConf = Math.max(
    20,
    Math.min(99, Math.round(50 + state.fanHappiness / 4 + (state.cash > 0 ? 15 : -20))),
  );
  const mgrConf = manager
    ? Math.max(20, Math.min(99, Math.round(60 + (manager.rating - 60) + state.fanHappiness / 8)))
    : Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 5)));
  const weeklyNet = weeklyNetRecurring(state);
  const unread = unreadCount(state);
  const decisions = state.inbox.filter((item) => item.status === "awaitingDecision").length;
  const activeNegotiations =
    state.football?.negotiations?.filter(
      (n) => n.stage !== "completed" && n.stage !== "withdrawn" && n.stage !== "rejected",
    ).length ?? 0;
  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myIdx = leagueSorted.findIndex((r) => r.team === state.clubName);
  const miniLeague = leagueSorted.slice(
    Math.max(0, myIdx - 2),
    Math.min(leagueSorted.length, myIdx + 3),
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border shadow-sm">
        <div className="panel-strip flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-black/25 font-display text-2xl">
              {initials(state.clubName)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-3xl leading-none">{state.clubName}</div>
              <div className="mt-1.5 text-sm opacity-80">
                {myIdx >= 0 ? `${myIdx + 1}${ord(myIdx + 1)}` : "—"} · Season {state.season} · Week{" "}
                {state.week}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs opacity-70">Reputation</div>
            <div className="font-display text-3xl leading-none">{Math.round(state.reputation)}</div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.5rem] border bg-card shadow-sm">
        <div className="banner-strip flex items-center justify-between px-4 py-3 text-sm font-semibold">
          <span>Next match</span>
          <span className="opacity-80">Week {state.week}</span>
        </div>
        {nextFixture ? (
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <MatchSide
                name={nextFixture.home ? state.clubName : nextFixture.opponent}
                sub={nextFixture.home ? "Home" : "Away"}
                self={nextFixture.home}
              />
              <div className="px-2 text-center">
                <div className="font-display text-3xl">VS</div>
                <div className="mt-1 text-xs text-muted-foreground">League</div>
              </div>
              <MatchSide
                name={nextFixture.home ? nextFixture.opponent : state.clubName}
                sub={nextFixture.home ? "Away" : "Home"}
                self={!nextFixture.home}
              />
            </div>
            <Button
              className="mt-5 h-12 w-full text-base"
              onClick={() => update((s) => startMatchDay(s))}
            >
              <Play className="mr-2 size-5" /> Play match
            </Button>
          </div>
        ) : (
          <div className="p-5">
            <div className="text-sm text-muted-foreground">
              {phaseOf(state.week) === "preseason"
                ? "Pre-season. Build the club before the league starts."
                : phaseOf(state.week) === "midseason"
                  ? "Mid-season break. The transfer window is open."
                  : "No fixture this week."}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl">Chairman controls</h2>
            <p className="text-sm text-muted-foreground">
              The club areas most likely to need a decision.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <ActionTile
            onClick={() => setTab("inbox")}
            icon={<Mail className="size-6" />}
            title="Decisions"
            value={
              decisions > 0 ? `${decisions} waiting` : unread > 0 ? `${unread} unread` : "All clear"
            }
            sub={decisions > 0 ? "Your answer is needed" : "Club communications"}
            urgent={decisions > 0}
          />
          <ActionTile
            onClick={() => setTab("recruitment")}
            icon={<Users className="size-6" />}
            title="Transfers"
            value={activeNegotiations > 0 ? `${activeNegotiations} active` : "Squad"}
            sub="Players & negotiations"
          />
          <ActionTile
            onClick={() => setTab("cashflow")}
            icon={<CircleDollarSign className="size-6" />}
            title="Finances"
            value={fmtMoney(state.cash)}
            sub={`${health.label} · ${weeklyNet >= 0 ? "+" : ""}${fmtMoney(weeklyNet)}/wk`}
          />
          <ActionTile
            onClick={() => setTab("staff")}
            icon={<Briefcase className="size-6" />}
            title="Staff"
            value={manager ? manager.name : "No manager"}
            sub={staffCount ? `${staffCount} employed` : "Build your team"}
          />
          <ActionTile
            onClick={() => setTab("stadium")}
            icon={<Building2 className="size-6" />}
            title="Facilities"
            value={`${totalCapacity(state).toLocaleString()} seats`}
            sub="Stadium & infrastructure"
          />
          <ActionTile
            onClick={() => setTab("tickets")}
            icon={<Heart className="size-6" />}
            title="Supporters"
            value={`${state.fanHappiness}% happy`}
            sub={`${fanbase.toLocaleString()} estimated fans`}
          />
        </div>
      </section>

      <HubStrategicStrip state={state} onOpenFinance={() => setTab("cashflow")} />
      <div className="grid grid-cols-2 gap-3">
        <HubMini
          label="Board confidence"
          value={`${boardConf}%`}
          tone={boardConf >= 55 ? "good" : boardConf < 35 ? "bad" : "muted"}
          onClick={() => setTab("board")}
        />
        <HubMini
          label="Manager confidence"
          value={`${mgrConf}%`}
          tone={mgrConf >= 55 ? "good" : mgrConf < 35 ? "bad" : "muted"}
          onClick={() => setTab("staff")}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="banner-strip flex items-center justify-between px-4 py-3 text-sm">
          <span>League position</span>
          <button
            className="inline-flex items-center gap-1 opacity-90 hover:opacity-100"
            onClick={() => setTab("world")}
          >
            Full table <ArrowRight className="size-4" />
          </button>
        </div>
        <table className="w-full text-sm tnum">
          <tbody>
            {miniLeague.map((r) => {
              const pos = leagueSorted.indexOf(r) + 1;
              const isMe = r.team === state.clubName;
              return (
                <tr
                  key={r.team}
                  className={cn("border-b last:border-0", isMe && "bg-primary/10 font-semibold")}
                >
                  <td className="w-10 px-4 py-3 text-muted-foreground">{pos}</td>
                  <td className="truncate px-2 py-3">{r.team}</td>
                  <td className="px-2 py-3 text-right text-muted-foreground">{r.p} P</td>
                  <td className="px-4 py-3 text-right font-display text-lg">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ActionTile({
  icon,
  title,
  value,
  sub,
  urgent = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-h-28 rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-all hover:border-primary/50",
        urgent && "border-amber-500/70 bg-amber-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "grid size-10 place-items-center rounded-xl",
            urgent ? "bg-amber-500 text-white" : "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </div>
        <ChevronsRight className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-3 text-xs font-semibold text-muted-foreground">{title}</div>
      <div className="mt-0.5 truncate font-display text-xl leading-tight">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>
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
      className="rounded-2xl border bg-card px-4 py-4 text-left shadow-sm transition-colors hover:border-primary/50"
    >
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-display text-2xl leading-tight",
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div
        className={cn(
          "grid size-14 shrink-0 place-items-center rounded-xl font-display text-xl",
          self ? "bg-panel text-panel-foreground" : "bg-muted text-foreground",
        )}
      >
        {initials(name)}
      </div>
      <div className="max-w-full truncate font-display text-base leading-tight">{name}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

