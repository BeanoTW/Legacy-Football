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
    "squad",
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
    "settings",
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
  const RETIRED = ["transfers", "scouting", "finances"];
  check(
    "no retired legacy tab has returned",
    RETIRED.every((t) => !registered.includes(t)),
  );
  check(
    "mobile nav exposes four core areas plus More",
    /grid-cols-5/.test(read("src/components/game/MobileNav.tsx")),
  );
  check(
    "primary mobile tabs match the chairman core flow",
    /PRIMARY_TAB_IDS:\s*Tab\[\]\s*=\s*\["hub",\s*"inbox",\s*"squad",\s*"recruitment"\]/.test(tabs),
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
      .filter((f) => !/shared\/|__checks__\/|tabs\.ts$|playerPosition\.ts$/.test(f))
      .every((f) => /export (function|class|const) [A-Z]/.test(read(f))),
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
  const squad = read("src/components/game/SquadSelectionTab.tsx");
  check(
    "squad employment display uses canonical club and contract selectors",
    /clubOperatingModel\(/.test(squad) &&
      /contractEmploymentType\(/.test(squad) &&
      /Club operating model/.test(squad),
  );
  check(
    "professionalisation UI uses readiness and canonical action rather than direct state mutation",
    /userProfessionalisationReadiness\(state\)/.test(squad) &&
      /professionaliseUserClub\(s\)/.test(squad) &&
      /Confirm full-time transition/.test(squad) &&
      !/employment\.clubModels\[[^\]]+\]\s*=/.test(squad) &&
      !/setClubOperatingModelInPlace\(/.test(squad),
  );
}

console.log("\n[U6] Recruitment knowledge boundary");
{
  const browser = read("src/components/game/ScoutingBrowser.tsx");
  const reports = read("src/components/game/ScoutingReports.tsx");
  check(
    "Find Players does not read exact seller asking price before talks",
    !/transferTargetAskingPrice\(/.test(browser) && !/askingPrice\(/.test(browser),
  );
  check(
    "Find Players does not read exact wage demand before talks",
    !/wageDemand\(/.test(browser),
  );
  check(
    "Scouting Reports do not read exact seller asking price before talks",
    !/transferTargetAskingPrice\(/.test(reports) && !/askingPrice\(/.test(reports),
  );
  check(
    "contracted scouting approaches use the explicit enquiry action",
    /submitTransferEnquiry\(/.test(browser) && /submitTransferEnquiry\(/.test(reports),
  );
  const operations = read("src/components/game/RecruitmentOperations.tsx");
  check(
    "recruitment squad views use canonical employment selectors",
    /clubOperatingModel\(/.test(operations) &&
      /contractEmploymentType\(/.test(operations) &&
      /ProfileFact label="Employment"/.test(operations),
  );
  check(
    "the live negotiations screen exposes the enquiry-to-bid action",
    /submitEnquiryOffer\(/.test(operations),
  );
  check(
    "negotiation controls use canonical level-aware fee and wage steps",
    /recruitmentTransferFeePolicyForClub\(/.test(operations) &&
      /recruitmentTransferFeePolicyForUser\(/.test(operations) &&
      /recruitmentUserNegotiationWageStep\(/.test(operations) &&
      !/n\.fee \+ 5000|step=\{5000\}|proposedWeeklyWage \+ 25|step=\{25\}/.test(operations),
  );
  check(
    "incoming agreements expose persisted registration before completion",
    /beginTransferRegistration\(/.test(operations) &&
      /n\.stage === "registration"/.test(operations) &&
      /Complete registration/.test(operations),
  );
}

console.log("\n[U7] Loan chairman boundary");
{
  const loanDesk = read("src/components/game/LoanDesk.tsx");
  const browser = read("src/components/game/ScoutingBrowser.tsx");
  const loanUi = [loanDesk, browser].join("\n");
  check(
    "loan UI never calls the low-level registration primitive",
    !/startPlayerLoanInPlace\(/.test(loanUi),
  );
  check(
    "loan-out UI uses the chairman market action",
    /arrangeUserPlayerLoanOut\(/.test(loanDesk),
  );
  check(
    "loan-in UI uses the chairman market action",
    /arrangeUserPlayerLoanIn\(/.test(browser),
  );
  check(
    "loan termination UI uses the chairman-authorised action",
    /terminateUserPlayerLoan\(/.test(loanDesk) && !/terminatePlayerLoan\(/.test(loanDesk),
  );
  check(
    "loan registration controls expose the canonical transfer-window state",
    /isTransferWindowOpen\(state\)/.test(loanDesk) &&
      /windowStatus\(state\)/.test(loanDesk) &&
      /isTransferWindowOpen\(state\)/.test(browser) &&
      /windowStatus\(state\)/.test(browser),
  );
}


console.log("\n[U8] Opaque club identity presentation boundary");
{
  const leagueBrowser = read("src/components/LeagueBrowser.tsx");
  check(
    "league browser renders club references through the display-name gateway",
    /clubDisplayName\(state, r\.team\)/.test(leagueBrowser) &&
      /clubDisplayName\(state, f\.home\)/.test(leagueBrowser) &&
      /clubDisplayName\(state, f\.away\)/.test(leagueBrowser) &&
      /clubDisplayName\(state, c\.club\)/.test(leagueBrowser),
  );
  check(
    "league browser highlights the user club through canonical identity",
    /isUserClubReference\(state, r\.team\)/.test(leagueBrowser) &&
      /isUserClubReference\(state, c\.club\)/.test(leagueBrowser),
  );
  check(
    "league browser club profiles read durable legacy facts canonically",
    /canonicalClubReference\(state, club\)/.test(leagueBrowser) &&
      /clubLegacyRecord\(state, canonicalClubId\)/.test(leagueBrowser),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
