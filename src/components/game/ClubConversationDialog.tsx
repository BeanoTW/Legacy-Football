import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, MessageCircle, UserRound } from "lucide-react";
import type { FootballPlayer, GameState, Staff } from "@/lib/game/types";
import { playerName, userSquad } from "@/lib/game/recruitment";
import { MANAGER_FORMATIONS } from "@/lib/game/managerFormationLayout";
import { playerConversationTopics, staffConversationTopics } from "@/lib/game/clubConversations";
import { activeManagerRecruitmentAssignment, delegateManagerRecruitmentPriorities, managerRecruitmentBrief } from "@/lib/game/managerRecruitmentBrief";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CharacterPortrait } from "./CharacterPortrait";

type Subject =
  | { kind: "staff"; staff: Staff }
  | { kind: "player"; player: FootballPlayer };

export function ClubConversationDialog({
  state,
  subject,
  open,
  onOpenChange,
  update,
}: {
  state: GameState;
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  update?: (fn: (state: GameState) => GameState) => void;
}) {
  const topics = useMemo(() => {
    if (!subject) return [];
    return subject.kind === "staff"
      ? staffConversationTopics(state, subject.staff)
      : playerConversationTopics(state, subject.player);
  }, [state, subject]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestPlayerId, setRequestPlayerId] = useState("");
  const [requestFeedback, setRequestFeedback] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setRequestFeedback("");
      return;
    }
    if (topics.length && !topics.some((topic) => topic.id === selectedId)) {
      setSelectedId(topics[0].id);
    }
  }, [open, selectedId, topics]);

  if (!subject) return null;
  const name = subject.kind === "staff" ? subject.staff.name : playerName(subject.player);
  const subtitle = subject.kind === "staff" ? subject.staff.role : "First-team player";
  const identity = subject.kind === "staff"
    ? { id: subject.staff.id, subject: subject.staff.role === "Manager" ? "manager" as const : "staff" as const }
    : { id: subject.player.id, subject: "player" as const };
  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0];
  const isManager = subject.kind === "staff" && subject.staff.role === "Manager";
  const squad = isManager ? userSquad(state).slice().sort((a, b) => b.currentAbility - a.currentAbility) : [];
  const currentFormation = isManager ? String(state.inboxFlags[`managerDirective:${subject.staff.id}:formation`] ?? "") : "";
  const priorityIds = String(state.inboxFlags["chairman.managerPriority.ids"] ?? "").split(",").filter(Boolean);
  const recruitmentBrief = isManager ? managerRecruitmentBrief(state, subject.staff) : null;
  const delegatedRecruitment = isManager ? activeManagerRecruitmentAssignment(state, subject.staff) : null;

  const requestFormation = (formation: string) => {
    if (!isManager || !update) return;
    update((current) => ({
      ...current,
      inboxFlags: {
        ...current.inboxFlags,
        [`managerDirective:${subject.staff.id}:formation`]: formation,
      },
    }));
    setRequestFeedback(`Understood. I'll prepare the side in ${formation} and see how the squad handles it.`);
  };

  const delegateRecruitment = () => {
    if (!isManager || !update || !recruitmentBrief?.priorities.length || delegatedRecruitment) return;
    update((current) => delegateManagerRecruitmentPriorities(current, subject.staff));
    setRequestFeedback(`I've passed my priorities to Recruitment. They'll run the search and bring us candidates; the final transfer decision stays with you.`);
  };

  const prioritisePlayer = () => {
    if (!isManager || !update || !requestPlayerId) return;
    const player = squad.find((candidate) => candidate.id === requestPlayerId);
    if (!player) return;
    const next = [player.id, ...priorityIds.filter((id) => id !== player.id)].slice(0, 3);
    update((current) => ({
      ...current,
      inboxFlags: { ...current.inboxFlags, "chairman.managerPriority.ids": next.join(",") },
    }));
    setRequestFeedback(`I'll give ${playerName(player)} extra consideration when I pick the side, as long as he is fit and can do the job in the shape.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <CharacterPortrait identity={identity} size={48} title={name} />
            <div className="min-w-0 text-left">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Private conversation</div>
              <DialogTitle className="truncate font-display text-2xl">{name}</DialogTitle>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>
        </DialogHeader>

          {isManager && update && (
            <div className="rounded-2xl border bg-muted/15 p-3">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Your requests</div>
              <div className="mb-2 text-xs font-semibold">Try a formation</div>
              <div className="flex flex-wrap gap-1.5">
                {MANAGER_FORMATIONS.map((formation) => (
                  <Button
                    key={formation}
                    type="button"
                    size="sm"
                    variant={currentFormation === formation ? "default" : "outline"}
                    className="h-8"
                    onClick={() => requestFormation(formation)}
                  >
                    {formation}
                  </Button>
                ))}
              </div>
              <div className="mt-3 text-xs font-semibold">Prioritise a player</div>
              <div className="mt-1.5 flex gap-2">
                <select
                  value={requestPlayerId}
                  onChange={(event) => setRequestPlayerId(event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">Choose player…</option>
                  {squad.map((player) => <option key={player.id} value={player.id}>{playerName(player)} · {player.currentAbility} OVR</option>)}
                </select>
                <Button type="button" size="sm" className="h-9" disabled={!requestPlayerId} onClick={prioritisePlayer}>Ask manager</Button>
              </div>
              {priorityIds.length > 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Current priorities: {priorityIds.map((id) => squad.find((player) => player.id === id)).filter(Boolean).map((player) => playerName(player!)).join(", ")}
                </div>
              )}
              {recruitmentBrief && recruitmentBrief.priorities.length > 0 && (
                <div className="mt-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <BriefcaseBusiness className="size-4 text-violet-400" />
                    Manager's recruitment priorities
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {recruitmentBrief.priorities.map((priority) => `${priority.headline} (${priority.playerLevel === "backup" ? "depth" : priority.playerLevel})`).join(" · ")}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-8 w-full border-violet-500/30"
                    disabled={Boolean(delegatedRecruitment)} onClick={delegateRecruitment}>
                    {delegatedRecruitment ? "Recruitment are working on it" : "Send priorities to Recruitment"}
                  </Button>
                  <div className="mt-1.5 text-[10px] text-muted-foreground">Recruitment will search and assess candidates. You keep final control of transfers and contracts.</div>
                </div>
              )}
              {requestFeedback && <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 text-xs leading-relaxed">{requestFeedback}</div>}
            </div>
          )}

        <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-1.5">
            {topics.map((topic) => (
              <Button
                key={topic.id}
                type="button"
                variant="ghost"
                onClick={() => setSelectedId(topic.id)}
                className={cn(
                  "h-auto w-full justify-start whitespace-normal rounded-xl border px-3 py-2.5 text-left text-xs leading-snug",
                  selected?.id === topic.id ? "border-primary/40 bg-primary/[0.08]" : "bg-card",
                )}
              >
                <MessageCircle className="mr-2 size-4 shrink-0" />
                {topic.label}
              </Button>
            ))}
          </div>

          <div className={cn(
            "min-h-40 rounded-2xl border p-4",
            selected?.tone === "warning"
              ? "border-amber-500/30 bg-amber-500/[0.06]"
              : selected?.tone === "positive"
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : "bg-muted/25",
          )}>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <UserRound className="size-3.5" /> {name}
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {selected?.answer ?? "Nothing pressing to discuss right now."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
