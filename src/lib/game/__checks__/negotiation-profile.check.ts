import { strict as assert } from "node:assert";
import { counterPosition, negotiationProfile, statedAsk } from "../negotiationProfile";

const seed = "negotiation-profile-check";
const first = negotiationProfile(seed, "agent-1");
const repeat = negotiationProfile(seed, "agent-1");
assert.deepEqual(repeat, first, "negotiator temperament must be deterministic");
assert.ok(first.openingHeadroom >= 0, "opening position cannot sit below the hidden reservation value");
assert.ok(first.concessionRate > 0 && first.concessionRate < 1, "concessions must move toward the reservation value");
assert.ok(first.patience >= 2, "a negotiator must allow genuine bargaining room");

const reservation = 1_000;
const opening = statedAsk(reservation, first);
assert.ok(opening >= reservation, "stated ask must preserve the hidden acceptable floor");
const counter1 = counterPosition(reservation, opening, first, 1);
const counter2 = counterPosition(reservation, opening, first, 2);
assert.ok(counter1 >= reservation && counter1 <= opening, "first counter must remain between ask and hidden floor");
assert.ok(counter2 >= reservation && counter2 <= counter1, "later counters must concede without crossing the hidden floor");

const profiles = Array.from({ length: 64 }, (_, index) => negotiationProfile(seed, `negotiator-${index}`).temperament);
assert.ok(new Set(profiles).size >= 3, "the deterministic population must produce meaningfully different negotiators");

console.log("\nnegotiation-profile: passed");
