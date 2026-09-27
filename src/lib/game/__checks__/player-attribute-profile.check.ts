import { strict as assert } from "node:assert";
import { playerAttributes, PLAYER_ATTRIBUTE_GROUPS } from "../scouting";
import { tacticalPositionProfile } from "../positions";
import type { FootballPlayer, Position, TacticalPosition } from "../types";

function playerFor(position: TacticalPosition, unit: Position, seed: string): FootballPlayer {
  for (let i = 0; i < 5000; i += 1) {
    const player = {
      id: `attr-${seed}-${i}`,
      primaryPosition: unit,
      currentAbility: 55,
    } as FootballPlayer;
    if (tacticalPositionProfile(player).primary === position) return player;
  }
  throw new Error(`Unable to generate deterministic ${position} profile`);
}

const cb = playerAttributes(playerFor("CB", "DEF", "cb"));
assert.ok(cb.tackling > cb.finishing, "centre-backs should be materially stronger tacklers than finishers");
assert.ok(cb.positioning > cb.dribbling, "centre-backs should favour positioning over dribbling");

const wingBack = playerAttributes(playerFor("LWB", "DEF", "lwb"));
assert.ok(wingBack.crossing > cb.crossing, "wing-backs should cross better than centre-backs");
assert.ok(wingBack.stamina > cb.stamina, "wing-backs should carry a stronger stamina profile");

const cdm = playerAttributes(playerFor("CDM", "MID", "cdm"));
assert.ok(cdm.tackling > cdm.finishing, "holding midfielders should favour defensive work over finishing");
assert.ok(cdm.positioning > cdm.finishing, "holding midfielders should carry strong positioning");

const cam = playerAttributes(playerFor("CAM", "MID", "cam"));
assert.ok(cam.vision > cam.tackling, "attacking midfielders should favour vision over tackling");
assert.ok(cam.firstTouch > cam.tackling, "attacking midfielders should favour first touch over tackling");

const winger = playerAttributes(playerFor("RW", "FWD", "rw"));
assert.ok(winger.dribbling > winger.tackling, "wingers should favour dribbling over tackling");
assert.ok(winger.acceleration > winger.tackling, "wingers should favour acceleration over tackling");

const striker = playerAttributes(playerFor("ST", "FWD", "st"));
assert.ok(striker.finishing > striker.tackling, "strikers should favour finishing over tackling");
assert.ok(striker.composure > striker.tackling, "strikers should favour composure over tackling");

const keeper = playerAttributes(playerFor("GK", "GK", "gk"));
assert.ok(keeper.goalkeeping > keeper.finishing, "goalkeepers should be defined by goalkeeping rather than finishing");

const categories = Object.values(PLAYER_ATTRIBUTE_GROUPS).flat();
assert.equal(new Set(categories).size, categories.length, "every attribute should belong to exactly one category");
assert.equal(categories.length, Object.keys(cb).length, "attribute categories should cover the complete player profile");

const cmA = playerAttributes(playerFor("CM", "MID", "cm-a"));
const cmB = playerAttributes(playerFor("CM", "MID", "cm-b"));
assert.notDeepEqual(cmA, cmB, "equal-OVR players should retain distinct deterministic attribute identities");

console.log("\nplayer-attribute-profile: passed");
