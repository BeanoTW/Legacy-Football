import { useEffect, useState } from "react";
import { Check, Cloud, HardDrive, Palette, Trash2 } from "lucide-react";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "./shared/layout";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    const next = stored && ["club", "heritage", "floodlights"].includes(stored) ? stored : "club";
    setTheme(next);
    applyTheme(next);
  }, []);

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

      <section className="rounded-xl border border-dashed bg-card/70 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Cloud className="size-5" />
          </span>
          <div>
            <div className="font-display text-lg">Cloud sync</div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Local careers are ready for cloud storage. Account sign-in and cross-device conflict protection are the next connection step.
            </p>
            <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-700">
              Not connected
            </span>
          </div>
        </div>
      </section>
    </DetailScreen>
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
