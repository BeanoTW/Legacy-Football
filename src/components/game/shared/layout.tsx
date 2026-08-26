import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Shared responsive screen primitives.
 *
 * Type A — OverviewScreen: header + compact body that fits the content region.
 * Type B — DetailScreen: fixed header, internally scrolling body pane.
 * Both assume the parent (.game-screen) owns a bounded height.
 */

export function ScreenHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <h1 className="truncate font-display text-xl leading-tight md:text-2xl xl:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="hidden truncate text-xs text-muted-foreground md:block xl:text-sm">
            {subtitle}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

export function OverviewScreen({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:gap-3">
      <ScreenHeader title={title} subtitle={subtitle} actions={actions} />
      <div className={cn("min-h-0 flex-1", className)}>{children}</div>
    </div>
  );
}

export function DetailScreen({
  title,
  subtitle,
  actions,
  toolbar,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:gap-3">
      <ScreenHeader title={title} subtitle={subtitle} actions={actions} />
      {toolbar && <div className="shrink-0">{toolbar}</div>}
      <div className={cn("contained-scroll min-h-0 flex-1 pr-0.5", className)}>{children}</div>
    </div>
  );
}

/** Compact, touch-friendly workflow tile used across overview screens. */
export function WorkflowTile({
  icon,
  title,
  value,
  sub,
  urgent = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  value?: string;
  sub?: string;
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-[4.25rem] w-full flex-col justify-center gap-1.5 rounded-xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/50 md:min-h-[5.5rem] md:p-3",
        urgent && "border-amber-500/70 bg-amber-500/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg md:size-10",
            urgent ? "bg-amber-500 text-white" : "bg-primary/10 text-primary",
          )}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm leading-tight md:text-base xl:text-lg">
            {title}
          </span>
          {value && (
            <span className="block truncate text-xs text-muted-foreground md:text-sm">{value}</span>
          )}
        </span>
      </div>
      {sub && <span className="hidden truncate text-xs text-muted-foreground xl:block">{sub}</span>}
    </button>
  );
}
