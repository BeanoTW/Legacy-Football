import { advanceWeek, newGame } from "../engine";
import { buildWorldSimulationPlan } from "../world";
import { reconcileRecruitmentFidelity, setWorldClubTracked } from "../recruitment";
import type { GameState } from "../types";
import { isUserClubReference } from "../clubReference";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function clubMembershipSignature(s: GameState): string {
  return [...s.leagues]
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
    .map((league) => `${league.id}:${[...league.clubIds].sort().join(",")}`)
    .join("|");
}

function assertWorldBoundary(s: GameState, label: string) {
  const plan = buildWorldSimulationPlan(s);
  const focus = new Set(plan.focusClubIds);
  const fringe = new Set(plan.fringeClubIds);
  const allLeagueClubs = s.leagues.flatMap((league) => league.clubIds);
  const playerLeague = s.leagues.find((league) =>
    league.clubIds.some((club) => isUserClubReference(s, club)),
  );

  assert(
    allLeagueClubs.length === new Set(allLeagueClubs).size,
    `${label}: every persistent club must belong to exactly one league`,
  );
  assert(
    playerLeague?.id === s.playerLeagueId,
    `${label}: playerLeagueId must match the controlled club's real membership`,
  );
  assert(
    plan.focusClubIds.every((clubId) => !fringe.has(clubId)) &&
      plan.fringeClubIds.every((clubId) => !focus.has(clubId)),
    `${label}: Focus and Fringe sets must remain disjoint`,
  );
  assert(
    plan.focusClubIds.length + plan.fringeClubIds.length === allLeagueClubs.length,
    `${label}: fidelity plan must cover every persistent club exactly once`,
  );
  assert(focus.has(s.clubName), `${label}: controlled club must always remain Focus`);

  for (const player of s.football.players) {
    if (player.currentClubId === null) continue;
    assert(
      focus.has(player.currentClubId),
      `${label}: detailed player ${player.id} must not belong to Fringe club ${player.currentClubId}`,
    );
  }
  for (const contract of s.football.contracts) {
    const player = s.football.players.find((candidate) => candidate.id === contract.playerId);
    if (!player || player.currentClubId === null) continue;
    assert(
      focus.has(player.currentClubId),
      `${label}: detailed contract ${contract.id} must not survive for a Fringe club`,
    );
  }

  const compactIds = new Set(Object.keys(s.fringeWorld ?? {}));
  assert(
    compactIds.size === plan.fringeClubIds.length,
    `${label}: compact world must contain exactly the current Fringe clubs`,
  );
  for (const profile of plan.clubs) {
    if (profile.level === "focus") {
      assert(
        !compactIds.has(profile.clubId),
        `${label}: Focus club ${profile.clubId} must not retain duplicate compact state`,
      );
      continue;
    }

    const compact = s.fringeWorld?.[profile.clubId];
    assert(!!compact, `${label}: Fringe club ${profile.clubId} must have compact persistent state`);
    assert(
      compact.leagueId === profile.leagueId && compact.tier === profile.tier,
      `${label}: Fringe club ${profile.clubId} compact membership must match the live pyramid`,
    );
    assert(
      compact.lastSimulatedSeason === s.season,
      `${label}: Fringe club ${profile.clubId} must be advanced to the current season`,
    );
    assert(
      compact.strength >= 1 &&
        compact.strength <= 100 &&
        compact.form >= -5 &&
        compact.form <= 5 &&
        compact.financeBand >= 1 &&
        compact.financeBand <= 5,
      `${label}: Fringe club ${profile.clubId} compact values must remain bounded`,
    );
  }
}

const SEED = "SCALABLE|WORLD|CHECKPOINT";
let a = newGame("Checkpoint FC", "World Auditor", SEED);
let b = roundTrip(a);

assertWorldBoundary(a, "opening world");
assert(JSON.stringify(a) === JSON.stringify(b), "opening save/load round trip must be byte-stable");

// Exercise a manual Focus promotion/demotion before the long run. This covers
// the same fidelity transition a future club-browser/tracking UI will invoke.
const openingPlan = buildWorldSimulationPlan(a);
const trackedClub = openingPlan.fringeClubIds[0];
assert(trackedClub, "opening world must contain at least one Fringe club");
a = setWorldClubTracked(a, trackedClub, true);
b = setWorldClubTracked(b, trackedClub, true);
assertWorldBoundary(a, "tracked Focus club");
assert(JSON.stringify(a) === JSON.stringify(b), "tracking must remain deterministic after reload");
a = setWorldClubTracked(a, trackedClub, false);
b = setWorldClubTracked(b, trackedClub, false);
assertWorldBoundary(a, "returned Fringe club");
assert(
  JSON.stringify(a) === JSON.stringify(b),
  "untracking must remain deterministic after reload",
);

const openingMembership = clubMembershipSignature(a);
const worldClubCount = a.leagues.reduce((total, league) => total + league.clubIds.length, 0);

// Five full seasons is long enough to force repeated promotion/relegation,
// schedule regeneration, compact-world advancement and changing Focus borders,
// while staying cheap enough to run on every CI push.
for (let completed = 0; completed < 5; completed++) {
  const targetSeason = a.season + 1;
  let safety = 0;
  while (a.season < targetSeason) {
    a = advanceWeek(a);
    b = advanceWeek(b);
    safety++;
    assert(
      safety <= 60,
      `season ${targetSeason - 1}: rollover must complete within 60 weekly ticks`,
    );
  }

  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `after season ${targetSeason - 1}: same-seed simulation must remain byte-identical`,
  );

  // A real persistence boundary must not change what the next tick produces.
  const reloaded = roundTrip(a);
  const nextA = advanceWeek(a);
  const nextReloaded = advanceWeek(reloaded);
  assert(
    JSON.stringify(nextA) === JSON.stringify(nextReloaded),
    `season ${a.season}: reload must not alter the next deterministic tick`,
  );

  assertWorldBoundary(a, `after season ${targetSeason - 1}`);
  assert(
    a.leagues.reduce((total, league) => total + league.clubIds.length, 0) === worldClubCount,
    `after season ${targetSeason - 1}: promotion/relegation must never lose or create persistent clubs`,
  );
  assert(
    a.leagues.every((league) => league.clubIds.length === 20),
    `after season ${targetSeason - 1}: every division must retain 20 clubs`,
  );

  // Reconcile is intentionally idempotent at any save boundary.
  const before = JSON.stringify(a);
  reconcileRecruitmentFidelity(a);
  const once = JSON.stringify(a);
  reconcileRecruitmentFidelity(a);
  assert(
    JSON.stringify(a) === once,
    `after season ${targetSeason - 1}: repeated fidelity reconciliation must be idempotent`,
  );
  // It may legitimately hydrate/compact after a league movement, but once done
  // it must still satisfy the boundary invariant.
  assertWorldBoundary(a, `reconciled season ${targetSeason}`);
  b = roundTrip(a);
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `season ${targetSeason}: reconciled state must serialize stably`,
  );

  // Keep the compiler aware that the pre-reconcile snapshot is intentional:
  // when there was no fidelity movement, reconciliation should be a no-op.
  if (before === once) {
    assert(
      before === JSON.stringify(a),
      `season ${targetSeason}: stable boundary must remain unchanged`,
    );
  }
}

assert(
  clubMembershipSignature(a) !== openingMembership,
  "five-season audit should exercise at least one promotion/relegation membership change",
);

console.log("scalable-world-checkpoint.check.ts: PASS");
