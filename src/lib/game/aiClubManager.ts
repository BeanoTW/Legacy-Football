/* =========================================================================
   AI club managers
   -------------------------------------------------------------------------
   AI clubs do not persist staff. Instead each club has a manager DERIVED from
   stable inputs (save seed, canonical club id, tenure window, club
   reputation). He is a normal `Staff` record, so his football identity,
   preferred formation, philosophy and adaptability come from exactly the
   same `managerFootballIdentity` the player's own manager uses, and the shape
   he sends out comes from the same squad-fit rule applied to his own players.

   Costs nothing in save size, never drifts, and clubs change manager every
   few seasons so the league does not freeze into one tactical picture.
========================================================================= */

import type { FootballPlayer, GameState, Staff, StaffStats } from "./types";
import { hashString } from "./rng";
import {
  managerFootballIdentity,
  type ManagerFootballIdentity,
  type ManagerFormation,
} from "./managerIdentity";
import { chooseFormationForPlayers } from "./managerSquadFit";
import { canonicalClubReference, clubDisplayName, sameClubReference } from "./clubReference";
import { playerRegisteredClubId } from "./playerRegistration";

const unit = (input: string) => (hashString(input) >>> 0) / 4294967296;
/**
 * Index from the hash's HIGH bits. FNV-1a's low bits are weak, so
 * `hash % n` correlates across similar seeds (two clubs drawing the same
 * manager name). Scaling the unit value spreads choices properly.
 */
const pickIndex = (input: string, length: number) => Math.min(length - 1, Math.floor(unit(input) * length));
const clampStat = (value: number) => Math.max(25, Math.min(95, Math.round(value)));

const FIRST_INITIALS = ["A", "B", "C", "D", "E", "G", "J", "K", "L", "M", "N", "P", "R", "S", "T", "W"] as const;
const SURNAMES = [
  "Ashworth", "Bell", "Cairns", "Doherty", "Everett", "Fowler", "Garvey", "Holloway",
  "Irwin", "Jennings", "Keane", "Lambert", "McAllister", "Naylor", "Osborne", "Pearce",
  "Quinn", "Rowett", "Sheridan", "Tolland", "Upson", "Varney", "Whelan", "Yorath",
  "Abernethy", "Blythe", "Carrick", "Dunmore", "Fenwick", "Galloway", "Hartigan", "Kilbride",
  "Loughlin", "Marchbank", "Nesbitt", "Oakden", "Prentice", "Rathbone", "Stirrat", "Tennant",
  "Wardlaw", "Ainslie", "Burnside", "Cromarty", "Drysdale", "Elphick", "Gilmour", "Halkett",
] as const;

/**
 * Coaching archetypes give the manager market its variety. The identity
 * system turns these stat leans into formations and philosophies; nothing
 * here names a formation directly.
 */
const ARCHETYPES: ReadonlyArray<Partial<StaffStats>> = [
  {},
  { attack: 9, defense: -5 },
  { defense: 10, attack: -6 },
  { tactics: 9 },
  { motivation: 10 },
  { development: 10, tactics: 3 },
  { tactics: 7, motivation: 5 },
  { attack: 5, development: 6 },
];

export interface AiClubManagerSetup {
  manager: Staff;
  identity: ManagerFootballIdentity;
  formation: ManagerFormation;
  /** Squad-shape score for the selected formation (0-100), or 60 when unknown. */
  squadFit: number;
}

function clubReputation(state: GameState, clubRef: string): number {
  const reputations = state.clubReputations ?? {};
  return reputations[clubDisplayName(state, clubRef)] ?? reputations[clubRef] ?? 50;
}

/** Which manager spell a club is in. Spells last three to six seasons. */
function tenureIndex(seed: string, season: number): number {
  const length = 3 + pickIndex(`${seed}|tenure-length`, 4);
  const offset = pickIndex(`${seed}|tenure-offset`, length);
  return Math.floor((Math.max(1, season) - 1 + offset) / length);
}

export function aiClubManager(state: GameState, clubRef: string, season = state.season): Staff {
  const clubId = canonicalClubReference(state, clubRef);
  const clubSeed = `ai-manager|${state.saveSeed}|${clubId}`;
  const seed = `${clubSeed}|t${tenureIndex(clubSeed, season)}`;
  const reputation = clubReputation(state, clubRef);
  // Better clubs attract better coaches, with plenty of spread either way.
  const quality = Math.max(38, Math.min(84, 36 + reputation * 0.52 + (unit(`${seed}|quality`) - 0.5) * 14));
  const archetype = ARCHETYPES[pickIndex(`${seed}|archetype`, ARCHETYPES.length)];
  const stat = (key: keyof StaffStats) =>
    clampStat(quality + (archetype[key] ?? 0) + (unit(`${seed}|${key}`) - 0.5) * 14);
  const stats: StaffStats = {
    tactics: stat("tactics"),
    attack: stat("attack"),
    defense: stat("defense"),
    development: stat("development"),
    scouting: stat("scouting"),
    negotiation: stat("negotiation"),
    medical: stat("medical"),
    motivation: stat("motivation"),
  };
  const name = `${FIRST_INITIALS[pickIndex(`${seed}|initial`, FIRST_INITIALS.length)]}. ${SURNAMES[pickIndex(`${seed}|surname`, SURNAMES.length)]}`;
  return {
    id: seed,
    name,
    role: "Manager",
    age: 38 + pickIndex(`${seed}|age`, 24),
    rating: Math.round(stats.tactics * 0.5 + stats.motivation * 0.25 + (stats.attack + stats.defense) * 0.125),
    stats,
    wage: 0,
    contractWeeks: 0,
    reputation: Math.round(quality),
  };
}

export function aiClubPlayers(state: GameState, clubRef: string): FootballPlayer[] {
  return (state.football?.players ?? []).filter((player) =>
    sameClubReference(state, playerRegisteredClubId(player), clubRef),
  );
}

/**
 * The AI manager's matchday decision: preferred shape, or his alternative if
 * he is adaptable and it clearly suits this squad better. Clubs outside the
 * detailed simulation bubble have no player rows; they simply play the
 * manager's preferred shape.
 */
export function aiClubManagerSetup(state: GameState, clubRef: string, season = state.season): AiClubManagerSetup {
  const manager = aiClubManager(state, clubRef, season);
  const identity = managerFootballIdentity(manager);
  const players = aiClubPlayers(state, clubRef);
  if (players.length < 11) {
    return { manager, identity, formation: identity.preferredFormation, squadFit: 60 };
  }
  const choice = chooseFormationForPlayers(identity, players);
  return { manager, identity, formation: choice.formation, squadFit: choice.score };
}
