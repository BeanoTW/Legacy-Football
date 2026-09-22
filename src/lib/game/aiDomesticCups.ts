import type { DomesticCupState, GameState } from "./types";
import { clubMatchStrength } from "./matchStrength";
import { hashString, mulberry32 } from "./rng";
import { resolveKnockoutDraw } from "./knockout";
import { advanceDomesticCup, resolveDomesticCupTie } from "./domesticCupState";
import { userClubReference, sameClubReference } from "./clubReference";
import { cupSlot } from "./cupSchedule";
import { calendarDay } from "./calendar";
import { recordCupChampionInLegacyInPlace } from "./clubLegacy";

function aiCupScore(state: GameState, home: string, away: string, competition: string, round: number) {
  const hs = clubMatchStrength(state, home, state.season);
  const as = clubMatchStrength(state, away, state.season);
  const rng = mulberry32(hashString(`cup-ai|${state.saveSeed}|${state.season}|${competition}|${round}|${home}|${away}`));
  const goal = (attack: number, defence: number) => {
    const edge = Math.max(-18, Math.min(18, attack - defence));
    let g = 0;
    const chances = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < chances; i += 1) if (rng() < 0.22 + edge / 180) g += 1;
    return g;
  };
  return { home: goal(hs + 3, as), away: goal(as, hs + 3) };
}

/**
 * Resolve every non-user tie in the current round. The user's tie is left
 * untouched for the normal matchday pipeline. Once all ties are known the
 * competition advances as one coherent tournament.
 */
export function resolveAiDomesticCupRound(state: GameState, cup: DomesticCupState): DomesticCupState {
  const slot = cupSlot(cup.competition, cup.round);
  // A round only exists on its calendar slot. Weekly ticks before that date
  // must not silently play AI ties or advance the competition early.
  if (
    !slot ||
    state.week < slot.week ||
    (state.week === slot.week && calendarDay(state) < slot.dayOfWeek)
  ) return cup;

  const user = userClubReference(state);
  let next = cup;
  for (const tie of cup.ties) {
    if (tie.winner) continue;
    if (sameClubReference(state, tie.home, user) || sameClubReference(state, tie.away, user)) continue;

    const score = aiCupScore(state, tie.home, tie.away, cup.competition, cup.round);
    const decider = resolveKnockoutDraw(
      score.home,
      score.away,
      `${state.saveSeed}|${state.season}|${cup.competition}|${cup.round}|${tie.home}|${tie.away}`,
    );
    const winner = decider.winner === "home" ? tie.home : tie.away;
    next = resolveDomesticCupTie(next, tie.home, tie.away, winner);
  }
  const advanced = advanceDomesticCup(next, `${state.saveSeed}|${state.season}`, state);
  if (advanced.champion) recordCupChampionInLegacyInPlace(state, advanced.competition, advanced.champion);
  return advanced;
}

export function resolveAllAiDomesticCups(state: GameState): void {
  if (!state.domesticCups) return;
  state.domesticCups = state.domesticCups.map((cup) => resolveAiDomesticCupRound(state, cup));
}
