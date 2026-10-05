import { useEffect, useState } from "react";
import { Check, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { hashString } from "@/lib/game/rng";
import {
  ACCENT_COLOURS_ALL,
  EYEWEAR,
  FACIAL_HAIR,
  HAIR_COLOURS_ALL,
  HAIR_STYLES,
  HAIR_GROUPS,
  OUTFITS,
  OUTFIT_COLOURS_ALL,
  SKIN_TONES_ALL,
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

export function randomAvatar(current: ChairmanAvatar, nonce: number): ChairmanAvatar {
  const base = JSON.stringify(current);
  const pick = <T,>(label: string, items: readonly T[]) =>
    items[(hashString(`${base}|${nonce}|${label}`) >>> 0) % items.length];
  // Deterministic per click: varied without introducing uncontrolled UI randomness.
  const shortMaleStyles = new Set(["buzz", "crop", "sidePart", "swept", "curly", "receding", "bald", "fade", "textured", "slickBack", "curtains", "waves360", "afroShort", "afroFade", "twists", "cornrows", "frenchCrop", "undercut", "pompadour"]);
  const hairOptions = HAIR_STYLES.filter((style) => style.for[0] === current.sex && (current.sex !== "male" || shortMaleStyles.has(style.id)));
  const eyewearRoll = (hashString(`${base}|${nonce}|eyewear-roll`) >>> 0) % 4;
  return {
    ...current,
    skin: pick("skin", SKIN_TONES_ALL),
    hair: pick("hair", hairOptions).id,
    hairColour: pick("hair-colour", HAIR_COLOURS_ALL).id,
    facialHair: current.sex === "female" ? "none" : pick("facial-hair", FACIAL_HAIR).id,
    outfit: pick("outfit", OUTFITS).id,
    outfitColour: pick("outfit-colour", OUTFIT_COLOURS_ALL).id,
    accentColour: pick("accent-colour", ACCENT_COLOURS_ALL).id,
    eyewear: eyewearRoll === 0 ? pick("eyewear", EYEWEAR.slice(1)).id : "none",
  };
}

export function AvatarAppearanceOptions({ avatar, onChange, hideOutfit = false }: {
  avatar: ChairmanAvatar;
  onChange: (patch: Partial<ChairmanAvatar>) => void;
  hideOutfit?: boolean;
}) {
  const hairFor = (group: (typeof HAIR_GROUPS)[number]) =>
    HAIR_STYLES.filter((style) => style.group === group).sort(
      (a,b) => Number(b.for[0] === avatar.sex) - Number(a.for[0] === avatar.sex),
    );
  return (
    <div className="lf-studio-options">
      <StudioRow title="Skin"><Swatches label="Skin tone" colours={SKIN_TONES_ALL} value={avatar.skin} onChange={(skin) => onChange({ skin })} /></StudioRow>
      <StudioRow title="Hair">
        <div className="space-y-2">
          {HAIR_GROUPS.map((group) => (
            <div key={group}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group}</div>
              <Chips label={`${group} hair styles`} options={hairFor(group)}
                value={avatar.hair} onChange={(hair) => onChange({ hair })} />
            </div>
          ))}
        </div>
      </StudioRow>
      <StudioRow title="Hair colour"><Swatches label="Hair colour" colours={HAIR_COLOURS_ALL.map((item) => item.id)} value={avatar.hairColour} onChange={(hairColour) => onChange({ hairColour })} /></StudioRow>
      <StudioRow title="Facial hair"><Chips label="Facial hair" options={FACIAL_HAIR} value={avatar.facialHair} onChange={(facialHair) => onChange({ facialHair })} /></StudioRow>
      {!hideOutfit && (
        <>
          <StudioRow title="Outfit"><Chips label="Outfit" options={OUTFITS} value={avatar.outfit} onChange={(outfit) => onChange({ outfit })} /></StudioRow>
          <StudioRow title="Outfit colour"><Swatches label="Outfit colour" colours={OUTFIT_COLOURS_ALL.map((item) => item.id)} value={avatar.outfitColour} onChange={(outfitColour) => onChange({ outfitColour })} /></StudioRow>
          <StudioRow title="Tie, scarf & trim"><Swatches label="Accent colour" colours={ACCENT_COLOURS_ALL.map((item) => item.id)} value={avatar.accentColour} onChange={(accentColour) => onChange({ accentColour })} /></StudioRow>
        </>
      )}
      <StudioRow title="Glasses"><Chips label="Glasses" options={EYEWEAR} value={avatar.eyewear} onChange={(eyewear) => onChange({ eyewear })} /></StudioRow>
    </div>
  );
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
  const [randomiseNonce, setRandomiseNonce] = useState(0);
  useEffect(() => {
    if (open) setDraft(loadChairmanProfile());
  }, [open]);
  const avatar = draft.avatar;
  const set = (patch: Partial<ChairmanAvatar>) => setDraft((current) => ({ ...current, avatar: { ...current.avatar, ...patch } }));
  // Every style is available to everyone; the sex choice only orders them.

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="lf-studio-sheet">
        <SheetHeader className="text-left">
          <SheetTitle className="lf-studio-title">The director</SheetTitle>
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
            <Button type="button" variant="outline" size="sm" onClick={() => setRandomiseNonce((nonce) => { const next = nonce + 1; set(randomAvatar(avatar, next)); return next; })}>
              <Shuffle /> Randomise
            </Button>
          </div>
        </div>

        <div className="lf-studio-scroll touch-pan-y">
          <AvatarAppearanceOptions avatar={avatar} onChange={set} />
        </div>

        <div className="lf-studio-footer">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { saveChairmanProfile(draft); onOpenChange(false); }}>
            <Check /> Save director
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
