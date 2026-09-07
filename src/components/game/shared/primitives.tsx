import { Info, Trophy } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function InfoTip({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ?? "More info"}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center size-4 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors align-middle"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-64 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="panel-strip">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <Trophy className="size-6 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="lf-brand-kicker">Legacy Football</div>
          <h1 className="font-display text-xl leading-none truncate">{title}</h1>
          {subtitle && <div className="text-xs opacity-80 mt-0.5 truncate">{subtitle}</div>}
        </div>
        {right}
      </div>
    </header>
  );
}

export function Kpi({
  icon,
  label,
  value,
  tone,
  info,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
  info?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-black/10 px-3 py-2">
      <div className="opacity-80">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-1">
          <span className="truncate">{label}</span>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </div>
        <div
          className={cn(
            "font-display text-lg leading-tight",
            tone === "good" && "text-emerald-300",
            tone === "bad" && "text-rose-300",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
  right,
  info,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  info?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden mb-4">
      <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          {title}
          {info && <InfoTip label={title}>{info}</InfoTip>}
        </span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "muted";
  info?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <span>{label}</span>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </div>
      <div
        className={cn(
          "font-display text-2xl tnum leading-tight",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
export const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

export const HEALTH_TONE: Record<string, string> = {
  secure: "text-emerald-600",
  healthy: "text-teal-600",
  tight: "text-amber-600",
  stressed: "text-orange-600",
  critical: "text-rose-600",
};

export function Meter({ value, tone }: { value: number; tone?: string }) {
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn("h-full rounded-full", tone ?? "bg-primary/70")}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

export function initials(name: string) {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function Info2({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bad" | "good";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-base",
          tone === "bad" && "text-[color:var(--color-expense)]",
          tone === "good" && "text-[color:var(--color-income)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}
