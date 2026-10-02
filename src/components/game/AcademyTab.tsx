import { useMemo } from "react";
import { ArrowRight, GraduationCap, Minus, Plus, Sparkles, TrendingUp } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import {
  ACADEMY_STATUSES,
  DECISION_DEADLINE_WEEK,
  academyIntakeNeedsReveal,
  academyPotentialError,
  academyState,
  academyStatus,
  academyWeeklyCost,
  acceptAcademyOffer,
  decisionsDue,
  estimatedPotential,
  extendAcademyProspect,
  foundAcademy,
  graduateWage,
  markAcademyIntakeSeen,
  maxAcademyStatusFor,
  prospectAge,
  prospectReadiness,
  prospectStars,
  rejectAcademyOffer,
  releaseAcademyProspect,
  setAcademyScholarships,
  signAcademyProspect,
  upgradeAcademy,
  type AcademyProspect,
} from "@/lib/game/academy";
import { clubDisplayName } from "@/lib/game/clubReference";
import { clubKitFor } from "@/lib/game/clubKit";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { Button } from "@/components/ui/button";
import { OverviewScreen } from "./shared/layout";
import { CharacterPortrait } from "./CharacterPortrait";
import { cn } from "@/lib/utils";

const POSITION_TONE = {
  GK: "bg-amber-100 text-amber-800",
  DEF: "bg-sky-100 text-sky-800",
  MID: "bg-emerald-100 text-emerald-800",
  FWD: "bg-rose-100 text-rose-800",
} as const;

export function AcademyTab({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const academy = academyState(state);
  const status = academyStatus(state);
  const maxStatus = maxAcademyStatusFor(state);
  const head = state.hiredStaff.find((staff) => staff.role === "Head of Youth");
  const due = decisionsDue(state);
  const kit = clubKitFor(state);
  const reveal = academyIntakeNeedsReveal(state);
  const currentIntake = academy.prospects.filter((prospect) => prospect.joinedSeason === academy.lastIntakeSeason);
  const golden = currentIntake.some((prospect) => prospect.golden);

  if (academy.status === 0) {
    return (
      <OverviewScreen title="Youth Academy" subtitle="Build a pathway from local talent to your first team.">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="panel-strip relative p-5 md:p-7">
            <GraduationCap className="absolute right-5 top-4 size-20 opacity-10" />
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">Youth Academy</div>
            <h2 className="mt-1 font-display text-3xl">Grow your own</h2>
            <p className="mt-2 max-w-2xl text-sm opacity-85">
              Right now the club relies on local triallists. A youth scheme creates a proper intake,
              develops players under your own coaches and gives supporters graduates to call their own.
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x border-b text-center">
            <Metric value={fmtMoneyExact(ACADEMY_STATUSES[1].upgradeCost)} label="Set-up" />
            <Metric value={\`\${fmtMoney(ACADEMY_STATUSES[1].weeklyCost)}/wk\`} label="Base running" />
            <Metric value={\`up to \${ACADEMY_STATUSES[1].maxScholarships}/yr\`} label="Scholars" />
          </div>
          <div className="p-5">
            <Button onClick={() => update(foundAcademy)} disabled={state.cash < ACADEMY_STATUSES[1].upgradeCost} className="w-full sm:w-auto">
              <GraduationCap className="mr-2 size-4" /> Start a Youth Scheme
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">Your first intake arrives immediately. Costs are booked through the club finance ledger.</p>
          </div>
        </section>
      </OverviewScreen>
    );
  }

  return (
    <OverviewScreen
      title="Youth Academy"
      subtitle={\`\${status.name} · \${academy.prospects.length} scholars · \${fmtMoney(academyWeeklyCost(state))}/wk\`}
      className="grid content-start gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.75fr)]"
    >
      <div className="space-y-3">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="panel-strip p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Youth Academy</div>
                <h2 className="font-display text-2xl">{status.name}</h2>
                <p className="mt-1 text-xs opacity-80">{status.blurb}</p>
              </div>
              <div className="text-right text-xs">
                <div className="font-semibold">{fmtMoney(academyWeeklyCost(state))}/wk</div>
                <div className="opacity-70">running cost</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1">
              {ACADEMY_STATUSES.slice(1).map((def) => (
                <div key={def.id} className="min-w-0">
                  <div className={cn("h-1.5 rounded-full", def.id <= academy.status ? "bg-emerald-400" : "bg-white/15")} />
                  <div className={cn("mt-1 truncate text-[8px] uppercase tracking-wide", def.id === academy.status ? "font-bold text-white" : "opacity-50")}>{def.name}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x border-b text-center">
            <Metric value={String(academy.scholarships)} label="Scholarships" />
            <Metric value={\`×\${(1 + status.coaching).toFixed(2)}\`} label="Academy boost" />
            <Metric value={String(Math.round(academy.reputation))} label="Reputation" />
            <Metric value={String(academy.graduates.filter((g) => g.outcome === "promoted").length)} label="Graduates" />
          </div>
          <div className="grid gap-2 p-3 md:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-xs font-semibold">Scholarships per intake</div>
              <div className="mt-2 flex items-center gap-2">
                <Button size="icon" variant="outline" className="size-8" disabled={academy.scholarships <= 1} onClick={() => update((s) => setAcademyScholarships(s, academy.scholarships - 1))}><Minus className="size-4" /></Button>
                <div className="min-w-8 text-center font-display text-xl">{academy.scholarships}</div>
                <Button size="icon" variant="outline" className="size-8" disabled={academy.scholarships >= status.maxScholarships} onClick={() => update((s) => setAcademyScholarships(s, academy.scholarships + 1))}><Plus className="size-4" /></Button>
                <span className="text-xs text-muted-foreground">up to {status.maxScholarships} at this status</span>
              </div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="text-xs font-semibold">Head of Youth</div>
              <div className="mt-1 text-sm">{head?.name ?? "Vacant"}</div>
              <div className="text-xs text-muted-foreground">
                {head ? \`Development \${head.stats.development} · potential estimate ±\${academyPotentialError(state)}\` : "Hire a Head of Youth to improve development and potential estimates."}
              </div>
            </div>
          </div>
          {academy.status < 5 && (
            <div className="border-t p-3">
              {academy.status + 1 <= maxStatus ? (
                <Button
                  variant="outline"
                  disabled={state.cash < ACADEMY_STATUSES[(academy.status + 1) as 1|2|3|4|5].upgradeCost}
                  onClick={() => update(upgradeAcademy)}
                >
                  Upgrade to {ACADEMY_STATUSES[(academy.status + 1) as 1|2|3|4|5].name}
                  <span className="ml-2 text-muted-foreground">{fmtMoneyExact(ACADEMY_STATUSES[(academy.status + 1) as 1|2|3|4|5].upgradeCost)}</span>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">The next academy category unlocks higher in the football pyramid.</p>
              )}
            </div>
          )}
        </section>

        {academy.offers.length > 0 && (
          <section className="overflow-hidden rounded-2xl border bg-amber-50/60">
            <div className="border-b px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">Approaches for your prospects</div>
            {academy.offers.map((offer) => {
              const prospect = academy.prospects.find((p) => p.id === offer.prospectId);
              if (!prospect) return null;
              return (
                <div key={offer.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{prospect.firstName} {prospect.lastName}</div>
                    <div className="text-xs text-muted-foreground">{clubDisplayName(state, offer.clubId)} offer {fmtMoneyExact(offer.fee)}</div>
                  </div>
                  <Button size="sm" onClick={() => update((s) => acceptAcademyOffer(s, offer.id))}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => update((s) => rejectAcademyOffer(s, offer.id))}>Keep</Button>
                </div>
              );
            })}
          </section>
        )}

        {due.length > 0 && (
          <section className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-600">End of scholarship</span>
              <span className="text-xs text-muted-foreground">Decide by week {DECISION_DEADLINE_WEEK}</span>
            </div>
            {due.map((prospect) => <ProspectDecision key={prospect.id} state={state} prospect={prospect} update={update} kit={kit} />)}
          </section>
        )}

        <ProspectGroups state={state} kit={kit} />
      </div>

      <aside className="space-y-3">
        <section className="rounded-2xl border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Pipeline</div>
          <div className="mt-2 space-y-2">
            {[15,16,17,18,19].map((age) => {
              const count = academy.prospects.filter((p) => prospectAge(state,p) === age).length;
              return <div key={age} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm"><span>Age {age}</span><strong>{count}</strong></div>;
            })}
          </div>
        </section>
        <section className="rounded-2xl border bg-card p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Graduates</div>
          <div className="mt-2 space-y-2">
            {academy.graduates.slice(-8).reverse().map((graduate) => (
              <div key={\`\${graduate.prospectId}:\${graduate.season}:\${graduate.outcome}\`} className="flex items-center gap-2 text-xs">
                <span className={cn("rounded px-1.5 py-0.5 font-semibold", POSITION_TONE[graduate.position])}>{graduate.position}</span>
                <span className="min-w-0 flex-1 truncate">{graduate.name}</span>
                <span className="shrink-0 text-muted-foreground">S{graduate.season} · {graduate.outcome === "promoted" ? "First team" : graduate.outcome === "sold" ? \`Sold \${fmtMoney(graduate.fee ?? 0)}\` : "Released"}</span>
              </div>
            ))}
            {!academy.graduates.length && <p className="text-xs text-muted-foreground">Your academy honours board is waiting for its first name.</p>}
          </div>
        </section>
      </aside>

      {reveal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl">
            <div className="panel-strip relative p-5">
              <Sparkles className="absolute right-5 top-4 size-7 text-amber-300" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">Intake day · Season {academy.lastIntakeSeason}</div>
              <h2 className="mt-1 font-display text-3xl">{golden ? "A golden generation?" : "Meet the new intake"}</h2>
              <p className="mt-1 text-sm opacity-80">{golden ? "The coaches think this group could be special." : "The newest scholars have reported for their first day."}</p>
            </div>
            <div className="divide-y">{currentIntake.map((prospect) => <ProspectRow key={prospect.id} state={state} prospect={prospect} kit={kit} compact />)}</div>
            <div className="p-4"><Button className="w-full" onClick={() => update(markAcademyIntakeSeen)}>Welcome them <ArrowRight className="ml-2 size-4" /></Button></div>
          </section>
        </div>
      )}
    </OverviewScreen>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return <div className="min-w-0 px-2 py-2"><div className="truncate font-display text-lg">{value}</div><div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div></div>;
}

function ProspectGroups({ state, kit }: { state: GameState; kit: ReturnType<typeof clubKitFor> }) {
  const academy = academyState(state);
  const dueIds = new Set(decisionsDue(state).map((prospect) => prospect.id));
  const grouped = useMemo(() => {
    const map = new Map<number, AcademyProspect[]>();
    for (const prospect of academy.prospects.filter((p) => !dueIds.has(p.id))) {
      const age = prospectAge(state, prospect);
      map.set(age, [...(map.get(age) ?? []), prospect]);
    }
    return [...map.entries()].sort((a,b) => b[0]-a[0]);
  }, [academy.prospects, state.season]);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Prospects</div>
      {grouped.map(([age, prospects]) => (
        <div key={age}>
          <div className="bg-muted/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Age {age} · {prospects.length}</div>
          <div className="divide-y">{prospects.sort((a,b)=>b.potential-a.potential).map((prospect) => <ProspectRow key={prospect.id} state={state} prospect={prospect} kit={kit} />)}</div>
        </div>
      ))}
      {!grouped.length && <div className="p-5 text-sm text-muted-foreground">No developing prospects outside the decision group.</div>}
    </section>
  );
}

function ProspectRow({ state, prospect, kit, compact = false }: { state: GameState; prospect: AcademyProspect; kit: ReturnType<typeof clubKitFor>; compact?: boolean }) {
  const stars = prospectStars(state, prospect);
  const readiness = prospectReadiness(state, prospect);
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <CharacterPortrait identity={{ id: prospect.id, subject: "player" }} kit={{ kit: kit.home, badge: kit.badge, clubName: state.clubName }} size={compact ? 40 : 46} title={\`\${prospect.firstName} \${prospect.lastName} portrait\`} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", POSITION_TONE[prospect.position])}>{prospect.position}</span>
          <strong className="truncate text-sm">{prospect.firstName} {prospect.lastName}</strong>
          {prospect.golden && <Sparkles className="size-3.5 shrink-0 text-amber-500" />}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Age {prospectAge(state,prospect)} · {prospect.nationality} · {prospect.personality}</div>
        {!compact && <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-amber-400" style={{ width: \`\${readiness}%\` }} /></div>
          <span className="text-[9px] text-muted-foreground">Ready {readiness}%</span>
          {prospect.lastGain > 0 && <span className="inline-flex items-center text-[9px] text-emerald-600"><TrendingUp className="mr-0.5 size-3" />{prospect.lastGain}</span>}
        </div>}
      </div>
      <div className="shrink-0 text-sm text-amber-500" title={\`Estimated potential \${estimatedPotential(state,prospect)}\`}>
        {"★".repeat(stars)}<span className="text-muted-foreground/40">{"☆".repeat(5-stars)}</span>
      </div>
    </div>
  );
}

function ProspectDecision({ state, prospect, update, kit }: { state: GameState; prospect: AcademyProspect; update:(fn:(s:GameState)=>GameState)=>void; kit:ReturnType<typeof clubKitFor> }) {
  const wage = graduateWage(state, prospect);
  return (
    <div className="border-b p-3 last:border-b-0">
      <ProspectRow state={state} prospect={prospect} kit={kit} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button size="sm" onClick={() => update((s) => signAcademyProspect(s, prospect.id))}>Sign · {fmtMoney(wage)}/wk</Button>
        <Button size="sm" variant="outline" disabled={Boolean(prospect.extended)} onClick={() => update((s) => extendAcademyProspect(s, prospect.id))}>+1 year</Button>
        <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => update((s) => releaseAcademyProspect(s, prospect.id))}>Release</Button>
      </div>
    </div>
  );
}
