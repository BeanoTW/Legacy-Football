import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Binoculars, CheckCircle2, Handshake, Star } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import {
  ageOf,
  playerInterestAssessment,
  playerName,
  openNegotiations,
  submitTransferEnquiry,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import { scoutingReport } from "@/lib/game/scouting";
import { transferTargetPlayer } from "@/lib/game/recruitmentTargetBridge";
import {
  chairmanRecruitmentEstimate,
  chairmanShortlistIds,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import { currentAbsoluteDay, upcomingTimelineEvents } from "@/lib/game/timeline";
import { managerRecruitmentBrief } from "@/lib/game/managerRecruitmentBrief";
import { fmtMoney } from "@/lib/game/engine";
import { clubDisplayName } from "@/lib/game/clubReference";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./shared/layout";
import { POSITION_BADGE_CLASS } from "./playerPosition";
import { positionUnit, tacticalPositionProfile } from "@/lib/game/positions";
import { playerAttributeIdentity } from "@/lib/game/playerAttributeIdentity";
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";

function negotiationStatusLabel(stage: string, freeAgent: boolean): string {
  if (stage === "enquiry") return "Enquiry sent";
  if (stage === "clubTalks") return "Club talks";
  if (stage === "playerTalks") return freeAgent ? "Contract talks" : "Personal terms";
  if (stage === "agreed") return "Terms agreed";
  if (stage === "registration") return "Registration";
  return "Talks open";
}

export function ScoutingReports({
  state,
  update,
  onBack,
  focusPlayerId,
  onNegotiationStarted,
  shortlistOnly = false,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
  focusPlayerId?: string;
  onNegotiationStarted?: (negotiationId: string) => void;
  shortlistOnly?: boolean;
}) {
  const focusRef = useRef<HTMLDivElement>(null);
  const [approachFeedback, setApproachFeedback] = useState<Record<string, { ok: boolean; message: string }>>({});
  useEffect(() => {
    if (focusPlayerId) focusRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [focusPlayerId]);
  const shortlisted = new Set(chairmanShortlistIds(state));
  const assignments = [...(state.football?.scouting?.assignments ?? [])]
    .filter((assignment) => !shortlistOnly || shortlisted.has(assignment.playerId))
    .sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.startedAtAbsoluteWeek - a.startedAtAbsoluteWeek;
  });
  const nowDay = currentAbsoluteDay(state);
  const scoutingEvents = upcomingTimelineEvents(state, 14).filter(
    (event) => event.kind === "scouting" && event.id.startsWith("scouting:player:"),
  );
  const manager = state.hiredStaff.find((staff) => staff.role === "Manager");
  const managerBrief = manager ? managerRecruitmentBrief(state, manager) : null;

  const approach = (playerId: string, freeAgent: boolean, weeklyWage: number) =>
    update((s) => {
      const result = freeAgent
        ? submitTransferOffer(s, playerId, 0, "First Team", weeklyWage)
        : submitTransferEnquiry(s, playerId, "First Team", weeklyWage);
      setApproachFeedback((current) => ({
        ...current,
        [playerId]: { ok: result.result.ok, message: result.result.reason },
      }));
      if (result.result.ok && result.result.negotiation?.id) {
        onNegotiationStarted?.(result.result.negotiation.id);
      }
      return result.state;
    });

  return (
    <DetailScreen
      title={shortlistOnly ? "Shortlist" : "Scouting reports"}
      subtitle={shortlistOnly ? `${assignments.length} watched target${assignments.length === 1 ? "" : "s"}` : `${assignments.filter((a) => a.status === "active").length} active · ${assignments.filter((a) => a.status === "complete").length} complete`}
      actions={
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
      }
      className="touch-pan-y grid auto-rows-max content-start gap-1.5 xl:grid-cols-2 xl:items-start"
    >
      {assignments.length === 0 && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {shortlistOnly ? "No shortlisted players yet. Star a player from Recommended players or Scouting reports to keep them here." : "No scouting assignments yet. Use Find Players and press Scout on anyone you want the recruitment team to track."}
        </div>
      )}

      {assignments.map((assignment) => {
        const player = transferTargetPlayer(state, assignment.playerId);
        if (!player) return null;
        const report = scoutingReport(state, player);
        const tactical = tacticalPositionProfile(player);
        const identity = playerAttributeIdentity(tactical.primary, report.attributes);
        const interest = playerInterestAssessment(state, player);
        const watched = isChairmanShortlisted(state, player.id);
        const freeAgent = player.currentClubId === null;
        const activeNegotiation = openNegotiations(state).find((deal) => deal.playerId === player.id) ?? null;
        const negotiationLabel = activeNegotiation ? negotiationStatusLabel(activeNegotiation.stage, freeAgent) : null;
        const estimate = chairmanRecruitmentEstimate(state, player.id);
        const managerPriority = managerBrief?.priorities.find(
          (priority) => priority.position === player.primaryPosition,
        );
        const managerPriorityRank = managerPriority
          ? managerBrief?.priorities.findIndex((priority) => priority.position === managerPriority.position) ?? -1
          : -1;
        const dueEvent = scoutingEvents.find((event) =>
          event.id.startsWith(`scouting:player:${player.id}:`),
        );
        const dueInDays = dueEvent ? Math.max(0, dueEvent.absoluteDay - nowDay) : null;
        if (!estimate) return null;

        return (
          <div key={player.id} ref={player.id === focusPlayerId ? focusRef : undefined} className={cn(player.id === focusPlayerId && "rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background")}>
          <TacticalPlayerCard
            state={state}
            player={player}
            mode="recruitment"
            actions={
              <div className="space-y-2">
                {identity && (
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <div className="text-[11px] font-semibold text-white/90">{identity.label}</div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-white/55">{identity.summary}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-wide text-white/40">Strengths · {identity.strengths.join(" · ")}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/60">
                  <span>Interest <strong className="text-white/85">{interest.label}</strong></span>
                  <span>{report.complete ? "Full report" : `Scouting · ${report.knowledgePct}%`}</span>
                  {activeNegotiation && <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 font-bold text-cyan-200">{negotiationLabel}</span>}
                  {!report.complete && dueEvent && dueInDays !== null && (
                    <span className="text-emerald-300">{dueEvent.label.replace(" due", "")} · {dueInDays === 0 ? "today" : `${dueInDays}d`}</span>
                  )}
                </div>
                {manager && managerPriority && (
                  <div className={cn(
                    "rounded-lg border border-white/10 px-2.5 py-2 text-[10px]",
                    managerPriorityRank === 0 ? "bg-emerald-400/10 text-emerald-100" : "bg-white/[0.04] text-white/65",
                  )}>
                    <span className="font-semibold">{managerPriorityRank === 0 ? `${manager.name}'s priority` : `${manager.name}'s squad need`}</span>
                    <span> · {managerPriority.headline} · {managerPriority.playerLevel === "startingXI" ? "Starting XI level" : managerPriority.playerLevel === "firstTeam" ? "First-team level" : "Squad depth"}</span>
                  </div>
                )}
                {approachFeedback[player.id] && (
                  <div className={cn(
                    "rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed",
                    approachFeedback[player.id].ok
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                      : "border-amber-400/30 bg-amber-400/10 text-amber-100",
                  )}>
                    {approachFeedback[player.id].message}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={watched ? "default" : "outline"}
                    className={cn(
                      "h-8 px-2 text-[10px]",
                      watched && "bg-primary text-primary-foreground hover:bg-primary/90 border-primary",
                    )}
                    onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}
                  >
                    <Star className={cn("mr-1 size-3", watched && "fill-current")} />
                    {watched ? "Shortlisted" : "Shortlist"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className={cn(
                      "h-8 px-2 text-[10px]",
                      activeNegotiation && "border border-cyan-300/35 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25 hover:text-white",
                    )}
                    onClick={() => activeNegotiation
                      ? onNegotiationStarted?.(activeNegotiation.id)
                      : approach(player.id, freeAgent, estimate.openingWeeklyWage)}
                  >
                    <Handshake className="mr-1 size-3" />
                    {activeNegotiation ? "View negotiation" : freeAgent ? "Approach player" : "Approach club"}
                  </Button>
                </div>
              </div>
            }
          />
          </div>
        );
      })}
    </DetailScreen>
  );
}
