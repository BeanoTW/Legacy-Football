import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`  ✓ ${message}`);
}

console.log("\n[FRINGE-SQUAD-BROWSING] Competition squads outside Focus");

const world = readFileSync("src/components/game/WorldInspector.tsx", "utf8");
const helper = readFileSync("src/lib/game/fringeSquadBrowsing.ts", "utf8");
const route = readFileSync("src/routes/index.tsx", "utf8");

assert(
  world.includes("browsableFringeSquad(state, club)"),
  "competition club drilldown falls back to the compact persistent squad",
);
assert(
  world.includes("preserveFringePlayerForProfile(s, player)"),
  "opening a compact player persists only that selected identity for the profile stack",
);
assert(
  world.includes(">?</td>") || world.includes(">?</"),
  "unscouted compact squad rows do not expose hidden overall ability",
);
assert(
  helper.includes("previewFringePlayersForClub(state, canonical)"),
  "squad browsing reads the compact player world through the deterministic preview gateway",
);
assert(
  helper.includes("preserveKnownIdentityInPlace") && helper.includes("source: \"fringe\""),
  "selected compact players bridge into the existing known-player/scouting model",
);
assert(
  !helper.includes("football.players.push") && !helper.includes("football.players ="),
  "browsing never hydrates a fringe club into detailed player storage",
);
assert(
  route.includes("<WorldInspector state={state} update={update} />"),
  "competition browsing uses the canonical persisted game update path",
);

assert(
  helper.includes("footballLevelOfClub(state, canonical)"),
  "fringe squad values resolve from the club's canonical football level",
);

console.log("\n8 passed, 0 failed");
