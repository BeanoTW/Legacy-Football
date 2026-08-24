import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsRight,
  CircleDollarSign,
  RotateCcw,
  Users,
  Wallet,
} from "lucide-react";

import { LeagueBrowser } from "@/components/LeagueBrowser";
import { BoardTab } from "@/components/BoardTab";
import { CommercialTab } from "@/components/CommercialTab";
import { RecruitmentTab } from "@/components/RecruitmentTab";
import { FacilitiesTab } from "@/components/FacilitiesTab";
import { ALL_TABS, DESKTOP_TAB_GROUPS, type Tab } from "@/components/game/tabs";
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
import { MatchDayOverlay } from "@/components/game/MatchDayOverlay";
import { InboxTab } from "@/components/game/InboxTab";
import { WorldInspector } from "@/components/game/WorldInspector";
import { useGame } from "@/hooks/useGame";
import type { GameState } from "@/lib/game/types";
import {
  fmtMoney,
  fmtMoneyExact,
  playerWagesWeekly,
  squadRating,
  totalWeeklyExpenses,
  weeklySponsorIncome,
  phaseOf,
  CALENDAR,
} from "@/lib/game/engine";
import { unreadCount } from "@/lib/game/inbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { state, hydrated, start, advance, update, reset } = useGame();
  if (!hydrated)
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>
    );
  if (!state) return <NewGame onStart={start} />;
  return <Game state={state} advance={advance} update={update} reset={reset} />;
}

function Game({
  state,
  advance,
  update,
  reset,
}: {
  state: GameState;
  advance: (w?: number) => void;
  update: (fn: (s: GameState) => GameState) => void;
  reset: () => void;
}) {
  const [tab, setTab] = useState<Tab>("hub");
  const kpi = useMemo(() => {
    const wIncome = weeklySponsorIncome(state),
      wExpenses = totalWeeklyExpenses(state);
    return {
      cash: state.cash,
      weeklyIncome: wIncome,
      weeklyExpenses: wExpenses,
      weeklyNetRecurring: wIncome - wExpenses,
      wageBill: playerWagesWeekly(state),
      rating: squadRating(state),
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={state.clubName}
        subtitle={`${state.managerName} · Season ${state.season} · Week ${state.week}/${CALENDAR.seasonEnd} · ${({ preseason: "Pre-season", firstHalf: "League — 1st half", midseason: "Mid-season break", secondHalf: "League — 2nd half" } as const)[phaseOf(state.week)]}`}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => advance(1)}>
              <ChevronsRight className="size-4 mr-1" /> Advance week
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => advance(4)}>
              Advance 4
            </Button>
          </div>
        }
      />
      <div className="border-b bg-panel text-panel-foreground">
        <div className="mx-auto max-w-6xl px-3 py-3 grid grid-cols-3 gap-2 sm:gap-3 tnum">
          <Kpi
            icon={<Wallet className="size-4" />}
            label="Bank balance"
            value={fmtMoneyExact(kpi.cash)}
            tone={kpi.cash >= 0 ? "good" : "bad"}
            info="Cash in the club's bank account. Everything — wages, upgrades, transfers — comes out of this. Go far below zero and the board loses patience."
          />
          <Kpi
            icon={<CircleDollarSign className="size-4" />}
            label="Weekly net (fixed)"
            value={fmtMoney(kpi.weeklyNetRecurring)}
            tone={kpi.weeklyNetRecurring >= 0 ? "good" : "bad"}
            info="Recurring sponsor income minus fixed weekly outgoings (player + staff wages, utilities, maintenance, training). Match income and one-offs come on top."
          />
          <Kpi
            icon={<Users className="size-4" />}
            label="Squad rating"
            value={kpi.rating.toFixed(1)}
            info="Average rating of your top 16 players — a rough gauge of your matchday strength."
          />
        </div>
      </div>
      <nav className="border-b bg-card sticky top-0 z-10 hidden md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2 text-sm">
          <DesktopTabButton id="hub" tab={tab} setTab={setTab} />
          <DesktopTabButton id="inbox" tab={tab} setTab={setTab} unread={unreadCount(state)} />
          <div className="mx-1 h-6 w-px bg-border" />
          {DESKTOP_TAB_GROUPS.map((group) => {
            const active = group.tabs.includes(tab);
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-3 py-2 transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {group.label} <ChevronDown className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {group.tabs.map((id) => {
                    const def = ALL_TABS.find(([tabId]) => tabId === id)!;
                    const [, label, Icon] = def;
                    return (
                      <DropdownMenuItem key={id} onClick={() => setTab(id)}>
                        <Icon className="size-4" />
                        {label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-3 py-5 pb-24 md:pb-5">
        <ScreenBoundary name={ALL_TABS.find(([id]) => id === tab)?.[1] ?? tab}>
          {tab === "inbox" && <InboxTab state={state} update={update} />}
          {tab === "hub" && (
            <ClubHub state={state} advance={advance} update={update} setTab={setTab} />
          )}
          {tab === "dashboard" && <DashboardTab state={state} />}
          {tab === "cashflow" && <CashFlowTab state={state} />}
          {tab === "tickets" && <TicketsTab state={state} update={update} />}
          {tab === "recruitment" && <RecruitmentTab state={state} update={update} />}
          {tab === "staff" && <StaffTab state={state} update={update} />}
          {tab === "stadium" && <FacilitiesTab state={state} update={update} />}
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

function DesktopTabButton({
  id,
  tab,
  setTab,
  unread = 0,
}: {
  id: Tab;
  tab: Tab;
  setTab: (tab: Tab) => void;
  unread?: number;
}) {
  const [, label, Icon] = ALL_TABS.find(([tabId]) => tabId === id)!;
  return (
    <button
      onClick={() => setTab(id)}
      className={cn(
        "relative flex items-center gap-1.5 rounded-lg px-3 py-2 transition-colors",
        tab === id
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      {unread > 0 && (
        <span className="min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
