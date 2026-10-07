import { cn } from "@/lib/utils";
import { DESK_KIND_LABEL, type DeskDealKind, type DeskPriority } from "@/lib/game/transferDesk";

/* Shared visual atoms for the Transfer Desk: one stage ladder and one
   transaction tag, used by the deal list, the deal room and squad rows so a
   deal always reads the same wherever it appears. */

/** Segmented stage ladder. `compact` shows only the current stage label. */
export function DealStageLadder({
  stages,
  current,
  compact = false,
  done = false,
}: {
  stages: readonly string[];
  current: number;
  compact?: boolean;
  /** Completed deals fill every segment. */
  done?: boolean;
}) {
  if (compact) {
    return (
      <div
        className="lf-desk-ladder is-compact"
        aria-label={`Stage ${current + 1} of ${stages.length}: ${stages[current]}`}
      >
        <div className="lf-desk-ladder-track">
          {stages.map((stage, index) => (
            <span
              key={stage}
              className={cn(
                index < current || done ? "is-done" : index === current ? "is-current" : undefined,
              )}
            />
          ))}
        </div>
        <span className="lf-desk-ladder-label">{stages[current]}</span>
      </div>
    );
  }
  return (
    <ol className="lf-desk-ladder" aria-label="Deal stages">
      {stages.map((stage, index) => (
        <li
          key={stage}
          className={cn(
            index < current || done ? "is-done" : index === current ? "is-current" : undefined,
          )}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="lf-desk-ladder-bar" />
          <span className="lf-desk-ladder-step">{stage}</span>
        </li>
      ))}
    </ol>
  );
}

/** Explicit transaction tag: Recruiting / Selling / Loan in / Loan out. */
export function DealKindTag({ kind, className }: { kind: DeskDealKind; className?: string }) {
  return (
    <span className={cn("lf-desk-kind", `is-${kind}`, className)}>{DESK_KIND_LABEL[kind]}</span>
  );
}

/** Small status marker matching the Live Business priority groups. */
export function DealPriorityDot({ priority }: { priority: DeskPriority }) {
  return <span className={cn("lf-desk-dot", `is-${priority}`)} aria-hidden="true" />;
}
