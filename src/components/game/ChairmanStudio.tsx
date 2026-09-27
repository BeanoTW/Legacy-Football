import { useEffect, useState } from "react";
import { Check, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ACCENT_COLOURS,
  EYEWEAR,
  FACIAL_HAIR,
  HAIR_COLOURS,
  HAIR_STYLES,
  OUTFITS,
  OUTFIT_COLOURS,
  SKIN_TONES,
  loadChairmanProfile,
  onChairmanProfileChange,
  saveChairmanProfile,
  withSex,
  type ChairmanAvatar,
  type ChairmanProfile,
} from "@/lib/game/chairmanProfile";
import { ChairmanPortrait } from "./ChairmanPortrait";

/** Live device profile. Re-renders whenever it is edited anywhere. */
export function useChairmanProfile(): ChairmanProfile {
  const [profile, setProfile] = useState<ChairmanProfile>(() => loadChairmanProfile());
  useEffect(() => {
    setProfile(loadChairmanProfile());
    return onChairmanProfileChange(() => setProfile(loadChairmanProfile()));
  }, []);
  return profile;
}

function Swatches({ colours, value, onChange, label }: { colours: readonly string[]; value: string; onChange: (colour: string) => void; label: string }) {
  return (
    <div className="lf-studio-swatches" role="radiogroup" aria-label={label}>
      {colours.map((colour) => (
        <button
          key={colour}
          type="button"
          role="radio"
          aria-checked={value === colour}
          className={cn("lf-studio-swatch", value === colour && "is-selected")}
          style={{ background: colour }}
          onClick={() => onChange(colour)}
        >
          {value === colour && <Check />}
        </button>
      ))}
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="lf-studio-chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={cn("lf-studio-chip", value === option.id && "is-selected")}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StudioRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lf-studio-row">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function randomAvatar(current: ChairmanAvatar): ChairmanAvatar {
  const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
  // Randomise within the styles most typical for the chosen sex.
  const hairOptions = HAIR_STYLES.filter((style) => style.for[0] === current.sex);
  return {
    ...current,
    skin: pick(SKIN_TONES),
    hair: pick(hairOptions).id,
    hairColour: pick(HAIR_COLOURS).id,
    facialHair: current.sex === "female" ? "none" : pick(FACIAL_HAIR).id,
    outfit: pick(OUTFITS).id,
    outfitColour: pick(OUTFIT_COLOURS).id,
    accentColour: pick(ACCENT_COLOURS).id,
    eyewear: Math.random() < 0.25 ? pick(EYEWEAR.slice(1)).id : "none",
  };
}

/**
 * Chairman studio. Edits the device-level profile, so the look carries into
 * every career. `showName` is off inside a running career, where the name is
 * part of the save's history.
 */
export function ChairmanStudio({
  open,
  onOpenChange,
  showName = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showName?: boolean;
}) {
  const [draft, setDraft] = useState<ChairmanProfile>(() => loadChairmanProfile());
  useEffect(() => {
    if (open) setDraft(loadChairmanProfile());
  }, [open]);
  const avatar = draft.avatar;
  const set = (patch: Partial<ChairmanAvatar>) => setDraft((current) => ({ ...current, avatar: { ...current.avatar, ...patch } }));
  // Every style is available to everyone; the sex choice only orders them.
  const hairStyles = [...HAIR_STYLES].sort((a, b) => Number(b.for[0] === avatar.sex) - Number(a.for[0] === avatar.sex));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="lf-studio-sheet">
        <SheetHeader className="text-left">
          <SheetTitle className="lf-studio-title">The chairman</SheetTitle>
          <p className="lf-studio-sub">Your look follows you into every career.</p>
        </SheetHeader>

        <div className="lf-studio-stage">
          <div className="lf-studio-portrait">
            <ChairmanPortrait avatar={avatar} size={150} />
          </div>
          <div className="lf-studio-stage-actions">
            {showName && (
              <label className="lf-studio-name">
                <span>Name</span>
                <Input value={draft.name} maxLength={40} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
            )}
            <div className="lf-studio-sex" role="radiogroup" aria-label="Sex">
              {(["male", "female"] as const).map((sex) => (
                <button key={sex} type="button" role="radio" aria-checked={avatar.sex === sex} className={cn(avatar.sex === sex && "is-selected")} onClick={() => setDraft((current) => ({ ...current, avatar: withSex(current.avatar, sex) }))}>
                  {sex === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => set(randomAvatar(avatar))}>
              <Shuffle /> Randomise
            </Button>
          </div>
        </div>

        <div className="lf-studio-options">
          <StudioRow title="Skin"><Swatches label="Skin tone" colours={SKIN_TONES} value={avatar.skin} onChange={(skin) => set({ skin })} /></StudioRow>
          <StudioRow title="Hair"><Chips label="Hair style" options={hairStyles} value={avatar.hair} onChange={(hair) => set({ hair })} /></StudioRow>
          <StudioRow title="Hair colour"><Swatches label="Hair colour" colours={HAIR_COLOURS.map((c) => c.id)} value={avatar.hairColour} onChange={(hairColour) => set({ hairColour })} /></StudioRow>
          <StudioRow title="Facial hair"><Chips label="Facial hair" options={FACIAL_HAIR} value={avatar.facialHair} onChange={(facialHair) => set({ facialHair })} /></StudioRow>
          <StudioRow title="Outfit"><Chips label="Outfit" options={OUTFITS} value={avatar.outfit} onChange={(outfit) => set({ outfit })} /></StudioRow>
          <StudioRow title="Outfit colour"><Swatches label="Outfit colour" colours={OUTFIT_COLOURS.map((c) => c.id)} value={avatar.outfitColour} onChange={(outfitColour) => set({ outfitColour })} /></StudioRow>
          <StudioRow title="Tie, scarf & trim"><Swatches label="Accent colour" colours={ACCENT_COLOURS.map((c) => c.id)} value={avatar.accentColour} onChange={(accentColour) => set({ accentColour })} /></StudioRow>
          <StudioRow title="Glasses"><Chips label="Glasses" options={EYEWEAR} value={avatar.eyewear} onChange={(eyewear) => set({ eyewear })} /></StudioRow>
        </div>

        <div className="lf-studio-footer">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { saveChairmanProfile(draft); onOpenChange(false); }}>
            <Check /> Save chairman
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
