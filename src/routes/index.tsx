import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Menu, Star, Ticket, Users, Wallet } from "lucide-react";

import { BoardTab } from "@/components/BoardTab";
import { CommercialTab } from "@/components/CommercialTab";
import { ALL_TABS, DESKTOP_PRIMARY_TAB_IDS, type Tab } from "@/components/game/tabs";
import { MobileNav } from "@/components/game/MobileNav";
import { MobileContinueBar } from "@/components/game/MobileContinueBar";
import { AdvanceOverlay } from "@/components/game/AdvanceOverlay";
import { NewGame } from "@/components/game/NewGame";
import { Kpi, TopBar } from "@/components/game/shared/primitives";
import { ScreenBoundary } from "@/components/game/shared/ScreenBoundary";
import { DashboardTab } from "@/components/game/DashboardTab";
import { CashFlowTab } from "@/components/game/CashFlowTab";
import { TicketsTab } from "@/components/game/TicketsTab";
import { FixturesTab } from "@/components/game/FixturesTab";
import { HistoryTab } from "@/components/game/HistoryTab";
import { StaffTab } from "@/components/game/StaffTab";
import { AcademyTab } from "@/components/game/AcademyTab";
import { ClubHub } from "@/components/game/ClubHub";
import { MatchDayOverlay } from "@/components/game/MatchDayOverlay";
import { ChairmansOffice } from "@/components/game/ChairmansOffice";
import { WorldInspector } from "@/components/game/WorldInspector";
import { RecruitmentFlow } from "@/components/game/RecruitmentFlow";
import { SquadSelectionTab } from "@/components/game/SquadSelectionTab";
import { FacilitiesFlow } from "@/components/game/FacilitiesFlow";
import { SettingsTab } from "@/components/game/SettingsTab";
import { ClubBadge } from "@/components/game/ClubKitArt";
import { useGame, type ContinueSpeed } from "@/hooks/useGame";
import type { GameState } from "@/lib/game/types";
import type { SaveSlotId, SaveSlotSummary } from "@/lib/game/engine";
import { avgTicketPrice, calendarDay, fmtMoney, fmtMoneyExact, isTransferWindowOpen, phaseOf, CALENDAR, WINDOW_PRESEASON_END } from "@/lib/game/engine";
import { chairmanStyle, clubNickname } from "@/lib/game/character";
import { clubKitFor } from "@/lib/game/clubKit";
import { clubKpi } from "@/lib/game/selectors/club";
import { clubReputation } from "@/lib/game/reputation";
import { unreadCount } from "@/lib/game/inbox";
import { actionableInbox } from "@/lib/game/attention";
import type { InboxDestination } from "@/lib/game/inboxNavigation";
import { advanceTargets, type AdvanceTarget } from "@/lib/game/advancePlanner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PlayerProfileSheet } from "@/components/game/shared/PlayerProfileSheet";
import { CharacterPortrait, PortraitKitProvider } from "@/components/game/CharacterPortrait";
import { ChairmanStudio, useChairmanProfile } from "@/components/game/ChairmanStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Legacy Football — Chairman Simulation" },
      { name: "description", content: "Build a football club legacy from non-league to the top: shape the squad, finances, facilities, staff and long-term direction." },
      { property: "og:title", content: "Legacy Football — Chairman Simulation" },
      { property: "og:description", content: "A persistent football chairman simulation where every season, decision and promotion becomes part of the club’s history." },
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
  return (
    <>
      {game.state ? (
        <Game {...game} state={game.state} />
      ) : (
        <NewGame onStart={game.start} activeSlot={game.activeSlot} slots={game.saveSlots} onSelectSlot={game.switchSlot} />
      )}
      {game.saveError && (
        <div role="alert" className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[100] mx-auto max-w-xl rounded-xl border border-rose-400 bg-rose-950 p-3 text-sm font-semibold text-rose-50 shadow-xl">
          {game.saveError} Do not delete the slot or clear browser data until this is resolved.
        </div>
      )}
      {game.cloudError && (
        <div role="status" className={cn("fixed inset-x-3 z-[99] mx-auto max-w-xl rounded-xl border border-amber-500 bg-amber-950 p-3 text-sm font-semibold text-amber-50 shadow-xl", game.saveError ? "bottom-[calc(10rem+env(safe-area-inset-bottom))]" : "bottom-[calc(5.25rem+env(safe-area-inset-bottom))]")}> 
          {game.cloudError} Your local career is saved on this device; use Settings to retry sync.
        </div>
      )}
    </>
  );
}

/** Five-star reputation read-out: one star per 20 reputation points. */
function ReputationStars({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value / 20)));
  return (
    <span className="lf-rep-stars" aria-label={`${filled} of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={cn("lf-rep-star", index < filled && "is-filled")} aria-hidden="true" />
      ))}
    </span>
  );
}

function transferWindowMasthead(state: GameState): string {
  const day = calendarDay(state);
  if (isTransferWindowOpen(state)) {
    const closingWeek = state.week <= WINDOW_PRESEASON_END ? WINDOW_PRESEASON_END : CALENDAR.midSeasonEnd;
    const daysLeft = Math.max(0, (closingWeek - state.week) * 7 + (6 - day) + 1);
    return daysLeft <= 1 ? "TRANSFER WINDOW OPEN · closes today" : `TRANSFER WINDOW OPEN · closes in ${daysLeft} days`;
  }

  const nextOpenWeek = state.week < CALENDAR.midSeasonStart ? CALENDAR.midSeasonStart : CALENDAR.seasonEnd + 1;
  const daysUntilOpen =
    nextOpenWeek <= CALENDAR.seasonEnd
      ? Math.max(1, (nextOpenWeek - state.week) * 7 - day)
      : Math.max(1, (CALENDAR.seasonEnd - state.week + 1) * 7 - day);

  return `Transfer window closed · reopens in ${daysUntilOpen} days`;
}

function Game({ state, update, isContinuing, continueReason, continueTarget, continueSpeed, setContinueSpeed, startContinue, stopContinue, activeSlot, saveSlots, switchSlot, deleteSlot }: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  reset: () => void;
  isContinuing: boolean;
  continueReason: string | null;
  continueTarget: AdvanceTarget | null;
  continueSpeed: ContinueSpeed;
  setContinueSpeed: (speed: ContinueSpeed) => void;
  startContinue: (target?: AdvanceTarget | null) => void;
  stopContinue: () => void;
  activeSlot: SaveSlotId;
  saveSlots: SaveSlotSummary[];
  switchSlot: (slot: SaveSlotId) => void;
  deleteSlot: (slot: SaveSlotId) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("hub");
  const [chairmanStudioOpen, setChairmanStudioOpen] = useState(false);
  const chairmanProfile = useChairmanProfile();
  const [decisionQueue, setDecisionQueue] = useState(false);
  const [recruitmentDestination, setRecruitmentDestination] = useState<Extract<InboxDestination, { tab: "recruitment" }> | null>(null);
  const [recruitmentNavigationKey, setRecruitmentNavigationKey] = useState(0);
  const [showAdvancePreview, setShowAdvancePreview] = useState(false);
  const [advanceStart, setAdvanceStart] = useState<GameState | null>(null);
  const [lastTarget, setLastTarget] = useState<AdvanceTarget | null>(null);
  const kpi = useMemo(() => ({ ...clubKpi(state), avgTicket: avgTicketPrice(state) }), [state]);
  const targets = useMemo(() => advanceTargets(state), [state]);
  const desktopPrimary = ALL_TABS.filter(([id]) => DESKTOP_PRIMARY_TAB_IDS.includes(id));
  const desktopMore = ALL_TABS.filter(([id]) => !DESKTOP_PRIMARY_TAB_IDS.includes(id));
  const blockingDecisions = actionableInbox(state);
  const phaseLabel = ({ preseason: "Pre-season", firstHalf: "League — 1st half", midseason: "Mid-season break", secondHalf: "League — 2nd half" } as const)[phaseOf(state.week)];
  const transferWindow = transferWindowMasthead(state);
  const transferWindowOpen = isTransferWindowOpen(state);
  const chairman = chairmanStyle(state);
  const userReputation = clubReputation(state, state.clubName);
  const crestDesign = clubKitFor(state).badge;

  useEffect(() => {
    if (blockingDecisions.length === 0 || (!isContinuing && !continueReason)) return;
    stopContinue();
    setShowAdvancePreview(false);
    setDecisionQueue(true);
    setTab("inbox");
  }, [blockingDecisions.length, continueReason, isContinuing, stopContinue]);

  const navigateFromInbox = (destination: InboxDestination) => {
    setDecisionQueue(false);
    if (destination.tab === "recruitment") {
      setRecruitmentDestination(destination);
      setRecruitmentNavigationKey((key) => key + 1);
    } else {
      setRecruitmentDestination(null);
    }
    setTab(destination.tab);
  };

  const requestContinue = (target?: AdvanceTarget | null) => {
    if (blockingDecisions.length > 0) {
      stopContinue();
      setDecisionQueue(true);
      setTab("inbox");
      return;
    }
    setAdvanceStart(state);
    setLastTarget(target ?? null);
    setShowAdvancePreview(true);
    startContinue(target);
  };

  return (
    <PortraitKitProvider state={state}>
      <div className="game-shell">
      <PlayerProfileSheet state={state} update={update} />
      <ChairmanStudio open={chairmanStudioOpen} onOpenChange={setChairmanStudioOpen} showName={false} />
      <div className="lf-masthead shrink-0">
        <TopBar
          title={state.clubName}
          subtitle={clubNickname(state)}
          detail={`Season ${state.season} · Week ${state.week}/${CALENDAR.seasonEnd} · ${phaseLabel} · ${transferWindow}`}
          crest={<ClubBadge design={crestDesign} clubName={state.clubName} size={56} />}
          right={
            <div className="lf-masthead-persona">
              <button type="button" className="lf-masthead-avatar" title="Edit chairman appearance"
                aria-label="Edit chairman appearance" onClick={() => setChairmanStudioOpen(true)}>
                <CharacterPortrait avatar={chairmanProfile.avatar} size={86} title={`${state.managerName} portrait`} />
              </button>
              <div className="lf-chairman-badge" title={chairman.detail}>
                <span>{chairman.label}</span>
                <strong>{Math.round(userReputation)}</strong>
                <small>Reputation</small>
                <ReputationStars value={userReputation} />
              </div>
            </div>
          }
        />
      </div>

      <div className="lf-kpi-ribbon shrink-0 border-b bg-panel text-panel-foreground hidden xl:block">
        <div className="mx-auto max-w-[1600px] px-5 py-1.5 grid grid-cols-4 gap-2 tnum">
          <Kpi icon={<Wallet className="size-4" />} label="Bank balance" value={fmtMoneyExact(kpi.cash)} tone={kpi.cash >= 0 ? "good" : "bad"} info="Cash in the club's bank account." />
          <Kpi icon={<CircleDollarSign className="size-4" />} label="Weekly net" value={fmtMoney(kpi.weeklyNetRecurring)} tone={kpi.weeklyNetRecurring >= 0 ? "good" : "bad"} info="Recurring income minus fixed weekly outgoings." />
          <Kpi icon={<Users className="size-4" />} label="Squad rating" value={kpi.rating.toFixed(1)} info="Average rating of your top 16 players." />
          <Kpi icon={<Ticket className="size-4" />} label="Avg ticket" value={`£${kpi.avgTicket.toFixed(2)}`} info="Capacity-weighted average ticket price." />
        </div>
      </div>

      <nav className="lf-primary-nav shrink-0 border-b bg-card hidden md:block">
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
            {tab === "inbox" && <ChairmansOffice state={state} update={update} decisionQueue={decisionQueue} onDecisionQueueCleared={() => { setDecisionQueue(false); setTab("hub"); }} onNavigate={navigateFromInbox} />}
            {tab === "hub" && <ClubHub state={state} update={update} setTab={setTab} isContinuing={isContinuing} onAdvanceTo={requestContinue} />}
            {tab === "squad" && <SquadSelectionTab state={state} update={update} />}
            {tab === "dashboard" && <DashboardTab state={state} />}
            {tab === "cashflow" && <CashFlowTab state={state} />}
            {tab === "tickets" && <TicketsTab state={state} update={update} />}
            {tab === "recruitment" && <RecruitmentFlow key={recruitmentNavigationKey} state={state} update={update} destination={recruitmentDestination} />}
            {tab === "staff" && <StaffTab state={state} update={update} />}
            {tab === "academy" && <AcademyTab state={state} update={update} />}
            {tab === "stadium" && <FacilitiesFlow state={state} update={update} />}
            {tab === "fixtures" && <FixturesTab state={state} update={update} />}
            {tab === "board" && <BoardTab state={state} />}
            {tab === "commercial" && <CommercialTab state={state} update={update} />}
            {tab === "world" && <WorldInspector state={state} update={update} />}
            {tab === "history" && <HistoryTab state={state} />}
            {tab === "settings" && <SettingsTab state={state} update={update} activeSlot={activeSlot} slots={saveSlots} onSwitch={switchSlot} onDelete={deleteSlot} />}
          </ScreenBoundary>
        </div>
      </main>

      <MobileContinueBar
        isContinuing={isContinuing}
        startContinue={() => requestContinue()}
        stopContinue={stopContinue}
        label={`W${state.week} · ${phaseLabel} · Window ${transferWindowOpen ? "open" : "closed"}`}
        targets={targets}
        onAdvanceTo={requestContinue}
        onHome={() => { setDecisionQueue(false); setTab("hub"); }}
        homeActive={tab === "hub"}
        menuControl={<MobileNav tab={tab} setTab={(next) => { setDecisionQueue(false); setTab(next); }} unread={unreadCount(state)} blocking={blockingDecisions.length} />}
      />
      {showAdvancePreview && (
        <AdvanceOverlay
          state={state}
          startState={advanceStart}
          isContinuing={isContinuing}
          reason={continueReason}
          target={continueTarget ?? lastTarget}
          speed={continueSpeed}
          onSpeed={setContinueSpeed}
          onStop={stopContinue}
          onContinue={() => requestContinue()}
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
    </PortraitKitProvider>
  );
}
