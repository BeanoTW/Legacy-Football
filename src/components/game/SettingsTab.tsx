import { useEffect, useState } from "react";
import { Check, Cloud, HardDrive, LogOut, Mail, Palette, RefreshCw, Trash2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailScreen } from "./shared/layout";
import { cn } from "@/lib/utils";
import { cloudClient, cloudConfigured, syncAllCareers } from "@/lib/cloud/sync";

type Theme = "club" | "heritage" | "floodlights";
const THEME_KEY = "chairman.colour-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.clubTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function SettingsTab({
  activeSlot,
  slots,
  onSwitch,
  onDelete,
}: {
  activeSlot: SaveSlotId;
  slots: SaveSlotSummary[];
  onSwitch: (slot: SaveSlotId) => void;
  onDelete: (slot: SaveSlotId) => Promise<void>;
}) {
  const [theme, setTheme] = useState<Theme>("club");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(() => typeof localStorage === "undefined" ? null : localStorage.getItem("chairman.cloud-last-sync"));

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const next = stored && ["club", "heritage", "floodlights"].includes(stored) ? stored : "club";
    setTheme(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    const client = cloudClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  async function sendSignInLink() {
    const client = cloudClient();
    if (!client || !email.trim()) return;
    setCloudBusy(true);
    setCloudMessage(null);
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
    });
    setCloudBusy(false);
    setCloudMessage(error ? error.message : "Sign-in link sent. Open it on this device to connect your careers.");
  }

  async function syncNow() {
    setCloudBusy(true);
    setCloudMessage(null);
    try {
      const result = await syncAllCareers();
      const now = new Date().toISOString();
      setLastSync(now);
      setCloudMessage(`Synced: ${result.uploaded} uploaded, ${result.downloaded} downloaded.`);
      if (result.downloaded) window.location.reload();
    } catch (error) {
      setCloudMessage((error as Error).message);
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <DetailScreen
      title="Settings"
      subtitle="Manage careers, appearance and cross-device play."
      className="touch-pan-y space-y-3"
    >
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="panel-strip flex items-center gap-2 px-3 py-2 text-sm font-semibold">
          <HardDrive className="size-4" /> Save manager
        </div>
        <div className="grid gap-2 p-3 lg:grid-cols-3">
          {slots.map(({ id, state }, index) => {
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
                    <div className="font-display text-xl">{state?.clubName ?? "Empty slot"}</div>
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
                  <p className="mt-2 text-xs text-muted-foreground">Start a new chairman career here.</p>
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
                          void onDelete(id);
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
                <p className="truncate text-xs text-muted-foreground sm:text-sm">Connected as {session.user.email}. New progress uploads automatically.</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void syncNow()} disabled={cloudBusy}>
                    <RefreshCw className={cn("size-4", cloudBusy && "animate-spin")} /> Sync now
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void cloudClient()?.auth.signOut()}>
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
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
