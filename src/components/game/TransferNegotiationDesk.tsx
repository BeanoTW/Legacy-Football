import { useEffect, useState } from "react";
import { ArrowLeft, Building2, ChevronRight, Handshake, TriangleAlert, UserRound } from "lucide-react";
import type { GameState, SquadRole, TransferNegotiation } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { scoutingReport } from "@/lib/game/scouting";
import {
  beginTransferRegistration,
  completeTransfer,
  improvePersonalTerms,
  improveTransferOffer,
  playerName,
  respondToIncomingOffer,
  submitEnquiryOffer,
  transferRegistrationReadiness,
  withdrawFromTalks,
} from "@/lib/game/recruitment";
import { transferTargetPlayer } from "@/lib/game/recruitmentTargetBridge";
import { chairmanRecruitmentEstimate } from "@/lib/game/recruitmentKnowledge";
import { clubDisplayName } from "@/lib/game/clubReference";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import {
  recruitmentTransferFeePolicyForClub,
  recruitmentTransferFeePolicyForUser,
  recruitmentUserNegotiationWageStep,
} from "@/lib/game/recruitmentEconomy";

type Act = (
  fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
) => void;

const STAGE_LABEL: Record<TransferNegotiation["stage"], string> = {
  enquiry: "Enquiry made",
  clubTalks: "Talking to the club",
  playerTalks: "Personal terms",
  agreed: "Terms agreed",
  registration: "Medical & registration",
  completed: "Completed",
  rejected: "Talks rejected",
  withdrawn: "Withdrawn",
};

const STEPS: { stage: TransferNegotiation["stage"]; short: string }[] = [
  { stage: "enquiry", short: "Enquiry" },
  { stage: "clubTalks", short: "Club" },
  { stage: "playerTalks", short: "Agent" },
  { stage: "agreed", short: "Agreed" },
  { stage: "registration", short: "Signed" },
];

const SQUAD_ROLES: SquadRole[] = ["Key Player", "First Team", "Rotation", "Prospect"];

const stageIndex = (stage: TransferNegotiation["stage"]) => {
  const found = STEPS.findIndex((step) => step.stage === stage);
  return found === -1 ? STEPS.length - 1 : found;
};

const INTEREST_LABEL = {
  keen: "Keen",
  open: "Open to move",
  needsConvincing: "Needs convincing",
  notInterested: "Not interested",
} as const;

const interestTone = (interest: TransferNegotiation["playerInterest"]) =>
  interest === "keen"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : interest === "open"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
      : interest === "needsConvincing"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";

export function TransferNegotiationDesk({ state, deals, act, initialNegotiationId }: { state: GameState; deals: TransferNegotiation[]; act: Act; initialNegotiationId?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(deals.find((deal) => deal.id === initialNegotiationId)?.id ?? deals[0]?.id ?? null);
  useEffect(() => {
    if (selectedId && deals.some((d) => d.id === selectedId)) return;
    setSelectedId(deals[0]?.id ?? null);
  }, [deals, selectedId]);
  if (!deals.length) return <div className="grid h-full place-items-center rounded-2xl border bg-card p-8 text-center"><div><Handshake className="mx-auto size-8 text-muted-foreground" /><div className="mt-3 font-display text-xl">No live negotiations</div><p className="mt-1 text-sm text-muted-foreground">Bid for a scouted player, or wait for another club to come calling.</p></div></div>;
  const selected = deals.find((d) => d.id === selectedId) ?? deals[0];
  return <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
    <div className={cn("contained-scroll min-h-0 space-y-2 pr-0.5", selectedId && "hidden xl:block")}>{deals.map((n) => <DealRow key={n.id} state={state} n={n} active={n.id === selected.id} onClick={() => setSelectedId(n.id)} />)}</div>
    <div className={cn("contained-scroll min-h-0 pr-0.5", !selectedId && "hidden xl:block")}><Button variant="ghost" size="sm" className="mb-2 xl:hidden" onClick={() => setSelectedId(null)}><ArrowLeft className="mr-2 size-4" /> All negotiations</Button><NegotiationRoom key={selected.id} state={state} n={selected} act={act} /></div>
  </div>;
}

function DealRow({ state, n, active, onClick }: { state: GameState; n: TransferNegotiation; active: boolean; onClick: () => void }) {
  const p = transferTargetPlayer(state, n.playerId);
  if (!p) return null;
  const incoming = n.direction === "in";
  const waitingOnEnquiry = incoming && n.stage === "enquiry" && n.pendingResponseAtDay !== undefined && n.clubCounterFee === undefined;
  return <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50", active && "border-primary bg-primary/5")}>
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">{tacticalPositionProfile(p).primary}</span>
    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{playerName(p)}</span><span className="block truncate text-xs text-muted-foreground">{incoming ? "Buying" : "Selling"} · {STAGE_LABEL[n.stage]}</span></span>
    <span className="shrink-0 text-right text-xs">{waitingOnEnquiry ? <><span className="block font-semibold">Waiting</span><span className="block text-muted-foreground">for valuation</span></> : <><span className="block font-semibold tabular-nums">{fmtMoney(n.clubCounterFee ?? n.fee)}</span><span className="block text-muted-foreground">on the table</span></>}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground xl:hidden" />
  </button>;
}

function NegotiationRoom({ state, n, act }: { state: GameState; n: TransferNegotiation; act: Act }) {
  const p = transferTargetPlayer(state, n.playerId);
  const incoming = n.direction === "in";
  const feeStep = incoming && n.fromClubId ? recruitmentTransferFeePolicyForClub(state, n.fromClubId).feeStep : recruitmentTransferFeePolicyForUser(state).feeStep;
  const wageStep = recruitmentUserNegotiationWageStep(state, n.proposedWeeklyWage);
  const estimate = incoming ? chairmanRecruitmentEstimate(state, n.playerId) : null;
  const registration = incoming && (n.stage === "agreed" || n.stage === "registration") ? transferRegistrationReadiness(state, n.id) : null;
  const [feeInput, setFeeInput] = useState<string | null>(null);
  const [wageInput, setWageInput] = useState<string | null>(null);
  const [seasonsInput, setSeasonsInput] = useState(String(n.proposedLengthSeasons));
  const [roleInput, setRoleInput] = useState<SquadRole>(n.proposedRole);
  if (!p) return null;
  const report = scoutingReport(state, p);
  const otherClub = incoming ? n.fromClubId : n.toClubId;
  const clubLabel = otherClub ? clubDisplayName(state, otherClub) : "Free agent";
  const current = stageIndex(n.stage);
  const dead = n.stage === "rejected" || n.stage === "withdrawn";
  const feeDefault = String(n.stage === "enquiry" ? estimate?.openingFee ?? n.clubCounterFee ?? 0 : n.clubCounterFee ?? n.fee + feeStep);
  const wageDefault = String(n.playerCounterWage ?? n.proposedWeeklyWage + wageStep);
  const waitingForReply = n.pendingResponseAtDay !== undefined;

  return <div className="space-y-3">
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="panel-strip flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.2em] opacity-70">{incoming ? "Our approach for" : "Approach received for"}</div><button type="button" onClick={() => openPlayerProfile(p.id)} className="font-display text-2xl leading-tight hover:underline md:text-3xl">{playerName(p)}</button><div className="text-sm opacity-80">{tacticalPositionProfile(p).primary} · {clubLabel} · {incoming ? `${report.knowledgePct}% scouted` : `Overall ${p.currentAbility}`}</div></div><span className="rounded-md bg-black/20 px-3 py-1.5 text-xs font-semibold">{STAGE_LABEL[n.stage]}</span></div>
      {!dead && <div className="flex items-center gap-1 border-b px-4 py-3">{STEPS.map((step, i) => <div key={step.stage} className="flex min-w-0 flex-1 items-center gap-1"><div className="min-w-0 flex-1"><div className={cn("h-1.5 rounded-full", i <= current ? "bg-primary" : "bg-muted")} /><div className={cn("mt-1 truncate text-[10px] uppercase tracking-wide", i === current ? "font-bold text-primary" : "text-muted-foreground")}>{step.short}</div></div></div>)}</div>}
      {incoming && n.stage === "enquiry" && waitingForReply && n.clubCounterFee === undefined ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3 sm:col-span-2">
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 size-4 shrink-0 text-sky-600" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Enquiry sent</div>
                <div className="mt-1 font-display text-xl">Awaiting {clubLabel}&apos;s valuation</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  We have asked whether they are willing to sell and what it would take. No transfer bid has been made yet.
                </p>
              </div>
            </div>
          </div>
          {incoming && estimate?.valueRange && <PositionCard icon={<UserRound className="size-4" />} title="Our recruitment estimate" value={`${fmtMoneyExact(estimate.valueRange[0])}–${fmtMoneyExact(estimate.valueRange[1])}`} note="What our staff currently believe he is worth" />}
          <PositionCard icon={<Handshake className="size-4" />} title="Planned player package" value={`${fmtMoneyExact(n.proposedWeeklyWage)}/wk`} note={`${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole} if club talks succeed`} />
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
        <PositionCard icon={<Building2 className="size-4" />} title={incoming ? `${clubLabel} want` : "Their offer"} value={fmtMoneyExact(n.clubCounterFee ?? n.fee)} note={incoming ? n.clubCounterFee ? "Latest valuation from the selling club" : "No counter yet — this is what is on the table" : "Fee offered for our player"} />
        <PositionCard icon={<Handshake className="size-4" />} title={incoming ? "Our offer" : "Our valuation"} value={fmtMoneyExact(n.fee)} note={`Wage on the table ${fmtMoneyExact(n.proposedWeeklyWage)}/wk · ${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole}`} />
        {incoming && estimate?.valueRange && <PositionCard icon={<UserRound className="size-4" />} title="Our recruitment estimate" value={`${fmtMoneyExact(estimate.valueRange[0])}–${fmtMoneyExact(estimate.valueRange[1])}`} note="What your staff believe he is worth" />}
        {incoming && n.stage === "playerTalks" && <PositionCard icon={<UserRound className="size-4" />} title="Agent's demand" value={n.playerCounterWage ? `${fmtMoneyExact(n.playerCounterWage)}/wk` : "Awaiting response"} note={`Round ${n.playerRounds} of personal terms`} />}
        {incoming && n.playerInterestRevealed && n.playerInterest && (
          <div className={cn("rounded-xl border p-3 sm:col-span-2", interestTone(n.playerInterest))}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-75">Player interest</div>
              <div className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold">{INTEREST_LABEL[n.playerInterest]}</div>
            </div>
            <div className="mt-1 text-sm font-medium">{n.playerInterestReason}</div>
            {n.playerInterest === "needsConvincing" && <div className="mt-1 text-xs opacity-75">A stronger role and personal package may be needed to get this over the line.</div>}
          </div>
        )}
      </div>
      )}
      {incoming && n.competingClubId && <div className={cn("mx-4 mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm", n.renegotiationRequested ? "border-rose-500/40 bg-rose-500/10" : "border-amber-500/40 bg-amber-500/10")}><TriangleAlert className={cn("mt-0.5 size-4 shrink-0", n.renegotiationRequested ? "text-rose-600" : "text-amber-600")} /><div className="min-w-0"><strong>{clubDisplayName(state, n.competingClubId)}</strong> are competing for {playerName(p)}.
        {n.competingOfferFee !== undefined && <div className="mt-1 text-xs">Club offer: <strong>{fmtMoneyExact(n.competingOfferFee)}</strong></div>}
        {n.competingWeeklyWage !== undefined && <div className="text-xs">Personal terms: about <strong>{fmtMoneyExact(n.competingWeeklyWage)}/wk</strong></div>}
        <div className="mt-1 text-xs text-muted-foreground">{n.renegotiationRequested ? "The rival package has caused the agent to reopen our agreed terms." : n.competingWeeklyWage ? "The player now has another contract package to compare with ours." : "The seller will not accept less than a live rival bid, and the agent has extra leverage."}</div>
      </div></div>}
      {registration && <div className="mx-4 mb-4 rounded-xl border bg-muted/30 p-3 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medical & registration</div><div className="mt-1">{registration.allowed ? n.stage === "registration" ? "Registration is open and the deal still satisfies the current squad, window and financial checks." : "Terms are agreed. The deal is eligible to enter medical and registration." : registration.reason}</div></div>}
    </section>

    <section className="rounded-2xl border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How the talks have gone</div><ol className="mt-3 space-y-2">{n.log.slice(-8).map((entry, i) => <li key={i} className="flex gap-2.5"><span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", entry.party === "player" ? "bg-accent/20 text-accent-foreground" : "bg-primary/10 text-primary")}>{entry.party === "player" ? <UserRound className="size-3.5" /> : <Building2 className="size-3.5" />}</span><span className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2 text-sm"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{entry.party === "player" ? "Player & agent" : "Club to club"} · {entry.action}</span>{entry.note}</span></li>)}{!n.log.length && <li className="text-sm text-muted-foreground">No exchanges recorded yet.</li>}</ol></section>

    <section className="rounded-2xl border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{incoming && n.stage === "playerTalks" ? "Talk to the agent" : "Your move"}</div>
      {incoming && waitingForReply && <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><strong>{n.stage === "enquiry" ? "Awaiting valuation." : "Awaiting response."}</strong> {n.stage === "enquiry" ? `${clubLabel} have our enquiry. Advance will bring their valuation and the player's initial interest when they respond.` : "The other party has our latest position; Advance will bring their reply when it arrives."}</div>}
      {incoming && n.stage === "enquiry" && !waitingForReply && <NumberField id={`enquiry-fee-${n.id}`} label="Your opening transfer bid" step={feeStep} min={0} value={feeInput ?? feeDefault} onChange={setFeeInput} />}
      {incoming && n.stage === "clubTalks" && !waitingForReply && <NumberField id={`fee-${n.id}`} label="Your revised transfer fee" step={feeStep} min={n.fee + feeStep} value={feeInput ?? feeDefault} onChange={setFeeInput} />}
      {incoming && n.stage === "playerTalks" && !waitingForReply && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <NumberField id={`wage-${n.id}`} label="Weekly wage" step={wageStep} min={0} value={wageInput ?? wageDefault} onChange={setWageInput} compact />
          <label className="block text-xs text-muted-foreground">
            Contract length
            <select value={seasonsInput} onChange={(event) => setSeasonsInput(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm">
              {[1,2,3,4,5].map((season) => <option key={season} value={season}>{season} season{season === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Squad role
            <select value={roleInput} onChange={(event) => setRoleInput(event.target.value as SquadRole)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm">
              {SQUAD_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {incoming && n.stage === "enquiry" && !waitingForReply && <Button size="sm" onClick={() => { const fee = Number(feeInput ?? feeDefault); setFeeInput(null); act((s) => submitEnquiryOffer(s, n.id, fee)); }}>Submit opening bid</Button>}
        {incoming && n.stage === "clubTalks" && !waitingForReply && <Button size="sm" onClick={() => { const fee = Number(feeInput ?? feeDefault); setFeeInput(null); act((s) => improveTransferOffer(s, n.id, fee)); }}>Improve our offer</Button>}
        {incoming && n.stage === "clubTalks" && !waitingForReply && n.clubCounterFee !== undefined && <Button size="sm" variant="secondary" onClick={() => { setFeeInput(null); act((s) => improveTransferOffer(s, n.id, n.clubCounterFee!)); }}>Accept club counter · {fmtMoneyExact(n.clubCounterFee)}</Button>}
        {incoming && n.stage === "playerTalks" && !waitingForReply && <Button size="sm" onClick={() => {
          const wage = Number(wageInput ?? wageDefault);
          const seasons = Number(seasonsInput);
          const changedSeasons = seasons !== n.proposedLengthSeasons ? seasons : undefined;
          const changedRole = roleInput !== n.proposedRole ? roleInput : undefined;
          setWageInput(null);
          act((s) => improvePersonalTerms(s, n.id, wage, changedSeasons, changedRole));
        }}>Send personal terms</Button>}
        {incoming && n.stage === "playerTalks" && !waitingForReply && n.playerCounterWage !== undefined && <Button size="sm" variant="secondary" onClick={() => {
          const seasons = Number(seasonsInput);
          setWageInput(null);
          act((s) => improvePersonalTerms(
            s,
            n.id,
            n.playerCounterWage!,
            seasons !== n.proposedLengthSeasons ? seasons : undefined,
            roleInput !== n.proposedRole ? roleInput : undefined,
          ));
        }}>Accept agent counter · {fmtMoneyExact(n.playerCounterWage)}/wk</Button>}
        {incoming && n.stage === "agreed" && <Button size="sm" onClick={() => act((s) => beginTransferRegistration(s, n.id))} disabled={registration ? !registration.allowed : false} title={registration?.reason}>Begin medical & registration</Button>}
        {incoming && n.stage === "registration" && <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))} disabled={registration ? !registration.allowed : false} title={registration?.reason}>Complete registration</Button>}
        {!incoming && n.stage === "agreed" && <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))}>Complete sale</Button>}
        {!incoming && n.stage === "clubTalks" && <><Button size="sm" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "accept"))}>Accept offer</Button><Button size="sm" variant="ghost" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "reject"))}>Reject offer</Button></>}
        {incoming && <Button size="sm" variant="ghost" onClick={() => act((s) => withdrawFromTalks(s, n.id))}>Withdraw from talks</Button>}
      </div>
    </section>
  </div>;
}

function PositionCard({ icon, title, value, note }: { icon: React.ReactNode; title: string; value: string; note: string }) {
  return <div className="rounded-xl border bg-muted/30 p-3"><div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{icon}<span className="truncate">{title}</span></div><div className="mt-1 font-display text-2xl tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div>;
}

function NumberField({ id, label, step, min, value, onChange, compact = false }: { id: string; label: string; step: number; min: number; value: string; onChange: (value: string) => void; compact?: boolean }) {
  return <div className={compact ? "" : "mt-3"}><label className="block text-xs text-muted-foreground" htmlFor={id}>{label}</label><input id={id} type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} className={cn("mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base tabular-nums", !compact && "sm:max-w-xs")} /></div>;
}
