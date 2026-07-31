import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FootballPlayer, GameState, Position } from "@/lib/game/types";
import {
  activeContract,
  ageOf,
  askingPrice,
  averageSquadAge,
  completeTransfer,
  contractSecurityPct,
  freeAgents,
  improvePersonalTerms,
  improveTransferOffer,
  openNegotiations,
  playerById,
  playerName,
  recruitmentSnapshot,
  releasePlayer,
  renewContract,
  renewalTerms,
  respondToIncomingOffer,
  setTransferStatus,
  shortlistIds,
  submitTransferOffer,
  toggleShortlist,
  transferMarket,
  userSquad,
  wageDemand,
  weeksLeftOnContract,
  withdrawFromTalks,
} from "@/lib/game/recruitment";
import { fmtMoney, fmtMoneyExact, setTransferBudget } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type View = "squad" | "market" | "deals" | "history";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export function RecruitmentTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("squad");
  const [note, setNote] = useState<string | null>(null);

  const snap = useMemo(
    () => (state.football ? recruitmentSnapshot(state) : null),
    [state],
  );

  if (!state.football || !snap) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        The football department has not been set up yet. Advance a week to open it.
      </div>
    );
  }

  const act = (fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } }) => {
    update((s) => {
      const r = fn(s);
      setNote(r.result.reason);
      return r.state;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Squad" value={`${snap.squadSize} players`} sub={`Avg age ${averageSquadAge(state).toFixed(1)}`} />
        <Stat label="Wage bill" value={`${fmtMoneyExact(snap.wageBillWeekly)}/wk`} sub={snap.wageBudgetWeekly ? `Ceiling ${fmtMoneyExact(snap.wageBudgetWeekly)}/wk` : "No ceiling set"} />
        <Stat label="Budget remaining" value={fmtMoneyExact(snap.budgetRemaining)} sub={`Net spend ${fmtMoney(snap.netSpend)}`} />
        <Stat label="Contract security" value={`${contractSecurityPct(state).toFixed(0)}%`} sub={`${snap.expiringContracts} expiring`} />
      </div>

      <BudgetPanel state={state} update={update} onNote={setNote} />

      <div className="flex flex-wrap gap-1">
        {(["squad", "market", "deals", "history"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "text-sm px-3 py-1.5 rounded-lg border capitalize",
              view === v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
            )}
          >
            {v === "deals" ? `Negotiations (${openNegotiations(state).length})` : v}
          </button>
        ))}
      </div>

      {note && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm flex items-start justify-between gap-3">
          <span>{note}</span>
          <button className="text-xs text-muted-foreground" onClick={() => setNote(null)}>dismiss</button>
        </div>
      )}

      {view === "squad" && <SquadView state={state} act={act} update={update} />}
      {view === "market" && <MarketView state={state} act={act} update={update} />}
      {view === "deals" && <DealsView state={state} act={act} />}
      {view === "history" && <HistoryView state={state} />}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function BudgetPanel({
  state,
  update,
  onNote,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onNote: (n: string) => void;
}) {
  const [input, setInput] = useState(String(state.transferBudget ?? 0));
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="font-semibold">Transfer budget authority</div>
      <p className="text-xs text-muted-foreground mt-0.5">
        The budget authorises spending. A signing still needs real cash in the bank.
      </p>
      <div className="flex gap-2 mt-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ""))}
          className="tnum"
        />
        <Button
          variant="secondary"
          onClick={() =>
            update((s) => {
              const r = setTransferBudget(s, Number(input) || 0);
              onNote(r.ok ? "Budget updated." : r.reason ?? "Could not set budget");
              return r.state;
            })
          }
        >
          Set
        </Button>
      </div>
      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4">
        <span>Authorised: <span className="tnum">{fmtMoneyExact(state.transferBudget ?? 0)}</span></span>
        <span>Cash: <span className="tnum">{fmtMoneyExact(state.cash)}</span></span>
      </div>
    </div>
  );
}

function PlayerLine({ state, p }: { state: GameState; p: FootballPlayer }) {
  const c = activeContract(state, p.id);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold truncate">{playerName(p)}</span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted">{p.primaryPosition}</span>
        <span className="text-xs text-muted-foreground">
          {ageOf(p, state.season)}y · CA {p.currentAbility} · {fmtMoney(p.marketValue)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {c
          ? `${fmtMoneyExact(c.weeklyWage)}/wk · ${c.squadRole} · ${Math.max(0, weeksLeftOnContract(state, c))} wks left`
          : "No contract"}
      </div>
    </div>
  );
}

function SquadView({
  state,
  act,
  update,
}: {
  state: GameState;
  act: (fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } }) => void;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const squad = userSquad(state);
  return (
    <div className="space-y-4">
      {POSITIONS.map((pos) => {
        const group = squad.filter((p) => p.primaryPosition === pos);
        if (!group.length) return null;
        return (
          <div key={pos} className="rounded-xl border bg-card">
            <div className="px-4 py-2 border-b font-semibold text-sm">{pos} ({group.length})</div>
            <div className="divide-y">
              {group.map((p) => {
                const terms = renewalTerms(state, p.id);
                return (
                  <div key={p.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1"><PlayerLine state={state} p={p} /></div>
                    <div className="flex gap-2 flex-wrap">
                      {terms && (
                        <Button size="sm" variant="secondary" onClick={() => act((s) => renewContract(s, p.id))}>
                          Renew {fmtMoney(terms.weeklyWage)}/wk
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          act((s) =>
                            setTransferStatus(s, p.id, p.transferStatus === "listed" ? "none" : "listed"),
                          )
                        }
                      >
                        {p.transferStatus === "listed" ? "Unlist" : "List"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Release ${playerName(p)}?`)) act((s) => releasePlayer(s, p.id));
                        }}
                      >
                        Release
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!squad.length && (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No registered players.</div>
      )}
      <div className="text-xs text-muted-foreground">
        Shortlisted: {shortlistIds(state).length}.{" "}
        <button className="underline" onClick={() => update((s) => s)}>refresh</button>
      </div>
    </div>
  );
}

function MarketView({
  state,
  act,
  update,
}: {
  state: GameState;
  act: (fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } }) => void;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [maxFee, setMaxFee] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyShortlist, setOnlyShortlist] = useState(false);
  const short = shortlistIds(state);

  const rows = useMemo(() => {
    const base = onlyFree
      ? freeAgents(state).map((p) => ({ player: p, askingFee: 0, wage: wageDemand(state, p) }))
      : transferMarket(state).map((e) => ({
          player: e.player,
          askingFee: askingPrice(state, e.player),
          wage: wageDemand(state, e.player),
        }));
    const cap = Number(maxFee) || Infinity;
    return base
      .filter((r) => (pos === "ALL" ? true : r.player.primaryPosition === pos))
      .filter((r) => r.askingFee <= cap)
      .filter((r) => (onlyShortlist ? short.includes(r.player.id) : true))
      .slice(0, 60);
  }, [state, pos, maxFee, onlyFree, onlyShortlist, short]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-3 flex flex-wrap gap-2 items-center">
        {(["ALL", ...POSITIONS] as (Position | "ALL")[]).map((p) => (
          <button
            key={p}
            onClick={() => setPos(p)}
            className={cn(
              "text-xs px-2 py-1 rounded border",
              pos === p ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
            )}
          >
            {p}
          </button>
        ))}
        <Input
          placeholder="Max fee"
          value={maxFee}
          onChange={(e) => setMaxFee(e.target.value.replace(/[^0-9]/g, ""))}
          className="w-32 tnum h-8"
        />
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
          Free agents
        </label>
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={onlyShortlist} onChange={(e) => setOnlyShortlist(e.target.checked)} />
          Shortlist only
        </label>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {rows.map((r) => (
          <div key={r.player.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1"><PlayerLine state={state} p={r.player} /></div>
            <div className="text-sm tnum sm:text-right">
              <div>Fee {fmtMoney(r.askingFee)}</div>
              <div className="text-xs text-muted-foreground">{fmtMoney(r.wage)}/wk asked</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act((s) => submitTransferOffer(s, r.player.id, r.askingFee))}>
                Bid
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => update((s) => toggleShortlist(s, r.player.id))}
              >
                {short.includes(r.player.id) ? "Unwatch" : "Watch"}
              </Button>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Nobody matches those filters right now.
          </div>
        )}
      </div>
    </div>
  );
}

function DealsView({
  state,
  act,
}: {
  state: GameState;
  act: (fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } }) => void;
}) {
  const open = openNegotiations(state);
  if (!open.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground text-center">
        No live negotiations. Bid for a player or wait for an approach.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {open.map((n) => {
        const p = playerById(state, n.playerId);
        if (!p) return null;
        const incoming = n.direction === "in";
        return (
          <div key={n.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <PlayerLine state={state} p={p} />
              <span className="text-[10px] font-bold px-2 py-1 rounded bg-muted uppercase">
                {incoming ? "Incoming" : "Outgoing"} · {n.stage}
              </span>
            </div>
            <div className="text-sm tnum text-muted-foreground">
              Fee {fmtMoneyExact(n.clubCounterFee ?? n.fee)} · Wage {fmtMoneyExact(n.proposedWeeklyWage)}/wk ·{" "}
              {n.proposedLengthSeasons} season(s)
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-auto">
              {n.log.slice(-4).map((l, i) => (
                <div key={i}>• {l.note}</div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {n.stage === "agreed" && (
                <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))}>
                  Complete deal
                </Button>
              )}
              {incoming && n.stage === "clubTalks" && (
                <Button size="sm" variant="secondary" onClick={() => act((s) => improveTransferOffer(s, n.id))}>
                  Improve the fee
                </Button>
              )}
              {incoming && n.stage === "playerTalks" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => act((s) => improvePersonalTerms(s, n.id, n.playerCounterWage))}
                >
                  Meet his wage demand
                </Button>
              )}
              {!incoming && n.stage === "clubTalks" && (
                <>
                  <Button size="sm" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "accept"))}>
                    Accept bid
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      act((s) => respondToIncomingOffer(s, n.id, "counter", Math.round(n.fee * 1.25)))
                    }
                  >
                    Counter {fmtMoney(Math.round(n.fee * 1.25))}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "reject"))}>
                    Reject
                  </Button>
                </>
              )}
              {incoming && (
                <Button size="sm" variant="ghost" onClick={() => act((s) => withdrawFromTalks(s, n.id))}>
                  Withdraw
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryView({ state }: { state: GameState }) {
  const transfers = (state.football?.transferHistory ?? [])
    .filter((r) => r.toClubId === state.clubName || r.fromClubId === state.clubName)
    .slice()
    .reverse()
    .slice(0, 25);
  const seasons = state.football?.seasonHistory ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card">
        <div className="px-4 py-2 border-b font-semibold text-sm">Transfer record</div>
        <div className="divide-y text-sm">
          {transfers.map((r) => {
            const incoming = r.toClubId === state.clubName;
            return (
              <div key={r.id} className="px-4 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      incoming
                        ? "bg-[color:var(--color-income)]/20 text-[color:var(--color-income)]"
                        : "bg-[color:var(--color-expense)]/20 text-[color:var(--color-expense)]",
                    )}
                  >
                    {incoming ? "IN" : "OUT"}
                  </span>
                  <span className="truncate">
                    {r.playerName} <span className="text-muted-foreground">({r.position})</span>
                  </span>
                </div>
                <div className="text-xs tnum text-muted-foreground shrink-0">
                  S{r.season} W{r.week} · {fmtMoney(r.fee)}
                </div>
              </div>
            );
          })}
          {!transfers.length && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">No completed transfers yet.</div>
          )}
        </div>
      </div>

      {seasons.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-4 py-2 border-b font-semibold text-sm">Season summaries</div>
          <div className="divide-y text-sm">
            {seasons.slice().reverse().map((y) => (
              <div key={y.season} className="px-4 py-2 flex justify-between gap-2 tnum">
                <span>Season {y.season}</span>
                <span className="text-xs text-muted-foreground">
                  In {y.playersIn} · Out {y.playersOut} · Net {fmtMoney(y.netSpend)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
