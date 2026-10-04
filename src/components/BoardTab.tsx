import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MessageCircle, Pencil } from "lucide-react";
import { CharacterPortrait } from "./game/CharacterPortrait";
import { CharacterPortraitStudio } from "./game/CharacterPortraitStudio";
import { useCharacterName } from "@/hooks/useCharacterName";
import type { Director, GameState } from "@/lib/game/types";
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
import { SeasonObjectivesDashboard } from "./game/SeasonObjectivesDashboard";
import { BoardConversationDialog } from "./game/BoardConversationDialog";

type View = "overview" | "directors" | "objectives" | "reviews";

const VIEWS = [["overview","Overview"],["directors","Directors"],["objectives","Objectives"],["reviews","Reviews"]] as const;
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
    <div className="lf-board space-y-2">
      <section className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm">
        <ConfidenceDial value={confidence} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Board confidence</div>
          <div className={cn("font-display text-xl leading-tight", BAND_CLASS[band])}>{BAND_LABEL[band]}</div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Weighted view of {board.directors.length} directors, each judging their own part of the club.
          </p>
        </div>
      </section>
      <div className="lf-segmented grid grid-cols-4" role="tablist" aria-label="Board view">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id}
            className={cn(view === id && "is-active")} onClick={() => setView(id)}>{label}</button>
        ))}
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
  const onTrack = objectives.map((objective) => evaluateObjective(state, objective)).filter((progress) => progress.onTrack).length;
  const nextReview = state.week < 24 ? "Week 24" : "Week 46";
  const split = [...board.directors].map((d) => ({ d, s: directorSatisfaction(state, d) })).sort((a, b) => b.s - a.s);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-3 divide-x text-center">
          <Figure label="On track" value={`${onTrack}/${objectives.length}`} />
          <Figure label="Next review" value={nextReview} />
          <Figure label="Reviews" value={String((board.reviews ?? []).length)} />
        </div>
        <details className="lf-board-how border-t px-3 py-1.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-primary">How the board judges you</summary>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Objectives are set from the club's own pre-season projection, then tightened by however
            much ambition sits around the table. Missing one does not end your tenure; consistently
            missing the ones your most influential directors care about does.
          </p>
        </details>
      </section>
      <section className="rounded-xl border bg-card px-3 py-2">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Where the room stands</h3>
          <span className="text-[9px] text-muted-foreground">live satisfaction</span>
        </div>
        <div className="space-y-1">
          {split.map(({ d, s }) => (
            <div key={d.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate">{d.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", barClass(s))} style={{ width: `${Math.max(3, Math.min(100, s))}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums">{s}%</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">Stored confidence only moves at a review.</p>
      </section>
    </div>
  );
}

/* ---------- Directors ---------- */

function Directors({ state }: { state: GameState }) {
  const [conversationDirector, setConversationDirector] = useState<Director | null>(null);
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {state.board.directors.map((d) => (
          <DirectorCard key={d.id} state={state} d={d} onSpeak={() => setConversationDirector(d)} />
        ))}
      </div>
      <BoardConversationDialog state={state} director={conversationDirector} open={Boolean(conversationDirector)}
        onOpenChange={(open) => { if (!open) setConversationDirector(null); }} />
    </>
  );
}

function DirectorCard({ state, d, onSpeak }: { state: GameState; d: Director; onSpeak: () => void }) {
  const [portraitEditing, setPortraitEditing] = useState(false);
  const displayName = useCharacterName(d.id, d.name);
  const satisfaction = directorSatisfaction(state, d);
  const concern = directorConcern(state, d);
  const band = confidenceBand(d.confidence);
  const top = (Object.entries(d.priorities) as [string, number][]).filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="rounded-xl border bg-card p-2.5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setPortraitEditing(true)}
          className="relative shrink-0 overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
          aria-label={`Edit ${displayName} appearance`}>
          <CharacterPortrait identity={{ id: d.id, subject: "board" }} size={40} title={`${displayName} portrait`} />
          <Pencil className="absolute bottom-0 right-0 size-3 rounded-tl bg-black/70 p-0.5 text-white" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{displayName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{d.role} · {d.age} · {d.influence}% influence</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn("font-display text-xl leading-none tabular-nums", BAND_CLASS[band])}>{d.confidence}%</div>
          <div className="text-[9px] text-muted-foreground">confidence</div>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {d.traits.map((trait) => (
          <span key={trait} title={TRAIT_DESC[trait]} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[10px]">
            {TRAIT_LABEL[trait]}
          </span>
        ))}
        <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-[10px]">Patience {d.patience}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {top.map(([key, weight]) => (
          <div key={key} className="min-w-0">
            <div className="truncate text-[10px] text-muted-foreground">{PRIORITY_LABEL[key] ?? key}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary/70" style={{ width: `${Math.min(100, weight)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 line-clamp-2 rounded-md bg-muted/40 px-2 py-1 text-[11px]">
        <span className="font-medium">Satisfaction {satisfaction}%.</span>{" "}
        {concern ? `Concern: ${concern.objective.label} — ${concern.progress.detail}.` : "No outstanding concerns."}
      </p>
      <button type="button" onClick={onSpeak}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border bg-primary/[0.06] px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/[0.12]">
        <MessageCircle className="size-4" /> Speak to {displayName.split(" ")[0]}
      </button>
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] font-semibold text-primary">Background</summary>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{d.bio}</p>
      </details>
      <CharacterPortraitStudio identity={{ id: d.id, subject: "board" }} name={d.name}
        open={portraitEditing} onOpenChange={setPortraitEditing} />
    </div>
  );
}

/* ---------- Objectives ---------- */

function Objectives({ state }: { state: GameState }) {
  const objectives = state.board.objectives ?? [];
  if (!objectives.length) return <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No objectives set.</div>;
  return (
    <SeasonObjectivesDashboard
      objectives={objectives.map((objective) => {
        const progress = evaluateObjective(state, objective);
        const status = objective.status === "active"
          ? (progress.onTrack ? "On track" : "Behind")
          : objective.status === "met" ? "Met" : "Missed";
        return {
          id: objective.id,
          title: objective.label,
          detail: objective.description,
          progress: `${status} · ${progress.detail}`,
          progressTone: progress.onTrack ? "track" as const : "behind" as const,
        };
      })}
      footer="Progress is reviewed at mid-season and again at the end of the campaign."
    />
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
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.6" className="stroke-muted" />
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.6" strokeLinecap="round"
          className={cn(BAND_CLASS[band], "transition-all")} stroke="currentColor"
          strokeDasharray={`${Math.max(1, value)} 100`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-lg leading-none tabular-nums">{value}%</span>
      </div>
    </div>
  );
}
function Figure({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-1 py-1.5">
    <div className="truncate font-display text-base leading-tight">{value}</div>
    <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
  </div>;
}
