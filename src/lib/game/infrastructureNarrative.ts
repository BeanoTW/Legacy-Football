import type { CapitalProjectType, GameState, InfrastructureAsset } from "./types";
import { assets, assetById } from "./infrastructure";
import { absoluteWeek, fromAbsoluteWeek } from "./time";

export type InfrastructureIssueSeverity = "mention" | "concern" | "severe";

export interface InfrastructureNarrativeIssue {
  assetId: string;
  assetName: string;
  condition: number;
  severity: InfrastructureIssueSeverity;
  headline: string;
  detail: string;
  pressLine: string;
  supporterLine: string;
}

export interface InfrastructureResolution {
  projectId: string;
  assetId: string;
  assetName: string;
  season: number;
  week: number;
  headline: string;
  detail: string;
}

const REPAIR_TYPES = new Set<CapitalProjectType>([
  "minorRepair",
  "majorRepair",
  "refurbishment",
  "replacement",
]);

function severityFor(condition: number): InfrastructureIssueSeverity | null {
  if (condition >= 70) return null;
  if (condition >= 50) return "mention";
  if (condition >= 30) return "concern";
  return "severe";
}

function standIssue(state: GameState, asset: InfrastructureAsset, severe: boolean) {
  const covered = asset.level >= 2;
  if (covered && severe) {
    return {
      detail: "Supporters have reported water ingress and visibly tired spectator areas.",
      press: "the stand roof and spectator areas are now a recurring maintenance complaint",
      supporter: "the ground needs more than patch-up work",
    };
  }
  return {
    detail: severe
      ? "The stand is visibly deteriorating, with worn spectator areas and mounting repair needs."
      : "The stand is showing its age and regulars have started to notice the wear.",
    press: severe
      ? "the stand has deteriorated far enough to become a visible matchday problem"
      : "the stand is beginning to look tired",
    supporter: severe ? "supporters want the stand properly dealt with" : "regulars are noticing the ground's age",
  };
}

function issueCopy(state: GameState, asset: InfrastructureAsset, severity: InfrastructureIssueSeverity) {
  const severe = severity === "severe";
  switch (asset.type) {
    case "stand":
    case "cornerStand":
      return standIssue(state, asset, severe);
    case "pitch":
      return {
        detail: severe
          ? "Bare areas and drainage problems are becoming hard to ignore on the playing surface."
          : "The pitch is beginning to look heavy and worn in high-use areas.",
        press: severe
          ? "the pitch and drainage are now affecting the impression of the club's matchday operation"
          : "the playing surface is visibly wearing",
        supporter: severe ? "the pitch needs proper remedial work" : "the surface is starting to look rough",
      };
    case "sanitary":
      return {
        detail: severe
          ? "Supporter complaints about tired toilets and accessibility areas are becoming a regular matchday issue."
          : "The toilets and accessibility areas are drawing more complaints as the season goes on.",
        press: severe
          ? "supporter facilities are now a recurring source of complaints"
          : "supporter facilities are beginning to draw criticism",
        supporter: severe ? "basic matchday facilities need sorting" : "the toilets are becoming a talking point",
      };
    case "training":
      return {
        detail: severe
          ? "Training surfaces and buildings are visibly struggling under the workload."
          : "The training ground is showing clear wear and is due attention.",
        press: severe
          ? "the training ground is visibly below the standard expected of the club"
          : "the training ground is starting to look tired",
        supporter: severe ? "the football operation needs better surroundings" : "the training setup needs attention",
      };
    case "medical":
      return {
        detail: severe
          ? "Treatment areas are visibly dated and maintenance demands are mounting."
          : "The medical area is beginning to show its age.",
        press: severe
          ? "the club's medical facilities are now visibly overdue investment"
          : "the medical facilities are looking tired",
        supporter: severe ? "player-care facilities need attention" : "the treatment area is showing its age",
      };
    case "concessions":
      return {
        detail: severe
          ? "Worn concourse areas and service points are becoming a visible matchday complaint."
          : "The concourse and catering areas are starting to look tired.",
        press: severe
          ? "the concourse and service areas are now a recurring supporter complaint"
          : "the concourse is visibly wearing",
        supporter: severe ? "matchday service areas need proper work" : "the concourse is starting to show its age",
      };
    case "hospitality":
      return {
        detail: severe
          ? "Hospitality spaces are visibly deteriorating and risk undermining the club's commercial offer."
          : "The hospitality areas are beginning to look dated.",
        press: severe
          ? "the club is trying to sell hospitality from visibly tired facilities"
          : "the hospitality areas are beginning to look dated",
        supporter: severe ? "commercial areas need investment" : "hospitality is showing its age",
      };
    case "parking":
      return {
        detail: severe
          ? "The stadium approaches and parking surface are visibly deteriorating."
          : "Parking and access areas are beginning to look neglected.",
        press: severe
          ? "the stadium approaches are becoming a visible maintenance problem"
          : "the car park and access areas are looking tired",
        supporter: severe ? "the approaches to the ground need sorting" : "the car park is showing its age",
      };
    default:
      return {
        detail: severe
          ? `${asset.name} is visibly deteriorating and maintenance complaints are mounting.`
          : `${asset.name} is beginning to show its age.`,
        press: severe
          ? `${asset.name.toLowerCase()} is now a visible maintenance problem`
          : `${asset.name.toLowerCase()} is beginning to look tired`,
        supporter: severe ? "supporters want the issue dealt with" : "the wear is becoming noticeable",
      };
  }
}

export function infrastructureNarrativeIssues(state: GameState): InfrastructureNarrativeIssue[] {
  return assets(state)
    .flatMap((asset) => {
      const severity = severityFor(asset.condition);
      if (!severity || asset.status === "underConstruction") return [];
      const copy = issueCopy(state, asset, severity);
      return [{
        assetId: asset.id,
        assetName: asset.name,
        condition: Math.round(asset.condition),
        severity,
        headline:
          severity === "severe"
            ? `${asset.name} maintenance problem becoming hard to ignore`
            : severity === "concern"
              ? `${asset.name} wear draws supporter attention`
              : `${asset.name} beginning to show its age`,
        detail: copy.detail,
        pressLine: copy.press,
        supporterLine: copy.supporter,
      } satisfies InfrastructureNarrativeIssue];
    })
    .sort((a, b) => a.condition - b.condition || a.assetName.localeCompare(b.assetName));
}

export function primaryInfrastructureIssue(
  state: GameState,
  minimum: InfrastructureIssueSeverity = "mention",
): InfrastructureNarrativeIssue | null {
  const rank: Record<InfrastructureIssueSeverity, number> = { mention: 0, concern: 1, severe: 2 };
  const threshold = rank[minimum];
  return infrastructureNarrativeIssues(state).find((issue) => rank[issue.severity] >= threshold) ?? null;
}

export function infrastructureStoryKey(state: GameState, issue: InfrastructureNarrativeIssue): string {
  // Mild wear is background colour; serious neglect becomes a more frequent
  // story. This keeps maintenance visible without turning it into nag spam.
  const cadence = issue.severity === "mention" ? 8 : issue.severity === "concern" ? 4 : 2;
  const period = Math.floor((absoluteWeek(state.season, state.week) - 1) / cadence);
  return `infrastructure-maintenance:${issue.assetId}:${issue.severity}:${period}`;
}

export function infrastructureStoryTiming(
  state: GameState,
  issue: InfrastructureNarrativeIssue,
): { season: number; week: number } {
  const cadence = issue.severity === "mention" ? 8 : issue.severity === "concern" ? 4 : 2;
  const now = absoluteWeek(state.season, state.week);
  const start = Math.floor((now - 1) / cadence) * cadence + 1;
  return fromAbsoluteWeek(start);
}

export function recentInfrastructureResolutions(state: GameState, withinWeeks = 8): InfrastructureResolution[] {
  const now = absoluteWeek(state.season, state.week);
  return (state.infrastructure?.projects ?? [])
    .filter(
      (project) =>
        project.status === "completed" &&
        project.completedAtAbsoluteWeek != null &&
        REPAIR_TYPES.has(project.type) &&
        now - project.completedAtAbsoluteWeek <= withinWeeks,
    )
    .map((project) => {
      const asset = assetById(state, project.assetId);
      const when = fromAbsoluteWeek(project.completedAtAbsoluteWeek!);
      const assetName = asset?.name ?? "Club facility";
      return {
        projectId: project.id,
        assetId: project.assetId,
        assetName,
        season: when.season,
        week: when.week,
        headline: `${assetName} maintenance work completed`,
        detail:
          project.type === "refurbishment" || project.type === "replacement"
            ? `The club has completed a substantial programme of work on ${assetName}.`
            : `Repair work on ${assetName} has been completed.`,
      };
    })
    .sort((a, b) => b.season - a.season || b.week - a.week || a.projectId.localeCompare(b.projectId));
}
