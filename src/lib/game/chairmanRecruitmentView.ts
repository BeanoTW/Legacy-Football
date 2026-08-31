import type { GameState, Position } from "./types";
import { knownPlayerIdentity } from "./playerLifecycle";
import { knownPlayerDetail } from "./knownPlayerDetail";
import { chairmanShortlistIds, isChairmanShortlisted } from "./recruitmentKnowledge";
import { discoveredPlayerIds } from "./scoutingDiscovery";
import { scoutingAssignment, scoutingReportById, type AttributeKnowledge } from "./scouting";

export interface ChairmanRecruitmentPlayerView {
  playerId: string;
  name: string;
  age: number;
  position: Position;
  clubId: string | null;
  shortlisted: boolean;
  scoutingStatus: "notStarted" | "active" | "complete";
  knowledgePct: number;
  attributes: AttributeKnowledge[];
  valueRange?: [number, number];
  wageRange?: [number, number];
  personalityKnown: boolean;
}

function ageFromBirthYear(state: GameState, year: number): number {
  return 2000 + state.season - 1 - year;
}

/**
 * Chairman-facing recruitment list. The crucial contract is what is absent:
 * undiscovered external detailed players never appear simply because the
 * simulation currently happens to hold them in the Focus bubble.
 */
export function chairmanRecruitmentPlayerIds(state: GameState): string[] {
  const visible = new Set<string>(chairmanShortlistIds(state));
  for (const id of discoveredPlayerIds(state)) visible.add(id);
  for (const known of state.football?.playerLifecycle?.knownPlayers ?? []) {
    if (
      known.reasons.includes("scouted") ||
      known.reasons.includes("shortlisted") ||
      known.reasons.includes("negotiation") ||
      known.reasons.includes("formerPlayer") ||
      known.reasons.includes("remembered") ||
      known.reasons.includes("contractualHook")
    ) {
      visible.add(known.playerId);
    }
  }
  return [...visible].sort((a, b) => a.localeCompare(b));
}

export function chairmanRecruitmentPlayerView(
  state: GameState,
  playerId: string,
): ChairmanRecruitmentPlayerView | null {
  if (!chairmanRecruitmentPlayerIds(state).includes(playerId)) return null;
  const known = knownPlayerIdentity(state, playerId);
  const detail = knownPlayerDetail(state, playerId);
  if (!known && !detail) return null;
  const assignment = scoutingAssignment(state, playerId);
  const report = scoutingReportById(state, playerId);
  const birthYear = detail?.dateOfBirth.year ?? known!.dateOfBirth.year;
  return {
    playerId,
    name: detail ? `${detail.firstName} ${detail.lastName}` : `${known!.firstName} ${known!.lastName}`,
    age: ageFromBirthYear(state, birthYear),
    position: detail?.primaryPosition ?? known!.primaryPosition,
    clubId: detail?.currentClubId ?? known!.currentClubId,
    shortlisted: isChairmanShortlisted(state, playerId),
    scoutingStatus: assignment?.status ?? "notStarted",
    knowledgePct: report?.knowledgePct ?? 0,
    attributes: report?.attributes ?? [],
    valueRange: report?.valueRange,
    wageRange: report?.wageRange,
    personalityKnown: report?.personalityKnown ?? false,
  };
}

export function chairmanRecruitmentPlayers(state: GameState): ChairmanRecruitmentPlayerView[] {
  return chairmanRecruitmentPlayerIds(state).flatMap((playerId) => {
    const view = chairmanRecruitmentPlayerView(state, playerId);
    return view ? [view] : [];
  });
}
