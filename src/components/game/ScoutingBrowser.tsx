import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, CheckCircle2, Handshake, Search, Star } from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import {
  askingPrice,
  transferMarket,
  playerName,
  ageOf,
  playerInterestAssessment,
  shortlistIds,
  submitTransferOffer,
  toggleShortlist,
} from "@/lib/game/recruitment";
import { scoutingAssignment, scoutingReport, startScouting } from "@/lib/game/scouting";
import { fmtMoney } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./shared/layout";
import { POSITION_BADGE_CLASS } from "./playerPosition";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "DEF", "MID", "FWD"];

export function ScoutingBrowser({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [watchedOnly, setWatchedOnly] = useState(false);
  const [freeAgentsOnly, setFreeAgentsOnly] = useState(false);
  const [willingOnly, setWillingOnly] = useState(true);
  const [searched, setSearched] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (!searched) return [];
    const watched = new Set(shortlistIds(state));
    return transferMarket(state)
      .filter((entry) => position === "ALL" || entry.player.primaryPosition === position)
      .filter((entry) => !freeAgentsOnly || entry.player.currentClubId === null)
      .filter((entry) => {
        if (!willingOnly) return true;
        const level = playerInterestAssessment(state, entry.player).level;
        return level === "keen" || level === "open";
      })
      .filter((entry) => !watchedOnly || watched.has(entry.player.id))
      .slice(0, 60);
  }, [state, position, watchedOnly, freeAgentsOnly, willingOnly, searched]);

  const bid = (playerId: string, fee: number) =>
    update((s) => {
      const result = submitTransferOffer(s, playerId, fee);
      setNote(result.result.reason);
      return result.state;
    });

  if (!searched) {
    return (
      <DetailScreen
        title="Scout players"
        subtitle="Set the search first, then review only players who match what you actually need."
        actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
        className="grid place-items-start"
      >
        <section className="w-full max-w-3xl rounded-2xl border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-4"><div className="font-display text-xl">Search parameters</div><div className="text-xs text-muted-foreground">Start broad or narrow the market before loading player cards.</div></div>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">Position</div>
              <div className="grid grid-cols-5 gap-2">
                {POSITIONS.map((p) => <button key={p} onClick={() => setPosition(p)} className={cn("rounded-xl border px-2 py-2 text-xs font-semibold", position === p ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{p}</button>)}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <FilterToggle active={willingOnly} onClick={() => setWillingOnly((v) => !v)} title="Willing to join" sub="Keen or open to talks" />
              <FilterToggle active={freeAgentsOnly} onClick={() => setFreeAgentsOnly((v) => !v)} title="Free agents" sub="No transfer fee" />
              <FilterToggle active={watchedOnly} onClick={() => setWatchedOnly((v) => !v)} title="Shortlist only" sub="Players already watched" />
            </div>
            <Button className="w-full sm:w-auto" onClick={() => setSearched(true)}><Search className="mr-2 size-4" /> Search players</Button>
          </div>
        </section>
      </DetailScreen>
    );
  }

  const toolbar = (
    <div className="space-y-2">
      {note && <div className="truncate rounded-xl border bg-muted/40 px-3 py-2 text-xs">{note}</div>}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-lg bg-muted px-2 py-1 font-semibold">{position === "ALL" ? "All positions" : position}</span>
        {willingOnly && <span className="rounded-lg bg-muted px-2 py-1">Willing to join</span>}
        {freeAgentsOnly && <span className="rounded-lg bg-muted px-2 py-1">Free agents</span>}
        {watchedOnly && <span className="rounded-lg bg-muted px-2 py-1">Shortlist</span>}
        <button onClick={() => setSearched(false)} className="ml-auto rounded-lg border px-2.5 py-1.5 font-semibold">Change filters</button>
      </div>
    </div>
  );

  return (
    <DetailScreen
      title="Scout players"
      subtitle={`${rows.length} matching players shown`}
      actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
      toolbar={toolbar}
      className="touch-pan-y grid gap-2 xl:grid-cols-2 xl:items-start"
    >
      {rows.length === 0 && <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No players match those filters. Change the search parameters and try again.</div>}
      {rows.map(({ player }) => {
        const assignment = scoutingAssignment(state, player.id);
        const report = scoutingReport(state, player);
        const interest = playerInterestAssessment(state, player);
        const watched = shortlistIds(state).includes(player.id);
        const canBid = report.weeksObserved >= 2;
        return (
          <article key={player.id} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="truncate font-display text-lg">{playerName(player)}</span><span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-bold", POSITION_BADGE_CLASS[player.primaryPosition])}>{player.primaryPosition}</span></div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{ageOf(player, state.season)}y · {player.nationality} · {player.preferredFoot} foot · {player.currentClubId ?? "Free agent"}</div>
              </div>
              <div className="shrink-0 text-right"><div className="font-display text-xl">{report.knowledgePct}%</div><div className="text-[9px] text-muted-foreground">scouted</div></div>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${report.knowledgePct}%` }} /></div>

            <div className="mt-2 grid grid-cols-5 gap-1">
              {report.attributes.map((attr) => <div key={attr.key} className="rounded-lg bg-muted/50 px-1.5 py-1"><div className="truncate text-[9px] text-muted-foreground">{attr.label}</div><div className="text-xs font-semibold tabular-nums">{!attr.known ? "?" : attr.exact !== undefined ? attr.exact : `${attr.min}–${attr.max}`}</div></div>)}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
              <span>Value <strong>{report.valueRange ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}` : "Unknown"}</strong></span>
              <span>Wage <strong>{report.wageRange ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk` : "Unknown"}</strong></span>
              <span>Interest <strong title={interest.reason}>{interest.label}</strong></span>
              <span>Personality <strong>{report.personalityKnown ? player.personality : "Unknown"}</strong></span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant={watched ? "default" : "outline"} onClick={() => update((s) => toggleShortlist(s, player.id))}><Star className={cn("mr-1.5 size-3.5", watched && "fill-current")} />{watched ? "Watched" : "Shortlist"}</Button>
              {!assignment ? <Button size="sm" onClick={() => update((s) => startScouting(s, player.id))}><Binoculars className="mr-1.5 size-3.5" /> Scout</Button> : report.complete ? <div className="inline-flex items-center px-1 text-[11px] font-semibold text-[color:var(--color-income)]"><CheckCircle2 className="mr-1 size-3.5" /> Fully scouted</div> : <div className="px-1 text-[11px] text-muted-foreground"><Binoculars className="mr-1 inline size-3.5" /> {assignment.weeksObserved}w observed</div>}
              {canBid && <Button size="sm" variant="secondary" onClick={() => bid(player.id, askingPrice(state, player))}><Handshake className="mr-1.5 size-3.5" /> Approach</Button>}
            </div>
          </article>
        );
      })}
    </DetailScreen>
  );
}

function FilterToggle({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return <button onClick={onClick} className={cn("rounded-xl border p-3 text-left transition-colors", active ? "border-primary bg-primary/10" : "bg-background hover:bg-muted")}><div className="flex items-center gap-2"><div className={cn("size-3 rounded-full border", active && "border-primary bg-primary")} /><span className="font-semibold">{title}</span></div><div className="mt-1 pl-5 text-[11px] text-muted-foreground">{sub}</div></button>;
}
