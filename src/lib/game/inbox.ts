/* =========================================================================
   Inbox / Communication Framework
   -------------------------------------------------------------------------
   Every department in the club communicates with the player through here.

   Contract for a generator:

     1. Pure function of GameState. Never mutate state, never call
        Date.now(), Math.random() or crypto.randomUUID(). Use `seededRng`
        with (state.saveSeed, generatorId, subjectId, season, week) for
        any randomness that affects gameplay or persisted values.
     2. Emit InboxItems with a stable `eventKey`. runWeeklyGenerators
        drops duplicates so a generator can be called every week without
        having to remember whether it fired already.
     3. Follow-ups are scheduled via `scheduleGenerator` (payload
        optional). The follow-up generator receives the scheduled entries
        via its `run(state, dueEntries)` argument.
     4. Deadlines and cooldowns live on the absolute-week axis
        (`absoluteWeek(season, week)`). Do not compare week-of-season
        values across a season rollover.

   The engine runs runWeeklyGenerators() at the end of advanceWeek() so
   the player wakes up each Monday to a fresh Inbox.
========================================================================= */

import type {
  GameState,
  InboxItem,
  InboxChoice,
  InboxEffect,
  InboxDepartment,
  InboxCategory,
  InboxPriority,
  ScheduledGenerator,
  Sponsor,
  WeekLedger,
} from "./types";

import { absoluteWeek, fromAbsoluteWeek } from "./time";
import { hashString, seededRng } from "./rng";

/* ---------- Helpers ---------- */
const money = (n: number) => {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${s}£${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${s}£${(a / 1_000).toFixed(0)}k`;
  return `${s}£${a.toFixed(0)}`;
};

const sponsorId = (name: string) => name.replace(/\s+/g, "-").toLowerCase();

/* Every id derived from eventKey is stable across reloads. */
const idForEventKey = (eventKey: string) =>
  `inbox-${hashString(eventKey).toString(36)}`;

/* ---------- Registry validation ----------
 * Any scheduleGenerator effect must target a generator that is actually
 * registered below. We validate at effect-application time so bugs surface
 * loudly in dev instead of silently dropping a follow-up.
 */
const KNOWN_GENERATOR_IDS = new Set<string>();
export function assertGeneratorRegistered(id: string): void {
  if (KNOWN_GENERATOR_IDS.size === 0) return; // registry not populated yet
  if (!KNOWN_GENERATOR_IDS.has(id)) {
    const msg = `[inbox] scheduleGenerator references unknown generatorId "${id}"`;
    if (import.meta.env?.DEV) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn(msg);
  }
}

/* =========================================================================
   Effect processing
   -------------------------------------------------------------------------
   One working state, mutated in place by applyEffectInPlace, cloned exactly
   once at the entry point. Never Object.assign(s, applyEffects(s, ...)) —
   that swaps nested collections underneath any in-flight iteration.
========================================================================= */

export interface EffectSource {
  sourceItemId?: string;
  sourceEventKey?: string;
}

const EMPTY_LEDGER_ROW = (season: number, week: number, balance: number): WeekLedger => ({
  week,
  season,
  income: { gate: 0, tv: 0, sponsor: 0, merchandise: 0, prize: 0, transfers: 0, other: 0 },
  expenses: {
    playerWages: 0, staffWages: 0, stadiumOps: 0, trainingOps: 0,
    maintenance: 0, matchday: 0, transfers: 0, other: 0,
  },
  net: 0,
  balance,
  synthetic: true,
  inboxNotes: [],
});

/** Current-week ledger row, created (synthetic) if the week has none yet. */
function currentLedgerRow(s: GameState, openingBalance: number): WeekLedger {
  let row = s.ledger.find((l) => l.season === s.season && l.week === s.week);
  if (!row) {
    row = EMPTY_LEDGER_ROW(s.season, s.week, openingBalance);
    row.matchdayNote = "Off-cycle adjustments (inbox decisions)";
    s.ledger.push(row);

  }
  return row;
}

const sumValues = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Recompute net and closing balance so cash and ledger always agree. */
function rebalanceRow(row: WeekLedger, cash: number) {
  row.net = sumValues(row.income) - sumValues(row.expenses);
  row.balance = cash;
}

/** Book a cash movement into the current-week ledger row. */
function bookCash(
  s: GameState,
  e: Extract<InboxEffect, { kind: "cash" }>,
  src: EffectSource,
) {
  const opening = s.cash;
  s.cash = Math.round(s.cash + e.amount);
  const row = currentLedgerRow(s, opening);
  if (e.amount >= 0) {
    const bucket = e.incomeCategory ?? "other";
    row.income[bucket] += Math.round(e.amount);
  } else {
    const bucket = e.expenseCategory ?? "other";
    row.expenses[bucket] += Math.round(-e.amount);
  }
  if (e.note) {
    row.inboxNotes = row.inboxNotes ?? [];
    row.inboxNotes.push({
      note: e.note,
      amount: Math.round(e.amount),
      sourceItemId: src.sourceItemId,
      sourceEventKey: src.sourceEventKey,
    });
  }
  rebalanceRow(row, s.cash);
}

/** Applies ONE effect to the working state, in place. */
function applyEffectInPlace(s: GameState, e: InboxEffect, src: EffectSource): void {
  switch (e.kind) {
    case "cash":
      bookCash(s, e, src);
      break;
    case "fanHappiness":
      s.fanHappiness = Math.max(0, Math.min(100, s.fanHappiness + e.delta));
      break;
    case "reputation":
      s.reputation = Math.max(1, Math.min(100, s.reputation + e.delta));
      break;
    case "pitch":
      s.pitchCondition = Math.max(20, Math.min(100, s.pitchCondition + e.delta));
      break;
    case "standCondition": {
      const st = s.stands.find((x) => x.key === e.standKey);
      if (st) st.condition = Math.max(20, Math.min(100, st.condition + e.delta));
      break;
    }
    case "sponsorExtend": {
      const sp = s.sponsors.find((x: Sponsor) => x.name === e.sponsorName);
      if (sp) {
        sp.weeksLeft += e.addWeeks;
        if (e.newWeekly != null) sp.weekly = e.newWeekly;
      }
      break;
    }
    case "flag":
      s.inboxFlags[e.key] = e.value;
      break;
    case "scheduleGenerator": {
      assertGeneratorRegistered(e.generatorId);
      const dueAbs = absoluteWeek(s.season, s.week) + e.inWeeks;
      const derived = fromAbsoluteWeek(dueAbs);
      s.scheduledGenerators.push({
        generatorId: e.generatorId,
        dueAtAbsoluteWeek: dueAbs,
        dueWeek: derived.week,
        dueSeason: derived.season,
        payload: e.payload,
      });
      break;
    }
  }
}

/**
 * Applies effects to an ALREADY-CLONED working state, in place.
 * Internal callers that own the clone should use this.
 */
export function applyEffectsInPlace(
  working: GameState,
  effects: InboxEffect[],
  src: EffectSource = {},
): void {
  for (const e of effects) applyEffectInPlace(working, e, src);
}

/** Clone once, apply sequentially, return the final state. */
export function applyEffects(
  state: GameState,
  effects: InboxEffect[],
  src: EffectSource = {},
): GameState {
  const s = structuredClone(state);
  applyEffectsInPlace(s, effects, src);
  return s;
}

/* =========================================================================
   Choice availability
   -------------------------------------------------------------------------
   There is no debt, overdraft or financing in this game, so a choice the
   club cannot pay for must be unavailable rather than pushing cash negative.
========================================================================= */

export interface ChoiceAvailability {
  available: boolean;
  reasons: string[];
  /** Net cash the choice costs (positive = money out). */
  cashRequired: number;
}

/** Net cash outflow implied by a choice's own effects. */
export function choiceCashCost(choice: InboxChoice): number {
  const net = choice.effects.reduce(
    (a, e) => (e.kind === "cash" ? a + e.amount : a),
    0,
  );
  return net < 0 ? -net : 0;
}

export function evaluateChoice(s: GameState, choice: InboxChoice): ChoiceAvailability {
  const reasons: string[] = [];
  const inferred = choiceCashCost(choice);
  let cashRequired = inferred;

  for (const r of choice.requirements ?? []) {
    switch (r.kind) {
      case "cash":
        cashRequired = Math.max(cashRequired, r.amount);
        break;
      case "fanHappiness":
        if (r.min != null && s.fanHappiness < r.min)
          reasons.push(`Needs fan happiness ${r.min}+ (currently ${s.fanHappiness}).`);
        if (r.max != null && s.fanHappiness > r.max)
          reasons.push(`Only while fan happiness is ${r.max} or below.`);
        break;
      case "reputation":
        if (r.min != null && s.reputation < r.min)
          reasons.push(`Needs club reputation ${r.min}+ (currently ${s.reputation}).`);
        if (r.max != null && s.reputation > r.max)
          reasons.push(`Only while reputation is ${r.max} or below.`);
        break;
      case "flag": {
        const v = s.inboxFlags[r.key];
        const ok = r.equals === undefined ? Boolean(v) : v === r.equals;
        if (!ok) reasons.push(`Unavailable — prerequisite not met.`);
        break;
      }
      case "staffRole":
        if (!s.hiredStaff.some((x) => x.role === r.role))
          reasons.push(`Requires a ${r.role} on the staff.`);
        break;
    }
  }

  if (cashRequired > 0 && s.cash < cashRequired) {
    reasons.push(
      `Not enough cash — needs ${money(cashRequired)}, club holds ${money(s.cash)}. ` +
        `The club has no overdraft facility.`,
    );
  }

  return { available: reasons.length === 0, reasons, cashRequired };
}

/* ---------- Player actions ---------- */
export function markInboxRead(s: GameState, id: string): GameState {
  const ns = structuredClone(s);
  const it = ns.inbox.find((i) => i.id === id);
  if (it && it.status === "unread") it.status = it.choices ? "awaitingDecision" : "read";
  return ns;
}

export function handleInboxChoice(s: GameState, itemId: string, choiceId: string): GameState {
  const item = s.inbox.find((i) => i.id === itemId);
  if (!item || !item.choices) return s;
  // Exactly-once: a resolved or expired item can never be re-applied, no
  // matter how many times the UI (or a reload) replays the action.
  if (item.status === "completed" || item.status === "expired") return s;
  if (item.chosenChoiceId) return s;
  const choice = item.choices.find((c) => c.id === choiceId);
  if (!choice) return s;
  if (!evaluateChoice(s, choice).available) return s;

  const ns = structuredClone(s);
  const target = ns.inbox.find((i) => i.id === itemId)!;
  applyEffectsInPlace(ns, choice.effects, {
    sourceItemId: item.id,
    sourceEventKey: item.eventKey,
  });
  target.status = "completed";
  target.chosenChoiceId = choiceId;
  target.resolvedAtAbsoluteWeek = absoluteWeek(ns.season, ns.week);
  return ns;
}


export function dismissInboxItem(s: GameState, id: string): GameState {
  const ns = structuredClone(s);
  const it = ns.inbox.find((i) => i.id === id);
  if (it && it.status !== "awaitingDecision") it.status = "read";
  return ns;
}

export function clearReadInbox(s: GameState): GameState {
  const ns = structuredClone(s);
  ns.inbox = ns.inbox.filter(
    (i) => i.status === "unread" || i.status === "awaitingDecision",
  );
  return ns;
}

export const unreadCount = (s: GameState) =>
  s.inbox.filter((i) => i.status === "unread" || i.status === "awaitingDecision").length;

/* =========================================================================
   Generators
========================================================================= */

interface Generator {
  id: string;
  /**
   * @param state       current game state (already ticked to the new week)
   * @param dueEntries  scheduled entries whose dueAtAbsoluteWeek has arrived
   *                    and whose generatorId matches this generator.
   */
  run: (state: GameState, dueEntries: ScheduledGenerator[]) => InboxItem[];
}

type InboxItemDraft = Omit<
  InboxItem,
  "id" | "generatorId" | "week" | "season" | "status" | "expiresWeek"
> & {
  status?: InboxItem["status"];
  /** Optional deadline in weeks-from-now. Converted to absolute at emit time. */
  expiresInWeeks?: number;
};

function mk(s: GameState, generatorId: string, draft: InboxItemDraft): InboxItem {
  let expiresAtAbsoluteWeek = draft.expiresAtAbsoluteWeek;
  if (expiresAtAbsoluteWeek == null && draft.expiresInWeeks != null) {
    expiresAtAbsoluteWeek = absoluteWeek(s.season, s.week) + draft.expiresInWeeks;
  }
  const expiresWeek =
    expiresAtAbsoluteWeek != null ? fromAbsoluteWeek(expiresAtAbsoluteWeek).week : undefined;
  const { expiresInWeeks: _drop, ...rest } = draft;
  void _drop;
  return {
    id: idForEventKey(draft.eventKey),
    generatorId,
    week: s.week,
    season: s.season,
    status: "unread",
    ...rest,
    expiresAtAbsoluteWeek,
    expiresWeek,
  };
}

/* -- 1. Welcome from the Board -- */
const G_WELCOME: Generator = {
  id: "board-welcome",
  run: (s) => {
    if (s.inboxFlags["welcomed"]) return [];
    return [
      mk(s, "board-welcome", {
        eventKey: "board-welcome",
        sender: "Bill Roberts",
        department: "Board of Directors",
        category: "board",
        priority: "normal",
        subject: `Welcome to ${s.clubName}`,
        body:
          `Welcome aboard. As chairman you'll receive every report, decision ` +
          `and opportunity through this inbox — from finance, the manager, ` +
          `groundskeeping, sponsors, the league, all of it.\n\n` +
          `We expect a mid-table finish this season. Keep the books healthy ` +
          `and the fans on side and we'll leave you to it.`,
        choices: [
          {
            id: "ack",
            label: "Understood",
            hint: "Acknowledge and set to work.",
            effects: [{ kind: "flag", key: "welcomed", value: true }],
          },
        ],
      }),
    ];
  },
};

/* -- 2. Weekly Finance report (from the previous week's ledger) --
 * Uses the absolute-week axis so the season-1 → season-2 rollover still
 * finds the previous week's ledger row.
 */
const G_FINANCE_WEEKLY: Generator = {
  id: "finance-weekly",
  run: (s) => {
    const prevAbs = absoluteWeek(s.season, s.week) - 1;
    if (prevAbs < 1) return [];
    const prev = fromAbsoluteWeek(prevAbs);
    const row = s.ledger.find((l) => l.season === prev.season && l.week === prev.week);
    if (!row) return [];
    const inc = Object.values(row.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(row.expenses).reduce((a, b) => a + b, 0);
    const tone: InboxPriority = row.net < -50_000 ? "high" : "low";
    return [
      mk(s, "finance-weekly", {
        eventKey: `finance-weekly:s${prev.season}:w${prev.week}`,
        sender: "Margaret Doyle",
        department: "Finance",
        category: "financial",
        priority: tone,
        subject: `Week ${prev.week} P&L — net ${money(row.net)}`,
        body:
          `Income:  ${money(inc)}\n` +
          `  Gate .......... ${money(row.income.gate)}\n` +
          `  TV ............ ${money(row.income.tv)}\n` +
          `  Sponsor ....... ${money(row.income.sponsor)}\n` +
          `  Prize ......... ${money(row.income.prize)}\n` +
          `  Transfers ..... ${money(row.income.transfers)}\n` +
          `  Other ......... ${money(row.income.other)}\n\n` +
          `Outgoings: ${money(exp)}\n` +
          `  Player wages .. ${money(row.expenses.playerWages)}\n` +
          `  Staff wages ... ${money(row.expenses.staffWages)}\n` +
          `  Stadium ops ... ${money(row.expenses.stadiumOps)}\n` +
          `  Training ...... ${money(row.expenses.trainingOps)}\n` +
          `  Maintenance ... ${money(row.expenses.maintenance)}\n` +
          `  Matchday ...... ${money(row.expenses.matchday)}\n` +
          `  Transfers ..... ${money(row.expenses.transfers)}\n\n` +
          `Closing balance: ${money(row.balance)}` +
          (row.matchdayNote ? `\n\nNote: ${row.matchdayNote}` : ""),
      }),
    ];
  },
};

/* -- 3. Groundskeeper: South Stand roof (decision, pre-season W3) -- */
const G_ROOF: Generator = {
  id: "grounds-south-roof",
  run: (s) => {
    if (s.inboxFlags["roofHandled"]) return [];
    if (!(s.week === 3 && s.season === 1)) return [];
    return [
      mk(s, "grounds-south-roof", {
        eventKey: "grounds-south-roof:s1",
        sender: "Eddie Kerr",
        department: "Groundskeeper",
        category: "facilities",
        priority: "high",
        subject: "South Stand roof needs attention",
        body:
          `Sections of the South Stand roof are corroding. If we don't act ` +
          `before autumn storms, we're looking at leaks over ~800 seats and ` +
          `an emergency closure at worst.\n\n` +
          `Full repair now: £120k. Cosmetic patch: £40k. Leave it: your call.`,
        expiresInWeeks: 5,
        consequenceOnExpire: [
          { kind: "flag", key: "roofHandled", value: "ignored" },
          { kind: "standCondition", standKey: "S", delta: -12 },
          { kind: "fanHappiness", delta: -3 },
        ],
        choices: [
          {
            id: "repair",
            label: "Full repair — £120k",
            hint: "-£120k now, +10 South condition, fans notice.",
            effects: [
              { kind: "cash", amount: -120_000 },
              { kind: "standCondition", standKey: "S", delta: 10 },
              { kind: "fanHappiness", delta: 2 },
              { kind: "flag", key: "roofHandled", value: "repaired" },
            ],
          },
          {
            id: "patch",
            label: "Cosmetic patch — £40k",
            hint: "-£40k, +3 condition. Eddie will be back about this.",
            effects: [
              { kind: "cash", amount: -40_000 },
              { kind: "standCondition", standKey: "S", delta: 3 },
              { kind: "flag", key: "roofHandled", value: "patched" },
              { kind: "scheduleGenerator", generatorId: "grounds-south-roof-followup", inWeeks: 20 },
            ],
          },
          {
            id: "ignore",
            label: "Leave it for now",
            hint: "Free today, -12 condition and unhappy fans if it fails.",
            effects: [
              { kind: "flag", key: "roofHandled", value: "ignored" },
              { kind: "standCondition", standKey: "S", delta: -12 },
              { kind: "fanHappiness", delta: -3 },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 3b. Roof follow-up if patched (scheduled from the patch choice) -- */
const G_ROOF_FOLLOWUP: Generator = {
  id: "grounds-south-roof-followup",
  run: (s, due) => {
    if (due.length === 0) return [];
    return [
      mk(s, "grounds-south-roof-followup", {
        eventKey: `grounds-south-roof-followup:s${s.season}:w${s.week}`,
        sender: "Eddie Kerr",
        department: "Groundskeeper",
        category: "facilities",
        priority: "normal",
        subject: "South Stand roof — patch is failing",
        body:
          `Told you it wouldn't hold. The patch is peeling and we've got ` +
          `staining above rows K–M. Proper repair now would still be £110k.`,
        choices: [
          {
            id: "repair-now",
            label: "Do the proper repair — £110k",
            hint: "-£110k, +8 South condition.",
            effects: [
              { kind: "cash", amount: -110_000 },
              { kind: "standCondition", standKey: "S", delta: 8 },
            ],
          },
          {
            id: "leave",
            label: "Live with it",
            hint: "-6 condition, small fan-happiness hit.",
            effects: [
              { kind: "standCondition", standKey: "S", delta: -6 },
              { kind: "fanHappiness", delta: -2 },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 4. Fan Liaison warning when happiness drops --
 * Cooldown is stored on the absolute-week axis so end-of-season rollover
 * doesn't spuriously re-trigger the warning.
 */
const G_FAN_WARN: Generator = {
  id: "fans-happiness-warning",
  run: (s) => {
    const cooldownKey = "fansWarnedAtAbsoluteWeek";
    const nowAbs = absoluteWeek(s.season, s.week);
    const last = Number(s.inboxFlags[cooldownKey] ?? 0);
    if (s.fanHappiness >= 45) return [];
    if (nowAbs - last < 8) return [];
    // The cooldown flag is only written when the player picks a choice, so an
    // ignored warning would otherwise re-emit every week under a new eventKey.
    // Suppress while an earlier warning is still awaiting the chairman.
    if (
      s.inbox.some(
        (i) =>
          i.generatorId === "fans-happiness-warning" &&
          (i.status === "unread" || i.status === "awaitingDecision"),
      )
    )
      return [];

    return [
      mk(s, "fans-happiness-warning", {
        eventKey: `fans-happiness-warning:abs${nowAbs}`,
        sender: "Priya Bhatt",
        department: "Fan Liaison",
        category: "warning",
        priority: "high",
        subject: `Supporters' Trust unhappy (${s.fanHappiness}/100)`,
        body:
          `Season-ticket holders are furious. Complaints centre on pricing, ` +
          `matchday atmosphere and the direction the club is heading. ` +
          `A goodwill gesture would go a long way; doing nothing risks a ` +
          `boycott.`,
        choices: [
          {
            id: "gesture",
            label: "Free travel & pie voucher — £25k",
            hint: "-£25k, +8 fan happiness.",
            effects: [
              { kind: "cash", amount: -25_000 },
              { kind: "fanHappiness", delta: 8 },
              { kind: "flag", key: cooldownKey, value: nowAbs },
            ],
          },
          {
            id: "statement",
            label: "Issue a statement",
            hint: "+2 happiness, no cost, unconvincing.",
            effects: [
              { kind: "fanHappiness", delta: 2 },
              { kind: "flag", key: cooldownKey, value: nowAbs },
            ],
          },
          {
            id: "ignore",
            label: "Ignore",
            hint: "-3 happiness, -1 reputation.",
            effects: [
              { kind: "fanHappiness", delta: -3 },
              { kind: "reputation", delta: -1 },
              { kind: "flag", key: cooldownKey, value: nowAbs },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 5. Sponsor renewal opportunity when a sponsor is nearly out --
 * Deterministic uplift and bonus (seeded rng), stable eventKey per
 * (sponsor, season). Once emitted, the eventKey dedup in the runner
 * prevents duplicates in any state — the offer stays pending as long
 * as the item is unread/awaiting/expired for that (sponsor, season).
 */
const G_SPONSOR_RENEW: Generator = {
  id: "commercial-sponsor-renewal",
  run: (s) => {
    const items: InboxItem[] = [];
    for (const sp of s.sponsors) {
      if (sp.weeksLeft <= 0 || sp.weeksLeft > 6) continue;
      const eventKey = `commercial-sponsor-renewal:${sponsorId(sp.name)}:s${s.season}`;
      const rng = seededRng(s.saveSeed, "commercial-sponsor-renewal", sp.name, s.season);
      const uplift = Math.round(sp.weekly * (0.95 + rng() * 0.25));
      const bonus = Math.round(sp.weekly * 8);
      items.push(
        mk(s, "commercial-sponsor-renewal", {
          eventKey,
          sender: "Sam Iyer",
          department: "Commercial",
          category: "opportunity",
          priority: "normal",
          subject: `Renewal offer — ${sp.name}`,
          body:
            `${sp.name} are ready to extend. Their proposal: ${money(uplift)}/week ` +
            `for 2 seasons, plus a ${money(bonus)} signing bonus.\n\n` +
            `We can push for more — they may walk.`,
          reward: `+${money(bonus)} now, +${money(uplift)}/wk`,
          expiresInWeeks: 4,
          consequenceOnExpire: [
            { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "expired" },
          ],
          choices: [
            {
              id: "accept",
              label: `Accept — ${money(bonus)} + ${money(uplift)}/wk`,
              effects: [
                { kind: "cash", amount: bonus, note: "Sponsor bonus" },
                { kind: "sponsorExtend", sponsorName: sp.name, addWeeks: 76, newWeekly: uplift },
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "accepted" },
              ],
            },
            {
              id: "push",
              label: "Push for +15% (risk)",
              hint: "50/50: better deal, or they walk.",
              effects: [
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "pushed" },
                {
                  kind: "scheduleGenerator",
                  generatorId: "commercial-sponsor-pushback",
                  inWeeks: 1,
                  payload: { sponsorName: sp.name, currentWeekly: sp.weekly, offered: uplift },
                },
              ],
            },
            {
              id: "decline",
              label: "Decline",
              hint: "Sponsor lapses when weeks run out.",
              effects: [
                { kind: "flag", key: `sponsorOffered-${sp.name}-s${s.season}`, value: "declined" },
              ],
            },
          ],
        }),
      );
    }
    return items;
  },
};

/* -- 5b. Sponsor pushback follow-up --
 * Deterministic outcome from (saveSeed, sponsorName, season). Head of
 * Transfers negotiation nudges the odds. Two outcomes:
 *   - success: sponsor accepts +15%; player may accept or reject.
 *   - failure: sponsor withdraws; the original terms are gone too.
 */
const G_SPONSOR_PUSHBACK: Generator = {
  id: "commercial-sponsor-pushback",
  run: (s, due) => {
    const items: InboxItem[] = [];
    for (const entry of due) {
      const p = entry.payload ?? {};
      const sponsorName = String(p.sponsorName ?? "");
      const offered = Number(p.offered ?? 0);
      if (!sponsorName || offered <= 0) continue;

      const hot = s.hiredStaff.find((x) => x.role === "Head of Transfers");
      const negotiation = hot?.stats.negotiation ?? 40;
      // Deterministic 0..1 draw seeded from stable inputs.
      const rng = seededRng(s.saveSeed, "commercial-sponsor-pushback", sponsorName, s.season);
      const draw = rng();
      // 50% baseline + up to +30% swing from negotiator quality.
      const successThreshold = 0.5 + Math.min(0.3, (negotiation - 40) / 200);
      const success = draw < successThreshold;

      const eventKey = `commercial-sponsor-pushback:${sponsorId(sponsorName)}:s${s.season}`;

      if (success) {
        const bumped = Math.round(offered * 1.15);
        const bonus = Math.round(bumped * 8);
        items.push(
          mk(s, "commercial-sponsor-pushback", {
            eventKey,
            sender: "Sam Iyer",
            department: "Commercial",
            category: "opportunity",
            priority: "high",
            subject: `${sponsorName} blinked — improved offer`,
            body:
              `They came back with the +15%. New terms: ${money(bumped)}/week ` +
              `for 2 seasons plus a ${money(bonus)} signing bonus. Your call.`,
            reward: `+${money(bonus)} now, +${money(bumped)}/wk`,
            expiresInWeeks: 3,
            consequenceOnExpire: [
              { kind: "flag", key: `sponsorPushback-${sponsorName}-s${s.season}`, value: "lapsed" },
            ],
            choices: [
              {
                id: "accept",
                label: `Accept improved — ${money(bonus)} + ${money(bumped)}/wk`,
                effects: [
                  { kind: "cash", amount: bonus, note: "Sponsor bonus (improved)" },
                  { kind: "sponsorExtend", sponsorName, addWeeks: 76, newWeekly: bumped },
                  { kind: "flag", key: `sponsorPushback-${sponsorName}-s${s.season}`, value: "accepted" },
                ],
              },
              {
                id: "reject",
                label: "Reject — walk away",
                hint: "No deal. Sponsor lapses when weeks run out.",
                effects: [
                  { kind: "flag", key: `sponsorPushback-${sponsorName}-s${s.season}`, value: "rejected" },
                ],
              },
            ],
          }),
        );
      } else {
        items.push(
          mk(s, "commercial-sponsor-pushback", {
            eventKey,
            sender: "Sam Iyer",
            department: "Commercial",
            category: "warning",
            priority: "normal",
            subject: `${sponsorName} walked away`,
            body:
              `They wouldn't budge. When we pushed for +15% they pulled the ` +
              `original offer off the table entirely. The contract will now ` +
              `lapse at the end of its current term.`,
            choices: [
              {
                id: "ack",
                label: "Noted",
                effects: [
                  { kind: "flag", key: `sponsorPushback-${sponsorName}-s${s.season}`, value: "withdrawn" },
                ],
              },
            ],
          }),
        );
      }
    }
    return items;
  },
};

/* -- 6. Post-match media reaction -- */
const G_MEDIA_MATCH: Generator = {
  id: "media-post-match",
  run: (s) => {
    const prevAbs = absoluteWeek(s.season, s.week) - 1;
    if (prevAbs < 1) return [];
    const prev = fromAbsoluteWeek(prevAbs);
    // FixtureResult carries no season field. Cross-season leakage is prevented
    // by the engine clearing `s.results` at the season rollover, NOT by any
    // lookup-side check here. If results ever become season-persistent, this
    // find() must be given an explicit season filter.

    const r = s.results.find((x) => x.week === prev.week);
    if (!r) return [];
    const eventKey = `media-post-match:s${prev.season}:w${prev.week}`;
    const label = r.result === "W" ? "Ecstatic" : r.result === "D" ? "Measured" : "Damning";
    const body =
      r.result === "W"
        ? `Comfortable ${r.goalsFor}-${r.goalsAgainst} ${r.home ? "home" : "away"} win vs ${r.opponent}. Back-page splash: "Chairman's model working".`
        : r.result === "D"
        ? `${r.goalsFor}-${r.goalsAgainst} draw with ${r.opponent}. Pundits split — solid point or two dropped?`
        : `Poor ${r.goalsFor}-${r.goalsAgainst} defeat to ${r.opponent}. Local paper calls for "clarity from the boardroom".`;
    return [
      mk(s, "media-post-match", {
        eventKey,
        sender: "Chronicle sport desk",
        department: "Media",
        category: "media",
        priority: "low",
        subject: `${label} press after ${r.opponent} (${r.result})`,
        body,
        choices: [
          {
            id: "noted",
            label: "Read and file",
            effects: [
              { kind: "flag", key: `mediaShown-s${prev.season}-w${prev.week}`, value: true },
            ],
          },
        ],
      }),
    ];
  },
};

/* ---------- Registry ---------- */
const GENERATORS: Generator[] = [
  G_WELCOME,
  G_FINANCE_WEEKLY,
  G_ROOF,
  G_ROOF_FOLLOWUP,
  G_FAN_WARN,
  G_SPONSOR_RENEW,
  G_SPONSOR_PUSHBACK,
  G_MEDIA_MATCH,
];
for (const g of GENERATORS) KNOWN_GENERATOR_IDS.add(g.id);

export function isKnownGeneratorId(id: string): boolean {
  return KNOWN_GENERATOR_IDS.has(id);
}

/* ---------- Weekly runner ----------
 * - Expires any past-deadline items (absolute-week comparison).
 * - Runs every generator; passes each the scheduled entries whose
 *   dueAtAbsoluteWeek has arrived and whose generatorId matches.
 * - Deduplicates by eventKey across ALL existing inbox items so a
 *   pending/awaiting/completed/expired event can't be re-emitted.
 */
export function runWeeklyGenerators(prev: GameState): GameState {
  const s = structuredClone(prev);
  const nowAbs = absoluteWeek(s.season, s.week);

  // 1. Expire timed-out items on the absolute axis.
  for (const it of s.inbox) {
    const deadline = it.expiresAtAbsoluteWeek;
    if (
      deadline != null &&
      it.status !== "completed" &&
      it.status !== "expired" &&
      nowAbs > deadline
    ) {
      it.status = "expired";
      if (it.consequenceOnExpire) {
        Object.assign(s, applyEffects(s, it.consequenceOnExpire));
      }
    }
  }

  // 2. Pull scheduled entries that are due now, grouped by generatorId.
  //    Entries with a missing/NaN due time are treated as due immediately
  //    rather than being stranded in the queue forever.
  const dueByGenerator = new Map<string, ScheduledGenerator[]>();
  s.scheduledGenerators = s.scheduledGenerators.filter((g) => {
    const dueAbs = g.dueAtAbsoluteWeek;
    const due = !Number.isFinite(dueAbs) || (dueAbs as number) <= nowAbs;
    if (due) {
      const arr = dueByGenerator.get(g.generatorId) ?? [];
      arr.push(g);
      dueByGenerator.set(g.generatorId, arr);
    }
    return !due;
  });

  // 3. Build a fast lookup of existing eventKeys so we never emit duplicates.
  const existingKeys = new Set(s.inbox.map((i) => i.eventKey));

  // 4. Run every generator; dedup on eventKey before appending.
  const consumed = new Set<string>();
  for (const g of GENERATORS) {
    const due = dueByGenerator.get(g.id) ?? [];
    if (due.length) consumed.add(g.id);
    const items = g.run(s, due);
    for (const it of items) {
      if (existingKeys.has(it.eventKey)) continue;
      existingKeys.add(it.eventKey);
      s.inbox.push(it);
    }
  }

  // 4b. A due entry pointing at an unregistered generator would vanish
  //     silently. Surface it loudly instead of losing the follow-up.
  for (const id of dueByGenerator.keys()) {
    if (!consumed.has(id)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[inbox] dropped ${dueByGenerator.get(id)!.length} scheduled entr(y/ies) for unregistered generatorId "${id}"`,
      );
    }
  }


  // 5. Cap history to keep localStorage sane.
  if (s.inbox.length > 200) {
    const keep: InboxItem[] = [];
    const others: InboxItem[] = [];
    for (const it of s.inbox) {
      if (it.status === "unread" || it.status === "awaitingDecision") keep.push(it);
      else others.push(it);
    }
    s.inbox = [...keep, ...others.slice(-150)];
  }

  return s;
}

/* ---------- Display metadata (used by the UI) ---------- */
export const CATEGORY_META: Record<InboxCategory, { label: string; color: string }> = {
  information: { label: "Info", color: "bg-slate-500" },
  decision: { label: "Decision", color: "bg-amber-500" },
  warning: { label: "Warning", color: "bg-rose-500" },
  opportunity: { label: "Opportunity", color: "bg-emerald-500" },
  financial: { label: "Financial", color: "bg-sky-500" },
  staff: { label: "Staff", color: "bg-indigo-500" },
  facilities: { label: "Facilities", color: "bg-orange-500" },
  transfers: { label: "Transfers", color: "bg-violet-500" },
  board: { label: "Board", color: "bg-teal-600" },
  fans: { label: "Fans", color: "bg-pink-500" },
  league: { label: "League", color: "bg-cyan-600" },
  media: { label: "Media", color: "bg-fuchsia-500" },
};

export const PRIORITY_META: Record<InboxPriority, { label: string; className: string }> = {
  low:    { label: "Low",    className: "text-muted-foreground" },
  normal: { label: "Normal", className: "text-foreground" },
  high:   { label: "High",   className: "text-amber-600 font-medium" },
  urgent: { label: "Urgent", className: "text-rose-600 font-semibold" },
};

export const DEPARTMENTS_ALL: InboxDepartment[] = [
  "Board of Directors", "Manager", "Director of Football", "Finance",
  "Commercial", "Head Scout", "Medical", "Groundskeeper",
  "Fan Liaison", "Sponsors", "League", "Media", "Club",
];
