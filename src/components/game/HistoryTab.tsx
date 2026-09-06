import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { clubLegacyRecord } from "@/lib/game/clubLegacy";
import { isUserClubReference, userClubReference } from "@/lib/game/clubReference";
import { Section, sum } from "./shared/primitives";

export function HistoryTab({ state }: { state: GameState }) {
  const rows = [...state.ledger].reverse();
  const userId = userClubReference(state);
  const legacy = clubLegacyRecord(state, userId);
  const clubRecord = state.clubRecords?.[userId];
  const seasonRows = [...(clubRecord?.leagueHistory ?? [])].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-4">
      <Section title="Club legacy">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <LegacyStat label="League titles" value={String(legacy?.leagueTitles ?? 0)} />
          <LegacyStat label="Promotions" value={String(legacy?.promotions ?? clubRecord?.promotions ?? 0)} />
          <LegacyStat label="Relegations" value={String(legacy?.relegations ?? clubRecord?.relegations ?? 0)} />
          <LegacyStat
            label="Best finish"
            value={
              legacy?.bestLeagueFinish
                ? `Tier ${legacy.bestLeagueFinish.tier} · ${legacy.bestLeagueFinish.position}`
                : "—"
            }
          />
          <LegacyStat
            label="Record crowd"
            value={legacy?.recordAttendance ? legacy.recordAttendance.attendance.toLocaleString() : "—"}
          />
          <LegacyStat
            label="Record buy"
            value={legacy?.recordTransferPaid ? fmtMoney(legacy.recordTransferPaid.fee) : "—"}
          />
          <LegacyStat
            label="Record sale"
            value={legacy?.recordTransferReceived ? fmtMoney(legacy.recordTransferReceived.fee) : "—"}
          />
        </div>
      </Section>

      <Section title="Season record">
        {seasonRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Your first completed season will appear here.
          </div>
        ) : (
          <div className="divide-y">
            {seasonRows.map((season) => {
              const league = state.leagues.find((candidate) => candidate.id === season.leagueId);
              const archived = state.seasonHistory.find(
                (candidate) =>
                  candidate.season === season.season && candidate.leagueId === season.leagueId,
              );
              return (
                <div
                  key={`${season.season}:${season.leagueId}`}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-sm"
                >
                  <span className="font-display text-lg tnum">S{season.season}</span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">
                      {archived?.leagueName ?? league?.name ?? season.leagueId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Finished {season.position}
                      {archived?.champion && isUserClubReference(state, archived.champion) ? " · Champions" : ""}
                      {archived?.promoted.some((club) => isUserClubReference(state, club)) ? " · Promoted" : ""}
                      {archived?.relegated.some((club) => isUserClubReference(state, club)) ? " · Relegated" : ""}
                    </div>
                  </div>
                  <span className="tnum text-muted-foreground">#{season.position}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Weekly ledger">
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No entries yet. Advance a week to begin recording finances.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-2 pr-3">Week</th>
                  <th className="text-left py-2 pr-3">Note</th>
                  <th className="text-right py-2 pr-3">Income</th>
                  <th className="text-right py-2 pr-3">Expenses</th>
                  <th className="text-right py-2 pr-3">Net</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => {
                  const inc = sum(l.income);
                  const exp = sum(l.expenses);
                  return (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        S{l.season} W{l.week}
                      </td>
                      <td className="py-1.5 pr-3">
                        {l.matchdayNote ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right py-1.5 pr-3 text-[color:var(--color-income)]">
                        {fmtMoneyExact(inc)}
                      </td>
                      <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                        {fmtMoneyExact(exp)}
                      </td>
                      <td
                        className={cn(
                          "text-right py-1.5 pr-3 font-semibold",
                          l.net >= 0
                            ? "text-[color:var(--color-income)]"
                            : "text-[color:var(--color-expense)]",
                        )}
                      >
                        {fmtMoneyExact(l.net)}
                      </td>
                      <td className="text-right py-1.5">{fmtMoneyExact(l.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function LegacyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg tnum">{value}</div>
    </div>
  );
}
