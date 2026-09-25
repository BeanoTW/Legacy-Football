import { useState } from "react";
import { Building2, Palette } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { FacilitiesTab } from "@/components/FacilitiesTab";
import { Button } from "@/components/ui/button";
import { ClubIdentitySheet } from "./ClubIdentityStudio";
import { ClubBadge } from "./ClubKitArt";
import { clubKitFor } from "@/lib/game/clubKit";

export function FacilitiesFlow({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [identityOpen, setIdentityOpen] = useState(false);
  const identity = clubKitFor(state);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <section className="grid shrink-0 grid-cols-2 gap-2" aria-label="Club areas">
        <Button variant="default" className="h-auto justify-start gap-2 rounded-xl px-3 py-2.5 text-left">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-foreground/12">
            <Building2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide opacity-75">Club</span>
            <strong className="block truncate text-sm">Facilities</strong>
          </span>
        </Button>

        <Button
          variant="outline"
          className="h-auto justify-start gap-2 rounded-xl px-3 py-2.5 text-left"
          onClick={() => setIdentityOpen(true)}
        >
          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/45">
            <ClubBadge design={identity.badge} clubName={state.clubName} size={28} />
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Club identity</span>
            <strong className="block truncate text-sm">Badge & kits</strong>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Palette className="size-3" /> Crest · home · away
            </span>
          </span>
        </Button>
      </section>

      <div className="min-h-0 flex-1">
        <FacilitiesTab state={state} update={update} />
      </div>

      <ClubIdentitySheet open={identityOpen} onOpenChange={setIdentityOpen} state={state} update={update} />
    </div>
  );
}
