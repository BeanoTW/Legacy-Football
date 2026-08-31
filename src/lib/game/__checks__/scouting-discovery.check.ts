import { newGame } from "../engine";
import { ageOf } from "../recruitment";
import { createScoutingBrief, scoutingBrief } from "../scoutingDiscovery";
import {
  knownPlayerIdentity,
  playerFidelity,
  preserveKnownPlayerInPlace,
  setRememberPlayer,
} from "../playerLifecycle";

let passed = 0;
let failed = 0;
function check(label: string, condition: boolean, extra?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const base = newGame("Discovery Audit FC", "Auditor", "SCOUT_DISCOVERY_AUDIT");
if (!base.football) throw new Error("football state missing");

const external = base.football.players.filter((player) => player.currentClubId !== base.clubName);
const targetPosition = external[0]?.primaryPosition;
if (!targetPosition) throw new Error("no external players available");
const positional = external.filter((player) => player.primaryPosition === targetPosition);
const maxValue = Math.max(...positional.map((player) => player.marketValue));

const input = {
  id: "audit-position-budget",
  position: targetPosition,
  maxAge: 40,
  maxMarketValue: maxValue,
};
const first = createScoutingBrief(base, input);
const second = createScoutingBrief(base, input);
const firstBrief = scoutingBrief(first, input.id);
const secondBrief = scoutingBrief(second, input.id);

check("brief persists", Boolean(firstBrief && secondBrief));
check(
  "same save and brief are deterministic",
  JSON.stringify(firstBrief?.candidateIds ?? []) === JSON.stringify(secondBrief?.candidateIds ?? []),
);
check("brief discovers candidates", (firstBrief?.candidateIds.length ?? 0) > 0);
check(
  "candidate ids are unique",
  new Set(firstBrief?.candidateIds ?? []).size === (firstBrief?.candidateIds.length ?? 0),
);

for (const playerId of firstBrief?.candidateIds ?? []) {
  const player = first.football?.players.find((candidate) => candidate.id === playerId);
  check(`candidate ${playerId} exists`, Boolean(player));
  if (!player) continue;
  check(`candidate ${playerId} is external`, player.currentClubId !== first.clubName);
  check(`candidate ${playerId} respects position`, player.primaryPosition === targetPosition);
  check(`candidate ${playerId} respects age`, ageOf(player, first.season) <= input.maxAge);
  check(`candidate ${playerId} respects budget`, player.marketValue <= input.maxMarketValue);
  const known = knownPlayerIdentity(first, playerId);
  check(`candidate ${playerId} becomes known`, Boolean(known));
  check(`candidate ${playerId} records scouting reason`, known?.reasons.includes("scouted") ?? false);
}

const abilityBefore = new Map(base.football.players.map((player) => [player.id, player.currentAbility]));
check(
  "scouting never changes underlying ability",
  (first.football?.players ?? []).every(
    (player) => abilityBefore.get(player.id) === player.currentAbility,
  ),
);

const sample = external[0];
const lifecycle = structuredClone(base);
preserveKnownPlayerInPlace(lifecycle, sample, ["formerPlayer"]);
check("detailed player reports detailed fidelity", playerFidelity(lifecycle, sample.id) === "detailed");
lifecycle.football!.players = lifecycle.football!.players.filter((player) => player.id !== sample.id);
check("identity survives detailed-player removal", playerFidelity(lifecycle, sample.id) === "known");
check("stable identity survives compaction", knownPlayerIdentity(lifecycle, sample.id)?.playerId === sample.id);

const remembered = setRememberPlayer(base, sample.id, true);
check("remember player persists identity", Boolean(knownPlayerIdentity(remembered, sample.id)));
check("remember player sets tracking flag", knownPlayerIdentity(remembered, sample.id)?.remembered === true);
const forgotten = setRememberPlayer(remembered, sample.id, false);
check("forget stops rich tracking", knownPlayerIdentity(forgotten, sample.id)?.remembered === false);
check("forget does not delete history", Boolean(knownPlayerIdentity(forgotten, sample.id)));

console.log(`\nscouting-discovery: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
