import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Repeat2 } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { fmtMoneyExact } from "@/lib/game/engine";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";

export function TransferHistory({ state, onBack }: { state: GameState; onBack: () => void }) {
  const transfers = (state.football?.transferHistory ?? [])
    .filter((record) =>
      (record.fromClubId && isUserClubReference(state, record.fromClubId)) ||
      (record.toClubId && isUserClubReference(state, record.toClubId)),
    )
    .map((record) => {
      const incoming = !!record.toClubId && isUserClubReference(state, record.toClubId);
      const otherClubId = incoming ? record.fromClubId : record.toClubId;
      return {
        id: `transfer:${record.id}`,
        season: record.season,
        week: record.week,
        absoluteWeek: record.absoluteWeek,
        playerName: record.playerName,
        position: record.position,
        direction: incoming ? ("in" as const) : ("out" as const),
        club: otherClubId ? clubDisplayName(state, otherClubId) : "Free agent",
        detail:
          record.type === "freeTransfer"
            ? "Free transfer"
            : record.type === "release"
              ? "Released"
              : record.type === "contractExpiry"
                ? "Contract expired"
                : record.fee > 0
                  ? fmtMoneyExact(record.fee)
                  : "Free",
        kind: "transfer" as const,
      };
    });

  const loans = (state.football?.loans ?? [])
    .filter(
      (loan) =>
        isUserClubReference(state, loan.parentClubId) ||
        isUserClubReference(state, loan.loanClubId),
    )
    .map((loan) => {
      const incoming = isUserClubReference(state, loan.loanClubId);
      const player = state.football?.players.find((candidate) => candidate.id === loan.playerId);
      const absoluteWeek = loan.endedAbsoluteWeek ?? loan.startAbsoluteWeek;
      const season = Math.floor((absoluteWeek - 1) / 46) + 1;
      const week = ((absoluteWeek - 1) % 46) + 1;
      return {
        id: `loan:${loan.id}`,
        season,
        week,
        absoluteWeek,
        playerName: player ? `${player.firstName} ${player.lastName}` : "Unknown player",
        position: player?.primaryPosition ?? "—",
        direction: incoming ? ("in" as const) : ("out" as const),
        club: clubDisplayName(state, incoming ? loan.parentClubId : loan.loanClubId),
        detail: `Loan · ${loan.status}${loan.loanClubWageContributionPct ? ` · ${loan.loanClubWageContributionPct}% wages` : ""}`,
        kind: "loan" as const,
      };
    });

  const rows = [...transfers, ...loans].sort(
    (a, b) => b.absoluteWeek - a.absoluteWeek || b.id.localeCompare(a.id),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <Button className="w-fit shrink-0" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Back to transfers
      </Button>
      <section className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <div className="font-display text-2xl">Transfer history</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Permanent record of completed arrivals, departures and loan agreements.
          </p>
        </div>
        <div className="h-full overflow-y-auto pb-24">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No completed transfer business yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                    {row.kind === "loan" ? (
                      <Repeat2 className="size-4" />
                    ) : row.direction === "in" ? (
                      <ArrowDownLeft className="size-4 text-emerald-600" />
                    ) : (
                      <ArrowUpRight className="size-4 text-amber-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{row.playerName}</span>
                      <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{row.position}</span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.direction === "in" ? "From" : "To"} {row.club} · Season {row.season}, Week {row.week}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-semibold sm:text-sm">{row.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
