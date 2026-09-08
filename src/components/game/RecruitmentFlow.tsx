import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, Handshake, Repeat2, Shield, Star } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { RecruitmentOperations } from "./RecruitmentOperations";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { ScoutingBriefBuilder } from "./ScoutingBriefBuilder";
import { ScoutingReports } from "./ScoutingReports";
import { OutgoingSalesDesk } from "./OutgoingSalesDesk";
import { LoanDesk } from "./LoanDesk";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { openNegotiations, recruitmentSnapshot } from "@/lib/game/recruitment";
import { chairmanShortlistIds } from "@/lib/game/recruitmentKnowledge";
import { isUserClubReference } from "@/lib/game/clubReference";
import { OverviewScreen, WorkflowTile } from "./shared/layout";

type View = "home" | "operations" | "find" | "brief" | "reports" | "sales" | "loans";

export function RecruitmentFlow({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [view, setView] = useState<View>("home");
  const snap = useMemo(() => (state.football ? recruitmentSnapshot(state) : null), [state]);

  if (view === "find") {
    const hasBrief = Boolean(state.football?.scoutingDiscovery?.briefs.length);
    if (!hasBrief) return <ScoutingBriefBuilder state={state} update={update} onBack={() => setView("home")} />;
    return <ScoutingBrowser state={state} update={update} onBack={() => setView("home")} onNewBrief={() => setView("brief")} />;
  }
  if (view === "brief") return <ScoutingBriefBuilder state={state} update={update} onBack={() => setView("find")} />;
  if (view === "reports") return <ScoutingReports state={state} update={update} onBack={() => setView("home")} />;
  if (view === "sales") return <OutgoingSalesDesk state={state} update={update} onBack={() => setView("home")} />;
  if (view === "loans") return <LoanDesk state={state} update={update} onBack={() => setView("home")} />;
  if (view === "operations") {
    return <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"><Button className="w-fit shrink-0" variant="ghost" size="sm" onClick={() => setView("home")}><ArrowLeft className="mr-2 size-4" /> Back to transfers</Button><div className="min-h-0 flex-1 overflow-hidden"><RecruitmentOperations state={state} update={update} /></div></div>;
  }

  const negotiations = state.football ? openNegotiations(state) : [];
  const incomingDeals = negotiations.filter((negotiation) => negotiation.direction === "in").length;
  const sales = negotiations.filter((negotiation) => negotiation.direction === "out").length;
  const shortlist = state.football ? chairmanShortlistIds(state).length : 0;
  const scoutingAssignments = state.football?.scouting?.assignments ?? [];
  const activeScouting = scoutingAssignments.filter((assignment) => assignment.status === "active").length;
  const completedReports = scoutingAssignments.filter((assignment) => assignment.status === "complete").length;
  const activeLoans = (state.football?.loans ?? []).filter((loan) => loan.status === "Active" && (isUserClubReference(state, loan.parentClubId) || isUserClubReference(state, loan.loanClubId))).length;

  return (
    <OverviewScreen title="Transfers" subtitle="Your football staff bring recruitment options to you. Scout the interesting ones, then decide which deals are worth pursuing." className="grid content-start gap-2 md:gap-3 xl:grid-cols-[minmax(320px,.9fr)_minmax(0,1.6fr)] xl:content-stretch">
      {snap && <section className="lf-transfer-budget flex flex-col justify-center rounded-xl border bg-card p-3 shadow-sm md:p-4"><div className="text-xs text-muted-foreground">Transfer budget remaining</div><div className="font-display text-2xl leading-tight md:text-3xl xl:text-4xl">{fmtMoneyExact(snap.budgetRemaining)}</div><div className="mt-2 grid grid-cols-4 gap-1.5 text-center md:mt-3 md:gap-2"><MiniStat value={incomingDeals} label="Buying" /><MiniStat value={sales} label="Offers in" /><MiniStat value={activeScouting} label="Scouting" /><MiniStat value={shortlist} label="Shortlist" /></div></section>}
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-2">
        <TransferAction icon={<Binoculars className="size-5 md:size-6" />} title="Recommended players" sub="Set a scouting brief and send your recruitment team looking for suitable players" onClick={() => setView("find")} />
        <TransferAction icon={<Handshake className="size-5 md:size-6" />} title="Negotiations" sub={incomingDeals ? `${incomingDeals} incoming deal${incomingDeals === 1 ? "" : "s"} live` : "No buying talks currently open"} onClick={() => setView("operations")} />
        <TransferAction icon={<Star className="size-5 md:size-6" />} title="Scouting reports" sub={activeScouting || completedReports ? `${activeScouting} active · ${completedReports} full · ${shortlist} watched` : "Players you scout stay here until you are done with them"} onClick={() => setView("reports")} />
        <TransferAction icon={<Shield className="size-5 md:size-6" />} title="Sell players" sub={sales ? `${sales} offer${sales === 1 ? "" : "s"} waiting` : "List players and manage incoming bids"} onClick={() => setView("sales")} />
        <TransferAction icon={<Repeat2 className="size-5 md:size-6" />} title="Loans" sub={activeLoans ? `${activeLoans} active agreement${activeLoans === 1 ? "" : "s"}` : "No active loan agreements"} onClick={() => setView("loans")} />
      </div>
    </OverviewScreen>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) { return <div className="rounded-lg bg-muted/50 p-1.5 md:p-2"><div className="font-display text-base md:text-lg">{value}</div><div className="text-[10px] text-muted-foreground md:text-xs">{label}</div></div>; }
function TransferAction({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) { return <WorkflowTile icon={icon} title={title} value={sub} onClick={onClick} />; }