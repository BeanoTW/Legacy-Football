/* Runtime verification for supporter ticket-price pressure.
   Run with: bun src/lib/game/__checks__/ticket-price-pressure.check.ts
*/
import { newGame } from "../engine";
import { handleInboxChoice, runWeeklyGenerators } from "../inbox";
import { avgTicketPrice } from "../sim";
import { ticketPriceReference } from "../ticketForecast";
import { newsFeed } from "../newsFeed";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? " — " + extra : ""}`);
  }
}

console.log("\n[TP1] High pricing creates supporter pressure");
{
  let state = newGame("Price Town", "Chairman Test");
  state.inbox = [];
  state.scheduledGenerators = [];
  state.week = 10;
  state.stands = state.stands.map((stand) => ({ ...stand, ticketPrice: 100 }));

  const ref = ticketPriceReference(state);
  const beforePrice = avgTicketPrice(state);
  check("fixture starts clearly above market", beforePrice / ref > 1.25, `${beforePrice}/${ref}`);

  state = runWeeklyGenerators(state);
  const pressure = state.inbox.find((item) => item.generatorId === "fans-ticket-price-pressure");
  check("supporter price challenge is emitted", !!pressure);
  check("challenge is actionable", pressure?.status === "awaitingDecision" && pressure.choices?.length === 3);
  check("subject exposes premium vs level", pressure?.subject.includes("vs level") === true);

  if (pressure) {
    const fansBefore = state.fanHappiness;
    state = handleInboxChoice(state, pressure.id, "cut");
    const afterPrice = avgTicketPrice(state);
    check("10% cut actually reduces canonical stand prices", afterPrice < beforePrice, `${beforePrice} -> ${afterPrice}`);
    check("cut improves supporter happiness", state.fanHappiness > fansBefore);

    const article = newsFeed(state).find((item) => item.id.startsWith("ticket-pressure|"));
    check("resolved pricing dispute becomes Newsroom story", !!article);
    check("news story records chairman response", article?.standfirst.includes("Cut all ticket prices") === true);

    const again = runWeeklyGenerators(state);
    const activePriceItems = again.inbox.filter(
      (item) => item.generatorId === "fans-ticket-price-pressure" && item.status === "awaitingDecision",
    );
    check("cooldown prevents immediate repeat pressure", activePriceItems.length === 0);
  }
}

console.log("\n[TP2] Normal pricing does not create false controversy");
{
  let state = newGame("Fair Price Town", "Chairman Test");
  state.inbox = [];
  state.scheduledGenerators = [];
  state.week = 10;
  const reference = ticketPriceReference(state);
  state.stands = state.stands.map((stand) => ({ ...stand, ticketPrice: Math.max(5, Math.round(reference)) }));
  state = runWeeklyGenerators(state);
  check(
    "near-reference prices create no ticket pressure",
    !state.inbox.some((item) => item.generatorId === "fans-ticket-price-pressure"),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
