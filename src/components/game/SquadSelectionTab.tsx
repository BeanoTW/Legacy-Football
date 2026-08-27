import { useMemo, useState } from "react";
import { ArrowLeft, Shield, Sparkles, Users } from "lucide-react";
import type { FootballPlayer, GameState, Position } from "@/lib/game/types";
import {
  activeContract,
  ageOf,
  playerName,
  userSquad,
  weeksLeftOnContract,
} from "@/lib/game/recruitment";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FORMATION: Position[] = [
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
];
type Preset = "strongest" | "rested" | "youth";

export function SquadSelectionTab({
  state,
  update,
  onBack,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
  onBack: () => void;
}) {
  const stored = state.inboxFlags["chairman.selection.preset"];
  const [preset, setPreset] = useState<Preset>(
    stored === "rested" || stored === "youth" ? stored : "strongest",
  );
  const squad = useMemo(() => userSquad(state), [state]);
  const xi = useMemo(() => chooseXi(squad, preset, state.season), [squad, preset, state.season]);
  const selected = new Set(xi.map((player) => player.id));
  const bench = squad
    .filter((player) => !selected.has(player.id))
    .sort((a, b) => b.currentAbility - a.currentAbility);

  const choose = (next: Preset) => {
    setPreset(next);
    update((s) => ({
      ...s,
      inboxFlags: {
        ...s.inboxFlags,
        "chairman.selection.preset": next,
        "chairman.selection.ids": chooseXi(userSquad(s), next, s.season)
          .map((player) => player.id)
          .join(","),
      },
    }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button className="w-fit shrink-0" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Back to transfers
      </Button>

      <div className="contained-scroll grid min-h-0 flex-1 auto-rows-max gap-3 pr-0.5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-1">
          <div className="panel-strip p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">
                  Football department
                </div>
                <h1 className="font-display text-2xl">Squad & selection</h1>
                <p className="mt-1 max-w-2xl text-sm opacity-80">
                  Review your own players in full and give the manager a chairman&apos;s selection
                  preference.
                </p>
              </div>
              <Shield className="size-8 opacity-70" />
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x text-center">
            <Summary label="Players" value={String(squad.length)} />
            <Summary label="Suggested XI" value={String(xi.length)} />
            <Summary label="Avg ability" value={averageAbility(xi).toFixed(1)} />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-3 shadow-sm lg:col-start-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-xl">Chairman&apos;s preference</div>
              <div className="text-xs text-muted-foreground">
                The manager retains final team selection unless a future ownership setting gives you
                direct control.
              </div>
            </div>
            <Sparkles className="size-5 text-primary" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PresetButton
              active={preset === "strongest"}
              onClick={() => choose("strongest")}
              title="Strongest"
              sub="Best XI"
            />
            <PresetButton
              active={preset === "rested"}
              onClick={() => choose("rested")}
              title="Rested"
              sub="Rotate depth"
            />
            <PresetButton
              active={preset === "youth"}
              onClick={() => choose("youth")}
              title="Youth"
              sub="Favour U23s"
            />
          </div>
        </section>

        <section className="min-h-[29rem] overflow-hidden rounded-xl border bg-emerald-950 p-3 text-white shadow-sm lg:col-start-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">
                4-4-2 suggestion
              </div>
              <div className="font-display text-2xl">First XI</div>
            </div>
            <Users className="size-6 text-white/70" />
          </div>
          <Pitch xi={xi} />
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="border-b px-4 py-3">
            <div className="font-display text-xl">Wider squad</div>
            <div className="text-xs text-muted-foreground">
              Exact ability is visible because these are your contracted players.
            </div>
          </div>
          <div className="contained-scroll min-h-0 flex-1 divide-y">
            {bench.map((player) => (
              <PlayerRow key={player.id} state={state} player={player} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function chooseXi(players: FootballPlayer[], preset: Preset, season: number): FootballPlayer[] {
  const used = new Set<string>();
  const score = (player: FootballPlayer) => {
    if (preset === "youth") {
      return (
        player.currentAbility +
        Math.max(0, 25 - ageOf(player, season)) * 2.4 +
        player.potentialAbility * 0.12
      );
    }
    if (preset === "rested") {
      const rotation = player.availability === "available" ? 8 : -30;
      const prospect = ageOf(player, season) <= 24 ? 4 : 0;
      return player.currentAbility + rotation + prospect;
    }
    return player.currentAbility;
  };

  return FORMATION.map((position) => {
    const candidates = players
      .filter((player) => !used.has(player.id))
      .filter(
        (player) =>
          player.primaryPosition === position || player.secondaryPositions.includes(position),
      )
      .sort((a, b) => score(b) - score(a));
    const fallback = players
      .filter((player) => !used.has(player.id))
      .sort((a, b) => score(b) - score(a));
    const chosen = candidates[0] ?? fallback[0];
    if (chosen) used.add(chosen.id);
    return chosen;
  }).filter((player): player is FootballPlayer => Boolean(player));
}

function Pitch({ xi }: { xi: FootballPlayer[] }) {
  const groups: Array<{ label: string; players: FootballPlayer[] }> = [
    {
      label: "Forwards",
      players: xi.filter((player) => player.primaryPosition === "FWD").slice(0, 2),
    },
    {
      label: "Midfield",
      players: xi.filter((player) => player.primaryPosition === "MID").slice(0, 4),
    },
    {
      label: "Defence",
      players: xi.filter((player) => player.primaryPosition === "DEF").slice(0, 4),
    },
    {
      label: "Goalkeeper",
      players: xi.filter((player) => player.primaryPosition === "GK").slice(0, 1),
    },
  ];
  const remaining = xi.filter(
    (player) => !groups.some((group) => group.players.some((member) => member.id === player.id)),
  );
  for (const player of remaining) {
    const target = groups.find(
      (group) =>
        group.players.length <
        (group.label === "Goalkeeper" ? 1 : group.label === "Forwards" ? 2 : 4),
    );
    target?.players.push(player);
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/20 bg-emerald-800/70 px-3 py-3">
      <div className="pointer-events-none absolute inset-x-4 top-1/2 border-t border-white/25" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="relative space-y-3 xl:space-y-4">
        {groups.map((group) => (
          <div key={group.label} className="flex justify-center gap-2 sm:gap-4">
            {group.players.map((player) => (
              <div key={player.id} className="w-20 text-center sm:w-24">
                <div className="mx-auto grid size-10 place-items-center rounded-full border border-white/30 bg-black/30 font-display text-sm">
                  {player.currentAbility}
                </div>
                <div className="mt-1 truncate text-[11px] font-semibold">{player.lastName}</div>
                <div className="text-[9px] text-white/60">{player.primaryPosition}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ state, player }: { state: GameState; player: FootballPlayer }) {
  const contract = activeContract(state, player.id);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{playerName(player)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold">
            {player.primaryPosition}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {ageOf(player, state.season)}y · {player.nationality} · Ability {player.currentAbility} ·
          Potential {player.potentialAbility}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {contract
            ? `${contract.squadRole} · ${weeksLeftOnContract(state, contract)} weeks left`
            : "No active contract"}
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-xl">{player.currentAbility}</div>
        <div className="text-[10px] uppercase text-muted-foreground">OVR</div>
      </div>
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted",
      )}
    >
      <div className="font-semibold">{title}</div>
      <div
        className={cn("text-xs", active ? "text-primary-foreground/70" : "text-muted-foreground")}
      >
        {sub}
      </div>
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <div className="font-display text-2xl">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function averageAbility(players: FootballPlayer[]): number {
  return players.length
    ? players.reduce((sum, player) => sum + player.currentAbility, 0) / players.length
    : 0;
}
