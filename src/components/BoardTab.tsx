import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { BoardObjective, Director, GameState } from "@/lib/game/types";
import {
  BAND_CLASS,
  BAND_LABEL,
  TRAIT_DESC,
  TRAIT_LABEL,
  confidenceBand,
  directorConcern,
  directorSatisfaction,
  evaluateObjective,
  recomputeConfidence,
} from "@/lib/game/board";
import { fmtMoneyExact } from "@/lib/game/engine";
import { BadgePoundSterling, Building2, ClipboardList, Trophy, UsersRound, WalletCards } from "lucide-react";

type View = "overview" | "directors" | "objectives" | "reviews";

const PRIORITY_LABEL: Record<string, string> = {
  results: "Results",
  finance: "Finance",
  fans: "Supporters",
  facilities: "Facilities",
  squad: "Squad",
  commercial: "Commercial",
};

export function BoardTab({ state }: { state: GameState }) {
  const [view, setView] = useState<View>("overview");
  const board = state.board;
  const confidence = useMemo(() => (board ? recomputeConfidence(board) : 50), [board]);

  if (!board?.directors?.length) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        The boardroom has not been seated yet. Advance a week to convene the board.
      </div>
    );
  }

  const band = confidenceBand(confidence);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs">Board of Directors</div>
        <div className="p-4 flex flex-wrap items-center gap-4">
          <ConfidenceDial value={confidence} />
          <div className="min-w-40">
            <div className={cn("text-lg font-semibold", BAND_CLASS[band])}>{BAND_LABEL[band]}</div>
            <p className="text-xs text-muted-foreground max-w-md">
              Board confidence is the influence-weighted view of {board.directors.length} directors.
              They do not agree with each other — each judges you on the part of the club they own.
            </p>
          </div>
        </div>
        <div className="px-3 pb-3">
          <Segmented
            options={
              [
                ["overview", "Overview"],
                ["directors", "Directors"],
                ["objectives", "Objectives"],
                ["reviews", "Reviews"],
              ] as const
            }
            value={view}
            onChange={(v) => setView(v as View)}
          />
        </div>
      </div>

      {view === "overview" && <Overview state={state} />}
      {view === "directors" && <Directors state={state} />}
      {view === "objectives" && <Objectives state={state} />}
      {view === "reviews" && <Reviews state={state} />}
    </div>
  );
}

/* ---------- Overview ---------- */

function Overview({ state }: { state: GameState }) {
  const board = state.board;
  const objectives = board.objectives ?? [];
  const progresses = objectives.map((o) => evaluateObjective(state, o));
  const onTrack = progresses.filter((p) => p.onTrack).length;
  const nextReview = state.week < 24 ? `Week 24 (mid-season)` : `Week 46 (end of season)`;

  const split = [...board.directors]
    .map((d) => ({ d, s: directorSatisfaction(state, d) }))
    .sort((a, b) => b.s - a.s);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Season {state.season} at a glance</h3>
        <Stat label="Objectives on track" value={`${onTrack} of ${objectives.length}`} />
        <Stat label="Next review" value={nextReview} />
        <Stat label="Reviews on file" value={String((board.reviews ?? []).length)} />
        <p className="text-xs text-muted-foreground">
          Objectives are set from the club's own pre-season projection, then tightened by however
          much ambition sits around the table. Missing one does not end your tenure; consistently
          missing the ones your most influential directors care about does.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-2">
        <h3 className="text-sm font-semibold">Where the room stands</h3>
        {split.map(({ d, s }) => (
          <div key={d.id} className="flex items-center gap-2 text-xs">
            <span className="w-36 truncate">{d.name}</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", barClass(s))}
                style={{ width: `${Math.max(3, Math.min(100, s))}%` }}
              />
            </div>
            <span className="w-9 text-right tabular-nums">{s}%</span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground pt-1">
          Live satisfaction, not stored confidence. Stored confidence only moves at a review.
        </p>
      </div>
    </div>
  );
}

/* ---------- Directors ---------- */

function Directors({ state }: { state: GameState }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {state.board.directors.map((d) => (
        <DirectorCard key={d.id} state={state} d={d} />
      ))}
    </div>
  );
}

function DirectorCard({ state, d }: { state: GameState; d: Director }) {
  const satisfaction = directorSatisfaction(state, d);
  const concern = directorConcern(state, d);
  const band = confidenceBand(d.confidence);
  const top = (Object.entries(d.priorities) as [string, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{d.name}</div>
          <div className="text-xs text-muted-foreground">
            {d.role} · age {d.age} · {d.influence}% boardroom influence
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-bold tabular-nums", BAND_CLASS[band])}>
            {d.confidence}%
          </div>
          <div className="text-[10px] text-muted-foreground">confidence</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{d.bio}</p>

      <div className="flex flex-wrap gap-1">
        {d.traits.map((t) => (
          <span
            key={t}
            title={TRAIT_DESC[t]}
            className="px-2 py-0.5 rounded-full border text-[10px] bg-muted/50"
          >
            {TRAIT_LABEL[t]}
          </span>
        ))}
        <span className="px-2 py-0.5 rounded-full border text-[10px] bg-muted/50">
          Patience {d.patience}
        </span>
      </div>

      <div className="space-y-1">
        <div className="text-[11px] font-medium text-muted-foreground">Cares most about</div>
        {top.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-[11px]">
            <span className="w-20">{PRIORITY_LABEL[k] ?? k}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary/70" style={{ width: `${Math.min(100, v)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-muted/40 p-2 text-[11px]">
        <span className="font-medium">Live satisfaction {satisfaction}%.</span>{" "}
        {concern
          ? `Biggest concern: ${concern.objective.label} — ${concern.progress.detail}.`
          : "No outstanding concerns in their portfolio."}
      </div>
    </div>
  );
}

/* ---------- Objectives ---------- */

function Objectives({ state }: { state: GameState }) {
  const objectives = state.board.objectives ?? [];
  if (!objectives.length) return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No objectives set.</div>;
  const icons = [Trophy, WalletCards, BadgePoundSterling, UsersRound, Building2, ClipboardList];
  return (
    <section className="lf-board-objectives">
      <div className="lf-objectives-heading"><span>Season objectives</span><small>{objectives.length} objectives</small></div>
      <div className="lf-objective-grid">
        {objectives.map((o, index) => {
          const Icon = icons[index % icons.length];
          const p = evaluateObjective(state, o);
          return (
            <div className="lf-objective-card" key={o.id}>
              <Icon />
              <div>
                <strong>{o.label}</strong>
                <p>{o.description}</p>
                <span className={cn("lf-objective-progress", p.onTrack ? "is-track" : "is-behind")}>{o.status === "active" ? (p.onTrack ? "On track" : "Behind") : o.status === "met" ? "Met" : "Missed"} · {p.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lf-objectives-review">Progress is reviewed at mid-season and again at the end of the campaign.</div>
    </section>
  );
}

/* ---------- Reviews ---------- */

function Reviews({ state }: { state: GameState }) {
  const reviews = [...(state.board.reviews ?? [])].reverse();
  if (!reviews.length) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        No reviews yet. The board reviews at week 24 and again at the end of the season.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {reviews.map((r) => {
        const band = confidenceBand(r.confidenceAfter);
        const delta = r.confidenceAfter - r.confidenceBefore;
        return (
          <div key={r.id} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                Season {r.season} · {r.type === "midSeason" ? "Mid-season" : "End of season"} review
              </div>
              <div className={cn("text-sm font-bold tabular-nums", BAND_CLASS[band])}>
                {r.confidenceAfter}%{" "}
                <span className="text-[11px] font-normal">
                  ({delta >= 0 ? "+" : ""}
                  {delta})
                </span>
              </div>
            </div>
            <p className="text-xs">{r.verdict}</p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              {r.lines.map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1 pt-1">
              {r.outcomes.map((o) => (
                <span
                  key={o.objectiveId}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] border",
                    o.met ? "text-emerald-600 border-emerald-300" : "text-rose-600 border-rose-300",
                  )}
                >
                  {o.label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Bits ---------- */

function barClass(v: number) {
  if (v >= 80) return "bg-emerald-500";
  if (v >= 62) return "bg-teal-500";
  if (v >= 45) return "bg-amber-500";
  if (v >= 28) return "bg-orange-500";
  return "bg-rose-500";
}

function ConfidenceDial({ value }: { value: number }) {
  const band = confidenceBand(value);
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 36 36" className="size-24 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.4" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          strokeWidth="3.4"
          strokeLinecap="round"
          className={cn(BAND_CLASS[band], "transition-all")}
          stroke="currentColor"
          strokeDasharray={`${Math.max(1, value)} 100`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{value}%</span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">confidence</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs border-b last:border-0 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly (readonly [T, string])[];
  value: string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border overflow-hidden">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "px-2.5 py-1 text-xs whitespace-nowrap",
            value === id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
