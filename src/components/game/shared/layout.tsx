import { createElement, isValidElement, type ElementType, type ReactNode } from "react";
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
    <header className="lf-screen-header grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
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
  metrics,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  metrics?: readonly { label: string; value: string }[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 md:gap-3">
      <ScreenHeader title={title} subtitle={subtitle} actions={actions} />
      {metrics && metrics.length > 0 && (
        <div className="grid shrink-0 grid-cols-2 gap-1.5 md:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg border bg-card px-2.5 py-2">
              <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
              <div className="truncate font-display text-sm md:text-base">{metric.value}</div>
            </div>
          ))}
        </div>
      )}
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
  description,
  meta,
  urgent = false,
  onClick,
}: {
  icon: ReactNode | ElementType<{ className?: string }>;
  title: string;
  value?: string;
  sub?: string;
  description?: string;
  meta?: string;
  urgent?: boolean;
  onClick: () => void;
}) {
  // JSX elements are already renderable. Icon libraries may expose component
  // references either as functions or as React forwardRef/memo objects; those
  // objects cannot be rendered directly as children and must be instantiated.
  const componentReference =
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "$$typeof" in icon);
  const iconNode = isValidElement(icon)
    ? icon
    : componentReference
      ? createElement(icon as ElementType<{ className?: string }>, {
          className: "size-4 md:size-5",
        })
      : icon;
  const detail = value ?? meta;
  const supporting = sub ?? description;

  return (
    <button
      onClick={onClick}
      className={cn(
        "lf-workflow-tile flex min-h-[4.25rem] w-full flex-col justify-center gap-1.5 rounded-xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/50 md:min-h-[5.5rem] md:p-3",
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
          {iconNode}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm leading-tight md:text-base xl:text-lg">
            {title}
          </span>
          {detail && (
            <span className="block truncate text-xs text-muted-foreground md:text-sm">{detail}</span>
          )}
        </span>
      </div>
      {supporting && <span className="hidden truncate text-xs text-muted-foreground xl:block">{supporting}</span>}
    </button>
  );
}
