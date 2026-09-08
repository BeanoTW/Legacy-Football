import { useState } from "react";
import { ArrowLeft, Binoculars } from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import { createScoutingBrief, scoutingSearchPlan } from "@/lib/game/scoutingDiscovery";
import { Button } from "@/components/ui/button";
import { DetailScreen } from "./shared/layout";

const POSITIONS: Array<{ value: "" | Position; label: string }> = [
  { value: "", label: "Any position" },
  { value: "GK", label: "Goalkeeper" },
  { value: "DEF", label: "Defender" },
  { value: "MID", label: "Midfielder" },
  { value: "FWD", label: "Forward" },
];

export function ScoutingBriefBuilder({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [position, setPosition] = useState<"" | Position>("");
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(32);
  const [clubStatus, setClubStatus] = useState<"" | "free" | "contracted">("");
  const [maxFee, setMaxFee] = useState("");
  const [maxWage, setMaxWage] = useState("");
  const plan = scoutingSearchPlan(state);

  const dispatch = () => {
    const sequence = state.football?.scoutingDiscovery?.briefs.length ?? 0;
    update((s) => createScoutingBrief(s, {
      id: `chairman-brief:s${s.season}:w${s.week}:r${sequence + 1}`,
      position: position || undefined,
      minAge,
      maxAge,
      clubStatus: clubStatus || undefined,
      maxMarketValue: maxFee ? Math.max(0, Number(maxFee)) : undefined,
      maxWeeklyWage: maxWage ? Math.max(0, Number(maxWage)) : undefined,
    }));
  };

  return (
    <DetailScreen
      title="Set scouting brief"
      subtitle="Tell the recruitment team what kind of player you want. Nothing is searched until you send the brief."
      actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
    >
      <section className="max-w-2xl rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex items-start gap-3">
          <Binoculars className="mt-0.5 size-7 shrink-0" />
          <div>
            <div className="font-display text-xl">What should the scouts look for?</div>
            <p className="mt-1 text-sm text-muted-foreground">Set the essentials. Your staff will rank suitable players using their own judgement rather than giving you a searchable player database.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold">Position
            <select className="h-10 rounded-md border bg-background px-3 text-sm font-normal" value={position} onChange={(e) => setPosition(e.target.value as "" | Position)}>
              {POSITIONS.map((item) => <option key={item.value || "any"} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">Player status
            <select className="h-10 rounded-md border bg-background px-3 text-sm font-normal" value={clubStatus} onChange={(e) => setClubStatus(e.target.value as "" | "free" | "contracted")}>
              <option value="">Any</option><option value="contracted">Under contract</option><option value="free">Free agents</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold">Minimum age
            <input className="h-10 rounded-md border bg-background px-3 text-sm font-normal" type="number" min={16} max={40} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold">Maximum age
            <input className="h-10 rounded-md border bg-background px-3 text-sm font-normal" type="number" min={16} max={45} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold">Maximum transfer fee <span className="font-normal text-muted-foreground">Optional · £</span>
            <input className="h-10 rounded-md border bg-background px-3 text-sm font-normal" inputMode="numeric" placeholder="No limit" value={maxFee} onChange={(e) => setMaxFee(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
          <label className="grid gap-1 text-xs font-semibold">Maximum weekly wage <span className="font-normal text-muted-foreground">Optional · £/wk</span>
            <input className="h-10 rounded-md border bg-background px-3 text-sm font-normal" inputMode="numeric" placeholder="No limit" value={maxWage} onChange={(e) => setMaxWage(e.target.value.replace(/[^0-9]/g, ""))} />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">{plan.quality}</div><div className="text-muted-foreground">Scout quality</div></div>
          <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">{plan.searchDays}d</div><div className="text-muted-foreground">Expected search</div></div>
          <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">Up to {plan.candidateLimit}</div><div className="text-muted-foreground">Options</div></div>
        </div>

        {minAge > maxAge && <p className="mt-3 text-xs text-destructive">Maximum age must be at least the minimum age.</p>}
        <Button className="mt-5 w-full sm:w-auto" disabled={minAge > maxAge} onClick={dispatch}><Binoculars className="mr-2 size-4" /> Send scouts</Button>
      </section>
    </DetailScreen>
  );
}
