export type ClubIdentityScope = "english" | "external";

export interface ClubIdentity {
  /** Stable simulation id. Never derive persistence from displayName. */
  id: string;
  displayName: string;
  scope: ClubIdentityScope;
  nation: string;
  region?: string;
  town?: string;
  nickname?: string;
  founded?: number;
  stadiumName?: string;
  /** Presentation flavour only; never drives football logic directly. */
  characterTags?: readonly string[];
}

/**
 * Authored recognisable identities for the living-world era. This catalogue is
 * intentionally separate from the legacy CLUBS string pool: existing save ids
 * must not be renamed in-place. New clubs should use stable ids from day one.
 *
 * The initial entries establish naming direction rather than populate the full
 * pyramid. Expansion should be append-only by id.
 */
export const CLUB_IDENTITIES: readonly ClubIdentity[] = [
  {
    id: "eng-manchester-devils",
    displayName: "Manchester Devils",
    scope: "english",
    nation: "England",
    region: "North West",
    town: "Manchester",
    nickname: "The Devils",
    characterTags: ["historic", "elite", "global-support"],
  },
  {
    id: "eng-manchester-sky",
    displayName: "Manchester Sky",
    scope: "english",
    nation: "England",
    region: "North West",
    town: "Manchester",
    characterTags: ["elite", "modern", "wealthy"],
  },
  {
    id: "eng-mersey-reds",
    displayName: "Mersey Reds",
    scope: "english",
    nation: "England",
    region: "North West",
    town: "Liverpool",
    characterTags: ["historic", "elite", "intense-support"],
  },
  {
    id: "eng-highbury-cannons",
    displayName: "Highbury Cannons",
    scope: "english",
    nation: "England",
    region: "London",
    town: "London",
    characterTags: ["historic", "elite", "technical"],
  },
  {
    id: "eng-banbury-cross",
    displayName: "Banbury Cross",
    scope: "english",
    nation: "England",
    region: "South Central",
    town: "Banbury",
    nickname: "The Cross",
    characterTags: ["community", "semi-professional", "lower-league"],
  },
  {
    id: "ext-madrid-imperial",
    displayName: "Madrid Imperial",
    scope: "external",
    nation: "Spain",
    town: "Madrid",
    characterTags: ["continental-elite", "global-support"],
  },
  {
    id: "ext-catalonia-fc",
    displayName: "Catalonia FC",
    scope: "external",
    nation: "Spain",
    town: "Barcelona",
    characterTags: ["continental-elite", "technical"],
  },
  {
    id: "ext-munich-adler",
    displayName: "Munich Adler",
    scope: "external",
    nation: "Germany",
    town: "Munich",
    nickname: "The Eagles",
    characterTags: ["continental-elite", "dominant"],
  },
  {
    id: "ext-paris-etoile",
    displayName: "Paris Étoile",
    scope: "external",
    nation: "France",
    town: "Paris",
    characterTags: ["continental-elite", "wealthy"],
  },
] as const;

const BY_ID = new Map(CLUB_IDENTITIES.map((club) => [club.id, club]));

export function clubIdentity(id: string): ClubIdentity | undefined {
  return BY_ID.get(id);
}

export function englishClubIdentities(): readonly ClubIdentity[] {
  return CLUB_IDENTITIES.filter((club) => club.scope === "english");
}

export function externalClubIdentities(): readonly ClubIdentity[] {
  return CLUB_IDENTITIES.filter((club) => club.scope === "external");
}
