/* Match viewer flow checks.
   Run with:  bun src/lib/game/__checks__/match-viewer-flow.check.ts

   Presentation only. Locks the viewer fixes:
   - visible possession across a match tracks the engine's possession stat
   - every set piece is earned on screen (corner won, foul given)
   - restarts follow the previous moment (kick-off after a goal, etc.)
   - flow and highlights replay identically */
import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import type { GameState, MatchEvent } from "../types";
import { isUserClubReference } from "../clubReference";
import { aiClubPlayers } from "../aiClubManager";
import { managerMatchStyle } from "../managerMatchStyle";
import {
  createMatchEngineSnapshot,
  prepareSecondHalfManagement,
  simulateMatchHalf,
  totalMatchStats,
} from "../matchEngine";
import {
  buildMatchFlowSequence,
  buildMatchSequence,
  flowSequenceDurationMs,
  sequenceDurationMs,
  visiblePossessionMs,
  type MatchSequence,
  type PossessionLedger,
} from "../matchSequence";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const state: GameState = newGame("Viewer Town", "A. Watcher", "MATCH|VIEWER|FLOW");
const opponent = [...new Set((state.leagues ?? []).flatMap((league) => league.clubIds))].find(
  (club) => !isUserClubReference(state, club) && aiClubPlayers(state, club).length >= 18,
);
assert.ok(opponent, "needs an opponent with a detailed squad");
const style = managerMatchStyle(state);

interface Replay {
  stat: number;
  visibleShare: number;
  pairs: { flow: MatchSequence | null; highlight: MatchSequence | null; previous?: MatchEvent }[];
}

function replay(matchIndex: number): Replay {
  const engine = createMatchEngineSnapshot(state, style, opponent!);
  const seedBase = `viewer-check-${matchIndex}`;
  const edge = (matchIndex % 5) * 2.5;
  const common = {
    seedBase,
    ourStrength: 60 + edge,
    opponentStrength: 60,
    opponentName: opponent!,
    style,
    userLineup: engine.userLineup,
    opponentLineup: engine.opponentLineup,
    userBench: engine.userBench,
    opponentBench: engine.opponentBench,
    userPlan: engine.userPlan,
    opponentPlan: engine.opponentPlan,
  };
  const first = simulateMatchHalf({ ...common, half: 1, fromMinute: 0, toMinute: 45, substitutions: [] });
  engine.halves = [first.snapshot];
  const management = prepareSecondHalfManagement(engine, seedBase);
  const second = simulateMatchHalf({ ...common, half: 2, fromMinute: 45, toMinute: 90, substitutions: engine.substitutions });
  engine.halves.push(second.snapshot);
  const events = [...first.events, ...management, ...second.events].sort((a, b) => a.minute - b.minute);
  const stat = totalMatchStats(engine)!.us.possession;
  const ctx = {
    userLineup: engine.userLineup ?? [],
    opponentLineup: engine.opponentLineup ?? [],
    userBench: engine.userBench,
    opponentBench: engine.opponentBench,
    substitutions: engine.substitutions,
    userPlan: engine.userPlan,
    opponentPlan: engine.opponentPlan,
  };
  const ledger: PossessionLedger = { us: 0, them: 0 };
  const pairs: Replay["pairs"] = [];
  events.forEach((event, index) => {
    const previous = index > 0 ? events[index - 1] : undefined;
    const highlight = buildMatchSequence({ event, ...ctx });
    const flow = buildMatchFlowSequence({
      nextEvent: event,
      previousEvent: previous,
      nextSequence: highlight ?? undefined,
      ...ctx,
      userPossession: stat,
      possessionLedger: { ...ledger },
    });
    const gap = event.minute - (previous?.minute ?? 0);
    for (const [sequence, ms] of [
      [flow, flow ? flowSequenceDurationMs(flow, gap) : 0],
      [highlight, highlight ? sequenceDurationMs(highlight) : 0],
    ] as const) {
      const shown = visiblePossessionMs(sequence, ms);
      ledger.us += shown.us;
      ledger.them += shown.them;
    }
    pairs.push({ flow, highlight, previous });
  });
  return { stat, visibleShare: (100 * ledger.us) / Math.max(1, ledger.us + ledger.them), pairs };
}

const replays = Array.from({ length: 24 }, (_, index) => replay(index));

console.log("\n[V1] Visible possession tracks the stat");
check("average drift under 6 points", () => {
  const drift = replays.reduce((sum, r) => sum + Math.abs(r.visibleShare - r.stat), 0) / replays.length;
  console.log(`    mean |visible - stat| = ${drift.toFixed(1)} pts`);
  assert.ok(drift < 6, `drift ${drift.toFixed(1)}`);
});
check("no match drifts more than 18 points", () => {
  for (const r of replays) assert.ok(Math.abs(r.visibleShare - r.stat) <= 18, `${r.visibleShare.toFixed(0)} vs ${r.stat}`);
});

console.log("\n[V2] Set pieces are earned");
check("every corner follows a cross headed behind", () => {
  for (const r of replays) for (const pair of r.pairs) {
    if (pair.highlight?.setPiece !== "corner" || !pair.flow?.actions.length) continue;
    const last = pair.flow.actions[pair.flow.actions.length - 1];
    assert.equal(last.kind, "clearance");
    assert.match(last.commentary, /behind/i);
  }
});
check("every free-kick and penalty follows a foul at the spot", () => {
  for (const r of replays) for (const pair of r.pairs) {
    const kind = pair.highlight?.setPiece;
    if ((kind !== "freeKick" && kind !== "penalty") || !pair.flow?.actions.length) continue;
    const last = pair.flow.actions[pair.flow.actions.length - 1];
    assert.equal(last.kind, "challenge");
    const spot = pair.highlight!.actions[0].start;
    assert.ok(Math.hypot(last.end.x - spot.x, last.end.y - spot.y) < 0.5, "foul happens where the kick is taken");
  }
});
check("penalty appeals are never drawn as penalties", () => {
  for (const r of replays) for (const pair of r.pairs) {
    if (pair.highlight && /penalty shouts/i.test(pair.highlight.sourceText)) assert.notEqual(pair.highlight.setPiece, "penalty");
  }
});

console.log("\n[V3] Restarts follow the previous moment");
check("the conceding side kicks off from the centre after a goal", () => {
  for (const r of replays) for (const pair of r.pairs) {
    if (pair.previous?.type !== "goal" || pair.previous.side === "neutral" || !pair.flow) continue;
    const first = pair.flow.actions[0];
    assert.notEqual(first.side, pair.previous.side);
    assert.ok(Math.abs(first.start.x - 50) < 0.5 && Math.abs(first.start.y - 50) < 0.5);
  }
});

console.log("\n[V4] Determinism");
check("a match replays identically", () => {
  assert.deepEqual(replay(3), replay(3));
});

console.log(`\nmatch-viewer-flow: ${passed} passed`);
