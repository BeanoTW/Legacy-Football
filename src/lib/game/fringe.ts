import type { FringeClubState, FringeWorldState, GameState } from "./types";
import { buildWorldSimulationPlan } from "./world";
import { clubReputation, finishIn } from "./reputation";
import { hashString } from "./rng";

/**
 * Compact persistent state for clubs outside the detailed simulation bubble.
 * It deliberately stores only values that must survive save/reload. Detailed
 * squads, contracts and match-by-match state belong to Focus simulation.
 */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function stableOffset(seed: string, clubId: string, channel: string, span: number): number {
  const h = hashString(`${seed}|fringe|${clubId}|${channel}`);
  return (Math.abs(h) % (span * 2 + 1)) - span;
}

/** Previous-season finish mapped onto the compact -4..4 form scale. */
export function fringeFormFromFinish(s: GameState, clubId: string, season: number): number | null {
  const finish = finishIn(s, clubId, season - 1);
  if (!finish) return null;
  const size = s.leagues.find((league) => league.id === finish.leagueId)?.clubIds.length ?? 20;
  const midpoint = (size + 1) / 2;
  return clamp(Math.round(((midpoint - finish.position) / midpoint) * 4), -4, 4);
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

/**
 * Advances compact clubs to the state's current season without expanding
 * their detailed football state. Each season is derived from the save seed,
 * club identity and season number, so season jumps and reloads are replay-safe.
 * Snapshots for clubs newly entering Focus are deliberately retained here;
 * recruitment consumes them during hydration and then reconciles the map.
 */
export function advanceFringeWorldToSeason(s: GameState): FringeWorldState {
  const world = s.fringeWorld ?? buildFringeWorldState(s);
  const advanced: FringeWorldState = {};

  for (const clubId of Object.keys(world).sort((a, b) => a.localeCompare(b))) {
    const current = { ...world[clubId] };
    while (current.lastSimulatedSeason < s.season) {
      const season = current.lastSimulatedSeason + 1;
      const reputation = clubReputation(s, clubId);
      const strengthDrift = stableOffset(s.saveSeed, clubId, `strength-s${season}`, 2);
      const financeDrift = stableOffset(s.saveSeed, clubId, `finance-s${season}`, 1);

      current.reputation = reputation;
      current.strength = clamp(
        Math.round(current.strength * 0.75 + reputation * 0.25 + strengthDrift),
        1,
        100,
      );
      current.form =
        fringeFormFromFinish(s, clubId, season) ??
        stableOffset(s.saveSeed, clubId, `form-s${season}`, 5);
      current.financeBand = clamp(
        Math.round((current.financeBand * 2 + reputation / 20 + financeDrift) / 3),
        1,
        5,
      );
      current.lastSimulatedSeason = season;
    }
    advanced[clubId] = current;
  }

  s.fringeWorld = advanced;
  return advanced;
}

/** Returns the persisted compact layer, creating it for legacy saves on demand. */
export function ensureFringeWorldState(s: GameState): FringeWorldState {
  s.fringeWorld = reconcileFringeWorldState(s, s.fringeWorld);
  return s.fringeWorld;
}
