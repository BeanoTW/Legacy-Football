import { useState } from "react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { playerAttributes, scoutingReport } from "@/lib/game/scouting";
import {
  activeContract,
  ageOf,
  completeTransfer,
  improvePersonalTerms,
  improveTransferOffer,
  openNegotiations,
  playerById,
  playerName,
  respondToIncomingOffer,
  userSquad,
  withdrawFromTalks,
} from "@/lib/game/recruitment";

export function RecruitmentOperations({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<"squad" | "deals">("squad");
  const act = (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) => update((s) => fn(s).state);
  const deals = openNegotiations(state);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant={view === "squad" ? "default" : "outline"} onClick={() => setView("squad")}>
          Your squad
        </Button>
        <Button variant={view === "deals" ? "default" : "outline"} onClick={() => setView("deals")}>
          Negotiations ({deals.length})
        </Button>
      </div>
      {view === "squad" ? (
        <div className="space-y-3">
          {userSquad(state).map((player) => {
            const attrs = playerAttributes(player);
            const contract = activeContract(state, player.id);
            return (
              <article key={player.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl">
                      {playerName(player)}{" "}
                      <span className="text-xs font-sans font-bold bg-muted rounded px-2 py-1">
                        {player.primaryPosition}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {ageOf(player, state.season)} years · Overall {player.currentAbility} ·{" "}
                      {fmtMoney(player.marketValue)}
                    </div>
                  </div>
                  {contract && (
                    <div className="text-right text-sm">
                      <div>{fmtMoneyExact(contract.weeklyWage)}/wk</div>
                      <div className="text-xs text-muted-foreground">{contract.squadRole}</div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2 mt-4">
                  {Object.entries(attrs).map(([key, value]) => (
                    <div key={key} className="rounded-lg bg-muted/50 p-2">
                      <div className="text-[10px] uppercase text-muted-foreground">{key}</div>
                      <div className="font-semibold tabular-nums">{value}</div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((n) => {
            const p = playerById(state, n.playerId);
            if (!p) return null;
            const incoming = n.direction === "in";
            const report = scoutingReport(state, p);
            return (
              <article key={n.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl">{playerName(p)}</div>
                    <div className="text-sm text-muted-foreground">
                      {p.primaryPosition} ·{" "}
                      {incoming ? `${report.knowledgePct}% scouted` : `Overall ${p.currentAbility}`}
                    </div>
                  </div>
                  <span className="text-xs font-bold bg-muted rounded px-2 py-1">{n.stage}</span>
                </div>
                {incoming && (
                  <div className="grid grid-cols-5 gap-2 mt-4">
                    {report.attributes
                      .filter((a) => a.known)
                      .slice(0, 5)
                      .map((a) => (
                        <div key={a.key} className="rounded-lg bg-muted/50 p-2">
                          <div className="text-[10px] text-muted-foreground">{a.label}</div>
                          <div className="font-semibold">{a.exact ?? `${a.min}–${a.max}`}</div>
                        </div>
                      ))}
                  </div>
                )}
                <div className="text-sm text-muted-foreground mt-4">
                  Fee {fmtMoneyExact(n.clubCounterFee ?? n.fee)} · Wage{" "}
                  {fmtMoneyExact(n.proposedWeeklyWage)}/wk
                </div>
                <div className="flex gap-2 flex-wrap mt-3">
                  {n.stage === "agreed" && (
                    <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))}>
                      Complete deal
                    </Button>
                  )}
                  {incoming && n.stage === "clubTalks" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => act((s) => improveTransferOffer(s, n.id))}
                    >
                      Improve fee
                    </Button>
                  )}
                  {incoming && n.stage === "playerTalks" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => act((s) => improvePersonalTerms(s, n.id, n.playerCounterWage))}
                    >
                      Improve terms
                    </Button>
                  )}
                  {!incoming && n.stage === "clubTalks" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => act((s) => respondToIncomingOffer(s, n.id, "accept"))}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => act((s) => respondToIncomingOffer(s, n.id, "reject"))}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {incoming && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act((s) => withdrawFromTalks(s, n.id))}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          {!deals.length && (
            <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
              No live negotiations.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
