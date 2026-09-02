/* =========================================================================
   LIVE MATCH — canonical identity, seeded RNG streams and pure simulation
   -------------------------------------------------------------------------
   The interactive matchday used to draw from `Math.random()`. Every draw is
   now derived from stable game identity so that:

     - The same canonical pre-match state reproduces the same match.
     - A reload at any stage resumes the exact same simulation.
     - Cosmetic draws (flavour text, chance count, card rolls) live in their
       own streams and CANNOT move the scoreline, attendance or money.

   Seed derivation:

       base = `${saveSeed}|live-match|s${season}|${leagueId}|${fixtureId}|${preMatchKey}`

   `preMatchKey` is the canonical pre-match input digest. It includes both
   clubs' football strength; lineup, tactics and fitness can be folded in later
   without touching any other part of this module.

   Every stream is `seededRng(base, streamName)` — independent generators,
   never one shared cursor.

   No `Math.random()`, no `Date.now()`, no `crypto.randomUUID()` in this file.
========================================================================= */

import type { GameState, LiveMatch, MatchEvent } from "./types";
import { seededRng } from "./rng";
import { fixtureId as makeFixtureId, leagueOf, playerLeagueId } from "./league";

/* ---------- Canonical identity ---------- */

export interface MatchIdentity {
  fixtureId: string;
  leagueId: string;
  season: number;
  week: number;
  round: number;
  homeClub: string;
  awayClub: string;
  opponent: string;
  home: boolean;
}

/** Canonical identity of the user's fixture in the current week, if any. */
export function matchIdentity(s: GameState): MatchIdentity | null {
  const fx = s.fixtures.find((f) => f.week === s.week);
  if (!fx) return null;
  const sched = (s.leagueSchedule ?? []).find(
    (f) =>
      f.week === s.week &&
      ((f.home === s.clubName && f.away === fx.opponent) ||
        (f.away === s.clubName && f.home === fx.opponent)),
  );
  const leagueId = sched ? leagueOf(sched) : playerLeagueId(s);
  const round = sched?.round ?? s.week;
  const homeClub = fx.home ? s.clubName : fx.opponent;
  const awayClub = fx.home ? fx.opponent : s.clubName;
  return {
    fixtureId: makeFixtureId(s.season, round, homeClub, awayClub, leagueId),
    leagueId,
    season: s.season,
    week: s.week,
    round,
    homeClub,
    awayClub,
    opponent: fx.opponent,
    home: fx.home,
  };
}

/**
 * Digest of canonical pre-match football inputs.
 * The optional opponent value keeps old one-argument call sites byte-stable.
 */
export function preMatchKey(inputs: { squadRating: number; opponentStrength?: number }): string {
  const own = `sq${Math.round(inputs.squadRating * 100)}`;
  return inputs.opponentStrength === undefined
    ? own
    : `${own}|opp${Math.round(inputs.opponentStrength * 100)}`;
}

/** Stable seed root for one match. */
export function matchSeedBase(saveSeed: string, ident: MatchIdentity, pmKey: string): string {
  return `${saveSeed}|live-match|s${ident.season}|${ident.leagueId}|${ident.fixtureId}|${pmKey}`;
}

/* ---------- Independent RNG substreams ---------- */

export type MatchStream =
  | "brief"
  | "weather"
  | "attendance"
  | "h1.score"
  | "h1.events"
  | "h1.cards"
  | "h2.score"
  | "h2.events"
  | "h2.cards"
  | "halftime"
  | "finance";

/** A fresh generator for one logical domain. Domains never share a cursor. */
export function matchStream(seedBase: string, stream: MatchStream): () => number {
  return seededRng(seedBase, stream);
}

/** Seed base of a live match, resilient to legacy saves without one. */
export function seedOf(lm: LiveMatch): string {
  return lm.matchSeed ?? `legacy|${lm.fixture.week}|${lm.fixture.opponent}`;
}

/* ---------- Pure simulation primitives ---------- */

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

export const WEATHERS = ["Clear", "Overcast", "Wet", "Windy"] as const;

export function weatherFor(seedBase: string): LiveMatch["weather"] {
  return rPick(matchStream(seedBase, "weather"), WEATHERS);
}

/**
 * CANONICAL half simulation: the goal counts only.
 * Draws exclusively from the score stream, so presentation can change freely.
 */
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

/**
 * PRESENTATION: the ticker for a half. Derived from the already-decided goal
 * counts; its own draws cannot feed back into the simulation.
 */
export function halfPresentation(
  seedBase: string,
  half: 1 | 2,
  fromMin: number,
  toMin: number,
  usGoals: number,
  themGoals: number,
  opponent: string,
): MatchEvent[] {
  const ev = matchStream(seedBase, half === 1 ? "h1.events" : "h2.events");
  const cd = matchStream(seedBase, half === 1 ? "h1.cards" : "h2.cards");
  const events: MatchEvent[] = [];

  const chances = rInt(ev, 2, 4);
  for (let i = 0; i < chances; i++) {
    events.push({
      minute: rInt(ev, fromMin + 1, toMin),
      type: "chance",
      side: ev() < 0.5 ? "us" : "them",
      text: rPick(ev, CHANCE_TEXT),
    });
  }
  if (cd() < 0.55) {
    events.push({
      minute: rInt(cd, fromMin + 1, toMin),
      type: "card",
      side: cd() < 0.5 ? "us" : "them",
      text: "Yellow card shown.",
    });
  }
  for (let i = 0; i < usGoals; i++) {
    events.push({
      minute: rInt(ev, fromMin + 1, toMin),
      type: "goal",
      side: "us",
      text: `GOAL — ${rPick(ev, FIRST)}. ${rPick(ev, LAST)} finds the net!`,
    });
  }
  for (let i = 0; i < themGoals; i++) {
    events.push({
      minute: rInt(ev, fromMin + 1, toMin),
      type: "goal",
      side: "them",
      text: `${opponent} score.`,
    });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

/** Deterministic broadcast fee for the live match (own stream). */
export function liveTvIncome(seedBase: string): number {
  return 22_000 + Math.round(matchStream(seedBase, "finance")() * 8000);
}

/**
 * Reads canonical opponent strength embedded in new live-match seed roots.
 * Legacy seed roots retain the old deterministic brief-stream fallback so
 * already-saved matches remain resumable without fabricating new inputs.
 */
export function liveOpponentStrength(seedBase: string): number {
  const encoded = seedBase.match(/(?:^|\|)opp(-?\d+)(?:\||$)/)?.[1];
  if (encoded !== undefined) return Number(encoded) / 100;
  return 55 + matchStream(seedBase, "brief")() * 20;
}
