import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventOutcome, EventTexturePattern } from "@/lib/game/supporterEventPresentation";

export function EventArtTexture({
  pattern,
  className,
}: {
  pattern: EventTexturePattern;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("lf-event-texture", `is-${pattern}`, className)}
    />
  );
}

export function TurnoutIndicator({
  outcome,
  size = "md",
}: {
  outcome: EventOutcome | null;
  size?: "sm" | "md" | "lg";
}) {
  if (!outcome) return null;
  const Icon = outcome === "strong" ? ArrowUp : outcome === "weak" ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "lf-turnout-indicator",
        `is-${outcome}`,
        size === "sm" ? "is-sm" : size === "lg" ? "is-lg" : "is-md",
      )}
      title={outcome === "strong" ? "Strong turnout" : outcome === "weak" ? "Quiet turnout" : "Steady turnout"}
      aria-label={outcome === "strong" ? "Strong turnout" : outcome === "weak" ? "Quiet turnout" : "Steady turnout"}
    >
      <Icon />
    </span>
  );
}
