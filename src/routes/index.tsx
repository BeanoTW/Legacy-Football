import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Menu, Ticket, Users, Wallet } from "lucide-react";

import { LeagueBrowser } from "@/components/LeagueBrowser";
import { BoardTab } from "@/components/BoardTab";
import { CommercialTab } from "@/components/CommercialTab";
import { ALL_TABS, DESKTOP_PRIMARY_TAB_IDS, type Tab } from "@/components/game/tabs";
import { MobileNav } from "@/components/game/MobileNav";
import { MobileContinueBar } from "@/components/game/MobileContinueBar";
import { ContinueCalendar } from "@/components/game/ContinueCalendar";
import { AdvanceInboxPreview } from "@/components/game/AdvanceInboxPreview";
import { NewGame } from "@/components/game/NewGame";
import { Kpi, TopBar } from "@/components/game/shared/primitives";
import { ScreenBoundary } from "@/components/game/shared/ScreenBoundary";
import { DashboardTab } from "@/components/game/DashboardTab";
import { CashFlowTab } from "@/components/game/CashFlowTab";
import { TicketsTab } from "@/components/game/TicketsTab";
import { FixturesTab } from "@/components/game/FixturesTab";
import { HistoryTab } from "@/components/game/HistoryTab";
import { StaffTab } from "@/components/game/StaffTab";
import { ClubHub } from "@/components/game/ClubHub";
import { MatchDayOverlay } from "@/components/game/MatchDayOverlay";
import { InboxTab } from "@/components/game/InboxTab";
import { WorldInspector } from "@/components/game/WorldInspector";
import { RecruitmentFlow } from "@/components/game/RecruitmentFlow";
import { SquadSelectionTab } from "@/components/game/SquadSelectionTab";
import { FacilitiesFlow } from "@/components/game/FacilitiesFlow";
import { SettingsTab } from "@/components/game/SettingsTab";
import { useGame } from "@/hooks/useGame";
import type { GameState } from "@/lib/game/types";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { avgTicketPrice, fmtMoney, fmtMoneyExact, phaseOf, CALENDAR } from "@/lib/game/engine";
import { clubKpi } from "@/lib/game/selectors/club";
import { unreadCount } from "@/lib/game/inbox";
import { actionableInbox } from "@/lib/game/attention";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chairman FC — Football Finance Sim" },
      { name: "description", content: "Run the books of a football club: set ticket prices, manage wages, upgrade facilities and watch every pound flow through the season." },
      { property: "og:title", content: "Chairman FC — Football Finance Sim" },
      { property: "og:description", content: "A finance-first football chairman game. Cash flow, P&L, ticket demand — every decision hits the books." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const game = useGame();
  useEffect(() => {
    const theme = localStorage.getItem("chairman.colour-theme");
    if (theme) document.documentElement.dataset.clubTheme = theme;
  }, []);
  if (!game.hydrated) return <div className="h-dvh grid place-items-center text-muted-foreground">Loading…</div>;
  if (!game.state) return <NewGame onStart={game.start} activeSlot={game.activeSlot} slots={game.saveSlots} onSelectSlot={game.switchSlot} />;
  return <Game {...game} state={game.state} />;
}

function Game({ state, update, isContinuing, continueReason, startContinue, stopContinue, activeSlot, saveSlots, switchSlot, deleteSlot }: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  reset: () => void;
  isContinuing: boolean;
  continueReason: string | null;
  startContinue: () => void;
  stopContinue: () => void;
  activeSlot: SaveSlotId;
  saveSlots: SaveSlotSummary[];
  switchSlot: (slot: SaveSlotId) => void;
  deleteSlot: (slot: SaveSlotId) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("hub");
  const [decisionQueue, setDecisionQueue] = useState(false);
  const [showAdvancePreview, setShowAdvancePreview] = useState(false);
  const [continueBaselineIds, setContinueBaselineIds] = useState<string[]>([]);
  const kpi = useMemo(() => ({ ...clubKpi(state), avgTicket: avgTicketPrice(state) }), [state]);
  const desktopPrimary = ALL_TABS.filter(([id]) => DESKTOP_PRIMARY_TAB_IDS.includes(id));
  const desktopMore = ALL_TABS.filter(([id]) => !DESKTOP_PRIMARY_TAB_IDS.includes(id));
  const blockingDecisions = actionableInbox(state);
  const advanceItems = useMemo(() => {
    const baseline = new Set(continueBaselineIds);
    return state.inbox
      .filter((item) => !baseline.has(item.id))
      .slice()
      .sort((a, b) => b.season - a.season || b.week - a.week || b.id.localeCompare(a.id));
  }, [continueBaselineIds, state.inbox]);
  const phaseLabel = ({ preseason: "Pre-season", firstHalf: "League — 1st half", midseason: "Mid-season break", secondHalf: "League — 2nd half" } as const)[phaseOf(state.week)];

  useEffect(() => {
    if (blockingDecisions.length === 0 || (!isContinuing && !continueReason)) return;
    stopContinue();
    setShowAdvancePreview(false);
    setDecisionQueue(true);
    setTab("inbox");
  }, [blockingDecisions.length, continueReason, isContinuing, stopContinue]);

  const requestContinue = () => {
    if (blockingDecisions.length > 0) {
      stopContinue();
      setDecisionQueue(true);
      setTab("inbox");
      return;
    }
    setContinueBaselineIds(state.inbox.map((item) => item.id));
    setShowAdvancePreview(true);
    startContinue();
  };

  return (
    <div className="game-shell">
      <div className="shrink-0">
        <TopBar title={state.clubName} subtitle={`Season ${state.season} · Week ${state.week}/${CALENDAR.seasonEnd} · ${phaseLabel}`} />
      </div>

      <MobileNav tab={tab} setTab={(next) => { setDecisionQueue(false); setTab(next); }} unread={unreadCount(state)} />
      <ContinueCalendar state={state} isContinuing={isContinuing} />

      <div className="shrink-0 border-b bg-panel text-panel-foreground hidden xl:block">
        <div className="mx-auto max-w-[1600px] px-5 py-1.5 grid grid-cols-4 gap-2 tnum">
          <Kpi icon={<Wallet className="size-4" />} label="Bank balance" value={fmtMoneyExact(kpi.cash)} tone={kpi.cash >= 0 ? "good" : "bad"} info="Cash in the club's bank account." />
          <Kpi icon={<CircleDollarSign className="size-4" />} label="Weekly net" value={fmtMoney(kpi.weeklyNetRecurring)} tone={kpi.weeklyNetRecurring >= 0 ? "good" : "bad"} info="Recurring income minus fixed weekly outgoings." />
          <Kpi icon={<Users className="size-4" />} label="Squad rating" value={kpi.rating.toFixed(1)} info="Average rating of your top 16 players." />
          <Kpi icon={<Ticket className="size-4" />} label="Avg ticket" value={`£${kpi.avgTicket.toFixed(2)}`} info="Capacity-weighted average ticket price." />
        </div>
      </div>

      <nav className="shrink-0 border-b bg-card hidden md:block">
        <div className="mx-auto max-w-[1600px] px-3 xl:px-5 py-1.5 flex items-center gap-2">
          <div className="grid grid-cols-6 gap-2 flex-1">
            {desktopPrimary.map(([id, label, Icon]) => (
              <button key={id} onClick={() => { setDecisionQueue(false); setTab(id); }} className={cn("relative min-h-11 rounded-lg border px-3 py-1 flex items-center gap-2 transition-colors", tab === id ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card hover:bg-muted border-border")}>
                <Icon className="size-4 shrink-0" />
                <span className="truncate text-xs font-semibold lg:text-sm">{label}</span>
                {id === "inbox" && unreadCount(state) > 0 && <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-5 text-center font-semibold">{unreadCount(state) > 99 ? "99+" : unreadCount(state)}</span>}
              </button>
            ))}
          </div>
          <Sheet>
            <SheetTrigger asChild><Button variant="outline" className="h-11 px-4 gap-2"><Menu className="size-4" /><span className="text-xs">More</span></Button></SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px]">
              <SheetHeader><SheetTitle>More club areas</SheetTitle></SheetHeader>
              <div className="grid grid-cols-2 gap-3 mt-6">
                {desktopMore.map(([id, label, Icon]) => (
                  <SheetClose asChild key={id}><button onClick={() => { setDecisionQueue(false); setTab(id); }} className={cn("min-h-20 rounded-xl border p-3 flex flex-col items-start justify-between text-left font-semibold transition-colors", tab === id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}><Icon className="size-5" />{label}</button></SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <main className="game-main">
        <div className="game-screen">
          <ScreenBoundary name={ALL_TABS.find(([id]) => id === tab)?.[1] ?? tab}>
            {tab === "inbox" && <InboxTab state={state} update={update} decisionQueue={decisionQueue} onDecisionQueueCleared={() => { setDecisionQueue(false); setTab("hub"); }} />}
            {tab === "hub" && <ClubHub state={state} update={update} setTab={setTab} />}
            {tab === "squad" && <SquadSelectionTab state={state} update={update} />}
            {tab === "dashboard" && <DashboardTab state={state} />}
            {tab === "cashflow" && <CashFlowTab state={state} />}
            {tab === "tickets" && <TicketsTab state={state} update={update} />}
            {tab === "recruitment" && <RecruitmentFlow state={state} update={update} />}
            {tab === "staff" && <StaffTab state={state} update={update} />}
            {tab === "stadium" && <FacilitiesFlow state={state} update={update} />}
            {tab === "fixtures" && <FixturesTab state={state} update={update} />}
            {tab === "board" && <BoardTab state={state} />}
            {tab === "commercial" && <CommercialTab state={state} update={update} />}
            {tab === "leagues" && <LeagueBrowser state={state} update={update} />}
            {tab === "world" && <WorldInspector state={state} />}
            {tab === "history" && <HistoryTab state={state} />}
            {tab === "settings" && <SettingsTab activeSlot={activeSlot} slots={saveSlots} onSwitch={switchSlot} onDelete={deleteSlot} />}
          </ScreenBoundary>
        </div>
      </main>

      <MobileContinueBar isContinuing={isContinuing} startContinue={requestContinue} stopContinue={stopContinue} label={`W${state.week} · ${phaseLabel}`} />
      {showAdvancePreview && (
        <AdvanceInboxPreview
          items={advanceItems}
          isContinuing={isContinuing}
          reason={continueReason}
          state={state}
          onStop={stopContinue}
          onClose={() => setShowAdvancePreview(false)}
          onOpenInbox={() => {
            stopContinue();
            setShowAdvancePreview(false);
            setDecisionQueue(blockingDecisions.length > 0);
            setTab("inbox");
          }}
          onOpenMatchday={() => {
            stopContinue();
            setShowAdvancePreview(false);
            setTab("hub");
          }}
        />
      )}
      {state.liveMatch && <MatchDayOverlay state={state} update={update} />}
    </div>
  );
}
