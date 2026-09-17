import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { Button } from "@/components/ui/button";
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

const employmentLabel = (value: "PartTime" | "FullTime") =>
  value === "PartTime" ? "Part-time" : "Full-time";

export function RecruitmentOperations({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [view, setView] = useState<"squad" | "deals">("squad");
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

  const playerRow = (player: (typeof squad)[number]) => {
    const contract = activeContract(state, player.id);
    const loan = activeLoanForPlayer(state, player.id);
    const weeksLeft = loan
      ? Math.max(0, loan.endAbsoluteWeek - absoluteWeek(state.season, state.week))
      : contract
        ? weeksLeftOnContract(state, contract)
        : 0;
    const employment = contract ? employmentLabel(contractEmploymentType(state, contract)) : null;
    const displayedWage =
      contract && loan
        ? Math.round((contract.weeklyWage * loan.loanClubWageContributionPct) / 100)
        : contract?.weeklyWage ?? 0;
    const mood = playerMood(state, player);
    return (
      <button
        key={player.id}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        onClick={() => setSelectedPlayerId(player.id)}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
          {tacticalPositionProfile(player).primary}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block truncate font-semibold">{playerName(player)}</span>
            {loan && (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                LOAN
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className="truncate">
              {loan
                ? `Age ${ageOf(player, state.season)} · On loan from ${clubDisplayName(state, loan.parentClubId)}`
                : `Age ${ageOf(player, state.season)} · ${contract?.squadRole ?? "Unregistered"}${employment ? ` · ${employment}` : ""}`}
            </span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${MOOD_TONE_CLASS[mood.tone]}`}>{mood.label}</span>
          </span>
        </span>
        <span className="shrink-0 text-right text-sm">
          <span className="block">
            {contract ? `${fmtMoneyExact(displayedWage)}/wk` : "No deal"}
          </span>
          <span
            className={
              weeksLeft <= 52
                ? "block text-xs font-semibold text-amber-600"
                : "block text-xs text-muted-foreground"
            }
          >
            {contract ? `${weeksLeft} ${loan ? "loan" : "contract"} weeks left` : "No contract"}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2" aria-label="Recruitment view">
        <Button variant={view === "squad" ? "default" : "outline"} onClick={() => setView("squad")}>
          Your squad
        </Button>
        <Button variant={view === "deals" ? "default" : "outline"} onClick={() => setView("deals")}>
          Negotiations ({deals.length})
        </Button>
      </div>
      {actionNote && (
        <div className="shrink-0 truncate rounded-xl border bg-muted/40 px-4 py-2 text-sm">
          {actionNote}
        </div>
      )}
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
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Select a player to view abilities, profile and contract details.
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PlanningMetric label="Squad" value={String(squad.length)} />
              <PlanningMetric
                label="Expiring"
                value={String(expiringCount)}
                urgent={expiringCount > 0}
              />
              <PlanningMetric label="Wages" value={`${fmtMoney(userWageBill(state))}/wk`} />
              <PlanningMetric label="Club model" value={clubEmployment} />
            </div>
            {positionNeeds.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                <strong>Depth warning:</strong> recruitment cover recommended at{" "}
                {positionNeeds.join(", ")}.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {(["position", "contracts", "wages"] as const).map((lens) => (
                <Button
                  key={lens}
                  size="sm"
                  variant={squadLens === lens ? "default" : "outline"}
                  onClick={() => setSquadLens(lens)}
                  className="capitalize"
                >
                  {lens}
                </Button>
              ))}
            </div>
            {squadLens === "position" ? (
              positionGroups.map(({ position, players }) =>
                players.length ? (
                  <section key={position} className="overflow-hidden rounded-2xl border bg-card">
                    <div className="border-b bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wider">
                      {position} · {players.length}
                    </div>
                    <div className="divide-y">{players.map(playerRow)}</div>
                  </section>
                ) : null,
              )
            ) : (
              <section className="overflow-hidden rounded-2xl border bg-card">
                <div className="border-b bg-muted/40 px-4 py-2 text-xs font-bold uppercase tracking-wider">
                  {squadLens === "contracts" ? "Shortest contracts first" : "Highest wages first"}
                </div>
                <div className="divide-y">{lensPlayers.map(({ player }) => playerRow(player))}</div>
              </section>
            )}
          </div>
        ) : (
          <TransferNegotiationDesk state={state} deals={deals} act={act} />
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
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Back to squad
      </Button>
      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="panel-strip p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-3xl">{playerName(player)}</div>
              <div className="mt-1 text-sm opacity-80">
                {tacticalPositionProfile(player).primary} · Age {ageOf(player, state.season)} · {player.nationality}
              </div>
            </div>
            <div className="rounded-xl bg-black/20 px-3 py-2 text-center">
              <div className="text-[10px] uppercase opacity-70">Overall</div>
              <div className="font-display text-3xl">{player.currentAbility}</div>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
            <ProfileFact label="Value" value={fmtMoney(player.marketValue)} />
            <ProfileFact
              label={loan ? "Our wage share" : "Wage"}
              value={contract ? `${fmtMoneyExact(displayedWage)}/wk` : "—"}
            />
            <ProfileFact
              label={loan ? "Loan role" : "Role"}
              value={loan?.playingTimeExpectation ?? contract?.squadRole ?? "—"}
            />
            {loan ? (
              <ProfileFact
                label="Loan status"
                value={`From ${clubDisplayName(state, loan.parentClubId)} · ${loanWeeks}w left`}
              />
            ) : (
              <ProfileFact label="Employment" value={employment} />
            )}
            <ProfileFact label="Preferred foot" value={player.preferredFoot} />
            <ProfileFact label="Personality" value={player.personality} />
            <ProfileFact label="Mood" value={mood.label} />
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2 text-xs ${MOOD_TONE_CLASS[mood.tone]}`}>{mood.detail}</div>
          <h3 className="mt-6 font-display text-xl">Abilities</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(attrs).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-muted/50 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">{key}</div>
                <div className="font-display text-2xl tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function PlanningMetric({
  label,
  value,
  urgent = false,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 text-center">
      <div className={urgent ? "font-display text-xl text-amber-600" : "font-display text-xl"}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
