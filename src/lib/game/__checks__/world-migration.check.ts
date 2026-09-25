import { advanceWeek, migrateSave, newGame, SAVE_VERSION } from "../engine";
import { leagueOf } from "../league";
import { buildWorldSimulationPlan } from "../world";
import { WORLD_DIVISIONS } from "../worldPyramid";
import { makePyramidSchedule } from "../pyramid";
import { fixturesForClub, makeLeagueRows } from "../schedule";
import { ensureRecruitment } from "../recruitment";
import type { GameState } from "../types";
import { userClubReference, isUserClubReference } from "../clubReference";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type LegacyGame = Omit<GameState, "version"> & { version: number };
const raw = (s: LegacyGame | GameState) => s as unknown as Record<string, unknown>;

function legacyTwoTier(seed: string): LegacyGame {
  const s = newGame("Migration FC", "World Migrator", seed) as LegacyGame;
  const top = s.leagues[0]!;
  const userId = userClubReference(s);
  const startingLeague = s.leagues.find((league) => league.clubIds.some((club) => isUserClubReference(s, club)))!;
  const displaced = top.clubIds[0]!;
  top.clubIds[0] = userId;
  startingLeague.clubIds[startingLeague.clubIds.findIndex((club) => isUserClubReference(s, club))] = displaced;
  s.playerLeagueId = top.id;
  const keptLeagues = s.leagues.slice(0, 2);
  const keptIds = new Set(keptLeagues.map((league) => league.id));
  const keptClubs = new Set(keptLeagues.flatMap((league) => league.clubIds));

  s.version = 12;
  s.leagues = keptLeagues;
  s.leagueSchedule = makePyramidSchedule(keptLeagues, `${s.saveSeed}|season${s.season}`);
  s.fixtures = fixturesForClub(s.leagueSchedule, userId);
  s.league = makeLeagueRows(top.clubIds);
  s.matchRecords = s.matchRecords.filter((record) => keptIds.has(record.league));
  s.seasonHistory = s.seasonHistory.filter((entry) => keptIds.has(entry.leagueId));
  s.clubRecords = Object.fromEntries(
    Object.entries(s.clubRecords).filter(([clubId]) => keptClubs.has(clubId)),
  );
  s.clubReputations = Object.fromEntries(
    Object.entries(s.clubReputations).filter(([clubId]) => keptClubs.has(clubId)),
  );
  s.clubSnapshots = s.clubSnapshots.filter((snapshot) => keptClubs.has(snapshot.club));
  s.seasonPredictions = s.seasonPredictions.filter((prediction) =>
    keptIds.has(prediction.leagueId),
  );
  delete s.fringeWorld;
  delete (s as unknown as Record<string, unknown>).football;
  ensureRecruitment(s as GameState);
  s.trackedClubIds = [];
  return s;
}

const source = legacyTwoTier("WORLD|MIGRATION|V12");
const originalMembership = source.leagues.map(
  (league) => [league.id, [...league.clubIds]] as const,
);
source.week = 20;

const migrated = migrateSave(raw(clone(source)));
assert(
  migrated.version === SAVE_VERSION,
  "migration must produce the current schema",
);
assert(
  migrated.leagues.length === WORLD_DIVISIONS.length,
  "current saves must contain every world division",
);
const expectedPersistentClubs = new Set(migrated.leagues.flatMap((league) => league.clubIds)).size;
assert(
  expectedPersistentClubs === migrated.leagues.reduce((total, league) => total + league.clubIds.length, 0),
  "expanded world must not duplicate persistent clubs",
);
for (const [leagueId, clubIds] of originalMembership) {
  const after = migrated.leagues.find((league) => league.id === leagueId);
  assert(!!after, `existing league ${leagueId} must survive migration`);
  assert(
    JSON.stringify(after.clubIds) === JSON.stringify(clubIds),
    `existing membership in ${leagueId} must be preserved exactly`,
  );
}

const scheduledLeagueIds = new Set(migrated.leagueSchedule.map(leagueOf));
assert(
  WORLD_DIVISIONS.every((def) => scheduledLeagueIds.has(def.id)),
  "a full-simulation v12 save must gain schedules for every added division",
);
assert(
  migrated.matchRecords.some((record) => record.league === "league-3" && record.week < 20),
  "elapsed AI fixtures in a newly added division must be caught up deterministically",
);

const plan = buildWorldSimulationPlan(migrated);
assert(plan.focusClubIds.length >= migrated.leagues[0]!.clubIds.length, "top-tier player must keep its own league in Focus");
assert(
  plan.fringeClubIds.length === expectedPersistentClubs - plan.focusClubIds.length,
  "every persistent club outside the Focus bubble must remain lightweight Fringe",
);
assert(
  migrated.football.players.every(
    (player) => player.currentClubId === null || plan.focusClubIds.includes(player.currentClubId),
  ),
  "migration must not materialise detailed players for Fringe clubs",
);
assert(
  Object.keys(migrated.fringeWorld ?? {}).length === plan.fringeClubIds.length,
  "every migrated Fringe club must receive compact persistent state",
);
for (const league of migrated.leagues) {
  for (const clubId of league.clubIds) {
    assert(!!migrated.clubRecords[clubId], `club record missing for ${clubId}`);
    assert(
      typeof migrated.clubReputations[clubId] === "number",
      `reputation missing for ${clubId}`,
    );
  }
}

const replay = migrateSave(raw(clone(migrated)));
assert(
  JSON.stringify(replay) === JSON.stringify(migrated),
  "reloading an already-migrated current world must be byte-stable",
);

// Legacy user-only seasons deliberately carry no full league schedule. Their
// current season stays untouched; the complete current pyramid begins
// naturally at the next rollover.
const userOnly = legacyTwoTier("WORLD|MIGRATION|USERONLY");
userOnly.leagueSchedule = [];
userOnly.matchRecords = [];
userOnly.week = 46;
const userOnlyMigrated = migrateSave(raw(clone(userOnly)));
assert(
  userOnlyMigrated.leagueSchedule.length === 0,
  "user-only active season must not be rewritten",
);
const nextSeason = advanceWeek(userOnlyMigrated);
assert(nextSeason.season === 2, "legacy user-only save must still roll into the next season");
assert(
  new Set(nextSeason.leagueSchedule.map(leagueOf)).size === WORLD_DIVISIONS.length,
  "first new season after migration must schedule the complete current world",
);

console.log("world-migration.check.ts: PASS");
