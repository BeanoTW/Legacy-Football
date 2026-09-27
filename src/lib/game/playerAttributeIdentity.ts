import type { TacticalPosition } from "./types";
import type { AttributeKnowledge, PlayerAttributeKey } from "./scouting";

export interface PlayerAttributeIdentity {
  label: string;
  summary: string;
  strengths: string[];
}

type Scores = Partial<Record<PlayerAttributeKey, number>>;

function midpoint(attribute: AttributeKnowledge): number | null {
  if (!attribute.known) return null;
  if (attribute.exact !== undefined) return attribute.exact;
  if (attribute.min !== undefined && attribute.max !== undefined) {
    return Math.round((attribute.min + attribute.max) / 2);
  }
  return null;
}

function knownScores(attributes: AttributeKnowledge[]): Scores {
  return Object.fromEntries(
    attributes.flatMap((attribute) => {
      const value = midpoint(attribute);
      return value === null ? [] : [[attribute.key, value]];
    }),
  ) as Scores;
}

function avg(scores: Scores, keys: PlayerAttributeKey[]): number | null {
  const values = keys.map((key) => scores[key]).filter((value): value is number => value !== undefined);
  return values.length === keys.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function bestStrengths(attributes: AttributeKnowledge[], count = 3): string[] {
  return attributes
    .flatMap((attribute) => {
      const value = midpoint(attribute);
      return value === null ? [] : [{ label: attribute.label, value }];
    })
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, count)
    .map((entry) => entry.label);
}

function choose(candidates: Array<{ label: string; summary: string; score: number | null }>): { label: string; summary: string } | null {
  return candidates
    .filter((candidate): candidate is { label: string; summary: string; score: number } => candidate.score !== null)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

/**
 * Chairman-facing football identity derived only from revealed attributes.
 * This deliberately never reads the hidden underlying attribute profile.
 */
export function playerAttributeIdentity(
  position: TacticalPosition,
  attributes: AttributeKnowledge[],
): PlayerAttributeIdentity | null {
  const known = attributes.filter((attribute) => attribute.known);
  if (known.length < 4) return null;
  const scores = knownScores(known);
  let profile: { label: string; summary: string } | null = null;

  switch (position) {
    case "GK":
      profile = choose([
        { label: "Commanding goalkeeper", summary: "Strong presence, positioning and aerial authority.", score: avg(scores, ["positioning", "jumping", "strength"]) },
        { label: "Composed goalkeeper", summary: "Comfortable making decisions and starting play calmly.", score: avg(scores, ["decisions", "composure", "shortPassing"]) },
        { label: "Traditional goalkeeper", summary: "Built primarily around core goalkeeping ability.", score: avg(scores, ["goalkeeping", "positioning"]) },
      ]);
      break;
    case "CB":
      profile = choose([
        { label: "Aerial centre-back", summary: "Wins physical and aerial contests and protects the box.", score: avg(scores, ["jumping", "strength", "positioning"]) },
        { label: "Ball-playing centre-back", summary: "Comfortable stepping out and progressing possession.", score: avg(scores, ["shortPassing", "longPassing", "decisions"]) },
        { label: "Aggressive stopper", summary: "Front-foot defender who thrives on tackles and duels.", score: avg(scores, ["tackling", "aggression", "strength"]) },
      ]);
      break;
    case "LB":
    case "RB":
      profile = choose([
        { label: "Attacking full-back", summary: "Provides width with pace, stamina and crossing.", score: avg(scores, ["crossing", "pace", "stamina"]) },
        { label: "Defensive full-back", summary: "Prioritises positioning and one-on-one defending.", score: avg(scores, ["tackling", "positioning", "workRate"]) },
      ]);
      break;
    case "LWB":
    case "RWB":
      profile = choose([
        { label: "Flying wing-back", summary: "High-energy wide outlet who repeatedly attacks the flank.", score: avg(scores, ["pace", "stamina", "crossing"]) },
        { label: "Two-way wing-back", summary: "Balances defensive work with reliable wide progression.", score: avg(scores, ["workRate", "tackling", "crossing"]) },
      ]);
      break;
    case "CDM":
      profile = choose([
        { label: "Ball-winning midfielder", summary: "Breaks up play through tackling, positioning and work rate.", score: avg(scores, ["tackling", "positioning", "workRate"]) },
        { label: "Deep-lying playmaker", summary: "Controls possession from deep with passing and vision.", score: avg(scores, ["shortPassing", "longPassing", "vision"]) },
        { label: "Holding midfielder", summary: "Disciplined screen who protects the defence.", score: avg(scores, ["positioning", "decisions", "strength"]) },
      ]);
      break;
    case "CM":
      profile = choose([
        { label: "Box-to-box midfielder", summary: "Covers ground, works hard and contributes in both directions.", score: avg(scores, ["stamina", "workRate", "shortPassing"]) },
        { label: "Central playmaker", summary: "Dictates possession with passing, vision and decisions.", score: avg(scores, ["shortPassing", "vision", "decisions"]) },
        { label: "Ball-winning midfielder", summary: "Adds bite and defensive pressure through the middle.", score: avg(scores, ["tackling", "aggression", "workRate"]) },
      ]);
      break;
    case "CAM":
      profile = choose([
        { label: "Creative No.10", summary: "Finds pockets and unlocks defences with vision and technique.", score: avg(scores, ["vision", "firstTouch", "shortPassing"]) },
        { label: "Goalscoring No.10", summary: "Arrives in dangerous areas and carries a genuine goal threat.", score: avg(scores, ["finishing", "positioning", "composure"]) },
        { label: "Dribbling playmaker", summary: "Creates openings by carrying the ball through pressure.", score: avg(scores, ["dribbling", "agility", "firstTouch"]) },
      ]);
      break;
    case "LM":
    case "RM":
      profile = choose([
        { label: "Traditional wide midfielder", summary: "Provides width, delivery and reliable work rate.", score: avg(scores, ["crossing", "stamina", "workRate"]) },
        { label: "Wide playmaker", summary: "Creates from the flank through touch, passing and vision.", score: avg(scores, ["firstTouch", "shortPassing", "vision"]) },
      ]);
      break;
    case "LW":
    case "RW":
      profile = choose([
        { label: "Direct winger", summary: "Attacks defenders with acceleration, pace and dribbling.", score: avg(scores, ["acceleration", "pace", "dribbling"]) },
        { label: "Creative winger", summary: "Combines delivery and vision to create from wide areas.", score: avg(scores, ["crossing", "vision", "dribbling"]) },
        { label: "Inside forward", summary: "Carries a stronger scoring threat from wide positions.", score: avg(scores, ["finishing", "composure", "dribbling"]) },
      ]);
      break;
    case "ST":
      profile = choose([
        { label: "Poacher", summary: "Lives for movement in the box and composed finishing.", score: avg(scores, ["finishing", "positioning", "composure"]) },
        { label: "Target forward", summary: "Uses strength and aerial ability to lead the line.", score: avg(scores, ["strength", "jumping", "firstTouch"]) },
        { label: "Mobile striker", summary: "Threatens space with pace, acceleration and movement.", score: avg(scores, ["pace", "acceleration", "positioning"]) },
      ]);
      break;
  }

  if (!profile) return null;
  return {
    ...profile,
    strengths: bestStrengths(known),
  };
}
