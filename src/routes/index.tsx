import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CircleDollarSign,
  Menu,
  Pause,
  Play,
  RotateCcw,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";

import { LeagueBrowser } from "@/components/LeagueBrowser";
import { BoardTab } from "@/components/BoardTab";
import { CommercialTab } from "@/components/CommercialTab";
import { ALL_TABS, DESKTOP_PRIMARY_TAB_IDS, type Tab } from "@/components/game/tabs";
import { MobileNav } from "@/components/game/MobileNav";
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
import { ChairmanContinuePanel } from "@/components/game/ChairmanContinuePanel";
import { MatchDayOverlay } from "@/components/game/MatchDayOverlay";
import { InboxTab } from "@/components/game/InboxTab";
import { WorldInspector } from "@/components/game/WorldInspector";
import { RecruitmentFlow } from "@/components/game/RecruitmentFlow";
import { FacilitiesFlow } from "@/components/game/FacilitiesFlow";
import { useGame } from "@/hooks/useGame";
import type { GameState } from "@/lib/game/types";
import { avgTicketPrice, fmtMoney, fmtMoneyExact, phaseOf, CALENDAR } from "@/lib/game/engine";
import { clubKpi } from "@/lib/game/selectors/club";
import { unreadCount } from "@/lib/game/inbox";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chairman FC — Football Finance Sim" },
      {
        name: "description",
        content:
          "Run the books of a football club: set ticket prices, manage wages, upgrade facilities and watch every pound flow through the season.",
      },
      { property: "og:title", content: "Chairman FC — Football Finance Sim" },
      {
        property: "og:description",
        content:
          "A finance-first football chairman game. Cash flow, P&L, ticket demand — every decision hits the books.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const game = useGame();
  if (!game.hydrated)
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  if (!game.state) return <NewGame onStart={game.start} />;
  return <Game {...game} state={game.state} />;
}

function Game({
  state,
  advance,
  update,
  reset,
  isContinuing,
  continueReason,
  startContinue,
  stopContinue,
}: {
  state: GameState;
  advance: (w?: number) => void;
  update: (fn: (s: GameState) => GameState) => void;
  reset: () => void;
  isContinuing: boolean;
  continueReason: string | null;
  startContinue: () => void;
  stopContinue: () => void;
}) {
  const [tab, setTab] = useState<Tab>("hub");
  const kpi = useMemo(() => ({ ...clubKpi(state), avgTicket: avgTicketPrice(state) }), [state]);
  const desktopPrimary = ALL_TABS.filter(([id]) => DESKTOP_PRIMARY_TAB_IDS.includes(id));
  const desktopMore = ALL_TABS.filter(([id]) => !DESKTOP_PRIMARY_TAB_IDS.includes(id));

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={state.clubName}
        subtitle={`Season ${state.season} · Week ${state.week}/${CALENDAR.seasonEnd} · ${({ preseason: "Pre-season", firstHalf: "League — 1st half", midseason: "Mid-season break", secondHalf: "League — 2nd half" } as const)[phaseOf(state.week)]}`}
        right={
          <Button
            size="sm"
            variant={isContinuing ? "destructive" : "secondary"}
            onClick={isContinuing ? stopContinue : startContinue}
          >
            {isContinuing ? <Pause className="size-4 mr-1" /> : <Play className="size-4 mr-1" />}
            {isContinuing ? "Stop" : "Continue"}
          </Button>
        }
      />
      {continueReason && !isContinuing && (
        <div className="border-b bg-amber-500/10 text-amber-800 dark:text-amber-200">
          <div className="mx-auto max-w-6xl px-3 py-2 text-sm font-medium">
            Time stopped: {continueReason}
          </div>
        </div>
      )}
      <div className="border-b bg-panel text-panel-foreground hidden lg:block">
        <div className="mx-auto max-w-6xl px-3 py-3 grid grid-cols-4 gap-3 tnum">
          <Kpi
            icon={<Wallet className="size-4" />}
            label="Bank balance"
            value={fmtMoneyExact(kpi.cash)}
            tone={kpi.cash >= 0 ? "good" : "bad"}
            info="Cash in the club's bank account."
          />
          <Kpi
            icon={<CircleDollarSign className="size-4" />}
            label="Weekly net"
            value={fmtMoney(kpi.weeklyNetRecurring)}
            tone={kpi.weeklyNetRecurring >= 0 ? "good" : "bad"}
            info="Recurring income minus fixed weekly outgoings."
          />
          <Kpi
            icon={<Users className="size-4" />}
            label="Squad rating"
            value={kpi.rating.toFixed(1)}
            info="Average rating of your top 16 players."
          />
          <Kpi
            icon={<Ticket className="size-4" />}
            label="Avg ticket"
            value={`£${kpi.avgTicket.toFixed(2)}`}
            info="Capacity-weighted average ticket price."
          />
        </div>
      </div>
      <nav className="border-b bg-card sticky top-0 z-10 hidden md:block">
        <div className="mx-auto max-w-6xl px-3 py-2 flex items-center gap-2">
          <div className="grid grid-cols-6 gap-2 flex-1">
            {desktopPrimary.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "relative min-h-16 rounded-xl border px-3 py-2 flex flex-col items-start justify-center gap-1 transition-colors",
                  tab === id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card hover:bg-muted border-border",
                )}
              >
                <Icon className="size-5" />
                <span className="text-sm font-semibold">{label}</span>
                {id === "inbox" && unreadCount(state) > 0 && (
                  <span className="absolute top-2 right-2 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-5 text-center font-semibold">
                    {unreadCount(state) > 99 ? "99+" : unreadCount(state)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-16 px-5 flex-col gap-1">
                <Menu className="size-5" />
                <span className="text-xs">More</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[360px] sm:w-[420px]">
              <SheetHeader>
                <SheetTitle>More club areas</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 mt-6">
                {desktopMore.map(([id, label, Icon]) => (
                  <SheetClose asChild key={id}>
                    <button
                      onClick={() => setTab(id)}
                      className={cn(
                        "min-h-24 rounded-2xl border p-4 flex flex-col items-start justify-between text-left font-semibold transition-colors",
                        tab === id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      <Icon className="size-6" />
                      {label}
                    </button>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-3 py-5 pb-24 md:pb-5">
        <ScreenBoundary name={ALL_TABS.find(([id]) => id === tab)?.[1] ?? tab}>
          {tab === "inbox" && <InboxTab state={state} update={update} />}
          {tab === "hub" && (
            <div className="space-y-5">
              <ChairmanContinuePanel
                state={state}
                isContinuing={isContinuing}
                startContinue={startContinue}
                stopContinue={stopContinue}
                openInbox={() => setTab("inbox")}
              />
              <ClubHub state={state} advance={advance} update={update} setTab={setTab} />
            </div>
          )}
          {tab === "dashboard" && <DashboardTab state={state} />}
          {tab === "cashflow" && <CashFlowTab state={state} />}
          {tab === "tickets" && <TicketsTab state={state} update={update} />}
          {tab === "recruitment" && <RecruitmentFlow state={state} update={update} />}
          {tab === "staff" && <StaffTab state={state} update={update} />}
          {tab === "stadium" && <FacilitiesFlow state={state} update={update} />}
          {tab === "fixtures" && <FixturesTab state={state} update={update} />}
          {tab === "board" && <BoardTab state={state} />}
          {tab === "commercial" && <CommercialTab state={state} update={update} />}
          {tab === "leagues" && <LeagueBrowser state={state} />}
          {tab === "world" && <WorldInspector state={state} />}
          {tab === "history" && <HistoryTab state={state} />}
        </ScreenBoundary>
      </main>
      <MobileNav tab={tab} setTab={setTab} unread={unreadCount(state)} />
      {state.liveMatch && <MatchDayOverlay state={state} update={update} />}
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-3 py-4 flex flex-wrap gap-2 items-center justify-between text-sm text-muted-foreground">
          <span>Autosaved to this device.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Reset game and lose all progress?")) reset();
            }}
          >
            <RotateCcw className="size-4 mr-1" /> Reset game
          </Button>
        </div>
      </footer>
    </div>
  );
}
