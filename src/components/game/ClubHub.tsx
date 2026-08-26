import { useMemo } from "react";
import { ArrowRight, Briefcase, Building2, CircleDollarSign, Heart, Mail, Play, Users } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, isMatchday, phaseOf, startMatchDay, totalCapacity } from "@/lib/game/engine";
import { weeklyNetRecurring } from "@/lib/game/selectors/club";
import { unreadCount } from "@/lib/game/inbox";
import { financialHealth as canonicalFinancialHealth, sustainabilitySnapshot } from "@/lib/game/sustainability";
import { HEALTH_TONE, initials, ord } from "./shared/primitives";
import type { Tab } from "./tabs";

function financialHealth(state: GameState): { label: string; tone: "good" | "bad" | "muted" } {
  const h = canonicalFinancialHealth(state);
  return { label: h.label, tone: h.state === "secure" || h.state === "healthy" ? "good" : h.state === "stressed" || h.state === "critical" ? "bad" : "muted" };
}

function fanbaseEstimate(state: GameState): number {
  const cap = totalCapacity(state);
  return Math.round(cap * (0.35 + state.fanHappiness / 220 + state.reputation / 260));
}

export function HubStrategicStrip({ state, onOpenFinance }: { state: GameState; onOpenFinance: () => void }) {
  const { health, reserve, pressure } = useMemo(() => sustainabilitySnapshot(state), [state]);
  return (
    <button onClick={onOpenFinance} className="h-full w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors hover:border-primary/40">
      <div className="grid h-full grid-cols-3 divide-x px-2 py-2 md:px-4">
        <Metric label="Finance" value={health.label} detail={`${health.coverMonths.toFixed(1)} mo`} className={HEALTH_TONE[health.state]} />
        <Metric label="Reserve" value={fmtMoney(reserve.recommended)} detail={reserve.excess > 0 ? `${fmtMoney(reserve.excess)} spare` : `${fmtMoney(reserve.deficit)} short`} />
        <Metric label="Pressure" value={`${pressure.score}/100`} detail={pressure.headline} />
      </div>
    </button>
  );
}

function Metric({ label, value, detail, className }: { label: string; value: string; detail: string; className?: string }) {
  return <div className="min-w-0 self-center px-2 first:pl-0 last:pr-0"><div className="text-[9px] md:text-[10px] text-muted-foreground">{label}</div><div className={cn("truncate font-display text-base md:text-xl leading-tight", className)}>{value}</div><div className="truncate text-[8px] md:text-[10px] text-muted-foreground">{detail}</div></div>;
}

export function ClubHub({ state, update, setTab }: { state: GameState; update: (fn: (s: GameState) => GameState) => void; setTab: (t: Tab) => void }) {
  const nextFixture = state.fixtures.find((f) => f.week === state.week);
  const health = financialHealth(state);
  const fanbase = fanbaseEstimate(state);
  const staffCount = state.hiredStaff.length;
  const manager = state.hiredStaff.find((s) => s.role === "Manager");
  const boardConf = Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 4 + (state.cash > 0 ? 15 : -20))));
  const mgrConf = manager ? Math.max(20, Math.min(99, Math.round(60 + (manager.rating - 60) + state.fanHappiness / 8))) : Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 5)));
  const weeklyNet = weeklyNetRecurring(state);
  const unread = unreadCount(state);
  const decisions = state.inbox.filter((item) => item.status === "awaitingDecision").length;
  const activeNegotiations = state.football?.negotiations?.filter((n) => n.stage !== "completed" && n.stage !== "withdrawn" && n.stage !== "rejected").length ?? 0;
  const leagueSorted = [...state.league].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
  const myIdx = leagueSorted.findIndex((r) => r.team === state.clubName);
  const miniLeague = leagueSorted.slice(Math.max(0, myIdx - 2), Math.min(leagueSorted.length, myIdx + 3));

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 md:gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.85fr)] xl:grid-rows-[auto_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-xl border shadow-sm xl:col-span-2">
        <div className="panel-strip flex items-center justify-between gap-2 px-3 py-2 md:px-5">
          <div className="flex min-w-0 items-center gap-2 md:gap-4"><div className="grid size-9 md:size-11 shrink-0 place-items-center rounded-lg bg-black/25 font-display text-base md:text-xl">{initials(state.clubName)}</div><div className="min-w-0"><div className="truncate font-display text-xl md:text-2xl leading-none">{state.clubName}</div><div className="mt-0.5 text-[10px] md:text-xs opacity-80">{myIdx >= 0 ? `${myIdx + 1}${ord(myIdx + 1)}` : "—"} · S{state.season} · W{state.week}</div></div></div>
          <div className="shrink-0 text-right"><div className="text-[9px] md:text-xs opacity-70">Reputation</div><div className="font-display text-xl md:text-2xl leading-none">{Math.round(state.reputation)}</div></div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm xl:hidden">
        <MatchStrip state={state} nextFixture={nextFixture} update={update} />
      </section>

      <div className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 md:gap-3 xl:grid-rows-[auto_auto_minmax(0,1fr)]">
        <section className="min-h-0">
          <div className="mb-1 flex items-center justify-between"><h2 className="font-display text-base md:text-xl">Chairman controls</h2><span className="text-[9px] md:text-xs text-muted-foreground">Main workflows</span></div>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 md:gap-2">
            <ActionTile onClick={() => setTab("inbox")} icon={<Mail className="size-4 md:size-5" />} title="Decisions" value={decisions > 0 ? `${decisions} waiting` : unread > 0 ? `${unread} unread` : "All clear"} urgent={decisions > 0} />
            <ActionTile onClick={() => setTab("recruitment")} icon={<Users className="size-4 md:size-5" />} title="Transfers" value={activeNegotiations > 0 ? `${activeNegotiations} active` : "Squad"} />
            <ActionTile onClick={() => setTab("cashflow")} icon={<CircleDollarSign className="size-4 md:size-5" />} title="Finances" value={fmtMoney(state.cash)} sub={`${health.label} · ${weeklyNet >= 0 ? "+" : ""}${fmtMoney(weeklyNet)}/wk`} />
            <ActionTile onClick={() => setTab("staff")} icon={<Briefcase className="size-4 md:size-5" />} title="Staff" value={manager ? manager.name : "No manager"} sub={staffCount ? `${staffCount} employed` : "Build team"} />
            <ActionTile onClick={() => setTab("stadium")} icon={<Building2 className="size-4 md:size-5" />} title="Facilities" value={`${totalCapacity(state).toLocaleString()} seats`} />
            <ActionTile onClick={() => setTab("tickets")} icon={<Heart className="size-4 md:size-5" />} title="Supporters" value={`${state.fanHappiness}% happy`} sub={`${fanbase.toLocaleString()} fans`} />
          </div>
        </section>
        <HubStrategicStrip state={state} onOpenFinance={() => setTab("cashflow")} />
        <div className="grid grid-cols-2 gap-1.5 md:gap-2"><HubMini label="Board" value={`${boardConf}%`} tone={boardConf >= 55 ? "good" : boardConf < 35 ? "bad" : "muted"} onClick={() => setTab("board")} /><HubMini label="Manager" value={`${mgrConf}%`} tone={mgrConf >= 55 ? "good" : mgrConf < 35 ? "bad" : "muted"} onClick={() => setTab("staff")} /></div>
        <div className="hidden min-h-0 xl:block"><LeaguePanel state={state} miniLeague={miniLeague} leagueSorted={leagueSorted} setTab={setTab} /></div>
      </div>

      <div className="hidden min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 xl:grid">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm"><MatchStrip state={state} nextFixture={nextFixture} update={update} /></section>
        <LeaguePanel state={state} miniLeague={miniLeague} leagueSorted={leagueSorted} setTab={setTab} />
      </div>
    </div>
  );
}

function MatchStrip({ state, nextFixture, update }: { state: GameState; nextFixture: GameState["fixtures"][number] | undefined; update: (fn: (s: GameState) => GameState) => void }) {
  const matchReady = !!nextFixture && isMatchday(state);
  return <div className="flex items-center gap-2 px-3 py-2 md:px-4"><div className="min-w-0 flex-1"><div className="text-[9px] md:text-xs font-bold uppercase tracking-wide text-muted-foreground">Next match · W{state.week}</div>{nextFixture ? <div className="mt-0.5 flex min-w-0 items-center gap-2"><span className="truncate font-display text-base md:text-xl">{nextFixture.home ? state.clubName : nextFixture.opponent}</span><span className="text-[10px] font-bold text-muted-foreground">v</span><span className="truncate font-display text-base md:text-xl">{nextFixture.home ? nextFixture.opponent : state.clubName}</span></div> : <div className="mt-0.5 truncate text-xs md:text-sm text-muted-foreground">{phaseOf(state.week) === "preseason" ? "Pre-season preparation" : phaseOf(state.week) === "midseason" ? "Mid-season break" : "No fixture this week"}</div>}</div>{matchReady ? <button onClick={() => update((s) => startMatchDay(s))} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><Play className="size-4" /> Match</button> : nextFixture ? <div className="shrink-0 rounded-lg border px-3 py-2 text-[10px] font-semibold text-muted-foreground">Saturday</div> : null}</div>;
}

function LeaguePanel({ state, miniLeague, leagueSorted, setTab }: { state: GameState; miniLeague: GameState["league"]; leagueSorted: GameState["league"]; setTab: (t: Tab) => void }) {
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"><div className="banner-strip flex shrink-0 items-center justify-between px-3 py-1.5 text-[10px] md:text-sm"><span>League position</span><button className="inline-flex items-center gap-1 opacity-90 hover:opacity-100" onClick={() => setTab("world")}>Full table <ArrowRight className="size-3.5" /></button></div><div className="contained-scroll flex-1"><table className="w-full text-[10px] md:text-sm tnum"><tbody>{miniLeague.map((r) => { const pos = leagueSorted.indexOf(r) + 1; const isMe = r.team === state.clubName; return <tr key={r.team} className={cn("border-b last:border-0", isMe && "bg-primary/10 font-semibold")}><td className="w-8 px-2 md:px-4 py-1.5 text-muted-foreground">{pos}</td><td className="truncate px-1.5 py-1.5">{r.team}</td><td className="px-1.5 py-1.5 text-right text-muted-foreground">{r.p} P</td><td className="px-2 md:px-4 py-1.5 text-right font-display text-xs md:text-base">{r.pts}</td></tr>; })}</tbody></table></div></section>;
}

function ActionTile({ icon, title, value, sub, urgent = false, onClick }: { icon: React.ReactNode; title: string; value: string; sub?: string; urgent?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={cn("min-h-14 md:min-h-20 rounded-xl border bg-card px-2.5 py-2 md:p-3 text-left shadow-sm transition-all hover:border-primary/50", urgent && "border-amber-500/70 bg-amber-500/5")}><div className="flex items-center gap-2 min-w-0"><div className={cn("grid size-7 md:size-9 shrink-0 place-items-center rounded-lg", urgent ? "bg-amber-500 text-white" : "bg-primary/10 text-primary")}>{icon}</div><div className="min-w-0 flex-1"><div className="text-[9px] md:text-xs font-semibold text-muted-foreground">{title}</div><div className="truncate font-display text-sm md:text-lg leading-tight">{value}</div>{sub && <div className="hidden md:block truncate text-[10px] text-muted-foreground">{sub}</div>}</div></div></button>;
}

export function HubMini({ label, value, tone, onClick }: { label: string; value: string; tone: "good" | "bad" | "muted"; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-xl border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:border-primary/50"><div className="flex items-center justify-between gap-2"><div className="text-[9px] md:text-xs font-medium text-muted-foreground">{label} confidence</div><div className={cn("font-display text-base md:text-xl leading-tight", tone === "good" && "text-[color:var(--color-income)]", tone === "bad" && "text-[color:var(--color-expense)]")}>{value}</div></div></button>;
}
