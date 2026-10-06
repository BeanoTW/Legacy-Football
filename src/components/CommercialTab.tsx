import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
  CommercialContract,
  CommercialContractRecord,
  CommercialOffer,
  GameState,
  SponsorshipCategory,
} from "@/lib/game/types";
import {
  CATEGORY_MIN_POWER,
  SEASON_WEEKS,
  SPONSORSHIP_CATEGORIES,
  acceptOffer,
  activeContracts,
  commercialPower,
  commercialSnapshot,
  contractPaidToDate,
  counterOffer,
  eligibleSponsors,
  pendingOffers,
  rejectOffer,
  relationshipLabel,
  sponsorById,
  sponsorName,
  weeksRemaining,
} from "@/lib/game/commercial";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { supporterEvents } from "@/lib/game/supporterEvents";
import { SupporterEventsPanel } from "@/components/game/SupporterEventCards";

type View = "partnerships" | "events" | "vacancies" | "negotiations" | "history";

const money = (n: number) => fmtMoneyExact(n);

export function CommercialTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<View>("partnerships");
  const [note, setNote] = useState<string | null>(null);

  const snap = useMemo(() => (state.commercial ? commercialSnapshot(state) : null), [state]);

  if (!state.commercial || !snap) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        The commercial department has not been set up yet. Advance a week to open it.
      </div>
    );
  }

  const act = (fn: (s: GameState) => { state: GameState; message: string }) => {
    update((s) => {
      const r = fn(s);
      setNote(r.message);
      return r.state;
    });
  };

  const tabs: [View, string, number | null][] = [
    ["partnerships", "Deals", snap.activePartners],
    ["events", "Events", supporterEvents(state).filter((event) => event.status === "scheduled").length],
    ["vacancies", "Open", snap.openCategories.length],
    ["negotiations", "Talks", snap.pendingOffers],
    ["history", "History", null],
  ];
  return (
    <div className="lf-commercial space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl">Commercial</h1>
        <span className="text-[11px] text-muted-foreground">Brand standing {snap.commercialReputation.toFixed(1)}</span>
      </div>
      <section className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card text-center shadow-sm">
        <Stat label="Power / 100" value={String(Math.round(snap.power))} />
        <Stat label="Weekly" value={fmtMoney(snap.weeklyIncome)} tone="good" />
        <Stat label={`Season · ${snap.activePartners} partner${snap.activePartners === 1 ? "" : "s"}`} value={fmtMoney(snap.seasonIncome)} />
      </section>
      <div className="lf-segmented grid grid-cols-5" role="tablist" aria-label="Commercial view">
        {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={view === id}
          className={cn(view === id && "is-active")} onClick={() => setView(id)}>
          {label}{count != null && count > 0 && <b className={cn(id !== "negotiations" && "is-neutral")}>{count}</b>}
        </button>)}
      </div>
      {note && <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-[11px]">
        <span className="min-w-0 flex-1">{note}</span>
        <button type="button" className="shrink-0 text-muted-foreground underline" onClick={() => setNote(null)}>dismiss</button>
      </div>}
      {view === "partnerships" && <Partnerships state={state} />}
      {view === "events" && <SupporterEventsPanel state={state} act={act} />}
      {view === "vacancies" && <Vacancies state={state} />}
      {view === "negotiations" && <Negotiations state={state} act={act} />}
      {view === "history" && <History state={state} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return <div className="min-w-0 px-1 py-1.5">
    <div className={cn("truncate font-display text-base leading-tight tnum",
      tone === "good" && "text-[color:var(--color-income)]")}>{value}</div>
    <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
  </div>;
}
function Panel({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="flex items-baseline justify-between gap-2 border-b px-3 py-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
      {aside && <span className="text-[10px] text-muted-foreground">{aside}</span>}
    </div>
    <div className="divide-y">{children}</div>
  </section>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-2.5 text-xs text-muted-foreground">{children}</p>;
}

/* ---------------- Partnerships ---------------- */

function Partnerships({ state }: { state: GameState }) {
  const live = activeContracts(state);
  return <Panel title="Active partnerships" aside={live.length ? `${live.length} live` : undefined}>
    {live.length === 0 ? <Empty>No live agreements. Every open category is money left on the table.</Empty> :
      live.slice().sort((a, b) => b.weeklyPayment - a.weeklyPayment).map((contract) =>
        <ContractCard key={contract.id} state={state} contract={contract} />)}
  </Panel>;
}
function ContractCard({ state, contract }: { state: GameState; contract: CommercialContract }) {
  const sponsor = sponsorById(state, contract.sponsorId);
  const left = weeksRemaining(state, contract);
  const total = contract.durationSeasons * SEASON_WEEKS;
  const elapsed = Math.max(0, Math.min(total, total - left));
  const paid = contractPaidToDate(state, contract.id);
  const renewal = left <= contract.renewalWindowWeeks;
  return <div className="px-3 py-2">
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{sponsorName(state, contract.sponsorId)}</div>
        <div className="truncate text-[11px] text-muted-foreground">{contract.category} · {sponsor ? relationshipLabel(sponsor.relationshipScore) : "—"}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tnum">{money(contract.weeklyPayment)}/wk</div>
        <div className="text-[10px] text-muted-foreground tnum">{fmtMoney(paid)} paid</div>
      </div>
    </div>
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full", renewal ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${total ? (elapsed / total) * 100 : 0}%` }} />
      </div>
      <span className={cn("shrink-0 text-[10px] tnum", renewal ? "font-semibold text-amber-600" : "text-muted-foreground")}>
        {left}w left{renewal ? " · renewal open" : ""}
      </span>
    </div>
    {contract.objectives.length > 0 && <details className="mt-1">
      <summary className="cursor-pointer text-[11px] font-semibold text-primary">
        {contract.objectives.length} bonus objective{contract.objectives.length === 1 ? "" : "s"} · {contract.durationSeasons}-season deal from S{contract.startSeason}
      </summary>
      <ul className="mt-1 space-y-0.5 text-[11px]">
        {contract.objectives.map((objective) => <li key={objective.id} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{objective.label}</span>
          <span className="tnum">{money(objective.bonus)} · {objective.status}</span>
        </li>)}
      </ul>
    </details>}
  </div>;
}

/* ---------------- Vacancies ---------------- */

function Vacancies({ state }: { state: GameState }) {
  const live = activeContracts(state);
  const power = commercialPower(state);
  const open = SPONSORSHIP_CATEGORIES.filter((category) => !live.some((contract) => contract.category === category)) as SponsorshipCategory[];
  return <Panel title="Open categories" aside="Offers arrive in your inbox">
    {open.length === 0 && <Empty>Every category is contracted.</Empty>}
    {open.map((category) => {
      const min = CATEGORY_MIN_POWER[category];
      const reachable = power >= min;
      const count = reachable ? eligibleSponsors(state, category).length : 0;
      return <div key={category} className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{category}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {reachable ? `${count} sponsors within reach` : `Needs power ${min} (now ${Math.round(power)})`}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
          reachable ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground")}>
          {reachable ? "Marketable" : "Out of reach"}
        </span>
      </div>;
    })}
  </Panel>;
}

/* ---------------- Negotiations ---------------- */

function Negotiations({ state, act }: {
  state: GameState;
  act: (fn: (s: GameState) => { state: GameState; message: string }) => void;
}) {
  const offers = pendingOffers(state);
  return <Panel title="Live negotiations" aside="Push twice and they may walk">
    {offers.length === 0 && <Empty>Nothing on the table this week. New approaches appear here and in your inbox.</Empty>}
    {offers.map((offer) => <OfferCard key={offer.id} state={state} offer={offer} act={act} />)}
  </Panel>;
}
function OfferCard({ state, offer, act }: {
  state: GameState;
  offer: CommercialOffer;
  act: (fn: (s: GameState) => { state: GameState; message: string }) => void;
}) {
  const total = offer.weeklyPayment * SEASON_WEEKS * offer.durationSeasons + offer.signingBonus;
  const canCounter = offer.negotiationRounds < 2;
  return <div className="px-3 py-2">
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{sponsorName(state, offer.sponsorId)}</div>
        <div className="truncate text-[11px] text-muted-foreground">{offer.category} · {offer.renewalOfContractId ? "Renewal" : "New approach"}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold tnum">{money(offer.weeklyPayment)}/wk</div>
        <div className="text-[10px] text-muted-foreground tnum">{fmtMoney(total)} headline</div>
      </div>
    </div>
    <div className="mt-1 text-[11px] text-muted-foreground tnum">
      {offer.durationSeasons} season{offer.durationSeasons === 1 ? "" : "s"} · {money(offer.signingBonus)} bonus · counters {offer.negotiationRounds}/2
    </div>
    {offer.objectives.length > 0 && <ul className="mt-1 space-y-0.5 text-[11px]">
      {offer.objectives.map((objective) => <li key={objective.id} className="flex justify-between gap-2">
        <span className="text-muted-foreground">{objective.label}</span><span className="tnum">{money(objective.bonus)}</span>
      </li>)}
    </ul>}
    {offer.outcomes.length > 0 && <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
      {offer.outcomes.map((outcome) => <li key={outcome.round}>Round {outcome.round} ({outcome.counter}): {outcome.note}</li>)}
    </ul>}
    <div className="mt-2 flex flex-wrap gap-1">
      <Btn tone="primary" onClick={() => act((s) => acceptOffer(s, offer.id))}>Accept</Btn>
      {canCounter && <>
        <Btn onClick={() => act((s) => wrap(counterOffer(s, offer.id, "payment")))}>Push fee</Btn>
        <Btn onClick={() => act((s) => wrap(counterOffer(s, offer.id, "duration")))}>Push term</Btn>
        <Btn onClick={() => act((s) => wrap(counterOffer(s, offer.id, "bonus")))}>Push bonus</Btn>
      </>}
      <Btn tone="danger" onClick={() => act((s) => rejectOffer(s, offer.id))}>Reject</Btn>
    </div>
  </div>;
}

function wrap(r: { state: GameState; result: { note: string } }) {
  return { state: r.state, message: r.result.note };
}

function Btn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 rounded-md border px-2.5 text-[11px] font-semibold transition-colors",
        tone === "primary" && "bg-primary text-primary-foreground border-primary",
        tone === "danger" && "border-destructive text-destructive hover:bg-destructive/10",
        !tone && "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- History ---------------- */

function History({ state }: { state: GameState }) {
  const c = state.commercial!;
  const records = [...c.history].reverse();
  return (
    <div className="space-y-2">
      <Panel title="Season summaries">
        {c.seasonHistory.length === 0 && (
          <p className="text-sm text-muted-foreground">No completed seasons yet.</p>
        )}
        {[...c.seasonHistory].reverse().map((h) => (
          <div key={h.season} className="px-3 py-2 text-sm">
            <div className="flex justify-between font-medium">
              <span>Season {h.season}</span>
              <span className="tnum">{money(h.totalIncome)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {h.newSponsors} new · {h.renewals} renewed · {h.lostSponsors} lost ·{" "}
              {h.activePartnersAtClose} partners at close · reputation{" "}
              {h.commercialReputationAtClose.toFixed(1)}
            </div>
          </div>
        ))}
      </Panel>

      <Panel title="Completed agreements">
        {records.length === 0 && (
          <p className="text-sm text-muted-foreground">No agreements have finished yet.</p>
        )}
        {records.map((r: CommercialContractRecord) => (
          <div key={r.contractId} className="rounded-lg border bg-background p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-medium">{r.sponsorName}</div>
                <div className="text-xs text-muted-foreground">
                  {r.category} · s{r.startSeason}–s{r.endSeason} · {r.weeksActive} weeks ·{" "}
                  {r.outcome}
                </div>
              </div>
              <div className="text-right tnum">
                <div className="font-medium">{money(r.totalValue)}</div>
                <div className="text-xs text-muted-foreground">{money(r.weeklyPayment)}/wk</div>
              </div>
            </div>
            {r.objectives.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground">
                {r.objectives.map((o) => (
                  <li key={o.label}>
                    {o.label} — {o.met ? "met" : "missed"} ({money(o.bonus)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}
