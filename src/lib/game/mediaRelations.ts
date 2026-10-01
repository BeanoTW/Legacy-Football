import type { GameState } from "./types";
import { hashString } from "./rng";

export type JournalistStyle = "balanced" | "supporter" | "financial" | "confrontational";
export type MediaRelationshipBand = "Warm" | "Professional" | "Cool" | "Hostile";

export interface JournalistProfile {
  id: string;
  name: string;
  outlet: string;
  role: string;
  style: JournalistStyle;
}

export interface MediaRelationship {
  journalistId: string;
  score: number;
  band: MediaRelationshipBand;
}

export const JOURNALISTS: readonly JournalistProfile[] = [
  { id: "rachel-morgan", name: "Rachel Morgan", outlet: "Terrace Gazette", role: "Local Sport", style: "supporter" },
  { id: "dan-holloway", name: "Dan Holloway", outlet: "The Touchline", role: "Club Reporter", style: "balanced" },
  { id: "sarah-pike", name: "Sarah Pike", outlet: "Pyramid Weekly", role: "Football Correspondent", style: "financial" },
  { id: "marcus-reid", name: "Marcus Reid", outlet: "The Touchline", role: "Senior Reporter", style: "confrontational" },
];

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const key = (journalistId: string) => `mediaRelationship:${journalistId}`;

export function journalistForConversation(
  state: GameState,
  conversationKey: string,
): JournalistProfile {
  const seed = hashString(`${state.saveSeed}|journalist|${conversationKey}`) >>> 0;
  return JOURNALISTS[seed % JOURNALISTS.length] ?? JOURNALISTS[0];
}

export function mediaRelationship(
  state: GameState,
  journalistId: string,
): MediaRelationship {
  const stored = Number(state.inboxFlags[key(journalistId)]);
  const score = Number.isFinite(stored) ? clamp(stored) : 55;
  const band: MediaRelationshipBand =
    score >= 72 ? "Warm" : score >= 48 ? "Professional" : score >= 28 ? "Cool" : "Hostile";
  return { journalistId, score, band };
}

export function adjustMediaRelationshipInPlace(
  state: GameState,
  journalistId: string,
  delta: number,
): void {
  const current = mediaRelationship(state, journalistId);
  state.inboxFlags[key(journalistId)] = clamp(current.score + delta);
}

export function mediaRelationshipDeltaForOutcome(outcome: string): number {
  if (outcome === "Open and accountable") return 3;
  if (outcome === "Combative") return -4;
  return 1;
}

export function journalistQuestionPressure(
  state: GameState,
  journalist: JournalistProfile,
): "soft" | "normal" | "hard" {
  const relationship = mediaRelationship(state, journalist.id);
  if (journalist.style === "confrontational" || relationship.score < 35) return "hard";
  if (relationship.score >= 72 && journalist.style !== "financial") return "soft";
  return "normal";
}
