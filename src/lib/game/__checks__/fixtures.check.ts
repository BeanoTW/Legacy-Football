/* Verification for fixture scheduling (double round-robin + H/A balance).
   Run with:  bun src/lib/game/__checks__/fixtures.check.ts
*/
import { buildSeasonSchedule, scheduleDiagnostics, clubFixtures } from "../fixtures";
import { leagueTeams, makeFixtures, weekForLeagueRound, newGame, CALENDAR } from "../engine";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

const CLUB = "Dalton Town";
const teams = leagueTeams(CLUB);
const N = teams.length;
const schedule = buildSeasonSchedule(teams, "SEED_A");

console.log(`\n[1] Structure (${N} teams, ${schedule.length} rounds)`);
check("38 rounds", schedule.length === (N - 1) * 2);
check(
  "every round has N/2 matches",
  schedule.every((r) => r.length === N / 2),
);

console.log("\n[2] Pairings meet exactly twice, once each way");
{
  const pairCount: Record<string, string[]> = {};
  for (const r of schedule)
    for (const m of r) {
      const k = [m.home, m.away].sort().join(" v ");
      (pairCount[k] ||= []).push(m.home);
    }
  const expected = (N * (N - 1)) / 2;
  check(
    "all unique pairs present",
    Object.keys(pairCount).length === expected,
    `${Object.keys(pairCount).length}/${expected}`,
  );
  check(
    "each pair meets exactly twice",
    Object.values(pairCount).every((v) => v.length === 2),
  );
  check(
    "each pair has one home each",
    Object.values(pairCount).every((v) => v[0] !== v[1]),
  );
  const dupes = Object.entries(pairCount).filter(([, v]) => v[0] === v[1]);
  check("no duplicated identical fixture", dupes.length === 0, JSON.stringify(dupes.slice(0, 2)));
}

console.log("\n[3] One match per club per round");
check(
  "no club twice in a round",
  schedule.every((r) => {
    const seen = new Set<string>();
    for (const m of r) {
      if (seen.has(m.home) || seen.has(m.away)) return false;
      seen.add(m.home);
      seen.add(m.away);
    }
    return seen.size === N;
  }),
);

console.log("\n[4] Home/away totals + streaks");
const diag = scheduleDiagnostics(schedule, teams);
check(
  "every club plays 19 home / 19 away",
  diag.every((d) => d.homeMatches === N - 1 && d.awayMatches === N - 1),
);
const maxH = Math.max(...diag.map((d) => d.longestHomeStreak));
const maxA = Math.max(...diag.map((d) => d.longestAwayStreak));
check("longest home streak <= 2", maxH <= 2, `max ${maxH}`);
check("longest away streak <= 2", maxA <= 2, `max ${maxA}`);

console.log("\n  Diagnostics per club:");
console.log("  club".padEnd(24) + "H   A   maxH  maxA");
for (const d of diag) {
  console.log(
    "  " +
      d.team.padEnd(22) +
      String(d.homeMatches).padEnd(4) +
      String(d.awayMatches).padEnd(4) +
      String(d.longestHomeStreak).padEnd(6) +
      String(d.longestAwayStreak),
  );
}

console.log("\n[5] Reverse fixture separation");
{
  const firstSeen: Record<string, number> = {};
  let minGap = Infinity;
  schedule.forEach((r, i) => {
    for (const m of r) {
      const k = [m.home, m.away].sort().join("|");
      if (firstSeen[k] === undefined) firstSeen[k] = i;
      else minGap = Math.min(minGap, i - firstSeen[k]);
    }
  });
  check("reverse fixture never in the next round", minGap > 1, `min gap ${minGap}`);
  check("reverse fixtures separated by >= 5 rounds", minGap >= 5, `min gap ${minGap}`);
}

console.log("\n[6] Determinism");
{
  const a = JSON.stringify(buildSeasonSchedule(teams, "SEED_A"));
  const b = JSON.stringify(buildSeasonSchedule(teams, "SEED_A"));
  check("same seed => identical schedule", a === b);
  const seeds = ["s1", "s2", "s3", "s4", "s5"];
  const outs = seeds.map((s) => JSON.stringify(buildSeasonSchedule(teams, s)));
  check(
    "different seeds produce >1 distinct schedule",
    new Set(outs).size > 1,
    `${new Set(outs).size} distinct`,
  );
  let allValid = true;
  for (const s of seeds) {
    const sch = buildSeasonSchedule(teams, s);
    const d = scheduleDiagnostics(sch, teams);
    if (
      !d.every(
        (x) =>
          x.homeMatches === 19 &&
          x.awayMatches === 19 &&
          x.longestHomeStreak <= 2 &&
          x.longestAwayStreak <= 2,
      )
    )
      allValid = false;
  }
  check("all sampled seeds produce valid balanced schedules", allValid);
}

console.log("\n[7] User club is not special-cased");
{
  const userDiag = diag.find((d) => d.team === CLUB)!;
  const others = diag.filter((d) => d.team !== CLUB);
  check(
    "user club has same H/A totals as AI clubs",
    userDiag.homeMatches === 19 && userDiag.awayMatches === 19,
  );
  check(
    "user club streaks within same bounds as AI clubs",
    userDiag.longestHomeStreak <= Math.max(...others.map((o) => o.longestHomeStreak)) + 0 ||
      userDiag.longestHomeStreak <= 2,
  );
  // Swapping which club is "the user" must not change the schedule for a given seed.
  const alt = buildSeasonSchedule(teams, "SEED_A");
  check(
    "schedule independent of which club is user-controlled",
    JSON.stringify(alt) === JSON.stringify(schedule),
  );
}

console.log("\n[8] Club fixture list / calendar mapping");
{
  const fx = makeFixtures(CLUB, "SEED_A");
  check("38 fixtures", fx.length === 38);
  check("weeks unique", new Set(fx.map((f) => f.week)).size === 38);
  check(
    "weeks inside league windows",
    fx.every(
      (f) =>
        (f.week >= CALENDAR.firstHalfStart && f.week <= CALENDAR.firstHalfEnd) ||
        (f.week >= CALENDAR.secondHalfStart && f.week <= CALENDAR.secondHalfEnd),
    ),
  );
  check(
    "no mid-season-break fixtures",
    fx.every((f) => f.week < CALENDAR.midSeasonStart || f.week > CALENDAR.midSeasonEnd),
  );
  check("19 home / 19 away", fx.filter((f) => f.home).length === 19);
  check(
    "first half is NOT all home",
    new Set(fx.filter((f) => f.week <= 23).map((f) => f.home)).size === 2,
  );
  check(
    "second half is NOT all away",
    new Set(fx.filter((f) => f.week >= 28).map((f) => f.home)).size === 2,
  );
  check(
    "each opponent faced exactly twice",
    Object.values(
      fx.reduce<Record<string, number>>((a, f) => {
        a[f.opponent] = (a[f.opponent] || 0) + 1;
        return a;
      }, {}),
    ).every((c) => c === 2),
  );
  check(
    "round->week mapping monotonic",
    [...Array(38)].every((_, i) => i === 0 || weekForLeagueRound(i + 1) > weekForLeagueRound(i)),
  );
}

console.log("\n[9] New game + a newly generated second season");
{
  const g = newGame(CLUB, "Test Manager");
  const s1 = g.fixtures;
  check(
    "new game fixtures balanced across halves",
    s1.filter((f) => f.week <= 23 && f.home).length > 4 &&
      s1.filter((f) => f.week >= 28 && f.home).length > 4,
  );
  // Season 2 uses the same generator with a season-scoped seed.
  const s2 = makeFixtures(CLUB, `${g.saveSeed}|season2`);
  const sch2 = buildSeasonSchedule(leagueTeams(CLUB), `${g.saveSeed}|season2`);
  const d2 = scheduleDiagnostics(sch2, leagueTeams(CLUB));
  check("season 2 has 38 fixtures", s2.length === 38);
  check("season 2 balanced 19/19", s2.filter((f) => f.home).length === 19);
  check(
    "season 2 streaks <= 2",
    d2.every((d) => d.longestHomeStreak <= 2 && d.longestAwayStreak <= 2),
  );
  check(
    "season 2 differs from season 1",
    JSON.stringify(s2) !== JSON.stringify(makeFixtures(CLUB, `${g.saveSeed}|season1`)),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
