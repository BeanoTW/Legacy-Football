import { useState } from "react";
import type { GameState, LoanPlayingTimeExpectation, PlayerLoanAgreement } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import {
  activeContract,
  arrangeUserPlayerLoanOut,
  playerById,
  playerName,
} from "@/lib/game/recruitment";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { absoluteWeek, fromAbsoluteWeek } from "@/lib/game/time";
import { fmtMoneyExact } from "@/lib/game/engine";
import { terminateUserPlayerLoan } from "@/lib/game/loans";
import { isTransferWindowOpen, windowStatus } from "@/lib/game/calendar";

/* Loan work surfaces for the Transfer Desk.
   - LoanAgreementCard: one live agreement (Live Business → Loan in / Loan out)
   - LoanOutForm: offer an owned player for loan (Squad & Contracts)
   Both call the chairman-level loan actions; the loan rules are untouched. */

const LOAN_WEEKS = [4, 8, 12, 24] as const;
const WAGE_SHARES = [20, 35, 50, 65, 80, 100] as const;
const PLAYING_TIME: LoanPlayingTimeExpectation[] = ["Backup", "Rotation", "Regular", "Important"];

export function LoanOutForm({
  state,
  update,
  playerId,
  onDone,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  playerId: string;
  onDone?: (message: string) => void;
}) {
  const [duration, setDuration] = useState(12);
  const [contribution, setContribution] = useState(50);
  const [role, setRole] = useState<LoanPlayingTimeExpectation>("Rotation");
  const [note, setNote] = useState<string | null>(null);
  const open = isTransferWindowOpen(state);
  const window = windowStatus(state);
  return (
    <div className="rounded-lg border bg-muted/25 p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-xs">Offer for loan</strong>
        <span className="text-[10px] text-muted-foreground">
          Recruitment finds the strongest club willing to meet the terms
        </span>
      </div>
      {!open && (
        <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {window.label} · {window.detail}
        </div>
      )}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Length
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
          >
            {LOAN_WEEKS.map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks} weeks
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          They pay
          <select
            value={contribution}
            onChange={(event) => setContribution(Number(event.target.value))}
            className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
          >
            {WAGE_SHARES.map((pct) => (
              <option key={pct} value={pct}>
                {pct}% of wage
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Minutes
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as LoanPlayingTimeExpectation)}
            className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
          >
            {PLAYING_TIME.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button
        size="sm"
        className="mt-2 h-9 w-full"
        disabled={!open}
        onClick={() => {
          const outcome = arrangeUserPlayerLoanOut(state, playerId, {
            durationWeeks: duration,
            loanClubWageContributionPct: contribution,
            playingTimeExpectation: role,
          });
          setNote(outcome.result.reason);
          if (outcome.result.ok) {
            update(() => outcome.state);
            onDone?.(outcome.result.reason);
          }
        }}
      >
        Find loan club
      </Button>
      {note && <div className="mt-1.5 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

export function LoanAgreementCard({
  loan,
  state,
  update,
}: {
  loan: PlayerLoanAgreement;
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const player = playerById(state, loan.playerId);
  if (!player) return null;
  const contract = activeContract(state, player.id);
  const weeksLeft = Math.max(0, loan.endAbsoluteWeek - absoluteWeek(state.season, state.week));
  const userIsBorrower = isUserClubReference(state, loan.loanClubId);
  const otherClub = userIsBorrower ? loan.parentClubId : loan.loanClubId;
  const borrowerShare = contract
    ? Math.round((contract.weeklyWage * loan.loanClubWageContributionPct) / 100)
    : null;
  const active = loan.status === "Active";

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="panel-strip flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
            {userIsBorrower ? "Loan in · from" : "Loan out · at"}{" "}
            {clubDisplayName(state, otherClub)}
          </div>
          <button
            type="button"
            onClick={() => openPlayerProfile(player.id)}
            className="font-display text-2xl leading-tight hover:underline"
          >
            {playerName(player)}
          </button>
          <div className="text-sm opacity-80">
            {tacticalPositionProfile(player).primary} · {loan.playingTimeExpectation} minutes
            promised
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl leading-none">
            {active ? `${weeksLeft}w` : loan.status}
          </div>
          <div className="text-[9px] uppercase opacity-70">{active ? "remaining" : "loan"}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 text-center">
        <Mini label="Wage share" value={`${loan.loanClubWageContributionPct}%`} />
        <Mini
          label={userIsBorrower ? "Our cost /wk" : "Their share /wk"}
          value={borrowerShare == null ? "—" : fmtMoneyExact(borrowerShare)}
        />
        <Mini
          label={userIsBorrower ? "Returns to parent" : "Back with us"}
          value={(() => {
            const end = fromAbsoluteWeek(loan.endAbsoluteWeek);
            return `S${end.season} · wk ${end.week}`;
          })()}
        />
      </div>
      {note && <div className="px-3 pb-2 text-[11px] text-muted-foreground">{note}</div>}
      {active && (
        <div className="flex justify-end gap-1.5 border-t px-3 py-2.5">
          {confirming && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setNote(null);
              }}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant={confirming ? "destructive" : "outline"}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                setNote(
                  userIsBorrower
                    ? "Ending the loan returns the player to his parent club immediately."
                    : "Recalling the player ends the loan immediately.",
                );
                return;
              }
              const outcome = terminateUserPlayerLoan(state, loan.id);
              setNote(outcome.result.reason);
              setConfirming(false);
              if (outcome.result.ok) update(() => outcome.state);
            }}
          >
            {confirming
              ? userIsBorrower
                ? "Confirm end loan"
                : "Confirm recall"
              : userIsBorrower
                ? "End loan"
                : "Recall player"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="truncate text-xs font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
