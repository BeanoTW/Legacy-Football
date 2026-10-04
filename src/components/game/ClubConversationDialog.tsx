import { useEffect, useMemo, useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import type { FootballPlayer, GameState, Staff } from "@/lib/game/types";
import { playerName } from "@/lib/game/recruitment";
import { playerConversationTopics, staffConversationTopics } from "@/lib/game/clubConversations";
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
}: {
  state: GameState;
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const topics = useMemo(() => {
    if (!subject) return [];
    return subject.kind === "staff"
      ? staffConversationTopics(state, subject.staff)
      : playerConversationTopics(state, subject.player);
  }, [state, subject]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
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
