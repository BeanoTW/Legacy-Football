import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { playerAttributes } from "@/lib/game/scouting";
import {
  activeContract,
  ageOf,
  openNegotiations,
  playerById,
  playerName,
  userWageBill,
  userSquad,
  weeksLeftOnContract,
} from "@/lib/game/recruitment";
import { MOOD_TONE_CLASS, playerMood } from "@/lib/game/character";
import { clubDisplayName, userClubReference } from "@/lib/game/clubReference";
import { activeLoanForPlayer } from "@/lib/game/loans";
import { absoluteWeek } from "@/lib/game/time";
import { clubOperatingModel, contractEmploymentType } from "@/lib/game/employment";
import { tacticalPositionProfile } from "@/lib/game/positions";
import { TransferNegotiationDesk } from "./TransferNegotiationDesk";
import { TacticalPlayerCard } from "./shared/TacticalPlayerCard";

const POSITION_TITLE = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" } as const;

const employmentLabel = (value: "PartTime" | "FullTime") =>
  value === "PartTime" ? "Part-time" : "Full-time";

export function RecruitmentOperations({
  state,
  update,
  initialNegotiationId,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  initialNegotiationId?: string;
}) {
  const [view, setView] = useState<"squad" | "deals">(initialNegotiationId ? "deals" : "squad");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [squadLens, setSquadLens] = useState<"position" | "contracts" | "wages">("position");
  const [actionNote, setActionNote] = useState<string | null>(null);
  const act = (
    fn: (s: GameState) => { state: GameState; result: { ok: boolean; reason: string } },
  ) =>
    update((s) => {
      const outcome = fn(s);
      setActionNote(outcome.result.reason);
      return outcome.state;
    });
  const deals = openNegotiations(state);
  const squad = userSquad(state);
  const clubEmployment = employmentLabel(
    clubOperatingModel(state, userClubReference(state)),
  );
  const selectedPlayer = selectedPlayerId ? playerById(state, selectedPlayerId) : undefined;
  const positionGroups = useMemo(
    () =>
      (["GK", "DEF", "MID", "FWD"] as const).map((position) => ({
        position,
        players: squad
          .filter((player) => player.primaryPosition === position)
          .sort((a, b) => playerName(a).localeCompare(playerName(b))),
      })),
    [squad],
  );
  const squadWithContracts = squad.map((player) => ({
    player,
    contract: activeContract(state, player.id),
  }));
  const expiringCount = squadWithContracts.filter(
    ({ contract }) => contract && weeksLeftOnContract(state, contract) <= 52,
  ).length;
  const positionNeeds = positionGroups
    .filter(({ position, players }) =>
      position === "GK" ? players.length < 2 : players.length < (position === "FWD" ? 4 : 5),
    )
    .map(({ position }) => position);
  const lensPlayers = [...squadWithContracts].sort((a, b) => {
    if (squadLens === "wages") return (b.contract?.weeklyWage ?? 0) - (a.contract?.weeklyWage ?? 0);
    return (
      (a.contract ? weeksLeftOnContract(state, a.contract) : -1) -
      (b.contract ? weeksLeftOnContract(state, b.contract) : -1)
    );
  });

  const playerRow = (player: (typeof squad)[number]) => (
    <TacticalPlayerCard
      key={player.id}
      state={state}
      player={player}
      mode="compact"
      className="rounded-none border-x-0 border-t-0 shadow-none last:border-b-0"
      onOpen={() => setSelectedPlayerId(player.id)}
    />
  );

  return (
    <div className="lf-recruitment-ops flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <div className="lf-segmented grid shrink-0 grid-cols-2" role="tablist" aria-label="Recruitment view">
        <button type="button" role="tab" aria-selected={view === "squad"} className={cn(view === "squad" && "is-active")} onClick={() => setView("squad")}>Your squad</button>
        <button type="button" role="tab" aria-selected={view === "deals"} className={cn(view === "deals" && "is-active")} onClick={() => setView("deals")}>Negotiations {deals.length > 0 && <b>{deals.length}</b>}</button>
      </div>
      {actionNote && <div className="shrink-0 truncate rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">{actionNote}</div>}
      <div
        className={
          view === "deals"
            ? "min-h-0 flex-1 overflow-hidden"
            : "contained-scroll touch-pan-y min-h-0 flex-1 pr-0.5"
        }
      >
        {view === "squad" && selectedPlayer ? (
          <PlayerProfile
            state={state}
            player={selectedPlayer}
            onBack={() => setSelectedPlayerId(null)}
          />
        ) : view === "squad" ? (
          <div className="space-y-2">
            <div className="lf-metric-strip grid grid-cols-4 divide-x overflow-hidden rounded-xl border bg-card text-center">
              <PlanningMetric label="Squad" value={String(squad.length)} />
              <PlanningMetric label="Expiring" value={String(expiringCount)} urgent={expiringCount > 0} />
              <PlanningMetric label="Wages" value={`${fmtMoney(userWageBill(state))}/wk`} />
              <PlanningMetric label="Model" value={clubEmployment} />
            </div>
            {positionNeeds.length > 0 && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs"><strong>Depth:</strong> cover recommended at {positionNeeds.join(", ")}.</div>}
            <div className="flex items-center gap-1.5" role="group" aria-label="Sort squad">
              <span className="mr-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sort</span>
              {(["position", "contracts", "wages"] as const).map((lens) => (
                <button key={lens} type="button" onClick={() => setSquadLens(lens)}
                  className={cn("lf-chip capitalize", squadLens === lens && "is-active")}>{lens}</button>
              ))}
            </div>
            <section className="overflow-hidden rounded-xl border bg-card">
              {squadLens === "position" ? positionGroups.map(({ position, players }) => players.length ? (
                <div key={position}>
                  <div className="lf-group-heading"><span>{POSITION_TITLE[position]}</span><span>{players.length}</span></div>
                  <div className="divide-y">{players.map(playerRow)}</div>
                </div>
              ) : null) : (
                <>
                  <div className="lf-group-heading">
                    <span>{squadLens === "contracts" ? "Shortest contracts first" : "Highest wages first"}</span>
                    <span>{lensPlayers.length}</span>
                  </div>
                  <div className="divide-y">{lensPlayers.map(({ player }) => playerRow(player))}</div>
                </>
              )}
            </section>
          </div>
        ) : (
          <TransferNegotiationDesk state={state} deals={deals} act={act} initialNegotiationId={initialNegotiationId} />
        )}
      </div>
    </div>
  );
}

function PlayerProfile({
  state,
  player,
  onBack,
}: {
  state: GameState;
  player: NonNullable<ReturnType<typeof playerById>>;
  onBack: () => void;
}) {
  const attrs = playerAttributes(player);
  const contract = activeContract(state, player.id);
  const loan = activeLoanForPlayer(state, player.id);
  const employment = contract ? employmentLabel(contractEmploymentType(state, contract)) : "—";
  const mood = playerMood(state, player);
  const displayedWage =
    contract && loan
      ? Math.round((contract.weeklyWage * loan.loanClubWageContributionPct) / 100)
      : contract?.weeklyWage ?? 0;
  const loanWeeks = loan
    ? Math.max(0, loan.endAbsoluteWeek - absoluteWeek(state.season, state.week))
    : null;
  return (
    <div className="space-y-2">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" /> Squad
      </Button>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="panel-strip px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="truncate font-display text-2xl leading-tight">{playerName(player)}</div>
              <div className="text-xs opacity-80">
                {tacticalPositionProfile(player).primary} · Age {ageOf(player, state.season)} · {player.nationality}
              </div>
            </div>
            <div className="shrink-0 rounded-lg bg-black/20 px-2.5 py-1 text-center">
              <div className="text-[8px] uppercase tracking-wider opacity-70">Overall</div>
              <div className="font-display text-2xl leading-none">{player.currentAbility}</div>
            </div>
          </div>
        </div>
        <div className="p-2.5">
          <div className="grid grid-cols-3 gap-1.5 text-xs sm:grid-cols-4 lg:grid-cols-7">
            <ProfileFact label="Value" value={fmtMoney(player.marketValue)} />
            <ProfileFact
              label={loan ? "Our share" : "Wage"}
              value={contract ? `${fmtMoneyExact(displayedWage)}/wk` : "—"}
            />
            <ProfileFact
              label={loan ? "Loan role" : "Role"}
              value={loan?.playingTimeExpectation ?? contract?.squadRole ?? "—"}
            />
            {loan ? (
              <ProfileFact
                label="Loan"
                value={`${clubDisplayName(state, loan.parentClubId)} · ${loanWeeks}w`}
              />
            ) : (
              <ProfileFact label="Employment" value={employment} />
            )}
            <ProfileFact label="Foot" value={player.preferredFoot} />
            <ProfileFact label="Personality" value={player.personality} />
            <ProfileFact label="Mood" value={mood.label} />
          </div>
          <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] ${MOOD_TONE_CLASS[mood.tone]}`}>{mood.detail}</div>
          <h3 className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Abilities</h3>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {Object.entries(attrs).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/50 px-2 py-1.5">
                <div className="truncate text-[9px] uppercase text-muted-foreground">{key}</div>
                <div className="font-display text-xl leading-tight tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-muted/40 px-2 py-1.5">
    <div className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="truncate font-semibold">{value}</div>
  </div>;
}
function PlanningMetric({ label, value, urgent = false }: { label: string; value: string; urgent?: boolean }) {
  return <div className="min-w-0 px-1 py-1.5">
    <div className={cn("truncate font-display text-base leading-tight", urgent && "text-amber-600 dark:text-amber-300")}>{value}</div>
    <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
  </div>;
}
