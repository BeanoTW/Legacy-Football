import { newGame } from "../engine";
import { createScoutingBrief, scoutingBrief, scoutingCandidateSource } from "../scoutingDiscovery";
import { knownPlayerIdentity, playerFidelity } from "../playerLifecycle";
import {
  chairmanShortlistIds,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "../recruitmentKnowledge";

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

const base = newGame("Knowledge Audit FC", "Auditor", "KNOWLEDGE_SHORTLIST_AUDIT");
const discovered = createScoutingBrief(base, { id: "known-shortlist-audit", maxAge: 40 });
const brief = scoutingBrief(discovered, "known-shortlist-audit");
if (!brief) throw new Error("scouting brief missing");

const compactId = brief.candidateIds.find(
  (playerId) => scoutingCandidateSource(discovered, brief.id, playerId) === "fringe",
);
if (!compactId) throw new Error("compact scouting candidate missing");

check("compact candidate starts as known fidelity", playerFidelity(discovered, compactId) === "known");
check("compact candidate is not initially shortlisted", !isChairmanShortlisted(discovered, compactId));

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
  (player) => player.currentClubId !== discovered.clubName && player.currentClubId !== null,
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
