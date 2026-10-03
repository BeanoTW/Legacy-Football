import { readFileSync } from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[DIRECTOR-DESK] Director wording, home desk priority and chronological inbox");

const office = readFileSync("src/components/game/ChairmansOffice.tsx", "utf8");
const studio = readFileSync("src/components/game/ChairmanStudio.tsx", "utf8");
const home = readFileSync("src/components/game/ClubHub.tsx", "utf8");
const inbox = readFileSync("src/components/game/InboxTab.tsx", "utf8");
const route = readFileSync("src/routes/index.tsx", "utf8");

assert(office.includes("Director's office") && !office.includes("Chairman's office"), "office heading uses Director wording");
assert(studio.includes(">The director<") && studio.includes("Save director"), "appearance studio uses Director wording");
assert(home.includes(">Your desk<") && !home.includes(">Chairman tasks<"), "home panel is Your desk");
assert(home.includes("topDecisions.length > 0 ? topDecisions : unreadBriefings.slice(0, 2)"), "home desk shows decisions first then unread briefings");
assert(home.indexOf('className="lf-home-desk') < home.indexOf('className="lf-suggested-next'), "suggested next steps render underneath the desk");
assert(inbox.includes("const all = state.inbox.slice().reverse()") && inbox.includes('title={filter === "archive" ? "Filed briefings"'), "inbox is one newest-received-first feed rather than priority lanes");
assert(route.includes("Legacy Football — Director Simulation"), "page metadata uses Director wording");

console.log("\n7 passed, 0 failed");
