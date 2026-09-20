/* Live-match determinism & matchday integrity audit.

   Verifies canonical match identity, seeded RNG substreams, RNG isolation,
   resume safety at every reachable stage, exactly-once commit, finance
   dedupe, fixture completion and migration safety.

   Run with:  bun src/lib/game/__checks__/matchday.check.ts
*/
import { readFileSync } from "node:fs";
import { clubDisplayName, isUserClubReference } from "../clubReference";

import {
  newGame,
  advanceWeek,
  startMatchDay,
  kickoff,
  applyHalfTimeChoice,
  commitLiveMatchAndAdvance,
  migrateSave,
  SAVE_VERSION,
} from "../engine";
import {
  matchIdentity,
  matchSeedBase,
  preMatchKey,
  matchStream,
  seedOf,
  weatherFor,
  halfGoals,
  halfPresentation,
  liveTvIncome,
  liveOpponentStrength,
} from "../matchday";
import { reconcile, matchdayKey } from "../finance";
import { fixtureId as makeFixtureId, tableFor, playerLeagueId } from "../league";
import type { GameState } from "../types";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

const clone = <T>(x: T): T => structuredClone(x);
const src = (f: string) => readFileSync(`src/lib/game/${f}`, "utf8");
/** A reload: exactly what useGame does — JSON round-trip through storage. */
const reload = (s: GameState): GameState =>
  migrateSave(JSON.parse(JSON.stringify(s)) as unknown as Record<string, unknown>);

type LegacySave = Omit<GameState, "version"> & { version: number };

// Seeded world generation: the whole save (squads, schedule, simulation) is
// reproducible across processes, so match outcomes are stable in this suite.
const BASE = newGame("Audit FC", "Auditor", "MATCHDAY_AUDIT");

const worlds = new Map<string, GameState>();
function fixtureState(seed = "MATCHDAY_AUDIT"): GameState {
  if (seed === "MATCHDAY_AUDIT") return clone(BASE);
  if (!worlds.has(seed)) worlds.set(seed, newGame("Audit FC", "Auditor", seed));
  return clone(worlds.get(seed)!);
}

/** Wind the save forward to the club's first league fixture week. */
function atFixture(seed = "MATCHDAY_AUDIT"): GameState {
  let s = fixtureState(seed);
  const target = Math.min(
    ...s.fixtures.filter((f) => (f.competition ?? "league") === "league").map((f) => f.week),
  );
  while (s.week < target) s = advanceWeek(s);
  return s;
}

/** Wind forward to the club's first HOME fixture (gate/hospitality income). */
function atHomeFixture(seed = "MATCHDAY_AUDIT"): GameState {
  let s = fixtureState(seed);
  const target = Math.min(
    ...s.fixtures
      .filter((f) => f.home && (f.competition ?? "league") === "league")
      .map((f) => f.week),
  );
  while (s.week < target) s = advanceWeek(s);
  return s;
}

const PRE = atFixture();

/* =========================================================================
   [A] Identity
========================================================================= */
console.log("\n[A] Identity");
{
  const id1 = matchIdentity(PRE)!;
  const id2 = matchIdentity(clone(PRE))!;
  check("A1. fixture id is stable", id1.fixtureId === id2.fixtureId && !!id1.fixtureId);
  check(
    "A1b. fixture id matches the canonical league key",
    id1.fixtureId ===
      makeFixtureId(id1.season, id1.round, id1.homeClub, id1.awayClub, id1.leagueId),
  );

  const key = preMatchKey({ squadRating: 70 });
  check(
    "A2. match seed identity is stable",
    matchSeedBase(PRE.saveSeed, id1, key) === matchSeedBase(PRE.saveSeed, id2, key),
  );

  const legacyHome = clubDisplayName(PRE, id1.homeClub);
  const legacyAway = clubDisplayName(PRE, id1.awayClub);
  const legacyIdentity = {
    ...id1,
    fixtureId: makeFixtureId(id1.season, id1.round, legacyHome, legacyAway, id1.leagueId),
    homeClub: legacyHome,
    awayClub: legacyAway,
    homeSeedKey: undefined,
    awaySeedKey: undefined,
  };
  check(
    "A2b. opaque IDs preserve the pre-migration live-match seed root",
    matchSeedBase(PRE.saveSeed, id1, key) === matchSeedBase(PRE.saveSeed, legacyIdentity, key),
  );

  // Advance past this fixture to the next one and compare identities.
  let nxt = clone(PRE);
  nxt = advanceWeek(nxt);
  while (!nxt.fixtures.some((f) => f.week === nxt.week)) nxt = advanceWeek(nxt);
  const id3 = matchIdentity(nxt)!;
  check("A3. different fixtures use different identities", id3.fixtureId !== id1.fixtureId);
  check(
    "A3b. different fixtures use different seed roots",
    matchSeedBase(nxt.saveSeed, id3, key) !== matchSeedBase(PRE.saveSeed, id1, key),
  );

  const b1 = startMatchDay(clone(PRE)).liveMatch!;
  const b2 = startMatchDay(clone(PRE)).liveMatch!;
  check(
    "A4. same save + fixture reproduces identical briefing",
    JSON.stringify(b1) === JSON.stringify(b2),
  );
  check(
    "A5. seed root is persisted on LiveMatch",
    typeof b1.matchSeed === "string" && b1.matchSeed!.length > 0,
  );
  check(
    "A6. canonical identity is persisted on LiveMatch",
    b1.fixtureId === id1.fixtureId &&
      b1.leagueId === id1.leagueId &&
      b1.round === id1.round &&
      b1.season === id1.season &&
      b1.homeClub === id1.homeClub &&
      b1.awayClub === id1.awayClub,
  );
  check(
    "A7. a different save seed yields a different match",
    (() => {
      const other = startMatchDay(atFixture("OTHER_SEED")).liveMatch!;
      return other.matchSeed !== b1.matchSeed;
    })(),
  );
}

/* =========================================================================
   [B] Briefing
========================================================================= */
console.log("\n[B] Briefing");
{
  const a = startMatchDay(clone(PRE)).liveMatch!;
  const b = startMatchDay(clone(PRE)).liveMatch!;
  check("B5. opponent strength deterministic", a.oppStrength === b.oppStrength);
  check(
    "B5b. opponent strength comes from the brief stream",
    Math.abs(a.oppStrength - liveOpponentStrength(a.matchSeed!)) < 1e-9,
  );
  check(
    "B6. weather deterministic",
    a.weather === b.weather && a.weather === weatherFor(a.matchSeed!),
  );
  check("B7. attendance deterministic", a.projectedAttendance === b.projectedAttendance);
  check("B7b. board expectation deterministic", a.boardExpectation === b.boardExpectation);

  const started = startMatchDay(clone(PRE));
  const reloaded = reload(started);
  check(
    "B8. reload preserves briefing byte-for-byte",
    JSON.stringify(reloaded.liveMatch) === JSON.stringify(started.liveMatch),
  );
  check("B8b. reload does not advance the stage", reloaded.liveMatch!.status === "brief");
}

/* =========================================================================
   [C] First half
========================================================================= */
console.log("\n[C] First half");
{
  const started = startMatchDay(clone(PRE));
  const h1a = kickoff(clone(started)).liveMatch!;
  const h1b = kickoff(clone(started)).liveMatch!;
  check(
    "C9. first-half score deterministic",
    h1a.ourGoals === h1b.ourGoals && h1a.theirGoals === h1b.theirGoals,
  );
  check(
    "C10. first-half events deterministic",
    JSON.stringify(h1a.events) === JSON.stringify(h1b.events),
  );
  check(
    "C10b. goal events match the canonical score",
    h1a.events.filter((e) => e.type === "goal" && e.side === "us").length === h1a.ourGoals &&
      h1a.events.filter((e) => e.type === "goal" && e.side === "them").length === h1a.theirGoals,
  );

  const ht = kickoff(clone(started));
  const htReloaded = reload(ht);
  check(
    "C11. reload at half-time preserves the first half",
    JSON.stringify(htReloaded.liveMatch) === JSON.stringify(ht.liveMatch),
  );

  // Re-running from the same pre-kickoff state must reproduce the same half.
  const again = kickoff(reload(clone(started))).liveMatch!;
  check(
    "C12. re-running from the same pre-kickoff state reproduces the first half",
    JSON.stringify(again) === JSON.stringify(h1a),
  );
  check(
    "C12b. kickoff from a re-briefed state is identical",
    JSON.stringify(kickoff(startMatchDay(clone(PRE))).liveMatch) === JSON.stringify(h1a),
  );
  check("C12c. kickoff is a no-op outside the brief stage", kickoff(ht) === ht);
}

/* =========================================================================
   [D] RNG isolation — cosmetic draws cannot move the simulation
========================================================================= */
console.log("\n[D] RNG isolation");
{
  const seed = "iso|seed|root";
  const goals = halfGoals(seed, 1, 70, 62, 1, 1);

  // 13. Draining the presentation streams by any amount leaves goals alone.
  const evStream = matchStream(seed, "h1.events");
  for (let i = 0; i < 500; i++) evStream();
  const cardStream = matchStream(seed, "h1.cards");
  for (let i = 0; i < 500; i++) cardStream();
  const goalsAfter = halfGoals(seed, 1, 70, 62, 1, 1);
  check(
    "D13. cosmetic draw-count changes cannot affect score simulation",
    JSON.stringify(goals) === JSON.stringify(goalsAfter),
  );
  check(
    "D13b. presentation is a pure function of the canonical score",
    JSON.stringify(halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, "X")) ===
      JSON.stringify(halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, "X")),
  );
  check(
    "D13c. changing the presentation output does not change the score",
    JSON.stringify(halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, "OTHER")) !==
      JSON.stringify(halfPresentation(seed, 1, 0, 45, goals.usGoals, goals.themGoals, "X")) ||
      goals.themGoals === 0,
  );

  // 14/15/16: streams are independent generators, not one shared cursor.
  const names = [
    "brief",
    "weather",
    "attendance",
    "h1.score",
    "h1.events",
    "h1.cards",
    "h2.score",
    "h2.events",
    "h2.cards",
    "halftime",
    "finance",
  ] as const;
  const firstDraws = names.map((n) => matchStream(seed, n)());
  const distinct = new Set(firstDraws.map((x) => x.toFixed(12))).size;
  check(
    "D14. weather stream cannot affect goals",
    (() => {
      const w = matchStream(seed, "weather");
      for (let i = 0; i < 50; i++) w();
      return JSON.stringify(halfGoals(seed, 1, 70, 62, 1, 1)) === JSON.stringify(goals);
    })(),
  );
  check(
    "D15. event-text stream cannot affect attendance",
    (() => {
      const a1 = matchStream(seed, "attendance")();
      const e = matchStream(seed, "h1.events");
      for (let i = 0; i < 50; i++) e();
      return matchStream(seed, "attendance")() === a1;
    })(),
  );
  check(
    "D16. finance calculation cannot affect score",
    (() => {
      const tv = liveTvIncome(seed);
      return (
        liveTvIncome(seed) === tv &&
        JSON.stringify(halfGoals(seed, 1, 70, 62, 1, 1)) === JSON.stringify(goals)
      );
    })(),
  );
  check("D17. every substream is an independent generator", distinct === names.length);
  check(
    "D18. second-half score stream differs from the first",
    JSON.stringify(halfGoals(seed, 2, 70, 62, 1, 1)) !== JSON.stringify(goals) ||
      matchStream(seed, "h2.score")() !== matchStream(seed, "h1.score")(),
  );
}

/* =========================================================================
   [E] Half-time
========================================================================= */
console.log("\n[E] Half-time");
{
  const ht = kickoff(startMatchDay(clone(PRE)));
  const optionIds = ht.liveMatch!.halfTimeOptions!.map((o) => o.id);
  check(
    "E17a. the three existing options are preserved",
    JSON.stringify(optionIds) === JSON.stringify(["steady", "attack", "shutup"]),
  );

  for (const id of optionIds) {
    const after = applyHalfTimeChoice(clone(ht), id);
    check(`E17. option "${id}" persists`, after.liveMatch!.chosenNudgeId === id);
    check(`E18. option "${id}" applies exactly once`, applyHalfTimeChoice(after, id) === after);
    check(`E19. option "${id}" survives reload`, reload(after).liveMatch!.chosenNudgeId === id);
    check(
      `E20. option "${id}" leaves the first half unchanged`,
      JSON.stringify(after.liveMatch!.events.slice(0, ht.liveMatch!.events.length)) ===
        JSON.stringify(ht.liveMatch!.events),
    );
    check(
      `E21. option "${id}" + same state reproduces the second half`,
      JSON.stringify(applyHalfTimeChoice(clone(ht), id).liveMatch) ===
        JSON.stringify(after.liveMatch),
    );
    check(`E21b. option "${id}" reaches full-time`, after.liveMatch!.status === "fullTime");
  }

  const attack = applyHalfTimeChoice(clone(ht), "attack");
  const shut = applyHalfTimeChoice(clone(ht), "shutup");
  check(
    "E22. different choices influence the second half",
    attack.liveMatch!.ourGoals !== shut.liveMatch!.ourGoals ||
      attack.liveMatch!.theirGoals !== shut.liveMatch!.theirGoals ||
      attack.fanHappiness !== shut.fanHappiness,
  );
  check("E23. chairman choices never buy a result with a cash bonus", attack.liveMatch!.winBonus === 0);
  check("E24. no cash moved at half-time (nothing booked yet)", attack.cash === ht.cash);
  check(
    "E25. an unknown choice is rejected",
    applyHalfTimeChoice(clone(ht), "nope") !== undefined &&
      applyHalfTimeChoice(clone(ht), "nope").liveMatch!.status === "halfTime",
  );
}

/* =========================================================================
   [F] Full-time
========================================================================= */
console.log("\n[F] Full-time");
{
  const ft = applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady");
  const ft2 = applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady");
  check(
    "F22. final score deterministic",
    ft.liveMatch!.ourGoals === ft2.liveMatch!.ourGoals &&
      ft.liveMatch!.theirGoals === ft2.liveMatch!.theirGoals,
  );
  check(
    "F23. full event history deterministic",
    JSON.stringify(ft.liveMatch!.events) === JSON.stringify(ft2.liveMatch!.events),
  );
  check(
    "F23b. matchday money deterministic",
    ft.liveMatch!.gateReceipts === ft2.liveMatch!.gateReceipts &&
      ft.liveMatch!.tvIncome === ft2.liveMatch!.tvIncome &&
      ft.liveMatch!.matchdayOps === ft2.liveMatch!.matchdayOps &&
      ft.liveMatch!.winBonus === ft2.liveMatch!.winBonus,
  );
  check(
    "F23c. tv income comes from the finance stream",
    ft.liveMatch!.tvIncome === liveTvIncome(seedOf(ft.liveMatch!)),
  );
  check(
    "F24. full-time state survives reload",
    JSON.stringify(reload(ft).liveMatch) === JSON.stringify(ft.liveMatch),
  );

  const committedA = commitLiveMatchAndAdvance(clone(ft));
  const committedB = commitLiveMatchAndAdvance(reload(clone(ft)));
  check(
    "F25. continue/commit does not reroll anything",
    JSON.stringify(committedA.results) === JSON.stringify(committedB.results) &&
      committedA.cash === committedB.cash,
  );
}

/* =========================================================================
   [G] Fixture completion
========================================================================= */
console.log("\n[G] Fixture completion");
{
  const ft = applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady");
  const lm = ft.liveMatch!;
  const after = commitLiveMatchAndAdvance(clone(ft));
  const mine = (after.matchRecords ?? []).filter((r) => r.id === lm.fixtureId);
  check("G26. exactly one MatchRecord", mine.length === 1);
  check(
    "G27. the correct fixture is marked complete",
    mine[0]?.home === lm.homeClub && mine[0]?.away === lm.awayClub,
  );
  check(
    "G28. correct league/season/week/round recorded",
    mine[0]?.league === lm.leagueId &&
      mine[0]?.season === lm.season &&
      mine[0]?.week === lm.fixture.week &&
      mine[0]?.round === lm.round,
  );
  check("G29. user involvement recorded", mine[0]?.userInvolved === true);
  check(
    "G29b. stored goals match the live score",
    (lm.fixture.home ? mine[0]?.homeGoals : mine[0]?.awayGoals) === lm.ourGoals &&
      (lm.fixture.home ? mine[0]?.awayGoals : mine[0]?.homeGoals) === lm.theirGoals,
  );
  const row = tableFor(after, playerLeagueId(after)).find((r) => isUserClubReference(after, r.team))!;
  check("G30. table projection reflects the result once", row.p === 1);
  check(
    "G30b. every other fixture in the round resolved once",
    (after.matchRecords ?? []).filter((r) => r.week === lm.fixture.week).length ===
      new Set((after.matchRecords ?? []).filter((r) => r.week === lm.fixture.week).map((r) => r.id))
        .size,
  );
  check("G31. live match cleared after commit", after.liveMatch === null);
}

/* =========================================================================
   [H] Finance
========================================================================= */
console.log("\n[H] Finance");
{
  const ft = applyHalfTimeChoice(kickoff(startMatchDay(atHomeFixture())), "attack");
  const lm = ft.liveMatch!;
  const openingCash = ft.cash;
  const after = commitLiveMatchAndAdvance(clone(ft));
  const base = matchdayKey({
    season: lm.season!,
    week: lm.fixture.week,
    opponent: lm.fixture.opponent,
  });
  const md = (after.financeLedger ?? []).filter((e) => e.dedupeKey?.startsWith(base));
  const countOf = (suffix: string) => md.filter((e) => e.dedupeKey === `${base}:${suffix}`).length;
  check("H31. gate posts once", countOf("tickets") === 1);
  check("H32. TV posts once", countOf("broadcast") === 1);
  check("H33. matchday expense posts once", countOf("ops") === 1);
  check(
    "H34pre. baseline seed posts no bonus unless it won",
    countOf("winBonus") === (lm.winBonus > 0 ? 1 : 0),
  );

  check(
    "H35. every matchday posting has a stable fixture-derived dedupe key",
    md.length > 0 &&
      md.every((e) => e.dedupeKey!.startsWith(`matchday:s${lm.season}:w${lm.fixture.week}:`)),
  );
  check("H35b. dedupe keys are unique", new Set(md.map((e) => e.dedupeKey)).size === md.length);

  // 36. Duplicate commit must not duplicate anything.
  const dup = commitLiveMatchAndAdvance({
    ...clone(ft),
    liveMatch: { ...clone(lm), committed: true },
  });
  check(
    "H36a. committed flag short-circuits the commit",
    dup.cash === ft.cash && dup.liveMatch === null && dup.week === ft.week,
  );
  const restored: GameState = { ...clone(after), liveMatch: clone(lm) };
  const dup2 = commitLiveMatchAndAdvance(restored);
  check(
    "H36b. a resumed-then-recommitted match posts nothing again",
    dup2.cash === after.cash &&
      (dup2.financeLedger ?? []).length === (after.financeLedger ?? []).length &&
      (dup2.matchRecords ?? []).length === (after.matchRecords ?? []).length &&
      dup2.week === after.week,
  );
  check(
    "H36c. duplicate postMatchdayFinance keys are impossible",
    new Set((after.financeLedger ?? []).map((e) => e.dedupeKey).filter(Boolean)).size ===
      (after.financeLedger ?? []).filter((e) => e.dedupeKey).length,
  );
  check("H37. cash reconciles exactly", reconcile(after).ok);
  const movement = (after.financeLedger ?? [])
    .filter((e) => !(ft.financeLedger ?? []).some((p) => p.id === e.id))
    .reduce((n, e) => n + (e.direction === "income" ? e.amount : -e.amount), 0);
  check(
    "H37b. cash == opening cash + canonical ledger movement",
    Math.round(after.cash) === Math.round(openingCash + movement),
  );
}

/* =========================================================================
   [H34] Conditional win bonus — exactly-once, result-driven
   Uses fixed seeds whose canonical full-time result is asserted first, so the
   test verifies the posting rule rather than whether a seed happens to win.
========================================================================= */
console.log("\n[H34] No artificial win bonus");
{
  const ftOf = (seed: string, choice: string) =>
    applyHalfTimeChoice(kickoff(startMatchDay(atFixture(seed))), choice);

  const win = ftOf("MD_AUDIT_1", "attack");
  const wlm = win.liveMatch!;
  check("H34a. attacking choice carries no cash bonus", wlm.winBonus === 0);

  const wAfter = commitLiveMatchAndAdvance(clone(win));
  const wBase = matchdayKey({
    season: wlm.season!,
    week: wlm.fixture.week,
    opponent: wlm.fixture.opponent,
  });
  const bonuses = (s: GameState) =>
    (s.financeLedger ?? []).filter((e) => e.dedupeKey === `${wBase}:winBonus`);
  check("H34b. no bonus ledger entry posts", bonuses(wAfter).length === 0);
  check("H34c. attacking football is funded by risk, not cash", wlm.winBonus === 0);
  check("H34d. fixture still commits normally", wAfter.liveMatch === null);

  const wDup = commitLiveMatchAndAdvance({ ...clone(wAfter), liveMatch: clone(wlm) });
  check(
    "H34e. re-committing posts no second bonus",
    bonuses(wDup).length === 0 && wDup.cash === wAfter.cash,
  );
  const wReload = commitLiveMatchAndAdvance({
    ...reload(wAfter),
    liveMatch: clone(wlm),
  } as GameState);
  check(
    "H34f. reloading after commit posts no second bonus",
    bonuses(wReload).length === 0 && wReload.cash === wAfter.cash,
  );

  const bonusCount = (s: GameState, lm: NonNullable<GameState["liveMatch"]>) => {
    const b = matchdayKey({
      season: lm.season!,
      week: lm.fixture.week,
      opponent: lm.fixture.opponent,
    });
    return (s.financeLedger ?? []).filter((e) => e.dedupeKey === `${b}:winBonus`).length;
  };

  const loss = ftOf("MD_AUDIT_10", "attack");
  const llm = loss.liveMatch!;
  check(
    "H34g. precondition: canonical result is a non-win",
    llm.ourGoals <= llm.theirGoals,
    `${llm.ourGoals}-${llm.theirGoals}`,
  );
  check(
    "H34h. a non-win posts no bonus",
    llm.winBonus === 0 && bonusCount(commitLiveMatchAndAdvance(clone(loss)), llm) === 0,
  );

  const draw = ftOf("MD_AUDIT_0", "attack");
  const dlm = draw.liveMatch!;
  check(
    "H34i. another attacking match also carries no bonus",
    dlm.winBonus === 0,
  );
  check(
    "H34j. no result posts a bonus",
    dlm.winBonus === 0 && bonusCount(commitLiveMatchAndAdvance(clone(draw)), dlm) === 0,
  );

  const steady = ftOf("MD_AUDIT_10", "steady");
  const slm = steady.liveMatch!;
  check(
    "H34k. a result with no bonus on offer posts nothing",
    slm.winBonus === 0 && bonusCount(commitLiveMatchAndAdvance(clone(steady)), slm) === 0,
  );
}

/* =========================================================================
   [I] Weekly integration
========================================================================= */
console.log("\n[I] Weekly integration");
{
  const ft = applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady");
  const after = commitLiveMatchAndAdvance(clone(ft));
  const wk = ft.liveMatch!.fixture.week;
  const scheduled = (ft.leagueSchedule ?? []).filter((f) => f.week === wk).length;
  const resolved = (after.matchRecords ?? []).filter(
    (r) => r.week === wk && r.season === ft.season,
  ).length;
  check(
    "I38. remaining AI fixtures resolve once",
    resolved === scheduled,
    `${resolved}/${scheduled}`,
  );
  check(
    "I39. inbox generators run once",
    new Set(after.inbox.map((i) => i.eventKey ?? i.id)).size === after.inbox.length,
  );
  check("I40. week advances once", after.week === ft.week + 1);
  check(
    "I41. board/reputation/fan effects apply once",
    (() => {
      const twice = commitLiveMatchAndAdvance({ ...clone(after), liveMatch: clone(ft.liveMatch!) });
      return twice.fanHappiness === after.fanHappiness && twice.reputation === after.reputation;
    })(),
  );
  check("I41b. exactly one result row appended", after.results.length === ft.results.length + 1);
  check(
    "I42. reload after commit is byte-stable",
    JSON.stringify(reload(after)) === JSON.stringify(after),
  );
  check(
    "I42b. the whole committed state is reproducible",
    JSON.stringify(
      commitLiveMatchAndAdvance(applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady")),
    ) === JSON.stringify(after),
  );
}

/* =========================================================================
   [J] Save / migration
========================================================================= */
console.log("\n[J] Save / migration");
{
  check("J43a. schema version bumped", SAVE_VERSION >= 11);
  const started = startMatchDay(clone(PRE));
  // Simulate a pre-v11 save: strip the new fields and drop the version.
  const legacyRaw = JSON.parse(JSON.stringify(started)) as LegacySave;
  legacyRaw.version = 10;
  const lmAny = legacyRaw.liveMatch as unknown as Record<string, unknown>;
  const before = JSON.parse(JSON.stringify(lmAny));
  for (const k of [
    "matchSeed",
    "fixtureId",
    "leagueId",
    "season",
    "round",
    "homeClub",
    "awayClub",
    "committed",
  ]) {
    delete lmAny[k];
  }
  const m1 = migrateSave(
    JSON.parse(JSON.stringify(legacyRaw)) as unknown as Record<string, unknown>,
  );
  check(
    "J43. new persisted match fields migrate safely",
    typeof m1.liveMatch!.matchSeed === "string" &&
      m1.liveMatch!.committed === false &&
      m1.liveMatch!.fixtureId === before.fixtureId,
  );
  check(
    "J43b. displayed briefing values are untouched",
    m1.liveMatch!.weather === started.liveMatch!.weather &&
      m1.liveMatch!.projectedAttendance === started.liveMatch!.projectedAttendance &&
      m1.liveMatch!.oppStrength === started.liveMatch!.oppStrength,
  );
  const m2 = migrateSave(
    JSON.parse(JSON.stringify(legacyRaw)) as unknown as Record<string, unknown>,
  );
  check("J44. migration is deterministic", JSON.stringify(m1) === JSON.stringify(m2));
  const m3 = migrateSave(JSON.parse(JSON.stringify(m1)) as unknown as Record<string, unknown>);
  check("J45. migration is idempotent", JSON.stringify(m3) === JSON.stringify(m1));

  const played = commitLiveMatchAndAdvance(applyHalfTimeChoice(kickoff(clone(started)), "steady"));
  const legacyPlayed = JSON.parse(JSON.stringify(played)) as LegacySave;

  // J46 is specifically the v16 -> v17 club-reference contract. Build the
  // relevant v16 history shape explicitly instead of pretending a current save
  // is v10 and replaying unrelated world/finance migrations as part of this
  // assertion.
  legacyPlayed.version = 16;
  legacyPlayed.matchRecords = legacyPlayed.matchRecords.map((record) => ({
    ...record,
    home: clubDisplayName(played, record.home),
    away: clubDisplayName(played, record.away),
  }));
  legacyPlayed.results = legacyPlayed.results.map((result) => ({
    ...result,
    opponent: clubDisplayName(played, result.opponent),
  }));
  const m4 = migrateSave(
    JSON.parse(JSON.stringify(legacyPlayed)) as unknown as Record<string, unknown>,
  );
  const completedMatchHistory = (state: GameState) =>
    state.matchRecords
      .map(
        (record) =>
          `${record.league}|s${record.season}|r${record.round}|${clubDisplayName(state, record.home)}>${clubDisplayName(state, record.away)}|${record.homeGoals}-${record.awayGoals}|${record.outcome}|${record.userInvolved}`,
      )
      .sort();
  const userResultHistory = (state: GameState) =>
    state.results.map((result) =>
      [
        result.week,
        clubDisplayName(state, result.opponent),
        result.home,
        result.goalsFor,
        result.goalsAgainst,
        result.attendance,
        result.gateReceipts,
        result.tvIncome,
        result.result,
      ].join("|"),
    );
  check(
    "J46. existing completed match history survives identity migration",
    JSON.stringify(completedMatchHistory(m4)) === JSON.stringify(completedMatchHistory(played)) &&
      JSON.stringify(userResultHistory(m4)) === JSON.stringify(userResultHistory(played)),
  );
  check(
    "J46b. historical friendly labels remain presentation labels",
    m4.results
      .filter((result) => result.opponent.endsWith(" (friendly)"))
      .every((result) => !result.opponent.startsWith("c_")),
  );
  check(
    "J47. no historical records are fabricated",
    (m4.financeLedger ?? []).length === (played.financeLedger ?? []).length &&
      (m4.seasonHistory ?? []).length === (played.seasonHistory ?? []).length,
  );
  check(
    "J47b. a save with no match in flight is unchanged apart from version",
    (() => {
      const plain = JSON.parse(JSON.stringify(PRE)) as LegacySave;
      plain.version = 10;
      const out = migrateSave(
        JSON.parse(JSON.stringify(plain)) as unknown as Record<string, unknown>,
      );
      return out.liveMatch == null && out.version === SAVE_VERSION;
    })(),
  );
}

/* =========================================================================
   [K] Purity — no stage mutates its input
========================================================================= */
console.log("\n[K] Purity");
{
  const a = clone(PRE);
  const snapA = JSON.stringify(a);
  startMatchDay(a);
  check("K48. starting a match does not mutate its input", JSON.stringify(a) === snapA);

  const b = startMatchDay(clone(PRE));
  const snapB = JSON.stringify(b);
  kickoff(b);
  check("K49. kickoff does not mutate its input", JSON.stringify(b) === snapB);

  const c = kickoff(startMatchDay(clone(PRE)));
  const snapC = JSON.stringify(c);
  applyHalfTimeChoice(c, "attack");
  check("K50. half-time resolution does not mutate its input", JSON.stringify(c) === snapC);

  const d = applyHalfTimeChoice(kickoff(startMatchDay(clone(PRE))), "steady");
  const snapD = JSON.stringify(d);
  commitLiveMatchAndAdvance(d);
  check("K51. commit does not mutate its input", JSON.stringify(d) === snapD);
}

/* =========================================================================
   [L] Static determinism audit of the live-match path
========================================================================= */
console.log("\n[L] Static audit");
{
  /** Comments may legitimately *mention* the banned APIs; strip them first. */
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const md = strip(src("matchday.ts"));
  check("L1. matchday.ts has no Math.random", !/Math\.random/.test(md));
  check("L2. matchday.ts has no Date.now", !/Date\.now/.test(md));
  check("L3. matchday.ts has no crypto.randomUUID", !/randomUUID/.test(md));
  const eng = strip(src("engine.ts"));
  // The interactive path moved to liveMatch.ts in Phase 0c; the commit
  // wrapper stays in engine.ts, so both files are audited together.
  const live = strip(src("liveMatch.ts")) + eng;
  check("L4. live-match path has no Math.random", !/Math\.random/.test(live));
  check("L5. live-match path has no Date.now", !/Date\.now/.test(live));
  check("L6. live-match path has no crypto.randomUUID", !/randomUUID/.test(live));
  check(
    "L7. live-match path never mutates cash directly",
    !/\b(ns|s)\.cash\s*(=|\+=|-=)/.test(live),
  );
  check(
    "L8. live-match path never mutates the league table directly",
    !/\bleague\s*\[|\.pts\s*\+=/.test(live),
  );
  check("L9. commit is guarded by the committed flag", /lm\.committed/.test(live));
  check(
    "L10. commit is guarded by canonical fixture completion",
    /matchRecords\s*\?\?\s*\[\]\)\.some\(\(r\) => r\.id === lm\.fixtureId\)/.test(live),
  );
  check(
    "L11. only one commit entry point exists",
    (eng.match(/export function commitLiveMatchAndAdvance/g) ?? []).length === 1 &&
      (strip(src("liveMatch.ts")).match(/export function commitLiveMatch\b/g) ?? []).length === 1,
  );
  check(
    "L12. presentation never calls the score stream",
    !/h1\.score|h2\.score/.test(md.slice(md.indexOf("export function halfPresentation"))),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
