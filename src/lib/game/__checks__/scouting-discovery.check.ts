import { newGame } from "../engine";
import { ageOf, BASE_YEAR } from "../recruitment";
import {
  createScoutingBrief,
  discoveredCandidateViews,
  scoutingBrief,
  scoutingCandidateSource,
} from "../scoutingDiscovery";
import {
  knownPlayerIdentity,
  playerFidelity,
  preserveKnownPlayerInPlace,
  setRememberPlayer,
} from "../playerLifecycle";
import {
  progressScoutingWeekInPlace,
  scoutingAssignment,
  scoutingReportById,
  startScouting,
} from "../scouting";
import { isUserClubReference } from "../clubReference";

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

const external = base.football.players.filter(
  (player) => player.currentClubId !== null && !isUserClubReference(base, player.currentClubId),
);
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
const views = discoveredCandidateViews(first, input.id);

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
check("chairman-safe views cover every candidate", views.length === (firstBrief?.candidateIds.length ?? 0));
check(
  "chairman-safe views do not expose hidden ability fields",
  views.every(
    (view) =>
      !("currentAbility" in (view as unknown as Record<string, unknown>)) &&
      !("potentialAbility" in (view as unknown as Record<string, unknown>)),
  ),
);
check(
  "wide-world brief reaches at least one compact Fringe player",
  (firstBrief?.candidateIds ?? []).some(
    (playerId) => scoutingCandidateSource(first, input.id, playerId) === "fringe",
  ),
);
check("chairman view identifies a compact-world result", views.some((view) => view.source === "fringe"));

for (const playerId of firstBrief?.candidateIds ?? []) {
  const detailed = first.football?.players.find((candidate) => candidate.id === playerId);
  const known = knownPlayerIdentity(first, playerId);
  const source = scoutingCandidateSource(first, input.id, playerId);

  check(`candidate ${playerId} has a persistent identity`, Boolean(detailed || known));
  check(`candidate ${playerId} becomes known`, Boolean(known));
  check(`candidate ${playerId} records scouting reason`, known?.reasons.includes("scouted") ?? false);
  check(
    `candidate ${playerId} is external`,
    Boolean(known) &&
      (known.currentClubId === null || !isUserClubReference(first, known.currentClubId)),
  );
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

const fringeTarget = (firstBrief?.candidateIds ?? []).find(
  (playerId) => scoutingCandidateSource(first, input.id, playerId) === "fringe",
);
check("compact target available for deeper scouting", Boolean(fringeTarget));
if (fringeTarget) {
  const beforeDetailedCount = first.football!.players.length;
  const deeper = startScouting(first, fringeTarget);
  check("compact target can start an assignment", Boolean(scoutingAssignment(deeper, fringeTarget)));
  check(
    "starting compact scouting does not hydrate the player",
    deeper.football!.players.length === beforeDetailedCount && playerFidelity(deeper, fringeTarget) === "known",
  );
  check("compact target has an initial report", Boolean(scoutingReportById(deeper, fringeTarget)));
  progressScoutingWeekInPlace(deeper);
  check(
    "compact assignment progresses without a detailed FootballPlayer",
    (scoutingAssignment(deeper, fringeTarget)?.weeksObserved ?? 0) > 0,
  );
  check(
    "compact report knowledge increases after observation",
    (scoutingReportById(deeper, fringeTarget)?.knowledgePct ?? 0) > 0,
  );
}

const sample = external[0];
const lifecycle = structuredClone(base);
preserveKnownPlayerInPlace(lifecycle, sample, ["formerPlayer"]);
check("detailed player reports detailed fidelity", playerFidelity(lifecycle, sample.id) === "detailed");
lifecycle.football!.players = lifecycle.football!.players.filter((player) => player.id !== sample.id);
check("identity survives detailed-player removal", playerFidelity(lifecycle, sample.id) === "known");
check("stable identity survives compaction", knownPlayerIdentity(lifecycle, sample.id)?.playerId === sample.id);

const detailedScouting = startScouting(base, sample.id);
check("detailed external player can start scouting", Boolean(scoutingAssignment(detailedScouting, sample.id)));
detailedScouting.football!.players = detailedScouting.football!.players.filter(
  (player) => player.id !== sample.id,
);
check(
  "scouted detailed player becomes known after Focus compaction",
  playerFidelity(detailedScouting, sample.id) === "known",
);
check(
  "scouting report survives detailed-player compaction",
  Boolean(scoutingReportById(detailedScouting, sample.id)),
);
progressScoutingWeekInPlace(detailedScouting);
check(
  "assignment continues after detailed-player compaction",
  (scoutingAssignment(detailedScouting, sample.id)?.weeksObserved ?? 0) > 0,
);

const remembered = setRememberPlayer(base, sample.id, true);
check("remember player persists identity", Boolean(knownPlayerIdentity(remembered, sample.id)));
check("remember player sets tracking flag", knownPlayerIdentity(remembered, sample.id)?.remembered === true);
const forgotten = setRememberPlayer(remembered, sample.id, false);
check("forget stops rich tracking", knownPlayerIdentity(forgotten, sample.id)?.remembered === false);
check("forget does not delete history", Boolean(knownPlayerIdentity(forgotten, sample.id)));

console.log(`\nscouting-discovery: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
