import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, MatchEvent } from "@/lib/game/types";
import {
  ArrowLeftRight,
  ChevronsRight,
  Cross,
  Landmark,
  Newspaper,
  Play,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  continueSecondHalf,
  cancelLiveMatch,
  commitLiveMatchAndAdvance,
  fmtMoney,
  kickoff,
} from "@/lib/game/engine";
import { Info2 } from "./shared/primitives";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubPresentationName } from "@/lib/game/clubPresentation";
import { footballLevelOfLeague } from "@/lib/game/footballLevel";
import { managerMatchPrep } from "@/lib/game/managerMatchPrep";
import { opponentMatchPlan, totalMatchStats } from "@/lib/game/matchEngine";
import { MatchPitchViewer, type DotColours } from "./MatchPitchViewer";
import { medicalSupport } from "@/lib/game/playerHealth";
import { userSelectionStrengthPenalty } from "@/lib/game/matchStrength";
import { inFormPlayers } from "@/lib/game/playerForm";
import { userSquad } from "@/lib/game/recruitment";
import { clubKitFor, defaultClubKit, readableOn, type KitDesign } from "@/lib/game/clubKit";
import { ClubBadge, ClubShirt } from "./ClubKitArt";

const MATCH_CSS = `
@keyframes lf-goal-in { 0% { opacity: 0; transform: scale(.7); } 60% { opacity: 1; transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes lf-score-pop { 0% { transform: scale(1); } 35% { transform: scale(1.35); } 100% { transform: scale(1); } }
@keyframes lf-marker-in { from { opacity: 0; transform: translate(-50%, -4px) scale(.6); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.lf-goal-in { animation: lf-goal-in .5s cubic-bezier(.2,.9,.3,1.2) both; }
.lf-score-pop { animation: lf-score-pop .6s ease-out; display: inline-block; }
.lf-marker-in { animation: lf-marker-in .3s ease-out both; }
@media (prefers-reduced-motion: reduce) { .lf-goal-in, .lf-score-pop, .lf-marker-in { animation: none; } }
`;

/* ------------------------------------------------------------------ */
/* Kit colours on the pitch                                            */
/* ------------------------------------------------------------------ */

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
function dotColours(kit: KitDesign): DotColours {
  const edge = colourDistance(kit.trim, kit.body) > 60 ? kit.trim : readableOn(kit.body) === "#ffffff" ? "#ffffff" : "#16181b";
  return { fill: kit.body, edge, text: readableOn(kit.body) };
}
/** Home side wears home colours; the away side changes if the shirts clash. */
function matchKits(homeKit: KitDesign, awayHome: KitDesign, awayAlt: KitDesign): { home: KitDesign; away: KitDesign } {
  const clash = colourDistance(homeKit.body, awayHome.body) < 120;
  return { home: homeKit, away: clash ? awayAlt : awayHome };
}

/* ------------------------------------------------------------------ */
/* Overlay                                                             */
/* ------------------------------------------------------------------ */

export function MatchDayOverlay({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const lm = state.liveMatch!;
  const [revealedEvents, setRevealedEvents] = useState(0);
  const [replayComplete, setReplayComplete] = useState(false);
  const [minute, setMinute] = useState(0);
  const finishedReplay = replayComplete && revealedEvents >= lm.events.length;
  const onReplayProgress = useCallback((count: number, complete: boolean, clock?: number) => {
    setRevealedEvents(count);
    setReplayComplete(complete);
    if (typeof clock === "number") setMinute(clock);
  }, []);

  const usName = state.clubName;
  const themName = clubPresentationName(clubDisplayName(state, lm.fixture.opponent));
  const matchLeague = state.leagues.find((league) => league.id === lm.leagueId);
  const home = lm.fixture.home;
  const homeName = home ? usName : themName;
  const awayName = home ? themName : usName;

  // Identities: our saved badge and kits, the opposition's derived defaults.
  const ours = clubKitFor(state);
  const theirs = useMemo(() => defaultClubKit(themName), [themName]);
  const kits = home ? matchKits(ours.home, theirs.home, theirs.away) : matchKits(theirs.home, ours.home, ours.away);
  const ourKit = home ? kits.home : kits.away;
  const theirKit = home ? kits.away : kits.home;
  const opponentStyle = lm.engine?.opponentPlan ?? opponentMatchPlan(lm.fixture.opponent);

  const visible = lm.status === "brief" ? [] : lm.events.slice(0, revealedEvents);
  const visibleGoals = visible.filter((event) => event.type === "goal");
  const ourGoalsShown = visibleGoals.filter((event) => event.side === "us").length;
  const theirGoalsShown = visibleGoals.filter((event) => event.side === "them").length;
  const homeGoals = home ? ourGoalsShown : theirGoalsShown;
  const awayGoals = home ? theirGoalsShown : ourGoalsShown;

  // A goal moment each time a new goal is revealed.
  const [goalFlash, setGoalFlash] = useState<{ key: number; event: MatchEvent } | null>(null);
  const shownGoalCount = useRef(0);
  const flashTimer = useRef<number | null>(null);
  const goalCount = visibleGoals.length;
  const latestGoal = visibleGoals[goalCount - 1];
  useEffect(() => {
    const previous = shownGoalCount.current;
    shownGoalCount.current = goalCount;
    // Only celebrate goals revealed live, not ones already on the board when the screen opens.
    if (goalCount > previous && latestGoal && !replayComplete) {
      setGoalFlash({ key: goalCount, event: latestGoal });
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setGoalFlash(null), 2800);
    }
  }, [goalCount, latestGoal, replayComplete]);
  useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
  }, []);

  const clock =
    lm.status === "brief"
      ? "Pre-match"
      : !finishedReplay
        ? `${Math.max(1, Math.min(90, minute))}'`
        : lm.status === "halfTime"
          ? "Half time"
          : lm.status === "fullTime"
            ? "Full time"
            : `${minute}'`;
  const live = lm.status !== "brief" && !finishedReplay;

  const stats = totalMatchStats(lm.engine);
  const liveChances = (side: "us" | "them") => visible.filter((event) => event.side === side && (event.type === "chance" || event.type === "goal"));
  const liveXg = (side: "us" | "them") => liveChances(side).reduce((sum, event) => sum + (event.xg ?? 0), 0);
  const possession = stats?.us.possession ?? Math.max(34, Math.min(66, Math.round(50 + (lm.ourStrength - lm.oppStrength) * 0.7)));

  const result = lm.ourGoals > lm.theirGoals ? "Victory" : lm.ourGoals < lm.theirGoals ? "Defeat" : "Draw";
  const playerOfMatch = lm.engine?.playerStats?.length
    ? [...lm.engine.playerStats].sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists)[0]
    : undefined;
  const expectationMet =
    lm.boardExpectation === "Any result" || (lm.boardExpectation === "Win" ? result === "Victory" : result !== "Defeat");
  const atmosphere = home ? Math.round((lm.projectedAttendance / Math.max(1, lm.projectedAttendance + 1200)) * 100) : 72;

  const goalsFor = (side: "us" | "them") => visibleGoals.filter((event) => event.side === side);
  const homeScorers = goalsFor(home ? "us" : "them");
  const awayScorers = goalsFor(home ? "them" : "us");

  return (
    <div className="fixed inset-0 z-50 h-dvh overflow-hidden bg-[#07130f] text-white">
      <style>{MATCH_CSS}</style>
      <div className="mx-auto h-full max-w-5xl p-0 sm:px-4 sm:py-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground shadow-2xl sm:rounded-[2rem] sm:border">
          {/* Top bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 bg-[#0c211a] px-4 py-2 text-white sm:px-6">
            <div className="min-w-0 text-xs text-white/70">
              <span className="font-semibold text-white">Match centre</span>
              <span className="mx-1.5 text-white/30">/</span>
              {matchLeague ? `${matchLeague.name} · Level ${footballLevelOfLeague(matchLeague)}` : `Week ${lm.fixture.week}`}
              <span className="mx-1.5 text-white/30">/</span>
              {lm.weather}
            </div>
            <button
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/15 transition-colors hover:bg-black/25"
              aria-label={lm.status === "fullTime" ? "Return to club" : "Close matchday"}
              onClick={() => {
                if (lm.status === "fullTime") {
                  update((s) => commitLiveMatchAndAdvance(s));
                  return;
                }
                if (confirm("Abandon the match? Progress this fixture will be lost.")) {
                  update((s) => cancelLiveMatch(s));
                }
              }}
            >
              {lm.status === "fullTime" ? <ChevronsRight className="size-5" /> : <X className="size-5" />}
            </button>
          </div>

          {/* Scoreboard */}
          <section className="relative shrink-0 overflow-hidden bg-[radial-gradient(circle_at_50%_130%,#258660_0%,#123d2e_40%,#07130f_80%)] px-3 pb-3 pt-3 text-white sm:px-8 sm:pb-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-6">
              <TeamSide name={homeName} badge={home ? ours.badge : theirs.badge} scorers={homeScorers} />
              <div className="flex flex-col items-center pt-1">
                <div className="whitespace-nowrap font-display text-5xl leading-none tnum sm:text-6xl" aria-live="polite">
                  <span key={`h${homeGoals}`} className={homeGoals ? "lf-score-pop" : undefined}>{homeGoals}</span>
                  <span className="mx-2 text-white/35 sm:mx-3">–</span>
                  <span key={`a${awayGoals}`} className={awayGoals ? "lf-score-pop" : undefined}>{awayGoals}</span>
                </div>
                <div
                  className={cn(
                    "mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold tnum",
                    live ? "bg-emerald-400 text-emerald-950" : "bg-white/10 text-white/80",
                  )}
                >
                  {live ? <span className="size-1.5 animate-pulse rounded-full bg-emerald-950" aria-hidden="true" /> : null}
                  {clock}
                </div>
              </div>
              <TeamSide name={awayName} badge={home ? theirs.badge : ours.badge} scorers={awayScorers} />
            </div>

            {goalFlash ? (
              <div key={goalFlash.key} className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[1px]">
                <div className="lf-goal-in text-center">
                  <div className={cn("font-display text-6xl leading-none sm:text-7xl", goalFlash.event.side === "us" ? "text-emerald-300" : "text-rose-300")}>
                    GOAL
                  </div>
                  <div className="mt-1 text-sm font-semibold">
                    {goalFlash.event.actorName ?? (goalFlash.event.side === "us" ? usName : themName)} {goalFlash.event.minute}'
                  </div>
                  {goalFlash.event.secondaryName ? <div className="text-xs text-white/70">Assist: {goalFlash.event.secondaryName}</div> : null}
                </div>
              </div>
            ) : null}
          </section>

          {lm.status !== "brief" ? (
            <section className="shrink-0 border-b bg-[#0c211a] px-3 pb-2 pt-1 text-white sm:px-6">
              <MatchTimeline events={visible} minute={finishedReplay ? (lm.status === "fullTime" ? 90 : 45) : minute} ourKit={ourKit} theirKit={theirKit} />
              <div className="mt-1.5 grid grid-cols-3 text-center text-[11px]">
                <PulseStat label="Possession" value={`${possession}%`} />
                <PulseStat label="Chances" value={`${liveChances("us").length}–${liveChances("them").length}`} />
                <PulseStat label="xG" value={`${liveXg("us").toFixed(1)}–${liveXg("them").toFixed(1)}`} />
              </div>
            </section>
          ) : null}

          <div
            className={cn(
              "min-h-0 flex-1",
              lm.status === "brief" || !finishedReplay ? "block" : "grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)] lg:grid-rows-1",
              finishedReplay && lm.status === "halfTime"
                ? "grid-rows-[minmax(12rem,1fr)_minmax(14rem,1.1fr)]"
                : finishedReplay
                  ? "grid-rows-[minmax(0,3fr)_minmax(8rem,2fr)]"
                  : "",
            )}
          >
            {lm.status === "brief" ? (
              <PreMatch
                state={state}
                lm={lm}
                ourKit={ourKit}
                theirKit={theirKit}
                ourBadge={ours.badge}
                theirBadge={theirs.badge}
                themName={themName}
                opponentStyle={`${opponentStyle.philosophy.toLowerCase()} football, ${(opponentStyle.tempo ?? "Medium").toLowerCase()} tempo, ${(opponentStyle.pressing ?? "Medium").toLowerCase()} press`}
                onKickoff={() => update((s) => kickoff(s))}
              />
            ) : null}

            {lm.status === "halfTime" && finishedReplay ? (
              <section className="flex min-h-0 flex-col justify-center gap-3 overflow-y-auto border-t p-4 text-center sm:p-6">
                <h2 className="font-display text-3xl">Half time</h2>
                {lm.engine?.halves[0] ? (
                  <div className="mx-auto w-full max-w-sm space-y-1.5 text-left">
                    <StatBar label="Shots" us={lm.engine.halves[0].us.shots} them={lm.engine.halves[0].them.shots} ourKit={ourKit} theirKit={theirKit} />
                    <StatBar label="On target" us={lm.engine.halves[0].us.shotsOnTarget} them={lm.engine.halves[0].them.shotsOnTarget} ourKit={ourKit} theirKit={theirKit} />
                    <StatBar label="xG" us={lm.engine.halves[0].us.xg} them={lm.engine.halves[0].them.xg} ourKit={ourKit} theirKit={theirKit} decimals />
                  </div>
                ) : null}
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  Team talk, tactics and substitutions belong to the manager. As chairman, you watch the second half unfold.
                </p>
                <Button className="mx-auto h-12 w-full max-w-sm text-base font-semibold" onClick={() => update((s) => continueSecondHalf(s))}>
                  Continue second half <ChevronsRight className="ml-1 size-5" />
                </Button>
              </section>
            ) : null}

            {lm.status === "fullTime" && finishedReplay ? (
              <section className="flex min-h-0 flex-col overflow-hidden border-t">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5">
                  <div className="text-center">
                    <div
                      className={cn(
                        "font-display text-4xl",
                        result === "Victory" ? "text-emerald-600" : result === "Defeat" ? "text-rose-600" : "text-foreground",
                      )}
                    >
                      {result}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {expectationMet ? "The board's expectation was met." : `The board expected ${lm.boardExpectation.toLowerCase()}.`}
                    </p>
                  </div>

                  {stats ? (
                    <div className="space-y-1.5 rounded-2xl border p-3">
                      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                        <span className="flex items-center gap-1.5"><ClubBadge design={ours.badge} size={18} /> {usName}</span>
                        <span className="flex items-center gap-1.5">{themName} <ClubBadge design={theirs.badge} size={18} /></span>
                      </div>
                      <StatBar label="Possession" us={stats.us.possession} them={stats.them.possession} ourKit={ourKit} theirKit={theirKit} suffix="%" />
                      <StatBar label="Shots" us={stats.us.shots} them={stats.them.shots} ourKit={ourKit} theirKit={theirKit} />
                      <StatBar label="On target" us={stats.us.shotsOnTarget} them={stats.them.shotsOnTarget} ourKit={ourKit} theirKit={theirKit} />
                      <StatBar label="Expected goals" us={stats.us.xg} them={stats.them.xg} ourKit={ourKit} theirKit={theirKit} decimals />
                      <StatBar label="Corners" us={stats.us.corners} them={stats.them.corners} ourKit={ourKit} theirKit={theirKit} />
                      <StatBar label="Fouls" us={stats.us.fouls} them={stats.them.fouls} ourKit={ourKit} theirKit={theirKit} />
                      <StatBar label="Yellow cards" us={stats.us.yellowCards} them={stats.them.yellowCards} ourKit={ourKit} theirKit={theirKit} />
                    </div>
                  ) : null}

                  {playerOfMatch ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                      <ClubShirt kit={{ ...ourKit, sponsor: "" }} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-emerald-700 dark:text-emerald-400">Player of the match</div>
                        <div className="truncate font-display text-2xl leading-tight">{playerOfMatch.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {playerOfMatch.minutes} min{playerOfMatch.goals ? ` · ${playerOfMatch.goals} goal${playerOfMatch.goals > 1 ? "s" : ""}` : ""}
                          {playerOfMatch.assists ? ` · ${playerOfMatch.assists} assist${playerOfMatch.assists > 1 ? "s" : ""}` : ""}
                        </div>
                      </div>
                      <RatingChip rating={playerOfMatch.rating} large />
                    </div>
                  ) : null}

                  {lm.engine?.playerStats?.length ? (
                    <div className="rounded-2xl border p-3">
                      <div className="mb-1.5 text-sm font-semibold">Player ratings</div>
                      <div className="grid gap-x-4 sm:grid-cols-2">
                        {[...lm.engine.playerStats]
                          .sort((a, b) => b.rating - a.rating)
                          .map((player) => (
                            <div key={player.playerId} className="flex items-center gap-2 border-b py-1.5 text-xs last:border-0">
                              <span className="w-8 text-[10px] font-semibold text-muted-foreground">{player.role}</span>
                              <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
                              {player.goals > 0 ? <span className="text-[10px]">{"⚽".repeat(Math.min(3, player.goals))}</span> : null}
                              {player.assists > 0 ? <span className="text-[10px] text-muted-foreground">{player.assists}A</span> : null}
                              {!player.started ? <span className="text-[10px] text-muted-foreground">sub</span> : null}
                              <RatingChip rating={player.rating} />
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 text-sm tnum sm:grid-cols-4">
                    <Info2 label="Attendance" value={lm.attendance.toLocaleString()} />
                    <Info2 label="Gate" value={fmtMoney(lm.gateReceipts)} />
                    <Info2 label="TV" value={fmtMoney(lm.tvIncome)} />
                    <Info2 label="Matchday ops" value={`-${fmtMoney(lm.matchdayOps)}`} tone="bad" />
                  </div>

                  {lm.engine?.substitutions?.length || lm.engine?.injuries?.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                        <div className="mb-1 font-semibold">Changes</div>
                        <div className="text-muted-foreground">
                          {(lm.engine?.substitutions ?? []).filter((sub) => sub.side === "us").map((sub) => `${sub.minute}' ${sub.playerOnName} for ${sub.playerOffName}`).join(" · ") || "No substitutions"}
                        </div>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3 text-xs">
                        <div className="mb-1 font-semibold">Medical report</div>
                        <div className="text-muted-foreground">
                          {(lm.engine?.injuries ?? []).filter((injury) => injury.side === "us").map((injury) => `${injury.playerName}: ${injury.type}`).join(" · ") || "No new injuries"}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-3">
                    <ReactionCard
                      icon={Users}
                      label="Supporters"
                      text={
                        result === "Victory"
                          ? "They spill out singing. Belief is building."
                          : result === "Defeat"
                            ? "Frustrated, but they noticed the level of intent."
                            : "Respectful applause, with a sense of opportunity missed."
                      }
                      tone={result === "Victory" ? "good" : "neutral"}
                    />
                    <ReactionCard
                      icon={Landmark}
                      label="Board"
                      text={expectationMet ? "Expectation met. The room stays calm." : "Expectation missed. Questions will follow."}
                      tone={expectationMet ? "good" : "bad"}
                    />
                    <ReactionCard
                      icon={Newspaper}
                      label="Back page"
                      text={
                        result === "Victory"
                          ? `${state.clubName} make their point.`
                          : result === "Defeat"
                            ? `${state.clubName} leave with hard lessons.`
                            : "Nothing settled after a tense draw."
                      }
                      tone="neutral"
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">Atmosphere {atmosphere}%</p>
                </div>
                <div className="shrink-0 border-t bg-card p-3 sm:p-4">
                  <Button className="h-12 w-full text-base font-semibold sm:h-14" onClick={() => update((s) => commitLiveMatchAndAdvance(s))}>
                    Return to club <ChevronsRight className="ml-1 size-5" />
                  </Button>
                </div>
              </section>
            ) : null}

            {lm.status !== "brief" ? (
              <section className={cn("flex min-h-0 flex-col border-t bg-muted/20", !finishedReplay ? "h-full border-t-0" : "lg:border-l lg:border-t-0")}>
                <MatchPitchViewer
                  events={lm.events}
                  usName={usName}
                  themName={themName}
                  userLineup={lm.engine?.userLineup}
                  opponentLineup={lm.engine?.opponentLineup}
                  userBench={lm.engine?.userBench}
                  opponentBench={lm.engine?.opponentBench}
                  substitutions={lm.engine?.substitutions}
                  userPlan={lm.engine?.userPlan}
                  opponentPlan={lm.engine?.opponentPlan}
                  onReplayProgress={onReplayProgress}
                  expanded={!finishedReplay}
                  userColours={dotColours(ourKit)}
                  opponentColours={dotColours(theirKit)}
                />
                {finishedReplay ? (
                  <>
                    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="font-semibold">Match story</span>
                      <span className="text-xs text-muted-foreground">{lm.events.length} moments</span>
                    </div>
                    <ul className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain border-t text-sm">
                      {visible.length === 0 ? (
                        <li className="p-5 text-center text-muted-foreground">No moments yet.</li>
                      ) : (
                        visible.map((event, index) => <StoryRow key={index} event={event} ourKit={ourKit} theirKit={theirKit} />)
                      )}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function TeamSide({ name, badge, scorers }: { name: string; badge: Parameters<typeof ClubBadge>[0]["design"]; scorers: MatchEvent[] }) {
  // Group a player's goals: "Fin Sub 12', 72'".
  const byScorer = new Map<string, number[]>();
  for (const goal of scorers) {
    const key = goal.actorName ?? "Goal";
    byScorer.set(key, [...(byScorer.get(key) ?? []), goal.minute]);
  }
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <ClubBadge design={badge} clubName={name} size={56} className="drop-shadow-[0_4px_8px_rgba(0,0,0,.45)]" />
      <div className="max-w-full truncate font-display text-base leading-tight sm:text-lg">{name}</div>
      {byScorer.size ? (
        <ul className="max-w-full space-y-0.5 text-center text-[11px] leading-tight text-white/75">
          {[...byScorer.entries()].map(([scorer, minutes]) => (
            <li key={scorer} className="truncate">
              {scorer} {minutes.map((m) => `${m}'`).join(", ")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PulseStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/50">{label}</div>
      <div className="font-display text-sm tnum">{value}</div>
    </div>
  );
}

/** 0-90 strip of the match so far: goals, chances, cards and changes. */
function MatchTimeline({ events, minute, ourKit, theirKit }: { events: MatchEvent[]; minute: number; ourKit: KitDesign; theirKit: KitDesign }) {
  const at = (m: number) => `${(Math.min(90, Math.max(0, m)) / 90) * 100}%`;
  return (
    <div className="relative h-12" aria-label={`Match timeline, ${minute} minutes played`}>
      {/* track */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
      <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-400/70 transition-[width] duration-500" style={{ width: at(minute) }} />
      <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/40" style={{ left: "50%" }} aria-hidden="true" />
      <span className="absolute bottom-0 left-0 text-[9px] text-white/40">0'</span>
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] text-white/40">HT</span>
      <span className="absolute bottom-0 right-0 text-[9px] text-white/40">90'</span>
      {events.map((event, index) => {
        const up = event.side === "us";
        const kit = up ? ourKit : theirKit;
        const top = up ? "top-0" : "bottom-2.5";
        const label = `${event.minute}' ${event.text}`;
        if (event.type === "goal") {
          return (
            <span
              key={index}
              title={label}
              className={cn("lf-marker-in absolute grid size-4 -translate-x-1/2 place-items-center rounded-full border-2 text-[8px]", top)}
              style={{ left: at(event.minute), background: kit.body, borderColor: readableOn(kit.body) === "#ffffff" ? "#ffffff" : "#16181b" }}
            >
              <span className="size-1.5 rounded-full" style={{ background: readableOn(kit.body) }} />
            </span>
          );
        }
        if (event.type === "card") {
          return <span key={index} title={label} className={cn("lf-marker-in absolute h-3 w-2 -translate-x-1/2 rounded-[2px] bg-yellow-400", up ? "top-0.5" : "bottom-3")} style={{ left: at(event.minute) }} />;
        }
        if (event.type === "sub" || event.type === "injury") {
          return (
            <span key={index} title={label} className={cn("lf-marker-in absolute -translate-x-1/2 text-white/70", up ? "top-0.5" : "bottom-3")} style={{ left: at(event.minute) }}>
              {event.type === "injury" ? <Cross className="size-3" /> : <ArrowLeftRight className="size-3" />}
            </span>
          );
        }
        if (event.type === "chance") {
          return <span key={index} title={label} className={cn("lf-marker-in absolute size-1.5 -translate-x-1/2 rounded-full bg-white/60", up ? "top-1.5" : "bottom-4")} style={{ left: at(event.minute) }} />;
        }
        return null;
      })}
    </div>
  );
}

function StatBar({
  label,
  us,
  them,
  ourKit,
  theirKit,
  decimals = false,
  suffix = "",
}: {
  label: string;
  us: number;
  them: number;
  ourKit: KitDesign;
  theirKit: KitDesign;
  decimals?: boolean;
  suffix?: string;
}) {
  const total = us + them || 1;
  const fmt = (value: number) => (decimals ? value.toFixed(2) : String(value)) + suffix;
  // Neutral kits (white or near-white) get an outline so the bar stays visible.
  const bar = (kit: KitDesign) => ({ background: kit.body, boxShadow: readableOn(kit.body) === "#16181b" ? "inset 0 0 0 1px rgba(0,0,0,.25)" : undefined });
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs tnum">
        <span className={cn("font-semibold", us > them && "text-foreground", us < them && "text-muted-foreground")}>{fmt(us)}</span>
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold", them > us && "text-foreground", them < us && "text-muted-foreground")}>{fmt(them)}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-l-full" style={{ width: `${(us / total) * 100}%`, ...bar(ourKit) }} />
        <div className="h-full rounded-r-full" style={{ width: `${(them / total) * 100}%`, ...bar(theirKit) }} />
      </div>
    </div>
  );
}

function RatingChip({ rating, large = false }: { rating: number; large?: boolean }) {
  const tone =
    rating >= 8 ? "bg-emerald-600 text-white" : rating >= 7 ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300" : rating >= 6 ? "bg-muted text-foreground" : "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return <strong className={cn("rounded tnum", tone, large ? "px-2 py-1 font-display text-2xl" : "px-1.5 py-0.5 text-xs")}>{rating.toFixed(1)}</strong>;
}

function StoryRow({ event, ourKit, theirKit }: { event: MatchEvent; ourKit: KitDesign; theirKit: KitDesign }) {
  const kit = event.side === "us" ? ourKit : theirKit;
  const goal = event.type === "goal";
  return (
    <li className={cn("flex items-start gap-3 px-4 py-2.5", goal && "bg-muted/40")}>
      <span className="w-7 shrink-0 pt-0.5 text-xs text-muted-foreground tnum">{event.minute}'</span>
      <span className="mt-1 shrink-0">
        {goal ? (
          <span className="block size-3.5 rounded-full border-2" style={{ background: kit.body, borderColor: kit.trim }} />
        ) : event.type === "card" ? (
          <span className="block h-3.5 w-2.5 rounded-[2px] bg-yellow-400" />
        ) : event.type === "sub" ? (
          <ArrowLeftRight className="size-3.5 text-muted-foreground" />
        ) : event.type === "injury" ? (
          <Cross className="size-3.5 text-rose-500" />
        ) : (
          <span className="block size-2 translate-x-0.5 rounded-full bg-muted-foreground/50" />
        )}
      </span>
      <span className={cn("min-w-0 flex-1", goal ? "font-semibold" : event.side === "us" ? "" : "text-muted-foreground")}>
        {event.text}
        {goal && event.xg ? <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">xG {event.xg.toFixed(2)}</span> : null}
      </span>
    </li>
  );
}

function ReactionCard({ icon: Icon, label, text, tone }: { icon: typeof Users; label: string; text: string; tone: "good" | "bad" | "neutral" }) {
  return (
    <div className={cn("rounded-2xl border p-3", tone === "good" ? "border-emerald-500/20 bg-emerald-500/5" : tone === "bad" ? "border-rose-500/20 bg-rose-500/5" : "bg-muted/30")}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <div className="mt-1 text-sm">{text}</div>
    </div>
  );
}

function PreMatch({
  state,
  lm,
  ourKit,
  theirKit,
  ourBadge,
  theirBadge,
  themName,
  opponentStyle,
  onKickoff,
}: {
  state: GameState;
  lm: NonNullable<GameState["liveMatch"]>;
  ourKit: KitDesign;
  theirKit: KitDesign;
  ourBadge: Parameters<typeof ClubBadge>[0]["design"];
  theirBadge: Parameters<typeof ClubBadge>[0]["design"];
  themName: string;
  opponentStyle: string;
  onKickoff: () => void;
}) {
  const matchPrep = managerMatchPrep(state);
  const medical = medicalSupport(state);
  const selectionPenalty = userSelectionStrengthPenalty(state);
  const formLeaders = inFormPlayers(state, 2);
  const squad = userSquad(state);
  const selectedFitness = lm.engine?.userLineup?.length
    ? Math.round(lm.engine.userLineup.reduce((sum, player) => sum + (player.fitness ?? 100), 0) / lm.engine.userLineup.length)
    : 100;
  const ourShare = (lm.ourStrength / Math.max(1, lm.ourStrength + lm.oppStrength)) * 100;

  return (
    <section className="h-full space-y-4 overflow-y-auto overscroll-contain border-t p-3 sm:p-5">
      {/* Kit matchup */}
      <div className="flex items-end justify-center gap-6 rounded-2xl bg-[radial-gradient(120%_90%_at_50%_0%,#1f5a57_0%,#0e2e2d_60%,#081d1c_100%)] px-4 pb-3 pt-4 text-white">
        <div className="flex flex-col items-center gap-1">
          <ClubShirt kit={ourKit} badge={ourBadge} clubName={state.clubName} size={92} />
          <span className="text-xs text-white/75">{state.clubName}</span>
        </div>
        <span className="pb-10 font-display text-xl text-white/50">v</span>
        <div className="flex flex-col items-center gap-1">
          <ClubShirt kit={theirKit} badge={theirBadge} clubName={themName} size={92} />
          <span className="text-xs text-white/75">{themName}</span>
        </div>
      </div>

      {/* Strength balance */}
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="font-semibold tnum">{Math.round(lm.ourStrength)}</span>
          <span className="text-muted-foreground">Team strength</span>
          <span className="font-semibold tnum">{Math.round(lm.oppStrength)}</span>
        </div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          <div className="h-full" style={{ width: `${ourShare}%`, background: ourKit.body, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }} />
          <div className="h-full flex-1" style={{ background: theirKit.body, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }} />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {themName} usually play <span className="font-medium text-foreground">{opponentStyle}</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Info2 label="Weather" value={lm.weather} />
        <Info2 label="Projected gate" value={lm.fixture.home ? `${lm.projectedAttendance.toLocaleString()} fans` : "Away, no gate"} />
        <Info2 label="Board expects" value={lm.boardExpectation} />
        <Info2 label="Form" value={lm.formGuide} />
        <Info2 label="Starting XI fitness" value={`${selectedFitness}%`} />
        <Info2 label="Medical support" value={`${medical.label} · ${medical.score}`} />
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{matchPrep.managerName}'s plan</span>
          <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[11px]">{matchPrep.selectedFormation}</span>
          <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[11px]">{matchPrep.style}</span>
          <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[11px]">{matchPrep.rotation} rotation</span>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{matchPrep.summary}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {selectionPenalty < -0.05 ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-amber-700">Selection cost {selectionPenalty.toFixed(2)}</span>
          ) : null}
          {formLeaders.map((form) => {
            const player = squad.find((candidate) => candidate.id === form.playerId);
            return (
              <span key={form.playerId} className="rounded-full border bg-background/60 px-2 py-0.5 text-muted-foreground">
                In form: {player ? `${player.firstName} ${player.lastName}` : "player"} · {form.averageRating.toFixed(2)}
              </span>
            );
          })}
        </div>
        {matchPrep.managerId && matchPrep.selectedFormation !== matchPrep.preferredFormation ? (
          <p className="mt-2 text-xs font-medium">
            Adjusted for the squad: preferred {matchPrep.preferredFormation}, playing {matchPrep.selectedFormation}.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Landmark className="size-4 text-primary" /> Boardroom pressure
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The board expects <strong className="text-foreground">{lm.boardExpectation.toLowerCase()}</strong>. Supporters want intent as much as points.
        </p>
      </div>

      <Button className="h-14 w-full text-base font-semibold" onClick={onKickoff}>
        <Play className="mr-2 size-5" /> Kick off
      </Button>
    </section>
  );
}