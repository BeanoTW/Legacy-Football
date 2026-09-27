import type { Staff } from "./types";
import { hashString } from "./rng";

export type ManagerFormation = "4-4-2" | "4-2-3-1" | "4-3-3" | "3-4-3" | "3-5-2" | "5-3-2";
export type ManagerPhilosophy =
  | "Possession"
  | "Front-foot"
  | "Balanced"
  | "Direct"
  | "Defensive";
export type ManagerTendency = "Low" | "Medium" | "High";

export interface ManagerFootballIdentity {
  preferredFormation: ManagerFormation;
  alternativeFormations: ManagerFormation[];
  philosophy: ManagerPhilosophy;
  pressing: ManagerTendency;
  tempo: ManagerTendency;
  directness: ManagerTendency;
  adaptability: ManagerTendency;
  rotation: ManagerTendency;
  youthWillingness: ManagerTendency;
  summary: string;
}

const level = (value: number): ManagerTendency =>
  value >= 72 ? "High" : value >= 54 ? "Medium" : "Low";

const FORMATIONS: readonly ManagerFormation[] = ["4-4-2", "4-2-3-1", "4-3-3", "3-4-3", "3-5-2", "5-3-2"];

function identityBias(manager: Staff, formation: ManagerFormation): number {
  // Manager ids are already generated from the seeded staff-market RNG, so
  // this adds stable personality variety without introducing wall-clock luck.
  const raw = hashString(`manager-shape|${manager.id}|${formation}`) >>> 0;
  return ((raw % 1001) / 1000 - 0.5) * 10;
}

function formationFor(manager: Staff): ManagerFormation {
  const { attack, defense, tactics, motivation, development } = manager.stats;

  // Strongly distinctive profiles should remain recognisable regardless of
  // their small seeded identity lean.
  if (defense >= attack + 14 && tactics >= 66) return "5-3-2";
  if (attack >= defense + 14 && tactics >= 64) return "4-3-3";

  // Three-back football should be a real part of the manager market, not an
  // edge case. Balanced managers get a stable seeded lean toward 3-5-2/3-4-3.
  const shapeLean = hashString(`manager-three-back|${manager.id}`) % 10;
  if (Math.abs(attack - defense) <= 11 && tactics >= 54) {
    if (shapeLean <= 1) return "3-5-2";
    if (shapeLean === 2) return "3-4-3";
  }

  const scores: Record<ManagerFormation, number> = {
    "4-4-2":
      tactics * 0.28 + motivation * 0.24 + attack * 0.24 + defense * 0.24,
    "4-2-3-1":
      tactics * 0.4 + attack * 0.24 + motivation * 0.24 + defense * 0.12,
    "4-3-3":
      attack * 0.4 + tactics * 0.3 + motivation * 0.18 + development * 0.12,
    "3-4-3":
      attack * 0.34 + tactics * 0.28 + development * 0.16 + motivation * 0.12 + defense * 0.1,
    "3-5-2":
      defense * 0.31 + tactics * 0.27 + attack * 0.22 + motivation * 0.2,
    "5-3-2":
      defense * 0.44 + tactics * 0.29 + motivation * 0.17 + attack * 0.1,
  };

  return [...FORMATIONS]
    .map((formation) => ({
      formation,
      score: scores[formation] + identityBias(manager, formation),
    }))
    .sort((a, b) => b.score - a.score || a.formation.localeCompare(b.formation))[0].formation;
}

function alternatives(primary: ManagerFormation, manager: Staff): ManagerFormation[] {
  const { attack, defense, tactics } = manager.stats;
  const ordered: ManagerFormation[] =
    attack > defense
      ? ["4-3-3", "3-4-3", "4-2-3-1", "3-5-2", "4-4-2", "5-3-2"]
      : ["3-5-2", "5-3-2", "4-2-3-1", "4-4-2", "3-4-3", "4-3-3"];

  const count = tactics >= 76 ? 2 : 1;
  return ordered.filter((shape) => shape !== primary).slice(0, count);
}

function philosophyFor(manager: Staff): ManagerPhilosophy {
  const { attack, defense, tactics, motivation } = manager.stats;
  if (attack >= 74 && tactics >= 70) return "Possession";
  if (attack >= defense + 7 || motivation >= 78) return "Front-foot";
  if (defense >= attack + 10) return "Defensive";
  if (tactics < 58 && attack >= defense) return "Direct";
  return "Balanced";
}

export function managerFootballIdentity(manager: Staff): ManagerFootballIdentity {
  const { attack, defense, development, motivation, tactics } = manager.stats;
  const preferredFormation = formationFor(manager);
  const philosophy = philosophyFor(manager);
  const pressingScore = Math.round((motivation * 0.55) + (defense * 0.25) + (tactics * 0.2));
  const tempoScore = Math.round((attack * 0.45) + (motivation * 0.35) + (tactics * 0.2));
  const directnessScore = Math.round((100 - tactics) * 0.45 + attack * 0.35 + motivation * 0.2);
  const adaptabilityScore = Math.round(tactics * 0.7 + development * 0.3);
  const rotationScore = Math.round(development * 0.55 + motivation * 0.25 + tactics * 0.2);
  const youthScore = Math.round(development * 0.8 + motivation * 0.2);

  const identity: ManagerFootballIdentity = {
    preferredFormation,
    alternativeFormations: alternatives(preferredFormation, manager),
    philosophy,
    pressing: level(pressingScore),
    tempo: level(tempoScore),
    directness: level(directnessScore),
    adaptability: level(adaptabilityScore),
    rotation: level(rotationScore),
    youthWillingness: level(youthScore),
    summary: "",
  };

  const approach =
    philosophy === "Possession"
      ? "wants control of the ball"
      : philosophy === "Front-foot"
        ? "wants his side on the front foot"
        : philosophy === "Defensive"
          ? "prioritises defensive structure"
          : philosophy === "Direct"
            ? "favours a more direct route forward"
            : "prefers a balanced game";

  const flexibility =
    identity.adaptability === "High"
      ? "and is comfortable changing shape"
      : identity.adaptability === "Low"
        ? "and tends to stick closely to his preferred shape"
        : "with some tactical flexibility";

  identity.summary = `${preferredFormation} manager who ${approach} ${flexibility}.`;
  return identity;
}

export function isManager(staff: Staff | undefined | null): staff is Staff {
  return Boolean(staff && staff.role === "Manager");
}
