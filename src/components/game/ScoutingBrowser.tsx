import { useMemo, useState } from "react";
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
import { scoutedOverallPresentation } from "@/lib/game/scoutingPresentation";
import { scoutingBriefDaysRemaining } from "@/lib/game/scoutingDiscovery";
import {
  chairmanScoutingFitScore,
  scoutingPlayerLevelLabel,
} from "@/lib/game/chairmanScoutingBrief";
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
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";
import { positionUnit, tacticalPositionProfile } from "@/lib/game/positions";
import { playerAttributeIdentity } from "@/lib/game/playerAttributeIdentity";

function newestBrief(state: GameState) {
  return [...(state.football?.scoutingDiscovery?.briefs ?? [])].sort((a, b) => {
    const ad = a.createdAtDay ?? a.createdAtAbsoluteWeek * 7;
    const bd = b.createdAtDay ?? b.createdAtAbsoluteWeek * 7;
    return bd - ad;
  })[0] ?? null;
}

export function ScoutingBrowser({
  state,
  update,
  onBack,
  onNewBrief,
  initialBriefId,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
  onNewBrief: () => void;
  initialBriefId?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [loanTargetId, setLoanTargetId] = useState<string | null>(null);
  const [loanDuration, setLoanDuration] = useState(12);
  const [loanContribution, setLoanContribution] = useState(50);
  const [loanRole, setLoanRole] = useState<LoanPlayingTimeExpectation>("Regular");

  const brief = (initialBriefId ? state.football?.scoutingDiscovery?.briefs.find((candidate) => candidate.id === initialBriefId) : null) ?? newestBrief(state);
  const loanWindowOpen = isTransferWindowOpen(state);
  const loanWindow = windowStatus(state);

  const rows = useMemo(() => {
    if (!brief || brief.status !== "complete") return [];
    return brief.candidateIds
      .flatMap((playerId) => {
        const player = transferTargetPlayer(state, playerId);
        return player ? [player] : [];
      })
      .sort((a, b) => {
        const fit =
          chairmanScoutingFitScore(state, brief.id, b.id) -
          chairmanScoutingFitScore(state, brief.id, a.id);
        return fit || playerName(a).localeCompare(playerName(b));
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

  const wageCeiling = state.finance?.budgets?.wages ?? 0;
  const wageBill = userWageBill(state);
  const wageHeadroom = wageCeiling > 0 ? Math.max(0, wageCeiling - wageBill) : null;
  const daysRemaining = brief ? scoutingBriefDaysRemaining(state, brief.id) : 0;
  const levelLabel = scoutingPlayerLevelLabel(brief?.playerLevel);

  const toolbar = (
    <div className="space-y-1.5">
      {note && <div className="rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">{note}</div>}
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="rounded-md bg-muted px-2 py-1 font-semibold">Cash {fmtMoney(state.cash)}</span>
        <span className="rounded-md bg-muted px-2 py-1 font-semibold">
          Wages {fmtMoney(wageBill)}/wk
          {wageHeadroom !== null ? ` · ${fmtMoney(wageHeadroom)} headroom` : ""}
        </span>
        <span className="rounded-md bg-muted px-2 py-1">{brief?.scoutQuality ?? 50} scouting quality</span>
        {brief?.playerLevel && <span className="rounded-md bg-muted px-2 py-1">Target · {levelLabel}</span>}
      </div>
    </div>
  );

  if (!brief) {
    return (
      <DetailScreen
        title="Recruitment options"
        subtitle="No scouting search has been commissioned"
        actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
        toolbar={toolbar}
      >
        <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3"><Binoculars className="size-7" /><div><div className="font-display text-xl">No active brief</div><div className="text-sm text-muted-foreground">Tell the recruitment team what kind of player you want before they start looking.</div></div></div>
          <Button className="mt-4" onClick={onNewBrief}><Binoculars className="mr-2 size-4" /> Set scouting brief</Button>
        </section>
      </DetailScreen>
    );
  }

  if (brief.status === "active") {
    return (
      <DetailScreen
        title="Recruitment options"
        subtitle={`Scouts are looking for ${levelLabel.toLowerCase()} options · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`}
        actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
        toolbar={toolbar}
      >
        <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Binoculars className="size-7" />
            <div><div className="font-display text-xl">Scouts are working</div><div className="text-sm text-muted-foreground">Your recruitment team is working to the brief you sent: {levelLabel}.</div></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">{brief.scoutQuality ?? 50}</div><div className="text-muted-foreground">Scout quality</div></div>
            <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">Up to {brief.candidateLimit ?? 10}</div><div className="text-muted-foreground">Options</div></div>
            <div className="rounded-lg bg-muted p-2"><div className="font-display text-lg">{daysRemaining}d</div><div className="text-muted-foreground">Remaining</div></div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">When the list arrives, staff rank the candidates against the quality level you asked for. Send scouts back to the interesting ones for a fuller report before deciding whether to negotiate.</p>
        </section>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      title="Recruitment options"
      subtitle={`${rows.length} ${levelLabel.toLowerCase()} options brought to your attention by the football staff`}
      actions={<Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 size-4" /> Back</Button>}
      toolbar={toolbar}
      className="touch-pan-y grid auto-rows-max content-start gap-2 xl:grid-cols-2 xl:items-start"
    >
      <div className="xl:col-span-2 flex justify-end">
        <Button variant="outline" size="sm" onClick={onNewBrief}><RefreshCw className="mr-2 size-4" /> Set new brief</Button>
      </div>
      {rows.length === 0 && <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">The staff did not find a worthwhile option for this brief. Set a new brief to search again.</div>}
      {rows.map((player) => {
        const assignment = scoutingAssignment(state, player.id);
        const tactical = tacticalPositionProfile(player);
        const report = scoutingReport(state, player);
        const overall = scoutedOverallPresentation(state, player, report);
        const identity = playerAttributeIdentity(tactical.primary, report.attributes);
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
          <TacticalPlayerCard
            key={player.id}
            state={state}
            player={player}
            mode="recruitment"
            actions={
              <div>
                {identity && report.knowledgePct >= 60 && (
                  <div className="mb-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-1.5">
                    <div className="text-[11px] font-semibold text-white/90">{identity.label}</div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-white/55">{identity.summary}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-wide text-white/40">Strengths · {identity.strengths.join(" · ")}</div>
                  </div>
                )}
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/75">
                  <span>Interest: <strong className="text-white" title={interest.reason}>{interest.label}</strong></span>
                  <span className={budgetComfortable ? "text-emerald-300" : "text-rose-300"}>
                    {budgetComfortable ? "Within authority" : "Budget risk"}
                  </span>
                  <span>{assignment ? report.complete ? "Full report" : "Scout following up" : initialReport ? "Initial staff report" : "Basic knowledge"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="outline" className={cn("h-9 min-w-9 border-white/25 bg-white/[0.08] px-2 text-xs text-white hover:bg-white/20 hover:text-white", watched && "border-amber-300 text-amber-200")} aria-label={watched ? "Remove from shortlist" : "Add to shortlist"} title={watched ? "Shortlisted" : "Shortlist"} onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}>
                    <Star className={cn("size-4", watched && "fill-current")} />
                  </Button>
                  {!assignment ? (
                    <Button size="sm" className="h-9 flex-1 bg-teal-700 px-2 text-xs text-white hover:bg-teal-600" onClick={() => update((s) => startScouting(s, player.id))}>
                      <Binoculars className="mr-1 size-3.5" />{initialReport ? "Scout further" : "Scout"}
                    </Button>
                  ) : report.complete ? (
                    <span className="inline-flex h-9 flex-1 items-center justify-center px-1 text-xs font-semibold text-emerald-200"><CheckCircle2 className="mr-1 size-3.5" /> Full report</span>
                  ) : (
                    <span className="inline-flex h-9 flex-1 items-center justify-center px-1 text-xs text-white/75"><Binoculars className="mr-1 size-3.5" /> Scouting</span>
                  )}
                  <Button size="sm" variant="secondary" className="h-9 flex-1 px-2 text-xs" onClick={() => approach(player.id, freeAgent, estimate.openingWeeklyWage)}>
                    <Handshake className="mr-1 size-3.5" />{freeAgent ? "Approach player" : "Approach club"}
                  </Button>
                  {!freeAgent && loanWindowOpen && !loanUnavailable && (
                    <Button size="sm" variant="outline" className="h-9 border-white/25 bg-white/[0.08] px-2 text-xs text-white hover:bg-white/20 hover:text-white" title={!loanWindowOpen ? `${loanWindow.label} · ${loanWindow.detail}` : loanUnavailable ?? "Request a temporary loan"} onClick={() => setLoanTargetId((current) => (current === player.id ? null : player.id))}>
                      <Repeat2 className="size-4" /><span className="sr-only">Loan</span>
                    </Button>
                  )}
                </div>
                {loanTargetId === player.id && !freeAgent && (
                  <div className="mt-2 grid gap-1.5 rounded-md border border-white/10 bg-black/20 p-2 sm:grid-cols-4">
                    <select value={loanDuration} onChange={(event) => setLoanDuration(Number(event.target.value))} className="h-8 rounded-md border bg-background px-2 text-[10px] text-foreground">{[4, 8, 12, 24].map((weeks) => <option key={weeks} value={weeks}>{weeks} weeks</option>)}</select>
                    <select value={loanContribution} onChange={(event) => setLoanContribution(Number(event.target.value))} className="h-8 rounded-md border bg-background px-2 text-[10px] text-foreground">{[20, 35, 50, 65, 80, 100].map((pct) => <option key={pct} value={pct}>{pct}% wage share</option>)}</select>
                    <select value={loanRole} onChange={(event) => setLoanRole(event.target.value as LoanPlayingTimeExpectation)} className="h-8 rounded-md border bg-background px-2 text-[10px] text-foreground">{(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => <option key={role} value={role}>{role}</option>)}</select>
                    <Button size="sm" className="h-8 text-[10px]" onClick={() => requestLoan(player.id)}>Request loan</Button>
                  </div>
                )}
              </div>
            }
          />
        );
      })}
    </DetailScreen>
  );
}