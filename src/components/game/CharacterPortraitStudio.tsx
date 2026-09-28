import { useEffect, useState } from "react";
import { Check, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ChairmanAvatar } from "@/lib/game/chairmanProfile";
import { withSex } from "@/lib/game/chairmanProfile";
import {
  clearPortraitOverride, generatedPortrait, portraitOverride, savePortraitOverride,
  type PortraitIdentity,
} from "@/lib/game/characterPortrait";
import { AvatarAppearanceOptions, randomAvatar } from "./ChairmanStudio";
import { CharacterPortrait } from "./CharacterPortrait";

/** Edit any character without changing their football data. Manual
 * appearances are saved on this device and propagated to every portrait. */
export function CharacterPortraitStudio({
  identity, name, open, onOpenChange,
}: {
  identity: PortraitIdentity;
  name: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState<ChairmanAvatar>(() => portraitOverride(identity.id) ?? generatedPortrait(identity));
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setDraft(portraitOverride(identity.id) ?? generatedPortrait(identity));
    setError("");
    setNonce(0);
  }, [open, identity.id, identity.subject, identity.sex]);
  const patch = (change: Partial<ChairmanAvatar>) => setDraft((value) => ({ ...value, ...change }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="lf-studio-sheet">
        <SheetHeader className="text-left">
          <SheetTitle className="lf-studio-title">Edit {name}</SheetTitle>
          <p className="lf-studio-sub">Choose this character's appearance. It stays consistent throughout the game on this device.</p>
        </SheetHeader>
        <div className="lf-studio-stage">
          <div className="lf-studio-portrait">
            <CharacterPortrait avatar={draft} size={150} title={`${name} portrait preview`} />
          </div>
          <div className="lf-studio-stage-actions">
            <div className="lf-studio-sex" role="radiogroup" aria-label="Appearance">
              {(["male", "female"] as const).map((sex) => (
                <button type="button" key={sex} role="radio" aria-checked={draft.sex === sex}
                  className={cn(draft.sex === sex && "is-selected")}
                  onClick={() => setDraft((value) => withSex(value, sex))}>
                  {sex === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => {
              const next = nonce + 1;
              setNonce(next);
              setDraft((value) => randomAvatar(value, next));
            }}><Shuffle /> Randomise</Button>
          </div>
        </div>
        <AvatarAppearanceOptions avatar={draft} onChange={patch} />
        {error && <p role="alert" className="px-4 text-xs text-rose-500">{error}</p>}
        <div className="lf-studio-footer">
          <Button type="button" variant="ghost" onClick={() => {
            if (!clearPortraitOverride(identity.id)) { setError("Unable to save changes on this device."); return; }
            onOpenChange(false);
          }}><RotateCcw /> Reset</Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => {
            if (!savePortraitOverride(identity.id, draft)) { setError("Unable to save changes on this device."); return; }
            onOpenChange(false);
          }}><Check /> Save look</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
