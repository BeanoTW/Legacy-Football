import { strict as assert } from "node:assert";
import type { Session } from "@supabase/supabase-js";
import { clearGame, loadGame, newGame, saveGame } from "../engine";

// Exercise the client queue against a disposable in-memory API, never Supabase.
process.env.VITE_SUPABASE_URL = "https://release-validation.invalid";
const metadata = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => metadata.get(key) ?? null,
    setItem: (key: string, value: string) => {
      metadata.set(key, value);
    },
    removeItem: (key: string) => {
      metadata.delete(key);
    },
  },
});
globalThis.fetch = async () => {
  throw new Error("Network prohibited in cloud queue check");
};
const cloud = await import("../../cloud/sync");
const client = cloud.cloudClient();
assert(client);
let signedIn = true;
client.auth.getSession = async () => {
  if (!signedIn) return { data: { session: null }, error: null };
  return { data: { session: { user: { id: "mock-account-A" } } as Session }, error: null };
};
client.auth.signOut = async () => {
  signedIn = false;
  return { error: null };
};
let accountCalls = 0;
Object.defineProperty(client, "functions", {
  value: {
    invoke: async () => {
      accountCalls++;
      records.clear();
      return { data: { deleted: true }, error: null };
    },
  },
});

type Row = { user_id: string; slot_id: string; state: unknown; state_updated_at: string };
const records = new Map<string, Row>();
const operations: string[] = [];
let insertFence: Promise<void> | null = null;
let onInsert: (() => void) | null = null;
let rejectInsert = false;
client.from = (() => {
  let operation = "read";
  let row: Row | null = null;
  const filters = new Map<string, unknown>();
  const execute = async () => {
    const key = `${filters.get("user_id") ?? row?.user_id}|${filters.get("slot_id") ?? row?.slot_id}`;
    if (operation === "insert") {
      onInsert?.();
      await insertFence;
      if (rejectInsert) return { data: null, error: { message: "injected write failure" } };
      assert(row);
      records.set(key, structuredClone(row));
      operations.push("insert");
      return { data: null, error: null };
    }
    if (operation === "delete") {
      records.delete(key);
      operations.push("delete");
      return { data: null, error: null };
    }
    return { data: records.get(key) ?? null, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.set(key, value);
      return query;
    },
    insert: (value: Row) => {
      operation = "insert";
      row = value;
      return query;
    },
    delete: () => {
      operation = "delete";
      return query;
    },
    maybeSingle: execute,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      execute().then(resolve, reject),
  };
  return query;
}) as unknown as typeof client.from;

const state = newGame("Cloud Queue FC", "Release Auditor", "CLOUD|QUEUE|FIXED");
await clearGame("slot-1");
await saveGame(state, "slot-1");
let release!: () => void;
insertFence = new Promise<void>((resolve) => {
  release = resolve;
});
const started = new Promise<void>((resolve) => {
  onInsert = resolve;
});
cloud.markLocalSaveModified("slot-1");
const upload = cloud.uploadCareer("slot-1", state);
await started;
const deletion = cloud.deleteCloudCareer("slot-1");
await Promise.resolve();
assert(!operations.includes("delete"), "deletion must wait for the pending upload");
release();
await Promise.all([upload, deletion]);
assert.deepEqual(operations, ["insert", "delete"]);
assert.equal(records.size, 0, "queued upload cannot resurrect a deleted cloud slot");
assert.equal(
  (await loadGame("slot-1"))?.clubName,
  state.clubName,
  "cloud slot deletion preserves local career",
);

insertFence = null;
onInsert = null;
rejectInsert = true;
await assert.rejects(cloud.uploadCareer("slot-2", state), /injected write failure/);
rejectInsert = false;
await cloud.uploadCareer("slot-2", state);
assert(records.has("mock-account-A|slot-2"), "a failed upload must not poison later queued work");

signedIn = false;
await assert.rejects(cloud.deleteCloudCareer("slot-2"), /Sign in to the linked account/);
assert(records.has("mock-account-A|slot-2"));
assert.equal(
  (await loadGame("slot-1"))?.clubName,
  state.clubName,
  "sign-out preserves local career",
);
signedIn = true;
await cloud.deleteCloudAccount();
assert.equal(accountCalls, 1);
assert.equal(records.size, 0);
assert.equal(
  (await loadGame("slot-1"))?.clubName,
  state.clubName,
  "confirmed account deletion preserves local career",
);
assert.equal(metadata.get("chairman.cloud-owner"), undefined);
await assert.rejects(cloud.deleteCloudAccount(), /Sign in/);
assert.equal(accountCalls, 1, "unsigned client must not invoke account deletion");
await clearGame("slot-1");
console.log("cloud-queue: PASS (mock API; not production RLS or deletion evidence)");
