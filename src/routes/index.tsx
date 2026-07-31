import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  ChevronsRight,
  CircleDollarSign,
  Heart,
  Info,
  LineChart as LineIcon,
  Mail,
  Menu,

  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Ticket,
  TriangleAlert,
  Trophy,
  Gavel,
  Handshake,
  UserMinus,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

import { LeagueBrowser } from "@/components/LeagueBrowser";
import { BoardTab } from "@/components/BoardTab";
import { CommercialTab } from "@/components/CommercialTab";
import { RecruitmentTab } from "@/components/RecruitmentTab";
import { useGame } from "@/hooks/useGame";
import type { GameState, Stand, Staff, StaffRole, Priority, Position, TransferTarget, IncomingBid } from "@/lib/game/types";
import {
  avgTicketPrice,
  fmtMoney,
  fmtMoneyExact,
  hiredStaffWagesWeekly,
  playerWagesWeekly,
  squadRating,
  staffJoinTerms,
  totalCapacity,
  totalWeeklyExpenses,
  weeklySponsorIncome,
  isTransferWindowOpen,
  windowStatus,
  phaseOf,
  CALENDAR,
  approveTransferTarget,
  rejectTransferTarget,
  respondToBid,
  setTransferBudget,
  setWageBudget,
  setPositionPriority,
  startMatchDay,
  kickoff,
  applyHalfTimeChoice,
  commitLiveMatchAndAdvance,
  cancelLiveMatch,
  expandStand as expandStandAction,
  upgradeTraining,
  relayPitch,
  hireStaffMember,
  sackStaffMember,
  severanceFor,
} from "@/lib/game/engine";
import {
  unreadCount,
  markInboxRead,
  handleInboxChoice,
  evaluateChoice,

  dismissInboxItem,
  clearReadInbox,
  CATEGORY_META,
  PRIORITY_META,
  DEPARTMENTS_ALL,
} from "@/lib/game/inbox";
import type { InboxItem, InboxCategory, InboxDepartment, InboxStatus } from "@/lib/game/types";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function InfoTip({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ?? "More info"}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center size-4 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted transition-colors align-middle"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-64 text-xs leading-relaxed">
        {children}
      </PopoverContent>
    </Popover>
  );
}

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

type Tab =
  | "inbox"
  | "hub"
  | "board"
  | "commercial"
  | "dashboard"
  | "cashflow"
  | "tickets"
  | "recruitment"
  | "staff"
  | "stadium"
  | "fixtures"
  | "leagues"
  | "history";

type TabDef = [Tab, string, typeof LineIcon];

const ALL_TABS: TabDef[] = [
  ["inbox", "Inbox", Mail],
  ["hub", "Club", Trophy],
  ["board", "Board", Gavel],
  ["commercial", "Commercial", Handshake],
  ["dashboard", "Overview", LineIcon],
  ["cashflow", "Cash flow", CircleDollarSign],
  ["tickets", "Tickets", Ticket],
  ["recruitment", "Recruitment", Users],
  ["staff", "Staff", Briefcase],
  ["stadium", "Stadium", Building2],
  ["fixtures", "Fixtures", Calendar],
  ["leagues", "Leagues", Trophy],
  ["history", "Ledger", Save],
];

const PRIMARY_TAB_IDS: Tab[] = ["inbox", "hub", "recruitment", "board"];


function MobileNav({ tab, setTab, unread }: { tab: Tab; setTab: (t: Tab) => void; unread: number }) {
  const [open, setOpen] = useState(false);
  const primary = ALL_TABS.filter(([id]) => PRIMARY_TAB_IDS.includes(id));
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        {primary.map(([id, label, Icon]) => (
          <li key={id}>
            <button
              onClick={() => setTab(id)}
              className={cn(
                "relative w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                tab === id ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
              {id === "inbox" && unread > 0 && (
                <span className="absolute top-1 right-[calc(50%-18px)] min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center font-semibold">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </li>
        ))}

        <li>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
                  !PRIMARY_TAB_IDS.includes(tab) ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Menu className="size-5" />
                More
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {ALL_TABS.map(([id, label, Icon]) => (
                  <SheetClose asChild key={id}>
                    <button
                      onClick={() => setTab(id)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-lg border p-3 text-xs font-medium transition-colors",
                        tab === id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
                    </button>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}




function Page() {
  const { state, hydrated, start, advance, update, reset } = useGame();

  if (!hydrated) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!state) return <NewGame onStart={start} />;
  return <Game state={state} advance={advance} update={update} reset={reset} />;
}

/* =========================================================================
   NEW GAME
   ========================================================================= */
function NewGame({ onStart }: { onStart: (club: string, manager: string) => void }) {
  const [club, setClub] = useState("Dalton Town");
  const [manager, setManager] = useState("N. Cahill");
  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Chairman FC" subtitle="A football finance simulator" />
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm">New Club Setup</div>
          <div className="p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              You take over a mid-table club with £2.5M in the bank. Set ticket prices,
              control the wage bill, invest in the ground and try to survive the season
              in the black.
            </p>
            <div className="space-y-2">
              <Label htmlFor="club">Club name</Label>
              <Input id="club" value={club} onChange={(e) => setClub(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mgr">Chairman name</Label>
              <Input id="mgr" value={manager} onChange={(e) => setManager(e.target.value)} />
            </div>
            <Button
              className="w-full"
              disabled={!club.trim()}
              onClick={() => onStart(club.trim(), manager.trim() || "Chairman")}
            >
              <Play className="mr-2 size-4" /> Start Season
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   MAIN GAME SHELL
   ========================================================================= */
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
  const [tab, setTab] = useState<Tab>("inbox");

  const kpi = useMemo(() => {
    const wIncome = weeklySponsorIncome(state); // recurring
    const wExpenses = totalWeeklyExpenses(state);
    return {
      cash: state.cash,
      weeklyIncome: wIncome,
      weeklyExpenses: wExpenses,
      weeklyNetRecurring: wIncome - wExpenses,
      wageBill: playerWagesWeekly(state),
      capacity: totalCapacity(state),
      avgTicket: avgTicketPrice(state),
      rating: squadRating(state),
    };
  }, [state]);

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        title={state.clubName}
        subtitle={`${state.managerName} · Season ${state.season} · Week ${state.week}/${CALENDAR.seasonEnd} · ${({preseason:"Pre-season",firstHalf:"League — 1st half",midseason:"Mid-season break",secondHalf:"League — 2nd half"} as const)[phaseOf(state.week)]}`}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => advance(1)}>
              <ChevronsRight className="size-4 mr-1" /> Advance week
            </Button>
            <Button size="sm" onClick={() => advance(4)}>
              Advance 4
            </Button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="border-b bg-panel text-panel-foreground">
        <div className="mx-auto max-w-6xl px-3 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 tnum">
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
          <Kpi
            icon={<Ticket className="size-4" />}
            label="Avg ticket"
            value={`£${kpi.avgTicket.toFixed(2)}`}
            info="Capacity-weighted average of ticket prices across all four stands. Fans compare this against a market reference set by your reputation."
          />
        </div>
      </div>

      {/* Desktop tabs */}
      <nav className="border-b bg-card sticky top-0 z-10 hidden md:block">
        <div className="mx-auto max-w-6xl px-2 overflow-x-auto">
          <ul className="flex gap-1 text-sm">
            {ALL_TABS.map(([id, label, Icon]) => (
              <li key={id}>
                <button
                  onClick={() => setTab(id)}
                  className={cn(
                    "px-3 py-3 flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap transition-colors",
                    tab === id
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {id === "inbox" && unreadCount(state) > 0 && (
                    <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] leading-4 text-center font-semibold">
                      {unreadCount(state)}
                    </span>
                  )}
                </button>

              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-3 py-5 pb-24 md:pb-5">
        {tab === "inbox" && <InboxTab state={state} update={update} />}
        {tab === "hub" && <ClubHub state={state} advance={advance} update={update} setTab={setTab} />}

        {tab === "dashboard" && <Dashboard state={state} />}
        {tab === "cashflow" && <CashFlow state={state} />}
        {tab === "tickets" && <Tickets state={state} update={update} />}
        {tab === "recruitment" && <RecruitmentTab state={state} update={update} />}
        {tab === "staff" && <StaffTab state={state} update={update} />}
        {tab === "stadium" && <StadiumTab state={state} update={update} />}
        {tab === "fixtures" && <Fixtures state={state} update={update} />}
        {tab === "board" && <BoardTab state={state} />}
        {tab === "commercial" && <CommercialTab state={state} update={update} />}
        {tab === "leagues" && <LeagueBrowser state={state} />}
        {tab === "history" && <History state={state} />}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav tab={tab} setTab={setTab} unread={unreadCount(state)} />


      {state.liveMatch && <MatchDayOverlay state={state} update={update} />}


      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-3 py-4 flex flex-wrap gap-2 items-center justify-between text-sm text-muted-foreground">
          <span>Autosaved to this device.</span>
          <Button variant="ghost" size="sm" onClick={() => {
            if (confirm("Reset game and lose all progress?")) reset();
          }}>
            <RotateCcw className="size-4 mr-1" /> Reset game
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================================
   UI HELPERS
   ========================================================================= */
function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="panel-strip">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <Trophy className="size-6 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl leading-none truncate">{title}</h1>
          {subtitle && (
            <div className="text-xs opacity-80 mt-0.5 truncate">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
  info,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "bad";
  info?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-black/10 px-3 py-2">
      <div className="opacity-80">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider opacity-70 flex items-center gap-1">
          <span className="truncate">{label}</span>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </div>
        <div
          className={cn(
            "font-display text-lg leading-tight",
            tone === "good" && "text-emerald-300",
            tone === "bad" && "text-rose-300",
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  right,
  info,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  info?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm overflow-hidden mb-4">
      <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          {title}
          {info && <InfoTip label={title}>{info}</InfoTip>}
        </span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "muted";
  info?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background/50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <span>{label}</span>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </div>
      <div
        className={cn(
          "font-display text-2xl tnum leading-tight",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

/* =========================================================================
   DASHBOARD
   ========================================================================= */
function Dashboard({ state }: { state: GameState }) {
  const last12 = state.ledger.slice(-12);
  const chartData = last12.map((l) => ({
    w: `W${l.week}`,
    balance: l.balance,
    income: Object.values(l.income).reduce((a, b) => a + b, 0),
    expenses: -Object.values(l.expenses).reduce((a, b) => a + b, 0),
    net: l.net,
  }));

  const lastLedger = state.ledger[state.ledger.length - 1];
  const lastResult = state.results[state.results.length - 1];

  const seasonTotals = state.ledger.reduce(
    (acc, l) => {
      acc.income += Object.values(l.income).reduce((a, b) => a + b, 0);
      acc.expenses += Object.values(l.expenses).reduce((a, b) => a + b, 0);
      return acc;
    },
    { income: 0, expenses: 0 },
  );

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myPos = leagueSorted.findIndex((r) => r.team === state.clubName) + 1;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Section title="Season snapshot">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Season income" value={fmtMoney(seasonTotals.income)} tone="good" />
            <Stat label="Season expenses" value={fmtMoney(seasonTotals.expenses)} tone="bad" />
            <Stat
              label="Season net"
              value={fmtMoney(seasonTotals.income - seasonTotals.expenses)}
              tone={seasonTotals.income - seasonTotals.expenses >= 0 ? "good" : "bad"}
            />
            <Stat
              label="League position"
              value={myPos ? `${myPos}${ord(myPos)}` : "—"}
              sub={`of ${state.league.length}`}
            />
          </div>
        </Section>

        <Section title="Bank balance — last 12 weeks">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => fmtMoney(v as number)}
                  width={60}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoneyExact(v)}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="var(--color-primary)"
                  fill="url(#bal)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Weekly cash flow">
          <div className="h-56 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => fmtMoney(v as number)}
                  width={60}
                />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtMoneyExact(v)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" stackId="s" fill="var(--color-income)" />
                <Bar dataKey="expenses" name="Expenses" stackId="s" fill="var(--color-expense)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Last match">
          {lastResult ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg">
                  {lastResult.home ? "H" : "A"} vs {lastResult.opponent}
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold",
                    lastResult.result === "W" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                    lastResult.result === "D" && "bg-muted text-muted-foreground",
                    lastResult.result === "L" && "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                  )}
                >
                  {lastResult.result} {lastResult.goalsFor}-{lastResult.goalsAgainst}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm tnum">
                <div>
                  <dt className="text-muted-foreground text-xs">Attendance</dt>
                  <dd>{lastResult.attendance.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Gate receipts</dt>
                  <dd className="text-[color:var(--color-income)]">
                    {fmtMoneyExact(lastResult.gateReceipts)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">TV income</dt>
                  <dd className="text-[color:var(--color-income)]">
                    {fmtMoneyExact(lastResult.tvIncome)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Fan happiness</dt>
                  <dd>{state.fanHappiness}%</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No matches yet. Advance a week to play your opener.
            </div>
          )}
        </Section>

        <Section title="This week (recurring)">
          <RecurringBreakdown state={state} />
        </Section>

        {lastLedger && (
          <Section title={`Week ${lastLedger.week} totals`}>
            <div className="text-xs text-muted-foreground mb-2">
              {lastLedger.matchdayNote ?? "No match this week."}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Income"
                value={fmtMoney(sum(lastLedger.income))}
                tone="good"
              />
              <Stat
                label="Expenses"
                value={fmtMoney(sum(lastLedger.expenses))}
                tone="bad"
              />
              <Stat
                label="Net"
                value={fmtMoney(lastLedger.net)}
                tone={lastLedger.net >= 0 ? "good" : "bad"}
              />
              <Stat label="Balance after" value={fmtMoneyExact(lastLedger.balance)} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

function RecurringBreakdown({ state }: { state: GameState }) {
  const rows = [
    { label: "Sponsors (weekly)", v: weeklySponsorIncome(state), tone: "good" as const },
    { label: "Player wages", v: -playerWagesWeekly(state), tone: "bad" as const },
    { label: "Admin staff wages", v: -state.staffWagesWeekly, tone: "bad" as const },
    { label: "Hired staff wages", v: -hiredStaffWagesWeekly(state), tone: "bad" as const },
    { label: "Stadium utilities", v: -state.utilitiesWeekly, tone: "bad" as const },
    { label: "Training ops", v: -state.trainingWeeklyCost, tone: "bad" as const },
    { label: "Maintenance", v: -state.maintenanceWeekly, tone: "bad" as const },
  ];
  const net = rows.reduce((a, r) => a + r.v, 0);
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span
            className={cn(
              "tnum",
              r.v > 0 && "text-[color:var(--color-income)]",
              r.v < 0 && "text-[color:var(--color-expense)]",
            )}
          >
            {fmtMoneyExact(r.v)}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2 font-semibold text-sm">
        <span>Net (before matchday)</span>
        <span
          className={cn(
            "tnum",
            net >= 0 ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]",
          )}
        >
          {fmtMoneyExact(net)}
        </span>
      </div>
    </div>
  );
}

/* =========================================================================
   CASH FLOW
   ========================================================================= */
function CashFlow({ state }: { state: GameState }) {
  const totals = useMemo(() => {
    const inc = { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 };
    const exp = {
      playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
      maintenance: 0, matchday: 0, transfers: 0, other: 0,
    };
    for (const l of state.ledger) {
      (Object.keys(inc) as (keyof typeof inc)[]).forEach((k) => (inc[k] += l.income[k]));
      (Object.keys(exp) as (keyof typeof exp)[]).forEach((k) => (exp[k] += l.expenses[k]));
    }
    return { inc, exp };
  }, [state.ledger]);

  const incomePie = Object.entries(totals.inc)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: label(k), value: v }));
  const expensePie = Object.entries(totals.exp)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: label(k), value: v }));

  const CHART_COLORS = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
    "var(--color-primary)",
    "var(--color-accent)",
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Season income">
        <PieBlock data={incomePie} colors={CHART_COLORS} />
        <BreakdownTable totals={totals.inc} tone="income" />
      </Section>
      <Section title="Season expenses">
        <PieBlock data={expensePie} colors={CHART_COLORS} />
        <BreakdownTable totals={totals.exp} tone="expense" />
      </Section>
    </div>
  );
}

function label(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function PieBlock({
  data,
  colors,
}: {
  data: { name: string; value: number }[];
  colors: string[];
}) {
  if (data.length === 0) {
    return (
      <div className="h-48 grid place-items-center text-sm text-muted-foreground">
        No data yet — advance a week.
      </div>
    );
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <RTooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => fmtMoneyExact(v)}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownTable({
  totals,
  tone,
}: {
  totals: Record<string, number>;
  tone: "income" | "expense";
}) {
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return (
    <div className="mt-3 divide-y text-sm">
      {Object.entries(totals).map(([k, v]) => (
        <div key={k} className="flex justify-between py-1.5">
          <span className="text-muted-foreground">{label(k)}</span>
          <span
            className={cn(
              "tnum",
              tone === "income" ? "text-[color:var(--color-income)]" : "text-[color:var(--color-expense)]",
            )}
          >
            {fmtMoneyExact(v)}
          </span>
        </div>
      ))}
      <div className="flex justify-between py-2 font-semibold">
        <span>Total</span>
        <span className="tnum">{fmtMoneyExact(total)}</span>
      </div>
    </div>
  );
}

/* =========================================================================
   TICKETS
   ========================================================================= */
function Tickets({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const setPrice = (key: Stand["key"], price: number) =>
    update((s) => ({
      ...s,
      stands: s.stands.map((st) =>
        st.key === key ? { ...st, ticketPrice: Math.max(5, Math.min(120, price)) } : st,
      ),
    }));

  const refPrice = 15 + state.reputation * 0.4;
  // Each stand's recommendation nudges around the market ref based on its
  // condition (better stand → fans tolerate slightly higher prices).
  const recFor = (st: Stand) => Math.max(5, Math.round(refPrice * (0.85 + st.condition / 400)));
  // A rough "league average" — slight variance around the market ref.
  const leagueAvg = refPrice * 0.98;

  const rows = state.stands.map((st) => {
    const priceFactor = Math.max(
      0.15,
      1 - Math.pow(Math.max(0, st.ticketPrice - refPrice) / refPrice, 1.4),
    );
    const happiness = 0.55 + state.fanHappiness / 200;
    const estAtt = Math.round(st.capacity * priceFactor * happiness);
    const revenue = estAtt * st.ticketPrice;
    const rec = recFor(st);
    const delta = st.ticketPrice - rec;
    return { st, estAtt, revenue, priceFactor, rec, delta };
  });
  const totalEstAtt = rows.reduce((a, r) => a + r.estAtt, 0);
  const totalRev = rows.reduce((a, r) => a + r.revenue, 0);
  const avgPrice = avgTicketPrice(state);
  const overRatio = avgPrice / refPrice;

  const backlash =
    overRatio > 1.5
      ? {
          tone: "bad" as const,
          title: "Fans are furious",
          body: "Your average ticket is more than 50% above the market. Happiness drops each week and your reputation is starting to slide.",
        }
      : overRatio > 1.25
        ? {
            tone: "warn" as const,
            title: "Prices biting",
            body: "You're pricing 25%+ above the market. Attendance is soft and fan happiness ticks down every week you leave it here.",
          }
        : overRatio < 0.75
          ? {
              tone: "good" as const,
              title: "Bargain pricing",
              body: "You're well under the market. Attendance is strong and fans are slowly warming to you — but you're leaving revenue on the table.",
            }
          : null;

  return (
    <div className="space-y-4">
      <Section
        title="Ticket pricing model"
        info={
          <>
            Fans compare each stand's price against a market reference of{" "}
            <strong>£{refPrice.toFixed(2)}</strong>, driven by your reputation (
            {state.reputation.toFixed(0)}). Recommended prices per stand also factor in
            that stand's condition. Push far above and demand collapses; push much further
            and fan happiness — then reputation — start to slide.
          </>
        }
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3 text-xs">
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              Market reference
              <InfoTip label="Market reference">
                What fans consider a fair average price at your level. Grows with reputation
                (base £15 + 0.4 × rep).
              </InfoTip>
            </div>
            <div className="font-display text-lg tnum">£{refPrice.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              League average
              <InfoTip label="League average">
                Roughly what other clubs in your division are charging on average.
              </InfoTip>
            </div>
            <div className="font-display text-lg tnum">£{leagueAvg.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-background/40 p-2">
            <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
              Your average
              <InfoTip label="Your average">
                Capacity-weighted average of your four stands.
              </InfoTip>
            </div>
            <div
              className={cn(
                "font-display text-lg tnum",
                overRatio > 1.25 && "text-[color:var(--color-expense)]",
                overRatio < 0.9 && "text-[color:var(--color-income)]",
              )}
            >
              £{avgPrice.toFixed(2)}
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({overRatio >= 1 ? "+" : ""}
                {((overRatio - 1) * 100).toFixed(0)}% vs market)
              </span>
            </div>
          </div>
        </div>

        {backlash && (
          <div
            className={cn(
              "mb-3 rounded-md border p-3 flex gap-2 text-xs",
              backlash.tone === "bad" &&
                "border-[color:var(--color-expense)]/40 bg-[color:var(--color-expense)]/10",
              backlash.tone === "warn" && "border-amber-500/40 bg-amber-500/10",
              backlash.tone === "good" &&
                "border-[color:var(--color-income)]/40 bg-[color:var(--color-income)]/10",
            )}
          >
            <TriangleAlert
              className={cn(
                "size-4 mt-0.5 shrink-0",
                backlash.tone === "bad" && "text-[color:var(--color-expense)]",
                backlash.tone === "warn" && "text-amber-600",
                backlash.tone === "good" && "text-[color:var(--color-income)]",
              )}
            />
            <div>
              <div className="font-semibold">{backlash.title}</div>
              <div className="text-muted-foreground">{backlash.body}</div>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ st, estAtt, revenue, priceFactor, rec, delta }) => {
            const overStand = st.ticketPrice / rec;
            const deltaTone =
              overStand > 1.25
                ? "bad"
                : overStand > 1.08
                  ? "warn"
                  : overStand < 0.9
                    ? "under"
                    : "ok";
            return (
              <div key={st.key} className="rounded-lg border bg-background/40 p-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-display text-lg flex items-center gap-1">
                    {st.name}
                    <InfoTip label={st.name}>
                      Recommended reflects the market reference adjusted for this stand's
                      condition ({st.condition}%). Better stands can charge a small premium
                      without upsetting fans.
                    </InfoTip>
                  </div>
                  <div className="text-xs text-muted-foreground tnum">
                    Cap {st.capacity.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="font-display text-3xl tnum">£{st.ticketPrice}</div>
                  <div className="text-xs text-muted-foreground">
                    demand{" "}
                    <span
                      className={cn(
                        "font-semibold",
                        priceFactor > 0.75 && "text-[color:var(--color-income)]",
                        priceFactor > 0.4 && priceFactor <= 0.75 && "text-amber-600",
                        priceFactor <= 0.4 && "text-[color:var(--color-expense)]",
                      )}
                    >
                      {(priceFactor * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-[11px] flex items-center gap-1">
                  <span className="text-muted-foreground">Recommended £{rec}</span>
                  <span
                    className={cn(
                      "font-semibold tnum",
                      deltaTone === "bad" && "text-[color:var(--color-expense)]",
                      deltaTone === "warn" && "text-amber-600",
                      deltaTone === "under" && "text-[color:var(--color-income)]",
                      deltaTone === "ok" && "text-muted-foreground",
                    )}
                  >
                    ({delta >= 0 ? "+" : ""}£{delta})
                  </span>
                  <button
                    type="button"
                    onClick={() => setPrice(st.key, rec)}
                    className="ml-auto text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                  >
                    Set to recommended
                  </button>
                </div>
                <Slider
                  className="mt-3"
                  min={5}
                  max={80}
                  step={1}
                  value={[st.ticketPrice]}
                  onValueChange={([v]) => setPrice(st.key, v)}
                />
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm tnum">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Est. attendance
                    </div>
                    <div>{estAtt.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">Est. gate</div>
                    <div className="text-[color:var(--color-income)]">
                      {fmtMoneyExact(revenue)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border bg-secondary p-3 grid grid-cols-3 gap-2 text-sm tnum">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Total capacity</div>
            <div className="font-display text-lg">{totalCapacity(state).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Est. next home att.</div>
            <div className="font-display text-lg">{totalEstAtt.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Est. next home gate</div>
            <div className="font-display text-lg text-[color:var(--color-income)]">
              {fmtMoney(totalRev)}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   SQUAD
   ========================================================================= */
function Squad({ state }: { state: GameState }) {
  const totalWage = playerWagesWeekly(state);
  const byPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 } as Record<string, number>;
  for (const p of state.squad) byPos[p.position] += p.wage;

  const wageBars = Object.entries(byPos).map(([k, v]) => ({ pos: k, wage: v }));

  return (
    <div className="space-y-4">
      <Section title="Wage bill">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Weekly wage bill" value={fmtMoneyExact(totalWage)} tone="bad" />
          <Stat label="Annualised" value={fmtMoney(totalWage * 52)} tone="bad" />
          <Stat
            label="Wages / recurring income"
            value={`${((totalWage / Math.max(1, weeklySponsorIncome(state))) * 100).toFixed(0)}%`}
            sub="vs sponsors alone"
          />
        </div>
        <div className="h-40 mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={wageBars} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtMoney(v as number)}
                stroke="var(--color-muted-foreground)"
                tick={{ fontSize: 11 }}
              />
              <YAxis dataKey="pos" type="category" stroke="var(--color-muted-foreground)" tick={{ fontSize: 11 }} />
              <RTooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmtMoneyExact(v)}
              />
              <Bar dataKey="wage" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title={`Squad · ${state.squad.length} players`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Name</th>
                <th className="text-left py-2 pr-3">Pos</th>
                <th className="text-right py-2 pr-3">Age</th>
                <th className="text-right py-2 pr-3">Rat</th>
                <th className="text-right py-2 pr-3">Wage/wk</th>
                <th className="text-right py-2 pr-3">Value</th>
                <th className="text-right py-2">Contract</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[...state.squad]
                .sort((a, b) => b.rating - a.rating)
                .map((p) => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="py-1.5 pr-3">{p.name}</td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-bold",
                          p.position === "GK" && "bg-amber-500/20 text-amber-700 dark:text-amber-300",
                          p.position === "DEF" && "bg-sky-500/20 text-sky-700 dark:text-sky-300",
                          p.position === "MID" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                          p.position === "FWD" && "bg-rose-500/20 text-rose-700 dark:text-rose-300",
                        )}
                      >
                        {p.position}
                      </span>
                    </td>
                    <td className="text-right py-1.5 pr-3">{p.age}</td>
                    <td className="text-right py-1.5 pr-3 font-semibold">{p.rating}</td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                      {fmtMoneyExact(p.wage)}
                    </td>
                    <td className="text-right py-1.5 pr-3">{fmtMoney(p.value)}</td>
                    <td className="text-right py-1.5 text-xs text-muted-foreground">
                      {p.contractWeeks < 8 ? (
                        <span className="text-[color:var(--color-expense)] font-semibold">
                          {p.contractWeeks}w left
                        </span>
                      ) : (
                        `${p.contractWeeks}w`
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   STADIUM
   ========================================================================= */
function StadiumTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const expandStand = (key: Stand["key"], addSeats: number) => {
    const res = expandStandAction(state, key, addSeats);
    if (!res.ok) return alert(res.reason ?? "Not enough cash.");
    update(() => res.state);
  };

  return (
    <div className="space-y-4">
      <Section title="Stadium">
        <div className="grid gap-3 md:grid-cols-2">
          {state.stands.map((st) => (
            <div key={st.key} className="rounded-lg border bg-background/40 p-3">
              <div className="flex items-baseline justify-between">
                <div className="font-display text-lg">{st.name}</div>
                <div className="text-xs text-muted-foreground">
                  Condition <span className="font-semibold">{st.condition}%</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm tnum">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Capacity</div>
                  <div className="font-display text-xl">{st.capacity.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground">Ticket price</div>
                  <div className="font-display text-xl">£{st.ticketPrice}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => expandStand(st.key, 500)}>
                  +500 seats (£{(500 * 350).toLocaleString()})
                </Button>
                <Button size="sm" variant="secondary" onClick={() => expandStand(st.key, 1500)}>
                  +1500 seats (£{(1500 * 350).toLocaleString()})
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Training facilities">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Training rating" value={String(state.trainingRating)} />
          <Stat label="Pitch condition" value={`${state.pitchCondition}%`} />
          <Stat
            label="Weekly cost"
            value={fmtMoneyExact(state.trainingWeeklyCost)}
            tone="bad"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              const res = upgradeTraining(state);
              if (!res.ok) return alert(res.reason ?? "Not enough cash.");
              update(() => res.state);
            }}
          >
            Upgrade +3 (£250k)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const res = relayPitch(state);
              if (!res.ok) return alert(res.reason ?? "Not enough cash.");
              update(() => res.state);
            }}
          >
            Relay pitch (£40k)
          </Button>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   FIXTURES
   ========================================================================= */
function Fixtures({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Fixtures">
        <div className="max-h-[520px] overflow-y-auto divide-y text-sm">
          {state.fixtures.map((f) => {
            const result = state.results.find((r) => r.week === f.week);
            const isNext = f.week === state.week;
            return (
              <div
                key={f.week}
                className={cn(
                  "flex items-center justify-between py-2",
                  isNext && "bg-accent/20 -mx-4 px-4 border-y border-accent",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs w-10 text-muted-foreground tnum">W{f.week}</span>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      f.home ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {f.home ? "H" : "A"}
                  </span>
                  <span>{f.opponent}</span>
                </div>
                {result ? (
                  <span
                    className={cn(
                      "text-xs font-bold tnum",
                      result.result === "W" && "text-[color:var(--color-income)]",
                      result.result === "L" && "text-[color:var(--color-expense)]",
                    )}
                  >
                    {result.goalsFor}-{result.goalsAgainst}
                  </span>
                ) : isNext ? (
                  <button
                    onClick={() => update((s) => startMatchDay(s))}
                    className="text-xs font-semibold text-accent-foreground bg-accent hover:brightness-95 px-2 py-0.5 rounded"
                  >
                    Play →
                  </button>
                ) : (

                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="League table">
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-2">#</th>
                <th className="text-left py-2 pr-2">Club</th>
                <th className="text-right py-2 pr-2">P</th>
                <th className="text-right py-2 pr-2">W</th>
                <th className="text-right py-2 pr-2">D</th>
                <th className="text-right py-2 pr-2">L</th>
                <th className="text-right py-2 pr-2">GD</th>
                <th className="text-right py-2">Pts</th>
              </tr>
            </thead>
            <tbody>
              {[...state.league]
                .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
                .map((r, i) => (
                  <tr
                    key={r.team}
                    className={cn(
                      "border-b last:border-b-0",
                      r.team === state.clubName && "bg-accent/20 font-semibold",
                    )}
                  >
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2">{r.team}</td>
                    <td className="text-right py-1.5 pr-2">{r.p}</td>
                    <td className="text-right py-1.5 pr-2">{r.w}</td>
                    <td className="text-right py-1.5 pr-2">{r.d}</td>
                    <td className="text-right py-1.5 pr-2">{r.l}</td>
                    <td className="text-right py-1.5 pr-2">{r.gf - r.ga}</td>
                    <td className="text-right py-1.5 font-semibold">{r.pts}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================================
   HISTORY / LEDGER
   ========================================================================= */
function History({ state }: { state: GameState }) {
  const rows = [...state.ledger].reverse();
  return (
    <Section title="Weekly ledger">
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No entries yet. Advance a week to begin recording finances.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tnum">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2 pr-3">Week</th>
                <th className="text-left py-2 pr-3">Note</th>
                <th className="text-right py-2 pr-3">Income</th>
                <th className="text-right py-2 pr-3">Expenses</th>
                <th className="text-right py-2 pr-3">Net</th>
                <th className="text-right py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const inc = sum(l.income);
                const exp = sum(l.expenses);
                return (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      S{l.season} W{l.week}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.matchdayNote ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-income)]">
                      {fmtMoneyExact(inc)}
                    </td>
                    <td className="text-right py-1.5 pr-3 text-[color:var(--color-expense)]">
                      {fmtMoneyExact(exp)}
                    </td>
                    <td
                      className={cn(
                        "text-right py-1.5 pr-3 font-semibold",
                        l.net >= 0
                          ? "text-[color:var(--color-income)]"
                          : "text-[color:var(--color-expense)]",
                      )}
                    >
                      {fmtMoneyExact(l.net)}
                    </td>
                    <td className="text-right py-1.5">{fmtMoneyExact(l.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* =========================================================================
   STAFF
   ========================================================================= */
const STAT_KEYS: (keyof Staff["stats"])[] = [
  "tactics","attack","defense","development","scouting","negotiation","medical","motivation",
];
const STAT_LABEL: Record<keyof Staff["stats"], string> = {
  tactics: "Tac", attack: "Att", defense: "Def", development: "Dev",
  scouting: "Sct", negotiation: "Neg", medical: "Med", motivation: "Mot",
};

function StaffTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [filter, setFilter] = useState<"All" | StaffRole>("All");
  const [minRating, setMinRating] = useState(0);
  const [maxWage, setMaxWage] = useState(0); // 0 = no cap
  const [willingOnly, setWillingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"rating" | "wage" | "age" | "fit">("fit");

  const hire = (id: string) => {
    const res = hireStaffMember(state, id);
    if (!res.ok) return alert(res.reason ?? "Unable to hire.");
    update(() => res.state);
  };

  const sack = (id: string) => {
    const st = state.hiredStaff.find((h) => h.id === id);
    if (!st) return;
    if (!confirm(`Sack ${st.name}? Severance of ${fmtMoneyExact(severanceFor(st))} due.`)) return;
    const res = sackStaffMember(state, id);
    if (!res.ok) return alert(res.reason ?? "Unable to sack.");
    update(() => res.state);
  };

  const roles: (StaffRole | "All")[] = [
    "All",
    "Manager",
    "Assistant Manager",
    "Head Coach",
    "Goalkeeping Coach",
    "Fitness Coach",
    "Head of Youth",
    "Head of Transfers",
    "Chief Scout",
    "Scout",
    "Head Physio",
    "Sports Scientist",
  ];

  const enriched = state.staffCandidates.map((c) => ({
    staff: c,
    terms: staffJoinTerms(state.reputation, c),
  }));

  const filtered = enriched
    .filter(({ staff, terms }) => {
      if (filter !== "All" && staff.role !== filter) return false;
      if (staff.rating < minRating) return false;
      if (maxWage > 0 && terms.wageDemand > maxWage) return false;
      if (willingOnly && !terms.willing) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "rating") return b.staff.rating - a.staff.rating;
      if (sortBy === "wage") return a.terms.wageDemand - b.terms.wageDemand;
      if (sortBy === "age") return a.staff.age - b.staff.age;
      // "fit" — willing first, then closeness to club rep, then rating
      const aw = a.terms.willing ? 0 : 1;
      const bw = b.terms.willing ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return b.staff.rating - a.staff.rating;
    });

  const weeklyStaffCost = hiredStaffWagesWeekly(state);
  const willingCount = enriched.filter((e) => e.terms.willing).length;

  return (
    <div className="space-y-4">
      <Section title="Backroom overview">
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Hired staff" value={String(state.hiredStaff.length)} />
          <Stat label="Weekly cost" value={fmtMoneyExact(weeklyStaffCost)} tone="bad" />
          <Stat label="Club reputation" value={String(Math.round(state.reputation))} sub="drives who'll join" />
          <Stat
            label="Willing candidates"
            value={`${willingCount} / ${enriched.length}`}
            sub="at your level or below"
          />
        </div>
      </Section>

      <Section title="Your backroom staff">
        {state.hiredStaff.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            You haven't hired anyone yet. Browse the shortlist below and appoint your
            manager and specialists.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {state.hiredStaff.map((s) => (
              <StaffCard key={s.id} staff={s} onAction={() => sack(s.id)} action="sack" />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Available candidates"
        right={
          <span className="text-[10px] uppercase tracking-wider opacity-80">
            {filtered.length} shown · refreshes every 4 weeks
          </span>
        }
      >
        {/* Role chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={cn(
                "px-2 py-1 rounded text-xs border",
                filter === r
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="grid gap-3 md:grid-cols-4 mb-3 text-xs">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">
              Min rating: {minRating}
            </Label>
            <Slider
              value={[minRating]}
              min={0}
              max={95}
              step={5}
              onValueChange={(v) => setMinRating(v[0])}
              className="mt-2"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">
              Max wage £/wk (0 = any)
            </Label>
            <Input
              type="number"
              value={maxWage}
              min={0}
              step={500}
              onChange={(e) => setMaxWage(Number(e.target.value) || 0)}
              className="mt-1 h-8"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Sort by</Label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="mt-1 h-8 w-full rounded border bg-background px-2 text-xs"
            >
              <option value="fit">Best fit</option>
              <option value="rating">Highest rated</option>
              <option value="wage">Cheapest demand</option>
              <option value="age">Youngest</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={willingOnly}
                onChange={(e) => setWillingOnly(e.target.checked)}
              />
              <span>Willing to join only</span>
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map(({ staff, terms }) => (
            <StaffCard
              key={staff.id}
              staff={staff}
              terms={terms}
              onAction={() => hire(staff.id)}
              action="hire"
              affordable={state.cash >= terms.signingBonus}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No candidates match those filters — loosen them or wait for the next refresh.
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function StaffCard({
  staff,
  onAction,
  action,
  affordable = true,
  terms,
}: {
  staff: Staff;
  onAction: () => void;
  action: "hire" | "sack";
  affordable?: boolean;
  terms?: ReturnType<typeof staffJoinTerms>;
}) {
  const wage = terms ? terms.wageDemand : staff.wage;
  const bonus = terms ? terms.signingBonus : staff.wage * 2;
  const premiumPct = terms ? Math.round(terms.premiumPct * 100) : 0;
  const canHire = action === "hire" ? affordable && (!terms || terms.willing) : true;
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/40 p-3",
        terms && !terms.willing && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg leading-tight truncate">{staff.name}</div>
          <div className="text-xs text-muted-foreground">
            {staff.role} · Age {staff.age} · Rep {staff.reputation}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn(
              "font-display text-2xl tnum leading-none",
              staff.rating >= 80 && "text-emerald-600",
              staff.rating >= 65 && staff.rating < 80 && "text-amber-600",
              staff.rating < 65 && "text-muted-foreground",
            )}
          >
            {staff.rating}
          </div>
          <div className="text-[10px] uppercase text-muted-foreground">Overall</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px] tnum">
        {STAT_KEYS.map((k) => (
          <div key={k} className="rounded bg-secondary px-1.5 py-1 flex justify-between">
            <span className="text-muted-foreground">{STAT_LABEL[k]}</span>
            <span
              className={cn(
                "font-semibold",
                staff.stats[k] >= 80 && "text-emerald-600",
                staff.stats[k] < 50 && "text-rose-600",
              )}
            >
              {staff.stats[k]}
            </span>
          </div>
        ))}
      </div>

      {terms && (
        <div
          className={cn(
            "mt-2 text-[11px] rounded px-2 py-1",
            !terms.willing && "bg-rose-500/10 text-rose-600",
            terms.willing && premiumPct > 15 && "bg-amber-500/10 text-amber-700",
            terms.willing && premiumPct <= 15 && premiumPct > 0 && "bg-amber-500/5 text-amber-700",
            terms.willing && premiumPct <= 0 && "bg-emerald-500/10 text-emerald-700",
          )}
        >
          {terms.note}
          {premiumPct > 0 && ` · +${premiumPct}% wage`}
          {premiumPct < 0 && ` · ${premiumPct}% wage`}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs tnum">
          <div>
            <span className="text-muted-foreground">Wage </span>
            <span className="font-semibold">{fmtMoneyExact(wage)}</span>
            <span className="text-muted-foreground">/wk</span>
            {terms && premiumPct > 0 && (
              <span className="text-muted-foreground">
                {" "}(listed {fmtMoneyExact(staff.wage)})
              </span>
            )}
          </div>
          <div className="text-muted-foreground">
            Contract {Math.ceil(staff.contractWeeks / 38)}yr ({staff.contractWeeks}w)
            {action === "hire" && ` · Bonus ${fmtMoneyExact(bonus)}`}
          </div>
        </div>
        {action === "hire" ? (
          <Button size="sm" onClick={onAction} disabled={!canHire}>
            <UserPlus className="size-3.5 mr-1" /> Hire
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={onAction}>
            <UserMinus className="size-3.5 mr-1" /> Sack
          </Button>
        )}
      </div>
    </div>
  );
}



/* =========================================================================
   CLUB HUB — home screen (FCM-style)
   ========================================================================= */
function initials(name: string) {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function financialHealth(state: GameState): { label: string; tone: "good" | "bad" | "muted" } {
  const wIncome = weeklySponsorIncome(state);
  const wExp = totalWeeklyExpenses(state);
  const net = wIncome - wExp;
  const runwayWeeks = net < 0 ? state.cash / Math.abs(net) : Infinity;
  if (state.cash < 0) return { label: "CRITICAL", tone: "bad" };
  if (runwayWeeks < 8) return { label: "POOR", tone: "bad" };
  if (state.cash > 3_000_000 && net >= 0) return { label: "STRONG", tone: "good" };
  if (net >= 0) return { label: "OKAY", tone: "muted" };
  return { label: "TIGHT", tone: "muted" };
}

function fanbaseEstimate(state: GameState): number {
  const cap = totalCapacity(state);
  const factor = 0.35 + state.fanHappiness / 220 + state.reputation / 260;
  return Math.round(cap * factor);
}

function ClubHub({
  state,
  advance,
  update,
  setTab,
}: {
  state: GameState;
  advance: (w?: number) => void;
  update: (fn: (s: GameState) => GameState) => void;
  setTab: (t: Tab) => void;
}) {

  const nextFixture = state.fixtures.find((f) => f.week === state.week);
  const health = financialHealth(state);
  const fanbase = fanbaseEstimate(state);
  const staffCount = state.hiredStaff.length;
  const staffAvg = staffCount
    ? Math.round(state.hiredStaff.reduce((a, s) => a + s.rating, 0) / staffCount)
    : 0;
  const manager = state.hiredStaff.find((s) => s.role === "Manager");
  const boardConf = Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 4 + (state.cash > 0 ? 15 : -20))));
  const mgrConf = manager
    ? Math.max(20, Math.min(99, Math.round(60 + (manager.rating - 60) + state.fanHappiness / 8)))
    : Math.max(20, Math.min(99, Math.round(50 + state.fanHappiness / 5)));
  const weeklyNet = weeklySponsorIncome(state) - totalWeeklyExpenses(state);

  const leagueSorted = [...state.league].sort(
    (a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf,
  );
  const myIdx = leagueSorted.findIndex((r) => r.team === state.clubName);
  const miniLeague = leagueSorted.slice(
    Math.max(0, myIdx - 2),
    Math.min(leagueSorted.length, myIdx + 3),
  );

  return (
    <div className="space-y-4">
      {/* Header banner: club identity */}
      <div className="rounded-xl overflow-hidden border shadow-sm">
        <div className="panel-strip px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-12 rounded-md bg-black/25 grid place-items-center font-display text-xl shrink-0">
              {initials(state.clubName)}
            </div>
            <div className="min-w-0">
              <div className="font-display text-2xl leading-none truncate">{state.clubName}</div>
              <div className="text-xs opacity-80 mt-1">
                {myIdx >= 0 ? `${myIdx + 1}${ord(myIdx + 1)}` : "—"} · Season {state.season} · Week {state.week}/{CALENDAR.seasonEnd}
              </div>
            </div>
          </div>
          <div className="size-14 rounded-md bg-black/25 grid place-items-center font-display text-3xl leading-none shrink-0">
            {Math.round(state.reputation)}
          </div>
        </div>
      </div>

      {/* Central portrait + side tiles */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_260px] gap-4">
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="banner-strip px-3 py-2 text-xs">Director of Football</div>
          <div className="relative">
            {/* Portrait area */}
            <div className="aspect-[4/5] max-h-[420px] w-full bg-gradient-to-b from-panel/25 to-panel/5 grid place-items-center">
              <div className="size-40 rounded-full bg-panel/80 text-panel-foreground grid place-items-center font-display text-6xl shadow-inner">
                {initials(state.managerName)}
              </div>
            </div>
            <div className="absolute inset-x-3 bottom-3 rounded-lg banner-strip px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-display text-lg leading-none truncate">{state.managerName}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">
                  Chairman
                </div>
              </div>
              <div className="flex flex-col items-end text-[10px] uppercase tracking-wider opacity-90">
                <span>Reputation</span>
                <span className="font-display text-base">{Math.round(state.reputation)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-3">
          <HubTile
            onClick={() => setTab("staff")}
            icon={<Briefcase className="size-5" />}
            title="Staff"
            value={staffCount ? `${staffCount}` : "Hire"}
            sub={staffCount ? `Avg ${staffAvg}` : "No staff hired"}
            badge={staffCount ? String(staffAvg) : "—"}
          />
          <HubTile
            onClick={() => setTab("tickets")}
            icon={<Heart className="size-5" />}
            title="Fanbase"
            value={fanbase.toLocaleString()}
            sub={`Happiness ${state.fanHappiness}%`}
            badge={`${state.fanHappiness}`}
          />
          <HubTile
            onClick={() => setTab("dashboard")}
            icon={<ShieldCheck className="size-5" />}
            title="Confidence"
            value={`${boardConf} / ${mgrConf}`}
            sub="Board · Manager"
            badge={String(Math.round((boardConf + mgrConf) / 2))}
          />
        </div>
      </div>

      {/* Financial strip */}
      <div className="grid grid-cols-3 gap-3">
        <HubMini
          label="Financial health"
          value={health.label}
          tone={health.tone}
          onClick={() => setTab("cashflow")}
        />
        <HubMini
          label="Available funds"
          value={fmtMoney(state.cash)}
          tone={state.cash >= 0 ? "good" : "bad"}
          onClick={() => setTab("cashflow")}
        />
        <HubMini
          label="Weekly net"
          value={fmtMoney(weeklyNet)}
          tone={weeklyNet >= 0 ? "good" : "bad"}
          onClick={() => setTab("cashflow")}
        />
      </div>

      {/* Next match */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
          <span>Next match</span>
          <span className="opacity-80">Week {state.week}</span>
        </div>
        {nextFixture ? (
          <div className="p-4 flex items-center gap-4">
            <div className="flex-1 flex items-center justify-between gap-3">
              <MatchSide
                name={nextFixture.home ? state.clubName : nextFixture.opponent}
                sub={nextFixture.home ? "Home" : "Away"}
                self={nextFixture.home}
              />
              <div className="text-center px-2">
                <div className="font-display text-2xl">VS</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  League
                </div>
              </div>
              <MatchSide
                name={nextFixture.home ? nextFixture.opponent : state.clubName}
                sub={nextFixture.home ? "Away" : "Home"}
                self={!nextFixture.home}
              />
            </div>
            <Button size="sm" onClick={() => update((s) => startMatchDay(s))}>
              <ChevronsRight className="size-4 mr-1" /> Play
            </Button>

          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            {(() => {
              const p = phaseOf(state.week);
              if (p === "preseason")
                return `Pre-season week ${state.week} of ${CALENDAR.preSeasonEnd}. Transfer window OPEN — build your squad. League kicks off week ${CALENDAR.firstHalfStart}.`;
              if (p === "midseason")
                return `Mid-season break (week ${state.week} of ${CALENDAR.midSeasonEnd}). Transfer window OPEN. League resumes week ${CALENDAR.secondHalfStart}.`;
              return "No fixture this week. Advance to continue the season.";
            })()}
          </div>
        )}
      </section>

      {/* Mini league table */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="banner-strip px-3 py-2 text-xs flex items-center justify-between">
          <span>League</span>
          <button
            className="opacity-90 hover:opacity-100 inline-flex items-center gap-1"
            onClick={() => setTab("fixtures")}
          >
            Full table <ArrowRight className="size-3" />
          </button>
        </div>
        <table className="w-full text-sm tnum">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b">
              <th className="text-left py-2 px-3 w-8">#</th>
              <th className="text-left py-2 px-3">Team</th>
              <th className="text-right py-2 px-2">P</th>
              <th className="text-right py-2 px-2">GD</th>
              <th className="text-right py-2 px-3">Pts</th>
            </tr>
          </thead>
          <tbody>
            {miniLeague.map((r) => {
              const pos = leagueSorted.indexOf(r) + 1;
              const isMe = r.team === state.clubName;
              return (
                <tr
                  key={r.team}
                  className={cn("border-b last:border-0", isMe && "bg-primary/10 font-medium")}
                >
                  <td className="py-2 px-3 text-muted-foreground">{pos}</td>
                  <td className="py-2 px-3 truncate">{r.team}</td>
                  <td className="py-2 px-2 text-right">{r.p}</td>
                  <td className="py-2 px-2 text-right">{r.gf - r.ga}</td>
                  <td className="py-2 px-3 text-right font-display">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function HubTile({
  icon,
  title,
  value,
  sub,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border bg-card shadow-sm p-3 flex items-center gap-3 hover:border-primary/50 transition-colors"
    >
      <div className="size-10 rounded-md bg-panel/15 text-panel grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="font-display text-lg leading-tight truncate">{value}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </div>
      <div className="size-9 rounded-md bg-panel text-panel-foreground grid place-items-center font-display text-base shrink-0">
        {badge}
      </div>
    </button>
  );
}

function HubMini({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "muted";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border bg-card shadow-sm px-3 py-3 text-left hover:border-primary/50 transition-colors"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-lg leading-tight mt-0.5",
          tone === "good" && "text-[color:var(--color-income)]",
          tone === "bad" && "text-[color:var(--color-expense)]",
        )}
      >
        {value}
      </div>
    </button>
  );
}

function MatchSide({ name, sub, self }: { name: string; sub: string; self: boolean }) {
  return (
    <div className={cn("flex-1 min-w-0 flex flex-col items-center text-center gap-1")}>
      <div
        className={cn(
          "size-12 rounded-md grid place-items-center font-display text-lg shrink-0",
          self ? "bg-panel text-panel-foreground" : "bg-muted text-foreground",
        )}
      >
        {initials(name)}
      </div>
      <div className="font-display text-sm leading-tight truncate max-w-full">{name}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{sub}</div>
    </div>
  );
}

/* =========================================================================
   TRANSFERS TAB
   ========================================================================= */
function Transfers({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const win = windowStatus(state);
  const posList: Position[] = ["GK", "DEF", "MID", "FWD"];
  const posLabel: Record<Position, string> = {
    GK: "Goalkeepers",
    DEF: "Defenders",
    MID: "Midfielders",
    FWD: "Forwards",
  };
  const [budgetInput, setBudgetInput] = useState<string>(String(state.transferBudget));
  const [wageInput, setWageInput] = useState<string>(String(state.wageBudgetWeekly));
  return (
    <div className="space-y-4">
      {/* Window banner */}
      <div
        className={cn(
          "rounded-xl border p-4 flex items-start gap-3",
          win.open
            ? "bg-[color:var(--color-income)]/10 border-[color:var(--color-income)]/40"
            : "bg-muted/40",
        )}
      >
        <Calendar className="size-5 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold">{win.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{win.detail}</div>
        </div>
      </div>

      {/* Budget + priorities */}
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Budgets"
          info="Set aside what the club can spend on transfer fees and how much weekly wage capacity is available. Your Head of Transfers won't sign anyone that breaks either limit."
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="tbud" className="flex items-center gap-2">
                Transfer budget (fees)
                <InfoTip>
                  A ring-fenced pot for fees. Allocating money moves it out of spendable cash
                  and locks it in. Signings draw from this pot only. Reduce it to move cash
                  back to the bank. Player sales land in cash — reinvest by allocating again.
                </InfoTip>
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="tbud"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9]/g, ""))}
                  className="tnum"
                />
                <Button
                  variant="secondary"
                  onClick={() =>
                    update((s) => {
                      const r = setTransferBudget(s, Number(budgetInput) || 0);
                      if (!r.ok) alert(r.reason ?? "Could not set budget");
                      return r.state;
                    })
                  }
                >
                  Set
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                <span>Pot: <span className="tnum">{fmtMoneyExact(state.transferBudget)}</span></span>
                <span>Spendable cash: <span className="tnum">{fmtMoneyExact(state.cash)}</span></span>
              </div>
              <div className="flex gap-1 mt-2 flex-wrap">
                {[50_000, 250_000, 1_000_000].map((delta) => (
                  <button
                    key={delta}
                    onClick={() =>
                      update((s) => {
                        const r = setTransferBudget(s, s.transferBudget + delta);
                        if (!r.ok) alert(r.reason ?? "Not enough cash");
                        setBudgetInput(String(r.state.transferBudget));
                        return r.state;
                      })
                    }
                    className="text-[11px] px-2 py-1 rounded border hover:bg-muted"
                  >
                    +{fmtMoney(delta)}
                  </button>
                ))}
                <button
                  onClick={() =>
                    update((s) => {
                      const r = setTransferBudget(s, 0);
                      setBudgetInput("0");
                      return r.state;
                    })
                  }
                  className="text-[11px] px-2 py-1 rounded border hover:bg-muted"
                >
                  Return to cash
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="wbud" className="flex items-center gap-2">
                Weekly wage headroom
                <InfoTip>
                  How much new weekly wage the club can take on. Signings deduct from this;
                  sales free it up again.
                </InfoTip>
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="wbud"
                  value={wageInput}
                  onChange={(e) => setWageInput(e.target.value.replace(/[^0-9]/g, ""))}
                  className="tnum"
                />
                <Button
                  variant="secondary"
                  onClick={() => update((s) => setWageBudget(s, Number(wageInput) || 0))}
                >
                  Set
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Current: {fmtMoneyExact(state.wageBudgetWeekly)}/wk
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Position priorities"
          info="Guides which positions your scouts and Head of Transfers focus on. High priority positions get more shortlisted targets."
        >
          <div className="space-y-2">
            {posList.map((pos) => (
              <div key={pos} className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{posLabel[pos]}</div>
                  <div className="text-xs text-muted-foreground">
                    Squad: {state.squad.filter((p) => p.position === pos).length}
                  </div>
                </div>
                <div className="flex gap-1">
                  {(["low", "medium", "high"] as Priority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => update((s) => setPositionPriority(s, pos, p))}
                      className={cn(
                        "text-xs px-2 py-1 rounded border capitalize",
                        state.positionPriorities[pos] === p
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-muted",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* Shortlist */}
      <Section
        title={`Shortlist (${state.transferTargets.length})`}
        info="Players your Head of Transfers and scouts have brought to your desk. Approve to sign, reject to move on. New names arrive each week the window is open."
      >
        {state.transferTargets.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {win.open
              ? "No shortlisted players yet. Advance a week and let the staff work."
              : "Window is closed. Signings only happen during the transfer windows."}
          </div>
        ) : (
          <div className="space-y-2">
            {state.transferTargets.map((t) => (
              <TargetCard
                key={t.id}
                target={t}
                state={state}
                onApprove={() =>
                  update((s) => {
                    const r = approveTransferTarget(s, t.id);
                    if (!r.ok) alert(r.reason ?? "Signing failed");
                    return r.state;
                  })
                }
                onReject={() => update((s) => rejectTransferTarget(s, t.id))}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Incoming bids */}
      <Section
        title={`Incoming bids (${state.incomingBids.length})`}
        info="Other clubs sniffing round your best players. Accepting frees up wages and adds cash to the transfer budget; rejecting keeps them for now."
      >
        {state.incomingBids.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No approaches this week.
          </div>
        ) : (
          <div className="space-y-2">
            {state.incomingBids.map((b) => (
              <BidCard
                key={b.id}
                bid={b}
                state={state}
                onAccept={() => update((s) => respondToBid(s, b.id, true))}
                onReject={() => update((s) => respondToBid(s, b.id, false))}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Recent transfers */}
      <Section title="Recent transfers">
        {state.completedTransfers.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No completed transfers yet.
          </div>
        ) : (
          <div className="text-sm divide-y">
            {state.completedTransfers
              .slice()
              .reverse()
              .slice(0, 12)
              .map((t, i) => (
                <div key={i} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        t.direction === "in"
                          ? "bg-[color:var(--color-income)]/20 text-[color:var(--color-income)]"
                          : "bg-[color:var(--color-expense)]/20 text-[color:var(--color-expense)]",
                      )}
                    >
                      {t.direction === "in" ? "IN" : "OUT"}
                    </span>
                    <span className="truncate">
                      {t.playerName} <span className="text-muted-foreground">({t.position})</span>
                    </span>
                  </div>
                  <div className="text-xs tnum text-muted-foreground shrink-0">
                    S{t.season} W{t.week} · {fmtMoney(t.fee)}
                    {t.direction === "in" ? ` · ${fmtMoney(t.wage)}/wk` : ""}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function TargetCard({
  target,
  state,
  onApprove,
  onReject,
}: {
  target: TransferTarget;
  state: GameState;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canAffordFee = target.askingFee <= state.transferBudget;
  const canAffordWage = target.wageDemand <= state.wageBudgetWeekly;
  return (
    <div className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{target.player.name}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted">
            {target.player.position}
          </span>
          <span className="text-xs text-muted-foreground">
            {target.player.age}y · Rating {target.player.rating}
          </span>
          {target.positionPriority === "high" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              PRIORITY
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">{target.note}</div>
        <div className="text-[11px] text-muted-foreground mt-1 italic">
          Scouted by {target.scoutedByName} · {target.scoutedByRole}
        </div>
      </div>
      <div className="flex sm:flex-col gap-2 sm:gap-0 sm:text-right tnum text-sm">
        <div className={cn(!canAffordFee && "text-[color:var(--color-expense)]")}>
          Fee {fmtMoney(target.askingFee)}
        </div>
        <div className={cn("text-xs", !canAffordWage && "text-[color:var(--color-expense)]")}>
          {fmtMoney(target.wageDemand)}/wk
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          onClick={onApprove}
          disabled={!canAffordFee || !canAffordWage}
        >
          <UserPlus className="size-4 mr-1" /> Sign
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject}>
          Pass
        </Button>
      </div>
    </div>
  );
}

function BidCard({
  bid,
  state,
  onAccept,
  onReject,
}: {
  bid: IncomingBid;
  state: GameState;
  onAccept: () => void;
  onReject: () => void;
}) {
  const p = state.squad.find((x) => x.id === bid.playerId);
  return (
    <div className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{bid.playerName}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted">
            {bid.position}
          </span>
          {p && (
            <span className="text-xs text-muted-foreground">
              Rating {p.rating} · Value {fmtMoney(p.value)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Approach from <span className="font-medium">{bid.fromClub}</span>
        </div>
      </div>
      <div className="text-right tnum">
        <div className="font-semibold text-[color:var(--color-income)]">
          {fmtMoney(bid.fee)}
        </div>
        {p && (
          <div className="text-xs text-muted-foreground">
            Frees {fmtMoney(p.wage)}/wk
          </div>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject}>
          Reject
        </Button>
      </div>
    </div>
  );
}

/* =========================================================================
   MATCH DAY OVERLAY
   ========================================================================= */
function MatchDayOverlay({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const lm = state.liveMatch!;
  const usName = state.clubName;
  const themName = lm.fixture.opponent;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="mx-auto max-w-3xl px-3 py-6">
        <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
          <div className="banner-strip px-4 py-2 text-sm flex items-center justify-between">
            <span>
              Matchday · Week {lm.fixture.week} · {lm.fixture.home ? "Home" : "Away"}
            </span>
            <button
              className="text-xs opacity-80 hover:opacity-100"
              onClick={() => {
                if (confirm("Abandon the match? Progress this fixture will be lost."))
                  update((s) => cancelLiveMatch(s));
              }}
            >
              Close
            </button>
          </div>

          {/* Scoreline */}
          <div className="p-5 grid grid-cols-3 items-center gap-3 text-center">
            <div>
              <div className="font-display text-xl truncate">{lm.fixture.home ? usName : themName}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lm.fixture.home ? "Home" : "Away"}
              </div>
            </div>
            <div className="font-display text-5xl tnum">
              {lm.fixture.home ? lm.ourGoals : lm.theirGoals}
              <span className="text-muted-foreground mx-2">–</span>
              {lm.fixture.home ? lm.theirGoals : lm.ourGoals}
            </div>
            <div>
              <div className="font-display text-xl truncate">{lm.fixture.home ? themName : usName}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {lm.fixture.home ? "Away" : "Home"}
              </div>
            </div>
          </div>

          {/* Brief */}
          {lm.status === "brief" && (
            <div className="p-4 border-t space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info2 label="Weather" value={lm.weather} />
                <Info2
                  label="Projected gate"
                  value={
                    lm.fixture.home
                      ? `${lm.projectedAttendance.toLocaleString()} fans`
                      : "Away — no gate"
                  }
                />
                <Info2 label="Board expects" value={lm.boardExpectation} />
                <Info2 label="Form" value={lm.formGuide} />
                <Info2 label="Us" value={`Str ${Math.round(lm.ourStrength)}`} />
                <Info2 label="Them" value={`Str ${Math.round(lm.oppStrength)}`} />
              </div>
              <Button className="w-full" onClick={() => update((s) => kickoff(s))}>
                Kick off
              </Button>
            </div>
          )}

          {/* Half time */}
          {lm.status === "halfTime" && lm.halfTimeOptions && (
            <div className="p-4 border-t space-y-3">
              <div className="text-sm font-semibold">Half time — your call</div>
              <div className="grid gap-2">
                {lm.halfTimeOptions.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => update((s) => applyHalfTimeChoice(s, o.id))}
                    className="text-left rounded-lg border p-3 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{o.label}</span>
                      {o.winBonusCost > 0 && (
                        <span className="text-xs text-[color:var(--color-expense)] tnum">
                          Bonus if win: {fmtMoney(o.winBonusCost)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Full time */}
          {lm.status === "fullTime" && (
            <div className="p-4 border-t space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm tnum">
                <Info2 label="Attendance" value={lm.attendance.toLocaleString()} />
                <Info2 label="Gate" value={fmtMoney(lm.gateReceipts)} />
                <Info2 label="TV" value={fmtMoney(lm.tvIncome)} />
                <Info2
                  label="Matchday ops"
                  value={`-${fmtMoney(lm.matchdayOps)}`}
                  tone="bad"
                />
                {lm.winBonus > 0 && (
                  <Info2 label="Win bonus" value={`-${fmtMoney(lm.winBonus)}`} tone="bad" />
                )}
              </div>
              <Button className="w-full" onClick={() => update((s) => commitLiveMatchAndAdvance(s))}>
                Confirm & advance week <ChevronsRight className="size-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Ticker */}
          <div className="border-t bg-muted/30 max-h-64 overflow-y-auto">
            {lm.events.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                {lm.status === "brief" ? "Pre-match — ready to kick off." : "No events yet."}
              </div>
            ) : (
              <ul className="text-sm divide-y">
                {lm.events.map((e, i) => (
                  <li key={i} className="px-3 py-2 flex items-center gap-3">
                    <span className="text-xs w-8 text-muted-foreground tnum">{e.minute}'</span>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded",
                        e.type === "goal"
                          ? "bg-[color:var(--color-income)]/20 text-[color:var(--color-income)]"
                          : e.type === "card"
                            ? "bg-yellow-500/20 text-yellow-700"
                            : "bg-muted",
                      )}
                    >
                      {e.type.toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        e.side === "us" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info2({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-display text-base",
          tone === "bad" && "text-[color:var(--color-expense)]",
          tone === "good" && "text-[color:var(--color-income)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================================================================
   INBOX — Communication backbone
   ========================================================================= */

type InboxFilter = "all" | "unread" | "decisions" | "archive";

function InboxTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [category, setCategory] = useState<InboxCategory | "any">("any");
  const [department, setDepartment] = useState<InboxDepartment | "any">("any");
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    // Newest first
    const all = [...state.inbox].sort(
      (a, b) =>
        b.season - a.season ||
        b.week - a.week ||
        b.id.localeCompare(a.id),
    );
    return all.filter((i) => {
      if (filter === "unread" && i.status !== "unread" && i.status !== "awaitingDecision") return false;
      if (filter === "decisions" && i.status !== "awaitingDecision") return false;
      if (filter === "archive" && i.status !== "completed" && i.status !== "expired" && i.status !== "read") return false;
      if (category !== "any" && i.category !== category) return false;
      if (department !== "any" && i.department !== department) return false;
      return true;
    });
  }, [state.inbox, filter, category, department]);

  const open = openId ? state.inbox.find((i) => i.id === openId) ?? null : null;
  const unread = unreadCount(state);
  const decisions = state.inbox.filter((i) => i.status === "awaitingDecision").length;

  return (
    <div className="space-y-4">
      <Section
        title="Inbox — Club communications"
        info="Every department, sponsor, journalist and official routes their reports and decisions through here. This is the club's central nervous system. Unread items are shown first; decisions won't disappear until you answer them."
        right={
          <span className="flex items-center gap-2 text-[10px]">
            <span className="rounded-full bg-rose-500 text-white px-2 py-0.5">{unread} unread</span>
            {decisions > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5">{decisions} decision{decisions > 1 ? "s" : ""}</span>
            )}
          </span>
        }
      >
        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(["all", "unread", "decisions", "archive"] as InboxFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted",
              )}
            >
              {f === "all" ? "All" : f === "unread" ? "Unread" : f === "decisions" ? "Decisions" : "Archive"}
            </button>
          ))}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InboxCategory | "any")}
            className="text-xs px-2 py-1 rounded-md border bg-card"
          >
            <option value="any">All categories</option>
            {(Object.keys(CATEGORY_META) as InboxCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as InboxDepartment | "any")}
            className="text-xs px-2 py-1 rounded-md border bg-card"
          >
            <option value="any">All departments</option>
            {DEPARTMENTS_ALL.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {items.some((i) => i.status === "read" || i.status === "completed" || i.status === "expired") && (
            <button
              onClick={() => update((s) => clearReadInbox(s))}
              className="ml-auto text-xs px-2.5 py-1 rounded-full border text-muted-foreground hover:text-foreground"
            >
              Clear read
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Nothing to show under this filter.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => {
                    setOpenId(it.id);
                    if (it.status === "unread") update((s) => markInboxRead(s, it.id));
                  }}
                  className={cn(
                    "w-full text-left py-2.5 px-1 flex items-start gap-3 hover:bg-muted/60 transition-colors",
                    (it.status === "unread" || it.status === "awaitingDecision") && "bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 shrink-0 size-2 rounded-full",
                      it.status === "unread" ? "bg-primary" :
                      it.status === "awaitingDecision" ? "bg-amber-500" :
                      it.status === "expired" ? "bg-rose-400" :
                      "bg-transparent border border-muted-foreground/40",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span className={cn("rounded px-1.5 py-0.5 text-white text-[9px]", CATEGORY_META[it.category].color)}>
                        {CATEGORY_META[it.category].label}
                      </span>
                      <span className="truncate">{it.department}</span>
                      <span className="ml-auto shrink-0">S{it.season} · W{it.week}</span>
                    </div>
                    <div className={cn(
                      "text-sm mt-0.5 truncate",
                      (it.status === "unread" || it.status === "awaitingDecision") ? "font-medium" : "text-muted-foreground",
                    )}>
                      {it.subject}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span className="truncate">{it.sender}</span>
                      <span className={PRIORITY_META[it.priority].className}>· {PRIORITY_META[it.priority].label}</span>
                      {it.expiresWeek != null && it.status === "awaitingDecision" && (
                        <span className="text-amber-600 ml-auto shrink-0">
                          Expires W{it.expiresWeek}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {open && (
        <InboxDetail
          item={open}
          state={state}
          onClose={() => setOpenId(null)}
          onChoose={(choiceId) => {
            update((s) => handleInboxChoice(s, open.id, choiceId));
            setOpenId(null);
          }}
          onDismiss={() => {
            update((s) => dismissInboxItem(s, open.id));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

function InboxDetail({
  item,
  state,
  onClose,
  onChoose,
  onDismiss,
}: {
  item: InboxItem;
  state: GameState;
  onClose: () => void;
  onChoose: (choiceId: string) => void;
  onDismiss: () => void;
}) {

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            <span className={cn("rounded px-1.5 py-0.5 text-white text-[9px]", CATEGORY_META[item.category].color)}>
              {CATEGORY_META[item.category].label}
            </span>
            <span>{item.department}</span>
            <span className="ml-auto">S{item.season} · W{item.week}</span>
          </div>
          <SheetTitle className="text-base leading-tight">{item.subject}</SheetTitle>
          <div className="text-xs text-muted-foreground">
            From <span className="font-medium text-foreground">{item.sender}</span>
            <span className={cn("ml-2", PRIORITY_META[item.priority].className)}>
              · {PRIORITY_META[item.priority].label} priority
            </span>
            {item.status === "expired" && (
              <span className="ml-2 text-rose-500">· Expired</span>
            )}
            {item.status === "completed" && (
              <span className="ml-2 text-emerald-600">· Completed</span>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 text-sm whitespace-pre-wrap leading-relaxed">
          {item.body}
        </div>

        {item.choices && item.choices.length > 0 && (
          <div className="mt-5 space-y-2">
            {item.status === "completed" && item.chosenChoiceId ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                Decided: {item.choices.find((c) => c.id === item.chosenChoiceId)?.label}
              </div>
            ) : item.status === "expired" ? (
              <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
                This message expired before you responded. Consequences have been applied.
              </div>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Decision required
                </div>
                {item.choices.map((c) => {
                  const avail = evaluateChoice(state, c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => avail.available && onChoose(c.id)}
                      disabled={!avail.available}
                      className={cn(
                        "w-full text-left rounded-md border p-3 transition-colors",
                        avail.available
                          ? "hover:border-primary hover:bg-muted/50"
                          : "opacity-60 cursor-not-allowed bg-muted/30",
                      )}
                    >
                      <div className="text-sm font-medium">{c.label}</div>
                      {c.hint && (
                        <div className="text-xs text-muted-foreground mt-0.5">{c.hint}</div>
                      )}
                      {!avail.available && (
                        <div className="text-[11px] text-rose-600 mt-1">
                          {avail.reasons.join(" ")}
                        </div>
                      )}
                    </button>
                  );
                })}

              </>
            )}
          </div>
        )}

        {(!item.choices || item.status === "read" || item.status === "completed") && (
          <div className="mt-5 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onDismiss}>Close</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
