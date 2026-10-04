import { useMemo, useState } from "react";
import { Landmark, MessageCircle, UserRound } from "lucide-react";
import type { Director, GameState } from "@/lib/game/types";
import { boardConversationTopics, boardRequestResponse } from "@/lib/game/boardConversations";
import { useCharacterName } from "@/hooks/useCharacterName";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CharacterPortrait } from "./CharacterPortrait";

export function BoardConversationDialog({
  state,
  director,
  open,
  onOpenChange,
}: {
  state: GameState;
  director: Director | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const displayName = useCharacterName(director?.id ?? "board", director?.name ?? "Director");
  const topics = useMemo(() => director ? boardConversationTopics(state, director) : [], [state, director]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestAnswer, setRequestAnswer] = useState<{ accepted: boolean; answer: string } | null>(null);
  if (!director) return null;
  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0];

  const ask = (request: "budget" | "facilities" | "patience") => {
    setRequestAnswer(boardRequestResponse(state, director, request));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setSelectedId(null); setRequestAnswer(null); } onOpenChange(next); }}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 pr-8">
            <CharacterPortrait identity={{ id: director.id, subject: "board" }} size={48} title={displayName} />
            <div className="min-w-0 text-left">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Boardroom conversation</div>
              <DialogTitle className="truncate font-display text-2xl">{displayName}</DialogTitle>
              <div className="text-xs text-muted-foreground">{director.role} · {director.influence}% influence</div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-1.5">
          {topics.map((topic) => (
            <Button key={topic.id} type="button" variant="ghost" onClick={() => { setSelectedId(topic.id); setRequestAnswer(null); }}
              className={cn("h-auto w-full justify-start whitespace-normal rounded-xl border px-3 py-2.5 text-left text-xs leading-snug",
                selected?.id === topic.id && !requestAnswer ? "border-primary/40 bg-primary/[0.08]" : "bg-card")}>
              <MessageCircle className="mr-2 size-4 shrink-0" />{topic.label}
            </Button>
          ))}
        </div>

        <div className={cn("min-h-32 rounded-2xl border p-4",
          requestAnswer ? (requestAnswer.accepted ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]") :
          selected?.tone === "warning" ? "border-amber-500/30 bg-amber-500/[0.06]" :
          selected?.tone === "positive" ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "bg-muted/25")}>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            <UserRound className="size-3.5" /> {displayName}
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{requestAnswer?.answer ?? selected?.answer ?? "Nothing pressing to discuss."}</p>
        </div>

        {(director.role === "Chairman" || director.role === "Finance Director" || director.role === "Football Director") && (
          <div className="rounded-2xl border bg-muted/15 p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <Landmark className="size-3.5" /> Make a request
            </div>
            <div className="grid gap-1.5">
              {(director.role === "Chairman" || director.role === "Finance Director") && (
                <Button type="button" variant="outline" className="h-auto justify-start py-2 text-left text-xs" onClick={() => ask("budget")}>Ask for more football spending</Button>
              )}
              {(director.role === "Chairman" || director.role === "Finance Director") && (
                <Button type="button" variant="outline" className="h-auto justify-start py-2 text-left text-xs" onClick={() => ask("facilities")}>Ask for facilities backing</Button>
              )}
              {(director.role === "Chairman" || director.role === "Football Director") && (
                <Button type="button" variant="outline" className="h-auto justify-start py-2 text-left text-xs" onClick={() => ask("patience")}>Ask for more time on the football plan</Button>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">Board responses use live satisfaction, cash cover and director personality. Approval opens the door to a proposal; it does not create free money.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
