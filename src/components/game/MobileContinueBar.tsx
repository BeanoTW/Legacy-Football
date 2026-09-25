import { ChevronUp, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdvanceTarget } from "@/lib/game/advancePlanner";

export function MobileContinueBar({
  isContinuing,
  startContinue,
  stopContinue,
  label,
  targets = [],
  onAdvanceTo,
}: {
  isContinuing: boolean;
  startContinue: () => void;
  stopContinue: () => void;
  label: string;
  /** Places to stop, from advanceTargets(). The first is plain "Continue". */
  targets?: AdvanceTarget[];
  onAdvanceTo?: (target: AdvanceTarget) => void;
}) {
  const nextMatch = targets.find((target) => target.id === "matchday");
  const hint = isContinuing ? label : nextMatch ? nextMatch.detail : label;
  const choices = targets.filter((target) => target.id !== "anything");

  return (
    <div className="lf-continue-bar fixed bottom-0 inset-x-0 z-50 border-t bg-card/95 backdrop-blur px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,.12)]">
      <div className="mx-auto flex w-full max-w-[1600px] gap-2">
        <Button
          className="lf-continue-button h-12 min-w-0 flex-1 justify-between px-4 text-base font-bold md:h-14 md:px-6 md:text-lg"
          variant={isContinuing ? "destructive" : "default"}
          onClick={isContinuing ? stopContinue : startContinue}
        >
          <span className="flex items-center gap-2">
            {isContinuing ? <Pause className="size-5" /> : <Play className="size-5" />}
            {isContinuing ? "Stop" : "Continue"}
          </span>
          <span className="ml-3 min-w-0 truncate text-xs font-medium opacity-80 md:text-sm">{hint}</span>
        </Button>
        {!isContinuing && onAdvanceTo && choices.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-12 shrink-0 px-3 md:h-14" aria-label="Choose where to stop">
                <ChevronUp className="size-5" />
                <span className="hidden text-sm sm:inline">Advance to</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-72">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Time still stops early for matches and decisions.
              </DropdownMenuLabel>
              {choices.map((target) => (
                <DropdownMenuItem key={target.id} onSelect={() => onAdvanceTo(target)} className="flex flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-semibold">{target.label}</span>
                  <span className="text-xs text-muted-foreground">{target.detail}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}