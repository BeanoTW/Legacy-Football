import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [wageOffers, setWageOffers] = useState<Record<string, string>>({});
  const [actionNote, setActionNote] = useState<string | null>(null);
  const act = (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) =>
    update((s) => {
      const outcome = fn(s);
      setActionNote(outcome.result.reason);
      return outcome.state;
    });
  const deals = openNegotiations(state);
  const squad = userSquad(state);
  const selectedPlayer = selectedPlayerId ? playerById(state, selectedPlayerId) : undefined;
  const positionGroups = useMemo(
    () =>
      (["GK", "DEF", "MID", "FWD"] as const).map((position) => ({
        position,
        players: squad
          .filter((player) => player.primaryPosition === position)
          .sort((a, b) => playerName(a).localeCompare(playerName(b))),
      })),
    [squad],
  );

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
      {actionNote && <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">{actionNote}</div>}
      {view === "squad" && selectedPlayer ? (
        <PlayerProfile
          state={state}
          player={selectedPlayer}
          onBack={() => setSelectedPlayerId(null)}
        />
      ) : view === "squad" ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Select a player to view abilities, profile and contract details.
          </div>
          {positionGroups.map(({ position, players }) =>
            players.length ? (
              <section key={position} className="overflow-hidden rounded-2xl border bg-card">
                <div className="border-b bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wider">
                  {position} · {players.length}
                </div>
                <div className="divide-y">
                  {players.map((player) => {
                    const contract = activeContract(state, player.id);
                    return (
                      <button
                        key={player.id}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                        onClick={() => setSelectedPlayerId(player.id)}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {player.primaryPosition}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{playerName(player)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            Age {ageOf(player, state.season)} · {contract?.squadRole ?? "Unregistered"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm">
                          <span className="block">{contract ? `${fmtMoneyExact(contract.weeklyWage)}/wk` : "No deal"}</span>
                          <span className="block text-xs text-muted-foreground">{fmtMoney(player.marketValue)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null,
          )}
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
                {incoming && n.stage === "playerTalks" && (
                  <div className="mt-4 rounded-xl border bg-muted/30 p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Personal terms
                    </div>
                    {n.playerCounterWage && (
                      <div className="mt-1 text-sm">
                        Player demand: <strong>{fmtMoneyExact(n.playerCounterWage)}/wk</strong>
                      </div>
                    )}
                    <label className="mt-3 block text-xs text-muted-foreground" htmlFor={`wage-${n.id}`}>
                      Your revised weekly wage
                    </label>
                    <input
                      id={`wage-${n.id}`}
                      type="number"
                      min={n.proposedWeeklyWage + 25}
                      step={25}
                      value={wageOffers[n.id] ?? String(n.playerCounterWage ?? n.proposedWeeklyWage + 25)}
                      onChange={(event) =>
                        setWageOffers((current) => ({ ...current, [n.id]: event.target.value }))
                      }
                      className="mt-1 h-10 w-full rounded-lg border bg-background px-3 tabular-nums"
                    />
                  </div>
                )}
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
                      onClick={() => {
                        const fallback = n.playerCounterWage ?? n.proposedWeeklyWage + 25;
                        const wage = Number(wageOffers[n.id] ?? fallback);
                        act((s) => improvePersonalTerms(s, n.id, wage));
                      }}
                    >
                      Submit counter-offer
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

function PlayerProfile({
  state,
  player,
  onBack,
}: {
  state: GameState;
  player: NonNullable<ReturnType<typeof playerById>>;
  onBack: () => void;
}) {
  const attrs = playerAttributes(player);
  const contract = activeContract(state, player.id);
  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Back to squad
      </Button>
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="panel-strip p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-3xl">{playerName(player)}</div>
              <div className="mt-1 text-sm opacity-80">
                {player.primaryPosition} · Age {ageOf(player, state.season)} · {player.nationality}
              </div>
            </div>
            <div className="rounded-xl bg-black/20 px-3 py-2 text-center">
              <div className="text-[10px] uppercase opacity-70">Overall</div>
              <div className="font-display text-3xl">{player.currentAbility}</div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <ProfileFact label="Value" value={fmtMoney(player.marketValue)} />
            <ProfileFact label="Wage" value={contract ? `${fmtMoneyExact(contract.weeklyWage)}/wk` : "—"} />
            <ProfileFact label="Role" value={contract?.squadRole ?? "—"} />
            <ProfileFact label="Preferred foot" value={player.preferredFoot} />
          </div>
          <h3 className="mt-6 font-display text-xl">Abilities</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(attrs).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-muted/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{key}</div>
                <div className="font-display text-2xl tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

