import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Handshake,
  History,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/game/engine";
import {
  DESK_KIND_LABEL,
  DESK_PRIORITY_LABEL,
  groupDealsByPriority,
  type DeskDeal,
  type DeskDealKind,
  type DeskPriority,
} from "@/lib/game/transferDesk";
import { TransferNegotiationRoom } from "./TransferNegotiationDesk";
import { LoanAgreementCard, LoanNegotiationCard } from "./LoanDesk";
import { TransferHistory } from "./TransferHistory";
import { DealKindTag, DealPriorityDot, DealStageLadder } from "./TransferDealStage";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import type { DeskRequest, RunAction } from "./TransferDesk";

/* Live Business — the operational war room.
   Every buying, selling and loan transaction in one stream, ordered by what
   needs the chairman first: Needs action → Today → Waiting → Completed.
   Selecting a deal opens its canonical work surface beside (desktop) or in
   place of (mobile) the stream. */

const KIND_FILTERS: (DeskDealKind | "all")[] = [
  "all",
  "recruiting",
  "selling",
  "loanIn",
  "loanOut",
];
const RECORD_ID = "record";

export function TransferLiveBusiness({
  state,
  update,
  run,
  deals,
  selectedId,
  onSelect,
  focus,
  onFocus,
  onGo,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  run: RunAction;
  deals: DeskDeal[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focus: DeskPriority | null;
  onFocus: (focus: DeskPriority | null) => void;
  onGo: (request: DeskRequest) => void;
}) {
  const [kind, setKind] = useState<DeskDealKind | "all">("all");
  const visible = useMemo(
    () =>
      deals.filter(
        (deal) => (kind === "all" || deal.kind === kind) && (!focus || deal.priority === focus),
      ),
    [deals, kind, focus],
  );
  const groups = groupDealsByPriority(visible);
  const selected =
    selectedId && selectedId !== RECORD_ID
      ? (deals.find((deal) => deal.id === selectedId) ?? null)
      : null;
  const showingSurface = selectedId === RECORD_ID || Boolean(selectedId);
  const live = deals.filter((deal) => deal.priority !== "completed");

  if (!deals.length) {
    return (
      <div className="contained-scroll h-full">
        <section className="lf-desk-empty">
          <Handshake className="size-8 text-muted-foreground" />
          <h2 className="font-display text-xl">No live business</h2>
          <p>
            Nothing is being negotiated, no bids are waiting and no loans are running. Find targets
            in the Market, or review who could leave from Squad & Contracts.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={() => onGo({ lens: "market" })}>
              <Search className="mr-1.5 size-4" />
              Open Market
            </Button>
            <Button size="sm" variant="outline" onClick={() => onGo({ lens: "squad" })}>
              <Users className="mr-1.5 size-4" />
              Squad & Contracts
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSelect(RECORD_ID)}>
              <History className="mr-1.5 size-4" />
              Transfer record
            </Button>
          </div>
        </section>
        {selectedId === RECORD_ID && (
          <div className="mt-2">
            <TransferHistory state={state} onBack={() => onSelect(null)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="lf-desk-split grid h-full min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-2 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:gap-3">
      <div className={cn("flex min-h-0 flex-col gap-1.5", showingSurface && "hidden xl:flex")}>
        <div
          className="flex shrink-0 gap-1 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Transaction type"
        >
          {KIND_FILTERS.map((value) => {
            const count =
              value === "all" ? live.length : live.filter((deal) => deal.kind === value).length;
            return (
              <button
                key={value}
                type="button"
                className={cn("lf-chip shrink-0", kind === value && "is-active")}
                onClick={() => setKind(value)}
              >
                {value === "all" ? "All" : DESK_KIND_LABEL[value]}
                {count > 0 && <span className="ml-1 tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
        {focus && (
          <button
            type="button"
            className="shrink-0 self-start text-[11px] font-semibold text-primary"
            onClick={() => onFocus(null)}
          >
            Showing {DESK_PRIORITY_LABEL[focus].toLowerCase()} only · show everything
          </button>
        )}
        <div className="contained-scroll min-h-0 flex-1 space-y-2 pr-0.5">
          {groups.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
              No {kind === "all" ? "" : `${DESK_KIND_LABEL[kind as DeskDealKind].toLowerCase()} `}
              business here.
            </p>
          )}
          {groups.map((group) => (
            <section key={group.priority} className="space-y-1.5">
              <h3 className={cn("lf-desk-group", `is-${group.priority}`)}>
                <DealPriorityDot priority={group.priority} />
                {DESK_PRIORITY_LABEL[group.priority]}
                <span>{group.deals.length}</span>
              </h3>
              {group.deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  active={deal.id === selectedId}
                  onClick={() => onSelect(deal.id)}
                />
              ))}
              {group.priority === "completed" && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  onClick={() => onSelect(RECORD_ID)}
                >
                  <History className="size-3.5" /> Full transfer record
                </button>
              )}
            </section>
          ))}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-col", !showingSurface && "hidden xl:flex")}>
        {showingSurface && (
          <button type="button" className="lf-desk-back xl:hidden" onClick={() => onSelect(null)}>
            <ArrowLeft className="size-4" /> Live Business
          </button>
        )}
        <div className="contained-scroll min-h-0 flex-1 pr-0.5">
          {selectedId === RECORD_ID ? (
            <TransferHistory state={state} onBack={() => onSelect(null)} />
          ) : selected ? (
            <DealSurface state={state} update={update} run={run} deal={selected} />
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border bg-card p-8 text-center">
              <div>
                <Handshake className="mx-auto size-8 text-muted-foreground" />
                <div className="mt-3 font-display text-xl">Choose a deal</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start with anything under Needs action.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DealCard({
  deal,
  active,
  onClick,
}: {
  deal: DeskDeal;
  active: boolean;
  onClick: () => void;
}) {
  const completed = deal.priority === "completed";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("lf-desk-deal", `is-${deal.priority}`, active && "is-active")}
      aria-current={active ? "true" : undefined}
    >
      <span className="lf-desk-deal-top">
        <DealKindTag kind={deal.kind} />
        <span className="min-w-0 flex-1 truncate">{deal.counterparty}</span>
        {deal.dueLabel && (
          <span className={cn("lf-desk-due", deal.expiring && "is-expiring")}>{deal.dueLabel}</span>
        )}
      </span>
      <span className="lf-desk-deal-main">
        <span className="lf-desk-pos">{deal.position}</span>
        <span className="min-w-0 flex-1 truncate font-display text-base leading-tight">
          {deal.playerName}
        </span>
        {deal.amount && (
          <span className="shrink-0 font-display text-base tabular-nums">{deal.amount}</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground xl:hidden" />
      </span>
      <span className="lf-desk-deal-headline">{deal.headline}</span>
      <DealStageLadder
        stages={deal.stages}
        current={deal.stageIndex}
        compact
        done={completed && deal.outcome !== "Collapsed" && deal.outcome !== "Withdrawn"}
      />
      {deal.rival && !completed && (
        <span className={cn("lf-desk-rival", deal.rival.reopened && "is-reopened")}>
          <TriangleAlert className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            <strong>{deal.rival.clubName}</strong>{" "}
            {deal.rival.reopened ? "have reopened our agreed terms" : "are competing"}
            {deal.rival.fee !== undefined ? ` · bid ${fmtMoney(deal.rival.fee)}` : ""}
            {deal.rival.weeklyWage !== undefined ? ` · ${fmtMoney(deal.rival.weeklyWage)}/wk` : ""}
          </span>
        </span>
      )}
    </button>
  );
}

function DealSurface({
  state,
  update,
  run,
  deal,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  run: RunAction;
  deal: DeskDeal;
}) {
  if (deal.loanNegotiationId) {
    const negotiation = state.football?.loanNegotiations?.find(
      (candidate) => candidate.id === deal.loanNegotiationId,
    );
    return negotiation ? (
      <LoanNegotiationCard state={state} update={update} negotiation={negotiation} />
    ) : null;
  }
  if (deal.loanId) {
    const loan = state.football?.loans?.find((candidate) => candidate.id === deal.loanId);
    return loan ? <LoanAgreementCard loan={loan} state={state} update={update} /> : null;
  }
  if (deal.priority !== "completed" && deal.negotiationId) {
    const negotiation = state.football?.negotiations.find(
      (candidate) => candidate.id === deal.negotiationId,
    );
    return negotiation ? (
      <TransferNegotiationRoom state={state} negotiation={negotiation} act={run} />
    ) : null;
  }
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="panel-strip p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
          {DESK_KIND_LABEL[deal.kind]} · {deal.counterparty}
        </div>
        <div className="font-display text-2xl leading-tight">{deal.playerName}</div>
        <div className="text-sm opacity-80">
          {deal.position} · {deal.outcome}
          {deal.amount ? ` · ${deal.amount}` : ""}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <DealStageLadder
          stages={deal.stages}
          current={deal.stageIndex}
          done={deal.outcome !== "Collapsed" && deal.outcome !== "Withdrawn"}
        />
        <p className="text-sm text-muted-foreground">
          {deal.headline}. The permanent record of this movement is kept in the transfer record.
        </p>
        <Button size="sm" variant="outline" onClick={() => openPlayerProfile(deal.playerId)}>
          Open player profile
        </Button>
      </div>
    </section>
  );
}
