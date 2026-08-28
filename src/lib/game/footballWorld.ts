/**
 * Canonical target shape of the English football world.
 *
 * This graph is intentionally separate from the live four-division world
 * while its economy and saves still use incompatible tier meanings. Stable
 * IDs introduced here must never be reused for a different competition.
 */

export type EmploymentModel = "professional" | "mixed" | "semiProfessional";
export type CompetitionScope = "national" | "regional";

export interface FootballCompetitionDefinition {
  id: string;
  name: string;
  level: number;
  scope: CompetitionScope;
  employment: EmploymentModel;
  promotedTo: readonly string[];
  relegatedTo: readonly string[];
}

export const PLAYABLE_FOOTBALL_LEVELS = 8;

export const ENGLISH_COMPETITIONS: readonly FootballCompetitionDefinition[] = [
  { id: "eng-premier", name: "Premier Division", level: 1, scope: "national", employment: "professional", promotedTo: [], relegatedTo: ["eng-championship"] },
  { id: "eng-championship", name: "Championship", level: 2, scope: "national", employment: "professional", promotedTo: ["eng-premier"], relegatedTo: ["eng-league-one"] },
  { id: "eng-league-one", name: "League One", level: 3, scope: "national", employment: "professional", promotedTo: ["eng-championship"], relegatedTo: ["eng-league-two"] },
  { id: "eng-league-two", name: "League Two", level: 4, scope: "national", employment: "professional", promotedTo: ["eng-league-one"], relegatedTo: ["eng-national"] },
  { id: "eng-national", name: "National League", level: 5, scope: "national", employment: "mixed", promotedTo: ["eng-league-two"], relegatedTo: ["eng-national-north", "eng-national-south"] },
  { id: "eng-national-north", name: "National North", level: 6, scope: "regional", employment: "mixed", promotedTo: ["eng-national"], relegatedTo: ["eng-northern-premier", "eng-southern-central"] },
  { id: "eng-national-south", name: "National South", level: 6, scope: "regional", employment: "mixed", promotedTo: ["eng-national"], relegatedTo: ["eng-southern-central", "eng-southern-south", "eng-isthmian-premier"] },
  { id: "eng-northern-premier", name: "Northern Premier", level: 7, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-national-north"], relegatedTo: ["eng-npl-east", "eng-npl-midlands", "eng-npl-west"] },
  { id: "eng-southern-central", name: "Southern Premier Central", level: 7, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-national-north", "eng-national-south"], relegatedTo: ["eng-southern-central-one"] },
  { id: "eng-southern-south", name: "Southern Premier South", level: 7, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-national-south"], relegatedTo: ["eng-southern-south-one"] },
  { id: "eng-isthmian-premier", name: "Isthmian Premier", level: 7, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-national-south"], relegatedTo: ["eng-isthmian-north", "eng-isthmian-south-central", "eng-isthmian-south-east"] },
  { id: "eng-npl-east", name: "Northern Premier East", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-northern-premier"], relegatedTo: [] },
  { id: "eng-npl-midlands", name: "Northern Premier Midlands", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-northern-premier"], relegatedTo: [] },
  { id: "eng-npl-west", name: "Northern Premier West", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-northern-premier"], relegatedTo: [] },
  { id: "eng-southern-central-one", name: "Southern Division One Central", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-southern-central"], relegatedTo: [] },
  { id: "eng-southern-south-one", name: "Southern Division One South", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-southern-south"], relegatedTo: [] },
  { id: "eng-isthmian-north", name: "Isthmian North", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-isthmian-premier"], relegatedTo: [] },
  { id: "eng-isthmian-south-central", name: "Isthmian South Central", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-isthmian-premier"], relegatedTo: [] },
  { id: "eng-isthmian-south-east", name: "Isthmian South East", level: 8, scope: "regional", employment: "semiProfessional", promotedTo: ["eng-isthmian-premier"], relegatedTo: [] },
] as const;

export const FOREIGN_MARKET_REGIONS = [
  "Scotland", "Wales", "Ireland", "Northern Ireland", "Western Europe",
  "Northern Europe", "Southern Europe", "Eastern Europe", "Africa",
  "North America", "South America", "Asia-Pacific",
] as const;

export function validateFootballWorld(definitions: readonly FootballCompetitionDefinition[] = ENGLISH_COMPETITIONS): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const competition of definitions) {
    if (ids.has(competition.id)) errors.push(`Duplicate competition id: ${competition.id}`);
    ids.add(competition.id);
    if (competition.level < 1 || competition.level > PLAYABLE_FOOTBALL_LEVELS) errors.push(`${competition.id} has invalid level ${competition.level}`);
  }
  for (const competition of definitions) {
    for (const targetId of [...competition.promotedTo, ...competition.relegatedTo]) {
      const target = definitions.find((candidate) => candidate.id === targetId);
      if (!target) errors.push(`${competition.id} points to missing competition ${targetId}`);
      else if (competition.promotedTo.includes(targetId) && target.level !== competition.level - 1) errors.push(`${competition.id} promotion target ${targetId} is not one level above`);
      else if (competition.relegatedTo.includes(targetId) && target.level !== competition.level + 1) errors.push(`${competition.id} relegation target ${targetId} is not one level below`);
    }
  }
  return errors;
}

