import { strict as assert } from "node:assert";
import type { GameState, Staff } from "../types";
import type { JoinTerms, ManagerOffer } from "../staff";
import {
  evaluateManagerBargainingOffer,
  managerCounterPosition,
  managerOfferMeetsReservation,
  managerOpeningPosition,
  managerReservationPackage,
  meetsManagerPosition,
} from "../managerNegotiation";

const state = { saveSeed: "manager-negotiation-check" } as GameState;
const manager = {
  id: "ST-MANAGER-CHECK",
  role: "Manager",
  name: "T. Manager",
} as Staff;
const terms: JoinTerms = {
  willing: true,
  wageDemand: 1_000,
  signingBonus: 4_000,
  premiumPct: 0.1,
  contractWeeks: 104,
  leverage: "incentivised",
  note: "Open to talks",
  packageNotes: [],
};

const reservation = managerReservationPackage(terms);
const opening = managerOpeningPosition(state, manager, terms);

assert.ok(opening.wage >= reservation.wage, "opening wage must not undercut the hidden reservation wage");
assert.ok(opening.signingBonus >= reservation.signingBonus, "opening bonus must not undercut the hidden reservation bonus");
assert.ok(opening.contractWeeks >= reservation.contractWeeks, "opening security must not undercut the hidden reservation term");

const exactOpening = evaluateManagerBargainingOffer(state, manager, terms, opening, opening, 1);
assert.equal(exactOpening.outcome, "accepted", "meeting an explicit manager/agent position must always be accepted");

const compromise: ManagerOffer = {
  wage: reservation.wage,
  signingBonus: reservation.signingBonus,
  contractWeeks: reservation.contractWeeks,
};
assert.equal(managerOfferMeetsReservation(compromise, terms), true, "the hidden reservation package must settle the deal");
assert.equal(
  evaluateManagerBargainingOffer(state, manager, terms, compromise, opening, 1).outcome,
  "accepted",
  "a valid compromise below the public ask must be accepted",
);

const seriousButLow: ManagerOffer = {
  wage: Math.round(reservation.wage * 0.9),
  signingBonus: Math.round(reservation.signingBonus * 0.75),
  contractWeeks: reservation.contractWeeks,
};
const counterResult = evaluateManagerBargainingOffer(state, manager, terms, seriousButLow, opening, 1);
assert.equal(counterResult.outcome, "counter", "a serious sub-reservation offer should produce a genuine counter");
assert.ok(counterResult.counterOffer, "counter outcome must expose the agent's explicit counter");
if (counterResult.counterOffer) {
  assert.ok(meetsManagerPosition(counterResult.counterOffer, counterResult.counterOffer), "an explicit counter must be self-acceptable");
  assert.ok(counterResult.counterOffer.wage >= reservation.wage, "counter wage cannot cross the hidden floor");
  assert.ok(counterResult.counterOffer.signingBonus >= reservation.signingBonus, "counter bonus cannot cross the hidden floor");
  assert.ok(counterResult.counterOffer.wage <= opening.wage, "counter wage must concede from the opening position");
  assert.ok(counterResult.counterOffer.signingBonus <= opening.signingBonus, "counter bonus must concede from the opening position");
}

const laterCounter = managerCounterPosition(state, manager, terms, opening, 2);
assert.ok(laterCounter.wage >= reservation.wage && laterCounter.wage <= opening.wage, "later wage counter stays between floor and opening ask");
assert.ok(laterCounter.signingBonus >= reservation.signingBonus && laterCounter.signingBonus <= opening.signingBonus, "later bonus counter stays between floor and opening ask");

const insult: ManagerOffer = {
  wage: Math.round(reservation.wage * 0.5),
  signingBonus: 0,
  contractWeeks: 52,
};
assert.equal(
  evaluateManagerBargainingOffer(state, manager, terms, insult, opening, 1).outcome,
  "rejected",
  "an insulting package must not enter an endless counter loop",
);

console.log("\nmanager-negotiation: passed");
