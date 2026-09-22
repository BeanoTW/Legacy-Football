import { Play } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { calendarDay, fmtMoney, simulateFixtureToday, startMatchDay } from "@/lib/game/engine";
import { Section } from "./shared/primitives";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { domesticCupName, domesticCupRoundLabel } from "@/lib/game/cupNarrative";
import { cupSlot } from "@/lib/game/cupSchedule";
import { Button } from "@/components/ui/button";
import { medicalSupport, squadAverageFitness } from "@/lib/game/playerHealth";
import {
  PRESEASON_COMPETITION_NAME,
  preseasonComplete,
  preseasonTable,
  preseasonWinnerPrize,
} from "@/lib/game/preseason";
import {
  competitionLabel,
  fixtureCompetition,
  fixtureDate,
  fixtureKey,
  resultForFixture,
} from "./fixturePresentation";

export function FixturesTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const preseasonRows = preseasonTable(state);
  const showPreseason = state.fixtures.some((fixture) => fixture.competition === "preseason");
  const currentWeekFixtures = state.fixtures.filter((fixture) => fixture.week === state.week);
  const currentWeekPlayed = currentWeekFixtures.filter((fixture) => Boolean(resultForFixture(state, fixture))).length;
  const currentWeekRemaining = currentWeekFixtures.length - currentWeekPlayed;
  const averageFitness = squadAverageFitness(state);
  const medical = medicalSupport(state);
  const preseasonFinished = preseasonComplete(state);
  const preseasonPosition =
    preseasonRows.findIndex((row) => isUserClubReference(state, row.club)) + 1;

  const fixturesByWeek = state.fixtures.reduce((weeks, fixture) => {
    const group = weeks.get(fixture.week) ?? [];
    group.push(fixture);
    group.sort((a, b) => (a.dayOfWeek ?? 5) - (b.dayOfWeek ?? 5));
    weeks.set(fixture.week, group);
    return weeks;
  }, new Map<number, GameState["fixtures"]>());

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1.06fr)_minmax(0,.94fr)]">
      <Section title="Fixtures">
        {currentWeekFixtures.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border bg-muted/20 p-2 text-center text-xs">
            <div><strong className="block font-display text-lg">{currentWeekRemaining}</strong><span className="text-[10px] text-muted-foreground">matches left this week</span></div>
            <div><strong className="block font-display text-lg">{averageFitness}%</strong><span className="text-[10px] text-muted-foreground">squad fitness</span></div>
            <div><strong className="block font-display text-lg">{medical.label}</strong><span className="text-[10px] text-muted-foreground">medical support</span></div>
          </div>
        )}
        {currentWeekFixtures.length > 1 && currentWeekRemaining > 0 && (
          <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Congested week: fatigue now carries into the next match, affects manager rotation and raises injury risk when players are run down.
          </div>
        )}
        <div className="lf-fixture-calendar contained-scroll pr-1">
          {[...fixturesByWeek.entries()].map(([week, fixtures]) => (
            <section key={week} className={cn("lf-fixture-week", week === state.week && "is-current")}>
              <div className="lf-fixture-week-heading">
                <span>Week {week}</span>
                <span>{fixtures.length > 1 ? `${fixtures.length} fixtures` : "Matchday"}</span>
              </div>
              <div className="lf-fixture-grid">
                {fixtures.map((fixture) => {
                  const result = resultForFixture(state, fixture);
                  const competition = fixtureCompetition(fixture);
                  const date = fixtureDate(fixture);
                  const isToday = fixture.week === state.week && (fixture.dayOfWeek ?? 5) === calendarDay(state) && !result;
                  return (
                    <article key={fixtureKey(fixture)} className={cn("lf-fixture-card", `is-${competition}`, isToday && "is-next")}>
                      <div className="lf-fixture-accent" />
                      <div className="lf-fixture-date tnum">
                        <strong>{date.day}</strong>
                        <span>{date.dayName} · {date.month}</span>
                      </div>
                      <div className="lf-fixture-copy min-w-0">
                        <span className="lf-competition-label">{competitionLabel(competition)}</span>
                        <strong className="truncate">{clubDisplayName(state, fixture.opponent)}</strong>
                        <span>{fixture.home ? "Home" : "Away"}</span>
                      </div>
                      <div className="lf-fixture-outcome tnum">
                        {result ? (
                          <>
                            <strong>{result.goalsFor}–{result.goalsAgainst}</strong>
                            <span className={cn(`is-${result.result.toLowerCase()}`)}>{result.result === "W" ? "Win" : result.result === "D" ? "Draw" : "Loss"}</span>
                          </>
                        ) : isToday ? (
                          <div className="flex flex-col gap-1">
                            <Button size="sm" onClick={() => update((s) => startMatchDay(s))}>
                              <Play /> Play
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => update((s) => simulateFixtureToday(s))}>
                              Sim
                            </Button>
                          </div>
                        ) : (
                          <>
                            <strong>—</strong>
                            <span>Upcoming</span>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </Section>

      <div className="grid min-h-0 gap-4">
        {(state.domesticCups ?? []).map((cup) => (
          <CupCompetitionPanel key={cup.competition} state={state} cup={cup} />
        ))}
        {showPreseason && (
          <Section title={PRESEASON_COMPETITION_NAME}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 text-xs text-muted-foreground">
              <span>Three-match July invitational · preparation before the competitive season</span>
              {preseasonFinished && preseasonPosition > 0 && (
                <strong
                  className={cn(
                    "rounded-full px-2 py-1",
                    preseasonPosition === 1
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-muted text-foreground",
                  )}
                >
                  {preseasonPosition === 1
                    ? `Champions · ${fmtMoney(preseasonWinnerPrize(state))}`
                    : `Finished ${
                        preseasonPosition === 2
                          ? "2nd"
                          : preseasonPosition === 3
                            ? "3rd"
                            : `${preseasonPosition}th`
                      }`}
                </strong>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tnum">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2 pr-2">Club</th>
                    <th className="text-right py-2 pr-2">P</th>
                    <th className="text-right py-2 pr-2">GD</th>
                    <th className="text-right py-2">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {preseasonRows.map((r, i) => (
                    <tr key={r.club} className={cn("border-b last:border-b-0", isUserClubReference(state, r.club) && "bg-accent/20 font-semibold")}>
                      <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1.5 pr-2">{clubDisplayName(state, r.club)}</td>
                      <td className="text-right py-1.5 pr-2">{r.p}</td>
                      <td className="text-right py-1.5 pr-2">{r.gf - r.ga}</td>
                      <td className="text-right py-1.5 font-semibold">{r.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section title="League table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-2">#</th>
                <th className="text-left py-2 pr-2">Club</th>
                <th className="text-right py-2 pr-2">P</th>
                <th className="text-right py-2 pr-2">W</th>
                <th className="text-right py-2 pr-2">D</th>
                <th className="text-right py-2 pr-2">L</th>
                <th className="text-right py-2 pr-2">GD</th>
                <th className="text-right py-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {[...state.league]
                .sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf)
                .map((r, i) => (
                  <tr
                    key={r.team}
                    className={cn(
                      "border-b last:border-b-0",
                      isUserClubReference(state, r.team) && "bg-accent/20 font-semibold",
                    )}
                  >
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2">{clubDisplayName(state, r.team)}</td>
                    <td className="text-right py-1.5 pr-2">{r.p}</td>
                    <td className="text-right py-1.5 pr-2">{r.w}</td>
                    <td className="text-right py-1.5 pr-2">{r.d}</td>
                    <td className="text-right py-1.5 pr-2">{r.l}</td>
                    <td className="text-right py-1.5 pr-2">{r.gf - r.ga}</td>
                    <td className="text-right py-1.5 font-semibold">{r.pts}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
      </div>
    </div>
  );
}

function CupCompetitionPanel({
  state,
  cup,
}: {
  state: GameState;
  cup: NonNullable<GameState["domesticCups"]>[number];
}) {
  const userTie = cup.ties.find(
    (tie) => isUserClubReference(state, tie.home) || isUserClubReference(state, tie.away),
  );
  const userEliminated = cup.eliminated.some((club) => isUserClubReference(state, club));
  const userBye = (cup.byes ?? []).some((club) => isUserClubReference(state, club));
  const userChampion = Boolean(cup.champion && isUserClubReference(state, cup.champion));
  const slot = cupSlot(cup.competition, cup.round);
  const sampleTies = userTie
    ? [userTie, ...cup.ties.filter((tie) => tie !== userTie).slice(0, 3)]
    : cup.ties.slice(0, 4);
  const status = userChampion
    ? "Champions"
    : userEliminated
      ? "Eliminated"
      : userBye
        ? "Bye"
        : userTie
          ? (isUserClubReference(state, userTie.home) ? "Home tie" : "Away tie")
          : "Awaiting entry / next draw";

  return (
    <Section title={domesticCupName(cup.competition)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-display text-lg">
            {cup.champion ? "Competition complete" : domesticCupRoundLabel(cup.competition, cup.round)}
          </div>
          <div className="text-xs text-muted-foreground">
            {slot
              ? `Week ${slot.week} · ${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][slot.dayOfWeek]}`
              : "Finalised"}
            {" · "}{cup.entrants.length} clubs in current round
          </div>
        </div>
        <span className={cn(
          "rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
          userChampion && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
          userEliminated && "border-rose-500/30 bg-rose-500/10 text-rose-700",
          !userChampion && !userEliminated && "bg-muted/40 text-muted-foreground",
        )}>
          {status}
        </span>
      </div>

      {userBye ? (
        <div className="rounded-xl border bg-muted/20 p-3 text-sm">
          <strong className="block">Bye into the next round</strong>
          <span className="text-xs text-muted-foreground">No fixture is required for the club in this round.</span>
        </div>
      ) : cup.champion ? (
        <div className="rounded-xl border bg-muted/20 p-3 text-sm">
          <span className="text-xs text-muted-foreground">Winner</span>
          <strong className="mt-1 block font-display text-xl">{clubDisplayName(state, cup.champion)}</strong>
        </div>
      ) : (
        <div className="divide-y rounded-xl border">
          {sampleTies.map((tie) => {
            const mine = isUserClubReference(state, tie.home) || isUserClubReference(state, tie.away);
            return (
              <div key={`${tie.home}-${tie.away}`} className={cn("grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-xs", mine && "bg-primary/5")}>
                <span className={cn("truncate", isUserClubReference(state, tie.home) && "font-bold")}>
                  {clubDisplayName(state, tie.home)}
                </span>
                <span className="text-muted-foreground">v</span>
                <span className={cn("truncate text-right", isUserClubReference(state, tie.away) && "font-bold")}>
                  {clubDisplayName(state, tie.away)}
                </span>
                {tie.winner && (
                  <span className="col-span-3 text-[10px] text-muted-foreground">
                    Winner: {clubDisplayName(state, tie.winner)}
                  </span>
                )}
              </div>
            );
          })}
          {cup.ties.length > sampleTies.length && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              + {cup.ties.length - sampleTies.length} other ties
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
