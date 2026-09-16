import { strict as assert } from "node:assert";
import { sellingClubAcceptsFee, type SellingClubBargainingPosition } from "../clubTransferNegotiation";

const position: SellingClubBargainingPosition = {
  reservationFee: 90_000,
  statedFee: 105_000,
  counterFee: 98_000,
  patience: 2,
};

assert.equal(sellingClubAcceptsFee(position.counterFee, position), true, "meeting an explicit club counter must be accepted");
assert.equal(sellingClubAcceptsFee(position.reservationFee, position), true, "the hidden reservation fee must settle the deal");
assert.equal(sellingClubAcceptsFee(position.reservationFee - 1, position), false, "offers below the reservation fee remain negotiable");
assert.ok(position.counterFee >= position.reservationFee, "a club counter cannot cross its hidden floor");
assert.ok(position.counterFee <= position.statedFee, "a club counter must not exceed its opening position");

console.log("\nclub-transfer-negotiation: passed");
