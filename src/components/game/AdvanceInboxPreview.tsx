import { AlertTriangle, ChevronRight, Inbox, Mail, Pause, X } from "lucide-react";
import type { InboxItem } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requiresInboxDecision } from "@/lib/game/inbox";

export function AdvanceInboxPreview({
  items,
  isContinuing,
  reason,
  onStop,
  onClose,
  onOpenInbox,
}: {
  items: InboxItem[];
  isContinuing: boolean;
  reason: string | null;
  onStop: () => void;
  onClose: () => void;
  onOpenInbox: () => void;
}) {
  const interrupted = !isContinuing && !!reason;

  return (
    <div className="fixed inset-0 z-40 bg-black/45 px-3 pb-20 pt-20 backdrop-blur-[2px] md:px-6 md:pb-24">
      <section className="mx-auto flex h-full max-h-[34rem] w-full max-w-xl flex-col overflow-hidden rounded-3xl border bg-card shadow-2xl">
        <header className={cn("shrink-0 border-b px-4 py-3", interrupted ? "bg-amber-500/10" : "bg-primary/5")}>
          <div className="flex items-start gap-3">
            <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", interrupted ? "bg-amber-500/15 text-amber-700" : "bg-primary/10 text-primary")}>
              {interrupted ? <AlertTriangle className="size-5" /> : <Inbox className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl">{interrupted ? "Time stopped" : "Time is moving"}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {interrupted ? reason : "New club updates will appear here as the days pass."}
              </p>
            </div>
            {!isContinuing && <button onClick={onClose} aria-label="Close preview" className="grid size-9 place-items-center rounded-xl hover:bg-muted"><X className="size-5" /></button>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {items.length === 0 ? (
            <div className="grid h-full min-h-36 place-items-center text-center">
              <div><Mail className="mx-auto mb-2 size-7 text-muted-foreground" /><p className="text-sm font-semibold">Nothing new yet</p><p className="mt-1 text-xs text-muted-foreground">The calendar is advancing day by day.</p></div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const decision = requiresInboxDecision(item);
                return (
                  <button key={item.id} onClick={onOpenInbox} className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left", decision ? "border-amber-500/50 bg-amber-500/5" : "bg-background")}>
                    <span className={cn("size-2 shrink-0 rounded-full", decision ? "bg-amber-500" : "bg-primary")} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[10px] text-muted-foreground"><span>{item.department}</span>{decision && <span className="font-bold text-amber-600">Decision</span>}<span className="ml-auto">W{item.week}</span></span><span className="mt-0.5 block truncate text-sm font-semibold">{item.subject}</span></span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t bg-card p-3">
          {isContinuing ? (
            <Button variant="destructive" className="col-span-2 h-12" onClick={onStop}><Pause className="mr-2 size-5" /> Stop advancing</Button>
          ) : (
            <><Button variant="outline" className="h-12" onClick={onClose}>Close</Button><Button className="h-12" onClick={onOpenInbox}>Open inbox <ChevronRight className="ml-1 size-4" /></Button></>
          )}
        </footer>
      </section>
    </div>
  );
}
