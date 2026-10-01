import { useState } from "react";
import { ArrowLeft, BriefcaseBusiness, CheckCircle2, MessageCircle, Pencil, Search, SlidersHorizontal, UserMinus, UserPlus, Users } from "lucide-react";
import type { GameState, Staff, StaffRole } from "@/lib/game/types";
import type { ManagerOffer } from "@/lib/game/staff";
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
  staffJoinTermsForState,
} from "@/lib/game/engine";
import {
  completeAcceptedManagerDeal,
  evaluateManagerBargainingOffer,
  managerOfferSeasons,
  managerOpeningPosition,
} from "@/lib/game/managerNegotiation";
import { managerFootballIdentity } from "@/lib/game/managerIdentity";
import { managerSquadFit } from "@/lib/game/managerSquadFit";
import { managerPersonality, managerRelationship } from "@/lib/game/managerRelationship";
import { managerRecruitmentCommitment } from "@/lib/game/managerRecruitmentCommitment";
import { absoluteWeek } from "@/lib/game/time";
import { renewStaffContract } from "@/lib/game/staffCareers";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OverviewScreen, WorkflowTile } from "./shared/layout";
import { medicalSupport } from "@/lib/game/playerHealth";
import { CharacterPortrait } from "./CharacterPortrait";
import { CharacterPortraitStudio } from "./CharacterPortraitStudio";
import { useCharacterName } from "@/hooks/useCharacterName";

const STAT_KEYS: (keyof Staff["stats"])[] = ["tactics", "attack", "defense", "development", "scouting", "negotiation", "medical", "motivation"];
const STAT_LABEL: Record<keyof Staff["stats"], string> = { tactics: "Tac", attack: "Att", defense: "Def", development: "Dev", scouting: "Sct", negotiation: "Neg", medical: "Med", motivation: "Mot" };
type StaffView = "home" | "team" | "market";
const ROLES: StaffRole[] = ["Manager", "Assistant Manager", "Head Coach", "Goalkeeping Coach", "Fitness Coach", "Head of Youth", "Head of Transfers", "Chief Scout", "Scout", "Head Physio", "Sports Scientist"];
const FOOTBALL_ROLES: StaffRole[] = ["Manager", "Assistant Manager", "Head Coach", "Goalkeeping Coach", "Fitness Coach"];
const QUICK_ROLES: ("All" | StaffRole)[] = ["All", "Manager", "Head Coach", "Assistant Manager", "Head of Transfers", "Head Physio", "Chief Scout"];

function ManagerIdentityPanel({ staff, compact = false }: { staff: Staff; compact?: boolean }) {
  if (staff.role !== "Manager") return null;
  const identity = managerFootballIdentity(staff);
  return <div className={cn("rounded-xl border border-primary/15 bg-primary/[0.04]", compact ? "mt-2 p-2.5" : "mt-3 p-3")}><div className="flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">{identity.preferredFormation}</span><span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-semibold">{identity.philosophy}</span><span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{identity.pressing} press</span><span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{identity.tempo} tempo</span><span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{identity.directness} directness</span></div><div className="mt-2 text-xs leading-relaxed text-muted-foreground">{identity.summary}</div>{!compact&&<><div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]"><div className="rounded-lg bg-background/70 px-2 py-1.5"><span className="text-muted-foreground">Adaptability</span><div className="font-semibold">{identity.adaptability}</div></div><div className="rounded-lg bg-background/70 px-2 py-1.5"><span className="text-muted-foreground">Rotation</span><div className="font-semibold">{identity.rotation}</div></div><div className="rounded-lg bg-background/70 px-2 py-1.5"><span className="text-muted-foreground">Youth</span><div className="font-semibold">{identity.youthWillingness}</div></div></div><div className="mt-2 rounded-lg bg-background/55 px-2.5 py-2 text-[10px] leading-relaxed"><span className="font-semibold text-foreground">Other shapes: </span><span className="text-muted-foreground">{identity.alternativeFormations.join(" · ")||"None — strongly committed to his preferred shape"}</span></div></>}</div>;
}

function ManagerSquadFitPanel({ state, staff, compact = false }: { state: GameState; staff: Staff; compact?: boolean }) {
  if (staff.role !== "Manager") return null;
  const fit=managerSquadFit(state,staff); const tone=fit.band==="Excellent"?"text-emerald-700 bg-emerald-500/10 border-emerald-500/25":fit.band==="Good"?"text-lime-700 bg-lime-500/10 border-lime-500/25":fit.band==="Workable"?"text-amber-700 bg-amber-500/10 border-amber-500/25":"text-rose-700 bg-rose-500/10 border-rose-500/25";
  return <div className={cn("mt-2 rounded-xl border",tone,compact?"p-2.5":"p-3")}><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Squad fit</div><div className="font-display text-lg leading-tight">{fit.band}</div></div><div className="text-right"><div className="font-display text-2xl leading-none">{fit.score}</div><div className="text-[10px] opacity-70">/ 100</div></div></div><div className="mt-1.5 text-xs leading-relaxed opacity-90">{fit.summary}</div>{!compact&&(fit.strengths.length>0||fit.gaps.length>0)&&<div className="mt-2 grid gap-1 text-[10px] sm:grid-cols-2">{fit.strengths.map(item=><div key={item} className="rounded bg-background/55 px-2 py-1">✓ {item}</div>)}{fit.gaps.map(item=><div key={item} className="rounded bg-background/55 px-2 py-1">• {item}</div>)}</div>}</div>;
}


function ManagerRelationshipPanel({ state, staff }: { state: GameState; staff: Staff }) {
  if (staff.role !== "Manager") return null;
  const personality = managerPersonality(staff);
  const relationship = managerRelationship(state, staff);
  const commitment = managerRecruitmentCommitment(state, staff.id);
  const commitmentWeeks =
    commitment?.active
      ? Math.max(0, commitment.dueAtAbsoluteWeek - absoluteWeek(state.season, state.week))
      : null;
  const commitmentPosition =
    commitment?.position === "GK"
      ? "Goalkeeper"
      : commitment?.position === "DEF"
        ? "Defender"
        : commitment?.position === "MID"
          ? "Midfielder"
          : commitment?.position === "FWD"
            ? "Forward"
            : commitment?.position;
  const tone =
    relationship.band === "Excellent" || relationship.band === "Strong"
      ? "border-emerald-500/25 bg-emerald-500/[0.07]"
      : relationship.band === "Professional"
        ? "border-sky-500/20 bg-sky-500/[0.05]"
        : relationship.band === "Uneasy"
          ? "border-amber-500/25 bg-amber-500/[0.07]"
          : "border-rose-500/30 bg-rose-500/[0.08]";

  const metrics = [
    ["Trust", relationship.trust],
    ["Backing", relationship.backing],
    ["Autonomy", relationship.autonomy],
  ] as const;

  return (
    <div className={cn("mt-2 rounded-xl border p-3", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Chairman relationship</div>
          <div className="font-display text-lg">{relationship.band}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl leading-none tnum">{relationship.overall}</div>
          <div className="text-[9px] text-muted-foreground">/ 100</div>
        </div>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{relationship.summary}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-background/60 p-2">
            <div className="flex items-center justify-between gap-1 text-[9px]">
              <span className="text-muted-foreground">{label}</span>
              <strong className="tnum">{value}</strong>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-semibold">{personality.temperament}</span>
        <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{personality.ambition} ambition</span>
        <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{personality.controlStyle} control</span>
        <span className="rounded-full border bg-background/70 px-2 py-0.5 text-[10px]">{personality.financialPragmatism} financial pragmatism</span>
      </div>
      {commitment?.active && (
        <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-2.5">
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Active recruitment promise
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <strong className="text-xs">{commitmentPosition}</strong>
            <span className="text-[10px] text-muted-foreground">
              {commitmentWeeks === 0 ? "Due now" : commitmentWeeks === 1 ? "1 week left" : `${commitmentWeeks} weeks left`}
            </span>
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{personality.summary}</p>
    </div>
  );
}

export function StaffTab({ state, update }: { state: GameState; update: (fn: (s: GameState) => GameState) => void }) {
  const [view,setView]=useState<StaffView>("home"); const [filter,setFilter]=useState<"All"|StaffRole>("All"); const [minRating,setMinRating]=useState(0); const [maxWage,setMaxWage]=useState(0); const [willingOnly,setWillingOnly]=useState(true); const [sortBy,setSortBy]=useState<"rating"|"wage"|"age"|"fit">("fit");
  const [managerNegotiationId,setManagerNegotiationId]=useState<string|null>(null); const [managerOffer,setManagerOffer]=useState<ManagerOffer|null>(null); const [managerPosition,setManagerPosition]=useState<ManagerOffer|null>(null); const [managerCounter,setManagerCounter]=useState<ManagerOffer|null>(null); const [managerAcceptedOffer,setManagerAcceptedOffer]=useState<ManagerOffer|null>(null); const [managerRound,setManagerRound]=useState(1); const [managerMessage,setManagerMessage]=useState("");
  const manager=state.hiredStaff.find(s=>s.role==="Manager"); const medical=medicalSupport(state); const weeklyStaffCost=hiredStaffWagesWeekly(state); const enriched=state.staffCandidates.map(c=>({staff:c,terms:staffJoinTermsForState(state,c)})); const willingCount=enriched.filter(e=>e.terms.willing).length; const footballStaffCount=state.hiredStaff.filter(s=>FOOTBALL_ROLES.includes(s.role)).length; const specialistCount=state.hiredStaff.filter(s=>!FOOTBALL_ROLES.includes(s.role)).length; const expiringCount=state.hiredStaff.filter(s=>s.contractWeeks<=24).length;
  const closeManagerTalks=()=>{setManagerNegotiationId(null);setManagerOffer(null);setManagerPosition(null);setManagerCounter(null);setManagerAcceptedOffer(null);setManagerRound(1);setManagerMessage("");};
  const hire=(id:string)=>{const candidate=state.staffCandidates.find(c=>c.id===id);if(candidate?.role==="Manager"){const terms=staffJoinTermsForState(state,candidate);const opening=managerOpeningPosition(state,candidate,terms);setManagerNegotiationId(id);setManagerOffer(opening);setManagerPosition(opening);setManagerCounter(null);setManagerAcceptedOffer(null);setManagerRound(1);setManagerMessage(`${terms.note}. His agent has set out an opening position.`);return;}const res=hireStaffMember(state,id);if(!res.ok)return alert(res.reason??"Unable to hire.");update(()=>res.state);};
  const submitManagerOffer=()=>{if(!managerNegotiationId||!managerOffer||!managerPosition)return;const candidate=state.staffCandidates.find(c=>c.id===managerNegotiationId);if(!candidate)return;const terms=staffJoinTermsForState(state,candidate);const evaluation=evaluateManagerBargainingOffer(state,candidate,terms,managerOffer,managerPosition,managerRound);setManagerMessage(evaluation.message);if(evaluation.outcome==="counter"&&evaluation.counterOffer){setManagerCounter(evaluation.counterOffer);setManagerPosition(evaluation.counterOffer);setManagerRound(r=>r+1);return;}setManagerCounter(null);if(evaluation.outcome!=="accepted")return;setManagerAcceptedOffer({...managerOffer});};
  const confirmManagerAppointment=()=>{if(!managerNegotiationId||!managerAcceptedOffer)return;const res=completeAcceptedManagerDeal(state,managerNegotiationId,managerAcceptedOffer);if(!res.ok){setManagerAcceptedOffer(null);return setManagerMessage(res.reason??"Unable to complete the deal.");}update(()=>res.state);closeManagerTalks();};
  const release=(id:string)=>{const st=state.hiredStaff.find(h=>h.id===id);if(!st)return;if(!confirm(`Release ${st.name}? Severance of ${fmtMoneyExact(severanceFor(st))} due.`))return;const res=sackStaffMember(state,id);if(!res.ok)return alert(res.reason??"Unable to release.");update(()=>res.state);}; const renew=(id:string)=>{const st=state.hiredStaff.find(h=>h.id===id);if(!st)return;const bonus=st.wage*2;if(!confirm(`Renew ${st.name} for 2 seasons? Renewal bonus: ${fmtMoneyExact(bonus)}.`))return;const res=renewStaffContract(state,id,2);if(!res.ok)return alert(res.reason??"Unable to renew contract.");update(()=>res.state);};
  const filtered=enriched.filter(({staff,terms})=>(filter==="All"||staff.role===filter)&&staff.rating>=minRating&&(maxWage<=0||terms.wageDemand<=maxWage)&&(!willingOnly||terms.willing)).sort((a,b)=>{if(sortBy==="rating")return b.staff.rating-a.staff.rating;if(sortBy==="wage")return a.terms.wageDemand-b.terms.wageDemand;if(sortBy==="age")return a.staff.age-b.staff.age;const aw=a.terms.willing?0:1,bw=b.terms.willing?0:1;if(aw!==bw)return aw-bw;if(a.staff.role==="Manager"&&b.staff.role==="Manager")return managerSquadFit(state,b.staff).score-managerSquadFit(state,a.staff).score;return b.staff.rating-a.staff.rating;});

  if (view === "team") return (
    <div className="lf-staff-view space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setView("home")}><ArrowLeft className="mr-1.5 size-4" /> Staff</Button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl">Your staff · {state.hiredStaff.length}</h1>
      </div>
      {expiringCount > 0 && <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs">
        <strong>{expiringCount} contract{expiringCount === 1 ? "" : "s"} need attention.</strong> Renew from their card.
      </div>}
      {state.hiredStaff.length === 0
        ? <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground">Nobody hired yet.</div>
        : <div className="lf-staff-grid grid gap-2 md:grid-cols-2">
            {state.hiredStaff.map((staff) => <StaffCard key={staff.id} state={state} staff={staff}
              onAction={() => release(staff.id)} onRenew={() => renew(staff.id)} action="release" />)}
          </div>}
    </div>
  );
  if (view === "market") return (
    <div className="lf-staff-view space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setView("home")}><ArrowLeft className="mr-1.5 size-4" /> Staff</Button>
        <h1 className="min-w-0 flex-1 truncate font-display text-xl">Hire staff · {filtered.length}</h1>
        <Sheet>
          <SheetTrigger asChild><Button variant="outline" size="sm" className="h-8"><SlidersHorizontal className="mr-1.5 size-4" /> Filters</Button></SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
            <SheetHeader><SheetTitle>Filter candidates</SheetTitle></SheetHeader>
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <Button variant={filter === "All" ? "default" : "outline"} onClick={() => setFilter("All")}>All roles</Button>
                {ROLES.map((role) => <Button key={role} variant={filter === role ? "default" : "outline"} onClick={() => setFilter(role)}>{role}</Button>)}
              </div>
              <div><Label>Minimum rating: {minRating}</Label><Slider value={[minRating]} min={0} max={95} step={5} onValueChange={(value) => setMinRating(value[0])} className="mt-3" /></div>
              <div><Label>Maximum wage per week</Label><Input type="number" value={maxWage} min={0} step={500} onChange={(event) => setMaxWage(Number(event.target.value) || 0)} className="mt-2 h-12" /></div>
              <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={willingOnly} onChange={(event) => setWillingOnly(event.target.checked)} /><span>Only show people willing to join</span></label>
              <label className="block"><span className="text-sm font-medium">Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="mt-2 h-12 w-full rounded-xl border bg-background px-3">
                <option value="fit">Best fit</option><option value="rating">Highest rated</option><option value="wage">Cheapest</option><option value="age">Youngest</option>
              </select></label>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="lf-chip-row -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Filter by role">
        {QUICK_ROLES.map((role) => <button key={role} type="button" onClick={() => setFilter(role)}
          className={cn("lf-chip shrink-0 whitespace-nowrap", filter === role && "is-active")}>{role === "All" ? "All roles" : role}</button>)}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map(({staff,terms}) => <StaffCard key={staff.id} state={state} staff={staff} terms={terms}
          onAction={() => hire(staff.id)} action="hire" affordable={state.cash >= terms.signingBonus} />)}
        {filtered.length === 0 && <div className="rounded-xl border bg-card p-5 text-center text-sm text-muted-foreground md:col-span-2">No candidates match. Open Filters to widen the search.</div>}
      </div>
      <ManagerNegotiationDialog state={state} open={Boolean(managerNegotiationId)}
        candidate={state.staffCandidates.find((candidate) => candidate.id === managerNegotiationId) ?? null}
        offer={managerOffer} acceptedOffer={managerAcceptedOffer} counter={managerCounter}
        message={managerMessage} cash={state.cash} onOpenChange={(open) => { if (!open) closeManagerTalks(); }}
        onOfferChange={setManagerOffer} onSubmit={submitManagerOffer} onConfirmAppointment={confirmManagerAppointment}
        onUseCounter={() => { if (!managerCounter) return; setManagerOffer(managerCounter); setManagerMessage("Counter-offer loaded. Meeting these terms will secure the agreement; you can still negotiate below them."); }} />
    </div>
  );
  return <OverviewScreen title="Staff" subtitle="Build the football operation around the manager, coaches and specialists who run it."
    metrics={[
      {label:"Staff cost",value:`${fmtMoneyExact(weeklyStaffCost)}/wk`},
      {label:"Football staff",value:String(footballStaffCount)},
      {label:"Medical",value:`${medical.label} · ${medical.score}`},
      {label:"Expiring",value:String(expiringCount)},
    ]}>
    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-1.5 text-[11px]">
      <span className="font-semibold">Medical effect</span>
      <span className="text-muted-foreground tnum">+{medical.recoveryPerWeek} fitness/wk · injury risk {medical.injuryRiskMultiplier.toFixed(2)}×</span>
    </div>
    <div className="grid gap-2 md:grid-cols-2">
      <WorkflowTile icon={Users} title="Your staff"
        description={manager ? `${manager.name} leads the football side. ${managerFootballIdentity(manager).summary}` : "No manager appointed. The football side is being run on a caretaker basis."}
        meta={manager ? `${state.hiredStaff.length} hired · ${fmtMoneyExact(weeklyStaffCost)}/wk` : "Manager vacancy"}
        urgent={!manager} onClick={() => setView("team")} />
      <WorkflowTile icon={Search} title="Hire staff"
        description="Search the market. Managers come with a football identity and a live read on how their system fits your squad."
        meta={`${willingCount} willing candidates`} onClick={() => setView("market")} />
    </div>
  </OverviewScreen>;
}

function StaffCard({state,staff,terms,onAction,onRenew,action,affordable=true}: {
  state:GameState;staff:Staff;terms?:ReturnType<typeof staffJoinTermsForState>;
  onAction:()=>void;onRenew?:()=>void;action:"hire"|"release";affordable?:boolean;
}) {
  const [portraitEditing,setPortraitEditing] = useState(false);
  const displayName = useCharacterName(staff.id, staff.name);
  const manager = staff.role === "Manager";
  const contractLabel = staff.contractWeeks <= 52 ? "Final season" : `${Math.ceil(staff.contractWeeks / 52)} seasons left`;
  const identity = manager ? managerFootballIdentity(staff) : null;
  const fit = manager ? managerSquadFit(state,staff) : null;
  return <div className="lf-staff-card rounded-xl border bg-card p-2.5">
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setPortraitEditing(true)}
        className="relative shrink-0 overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-500"
        aria-label={`Edit ${displayName} appearance`}>
        <CharacterPortrait identity={{id:staff.id,subject:manager?"manager":"staff"}} size={40} title={`${displayName} portrait`} />
        <Pencil className="absolute bottom-0 right-0 size-3 rounded-tl bg-black/70 p-0.5 text-white" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-base leading-tight">{displayName}</div>
        <div className="truncate text-[11px] text-muted-foreground">{staff.role} · {staff.age} · Rating {staff.rating}</div>
      </div>
      <div className="shrink-0 text-right text-[11px]">
        <div className="font-semibold tnum">{fmtMoneyExact(terms?.wageDemand ?? staff.wage)}/wk</div>
        <div className="text-muted-foreground">{terms ? `${fmtMoneyExact(terms.signingBonus)} sign-on` : contractLabel}</div>
      </div>
    </div>
    <div className="mt-2 grid grid-cols-8 gap-0.5 rounded-lg bg-muted/40 p-0.5 text-center">
      {STAT_KEYS.map((key) => <div key={key} className="min-w-0 rounded-md py-0.5">
        <div className="text-[8px] uppercase tracking-wide text-muted-foreground">{STAT_LABEL[key]}</div>
        <div className="font-display text-sm leading-tight tnum">{staff.stats[key]}</div>
      </div>)}
    </div>
    {identity && fit && <>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{identity.preferredFormation}</span>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold">{identity.philosophy}</span>
        <span className="rounded-full border px-2 py-0.5 text-[10px]">{identity.pressing} press</span>
        <span className="rounded-full border px-2 py-0.5 text-[10px]">{identity.tempo} tempo</span>
        <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold",
          fit.band === "Excellent" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700" :
          fit.band === "Good" ? "border-lime-500/25 bg-lime-500/10 text-lime-700" :
          fit.band === "Workable" ? "border-amber-500/25 bg-amber-500/10 text-amber-700" :
          "border-rose-500/25 bg-rose-500/10 text-rose-700"
        )}>{fit.band} fit · {fit.score}</span>
      </div>
      <details className="lf-staff-more mt-1">
        <summary className="cursor-pointer text-[11px] font-semibold text-primary">Manager profile</summary>
        <ManagerIdentityPanel staff={staff} />
        <ManagerSquadFitPanel state={state} staff={staff} />
        {action === "release" && <ManagerRelationshipPanel state={state} staff={staff} />}
      </details>
    </>}
    {terms && <p className={cn("mt-1.5 line-clamp-2 text-[11px]",terms.willing?"text-muted-foreground":"text-rose-700 dark:text-rose-300")}>
      <strong className="text-foreground">{terms.willing?"Open to talks.":"Not interested."}</strong> {terms.note}
    </p>}
    <div className="mt-2 flex gap-1.5">
      {action === "hire" ? <Button size="sm" onClick={onAction} disabled={!terms?.willing || !affordable} className="h-8 flex-1">
        <UserPlus className="mr-1.5 size-4" /> {manager?"Open talks":"Hire"}
      </Button> : <>
        <Button size="sm" variant="outline" onClick={onAction} className="h-8 flex-1 text-rose-700 dark:text-rose-300">
          <UserMinus className="mr-1.5 size-4" /> Release
        </Button>
        {onRenew && staff.contractWeeks <= 52 && <Button size="sm" onClick={onRenew} className="h-8 flex-1">Renew</Button>}
      </>}
    </div>
    <CharacterPortraitStudio identity={{id:staff.id,subject:manager?"manager":"staff"}} name={staff.name}
      open={portraitEditing} onOpenChange={setPortraitEditing} />
  </div>;
}

function ManagerNegotiationDialog({
  state,
  open,
  candidate,
  offer,
  acceptedOffer,
  counter,
  message,
  cash,
  onOpenChange,
  onOfferChange,
  onSubmit,
  onConfirmAppointment,
  onUseCounter,
}: {
  state: GameState;
  open: boolean;
  candidate: Staff | null;
  offer: ManagerOffer | null;
  acceptedOffer: ManagerOffer | null;
  counter: ManagerOffer | null;
  message: string;
  cash: number;
  onOpenChange: (open: boolean) => void;
  onOfferChange: (offer: ManagerOffer) => void;
  onSubmit: () => void;
  onConfirmAppointment: () => void;
  onUseCounter: () => void;
}) {
  if (!candidate || !offer) return null;
  const terms = staffJoinTermsForState(state, candidate);
  const fit = managerSquadFit(state, candidate);
  const identity = managerFootballIdentity(candidate);
  const acceptanceLine =
    fit.band === "Excellent" || fit.band === "Good"
      ? `"I'm happy with that. I can see a clear way to work with this squad and I'm ready to get started. I want us to be a ${identity.philosophy.toLowerCase()} side from day one."`
      : `"I'm happy with that. There's work to do with the squad, but that's part of the appeal. Give me the chance to build this around my ${identity.preferredFormation} and we'll get moving."`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{acceptedOffer ? "Agreement reached" : `Talks with ${candidate.name}`}</DialogTitle>
        </DialogHeader>

        {acceptedOffer ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-5" />
                <div className="font-semibold">Terms accepted</div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {candidate.name} has agreed to become manager. Nothing is final until you confirm the appointment.
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <MessageCircle className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {candidate.name}
                </div>
                <div className="mt-1 text-sm leading-relaxed">{acceptanceLine}</div>
              </div>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Agreed package</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-background p-2">
                  <div className="font-display text-lg">{fmtMoneyExact(acceptedOffer.wage)}</div>
                  <div className="text-[9px] text-muted-foreground">per week</div>
                </div>
                <div className="rounded-lg bg-background p-2">
                  <div className="font-display text-lg">{fmtMoneyExact(acceptedOffer.signingBonus)}</div>
                  <div className="text-[9px] text-muted-foreground">signing bonus</div>
                </div>
                <div className="rounded-lg bg-background p-2">
                  <div className="font-display text-lg">{managerOfferSeasons(acceptedOffer)}</div>
                  <div className="text-[9px] text-muted-foreground">season{managerOfferSeasons(acceptedOffer) === 1 ? "" : "s"}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-primary/[0.04] p-3 text-sm">
              <div className="font-semibold">{identity.preferredFormation} · {identity.philosophy}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {fit.band} squad fit · {fit.score}/100. {fit.summary}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Walk away</Button>
              <Button onClick={onConfirmAppointment}>
                <BriefcaseBusiness className="mr-2 size-4" />
                Appoint manager
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <div className="font-semibold">{fit.band} squad fit · {fit.score}/100</div>
                <div className="mt-1 text-muted-foreground">{fit.summary}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs">Weekly wage<Input type="number" min={0} step={50} value={offer.wage} onChange={e => onOfferChange({ ...offer, wage: Number(e.target.value) || 0 })} /></label>
                <label className="text-xs">Signing bonus<Input type="number" min={0} step={100} value={offer.signingBonus} onChange={e => onOfferChange({ ...offer, signingBonus: Number(e.target.value) || 0 })} /></label>
                <label className="text-xs">Contract length<select value={managerOfferSeasons(offer)} onChange={e => onOfferChange({ ...offer, contractWeeks: Number(e.target.value) * 52 })} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value={1}>1 season</option><option value={2}>2 seasons</option><option value={3}>3 seasons</option><option value={4}>4 seasons</option></select></label>
              </div>
              <div className="rounded-xl border p-3 text-sm">
                <div className="font-semibold">Agent position</div>
                <div className="mt-1 text-muted-foreground">{message || terms.note}</div>
                {counter && (
                  <div className="mt-3 rounded-lg bg-muted/50 p-2.5">
                    <div className="text-xs font-semibold">Counter-offer</div>
                    <div className="mt-1 text-xs text-muted-foreground">{fmtMoneyExact(counter.wage)}/wk · {fmtMoneyExact(counter.signingBonus)} signing bonus · {managerOfferSeasons(counter)} season{managerOfferSeasons(counter) === 1 ? "" : "s"}</div>
                    <Button variant="outline" size="sm" className="mt-2" onClick={onUseCounter}>Use counter-offer</Button>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Cash available: {fmtMoneyExact(cash)}</div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Walk away</Button>
              <Button onClick={onSubmit} disabled={cash < offer.signingBonus}>
                <BriefcaseBusiness className="mr-2 size-4" />
                Make offer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
