/* Formation engine regression + calibration checks.
   Run with:  bun src/lib/game/__checks__/formation-engine.check.ts

   Locks the formation pass: every supported shape is a real system that AI
   managers use, AI XIs are picked for the chosen shape, substitutions keep
   the shape, results replay exactly, and formation effects stay bounded
   below squad quality. */
import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import type { MatchTeamPlan } from "../types";
import { aiClubManagerSetup, aiClubPlayers } from "../aiClubManager";
import { opponentMatchLineup } from "../matchLineup";
import {
  createMatchEngineSnapshot,
  matchTacticalModifiers,
  prepareSecondHalfManagement,
  simulateMatchHalf,
} from "../matchEngine";
import { activeMatchLineupAtMinute } from "../matchSequence";
import {
  FORMATION_WING_BACK_POSTURE,
  MANAGER_FORMATIONS,
  MANAGER_FORMATION_SLOTS,
  formationPitchShape,
} from "../managerFormationLayout";
import { formationProfile, tacticalMatchModifiers } from "../formationTactics";
import { managerMatchStyle, neutralMatchStyle } from "../managerMatchStyle";
import { halfGoals } from "../matchday";
import { positionFamiliarity } from "../positions";
import { isUserClubReference, clubDisplayName } from "../clubReference";
import { startMatchDay } from "../liveMatch";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const state = newGame("Formation Town", "A. Chair", "FORMATION|ENGINE|CHECK");
const allClubs = [...new Set((state.leagues ?? []).flatMap((league) => league.clubIds))].filter(
  (club) => !isUserClubReference(state, club),
);
const detailedClubs = allClubs.filter((club) => aiClubPlayers(state, club).length >= 18);
assert.ok(allClubs.length >= 40, "the check needs a populated world");
assert.ok(detailedClubs.length >= 5, "the check needs AI clubs with detailed squads");

console.log("\n[F1] Every formation is a real structure");
check("profiles are derived from slots and differ", () => {
  const signatures = new Set(
    MANAGER_FORMATIONS.map((f) => {
      const p = formationProfile(f);
      return `${p.central}|${p.width}|${p.wideDefence}|${p.cover}|${p.attack}`;
    }),
  );
  assert.equal(signatures.size, MANAGER_FORMATIONS.length, "no two shapes may share a structure");
});
check("3-4-3 and 5-3-2 are wing-back systems; 3-5-2 is not", () => {
  assert.equal(FORMATION_WING_BACK_POSTURE["3-4-3"], "attacking");
  assert.equal(FORMATION_WING_BACK_POSTURE["5-3-2"], "defensive");
  assert.equal(FORMATION_WING_BACK_POSTURE["3-5-2"], null);
  for (const shape of ["3-4-3", "3-5-2", "5-3-2"] as const) {
    assert.equal(MANAGER_FORMATION_SLOTS[shape].filter((r) => r === "CB").length, 3, `${shape} plays three centre-backs`);
  }
});
check("3-5-2 and 5-3-2 are tactically distinct", () => {
  const attacking = formationProfile("3-5-2");
  const defensive = formationProfile("5-3-2");
  assert.ok(attacking.attack > defensive.attack, "3-5-2 carries more attacking presence");
  assert.ok(defensive.cover > attacking.cover, "5-3-2 is the more solid shape");
  assert.ok(defensive.wideDefence > attacking.wideDefence, "5-3-2 protects its flanks with a back five");
  assert.equal(defensive.backLine, 5);
  assert.equal(attacking.backLine, 3);
});
check("pitch shape places every starter of every formation", () => {
  const club = detailedClubs[0];
  for (const f of MANAGER_FORMATIONS) {
    const xi = opponentMatchLineup(state, club, f);
    const shape = formationPitchShape(xi, f, "them");
    assert.equal(shape.size, 11, `${f} shape covers the XI`);
    const keeper = xi.find((p) => p.role === "GK")!;
    for (const p of xi) if (p.role !== "GK") assert.ok(shape.get(p.playerId)!.x < shape.get(keeper.playerId)!.x, `${f}: outfield ahead of keeper`);
  }
});

console.log("\n[F2] AI managers use real, varied formations");
check("all six formations appear across AI clubs", () => {
  const counts: Record<string, number> = {};
  for (const club of allClubs) {
    const f = aiClubManagerSetup(state, club).formation;
    counts[f] = (counts[f] ?? 0) + 1;
  }
  for (const f of MANAGER_FORMATIONS) assert.ok((counts[f] ?? 0) > 0, `${f} must be used by at least one AI club`);
  const largest = Math.max(...Object.values(counts)) / allClubs.length;
  assert.ok(largest <= 0.4, `no shape may dominate the AI market (largest share ${largest.toFixed(2)})`);
});
check("AI manager identity is stable", () => {
  for (const club of allClubs.slice(0, 10)) {
    assert.deepEqual(aiClubManagerSetup(state, club), aiClubManagerSetup(state, club));
  }
});

console.log("\n[F3] AI XIs are selected for the chosen shape");
check("each formation's XI matches its slots", () => {
  for (const club of detailedClubs.slice(0, 3)) {
    for (const f of MANAGER_FORMATIONS) {
      const xi = opponentMatchLineup(state, club, f);
      assert.deepEqual(xi.map((p) => p.role), [...MANAGER_FORMATION_SLOTS[f]], `${club} ${f}`);
      assert.equal(new Set(xi.map((p) => p.playerId)).size, 11);
    }
  }
});
check("3-5-2 fields LM + RM + two CDMs + CAM; 5-3-2 fields wing-backs", () => {
  const club = detailedClubs[0];
  const midfieldThree = opponentMatchLineup(state, club, "3-5-2").map((p) => p.role);
  assert.ok(midfieldThree.includes("LM") && midfieldThree.includes("RM"));
  assert.equal(midfieldThree.filter((r) => r === "CDM").length, 2);
  assert.ok(midfieldThree.includes("CAM"));
  assert.ok(!midfieldThree.includes("LWB") && !midfieldThree.includes("RWB"));
  const backFive = opponentMatchLineup(state, club, "5-3-2").map((p) => p.role);
  assert.ok(backFive.includes("LWB") && backFive.includes("RWB"));
});
check("selection respects detailed familiarity", () => {
  const byId = new Map(state.football.players.map((p) => [p.id, p]));
  let familiar = 0;
  let total = 0;
  for (const club of detailedClubs.slice(0, 5)) {
    for (const slot of opponentMatchLineup(state, club)) {
      if (slot.role === "GK") continue;
      total += 1;
      if (positionFamiliarity(byId.get(slot.playerId)!, slot.role) !== "Unfamiliar") familiar += 1;
    }
  }
  assert.ok(familiar / total >= 0.65, `most slots should be filled by players who know them (${familiar}/${total})`);
});

console.log("\n[F4] Live matches carry the opponent's real plan");
check("startMatchDay persists the AI manager's shape and XI", () => {
  const game = structuredClone(state);
  const opponent = detailedClubs[1];
  game.fixtures = [{ week: game.week, opponent, home: true, competition: "preseason", dayOfWeek: 0 }];
  const started = startMatchDay(game, game.fixtures[0]);
  const engine = started.liveMatch?.engine;
  assert.ok(engine, "engine snapshot must exist");
  const setup = aiClubManagerSetup(started, clubDisplayName(started, opponent));
  assert.equal(engine!.opponentPlan.formation, setup.formation);
  assert.deepEqual(engine!.opponentLineup!.map((p) => p.role), [...MANAGER_FORMATION_SLOTS[setup.formation]]);
  assert.ok(engine!.opponentPlan.shapeExecution !== undefined && engine!.userPlan.shapeExecution !== undefined);
});

console.log("\n[F5] Determinism");
const style = managerMatchStyle(state);
const opponentName = clubDisplayName(state, detailedClubs[2]);
check("engine snapshot replays exactly", () => {
  assert.deepEqual(createMatchEngineSnapshot(state, style, opponentName), createMatchEngineSnapshot(state, style, opponentName));
});
check("formation-aware halves replay exactly", () => {
  const engine = createMatchEngineSnapshot(state, style, opponentName);
  const input = {
    seedBase: "formation-determinism",
    half: 1 as const,
    fromMinute: 0,
    toMinute: 45,
    ourStrength: 61,
    opponentStrength: 60,
    opponentName,
    style,
    userLineup: engine.userLineup,
    opponentLineup: engine.opponentLineup,
    userPlan: engine.userPlan,
    opponentPlan: engine.opponentPlan,
  };
  assert.deepEqual(simulateMatchHalf(input), simulateMatchHalf(input));
});
check("halves without plans keep the exact pre-formation goal draw", () => {
  const legacyStyle = { ...neutralMatchStyle("4-4-2"), attackModifier: 1.04, defenseModifier: 1.02 };
  for (let i = 0; i < 100; i += 1) {
    const half = simulateMatchHalf({
      seedBase: `legacy-${i}`,
      half: 1,
      fromMinute: 0,
      toMinute: 45,
      ourStrength: 62,
      opponentStrength: 58,
      opponentName: "Legacy FC",
      style: legacyStyle,
    });
    const old = halfGoals(`legacy-${i}`, 1, 62, 58, 1.04, 1.02);
    assert.deepEqual([half.snapshot.usGoals, half.snapshot.themGoals], [old.usGoals, old.themGoals]);
  }
});

console.log("\n[F6] Substitutions keep the shape");
check("every substitute inherits the outgoing role and slot", () => {
  const snapshot = createMatchEngineSnapshot(state, style, opponentName);
  let subs = 0;
  for (let i = 0; i < 30; i += 1) {
    const engine = structuredClone(snapshot);
    prepareSecondHalfManagement(engine, `formation-subs-${i}`);
    for (const side of ["us", "them"] as const) {
      const starters = (side === "us" ? engine.userLineup : engine.opponentLineup) ?? [];
      const bench = (side === "us" ? engine.userBench : engine.opponentBench) ?? [];
      const onPitch = activeMatchLineupAtMinute(starters, bench, engine.substitutions ?? [], side, 90);
      assert.deepEqual(onPitch.map((p) => p.role), starters.map((p) => p.role));
      subs += (engine.substitutions ?? []).filter((s) => s.side === side).length;
    }
  }
  assert.ok(subs > 0, "the check must exercise real substitutions");
});

console.log("\n[F7] Bounded, contextual matchups");
const plan = (formation: string, execution = 0.85): MatchTeamPlan => ({
  managerId: "check",
  managerName: "Check",
  formation,
  philosophy: "Balanced",
  squadFit: 60,
  tempo: "Medium",
  pressing: "Medium",
  directness: "Medium",
  shapeExecution: execution,
});
const goalDiff = (a: string, b: string, ea = 0.85, eb = 0.85) => {
  const m = tacticalMatchModifiers(
    { plan: plan(a, ea), style: neutralMatchStyle(a as never) },
    { plan: plan(b, eb), style: neutralMatchStyle(b as never) },
  );
  return 1.3 * (m.usGoalFactor - m.themGoalFactor);
};
check("goal factors stay within ±12%", () => {
  for (const a of MANAGER_FORMATIONS) for (const b of MANAGER_FORMATIONS) {
    for (const [ea, eb] of [[0.45, 1.1], [1.1, 0.45], [0.85, 0.85]]) {
      const m = tacticalMatchModifiers(
        { plan: plan(a, ea), style: neutralMatchStyle(a as never) },
        { plan: plan(b, eb), style: neutralMatchStyle(b as never) },
      );
      for (const f of [m.usGoalFactor, m.themGoalFactor]) assert.ok(f >= 0.88 && f <= 1.12, `${a} v ${b}: ${f}`);
    }
  }
});
check("no formation is simply best against the field", () => {
  for (const a of MANAGER_FORMATIONS) {
    const avg = MANAGER_FORMATIONS.reduce((sum, b) => sum + goalDiff(a, b), 0) / MANAGER_FORMATIONS.length;
    assert.ok(Math.abs(avg) < 0.02, `${a} field average ${avg.toFixed(3)}`);
  }
});
check("matchups are real but smaller than half a strength point", () => {
  let largest = 0;
  for (const a of MANAGER_FORMATIONS) for (const b of MANAGER_FORMATIONS) largest = Math.max(largest, Math.abs(goalDiff(a, b)));
  assert.ok(largest > 0.02, "formation matchups must matter");
  assert.ok(largest < 0.065, `formation matchups must stay below half a strength point (${largest.toFixed(3)})`);
});
check("execution matters more than the matchup", () => {
  const drilled = goalDiff("3-5-2", "4-4-2", 1.05, 0.6);
  const shambolic = goalDiff("3-5-2", "4-4-2", 0.6, 1.05);
  assert.ok(drilled - shambolic > 0.15, "a well-run shape must clearly beat a poorly suited one");
});
check("the auto-resolve and watched paths share one tactical model", () => {
  const engine = createMatchEngineSnapshot(state, style, opponentName);
  const a = matchTacticalModifiers(style, engine.userPlan, engine.opponentPlan);
  const b = matchTacticalModifiers(style, engine.userPlan, engine.opponentPlan);
  assert.deepEqual(a, b);
  assert.ok(a.tactical, "formation-aware plans must produce tactical modifiers");
});
check("three points of quality beat the best formation matchup", () => {
  const points = (ours: number, us: string, them: string) => {
    const m = matchTacticalModifiers(neutralMatchStyle(us as never), plan(us), plan(them)).goals;
    let total = 0;
    for (let i = 0; i < 3000; i += 1) {
      const h1 = halfGoals(`quality-${i}`, 1, ours, 60, m.attackMod, m.defenseMod);
      const h2 = halfGoals(`quality-${i}`, 2, ours, 60, m.attackMod, m.defenseMod);
      const gf = h1.usGoals + h2.usGoals;
      const ga = h1.themGoals + h2.themGoals;
      total += gf > ga ? 3 : gf === ga ? 1 : 0;
    }
    return total / 3000;
  };
  let bestPair = ["4-4-2", "4-4-2"];
  let worstPair = ["4-4-2", "4-4-2"];
  for (const a of MANAGER_FORMATIONS) for (const b of MANAGER_FORMATIONS) {
    if (goalDiff(a, b) > goalDiff(bestPair[0], bestPair[1])) bestPair = [a, b];
    if (goalDiff(a, b) < goalDiff(worstPair[0], worstPair[1])) worstPair = [a, b];
  }
  assert.ok(points(63, worstPair[0], worstPair[1]) > points(60, bestPair[0], bestPair[1]));
});

console.log(`\nformation-engine: ${passed} passed`);
