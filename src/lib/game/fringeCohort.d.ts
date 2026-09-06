import "./types";

declare module "./types" {
  interface FringeClubState {
    /** Increments only when the compact squad turns over into a new cohort. */
    playerGeneration?: number;
    /** Lightweight age signal used to age/refresh implicit distant players. */
    squadMeanAge?: number;
    /** Season the currently represented compact player cohort was formed. */
    cohortSeason?: number;
  }
}
