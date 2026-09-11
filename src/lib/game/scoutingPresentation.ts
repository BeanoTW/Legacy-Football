import type { FootballPlayer, GameState } from "./types";
import type { ScoutingReport } from "./scouting";
import { isUserClubReference } from "./clubReference";

export interface ScoutedOverallPresentation {
  label: string;
  exact: boolean;
  known: boolean;
}

const clampOverall = (value: number) => Math.max(1, Math.min(99, Math.round(value)));

/**
 * Chairman-facing overall presentation. The underlying current ability remains
 * canonical simulation state; this helper only controls what the chairman is
 * allowed to know from the current scouting report.
 */
export function scoutedOverallPresentation(
  state: GameState,
  player: FootballPlayer,
  report: ScoutingReport | null | undefined,
): ScoutedOverallPresentation {
  if (isUserClubReference(state, player.currentClubId) || report?.complete) {
    return { label: String(player.currentAbility), exact: true, known: true };
  }

  const knowledge = report?.knowledgePct ?? 0;
  if (knowledge <= 0) return { label: "?", exact: false, known: false };

  // Early staff knowledge should be useful without pretending to be precise.
  // Four-day reports are materially tighter; the six-day report becomes exact.
  const width = knowledge >= 60 ? 5 : knowledge >= 40 ? 8 : 12;
  const min = clampOverall(player.currentAbility - width);
  const max = clampOverall(player.currentAbility + width);
  return { label: `${min}–${max}`, exact: false, known: true };
}
