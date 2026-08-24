import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TopBar } from "./shared/primitives";

export function NewGame({ onStart }: { onStart: (club: string, manager: string) => void }) {
  const [club, setClub] = useState("Dalton Town");
  const [manager, setManager] = useState("N. Cahill");
  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Chairman FC" subtitle="A football finance simulator" />
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm">New Club Setup</div>
          <div className="p-6 space-y-5">
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
