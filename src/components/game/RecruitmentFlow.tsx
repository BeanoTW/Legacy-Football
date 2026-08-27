import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, Handshake, Shield, Users } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { RecruitmentOperations } from "./RecruitmentOperations";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { SquadSelectionTab } from "./SquadSelectionTab";
import { OutgoingSalesDesk } from "./OutgoingSalesDesk";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { openNegotiations, recruitmentSnapshot, shortlistIds } from "@/lib/game/recruitment";
import { OverviewScreen, WorkflowTile } from "./shared/layout";

type View = "home" | "operations" | "scout" | "squad" | "sales";

export function RecruitmentFlow({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("home");
  const snap = useMemo(() => (state.football ? recruitmentSnapshot(state) : null), [state]);

  if (view === "scout") {
    return <ScoutingBrowser state={state} update={update} onBack={() => setView("home")} />;
  }
  if (view === "squad") {
    return <SquadSelectionTab state={state} update={update} onBack={() => setView("home")} />;
  }
  if (view === "sales") {
    return <OutgoingSalesDesk state={state} update={update} onBack={() => setView("home")} />;
  }
  if (view === "operations") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <Button
          className="w-fit shrink-0"
          variant="ghost"
          size="sm"
          onClick={() => setView("home")}
        >
          <ArrowLeft className="size-4 mr-2" /> Back to transfers
        </Button>
        <div className="min-h-0 flex-1 overflow-hidden">
          <RecruitmentOperations state={state} update={update} />
        </div>
      </div>
    );
  }

  const negotiations = state.football ? openNegotiations(state) : [];
  const deals = negotiations.length;
  const sales = negotiations.filter((negotiation) => negotiation.direction === "out").length;
  const shortlist = state.football ? shortlistIds(state).length : 0;
  const scouting =
    state.football?.scouting?.assignments.filter((a) => a.status === "active").length ?? 0;

  return (
    <OverviewScreen
      title="Transfers"
      subtitle="Buy, sell and plan the squad."
      className="grid content-start gap-2 md:gap-3 xl:grid-cols-[minmax(320px,.9fr)_minmax(0,1.6fr)] xl:content-stretch"
    >
      {snap && (
        <section className="flex flex-col justify-center rounded-xl border bg-card p-3 shadow-sm md:p-4">
          <div className="text-xs text-muted-foreground">Transfer budget remaining</div>
          <div className="font-display text-2xl leading-tight md:text-3xl xl:text-4xl">
            {fmtMoneyExact(snap.budgetRemaining)}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center md:mt-3 md:gap-2">
            <MiniStat value={snap.squadSize} label="Players" />
            <MiniStat value={deals} label="Live deals" />
            <MiniStat value={sales} label="Offers in" />
            <MiniStat value={scouting} label="Scouted" />
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-3">
        <TransferAction
          icon={<Binoculars className="size-5 md:size-6" />}
          title="Scout players"
          sub={scouting ? `${scouting} reports developing` : "Knowledge improves over time"}
          onClick={() => setView("scout")}
        />
        <TransferAction
          icon={<Handshake className="size-5 md:size-6" />}
          title="Buy players"
          sub={
            deals ? `${deals} live negotiation${deals === 1 ? "" : "s"}` : "Search and negotiate"
          }
          onClick={() => setView("operations")}
        />
        <TransferAction
          icon={<Shield className="size-5 md:size-6" />}
          title="Sell players"
          sub={
            sales ? `${sales} offer${sales === 1 ? "" : "s"} waiting` : "List and set asking prices"
          }
          onClick={() => setView("sales")}
        />
        <TransferAction
          icon={<Users className="size-5 md:size-6" />}
          title="Squad & selection"
          sub={snap ? `${snap.squadSize} players · pitch-based XI` : "Open football department"}
          onClick={() => setView("squad")}
        />
        <TransferAction
          icon={<Shield className="size-5 md:size-6" />}
          title="Contracts"
          sub={
            snap ? `${snap.expiringContracts} expiring · ${shortlist} watched` : "Review contracts"
          }
          onClick={() => setView("operations")}
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

function TransferAction({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return <WorkflowTile icon={icon} title={title} value={sub} onClick={onClick} />;
}
