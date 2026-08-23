import type { GameState } from "./types";
import { buildWorldSimulationPlan } from "./world";
import { clubReputation } from "./reputation";
import { hashString } from "./rng";

/**
 * Compact persistent state for clubs outside the detailed simulation bubble.
 * It deliberately stores only values that must survive save/reload. Detailed
 * squads, contracts and match-by-match state belong to Focus simulation.
 */
export interface FringeClubState {
  clubId: string;
  leagueId: string;
  tier: number;
  reputation: number;
  strength: number;
  form: number;
  financeBand: number;
  lastSimulatedSeason: number;
}

export type FringeWorldState = Record<string, FringeClubState>;

type StateWithFringe = GameState & { fringeWorld?: FringeWorldState };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function stableOffset(seed: string, clubId: string, channel: string, span: number): number {
  const h = hashString(`${seed}|fringe|${clubId}|${channel}`);
  return (Math.abs(h) % (span * 2 + 1)) - span;
}

export function makeFringeClubState(
  s: Pick<GameState, "saveSeed" | "season" | "clubReputations">,
  clubId: string,
  leagueId: string,
  tier: number,
): FringeClubState {
  const reputation = clubReputation(s as GameState, clubId);
  return {
    clubId,
    leagueId,
    tier,
    reputation,
    strength: clamp(reputation + stableOffset(s.saveSeed, clubId, "strength", 7), 1, 100),
    form: stableOffset(s.saveSeed, clubId, `form-s${s.season}`, 5),
    financeBand: clamp(
      Math.round(reputation / 20) + stableOffset(s.saveSeed, clubId, "finance", 1),
      1,
      5,
    ),
    lastSimulatedSeason: s.season,
  };
}

/** Pure deterministic snapshot of the clubs currently outside Focus. */
export function buildFringeWorldState(s: GameState): FringeWorldState {
  const plan = buildWorldSimulationPlan(s);
  const out: FringeWorldState = {};
  for (const profile of plan.clubs) {
    if (profile.level !== "fringe") continue;
    out[profile.clubId] = makeFringeClubState(s, profile.clubId, profile.leagueId, profile.tier);
  }
  return out;
}

/**
 * Reconciles persisted lightweight state with the current Focus boundary.
 * Clubs entering Focus disappear from this map; clubs leaving Focus acquire a
 * deterministic compact snapshot. No detailed football state is fabricated.
 */
export function reconcileFringeWorldState(
  s: GameState,
  previous: FringeWorldState = {},
): FringeWorldState {
  const plan = buildWorldSimulationPlan(s);
  const out: FringeWorldState = {};
  for (const profile of plan.clubs) {
    if (profile.level !== "fringe") continue;
    const old = previous[profile.clubId];
    out[profile.clubId] = old
      ? {
          ...old,
          leagueId: profile.leagueId,
          tier: profile.tier,
          reputation: clubReputation(s, profile.clubId),
        }
      : makeFringeClubState(s, profile.clubId, profile.leagueId, profile.tier);
  }
  return out;
}

export function fringeWorldSignature(world: FringeWorldState): string {
  return Object.values(world)
    .sort((a, b) => a.clubId.localeCompare(b.clubId))
    .map(
      (c) =>
        `${c.clubId}:${c.leagueId}:${c.tier}:${c.reputation}:${c.strength}:${c.form}:${c.financeBand}:${c.lastSimulatedSeason}`,
    )
    .join("|");
}

/** Returns the persisted compact layer, creating it for legacy saves on demand. */
export function ensureFringeWorldState(s: GameState): FringeWorldState {
  const state = s as StateWithFringe;
  state.fringeWorld = reconcileFringeWorldState(s, state.fringeWorld);
  return state.fringeWorld;
}
