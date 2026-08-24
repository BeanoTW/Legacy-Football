/* =========================================================================
   Deterministic double round-robin fixture scheduling
   -------------------------------------------------------------------------
   The previous generator emitted every home fixture first (weeks 5-23) and
   every away fixture second (weeks 28-46). This module replaces that with a
   real circle-method schedule plus home/away rebalancing.

   Everything here is a pure function of (teams, seed). No Math.random(),
   no Date.now().
========================================================================= */

import { mulberry32, hashString } from "./rng";

export interface ScheduledMatch {
  round: number; // 1-based league round
  home: string;
  away: string;
}

export interface ClubFixture {
  week: number;
  opponent: string;
  home: boolean;
}

export interface StreakSummary {
  team: string;
  homeMatches: number;
  awayMatches: number;
  longestHomeStreak: number;
  longestAwayStreak: number;
}

/**
 * Circle method ("polygon method") single round-robin.
 * Teams are fixed in a ring with one pivot; rotating the ring produces
 * n-1 rounds where every team meets every other exactly once.
 *
 * Venue orientation alternates per round for the pivot pairing and by
 * ring index parity for the rest, which is the classic canonical
 * orientation that keeps consecutive same-venue runs short.
 */
function circleMethod(teams: string[]): ScheduledMatch[][] {
  const list = [...teams];
  if (list.length % 2 === 1) list.push("__BYE__");
  const n = list.length;
  const rounds: ScheduledMatch[][] = [];

  const ring = list.slice(1); // rotating portion
  const pivot = list[0];

  for (let r = 0; r < n - 1; r++) {
    const matches: ScheduledMatch[] = [];
    // pivot vs the head of the ring; alternate venue each round
    const opp = ring[r % ring.length];
    if (pivot !== "__BYE__" && opp !== "__BYE__") {
      matches.push(
        r % 2 === 0
          ? { round: r + 1, home: pivot, away: opp }
          : { round: r + 1, home: opp, away: pivot },
      );
    }
    for (let i = 1; i < n / 2; i++) {
      const a = ring[(r + i) % ring.length];
      const b = ring[(r - i + ring.length * 2) % ring.length];
      if (a === "__BYE__" || b === "__BYE__") continue;
      matches.push(
        i % 2 === 0 ? { round: r + 1, home: a, away: b } : { round: r + 1, home: b, away: a },
      );
    }
    rounds.push(matches);
  }
  return rounds;
}

function maxStreakPenalty(rounds: ScheduledMatch[][], teams: string[]): number {
  let penalty = 0;
  const last: Record<string, string> = {};
  const run: Record<string, number> = {};
  for (const t of teams) {
    last[t] = "";
    run[t] = 0;
  }
  for (const round of rounds) {
    for (const m of round) {
      for (const [t, venue] of [
        [m.home, "H"],
        [m.away, "A"],
      ] as const) {
        if (last[t] === venue) run[t] += 1;
        else {
          last[t] = venue;
          run[t] = 1;
        }
        if (run[t] > 2) penalty += (run[t] - 2) * 10;
      }
    }
  }
  return penalty;
}

/** Distance between the two legs of each pairing; too-close reverses are penalised. */
function reverseGapPenalty(rounds: ScheduledMatch[][]): number {
  const seen: Record<string, number> = {};
  let penalty = 0;
  rounds.forEach((round, idx) => {
    for (const m of round) {
      const key = [m.home, m.away].sort().join("|");
      if (seen[key] !== undefined) {
        const gap = idx - seen[key];
        if (gap < 6) penalty += (6 - gap) * 5;
      } else seen[key] = idx;
    }
  });
  return penalty;
}

function score(rounds: ScheduledMatch[][], teams: string[]): number {
  return maxStreakPenalty(rounds, teams) + reverseGapPenalty(rounds);
}

/**
 * Full deterministic double round-robin.
 * First leg: circle method. Second leg: same pairings with reversed venues,
 * but the second-leg round ORDER is rotated / hill-climbed rather than
 * appended verbatim, so no club gets a long home or away block.
 */
export function buildSeasonSchedule(teams: string[], seed: string): ScheduledMatch[][] {
  const rng0 = mulberry32(hashString(`ring|${seed}|${teams.join(",")}`));
  // Seeded permutation of the ring order. This both varies the schedule per
  // save seed and removes any positional bias for the user's club, which is
  // always element 0 of the incoming list.
  const ring = [...teams];
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(rng0() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  const first = circleMethod(ring);
  const mirrored = first.map((round) =>
    round.map((m) => ({ round: 0, home: m.away, away: m.home })),
  );

  const rng = mulberry32(hashString(`fixtures|${seed}|${teams.join(",")}`));

  // Candidate seeds: every rotation of the second leg (deterministic set).
  let best: ScheduledMatch[][] | null = null;
  let bestScore = Infinity;
  for (let rot = 0; rot < mirrored.length; rot++) {
    const second = mirrored.slice(rot).concat(mirrored.slice(0, rot));
    const cand = [...first, ...second];
    const sc = score(cand, teams);
    if (sc < bestScore) {
      bestScore = sc;
      best = cand;
    }
  }

  // Seeded hill-climb: swap second-leg rounds to shave remaining streaks.
  let current = best!.map((r) => r.map((m) => ({ ...m })));
  let currentScore = bestScore;
  const half = first.length;
  for (let iter = 0; iter < 4000 && currentScore > 0; iter++) {
    const a = half + Math.floor(rng() * half);
    const b = half + Math.floor(rng() * half);
    if (a === b) continue;
    const trial = current.slice();
    [trial[a], trial[b]] = [trial[b], trial[a]];
    const sc = score(trial, teams);
    if (sc <= currentScore) {
      current = trial;
      currentScore = sc;
    }
  }

  // Renumber rounds sequentially.
  return current.map((round, idx) => round.map((m) => ({ ...m, round: idx + 1 })));
}

/** Extract one club's fixtures, mapped onto calendar weeks. */
export function clubFixtures(
  schedule: ScheduledMatch[][],
  club: string,
  weekForRound: (round: number) => number,
): ClubFixture[] {
  const out: ClubFixture[] = [];
  schedule.forEach((round, idx) => {
    for (const m of round) {
      if (m.home === club) out.push({ week: weekForRound(idx + 1), opponent: m.away, home: true });
      else if (m.away === club)
        out.push({ week: weekForRound(idx + 1), opponent: m.home, home: false });
    }
  });
  return out.sort((a, b) => a.week - b.week);
}

/** Diagnostics: home/away totals and longest streaks per club. */
export function scheduleDiagnostics(
  schedule: ScheduledMatch[][],
  teams: string[],
): StreakSummary[] {
  return teams.map((team) => {
    const venues: string[] = [];
    for (const round of schedule) {
      for (const m of round) {
        if (m.home === team) venues.push("H");
        else if (m.away === team) venues.push("A");
      }
    }
    let lh = 0,
      la = 0,
      run = 0,
      prev = "";
    for (const v of venues) {
      run = v === prev ? run + 1 : 1;
      prev = v;
      if (v === "H") lh = Math.max(lh, run);
      else la = Math.max(la, run);
    }
    return {
      team,
      homeMatches: venues.filter((v) => v === "H").length,
      awayMatches: venues.filter((v) => v === "A").length,
      longestHomeStreak: lh,
      longestAwayStreak: la,
    };
  });
}
