import { useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
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
import { facilityModifiers } from "@/lib/game/infrastructure";
import { Section, Stat } from "./shared/primitives";

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

export function StaffTab({
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
    terms: staffJoinTerms(state.reputation, c, facilityModifiers(state).staffAttraction),
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
          <Stat
            label="Club reputation"
            value={String(Math.round(state.reputation))}
            sub="drives who'll join"
          />
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
            You haven't hired anyone yet. Browse the shortlist below and appoint your manager and
            specialists.
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

export function StaffCard({
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
              <span className="text-muted-foreground"> (listed {fmtMoneyExact(staff.wage)})</span>
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
