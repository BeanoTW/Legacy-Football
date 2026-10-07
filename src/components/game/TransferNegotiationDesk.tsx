import { useState } from "react";
import { Building2, Handshake, Tag, TriangleAlert, UserRound } from "lucide-react";
import type { GameState, SquadRole, TransferNegotiation } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/game/engine";
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
import { transferAskingPrice } from "@/lib/game/transferAskingPrice";
import { chairmanRecruitmentEstimate } from "@/lib/game/recruitmentKnowledge";
import { clubDisplayName } from "@/lib/game/clubReference";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { openPlayerProfile } from "./shared/PlayerProfileSheet";
import { deskDealForNegotiation } from "@/lib/game/transferDesk";
import { DealStageLadder } from "./TransferDealStage";
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

const SQUAD_ROLES: SquadRole[] = ["Key Player", "First Team", "Rotation", "Prospect"];

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

/**
 * The canonical deal room for one negotiation. The Transfer Desk opens it as a
 * work surface from Live Business; every action still goes through the
 * recruitment engine (dated replies, registration, rival pressure untouched).
 */
export function TransferNegotiationRoom({ state, negotiation, act }: { state: GameState; negotiation: TransferNegotiation; act: Act }) {
  return <NegotiationRoom key={negotiation.id} state={state} n={negotiation} act={act} />;
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
  const [counterInput, setCounterInput] = useState<string | null>(null);
  if (!p) return null;
  const askingPrice = !incoming ? transferAskingPrice(state, p) : 0;
  const bidOnTable = n.clubCounterFee ?? n.fee;
  const report = scoutingReport(state, p);
  const otherClub = incoming ? n.fromClubId : n.toClubId;
  const freeAgent = incoming && !otherClub;
  const clubLabel = otherClub ? clubDisplayName(state, otherClub) : "Free agent";
  const ladder = deskDealForNegotiation(state, n);
  const dead = n.stage === "rejected" || n.stage === "withdrawn";
  const feeDefault = String(n.stage === "enquiry" ? estimate?.openingFee ?? n.clubCounterFee ?? 0 : n.clubCounterFee ?? n.fee + feeStep);
  const wageDefault = String(n.playerCounterWage ?? n.proposedWeeklyWage + wageStep);
  const waitingForReply = n.pendingResponseAtDay !== undefined;

  return <div className="space-y-3">
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="panel-strip flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="text-[10px] uppercase tracking-[0.2em] opacity-70">{incoming ? "Our approach for" : "Approach received for"}</div><button type="button" onClick={() => openPlayerProfile(p.id)} className="font-display text-2xl leading-tight hover:underline md:text-3xl">{playerName(p)}</button><div className="text-sm opacity-80">{tacticalPositionProfile(p).primary} · {clubLabel} · {incoming ? `${report.knowledgePct}% scouted` : `Overall ${p.currentAbility}`}</div></div><span className="rounded-md bg-black/20 px-3 py-1.5 text-xs font-semibold">{STAGE_LABEL[n.stage]}</span></div>
      {!dead && ladder && <div className="border-b px-4 py-3"><DealStageLadder stages={ladder.stages} current={ladder.stageIndex} /></div>}
      {incoming && n.stage === "enquiry" && waitingForReply && n.clubCounterFee === undefined ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.06] p-3 sm:col-span-2">
            <div className="flex items-start gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-sky-600" /><div><div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Enquiry sent</div><div className="mt-1 font-display text-xl">Awaiting {clubLabel}&apos;s valuation</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">We have asked whether they are willing to sell and what it would take. No transfer bid has been made yet.</p></div></div>
          </div>
          {incoming && estimate?.valueRange && <PositionCard icon={<UserRound className="size-4" />} title="Our recruitment estimate" value={`${fmtMoneyExact(estimate.valueRange[0])}–${fmtMoneyExact(estimate.valueRange[1])}`} note="What our staff currently believe he is worth" />}
          <PositionCard icon={<Handshake className="size-4" />} title="Planned player package" value={`${fmtMoneyExact(n.proposedWeeklyWage)}/wk`} note={`${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole} if club talks succeed`} />
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
        {freeAgent ? (
          <><PositionCard icon={<Handshake className="size-4" />} title="Our contract offer" value={`${fmtMoneyExact(n.proposedWeeklyWage)}/wk`} note={`${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole}`} /><PositionCard icon={<UserRound className="size-4" />} title="Agent's position" value={n.playerCounterWage ? `${fmtMoneyExact(n.playerCounterWage)}/wk` : "Awaiting response"} note={n.playerCounterWage ? `Round ${n.playerRounds} of personal terms · latest counter` : `Round ${n.playerRounds} of personal terms · no counter yet`} /></>
        ) : (
          <><PositionCard icon={<Building2 className="size-4" />} title={incoming ? `${clubLabel} want` : "Their offer"} value={fmtMoneyExact(n.clubCounterFee ?? n.fee)} note={incoming ? n.clubCounterFee ? "Latest valuation from the selling club" : "No counter yet — this is what is on the table" : "Fee offered for our player"} /><PositionCard icon={<Handshake className="size-4" />} title={incoming ? "Our offer" : "Our valuation"} value={fmtMoneyExact(n.fee)} note={`Wage on the table ${fmtMoneyExact(n.proposedWeeklyWage)}/wk · ${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole}`} />{incoming && estimate?.valueRange && <PositionCard icon={<UserRound className="size-4" />} title="Our recruitment estimate" value={`${fmtMoneyExact(estimate.valueRange[0])}–${fmtMoneyExact(estimate.valueRange[1])}`} note="What your staff believe he is worth" />}{incoming && n.stage === "playerTalks" && <PositionCard icon={<UserRound className="size-4" />} title="Agent's demand" value={n.playerCounterWage ? `${fmtMoneyExact(n.playerCounterWage)}/wk` : "Awaiting response"} note={`Round ${n.playerRounds} of personal terms`} />}</>
        )}
        </div>
      )}
      {incoming && n.playerInterest && <div className={cn("mx-4 mb-4 rounded-xl border p-3", interestTone(n.playerInterest))}><div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4" /> Player interest · {INTEREST_LABEL[n.playerInterest]}</div></div>}
      {n.competingClubId && <div className="mx-4 mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200"><TriangleAlert className="size-4" /> Rival bid · {clubDisplayName(state, n.competingClubId)}</div></div>}
      {incoming && (n.stage === "agreed" || n.stage === "registration") && registration && <div className="mx-4 mb-4 rounded-xl border bg-muted/30 p-3 text-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medical & registration</div><div className="mt-1">{registration.allowed ? n.stage === "registration" ? "Registration is open and the deal still satisfies the current squad, window and financial checks." : "Terms are agreed. The deal is eligible to enter medical and registration." : registration.reason}</div></div>}
    </section>
    <section className="rounded-2xl border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How the talks have gone</div>{(() => { const visibleLog = n.log.filter((entry) => !(freeAgent && entry.party === "club")); return <ol className="mt-3 space-y-2">{visibleLog.slice(-8).map((entry, i) => <li key={i} className="flex gap-2.5"><span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", entry.party === "player" ? "bg-accent/20 text-accent-foreground" : "bg-primary/10 text-primary")}>{entry.party === "player" ? <UserRound className="size-3.5" /> : <Building2 className="size-3.5" />}</span><span className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2 text-sm"><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{entry.party === "player" ? (freeAgent ? "Free agent & agent" : "Player & agent") : "Club to club"} · {entry.action}</span>{freeAgent && entry.party === "player" && entry.note === "Free agent — straight to personal terms." ? `Contract offer opened at ${fmtMoneyExact(n.proposedWeeklyWage)}/wk for ${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"}.` : entry.note}</span></li>)}{!visibleLog.length && <li className="text-sm text-muted-foreground">No exchanges recorded yet.</li>}</ol>; })()}</section>
    <section className="rounded-2xl border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{freeAgent && n.stage === "playerTalks" ? "Contract offer" : incoming && n.stage === "playerTalks" ? "Talk to the agent" : "Your move"}</div>
      {incoming && waitingForReply && <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><strong>{n.stage === "enquiry" ? "Awaiting valuation." : freeAgent ? "Offer sent to the player." : "Awaiting response."}</strong> {n.stage === "enquiry" ? `${clubLabel} have our enquiry. Advance will bring their valuation and the player's initial interest when they respond.` : freeAgent ? `Our current offer is ${fmtMoneyExact(n.proposedWeeklyWage)}/wk for ${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} as ${n.proposedRole}. Advance will bring the agent's response.` : "The other party has our latest position; Advance will bring their reply when it arrives."}</div>}
      {!incoming && n.stage === "clubTalks" && <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="size-3.5" /> Our asking price {fmtMoneyExact(askingPrice)}</div><div className="mt-0.5 font-semibold">{bidOnTable >= askingPrice ? "This bid meets our asking price." : `The bid is ${fmtMoneyExact(askingPrice - bidOnTable)} short of our asking price.`}</div><NumberField id={`counter-${n.id}`} label="Counter at" step={feeStep} min={bidOnTable + feeStep} value={counterInput ?? String(askingPrice)} onChange={setCounterInput} /></div>}
      {incoming && n.stage === "enquiry" && !waitingForReply && <NumberField id={`enquiry-fee-${n.id}`} label="Your opening transfer bid" step={feeStep} min={0} value={feeInput ?? feeDefault} onChange={setFeeInput} />}
      {incoming && n.stage === "clubTalks" && !waitingForReply && <NumberField id={`fee-${n.id}`} label="Your revised transfer fee" step={feeStep} min={n.fee + feeStep} value={feeInput ?? feeDefault} onChange={setFeeInput} />}
      {incoming && n.stage === "playerTalks" && !waitingForReply && <div className="mt-3 grid gap-2 sm:grid-cols-3"><NumberField id={`wage-${n.id}`} label="Weekly wage" step={wageStep} min={0} value={wageInput ?? wageDefault} onChange={setWageInput} compact /><label className="block text-xs text-muted-foreground">Contract length<select value={seasonsInput} onChange={(event) => setSeasonsInput(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm">{[1,2,3,4,5].map((season) => <option key={season} value={season}>{season} season{season === 1 ? "" : "s"}</option>)}</select></label><label className="block text-xs text-muted-foreground">Squad role<select value={roleInput} onChange={(event) => setRoleInput(event.target.value as SquadRole)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-sm">{SQUAD_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {incoming && n.stage === "enquiry" && !waitingForReply && <Button size="sm" onClick={() => { const fee = Number(feeInput ?? feeDefault); setFeeInput(null); act((s) => submitEnquiryOffer(s, n.id, fee)); }}>Submit opening bid</Button>}
        {incoming && n.stage === "clubTalks" && !waitingForReply && <Button size="sm" onClick={() => { const fee = Number(feeInput ?? feeDefault); setFeeInput(null); act((s) => improveTransferOffer(s, n.id, fee)); }}>Improve our offer</Button>}
        {incoming && n.stage === "clubTalks" && !waitingForReply && n.clubCounterFee !== undefined && <Button size="sm" variant="secondary" onClick={() => { setFeeInput(null); act((s) => improveTransferOffer(s, n.id, n.clubCounterFee!)); }}>Accept club counter · {fmtMoneyExact(n.clubCounterFee)}</Button>}
        {incoming && n.stage === "playerTalks" && !waitingForReply && <Button size="sm" onClick={() => { const wage = Number(wageInput ?? wageDefault); const seasons = Number(seasonsInput); const changedSeasons = seasons !== n.proposedLengthSeasons ? seasons : undefined; const changedRole = roleInput !== n.proposedRole ? roleInput : undefined; setWageInput(null); act((s) => improvePersonalTerms(s, n.id, wage, changedSeasons, changedRole)); }}>{freeAgent ? "Send contract offer" : "Send personal terms"}</Button>}
        {incoming && n.stage === "playerTalks" && !waitingForReply && n.playerCounterWage !== undefined && <Button size="sm" variant="secondary" onClick={() => { const seasons = Number(seasonsInput); setWageInput(null); act((s) => improvePersonalTerms(s, n.id, n.playerCounterWage!, seasons !== n.proposedLengthSeasons ? seasons : undefined, roleInput !== n.proposedRole ? roleInput : undefined)); }}>Accept agent counter · {fmtMoneyExact(n.playerCounterWage)}/wk</Button>}
        {incoming && n.stage === "agreed" && <Button size="sm" onClick={() => act((s) => beginTransferRegistration(s, n.id))} disabled={registration ? !registration.allowed : false} title={registration?.reason}>Begin medical & registration</Button>}
        {incoming && n.stage === "registration" && <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))} disabled={registration ? !registration.allowed : false} title={registration?.reason}>Complete registration</Button>}
        {!incoming && n.stage === "agreed" && <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))}>Complete sale</Button>}
        {!incoming && n.stage === "clubTalks" && <><Button size="sm" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "accept"))}>Accept offer</Button><Button size="sm" variant="secondary" onClick={() => { const fee = Number(counterInput ?? askingPrice); setCounterInput(null); act((s) => respondToIncomingOffer(s, n.id, "counter", fee)); }}>Counter · {fmtMoneyExact(Number(counterInput ?? askingPrice))}</Button><Button size="sm" variant="ghost" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "reject"))}>Reject offer</Button></>}
        {incoming && <Button size="sm" variant="ghost" onClick={() => act((s) => withdrawFromTalks(s, n.id))}>Withdraw from talks</Button>}
      </div>
    </section>
  </div>;
}

function PositionCard({ icon, title, value, note }: { icon: React.ReactNode; title: string; value: string; note: string }) { return <div className="rounded-xl border bg-muted/30 p-3"><div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{icon}<span className="truncate">{title}</span></div><div className="mt-1 font-display text-2xl tabular-nums">{value}</div><div className="mt-1 text-xs text-muted-foreground">{note}</div></div>; }
function NumberField({ id, label, step, min, value, onChange, compact = false }: { id: string; label: string; step: number; min: number; value: string; onChange: (value: string) => void; compact?: boolean }) { return <div className={compact ? "" : "mt-3"}><label className="block text-xs text-muted-foreground" htmlFor={id}>{label}</label><input id={id} type="number" min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} className={cn("mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base tabular-nums", !compact && "sm:max-w-xs")} /></div>; }
