/* =========================================================================
   Balance audit
   -------------------------------------------------------------------------
   Measurement only. Nothing here changes gameplay.

   Two things are measured:

   1. League health from ordinary match records (goals, points spread,
      title/relegation lines, upsets). Works on any set of seasons.

   2. Formation attribution under the REAL auto-resolve goal model
      (league.goalsFrom + HOME_ADVANTAGE) with formation effects applied
      exactly as tick/matchday applies them (tacticalStrengthEdge). Every
      fixture is played twice on identical seeds, with and without the
      formation edge, and also scored ANALYTICALLY: because goals are
      Poisson with a known rate, expected points for any fixture can be
      computed exactly. The analytic difference between "with" and
      "without" is a noise-free measure of what formation itself is
      worth, already controlled for team strength and home advantage.

   Raw formation win rates are reported too, but only as context: they are
   confounded by which clubs happen to favour which shapes.
========================================================================= */

import type { MatchTeamPlan } from "./types";
import type { ManagerMatchStyle } from "./managerMatchStyle";
import { neutralMatchStyle } from "./managerMatchStyle";
import { mulberry32, hashString } from "./rng";
import { goalsFrom, HOME_ADVANTAGE } from "./league";
import {
  engineGoalModifiers,
  tacticalMatchModifiers,
  tacticalStrengthEdge,
} from "./formationTactics";
import { MANAGER_FORMATIONS, resolveManagerFormation } from "./managerFormationLayout";

export function goalDistribution(strength: number, oppStrength: number): number[] {
  const lambda = Math.max(0.2, 1.3 + (strength - oppStrength) / 20);
  const pmf: number[] = [];
  let p = Math.exp(-lambda);
  let cum = 0;
  for (let k = 0; k < 8; k += 1) {
    pmf.push(p);
    cum += p;
    p = (p * lambda) / (k + 1);
  }
  pmf.push(Math.max(0, 1 - cum));
  return pmf;
}

export interface OutcomeProbabilities {
  home: number;
  draw: number;
  away: number;
  homePoints: number;
  awayPoints: number;
  goals: number;
}

export function outcomeProbabilities(homeStrength: number, awayStrength: number): OutcomeProbabilities {
  const h = goalDistribution(homeStrength, awayStrength);
  const a = goalDistribution(awayStrength, homeStrength);
  let home = 0;
  let draw = 0;
  let away = 0;
  let goals = 0;
  for (let i = 0; i < h.length; i += 1) {
    for (let j = 0; j < a.length; j += 1) {
      const p = h[i] * a[j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      goals += p * (i + j);
    }
  }
  return { home, draw, away, homePoints: 3 * home + draw, awayPoints: 3 * away + draw, goals };
}

export interface AuditClub {
  id: string;
  strength: number;
  plan: MatchTeamPlan;
}

export type FormationMode =
  | "off"
  | "structure"
  | "execution"
  | "style"
  | "full";

export interface AuditMatch {
  season: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  edge: number;
  expected: OutcomeProbabilities;
  baseline: OutcomeProbabilities;
}

function styleFor(plan: MatchTeamPlan, mode: FormationMode, planStyle: (plan: MatchTeamPlan) => ManagerMatchStyle): ManagerMatchStyle {
  return mode === "full" || mode === "style" ? planStyle(plan) : neutralMatchStyle(resolveManagerFormation(plan.formation));
}

export function fixtureEdge(
  home: AuditClub,
  away: AuditClub,
  mode: FormationMode,
  planStyle: (plan: MatchTeamPlan) => ManagerMatchStyle,
): number {
  if (mode === "off") return 0;
  const execution = (plan: MatchTeamPlan) =>
    mode === "structure" ? { ...plan, shapeExecution: 0.85 } : plan;
  const homeStyle = styleFor(home.plan, mode, planStyle);
  const awayStyle = styleFor(away.plan, mode, planStyle);
  if (mode === "style") return tacticalStrengthEdge(engineGoalModifiers(homeStyle, awayStyle, null));
  const tactical = tacticalMatchModifiers(
    { plan: execution(home.plan), style: homeStyle },
    { plan: execution(away.plan), style: awayStyle },
  );
  return tacticalStrengthEdge(engineGoalModifiers(homeStyle, awayStyle, tactical));
}

export function playAuditSeason(
  clubs: AuditClub[],
  seedKey: string,
  season: number,
  mode: FormationMode,
  planStyle: (plan: MatchTeamPlan) => ManagerMatchStyle,
): AuditMatch[] {
  const matches: AuditMatch[] = [];
  for (const home of clubs) {
    for (const away of clubs) {
      if (home.id === away.id) continue;
      const edge = fixtureEdge(home, away, mode, planStyle);
      const hs = home.strength + HOME_ADVANTAGE;
      const rng = mulberry32(hashString(`audit|${seedKey}|s${season}|${home.id}>${away.id}`));
      const homeGoals = goalsFrom(rng, hs + edge, away.strength);
      const awayGoals = goalsFrom(rng, away.strength, hs + edge);
      matches.push({
        season,
        home: home.id,
        away: away.id,
        homeGoals,
        awayGoals,
        edge,
        expected: outcomeProbabilities(hs + edge, away.strength),
        baseline: outcomeProbabilities(hs, away.strength),
      });
    }
  }
  return matches;
}

export interface LeagueHealth {
  matches: number;
  goalsPerGame: number;
  homeWinRate: number;
  drawRate: number;
  awayWinRate: number;
  titlePoints: { mean: number; min: number; max: number };
  titleMargin: { mean: number; min: number; max: number };
  relegationLine: { mean: number; min: number; max: number };
  pointsSpread: { meanStdDev: number; meanTopToBottom: number };
  upsetRate: number;
  expectedUpsetRate: number;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const stats = (values: number[]) => ({
  mean: round2(mean(values)),
  min: values.length ? Math.min(...values) : 0,
  max: values.length ? Math.max(...values) : 0,
});
const round2 = (value: number) => Math.round(value * 100) / 100;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export interface SeasonTableInput {
  points: number[];
  relegated: number;
}

export function leagueHealth(matches: AuditMatch[], tables: SeasonTableInput[]): LeagueHealth {
  const decided = matches.filter((m) => m.homeGoals !== m.awayGoals);
  const upsets = decided.filter((m) => (m.homeGoals > m.awayGoals ? m.expected.home : m.expected.away) < 0.3);
  const expectedUpsets = matches.reduce(
    (sum, m) => sum + (m.expected.home < 0.3 ? m.expected.home : 0) + (m.expected.away < 0.3 ? m.expected.away : 0),
    0,
  );
  const expectedDecided = matches.reduce((sum, m) => sum + m.expected.home + m.expected.away, 0);
  const sorted = tables.map((table) => [...table.points].sort((a, b) => b - a));
  return {
    matches: matches.length,
    goalsPerGame: round2(mean(matches.map((m) => m.homeGoals + m.awayGoals))),
    homeWinRate: round3(matches.filter((m) => m.homeGoals > m.awayGoals).length / Math.max(1, matches.length)),
    drawRate: round3(matches.filter((m) => m.homeGoals === m.awayGoals).length / Math.max(1, matches.length)),
    awayWinRate: round3(matches.filter((m) => m.homeGoals < m.awayGoals).length / Math.max(1, matches.length)),
    titlePoints: stats(sorted.map((pts) => pts[0])),
    titleMargin: stats(sorted.map((pts) => pts[0] - pts[1])),
    relegationLine: stats(
      tables.filter((t) => t.relegated > 0).map((t) => [...t.points].sort((a, b) => b - a)[t.points.length - t.relegated]),
    ),
    pointsSpread: {
      meanStdDev: round2(mean(sorted.map((pts) => Math.sqrt(mean(pts.map((p) => (p - mean(pts)) ** 2)))))),
      meanTopToBottom: round2(mean(sorted.map((pts) => pts[0] - pts[pts.length - 1]))),
    },
    upsetRate: round3(upsets.length / Math.max(1, decided.length)),
    expectedUpsetRate: round3(expectedUpsets / Math.max(1e-9, expectedDecided)),
  };
}

export function tablePoints(clubs: string[], matches: AuditMatch[]): number[] {
  const points = new Map(clubs.map((club) => [club, 0]));
  for (const m of matches) {
    if (m.homeGoals > m.awayGoals) points.set(m.home, (points.get(m.home) ?? 0) + 3);
    else if (m.homeGoals < m.awayGoals) points.set(m.away, (points.get(m.away) ?? 0) + 3);
    else {
      points.set(m.home, (points.get(m.home) ?? 0) + 1);
      points.set(m.away, (points.get(m.away) ?? 0) + 1);
    }
  }
  return clubs.map((club) => points.get(club) ?? 0);
}

export interface FormationAttribution {
  formation: string;
  clubSeasons: number;
  games: number;
  meanStrength: number;
  wins: number;
  draws: number;
  losses: number;
  rawPpg: number;
  strengthExpectedPpg: number;
  residualPpg: number;
  residualSe: number;
  formationEffectPpg: number;
}

export function formationAttribution(
  matches: AuditMatch[],
  formationOf: (club: string, season: number) => string,
  strengthOf: (club: string, season: number) => number,
): FormationAttribution[] {
  type Row = { games: number; w: number; d: number; l: number; pts: number[]; expected: number[]; effect: number[]; clubSeasons: Set<string>; strength: number[] };
  const rows = new Map<string, Row>();
  const row = (formation: string) => {
    let entry = rows.get(formation);
    if (!entry) {
      entry = { games: 0, w: 0, d: 0, l: 0, pts: [], expected: [], effect: [], clubSeasons: new Set(), strength: [] };
      rows.set(formation, entry);
    }
    return entry;
  };
  for (const m of matches) {
    for (const side of ["home", "away"] as const) {
      const club = side === "home" ? m.home : m.away;
      const f = formationOf(club, m.season);
      const r = row(f);
      const gf = side === "home" ? m.homeGoals : m.awayGoals;
      const ga = side === "home" ? m.awayGoals : m.homeGoals;
      const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
      r.games += 1;
      if (pts === 3) r.w += 1;
      else if (pts === 1) r.d += 1;
      else r.l += 1;
      r.pts.push(pts);
      r.expected.push(side === "home" ? m.baseline.homePoints : m.baseline.awayPoints);
      r.effect.push(
        side === "home" ? m.expected.homePoints - m.baseline.homePoints : m.expected.awayPoints - m.baseline.awayPoints,
      );
      const key = `${club}|${m.season}`;
      if (!r.clubSeasons.has(key)) {
        r.clubSeasons.add(key);
        r.strength.push(strengthOf(club, m.season));
      }
    }
  }
  return [...MANAGER_FORMATIONS].filter((f) => rows.has(f)).map((formation) => {
    const r = rows.get(formation)!;
    const residuals = r.pts.map((p, i) => p - r.expected[i]);
    const residual = mean(residuals);
    const variance = mean(residuals.map((x) => (x - residual) ** 2));
    return {
      formation,
      clubSeasons: r.clubSeasons.size,
      games: r.games,
      meanStrength: round2(mean(r.strength)),
      wins: r.w,
      draws: r.d,
      losses: r.l,
      rawPpg: round3(mean(r.pts)),
      strengthExpectedPpg: round3(mean(r.expected)),
      residualPpg: round3(residual),
      residualSe: round3(Math.sqrt(variance / Math.max(1, r.games))),
      formationEffectPpg: round3(mean(r.effect)),
    };
  });
}

export function formationMatchupMatrix(matches: AuditMatch[], formationOf: (club: string, season: number) => string): Record<string, Record<string, { games: number; effectPpg: number }>> {
  const acc: Record<string, Record<string, { games: number; total: number }>> = {};
  const add = (a: string, b: string, value: number) => {
    acc[a] ??= {};
    acc[a][b] ??= { games: 0, total: 0 };
    acc[a][b].games += 1;
    acc[a][b].total += value;
  };
  for (const m of matches) {
    const fh = formationOf(m.home, m.season);
    const fa = formationOf(m.away, m.season);
    add(fh, fa, m.expected.homePoints - m.baseline.homePoints);
    add(fa, fh, m.expected.awayPoints - m.baseline.awayPoints);
  }
  const out: Record<string, Record<string, { games: number; effectPpg: number }>> = {};
  for (const [a, cols] of Object.entries(acc)) {
    out[a] = {};
    for (const [b, v] of Object.entries(cols)) out[a][b] = { games: v.games, effectPpg: round3(v.total / v.games) };
  }
  return out;
}

export function varianceShare(matches: AuditMatch[]): { strengthVariance: number; formationVariance: number; formationShare: number } {
  const baseline = new Map<string, number>();
  const effect = new Map<string, number>();
  for (const m of matches) {
    const hk = `${m.home}|${m.season}`;
    const ak = `${m.away}|${m.season}`;
    baseline.set(hk, (baseline.get(hk) ?? 0) + m.baseline.homePoints);
    baseline.set(ak, (baseline.get(ak) ?? 0) + m.baseline.awayPoints);
    effect.set(hk, (effect.get(hk) ?? 0) + m.expected.homePoints - m.baseline.homePoints);
    effect.set(ak, (effect.get(ak) ?? 0) + m.expected.awayPoints - m.baseline.awayPoints);
  }
  const variance = (values: number[]) => {
    const mu = mean(values);
    return mean(values.map((v) => (v - mu) ** 2));
  };
  const strengthVariance = variance([...baseline.values()]);
  const formationVariance = variance([...effect.values()]);
  return {
    strengthVariance: round2(strengthVariance),
    formationVariance: round2(formationVariance),
    formationShare: round3(formationVariance / Math.max(1e-9, strengthVariance + formationVariance)),
  };
}
