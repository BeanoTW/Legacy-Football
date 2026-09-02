import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import {
  clubIdForState,
  ensureClubIdentityStateInPlace,
  registeredClubDisplayName,
} from "../clubIdentity";
import {
  migrateClubReferencesToIdsInPlace,
  persistedClubReferencesAreOpaque,
} from "../clubReferenceMigration";
import { ensurePersistentFringePlayers } from "../fringePlayers";

const source = newGame("Reference Audit FC", "Auditor", "CLUB_REFERENCE_AUDIT");
ensurePersistentFringePlayers(source);
const sourceCompact = Object.values(source.fringePlayers ?? {})[0];
if (!sourceCompact) throw new Error("compact fringe player missing");
const compactBefore = structuredClone(sourceCompact);

ensureClubIdentityStateInPlace(source);
const originalName = source.clubName;
const userId = source.clubIdentity?.userClubId;
if (!userId) throw new Error("club identity registry missing");
const compactClubId = clubIdForState(source, compactBefore.currentClubId);
assert.ok(source.clubIdentity?.clubsById[compactClubId], "compact player's club must be registered");

const a = structuredClone(source);
const b = structuredClone(source);
migrateClubReferencesToIdsInPlace(a);
migrateClubReferencesToIdsInPlace(b);

assert.equal(a.clubName, originalName, "display name must remain presentation metadata");
assert.equal(a.clubIdentity?.userClubId, userId);
assert.equal(registeredClubDisplayName(a, userId), originalName);
assert.equal(persistedClubReferencesAreOpaque(a), true);
assert.deepEqual(a, b, "reference migration must be deterministic");

const userLeague = a.leagues.find((league) => league.id === a.playerLeagueId);
assert.ok(userLeague?.clubIds.includes(userId), "player league must reference immutable user club id");
assert.ok(!userLeague?.clubIds.includes(originalName), "league membership must no longer use display name");

const userPlayer = a.football?.players.find((player) => player.currentClubId === userId);
assert.ok(userPlayer, "owned players must reference immutable user club id");
const userContract = a.football?.contracts.find((contract) => contract.clubId === userId);
assert.ok(userContract, "owned contracts must reference immutable user club id");

const migratedCompact = a.fringePlayers?.[compactBefore.playerId];
assert.ok(migratedCompact, "compact fringe player identity must survive reference migration");
assert.equal(migratedCompact.currentClubId, compactClubId);
assert.deepEqual(migratedCompact.dateOfBirth, compactBefore.dateOfBirth);
assert.equal(migratedCompact.primaryPosition, compactBefore.primaryPosition);
assert.equal(migratedCompact.currentAbility, compactBefore.currentAbility);
assert.equal(migratedCompact.potentialAbility, compactBefore.potentialAbility);
assert.equal(migratedCompact.contractExpirySeason, compactBefore.contractExpirySeason);
assert.equal(migratedCompact.lastDevelopedSeason, compactBefore.lastDevelopedSeason);

const aiName = source.leagues.flatMap((league) => league.clubIds).find((club) => club !== originalName);
if (!aiName) throw new Error("AI club missing");
const aiId = clubIdForState(source, aiName);
assert.equal(registeredClubDisplayName(a, aiId), aiName);
assert.ok(a.leagues.some((league) => league.clubIds.includes(aiId)));

const once = structuredClone(a);
migrateClubReferencesToIdsInPlace(a);
assert.deepEqual(a, once, "reference migration must be idempotent once refs are opaque");

console.log("\nclub-reference-migration: passed");
