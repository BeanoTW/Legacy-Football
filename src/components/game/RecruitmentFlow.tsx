import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, Handshake, Shield, Users } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { RecruitmentOperations } from "./RecruitmentOperations";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { openNegotiations, recruitmentSnapshot, shortlistIds } from "@/lib/game/recruitment";

type View = "home" | "operations" | "scout";

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
  if (view === "operations") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setView("home")}>
          <ArrowLeft className="size-4 mr-2" /> Back to transfers
        </Button>
        <RecruitmentOperations state={state} update={update} />
      </div>
    );
  }

  const deals = state.football ? openNegotiations(state).length : 0;
  const shortlist = state.football ? shortlistIds(state).length : 0;
  const scouting =
    state.football?.scouting?.assignments.filter((a) => a.status === "active").length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Transfers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recruit from evidence, not an exposed overall rating.
        </p>
      </div>
      {snap && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Transfer budget remaining</div>
          <div className="font-display text-4xl mt-1">{fmtMoneyExact(snap.budgetRemaining)}</div>
          <div className="grid grid-cols-3 gap-3 mt-5 text-center">
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="font-display text-xl">{snap.squadSize}</div>
              <div className="text-xs text-muted-foreground">Players</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="font-display text-xl">{deals}</div>
              <div className="text-xs text-muted-foreground">Live deals</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="font-display text-xl">{scouting}</div>
              <div className="text-xs text-muted-foreground">Being scouted</div>
            </div>
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TransferAction
          icon={<Binoculars className="size-7" />}
          title="Scout players"
          sub={scouting ? `${scouting} reports developing` : "Discover attributes over time"}
          onClick={() => setView("scout")}
        />
        <TransferAction
          icon={<Handshake className="size-7" />}
          title="Negotiations"
          sub={deals ? `${deals} deal${deals === 1 ? "" : "s"} active` : "No live deals"}
          onClick={() => setView("operations")}
        />
        <TransferAction
          icon={<Users className="size-7" />}
          title="Your squad"
          sub={snap ? `${snap.squadSize} registered players` : "Open football department"}
          onClick={() => setView("operations")}
        />
        <TransferAction
          icon={<Shield className="size-7" />}
          title="Contracts"
          sub={
            snap ? `${snap.expiringContracts} expiring · ${shortlist} watched` : "Review contracts"
          }
          onClick={() => setView("operations")}
        />
      </div>
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
  return (
    <button
      onClick={onClick}
      className="min-h-32 rounded-2xl border bg-card p-4 text-left flex flex-col justify-between hover:border-primary/50 transition-colors"
    >
      <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <div className="mt-4">
        <div className="font-display text-xl">{title}</div>
        <div className="text-sm text-muted-foreground mt-1">{sub}</div>
      </div>
    </button>
  );
}
