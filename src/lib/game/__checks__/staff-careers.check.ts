import { advanceWeek, makeStaff, newGame } from "../engine";
import { reconcile } from "../finance";
import { hashString, mulberry32 } from "../rng";
import { renewStaffContract, runStaffCareerRollover } from "../staffCareers";
import { managerJoinTerms } from "../staff";

let passed = 0;
let failed = 0;
function check(label: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

const clone = <T>(x: T): T => structuredClone(x);
const seededStaff = (role: Parameters<typeof makeStaff>[0], quality = 70, seed: string = role) =>
  makeStaff(role, quality, mulberry32(hashString(`staff-check|${seed}`)));

console.log("\n[A] Annual career progression");
{
  const s = newGame("Staff FC", "Chair", "STAFF-CAREER-A");
  const coach = seededStaff("Head Coach", 72, "young");
  coach.age = 32;
  coach.contractWeeks = 120;
  s.hiredStaff = [coach];
  const before = clone(s);
  runStaffCareerRollover(s);
  check("A1. hired staff age exactly one year", s.hiredStaff[0]?.age === 33);
  check(
    "A2. contract weeks are not double-decremented at rollover",
    s.hiredStaff[0]?.contractWeeks === 120,
  );
  check(
    "A3. annual development stays bounded",
    Math.abs((s.hiredStaff[0]?.rating ?? 0) - coach.rating) <= 3,
  );

  const replay = clone(before);
  runStaffCareerRollover(replay);
  check(
    "A4. career rollover is deterministic",
    JSON.stringify(s.hiredStaff) === JSON.stringify(replay.hiredStaff),
  );
  check(
    "A5. new-season staff market is deterministic",
    JSON.stringify(s.staffCandidates) === JSON.stringify(replay.staffCandidates),
  );
}

console.log("\n[B] Retirement");
{
  const s = newGame("Staff FC", "Chair", "STAFF-CAREER-B");
  const manager = seededStaff("Manager", 78, "old-manager");
  manager.age = 68;
  manager.contractWeeks = 100;
  s.hiredStaff = [manager];
  runStaffCareerRollover(s);
  check("B1. age-69 staff retire with certainty", !s.hiredStaff.some((st) => st.id === manager.id));
  check(
    "B2. retirement creates one club message",
    s.inbox.filter((i) => i.eventKey.startsWith(`staff-retirement:${manager.id}:`)).length === 1,
  );
  check(
    "B3. retiring manager leaves the manager role vacant",
    !s.hiredStaff.some((st) => st.role === "Manager"),
  );
}

console.log("\n[C] Contract warning and expiry");
{
  const warning = newGame("Staff FC", "Chair", "STAFF-CAREER-C1");
  const scout = seededStaff("Chief Scout", 68, "warning");
  scout.contractWeeks = 13;
  warning.hiredStaff = [scout];
  const afterWarning = advanceWeek(warning);
  check("C1. weekly clock reaches 12 weeks", afterWarning.hiredStaff[0]?.contractWeeks === 12);
  check(
    "C2. 12-week warning is emitted",
    afterWarning.inbox.some((i) => i.eventKey.startsWith(`staff-contract-warning:${scout.id}:`)),
  );

  const expiry = newGame("Staff FC", "Chair", "STAFF-CAREER-C2");
  const manager = seededStaff("Manager", 74, "expiry");
  manager.contractWeeks = 1;
  expiry.hiredStaff = [manager];
  const afterExpiry = advanceWeek(expiry);
  check(
    "C3. zero-week contracts leave the payroll",
    !afterExpiry.hiredStaff.some((st) => st.id === manager.id),
  );
  check(
    "C4. expired manager leaves a genuine vacancy",
    !afterExpiry.hiredStaff.some((st) => st.role === "Manager"),
  );
  check(
    "C5. expiry is communicated",
    afterExpiry.inbox.some((i) => i.eventKey.startsWith(`staff-contract-expired:${manager.id}:`)),
  );
}

console.log("\n[D] Renewal");
{
  const s = newGame("Staff FC", "Chair", "STAFF-CAREER-D");
  const physio = seededStaff("Head Physio", 71, "renew");
  physio.contractWeeks = 10;
  s.hiredStaff = [physio];
  const cashBefore = s.cash;
  const ledgerBefore = s.financeLedger.length;
  const res = renewStaffContract(s, physio.id, 2);
  check("D1. renewal succeeds for employed staff", res.ok);
  check("D2. two-season renewal adds 104 weeks", res.state.hiredStaff[0]?.contractWeeks === 114);
  check(
    "D3. renewal bonus is exactly two weekly wages",
    cashBefore - res.state.cash === physio.wage * 2,
  );
  check(
    "D4. renewal posts exactly one finance entry",
    res.state.financeLedger.length === ledgerBefore + 1,
  );
  check("D5. renewed books reconcile", reconcile(res.state).ok);

  const repeat = renewStaffContract(res.state, physio.id, 2);
  check("D6. same-week replay cannot double-charge", repeat.state.cash === res.state.cash);
}

console.log("\n[E] Market continuity");
{
  const a = newGame("Staff FC", "Chair", "STAFF-CAREER-E");
  const b = newGame("Staff FC", "Chair", "STAFF-CAREER-E");
  for (let i = 0; i < 5; i++) {
    Object.assign(a, advanceWeek(a));
    Object.assign(b, advanceWeek(b));
  }
  check(
    "E1. rolling staff market stays deterministic",
    JSON.stringify(a.staffCandidates) === JSON.stringify(b.staffCandidates),
  );
  check(
    "E2. market always contains managers",
    a.staffCandidates.some((st) => st.role === "Manager"),
  );
  check(
    "E3. manager market spans multiple candidates",
    a.staffCandidates.filter((st) => st.role === "Manager").length >= 5,
  );
}

console.log("\n[F] Manager leverage packages");
{
  const s = newGame("Staff FC", "Chair", "STAFF-CAREER-F");
  s.reputation = 30;
  s.cash = 500_000;

  const attainable = seededStaff("Manager", 70, "attainable");
  attainable.reputation = 47;
  attainable.wage = 8_000;
  const attainableTerms = managerJoinTerms(s, attainable);
  check(
    "F1. attainable step-up manager no longer demands a giant wage multiplier",
    attainableTerms.willing && attainableTerms.premiumPct <= 0.4,
    JSON.stringify(attainableTerms),
  );
  check(
    "F2. stronger manager leverage is shifted into security and signing package",
    attainableTerms.contractWeeks >= 104 && attainableTerms.signingBonus >= attainableTerms.wageDemand * 4,
    JSON.stringify(attainableTerms),
  );

  const elite = seededStaff("Manager", 90, "elite");
  elite.reputation = 90;
  elite.wage = 25_000;
  const eliteTerms = managerJoinTerms(s, elite);
  check(
    "F3. manager far above the club refuses regardless of money",
    !eliteTerms.willing && eliteTerms.leverage === "unavailable",
    JSON.stringify(eliteTerms),
  );
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) process.exit(1);
