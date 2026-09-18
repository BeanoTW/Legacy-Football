import { hashString, mulberry32 } from "./rng";

export interface KnockoutDecision {
  winner: "home" | "away";
  homeGoals: number;
  awayGoals: number;
  afterExtraTime: boolean;
  penalties?: { home: number; away: number };
}

/** Resolve a level knockout tie without replaying it. Deterministic per save/tie. */
export function resolveKnockoutDraw(
  homeGoals: number,
  awayGoals: number,
  seed: string,
): KnockoutDecision {
  if (homeGoals !== awayGoals) {
    return {
      winner: homeGoals > awayGoals ? "home" : "away",
      homeGoals,
      awayGoals,
      afterExtraTime: false,
    };
  }

  const rng = mulberry32(hashString(`knockout|${seed}|${homeGoals}-${awayGoals}`));
  let h = homeGoals;
  let a = awayGoals;
  // Extra time is deliberately lower scoring than 90 minutes.
  if (rng() < 0.32) h += 1;
  if (rng() < 0.28) a += 1;
  if (h !== a) return { winner: h > a ? "home" : "away", homeGoals: h, awayGoals: a, afterExtraTime: true };

  // Shootouts cannot finish level. Model sudden death after an initial 5.
  let hp = 3 + Math.floor(rng() * 3);
  let ap = 3 + Math.floor(rng() * 3);
  while (hp === ap) {
    if (rng() < 0.5) hp += 1;
    else ap += 1;
  }
  return {
    winner: hp > ap ? "home" : "away",
    homeGoals: h,
    awayGoals: a,
    afterExtraTime: true,
    penalties: { home: hp, away: ap },
  };
}
