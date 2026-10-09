import { canAutomaticallyReplaceCloud, planCareerSync } from "../../cloud/syncPlan";

let passed = 0;
let failed = 0;
function check(label: string, actual: string, expected: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: expected ${expected}, got ${actual}`);
  }
}

const older = "2026-09-01T10:00:00.000Z";
const newer = "2026-09-02T10:00:00.000Z";
const base = {
  localExists: true,
  cloudExists: true,
  localModifiedAt: older,
  cloudModifiedAt: newer,
  identical: false,
};

check(
  "empty slot stays empty",
  planCareerSync({ ...base, localExists: false, cloudExists: false }),
  "none",
);
check("local-only career uploads", planCareerSync({ ...base, cloudExists: false }), "upload");
check("cloud-only career downloads", planCareerSync({ ...base, localExists: false }), "download");
check(
  "identical copies need no write",
  planCareerSync({ ...base, identical: true, localModifiedAt: null }),
  "none",
);
check(
  "different newer cloud progress requires an explicit choice",
  planCareerSync(base),
  "conflict",
);
check(
  "different newer device progress requires an explicit choice",
  planCareerSync({ ...base, localModifiedAt: newer, cloudModifiedAt: older }),
  "conflict",
);
check(
  "unknown local timestamp never silently overwrites either copy",
  planCareerSync({ ...base, localModifiedAt: null }),
  "conflict",
);
check(
  "unknown cloud timestamp never silently overwrites either copy",
  planCareerSync({ ...base, cloudModifiedAt: null }),
  "conflict",
);
check(
  "equal timestamps with differing careers require a choice",
  planCareerSync({ ...base, cloudModifiedAt: older }),
  "conflict",
);
check(
  "invalid timestamps require a choice",
  planCareerSync({ ...base, localModifiedAt: "invalid" }),
  "conflict",
);

const automatic = { cloudModifiedAt: older, acknowledgedCloudAt: older, localModifiedAt: newer };
const autoCheck = (
  label: string,
  input:
    | typeof automatic
    | { cloudModifiedAt: string; acknowledgedCloudAt: null; localModifiedAt: string },
  expected: boolean,
) => check(label, String(canAutomaticallyReplaceCloud(input)), String(expected));
autoCheck("automatic save extends an acknowledged cloud revision", automatic, true);
autoCheck(
  "other device progress blocks automatic replacement even with a newer local clock",
  { ...automatic, cloudModifiedAt: newer, localModifiedAt: "2026-09-03T10:00:00.000Z" },
  false,
);
autoCheck(
  "an untracked cloud revision requires manual sync",
  { ...automatic, acknowledgedCloudAt: null },
  false,
);
autoCheck(
  "equivalent timestamp formats identify the same revision",
  { ...automatic, cloudModifiedAt: "2026-09-01T10:00:00+00:00" },
  true,
);
autoCheck(
  "invalid cloud revision blocks automatic replacement",
  { ...automatic, cloudModifiedAt: "invalid" },
  false,
);
autoCheck(
  "invalid acknowledged revision blocks automatic replacement",
  { ...automatic, acknowledgedCloudAt: "invalid" },
  false,
);
autoCheck(
  "stale queued snapshot cannot replace the cloud revision",
  { ...automatic, localModifiedAt: older },
  false,
);

console.log(`cloud-sync: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
