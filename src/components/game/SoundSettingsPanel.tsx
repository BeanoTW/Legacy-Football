import { useEffect, useState } from "react";
import { Music, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  onSoundSettingsChange,
  previewSounds,
  soundSettings,
  unlockAudio,
  updateSoundSettings,
  type SoundSettings,
} from "@/lib/audio/soundscape";

export function SoundSettingsPanel() {
  const [settings, setSettings] = useState<SoundSettings>(() => soundSettings());

  useEffect(() => {
    setSettings(soundSettings());
    return onSoundSettingsChange(() => setSettings(soundSettings()));
  }, []);

  const set = (patch: Partial<SoundSettings>) => {
    unlockAudio();
    updateSoundSettings(patch);
  };

  const rows: { key: keyof Omit<SoundSettings, "volume">; label: string; detail: string }[] = [
    { key: "music", label: "Theme tune", detail: "Plays in menus and fades out for matches" },
    { key: "crowd", label: "Crowd atmosphere", detail: "Builds with attacks and reacts to chances" },
    { key: "effects", label: "Match effects", detail: "Whistles and the thud of the ball" },
  ];

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="banner-strip flex items-center gap-2 px-3 py-2 text-sm">
        <Music className="size-4" /> Sound
      </div>
      <div className="divide-y">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{row.label}</span>
              <span className="block text-[11px] text-muted-foreground">{row.detail}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings[row.key]}
              aria-label={row.label}
              onClick={() => set({ [row.key]: !settings[row.key] } as Partial<SoundSettings>)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                settings[row.key] ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                  settings[row.key] ? "translate-x-[1.35rem]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Volume2 className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.volume * 100)}
            onChange={(event) => set({ volume: Number(event.target.value) / 100 })}
            className="h-1.5 min-w-0 flex-1 accent-[color:var(--color-primary)]"
            aria-label="Master sound volume"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              unlockAudio();
              previewSounds();
            }}
          >
            Play sample
          </Button>
        </div>
      </div>
    </section>
  );
}
