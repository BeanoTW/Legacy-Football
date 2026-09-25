import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Briefcase,
  Building2,
  Heart,
  Mail,
  Coins,
  Handshake,
  Play,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { calendarDay, fmtMoney, simulateFixtureToday, startMatchDay, totalCapacity } from "@/lib/game/engine";
import { actionableInbox } from "@/lib/game/attention";
import { sustainabilitySnapshot } from "@/lib/game/sustainability";
import { HEALTH_TONE, initials } from "./shared/primitives";
import { ALL_TABS, type Tab } from "./tabs";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { userSquad } from "@/lib/game/recruitment";
import { ContinueCalendar } from "./ContinueCalendar";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";
import { recomputeConfidence } from "@/lib/game/board";
import { playerManagerQuality } from "@/lib/game/playerClubPerformance";
import { Button } from "@/components/ui/button";
import { competitionLabel, fixtureCompetition, fixtureDate, resultForFixture } from "./fixturePresentation";
import type { AdvanceTarget } from "@/lib/game/advancePlanner";
import { ClubIdentitySheet } from "./ClubIdentityStudio";
import { ClubBadge } from "./ClubKitArt";
import { clubKitFor, clubKitForReference } from "@/lib/game/clubKit";

export function ClubHub({ state, update, setTab, isContinuing, onAdvanceTo }: { state: GameState; update: (fn: (s: GameState) => GameState) => void; setTab: (t: Tab) => void; isContinuing: boolean; onAdvanceTo?: (target: AdvanceTarget) => void }) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const identity = clubKitFor(state);
  const today = calendarDay(state);
  const nextFixture = [...state.fixtures]
    .filter((fixture) => {
      if (fixture.week < state.week || (fixture.week === state.week && (fixture.dayOfWeek ?? 5) < today)) return false;
      return !resultForFixture(state, fixture);
    })
    .sort((a, b) => a.week - b.week || (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5))[0];
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const staffCount = state.hiredStaff.length;
  const squadSize = userSquad(state).length;
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
  const boardConf = state.board ? recomputeConfidence(state.board) : 50;
  const managerQuality = playerManagerQuality(state);
  const strategic = useMemo(() => sustainabilitySnapshot(state), [state]);
  const leagueSorted = [...state.league].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
  const myIndex = leagueSorted.findIndex((row) => isUserClubReference(state, row.team));
  const miniLeague = leagueSorted.slice(Math.max(0, myIndex - 2), Math.min(leagueSorted.length, myIndex + 3));
  const recentResults = [...state.results]
    .filter((result) => (result.competition ?? "league") === "league")
    .sort((a, b) => b.week - a.week || (b.dayOfWeek ?? 5) - (a.dayOfWeek ?? 5))
    .slice(0, 5)
    .reverse();
  const leaguePosition = myIndex >= 0 && leagueSorted[myIndex]?.p > 0 ? myIndex + 1 : null;
  const tabIcon = (id: Tab) => ALL_TABS.find(([tabId]) => tabId === id)?.[2];
  const SquadIcon = tabIcon("squad")!;
  const TransfersIcon = tabIcon("recruitment")!;
  const StaffIcon = tabIcon("staff")!;
  const FacilitiesIcon = tabIcon("stadium")!;

  return (
    <div className="lf-home-dashboard flex min-h-0 flex-col gap-3">
      <section className="lf-command-grid">
        <div className="lf-match-card overflow-hidden rounded-2xl border bg-card shadow-sm"><MatchStrip state={state} nextFixture={nextFixture} manager={manager} update={update} onOpenSchedule={() => setTab("fixtures")} onOpenStaff={() => setTab("staff")} /></div>
        <aside className="lf-club-pulse">
          <div className="lf-pulse-block">
            <span className="lf-pulse-label"><Trophy className="size-3.5" />League standing</span>
            <div className="lf-standing-value">{leaguePosition ? ordinal(leaguePosition) : "—"}</div>
            <div className="lf-form-strip" aria-label="Recent form">
              {recentResults.length ? recentResults.map((result, index) => <span key={`${result.week}-${index}`} className={`is-${result.result.toLowerCase()}`}>{result.result}</span>) : <small>Season yet to begin</small>}
            </div>
          </div>
          <button className="lf-pulse-manager" onClick={() => setTab("staff")}>
            <span className="lf-pulse-label"><Users className="size-3.5" />Manager status</span>
            <strong>{manager?.name ?? "Vacant"}</strong>
            <small>{manager ? `${Math.round(managerQuality)}/100 quality` : "Appointment required"}</small>
          </button>
          <button className="lf-pulse-table" onClick={() => setTab("world")}>
            {miniLeague.slice(0, 3).map((row) => <span key={row.team} className={cn(isUserClubReference(state, row.team) && "is-club")}><b>{leagueSorted.indexOf(row) + 1}</b><em>{clubPresentationName(clubDisplayName(state, row.team))}</em><strong>{row.pts}</strong></span>)}
          </button>
        </aside>
      </section>
      <div className="lf-home-calendar"><ContinueCalendar state={state} isContinuing={isContinuing} onOpenSchedule={() => setTab("fixtures")} onAdvanceTo={onAdvanceTo} /></div>
      <section className="lf-vital-grid">
        <VitalCard icon={<Coins className="size-4" />} label="Financial health" value={strategic.health.label} detail={`${fmtMoney(state.cash)} cash · ${strategic.health.coverMonths.toFixed(1)} months cover`} tone={HEALTH_TONE[strategic.health.state]} meter={Math.min(100, strategic.health.coverMonths * 12)} onClick={() => setTab("cashflow")} />
        <VitalCard icon={<Handshake className="size-4" />} label="Board confidence" value={`${boardConf}%`} detail={strategic.pressure.headline} tone={boardConf >= 65 ? "text-emerald-600" : "text-amber-600"} meter={boardConf} onClick={() => setTab("board")} />
        <VitalCard icon={<Users className="size-4" />} label="Supporter mood" value={`${state.fanHappiness}%`} detail="Current supporter sentiment" tone={state.fanHappiness >= 60 ? "text-emerald-600" : "text-amber-600"} meter={state.fanHappiness} onClick={() => setTab("tickets")} />
      </section>
      {suggestedSteps.length > 0 && (
        <section className="lf-suggested-next rounded-2xl border bg-card shadow-sm">
          <div className="lf-home-panel-heading"><span className="lf-heading-label"><Target className="size-3.5" />Suggested next steps</span><small>Optional</small></div>
          <div className="lf-suggested-list">{suggestedSteps.slice(0, 3).map((item) => (
            <button key={item.label} onClick={() => setTab(item.tab)} className="lf-suggested-row"><span className="lf-task-icon"><Target className="size-4" /></span><span className="min-w-0 flex-1"><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight className="size-4 shrink-0 opacity-55" /></button>
          ))}</div>
        </section>
      )}
      <section className="lf-home-desk grid gap-2 md:grid-cols-[1.15fr_.85fr] md:gap-3">
        <div className="lf-home-panel overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="lf-home-panel-heading"><div className="flex items-center gap-2"><span className="lf-heading-label"><Briefcase className="size-3.5" />Chairman tasks</span>{decisionItems.length > 0 && <span className="lf-count-badge">{decisionItems.length}</span>}</div><button onClick={() => setTab("inbox")}>View all <ArrowRight className="size-3.5" /></button></div>
          <div className="lf-task-list">{topDecisions.length > 0 ? topDecisions.map((item) => (
            <button key={item.id} onClick={() => setTab("inbox")} className="lf-task-row"><span className="lf-task-icon"><Mail className="size-4" /></span><span className="min-w-0 flex-1"><strong className="block truncate">{item.subject}</strong><small className="block truncate">{item.department}</small></span><ArrowRight className="size-4 shrink-0 opacity-55" /></button>
          )) : <div className="lf-task-row is-clear"><span className="lf-task-icon"><Mail className="size-4" /></span><span><strong className="block">No decisions waiting</strong><small className="block">Nothing needs your attention</small></span></div>}</div>
        </div>
        <button onClick={() => setTab("inbox")} className="lf-news-card overflow-hidden rounded-2xl border bg-card text-left shadow-sm">
          <div className="lf-home-panel-heading"><span className="lf-heading-label"><Mail className="size-3.5" />Club news</span><span>View all <ArrowRight className="inline size-3.5" /></span></div><div className="lf-news-art" aria-hidden="true" /><div className="p-3"><strong className="block line-clamp-2 text-sm">{latestNews?.subject ?? "No club news yet"}</strong><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{latestNews ? `${latestNews.department} · Week ${latestNews.week}` : "Updates from the club will appear here."}</p></div>
        </button>
      </section>
      <section className="lf-management-grid grid grid-cols-2 gap-2 md:grid-cols-3">
        <ActionTile onClick={() => setTab("squad")} icon={<SquadIcon className="size-5" />} title="Squad" value={`${squadSize} players`} sub="Selection · contracts" />
        <ActionTile onClick={() => setTab("recruitment")} icon={<TransfersIcon className="size-5" />} title="Transfers" value={activeNegotiations > 0 ? `${activeNegotiations} active` : "Market"} sub="Scouting · shortlist · deals" />
        <ActionTile onClick={() => setTab("staff")} icon={<StaffIcon className="size-5" />} title="Staff" value={manager ? manager.name : "No manager"} sub={staffCount ? `${staffCount} employed` : "Build your team"} />
        <ActionTile onClick={() => setTab("stadium")} icon={<FacilitiesIcon className="size-5" />} title="Facilities" value={`${totalCapacity(state).toLocaleString()} seats`} sub="Stadium · training" />
        <ActionTile onClick={() => setTab("tickets")} icon={<Heart className="size-5" />} title="Supporters" value={`${state.fanHappiness}% happy`} sub="Mood · engagement" />
        <ActionTile onClick={() => setTab("board")} icon={<Target className="size-5" />} title="Club vision" value={`${boardConf}% confidence`} sub={strategic.pressure.headline} />
        <ActionTile onClick={() => setIdentityOpen(true)} icon={<ClubBadge design={identity.badge} clubName={state.clubName} size={24} />} title="Club identity" value="Badge & kits" sub="Crest · home · away" />
      </section>
      <ClubIdentitySheet open={identityOpen} onOpenChange={setIdentityOpen} state={state} update={update} />
      <div className="hidden xl:block"><LeaguePanel state={state} miniLeague={miniLeague} leagueSorted={leagueSorted} setTab={setTab} /></div>
    </div>
  );
}

function MatchStrip({ state, nextFixture, manager, update, onOpenSchedule, onOpenStaff }: { state: GameState; nextFixture: GameState["fixtures"][number] | undefined; manager: GameState["hiredStaff"][number] | undefined; update: (fn: (s: GameState) => GameState) => void; onOpenSchedule: () => void; onOpenStaff: () => void }) {
  const identity = clubKitFor(state);
  const opponentIdentity = nextFixture ? clubKitForReference(state, nextFixture.opponent) : null;
  const matchReady = !!nextFixture && nextFixture.week === state.week && (nextFixture.dayOfWeek ?? 5) === calendarDay(state) && !resultForFixture(state, nextFixture);
  const currentCompetition = nextFixture ? fixtureCompetition(nextFixture) : undefined;
  const isPreseason = currentCompetition === "preseason";
  const prep = managerMatchPrep(state);
  const homeName = nextFixture ? nextFixture.home ? state.clubName : clubPresentationName(clubDisplayName(state, nextFixture.opponent)) : state.clubName;
  const awayName = nextFixture ? nextFixture.home ? clubPresentationName(clubDisplayName(state, nextFixture.opponent)) : state.clubName : "Opposition TBC";
  const fitTone = prep.squadFitBand === "Excellent" ? "text-emerald-600" : prep.squadFitBand === "Good" ? "text-green-600" : prep.squadFitBand === "Workable" ? "text-amber-600" : prep.squadFitBand === "Poor" ? "text-rose-600" : "text-muted-foreground";
  const date = nextFixture ? fixtureDate(nextFixture) : null;
  const competition = nextFixture ? competitionLabel(fixtureCompetition(nextFixture)) : isPreseason ? "Preseason" : "Schedule";
  return <div className="lf-match-inner"><div className="lf-match-copy"><div className="lf-match-kicker">Next fixture · Week {nextFixture?.week ?? state.week}</div><h2>{nextFixture ? clubPresentationName(clubDisplayName(state, nextFixture.opponent)) : "No fixture scheduled"}</h2><p>{nextFixture && date ? `${date.dayName} ${date.day} ${date.month} · ${nextFixture.home ? "Home" : "Away"} · ${competition}` : "Use the schedule to review upcoming fixtures."}</p>{nextFixture && <div className="lf-match-brief"><div><span>{manager ? "Manager's brief" : "Caretaker setup"}</span><strong>{prep.managerName} · {prep.selectedFormation} · {prep.style}</strong></div><div className={cn("lf-match-fit", fitTone)}>{prep.squadFitBand}<small>{prep.squadFitScore}/100 fit</small></div></div>}<div className="lf-match-actions">{matchReady ? <><Button onClick={() => update((current) => startMatchDay(current))} className="lf-match-primary"><Play /> View match</Button><Button variant="outline" onClick={() => update((current) => simulateFixtureToday(current))} className="lf-match-secondary">Sim match</Button></> : <Button onClick={onOpenSchedule} className="lf-match-primary"><Play /> View schedule</Button>}<Button variant="outline" onClick={onOpenStaff} className="lf-match-secondary">{manager ? "Manager profile" : "Appoint manager"}</Button></div></div><div className="lf-match-versus"><div className="lf-match-team"><div className={cn("lf-team-mark", nextFixture && "has-club-badge")}>{nextFixture ? <ClubBadge design={nextFixture.home ? identity.badge : opponentIdentity!.badge} clubName={homeName} size={40} /> : <ClubBadge design={identity.badge} clubName={state.clubName} size={40} />}</div><div className="truncate font-display">{homeName}</div><span>{nextFixture ? "Home" : ""}</span></div><div className="lf-vs">VS</div><div className="lf-match-team"><div className={cn("lf-team-mark", nextFixture && "has-club-badge", !nextFixture && "is-tbc")}>{nextFixture ? <ClubBadge design={nextFixture.home ? opponentIdentity!.badge : identity.badge} clubName={awayName} size={40} /> : "?"}</div><div className="truncate font-display">{awayName}</div><span>{nextFixture ? "Away" : ""}</span></div></div></div>;
}

function ordinal(value: number): string {
  const suffix = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${suffix}`;
}

function VitalCard({ icon, label, value, detail, meter, tone, onClick }: { icon: React.ReactNode; label: string; value: string; detail: string; meter: number; tone?: string; onClick: () => void }) {
  return <button onClick={onClick} className="lf-vital-card"><span className="lf-vital-heading"><b>{icon}</b><span>{label}</span></span><strong className={tone}>{value}</strong><small>{detail}</small><i><b style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} /></i></button>;
}

function LeaguePanel({ state, miniLeague, leagueSorted, setTab }: { state: GameState; miniLeague: GameState["league"]; leagueSorted: GameState["league"]; setTab: (t: Tab) => void }) {
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"><div className="banner-strip flex shrink-0 items-center justify-between px-3 py-1.5 text-[10px] md:text-sm"><span>League position</span><button className="inline-flex items-center gap-1 opacity-90 hover:opacity-100" onClick={() => setTab("world")}>Competitions <ArrowRight className="size-3.5" /></button></div><div className="contained-scroll flex-1"><table className="w-full text-[10px] md:text-sm tnum"><tbody>{miniLeague.map((row) => { const pos = leagueSorted.indexOf(row) + 1; const isMe = isUserClubReference(state, row.team); return <tr key={row.team} className={cn("border-b last:border-0", isMe && "bg-primary/10 font-semibold")}><td className="w-8 px-2 py-1.5 text-muted-foreground md:px-4">{pos}</td><td className="truncate px-1.5 py-1.5">{clubPresentationName(clubDisplayName(state, row.team))}</td><td className="px-1.5 py-1.5 text-right text-muted-foreground">{row.p} P</td><td className="px-2 py-1.5 text-right font-display text-xs md:px-4 md:text-base">{row.pts}</td></tr>; })}</tbody></table></div></section>;
}

function ActionTile({ icon, title, value, sub, onClick }: { icon: React.ReactNode; title: string; value: string; sub?: string; onClick: () => void }) {
  return <button onClick={onClick} className="lf-action-tile"><span className="lf-action-icon">{icon}</span><span className="min-w-0 flex-1"><span className="lf-action-title">{title}</span><strong className="lf-action-value">{value}</strong>{sub && <small className="lf-action-sub">{sub}</small>}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></button>;
}