/* Shared stadium UI atoms for Ground Studio and Facilities.
 *
 * One visual grammar everywhere:
 *   teal   = free, cosmetic, instant
 *   purple = paid physical/capital work (the investment accent, used sparingly)
 *   amber  = what is selected
 *   green → red = condition
 * Colours resolve from --lf-* tokens, which fall back to the app theme, so the
 * same atoms sit on the dark Ground Studio surface and the Facilities tab. */

import { useState, type ReactNode } from "react";
import { Ban, Check, ChevronDown, HardHat, Lock, PauseCircle, PoundSterling, ShieldAlert, Timer } from "lucide-react";
import type { CapitalProject, GameState } from "@/lib/game/types";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import type { ConditionBand } from "@/lib/game/infrastructure";
import { projectStatus, projectShortTitle, weeksLabel, type ConditionSummary, type LadderStep, type LockReason, type ProjectOption } from "@/lib/game/stadiumUx";
import { cn } from "@/lib/utils";

export const BAND_HEX: Record<ConditionBand, string> = {
  excellent: "#34d399",
  good: "#86d955",
  worn: "#facc15",
  poor: "#fb923c",
  critical: "#f43f5e",
  closed: "#64748b",
};

export const KIT_CSS = `@layer components {
.lfk { --k-fg: var(--lf-fg, var(--color-foreground, #10201b)); --k-muted: var(--lf-muted, var(--color-muted-foreground, #5d6e68));
  --k-card: var(--lf-card, var(--color-card, #fff)); --k-sunk: var(--lf-sunk, color-mix(in oklab, var(--color-muted, #eef2f0) 70%, transparent));
  --k-line: var(--lf-line, var(--color-border, rgb(16 32 27 / 12%))); --k-paid: var(--lf-paid, #7c5cf0); --k-paid-fg: var(--lf-paid-fg, #fff);
  --k-paid-soft: var(--lf-paid-soft, rgb(124 92 240 / 12%)); --k-paid-text: var(--lf-paid-text, #6a4bdc); --k-free: var(--lf-free, #13896f); --k-free-soft: var(--lf-free-soft, rgb(19 137 111 / 12%));
  --k-select: #ffc53d; --k-warn: var(--lf-warn, #b45309); --k-warn-soft: var(--lf-warn-soft, rgb(245 158 11 / 14%)); --k-bad: var(--lf-bad, #e11d48); --k-bad-soft: var(--lf-bad-soft, rgb(244 63 94 / 12%)); }
.lfk-card { background: var(--k-card); border: 1px solid var(--k-line); border-radius: 14px; }
.lfk-sunk { background: var(--k-sunk); border-radius: 12px; }
.lfk-muted { color: var(--k-muted); }
.lfk-eyebrow { font-size: 9.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--k-muted); }
.lfk-num { font-variant-numeric: tabular-nums; }
.lfk-tag { display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 700; line-height: 16px; white-space: nowrap; }
.lfk-tag-free { background: var(--k-free-soft); color: var(--k-free); }
.lfk-tag-paid { background: var(--k-paid-soft); color: var(--k-paid-text); }
.lfk-tag-plain { background: var(--k-sunk); color: var(--k-fg); }
.lfk-lock { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 650; line-height: 1.3; }
.lfk-lock-money { color: var(--k-warn); }
.lfk-lock-busy { color: var(--k-muted); }
.lfk-lock-bad { color: var(--k-bad); }
.lfk-btn-paid { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border-radius: 12px; padding: 0 16px; font-size: 14px; font-weight: 700;
  background: var(--k-paid); color: var(--k-paid-fg); box-shadow: 0 6px 18px -8px var(--k-paid); transition: transform .12s ease, opacity .12s ease; }
.lfk-btn-paid:active { transform: scale(.98); }
.lfk-btn-paid:disabled { background: var(--k-sunk); color: var(--k-muted); box-shadow: none; }
.lfk-btn-quiet { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border-radius: 12px; padding: 0 14px; font-size: 13px; font-weight: 650;
  border: 1px solid var(--k-line); color: var(--k-fg); background: transparent; }
.lfk-meter { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.lfk-meter > i { height: 6px; border-radius: 3px; background: var(--k-line); }
.lfk-bar { position: relative; height: 6px; border-radius: 3px; background: var(--k-line); overflow: hidden; }
.lfk-bar > i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; }
.lfk-hatch { background: repeating-linear-gradient(-45deg, #f59e0b 0 6px, #1f2937 6px 12px); }
.lfk-step { position: relative; display: grid; justify-items: center; gap: 4px; min-width: 0; }
.lfk-step-tile { display: grid; place-items: center; width: 100%; aspect-ratio: 1.45; border-radius: 10px; border: 1px solid var(--k-line); color: var(--k-muted); background: transparent; }
.lfk-step-done .lfk-step-tile { color: var(--k-fg); background: var(--k-sunk); }
.lfk-step-current .lfk-step-tile { color: var(--k-fg); background: var(--k-sunk); border: 2px solid var(--k-select); }
.lfk-step-next .lfk-step-tile { color: var(--k-paid-text); border: 1.5px dashed var(--k-paid-text); background: var(--k-paid-soft); }
.lfk-step-name { font-size: 10px; font-weight: 700; line-height: 1.15; text-align: center; color: var(--k-muted); }
.lfk-step-current .lfk-step-name, .lfk-step-done .lfk-step-name { color: var(--k-fg); }
.lfk-step-next .lfk-step-name { color: var(--k-paid-text); }
.lfk-step-sub { font-size: 9px; line-height: 1.1; text-align: center; color: var(--k-muted); }
.lfk-step-flag { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); border-radius: 999px; padding: 0 6px; font-size: 8.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; line-height: 14px; white-space: nowrap; }
}`;

export function KitStyles() {
  return <style>{KIT_CSS}</style>;
}

/* ---------------- Condition ---------------- */

export function ConditionMeter({ summary, className }: { summary: ConditionSummary; className?: string }) {
  const colour = BAND_HEX[summary.band];
  return (
    <div className={cn("lfk-meter", className)} aria-label={`${summary.label}, ${summary.pct}% condition`}>
      {[1, 2, 3, 4, 5].map((segment) => <i key={segment} style={segment <= summary.segments ? { background: colour } : undefined} />)}
    </div>
  );
}

export function ConditionDot({ band, size = 8 }: { band: ConditionBand; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: BAND_HEX[band] }} />;
}

/** "Worn · 52%" in the band colour. */
export function ConditionLabel({ summary, className }: { summary: ConditionSummary; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", className)}>
      <ConditionDot band={summary.band} />
      <span>{summary.label}</span>
      <span className="lfk-muted lfk-num font-medium">{summary.pct}%</span>
    </span>
  );
}

/** Condition now and after the work, on one bar. */
export function ConditionPreview({ from, to }: { from: number; to: number }) {
  const lo = Math.max(0, Math.min(100, Math.min(from, to)));
  const hi = Math.max(0, Math.min(100, Math.max(from, to)));
  return (
    <div className="lfk-bar" aria-label={`Condition ${Math.round(from)}% to ${Math.round(to)}%`}>
      <i style={{ width: `${hi}%`, background: "color-mix(in oklab, #34d399 45%, transparent)" }} />
      <i style={{ width: `${lo}%`, background: BAND_HEX[from >= 80 ? "excellent" : from >= 60 ? "good" : from >= 40 ? "worn" : from >= 20 ? "poor" : "critical"] }} />
    </div>
  );
}

/* ---------------- Money and locks ---------------- */

export function FreeTag({ children = "Free" }: { children?: ReactNode }) {
  return <span className="lfk-tag lfk-tag-free"><Check className="size-3" />{children}</span>;
}

export function LockChip({ lock, className }: { lock: LockReason; className?: string }) {
  const Icon = lock.kind === "cash" ? PoundSterling : lock.kind === "reserve" ? ShieldAlert : lock.kind === "asset" || lock.kind === "club" ? HardHat : lock.kind === "dependency" ? Lock : Ban;
  const tone = lock.kind === "cash" || lock.kind === "reserve" ? "lfk-lock-money" : lock.kind === "dependency" ? "lfk-lock-bad" : "lfk-lock-busy";
  return (
    <span className={cn("lfk-lock", tone, className)}>
      <Icon className="size-3.5 shrink-0" />
      <span>{lock.text}</span>
    </span>
  );
}

export const priceLabel = (cost: number) => (cost >= 100_000 ? fmtMoney(cost) : fmtMoneyExact(cost));

/* ---------------- Silhouettes ---------------- */

/** Side sections of a stand (pitch on the left) and plan views of a corner. */
export function Silhouette({ shape, className }: { shape: LadderStep["shape"]; className?: string }) {
  const ground = <path d="M2 29.5H54" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />;
  const steps = (h: number, from = 14, to = 40) => {
    const n = 5;
    const pts: string[] = [`M${from} 29`];
    for (let i = 0; i < n; i += 1) {
      const x0 = from + ((to - from) * i) / n;
      const x1 = from + ((to - from) * (i + 1)) / n;
      const y = 29 - (h * (i + 1)) / n;
      pts.push(`L${x0} ${y}L${x1} ${y}`);
    }
    pts.push(`L${to} 29Z`);
    return <path d={pts.join("")} fill="currentColor" fillOpacity={0.55} />;
  };
  let body: ReactNode;
  switch (shape) {
    case "empty":
      return (
        <svg viewBox="0 0 56 32" className={cn("h-7 w-12", className)} aria-hidden>
          <rect x={28} y={3} width={25} height={9} rx={1.5} fill="currentColor" fillOpacity={0.3} />
          <rect x={1} y={12} width={9} height={18} rx={1.5} fill="currentColor" fillOpacity={0.3} />
          <rect x={11.5} y={13.5} width={15} height={15} rx={2} fill="none" stroke="currentColor" strokeDasharray="2.5 2" strokeWidth={1.1} />
          <path d="M19 17.5v7M15.5 21h7" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
        </svg>
      );
    case "cover":
      body = <>{steps(6, 14, 36)}<path d="M18 19.5H38M20 19.5V29M36 19.5V29" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" /></>;
      break;
    case "pitched":
      body = <>{steps(10, 12, 40)}<path d="M12 15L42 11M16 14.5V29M41 11.2V29" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></>;
      break;
    case "cantilever":
      body = <>{steps(13, 11, 42)}<path d="M8 10.5L44 6.5M44 6.5V29M44 6.5L38 3.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></>;
      break;
    case "twoTier":
      body = <>{steps(8, 10, 34)}<path d="M22 19h22v10" fill="currentColor" fillOpacity={0.25} /><path d="M20 17L46 7" stroke="currentColor" strokeWidth={4} strokeOpacity={0.55} /><path d="M8 6L48 2.5M48 2.5V29" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" /></>;
      break;
    case "landmark":
      body = <>{steps(8, 9, 32)}<path d="M18 18L44 8" stroke="currentColor" strokeWidth={4.5} strokeOpacity={0.55} /><path d="M5 8C18 0.5 38 0 50 4V29" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" /><path d="M50 4L50 29" stroke="currentColor" strokeWidth={1.8} /></>;
      break;
    case "cornerSmall":
    case "cornerMid":
    case "cornerFull": {
      // Plan view: the end stand (left) and touchline stand (top) with the corner filled between them.
      const fill = shape === "cornerSmall" ? "M10 12L10 20L18 12Z" : shape === "cornerMid" ? "M10 12L10 27L25 12Z" : "M10 12L10 30L13 30C20 30 28 22 28 14L28 12Z";
      body = <><rect x={28} y={3} width={25} height={9} rx={1.5} fill="currentColor" fillOpacity={0.3} /><rect x={1} y={12} width={9} height={18} rx={1.5} fill="currentColor" fillOpacity={0.3} /><path d={fill} fill="currentColor" fillOpacity={0.75} /></>;
      return <svg viewBox="0 0 56 32" className={cn("h-7 w-12", className)} aria-hidden>{body}</svg>;
    }
  }
  return <svg viewBox="0 0 56 32" className={cn("h-7 w-12", className)} aria-hidden>{body}{ground}</svg>;
}

/* ---------------- Development ladder ---------------- */

export function Ladder({ steps, current, next, labelNext = "Next", currentSub }: { steps: LadderStep[]; current: number; next?: number | null; labelNext?: string; /** What the current step actually has, e.g. the roof built. */ currentSub?: string }) {
  return (
    <ol className="grid gap-1.5 pt-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Development stages">
      {steps.map((step) => {
        const state = step.level === current ? "current" : next != null && step.level === next ? "next" : step.level < current ? "done" : "future";
        return (
          <li key={step.level} className={cn("lfk-step", `lfk-step-${state}`)} aria-current={state === "current" ? "step" : undefined}>
            {state === "current" ? <span className="lfk-step-flag" style={{ background: "var(--k-select)", color: "#2a1d00" }}>Now</span> : null}
            {state === "next" ? <span className="lfk-step-flag" style={{ background: "var(--k-paid)", color: "var(--k-paid-fg)" }}>{labelNext}</span> : null}
            <span className="lfk-step-tile"><Silhouette shape={step.shape} /></span>
            <span className="lfk-step-name">{step.name}</span>
            <span className="lfk-step-sub">{state === "current" && currentSub ? currentSub : step.roof}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- Live works ---------------- */

export function ProjectProgress({ state, project, assetName, compact = false }: { state: GameState; project: CapitalProject; assetName?: string; compact?: boolean }) {
  const status = projectStatus(state, project);
  return (
    <div className={cn("lfk-card overflow-hidden", compact ? "p-2.5" : "p-3")}>
      <div className="flex items-start gap-2.5">
        <span className="lfk-hatch grid size-8 shrink-0 place-items-center rounded-lg"><HardHat className="size-4 text-white drop-shadow" /></span>
        <div className="min-w-0 flex-1">
          <div className="lfk-eyebrow">{status.paused ? "Paused · awaiting payment" : "Under construction"}</div>
          <div className="truncate text-[13.5px] font-semibold">{projectShortTitle(project, assetName)}</div>
        </div>
        <strong className="lfk-num shrink-0 font-display text-lg leading-none">{status.progress}%</strong>
      </div>
      <div className="lfk-bar mt-2.5">
        <i style={{ width: `${Math.max(3, status.progress)}%`, background: status.paused ? "#f59e0b" : "var(--k-paid)" }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className={cn("inline-flex items-center gap-1 font-semibold", status.paused && "text-amber-600")}>
          {status.paused ? <PauseCircle className="size-3.5" /> : <Timer className="size-3.5" />}
          {status.weeksLeft > 0 ? `${weeksLabel(status.weeksLeft)} to go` : "Finishing"}
          {status.late ? " · running late" : ""}
        </span>
        {status.addsPlaces > 0 ? <span className="lfk-muted">+{status.addsPlaces.toLocaleString("en-GB")} places on completion</span> : null}
        {!compact && status.closedPct > 0 ? <span className="lfk-muted">{status.closedPct}% of places closed meanwhile</span> : null}
        {!compact ? <span className="lfk-muted lfk-num">{priceLabel(status.spent)} of {priceLabel(status.budget)} paid</span> : null}
      </div>
    </div>
  );
}

/* ---------------- Paid work cards ---------------- */

/**
 * A paid piece of work. Collapsed: what it does, how long, the price and, if
 * blocked, the single reason. Tap to open; the second tap spends the money.
 */
export function WorkCard({
  option,
  condition,
  onApprove,
  approveLabel,
  featured = false,
  eyebrow,
  extra,
  previewLabel,
}: {
  option: ProjectOption;
  /** Current condition, to preview repairs. */
  condition?: number;
  onApprove: () => void;
  approveLabel?: string;
  featured?: boolean;
  eyebrow?: string;
  extra?: ReactNode;
  /** Locked work can still be opened to explore it (e.g. the build planner). */
  previewLabel?: string;
}) {
  const [open, setOpen] = useState(featured);
  const { spec, lock } = option;
  const closed = Math.round((1 - spec.disruption.capacityFactor) * 100);
  const meta = [
    option.addsPlaces > 0 ? `+${option.addsPlaces.toLocaleString("en-GB")} places` : null,
    option.conditionAfter != null && condition != null ? `Condition ${Math.round(condition)} → ${option.conditionAfter}%` : null,
    weeksLabel(spec.durationWeeks),
    closed > 0 ? `${closed}% closed during works` : null,
  ].filter(Boolean) as string[];
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="lfk-eyebrow mb-0.5" style={{ color: "var(--k-paid-text)" }}>{eyebrow}</div> : null}
          <div className={cn("font-semibold leading-tight", featured ? "font-display text-[19px]" : "text-[13.5px]", lock && "opacity-75")}>{option.title}</div>
          <div className="lfk-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {meta.map((item) => <span key={item} className="lfk-num whitespace-nowrap">{item}</span>)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("lfk-num font-display leading-none", featured ? "text-[22px]" : "text-[16px]", lock && "opacity-60")}>{priceLabel(spec.cost)}</div>
          {!featured ? <ChevronDown className={cn("lfk-muted ml-auto mt-1 size-4 transition-transform", open && "rotate-180")} /> : null}
        </div>
      </div>
      {lock ? <LockChip lock={lock} className="mt-2" /> : null}
    </>
  );
  return (
    <div className={cn("lfk-card", featured ? "p-3.5" : "p-0")} style={featured ? { borderColor: lock ? undefined : "color-mix(in oklab, var(--k-paid) 45%, var(--k-line))" } : undefined}>
      {featured ? body : (
        <button type="button" className="block w-full p-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{body}</button>
      )}
      {open ? (
        <div className={cn("space-y-2.5", featured ? "mt-3" : "px-3 pb-3")}>
          {option.conditionAfter != null && condition != null ? <ConditionPreview from={condition} to={option.conditionAfter} /> : null}
          {extra}
          {!featured ? <p className="lfk-muted text-[11.5px] leading-snug">{spec.description}</p> : null}
          {lock && previewLabel ? (
            <button type="button" className="lfk-btn-quiet w-full" onClick={onApprove}>{previewLabel}</button>
          ) : lock ? null : (
            <button type="button" className="lfk-btn-paid w-full" onClick={onApprove}>{approveLabel ?? `Approve · ${fmtMoneyExact(spec.cost)}`}</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Capacity now → after, drawn to scale. */
export function CapacityGrowth({ from, add }: { from: number; add: number }) {
  const to = from + add;
  const now = to > 0 ? (from / to) * 100 : 0;
  return (
    <div>
      <div className="lfk-bar" style={{ height: 8 }}>
        <i style={{ width: "100%", background: "color-mix(in oklab, var(--k-paid) 30%, transparent)" }} />
        <i style={{ width: `${now}%`, background: "var(--k-fg)", opacity: 0.75 }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] font-semibold lfk-num">
        <span className="lfk-muted">{from.toLocaleString("en-GB")} now</span>
        <span style={{ color: "var(--k-paid-text)" }}>{to.toLocaleString("en-GB")} after</span>
      </div>
    </div>
  );
}
