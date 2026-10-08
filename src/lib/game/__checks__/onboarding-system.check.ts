import { readFileSync } from "node:fs";
import { migrateSave, newGame } from "../engine";
import {
  ONBOARDING_CHAPTERS,
  activeOnboardingChapter,
  completeOnboardingChapterInPlace,
  replayOnboardingChapterInPlace,
  skipAllOnboardingInPlace,
} from "../onboarding";

let passed = 0;
let failed = 0;
const check = (label: string, ok: boolean) => {
  if (ok) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.log("  ✗ " + label);
  }
};

console.log("\n[ONBOARDING] Progressive director tutorial");

const fresh = newGame("Tutorial Town", "Director Test", "onboarding-seed");
check("new careers explicitly enable onboarding", fresh.onboarding?.enabled === true);
check("new careers begin with no completed chapters", fresh.onboarding?.completedChapterIds.length === 0);
check("welcome overrides contextual chapters until completed", activeOnboardingChapter(fresh, "recruitment")?.id === "welcome");

completeOnboardingChapterInPlace(fresh, "welcome");
check("home chapter follows the welcome sequence", activeOnboardingChapter(fresh, "hub")?.id === "home");
completeOnboardingChapterInPlace(fresh, "home");
check("completed contextual chapter does not reopen automatically", activeOnboardingChapter(fresh, "hub") === null);
check("first transfer visit opens transfer philosophy", activeOnboardingChapter(fresh, "recruitment")?.id === "transfers");

completeOnboardingChapterInPlace(fresh, "transfers");
replayOnboardingChapterInPlace(fresh, "transfers");
check("completed chapters can be explicitly replayed", activeOnboardingChapter(fresh, "hub")?.id === "transfers");
completeOnboardingChapterInPlace(fresh, "transfers");
skipAllOnboardingInPlace(fresh);
check("skip-all suppresses every automatic chapter", activeOnboardingChapter(fresh, "staff") === null);

const legacySource = newGame("Legacy Tutorial", "Old Director", "legacy-onboarding") as unknown as Record<string, unknown>;
delete legacySource.onboarding;
const migrated = migrateSave(legacySource);
check("legacy saves without tutorial state are not forced into onboarding", migrated.onboarding === undefined);

const requiredAreas = [
  "hub", "inbox", "squad", "recruitment", "staff", "academy", "cashflow",
  "stadium", "fixtures", "calendar", "board", "commercial", "tickets",
  "dashboard", "world", "history", "settings",
];
check(
  "every major game area has a tutorial chapter",
  requiredAreas.every((area) => ONBOARDING_CHAPTERS.some((chapter) => chapter.area === area)),
);
check(
  "tutorial teaches systems without pre-revealing decision outcomes",
  ONBOARDING_CHAPTERS.some((chapter) =>
    chapter.steps.some((step) => step.body.includes("does not reveal hidden") || step.body.includes("not shown the answer")),
  ),
);

const overlay = readFileSync(new URL("../../../components/game/OnboardingOverlay.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../../../components/game/SettingsTab.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../../../routes/index.tsx", import.meta.url), "utf8");
check("overlay is a hard modal dialog", overlay.includes('aria-modal="true"') && overlay.includes("fixed inset-0"));
check("player can skip all tutorials from the overlay", overlay.includes("Skip all tutorials"));
check("Settings exposes the replayable tutorial library", settings.includes("How this game works") && settings.includes("ONBOARDING_CHAPTERS.map"));
check("game shell gives chapters stable spotlight targets", route.includes("data-tutorial-area={tab}"));

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) process.exit(1);
