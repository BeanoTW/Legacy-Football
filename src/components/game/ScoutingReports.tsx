import { ArrowLeft, Binoculars, CheckCircle2, Handshake, Star } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import {
  ageOf,
  playerInterestAssessment,
  playerName,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import { scoutingReport } from "@/lib/game/scouting";
import { transferTargetPlayer } from "@/lib/game/recruitmentTargetBridge";
import {
  chairmanRecruitmentEstimate,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import { fmtMoney } from "@/lib/game/engine";
import { clubDisplayName } from "@/lib/game/clubReference";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailScreen } from "./shared/layout";
import { POSITION_BADGE_CLASS } from "./playerPosition";

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

  const approach = (playerId: string, fee: number, weeklyWage: number) =>
    update((s) => submitTransferOffer(s, playerId, fee, "First Team", weeklyWage).state);

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
        if (!estimate) return null;

        return (
          <article key={player.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-display text-base">{playerName(player)}</span>
                  <span className={cn("rounded border px-1 py-0.5 text-[9px] font-bold", POSITION_BADGE_CLASS[player.primaryPosition])}>
                    {player.primaryPosition}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ageOf(player, state.season)}y · {player.currentClubId ? clubDisplayName(state, player.currentClubId) : "Free agent"} · {interest.label}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display text-base">{report.knowledgePct}%</div>
                <div className="flex items-center justify-end gap-1 text-[8px] text-muted-foreground">
                  {report.complete ? <CheckCircle2 className="size-3" /> : <Binoculars className="size-3" />}
                  {report.complete ? "Full report" : "Scouting"}
                </div>
              </div>
            </div>

            <div className="mt-1.5 grid grid-cols-5 gap-1">
              {report.attributes.map((attribute) => (
                <div key={attribute.key} className="rounded bg-muted/50 px-1 py-0.5">
                  <div className="truncate text-[8px] text-muted-foreground">{attribute.label}</div>
                  <div className="text-[10px] font-semibold tabular-nums">
                    {!attribute.known ? "?" : attribute.exact !== undefined ? attribute.exact : `${attribute.min}–${attribute.max}`}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-[10px]">
              <span>Value <strong>{report.valueRange ? `${fmtMoney(report.valueRange[0])}–${fmtMoney(report.valueRange[1])}` : "?"}</strong></span>
              <span>Wage <strong>{report.wageRange ? `${fmtMoney(report.wageRange[0])}–${fmtMoney(report.wageRange[1])}/wk` : "?"}</strong></span>
            </div>

            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button
                size="sm"
                variant={watched ? "default" : "outline"}
                className="h-7 px-2 text-[10px]"
                onClick={() => update((s) => toggleChairmanShortlist(s, player.id))}
              >
                <Star className={cn("mr-1 size-3", watched && "fill-current")} />
                {watched ? "Shortlisted" : "Shortlist"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-[10px]"
                onClick={() =>
                  approach(player.id, estimate.openingFee, estimate.openingWeeklyWage)
                }
              >
                <Handshake className="mr-1 size-3" />
                {freeAgent ? "Approach player" : "Approach club"}
              </Button>
            </div>
          </article>
        );
      })}
    </DetailScreen>
  );
}
