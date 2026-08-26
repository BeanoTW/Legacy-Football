import { useMemo, useState } from "react";
import { ArrowLeft, BadgePoundSterling, Tag } from "lucide-react";
import type { FootballPlayer, GameState } from "@/lib/game/types";
import {
  activeContract,
  openNegotiations,
  playerById,
  playerName,
  respondToIncomingOffer,
  setTransferStatus,
  userSquad,
} from "@/lib/game/recruitment";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OutgoingSalesDesk({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const squad = useMemo(() => userSquad(state), [state]);
  const offers = useMemo(
    () => openNegotiations(state).filter((negotiation) => negotiation.direction === "out"),
    [state],
  );
  const listed = squad.filter((player) => player.transferStatus === "listed");

  const act = (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) => {
    update((s) => {
      const result = fn(s);
      setNote(result.result.reason);
      return result.state;
    });
  };

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-full">
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back to transfers
        </Button>
        {note && (
          <div className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs">
            {note}
          </div>
        )}
      </div>

      <section className="shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="panel-strip px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
                Transfer department
              </div>
              <h1 className="font-display text-2xl">Sell players</h1>
              <p className="mt-0.5 max-w-2xl text-xs opacity-80 sm:text-sm">
                Put players on the market, set an asking price and negotiate incoming bids.
              </p>
            </div>
            <BadgePoundSterling className="size-7 opacity-70" />
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x text-center">
          <Summary label="Listed" value={String(listed.length)} />
          <Summary label="Live offers" value={String(offers.length)} />
          <Summary
            label="Listed value"
            value={fmtMoney(listed.reduce((sum, player) => sum + player.marketValue, 0))}
          />
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="shrink-0 border-b px-4 py-2.5">
            <h2 className="font-display text-lg">Offers on the table</h2>
            <p className="text-[11px] text-muted-foreground">Actionable bids from other clubs.</p>
          </div>
          <div className="contained-scroll flex-1 p-3">
            {offers.length === 0 ? (
              <div className="grid h-full min-h-28 place-items-center rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                No live bids. Listing players makes them available to AI clubs during the window.
              </div>
            ) : (
              <div className="space-y-2">
                {offers.map((offer) => {
                  const player = playerById(state, offer.playerId);
                  if (!player) return null;
                  const ask = askingPricePreference(state, player);
                  const offerFee = offer.clubCounterFee ?? offer.fee;
                  return (
                    <div key={offer.id} className="rounded-lg border bg-background/40 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <PlayerSummary player={player} state={state} />
                        <div className="text-right">
                          <div className="font-display text-xl">{fmtMoneyExact(offerFee)}</div>
                          <div className="text-[9px] uppercase text-muted-foreground">Current bid</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Ask {fmtMoneyExact(ask)}
                        {offerFee >= ask
                          ? " · meets your target"
                          : ` · ${fmtMoneyExact(ask - offerFee)} short`}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => act((s) => respondToIncomingOffer(s, offer.id, "accept"))}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            act((s) => respondToIncomingOffer(s, offer.id, "counter", ask))
                          }
                        >
                          Counter {fmtMoney(ask)}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act((s) => respondToIncomingOffer(s, offer.id, "reject"))}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="shrink-0 border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-primary" />
              <h2 className="font-display text-lg">Your squad</h2>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Set an asking target and list players without turning this into a long page.
            </p>
          </div>
          <div className="contained-scroll flex-1 divide-y">
            {squad
              .slice()
              .sort((a, b) => b.marketValue - a.marketValue)
              .map((player) => (
                <SaleRow
                  key={player.id}
                  state={state}
                  player={player}
                  update={update}
                  act={act}
                />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SaleRow({
  state,
  player,
  update,
  act,
}: {
  state: GameState;
  player: FootballPlayer;
  update: (fn: (s: GameState) => GameState) => void;
  act: (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) => void;
}) {
  const listed = player.transferStatus === "listed";
  const ask = askingPricePreference(state, player);
  const [draft, setDraft] = useState(String(ask));

  const saveAsk = () => {
    const value = Math.max(0, Number(draft) || player.marketValue);
    update((s) => ({
      ...s,
      inboxFlags: { ...s.inboxFlags, [`transfer.ask.${player.id}`]: Math.round(value) },
    }));
  };

  return (
    <div className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
      <PlayerSummary player={player} state={state} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] uppercase text-muted-foreground">Ask</span>
        <Input
          aria-label={`Asking price for ${playerName(player)}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
          onBlur={saveAsk}
          className="h-8 w-24 tnum text-xs"
        />
        <Button
          size="sm"
          variant={listed ? "secondary" : "default"}
          onClick={() =>
            act((s) => setTransferStatus(s, player.id, listed ? "unlisted" : "listed"))
          }
        >
          {listed ? "Unlist" : "List"}
        </Button>
      </div>
    </div>
  );
}

function PlayerSummary({ player, state }: { player: FootballPlayer; state: GameState }) {
  const contract = activeContract(state, player.id);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="truncate text-sm font-semibold">{playerName(player)}</div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold">
          {player.primaryPosition}
        </span>
        {player.transferStatus === "listed" && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
            LISTED
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
        Ability {player.currentAbility} · Value {fmtMoneyExact(player.marketValue)}
        {contract ? ` · ${fmtMoneyExact(contract.weeklyWage)}/wk` : ""}
      </div>
    </div>
  );
}

function askingPricePreference(state: GameState, player: FootballPlayer): number {
  const stored = state.inboxFlags[`transfer.ask.${player.id}`];
  return typeof stored === "number" && Number.isFinite(stored)
    ? Math.max(0, Math.round(stored))
    : Math.round(player.marketValue * 1.15);
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2">
      <div className="font-display text-xl">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
