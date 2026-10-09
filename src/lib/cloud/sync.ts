import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { GameState } from "@/lib/game/types";
import {
  loadGame,
  migrateSave,
  saveGame,
  SAVE_VERSION,
  SAVE_SLOT_IDS,
  type SaveSlotId,
} from "@/lib/game/engine";
import { canAutomaticallyReplaceCloud, planCareerSync, type CareerSyncAction } from "./syncPlan";

const URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://uctylgwwqeqrycjekeor.supabase.co";
const KEY =
  ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
    | string
    | undefined) ?? "sb_publishable_LaJwXU-Q1yLUT0wwCUhlaQ_Lko8HA1q";
const MODIFIED_PREFIX = "chairman.save-modified.";
const CLOUD_OWNER_KEY = "chairman.cloud-owner";
const ACKNOWLEDGED_PREFIX = "chairman.cloud-acknowledged.";
const pendingUploads = new Map<SaveSlotId, Promise<boolean>>();

export const cloudConfigured = Boolean(URL && KEY);

let singleton: SupabaseClient | null = null;
export function cloudClient(): SupabaseClient | null {
  if (!cloudConfigured) return null;
  singleton ??= createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return singleton;
}

export function markLocalSaveModified(slot: SaveSlotId, at = new Date()): void {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, at.toISOString());
}

function clearCloudLinkMetadata(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(CLOUD_OWNER_KEY);
  localStorage.removeItem("chairman.cloud-last-sync");
  for (const slot of SAVE_SLOT_IDS) {
    localStorage.removeItem(`${MODIFIED_PREFIX}${slot}`);
    localStorage.removeItem(`${ACKNOWLEDGED_PREFIX}${slot}`);
  }
}

function localModifiedAt(slot: SaveSlotId): string | null {
  return localStorage.getItem(`${MODIFIED_PREFIX}${slot}`);
}

function assertAccountOwnership(userId: string): void {
  const owner = localStorage.getItem(CLOUD_OWNER_KEY);
  if (owner && owner !== userId) {
    throw new Error(
      "These local careers are linked to another account. Sign in to that account before synchronising or deleting them.",
    );
  }
}

export class CareerSyncConflict extends Error {
  constructor(readonly slots: SaveSlotId[]) {
    super(
      `Different device and cloud careers exist in ${slots.join(", ")}. Choose which copy to keep; neither has been overwritten.`,
    );
    this.name = "CareerSyncConflict";
  }
}

export type SyncConflictResolution = "auto" | "keep-device" | "keep-cloud";

interface CloudSaveRow {
  slot_id: SaveSlotId;
  state: GameState;
  state_updated_at: string;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
}

async function requireSession(client: SupabaseClient): Promise<Session> {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in to sync your careers.");
  return data.session;
}

/** Optimistic write: refuse to replace a cloud career that changed after
 * we read it. An insert never upserts over an existing career.
 */
async function writeCloudCareer(
  client: SupabaseClient,
  userId: string,
  slot: SaveSlotId,
  state: GameState,
  updatedAt: string,
  expectedCloudAt: string | null,
): Promise<void> {
  if (expectedCloudAt) {
    const { data, error } = await client
      .from("career_saves")
      .update({ state, state_updated_at: updatedAt })
      .eq("user_id", userId)
      .eq("slot_id", slot)
      .eq("state_updated_at", expectedCloudAt)
      .select("slot_id");
    if (error) throw error;
    if (!data?.length) {
      throw new Error(
        `Cloud career ${slot} changed during sync. Retry Sync now; neither copy was overwritten by this request.`,
      );
    }
    return;
  }
  const { error } = await client.from("career_saves").insert({
    user_id: userId,
    slot_id: slot,
    state,
    state_updated_at: updatedAt,
  });
  if (error)
    throw new Error(
      `Could not create cloud career ${slot}: ${error.message}. The slot may have changed on another device; retry Sync now.`,
    );
}

export async function syncAllCareers(
  resolution: SyncConflictResolution = "auto",
): Promise<SyncResult> {
  const client = cloudClient();
  if (!client) throw new Error("Cloud sync has not been connected to a backend yet.");
  const session = await requireSession(client);
  assertAccountOwnership(session.user.id);
  // An automatic upload already in flight must finish before a manual merge.
  await Promise.all([...pendingUploads.values()]);

  const { data, error } = await client
    .from("career_saves")
    .select("slot_id,state,state_updated_at")
    .eq("user_id", session.user.id);
  if (error) throw error;

  const remote = new Map((data as CloudSaveRow[] | null)?.map((row) => [row.slot_id, row]) ?? []);
  const plan: {
    slot: SaveSlotId;
    local: GameState | null;
    cloud: CloudSaveRow | undefined;
    action: CareerSyncAction;
  }[] = [];
  const conflicts: SaveSlotId[] = [];

  // Plan all slots before touching any copy, so a conflict in career 3 cannot
  // silently overwrite career 1 before the player is asked what to do.
  for (const slot of SAVE_SLOT_IDS) {
    const local = await loadGame(slot);
    const cloud = remote.get(slot);
    const action = planCareerSync({
      localExists: Boolean(local),
      cloudExists: Boolean(cloud),
      localModifiedAt: localModifiedAt(slot),
      cloudModifiedAt: cloud?.state_updated_at ?? null,
      identical: Boolean(local && cloud && JSON.stringify(local) === JSON.stringify(cloud.state)),
    });
    if (action === "conflict") conflicts.push(slot);
    plan.push({ slot, local, cloud, action });
  }
  if (conflicts.length && resolution === "auto") throw new CareerSyncConflict(conflicts);

  // Validate and migrate every incoming cloud career before any write begins.
  const preparedDownloads = new Map<SaveSlotId, GameState>();
  for (const { slot, cloud, action } of plan) {
    const effective =
      action === "conflict" ? (resolution === "keep-cloud" ? "download" : "upload") : action;
    if (effective !== "download" || !cloud) continue;
    if (
      !cloud.state ||
      typeof cloud.state.version !== "number" ||
      cloud.state.version > SAVE_VERSION
    ) {
      throw new Error(
        `Cloud career ${slot} requires a newer or valid game version. No careers were overwritten.`,
      );
    }
    try {
      preparedDownloads.set(
        slot,
        migrateSave(structuredClone(cloud.state) as unknown as Record<string, unknown>),
      );
    } catch (error) {
      throw new Error(
        `Cloud career ${slot} failed validation: ${(error as Error).message}. No careers were overwritten.`,
      );
    }
  }

  // Bind this browser's careers to the first account which explicitly syncs.
  localStorage.setItem(CLOUD_OWNER_KEY, session.user.id);
  let uploaded = 0;
  let downloaded = 0;
  for (const { slot, local, cloud, action } of plan) {
    const effective =
      action === "conflict" ? (resolution === "keep-cloud" ? "download" : "upload") : action;
    if (effective === "none") {
      if (cloud) {
        localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, cloud.state_updated_at);
        localStorage.setItem(`${ACKNOWLEDGED_PREFIX}${slot}`, cloud.state_updated_at);
      }
      continue;
    }
    if (effective === "download" && cloud) {
      const migrated = preparedDownloads.get(slot);
      if (!migrated) throw new Error(`Cloud career ${slot} has not passed validation.`);
      await saveGame(migrated, slot);
      localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, cloud.state_updated_at);
      localStorage.setItem(`${ACKNOWLEDGED_PREFIX}${slot}`, cloud.state_updated_at);
      downloaded++;
      continue;
    }
    if (effective === "upload" && local) {
      const stateUpdatedAt = localModifiedAt(slot) ?? new Date().toISOString();
      await writeCloudCareer(
        client,
        session.user.id,
        slot,
        local,
        stateUpdatedAt,
        cloud?.state_updated_at ?? null,
      );
      localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, stateUpdatedAt);
      localStorage.setItem(`${ACKNOWLEDGED_PREFIX}${slot}`, stateUpdatedAt);
      uploaded++;
    }
  }

  localStorage.setItem("chairman.cloud-last-sync", new Date().toISOString());
  return { uploaded, downloaded };
}

/** True only after a successful write or confirmation of an identical cloud copy. */
export function uploadCareer(slot: SaveSlotId, state: GameState): Promise<boolean> {
  // Capture the version timestamp alongside this snapshot, before earlier
  // uploads complete and more gameplay can change the local modified date.
  const capturedModifiedAt = localModifiedAt(slot) ?? new Date().toISOString();
  const previous = pendingUploads.get(slot) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const client = cloudClient();
      if (!client) return false;
      const { data, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) return false;
      assertAccountOwnership(data.session.user.id);
      const { data: existing, error: readError } = await client
        .from("career_saves")
        .select("state,state_updated_at")
        .eq("user_id", data.session.user.id)
        .eq("slot_id", slot)
        .maybeSingle();
      if (readError) throw readError;
      if (existing && JSON.stringify(existing.state) === JSON.stringify(state)) {
        localStorage.setItem(`${ACKNOWLEDGED_PREFIX}${slot}`, existing.state_updated_at);
        localStorage.setItem(CLOUD_OWNER_KEY, data.session.user.id);
        localStorage.setItem("chairman.cloud-last-sync", new Date().toISOString());
        return true;
      }
      if (existing && !localStorage.getItem(CLOUD_OWNER_KEY)) {
        throw new Error(
          "Connect existing careers with Sync now in Settings before automatic uploads can overwrite a different cloud career.",
        );
      }
      if (
        existing &&
        !canAutomaticallyReplaceCloud({
          cloudModifiedAt: existing.state_updated_at,
          acknowledgedCloudAt: localStorage.getItem(`${ACKNOWLEDGED_PREFIX}${slot}`),
          localModifiedAt: capturedModifiedAt,
        })
      ) {
        throw new Error(
          `Cloud career ${slot} has different or unacknowledged progress. Use Sync now in Settings to choose which copy to keep.`,
        );
      }
      await writeCloudCareer(
        client,
        data.session.user.id,
        slot,
        state,
        capturedModifiedAt,
        existing?.state_updated_at ?? null,
      );
      localStorage.setItem(`${ACKNOWLEDGED_PREFIX}${slot}`, capturedModifiedAt);
      localStorage.setItem(CLOUD_OWNER_KEY, data.session.user.id);
      localStorage.setItem("chairman.cloud-last-sync", new Date().toISOString());
      return true;
    });
  pendingUploads.set(slot, next);
  void next
    .finally(() => {
      if (pendingUploads.get(slot) === next) pendingUploads.delete(slot);
    })
    .catch(() => undefined);
  return next;
}

export async function deleteCloudCareer(slot: SaveSlotId): Promise<void> {
  const client = cloudClient();
  if (!client) {
    localStorage.removeItem(`${MODIFIED_PREFIX}${slot}`);
    return;
  }
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) {
    if (localStorage.getItem(CLOUD_OWNER_KEY)) {
      throw new Error(
        "Sign in to the linked account before deleting this career so the cloud copy cannot reappear.",
      );
    }
    localStorage.removeItem(`${MODIFIED_PREFIX}${slot}`);
    return;
  }
  assertAccountOwnership(data.session.user.id);
  await pendingUploads.get(slot)?.catch(() => undefined);
  const { error } = await client
    .from("career_saves")
    .delete()
    .eq("user_id", data.session.user.id)
    .eq("slot_id", slot);
  if (error) throw error;
  localStorage.removeItem(`${MODIFIED_PREFIX}${slot}`);
  localStorage.removeItem(`${ACKNOWLEDGED_PREFIX}${slot}`);
}

/**
 * Permanently deletes the signed-in Supabase account and every cloud career
 * owned by it. Local career slots remain untouched on this device.
 */
export async function deleteCloudAccount(): Promise<void> {
  const client = cloudClient();
  if (!client) throw new Error("Cloud services are unavailable.");
  await requireSession(client);

  const { data, error } = await client.functions.invoke("delete-account", {
    method: "POST",
    body: {},
  });
  if (error) throw new Error(error.message || "Could not delete cloud account.");
  if (!data?.deleted) throw new Error(data?.error || "Cloud account deletion was not confirmed.");

  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  clearCloudLinkMetadata();
}
