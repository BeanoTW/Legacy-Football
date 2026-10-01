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
  profile.includes("submitTransferOffer") && profile.includes('label={freeAgent ? "Approach" : "Approach club"}'),
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

assert(
  profile.includes("setTransferStatusInPlace") && profile.includes("Transfer list"),
  "owned-player profile can add or remove a player from the transfer list",
);
assert(
  profile.includes("renewContractInPlace") && profile.includes('label="Contract"'),
  "owned-player profile exposes contract negotiation",
);
assert(
  profile.includes("arrangeUserPlayerLoanOut") && profile.includes("Find loan club"),
  "owned-player profile can arrange an outgoing loan",
);
assert(
  profile.includes("releasePlayerInPlace") && profile.includes("Confirm release"),
  "owned-player profile exposes guarded contract termination",
);
assert(
  profile.includes("terminateUserPlayerLoan") && profile.includes('label={loanIsOut ? "Recall" : "End loan"}'),
  "active loans expose the relevant end or recall action",
);

assert(
  profile.includes("AttributeRadar") && profile.includes("RADAR_AREAS"),
  "player profile includes the six-area attribute radar",
);
assert(
  profile.includes('setStatsView') && profile.includes('"Season"') && profile.includes('"Career"'),
  "player profile combines performance into tabbed views",
);
assert(
  profile.includes("attributeTab") && profile.includes("barTone"),
  "attribute groups are tappable and quality-coded",
);
assert(
  profile.includes("keyFacts.map"),
  "player card header carries the compact six-fact strip",
);

console.log("\n16 passed, 0 failed");
