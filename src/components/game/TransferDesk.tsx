import { useCallback, useMemo, useState } from "react";
import {
  Binoculars,
  BriefcaseBusiness,
  ClipboardList,
  Hourglass,
  Landmark,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/game/engine";
import {
  footballDepartmentBriefing,
  squadContractRows,
  transferDealStream,
  transferDeskCounts,
  transferDeskHeader,
  type DeskBriefingItem,
  type DeskLens,
  type DeskRequest,
  type DeskPriority,
  type DeskTarget,
  type MarketFilter,
  type TransferDeskHeader,
} from "@/lib/game/transferDesk";
import { TransferLiveBusiness } from "./TransferLiveBusiness";
import { TransferMarket, type MarketSurface } from "./TransferMarket";
import { TransferSquadContracts, type SquadView } from "./TransferSquadContracts";

/* =========================================================================
   Executive Transfer Desk
   -------------------------------------------------------------------------
   One workspace with three persistent lenses. The header, department
   briefing and lens switch never leave the screen; work surfaces (deal room,
   scouting, loans, history) open inside the lens that owns them.
========================================================================= */

export type ActionResult = { state: GameState; result: { ok: boolean; reason: string } };
export type RunAction = (
  fn: (s: GameState) => ActionResult,
  onOk?: (outcome: ActionResult) => void,
) => void;

export type { DeskRequest };

const LENSES: { id: DeskLens; label: string }[] = [
  { id: "live", label: "Live Business" },
  { id: "market", label: "Market" },
  { id: "squad", label: "Squad & Contracts" },
];

export function TransferDesk({
  state,
  update,
  initial,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  initial?: DeskRequest | null;
}) {
  const [lens, setLens] = useState<DeskLens>(initial?.lens ?? "live");
  // Live Business
  const [selectedDealId, setSelectedDealId] = useState<string | null>(
    initial?.lens === "live" && initial.negotiationId ? `neg:${initial.negotiationId}` : null,
  );
  const [liveFocus, setLiveFocus] = useState<DeskPriority | null>(
    initial?.lens === "live" ? (initial.focus ?? null) : null,
  );
  // Market
  const [marketFilter, setMarketFilter] = useState<MarketFilter>(
    initial?.lens === "market" ? (initial.filter ?? "all") : "all",
  );
  const [marketPosition, setMarketPosition] = useState<Position | null>(
    initial?.lens === "market" ? (initial.position ?? null) : null,
  );
  const [marketSurface, setMarketSurface] = useState<MarketSurface | null>(
    initial?.lens === "market" && initial.surface
      ? { kind: initial.surface, focusPlayerId: initial.focusPlayerId, briefId: initial.briefId }
      : null,
  );
  // Squad & Contracts
  const [squadView, setSquadView] = useState<SquadView>(
    initial?.lens === "squad" && initial.focus ? initial.focus : "all",
  );
  const [note, setNote] = useState<string | null>(null);

  const deals = useMemo(() => transferDealStream(state), [state]);
  const header = useMemo(() => transferDeskHeader(state), [state]);
  const briefing = useMemo(() => footballDepartmentBriefing(state, deals), [state, deals]);
  const counts = transferDeskCounts(deals);
  const contractAlerts = useMemo(
    () =>
      squadContractRows(state, deals).filter(
        (row) => row.risk === "final24" && row.loan?.direction !== "in",
      ).length,
    [state, deals],
  );

  const go = useCallback((request: DeskRequest) => {
    setLens(request.lens);
    if (request.lens === "live") {
      setLiveFocus(request.focus ?? null);
      setSelectedDealId(request.negotiationId ? `neg:${request.negotiationId}` : null);
    } else if (request.lens === "market") {
      setMarketFilter(request.filter ?? "all");
      setMarketPosition(request.position ?? null);
      setMarketSurface(
        request.surface
          ? {
              kind: request.surface,
              focusPlayerId: request.focusPlayerId,
              briefId: request.briefId,
            }
          : null,
      );
    } else {
      setSquadView(request.focus ?? "all");
    }
  }, []);

  const run: RunAction = useCallback(
    (fn, onOk) => {
      update((current) => {
        const outcome = fn(current);
        setNote(outcome.result.reason);
        if (outcome.result.ok) onOk?.(outcome);
        return outcome.result.ok ? outcome.state : current;
      });
    },
    [update],
  );

  const openNegotiation = useCallback(
    (negotiationId: string) => go({ lens: "live", negotiationId }),
    [go],
  );

  return (
    <div
      className={cn(
        "lf-transfer-desk flex h-full min-h-0 flex-col gap-1.5 md:gap-2",
        `is-${header.urgency}`,
      )}
    >
      <DeskHeader
        header={header}
        hasManager={state.hiredStaff.some((staff) => staff.role === "Manager")}
        onPriority={() => header.topPriority && go({ lens: "market" })}
      />
      <div
        className="lf-segmented lf-desk-lenses grid shrink-0 grid-cols-3"
        role="tablist"
        aria-label="Transfer workspace"
      >
        {LENSES.map((item) => {
          const badge =
            item.id === "live" ? counts.action : item.id === "squad" ? contractAlerts : 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={lens === item.id}
              className={cn(lens === item.id && "is-active")}
              onClick={() => setLens(item.id)}
            >
              <span className="lf-desk-lens-label">{item.label}</span>
              {badge > 0 && <b className={cn(item.id === "squad" && "is-neutral")}>{badge}</b>}
            </button>
          );
        })}
      </div>
      <DepartmentBriefing items={briefing} onGo={go} />
      {note && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1.5 text-[11px]">
          <span className="min-w-0 flex-1 truncate">{note}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 text-muted-foreground"
            onClick={() => setNote(null)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1" role="tabpanel">
        {lens === "live" && (
          <TransferLiveBusiness
            state={state}
            update={update}
            run={run}
            deals={deals}
            selectedId={selectedDealId}
            onSelect={setSelectedDealId}
            focus={liveFocus}
            onFocus={setLiveFocus}
            onGo={go}
          />
        )}
        {lens === "market" && (
          <TransferMarket
            state={state}
            update={update}
            run={run}
            filter={marketFilter}
            onFilter={setMarketFilter}
            position={marketPosition}
            onPosition={setMarketPosition}
            surface={marketSurface}
            onSurface={setMarketSurface}
            onNegotiationStarted={openNegotiation}
          />
        )}
        {lens === "squad" && (
          <TransferSquadContracts
            state={state}
            update={update}
            run={run}
            deals={deals}
            view={squadView}
            onView={setSquadView}
            onOpenDeal={openNegotiation}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Persistent football-operations header                              */
/* ------------------------------------------------------------------ */

function DeskHeader({
  header,
  hasManager,
  onPriority,
}: {
  header: TransferDeskHeader;
  hasManager: boolean;
  onPriority: () => void;
}) {
  const belowReserve = header.cash < header.minimumReserve;
  const wageTight = header.wageHeadroomWeekly !== null && header.wageHeadroomWeekly <= 0;
  return (
    <header className={cn("lf-desk-header shrink-0", `is-${header.urgency}`)}>
      {header.urgency === "deadline" && (
        <div className="lf-desk-deadline">
          <Hourglass className="size-3.5" />
          <strong>Deadline day</strong>
          <span>{header.window.countdown} to register deals</span>
        </div>
      )}
      <div className="lf-desk-header-grid">
        <HeaderCell
          icon={<Wallet className="size-3.5" />}
          label="Transfer funds"
          short="Funds"
          value={fmtMoney(header.cash)}
          sub={
            belowReserve
              ? `Below ${fmtMoney(header.minimumReserve)} reserve`
              : `${fmtMoney(header.spendableAboveReserve)} above reserve`
          }
          tone={belowReserve ? "bad" : undefined}
        />
        <HeaderCell
          icon={<Landmark className="size-3.5" />}
          label="Wage headroom"
          short="Wages"
          value={
            header.wageHeadroomWeekly === null
              ? "No cap"
              : `${fmtMoney(header.wageHeadroomWeekly)}/wk`
          }
          sub={
            header.wageBudgetWeekly > 0
              ? `${fmtMoney(header.wageBillWeekly)} of ${fmtMoney(header.wageBudgetWeekly)}`
              : `${fmtMoney(header.wageBillWeekly)}/wk bill`
          }
          tone={wageTight ? "bad" : undefined}
        />
        <HeaderCell
          icon={<Hourglass className="size-3.5" />}
          label={header.window.label}
          short={header.window.deadlineDay ? "Deadline" : header.window.open ? "Window" : "Closed"}
          value={header.window.open ? header.window.countdown : "Closed"}
          shortValue={
            header.window.open ? header.window.countdownShort : header.window.countdownShort
          }
          sub={
            header.window.deadlineDay
              ? "Final hours"
              : header.window.open
                ? header.urgency === "closing"
                  ? "Final week"
                  : "Deals can register"
                : header.window.countdown
          }
          tone={
            header.urgency === "deadline"
              ? "bad"
              : header.urgency === "closing"
                ? "warn"
                : header.window.open
                  ? undefined
                  : "muted"
          }
        />
        <button
          type="button"
          className="lf-desk-cell is-priority"
          onClick={onPriority}
          disabled={!header.topPriority}
        >
          <span className="lf-desk-cell-label">
            <Target className="size-3.5" />
            <span className="lf-desk-long">Manager priority</span>
            <span className="lf-desk-short">Priority</span>
          </span>
          <span className="lf-desk-cell-value">
            {header.topPriority ? header.topPriority.headline.replace(/ needed$/, "") : "None"}
          </span>
          <span className="lf-desk-cell-sub">
            {header.topPriority
              ? `${header.topPriority.level} · ${header.topPriority.managerName}`
              : hasManager
                ? "Recruit for quality"
                : "No manager in post"}
          </span>
        </button>
      </div>
    </header>
  );
}

function HeaderCell({
  icon,
  label,
  short,
  value,
  shortValue,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  short: string;
  value: string;
  shortValue?: string;
  sub: string;
  tone?: "bad" | "warn" | "muted";
}) {
  return (
    <div className={cn("lf-desk-cell", tone && `is-${tone}`)} title={`${label} · ${sub}`}>
      <span className="lf-desk-cell-label">
        {icon}
        <span className="lf-desk-long">{label}</span>
        <span className="lf-desk-short">{short}</span>
      </span>
      <span className="lf-desk-cell-value">
        {shortValue ? (
          <>
            <span className="lf-desk-long">{value}</span>
            <span className="lf-desk-short">{shortValue}</span>
          </>
        ) : (
          value
        )}
      </span>
      <span className="lf-desk-cell-sub">{sub}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Football Department briefing                                        */
/* ------------------------------------------------------------------ */

const SPEAKER_ICON: Record<string, typeof Users> = {
  Manager: ClipboardList,
  "Head of Transfers": BriefcaseBusiness,
  Recruitment: BriefcaseBusiness,
  "Chief Scout": Binoculars,
  Scout: Binoculars,
  Scouting: Binoculars,
  Contracts: Users,
};

function DepartmentBriefing({
  items,
  onGo,
}: {
  items: DeskBriefingItem[];
  onGo: (target: DeskRequest) => void;
}) {
  if (!items.length) {
    return (
      <div className="lf-desk-briefing is-quiet shrink-0">
        Football department · nothing needs your attention
      </div>
    );
  }
  return (
    <div className="lf-desk-briefing shrink-0" aria-label="Football department briefing">
      {items.map((item) => {
        const Icon = SPEAKER_ICON[item.speaker] ?? Users;
        return (
          <button
            key={item.id}
            type="button"
            className={cn("lf-desk-brief", `is-${item.tone}`)}
            onClick={() => onGo(item.target)}
          >
            <span className="lf-desk-brief-who">
              <Icon className="size-3" />
              {item.speaker}
              {item.speakerName ? ` · ${item.speakerName.split(" ").slice(-1)[0]}` : ""}
            </span>
            <span className="lf-desk-brief-text">{item.text}</span>
          </button>
        );
      })}
    </div>
  );
}
