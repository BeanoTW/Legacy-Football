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
    "mobile nav exposes five core areas plus More",
    /grid-cols-6/.test(read("src/components/game/MobileNav.tsx")),
  );
  check(
    "primary mobile tabs match the chairman core flow",
    /PRIMARY_TAB_IDS:\s*Tab\[\]\s*=\s*\["hub",\s*"inbox",\s*"squad",\s*"recruitment",\s*"stadium"\]/.test(
      tabs,
    ),
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
      .filter(
        (f) =>
          !/shared\/|__checks__\/|tabs\.ts$|playerPosition\.ts$|fixturePresentation\.ts$/.test(f),
      )
      .every((f) => /export (function|class|const) [A-Z]/.test(read(f))),
  );
}

console.log("\n[U5] Canonical selectors, not UI arithmetic");
{
  const hub = read("src/components/game/ClubHub.tsx");
  check(
    "hub health comes from the sustainability selector",
    /sustainabilitySnapshot\(state\)/.test(hub) && !/reserve\s*=\s*state\.cash\s*\*/.test(hub),
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
  const tacticalCard = read("src/components/game/shared/TacticalPlayerCard.tsx");
  check(
    "squad employment display uses canonical club and contract selectors",
    /clubOperatingModel\(/.test(squad) &&
      /contractEmploymentType\(/.test(tacticalCard) &&
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
  check("Find Players does not read exact wage demand before talks", !/wageDemand\(/.test(browser));
  check(
    "Scouting Reports do not read exact seller asking price before talks",
    !/transferTargetAskingPrice\(/.test(reports) && !/askingPrice\(/.test(reports),
  );
  check(
    "contracted scouting approaches use the explicit enquiry action",
    /submitTransferEnquiry\(/.test(browser) && /submitTransferEnquiry\(/.test(reports),
  );
  const operations = read("src/components/game/RecruitmentOperations.tsx");
  const negotiations = read("src/components/game/TransferNegotiationDesk.tsx");
  check(
    "recruitment squad views use canonical employment selectors",
    /clubOperatingModel\(/.test(operations) &&
      /contractEmploymentType\(/.test(operations) &&
      /ProfileFact label="Employment"/.test(operations),
  );
  check(
    "the live negotiations screen exposes the enquiry-to-bid action",
    /TransferNegotiationDesk/.test(operations) && /submitEnquiryOffer\(/.test(negotiations),
  );
  check(
    "negotiation controls use canonical level-aware fee and wage steps",
    /recruitmentTransferFeePolicyForClub\(/.test(negotiations) &&
      /recruitmentTransferFeePolicyForUser\(/.test(negotiations) &&
      /recruitmentUserNegotiationWageStep\(/.test(negotiations) &&
      !/n\.fee \+ 5000|step=\{5000\}|proposedWeeklyWage \+ 25|step=\{25\}/.test(negotiations),
  );
  check(
    "incoming agreements expose persisted registration before completion",
    /beginTransferRegistration\(/.test(negotiations) &&
      /n\.stage === "registration"/.test(negotiations) &&
      /Complete registration/.test(negotiations),
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
  check("loan-out UI uses the chairman market action", /arrangeUserPlayerLoanOut\(/.test(loanDesk));
  check("loan-in UI uses the chairman market action", /arrangeUserPlayerLoanIn\(/.test(browser));
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
      /clubLegacyRecord\(state, canonicalClubId\)/.test(leagueBrowser) &&
      /sameClubReference\(state, s\.club, canonicalClubId\)/.test(leagueBrowser),
  );
  check(
    "league browser surfaces permanent club legacy records",
    /label="League titles"/.test(leagueBrowser) &&
      /label="Best finish"/.test(leagueBrowser) &&
      /label="Record buy"/.test(leagueBrowser) &&
      /label="Record sale"/.test(leagueBrowser) &&
      /label="Record crowd"/.test(leagueBrowser),
  );

  const clubHub = read("src/components/game/ClubHub.tsx");
  const fixtures = read("src/components/game/FixturesTab.tsx");
  const dashboard = read("src/components/game/DashboardTab.tsx");
  const world = read("src/components/game/WorldInspector.tsx");
  check(
    "core club screens never compare opaque ownership or table identity to clubName",
    [clubHub, fixtures, dashboard, world].every(
      (source) =>
        !/currentClubId\s*===\s*state\.clubName/.test(source) &&
        !/(?:row|r)\.team\s*===\s*state\.clubName/.test(source),
    ),
  );
  check(
    "core club screens render stored opponent and table refs through display-name gateway",
    /clubDisplayName\(state, nextFixture\.opponent\)/.test(clubHub) &&
      /clubDisplayName\(state, row\.team\)/.test(clubHub) &&
      /clubDisplayName\(state, (?:f|fixture)\.opponent\)/.test(fixtures) &&
      /clubDisplayName\(state, r\.team\)/.test(fixtures) &&
      /clubDisplayName\(state, lastResult\.opponent\)/.test(dashboard) &&
      /clubDisplayName\(state, row\.team\)/.test(world),
  );
  check(
    "club hub squad count uses the canonical registration-aware squad selector",
    /userSquad\(state\)\.length/.test(clubHub) && !/football\?\.players\?\.filter/.test(clubHub),
  );
}

console.log("\n[U9] Chairman club tracking");
{
  const leagueBrowser = read("src/components/LeagueBrowser.tsx");
  check(
    "league browser exposes the canonical world-tracking action",
    /setWorldClubTracked\(next, canonicalClubId, !tracked\)/.test(leagueBrowser) &&
      /Track club/.test(leagueBrowser) &&
      /Stop tracking/.test(leagueBrowser),
  );
  check(
    "legacy league browser is not routed alongside the consolidated competitions screen",
    !/<LeagueBrowser\b/.test(route) && /<WorldInspector state=\{state\}/.test(route),
  );
  check(
    "the user club cannot be redundantly tracked from its own profile",
    /!isUserClub &&/.test(leagueBrowser),
  );
}

console.log("\n[U10] Football performance visibility");
{
  const squad = read("src/components/game/SquadSelectionTab.tsx");
  check(
    "squad screen surfaces canonical cohesion and morale state",
    /PLAYER_COHESION_DEFAULT/.test(squad) &&
      /PLAYER_MORALE_DEFAULT/.test(squad) &&
      /label="Cohesion"/.test(squad) &&
      /label="Morale"/.test(squad),
  );
  check(
    "squad screen derives manager quality from the canonical performance selector",
    /playerManagerQuality\(state\)/.test(squad) && /label="Manager"/.test(squad),
  );
}

console.log("\n[U11] Legacy history surface");
{
  const history = read("src/components/game/HistoryTab.tsx");
  check(
    "history screen surfaces the durable club legacy accumulator",
    /clubLegacyRecord\(state, userId\)/.test(history) &&
      /title="Club legacy"/.test(history) &&
      /label="League titles"/.test(history) &&
      /label="Record crowd"/.test(history),
  );
  check(
    "history screen exposes completed season outcomes without display-name identity comparisons",
    /title="Season record"/.test(history) &&
      /isUserClubReference\(state, archived\.champion\)/.test(history) &&
      /archived\?\.promoted\.some/.test(history) &&
      /archived\?\.relegated\.some/.test(history),
  );
}

console.log("\n[U12] Legacy Football product surface");
{
  const newGame = read("src/components/game/NewGame.tsx");
  check(
    "new career screen uses the Legacy Football product name",
    /title="Legacy Football"/.test(newGame) &&
      /Build a club legacy from non-league to the top/.test(newGame),
  );
  check(
    "history navigation is presented as Legacy rather than the old ledger-only label",
    /\["history",\s*"Legacy",\s*History\]/.test(tabs) && !/\["history",\s*"Ledger"/.test(tabs),
  );
  check(
    "route metadata uses the Legacy Football product identity",
    /Legacy Football — Chairman Simulation/.test(route) &&
      !/Chairman FC — Football Finance Sim/.test(route),
  );
}

console.log("\n[U13] Canonical football level terminology");
{
  const leagueBrowser = read("src/components/LeagueBrowser.tsx");
  const world = read("src/components/game/WorldInspector.tsx");
  const history = read("src/components/game/HistoryTab.tsx");
  const clubHub = read("src/components/game/ClubHub.tsx");
  check(
    "league and world screens expose football levels instead of persisted tier numbers",
    /Football Level \{footballLevelOfLeague\(league\)\}/.test(leagueBrowser) &&
      /Football Level \{footballLevelOfLeague\(league\)\}/.test(world) &&
      !/Tier \{league\.tier\}/.test(leagueBrowser) &&
      !/Tier \{league\.tier\}/.test(world),
  );
  check(
    "legacy best-finish cards convert persisted tiers before display",
    /legacyTierToFootballLevel\(legacy\.bestLeagueFinish\.tier\)/.test(leagueBrowser) &&
      /legacyTierToFootballLevel\(legacy\.bestLeagueFinish\.tier\)/.test(history),
  );
  check(
    "competitions screen shows the chairman's current competition on the canonical football scale",
    /footballLevelOfLeague\(league\)/.test(world) &&
      /leaguePresentationName\(league\.name\)/.test(world),
  );
}

console.log("\n[U14] New career setup matches the live game");
{
  const newGame = read("src/components/game/NewGame.tsx");
  check(
    "new career copy advertises the actual Level 7 semi-professional start",
    /semi-professional club at Football Level 7/.test(newGame),
  );
  check(
    "new career opening cash matches the canonical £220,000 start",
    /£220,000/.test(newGame) && !/£3M/.test(newGame),
  );
}

console.log("\n[U15] Match centre identity and competition context");
{
  const matchday = read("src/components/game/MatchDayOverlay.tsx");
  const viewer = read("src/components/game/MatchPitchViewer.tsx");
  check(
    "match centre resolves stored opponent references through the display-name gateway",
    /clubDisplayName\(state, lm\.fixture\.opponent\)/.test(matchday),
  );
  check(
    "match centre shows the live competition instead of stale Division Four copy",
    /matchLeague\.name/.test(matchday) &&
      /footballLevelOfLeague\(matchLeague\)/.test(matchday) &&
      !/Division Four/.test(matchday),
  );
  check(
    "match centre renders the canonical event stream through the 2D viewer",
    /<MatchPitchViewer[\s\S]*?events=\{lm\.events\}/.test(matchday) &&
      /event\.zone/.test(viewer) &&
      /event\.phase/.test(viewer),
  );
  check(
    "2D replay exposes play, restart, skip and scrub controls",
    /Pause replay/.test(viewer) &&
      /Restart replay/.test(viewer) &&
      /Skip replay/.test(viewer) &&
      /type="range"/.test(viewer),
  );
  check(
    "2D highlights derive passing paths and player movement without UI randomness",
    /function eventPath/.test(viewer) &&
      /function playerPosition/.test(viewer) &&
      /<polyline/.test(viewer) &&
      !/Math\.random/.test(viewer),
  );
  check(
    "match centre hides half-time and full-time verdicts until replay completion",
    /lm\.status === "halfTime" && finishedReplay/.test(matchday) &&
      /lm\.status === "fullTime" && finishedReplay/.test(matchday) &&
      /continueSecondHalf/.test(matchday) &&
      !/applyHalfTimeChoice/.test(matchday) &&
      /onReplayProgress/.test(viewer),
  );
  check(
    "2D viewer identifies persisted lineup players on the pitch",
    /userLineup\[index\]/.test(viewer) &&
      /player\?\.shirtNumber/.test(viewer) &&
      /player\.name/.test(viewer),
  );
}

console.log("\n[U16] Calendar and advance opponent identity");
{
  const preview = read("src/components/game/AdvanceInboxPreview.tsx");
  const calendar = read("src/components/game/ContinueCalendar.tsx");
  check(
    "advance preview resolves stored opponent references through the display-name gateway",
    /clubDisplayName\(state, fixture\.opponent\)/.test(preview),
  );
  check(
    "calendar resolves stored opponent references through the display-name gateway",
    /clubDisplayName\(state, fixture\.opponent\)/.test(calendar),
  );
  check(
    "advance preview binds fixture cards to their actual day and opponent",
    /\(item\.dayOfWeek \?\? 5\) === currentDay/.test(preview) &&
      /candidate\.opponent === event\.fixtureOpponent/.test(preview),
  );
  check(
    "timeline projects dated fixtures instead of forcing Saturday",
    /const fixtureDay = fixture\.dayOfWeek \?\? 5/.test(read("src/lib/game/timeline.ts")),
  );
}


console.log("\n[U17] Mobile fixtures scrolling");
{
  const fixtures = read("src/components/game/FixturesTab.tsx");
  check(
    "fixtures screen keeps natural document flow on mobile",
    /min-h-full content-start/.test(fixtures) && /md:h-full md:min-h-0/.test(fixtures),
  );
  check(
    "fixtures screen avoids nested mobile scroll traps",
    /lf-fixture-calendar md:contained-scroll/.test(fixtures) &&
      /md:overflow-y-auto/.test(fixtures),
  );
}

console.log("\n[U18] Shared tactical player-card system");
{
  const card = read("src/components/game/shared/TacticalPlayerCard.tsx");
  const squad = read("src/components/game/SquadSelectionTab.tsx");
  const browser = read("src/components/game/ScoutingBrowser.tsx");
  const reports = read("src/components/game/ScoutingReports.tsx");
  const profile = read("src/components/game/shared/PlayerProfileSheet.tsx");
  check(
    "player surfaces share one tactical card system",
    /export function TacticalPlayerCard/.test(card) &&
      /<TacticalPlayerCard/.test(squad) &&
      /<TacticalPlayerCard/.test(browser) &&
      /<TacticalPlayerCard/.test(reports),
  );
  check(
    "recruitment cards use scouting-safe overall presentation",
    /scoutedOverallPresentation/.test(card) &&
      !/player\.potentialAbility/.test(card.split("function RecruitmentPlayerData")[1] ?? ""),
  );
  check(
    "player profile header uses the tactical dark visual language",
    /bg-\[#071713\]/.test(profile) &&
      /Scouted \{knowledge\}%/.test(profile),
  );
}

console.log("\n[U19] Dense squad planning");
{
  const card = read("src/components/game/shared/TacticalPlayerCard.tsx");
  const profile = read("src/components/game/shared/PlayerProfileSheet.tsx");
  check(
    "owned squad cards use dense planning rows",
    /mode !== "recruitment"/.test(card) &&
      /min-h-\[3\.75rem\]/.test(card) &&
      /min-h-\[4\.45rem\]/.test(card),
  );
  check(
    "player attributes stay two-column on mobile",
    /grid grid-cols-2 gap-x-3 gap-y-2/.test(profile),
  );
  check(
    "owned profile shows exact club value and wage rather than scouting ranges",
    /owned \? fmtMoneyExact\(player\.marketValue\)/.test(profile) &&
      /fmtMoneyExact\(contract\.weeklyWage\)/.test(profile),
  );
}

console.log("\n[U20] Squad planning views");
{
  const squad = read("src/components/game/SquadSelectionTab.tsx");
  check(
    "redundant squad details tab is removed",
    !/setView\("details"\)/.test(squad) &&
      !/Squad details & contracts/.test(squad) &&
      /setView\("pitch"\)/.test(squad) &&
      /setView\("stats"\)/.test(squad),
  );
}

console.log("\n[U21] First XI pitch polish");
{
  const squad = read("src/components/game/SquadSelectionTab.tsx");
  check(
    "first XI pitch exposes formation, average ability and fitness",
    /Avg OVR/.test(squad) &&
      /Avg fit/.test(squad) &&
      /Manager selection/.test(squad),
  );
  check(
    "pitch players expose fitness and role context without expanding card height",
    /fitnessTone/.test(squad) &&
      /form\.averageRating\.toFixed\(1\)/.test(squad) &&
      /Tap a player for profile/.test(squad),
  );
}

console.log("\n[U22] Match replay event fidelity");
{
  const viewer = read("src/components/game/MatchPitchViewer.tsx");
  check(
    "goal replay crosses the goal line while chances terminate by outcome",
    /event\.type === "goal"/.test(viewer) &&
      /x: direction === 1 \? 99\.3 : 0\.7/.test(viewer) &&
      /chanceOutcome\(event\)/.test(viewer),
  );
  check(
    "replay score changes only when the goal animation reaches the net",
    /active\?\.type === "goal" && progress >= 0\.9/.test(viewer),
  );
  check(
    "replay actor and defending keeper react to the canonical event",
    /event\.actorPlayerId === player\.playerId/.test(viewer) &&
      /defendingKeeper/.test(viewer),
  );
  check(
    "pausing replay does not force the current event to completion",
    !/if \(!playing\) setProgress\(1\)/.test(viewer) &&
      /progressRef/.test(viewer),
  );
}

console.log("\n[U23] Match replay build-up and pace");
{
  const viewer = read("src/components/game/MatchPitchViewer.tsx");
  check(
    "highlight paths contain multiple build-up passes before the final action",
    /const pass1/.test(viewer) &&
      /const pass2/.test(viewer) &&
      /const pass3/.test(viewer) &&
      /const pass4/.test(viewer) &&
      /Final ball/.test(viewer),
  );
  check(
    "viewer offers steady fast and rapid replay speeds",
    /PLAYBACK_SPEEDS = \[1, 2, 4\]/.test(viewer) &&
      /setPlaybackSpeed/.test(viewer) &&
      /eventDurationMs/.test(viewer),
  );
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
