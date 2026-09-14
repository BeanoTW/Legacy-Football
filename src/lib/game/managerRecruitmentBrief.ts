import type { GameState, Position, Staff } from "./types";
import { managerFootballIdentity } from "./managerIdentity";
import { managerSquadFit } from "./managerSquadFit";
import type { ScoutingPlayerLevel } from "./chairmanScoutingBrief";

export interface ManagerRecruitmentPriority {
  position: Position;
  playerLevel: ScoutingPlayerLevel;
  headline: string;
  rationale: string;
}

export interface ManagerRecruitmentBrief {
  managerId: string;
  managerName: string;
  headline: string;
  message: string;
  tacticalShape: string;
  priorities: ManagerRecruitmentPriority[];
}

const POSITION_NAME: Record<Position, string> = {
  GK: "goalkeeper",
  DEF: "defender",
  MID: "midfielder",
  FWD: "forward",
};

function levelForSeverity(severity: number): ScoutingPlayerLevel {
  if (severity >= 45) return "startingXI";
  if (severity >= 20) return "firstTeam";
  return "backup";
}

function styleSentence(manager: Staff): string {
  const identity = managerFootballIdentity(manager);
  const press = identity.pressing === "High" ? "I need players who can cope with our pressing demands." : identity.pressing === "Low" ? "I value positional discipline more than constant pressing." : "We need a balanced work rate without losing our shape.";
  const tempo = identity.tempo === "High" ? "We want to move the ball quickly." : identity.tempo === "Low" ? "I want us patient in possession." : "I want us able to change tempo when the game asks for it.";
  return `${press} ${tempo}`;
}

export function managerRecruitmentBrief(state: GameState, manager: Staff): ManagerRecruitmentBrief {
  const identity = managerFootballIdentity(manager);
  const fit = managerSquadFit(state, manager);
  const priorities = fit.needs.map((need) => {
    const playerLevel = levelForSeverity(need.severity);
    const position = POSITION_NAME[need.position];
    return {
      position: need.position,
      playerLevel,
      headline: `${position[0].toUpperCase()}${position.slice(1)} needed`,
      rationale: need.reason,
    };
  });

  const shapeLine = fit.bestFormation === identity.preferredFormation
    ? `I want to build around my ${identity.preferredFormation}.`
    : `My preference is ${identity.preferredFormation}, but with this squad I would start in ${fit.bestFormation}.`;

  const recruitmentLine = priorities.length
    ? `The first area I would improve is ${POSITION_NAME[priorities[0].position]}.`
    : "I do not see an urgent positional hole at the moment; we can recruit for quality rather than necessity.";

  return {
    managerId: manager.id,
    managerName: manager.name,
    headline: priorities.length ? "What I need from recruitment" : "Squad assessment",
    message: `${shapeLine} ${recruitmentLine} ${styleSentence(manager)}`,
    tacticalShape: fit.bestFormation,
    priorities,
  };
}
