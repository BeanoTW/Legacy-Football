/* UI architecture verification — Phase 0d.
   Run with:  bun src/lib/game/__checks__/ui-architecture.check.ts

   Guards the frontend decomposition: navigation completeness, the mutation
   boundary, import direction and UI-side randomness. Static analysis only —
   gameplay determinism is covered by the snapshot/finance suites.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = `${dir}/${e}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const uiFiles = [...walk("src/components"), ...walk("src/routes")].filter(
  (f) => /\.tsx?$/.test(f) && !f.includes("/components/ui/") && !f.endsWith("routeTree.gen.ts"),
);
const domainFiles = walk("src/lib/game").filter(
  (f) => /\.tsx?$/.test(f) && !f.includes("__checks__"),
);
const read = (f: string) => readFileSync(f, "utf8");
const route = read("src/routes/index.tsx");
const tabs = read("src/components/game/tabs.ts");

console.log("\n[U1] Route is an orchestration shell");
{
  check(
    "index.tsx stays small (< 400 lines)",
    route.split("\n").length < 400,
    `${route.split("\n").length} lines`,
  );
  check(
    "index.tsx owns lifecycle only (no tab implementations)",
    !/function (Dashboard|CashFlow|Tickets|StaffTab|ClubHub|InboxTab|Fixtures|History)\b/.test(
      route,
    ),
  );
  check("index.tsx renders the game shell", /useGame\(\)/.test(route) && /<MobileNav/.test(route));
}

console.log("\n[U2] Navigation completeness");
{
  const EXPECTED = [
    "inbox",
    "hub",
    "board",
    "commercial",
    "dashboard",
    "cashflow",
    "tickets",
    "recruitment",
    "staff",
    "stadium",
    "fixtures",
    "leagues",
    "world",
    "history",
  ];
  const registered = [...tabs.matchAll(/\["([a-z]+)",\s*"/g)].map((m) => m[1]);
  check(
    "every expected tab id is registered",
    EXPECTED.every((t) => registered.includes(t)),
    EXPECTED.filter((t) => !registered.includes(t)).join(","),
  );
  check(
    "no unexpected tab id appeared",
    registered.every((t) => EXPECTED.includes(t)),
    registered.filter((t) => !EXPECTED.includes(t)).join(","),
  );
  const unresolved = registered.filter((t) => !new RegExp(`tab === "${t}"`).test(route));
  check(
    "every navigation destination resolves to a screen",
    unresolved.length === 0,
    unresolved.join(","),
  );
  const RETIRED = ["squad", "transfers", "scouting", "finances"];
  check(
    "no retired legacy tab has returned",
    RETIRED.every((t) => !registered.includes(t)),
  );
  check(
    "mobile nav still exposes the five-slot bar",
    /grid-cols-5/.test(read("src/components/game/MobileNav.tsx")),
  );
  check(
    "primary mobile tabs unchanged",
    /PRIMARY_TAB_IDS: Tab\[\] = \["inbox", "hub", "recruitment", "board"\]/.test(tabs),
  );
}

console.log("\n[U3] Mutation boundary");
{
  const offenders = (re: RegExp) => uiFiles.filter((f) => re.test(read(f)));
  check(
    "no direct cash writes in UI",
    offenders(/\.cash\s*[-+*]?=[^=]/).length === 0,
    offenders(/\.cash\s*[-+*]?=[^=]/).join(","),
  );
  check(
    "no direct finance-ledger mutation in UI",
    offenders(/(financeLedger|ledger)\.(push|splice|pop|shift)\(/).length === 0,
  );
  check(
    "no direct squad/contract mutation in UI",
    offenders(/football\.(players|contracts|negotiations)\.(push|splice)/).length === 0,
  );
  check(
    "no direct infrastructure mutation in UI",
    offenders(/infrastructure\.(assets|projects)\.(push|splice)/).length === 0,
  );
  check(
    "no direct board mutation in UI",
    offenders(/board\.(directors|objectives)\.(push|splice)/).length === 0,
  );
  check(
    "no uncontrolled randomness in UI",
    offenders(/Math\.random\(/).length === 0,
    offenders(/Math\.random\(/).join(","),
  );
  check(
    "no wall-clock reads in UI",
    offenders(/Date\.now\(/).length === 0,
    offenders(/Date\.now\(/).join(","),
  );
}

console.log("\n[U4] Import direction");
{
  const bad = domainFiles.filter((f) =>
    /from "@\/components|from "@\/routes|from "\.\.\/\.\.\/components/.test(read(f)),
  );
  check("domain modules never import UI", bad.length === 0, bad.join(","));
  const screens = walk("src/components/game").filter((f) => /\.tsx?$/.test(f));
  check(
    "screens import canonical domain modules, not each other's logic",
    screens.every((f) => !/from "\.\.\/\.\.\/routes/.test(read(f))),
  );
  check(
    "extracted screens all export a component",
    screens
      .filter((f) => !/shared\/|tabs\.ts$/.test(f))
      .every((f) => /export function [A-Z]/.test(read(f))),
  );
}

console.log("\n[U5] Canonical selectors, not UI arithmetic");
{
  const hub = read("src/components/game/ClubHub.tsx");
  check(
    "hub health comes from the sustainability selector",
    /canonicalFinancialHealth\(/.test(hub) && !/reserve\s*=\s*state\.cash\s*\*/.test(hub),
  );
  check(
    "financial health panel reads the snapshot selector",
    /sustainabilitySnapshot\(state\)/.test(read("src/components/game/DashboardTab.tsx")),
  );
  check(
    "staff hiring goes through the engine action",
    /hireStaffMember\(|sackStaffMember\(/.test(read("src/components/game/StaffTab.tsx")),
  );
  check(
    "matchday overlay uses the exactly-once commit action",
    /commitLiveMatchAndAdvance\(/.test(read("src/components/game/MatchDayOverlay.tsx")),
  );
  check(
    "inbox decisions go through handleInboxChoice",
    /handleInboxChoice\(/.test(read("src/components/game/InboxTab.tsx")),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
