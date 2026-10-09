import { Star } from "lucide-react";

import type { GameState } from "@/lib/game/types";
import {
  CALENDAR,
  WINDOW_PRESEASON_END,
  calendarDay,
  isTransferWindowOpen,
} from "@/lib/game/engine";

/** Five-star reputation read-out: one star per 20 reputation points, partially filled. */
export function ReputationStars({ value }: { value: number }) {
  const stars = Math.max(0, Math.min(5, value / 20));
  return (
    <span className="lf-rep-stars" aria-label={`${stars.toFixed(1)} of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, stars - index));
        return (
          <span key={index} className="lf-rep-star-slot">
            <Star className="lf-rep-star" aria-hidden="true" />
            {fill > 0 && (
              <span className="lf-rep-star-fill" style={{ width: `${fill * 100}%` }}>
                <Star className="lf-rep-star is-filled" aria-hidden="true" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

export function transferWindowMasthead(state: GameState): string {
  const day = calendarDay(state);
  if (isTransferWindowOpen(state)) {
    const closingWeek =
      state.week <= WINDOW_PRESEASON_END ? WINDOW_PRESEASON_END : CALENDAR.midSeasonEnd;
    const daysLeft = Math.max(0, (closingWeek - state.week) * 7 + (6 - day) + 1);
    return daysLeft <= 1
      ? "TRANSFER WINDOW OPEN · closes today"
      : `TRANSFER WINDOW OPEN · closes in ${daysLeft} days`;
  }

  const nextOpenWeek =
    state.week < CALENDAR.midSeasonStart ? CALENDAR.midSeasonStart : CALENDAR.seasonEnd + 1;
  const daysUntilOpen =
    nextOpenWeek <= CALENDAR.seasonEnd
      ? Math.max(1, (nextOpenWeek - state.week) * 7 - day)
      : Math.max(1, (CALENDAR.seasonEnd - state.week + 1) * 7 - day);

  return `Transfer window closed · reopens in ${daysUntilOpen} days`;
}
