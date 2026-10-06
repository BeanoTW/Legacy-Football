import { useState } from "react";
import { Building2, ChevronRight, HardHat, Plus } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { FacilitiesTab } from "@/components/FacilitiesTab";
import { Button } from "@/components/ui/button";
import { ClubIdentitySheet } from "./ClubIdentityStudio";
import { ClubBadge } from "./ClubKitArt";
import { GroundStudioSheet } from "./GroundStudio";
import { clubKitFor } from "@/lib/game/clubKit";
import { groundIdentity } from "@/lib/game/groundIdentity";
import { stadiumCapacity } from "@/lib/game/infrastructure";
import { groundComponents } from "@/lib/game/stadiumUx";

export function FacilitiesFlow({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [identityOpen, setIdentityOpen] = useState(false);
  // One Ground Studio for the whole screen, opened on whichever part was tapped.
  const [studio, setStudio] = useState<string | null>(null);
  const identity = clubKitFor(state);
  const groundName = groundIdentity(state).groundName;
  const components = state.infrastructure ? Object.values(groundComponents(state)) : [];
  const needsWork = components.filter((item) => item.condition?.attention && item.id !== "pitch").length;
  const building = components.filter((item) => item.works).length;
  const emptyCorners = components.filter((item) => item.empty && !item.works).length;
  const places = state.infrastructure ? stadiumCapacity(state) : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <section className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2" aria-label="Club areas">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2.5 rounded-xl bg-[#0f2a22] px-3 py-2.5 text-left text-[#eef6f1] shadow-sm"
          onClick={() => setStudio("stand:W")}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Ground Studio</span>
            <strong className="block truncate text-[15px] leading-tight">{groundName ?? "Your ground"}</strong>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] opacity-80">
              <span className="tabular-nums">{places.toLocaleString("en-GB")} places</span>
              {building ? <span className="inline-flex items-center gap-1 text-amber-300"><HardHat className="size-3" />{building} building</span> : null}
              {needsWork ? <span className="text-amber-200">{needsWork} need{needsWork === 1 ? "s" : ""} repair</span> : null}
              {emptyCorners ? <span className="inline-flex items-center gap-0.5 text-violet-200"><Plus className="size-3" />{emptyCorners} empty corner{emptyCorners === 1 ? "" : "s"}</span> : null}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 opacity-60" />
        </button>

        <Button
          variant="outline"
          className="h-auto flex-col gap-1 rounded-xl px-3 py-2"
          onClick={() => setIdentityOpen(true)}
          aria-label="Club identity: badge and kits"
        >
          <span className="grid size-8 place-items-center overflow-hidden rounded-lg border bg-muted/45">
            <ClubBadge design={identity.badge} clubName={state.clubName} size={26} />
          </span>
          <span className="text-[10px] font-semibold">Badge & kits</span>
        </Button>
      </section>

      <div className="min-h-0 flex-1">
        <FacilitiesTab state={state} update={update} onOpenStudio={(selection) => setStudio(selection ?? "stand:W")} />
      </div>

      <ClubIdentitySheet open={identityOpen} onOpenChange={setIdentityOpen} state={state} update={update} />
      {studio ? (
        <GroundStudioSheet
          open
          onOpenChange={(open) => { if (!open) setStudio(null); }}
          state={state}
          update={update}
          initialSelection={studio}
        />
      ) : null}
    </div>
  );
}
