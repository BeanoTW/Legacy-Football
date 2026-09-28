import { useMemo, useState } from "react";
import { ArrowLeft, Tag } from "lucide-react";
import type { FootballPlayer, GameState } from "@/lib/game/types";
import {
  ageOf,
  openNegotiations,
  playerById,
  playerName,
  respondToIncomingOffer,
  setTransferStatus,
} from "@/lib/game/recruitment";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { playerOwnerClubId } from "@/lib/game/playerRegistration";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { cn } from "@/lib/utils";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import { CharacterPortrait } from "./CharacterPortrait";
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";

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
  // Sales follow permanent ownership, not playing registration. This keeps
  // loaned-in players out while still showing the club's own players who are
  // temporarily away on loan.
  const squad = useMemo(
    () =>
      (state.football?.players ?? []).filter((player) =>
        isUserClubReference(state, playerOwnerClubId(player)),
      ),
    [state],
  );
  const offers = useMemo(
    () => openNegotiations(state).filter((negotiation) => negotiation.direction === "out"),
    [state],
  );
  const listed = squad.filter((player) => player.transferStatus === "listed");

  const act = (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) => {
    const result = fn(state);
    setNote(result.result.reason);
    update(() => result.state);
  };

  return (
    <div className="lf-sales-desk flex min-h-0 flex-col gap-2 lg:h-full lg:gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="mr-1.5 size-4" /> Transfers
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl">Sell players</h1>
      </div>
      <section className="lf-sales-summary grid shrink-0 grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card text-center shadow-sm">
        <Summary label="Listed" value={String(listed.length)} />
        <Summary label="Live offers" value={String(offers.length)} />
        <Summary label="Listed value" value={fmtMoney(listed.reduce((sum, player) => sum + player.marketValue, 0))} />
      </section>
      {note && <div className="shrink-0 truncate rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">{note}</div>}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:gap-3">
        {offers.length === 0 ? (
          <p className="lf-sales-empty shrink-0 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground lg:self-start">
            <strong className="font-semibold text-foreground">No live bids.</strong> Listed players become available to other clubs during the window.
          </p>
        ) : (
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="shrink-0 border-b px-3 py-2"><h2 className="font-display text-base">Offers on the table · {offers.length}</h2></div>
            <div className="contained-scroll flex-1 space-y-2 p-2">
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
                          <div className="text-[9px] uppercase text-muted-foreground">
                            Current bid
                          </div>
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
          </section>
        )}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Tag className="size-4 text-primary" />
            <h2 className="font-display text-base">Your players · {squad.length}</h2>
            <span className="ml-auto text-[10px] text-muted-foreground">Asking price · £</span>
          </div>
          <div className="contained-scroll flex-1 divide-y">
            {squad
              .slice()
              .sort((a, b) => b.marketValue - a.marketValue)
              .map((player) => (
                <SaleRow key={player.id} state={state} player={player} update={update} act={act} />
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function SaleRow({
  state, player, update, act,
}: {
  state: GameState;
  player: FootballPlayer;
  update: (fn: (s: GameState) => GameState) => void;
  act: (fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } }) => void;
}) {
  const listed = player.transferStatus === "listed";
  const loan = activeLoanForPlayer(state, player.id);
  const ask = askingPricePreference(state, player);
  const [draft, setDraft] = useState(String(ask));
  const position = tacticalPositionProfile(player).primary;

  const saveAsk = () => {
    const value = Math.max(0, Number(draft) || player.marketValue);
    update((s) => ({
      ...s,
      inboxFlags: { ...s.inboxFlags, [`transfer.ask.${player.id}`]: Math.round(value) },
    }));
  };

  return (
    <div className={cn("lf-sale-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5 px-2 py-1", listed && "is-listed")}>
      <button type="button" onClick={() => openPlayerProfile(player.id)}
        className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-1.5 text-left"
        aria-label={`Open ${playerName(player)} profile`}>
        <span className="relative block h-[2.2rem] w-8 shrink-0 overflow-hidden rounded-md border bg-muted/45">
          <CharacterPortrait identity={{ id: player.id, subject: "player" }} size={32} title={`${playerName(player)} portrait`} />
          <span className="absolute bottom-0 right-0 rounded-tl bg-slate-950/85 px-0.5 text-[7px] font-bold leading-tight text-white">{position}</span>
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-display text-sm leading-tight">{playerName(player)}</span>
            {listed && <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[8px] font-bold text-amber-700 dark:text-amber-300">LISTED</span>}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {loan ? `On loan at ${clubDisplayName(state, loan.loanClubId)}` : `${ageOf(player, state.season)}y · worth ${fmtMoney(player.marketValue)}`}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-display text-lg leading-none">{player.currentAbility}</span>
          <span className="block text-[7px] font-bold uppercase tracking-wider text-muted-foreground">OVR</span>
        </span>
      </button>
      {loan ? (
        <span className="max-w-[6rem] text-right text-[10px] leading-tight text-muted-foreground">Returns before sale</span>
      ) : (
        <div className="flex items-center gap-1">
          <Input aria-label={`Asking price for ${playerName(player)}`} inputMode="numeric" value={draft}
            onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
            onBlur={saveAsk} className="h-8 w-[3.9rem] px-1 text-right tnum text-xs" />
          <Button size="sm" className="h-8 w-[3.2rem] px-0 text-xs"
            variant={listed ? "secondary" : "default"}
            onClick={() => act((s) => setTransferStatus(s, player.id, listed ? "unlisted" : "listed"))}>
            {listed ? "Unlist" : "List"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PlayerSummary({ player, state }: { player: FootballPlayer; state: GameState }) {
  return <TacticalPlayerCard state={state} player={player} mode="compact" className="min-w-0 flex-1" />;
}

function askingPricePreference(state: GameState, player: FootballPlayer): number {
  const stored = state.inboxFlags[`transfer.ask.${player.id}`];
  return typeof stored === "number" && Number.isFinite(stored)
    ? Math.max(0, Math.round(stored))
    : Math.round(player.marketValue * 1.15);
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-1.5">
      <div className="font-display text-lg leading-tight">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
