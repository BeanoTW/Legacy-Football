import { useEffect, useMemo, useState } from "react";
import { Inbox as InboxIcon, Newspaper, Pencil } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { unreadCount, requiresInboxDecision } from "@/lib/game/inbox";
import { newsFeed } from "@/lib/game/newsFeed";
import type { InboxDestination } from "@/lib/game/inboxNavigation";
import { cn } from "@/lib/utils";
import { InboxTab } from "./InboxTab";
import { NewsFeed } from "./NewsFeed";
import { CharacterPortrait } from "./CharacterPortrait";
import { ChairmanStudio, useChairmanProfile } from "./ChairmanStudio";

type OfficeView = "desk" | "news";

export function ChairmansOffice({
  state,
  update,
  decisionQueue = false,
  onDecisionQueueCleared,
  onNavigate,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  decisionQueue?: boolean;
  onDecisionQueueCleared?: () => void;
  onNavigate?: (destination: InboxDestination) => void;
}) {
  const [view, setView] = useState<OfficeView>("desk");
  const [studioOpen, setStudioOpen] = useState(false);
  const profile = useChairmanProfile();
  const waiting = useMemo(
    () => state.inbox.filter(requiresInboxDecision).length,
    [state.inbox],
  );
  const unread = unreadCount(state);
  const freshNews = useMemo(
    () =>
      newsFeed(state, 40).filter(
        (article) =>
          article.season === state.season &&
          article.week >= Math.max(1, state.week - 1),
      ).length,
    [state],
  );

  useEffect(() => {
    if (decisionQueue) setView("desk");
  }, [decisionQueue]);

  const summary =
    waiting > 0
      ? `${waiting} decision${waiting === 1 ? "" : "s"} waiting${unread ? ` · ${unread} unread` : ""}`
      : unread > 0
        ? `${unread} unread briefing${unread === 1 ? "" : "s"}`
        : "Your desk is clear.";

  return (
    <div className="lf-office">
      <header className="lf-office-header">
        <button
          type="button"
          className="lf-office-portrait"
          onClick={() => setStudioOpen(true)}
          aria-label="Edit director appearance"
        >
          <CharacterPortrait avatar={profile.avatar} size={60} />
          <span className="lf-office-edit"><Pencil /></span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="lf-office-kicker">Director's office</p>
          <h1>{state.managerName}</h1>
          <p>{summary}</p>
        </div>
        {decisionQueue && waiting > 0 && (
          <span className="lf-inbox-blocking">{waiting} blocking</span>
        )}
      </header>

      <div className="lf-office-switch" role="tablist" aria-label="Director's office">
        <button
          type="button"
          role="tab"
          aria-selected={view === "desk"}
          className={cn(view === "desk" && "is-active")}
          onClick={() => setView("desk")}
        >
          <InboxIcon /> Desk
          {waiting + unread > 0 && <b>{waiting + unread}</b>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "news"}
          className={cn(view === "news" && "is-active")}
          onClick={() => !decisionQueue && setView("news")}
          disabled={decisionQueue}
        >
          <Newspaper /> Newsroom
          {freshNews > 0 && <b>{freshNews}</b>}
        </button>
      </div>

      {view === "desk" ? (
        <div className="lf-office-desk">
          <InboxTab
            state={state}
            update={update}
            decisionQueue={decisionQueue}
            onDecisionQueueCleared={onDecisionQueueCleared}
            onNavigate={onNavigate}
          />
        </div>
      ) : (
        <NewsFeed state={state} />
      )}

      <ChairmanStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        showName={false}
      />
    </div>
  );
}
