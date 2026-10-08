import { useEffect, useState } from "react";
import { BookOpen, Check, Cloud, Download, HardDrive, LogOut, Mail, Palette, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailScreen } from "./shared/layout";
import { cn } from "@/lib/utils";
import { SoundSettingsPanel } from "./SoundSettingsPanel";
import { CareerSyncConflict, cloudClient, cloudConfigured, syncAllCareers, type SyncConflictResolution } from "@/lib/cloud/sync";
import { DeveloperModePanel } from "./DeveloperModePanel";
import { developerModeEnabled, setDeveloperModeEnabled } from "@/lib/game/developerMode";
import { ONBOARDING_CHAPTERS, type OnboardingChapterId } from "@/lib/game/onboarding";

type Theme = "club" | "heritage" | "floodlights";
type Appearance = "light" | "dark" | "system";
const THEME_KEY = "chairman.colour-theme";
const APPEARANCE_KEY = "chairman.appearance";
const DEVELOPER_EMAIL = "beanotarren@gmail.com";
declare const __LEGACY_FOOTBALL_BUILD_ID__: string;

function applyTheme(theme: Theme) {
  document.documentElement.dataset.clubTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

function applyAppearance(appearance: Appearance) {
  const dark = appearance === "dark" || (appearance === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(APPEARANCE_KEY, appearance);
}

export function SettingsTab({
  state,
  update,
  activeSlot,
  slots,
  onSwitch,
  onDelete,
  onSaveNow,
  onReplayTutorial,
  onRestartTutorial,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  activeSlot: SaveSlotId;
  slots: SaveSlotSummary[];
  onSwitch: (slot: SaveSlotId) => void;
  onDelete: (slot: SaveSlotId) => Promise<void>;
  onSaveNow: () => Promise<{ local: boolean; cloud: boolean }>;
  onReplayTutorial: (chapterId: OnboardingChapterId) => void;
  onRestartTutorial: () => void;
}) {
  const [theme, setTheme] = useState<Theme>("club");
  const [appearance, setAppearance] = useState<Appearance>("system");
  const [developerMode, setDeveloperMode] = useState(() => developerModeEnabled());
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [conflictingSlots, setConflictingSlots] = useState<SaveSlotId[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(() => typeof localStorage === "undefined" ? null : localStorage.getItem("chairman.cloud-last-sync"));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const next = stored && ["club", "heritage", "floodlights"].includes(stored) ? stored : "club";
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(APPEARANCE_KEY) as Appearance | null;
    const next: Appearance = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    setAppearance(next);
    applyAppearance(next);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((localStorage.getItem(APPEARANCE_KEY) ?? "system") === "system") applyAppearance("system"); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const client = cloudClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const developerAuthorized = session?.user.email?.trim().toLowerCase() === DEVELOPER_EMAIL;

  useEffect(() => {
    if (session && !developerAuthorized && developerMode) {
      setDeveloperMode(false);
      setDeveloperModeEnabled(false);
    }
  }, [session, developerAuthorized, developerMode]);

  async function sendSignInLink() {
    const client = cloudClient();
    if (!client || !email.trim()) return;
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
      });
      setCloudMessage(error ? error.message : "Sign-in link sent. Open it on this device, then use Sync now to connect your existing careers.");
    } catch (error) {
      setCloudMessage(`Could not send sign-in link: ${(error as Error).message}`);
    } finally {
      setCloudBusy(false);
    }
  }

  async function syncNow(resolution: SyncConflictResolution = "auto") {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const result = await syncAllCareers(resolution);
      const now = new Date().toISOString();
      setLastSync(now);
      setConflictingSlots([]);
      setCloudMessage(`Synced: ${result.uploaded} uploaded, ${result.downloaded} downloaded.`);
      if (result.downloaded) window.location.reload();
    } catch (error) {
      if (error instanceof CareerSyncConflict) setConflictingSlots(error.slots);
      setCloudMessage((error as Error).message);
    } finally {
      setCloudBusy(false);
    }
  }

  async function manualSave() {
    setSaveBusy(true);
    setSaveMessage(null);
    try {
      const result = await onSaveNow();
      setSaveMessage(result.cloud ? "Saved on device · Cloud synced" : "Saved on device · Cloud unavailable");
    } catch (error) {
      setSaveMessage(`Save failed: ${(error as Error).message}`);
    } finally {
      setSaveBusy(false);
    }
  }

  async function checkForUpdates() {
    setUpdateMessage("Checking for updates…");
    try {
      const { fetchLatestBuild, applyLatestBuild } = await import("@/lib/appUpdate");
      const latest = await fetchLatestBuild();
      const currentBuild = __LEGACY_FOOTBALL_BUILD_ID__;
      if (latest.id !== currentBuild) {
        await onSaveNow();
        setUpdateMessage("Update found · installing latest version…");
        await applyLatestBuild(latest.id);
      } else {
        setUpdateMessage(`Latest version verified · build ${currentBuild.slice(0, 8)}`);
      }
    } catch (error) {
      setUpdateMessage(`Could not check for updates: ${(error as Error).message}`);
    }
  }

  async function signOut() {
    const client = cloudClient();
    if (!client) return;
    setCloudBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setCloudMessage("Signed out. Careers saved on this device remain accessible locally.");
    } catch (error) {
      setCloudMessage(`Could not sign out: ${(error as Error).message}`);
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <DetailScreen
      title="Settings"
      subtitle="Manage careers, appearance and cross-device play."
      className="lf-settings-workspace touch-pan-y space-y-3"
    >
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="panel-strip flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          <HardDrive className="size-4" /> Save manager
        </div>
        {deleteError && <p role="alert" className="m-3 rounded-lg border border-rose-500 bg-rose-500/10 p-2 text-xs">{deleteError}</p>}
        <div className="grid gap-2 p-3 lg:grid-cols-3">
          {slots.map(({ id, state, status }, index) => {
            const active = id === activeSlot;
            return (
              <article
                key={id}
                className={cn(
                  "rounded-xl border p-3",
                  active ? "border-primary bg-primary/5 shadow-sm" : "bg-background/60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Career {index + 1}
                    </div>
                    <div className="font-display text-xl">{status === "unreadable" ? "Save needs recovery" : state?.clubName ?? "Empty slot"}</div>
                  </div>
                  {active && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                      <Check className="size-3" /> Active
                    </span>
                  )}
                </div>
                {state ? (
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                    <SaveFact label="Season" value={String(state.season)} />
                    <SaveFact label="Week" value={String(state.week)} />
                    <SaveFact label="Balance" value={`£${(state.cash / 1_000_000).toFixed(1)}m`} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{status === "unreadable" ? "An existing save is protected. Do not clear this slot or browser data." : "Start a new director career here."}</p>
                )}
                <div className="mt-3 flex gap-2">
                  {!active && (
                    <Button size="sm" className="flex-1" onClick={() => onSwitch(id)}>
                      {state ? "Load career" : "Use slot"}
                    </Button>
                  )}
                  {state && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete Career ${index + 1}`}
                      onClick={() => {
                        if (window.confirm(`Delete ${state.clubName} from Career ${index + 1}? This cannot be undone.`)) {
                          setDeleteError(null);
                          void onDelete(id).catch((error: unknown) =>
                            setDeleteError(`Could not delete career: ${(error as Error).message}`),
                          );
                        }
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 font-display text-lg"><Save className="size-5" /> Save now</div>
            <p className="mt-1 text-xs text-muted-foreground">Immediately writes this career to this device, then syncs the same save to the cloud when available.</p>
            <Button className="mt-3" size="sm" disabled={saveBusy} onClick={() => void manualSave()}><HardDrive className="size-4" /> {saveBusy ? "Saving…" : "Save now"}</Button>
            {saveMessage && <p className="mt-2 text-xs">{saveMessage}</p>}
          </div>
          <div>
            <div className="flex items-center gap-2 font-display text-lg"><Download className="size-5" /> Game updates</div>
            <p className="mt-1 text-xs text-muted-foreground">Checks the deployed game for a newer build. Your career is saved before any update reload.</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void checkForUpdates()}><RefreshCw className="size-4" /> Check for updates</Button>
            {updateMessage && <p className="mt-2 text-xs">{updateMessage}</p>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="banner-strip flex items-center gap-2 px-3 py-2 text-sm">
          <Palette className="size-4" /> Club atmosphere
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {(["club", "heritage", "floodlights"] as const).map((choice) => (
            <button
              key={choice}
              onClick={() => {
                setTheme(choice);
                applyTheme(choice);
              }}
              className={cn(
                "rounded-xl border p-2 text-left capitalize transition-colors",
                theme === choice && "border-primary bg-primary/10 font-semibold",
              )}
            >
              <span className={`theme-swatch theme-swatch-${choice}`} />
              <span className="mt-1 block text-xs sm:text-sm">{choice}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="banner-strip flex items-center gap-2 px-3 py-2 text-sm">
          <Palette className="size-4" /> Appearance
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {(["light", "dark", "system"] as const).map((choice) => (
            <button
              key={choice}
              onClick={() => {
                setAppearance(choice);
                applyAppearance(choice);
              }}
              className={cn(
                "rounded-xl border p-3 text-center text-xs capitalize transition-colors sm:text-sm",
                appearance === choice && "border-primary bg-primary/10 font-semibold",
              )}
            >
              {choice}
            </button>
          ))}
        </div>
        <p className="px-3 pb-3 text-[11px] text-muted-foreground">System follows your device appearance automatically.</p>
      </section>

      <SoundSettingsPanel />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="banner-strip flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="flex items-center gap-2"><BookOpen className="size-4" /> How this game works</span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {state.onboarding?.completedChapterIds.length ?? 0}/{ONBOARDING_CHAPTERS.length} seen
          </span>
        </div>
        <div className="p-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Replay any tutorial chapter without changing your career. These explain mechanics and philosophy — never the hidden outcome of a decision.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ONBOARDING_CHAPTERS.map((chapter) => {
              const completed = state.onboarding?.completedChapterIds.includes(chapter.id) ?? false;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onReplayTutorial(chapter.id)}
                  className="rounded-xl border bg-background/50 p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm">{chapter.title}</strong>
                    {completed && <Check className="size-4 shrink-0 text-emerald-600" aria-label="Completed" />}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{chapter.summary}</p>
                </button>
              );
            })}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRestartTutorial}>
            <RotateCcw className="size-4" /> Restart full onboarding
          </Button>
        </div>
      </section>

      {developerAuthorized && (
        <>
                <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <div className="font-display text-lg">Developer mode</div>
                      <p className="text-xs text-muted-foreground">
                        Unlock God Mode controls for testing this career.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={developerMode}
                      onClick={() => {
                        const next = !developerMode;
                        setDeveloperMode(next);
                        setDeveloperModeEnabled(next);
                      }}
                      className={cn(
                        "relative h-7 w-12 rounded-full border transition-colors",
                        developerMode ? "border-fuchsia-500 bg-fuchsia-500" : "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                          developerMode ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>
                </section>
          
                {developerMode && <DeveloperModePanel state={state} update={update} />}
        </>
      )}

      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg">Cloud sync</div>
            {!cloudConfigured ? (
              <>
                <p className="text-xs text-muted-foreground sm:text-sm">Cloud services are being connected. Your careers remain safely stored on this device.</p>
                <CloudStatus tone="amber">Backend connection pending</CloudStatus>
              </>
            ) : session ? (
              <div className="space-y-3">
                <p className="truncate text-xs text-muted-foreground sm:text-sm">Connected as {session.user.email}. Use Sync now to transfer existing careers; subsequent progress uploads automatically.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void syncNow()} disabled={cloudBusy}>
                    <RefreshCw className={cn("size-4", cloudBusy && "animate-spin")} /> Sync now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void signOut()} disabled={cloudBusy}>
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
                {conflictingSlots.length > 0 && (
                  <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-xs">
                    <p className="mb-2">Conflicting careers: {conflictingSlots.join(", ")}. Choose which copy to keep for these slots. Other slots follow their normal sync plan.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={cloudBusy} onClick={() => {
                        if (window.confirm("Replace the CLOUD copies of the conflicting careers with this device’s copies?")) void syncNow("keep-device");
                      }}>Keep device copies</Button>
                      <Button size="sm" variant="outline" disabled={cloudBusy} onClick={() => {
                        if (window.confirm("Replace the DEVICE copies of the conflicting careers with the cloud copies? Unsynced local progress will be lost.")) void syncNow("keep-cloud");
                      }}>Keep cloud copies</Button>
                    </div>
                  </div>
                )}
                <CloudStatus tone="green">Connected{lastSync ? ` · synced ${new Date(lastSync).toLocaleString()}` : ""}</CloudStatus>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground sm:text-sm">Sign in by email to keep all three careers available on every device.</p>
                <div className="flex gap-2">
                  <Input type="email" inputMode="email" autoComplete="email" placeholder="Your email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  <Button onClick={() => void sendSignInLink()} disabled={cloudBusy || !email.trim()}>
                    <Mail className="size-4" /> Send link
                  </Button>
                </div>
                <CloudStatus tone="amber">Not signed in</CloudStatus>
              </div>
            )}
            {cloudMessage && <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs">{cloudMessage}</p>}
          </div>
        </div>
      </section>
    </DetailScreen>
  );
}

function CloudStatus({ children, tone }: { children: React.ReactNode; tone: "amber" | "green" }) {
  return (
    <span className={cn("mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-bold", tone === "green" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700")}>
      {children}
    </span>
  );
}

function SaveFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-1 py-2">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
