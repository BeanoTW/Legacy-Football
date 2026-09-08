import { useEffect, useMemo, useState } from "react";
import { Binoculars, CheckCircle2, Handshake, Repeat2, Star } from "lucide-react";
import type { GameState, LoanPlayingTimeExpectation, TacticalPosition } from "@/lib/game/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  activeContract,
  ageOf,
  arrangeUserPlayerLoanIn,
  loanInAvailabilityReason,
  playerName,
  submitTransferEnquiry,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import {
  chairmanRecruitmentEstimate,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import { knownPlayerDetail } from "@/lib/game/knownPlayerDetail";
import { tacticalPositionProfile, positionFamiliarity, positionUnit } from "@/lib/game/positions";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { fmtMoneyExact } from "@/lib/game/engine";
import { scoutingAssignment, scoutingReportById, startScouting } from "@/lib/game/scouting";
import { isTransferWindowOpen, windowStatus } from "@/lib/game/calendar";
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

export function PlayerProfileSheet({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showLoan, setShowLoan] = useState(false);
  const [loanDuration, setLoanDuration] = useState(12);
  const [loanContribution, setLoanContribution] = useState(50);
  const [loanRole, setLoanRole] = useState<LoanPlayingTimeExpectation>("Regular");

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ playerId?: string }>).detail;
      if (detail?.playerId) {
        setPlayerId(detail.playerId);
        setNote(null);
        setShowLoan(false);
      }
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
  const shortlisted = !owned && isChairmanShortlisted(state, player.id);
  const freeAgent = player.currentClubId === null;
  const estimate = !owned ? chairmanRecruitmentEstimate(state, player.id) : null;
  const transferWindowOpen = isTransferWindowOpen(state);
  const transferWindow = windowStatus(state);
  const loanUnavailable = freeAgent || owned ? null : loanInAvailabilityReason(state, player.id);

  const approach = () => {
    if (!estimate || owned) return;
    update((s) => {
      const result = freeAgent
        ? submitTransferOffer(s, player.id, 0, "First Team", estimate.openingWeeklyWage)
        : submitTransferEnquiry(s, player.id, "First Team", estimate.openingWeeklyWage);
      setNote(result.result.reason);
      return result.state;
    });
  };

  const requestLoan = () => {
    if (owned || freeAgent) return;
    const result = arrangeUserPlayerLoanIn(state, player.id, {
      durationWeeks: loanDuration,
      loanClubWageContributionPct: loanContribution,
      playingTimeExpectation: loanRole,
    });
    setNote(result.result.reason);
    if (result.result.ok) {
      setShowLoan(false);
      update(() => result.state);
    }
  };

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
          {!owned && (
            <section className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="mb-2">
                <div className="font-display text-lg">Chairman actions</div>
                <div className="text-[10px] text-muted-foreground">
                  Target this player directly or ask recruitment staff to investigate first.
                </div>
              </div>

              {note && <div className="mb-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">{note}</div>}

              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={shortlisted ? "default" : "outline"}
                  onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}
                >
                  <Star className={cn("mr-1.5 size-3.5", shortlisted && "fill-current")} />
                  {shortlisted ? "Shortlisted" : "Shortlist"}
                </Button>

                {!assignment ? (
                  <Button size="sm" onClick={() => update((s) => startScouting(s, player.id))}>
                    <Binoculars className="mr-1.5 size-3.5" />
                    {hasScouting ? "Scout further" : "Scout"}
                  </Button>
                ) : report?.complete ? (
                  <span className="inline-flex h-9 items-center px-2 text-xs font-semibold text-[color:var(--color-income)]">
                    <CheckCircle2 className="mr-1.5 size-3.5" /> Full report
                  </span>
                ) : (
                  <span className="inline-flex h-9 items-center px-2 text-xs text-muted-foreground">
                    <Binoculars className="mr-1.5 size-3.5" /> Scouting
                  </span>
                )}

                <Button size="sm" variant="secondary" disabled={!estimate} onClick={approach}>
                  <Handshake className="mr-1.5 size-3.5" />
                  {freeAgent ? "Approach player" : "Approach club"}
                </Button>

                {!freeAgent && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!transferWindowOpen || Boolean(loanUnavailable)}
                    title={
                      !transferWindowOpen
                        ? `${transferWindow.label} · ${transferWindow.detail}`
                        : loanUnavailable ?? "Request a temporary loan"
                    }
                    onClick={() => setShowLoan((current) => !current)}
                  >
                    <Repeat2 className="mr-1.5 size-3.5" /> Loan
                  </Button>
                )}
              </div>

              {showLoan && !freeAgent && (
                <div className="mt-3 grid gap-2 rounded-lg border bg-muted/30 p-2 sm:grid-cols-2">
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Length
                    <select
                      value={loanDuration}
                      onChange={(event) => setLoanDuration(Number(event.target.value))}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                    >
                      {[4, 8, 12, 24].map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Wage share
                    <select
                      value={loanContribution}
                      onChange={(event) => setLoanContribution(Number(event.target.value))}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                    >
                      {[20, 35, 50, 65, 80, 100].map((pct) => <option key={pct} value={pct}>{pct}%</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Squad role
                    <select
                      value={loanRole}
                      onChange={(event) => setLoanRole(event.target.value as LoanPlayingTimeExpectation)}
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-xs text-foreground"
                    >
                      {(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <Button size="sm" className="h-9 w-full" onClick={requestLoan}>Send loan request</Button>
                  </div>
                </div>
              )}
            </section>
          )}

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
                <div>{fmtMoneyExact(contract.weeklyWage)}/wk · {Math.max(1, contract.expirySeason - state.season + 1)} season contract</div>
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
