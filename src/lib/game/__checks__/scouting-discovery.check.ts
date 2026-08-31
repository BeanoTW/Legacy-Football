import { newGame } from "../engine";
import { ageOf, BASE_YEAR } from "../recruitment";
import {
  createScoutingBrief,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
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

const input = {
  id: "audit-position-wide-world",
  position: targetPosition,
  maxAge: 40,
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
check(
  "wide-world brief reaches at least one compact Fringe player",
  (firstBrief?.candidateIds ?? []).some(
    (playerId) => scoutingCandidateSource(first, input.id, playerId) === "fringe",
  ),
);

for (const playerId of firstBrief?.candidateIds ?? []) {
  const detailed = first.football?.players.find((candidate) => candidate.id === playerId);
  const known = knownPlayerIdentity(first, playerId);
  const source = scoutingCandidateSource(first, input.id, playerId);

  check(`candidate ${playerId} has a persistent identity`, Boolean(detailed || known));
  check(`candidate ${playerId} becomes known`, Boolean(known));
  check(`candidate ${playerId} records scouting reason`, known?.reasons.includes("scouted") ?? false);
  check(`candidate ${playerId} is external`, known?.currentClubId !== first.clubName);
  check(`candidate ${playerId} respects position`, known?.primaryPosition === targetPosition);

  if (detailed) {
    check(`detailed candidate ${playerId} respects age`, ageOf(detailed, first.season) <= input.maxAge);
  } else if (known) {
    const knownAge = BASE_YEAR + first.season - 1 - known.dateOfBirth.year;
    check(`compact candidate ${playerId} respects age`, knownAge <= input.maxAge);
    check(`compact candidate ${playerId} stays lightweight`, playerFidelity(first, playerId) === "known");
    check(`compact candidate ${playerId} is marked Fringe`, source === "fringe");
  }
}

const abilityBefore = new Map(base.football.players.map((player) => [player.id, player.currentAbility]));
check(
  "scouting never changes underlying detailed-player ability",
  (first.football?.players ?? []).every(
    (player) => abilityBefore.get(player.id) === player.currentAbility,
  ),
);
check(
  "world discovery does not hydrate extra detailed players",
  (first.football?.players.length ?? 0) === base.football.players.length,
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
