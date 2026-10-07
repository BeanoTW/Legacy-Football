import { useMemo, useState } from "react";
import {
  Binoculars,
  ChevronDown,
  FileText,
  Handshake,
  Plus,
  Send,
  Star,
  UserRound,
} from "lucide-react";
import type { GameState, Position } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/game/engine";
import { submitTransferEnquiry, submitTransferOffer } from "@/lib/game/recruitment";
import { startScouting } from "@/lib/game/scouting";
import {
  chairmanRecruitmentEstimate,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import {
  managerRecruitmentBrief,
  delegateManagerRecruitmentPriorities,
} from "@/lib/game/managerRecruitmentBrief";
import { scoutingBriefDaysRemaining } from "@/lib/game/scoutingDiscovery";
import {
  MARKET_FILTER_LABEL,
  deskDelegation,
  marketRowMatches,
  priorityLevelLabel,
  transferMarketRows,
  userManager,
  type MarketFilter,
  type MarketRow,
} from "@/lib/game/transferDesk";
import { ScoutingBrowser } from "./ScoutingBrowser";
import { ScoutingBriefBuilder } from "./ScoutingBriefBuilder";
import { ScoutingReports } from "./ScoutingReports";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import type { RunAction } from "./TransferDesk";

/* Market — one discovery workspace.
   Recommended targets, scouting reports, the shortlist, free agents, listed
   and loan-available players all come from what the club has legitimately
   discovered (chairmanRecruitmentPlayerIds + scouting). Wider search means
   commissioning scouts, never browsing the simulation's player database. */

export type MarketSurface = {
  kind: "recommended" | "reports" | "brief";
  focusPlayerId?: string;
  briefId?: string;
};

const FILTERS: MarketFilter[] = ["all", "shortlist", "scouted", "free", "listed", "loans"];
const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export function TransferMarket({
  state,
  update,
  run,
  filter,
  onFilter,
  position,
  onPosition,
  surface,
  onSurface,
  onNegotiationStarted,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  run: RunAction;
  filter: MarketFilter;
  onFilter: (filter: MarketFilter) => void;
  position: Position | null;
  onPosition: (position: Position | null) => void;
  surface: MarketSurface | null;
  onSurface: (surface: MarketSurface | null) => void;
  onNegotiationStarted: (negotiationId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => transferMarketRows(state), [state]);
  const manager = userManager(state);
  const brief = useMemo(
    () => (manager && state.football ? managerRecruitmentBrief(state, manager) : null),
    [manager, state],
  );
  const delegation = deskDelegation(state);
  const briefs = state.football?.scoutingDiscovery?.briefs ?? [];
  const activeBrief = briefs.find((candidate) => candidate.status === "active") ?? null;
  const completeBriefs = briefs.filter((candidate) => candidate.status === "complete");

  if (surface) {
    const back = () => onSurface(null);
    if (surface.kind === "brief" || (surface.kind === "recommended" && briefs.length === 0)) {
      return <ScoutingBriefBuilder state={state} update={update} onBack={back} />;
    }
    if (surface.kind === "recommended") {
      return (
        <ScoutingBrowser
          state={state}
          update={update}
          onBack={back}
          onNewBrief={() => onSurface({ kind: "brief" })}
          onNegotiationStarted={onNegotiationStarted}
          initialBriefId={surface.briefId}
        />
      );
    }
    return (
      <ScoutingReports
        state={state}
        update={update}
        onBack={back}
        focusPlayerId={surface.focusPlayerId}
        onNegotiationStarted={onNegotiationStarted}
      />
    );
  }

  const visible = rows.filter(
    (row) => marketRowMatches(row, filter) && (!position || row.position === position),
  );

  const approach = (row: MarketRow) =>
    run(
      (s) => {
        const estimate = chairmanRecruitmentEstimate(s, row.player.id);
        const wage = estimate?.openingWeeklyWage ?? 0;
        return row.freeAgent
          ? submitTransferOffer(s, row.player.id, 0, "First Team", wage)
          : submitTransferEnquiry(s, row.player.id, "First Team", wage);
      },
      (outcome) => {
        const negotiationId = (outcome.result as { negotiation?: { id: string } }).negotiation?.id;
        if (negotiationId) onNegotiationStarted(negotiationId);
      },
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      {brief && brief.priorities.length > 0 && (
        <section className="lf-desk-priorities shrink-0">
          <div className="lf-desk-priorities-head">
            <span className="min-w-0 truncate">
              <strong>{brief.managerName}</strong> · {brief.tacticalShape}
            </span>
            {delegation.alreadyActive ? (
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Recruitment searching
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={!delegation.available}
                title={delegation.reason}
                onClick={() =>
                  manager && update((s) => delegateManagerRecruitmentPriorities(s, manager))
                }
              >
                <Send className="mr-1 size-3" />
                Delegate to scouts
              </Button>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {brief.priorities.map((priority, index) => (
              <button
                key={`${priority.position}-${index}`}
                type="button"
                className={cn(
                  "lf-desk-need",
                  index === 0 && "is-top",
                  position === priority.position && "is-active",
                )}
                onClick={() =>
                  onPosition(position === priority.position ? null : priority.position)
                }
                title={priority.rationale}
              >
                <span className="lf-desk-need-role">
                  {priority.tacticalPosition ?? priority.position}
                </span>
                <span>{priority.headline.replace(/ needed$/, "")}</span>
                <span className="lf-desk-need-level">{priorityLevelLabel(priority)}</span>
              </button>
            ))}
          </div>
          {!delegation.available && !delegation.alreadyActive && delegation.reason && (
            <p
              className="mt-1 truncate text-[10px] text-muted-foreground"
              title={delegation.reason}
            >
              {delegation.reason}
            </p>
          )}
        </section>
      )}

      <section className="lf-desk-search shrink-0">
        <Binoculars className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 truncate text-xs">
          {activeBrief ? (
            <>
              <strong>{activeBrief.delegatedLabel ?? "Scouts are searching"}</strong> · returns{" "}
              {(() => {
                const d = scoutingBriefDaysRemaining(state, activeBrief.id);
                return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
              })()}
            </>
          ) : completeBriefs.length ? (
            <>
              <strong>Latest search is back</strong> · {completeBriefs.length} on file
            </>
          ) : (
            <>
              <strong>No search yet</strong> · brief the scouts
            </>
          )}
        </div>
        {(activeBrief || completeBriefs.length > 0) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => onSurface({ kind: "recommended" })}
          >
            Recommended
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
          onClick={() => onSurface({ kind: "reports" })}
        >
          <FileText className="mr-1 size-3.5" />
          Reports
        </Button>
        <Button size="sm" className="h-8 px-2 text-xs" onClick={() => onSurface({ kind: "brief" })}>
          <Plus className="mr-1 size-3.5" />
          New scouting assignment
        </Button>
      </section>

      <div className="flex shrink-0 flex-col gap-1">
        <div className="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Market filter">
          {FILTERS.map((value) => {
            const count = rows.filter(
              (row) => marketRowMatches(row, value) && (!position || row.position === position),
            ).length;
            return (
              <button
                key={value}
                type="button"
                className={cn("lf-chip shrink-0", filter === value && "is-active")}
                onClick={() => onFilter(value)}
              >
                {MARKET_FILTER_LABEL[value]}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
          <span className="mx-0.5 w-px shrink-0 bg-border" />
          {POSITIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={cn("lf-chip shrink-0", position === value && "is-active")}
              onClick={() => onPosition(position === value ? null : value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="contained-scroll min-h-0 flex-1 pr-0.5">
        {visible.length === 0 ? (
          <div className="lf-desk-empty">
            <Binoculars className="size-7 text-muted-foreground" />
            <h2 className="font-display text-lg">
              {rows.length ? "No staff recommendations match" : "No players on your desk"}
            </h2>
            <p>
              Recruitment only puts realistic options on your desk. Send the scouts a new assignment
              to bring back a small shortlist that fits your club and the manager's needs.
            </p>
            <Button size="sm" onClick={() => onSurface({ kind: "brief" })}>
              <Plus className="mr-1.5 size-4" />
              New scouting assignment
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {visible.map((row) => (
              <MarketRowView
                key={row.player.id}
                row={row}
                open={openId === row.player.id}
                onToggle={() =>
                  setOpenId((current) => (current === row.player.id ? null : row.player.id))
                }
                onShortlist={() => update((s) => toggleChairmanShortlist(s, row.player.id))}
                onScout={() => update((s) => startScouting(s, row.player.id))}
                onApproach={() => approach(row)}
                onOpenTalks={() => row.negotiationId && onNegotiationStarted(row.negotiationId)}
                onReport={() => onSurface({ kind: "reports", focusPlayerId: row.player.id })}
                canApproach={Boolean(chairmanRecruitmentEstimate(state, row.player.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketRowView({
  row,
  open,
  onToggle,
  onShortlist,
  onScout,
  onApproach,
  onOpenTalks,
  onReport,
  canApproach,
}: {
  row: MarketRow;
  open: boolean;
  onToggle: () => void;
  onShortlist: () => void;
  onScout: () => void;
  onApproach: () => void;
  onOpenTalks: () => void;
  onReport: () => void;
  canApproach: boolean;
}) {
  return (
    <div
      className={cn(
        "lf-desk-market-row",
        open && "is-open",
        row.priorityRank === 0 && "is-priority",
      )}
    >
      <button type="button" className="lf-desk-market-main" onClick={onToggle} aria-expanded={open}>
        <span className="lf-desk-pos">{row.tacticalPosition}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-display text-[0.95rem] leading-tight">{row.name}</span>
            {row.shortlisted && (
              <Star
                className="size-3 shrink-0 fill-amber-400 text-amber-400"
                aria-label="Shortlisted"
              />
            )}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {row.age}y · {row.clubName}
            {row.valueRange
              ? ` · ${fmtMoney(row.valueRange[0])}–${fmtMoney(row.valueRange[1])}`
              : ""}
          </span>
          <span className="lf-desk-tags">
            {row.negotiationId && <span className="is-live">In talks</span>}
            {row.priorityRank !== null && (
              <span className="is-priority">
                {row.priorityRank === 0 ? "Top priority" : "Squad need"}
              </span>
            )}
            {row.recommended && <span>Recommended</span>}
            <span title={row.interestReason}>{row.interestLabel}</span>
            {row.freeAgent && <span>Free</span>}
            {row.listed && <span>Listed</span>}
            {row.loanAvailable && <span>Loan</span>}
          </span>
        </span>
        <span className="lf-desk-ovr">
          <span className="block font-display text-base leading-none">{row.overallLabel}</span>
          <span className="lf-desk-knowledge" aria-label={`${row.knowledgePct}% scouted`}>
            <span style={{ width: `${row.knowledgePct}%` }} />
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="lf-desk-market-actions">
          <Button
            size="sm"
            variant={row.shortlisted ? "secondary" : "outline"}
            className="h-8 px-2 text-xs"
            onClick={onShortlist}
          >
            <Star className={cn("mr-1 size-3.5", row.shortlisted && "fill-current")} />
            {row.shortlisted ? "Shortlisted" : "Shortlist"}
          </Button>
          {row.scouting === "none" ? (
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onScout}>
              <Binoculars className="mr-1 size-3.5" />
              {row.knowledgePct > 0 ? "Scout further" : "Scout"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onReport}>
              <FileText className="mr-1 size-3.5" />
              {row.reportComplete ? "Full report" : `Report · ${row.knowledgePct}%`}
            </Button>
          )}
          {row.negotiationId ? (
            <Button size="sm" className="h-8 px-2 text-xs" onClick={onOpenTalks}>
              <Handshake className="mr-1 size-3.5" />
              Open talks
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={!canApproach}
              title={canApproach ? undefined : "Scout him first so the staff can value him"}
              onClick={onApproach}
            >
              <Handshake className="mr-1 size-3.5" />
              {row.freeAgent ? "Approach player" : "Approach club"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => openPlayerProfile(row.player.id)}
          >
            <UserRound className="mr-1 size-3.5" />
            Profile{row.loanAvailable ? " · loan" : ""}
          </Button>
        </div>
      )}
    </div>
  );
}
