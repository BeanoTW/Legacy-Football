/* Match viewer coherence check.
   Run with:  bun src/lib/game/__checks__/match-viewer-coherence.check.ts

   Presentation only. Plays real matches through the same sequence and motion
   code the viewer uses, frame by frame, and fails if the picture stops making
   football sense:
   - the ball is away from whoever has it
   - players move faster than people can run
   - teammates stand on top of each other
   - defenders leave the back line ahead of the ball
   - players jump position between clips in continuous play
   - set pieces are not set up (box empty at corners, area not cleared for penalties)
   Restarts are allowed to cut: the viewer resets the teams under a card. */
import { strict as assert } from "node:assert";
import { newGame } from "../engine";
import type { GameState, MatchLineupPlayer } from "../types";
import { isUserClubReference } from "../clubReference";
import { aiClubPlayers } from "../aiClubManager";
import { managerMatchStyle } from "../managerMatchStyle";
import { createMatchEngineSnapshot, prepareSecondHalfManagement, simulateMatchHalf, totalMatchStats } from "../matchEngine";
import {
  activeMatchLineupAtMinute,
  buildMatchFlowSequence,
  buildMatchSequence,
  flowSequenceDurationMs,
  frameForSequence,
  sequenceDurationMs,
  visiblePossessionMs,
  type MatchSequence,
} from "../matchSequence";
import { motionFrameForSequence, sequenceStartsWithReset } from "../matchMotion";
import { formationPitchShape, resolveManagerFormation } from "../managerFormationLayout";

const LIMITS = {
  ballAwayFromHolder: 0.01, // share of frames with the holder >3 m from the ball (contests excluded)
  fasterThanSprint: 0.02, // share of moves above 9.5 m/s
  teammatesStacked: 0.03, // share of open-play frames with teammates <2.5 m apart
  defendersAheadOfBall: 0.15, // share of open-play defending frames (counter-attacks happen)
  continuityJump: 0.04, // share of players moving >8 m between continuous clips
  cornerAttackersInBox: 4,
  cornerDefendersInBox: 8,
};

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

const state: GameState = newGame("Viewer Town", "A. Watcher", "MATCH|VIEWER|COHERENCE");
const opponent = [...new Set((state.leagues ?? []).flatMap((league) => league.clubIds))].find(
  (club) => !isUserClubReference(state, club) && aiClubPlayers(state, club).length >= 18,
);
assert.ok(opponent, "needs an opponent with a detailed squad");
const style = managerMatchStyle(state);

const XM = 1.05;
const YM = 0.68;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot((a.x - b.x) * XM, (a.y - b.y) * YM);
const linearise = (p: number) => {
  const t = Math.min(1, Math.max(0, p));
  return 0.5 - Math.sin(Math.asin(1 - 2 * t) / 3);
};
// "receive" is the control phase: the player may still be closing the final
// metres to a loose/arriving ball. "carry" is the phase where the player is
// unambiguously in possession and must stay attached to it.
const HOLD = new Set(["carry"]);
const BACKS = new Set(["CB", "LB", "RB", "LWB", "RWB"]);

const tally = () => ({ n: 0, bad: 0 });
const T = { holder: tally(), sprint: tally(), stacked: tally(), ahead: tally(), jump: tally(), offPitch: 0 };
const corners: { att: number; def: number }[] = [];
const penalties: { outfield: number }[] = [];

function playMatch(index: number) {
  const engine = createMatchEngineSnapshot(state, style, opponent!);
  const seedBase = `viewer-coherence-${index}`;
  const common = {
    seedBase,
    ourStrength: 60 + (index % 4) * 3,
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
  const possession = totalMatchStats(engine)!.us.possession;
  const ctx = {
    userLineup: engine.userLineup ?? [],
    opponentLineup: engine.opponentLineup ?? [],
    userBench: engine.userBench,
    opponentBench: engine.opponentBench,
    substitutions: engine.substitutions,
    userPlan: engine.userPlan,
    opponentPlan: engine.opponentPlan,
  };
  const ledger = { us: 0, them: 0 };
  let prevLast: ReturnType<typeof motionFrameForSequence> | null = null;
  let prevSeq: MatchSequence | null = null;
  const base = (lineup: MatchLineupPlayer[], ours: boolean, formation: string) =>
    formationPitchShape(lineup, resolveManagerFormation(formation), ours ? "us" : "them");

  events.forEach((event, i) => {
    const previous = i > 0 ? events[i - 1] : undefined;
    const seq = buildMatchSequence({ event, ...ctx });
    const flow = buildMatchFlowSequence({ nextEvent: event, previousEvent: previous, nextSequence: seq ?? undefined, ...ctx, userPossession: possession, possessionLedger: { ...ledger } });
    const gap = event.minute - (previous?.minute ?? 0);
    const clips: [MatchSequence, number, MatchSequence[]][] = [];
    if (flow) clips.push([flow, flowSequenceDurationMs(flow, gap), prevSeq ? [prevSeq] : []]);
    if (seq) clips.push([seq, sequenceDurationMs(seq), [prevSeq, flow].filter(Boolean) as MatchSequence[]]);
    for (const [clip, ms] of [[flow, flow ? flowSequenceDurationMs(flow, gap) : 0], [seq, seq ? sequenceDurationMs(seq) : 0]] as const) {
      const shown = visiblePossessionMs(clip, ms);
      ledger.us += shown.us;
      ledger.them += shown.them;
    }
    for (const [clip, ms, entry] of clips) {
      const uL = activeMatchLineupAtMinute(ctx.userLineup, ctx.userBench ?? [], ctx.substitutions ?? [], "us", clip.minute);
      const oL = activeMatchLineupAtMinute(ctx.opponentLineup, ctx.opponentBench ?? [], ctx.substitutions ?? [], "them", clip.minute);
      const user = { lineup: uL, basePositions: base(uL, true, ctx.userPlan.formation), ours: true, plan: ctx.userPlan };
      const opp = { lineup: oL, basePositions: base(oL, false, ctx.opponentPlan.formation), ours: false, plan: ctx.opponentPlan };
      const entryState = motionFrameForSequence({ sequence: null, actionIndex: 0, localProgress: 0, user, opponent: opp, entrySequences: entry });
      const cut = sequenceStartsWithReset(entryState, clip);
      const STEPS = 40;
      let last: ReturnType<typeof motionFrameForSequence> | null = null;
      for (let t = 0; t <= STEPS; t += 1) {
        const frame = frameForSequence(clip, Math.min(0.9999, t / STEPS));
        const motion = motionFrameForSequence({ sequence: clip, actionIndex: frame.actionIndex, localProgress: linearise(frame.localProgress), user, opponent: opp, entrySequences: entry });
        const action = frame.action;
        const holding = action.possessionSide ?? action.side;
        if (t === 0 && prevLast && !cut) {
          for (const [id, p] of motion.user) { const q = prevLast.user.get(id); if (q) { T.jump.n++; if (dist(p, q) > 8) T.jump.bad++; } }
          for (const [id, p] of motion.opponent) { const q = prevLast.opponent.get(id); if (q) { T.jump.n++; if (dist(p, q) > 8) T.jump.bad++; } }
        }
        if (t === 1 && clip.setPiece) {
          const att = clip.side === "us" ? motion.user : motion.opponent;
          const def = clip.side === "us" ? motion.opponent : motion.user;
          const goalX = frame.ball.x > 50 ? 100 : 0;
          const inArea = (m: Map<string, { x: number; y: number }>) => [...m.values()].filter((p) => Math.abs(p.x - goalX) <= 16 && p.y >= 20 && p.y <= 80).length;
          if (clip.setPiece === "corner") corners.push({ att: inArea(att), def: inArea(def) });
          if (clip.setPiece === "penalty") penalties.push({ outfield: inArea(att) + inArea(def) });
        }
        if (HOLD.has(action.kind) && action.playerId && frame.localProgress > 0.25) {
          const pos = (action.side === "us" ? motion.user : motion.opponent).get(action.playerId);
          if (pos) { T.holder.n++; if (dist(pos, frame.ball) > 3) T.holder.bad++; }
        }
        if (last) {
          const dt = ms / STEPS / 1000;
          for (const which of ["user", "opponent"] as const) for (const [id, p] of motion[which]) {
            const q = last[which].get(id);
            if (!q) continue;
            T.sprint.n++;
            if (dist(p, q) / dt > 9.5) T.sprint.bad++;
          }
        }
        for (const [which, map, lineup] of [["us", motion.user, uL], ["them", motion.opponent, oL]] as const) {
          for (const pl of lineup) { const p = map.get(pl.playerId); if (p && (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100)) T.offPitch++; }
          if (clip.setPiece) continue;
          const pts = lineup.filter((pl) => pl.role !== "GK").map((pl) => map.get(pl.playerId)).filter(Boolean) as { x: number; y: number }[];
          let close = false;
          for (let a = 0; a < pts.length && !close; a++) for (let b = a + 1; b < pts.length; b++) if (dist(pts[a], pts[b]) < 2.5) { close = true; break; }
          T.stacked.n++;
          if (close) T.stacked.bad++;
          if (which !== holding) {
            const backs = lineup.filter((pl) => BACKS.has(pl.role)).map((pl) => map.get(pl.playerId)).filter(Boolean) as { x: number }[];
            T.ahead.n++;
            if (backs.some((p) => (which === "us" ? p.x > frame.ball.x + 2 : p.x < frame.ball.x - 2))) T.ahead.bad++;
          }
        }
        last = motion;
      }
      prevLast = last;
    }
    prevSeq = seq ?? prevSeq;
  });
}

for (let m = 0; m < 6; m += 1) playMatch(m);
const rate = (t: { n: number; bad: number }) => t.bad / Math.max(1, t.n);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

console.log("\n[C1] The ball and the player agree");
check(`ball within 3 m of its holder (${pct(rate(T.holder))} of frames outside, limit ${pct(LIMITS.ballAwayFromHolder)})`, () => assert.ok(rate(T.holder) <= LIMITS.ballAwayFromHolder));

console.log("\n[C2] People move like people");
check(`moves above sprint speed ${pct(rate(T.sprint))} (limit ${pct(LIMITS.fasterThanSprint)})`, () => assert.ok(rate(T.sprint) <= LIMITS.fasterThanSprint));
check(`teammates stacked ${pct(rate(T.stacked))} of open-play frames (limit ${pct(LIMITS.teammatesStacked)})`, () => assert.ok(rate(T.stacked) <= LIMITS.teammatesStacked));
check("nobody leaves the pitch", () => assert.equal(T.offPitch, 0));

console.log("\n[C3] Team shape");
check(`back line ahead of the ball ${pct(rate(T.ahead))} of defending frames (limit ${pct(LIMITS.defendersAheadOfBall)})`, () => assert.ok(rate(T.ahead) <= LIMITS.defendersAheadOfBall));

console.log("\n[C4] Continuity");
check(`continuous clips join up: ${pct(rate(T.jump))} of players jump >8 m (limit ${pct(LIMITS.continuityJump)})`, () => assert.ok(rate(T.jump) <= LIMITS.continuityJump));

console.log("\n[C5] Set pieces");
check(`corners load the box (${corners.length} corners)`, () => {
  for (const c of corners) {
    assert.ok(c.att >= LIMITS.cornerAttackersInBox, `attackers in the area: ${c.att}`);
    assert.ok(c.def >= LIMITS.cornerDefendersInBox, `defenders in the area: ${c.def}`);
  }
});
check(`penalties clear the area (${penalties.length} penalties)`, () => {
  for (const p of penalties) assert.ok(p.outfield <= 2, `players in the area: ${p.outfield} (taker and keeper only)`);
});

console.log(`\nmatch-viewer-coherence: ${passed} passed`);
