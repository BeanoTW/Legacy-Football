import { ENGLISH_COMPETITIONS, PLAYABLE_FOOTBALL_LEVELS, validateFootballWorld } from "../footballWorld.ts";

const errors = validateFootballWorld();
if (errors.length) throw new Error(errors.join("\n"));

for (let level = 1; level <= PLAYABLE_FOOTBALL_LEVELS; level++) {
  if (!ENGLISH_COMPETITIONS.some((competition) => competition.level === level)) {
    throw new Error(`Missing English football level ${level}`);
  }
}

console.log(`✓ canonical English football graph: ${ENGLISH_COMPETITIONS.length} competitions across ${PLAYABLE_FOOTBALL_LEVELS} levels`);
