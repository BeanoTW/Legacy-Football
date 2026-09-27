import { migrateSave, newGame } from "../engine";
import { makeLeagues, DIVISION_ONE } from "../pyramid";
import { clubDisplayName } from "../clubReference";

const modern = newGame("Legacy FC", "Old Boss", "PYRAMID_DEBUG");
const g = structuredClone(modern) as unknown as Record<string, unknown>;
g.version = 3;
g.week = 12;
const legacyLeagues = makeLeagues("Legacy FC");
const legacyTop = legacyLeagues.find((league) => league.id === DIVISION_ONE)!;
g.league = legacyTop.clubIds.map((team) => ({ team, p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 }));
g.fixtures = [];
g.leagueSchedule = [];
delete g.leagues;
delete g.playerLeagueId;
delete g.seasonHistory;
delete g.clubRecords;

const expected = legacyTop.clubIds;
const migrated = migrateSave(g);
const actual = migrated.leagues[0].clubIds.map(
  (club) => migrated.clubIdentity?.clubsById[club]?.seedKey ?? clubDisplayName(migrated, club),
);
throw new Error(JSON.stringify({ expected, actual, raw: migrated.leagues[0].clubIds }, null, 2));
