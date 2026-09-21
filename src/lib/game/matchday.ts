/* =========================================================================
   LIVE MATCH — canonical identity, seeded RNG streams and pure simulation
   ------------------------------------------------------------------------- */

import type { GameState, LiveMatch, MatchEvent } from "./types";
import type { ManagerMatchStyle } from "./managerMatchStyle";
import { isUserClubReference, sameClubReference, userClubReference } from "./clubReference";
import { clubSimulationSeedKey } from "./clubIdentity";
import { seededRng } from "./rng";
import { fixtureId as makeFixtureId, leagueOf, playerLeagueId } from "./league";

export interface MatchIdentity {
  fixtureId: string;
  leagueId: string;
  season: number;
  week: number;
  round: number;
  homeClub: string;
  awayClub: string;
  homeSeedKey?: string;
  awaySeedKey?: string;
  opponent: string;
  home: boolean;
}

export function matchIdentity(
  s: GameState,
  selectedFixture?: GameState["fixtures"][number],
): MatchIdentity | null {
  const fx = selectedFixture ?? s.fixtures.find((f) => f.week === s.week);
  if (!fx) return null;
  const sched = (s.leagueSchedule ?? []).find(
    (f) =>
      f.week === s.week &&
      ((isUserClubReference(s, f.home) && sameClubReference(s, f.away, fx.opponent)) ||
        (isUserClubReference(s, f.away) && sameClubReference(s, f.home, fx.opponent))),
  );
  const leagueId = sched ? leagueOf(sched) : playerLeagueId(s);
  const round = sched?.round ?? s.week;
  const userRef = userClubReference(s);
  const homeClub = fx.home ? userRef : fx.opponent;
  const awayClub = fx.home ? fx.opponent : userRef;
  return {
    fixtureId: makeFixtureId(s.season, round, homeClub, awayClub, leagueId),
    leagueId,
    season: s.season,
    week: s.week,
    round,
    homeClub,
    awayClub,
    homeSeedKey: clubSimulationSeedKey(s, homeClub),
    awaySeedKey: clubSimulationSeedKey(s, awayClub),
    opponent: fx.opponent,
    home: fx.home,
  };
}

export function preMatchKey(inputs: { squadRating: number; opponentStrength?: number }): string {
  const own = `sq${Math.round(inputs.squadRating * 100)}`;
  return inputs.opponentStrength === undefined
    ? own
    : `${own}|opp${Math.round(inputs.opponentStrength * 100)}`;
}
export function matchSeedBase(saveSeed: string, ident: MatchIdentity, pmKey: string): string {
  const seedFixtureId = makeFixtureId(
    ident.season,
    ident.round,
    ident.homeSeedKey ?? ident.homeClub,
    ident.awaySeedKey ?? ident.awayClub,
    ident.leagueId,
  );
  return `${saveSeed}|live-match|s${ident.season}|${ident.leagueId}|${seedFixtureId}|${pmKey}`;
}

export type MatchStream =
  | "brief"
  | "weather"
  | "attendance"
  | "h1.score"
  | "h1.events"
  | "h1.style"
  | "h1.cards"
  | "h1.metrics"
  | "h2.score"
  | "h2.events"
  | "h2.style"
  | "h2.cards"
  | "h2.metrics"
  | "halftime"
  | "finance";
export function matchStream(seedBase: string, stream: MatchStream): () => number {
  return seededRng(seedBase, stream);
}
export function seedOf(lm: LiveMatch): string {
  return lm.matchSeed ?? `legacy|${lm.fixture.week}|${lm.fixture.opponent}`;
}

export function poissonFrom(rng: () => number, lambda: number): number {
  const l = Math.max(0.01, lambda);
  let g = 0,
    p = Math.exp(-l),
    cum = p,
    k = 0;
  const r = rng();
  while (r > cum && k < 8) {
    k++;
    p = (p * l) / k;
    cum += p;
    g = k;
  }
  return g;
}
const rInt = (rng: () => number, min: number, max: number) =>
  Math.floor(min + rng() * (max - min + 1));
const rPick = <T>(rng: () => number, arr: readonly T[]) => arr[rInt(rng, 0, arr.length - 1)];
const FIRST = [
  "J",
  "A",
  "M",
  "R",
  "T",
  "S",
  "D",
  "C",
  "L",
  "N",
  "P",
  "K",
  "B",
  "H",
  "O",
  "E",
  "G",
  "F",
  "W",
  "V",
] as const;
const LAST = [
  "Cahill",
  "Potter",
  "Hughes",
  "Morris",
  "Ellis",
  "Brooks",
  "Reid",
  "Walsh",
  "Ward",
  "Kane",
  "Bailey",
  "Fraser",
  "Ainsley",
  "Palmer",
  "Foden",
  "Rice",
  "Saka",
  "Gordon",
  "Watkins",
  "Bowen",
  "Clarke",
  "Owen",
  "Sterling",
  "Grealish",
  "Maddison",
  "Toney",
  "Isak",
  "Nunes",
  "Fabian",
  "Onana",
] as const;
const CHANCE_TEXT = [
  "Half chance goes begging.",
  "Corner cleared to safety.",
  "Long-range effort skims the post.",
  "Penalty shouts waved away.",
  "Free-kick curled just over.",
] as const;
const POSSESSION_CHANCE_TEXT = [
  "Patient passing opens a pocket between the lines, but the finish is blocked.",
  "A long spell of possession ends with a low effort pushed wide.",
  "The ball is worked from side to side before the final pass is cut out.",
  "A neat combination around the box creates an opening, but the shot lacks power.",
] as const;
const DIRECT_CHANCE_TEXT = [
  "An early ball forward turns the defence and creates a shooting chance.",
  "A direct pass releases the runner in behind, but the finish flashes wide.",
  "The second ball drops kindly after a long delivery, but the effort is blocked.",
  "A quick ball into the channel stretches the back line and forces a hurried save.",
] as const;
const PRESSING_CHANCE_TEXT = [
  "The press wins the ball high and an immediate shot is smothered.",
  "Pressure forces a loose pass near the box, but the chance is dragged wide.",
  "A turnover in the attacking third creates a sudden opening before the defence recovers.",
] as const;
const FRONT_FOOT_CHANCE_TEXT = [
  "Numbers flood forward and a dangerous cut-back is turned behind.",
  "Another aggressive attack pins the defence back, but the final effort flies over.",
  "A fast move commits defenders and opens a shooting lane at the edge of the area.",
] as const;
const DEFENSIVE_CHANCE_TEXT = [
  "A compact shape absorbs the pressure before a counter breaks quickly upfield.",
  "The side springs from deep and gets a shot away before the defence can reset.",
  "A disciplined defensive spell turns into a sharp break, but the final ball is overhit.",
] as const;
function chanceTextForStyle(rng: () => number, style: ManagerMatchStyle): string {
  const weighted: (readonly string[])[] = [CHANCE_TEXT];
  if (style.philosophy === "Possession")
    weighted.push(POSSESSION_CHANCE_TEXT, POSSESSION_CHANCE_TEXT);
  if (style.philosophy === "Direct") weighted.push(DIRECT_CHANCE_TEXT, DIRECT_CHANCE_TEXT);
  if (style.philosophy === "Front-foot")
    weighted.push(FRONT_FOOT_CHANCE_TEXT, FRONT_FOOT_CHANCE_TEXT);
  if (style.philosophy === "Defensive") weighted.push(DEFENSIVE_CHANCE_TEXT, DEFENSIVE_CHANCE_TEXT);
  if (style.pressing === "High") weighted.push(PRESSING_CHANCE_TEXT);
  if (style.directness === "High") weighted.push(DIRECT_CHANCE_TEXT);
  if (style.directness === "Low") weighted.push(POSSESSION_CHANCE_TEXT);
  if (style.tempo === "High") weighted.push(FRONT_FOOT_CHANCE_TEXT);
  if (style.tempo === "Low" && style.philosophy !== "Defensive")
    weighted.push(POSSESSION_CHANCE_TEXT);
  return rPick(rng, rPick(rng, weighted));
}
export const WEATHERS = ["Clear", "Overcast", "Wet", "Windy"] as const;
export function weatherFor(seedBase: string): LiveMatch["weather"] {
  return rPick(matchStream(seedBase, "weather"), WEATHERS);
}
export function halfGoals(
  seedBase: string,
  half: 1 | 2,
  ourStrength: number,
  oppStrength: number,
  attackMod: number,
  defenseMod: number,
): { usGoals: number; themGoals: number } {
  const rng = matchStream(seedBase, half === 1 ? "h1.score" : "h2.score");
  const us = Math.max(0.1, ((1.3 + (ourStrength - oppStrength) / 20) * attackMod) / 2);
  const them = Math.max(0.1, (1.3 - (ourStrength - oppStrength) / 20) / defenseMod / 2);
  return { usGoals: poissonFrom(rng, us), themGoals: poissonFrom(rng, them) };
}
export function halfPresentation(
  seedBase: string,
  half: 1 | 2,
  fromMin: number,
  toMin: number,
  usGoals: number,
  themGoals: number,
  opponent: string,
  style?: ManagerMatchStyle,
): MatchEvent[] {
  const ev = matchStream(seedBase, half === 1 ? "h1.events" : "h2.events");
  const styleRng = matchStream(seedBase, half === 1 ? "h1.style" : "h2.style");
  const cd = matchStream(seedBase, half === 1 ? "h1.cards" : "h2.cards");
  const events: MatchEvent[] = [];
  const chances = rInt(ev, 2, 4);
  for (let i = 0; i < chances; i++) {
    const side = ev() < 0.5 ? "us" : "them";
    const minute = rInt(ev, fromMin + 1, toMin);
    const genericText = rPick(ev, CHANCE_TEXT);
    events.push({
      minute,
      type: "chance",
      side,
      text: side === "us" && style ? chanceTextForStyle(styleRng, style) : genericText,
    });
  }
  if (cd() < 0.55)
    events.push({
      minute: rInt(cd, fromMin + 1, toMin),
      type: "card",
      side: cd() < 0.5 ? "us" : "them",
      text: "Yellow card shown.",
    });
  for (let i = 0; i < usGoals; i++)
    events.push({
      minute: rInt(ev, fromMin + 1, toMin),
      type: "goal",
      side: "us",
      text: `GOAL — ${rPick(ev, FIRST)}. ${rPick(ev, LAST)} finds the net!`,
    });
  for (let i = 0; i < themGoals; i++)
    events.push({
      minute: rInt(ev, fromMin + 1, toMin),
      type: "goal",
      side: "them",
      text: `${opponent} score.`,
    });
  return events.sort((a, b) => a.minute - b.minute);
}
export function liveTvIncome(seedBase: string): number {
  return 22_000 + Math.round(matchStream(seedBase, "finance")() * 8000);
}
export function liveOpponentStrength(seedBase: string): number {
  const encoded = seedBase.match(/(?:^|\|)opp(-?\d+)(?:\||$)/)?.[1];
  if (encoded !== undefined) return Number(encoded) / 100;
  return 55 + matchStream(seedBase, "brief")() * 20;
}
