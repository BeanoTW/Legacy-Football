/* Season & formation balance audit.
   Run with:   bun src/lib/game/__checks__/season-balance.check.ts
   Options:    --seasons=N (default 3)  --seeds=N (default 2)  --report (full tables)

   Measurement only: this check changes no gameplay. It fails only on
   genuine systemic problems, never on raw formation win rates (which are
   confounded by which clubs favour which shapes).

   Layer A  The game as it plays today. Real seasons through advanceWeek.
            League health from every match record, each fixture scored
            against the exact expected-points model at the moment it was
            played. Formation currently affects only the user's fixtures.

   Layer B  The AI-vs-AI preview. The real world at the start of each
            audited season (real clubs, strengths, AI managers, squads and
            shape execution) replayed through the real goal model in every
            formation mode on identical dice. The exact with/without
            difference isolates what formation is worth, strength already
            accounted for. This is the baseline for extending formations to
            AI-vs-AI fixtures. */
import { strict as assert } from "node:assert";
import { newGame, advanceWeek } from "../engine";
import type { GameState } from "../types";
import { clubMatchStrength } from "../matchStrength";
import { HOME_ADVANTAGE } from "../league";
import { aiClubManagerSetup } from "../aiClubManager";
import { opponentMatchPlan } from "../matchEngine";
import { managerMatchPrep } from "../managerMatchPrep";
import { planMatchStyle } from "../formationTactics";
import { isUserClubReference } from "../clubReference";
import {
  formationAttribution,
  formationMatchupMatrix,
  leagueHealth,
  outcomeProbabilities,
  playAuditSeason,
  tablePoints,
  varianceShare,
  type AuditClub,
  type AuditMatch,
  type FormationMode,
  type SeasonTableInput,
} from "../balanceAudit";

const arg = (name: string, fallback: number) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? Math.max(1, Number(found.split("=")[1]) || fallback) : fallback;
};
const SEASONS = arg("seasons", 3);
const SEEDS = Array.from({ length: arg("seeds", 2) }, (_, i) => `BALANCE|AUDIT|${i + 1}`);
const REPORT = process.argv.includes("--report");
const WEEKS = 46;

const LIMITS = {
  goalsPerGame: [2.0, 3.4] as const,
  drawRate: [0.17, 0.33] as const,
  upsetDrift: 0.035,
  formationEffectPpg: 0.04,
  matchupEffectPpg: 0.08,
  formationVarianceShare: 0.05,
  goalsShift: 0.15,
  spreadShift: 1.5,
  titleShift: 3,
};

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;

interface SeasonStart {
  seed: string;
  season: number;
  state: GameState;
}

const layerA: AuditMatch[] = [];
const layerAUser: AuditMatch[] = [];
const layerATables: SeasonTableInput[] = [];
const formationAt = new Map<string, string>();
const strengthAt = new Map<string, number>();
const starts: SeasonStart[] = [];

function formationOfClub(state: GameState, club: string): string {
  return isUserClubReference(state, club) ? managerMatchPrep(state).selectedFormation : aiClubManagerSetup(state, club).formation;
}

for (const seed of SEEDS) {
  let state = newGame("Balance Town", "A. Auditor", seed);
  const seen = new Set<string>();
  for (let week = 0; week < WEEKS * SEASONS; week += 1) {
    if (state.week === 1 && !starts.some((s) => s.seed === seed && s.season === state.season)) {
      starts.push({ seed, season: state.season, state: structuredClone(state) });
    }
    const before = state;
    state = advanceWeek(state);
    for (const record of state.matchRecords ?? []) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      const key = (club: string) => `${seed}|${club}|${record.season}`;
      for (const club of [record.home, record.away]) {
        if (!formationAt.has(key(club))) formationAt.set(key(club), formationOfClub(before, club));
        if (!strengthAt.has(key(club))) strengthAt.set(key(club), clubMatchStrength(before, club, record.season));
      }
      const hs = strengthAt.get(key(record.home))! + HOME_ADVANTAGE;
      const as = strengthAt.get(key(record.away))!;
      const baseline = outcomeProbabilities(hs, as);
      const match: AuditMatch = {
        season: record.season,
        home: `${seed}|${record.home}`,
        away: `${seed}|${record.away}`,
        homeGoals: record.homeGoals,
        awayGoals: record.awayGoals,
        edge: 0,
        expected: baseline,
        baseline,
      };
      (record.userInvolved ? layerAUser : layerA).push(match);
    }
  }
  for (const entry of state.seasonHistory ?? []) {
    layerATables.push({ points: entry.finalTable.map((row) => row.pts), relegated: entry.relegated.length });
  }
}

const aFormation = (club: string, season: number) => formationAt.get(`${club}|${season}`) ?? "4-4-2";
const aStrength = (club: string, season: number) => strengthAt.get(`${club}|${season}`) ?? 0;

console.log(`\nSeason balance audit · ${SEEDS.length} save(s) × ${SEASONS} season(s)`);
console.log("\n[A] League health as the game plays today");
const health = leagueHealth(layerA, layerATables);
console.log(
  `    ${health.matches} AI fixtures · goals/game ${health.goalsPerGame} · H/D/A ${health.homeWinRate}/${health.drawRate}/${health.awayWinRate}\n` +
    `    title ${health.titlePoints.mean} pts (margin ${health.titleMargin.mean}) · relegation line ${health.relegationLine.mean} · points sd ${health.pointsSpread.meanStdDev}\n` +
    `    upsets ${health.upsetRate} (model expects ${health.expectedUpsetRate})`,
);
check("goals per game in a realistic range", () => {
  assert.ok(health.goalsPerGame >= LIMITS.goalsPerGame[0] && health.goalsPerGame <= LIMITS.goalsPerGame[1], String(health.goalsPerGame));
});
check("draw rate in a realistic range", () => {
  assert.ok(health.drawRate >= LIMITS.drawRate[0] && health.drawRate <= LIMITS.drawRate[1], String(health.drawRate));
});
check("home advantage exists", () => assert.ok(health.homeWinRate > health.awayWinRate));
check("upset rate matches the strength model", () => {
  assert.ok(Math.abs(health.upsetRate - health.expectedUpsetRate) <= LIMITS.upsetDrift, `${health.upsetRate} vs ${health.expectedUpsetRate}`);
});
check("title and relegation lines are ordered", () => {
  if (health.relegationLine.mean > 0) assert.ok(health.titlePoints.mean > health.relegationLine.mean + 10);
});

if (REPORT) {
  console.log("\n    Raw formation records (CONFOUNDED by club strength: context only)");
  console.log("    shape      club-seasons  mean str   raw ppg   strength-expected   residual ± se");
  for (const row of formationAttribution(layerA, aFormation, aStrength)) {
    console.log(
      `    ${row.formation.padEnd(9)}  ${String(row.clubSeasons).padStart(6)}      ${row.meanStrength.toFixed(1).padStart(5)}    ${row.rawPpg.toFixed(3)}    ${row.strengthExpectedPpg.toFixed(3)}              ${signed(row.residualPpg)} ± ${row.residualSe.toFixed(3)}`,
    );
  }
  console.log(`    user fixtures audited: ${layerAUser.length}`);
}

console.log("\n[B] Formation attribution on the real world (AI-vs-AI preview)");
interface LeagueSeason {
  key: string;
  season: number;
  clubs: AuditClub[];
  relegated: number;
}
const leagueSeasons: LeagueSeason[] = [];
for (const start of starts) {
  for (const league of start.state.leagues ?? []) {
    const clubs = league.clubIds
      .filter((club) => !isUserClubReference(start.state, club))
      .map((club) => ({
        id: `${start.seed}|${club}`,
        strength: clubMatchStrength(start.state, club, start.season),
        plan: opponentMatchPlan(start.state, club),
      }));
    if (clubs.length >= 8) {
      leagueSeasons.push({ key: `${start.seed}|${league.id}`, season: start.season, clubs, relegated: 3 });
    }
  }
}
const bLookup = new Map(leagueSeasons.flatMap((ls) => ls.clubs.map((club) => [`${club.id}|${ls.season}`, club])));
const bFormation = (club: string, season: number) => bLookup.get(`${club}|${season}`)?.plan.formation ?? "4-4-2";
const bStrength = (club: string, season: number) => bLookup.get(`${club}|${season}`)?.strength ?? 0;

const runMode = (mode: FormationMode) => {
  const matches: AuditMatch[] = [];
  const tables: SeasonTableInput[] = [];
  for (const ls of leagueSeasons) {
    const played = playAuditSeason(ls.clubs, ls.key, ls.season, mode, planMatchStyle);
    matches.push(...played);
    tables.push({ points: tablePoints(ls.clubs.map((club) => club.id), played), relegated: ls.relegated });
  }
  return { matches, tables, health: leagueHealth(matches, tables) };
};

const MODES: FormationMode[] = ["off", "structure", "execution", "style", "full"];
const results = Object.fromEntries(MODES.map((mode) => [mode, runMode(mode)])) as Record<FormationMode, ReturnType<typeof runMode>>;
const clubCount = leagueSeasons.reduce((sum, ls) => sum + ls.clubs.length, 0);
console.log(`    ${leagueSeasons.length} league-seasons · ${clubCount} club-seasons · ${results.off.matches.length} fixtures per mode`);

for (const mode of MODES) {
  const { health: h, matches } = results[mode];
  const share = varianceShare(matches).formationShare;
  console.log(
    `    ${mode.padEnd(9)} goals ${h.goalsPerGame} · title ${h.titlePoints.mean} · relegation ${h.relegationLine.mean} · points sd ${h.pointsSpread.meanStdDev} · formation share ${(share * 100).toFixed(2)}%`,
  );
}

check("replaying a mode is deterministic", () => {
  assert.deepEqual(runMode("full").matches, results.full.matches);
});
check("mode 'off' carries no formation effect", () => {
  assert.ok(results.off.matches.every((m) => m.edge === 0));
});

for (const mode of ["structure", "execution", "style", "full"] as FormationMode[]) {
  const attribution = formationAttribution(results[mode].matches, bFormation, bStrength);
  if (REPORT || mode === "full") {
    console.log(`\n    ${mode}: strength-controlled formation effect (exact, noise-free)`);
    console.log("    shape      club-seasons  mean str   raw ppg   exact effect   sampled residual ± se");
    for (const row of attribution) {
      console.log(
        `    ${row.formation.padEnd(9)}  ${String(row.clubSeasons).padStart(6)}      ${row.meanStrength.toFixed(1).padStart(5)}    ${row.rawPpg.toFixed(3)}     ${signed(row.formationEffectPpg)}         ${signed(row.residualPpg)} ± ${row.residualSe.toFixed(3)}`,
      );
    }
  }
  check(`${mode}: no formation gains or loses more than ${LIMITS.formationEffectPpg} ppg`, () => {
    for (const row of attribution) {
      assert.ok(Math.abs(row.formationEffectPpg) <= LIMITS.formationEffectPpg, `${row.formation} ${row.formationEffectPpg}`);
    }
  });
}

const matrix = formationMatchupMatrix(results.full.matches, bFormation);
if (REPORT) {
  const shapes = Object.keys(matrix).sort();
  console.log("\n    full: exact matchup effect, ppg (row vs column)");
  console.log("              " + shapes.map((s) => s.padStart(8)).join(""));
  for (const a of shapes) console.log(`    ${a.padEnd(9)} ` + shapes.map((b) => (matrix[a][b] ? signed(matrix[a][b].effectPpg) : "   -   ").padStart(8)).join(""));
}
check(`no single matchup is worth more than ${LIMITS.matchupEffectPpg} ppg`, () => {
  for (const [a, cols] of Object.entries(matrix)) {
    for (const [b, cell] of Object.entries(cols)) assert.ok(Math.abs(cell.effectPpg) <= LIMITS.matchupEffectPpg, `${a} v ${b} ${cell.effectPpg}`);
  }
});
check(`formation explains under ${LIMITS.formationVarianceShare * 100}% of expected points variation`, () => {
  assert.ok(varianceShare(results.full.matches).formationShare <= LIMITS.formationVarianceShare);
});
check("league-wide formations leave league health intact", () => {
  const off = results.off.health;
  const full = results.full.health;
  assert.ok(Math.abs(full.goalsPerGame - off.goalsPerGame) <= LIMITS.goalsShift, "goals per game moved");
  assert.ok(Math.abs(full.pointsSpread.meanStdDev - off.pointsSpread.meanStdDev) <= LIMITS.spreadShift, "points spread moved");
  assert.ok(Math.abs(full.titlePoints.mean - off.titlePoints.mean) <= LIMITS.titleShift, "title points moved");
});

console.log(`\nseason-balance: ${passed} passed`);
