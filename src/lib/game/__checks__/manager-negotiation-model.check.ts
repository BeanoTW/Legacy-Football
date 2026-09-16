import { strict as assert } from "node:assert";
import type { GameState, Staff } from "../types";
import type { JoinTerms } from "../staff";
import {
  managerCounterPosition,
  managerOfferMeetsReservation,
  managerOpeningPosition,
  managerReservationPackage,
  meetsManagerPosition,
} from "../managerNegotiation";

const state = { saveSeed: "manager-negotiation-check" } as GameState;
const manager = { id: "ST-check-manager", role: "Manager" } as Staff;
const terms: JoinTerms = {
  willing: true,
  wageDemand: 1_000,
  signingBonus: 4_000,
  premiumPct: 0,
  contractWeeks: 156,
  leverage: "high",
  note: "check",
  packageNotes: [],
};

const reservation = managerReservationPackage(terms);
const opening = managerOpeningPosition(state, manager, terms);
assert.ok(opening.wage >= reservation.wage, "agent opening wage must leave bargaining room");
assert.ok(opening.signingBonus >= reservation.signingBonus, "agent opening bonus must leave bargaining room");
assert.equal(opening.contractWeeks % 52, 0, "manager contracts must be whole seasons");
assert.ok(meetsManagerPosition(opening, opening), "matching the stated position must always satisfy it");
assert.ok(managerOfferMeetsReservation(reservation, terms), "hidden reservation package must sign");

const counter1 = managerCounterPosition(state, manager, terms, opening, 1);
const counter2 = managerCounterPosition(state, manager, terms, counter1, 2);
assert.ok(counter1.wage <= opening.wage && counter1.wage >= reservation.wage, "first counter must concede toward the hidden wage floor");
assert.ok(counter2.wage <= counter1.wage && counter2.wage >= reservation.wage, "later counter must keep conceding without crossing the floor");
assert.ok(meetsManagerPosition(counter1, counter1), "matching a generated counter must be acceptable");

// A chairman can negotiate below the public ask while still constructing an
// acceptable total package by compensating with another component.
const bargained = { wage: reservation.wage * 0.9, signingBonus: reservation.signingBonus * 1.4, contractWeeks: reservation.contractWeeks };
assert.ok(managerOfferMeetsReservation(bargained, terms), "package trade-offs should permit a deal below the public wage ask");

console.log("\nmanager-negotiation-model: passed");
