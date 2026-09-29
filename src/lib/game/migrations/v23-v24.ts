import type { GameState, SponsorshipCategory } from "../types";
import { absoluteWeek } from "../time";
import { hashString } from "../rng";
import { userClubReference } from "../clubReference";
import { ensureCommercial } from "../commercial";
import type { Migration } from "./types";

const CATEGORIES: SponsorshipCategory[] = [
  "Shirt Front",
  "Shirt Sleeve",
  "Training Kit",
  "Stadium Advertising",
  "Matchday Programme",
  "Club Partner",
];

/**
 * v24 retires the parallel legacy Sponsor[] economy. Any still-live legacy
 * agreement is represented exactly once as a canonical Commercial contract,
 * preserving its remaining weekly value without inventing a signing bonus.
 */
export const COMMERCIAL_UNIFICATION_MIGRATIONS: Migration[] = [
  {
    from: 23,
    to: 24,
    describe: "Move remaining legacy sponsorship into Commercial contracts",
    up(save) {
      const state = save as unknown as GameState;
      ensureCommercial(state);

      const legacy = Array.isArray(state.sponsors) ? state.sponsors : [];
      const occupied = new Set(
        state.commercial.contracts
          .filter((contract) => contract.status === "Active")
          .map((contract) => contract.category),
      );
      const now = absoluteWeek(state.season, state.week);

      for (let index = 0; index < legacy.length; index++) {
        const sponsor = legacy[index];
        if (!sponsor || sponsor.weekly <= 0 || sponsor.weeksLeft <= 0) continue;

        const contractId = `legacy-commercial-${hashString(
          `${state.saveSeed}|v24|${index}|${sponsor.name}|${sponsor.weekly}|${sponsor.weeksLeft}`,
        ).toString(36)}`;
        if (state.commercial.contracts.some((contract) => contract.id === contractId)) continue;

        const category = CATEGORIES.find((candidate) => !occupied.has(candidate));
        if (!category) break;

        const sponsorId = `legacy-sponsor-${hashString(
          `${state.saveSeed}|v24-sponsor|${index}|${sponsor.name}`,
        ).toString(36)}`;
        if (!state.commercial.sponsors.some((candidate) => candidate.id === sponsorId)) {
          state.commercial.sponsors.push({
            id: sponsorId,
            companyName: sponsor.name,
            industry: "Retail",
            reputation: 30,
            budget: Math.max(sponsor.weekly, 50),
            preferredClubSize: "local",
            preferredLeagueTier: 2,
            preferredRegions: [],
            relationshipScore: 50,
            contractHistory: [contractId],
          });
        }

        state.commercial.contracts.push({
          id: contractId,
          sponsorId,
          category,
          clubId: userClubReference(state),
          startSeason: state.season,
          startAbsoluteWeek: now,
          durationSeasons: Math.max(1, Math.ceil(sponsor.weeksLeft / 46)),
          endAbsoluteWeek: now + sponsor.weeksLeft,
          weeklyPayment: sponsor.weekly,
          signingBonus: 0,
          renewalWindowWeeks: Math.min(8, sponsor.weeksLeft),
          objectives: [],
          relationshipScore: 50,
          status: "Active",
        });
        occupied.add(category);
      }

      state.sponsors = [];
    },
  },
];
