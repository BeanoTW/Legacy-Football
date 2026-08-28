import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { GameState } from "@/lib/game/types";
import { loadGame, saveGame, SAVE_SLOT_IDS, type SaveSlotId } from "@/lib/game/engine";

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://uctylgwwqeqrycjekeor.supabase.co";
const KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
  ?? "sb_publishable_LaJwXU-Q1yLUT0wwCUhlaQ_Lko8HA1q";
const MODIFIED_PREFIX = "chairman.save-modified.";

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
  if (typeof localStorage !== "undefined") localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, at.toISOString());
}

function localModifiedAt(slot: SaveSlotId): string {
  return localStorage.getItem(`${MODIFIED_PREFIX}${slot}`) ?? "1970-01-01T00:00:00.000Z";
}

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

export async function syncAllCareers(): Promise<SyncResult> {
  const client = cloudClient();
  if (!client) throw new Error("Cloud sync has not been connected to a backend yet.");
  const session = await requireSession(client);
  const { data, error } = await client
    .from("career_saves")
    .select("slot_id,state,state_updated_at")
    .eq("user_id", session.user.id);
  if (error) throw error;

  const remote = new Map((data as CloudSaveRow[] | null)?.map((row) => [row.slot_id, row]) ?? []);
  let uploaded = 0;
  let downloaded = 0;

  for (const slot of SAVE_SLOT_IDS) {
    const local = await loadGame(slot);
    const cloud = remote.get(slot);
    if (!local && !cloud) continue;

    const localDate = localModifiedAt(slot);
    if (cloud && (!local || cloud.state_updated_at > localDate)) {
      await saveGame(cloud.state, slot);
      localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, cloud.state_updated_at);
      downloaded++;
      continue;
    }

    if (local) {
      const stateUpdatedAt = localDate.startsWith("1970-") ? new Date().toISOString() : localDate;
      const { error: uploadError } = await client.from("career_saves").upsert({
        user_id: session.user.id,
        slot_id: slot,
        state: local,
        state_updated_at: stateUpdatedAt,
      }, { onConflict: "user_id,slot_id" });
      if (uploadError) throw uploadError;
      localStorage.setItem(`${MODIFIED_PREFIX}${slot}`, stateUpdatedAt);
      uploaded++;
    }
  }

  localStorage.setItem("chairman.cloud-last-sync", new Date().toISOString());
  return { uploaded, downloaded };
}

export async function uploadCareer(slot: SaveSlotId, state: GameState): Promise<void> {
  const client = cloudClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const stateUpdatedAt = new Date().toISOString();
  markLocalSaveModified(slot, new Date(stateUpdatedAt));
  const { error } = await client.from("career_saves").upsert({
    user_id: data.session.user.id,
    slot_id: slot,
    state,
    state_updated_at: stateUpdatedAt,
  }, { onConflict: "user_id,slot_id" });
  if (error) console.warn(`[cloud] ${error.message}`);
  else localStorage.setItem("chairman.cloud-last-sync", new Date().toISOString());
}

export async function deleteCloudCareer(slot: SaveSlotId): Promise<void> {
  const client = cloudClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client
    .from("career_saves")
    .delete()
    .eq("user_id", data.session.user.id)
    .eq("slot_id", slot);
  if (error) throw error;
  localStorage.removeItem(`${MODIFIED_PREFIX}${slot}`);
}
