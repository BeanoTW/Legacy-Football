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
import { fmtMoneyExact } from "@/lib/game/engine";

type View = "partnerships" | "vacancies" | "negotiations" | "history";

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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs">Commercial Department</div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Commercial power" value={String(Math.round(snap.power))} hint="0–100" />
          <Stat
            label="Commercial reputation"
            value={snap.commercialReputation.toFixed(1)}
            hint="Brand standing"
          />
          <Stat label="Weekly income" value={money(snap.weeklyIncome)} hint="From live deals" />
          <Stat
            label="Season to date"
            value={money(snap.seasonIncome)}
            hint={`${snap.activePartners} partner(s)`}
          />
        </div>
        <div className="px-3 pb-3 flex flex-wrap gap-1">
          {(
            [
              ["partnerships", `Partnerships (${snap.activePartners})`],
              ["vacancies", `Vacancies (${snap.openCategories.length})`],
              ["negotiations", `Negotiations (${snap.pendingOffers})`],
              ["history", "History"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium border transition-colors",
                view === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {note && (
        <div className="rounded-lg border bg-muted/50 px-3 py-2 text-xs">
          {note}
          <button className="ml-2 underline text-muted-foreground" onClick={() => setNote(null)}>
            dismiss
          </button>
        </div>
      )}

      {view === "partnerships" && <Partnerships state={state} />}
      {view === "vacancies" && <Vacancies state={state} />}
      {view === "negotiations" && <Negotiations state={state} act={act} />}
      {view === "history" && <History state={state} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tnum">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="panel-strip px-3 py-2 text-xs font-semibold uppercase tracking-wide">
        {title}
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  );
}

/* ---------------- Partnerships ---------------- */

function Partnerships({ state }: { state: GameState }) {
  const live = activeContracts(state);
  if (!live.length) {
    return (
      <Panel title="Active partnerships">
        <p className="text-sm text-muted-foreground">
          No live agreements. Every open category is money left on the table.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title="Active partnerships">
      {live
        .slice()
        .sort((a, b) => b.weeklyPayment - a.weeklyPayment)
        .map((c) => (
          <ContractCard key={c.id} state={state} contract={c} />
        ))}
    </Panel>
  );
}

function ContractCard({ state, contract }: { state: GameState; contract: CommercialContract }) {
  const sp = sponsorById(state, contract.sponsorId);
  const left = weeksRemaining(state, contract);
  const total = contract.durationSeasons * SEASON_WEEKS;
  const elapsed = Math.max(0, Math.min(total, total - left));
  const paid = contractPaidToDate(state, contract.id);
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold">{sponsorName(state, contract.sponsorId)}</div>
          <div className="text-xs text-muted-foreground">
            {contract.category} · {sp ? relationshipLabel(sp.relationshipScore) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tnum">{money(contract.weeklyPayment)}/wk</div>
          <div className="text-xs text-muted-foreground tnum">{money(paid)} paid to date</div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full", left <= contract.renewalWindowWeeks ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${total ? (elapsed / total) * 100 : 0}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {contract.durationSeasons} season deal · signed s{contract.startSeason}
        </span>
        <span>
          {left} week(s) left{left <= contract.renewalWindowWeeks ? " — renewal window open" : ""}
        </span>
      </div>
      {contract.objectives.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {contract.objectives.map((o) => (
            <li key={o.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{o.label}</span>
              <span className="tnum">
                {money(o.bonus)} · {o.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Vacancies ---------------- */

function Vacancies({ state }: { state: GameState }) {
  const live = activeContracts(state);
  const power = commercialPower(state);
  const open = SPONSORSHIP_CATEGORIES.filter(
    (c) => !live.some((x) => x.category === c),
  ) as SponsorshipCategory[];
  return (
    <Panel title="Open categories">
      <p className="text-xs text-muted-foreground">
        Offers arrive on their own — the department works the market each week and everything
        lands in your inbox. Raising commercial power unlocks the bigger categories.
      </p>
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">Every category is contracted. Excellent work.</p>
      )}
      {open.map((cat) => {
        const min = CATEGORY_MIN_POWER[cat];
        const reachable = power >= min;
        const pool = reachable ? eligibleSponsors(state, cat).length : 0;
        return (
          <div key={cat} className="rounded-lg border bg-background p-3 flex flex-wrap justify-between gap-2">
            <div>
              <div className="font-medium">{cat}</div>
              <div className="text-xs text-muted-foreground">
                {reachable
                  ? `${pool} sponsor(s) within reach`
                  : `Needs commercial power ${min} — currently ${Math.round(power)}`}
              </div>
            </div>
            <span
              className={cn(
                "self-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                reachable ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground",
              )}
            >
              {reachable ? "Marketable" : "Out of reach"}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

/* ---------------- Negotiations ---------------- */

function Negotiations({
  state,
  act,
}: {
  state: GameState;
  act: (fn: (s: GameState) => { state: GameState; message: string }) => void;
}) {
  const open = pendingOffers(state);
  return (
    <Panel title="Live negotiations">
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing on the table this week. New approaches appear here and in your inbox.
        </p>
      )}
      {open.map((o) => (
        <OfferCard key={o.id} state={state} offer={o} act={act} />
      ))}
    </Panel>
  );
}

function OfferCard({
  state,
  offer,
  act,
}: {
  state: GameState;
  offer: CommercialOffer;
  act: (fn: (s: GameState) => { state: GameState; message: string }) => void;
}) {
  const total = offer.weeklyPayment * SEASON_WEEKS * offer.durationSeasons + offer.signingBonus;
  const canCounter = offer.negotiationRounds < 2;
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-semibold">{sponsorName(state, offer.sponsorId)}</div>
          <div className="text-xs text-muted-foreground">
            {offer.category} · {offer.renewalOfContractId ? "Renewal" : "New approach"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold tnum">{money(offer.weeklyPayment)}/wk</div>
          <div className="text-xs text-muted-foreground tnum">{money(total)} headline</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <KV k="Term" v={`${offer.durationSeasons} season(s)`} />
        <KV k="Signing bonus" v={money(offer.signingBonus)} />
        <KV k="Counters used" v={`${offer.negotiationRounds} / 2`} />
      </div>
      {offer.objectives.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {offer.objectives.map((o) => (
            <li key={o.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{o.label}</span>
              <span className="tnum">{money(o.bonus)}</span>
            </li>
          ))}
        </ul>
      )}
      {offer.outcomes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {offer.outcomes.map((o) => (
            <li key={o.round}>
              Round {o.round} ({o.counter}): {o.note}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn tone="primary" onClick={() => act((s) => acceptOffer(s, offer.id))}>
          Accept
        </Btn>
        {canCounter && (
          <>
            <Btn onClick={() => act((s) => counterOffer(s, offer.id, "payment").state && wrap(counterOffer(s, offer.id, "payment")))}>
              Push fee
            </Btn>
            <Btn onClick={() => act((s) => wrap(counterOffer(s, offer.id, "duration")))}>
              Push term
            </Btn>
            <Btn onClick={() => act((s) => wrap(counterOffer(s, offer.id, "bonus")))}>
              Push bonus
            </Btn>
          </>
        )}
        <Btn tone="danger" onClick={() => act((s) => rejectOffer(s, offer.id))}>
          Reject
        </Btn>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Push twice and they are liable to walk away entirely.
      </p>
    </div>
  );
}

function wrap(r: { state: GameState; result: { note: string } }) {
  return { state: r.state, message: r.result.note };
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border bg-card px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="tnum font-medium">{v}</div>
    </div>
  );
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
        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
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
    <div className="space-y-4">
      <Panel title="Season summaries">
        {c.seasonHistory.length === 0 && (
          <p className="text-sm text-muted-foreground">No completed seasons yet.</p>
        )}
        {[...c.seasonHistory].reverse().map((h) => (
          <div key={h.season} className="rounded-lg border bg-background p-3 text-sm">
            <div className="flex justify-between font-medium">
              <span>Season {h.season}</span>
              <span className="tnum">{money(h.totalIncome)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
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
                  {r.category} · s{r.startSeason}–s{r.endSeason} · {r.weeksActive} weeks · {r.outcome}
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
