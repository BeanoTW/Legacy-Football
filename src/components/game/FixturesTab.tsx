import { Play } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { startMatchDay } from "@/lib/game/engine";
import { Section } from "./shared/primitives";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { Button } from "@/components/ui/button";
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
                  const isNext = fixture.week === state.week && !result;
                  return (
                    <article key={fixtureKey(fixture)} className={cn("lf-fixture-card", `is-${competition}`, isNext && "is-next")}>
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
                        ) : isNext ? (
                          <Button size="sm" onClick={() => update((s) => startMatchDay(s))}>
                            <Play /> Play
                          </Button>
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
  );
}
