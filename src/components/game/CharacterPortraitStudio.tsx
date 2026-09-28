import { useEffect, useState } from "react";
import { Check, RotateCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ChairmanAvatar } from "@/lib/game/chairmanProfile";
import { withSex } from "@/lib/game/chairmanProfile";
import {
  characterDisplayName, clearCharacterName, clearPortraitOverride,
  generatedPortrait, portraitOverride, saveCharacterName, savePortraitOverride,
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
  const [draftName, setDraftName] = useState(() => characterDisplayName(identity.id, name));
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setDraft(portraitOverride(identity.id) ?? generatedPortrait(identity));
    setDraftName(characterDisplayName(identity.id, name));
    setError("");
    setNonce(0);
  }, [open, identity.id, identity.subject, identity.sex, name]);
  const patch = (change: Partial<ChairmanAvatar>) => setDraft((value) => ({ ...value, ...change }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="lf-studio-sheet">
        <SheetHeader className="text-left">
          <SheetTitle className="lf-studio-title">Edit {characterDisplayName(identity.id, name)}</SheetTitle>
          <p className="lf-studio-sub">Customise this character's name and appearance on this device.</p>
        </SheetHeader>
        <div className="lf-studio-stage">
          <div className="lf-studio-portrait">
            <CharacterPortrait avatar={draft} size={150} title={`${draftName || name} portrait preview`} />
          </div>
          <div className="lf-studio-stage-actions">
            <label className="lf-studio-name">
              <span>Name</span>
              <Input value={draftName} maxLength={60} onChange={(event) => setDraftName(event.target.value)} placeholder={name} aria-label="Character name" />
            </label>
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
        <div className="lf-studio-scroll touch-pan-y">
          <AvatarAppearanceOptions avatar={draft} onChange={patch} />
          {error && <p role="alert" className="px-4 text-xs text-rose-500">{error}</p>}
        </div>
        <div className="lf-studio-footer">
          <Button type="button" variant="ghost" onClick={() => {
            if (!clearPortraitOverride(identity.id)) { setError("Unable to reset appearance on this device."); return; }
            if (!clearCharacterName(identity.id)) { setError("Appearance reset, but name could not be reset on this device."); return; }
            onOpenChange(false);
          }}><RotateCcw /> Reset</Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={() => {
            if (!draftName.trim()) { setError("Enter a name before saving."); return; }
            if (!saveCharacterName(identity.id, draftName)) { setError("Unable to save the name on this device."); return; }
            if (!savePortraitOverride(identity.id, draft)) { setError("Name saved, but the appearance could not be saved on this device."); return; }
            onOpenChange(false);
          }}><Check /> Save character</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
