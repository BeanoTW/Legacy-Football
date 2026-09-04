import type { FootballPlayer, GameState } from "./types";
import { activeContract, weeksLeftOnContract } from "./recruitment";
import { isUserClubReference, userClubReference } from "./clubReference";
import { clubSimulationSeedKey } from "./clubIdentity";

const NICKNAMES = [
  "The Foundry",
  "The Borough",
  "The Railwaymen",
  "The Mariners",
  "The Stags",
  "The Ravens",
  "The Lions",
  "The Irons",
] as const;

function stableIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0) % length;
}

/** Stable presentation identity: no save migration and no gameplay randomness. */
export function clubNickname(
  state: Pick<GameState, "clubName" | "saveSeed" | "clubIdentity">,
): string {
  const seedKey = clubSimulationSeedKey(state, userClubReference(state));
  return NICKNAMES[stableIndex(`${state.saveSeed}|${seedKey}|nickname`, NICKNAMES.length)];
}

export function chairmanStyle(state: GameState): { label: string; detail: string } {
  const transfers = state.football?.transferHistory ?? [];
  const arrivals = transfers.filter((move) => isUserClubReference(state, move.toClubId)).length;
  const departures = transfers.filter((move) => isUserClubReference(state, move.fromClubId)).length;
  if (state.cash < 0) return { label: "High-wire owner", detail: "Ambition is running ahead of the balance sheet." };
  if (state.fanHappiness >= 82) return { label: "Supporters' chairman", detail: "The terraces believe the club is in safe hands." };
  if (arrivals + departures >= 6) return { label: "Market operator", detail: "Your reign is being shaped in the transfer market." };
  if (state.cash >= 4_000_000) return { label: "Prudent custodian", detail: "Security and patience define the ownership." };
  return { label: "Steady hand", detail: "A measured reputation is taking shape." };
}

export type PlayerMoodTone = "good" | "watch" | "bad" | "muted";
export function playerMood(
  state: GameState,
  player: FootballPlayer,
): { label: string; detail: string; tone: PlayerMoodTone } {
  if (player.availability === "unavailable") {
    return { label: "Unavailable", detail: "Focused on returning to contention.", tone: "bad" };
  }
  const contract = activeContract(state, player.id);
  const weeks = contract ? weeksLeftOnContract(state, contract) : 0;
  if (!contract || weeks <= 26) {
    return { label: "Contract anxious", detail: "His future needs resolving soon.", tone: "bad" };
  }
  if (player.personality === "Ambitious" && ["Rotation", "Prospect"].includes(contract.squadRole)) {
    return { label: "Restless", detail: "He wants a more important role.", tone: "watch" };
  }
  if (player.personality === "Mercenary" && contract.weeklyWage < player.wageExpectation * 0.9) {
    return { label: "Wants improved terms", detail: "His wage no longer matches his expectations.", tone: "watch" };
  }
  if (player.personality === "Loyal") return { label: "Committed", detail: "Strongly attached to the club.", tone: "good" };
  if (player.personality === "Professional") return { label: "Focused", detail: "Training and standards come first.", tone: "good" };
  if (player.personality === "Temperamental") return { label: "Unpredictable", detail: "His mood can turn quickly.", tone: "watch" };
  return { label: "Settled", detail: "Content with his current place in the squad.", tone: "muted" };
}

export const MOOD_TONE_CLASS: Record<PlayerMoodTone, string> = {
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  watch: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  muted: "bg-muted text-muted-foreground",
};
