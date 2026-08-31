import { useMemo, useState } from "react";
import { ArrowLeft, Binoculars, CheckCircle2, Handshake, Search, Star } from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import {
  askingPrice,
  canAuthorisePurchase,
  canAuthoriseWage,
  transferMarket,
  playerName,
  ageOf,
  playerInterestAssessment,
  shortlistIds,
  submitTransferOffer,
  toggleShortlist,
  userWageBill,
  wageDemand,
} from "@/lib/game/recruitment";
import { scoutingAssignment, scoutingReport, startScouting } from "@/lib/game/scouting";
import { fmtMoney } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./shared/layout";
import { POSITION_BADGE_CLASS } from "./playerPosition";

const POSITIONS: (Position | "ALL")[] = ["ALL", "GK", "DEF", "MID", "FWD"];

export function ScoutingBrowser({ state, update, onBack }: { state: GameState; update: (fn: (s: GameState) => GameState) => void; onBack: () => void }) {
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
      .slice(0, 80);
  }, [state, position, watchedOnly, freeAgentsOnly, willingOnly, searched]);

  const approach = (playerId: string, fee: number) => update((s) => {
    const result = submitTransferOffer(s, playerId, fee);
    setNote(result.result.reason);
    return result.state;
  });

  if (!searched) return (
    <DetailScreen title="Find players" subtitle="Set your market parameters, then compare matching players." actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>} className="grid place-items-start">
      <section className="w-full max-w-3xl rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-3"><div className="font-display text-lg">Search parameters</div><div className="text-xs text-muted-foreground">Scouting improves knowledge. It is never required before you approach a player or club.</div></div>
        <div className="space-y-3">
          <div><div className="mb-1.5 text-xs font-semibold text-muted-foreground">Position</div><div className="grid grid-cols-5 gap-1.5">{POSITIONS.map((p) => <button key={p} onClick={() => setPosition(p)} className={cn("rounded-lg border px-2 py-1.5 text-xs font-semibold", position === p ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{p}</button>)}</div></div>
          <div className="grid gap-1.5 sm:grid-cols-3"><FilterToggle active={willingOnly} onClick={() => setWillingOnly((v) => !v)} title="Willing to join" sub="Keen or open to talks" /><FilterToggle active={freeAgentsOnly} onClick={() => setFreeAgentsOnly((v) => !v)} title="Free agents" sub="Approach player directly" /><FilterToggle active={watchedOnly} onClick={() => setWatchedOnly((v) => !v)} title="Shortlist only" sub="Players you are tracking" /></div>
          <Button onClick={() => setSearched(true)}><Search className="mr-2 size-4" /> Find players</Button>
        </div>
      </section>
    </DetailScreen>
  );

  const wageCeiling = state.finance?.budgets?.wages ?? 0;
  const wageBill = userWageBill(state);
  const wageHeadroom = wageCeiling > 0 ? Math.max(0, wageCeiling - wageBill) : null;
  const toolbar = <div className="space-y-1.5">{note && <div className="truncate rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">{note}</div>}<div className="flex flex-wrap items-center gap-1 text-[11px]"><span className="rounded-md bg-muted px-2 py-1 font-semibold">Cash {fmtMoney(state.cash)}</span><span className="rounded-md bg-muted px-2 py-1 font-semibold">Wages {fmtMoney(wageBill)}/wk{wageHeadroom !== null ? ` · ${fmtMoney(wageHeadroom)} headroom` : ""}</span><span className="rounded-md bg-muted px-2 py-1">{position === "ALL" ? "All positions" : position}</span>{willingOnly && <span className="rounded-md bg-muted px-2 py-1">Willing</span>}{freeAgentsOnly && <span className="rounded-md bg-muted px-2 py-1">Free agents</span>}{watchedOnly && <span className="rounded-md bg-muted px-2 py-1">Shortlist</span>}<button onClick={() => setSearched(false)} className="ml-auto rounded-md border px-2 py-1 font-semibold">Filters</button></div></div>;

  return <DetailScreen title="Find players" subtitle={`${rows.length} matching players`} actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>} toolbar={toolbar} className="touch-pan-y grid gap-1.5 xl:grid-cols-2 xl:items-start">
    {rows.length === 0 && <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No players match those filters.</div>}
    {rows.map(({ player }) => {
      const assignment = scoutingAssignment(state, player.id);
      const report = scoutingReport(state, player);
      const interest = playerInterestAssessment(state, player);
      const watched = shortlistIds(state).includes(player.id);
      const freeAgent = player.currentClubId === null;
      const fee = freeAgent ? 0 : askingPrice(state, player);
      const demand = wageDemand(state, player);
      const feeAuthority = canAuthorisePurchase(state, fee);
      const wageAuthority = canAuthoriseWage(state, demand);
      const affordable = feeAuthority.allowed && wageAuthority.allowed;
      const affordabilityReason = !feeAuthority.allowed ? feeAuthority.reason : !wageAuthority.allowed ? wageAuthority.reason : "Fee and expected wage fit current authority";
      return <article key={player.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="truncate font-display text-base">{playerName(player)}</span><span className={cn("rounded border px-1 py-0.5 text-[9px] font-bold", POSITION_BADGE_CLASS[player.primaryPosition])}>{player.primaryPosition}</span></div><div className="text-[10px] text-muted-foreground">{ageOf(player, state.season)}y · {player.nationality} · {player.currentClubId ?? "Free agent"}</div></div><div className="shrink-0 text-right"><div className="font-display text-base">{report.knowledgePct}%</div><div className="text-[8px] text-muted-foreground">knowledge</div></div></div>
        <div className="mt-1.5 grid grid-cols-5 gap-1">{report.attributes.map((attr) => <div key={attr.key} className="rounded bg-muted/50 px-1 py-0.5"><div className="truncate text-[8px] text-muted-foreground">{attr.label}</div><div className="text-[10px] font-semibold tabular-nums">{!attr.known ? "?" : attr.exact !== undefined ? attr.exact : `${attr.min}–${attr.max}`}</div></div>)}</div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[10px]"><span>Value <strong>{report.valueRange ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}` : "?"}</strong></span><span>Wage <strong>{report.wageRange ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk` : "?"}</strong></span><span>Interest <strong title={interest.reason}>{interest.label}</strong></span><span>{assignment ? (report.complete ? "Full report" : "Scouting active") : "Not scouted"}</span></div>
        <div className={cn("mt-1.5 rounded-md border px-2 py-1 text-[10px]", affordable ? "bg-muted/40" : "border-destructive/40 bg-destructive/5")} title={affordabilityReason}><span className="font-semibold">{affordable ? "Affordable" : "Outside authority"}</span> · {freeAgent ? "No fee" : `${fmtMoney(fee)} asking price`} · ~{fmtMoney(demand)}/wk expected</div>
        <div className="mt-1.5 flex flex-wrap gap-1"><Button size="sm" variant={watched ? "default" : "outline"} className="h-7 px-2 text-[10px]" onClick={() => update((s) => toggleShortlist(s, player.id))}><Star className={cn("mr-1 size-3", watched && "fill-current")} />{watched ? "Shortlisted" : "Shortlist"}</Button>{!assignment ? <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => update((s) => startScouting(s, player.id))}><Binoculars className="mr-1 size-3" /> Scout</Button> : report.complete ? <span className="inline-flex items-center px-1 text-[10px] font-semibold text-[color:var(--color-income)]"><CheckCircle2 className="mr-1 size-3" /> Full report</span> : <span className="px-1 text-[10px] text-muted-foreground"><Binoculars className="mr-1 inline size-3" /> Scouting</span>}<Button size="sm" variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => approach(player.id, fee)}><Handshake className="mr-1 size-3" /> {freeAgent ? "Approach player" : "Approach club"}</Button></div>
      </article>;
    })}
  </DetailScreen>;
}

function FilterToggle({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return <button onClick={onClick} className={cn("rounded-lg border p-2.5 text-left transition-colors", active ? "border-primary bg-primary/10" : "bg-background hover:bg-muted")}><div className="flex items-center gap-2"><div className={cn("size-3 rounded-full border", active && "border-primary bg-primary")} /><span className="text-xs font-semibold">{title}</span></div><div className="mt-0.5 pl-5 text-[10px] text-muted-foreground">{sub}</div></button>;
}
