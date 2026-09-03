import { strict as assert } from "node:assert";
import { newGame } from "../newGame";
import { accumulateClubLegacySeasonInPlace, clubLegacyRecord } from "../clubLegacy";
import { isOpaqueClubId } from "../clubIdentity";
import type { LeagueRow, TransferRecord } from "../types";

const state = newGame("Legacy Audit FC", "History Auditor", "CLUB_LEGACY_AUDIT");
const league = state.leagues[0];
if (!league) throw new Error("league missing");

function tableFor(order: string[]): LeagueRow[] {
  return order.map((team, index) => ({
    team,
    p: 38,
    w: Math.max(0, 24 - index),
    d: 6,
    l: Math.max(0, 8 + index),
    gf: Math.max(20, 70 - index * 2),
    ga: 30 + index * 2,
    pts: Math.max(1, 78 - index * 3),
  }));
}

const order = [...league.clubIds];
const champion = order[0];
const buyer = order[1];
const seller = order[2];
const relegated = order[order.length - 1];
if (!champion || !buyer || !seller || !relegated) throw new Error("club fixture missing");

const homeFixture = state.fixtures.find((fixture) => fixture.home);
if (!homeFixture) throw new Error("home fixture missing");
state.results = [
  {
    week: homeFixture.week,
    opponent: homeFixture.opponent,
    home: true,
    goalsFor: 2,
    goalsAgainst: 0,
    attendance: 4321,
    gateReceipts: 0,
    tvIncome: 0,
    result: "W",
  },
];

const firstTransfer: TransferRecord = {
  id: "legacy-transfer-1",
  playerId: "legacy-player-1",
  playerName: "Record Player",
  position: "MID",
  fromClubId: seller,
  toClubId: buyer,
  fee: 250_000,
  weeklyWage: 1_000,
  signingBonus: 5_000,
  season: 1,
  week: 12,
  absoluteWeek: 12,
  type: "transfer",
};
state.football!.transferHistory.push(firstTransfer);

const seasonOne = [
  {
    leagueId: league.id,
    tier: league.tier,
    table: tableFor(order),
    champion,
    promoted: [champion],
    relegated: [relegated],
  },
];

accumulateClubLegacySeasonInPlace(state, seasonOne, 1);
assert.ok(state.clubLegacy);
assert.deepEqual(state.clubLegacy.processedSeasons, [1]);
assert.ok(Object.keys(state.clubLegacy.clubsById).every(isOpaqueClubId));

const championRecord = clubLegacyRecord(state, champion)!;
assert.equal(championRecord.leagueTitles, 1);
assert.equal(championRecord.promotions, 1);
assert.equal(championRecord.bestLeagueFinish?.position, 1);
assert.equal(championRecord.bestLeagueFinish?.tier, league.tier);
assert.equal(championRecord.cupHonours, undefined, "unknown cup history must not be invented");

const relegatedRecord = clubLegacyRecord(state, relegated)!;
assert.equal(relegatedRecord.relegations, 1);

const buyerRecord = clubLegacyRecord(state, buyer)!;
const sellerRecord = clubLegacyRecord(state, seller)!;
assert.equal(buyerRecord.recordTransferPaid?.fee, 250_000);
assert.equal(sellerRecord.recordTransferReceived?.fee, 250_000);
assert.equal(clubLegacyRecord(state, state.clubName)?.recordAttendance?.attendance, 4321);

const once = JSON.stringify(state.clubLegacy);
accumulateClubLegacySeasonInPlace(state, seasonOne, 1);
assert.equal(JSON.stringify(state.clubLegacy), once, "same season accumulation must be idempotent");

// A later season may improve records but must never erase the better facts.
const secondOrder = [buyer, champion, ...order.filter((club) => club !== buyer && club !== champion)];
state.results = [
  {
    week: homeFixture.week,
    opponent: homeFixture.opponent,
    home: true,
    goalsFor: 1,
    goalsAgainst: 0,
    attendance: 4000,
    gateReceipts: 0,
    tvIncome: 0,
    result: "W",
  },
];
state.football!.transferHistory.push({
  ...firstTransfer,
  id: "legacy-transfer-2",
  playerId: "legacy-player-2",
  fee: 400_000,
  season: 2,
  week: 8,
  absoluteWeek: 54,
});
accumulateClubLegacySeasonInPlace(
  state,
  [
    {
      leagueId: league.id,
      tier: league.tier,
      table: tableFor(secondOrder),
      champion: buyer,
      promoted: [],
      relegated: [],
    },
  ],
  2,
);

assert.deepEqual(state.clubLegacy?.processedSeasons, [1, 2]);
assert.equal(clubLegacyRecord(state, champion)?.bestLeagueFinish?.position, 1);
assert.equal(clubLegacyRecord(state, buyer)?.leagueTitles, 1);
assert.equal(clubLegacyRecord(state, buyer)?.recordTransferPaid?.fee, 400_000);
assert.equal(
  clubLegacyRecord(state, state.clubName)?.recordAttendance?.attendance,
  4321,
  "a lower later crowd must not overwrite the attendance record",
);

console.log("\nclub-legacy: passed");
