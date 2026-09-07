import { advanceDay, newGame } from "../engine";
import { createScoutingBrief, scoutingBrief, scoutingCandidateSource, scoutingSearchPlan } from "../scoutingDiscovery";
import { knownPlayerIdentity, playerFidelity } from "../playerLifecycle";
import {
  chairmanRecruitmentEstimate,
  chairmanShortlistIds,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "../recruitmentKnowledge";
import { progressScoutingWeekInPlace, startScouting } from "../scouting";
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

function discover<T extends ReturnType<typeof newGame>>(
  state: T,
  input: Parameters<typeof createScoutingBrief>[1],
): T {
  let next = createScoutingBrief(state, input) as T;
  const days = scoutingSearchPlan(next).searchDays;
  for (let day = 0; day < days; day++) next = advanceDay(next) as T;
  return next;
}


const base = newGame("Knowledge Audit FC", "Auditor", "KNOWLEDGE_SHORTLIST_AUDIT");
const discovered = discover(base, { id: "known-shortlist-audit", maxAge: 40 });
const brief = scoutingBrief(discovered, "known-shortlist-audit");
if (!brief) throw new Error("scouting brief missing");

const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(discovered, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact scouting candidate missing");

check("compact candidate starts as known fidelity", playerFidelity(discovered, compactId) === "known");
check("compact candidate is not initially shortlisted", !isChairmanShortlisted(discovered, compactId));

const discoveryEstimate = chairmanRecruitmentEstimate(discovered, compactId);
if (!discoveryEstimate?.valueRange || !discoveryEstimate.wageRange) {
  throw new Error("discovery estimate missing");
}
const fullyScouted = startScouting(discovered, compactId);
progressScoutingWeekInPlace(fullyScouted);
const fullEstimate = chairmanRecruitmentEstimate(fullyScouted, compactId);
if (!fullEstimate?.valueRange || !fullEstimate.wageRange) {
  throw new Error("full scouting estimate missing");
}
check(
  "better scouting narrows the fee estimate",
  fullEstimate.valueRange[1] - fullEstimate.valueRange[0] <
    discoveryEstimate.valueRange[1] - discoveryEstimate.valueRange[0],
);
check(
  "better scouting narrows the wage estimate",
  fullEstimate.wageRange[1] - fullEstimate.wageRange[0] <
    discoveryEstimate.wageRange[1] - discoveryEstimate.wageRange[0],
);
check(
  "better scouting raises the credible opening fee floor",
  fullEstimate.openingFee >= discoveryEstimate.openingFee,
);
check(
  "better scouting raises the credible opening wage floor",
  fullEstimate.openingWeeklyWage >= discoveryEstimate.openingWeeklyWage,
);
check(
  "opening estimates never expose the top of the scouting range as certainty",
  discoveryEstimate.openingFee < discoveryEstimate.estimatedMaxFee &&
    discoveryEstimate.openingWeeklyWage < discoveryEstimate.estimatedMaxWeeklyWage,
);

const shortlisted = toggleChairmanShortlist(discovered, compactId);
check("compact candidate can be shortlisted", isChairmanShortlisted(shortlisted, compactId));
check(
  "compact shortlist is represented by lifecycle reason",
  knownPlayerIdentity(shortlisted, compactId)?.reasons.includes("shortlisted") ?? false,
);
check(
  "compact shortlist does not require legacy detailed shortlist membership",
  !(shortlisted.football?.shortlist ?? []).includes(compactId),
);
check("shortlisting does not hydrate compact candidate", playerFidelity(shortlisted, compactId) === "known");
check(
  "chairman shortlist union contains compact identity",
  chairmanShortlistIds(shortlisted).includes(compactId),
);

const simulatedLegacyPrune = structuredClone(shortlisted);
simulatedLegacyPrune.football!.shortlist = simulatedLegacyPrune.football!.shortlist.filter((id) =>
  simulatedLegacyPrune.football!.players.some((player) => player.id === id),
);
check(
  "compact shortlist survives detailed-only legacy pruning",
  chairmanShortlistIds(simulatedLegacyPrune).includes(compactId),
);

const removed = toggleChairmanShortlist(simulatedLegacyPrune, compactId);
check("compact candidate can be removed from shortlist", !isChairmanShortlisted(removed, compactId));
check("removing shortlist does not erase identity", Boolean(knownPlayerIdentity(removed, compactId)));

const detailedTarget = discovered.football?.players.find(
  (player) => player.currentClubId !== null && !isUserClubReference(discovered, player.currentClubId),
);
if (!detailedTarget) throw new Error("detailed external candidate missing");
const detailedShortlisted = toggleChairmanShortlist(discovered, detailedTarget.id);
check(
  "detailed target keeps legacy shortlist in sync",
  detailedShortlisted.football?.shortlist.includes(detailedTarget.id) ?? false,
);
check(
  "detailed target also gains lifecycle shortlist reason",
  knownPlayerIdentity(detailedShortlisted, detailedTarget.id)?.reasons.includes("shortlisted") ?? false,
);

console.log(`\nrecruitment-knowledge: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
