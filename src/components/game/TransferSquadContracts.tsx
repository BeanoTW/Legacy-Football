import { useMemo, useState } from "react";
import { ChevronDown, FileSignature, Handshake, Repeat2, Tag, UserRound } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { setTransferStatus, userWageBill } from "@/lib/game/recruitment";
import { WEEKS_PER_SEASON } from "@/lib/game/time";
import { transferAskingPrice, withTransferAskingPrice } from "@/lib/game/transferAskingPrice";
import {
  CONTRACT_RISK_LABEL,
  clubEmploymentLabel,
  squadContractRows,
  type DeskDeal,
  type SquadContractRow,
} from "@/lib/game/transferDesk";
import { LoanOutForm } from "./LoanDesk";
import { removePlayerLoanAvailability, setPlayerAvailableForLoan } from "@/lib/game/loanAvailability";
import { DealKindTag } from "./TransferDealStage";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import type { RunAction } from "./TransferDesk";

/* Squad & Contracts — the outgoing and retention workspace.
   Role, age, ability, wage, contract runway, value, the manager's current
   use of the player and transfer/loan status in one executive view. Listing,
   asking prices and loan offers happen here; contract talks and release stay
   in the player profile, which owns those canonical actions. */

export type SquadView = "all" | "contracts" | "listed" | "loans";
type SortKey = "position" | "contract" | "wage" | "value";

const VIEWS: { id: SquadView; label: string }[] = [
  { id: "all", label: "Squad" },
  { id: "contracts", label: "Contract risk" },
  { id: "listed", label: "Listed" },
  { id: "loans", label: "Loans" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "position", label: "Position" },
  { id: "contract", label: "Contract" },
  { id: "wage", label: "Wage" },
  { id: "value", label: "Value" },
];
const UNIT_ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 } as const;

function runway(weeks: number | null): string {
  if (weeks === null) return "—";
  if (weeks <= 0) return "Expires now";
  if (weeks < WEEKS_PER_SEASON) return `${weeks}w`;
  const seasons = Math.floor(weeks / WEEKS_PER_SEASON);
  const rest = weeks % WEEKS_PER_SEASON;
  return rest ? `${seasons}y ${rest}w` : `${seasons}y`;
}

function managerUseLabel(row: SquadContractRow): string {
  if (row.managerUse === "away") return `On loan · ${row.loan?.clubName ?? ""}`;
  if (row.managerAssessmentRole) {
    return `${row.managerAssessmentRole}${row.managerFit ? ` · ${row.managerFit}` : ""}`;
  }
  if (row.managerUse === "starter")
    return `Starts${row.managerRole ? ` · ${row.managerRole}` : ""}`;
  if (row.managerUse === "bench") return "Bench";
  return "Outside matchday squad";
}

export function TransferSquadContracts({
  state,
  update,
  run,
  deals,
  view,
  onView,
  onOpenDeal,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  run: RunAction;
  deals: DeskDeal[];
  view: SquadView;
  onView: (view: SquadView) => void;
  onOpenDeal: (negotiationId: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>(view === "contracts" ? "contract" : "position");
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => squadContractRows(state, deals), [state, deals]);
  const owned = rows.filter((row) => row.loan?.direction !== "in");
  const final24 = owned.filter((row) => row.risk === "final24").length;
  const final52 = owned.filter((row) => row.risk === "final52").length;
  const wageBill = userWageBill(state);

  const visible = rows
    .filter((row) =>
      view === "contracts"
        ? row.risk === "final24" || row.risk === "final52"
        : view === "listed"
          ? row.listed || Boolean(row.liveDeal)
          : view === "loans"
            ? Boolean(row.loan)
            : true,
    )
    .sort((a, b) => {
      const key = view === "contracts" && sort === "position" ? "contract" : sort;
      if (key === "contract")
        return (a.weeksLeft ?? 9999) - (b.weeksLeft ?? 9999) || b.overall - a.overall;
      if (key === "wage") return (b.weeklyWage ?? 0) - (a.weeklyWage ?? 0);
      if (key === "value") return b.marketValue - a.marketValue;
      return (
        UNIT_ORDER[a.player.primaryPosition] - UNIT_ORDER[b.player.primaryPosition] ||
        b.overall - a.overall
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <section className="lf-desk-squad-summary shrink-0">
        <Summary label="Squad" value={String(owned.length)} />
        <Summary label="Wages /wk" value={fmtMoney(wageBill)} />
        <Summary
          label="Final 24w"
          value={String(final24)}
          tone={final24 ? "bad" : undefined}
          onClick={() => onView("contracts")}
        />
        <Summary
          label="Final year"
          value={String(final52)}
          tone={final52 ? "warn" : undefined}
          onClick={() => onView("contracts")}
        />
        <Summary label="Employment" value={clubEmploymentLabel(state)} text />
      </section>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Squad view">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn("lf-chip shrink-0", view === item.id && "is-active")}
              onClick={() => {
                onView(item.id);
                if (item.id === "contracts") setSort("contract");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="h-7 rounded-md border bg-background px-1.5 text-xs normal-case tracking-normal text-foreground"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="lf-desk-squad-head shrink-0" aria-hidden="true">
        <span>Player</span>
        <span>Manager</span>
        <span>Wage</span>
        <span>Contract</span>
        <span>Value</span>
        <span>OVR</span>
      </div>
      <div className="contained-scroll min-h-0 flex-1 pr-0.5">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            {view === "contracts"
              ? "No contracts inside their final year."
              : view === "listed"
                ? "No players listed or attracting bids."
                : view === "loans"
                  ? "No loans running."
                  : "No players registered."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {visible.map((row) => (
              <SquadRow
                key={row.player.id}
                state={state}
                update={update}
                run={run}
                row={row}
                open={openId === row.player.id}
                onToggle={() =>
                  setOpenId((current) => (current === row.player.id ? null : row.player.id))
                }
                onOpenDeal={onOpenDeal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SquadRow({
  state,
  update,
  run,
  row,
  open,
  onToggle,
  onOpenDeal,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  run: RunAction;
  row: SquadContractRow;
  open: boolean;
  onToggle: () => void;
  onOpenDeal: (negotiationId: string) => void;
}) {
  const ask = transferAskingPrice(state, row.player);
  const [askDraft, setAskDraft] = useState(String(ask));
  const [loanOpen, setLoanOpen] = useState(false);
  const loanedIn = row.loan?.direction === "in";
  const loanedOut = row.loan?.direction === "out";
  const canManage = !loanedIn && !loanedOut;

  return (
    <div className={cn("lf-desk-squad-row", `is-${row.risk}`, open && "is-open")}>
      <button type="button" className="lf-desk-squad-main" onClick={onToggle} aria-expanded={open}>
        <span className="lf-desk-squad-player">
          <span className="lf-desk-pos">{row.position}</span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-display text-[0.95rem] leading-tight">{row.name}</span>
              {row.listed && <span className="lf-desk-flag is-listed">Listed</span>}
              {row.loanAvailable && (
                <span className="lf-desk-flag">Loan available{row.loanInterestCount ? ` · ${row.loanInterestCount} interested` : ""}</span>
              )}
              {row.loan && (
                <span className="lf-desk-flag">{loanedIn ? "Loan in" : "Loan out"}</span>
              )}
              {row.liveDeal && <span className="lf-desk-flag is-live">Bid</span>}
            </span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {row.age}y · {row.squadRole ?? "—"}
              {row.employment ? ` · ${row.employment}` : ""}
            </span>
          </span>
        </span>
        <span className={cn("lf-desk-squad-use", `is-${row.managerUse}`)}>
          {managerUseLabel(row)}
        </span>
        <span className="lf-desk-squad-num">
          {row.weeklyWage === null ? "—" : `${fmtMoney(row.weeklyWage)}`}
          <small>/wk</small>
        </span>
        <span className={cn("lf-desk-squad-num lf-desk-runway", `is-${row.risk}`)}>
          {loanedIn ? `${row.loan!.weeksLeft}w loan` : runway(row.weeksLeft)}
        </span>
        <span className="lf-desk-squad-num">{fmtMoney(row.marketValue)}</span>
        <span className="lf-desk-squad-ovr font-display">{row.overall}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="lf-desk-squad-actions">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>
              Contract ·{" "}
              <strong className="text-foreground">{CONTRACT_RISK_LABEL[row.risk]}</strong>
              {row.weeksLeft !== null ? ` (${row.weeksLeft} weeks)` : ""}
            </span>
            <span>
              Manager · <strong className="text-foreground">{managerUseLabel(row)}</strong>
            </span>
            {row.managerSummary && (
              <span className="basis-full text-[10px]">{row.managerSummary}</span>
            )}
            {canManage && (
              <span>
                Asking price · <strong className="text-foreground">{fmtMoneyExact(ask)}</strong>
              </span>
            )}
          </div>
          {row.liveDeal && (
            <button
              type="button"
              className="lf-desk-squad-deal"
              onClick={() => row.liveDeal?.negotiationId && onOpenDeal(row.liveDeal.negotiationId)}
            >
              <DealKindTag kind={row.liveDeal.kind} />
              <span className="min-w-0 flex-1 truncate">{row.liveDeal.headline}</span>
              <Handshake className="size-4 shrink-0" />
            </button>
          )}
          {canManage && (
            <div className="flex flex-wrap items-end gap-1.5">
              <Button
                size="sm"
                className="h-8 px-2.5 text-xs"
                variant={row.listed ? "secondary" : "default"}
                onClick={() =>
                  run((s) =>
                    setTransferStatus(s, row.player.id, row.listed ? "unlisted" : "listed"),
                  )
                }
              >
                <Tag className="mr-1 size-3.5" />
                {row.listed ? "Remove from list" : "Transfer list"}
              </Button>
              <label className="grid gap-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Asking price £
                <Input
                  aria-label={`Asking price for ${row.name}`}
                  inputMode="numeric"
                  value={askDraft}
                  onChange={(event) => setAskDraft(event.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() =>
                    update((s) =>
                      withTransferAskingPrice(
                        s,
                        row.player.id,
                        Number(askDraft) || row.player.marketValue,
                      ),
                    )
                  }
                  className="h-8 w-24 px-2 text-right text-xs tabular-nums"
                />
              </label>
              <Button
                size="sm"
                variant={row.loanAvailable ? "secondary" : "outline"}
                className="h-8 px-2.5 text-xs"
                onClick={() =>
                  run((s) => {
                    const outcome = row.loanAvailable
                      ? removePlayerLoanAvailability(s, row.player.id)
                      : setPlayerAvailableForLoan(s, row.player.id);
                    return {
                      state: outcome.state,
                      result: { ok: outcome.ok, reason: outcome.reason },
                    };
                  })
                }
              >
                <Repeat2 className="mr-1 size-3.5" />
                {row.loanAvailable ? "Remove loan availability" : "Available for loan"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={() => setLoanOpen((value) => !value)}
              >
                <Handshake className="mr-1 size-3.5" />
                Open loan talks
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs"
                onClick={() => openPlayerProfile(row.player.id)}
              >
                <FileSignature className="mr-1 size-3.5" />
                Contract & release
              </Button>
            </div>
          )}
          {!canManage && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {loanedIn
                  ? `Borrowed from ${row.loan!.clubName} · ${row.loan!.weeksLeft}w left`
                  : `At ${row.loan!.clubName} · back in ${row.loan!.weeksLeft}w`}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-8 px-2.5 text-xs"
                onClick={() => openPlayerProfile(row.player.id)}
              >
                <UserRound className="mr-1 size-3.5" />
                {loanedIn ? "End loan" : "Recall"} in profile
              </Button>
            </div>
          )}
          {loanOpen && canManage && (
            <LoanOutForm
              state={state}
              update={update}
              playerId={row.player.id}
              onDone={() => setLoanOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  onClick,
  text = false,
}: {
  label: string;
  value: string;
  tone?: "bad" | "warn";
  onClick?: () => void;
  text?: boolean;
}) {
  const body = (
    <>
      <span className={cn("lf-desk-summary-value", text && "is-text")}>{value}</span>
      <span className="lf-desk-summary-label">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cn("lf-desk-summary", tone && `is-${tone}`)}>
      {body}
    </button>
  ) : (
    <div className={cn("lf-desk-summary", tone && `is-${tone}`)}>{body}</div>
  );
}
