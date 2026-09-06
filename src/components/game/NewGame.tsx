import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "./shared/primitives";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { cn } from "@/lib/utils";

export function NewGame({ onStart, activeSlot, slots, onSelectSlot }: { onStart: (club: string, manager: string) => void; activeSlot: SaveSlotId; slots: SaveSlotSummary[]; onSelectSlot: (slot: SaveSlotId) => void }) {
  const [club, setClub] = useState("Dalton Town");
  const [manager, setManager] = useState("N. Cahill");
  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Legacy Football" subtitle="Build a club legacy from non-league to the top" />
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm">New Club Setup</div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-3 gap-2">
              {slots.map(({ id, state }, index) => (
                <button
                  key={id}
                  onClick={() => onSelectSlot(id)}
                  className={cn(
                    "rounded-xl border p-2 text-left",
                    id === activeSlot && "border-primary bg-primary/10",
                  )}
                >
                  <span className="block text-[10px] font-bold uppercase text-muted-foreground">Career {index + 1}</span>
                  <span className="block truncate text-xs font-semibold">{state?.clubName ?? "Empty"}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              You take over a club in Division Four with £3M in the bank. Set ticket prices,
              control the wage bill, invest in the ground and build your way up the pyramid.
            </p>
            <div className="space-y-2">
              <Label htmlFor="club">Club name</Label>
              <Input id="club" value={club} onChange={(e) => setClub(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr">Chairman name</Label>
              <Input id="mgr" value={manager} onChange={(e) => setManager(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={!club.trim()}
              onClick={() => onStart(club.trim(), manager.trim() || "Chairman")}
            >
              <Play className="mr-2 size-4" /> Start Season
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
