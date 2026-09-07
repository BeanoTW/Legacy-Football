import { useState } from "react";
import { ArrowLeft, Repeat2 } from "lucide-react";
import type { GameState, LoanPlayingTimeExpectation, PlayerLoanAgreement } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import { activeContract, arrangeUserPlayerLoanOut, playerById, playerName } from "@/lib/game/recruitment";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { absoluteWeek } from "@/lib/game/time";
import { playerOwnerClubId, playerRegisteredClubId } from "@/lib/game/playerRegistration";
import { fmtMoneyExact } from "@/lib/game/engine";
import { activeLoanForPlayer, terminateUserPlayerLoan } from "@/lib/game/loans";
import { isTransferWindowOpen, windowStatus } from "@/lib/game/calendar";

export function LoanDesk({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [loanOutPlayerId, setLoanOutPlayerId] = useState("");
  const [loanOutDuration, setLoanOutDuration] = useState(12);
  const [loanOutContribution, setLoanOutContribution] = useState(50);
  const [loanOutRole, setLoanOutRole] =
    useState<LoanPlayingTimeExpectation>("Rotation");
  const [loanOutNote, setLoanOutNote] = useState<string | null>(null);
  const loanWindowOpen = isTransferWindowOpen(state);
  const loanWindow = windowStatus(state);

  const eligibleLoanOutPlayers = (state.football?.players ?? [])
    .filter(
      (player) =>
        isUserClubReference(state, playerOwnerClubId(player)) &&
        isUserClubReference(state, playerRegisteredClubId(player)) &&
        !activeLoanForPlayer(state, player.id) &&
        Boolean(activeContract(state, player.id)),
    )
    .sort(
      (a, b) =>
        a.currentAbility - b.currentAbility ||
        playerName(a).localeCompare(playerName(b)),
    );

  const loans = (state.football?.loans ?? [])
    .filter(
      (loan) =>
        loan.status === "Active" &&
        (isUserClubReference(state, loan.parentClubId) ||
          isUserClubReference(state, loan.loanClubId)),
    )
    .slice()
    .sort((a, b) => a.endAbsoluteWeek - b.endAbsoluteWeek || a.id.localeCompare(b.id));

  const incoming = loans.filter((loan) => isUserClubReference(state, loan.loanClubId));
  const outgoing = loans.filter((loan) => isUserClubReference(state, loan.parentClubId));

  return (
    <div className="flex min-h-0 flex-col gap-3 lg:h-full">
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back to transfers
        </Button>
      </div>

      <section className="shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="panel-strip px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
                Transfer department
              </div>
              <h1 className="font-display text-2xl">Loans</h1>
              <p className="mt-0.5 max-w-2xl text-xs opacity-80 sm:text-sm">
                Temporary registrations, wage shares and return dates in one place.
              </p>
            </div>
            <Repeat2 className="size-7 opacity-70" />
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x text-center">
          <Summary label="Active" value={loans.length} />
          <Summary label="Loaned in" value={incoming.length} />
          <Summary label="Loaned out" value={outgoing.length} />
        </div>
      </section>

      <section className="shrink-0 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-2.5">
          <h2 className="font-display text-lg">Offer player for loan</h2>
          <p className="text-[11px] text-muted-foreground">
            Set the terms. Recruitment will find the strongest simulated club willing to meet them.
          </p>
          {!loanWindowOpen && (
            <div className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              {loanWindow.label} · {loanWindow.detail}
            </div>
          )}
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(110px,.55fr))_auto] md:items-end">
          <label className="grid gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Player
            <select
              value={loanOutPlayerId}
              onChange={(event) => setLoanOutPlayerId(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
            >
              <option value="">Choose player</option>
              {eligibleLoanOutPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {playerName(player)} · {tacticalPositionProfile(player).primary} · {player.currentAbility}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Duration
            <select
              value={loanOutDuration}
              onChange={(event) => setLoanOutDuration(Number(event.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
            >
              {[4, 8, 12, 24].map((weeks) => (
                <option key={weeks} value={weeks}>{weeks} weeks</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Wage share
            <select
              value={loanOutContribution}
              onChange={(event) => setLoanOutContribution(Number(event.target.value))}
              className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
            >
              {[20, 35, 50, 65, 80, 100].map((pct) => (
                <option key={pct} value={pct}>{pct}% by borrower</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Playing time
            <select
              value={loanOutRole}
              onChange={(event) =>
                setLoanOutRole(event.target.value as LoanPlayingTimeExpectation)
              }
              className="h-9 rounded-md border bg-background px-2 text-sm normal-case tracking-normal text-foreground"
            >
              {(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </label>

          <Button
            disabled={!loanOutPlayerId || !loanWindowOpen}
            onClick={() => {
              const outcome = arrangeUserPlayerLoanOut(state, loanOutPlayerId, {
                durationWeeks: loanOutDuration,
                loanClubWageContributionPct: loanOutContribution,
                playingTimeExpectation: loanOutRole,
              });
              setLoanOutNote(outcome.result.reason);
              if (outcome.result.ok) {
                setLoanOutPlayerId("");
                update(() => outcome.state);
              }
            }}
          >
            Find loan
          </Button>
        </div>
        {loanOutNote && (
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">{loanOutNote}</div>
        )}
      </section>

      {loans.length === 0 ? (
        <div className="grid min-h-40 flex-1 place-items-center rounded-xl border border-dashed bg-card/40 p-6 text-center">
          <div>
            <div className="font-display text-lg">No active loans</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active incoming and outgoing loan agreements will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
          <LoanColumn title="Loaned in" empty="No players currently borrowed." loans={incoming} state={state} update={update} />
          <LoanColumn title="Loaned out" empty="No owned players currently away." loans={outgoing} state={state} update={update} />
        </div>
      )}
    </div>
  );
}

function LoanColumn({
  title,
  empty,
  loans,
  state,
  update,
}: {
  title: string;
  empty: string;
  loans: PlayerLoanAgreement[];
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="shrink-0 border-b px-4 py-2.5">
        <h2 className="font-display text-lg">{title}</h2>
      </div>
      <div className="contained-scroll flex-1 divide-y">
        {loans.length === 0 ? (
          <div className="grid min-h-32 place-items-center p-4 text-center text-xs text-muted-foreground">
            {empty}
          </div>
        ) : (
          loans.map((loan) => <LoanRow key={loan.id} loan={loan} state={state} update={update} />)
        )}
      </div>
    </section>
  );
}

function LoanRow({ loan, state, update }: { loan: PlayerLoanAgreement; state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const player = playerById(state, loan.playerId);
  if (!player) return null;
  const contract = activeContract(state, player.id);
  const weeksLeft = Math.max(
    0,
    loan.endAbsoluteWeek - absoluteWeek(state.season, state.week),
  );
  const userIsBorrower = isUserClubReference(state, loan.loanClubId);
  const otherClub = userIsBorrower ? loan.parentClubId : loan.loanClubId;
  const contribution = contract
    ? Math.round((contract.weeklyWage * loan.loanClubWageContributionPct) / 100)
    : null;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => openPlayerProfile(player.id)} className="truncate text-left text-sm font-semibold hover:underline">{playerName(player)}</button>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold">
              {tacticalPositionProfile(player).primary}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {userIsBorrower ? "From" : "At"} {clubDisplayName(state, otherClub)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-lg">{weeksLeft}w</div>
          <div className="text-[9px] uppercase text-muted-foreground">remaining</div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Mini label="Role" value={loan.playingTimeExpectation} />
        <Mini label="Wage share" value={`${loan.loanClubWageContributionPct}%`} />
        <Mini
          label={userIsBorrower ? "Our cost" : "Relief"}
          value={contribution == null ? "—" : fmtMoneyExact(contribution)}
        />
      </div>
      {note && <div className="mt-2 text-[11px] text-muted-foreground">{note}</div>}
      <div className="mt-2 flex justify-end gap-1.5">
        {confirming && (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
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
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2">
      <div className="font-display text-xl">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="truncate text-xs font-semibold">{value}</div>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
