import { planCareerSync } from "../../cloud/syncPlan";

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

check("empty slot stays empty", planCareerSync({ ...base, localExists: false, cloudExists: false }), "none");
check("local-only career uploads", planCareerSync({ ...base, cloudExists: false }), "upload");
check("cloud-only career downloads", planCareerSync({ ...base, localExists: false }), "download");
check("identical copies need no write", planCareerSync({ ...base, identical: true, localModifiedAt: null }), "none");
check("newer cloud career downloads", planCareerSync(base), "download");
check("newer local career uploads", planCareerSync({ ...base, localModifiedAt: newer, cloudModifiedAt: older }), "upload");
check("unknown local timestamp never silently overwrites either copy", planCareerSync({ ...base, localModifiedAt: null }), "conflict");
check("unknown cloud timestamp never silently overwrites either copy", planCareerSync({ ...base, cloudModifiedAt: null }), "conflict");
check("equal timestamps with differing careers require a choice", planCareerSync({ ...base, cloudModifiedAt: older }), "conflict");
check("invalid timestamps require a choice", planCareerSync({ ...base, localModifiedAt: "invalid" }), "conflict");

console.log(`cloud-sync: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
