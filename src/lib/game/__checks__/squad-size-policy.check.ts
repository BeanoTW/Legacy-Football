import { newGame } from "../engine";
import {
  MAX_SQUAD_SIZE,
  MIN_SQUAD_SIZE,
  SQUAD_SIZE,
  SQUAD_TEMPLATE,
  userSquad,
} from "../recruitmentLegacy";
import { FRINGE_SQUAD_SIZE, previewFringePlayersForClub } from "../fringePlayers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log("  ✓ " + message);
}

console.log("\n[SQUAD-SIZE-POLICY] Deeper club rosters");

assert(SQUAD_SIZE === 30, "detailed clubs open with 30 players");
assert(FRINGE_SQUAD_SIZE === 30, "compact clubs also carry 30 persistent players");
assert(MAX_SQUAD_SIZE === 36, "registration cap allows squads up to 36");
assert(MIN_SQUAD_SIZE === 22, "loan-out safety floor prevents extreme squad depletion");
assert(
  SQUAD_TEMPLATE.GK === 3 &&
    SQUAD_TEMPLATE.DEF === 10 &&
    SQUAD_TEMPLATE.MID === 10 &&
    SQUAD_TEMPLATE.FWD === 7,
  "opening positional mix totals 30 with three goalkeepers",
);

const state = newGame("Squad Depth FC", "Tester", "SQUAD-SIZE-POLICY");
assert(userSquad(state).length === 30, "the user's fresh career actually starts with 30 registered players");

const fringeClubId = Object.keys(state.fringeWorld ?? {}).find((clubId) => {
  const entry = state.fringeWorld?.[clubId];
  return entry && !state.football.players.some((player) => player.currentClubId === clubId);
});
if (fringeClubId) {
  assert(
    previewFringePlayersForClub(state, fringeClubId).length === 30,
    "a compact non-focus club also previews a 30-player squad",
  );
}

console.log("\n7 passed, 0 failed");
