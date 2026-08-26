import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Search, UserMinus, UserPlus, Users } from "lucide-react";
import type { GameState, Staff, StaffRole } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  fmtMoneyExact,
  hireStaffMember,
  hiredStaffWagesWeekly,
  sackStaffMember,
  severanceFor,
  staffJoinTerms,
} from "@/lib/game/engine";
import { renewStaffContract } from "@/lib/game/staffCareers";
import { facilityModifiers } from "@/lib/game/infrastructure";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { OverviewScreen, WorkflowTile } from "./shared/layout";

const STAT_KEYS: (keyof Staff["stats"])[] = [
  "tactics",
  "attack",
  "defense",
  "development",
  "scouting",
  "negotiation",
  "medical",
  "motivation",
];
const STAT_LABEL: Record<keyof Staff["stats"], string> = {
  tactics: "Tac",
  attack: "Att",
  defense: "Def",
  development: "Dev",
  scouting: "Sct",
  negotiation: "Neg",
  medical: "Med",
  motivation: "Mot",
};

type StaffView = "home" | "team" | "market";

const ROLES: StaffRole[] = [
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

const FOOTBALL_ROLES: StaffRole[] = [
  "Manager",
  "Assistant Manager",
  "Head Coach",
  "Goalkeeping Coach",
  "Fitness Coach",
];

export function StaffTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<StaffView>("home");
  const [filter, setFilter] = useState<"All" | StaffRole>("All");
  const [minRating, setMinRating] = useState(0);
  const [maxWage, setMaxWage] = useState(0);
  const [willingOnly, setWillingOnly] = useState(true);
  const [sortBy, setSortBy] = useState<"rating" | "wage" | "age" | "fit">("fit");

  const manager = state.hiredStaff.find((s) => s.role === "Manager");
  const weeklyStaffCost = hiredStaffWagesWeekly(state);
  const enriched = state.staffCandidates.map((c) => ({
    staff: c,
    terms: staffJoinTerms(state.reputation, c, facilityModifiers(state).staffAttraction),
  }));
  const willingCount = enriched.filter((e) => e.terms.willing).length;
  const footballStaffCount = state.hiredStaff.filter((s) => FOOTBALL_ROLES.includes(s.role)).length;
  const specialistCount = state.hiredStaff.filter((s) => !FOOTBALL_ROLES.includes(s.role)).length;
  const expiringCount = state.hiredStaff.filter((s) => s.contractWeeks <= 24).length;

  const hire = (id: string) => {
    const res = hireStaffMember(state, id);
    if (!res.ok) return alert(res.reason ?? "Unable to hire.");
    update(() => res.state);
  };

  const release = (id: string) => {
    const st = state.hiredStaff.find((h) => h.id === id);
    if (!st) return;
    if (!confirm(`Release ${st.name}? Severance of ${fmtMoneyExact(severanceFor(st))} due.`)) {
      return;
    }
    const res = sackStaffMember(state, id);
    if (!res.ok) return alert(res.reason ?? "Unable to release.");
    update(() => res.state);
  };

  const renew = (id: string) => {
    const st = state.hiredStaff.find((h) => h.id === id);
    if (!st) return;
    const bonus = st.wage * 2;
    if (!confirm(`Renew ${st.name} for 2 seasons? Renewal bonus: ${fmtMoneyExact(bonus)}.`)) {
      return;
    }
    const res = renewStaffContract(state, id, 2);
    if (!res.ok) return alert(res.reason ?? "Unable to renew contract.");
    update(() => res.state);
  };

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
      const aw = a.terms.willing ? 0 : 1;
      const bw = b.terms.willing ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return b.staff.rating - a.staff.rating;
    });

  if (view === "team") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setView("home")}>
          <ArrowLeft className="size-4 mr-2" /> Back to staff
        </Button>
        <div>
          <h1 className="font-display text-3xl">Your staff</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contracts now matter. Renew key people before they reach zero weeks.
          </p>
        </div>
        {expiringCount > 0 && (
          <div className="rounded-2xl border border-amber-500/60 bg-amber-500/5 p-4">
            <div className="font-semibold">
              {expiringCount} contract{expiringCount === 1 ? "" : "s"} need attention
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Staff inside 24 weeks can be renewed from their card.
            </div>
          </div>
        )}
        {state.hiredStaff.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
            Nobody hired yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {state.hiredStaff.map((s) => (
              <StaffCard
                key={s.id}
                staff={s}
                onAction={() => release(s.id)}
                onRenew={() => renew(s.id)}
                action="release"
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "market") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setView("home")}>
            <ArrowLeft className="size-4 mr-2" /> Back to staff
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">Advanced filters</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filter candidates</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 mt-5">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={filter === "All" ? "default" : "outline"}
                    onClick={() => setFilter("All")}
                  >
                    All roles
                  </Button>
                  {ROLES.map((role) => (
                    <Button
                      key={role}
                      variant={filter === role ? "default" : "outline"}
                      onClick={() => setFilter(role)}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label>Minimum rating: {minRating}</Label>
                  <Slider
                    value={[minRating]}
                    min={0}
                    max={95}
                    step={5}
                    onValueChange={(v) => setMinRating(v[0])}
                    className="mt-3"
                  />
                </div>
                <div>
                  <Label>Maximum wage per week</Label>
                  <Input
                    type="number"
                    value={maxWage}
                    min={0}
                    step={500}
                    onChange={(e) => setMaxWage(Number(e.target.value) || 0)}
                    className="mt-2 h-12"
                  />
                </div>
                <label className="flex items-center gap-3 min-h-12">
                  <input
                    type="checkbox"
                    checked={willingOnly}
                    onChange={(e) => setWillingOnly(e.target.checked)}
                  />
                  <span>Only show people willing to join</span>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Sort by</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="mt-2 h-12 w-full rounded-xl border bg-background px-3"
                  >
                    <option value="fit">Best fit</option>
                    <option value="rating">Highest rated</option>
                    <option value="wage">Cheapest</option>
                    <option value="age">Youngest</option>
                  </select>
                </label>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div>
          <h1 className="font-display text-3xl">Hire staff</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Showing {filtered.length} candidates. The market refreshes through the season and at
            each new season.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {["Manager", "Head Coach", "Head of Transfers", "Head Physio"].map((role) => (
            <button
              key={role}
              onClick={() => setFilter(role as StaffRole)}
              className={cn(
                "min-h-20 rounded-2xl border p-3 text-left font-semibold",
                filter === role
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:border-primary/50",
              )}
            >
              {role}
            </button>
          ))}
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
            <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground md:col-span-2">
              No candidates match. Open Advanced filters to widen the search.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <OverviewScreen
      title="Staff"
      subtitle="Appoint the right people and keep an eye on contracts."
      className="grid content-start gap-2 md:gap-3 xl:grid-cols-[minmax(320px,.9fr)_minmax(0,1.6fr)] xl:content-stretch"
    >
      <section className="flex flex-col justify-center rounded-xl border bg-card p-3 shadow-sm md:p-4">
        <div className="text-xs text-muted-foreground">Manager</div>
        <div className="truncate font-display text-2xl leading-tight md:text-3xl">
          {manager ? manager.name : "Vacant"}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground md:text-sm">
          {manager
            ? `Rating ${manager.rating} · ${fmtMoneyExact(manager.wage)}/wk · ${manager.contractWeeks} weeks left`
            : "Your most important football appointment"}
        </div>
        {!manager && (
          <Button
            className="mt-2 h-11 w-full md:mt-3"
            onClick={() => {
              setFilter("Manager");
              setView("market");
            }}
          >
            <UserPlus className="size-5 mr-2" /> Find a manager
          </Button>
        )}
        {manager && manager.contractWeeks <= 24 && (
          <Button className="mt-2 h-11 w-full md:mt-3" onClick={() => renew(manager.id)}>
            Renew manager contract
          </Button>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <StaffAction
          icon={<Users className="size-5 md:size-6" />}
          title="Your team"
          value={`${state.hiredStaff.length} staff`}
          sub={
            expiringCount
              ? `${expiringCount} contract${expiringCount === 1 ? "" : "s"} expiring`
              : `${fmtMoneyExact(weeklyStaffCost)}/wk`
          }
          onClick={() => setView("team")}
        />
        <StaffAction
          icon={<Search className="size-5 md:size-6" />}
          title="Hire someone"
          value={`${willingCount} willing`}
          sub="Live staff market"
          onClick={() => setView("market")}
        />
        <StaffAction
          icon={<BriefcaseBusiness className="size-5 md:size-6" />}
          title="Football staff"
          value={String(footballStaffCount)}
          sub="Coaching team"
          onClick={() => setView("team")}
        />
        <StaffAction
          icon={<BriefcaseBusiness className="size-5 md:size-6" />}
          title="Specialists"
          value={String(specialistCount)}
          sub="Recruitment, youth & medical"
          onClick={() => setView("team")}
        />
      </div>
    </OverviewScreen>
  );
}

function StaffAction({
  icon,
  title,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return <WorkflowTile icon={icon} title={title} value={value} sub={sub} onClick={onClick} />;
}

export function StaffCard({
  staff,
  onAction,
  onRenew,
  action,
  affordable = true,
  terms,
}: {
  staff: Staff;
  onAction: () => void;
  onRenew?: () => void;
  action: "hire" | "release";
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
        "rounded-2xl border bg-card p-4",
        terms && !terms.willing && "opacity-70",
        action === "release" && staff.contractWeeks <= 12 && "border-amber-500/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xl leading-tight truncate">{staff.name}</div>
          <div className="text-sm text-muted-foreground">
            {staff.role} · Age {staff.age}
          </div>
          {action === "release" && (
            <div
              className={cn(
                "text-xs mt-1",
                staff.contractWeeks <= 12
                  ? "text-amber-600 font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {staff.contractWeeks} weeks left
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div
            className={cn(
              "font-display text-3xl leading-none",
              staff.rating >= 80 && "text-emerald-600",
              staff.rating >= 65 && staff.rating < 80 && "text-amber-600",
              staff.rating < 65 && "text-muted-foreground",
            )}
          >
            {staff.rating}
          </div>
          <div className="text-[10px] text-muted-foreground">OVERALL</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px] tnum">
        {STAT_KEYS.map((k) => (
          <div key={k} className="rounded bg-muted px-1.5 py-1 flex justify-between">
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
            "mt-3 text-xs rounded-xl px-3 py-2",
            !terms.willing && "bg-rose-500/10 text-rose-600",
            terms.willing && premiumPct > 0 && "bg-amber-500/10 text-amber-700",
            terms.willing && premiumPct <= 0 && "bg-emerald-500/10 text-emerald-700",
          )}
        >
          {terms.note}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">{fmtMoneyExact(wage)}/wk</div>
          <div className="text-xs text-muted-foreground">
            {action === "hire"
              ? `Bonus ${fmtMoneyExact(bonus)}`
              : `Severance ${fmtMoneyExact(severanceFor(staff))}`}
          </div>
        </div>
        {action === "hire" ? (
          <Button className="min-w-24" onClick={onAction} disabled={!canHire}>
            <UserPlus className="size-4 mr-1" /> Hire
          </Button>
        ) : (
          <div className="flex gap-2">
            {staff.contractWeeks <= 24 && onRenew && (
              <Button variant="outline" onClick={onRenew}>
                Renew
              </Button>
            )}
            <Button variant="destructive" onClick={onAction}>
              <UserMinus className="size-4 mr-1" /> Release
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
