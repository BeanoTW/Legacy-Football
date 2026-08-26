import { useMemo, useState } from "react";
import { ArrowLeft, BadgePoundSterling, Handshake, Tag } from "lucide-react";
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
    <div className="space-y-5">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Back to transfers
      </Button>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="panel-strip p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">Transfer department</div>
              <h1 className="font-display text-3xl">Sell players</h1>
              <p className="mt-1 max-w-2xl text-sm opacity-80">
                Put players on the market, set your preferred asking price and negotiate when clubs make an approach.
              </p>
            </div>
            <BadgePoundSterling className="size-8 opacity-70" />
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

      {note && (
        <div className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">{note}</div>
      )}

      {offers.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-2xl">Offers on the table</h2>
            <p className="text-sm text-muted-foreground">These are actionable bids from other clubs.</p>
          </div>
          {offers.map((offer) => {
            const player = playerById(state, offer.playerId);
            if (!player) return null;
            const ask = askingPricePreference(state, player);
            const offerFee = offer.clubCounterFee ?? offer.fee;
            return (
              <div key={offer.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <PlayerSummary player={player} state={state} />
                  <div className="text-right">
                    <div className="font-display text-2xl">{fmtMoneyExact(offerFee)}</div>
                    <div className="text-[10px] uppercase text-muted-foreground">Current bid</div>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-muted/40 p-3 text-sm">
                  Your preferred asking price is <strong>{fmtMoneyExact(ask)}</strong>.
                  {offerFee >= ask ? " The bid meets it." : ` The bid is ${fmtMoneyExact(ask - offerFee)} short.`}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => act((s) => respondToIncomingOffer(s, offer.id, "accept"))}>
                    Accept {fmtMoney(offerFee)}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => act((s) => respondToIncomingOffer(s, offer.id, "counter", ask))}
                  >
                    Counter at {fmtMoney(ask)}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act((s) => respondToIncomingOffer(s, offer.id, "reject"))}>
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Tag className="size-5 text-primary" />
            <h2 className="font-display text-xl">Your squad</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Listing a player makes him available to AI clubs during the transfer window. The asking price is your negotiation target, not a guaranteed sale price.
          </p>
        </div>
        <div className="divide-y">
          {squad
            .slice()
            .sort((a, b) => b.marketValue - a.marketValue)
            .map((player) => (
              <SaleRow key={player.id} state={state} player={player} update={update} act={act} />
            ))}
        </div>
      </section>
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
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <PlayerSummary player={player} state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-muted-foreground">Ask</span>
          <Input
            aria-label={`Asking price for ${playerName(player)}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={saveAsk}
            className="h-8 w-28 tnum"
          />
        </div>
        <Button
          size="sm"
          variant={listed ? "secondary" : "default"}
          onClick={() => act((s) => setTransferStatus(s, player.id, listed ? "unlisted" : "listed"))}
        >
          {listed ? "Remove listing" : "List for transfer"}
        </Button>
      </div>
    </div>
  );
}

function PlayerSummary({ player, state }: { player: FootballPlayer; state: GameState }) {
  const contract = activeContract(state, player.id);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="truncate font-semibold">{playerName(player)}</div>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">{player.primaryPosition}</span>
        {player.transferStatus === "listed" && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            LISTED
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
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
    <div className="p-3">
      <div className="font-display text-2xl">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
