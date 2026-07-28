/* =========================================================================
   Board of Directors
   -------------------------------------------------------------------------
   The board is the central strategic pressure system. It is NOT a single
   approval bar and NOT one generic chairman character. It is a group of
   directors, each with:

     - a portfolio (the priorities they actually care about)
     - a personality (traits that change how they read the same facts)
     - their own confidence in the chairman
     - an influence share in the boardroom

   Everything here is deterministic and pure with respect to GameState:
   directors are generated from saveSeed, objectives are derived from the
   club's own pre-season projection, and confidence only moves inside
   `runBoardReview`, which is called exactly once per review window by the
   engine. Inbox generators only READ board state, never mutate it.
========================================================================= */

import type {
  BoardObjective,
  BoardPriority,
  BoardReview,
  BoardState,
  Director,
  DirectorRole,
  DirectorTrait,
  GameState,
  ObjectiveProgress,
} from "./types";
import { seededRng, rngInt } from "./rng";
import { clubPrediction, EXPECTATION_LABEL } from "./reputation";
import { playerLeagueId } from "./league";

/* ---------- Calendar anchors (kept local to avoid an engine import) ---------- */
export const MID_SEASON_REVIEW_WEEK = 24;
export const END_SEASON_REVIEW_WEEK = 46;

/* ---------- Roles ---------- */

export const DIRECTOR_ROLES: DirectorRole[] = [
  "Chairman",
  "Finance Director",
  "Football Director",
  "Commercial Director",
  "Supporters' Director",
];

const ZERO: Record<BoardPriority, number> = {
  results: 0, finance: 0, fans: 0, facilities: 0, squad: 0, commercial: 0,
};

const ROLE_PRIORITIES: Record<DirectorRole, Record<BoardPriority, number>> = {
  "Chairman":              { ...ZERO, results: 30, finance: 25, fans: 15, facilities: 10, squad: 10, commercial: 10 },
  "Finance Director":      { ...ZERO, finance: 55, commercial: 20, squad: 10, results: 10, facilities: 5 },
  "Football Director":     { ...ZERO, results: 45, squad: 30, facilities: 10, finance: 10, fans: 5 },
  "Commercial Director":   { ...ZERO, commercial: 40, facilities: 20, fans: 15, results: 15, finance: 10 },
  "Supporters' Director":  { ...ZERO, fans: 50, results: 20, facilities: 15, commercial: 5, squad: 10 },
};

const ROLE_INFLUENCE: Record<DirectorRole, [number, number]> = {
  "Chairman": [30, 38],
  "Finance Director": [18, 24],
  "Football Director": [16, 22],
  "Commercial Director": [10, 16],
  "Supporters' Director": [8, 14],
};

/* ---------- Traits ---------- */

const TRAIT_POOL: DirectorTrait[] = [
  "patient", "ruthless", "ambitious", "frugal",
  "pragmatic", "loyal", "populist", "traditionalist",
];

export const TRAIT_LABEL: Record<DirectorTrait, string> = {
  patient: "Patient",
  ruthless: "Ruthless",
  ambitious: "Ambitious",
  frugal: "Frugal",
  pragmatic: "Pragmatic",
  loyal: "Loyal",
  populist: "Populist",
  traditionalist: "Traditionalist",
};

export const TRAIT_DESC: Record<DirectorTrait, string> = {
  patient: "Gives plans time to work. Confidence moves slowly in both directions.",
  ruthless: "Judges on outcomes alone. Confidence swings hard, especially downward.",
  ambitious: "Wants more than the projection says is realistic. Raises targets.",
  frugal: "Treats the balance sheet as the scoreboard. Hates unfunded spending.",
  pragmatic: "Rewards visible progress even when the target is missed.",
  loyal: "Will not abandon a chairman quickly. Holds a confidence floor.",
  populist: "Reads the terraces first. Fan feeling carries extra weight.",
  traditionalist: "Cares about the ground, the pitch and continuity.",
};

/** How a trait bends this director's priority weights. */
const TRAIT_PRIORITY_MOD: Partial<Record<DirectorTrait, Partial<Record<BoardPriority, number>>>> = {
  frugal:         { finance: 20, commercial: 5 },
  populist:       { fans: 20, results: 5 },
  traditionalist: { facilities: 18, fans: 5 },
  ambitious:      { results: 15, squad: 8 },
};

const hasTrait = (d: Director, t: DirectorTrait) => d.traits.includes(t);

/** Confidence swing multiplier from personality. */
export function reactivity(d: Director): number {
  let m = 1;
  if (hasTrait(d, "ruthless")) m *= 1.6;
  if (hasTrait(d, "patient")) m *= 0.6;
  if (hasTrait(d, "loyal")) m *= 0.85;
  m *= 1 + (50 - d.patience) / 200;
  return Math.max(0.35, Math.min(2.2, m));
}

/** Lowest confidence a director will fall to. */
export function confidenceFloor(d: Director): number {
  if (hasTrait(d, "loyal")) return 22;
  if (hasTrait(d, "ruthless")) return 0;
  return 8;
}

/* ---------- Director generation ---------- */

const FIRST_NAMES = [
  "Alan", "Margaret", "Douglas", "Priya", "Ronald", "Eileen", "Malcolm", "Yvonne",
  "Gerald", "Hazel", "Stuart", "Nadia", "Clive", "Rosalind", "Fraser", "Bernice",
  "Duncan", "Marion", "Nigel", "Cathy", "Rupert", "Sandra", "Iain", "Deborah",
];
const LAST_NAMES = [
  "Roberts", "Whitcombe", "Kearney", "Ballantyne", "Okoro", "Fairbairn", "Naismith",
  "Ashworth", "Tulloch", "Rennie", "Hollis", "Craddock", "Sandhu", "Marchetti",
  "Purcell", "Lindsay", "Beaumont", "Gallacher", "Ferris", "Docherty",
];

function nameFor(rng: () => number, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const n = `${FIRST_NAMES[rngInt(rng, 0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[rngInt(rng, 0, LAST_NAMES.length - 1)]}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  const fallback = `Director ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function bioFor(role: DirectorRole, traits: DirectorTrait[]): string {
  const t = traits[0];
  const base: Record<DirectorRole, string> = {
    "Chairman": "Chairs the board and carries the casting vote on strategy.",
    "Finance Director": "Owns the balance sheet, wage ratio and cash position.",
    "Football Director": "Answers for results, the squad and the football department.",
    "Commercial Director": "Drives sponsorship, matchday revenue and the club's market value.",
    "Supporters' Director": "Elected by the supporters' trust to speak for the terraces.",
  };
  return `${base[role]} ${TRAIT_DESC[t]}`;
}

export function makeDirectors(saveSeed: string, clubName: string): Director[] {
  const used = new Set<string>();
  return DIRECTOR_ROLES.map((role, i) => {
    const rng = seededRng(saveSeed, "board-director", clubName, role, i);
    const traits: DirectorTrait[] = [];
    while (traits.length < 2) {
      const t = TRAIT_POOL[rngInt(rng, 0, TRAIT_POOL.length - 1)];
      if (t === "patient" && traits.includes("ruthless")) continue;
      if (t === "ruthless" && traits.includes("patient")) continue;
      if (!traits.includes(t)) traits.push(t);
    }

    const priorities = { ...ROLE_PRIORITIES[role] };
    for (const t of traits) {
      const mod = TRAIT_PRIORITY_MOD[t];
      if (!mod) continue;
      for (const [k, v] of Object.entries(mod)) {
        priorities[k as BoardPriority] += v;
      }
    }

    const [lo, hi] = ROLE_INFLUENCE[role];
    const patience = traits.includes("patient")
      ? rngInt(rng, 62, 88)
      : traits.includes("ruthless")
      ? rngInt(rng, 12, 38)
      : rngInt(rng, 35, 70);

    const d: Director = {
      id: `dir-${role.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      name: nameFor(rng, used),
      role,
      age: rngInt(rng, 44, 71),
      traits,
      priorities,
      influence: rngInt(rng, lo, hi),
      confidence: rngInt(rng, 58, 70),
      patience,
      bio: "",
    };
    d.bio = bioFor(role, traits);
    return d;
  });
}

/* ---------- Derived club measurements ---------- */

export function avgStandCondition(s: GameState): number {
  const st = s.stands ?? [];
  if (!st.length) return 0;
  return st.reduce((a, b) => a + b.condition, 0) / st.length;
}

export function squadAverageRating(s: GameState): number {
  const sq = s.squad ?? [];
  if (!sq.length) return 0;
  return sq.reduce((a, p) => a + p.rating, 0) / sq.length;
}

/** Total weekly wage bill (players + staff, contracted and structural). */
export function weeklyWageBill(s: GameState): number {
  const players = (s.squad ?? []).reduce((a, p) => a + p.wage, 0);
  const staff = (s.hiredStaff ?? []).reduce((a, x) => a + x.wage, 0);
  return players + staff + (s.staffWagesWeekly ?? 0);
}

/** Recurring weekly income used as the wage-ratio denominator. */
export function weeklyIncomeEstimate(s: GameState): number {
  const recent = (s.ledger ?? []).filter((l) => !l.synthetic).slice(-6);
  if (recent.length) {
    const total = recent.reduce(
      (a, l) => a + Object.values(l.income).reduce((x, y) => x + y, 0),
      0,
    );
    return total / recent.length;
  }
  // No banked weeks yet (fresh save): project the recurring streams instead of
  // guessing, otherwise the wage ratio reads as several hundred percent in
  // pre-season and every director opens the season furious about nothing.
  const sponsor = (s.sponsors ?? []).reduce((a, x) => a + (x.weeksLeft > 0 ? x.weekly : 0), 0);
  const merchandise = 400 + (s.reputation ?? 50) * 90 + (s.fanHappiness ?? 60) * 30;
  const capacity = (s.stands ?? []).reduce((a, b) => a + b.capacity, 0);
  const avgPrice = capacity
    ? (s.stands ?? []).reduce((a, b) => a + b.ticketPrice * b.capacity, 0) / capacity
    : 0;
  // 19 home league games spread across a 46-week season, ~65% occupancy.
  const matchday = avgPrice * capacity * 0.65 * (19 / 46);
  return Math.max(1, sponsor + merchandise + matchday);
}

/** Wage bill as a percentage of recurring income. Lower is healthier. */
export function wageRatio(s: GameState): number {
  return (weeklyWageBill(s) / Math.max(1, weeklyIncomeEstimate(s))) * 100;
}

/** Current league position of the user's club (1 = top). */
export function currentPosition(s: GameState): number {
  const table = s.league ?? [];
  const idx = table.findIndex((r) => r.team === s.clubName);
  return idx >= 0 ? idx + 1 : table.length || 20;
}

/* ---------- Objectives ---------- */

const OBJ_META: Record<
  BoardObjective["kind"],
  { priority: BoardPriority; ownerRole: DirectorRole; higherIsBetter: boolean }
> = {
  leaguePosition:   { priority: "results",    ownerRole: "Football Director",    higherIsBetter: false },
  cashReserve:      { priority: "finance",    ownerRole: "Finance Director",     higherIsBetter: true  },
  wageControl:      { priority: "finance",    ownerRole: "Finance Director",     higherIsBetter: false },
  fanHappiness:     { priority: "fans",       ownerRole: "Supporters' Director", higherIsBetter: true  },
  stadiumCondition: { priority: "facilities", ownerRole: "Commercial Director",  higherIsBetter: true  },
  squadRating:      { priority: "squad",      ownerRole: "Football Director",    higherIsBetter: true  },
  commercialIncome: { priority: "commercial", ownerRole: "Commercial Director",  higherIsBetter: true  },

};

/** Does the board contain an ambitious voice? Ambition tightens targets. */
function ambitionBias(board: BoardState): number {
  const amb = board.directors.filter((d) => d.traits.includes("ambitious")).length;
  return amb;
}

/**
 * Season objectives, derived from the club's own pre-season projection so
 * they are always achievable-but-demanding rather than arbitrary.
 */
export function makeObjectives(s: GameState, season: number, board: BoardState): BoardObjective[] {
  const pred = clubPrediction(s, s.clubName, season);
  const league = (s.leagues ?? []).find((l) => l.id === playerLeagueId(s));
  const size = league?.clubIds.length ?? 20;
  const predictedRank = pred?.rank ?? Math.ceil(size / 2);
  const expectation = pred?.expectation ?? "midTable";
  const amb = ambitionBias(board);

  // Target is the projection, tightened by boardroom ambition, floored at 1.
  const positionTarget = Math.max(1, Math.min(size, predictedRank - amb));

  const cashNow = s.cash ?? 0;
  const burn = Math.max(1, weeklyWageBill(s));
  const cashTarget = Math.round(Math.max(cashNow * 0.75, burn * 8) / 50_000) * 50_000;

  const wageTarget = 70 - amb * 3;
  const fanTarget = Math.min(90, Math.max(55, Math.round((s.fanHappiness ?? 60) + 4)));
  const conditionTarget = Math.min(95, Math.max(70, Math.round(avgStandCondition(s))));
  const squadTarget = Math.min(90, Math.round(squadAverageRating(s) + 1));

  const mk = (
    kind: BoardObjective["kind"],
    label: string,
    description: string,
    target: number,
    weight: number,
  ): BoardObjective => ({
    id: `obj-s${season}-${kind}`,
    season,
    kind,
    priority: OBJ_META[kind].priority,
    ownerRole: OBJ_META[kind].ownerRole,
    label,
    description,
    target,
    weight,
    status: "active",
  });

  return [
    mk(
      "leaguePosition",
      `Finish ${positionTarget}${ordinal(positionTarget)} or better`,
      `The board's projection has us ${predictedRank}${ordinal(predictedRank)} — "${EXPECTATION_LABEL[expectation]}". ` +
        `They want ${positionTarget}${ordinal(positionTarget)} or better by the final week.`,
      positionTarget,
      35,
    ),
    mk(
      "cashReserve",
      `Hold £${(cashTarget / 1000).toFixed(0)}k in reserve`,
      "The club has no overdraft facility. The finance director wants a working cash buffer at all times.",
      cashTarget,
      22,
    ),
    mk(
      "wageControl",
      `Keep wages under ${wageTarget}% of income`,
      "Total player and staff wages measured against recurring weekly income.",
      wageTarget,
      15,
    ),
    mk(
      "fanHappiness",
      `Fan happiness at ${fanTarget}+`,
      "The supporters' director judges the season on the mood of the terraces, not the table.",
      fanTarget,
      14,
    ),
    mk(
      "stadiumCondition",
      `Average stand condition ${conditionTarget}+`,
      "Keeping the ground in a saleable, safe state protects matchday and commercial income.",
      conditionTarget,
      8,
    ),
    mk(
      "squadRating",
      `Squad average rating ${squadTarget}+`,
      "The football director expects the playing squad to be no weaker at the end of the season than the start.",
      squadTarget,
      6,
    ),
  ];
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
export { ordinal as ordinalSuffix };

/* ---------- Objective evaluation ---------- */

function ratioProgress(current: number, target: number, higherIsBetter: boolean): number {
  if (higherIsBetter) {
    if (target <= 0) return 1;
    return clamp01(current / target);
  }
  if (current <= target) return 1;
  // Falling short: decay smoothly rather than snapping to zero.
  return clamp01(1 - (current - target) / Math.max(1, target));
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function evaluateObjective(s: GameState, o: BoardObjective): ObjectiveProgress {
  const meta = OBJ_META[o.kind];
  let current = 0;
  let detail = "";
  let progress = 0;

  switch (o.kind) {
    case "leaguePosition": {
      const size = (s.league ?? []).length || 20;
      current = currentPosition(s);
      detail = `Currently ${current}${ordinal(current)} of ${size}`;
      // Position progress: at or better than target = 1, last place = 0.
      progress = current <= o.target
        ? 1
        : clamp01(1 - (current - o.target) / Math.max(1, size - o.target));
      break;
    }
    case "cashReserve": {
      current = s.cash ?? 0;
      detail = `£${Math.round(current).toLocaleString()} in the bank`;
      progress = ratioProgress(current, o.target, true);
      break;
    }
    case "wageControl": {
      current = wageRatio(s);
      detail = `Wages at ${current.toFixed(0)}% of income`;
      progress = ratioProgress(current, o.target, false);
      break;
    }
    case "fanHappiness": {
      current = s.fanHappiness ?? 0;
      detail = `Fan happiness ${Math.round(current)}`;
      progress = ratioProgress(current, o.target, true);
      break;
    }
    case "stadiumCondition": {
      current = avgStandCondition(s);
      detail = `Average condition ${current.toFixed(0)}%`;
      progress = ratioProgress(current, o.target, true);
      break;
    }
    case "squadRating": {
      current = squadAverageRating(s);
      detail = `Squad average ${current.toFixed(1)}`;
      progress = ratioProgress(current, o.target, true);
      break;
    }
  }

  return {
    objectiveId: o.id,
    current,
    target: o.target,
    progress,
    onTrack: meta.higherIsBetter ? current >= o.target : current <= o.target,
    detail,
  };
}

export function evaluateObjectives(s: GameState): ObjectiveProgress[] {
  return (s.board?.objectives ?? []).map((o) => evaluateObjective(s, o));
}

/* ---------- Director opinion ---------- */

/**
 * How satisfied one director is right now, 0-100. Each director reads the
 * SAME objective set through their own priority weights, so the finance
 * director and the supporters' director genuinely disagree.
 */
export function directorSatisfaction(s: GameState, d: Director): number {
  const objectives = s.board?.objectives ?? [];
  if (!objectives.length) return d.confidence;
  let weighted = 0;
  let total = 0;
  for (const o of objectives) {
    const w = (d.priorities[o.priority] ?? 0) + o.weight * 0.15;
    if (w <= 0) continue;
    let p = evaluateObjective(s, o).progress;
    // Pragmatists give credit for near-misses; ruthless directors do not.
    if (hasTrait(d, "pragmatic")) p = Math.min(1, p * 1.15);
    if (hasTrait(d, "ruthless")) p = p < 0.85 ? p * 0.85 : p;
    weighted += p * w;
    total += w;
  }
  if (total <= 0) return d.confidence;
  return Math.round((weighted / total) * 100);
}

/** The single priority a director is currently least happy about. */
export function directorConcern(s: GameState, d: Director): { objective: BoardObjective; progress: ObjectiveProgress } | null {
  const objectives = s.board?.objectives ?? [];
  let worst: { objective: BoardObjective; progress: ObjectiveProgress; score: number } | null = null;
  for (const o of objectives) {
    const w = d.priorities[o.priority] ?? 0;
    if (w <= 0) continue;
    const p = evaluateObjective(s, o);
    const score = (1 - p.progress) * w;
    if (!worst || score > worst.score) worst = { objective: o, progress: p, score };
  }
  if (!worst || worst.score <= 0) return null;
  return { objective: worst.objective, progress: worst.progress };
}

/* ---------- Board confidence ---------- */

export function recomputeConfidence(board: BoardState): number {
  const ds = board.directors ?? [];
  if (!ds.length) return 50;
  const total = ds.reduce((a, d) => a + d.influence, 0) || 1;
  return Math.round(ds.reduce((a, d) => a + d.confidence * d.influence, 0) / total);
}

export type ConfidenceBand = "secure" | "stable" | "watchful" | "strained" | "critical";

export function confidenceBand(c: number): ConfidenceBand {
  if (c >= 80) return "secure";
  if (c >= 62) return "stable";
  if (c >= 45) return "watchful";
  if (c >= 28) return "strained";
  return "critical";
}

export const BAND_LABEL: Record<ConfidenceBand, string> = {
  secure: "Fully behind you",
  stable: "Supportive",
  watchful: "Watching closely",
  strained: "Losing patience",
  critical: "Position untenable",
};

export const BAND_CLASS: Record<ConfidenceBand, string> = {
  secure: "text-emerald-600",
  stable: "text-teal-600",
  watchful: "text-amber-600",
  strained: "text-orange-600",
  critical: "text-rose-600",
};

/* ---------- Reviews ---------- */

export const hasReview = (s: GameState, season: number, type: BoardReview["type"]) =>
  (s.board?.reviews ?? []).some((r) => r.season === season && r.type === type);

function verdictFor(type: BoardReview["type"], after: number, delta: number): string {
  const band = confidenceBand(after);
  if (type === "midSeason") {
    if (band === "secure") return "The board is delighted with the direction of the club.";
    if (band === "stable") return "The board is content and sees no reason to intervene.";
    if (band === "watchful") return "The board wants visible improvement in the second half of the season.";
    if (band === "strained") return "The board has issued a formal warning about the club's direction.";
    return "The board has placed the chairman's position under formal review.";
  }
  if (band === "secure") return "A season the board regards as an unqualified success.";
  if (band === "stable") return "The board considers the season a solid, if unspectacular, return.";
  if (band === "watchful") return delta < 0
    ? "The board judges the season a step backwards and expects a response."
    : "The board accepts the season but expects more next year.";
  if (band === "strained") return "The board regards this season as a serious failure of stewardship.";
  return "The board has recorded a vote of no confidence in the chairman.";
}

/**
 * Run one review. MUTATES the passed state — call it once per review window
 * from the engine only, guarded by `hasReview`.
 */
export function runBoardReview(
  s: GameState,
  type: BoardReview["type"],
): BoardReview {
  const board = s.board;
  const before = recomputeConfidence(board);
  const lines: string[] = [];
  const directorConfidence: Record<string, number> = {};

  // End-of-season reviews are final judgements; mid-season is a checkpoint,
  // so it moves confidence less than half as far.
  const severity = type === "endSeason" ? 1 : 0.42;

  for (const d of board.directors) {
    const satisfaction = directorSatisfaction(s, d);
    const gap = satisfaction - d.confidence;
    const move = gap * 0.55 * reactivity(d) * severity;
    const next = Math.round(
      Math.max(confidenceFloor(d), Math.min(100, d.confidence + move)),
    );
    d.confidence = next;
    directorConfidence[d.id] = next;

    const concern = directorConcern(s, d);
    if (concern && concern.progress.progress < 0.9) {
      lines.push(
        `${d.name} (${d.role}) — ${concern.objective.label}: ${concern.progress.detail}.`,
      );
    } else {
      lines.push(`${d.name} (${d.role}) — satisfied across their portfolio.`);
    }
  }

  const outcomes = board.objectives.map((o) => {
    const p = evaluateObjective(s, o);
    const met = p.onTrack;
    if (type === "endSeason") o.status = met ? "met" : "missed";
    return { objectiveId: o.id, label: o.label, progress: p.progress, met };
  });

  const after = recomputeConfidence(board);
  board.confidence = after;

  const review: BoardReview = {
    id: `review-s${s.season}-${type}`,
    season: s.season,
    week: s.week,
    type,
    confidenceBefore: before,
    confidenceAfter: after,
    verdict: verdictFor(type, after, after - before),
    lines,
    directorConfidence,
    outcomes,
  };
  board.reviews = [...(board.reviews ?? []).filter((r) => r.id !== review.id), review];
  return review;
}

/* ---------- Lifecycle ---------- */

export function makeBoard(saveSeed: string, clubName: string): BoardState {
  const directors = makeDirectors(saveSeed, clubName);
  const board: BoardState = {
    directors,
    objectives: [],
    objectivesSeason: 0,
    reviews: [],
    confidence: 0,
  };
  board.confidence = recomputeConfidence(board);
  return board;
}

/** Ensure the board exists and holds objectives for the current season. */
export function ensureBoard(s: GameState): void {
  if (!s.board || !Array.isArray(s.board.directors) || s.board.directors.length === 0) {
    s.board = makeBoard(s.saveSeed ?? `${s.clubName}|board`, s.clubName);
  }
  if (!Array.isArray(s.board.objectives)) s.board.objectives = [];
  if (!Array.isArray(s.board.reviews)) s.board.reviews = [];
  if (s.board.objectivesSeason !== s.season || s.board.objectives.length === 0) {
    s.board.objectives = makeObjectives(s, s.season, s.board);
    s.board.objectivesSeason = s.season;
  }
  s.board.confidence = recomputeConfidence(s.board);
}

/**
 * Called by the engine each week AFTER the clock has advanced. Runs the
 * mid-season checkpoint exactly once per season.
 */
export function maybeRunMidSeasonReview(s: GameState): BoardReview | null {
  ensureBoard(s);
  if (s.week < MID_SEASON_REVIEW_WEEK) return null;
  if (hasReview(s, s.season, "midSeason")) return null;
  return runBoardReview(s, "midSeason");
}

/** Called at season rollover, BEFORE the season counter is incremented. */
export function runEndOfSeasonReview(s: GameState): BoardReview | null {
  ensureBoard(s);
  if (hasReview(s, s.season, "endSeason")) return null;
  return runBoardReview(s, "endSeason");
}

/** Called after the season counter has incremented. */
export function rollBoardToNewSeason(s: GameState): void {
  if (!s.board) return;
  s.board.objectives = makeObjectives(s, s.season, s.board);
  s.board.objectivesSeason = s.season;
  s.board.confidence = recomputeConfidence(s.board);
}
