import { useMemo, useState } from "react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { clubLegacyRecord } from "@/lib/game/clubLegacy";
import { isUserClubReference, userClubReference } from "@/lib/game/clubReference";
import { legacyTierToFootballLevel } from "@/lib/game/footballLevel";
import { Section, sum } from "./shared/primitives";
import { clubPlayerRecords, playerSeasonSummary } from "@/lib/game/playerSeasonStats";
import { domesticCupName } from "@/lib/game/cupNarrative";

export function HistoryTab({ state }: { state: GameState }) {
  const rows = [...state.ledger].reverse();
  const playerSeasons = useMemo(
    () =>
      [...new Set([...(state.playerSeasonHistory ?? []).map((summary) => summary.season), state.season])]
        .sort((a, b) => b - a),
    [state.playerSeasonHistory, state.season],
  );
  const [playerSeason, setPlayerSeason] = useState(state.season);
  const effectivePlayerSeason = playerSeasons.includes(playerSeason) ? playerSeason : state.season;
  const playerSummary = playerSeasonSummary(state, effectivePlayerSeason);
  const playerRows = playerSummary?.players ?? [];
  const userId = userClubReference(state);
  const playerRecords = clubPlayerRecords(state);
  const legacy = clubLegacyRecord(state, userId);
  const clubRecord = state.clubRecords?.[userId];
  const seasonRows = [...(clubRecord?.leagueHistory ?? [])].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-4">
      <Section title="Player season record">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-xl text-xs text-muted-foreground">
            Watched and auto-resolved matches feed the same canonical player record. Completed seasons keep a compact permanent summary.
          </p>
          <select
            value={effectivePlayerSeason}
            onChange={(event) => setPlayerSeason(Number(event.target.value))}
            className="h-9 rounded-lg border bg-background px-2 text-xs"
          >
            {playerSeasons.map((season) => (
              <option key={season} value={season}>
                Season {season}{season === state.season ? " · current" : ""}
              </option>
            ))}
          </select>
        </div>
        {playerSummary && playerRows.length ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PlayerLeader
                label="Top scorer"
                player={playerRows.find((row) => row.playerId === playerSummary.topScorerId)}
                value={(row) => `${row.goals} goals`}
              />
              <PlayerLeader
                label="Top assists"
                player={playerRows.find((row) => row.playerId === playerSummary.topAssisterId)}
                value={(row) => `${row.assists} assists`}
              />
              <PlayerLeader
                label="Top rated"
                player={playerRows.find((row) => row.playerId === playerSummary.topRatedId)}
                value={(row) => row.averageRating.toFixed(2)}
              />
              <PlayerLeader
                label="Most used"
                player={playerRows.find((row) => row.playerId === playerSummary.mostUsedId)}
                value={(row) => `${row.minutes} min`}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Player</th>
                    <th>Apps</th>
                    <th>Starts</th>
                    <th>Sub</th>
                    <th>Min</th>
                    <th>Goals</th>
                    <th>Assists</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {playerRows.map((player) => (
                    <tr key={player.playerId} className="border-t">
                      <td className="py-2">{player.name}</td>
                      <td className="text-center">{player.appearances}</td>
                      <td className="text-center">{player.starts}</td>
                      <td className="text-center">{player.substituteAppearances}</td>
                      <td className="text-center">{player.minutes}</td>
                      <td className="text-center">{player.goals}</td>
                      <td className="text-center">{player.assists}</td>
                      <td className="text-center">{player.averageRating.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No recorded player performances for this season yet.
          </p>
        )}
      </Section>
      <Section title="Club player records">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RecordHolder label="Most appearances" player={playerRecords.appearances?.name} value={playerRecords.appearances ? String(playerRecords.appearances.appearances) : "—"} />
          <RecordHolder label="Most goals" player={playerRecords.goals?.name} value={playerRecords.goals ? String(playerRecords.goals.goals) : "—"} />
          <RecordHolder label="Most assists" player={playerRecords.assists?.name} value={playerRecords.assists ? String(playerRecords.assists.assists) : "—"} />
          <RecordHolder label="Most minutes" player={playerRecords.minutes?.name} value={playerRecords.minutes ? playerRecords.minutes.minutes.toLocaleString() : "—"} />
        </div>
      </Section>
      <Section title="Club legacy">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <LegacyStat label="League titles" value={String(legacy?.leagueTitles ?? 0)} />
          <LegacyStat
            label="Promotions"
            value={String(legacy?.promotions ?? clubRecord?.promotions ?? 0)}
          />
          <LegacyStat
            label="Relegations"
            value={String(legacy?.relegations ?? clubRecord?.relegations ?? 0)}
          />
          <LegacyStat
            label="Best finish"
            value={
              legacy?.bestLeagueFinish
                ? `Level ${legacyTierToFootballLevel(legacy.bestLeagueFinish.tier)} · ${legacy.bestLeagueFinish.position}`
                : "—"
            }
          />
          <LegacyStat
            label="Record crowd"
            value={
              legacy?.recordAttendance ? legacy.recordAttendance.attendance.toLocaleString() : "—"
            }
          />
          <LegacyStat
            label="Record buy"
            value={legacy?.recordTransferPaid ? fmtMoney(legacy.recordTransferPaid.fee) : "—"}
          />
          <LegacyStat
            label="Record sale"
            value={
              legacy?.recordTransferReceived ? fmtMoney(legacy.recordTransferReceived.fee) : "—"
            }
          />
          <LegacyStat label="Cup trophies" value={String(legacy?.cupHonours?.length ?? 0)} />
        </div>
      </Section>

      {(legacy?.cupHonours?.length ?? 0) > 0 && (
        <Section title="Cup honours">
          <div className="divide-y">
            {[...(legacy?.cupHonours ?? [])].sort((a, b) => b.season - a.season).map((honour) => (
              <div key={`${honour.season}:${honour.competitionId}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div>
                  <strong>{domesticCupName(honour.competitionId as "leagueCup" | "faCup")}</strong>
                  <div className="text-xs text-muted-foreground">Season {honour.season}</div>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">Winners</span>
              </div>
            ))}
          </div>
        </Section>
      )}

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
                      {archived?.champion && isUserClubReference(state, archived.champion)
                        ? " · Champions"
                        : ""}
                      {archived?.promoted.some((club) => isUserClubReference(state, club))
                        ? " · Promoted"
                        : ""}
                      {archived?.relegated.some((club) => isUserClubReference(state, club))
                        ? " · Relegated"
                        : ""}
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


function PlayerLeader({
  label,
  player,
  value,
}: {
  label: string;
  player?: {
    name: string;
    goals: number;
    assists: number;
    minutes: number;
    averageRating: number;
  };
  value: (player: {
    name: string;
    goals: number;
    assists: number;
    minutes: number;
    averageRating: number;
  }) => string;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold">{player?.name ?? "—"}</div>
      <div className="font-display text-lg">{player ? value(player) : "—"}</div>
    </div>
  );
}


function RecordHolder({
  label,
  player,
  value,
}: {
  label: string;
  player?: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xs font-semibold">{player ?? "No record yet"}</div>
      <div className="font-display text-xl">{value}</div>
    </div>
  );
}
