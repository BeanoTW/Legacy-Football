import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Binoculars,
  CheckCircle2,
  Handshake,
  RefreshCw,
  Repeat2,
  Star,
} from "lucide-react";
import type { GameState, LoanPlayingTimeExpectation } from "@/lib/game/types";
import {
  arrangeUserPlayerLoanIn,
  canAuthorisePurchase,
  canAuthoriseWage,
  loanInAvailabilityReason,
  playerInterestAssessment,
  playerName,
  ageOf,
  submitTransferEnquiry,
  submitTransferOffer,
  userWageBill,
} from "@/lib/game/recruitment";
import { scoutingAssignment, scoutingReport, startScouting } from "@/lib/game/scouting";
import {
  createScoutingBrief,
  scoutingBriefDaysRemaining,
} from "@/lib/game/scoutingDiscovery";
import { transferTargetPlayer } from "@/lib/game/recruitmentTargetBridge";
import {
  chairmanRecruitmentEstimate,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import { clubDisplayName } from "@/lib/game/clubReference";
import { fmtMoney } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./shared/layout";
import { POSITION_BADGE_CLASS } from "./playerPosition";
import { isTransferWindowOpen, windowStatus } from "@/lib/game/calendar";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import { positionUnit, tacticalPositionProfile } from "@/lib/game/positions";

function newestBrief(state: GameState) {
  return [...(state.football?.scoutingDiscovery?.briefs ?? [])].sort((a, b) => {
    const ad = a.createdAtDay ?? a.createdAtAbsoluteWeek * 7;
    const bd = b.createdAtDay ?? b.createdAtAbsoluteWeek * 7;
    return bd - ad;
  })[0] ?? null;
}

function recommendationBriefId(state: GameState, sequence: number) {
  return `staff-recommendations:s${state.season}:w${state.week}:r${sequence}`;
}

export function ScoutingBrowser({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [loanTargetId, setLoanTargetId] = useState<string | null>(null);
  const [loanDuration, setLoanDuration] = useState(12);
  const [loanContribution, setLoanContribution] = useState(50);
  const [loanRole, setLoanRole] = useState<LoanPlayingTimeExpectation>("Regular");

  const brief = newestBrief(state);
  const loanWindowOpen = isTransferWindowOpen(state);
  const loanWindow = windowStatus(state);

  useEffect(() => {
    if (!state.football || brief) return;
    update((s) =>
      createScoutingBrief(s, {
        id: recommendationBriefId(s, s.football?.scoutingDiscovery?.briefs.length ?? 0),
        maxAge: 40,
      }),
    );
  }, [brief, state.football, update]);

  const rows = useMemo(() => {
    if (!brief || brief.status !== "complete") return [];
    return brief.candidateIds
      .flatMap((playerId) => {
        const player = transferTargetPlayer(state, playerId);
        return player ? [player] : [];
      })
      .slice(0, 40);
  }, [brief, state]);

  const approach = (playerId: string, freeAgent: boolean, weeklyWage: number) =>
    update((s) => {
      const result = freeAgent
        ? submitTransferOffer(s, playerId, 0, "First Team", weeklyWage)
        : submitTransferEnquiry(s, playerId, "First Team", weeklyWage);
      setNote(result.result.reason);
      return result.state;
    });

  const requestLoan = (playerId: string) => {
    const result = arrangeUserPlayerLoanIn(state, playerId, {
      durationWeeks: loanDuration,
      loanClubWageContributionPct: loanContribution,
      playingTimeExpectation: loanRole,
    });
    setNote(result.result.reason);
    if (result.result.ok) {
      setLoanTargetId(null);
      update(() => result.state);
    }
  };

  const requestFreshOptions = () => {
    update((s) =>
      createScoutingBrief(s, {
        id: recommendationBriefId(s, (s.football?.scoutingDiscovery?.briefs.length ?? 0) + 1),
        maxAge: 40,
      }),
    );
  };

  const wageCeiling = state.finance?.budgets?.wages ?? 0;
  const wageBill = userWageBill(state);
  const wageHeadroom = wageCeiling > 0 ? Math.max(0, wageCeiling - wageBill) : null;
  const daysRemaining = brief ? scoutingBriefDaysRemaining(state, brief.id) : 0;

  const toolbar = (
    <div className="space-y-1.5">
      {note && <div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">{note}</div>}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="rounded-md bg-muted px-2 py-1 font-semibold">Cash {fmtMoney(state.cash)}</span>
        <span className="rounded-md bg-muted px-2 py-1 font-semibold">
          Wages {fmtMoney(wageBill)}/wk
          {wageHeadroom !== null ? ` · ${fmtMoney(wageHeadroom)} headroom` : ""}
        </span>
        <span className="rounded-md bg-muted px-2 py-1">
          {brief?.scoutQuality ?? 50} scouting quality
        </span>
      </div>
    </div>
  );

  if (!brief || brief.status === "active") {
    return (
      <DetailScreen
        title="Recruitment options"
        subtitle={
          brief
            ? `Your football staff are looking for options · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
            : "Your football staff are preparing a recruitment search"
        }
        actions={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" /> Back
          </Button>
        }
        toolbar={toolbar}
      >
        <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Binoculars className="size-7" />
            <div>
              <div className="font-display text-xl">Staff-led recruitment</div>
              <div className="text-sm text-muted-foreground">
                Your manager and scouting department are identifying players they believe are worth your attention.
              </div>
            </div>
          </div>
          {brief && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted p-2">
                <div className="font-display text-lg">{brief.scoutQuality ?? 50}</div>
                <div className="text-muted-foreground">Scout quality</div>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <div className="font-display text-lg">Up to {brief.candidateLimit ?? 10}</div>
                <div className="text-muted-foreground">Options</div>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <div className="font-display text-lg">{brief.initialKnowledgeDays ?? 2}d</div>
                <div className="text-muted-foreground">Initial work</div>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            When the list arrives, every player has an initial assessment. Send scouts back to the interesting ones for a fuller report before deciding whether to negotiate.
          </p>
        </section>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      title="Recruitment options"
      subtitle={`${rows.length} players brought to your attention by the football staff`}
      actions={
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
      }
      toolbar={toolbar}
      className="touch-pan-y grid gap-2 xl:grid-cols-2 xl:items-start"
    >
      <div className="xl:col-span-2 flex justify-end">
        <Button variant="outline" size="sm" onClick={requestFreshOptions}>
          <RefreshCw className="mr-2 size-4" /> Ask for fresh options
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          The staff did not find a worthwhile option in this pass. Ask them to take another look.
        </div>
      )}

      {rows.map((player) => {
        const assignment = scoutingAssignment(state, player.id);
        const tactical = tacticalPositionProfile(player);
        const report = scoutingReport(state, player);
        const interest = playerInterestAssessment(state, player);
        const watched = isChairmanShortlisted(state, player.id);
        const freeAgent = player.currentClubId === null;
        const loanUnavailable = freeAgent ? "Free agents cannot be borrowed" : loanInAvailabilityReason(state, player.id);
        const estimate = chairmanRecruitmentEstimate(state, player.id);
        if (!estimate) return null;

        const feeAuthority = canAuthorisePurchase(state, estimate.estimatedMaxFee);
        const wageAuthority = canAuthoriseWage(state, estimate.estimatedMaxWeeklyWage);
        const budgetComfortable = feeAuthority.allowed && wageAuthority.allowed;
        const initialReport = !assignment && report.knowledgePct > 0;

        return (
          <article key={player.id} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openPlayerProfile(player.id)}
                    className="truncate text-left font-display text-lg hover:underline"
                  >
                    {playerName(player)}
                  </button>
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                      POSITION_BADGE_CLASS[positionUnit(tactical.primary)],
                    )}
                  >
                    {tactical.primary}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ageOf(player, state.season)} · {player.nationality} ·{" "}
                  {player.currentClubId ? clubDisplayName(state, player.currentClubId) : "Free agent"}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-2xl leading-none">{player.currentAbility}</div>
                <div className="text-[8px] uppercase tracking-wider text-muted-foreground">Overall</div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-1">
              {report.attributes.slice(0, 5).map((attr) => (
                <div key={attr.key} className="rounded bg-muted/50 px-1 py-1">
                  <div className="truncate text-[8px] text-muted-foreground">{attr.label}</div>
                  <div className="text-[10px] font-semibold tabular-nums">
                    {!attr.known ? "?" : attr.exact !== undefined ? attr.exact : `${attr.min}–${attr.max}`}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-3 text-[10px]">
              <span>Knowledge <strong>{report.knowledgePct}%</strong></span>
              <span>Interest <strong title={interest.reason}>{interest.label}</strong></span>
              <span>
                Value <strong>{report.valueRange ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}` : "?"}</strong>
              </span>
              <span>
                Wage <strong>{report.wageRange ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk` : "?"}</strong>
              </span>
            </div>

            <div className={cn(
              "mt-2 rounded-md border px-2 py-1 text-[10px]",
              budgetComfortable ? "bg-muted/40" : "border-destructive/40 bg-destructive/5",
            )}>
              <span className="font-semibold">{budgetComfortable ? "Within authority" : "Budget risk"}</span>
              {" · "}
              {assignment
                ? report.complete ? "Full report" : "Scout following up"
                : initialReport ? "Initial staff report" : "Basic knowledge"}
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant={watched ? "default" : "outline"}
                className="h-8 px-2 text-[10px]"
                onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}
              >
                <Star className={cn("mr-1 size-3", watched && "fill-current")} />
                {watched ? "Shortlisted" : "Shortlist"}
              </Button>

              {!assignment ? (
                <Button
                  size="sm"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => update((s) => startScouting(s, player.id))}
                >
                  <Binoculars className="mr-1 size-3" />
                  {initialReport ? "Scout further" : "Scout"}
                </Button>
              ) : report.complete ? (
                <span className="inline-flex items-center px-1 text-[10px] font-semibold text-[color:var(--color-income)]">
                  <CheckCircle2 className="mr-1 size-3" /> Full report
                </span>
              ) : (
                <span className="px-1 text-[10px] text-muted-foreground">
                  <Binoculars className="mr-1 inline size-3" /> Scouting
                </span>
              )}

              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-2 text-[10px]"
                onClick={() => approach(player.id, freeAgent, estimate.openingWeeklyWage)}
              >
                <Handshake className="mr-1 size-3" />
                {freeAgent ? "Approach player" : "Approach club"}
              </Button>

              {!freeAgent && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-[10px]"
                  disabled={!loanWindowOpen || Boolean(loanUnavailable)}
                  title={!loanWindowOpen ? `${loanWindow.label} · ${loanWindow.detail}` : loanUnavailable ?? "Request a temporary loan"}
                  onClick={() => setLoanTargetId((current) => (current === player.id ? null : player.id))}
                >
                  <Repeat2 className="mr-1 size-3" /> Loan
                </Button>
              )}
            </div>

            {loanTargetId === player.id && !freeAgent && (
              <div className="mt-2 grid gap-1.5 rounded-md border bg-muted/30 p-2 sm:grid-cols-4">
                <select value={loanDuration} onChange={(event) => setLoanDuration(Number(event.target.value))} className="h-8 rounded-md border bg-background px-2 text-[10px]">
                  {[4, 8, 12, 24].map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}
                </select>
                <select value={loanContribution} onChange={(event) => setLoanContribution(Number(event.target.value))} className="h-8 rounded-md border bg-background px-2 text-[10px]">
                  {[20, 35, 50, 65, 80, 100].map((pct) => <option key={pct} value={pct}>{pct}% wage share</option>)}
                </select>
                <select value={loanRole} onChange={(event) => setLoanRole(event.target.value as LoanPlayingTimeExpectation)} className="h-8 rounded-md border bg-background px-2 text-[10px]">
                  {(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <Button size="sm" className="h-8 text-[10px]" onClick={() => requestLoan(player.id)}>
                  Request loan
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </DetailScreen>
  );
}
