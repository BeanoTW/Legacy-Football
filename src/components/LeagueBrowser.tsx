import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ClubPrediction, GameState, LeagueRow } from "@/lib/game/types";
import {
  tableFor,
  leagueFixtures,
  historicalTable,
  completedSeasons,
  playerLeagueId,
} from "@/lib/game/league";
import {
  clubReputation,
  clubStrengthFor,
  clubPrediction,
  predictionFor,
  EXPECTATION_LABEL,
  tierOfClub,
  finishIn,
} from "@/lib/game/reputation";

type View = "table" | "fixtures" | "predictions";

/** Read-only window on the whole pyramid. Every value is read live from state. */
export function LeagueBrowser({ state }: { state: GameState }) {
  const leagues = state.leagues ?? [];
  const [leagueId, setLeagueId] = useState(playerLeagueId(state));
  const [season, setSeason] = useState(state.season);
  const [view, setView] = useState<View>("table");
  const [club, setClub] = useState<string | null>(null);

  const league = leagues.find((l) => l.id === leagueId) ?? leagues[0];
  const seasons = useMemo(
    () => [...new Set([state.season, ...completedSeasons(state)])].sort((a, b) => b - a),
    [state],
  );
  const isPast = season !== state.season;
  const rows: LeagueRow[] = isPast
    ? (historicalTable(state, season, leagueId) ?? [])
    : tableFor(state, leagueId);
  const fixtures = leagueFixtures(state, leagueId, season);
  const prediction = predictionFor(state, season, leagueId);

  if (!league) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs">League browser</div>
        <div className="p-3 flex flex-wrap gap-2">
          <Segmented
            options={leagues.map((l) => [l.id, l.name] as const)}
            value={leagueId}
            onChange={(v) => {
              setLeagueId(v);
              setClub(null);
            }}
          />
          <Segmented
            options={seasons.map(
              (s) =>
                [String(s), s === state.season ? `Season ${s} (live)` : `Season ${s}`] as const,
            )}
            value={String(season)}
            onChange={(v) => setSeason(Number(v))}
          />
          <Segmented
            options={
              [
                ["table", "Table"],
                ["fixtures", "Fixtures"],
                ["predictions", "Predictions"],
              ] as const
            }
            value={view}
            onChange={(v) => setView(v as View)}
          />
        </div>
        <div className="px-3 pb-3 text-xs text-muted-foreground">
          Tier {league.tier} · {league.clubIds.length} clubs ·{" "}
          {league.promotionPlaces > 0 ? `${league.promotionPlaces} promoted` : "top division"} ·{" "}
          {league.relegationPlaces > 0 ? `${league.relegationPlaces} relegated` : "no relegation"}
          {isPast && " · final records"}
        </div>
      </div>

      {view === "table" && <TableView state={state} rows={rows} season={season} onPick={setClub} />}
      {view === "fixtures" && <FixturesView fixtures={fixtures} userClub={state.clubName} />}
      {view === "predictions" && (
        <PredictionsView
          state={state}
          season={season}
          clubs={prediction?.clubs ?? []}
          champion={prediction?.predictedChampion}
          onPick={setClub}
        />
      )}

      {club && <ClubCard state={state} club={club} season={season} onClose={() => setClub(null)} />}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border overflow-hidden">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "px-2.5 py-1 text-xs whitespace-nowrap",
            value === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TableView({
  state,
  rows,
  season,
  onPick,
}: {
  state: GameState;
  rows: LeagueRow[];
  season: number;
  onPick: (c: string) => void;
}) {
  if (rows.length === 0) {
    return <Empty>No table stored for this season yet.</Empty>;
  }
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-x-auto">
      <table className="w-full text-sm tnum">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr className="border-b">
            <th className="text-left py-2 px-3">#</th>
            <th className="text-left py-2 pr-2">Club</th>
            <th className="text-right py-2 pr-2">P</th>
            <th className="text-right py-2 pr-2">W</th>
            <th className="text-right py-2 pr-2">D</th>
            <th className="text-right py-2 pr-2">L</th>
            <th className="text-right py-2 pr-2">GD</th>
            <th className="text-right py-2 pr-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.team}
              onClick={() => onPick(r.team)}
              className={cn(
                "border-b last:border-0 cursor-pointer hover:bg-muted/60",
                r.team === state.clubName && "bg-accent/20 font-semibold",
              )}
            >
              <td className="py-1.5 px-3 text-muted-foreground">{i + 1}</td>
              <td className="py-1.5 pr-2">{r.team}</td>
              <td className="py-1.5 pr-2 text-right">{r.p}</td>
              <td className="py-1.5 pr-2 text-right">{r.w}</td>
              <td className="py-1.5 pr-2 text-right">{r.d}</td>
              <td className="py-1.5 pr-2 text-right">{r.l}</td>
              <td className="py-1.5 pr-2 text-right">{r.gf - r.ga}</td>
              <td className="py-1.5 pr-3 text-right font-bold">{r.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        Season {season} · tap a club for its profile.
      </div>
    </div>
  );
}

function FixturesView({
  fixtures,
  userClub,
}: {
  fixtures: ReturnType<typeof leagueFixtures>;
  userClub: string;
}) {
  const rounds = useMemo(
    () => [...new Set(fixtures.map((f) => f.round))].sort((a, b) => a - b),
    [fixtures],
  );
  const [round, setRound] = useState(() => {
    const next = fixtures.find((f) => !f.record);
    return next?.round ?? rounds[0] ?? 1;
  });
  if (fixtures.length === 0) return <Empty>No fixtures recorded for this season.</Empty>;
  const list = fixtures.filter((f) => f.round === round);
  const idx = rounds.indexOf(round);
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          disabled={idx <= 0}
          onClick={() => setRound(rounds[idx - 1])}
          className="text-xs px-2 py-1 rounded border disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs font-semibold">
          Round {round} · week {list[0]?.week ?? "—"}
        </span>
        <button
          disabled={idx < 0 || idx >= rounds.length - 1}
          onClick={() => setRound(rounds[idx + 1])}
          className="text-xs px-2 py-1 rounded border disabled:opacity-40"
        >
          Next →
        </button>
      </div>
      <div className="divide-y text-sm">
        {list.map((f) => (
          <div
            key={`${f.home}>${f.away}`}
            className={cn(
              "grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2",
              (f.home === userClub || f.away === userClub) && "bg-accent/15",
            )}
          >
            <span className="text-right truncate">{f.home}</span>
            <span className="tnum text-xs font-bold px-2 py-0.5 rounded bg-muted min-w-12 text-center">
              {f.record ? `${f.record.homeGoals}-${f.record.awayGoals}` : "v"}
            </span>
            <span className="truncate">{f.away}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictionsView({
  state,
  season,
  clubs,
  champion,
  onPick,
}: {
  state: GameState;
  season: number;
  clubs: ClubPrediction[];
  champion?: string;
  onPick: (c: string) => void;
}) {
  if (clubs.length === 0) return <Empty>No pre-season projection stored for this season.</Empty>;
  const past = season !== state.season;
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b text-xs">
        Predicted champion: <span className="font-semibold">{champion}</span>
        {past && " · shown against the actual finish"}
      </div>
      <div className="divide-y text-sm">
        {clubs.map((c) => {
          const actual = past ? finishIn(state, c.club, season)?.position : undefined;
          return (
            <button
              key={c.club}
              onClick={() => onPick(c.club)}
              className={cn(
                "w-full text-left grid grid-cols-[2rem_1fr_auto] items-center gap-2 px-3 py-2 hover:bg-muted/60",
                c.club === state.clubName && "bg-accent/20 font-semibold",
              )}
            >
              <span className="text-muted-foreground tnum">{c.rank}</span>
              <span>
                <span className="block truncate">{c.club}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {EXPECTATION_LABEL[c.expectation]}
                </span>
              </span>
              <span className="text-right text-xs tnum text-muted-foreground">
                <span className="block">Str {c.strength.toFixed(1)}</span>
                <span className="block">
                  {actual
                    ? `Finished ${actual}`
                    : `Rep ${clubReputation(state, c.club).toFixed(0)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClubCard({
  state,
  club,
  season,
  onClose,
}: {
  state: GameState;
  club: string;
  season: number;
  onClose: () => void;
}) {
  const pred = clubPrediction(state, club, season);
  const record = state.clubRecords?.[club];
  const history = (record?.leagueHistory ?? []).slice(-8).reverse();
  const snaps = (state.clubSnapshots ?? [])
    .filter((s) => s.club === club)
    .slice(-8)
    .reverse();
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
        <span>{club}</span>
        <button onClick={onClose} className="opacity-80 hover:opacity-100">
          Close
        </button>
      </div>
      <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Cell label="Reputation" value={clubReputation(state, club).toFixed(1)} />
        <Cell label="Strength" value={clubStrengthFor(state, club, state.season).toFixed(1)} />
        <Cell label="Tier" value={String(tierOfClub(state, club))} />
        <Cell label="Expectation" value={pred ? EXPECTATION_LABEL[pred.expectation] : "—"} />
        <Cell label="Promotions" value={String(record?.promotions ?? 0)} />
        <Cell label="Relegations" value={String(record?.relegations ?? 0)} />
        <Cell label="Predicted finish" value={pred ? `${pred.rank}` : "—"} />
        <Cell label="Seasons on record" value={String(history.length)} />
      </div>
      {snaps.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Season history
          </div>
          <div className="divide-y text-xs">
            {snaps.map((s) => (
              <div key={s.season} className="flex justify-between py-1 tnum">
                <span>S{s.season}</span>
                <span className="text-muted-foreground">
                  expected {s.expectedFinish} · finished {s.actualFinish}
                </span>
                <span>rep {s.reputationAfter.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-lg tnum leading-tight">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
