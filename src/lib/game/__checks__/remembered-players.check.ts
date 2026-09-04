import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import { preserveKnownPlayerInPlace, setRememberPlayer } from "../playerLifecycle";
import { preserveScoutingCandidateProfileInPlace } from "../scoutingDiscovery";
import {
  REMEMBERED_PLAYER_LIMIT,
  advanceRememberedPlayersToSeasonInPlace,
  canRememberAnotherPlayer,
  changeRememberPlayer,
  rememberedPlayerHistory,
  rememberedPlayerIds,
  rememberedPlayerSeason,
} from "../rememberedPlayers";
import { isUserClubReference } from "../clubReference";

const base = newGame("Remember Audit FC", "Auditor", "REMEMBERED_PLAYER_AUDIT");
const source = base.football?.players.find(
  (player) => player.currentClubId !== null && !isUserClubReference(base, player.currentClubId),
);
if (!source || !base.football) throw new Error("external player missing");

preserveKnownPlayerInPlace(base, source, ["formerPlayer"]);
preserveScoutingCandidateProfileInPlace(base, source);
let state = setRememberPlayer(base, source.id, true);
assert.deepEqual(rememberedPlayerIds(state), [source.id]);
assert.equal(canRememberAnotherPlayer(state), true);
assert.equal(canRememberAnotherPlayer(state, source.id), true);

const first = rememberedPlayerSeason(state, source.id, state.season);
const repeat = rememberedPlayerSeason(state, source.id, state.season);
assert.deepEqual(first, repeat, "remembered season must be deterministic");
assert.ok(first);
assert.ok(first.appearances >= 0 && first.appearances <= 42);
assert.ok(first.goals >= 0 && first.goals <= first.appearances);

advanceRememberedPlayersToSeasonInPlace(state);
const once = structuredClone(rememberedPlayerHistory(state, source.id));
advanceRememberedPlayersToSeasonInPlace(state);
assert.deepEqual(
  rememberedPlayerHistory(state, source.id),
  once,
  "season advancement must be idempotent",
);
assert.equal(once.length, 1);

state.season += 2;
advanceRememberedPlayersToSeasonInPlace(state);
const history = rememberedPlayerHistory(state, source.id);
assert.equal(history.length, 3, "season jumps should fill each remembered season exactly once");
assert.deepEqual(
  history.map((entry) => entry.season),
  [1, 2, 3],
);

state = changeRememberPlayer(state, source.id, false).state;
assert.equal(rememberedPlayerIds(state).includes(source.id), false);
assert.equal(
  rememberedPlayerHistory(state, source.id).length,
  3,
  "forgetting must preserve written history",
);

const cap = newGame("Remember Cap FC", "Auditor", "REMEMBER_CAP_AUDIT");
if (!cap.football) throw new Error("football state missing");
for (const player of cap.football.players.slice(0, REMEMBERED_PLAYER_LIMIT)) {
  preserveKnownPlayerInPlace(cap, player, ["remembered"], true);
}
assert.equal(rememberedPlayerIds(cap).length, REMEMBERED_PLAYER_LIMIT);
assert.equal(canRememberAnotherPlayer(cap), false, "remembered tracking must remain bounded");
assert.equal(
  canRememberAnotherPlayer(cap, rememberedPlayerIds(cap)[0]),
  true,
  "existing remembered players remain valid at cap",
);
const extra = cap.football.players[REMEMBERED_PLAYER_LIMIT];
if (!extra) throw new Error("extra player missing");
const blocked = changeRememberPlayer(cap, extra.id, true);
assert.equal(blocked.ok, false, "public Remember Player action must enforce the cap");
assert.equal(blocked.state, cap, "rejected cap action must leave state untouched");
assert.equal(rememberedPlayerIds(blocked.state).length, REMEMBERED_PLAYER_LIMIT);

const existingId = rememberedPlayerIds(cap)[0];
const existing = changeRememberPlayer(cap, existingId, true);
assert.equal(existing.ok, true, "re-selecting an already remembered player is allowed at cap");

console.log("\nremembered-players: passed");
