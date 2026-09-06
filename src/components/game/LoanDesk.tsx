import { ArrowLeft, Repeat2 } from "lucide-react";
import type { GameState, PlayerLoanAgreement } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { activeContract, playerById, playerName } from "@/lib/game/recruitment";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { absoluteWeek } from "@/lib/game/time";
import { fmtMoneyExact } from "@/lib/game/engine";

export function LoanDesk({
  state,
  onBack,
}: {
  state: GameState;
  onBack: () => void;
}) {
  const loans = (state.football?.loans ?? [])
    .filter((loan) => loan.status === "Active")
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
          <LoanColumn title="Loaned in" empty="No players currently borrowed." loans={incoming} state={state} />
          <LoanColumn title="Loaned out" empty="No owned players currently away." loans={outgoing} state={state} />
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
}: {
  title: string;
  empty: string;
  loans: PlayerLoanAgreement[];
  state: GameState;
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
          loans.map((loan) => <LoanRow key={loan.id} loan={loan} state={state} />)
        )}
      </div>
    </section>
  );
}

function LoanRow({ loan, state }: { loan: PlayerLoanAgreement; state: GameState }) {
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
            <span className="truncate text-sm font-semibold">{playerName(player)}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold">
              {player.primaryPosition}
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
