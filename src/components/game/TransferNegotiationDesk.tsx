import { useEffect, useState } from "react";
import { ArrowLeft, Building2, ChevronRight, Handshake, TriangleAlert, UserRound } from "lucide-react";
import type { GameState, TransferNegotiation } from "@/lib/game/types";
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

const stageIndex = (stage: TransferNegotiation["stage"]) => {
  const found = STEPS.findIndex((step) => step.stage === stage);
  return found === -1 ? STEPS.length - 1 : found;
};

export function TransferNegotiationDesk({
  state,
  deals,
  act,
}: {
  state: GameState;
  deals: TransferNegotiation[];
  act: Act;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(deals[0]?.id ?? null);

  useEffect(() => {
    if (selectedId && deals.some((d) => d.id === selectedId)) return;
    setSelectedId(deals[0]?.id ?? null);
  }, [deals, selectedId]);

  if (!deals.length) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border bg-card p-8 text-center">
        <div>
          <Handshake className="mx-auto size-8 text-muted-foreground" />
          <div className="mt-3 font-display text-xl">No live negotiations</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Bid for a scouted player, or wait for another club to come calling.
          </p>
        </div>
      </div>
    );
  }

  const selected = deals.find((d) => d.id === selectedId) ?? deals[0];

  return (
    <div className="grid h-full min-h-0 gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
      <div
        className={cn(
          "contained-scroll min-h-0 space-y-2 pr-0.5",
          selectedId && "hidden xl:block",
        )}
      >
        {deals.map((n) => (
          <DealRow
            key={n.id}
            state={state}
            n={n}
            active={n.id === selected.id}
            onClick={() => setSelectedId(n.id)}
          />
        ))}
      </div>
      <div className={cn("contained-scroll min-h-0 pr-0.5", !selectedId && "hidden xl:block")}>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 xl:hidden"
          onClick={() => setSelectedId(null)}
        >
          <ArrowLeft className="mr-2 size-4" /> All negotiations
        </Button>
        <NegotiationRoom key={selected.id} state={state} n={selected} act={act} />
      </div>
    </div>
  );
}

function DealRow({
  state,
  n,
  active,
  onClick,
}: {
  state: GameState;
  n: TransferNegotiation;
  active: boolean;
  onClick: () => void;
}) {
  const p = transferTargetPlayer(state, n.playerId);
  if (!p) return null;
  const incoming = n.direction === "in";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/50",
        active && "border-primary bg-primary/5",
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
        {tacticalPositionProfile(p).primary}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{playerName(p)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {incoming ? "Buying" : "Selling"} · {STAGE_LABEL[n.stage]}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs">
        <span className="block font-semibold tabular-nums">
          {fmtMoney(n.clubCounterFee ?? n.fee)}
        </span>
        <span className="block text-muted-foreground">on the table</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground xl:hidden" />
    </button>
  );
}

function NegotiationRoom({ state, n, act }: { state: GameState; n: TransferNegotiation; act: Act }) {
  const p = transferTargetPlayer(state, n.playerId);
  const incoming = n.direction === "in";
  const feeStep =
    incoming && n.fromClubId
      ? recruitmentTransferFeePolicyForClub(state, n.fromClubId).feeStep
      : recruitmentTransferFeePolicyForUser(state).feeStep;
  const wageStep = recruitmentUserNegotiationWageStep(state, n.proposedWeeklyWage);
  const estimate = incoming ? chairmanRecruitmentEstimate(state, n.playerId) : null;
  const registration =
    incoming && (n.stage === "agreed" || n.stage === "registration")
      ? transferRegistrationReadiness(state, n.id)
      : null;
  const [feeInput, setFeeInput] = useState<string | null>(null);
  const [wageInput, setWageInput] = useState<string | null>(null);

  if (!p) return null;
  const report = scoutingReport(state, p);
  const otherClub = incoming ? n.fromClubId : n.toClubId;
  const clubLabel = otherClub ? clubDisplayName(state, otherClub) : "Free agent";
  const current = stageIndex(n.stage);
  const dead = n.stage === "rejected" || n.stage === "withdrawn";

  const feeDefault = String(
    n.stage === "enquiry"
      ? estimate?.openingFee ?? n.clubCounterFee ?? 0
      : n.clubCounterFee ?? n.fee + feeStep,
  );
  const wageDefault = String(n.playerCounterWage ?? n.proposedWeeklyWage + wageStep);

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="panel-strip flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
              {incoming ? "Our approach for" : "Approach received for"}
            </div>
            <button
              type="button"
              onClick={() => openPlayerProfile(p.id)}
              className="font-display text-2xl leading-tight hover:underline md:text-3xl"
            >
              {playerName(p)}
            </button>
            <div className="text-sm opacity-80">
              {tacticalPositionProfile(p).primary} · {clubLabel} ·{" "}
              {incoming ? `${report.knowledgePct}% scouted` : `Overall ${p.currentAbility}`}
            </div>
          </div>
          <span className="rounded-md bg-black/20 px-3 py-1.5 text-xs font-semibold">
            {STAGE_LABEL[n.stage]}
          </span>
        </div>

        {!dead && (
          <div className="flex items-center gap-1 border-b px-4 py-3">
            {STEPS.map((step, i) => (
              <div key={step.stage} className="flex min-w-0 flex-1 items-center gap-1">
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "h-1.5 rounded-full",
                      i <= current ? "bg-primary" : "bg-muted",
                    )}
                  />
                  <div
                    className={cn(
                      "mt-1 truncate text-[10px] uppercase tracking-wide",
                      i === current ? "font-bold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {step.short}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <PositionCard
            icon={<Building2 className="size-4" />}
            title={incoming ? `${clubLabel} want` : "Their offer"}
            value={fmtMoneyExact(n.clubCounterFee ?? n.fee)}
            note={
              incoming
                ? n.clubCounterFee
                  ? "Latest valuation from the selling club"
                  : "No counter yet — this is what is on the table"
                : "Fee offered for our player"
            }
          />
          <PositionCard
            icon={<Handshake className="size-4" />}
            title={incoming ? "Our offer" : "Our valuation"}
            value={fmtMoneyExact(n.fee)}
            note={`Wage on the table ${fmtMoneyExact(n.proposedWeeklyWage)}/wk · ${n.proposedLengthSeasons} season${n.proposedLengthSeasons === 1 ? "" : "s"} · ${n.proposedRole}`}
          />
          {incoming && estimate?.valueRange && (
            <PositionCard
              icon={<UserRound className="size-4" />}
              title="Our recruitment estimate"
              value={`${fmtMoneyExact(estimate.valueRange[0])}–${fmtMoneyExact(estimate.valueRange[1])}`}
              note="What your staff believe he is worth"
            />
          )}
          {incoming && n.stage === "playerTalks" && (
            <PositionCard
              icon={<UserRound className="size-4" />}
              title="Agent's demand"
              value={
                n.playerCounterWage
                  ? `${fmtMoneyExact(n.playerCounterWage)}/wk`
                  : "Awaiting response"
              }
              note={`Round ${n.playerRounds} of personal terms`}
            />
          )}
        </div>

        {incoming && n.competingClubId && n.competingOfferFee !== undefined && (
          <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div>
              <strong>{clubDisplayName(state, n.competingClubId)}</strong> have{" "}
              <strong>{fmtMoneyExact(n.competingOfferFee)}</strong> on the table.
              <div className="text-xs text-muted-foreground">
                The seller will not accept less than a live rival bid, and the agent has extra
                leverage.
              </div>
            </div>
          </div>
        )}

        {registration && (
          <div className="mx-4 mb-4 rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Medical & registration
            </div>
            <div className="mt-1">
              {registration.allowed
                ? n.stage === "registration"
                  ? "Registration is open and the deal still satisfies the current squad, window and financial checks."
                  : "Terms are agreed. The deal is eligible to enter medical and registration."
                : registration.reason}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          How the talks have gone
        </div>
        <ol className="mt-3 space-y-2">
          {n.log.slice(-8).map((entry, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                  entry.party === "player"
                    ? "bg-accent/20 text-accent-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {entry.party === "player" ? (
                  <UserRound className="size-3.5" />
                ) : (
                  <Building2 className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  {entry.party === "player" ? "Player & agent" : "Club to club"} · {entry.action}
                </span>
                {entry.note}
              </span>
            </li>
          ))}
          {!n.log.length && (
            <li className="text-sm text-muted-foreground">No exchanges recorded yet.</li>
          )}
        </ol>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {incoming && n.stage === "playerTalks" ? "Talk to the agent" : "Your move"}
        </div>

        {incoming && n.stage === "enquiry" && (
          <NumberField
            id={`enquiry-fee-${n.id}`}
            label="Your opening transfer bid"
            step={feeStep}
            min={0}
            value={feeInput ?? feeDefault}
            onChange={setFeeInput}
          />
        )}
        {incoming && n.stage === "clubTalks" && (
          <NumberField
            id={`fee-${n.id}`}
            label="Your revised transfer fee"
            step={feeStep}
            min={n.fee + feeStep}
            value={feeInput ?? feeDefault}
            onChange={setFeeInput}
          />
        )}
        {incoming && n.stage === "playerTalks" && (
          <NumberField
            id={`wage-${n.id}`}
            label="Your revised weekly wage"
            step={wageStep}
            min={n.proposedWeeklyWage + wageStep}
            value={wageInput ?? wageDefault}
            onChange={setWageInput}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {incoming && n.stage === "enquiry" && (
            <Button
              size="sm"
              onClick={() => {
                const fee = Number(feeInput ?? feeDefault);
                setFeeInput(null);
                act((s) => submitEnquiryOffer(s, n.id, fee));
              }}
            >
              Submit opening bid
            </Button>
          )}
          {incoming && n.stage === "clubTalks" && (
            <Button
              size="sm"
              onClick={() => {
                const fee = Number(feeInput ?? feeDefault);
                setFeeInput(null);
                act((s) => improveTransferOffer(s, n.id, fee));
              }}
            >
              Improve our offer
            </Button>
          )}
          {incoming && n.stage === "playerTalks" && (
            <Button
              size="sm"
              onClick={() => {
                const wage = Number(wageInput ?? wageDefault);
                act((s) => improvePersonalTerms(s, n.id, wage));
              }}
            >
              Improve personal terms
            </Button>
          )}
          {incoming && n.stage === "agreed" && (
            <Button
              size="sm"
              onClick={() => act((s) => beginTransferRegistration(s, n.id))}
              disabled={registration ? !registration.allowed : false}
              title={registration?.reason}
            >
              Begin medical & registration
            </Button>
          )}
          {incoming && n.stage === "registration" && (
            <Button
              size="sm"
              onClick={() => act((s) => completeTransfer(s, n.id))}
              disabled={registration ? !registration.allowed : false}
              title={registration?.reason}
            >
              Complete registration
            </Button>
          )}
          {!incoming && n.stage === "agreed" && (
            <Button size="sm" onClick={() => act((s) => completeTransfer(s, n.id))}>
              Complete sale
            </Button>
          )}
          {!incoming && n.stage === "clubTalks" && (
            <>
              <Button size="sm" onClick={() => act((s) => respondToIncomingOffer(s, n.id, "accept"))}>
                Accept offer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => act((s) => respondToIncomingOffer(s, n.id, "reject"))}
              >
                Reject offer
              </Button>
            </>
          )}
          {incoming && (
            <Button size="sm" variant="ghost" onClick={() => act((s) => withdrawFromTalks(s, n.id))}>
              Withdraw from talks
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function PositionCard({
  icon,
  title,
  value,
  note,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <div className="mt-1 font-display text-2xl tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}

function NumberField({
  id,
  label,
  step,
  min,
  value,
  onChange,
}: {
  id: string;
  label: string;
  step: number;
  min: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-3">
      <label className="block text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full rounded-lg border bg-background px-3 text-base tabular-nums sm:max-w-xs"
      />
    </div>
  );
}
