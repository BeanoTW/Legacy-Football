import { useMemo } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Building2,
  Heart,
  Mail,
  Play,
  Target,
  Users,
} from "lucide-react";

import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, isMatchday, phaseOf, startMatchDay, totalCapacity } from "@/lib/game/engine";
import { actionableInbox } from "@/lib/game/attention";
import { sustainabilitySnapshot } from "@/lib/game/sustainability";
import { HEALTH_TONE, initials } from "./shared/primitives";
import type { Tab } from "./tabs";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { userSquad } from "@/lib/game/recruitment";
import { ContinueCalendar } from "./ContinueCalendar";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";

function fanbaseEstimate(state: GameState): number {
  const cap = totalCapacity(state);
  return Math.round(cap * (0.35 + state.fanHappiness / 220 + state.reputation / 260));
}

export function ClubHub({ state, update, setTab, isContinuing }: { state: GameState; update: (fn: (s: GameState) => GameState) => void; setTab: (t: Tab) => void; isContinuing: boolean }) {
  const nextFixture = state.fixtures.find((fixture) => fixture.week === state.week);
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const staffCount = state.hiredStaff.length;
  const squadSize = userSquad(state).length;
  const fanbase = fanbaseEstimate(state);
  const suggestedSteps = [
    !manager ? { label: "Hire a manager", detail: "No manager is currently appointed.", tab: "staff" as Tab } : null,
    staffCount < 3 ? { label: "Build the backroom team", detail: `${staffCount} staff currently employed.`, tab: "staff" as Tab } : null,
    squadSize < 18 ? { label: "Review squad depth", detail: `${squadSize} senior players available.`, tab: "squad" as Tab } : null,
    state.cash < 0 ? { label: "Review club finances", detail: "The club is currently overdrawn.", tab: "cashflow" as Tab } : null,
  ].filter((item): item is { label: string; detail: string; tab: Tab } => item !== null);
  const decisionItems = actionableInbox(state);
  const topDecisions = decisionItems.slice(0, 2);
  const latestNews = state.inbox.filter((item) => !decisionItems.some((decision) => decision.id === item.id)).slice().sort((a, b) => b.season - a.season || b.week - a.week || b.id.localeCompare(a.id))[0];
  const activeNegotiations = state.football?.negotiations?.filter((negotiation) => negotiation.stage !== "completed" && negotiation.stage !== "withdrawn" && negotiation.stage !== "rejected").length ?? 0;
  const boardConf = Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 4 + (state.cash > 0 ? 15 : -20))));
  const managerConf = manager ? Math.max(20, Math.min(99, Math.round(60 + (manager.rating - 60) + state.fanHappiness / 8))) : Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 5)));
  const strategic = useMemo(() => sustainabilitySnapshot(state), [state]);
  const leagueSorted = [...state.league].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
  const myIndex = leagueSorted.findIndex((row) => isUserClubReference(state, row.team));
  const miniLeague = leagueSorted.slice(Math.max(0, myIndex - 2), Math.min(leagueSorted.length, myIndex + 3));

  return (
    <div className="lf-home-dashboard flex min-h-0 flex-col gap-3">
      <section className="lf-match-card overflow-hidden rounded-2xl border bg-card shadow-sm"><MatchStrip state={state} nextFixture={nextFixture} update={update} onOpenSchedule={() => setTab("fixtures")} onOpenStaff={() => setTab("staff")} /></section>
      <div className="lf-home-calendar"><ContinueCalendar state={state} isContinuing={isContinuing} onOpenSchedule={() => setTab("fixtures")} /></div>
      {suggestedSteps.length > 0 && (
        <section className="lf-suggested-next rounded-2xl border bg-card shadow-sm">
          <div className="lf-home-panel-heading"><span>Suggested next steps</span><small>Optional</small></div>
          <div className="lf-suggested-list">{suggestedSteps.slice(0, 3).map((item) => (
            <button key={item.label} onClick={() => setTab(item.tab)} className="lf-suggested-row"><span className="lf-task-icon"><Target className="size-4" /></span><span className="min-w-0 flex-1"><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight className="size-4 shrink-0 opacity-55" /></button>
          ))}</div>
        </section>
      )}
      <section className="lf-home-desk grid gap-2 md:grid-cols-[1.15fr_.85fr] md:gap-3">
        <div className="lf-home-panel overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="lf-home-panel-heading"><div className="flex items-center gap-2"><span>Chairman tasks</span>{decisionItems.length > 0 && <span className="lf-count-badge">{decisionItems.length}</span>}</div><button onClick={() => setTab("inbox")}>View all <ArrowRight className="size-3.5" /></button></div>
          <div className="lf-task-list">{topDecisions.length > 0 ? topDecisions.map((item) => (
            <button key={item.id} onClick={() => setTab("inbox")} className="lf-task-row"><span className="lf-task-icon"><Mail className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{item.subject}</strong><small className="block truncate">{item.department}</small></span><ArrowRight className="size-4 shrink-0 opacity-55" /></button>
          )) : <div className="lf-task-row is-clear"><span className="lf-task-icon"><Mail className="size-4" /></span><span><strong className="block">No decisions waiting</strong><small className="block">Nothing needs your attention</small></span></div>}</div>
        </div>
        <button onClick={() => setTab("inbox")} className="lf-news-card overflow-hidden rounded-2xl border bg-card text-left shadow-sm">
          <div className="lf-home-panel-heading"><span>Club news</span><span>View all <ArrowRight className="inline size-3.5" /></span></div><div className="lf-news-art" aria-hidden="true" /><div className="p-3"><strong className="block line-clamp-2 text-sm">{latestNews?.subject ?? "Pre-season gets underway"}</strong><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{latestNews ? `${latestNews.department} · Week ${latestNews.week}` : `${state.clubName} begin preparations for the new season.`}</p></div>
        </button>
      </section>
      <section className="lf-management-grid grid grid-cols-2 gap-2 md:grid-cols-3">
        <ActionTile onClick={() => setTab("squad")} icon={<Users className="size-5" />} title="Squad" value={`${squadSize} players`} sub="Selection · contracts" />
        <ActionTile onClick={() => setTab("recruitment")} icon={<ArrowLeftRight className="size-5" />} title="Transfers" value={activeNegotiations > 0 ? `${activeNegotiations} active` : "Market"} sub="Scouting · shortlist · deals" />
        <ActionTile onClick={() => setTab("staff")} icon={<Briefcase className="size-5" />} title="Staff" value={manager ? manager.name : "No manager"} sub={staffCount ? `${staffCount} employed` : "Build your team"} />
        <ActionTile onClick={() => setTab("stadium")} icon={<Building2 className="size-5" />} title="Facilities" value={`${totalCapacity(state).toLocaleString()} seats`} sub="Stadium · training" />
        <ActionTile onClick={() => setTab("tickets")} icon={<Heart className="size-5" />} title="Supporters" value={`${state.fanHappiness}% happy`} sub={`${fanbase.toLocaleString()} fans`} />
        <ActionTile onClick={() => setTab("board")} icon={<Target className="size-5" />} title="Club vision" value="Build for the future" sub="Direction · expectations" />
      </section>
      <section className="lf-club-overview overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="lf-home-panel-heading"><span>Club overview</span><button onClick={() => setTab("dashboard")}>View more <ArrowRight className="size-3.5" /></button></div>
        <div className="lf-overview-grid">
          <OverviewMetric label="Finances" value={strategic.health.label} detail={`${strategic.health.coverMonths.toFixed(1)} months`} className={HEALTH_TONE[strategic.health.state]} onClick={() => setTab("cashflow")} />
          <OverviewMetric label="Reserve" value={fmtMoney(strategic.reserve.recommended)} detail={strategic.reserve.excess > 0 ? `${fmtMoney(strategic.reserve.excess)} spare` : `${fmtMoney(strategic.reserve.deficit)} short`} onClick={() => setTab("cashflow")} />
          <OverviewMetric label="Pressure" value={`${strategic.pressure.score}/100`} detail={strategic.pressure.headline} onClick={() => setTab("board")} />
          <OverviewMetric label="Board confidence" value={`${boardConf}%`} meter={boardConf} className="text-emerald-600" onClick={() => setTab("board")} />
          <OverviewMetric label="Manager confidence" value={`${managerConf}%`} meter={managerConf} className={managerConf >= 55 ? "text-amber-600" : "text-rose-600"} onClick={() => setTab("staff")} />
        </div>
      </section>
      <div className="hidden xl:block"><LeaguePanel state={state} miniLeague={miniLeague} leagueSorted={leagueSorted} setTab={setTab} /></div>
    </div>
  );
}

function MatchStrip({ state, nextFixture, update, onOpenSchedule, onOpenStaff }: { state: GameState; nextFixture: GameState["fixtures"][number] | undefined; update: (fn: (s: GameState) => GameState) => void; onOpenSchedule: () => void; onOpenStaff: () => void }) {
  const matchReady = !!nextFixture && isMatchday(state);
  const isPreseason = phaseOf(state.week) === "preseason";
  const prep = managerMatchPrep(state);
  const homeName = nextFixture ? nextFixture.home ? state.clubName : clubPresentationName(clubDisplayName(state, nextFixture.opponent)) : state.clubName;
  const awayName = nextFixture ? nextFixture.home ? clubPresentationName(clubDisplayName(state, nextFixture.opponent)) : state.clubName : "Opposition TBC";
  const fitTone = prep.squadFitBand === "Excellent" ? "text-emerald-600" : prep.squadFitBand === "Good" ? "text-green-600" : prep.squadFitBand === "Workable" ? "text-amber-600" : prep.squadFitBand === "Poor" ? "text-rose-600" : "text-muted-foreground";
  return <div className="lf-match-inner"><div className="lf-match-copy"><div className="lf-match-kicker">Next match · Week {state.week}</div><h2>{nextFixture ? "Matchday" : isPreseason ? "Pre-season preparation" : "No fixture this week"}</h2><p>{nextFixture ? `${nextFixture.home ? "Home" : "Away"} · Saturday · ${state.week <= 6 ? "Friendly" : "League"}` : isPreseason ? "Friendly · Date TBC · Home" : "Use the schedule to review upcoming fixtures."}</p>{nextFixture && <div className="mt-3 rounded-xl border border-white/15 bg-black/20 p-3 backdrop-blur-sm"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">Manager's match plan</div><div className="mt-1 text-sm font-semibold">{prep.managerName} · {prep.selectedFormation} · {prep.style}</div></div><div className={cn("shrink-0 text-right text-xs font-semibold", fitTone)}>{prep.squadFitBand}<div className="font-normal opacity-70">{prep.squadFitScore}/100 fit</div></div></div><p className="mt-2 text-xs leading-relaxed opacity-80">{prep.summary}</p>{prep.selectedFormation !== prep.preferredFormation && <div className="mt-2 text-[11px] font-medium text-amber-500">Adapted from preferred {prep.preferredFormation} to suit the current squad.</div>}</div>}<div className="lf-match-actions">{matchReady ? <button onClick={() => update((current) => startMatchDay(current))} className="lf-match-primary"><Play className="size-4" /> View match</button> : <button onClick={onOpenSchedule} className="lf-match-primary"><Play className="size-4" /> View schedule</button>}<button onClick={onOpenStaff} className="lf-match-secondary">Manager profile</button></div></div><div className="lf-match-versus"><div className="lf-match-team"><div className="lf-team-mark">{initials(homeName)}</div><div className="truncate font-display">{homeName}</div></div><div className="lf-vs">VS</div><div className="lf-match-team"><div className={cn("lf-team-mark", !nextFixture && "is-tbc")}>{nextFixture ? initials(awayName) : "?"}</div><div className="truncate font-display">{awayName}</div></div></div></div>;
}

function OverviewMetric({ label, value, detail, meter, className, onClick }: { label: string; value: string; detail?: string; meter?: number; className?: string; onClick: () => void }) {
  return <button onClick={onClick} className="lf-overview-metric"><span>{label}</span><strong className={className}>{value}</strong>{detail && <small>{detail}</small>}{meter !== undefined && <span className="lf-overview-meter"><span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></span>}</button>;
}

function LeaguePanel({ state, miniLeague, leagueSorted, setTab }: { state: GameState; miniLeague: GameState["league"]; leagueSorted: GameState["league"]; setTab: (t: Tab) => void }) {
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"><div className="banner-strip flex shrink-0 items-center justify-between px-3 py-1.5 text-[10px] md:text-sm"><span>League position</span><button className="inline-flex items-center gap-1 opacity-90 hover:opacity-100" onClick={() => setTab("world")}>Competitions <ArrowRight className="size-3.5" /></button></div><div className="contained-scroll flex-1"><table className="w-full text-[10px] md:text-sm tnum"><tbody>{miniLeague.map((row) => { const pos = leagueSorted.indexOf(row) + 1; const isMe = isUserClubReference(state, row.team); return <tr key={row.team} className={cn("border-b last:border-0", isMe && "bg-primary/10 font-semibold")}><td className="w-8 px-2 py-1.5 text-muted-foreground md:px-4">{pos}</td><td className="truncate px-1.5 py-1.5">{clubPresentationName(clubDisplayName(state, row.team))}</td><td className="px-1.5 py-1.5 text-right text-muted-foreground">{row.p} P</td><td className="px-2 py-1.5 text-right font-display text-xs md:px-4 md:text-base">{row.pts}</td></tr>; })}</tbody></table></div></section>;
}

function ActionTile({ icon, title, value, sub, onClick }: { icon: React.ReactNode; title: string; value: string; sub?: string; onClick: () => void }) {
  return <button onClick={onClick} className="lf-action-tile"><span className="lf-action-icon">{icon}</span><span className="min-w-0 flex-1"><span className="lf-action-title">{title}</span><strong className="lf-action-value">{value}</strong>{sub && <small className="lf-action-sub">{sub}</small>}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></button>;
}