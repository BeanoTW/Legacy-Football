import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const vite = readFileSync("vite.config.ts", "utf8");
const meta = readFileSync("src/lib/releaseMetadata.ts", "utf8");

assert(vite.includes("LEGACY_FOOTBALL_RELEASE_VERSION"), "Vite must accept an explicit release version");
assert(vite.includes("LEGACY_FOOTBALL_RELEASE_CHANNEL"), "Vite must accept an explicit release channel");
assert(vite.includes('"Development"'), "unstamped builds must identify themselves as Development");
assert(vite.includes('"development"'), "unstamped builds must use the development channel");
assert(meta.includes("__LEGACY_FOOTBALL_BUILD_ID__"), "release metadata must retain exact build fingerprint");
assert(meta.includes("__LEGACY_FOOTBALL_RELEASE_VERSION__"), "release helper must expose human release version");
assert(meta.includes("__LEGACY_FOOTBALL_RELEASE_CHANNEL__"), "release helper must expose release channel");

console.log("release-metadata.check.ts: PASS");
