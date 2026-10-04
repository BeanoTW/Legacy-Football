import type { FootballPlayer, GameState, Staff, StaffRole } from "./types";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function staff(state: GameState, role: StaffRole): Staff | undefined {
  return (state.hiredStaff ?? []).find((member) => member.role === role);
}

export function coachingSupport(state: GameState) {
  const head = staff(state, "Head Coach");
  const assistant = staff(state, "Assistant Manager");
  const goalkeeper = staff(state, "Goalkeeping Coach");
  const manager = staff(state, "Manager");
  return {
    outfieldDevelopment: Math.round(clamp((head?.stats.development ?? 40) * 0.7 + (assistant?.stats.development ?? 40) * 0.3, 25, 95)),
    goalkeeperDevelopment: Math.round(clamp((goalkeeper?.stats.development ?? 35) * 0.8 + (head?.stats.development ?? 40) * 0.2, 25, 95)),
    tacticalPreparation: Math.round(clamp((manager?.stats.tactics ?? 45) * 0.6 + (assistant?.stats.tactics ?? 40) * 0.25 + (head?.stats.tactics ?? 40) * 0.15, 25, 95)),
    motivation: Math.round(clamp((manager?.stats.motivation ?? 45) * 0.65 + (assistant?.stats.motivation ?? 40) * 0.35, 25, 95)),
  };
}

export function playerDevelopmentStaffModifier(state: GameState, player: FootballPlayer): number {
  const support = coachingSupport(state);
  const quality = player.primaryPosition === "GK" ? support.goalkeeperDevelopment : support.outfieldDevelopment;
  return clamp(0.82 + quality / 250, 0.92, 1.20);
}

export function transferSupport(state: GameState) {
  const head = staff(state, "Head of Transfers");
  const chief = staff(state, "Chief Scout");
  const score = Math.round(clamp((head?.stats.negotiation ?? 35) * 0.55 + (head?.stats.scouting ?? 35) * 0.2 + (chief?.stats.scouting ?? 40) * 0.25, 25, 95));
  const negotiation = Math.round(clamp((head?.stats.negotiation ?? 35) * 0.8 + (chief?.stats.negotiation ?? 35) * 0.2, 25, 95));
  const scouting = Math.round(clamp((head?.stats.scouting ?? 35) * 0.35 + (chief?.stats.scouting ?? 40) * 0.65, 25, 95));
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Developing" : "Basic";
  return { score, negotiation, scouting, label };
}
