import { useEffect, useMemo, useState } from "react";
import type { GameState, TacticalPosition } from "@/lib/game/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { activeContract, ageOf, playerName } from "@/lib/game/recruitment";
import { knownPlayerDetail } from "@/lib/game/knownPlayerDetail";
import { tacticalPositionProfile, positionFamiliarity, positionUnit } from "@/lib/game/positions";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { fmtMoneyExact } from "@/lib/game/engine";
import { scoutingAssignment, scoutingReportById } from "@/lib/game/scouting";
import { cn } from "@/lib/utils";
import { POSITION_BADGE_CLASS } from "../playerPosition";

const PLAYER_PROFILE_EVENT = "legacy-football:open-player-profile";

export function openPlayerProfile(playerId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAYER_PROFILE_EVENT, { detail: { playerId } }));
}

function moneyRange(range?: [number, number]) {
  if (!range) return "?";
  return `${fmtMoneyExact(range[0])}–${fmtMoneyExact(range[1])}`;
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
    return (
      <Sheet open={Boolean(playerId)} onOpenChange={(open) => !open && setPlayerId(null)}>
        <SheetContent />
      </Sheet>
    );
  }

  const tactical = tacticalPositionProfile(player);
  const contract = activeContract(state, player.id);
  const loan = activeLoanForPlayer(state, player.id);
  const club = player.currentClubId ? clubDisplayName(state, player.currentClubId) : "Free agent";
  const owned = isUserClubReference(state, player.currentClubId);
  const report = scoutingReportById(state, player.id);
  const assignment = scoutingAssignment(state, player.id);
  const knowledge = owned ? 100 : report?.knowledgePct ?? 0;
  const fullKnowledge = owned || Boolean(report?.complete);
  const hasScouting = knowledge > 0;

  return (
    <Sheet open onOpenChange={(open) => !open && setPlayerId(null)}>
      <SheetContent side="right" className="w-[94vw] overflow-y-auto p-0 sm:max-w-md">
        <div className="bg-foreground px-5 pb-4 pt-6 text-background">
          <SheetHeader className="text-left">
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">Player profile</div>
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="truncate font-display text-3xl text-background">
                  {playerName(player)}
                </SheetTitle>
                <div className="mt-1 text-xs opacity-75">
                  {player.nationality} · Age {ageOf(player, state.season)} · {player.preferredFoot} foot
                </div>
              </div>
              <div className="shrink-0 rounded-lg bg-background px-3 py-2 text-center text-foreground">
                <div className="font-display text-3xl leading-none">{player.currentAbility}</div>
                <div className="mt-1 text-[8px] uppercase tracking-wider">Overall</div>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="space-y-3 p-4">
          <section className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Position</div>
                <span className={cn(
                  "mt-1 inline-flex rounded-md border px-3 py-1.5 text-base font-bold",
                  POSITION_BADGE_CLASS[positionUnit(tactical.primary)],
                )}>
                  {tactical.primary}
                </span>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold">{club}</div>
                <div className="mt-1 text-muted-foreground">
                  {player.currentClubId ? "Under contract" : "Available on a free"}
                </div>
              </div>
            </div>

            {tactical.secondary.length > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Other positions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tactical.secondary.map((position) => (
                    <PositionChip key={position} player={player} position={position} />
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Fact label="Potential" value={fullKnowledge ? String(player.potentialAbility) : "?"} />
            <Fact label="Value" value={hasScouting || owned ? moneyRange(report?.valueRange) : "?"} />
            <Fact label="Expected wage" value={hasScouting || owned ? `${moneyRange(report?.wageRange)}/wk` : "?"} />
            <Fact label="Knowledge" value={owned ? "Club player" : `${knowledge}%`} />
          </section>

          <section className="rounded-xl border bg-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-display text-lg">Scouting profile</div>
                <div className="text-[10px] text-muted-foreground">
                  {owned
                    ? "Full club knowledge"
                    : fullKnowledge
                      ? "Full scouting report"
                      : assignment
                        ? "Scout following up"
                        : hasScouting
                          ? "Initial staff assessment"
                          : "Not scouted"}
                </div>
              </div>
              <div className="font-display text-xl">{knowledge}%</div>
            </div>

            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {(report?.attributes ?? []).map((attribute) => {
                const value =
                  !attribute.known
                    ? "?"
                    : attribute.exact !== undefined
                      ? String(attribute.exact)
                      : `${attribute.min}–${attribute.max}`;
                const midpoint =
                  attribute.exact ??
                  (attribute.min !== undefined && attribute.max !== undefined
                    ? Math.round((attribute.min + attribute.max) / 2)
                    : 0);
                return (
                  <div key={attribute.key}>
                    <div className="flex items-end justify-between gap-2">
                      <span className="text-xs font-semibold">{attribute.label}</span>
                      <span className="font-display text-base tabular-nums">{value}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      {attribute.known && (
                        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(3, Math.min(100, midpoint))}%` }} />
                      )}
                    </div>
                  </div>
                );
              })}
              {!report && (
                <div className="col-span-2 text-sm text-muted-foreground">
                  No scouting information is available yet.
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <Fact label="Personality" value={fullKnowledge ? player.personality : "?"} />
            <Fact
              label="Status"
              value={
                owned
                  ? contract
                    ? contract.squadRole
                    : "At club"
                  : player.currentClubId
                    ? "Under contract"
                    : "Free agent"
              }
            />
          </section>

          <section className="rounded-xl border bg-card p-3 text-xs">
            <div className="font-semibold">Contract & availability</div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              {owned && contract ? (
                <div>{fmtMoneyExact(contract.weeklyWage)}/wk · {contract.seasons} season contract</div>
              ) : player.currentClubId ? (
                <div>{fullKnowledge ? "Contract details known to recruitment staff" : "Contract details require scouting"}</div>
              ) : (
                <div>No club contract</div>
              )}
              {loan && <div>Loan active · {loan.playingTimeExpectation} playing-time expectation</div>}
            </div>
          </section>

          {!owned && !fullKnowledge && (
            <div className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">
              {hasScouting ? "Scout further for the complete picture" : "Scouting will reveal detailed attributes and terms"}
            </div>
          )}
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
    <span className={cn(
      "rounded border px-2 py-1 text-[11px] font-semibold",
      POSITION_BADGE_CLASS[positionUnit(position)],
    )}>
      {position} · {familiarity}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-xl border bg-card p-3">
      <div className="font-display text-xl leading-tight">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
