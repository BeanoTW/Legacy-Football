import { ArrowLeft, Binoculars, CheckCircle2, Handshake, Star } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import {
  ageOf,
  playerInterestAssessment,
  playerName,
  submitTransferEnquiry,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import { scoutingReport } from "@/lib/game/scouting";
import { transferTargetPlayer } from "@/lib/game/recruitmentTargetBridge";
import {
  chairmanRecruitmentEstimate,
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
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";

export function ScoutingReports({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const assignments = [...(state.football?.scouting?.assignments ?? [])].sort((a, b) => {
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
    update((s) =>
      freeAgent
        ? submitTransferOffer(s, playerId, 0, "First Team", weeklyWage).state
        : submitTransferEnquiry(s, playerId, "First Team", weeklyWage).state,
    );

  return (
    <DetailScreen
      title="Scouting reports"
      subtitle={`${assignments.filter((a) => a.status === "active").length} active · ${assignments.filter((a) => a.status === "complete").length} complete`}
      actions={
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" /> Back
        </Button>
      }
      className="touch-pan-y grid gap-1.5 xl:grid-cols-2 xl:items-start"
    >
      {assignments.length === 0 && (
        <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          No scouting assignments yet. Use Find Players and press Scout on anyone you want the recruitment team to track.
        </div>
      )}

      {assignments.map((assignment) => {
        const player = transferTargetPlayer(state, assignment.playerId);
        if (!player) return null;
        const report = scoutingReport(state, player);
        const interest = playerInterestAssessment(state, player);
        const watched = isChairmanShortlisted(state, player.id);
        const freeAgent = player.currentClubId === null;
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
          <TacticalPlayerCard
            key={player.id}
            state={state}
            player={player}
            mode="recruitment"
            actions={
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/60">
                  <span>Interest <strong className="text-white/85">{interest.label}</strong></span>
                  <span>{report.complete ? "Full report" : `Scouting · ${report.knowledgePct}%`}</span>
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
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant={watched ? "default" : "outline"}
                    className="h-8 px-2 text-[10px]"
                    onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}
                  >
                    <Star className={cn("mr-1 size-3", watched && "fill-current")} />
                    {watched ? "Shortlisted" : "Shortlist"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-2 text-[10px]"
                    onClick={() => approach(player.id, freeAgent, estimate.openingWeeklyWage)}
                  >
                    <Handshake className="mr-1 size-3" />
                    {freeAgent ? "Approach player" : "Approach club"}
                  </Button>
                </div>
              </div>
            }
          />
        );
      })}
    </DetailScreen>
  );
}
