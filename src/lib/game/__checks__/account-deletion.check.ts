import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const edge = readFileSync("supabase/functions/delete-account/index.ts", "utf8");
const settings = readFileSync("src/components/game/SettingsTab.tsx", "utf8");
const sync = readFileSync("src/lib/cloud/sync.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

assert(edge.includes('req.headers.get("Authorization")'), "edge function must require caller auth");
assert(edge.includes("userClient.auth.getUser()"), "edge function must resolve the authenticated user server-side");
assert(edge.includes("admin.auth.admin.deleteUser(userData.user.id)"), "edge function must delete only the authenticated user");
assert(!/userId\s*=\s*.*(?:json|body|request)/i.test(edge), "edge function must not trust a body-supplied user id");
assert(!edge.includes("verify_jwt = false"), "account deletion must never disable JWT verification in source");

assert(sync.includes('client.functions.invoke("delete-account"'), "client must use the authenticated Edge Function");
assert(sync.includes('client.auth.signOut({ scope: "local" })'), "deleted accounts must clear the local auth session");
assert(sync.includes("clearCloudLinkMetadata()"), "deleted accounts must clear local cloud ownership metadata");

assert(settings.includes("Delete account"), "Settings must expose account deletion to the signed-in player");
assert(settings.includes("Careers stored on this device stay here"), "UI must explain that local careers are not deleted");
assert(settings.includes("Type DELETE"), "destructive account deletion must require typed confirmation");
assert(settings.includes("This cannot be undone."), "destructive account deletion must require explicit confirmation");

assert(config.includes('project_id = "uctylgwwqeqrycjekeor"'), "Supabase CLI config must target the verified production project");

console.log("account-deletion.check.ts: PASS");
