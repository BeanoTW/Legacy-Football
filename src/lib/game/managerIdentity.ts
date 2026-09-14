import type { Staff } from "./types";

export type ManagerFormation = "4-4-2" | "4-2-3-1" | "4-3-3" | "3-5-2" | "5-3-2";
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

function formationFor(manager: Staff): ManagerFormation {
  const { attack, defense, tactics, motivation } = manager.stats;
  if (defense >= attack + 10 && tactics >= 68) return "5-3-2";
  if (defense >= attack + 6) return "3-5-2";
  if (attack >= defense + 9 && tactics >= 65) return "4-3-3";
  if (tactics >= 70 || motivation >= 72) return "4-2-3-1";
  return "4-4-2";
}

function alternatives(primary: ManagerFormation, manager: Staff): ManagerFormation[] {
  const { attack, defense, tactics } = manager.stats;
  const ordered: ManagerFormation[] =
    attack > defense
      ? ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "5-3-2"]
      : ["4-2-3-1", "4-4-2", "3-5-2", "5-3-2", "4-3-3"];

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
