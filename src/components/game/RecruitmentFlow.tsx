import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, Handshake, Shield, Star } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { RecruitmentOperations } from "./RecruitmentOperations";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { OutgoingSalesDesk } from "./OutgoingSalesDesk";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { openNegotiations, recruitmentSnapshot, shortlistIds } from "@/lib/game/recruitment";
import { OverviewScreen, WorkflowTile } from "./shared/layout";

type View = "home" | "operations" | "find" | "sales";

export function RecruitmentFlow({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("home");
  const snap = useMemo(() => (state.football ? recruitmentSnapshot(state) : null), [state]);

  if (view === "find") {
    return <ScoutingBrowser state={state} update={update} onBack={() => setView("home")} />;
  }
  if (view === "sales") {
    return <OutgoingSalesDesk state={state} update={update} onBack={() => setView("home")} />;
  }
  if (view === "operations") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <Button className="w-fit shrink-0" variant="ghost" size="sm" onClick={() => setView("home")}>
          <ArrowLeft className="mr-2 size-4" /> Back to transfers
        </Button>
        <div className="min-h-0 flex-1 overflow-hidden">
          <RecruitmentOperations state={state} update={update} />
        </div>
      </div>
    );
  }

  const negotiations = state.football ? openNegotiations(state) : [];
  const incomingDeals = negotiations.filter((negotiation) => negotiation.direction === "in").length;
  const sales = negotiations.filter((negotiation) => negotiation.direction === "out").length;
  const shortlist = state.football ? shortlistIds(state).length : 0;
  const scoutingAssignments = state.football?.scouting?.assignments ?? [];
  const activeScouting = scoutingAssignments.filter((assignment) => assignment.status === "active").length;
  const completedReports = scoutingAssignments.filter((assignment) => assignment.status === "complete").length;

  return (
    <OverviewScreen
      title="Transfers"
      subtitle="Find players, gather information and manage live deals. Squad and contracts now live in the dedicated Squad area."
      className="grid content-start gap-2 md:gap-3 xl:grid-cols-[minmax(320px,.9fr)_minmax(0,1.6fr)] xl:content-stretch"
    >
      {snap && (
        <section className="flex flex-col justify-center rounded-xl border bg-card p-3 shadow-sm md:p-4">
          <div className="text-xs text-muted-foreground">Transfer budget remaining</div>
          <div className="font-display text-2xl leading-tight md:text-3xl xl:text-4xl">
            {fmtMoneyExact(snap.budgetRemaining)}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center md:mt-3 md:gap-2">
            <MiniStat value={incomingDeals} label="Buying" />
            <MiniStat value={sales} label="Offers in" />
            <MiniStat value={activeScouting} label="Scouting" />
            <MiniStat value={shortlist} label="Shortlist" />
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-2">
        <TransferAction
          icon={<Binoculars className="size-5 md:size-6" />}
          title="Find players"
          sub="Filter the market, compare players, scout or approach immediately"
          onClick={() => setView("find")}
        />
        <TransferAction
          icon={<Handshake className="size-5 md:size-6" />}
          title="Negotiations"
          sub={incomingDeals ? `${incomingDeals} incoming deal${incomingDeals === 1 ? "" : "s"} live` : "No buying talks currently open"}
          onClick={() => setView("operations")}
        />
        <TransferAction
          icon={<Star className="size-5 md:size-6" />}
          title="Scouting & shortlist"
          sub={activeScouting || completedReports ? `${activeScouting} active · ${completedReports} full · ${shortlist} watched` : "Track players you want to revisit"}
          onClick={() => setView("find")}
        />
        <TransferAction
          icon={<Shield className="size-5 md:size-6" />}
          title="Sell players"
          sub={sales ? `${sales} offer${sales === 1 ? "" : "s"} waiting` : "List players and manage incoming bids"}
          onClick={() => setView("sales")}
        />
      </div>
    </OverviewScreen>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-1.5 md:p-2">
      <div className="font-display text-base md:text-lg">{value}</div>
      <div className="text-[10px] text-muted-foreground md:text-xs">{label}</div>
    </div>
  );
}

function TransferAction({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return <WorkflowTile icon={icon} title={title} value={sub} onClick={onClick} />;
}
