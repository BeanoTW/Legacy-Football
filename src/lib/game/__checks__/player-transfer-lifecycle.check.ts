import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import type { FootballPlayer, GameState } from "../types";
import {
  materializeKnownSigningInPlace,
  preservePlayerDepartureInPlace,
  recordPlayerArrivalInPlace,
} from "../playerTransferLifecycle";
import { knownPlayerIdentity, playerFidelity, preserveKnownPlayerInPlace } from "../playerLifecycle";
import { preserveScoutingCandidateProfileInPlace } from "../scoutingDiscovery";
import { isUserClubReference, userClubReference } from "../clubReference";

export function checkPlayerTransferLifecycle(state: GameState): void {
  const source = state.football?.players.find(
    (player) => player.currentClubId !== null && !isUserClubReference(state, player.currentClubId),
  );
  if (!state.football || !source) throw new Error("detailed external player missing");

  const test = structuredClone(state);
  const original = test.football.players.find((player) => player.id === source.id) as FootballPlayer;
  preserveKnownPlayerInPlace(test, original, ["scouted"]);
  preserveScoutingCandidateProfileInPlace(test, original);
  test.football.players = test.football.players.filter((player) => player.id !== original.id);

  assert.equal(playerFidelity(test, original.id), "known");
  const signed = materializeKnownSigningInPlace(test, original.id);
  assert.ok(signed, "known player should materialize when actually signed");
  assert.equal(signed.id, original.id, "signing must preserve stable player identity");
  assert.equal(signed.currentClubId, userClubReference(test));
  assert.equal(playerFidelity(test, original.id), "detailed");
  assert.ok(knownPlayerIdentity(test, original.id)?.reasons.includes("owned"));

  recordPlayerArrivalInPlace(test, signed, original.currentClubId, original.marketValue);
  assert.ok(
    knownPlayerIdentity(test, original.id)?.career.some((entry) => isUserClubReference(test, entry.clubId)),
    "arrival should be written to the cheap career ledger",
  );

  preservePlayerDepartureInPlace(test, signed, original.currentClubId, original.marketValue);
  const known = knownPlayerIdentity(test, original.id);
  assert.ok(known?.reasons.includes("formerPlayer"));
  assert.ok(!known?.reasons.includes("owned"));
  assert.equal(known?.currentClubId, original.currentClubId);
  assert.ok(
    known?.career.some((entry) => entry.clubId === original.currentClubId),
    "departure should survive after detailed simulation is later dropped",
  );
}

const base = newGame("Lifecycle Audit FC", "Auditor", "PLAYER_TRANSFER_LIFECYCLE_AUDIT");
checkPlayerTransferLifecycle(base);
console.log("\nplayer-transfer-lifecycle: passed");
