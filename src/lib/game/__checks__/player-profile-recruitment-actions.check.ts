import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[PLAYER-PROFILE-RECRUITMENT] Direct chairman recruitment actions");

const profile = readFileSync("src/components/game/shared/PlayerProfileSheet.tsx", "utf8");
const route = readFileSync("src/routes/index.tsx", "utf8");

assert(
  profile.includes("toggleChairmanShortlist(s, player.id)"),
  "player profile can add or remove a target from the chairman shortlist",
);
assert(
  profile.includes("startScouting(s, player.id)"),
  "player profile can commission scouting on a manually discovered player",
);
assert(
  profile.includes("submitTransferEnquiry") && profile.includes("Approach club"),
  "contracted players can enter the staged club negotiation flow from their profile",
);
assert(
  profile.includes("submitTransferOffer") && profile.includes("Approach player"),
  "free agents can be approached directly from their profile",
);
assert(
  profile.includes("arrangeUserPlayerLoanIn") && profile.includes("Send loan request"),
  "contracted players expose the canonical loan route from their profile",
);
assert(
  route.includes("<PlayerProfileSheet state={state} update={update} />"),
  "global player profiles receive the canonical game update function",
);
assert(
  !profile.includes("state.football.players.push") && !profile.includes("state.football.players ="),
  "profile actions reuse recruitment systems rather than mutating player storage directly",
);

console.log("\n7 passed, 0 failed");
