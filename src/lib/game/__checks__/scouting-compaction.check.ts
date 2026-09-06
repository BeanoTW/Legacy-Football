import { strict as assert } from "node:assert";
import { migrateSave, newGame, SAVE_VERSION } from "../engine";
import { createIdbSaveStore } from "../storage/idbStore";
import { createMemoryRecordStore } from "../storage/memoryRecords";
import {
  discoveredPlayerIds,
  scoutingCandidateProfile,
  type ScoutingBrief,
  type ScoutingCandidateProfile,
} from "../scoutingDiscovery";
import {
  CHUNK_KINDS,
  RETAIN_SCOUTING_BRIEFS,
  compactState,
} from "../storage/compaction";
import { absoluteWeek } from "../time";

const state = newGame(
  "Scouting Compaction FC",
  "Auditor",
  "SCOUTING_COMPACTION_AUDIT",
);
state.season = 3;
state.week = 46;
if (!state.football) throw new Error("football state missing");

const totalBriefs = RETAIN_SCOUTING_BRIEFS + 15;
const seasonStart = absoluteWeek(state.season, 1);
const profiles: Record<string, ScoutingCandidateProfile> = {};
const briefs: ScoutingBrief[] = [];

for (let index = 0; index < totalBriefs; index++) {
  const playerId = `legacy-discovery-${String(index).padStart(2, "0")}`;
  const profile: ScoutingCandidateProfile = {
    source: index % 2 === 0 ? "fringe" : "detailed",
    currentAbility: 45 + (index % 15),
    potentialAbility: 55 + (index % 20),
    marketValue: 1_000 + index * 250,
    wageExpectation: 50 + index * 5,
  };
  // Simulate an old save: hidden facts exist only inside each brief rather
  // than the newer persistent profile map / lifecycle reason.
  profiles[playerId] = profile;
  briefs.push({
    id: `brief-${String(index).padStart(2, "0")}`,
    createdAtAbsoluteWeek: seasonStart + index,
    status: "complete",
    candidateIds: [playerId],
    candidateSources: { [playerId]: profile.source },
    candidateProfiles: { [playerId]: profile },
  });
}

state.football.scoutingDiscovery = {
  briefs,
  profiles: {},
};

const before = JSON.stringify(state);
const { core, chunks } = compactState(state);
assert.equal(JSON.stringify(state), before, "compaction must not mutate the canonical input");
assert.ok(core.football?.scoutingDiscovery, "compacted save should retain scouting state");

const discovery = core.football.scoutingDiscovery;
assert.equal(
  discovery.briefs.length,
  RETAIN_SCOUTING_BRIEFS,
  "hot save should retain only the bounded recent scouting tail",
);
assert.deepEqual(
  discovery.briefs.map((brief) => brief.id),
  briefs.slice(-RETAIN_SCOUTING_BRIEFS).map((brief) => brief.id),
  "compaction should keep the most recent briefs in their original order",
);

const scoutingChunks = chunks.filter((chunk) => chunk.kind === "history:scouting");
const archivedBriefs = scoutingChunks.flatMap((chunk) => chunk.rows) as ScoutingBrief[];
assert.equal(
  archivedBriefs.length,
  totalBriefs - RETAIN_SCOUTING_BRIEFS,
  "every pruned brief should move to cold scouting history",
);
assert.ok(
  scoutingChunks.every((chunk) => chunk.season === state.season),
  "high-frequency current-season scouting may move to history without waiting for rollover",
);
assert.ok(
  CHUNK_KINDS.includes("history:scouting"),
  "history repository must recognise scouting chunks",
);

const allCandidateIds = briefs.flatMap((brief) => brief.candidateIds);
const stillDiscovered = discoveredPlayerIds(core);
assert.equal(
  stillDiscovered.size,
  allCandidateIds.length,
  "brief pruning must not lose any previously discovered identity",
);
for (const playerId of allCandidateIds) {
  assert.ok(stillDiscovered.has(playerId), `${playerId} should remain discovered after compaction`);
}

const archivedIds = archivedBriefs.flatMap((brief) => brief.candidateIds).sort();
assert.deepEqual(
  discovery.historicalCandidateIds,
  archivedIds,
  "cold brief identities should collapse into a sorted deduplicated compatibility ledger",
);
for (const playerId of archivedIds) {
  assert.deepEqual(
    scoutingCandidateProfile(core, playerId),
    profiles[playerId],
    `${playerId} hidden scouting profile should be promoted before its old brief is archived`,
  );
}

const second = compactState(core);
assert.equal(
  second.chunks.filter((chunk) => chunk.kind === "history:scouting").length,
  0,
  "re-compacting the bounded core must not archive the same scouting briefs twice",
);
assert.equal(
  JSON.stringify(second.core),
  JSON.stringify(core),
  "bounded scouting compaction should be byte-stable on the second pass",
);

const records = createMemoryRecordStore();
const store = createIdbSaveStore({
  records,
  migrate: migrateSave,
  currentVersion: SAVE_VERSION,
  legacy: null,
  now: () => 1_700_000_000_000,
});
assert.deepEqual(await store.save(state), [], "scouting-compacted state should persist cleanly");
const loaded = (await store.load()).state;
assert.ok(loaded?.football?.scoutingDiscovery, "compacted scouting core should reload");
assert.equal(
  loaded.football.scoutingDiscovery.briefs.length,
  RETAIN_SCOUTING_BRIEFS,
  "persisted core should contain only the hot scouting tail",
);
let storedHistory = await store.history.readAll<ScoutingBrief>("history:scouting");
assert.equal(
  storedHistory.length,
  archivedBriefs.length,
  "history repository should return every scouting brief removed from the first save",
);

// Add ten genuinely newer searches, then save again. The next compaction should
// archive ten of the previous hot briefs and append them to the same season's
// history record rather than overwriting the first batch.
for (let index = 0; index < 10; index++) {
  const playerId = `later-discovery-${String(index).padStart(2, "0")}`;
  const profile: ScoutingCandidateProfile = {
    source: "fringe",
    currentAbility: 55 + index,
    potentialAbility: 65 + index,
    marketValue: 5_000 + index * 500,
    wageExpectation: 100 + index * 10,
  };
  loaded.football.scoutingDiscovery.briefs.push({
    id: `later-brief-${String(index).padStart(2, "0")}`,
    createdAtAbsoluteWeek: absoluteWeek(loaded.season, loaded.week),
    status: "complete",
    candidateIds: [playerId],
    candidateSources: { [playerId]: profile.source },
    candidateProfiles: { [playerId]: profile },
  });
}
assert.deepEqual(await store.save(loaded), [], "second scouting-compacted save should persist cleanly");
const reloaded = (await store.load()).state;
assert.ok(reloaded?.football?.scoutingDiscovery, "second compacted scouting core should reload");
storedHistory = await store.history.readAll<ScoutingBrief>("history:scouting");
assert.equal(
  storedHistory.length,
  archivedBriefs.length + 10,
  "successive saves should append newly cold scouting briefs without loss or duplication",
);
assert.equal(
  new Set(storedHistory.map((brief) => brief.id)).size,
  storedHistory.length,
  "persisted scouting history should not duplicate brief ids",
);
assert.equal(
  discoveredPlayerIds(reloaded).size,
  totalBriefs + 10,
  "all old and newly searched candidates should remain chairman-visible after repeated compaction",
);

console.log(
  `scouting-compaction: passed — ${archivedBriefs.length} old briefs archived, ${discovery.briefs.length} hot`,
);
