import { useEffect, useMemo, useState } from "react";
import type { GameState, TacticalPosition } from "@/lib/game/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeContract, ageOf, playerName } from "@/lib/game/recruitment";
import { knownPlayerDetail } from "@/lib/game/knownPlayerDetail";
import { tacticalPositionProfile, positionFamiliarity } from "@/lib/game/positions";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { clubDisplayName } from "@/lib/game/clubReference";
import { fmtMoneyExact } from "@/lib/game/engine";
import { cn } from "@/lib/utils";
import { POSITION_BADGE_CLASS } from "../playerPosition";
import { positionUnit } from "@/lib/game/positions";

const PLAYER_PROFILE_EVENT = "legacy-football:open-player-profile";

export function openPlayerProfile(playerId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAYER_PROFILE_EVENT, { detail: { playerId } }));
}

export function PlayerProfileSheet({ state }: { state: GameState }) {
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ playerId?: string }>).detail;
      if (detail?.playerId) setPlayerId(detail.playerId);
    };
    window.addEventListener(PLAYER_PROFILE_EVENT, listener);
    return () => window.removeEventListener(PLAYER_PROFILE_EVENT, listener);
  }, []);

  const player = useMemo(
    () => (playerId ? knownPlayerDetail(state, playerId) : null),
    [playerId, state],
  );

  if (!player) {
    return <Sheet open={Boolean(playerId)} onOpenChange={(open) => !open && setPlayerId(null)}><SheetContent /></Sheet>;
  }

  const tactical = tacticalPositionProfile(player);
  const contract = activeContract(state, player.id);
  const loan = activeLoanForPlayer(state, player.id);
  const club = player.currentClubId ? clubDisplayName(state, player.currentClubId) : "Free agent";

  return (
    <Sheet open onOpenChange={(open) => !open && setPlayerId(null)}>
      <SheetContent side="right" className="w-[92vw] overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Player profile</div>
          <SheetTitle className="font-display text-3xl">{playerName(player)}</SheetTitle>
          <div className="text-sm text-muted-foreground">
            Age {ageOf(player, state.season)} · {player.nationality} · {club}
          </div>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Primary position</div>
                <span className={cn("mt-1 inline-flex rounded border px-2 py-1 text-sm font-bold", POSITION_BADGE_CLASS[positionUnit(tactical.primary)])}>
                  {tactical.primary}
                </span>
              </div>
              <div className="text-right">
                <div className="font-display text-3xl">{player.currentAbility}</div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Overall</div>
              </div>
            </div>

            {tactical.secondary.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Other positions</div>
                <div className="flex flex-wrap gap-1.5">
                  {tactical.secondary.map((position) => (
                    <PositionChip key={position} player={player} position={position} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Fact label="Potential" value={String(player.potentialAbility)} />
            <Fact label="Preferred foot" value={player.preferredFoot} />
            <Fact label="Value" value={fmtMoneyExact(player.marketValue)} />
            <Fact label="Expected wage" value={`${fmtMoneyExact(player.wageExpectation)}/wk`} />
          </section>

          <section className="rounded-xl border bg-card p-4 text-sm">
            <div className="font-semibold">Status</div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>{contract ? `${contract.squadRole} · ${fmtMoneyExact(contract.weeklyWage)}/wk` : "No active contract at your club"}</div>
              {loan && <div>Loan active · {loan.playingTimeExpectation} playing-time expectation</div>}
              <div>Personality · {player.personality}</div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PositionChip({
  player,
  position,
}: {
  player: NonNullable<ReturnType<typeof knownPlayerDetail>>;
  position: TacticalPosition;
}) {
  const familiarity = positionFamiliarity(player, position);
  return (
    <span className={cn("rounded border px-2 py-1 text-[11px] font-semibold", POSITION_BADGE_CLASS[positionUnit(position)])}>
      {position} · {familiarity}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="font-semibold">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
