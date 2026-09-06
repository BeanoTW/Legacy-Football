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
  FinanceCategory,
  CommercialOffer,
  TransferNegotiation,
} from "./types";
import { isUserClubReference } from "./clubReference";
import { transferTargetPlayer } from "./recruitmentTargetBridge";

import {
  MAX_NEGOTIATION_ROUNDS,
  SEASON_WEEKS,
  acceptOfferInPlace,
  counterOfferInPlace,
  offerById,
  rejectOfferInPlace,
  relationshipLabel,
  sponsorById,
  sponsorName,
  weeksRemaining,
} from "./commercial";

import {
  RENEWAL_WINDOW_WEEKS,
  activeContract,
  ageOf,
  beginTransferRegistrationInPlace,
  completeTransferInPlace,
  improvePlayerTermsInPlace,
  negotiationById,
  playerById,
  playerName,
  releasePlayerInPlace,
  renewContractInPlace,
  renewalTerms,
  respondToIncomingOfferInPlace,
  syncLegacySquad,
  transferRegistrationReadiness,
  userSquad,
  weeksLeftOnContract,
  withdrawNegotiationInPlace,
} from "./recruitment";

import {
  activeProjects as infraActiveProjects,
  approveProjectInPlace,
  assetById as infraAssetById,
  assets as infraAssets,
  cancelProjectInPlace,
  closeAssetInPlace,
  conditionBand,
  projectCapacity,
  projectCatalogue,
  reopenAssetInPlace,
  setMaintenancePolicyInPlace,
} from "./infrastructure";
import { absoluteWeek, fromAbsoluteWeek } from "./time";
import { evaluateObjective, confidenceBand, BAND_LABEL, directorConcern } from "./board";
import {
  RESERVE_REPORT_WEEKS,
  capacityPicture,
  createCommitmentInPlace,
  financialHealth,
  needs as sustainabilityNeeds,
  openCommitments,
  reinvestmentPressure,
  reservePicture,
  tierShock,
} from "./sustainability";
import { hashString, seededRng } from "./rng";
import { postEntry } from "./finance";
import { archivedInboxGuardKeys } from "./archive";

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
const idForEventKey = (eventKey: string) => `inbox-${hashString(eventKey).toString(36)}`;

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

/** Legacy bucket → finance category, so inbox money is a real ledger entry. */
const INCOME_CATEGORY: Record<string, FinanceCategory> = {
  gate: "Matchday",
  tv: "Matchday",
  sponsor: "Commercial",
  merchandise: "Commercial",
  prize: "Prize Money",
  transfers: "Transfers",
  other: "Miscellaneous",
};
const EXPENSE_CATEGORY: Record<string, FinanceCategory> = {
  playerWages: "Wages",
  staffWages: "Staff",
  stadiumOps: "Operations",
  trainingOps: "Facilities",
  maintenance: "Facilities",
  matchday: "Matchday",
  transfers: "Transfers",
  other: "Miscellaneous",
};

/**
 * Book a cash movement from an inbox effect.
 * Goes through postEntry() — the single cash mutator — so the finance ledger
 * stays the source of truth and GameState.ledger remains a projection.
 */
function bookCash(s: GameState, e: Extract<InboxEffect, { kind: "cash" }>, src: EffectSource) {
  const amount = Math.round(e.amount);
  if (amount === 0) return;
  const income = amount > 0;
  const bucket = income ? (e.incomeCategory ?? "other") : (e.expenseCategory ?? "other");
  const hadRow = (s.ledger ?? []).some((l) => l.season === s.season && l.week === s.week);

  postEntry(s, {
    category: income
      ? (INCOME_CATEGORY[bucket] ?? "Miscellaneous")
      : (EXPENSE_CATEGORY[bucket] ?? "Miscellaneous"),
    subcategory: bucket,
    description: e.note ?? "Inbox decision",
    amount: Math.abs(amount),
    direction: income ? "income" : "expense",
    sourceSystem: "inbox",
    linkedEntityId: src.sourceItemId,
    metadata: {
      legacyBucket: bucket,
      ...(src.sourceEventKey ? { eventKey: src.sourceEventKey } : {}),
    },
  });

  const row = s.ledger.find((l) => l.season === s.season && l.week === s.week);
  if (!row) return;
  if (!hadRow) {
    row.synthetic = true;
    row.matchdayNote = row.matchdayNote ?? "Off-cycle adjustments (inbox decisions)";
  }
  if (e.note) {
    row.inboxNotes = row.inboxNotes ?? [];
    row.inboxNotes.push({
      note: e.note,
      amount,
      sourceItemId: src.sourceItemId,
      sourceEventKey: src.sourceEventKey,
    });
  }
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
    case "commercialAccept":
      acceptOfferInPlace(s, e.offerId);
      break;
    case "commercialReject":
      rejectOfferInPlace(s, e.offerId);
      break;
    case "commercialCounter": {
      const res = counterOfferInPlace(s, e.offerId, e.counter);
      if (res.ok) {
        // Surface the answer immediately rather than waiting for the next week.
        const offer = offerById(s, e.offerId);
        const item = offer ? counterOutcomeItem(s, offer) : null;
        if (item && !s.inbox.some((i) => i.eventKey === item.eventKey)) s.inbox.push(item);
      }
      break;
    }

    /* -- Recruitment: every mutation delegates to recruitment.ts -- */
    case "recruitmentAcceptOffer":
      respondToIncomingOfferInPlace(s, e.negotiationId, "accept");
      syncLegacySquad(s);
      break;
    case "recruitmentRejectOffer":
      respondToIncomingOfferInPlace(s, e.negotiationId, "reject");
      syncLegacySquad(s);
      break;
    case "recruitmentCounterOffer":
      respondToIncomingOfferInPlace(s, e.negotiationId, "counter", e.fee);
      syncLegacySquad(s);
      break;
    case "recruitmentWithdraw":
      withdrawNegotiationInPlace(s, e.negotiationId);
      syncLegacySquad(s);
      break;
    case "recruitmentAcceptPlayerTerms": {
      const n = negotiationById(s, e.negotiationId);
      improvePlayerTermsInPlace(s, e.negotiationId, n?.playerCounterWage);
      syncLegacySquad(s);
      break;
    }
    case "recruitmentImproveTerms":
      improvePlayerTermsInPlace(s, e.negotiationId);
      syncLegacySquad(s);
      break;
    case "recruitmentBeginRegistration":
      beginTransferRegistrationInPlace(s, e.negotiationId);
      syncLegacySquad(s);
      break;
    case "recruitmentCompleteTransfer": {
      const negotiation = negotiationById(s, e.negotiationId);
      // Compatibility for Inbox items persisted before the registration stage
      // existed: the old "complete signing" effect now advances an agreed
      // incoming deal into registration rather than becoming a dead action.
      if (negotiation?.direction === "in" && negotiation.stage === "agreed") {
        beginTransferRegistrationInPlace(s, e.negotiationId);
      } else {
        completeTransferInPlace(s, e.negotiationId);
      }
      syncLegacySquad(s);
      break;
    }
    case "recruitmentRenewContract": {
      const base = renewalTerms(s, e.playerId);
      if (base) {
        renewContractInPlace(s, e.playerId, {
          seasons: e.seasons ?? base.seasons,
          weeklyWage:
            e.upliftPct != null
              ? Math.round((base.weeklyWage * (1 + e.upliftPct / 100)) / 25) * 25
              : base.weeklyWage,
        });
        syncLegacySquad(s);
      }
      break;
    }
    case "recruitmentReleasePlayer":
      releasePlayerInPlace(s, e.playerId);
      syncLegacySquad(s);
      break;

    /* ---- Facilities: the Inbox only ever calls canonical infrastructure
       functions. It never writes assets, projects, cash or history itself. ---- */
    case "infraApproveProject":
      approveProjectInPlace(s, e.assetId, e.projectType);
      break;

    case "infraCancelProject":
      cancelProjectInPlace(s, e.projectId);
      break;

    case "infraSetMaintenancePolicy":
      setMaintenancePolicyInPlace(s, e.policy);
      break;

    case "infraCloseAsset":
      closeAssetInPlace(s, e.assetId);
      break;

    case "infraReopenAsset":
      reopenAssetInPlace(s, e.assetId);
      break;

    /* -- Sustainability: records a promise to the Board. Creating a
       commitment never moves, reserves or refunds cash; fulfilment is
       measured later from the canonical ledger, never from the UI. -- */
    case "strategicCommitment":
      createCommitmentInPlace(s, e.category, e.weeks, e.targetInvestment ?? 0, e.note);
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
  const net = choice.effects.reduce((a, e) => (e.kind === "cash" ? a + e.amount : a), 0);
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
export function requiresInboxDecision(item: InboxItem): boolean {
  // Older saves gave routine post-match press reports a single fake
  // "Read and file" choice. They are information, not board decisions.
  return item.status === "awaitingDecision" && item.generatorId !== "media-post-match";
}

export function markInboxRead(s: GameState, id: string): GameState {
  const ns = structuredClone(s);
  const it = ns.inbox.find((i) => i.id === id);
  if (it && (it.status === "unread" || (it.status === "awaitingDecision" && !requiresInboxDecision(it)))) {
    it.status = it.choices && it.generatorId !== "media-post-match" ? "awaitingDecision" : "read";
  }
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

export function deleteInboxItem(s: GameState, id: string): GameState {
  const item = s.inbox.find((i) => i.id === id);
  if (!item || requiresInboxDecision(item)) return s;
  const ns = structuredClone(s);
  ns.inbox = ns.inbox.filter((i) => i.id !== id);
  return ns;
}

export function clearReadInbox(s: GameState): GameState {
  const ns = structuredClone(s);
  ns.inbox = ns.inbox.filter((i) => i.status === "unread" || i.status === "awaitingDecision");
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
    // Actionable messages must enter the queue immediately. Waiting until the
    // user opens one hides the decision count and makes Continue appear broken.
    status: draft.status ?? (draft.choices?.length ? "awaitingDecision" : "unread"),
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
              {
                kind: "scheduleGenerator",
                generatorId: "grounds-south-roof-followup",
                inWeeks: 20,
              },
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
                  {
                    kind: "flag",
                    key: `sponsorPushback-${sponsorName}-s${s.season}`,
                    value: "accepted",
                  },
                ],
              },
              {
                id: "reject",
                label: "Reject — walk away",
                hint: "No deal. Sponsor lapses when weeks run out.",
                effects: [
                  {
                    kind: "flag",
                    key: `sponsorPushback-${sponsorName}-s${s.season}`,
                    value: "rejected",
                  },
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
                  {
                    kind: "flag",
                    key: `sponsorPushback-${sponsorName}-s${s.season}`,
                    value: "withdrawn",
                  },
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
      }),
    ];
  },
};

/* -- 9. Board: seasonal objectives handed down at the start of the season -- */
const G_BOARD_OBJECTIVES: Generator = {
  id: "board-objectives",
  run: (s) => {
    const board = s.board;
    if (!board || board.objectivesSeason !== s.season || board.objectives.length === 0) return [];
    if (s.week > 6) return [];
    const chair = board.directors.find((d) => d.role === "Chairman") ?? board.directors[0];
    if (!chair) return [];
    const lines = board.objectives.map((o) => `• ${o.label}\n   ${o.description}`).join("\n\n");
    return [
      mk(s, "board-objectives", {
        eventKey: `board-objectives:s${s.season}`,
        sender: chair.name,
        department: "Board of Directors",
        category: "board",
        priority: "high",
        subject: `Season ${s.season} objectives from the board`,
        body:
          `The board met this week and agreed the objectives you will be ` +
          `measured against this season.\n\n${lines}\n\n` +
          `We review at the midway point and again at the end of the season. ` +
          `Each director weighs these differently — you will not please all of us ` +
          `at once, so choose what you protect.`,
        choices: [
          {
            id: "accept",
            label: "Accept the objectives",
            hint: "Take the board's targets as they stand.",
            effects: [{ kind: "flag", key: `boardObjectivesSeen-s${s.season}`, value: true }],
          },
          {
            id: "push-back",
            label: "Push back on the targets",
            hint: "Argue the projection is unfair. Risks goodwill now for slack later.",
            effects: [
              { kind: "flag", key: `boardObjectivesSeen-s${s.season}`, value: true },
              { kind: "flag", key: `boardPushback-s${s.season}`, value: true },
              { kind: "reputation", delta: -1 },
            ],
          },
        ],
      }),
    ];
  },
};

/* -- 10. Board: review outcomes (mid-season and end-of-season) -- */
const G_BOARD_REVIEW: Generator = {
  id: "board-review",
  run: (s) => {
    const board = s.board;
    if (!board?.reviews?.length) return [];
    const items: InboxItem[] = [];
    // Only the most recent few reviews are worth surfacing; dedup by eventKey
    // means an already-emitted review is never re-sent.
    for (const r of board.reviews.slice(-3)) {
      const chair = board.directors.find((d) => d.role === "Chairman") ?? board.directors[0];
      const band = confidenceBand(r.confidenceAfter);
      const met = r.outcomes.filter((o) => o.met).length;
      const heading =
        r.type === "midSeason"
          ? `Mid-season review — season ${r.season}`
          : `End of season review — season ${r.season}`;
      const body =
        `${r.verdict}\n\n` +
        `Board confidence: ${r.confidenceBefore}% → ${r.confidenceAfter}% (${BAND_LABEL[band]}).\n` +
        `Objectives ${r.type === "midSeason" ? "on track" : "met"}: ${met} of ${r.outcomes.length}.\n\n` +
        `Around the table:\n` +
        r.lines.map((l) => `• ${l}`).join("\n");
      items.push(
        mk(s, "board-review", {
          eventKey: `board-review:${r.id}`,
          sender: chair?.name ?? "The Board",
          department: "Board of Directors",
          category: "board",
          priority: r.confidenceAfter < 45 ? "urgent" : "high",
          subject: heading,
          body,
          choices: [
            {
              id: "note",
              label: "Note the board's position",
              effects: [{ kind: "flag", key: `boardReviewSeen-${r.id}`, value: true }],
            },
          ],
        }),
      );
    }
    return items;
  },
};

/* -- 11. Board: individual director pressure when confidence is low -- */
const G_BOARD_PRESSURE: Generator = {
  id: "board-pressure",
  run: (s) => {
    const board = s.board;
    if (!board?.directors?.length) return [];
    const nowAbs = absoluteWeek(s.season, s.week);
    const last = Number(s.inboxFlags["boardPressureAtAbsoluteWeek"] ?? 0);
    if (nowAbs - last < 8) return [];
    // The angriest influential director speaks up.
    const sorted = [...board.directors].sort(
      (a, b) => a.confidence - b.confidence || b.influence - a.influence,
    );
    const d = sorted[0];
    if (!d || d.confidence >= 40) return [];
    const concern = directorConcern(s, d);
    if (!concern) return [];
    const p = evaluateObjective(s, concern.objective);
    return [
      mk(s, "board-pressure", {
        eventKey: `board-pressure:${d.id}:s${s.season}:w${s.week}`,
        sender: d.name,
        department: "Board of Directors",
        category: "warning",
        priority: "urgent",
        subject: `${d.role} — concerns over ${concern.objective.priority}`,
        body:
          `I'll be blunt. My confidence in the direction of this club sits at ` +
          `${d.confidence}%.\n\n` +
          `${concern.objective.label}. ${p.detail}.\n\n` +
          `I want to see movement on this before the next review, or I will be ` +
          `raising it formally with the rest of the board.`,
        expiresInWeeks: 4,
        choices: [
          {
            id: "reassure",
            label: "Reassure them personally",
            hint: "Costs nothing but your word. Small, temporary goodwill.",
            effects: [{ kind: "flag", key: "boardPressureAtAbsoluteWeek", value: nowAbs }],
          },
          {
            id: "act",
            label: "Commit club funds to the problem",
            hint: "Spend £75k addressing their concern directly.",
            effects: [
              {
                kind: "cash",
                amount: -75_000,
                note: `Board directive — ${d.role}`,
                expenseCategory: "other",
              },
              { kind: "flag", key: "boardPressureAtAbsoluteWeek", value: nowAbs },
              { kind: "reputation", delta: 1 },
            ],
          },
        ],
        consequenceOnExpire: [
          { kind: "flag", key: "boardPressureAtAbsoluteWeek", value: nowAbs },
          { kind: "reputation", delta: -1 },
        ],
      }),
    ];
  },
};

/* =========================================================================
   Commercial department generators
   -------------------------------------------------------------------------
   These surface state produced by runCommercialWeek(); they never create
   offers or move money themselves. All eventKeys are derived from stable
   offer/contract ids, so replays and reloads can never duplicate an item.
========================================================================= */

function offerSummaryLines(s: GameState, offer: CommercialOffer): string {
  const total = offer.weeklyPayment * SEASON_WEEKS * offer.durationSeasons + offer.signingBonus;
  const lines = [
    `Weekly fee ......... ${money(offer.weeklyPayment)}`,
    `Signing bonus ...... ${money(offer.signingBonus)}`,
    `Term ............... ${offer.durationSeasons} season(s)`,
    `Headline value ..... ${money(total)}`,
  ];
  if (offer.objectives.length) {
    lines.push("", "Performance clauses:");
    for (const o of offer.objectives) lines.push(`  • ${o.label} — ${money(o.bonus)} bonus`);
  }
  const sp = sponsorById(s, offer.sponsorId);
  if (sp) lines.push("", `Relationship: ${relationshipLabel(sp.relationshipScore)}`);
  return lines.join("\n");
}

function offerChoices(offer: CommercialOffer): InboxChoice[] {
  const choices: InboxChoice[] = [
    {
      id: "accept",
      label: "Accept the terms",
      hint: `Sign at ${money(offer.weeklyPayment)}/wk for ${offer.durationSeasons} season(s).`,
      effects: [{ kind: "commercialAccept", offerId: offer.id }],
    },
  ];
  if (offer.negotiationRounds < MAX_NEGOTIATION_ROUNDS) {
    choices.push(
      {
        id: "counter-payment",
        label: "Push for a bigger weekly fee",
        hint: "They may improve, hold firm, or lose patience.",
        effects: [{ kind: "commercialCounter", offerId: offer.id, counter: "payment" }],
      },
      {
        id: "counter-duration",
        label: "Push for a longer term",
        hint: "Locks the income in for another season if they agree.",
        effects: [{ kind: "commercialCounter", offerId: offer.id, counter: "duration" }],
      },
      {
        id: "counter-bonus",
        label: "Push for a bigger signing bonus",
        hint: "Cash up front instead of spread across the term.",
        effects: [{ kind: "commercialCounter", offerId: offer.id, counter: "bonus" }],
      },
    );
  }
  choices.push({
    id: "reject",
    label: "Turn the offer down",
    hint: "Ends the conversation. The relationship takes a knock.",
    effects: [{ kind: "commercialReject", offerId: offer.id }],
  });
  return choices;
}

const offerEventKey = (offer: CommercialOffer) =>
  `${offer.renewalOfContractId ? "commercial-renewal" : "commercial-offer"}:${offer.id}`;

const counterEventKey = (offer: CommercialOffer, round: number) =>
  `commercial-counter-outcome:${offer.id}:r${round}`;

/** Builds the follow-up item shown after a counter is answered. */
function counterOutcomeItem(s: GameState, offer: CommercialOffer): InboxItem | null {
  const outcome = offer.outcomes[offer.outcomes.length - 1];
  if (!outcome) return null;
  const name = sponsorName(s, offer.sponsorId);
  const stillLive = offer.status === "pending";
  const headline =
    outcome.result === "improved"
      ? "Improved terms"
      : outcome.result === "withdrawn"
        ? "Offer withdrawn"
        : "They held firm";
  return mk(s, "commercial-counter-outcome", {
    eventKey: counterEventKey(offer, outcome.round),
    sender: s.commercial?.directorName ?? "Commercial Director",
    department: "Commercial",
    category: stillLive ? "decision" : "information",
    priority: stillLive ? "high" : "normal",
    subject: `${name} — ${headline}`,
    body:
      `${outcome.note}\n\n` +
      (stillLive
        ? `Terms now on the table:\n${offerSummaryLines(s, offer)}`
        : `The ${offer.category} slot stays open. We will keep working the market.`),
    choices: stillLive ? offerChoices(offer) : undefined,
    expiresAtAbsoluteWeek: stillLive ? offer.expiresAtAbsoluteWeek : undefined,
  });
}

/* -- Commercial: new sponsor approach -- */
const G_COMMERCIAL_OFFER: Generator = {
  id: "commercial-offer",
  run: (s) => {
    if (!s.commercial) return [];
    return s.commercial.offers
      .filter((o) => o.status === "pending" && !o.renewalOfContractId && o.negotiationRounds === 0)
      .map((offer) =>
        mk(s, "commercial-offer", {
          eventKey: offerEventKey(offer),
          sender: s.commercial.directorName,
          department: "Commercial",
          category: "opportunity",
          priority: "high",
          subject: `${sponsorName(s, offer.sponsorId)} want the ${offer.category}`,
          body:
            `${sponsorName(s, offer.sponsorId)} have approached us about the ` +
            `${offer.category} rights.\n\n${offerSummaryLines(s, offer)}\n\n` +
            `I can sign it as it stands, or push them on one point. Push twice and ` +
            `they are liable to walk.`,
          choices: offerChoices(offer),
          expiresAtAbsoluteWeek: offer.expiresAtAbsoluteWeek,
        }),
      );
  },
};

/* -- Commercial: renewal window -- */
const G_COMMERCIAL_RENEWAL: Generator = {
  id: "commercial-renewal",
  run: (s) => {
    if (!s.commercial) return [];
    return s.commercial.offers
      .filter((o) => o.status === "pending" && !!o.renewalOfContractId && o.negotiationRounds === 0)
      .map((offer) => {
        const current = s.commercial.contracts.find((c) => c.id === offer.renewalOfContractId);
        const compare = current
          ? `\nCurrent deal: ${money(current.weeklyPayment)}/wk, ` +
            `${weeksRemaining(s, current)} week(s) left.\n`
          : "\n";
        return mk(s, "commercial-renewal", {
          eventKey: offerEventKey(offer),
          sender: s.commercial.directorName,
          department: "Commercial",
          category: "decision",
          priority: "high",
          subject: `Renewal — ${sponsorName(s, offer.sponsorId)} (${offer.category})`,
          body:
            `${sponsorName(s, offer.sponsorId)} have tabled renewal terms before ` +
            `the current agreement runs out.\n${compare}\n` +
            `Proposed:\n${offerSummaryLines(s, offer)}`,
          choices: offerChoices(offer),
          expiresAtAbsoluteWeek: offer.expiresAtAbsoluteWeek,
        });
      });
  },
};

/* -- Commercial: counter-offer outcome (safety net; normally emitted on choice) -- */
const G_COMMERCIAL_COUNTER_OUTCOME: Generator = {
  id: "commercial-counter-outcome",
  run: (s) => {
    if (!s.commercial) return [];
    const out: InboxItem[] = [];
    for (const offer of s.commercial.offers) {
      if (!offer.outcomes.length) continue;
      const item = counterOutcomeItem(s, offer);
      if (item) out.push(item);
    }
    return out;
  },
};

/* -- Commercial: contract expiry warning -- */
const G_COMMERCIAL_EXPIRY_WARNING: Generator = {
  id: "commercial-expiry-warning",
  run: (s) => {
    if (!s.commercial) return [];
    const nowAbs = absoluteWeek(s.season, s.week);
    return s.commercial.contracts
      .filter((c) => {
        if (c.status !== "Active") return false;
        const left = c.endAbsoluteWeek - nowAbs;
        if (left > 6 || left <= 0) return false;
        // Only warn when nobody is talking about a renewal.
        return !s.commercial.offers.some(
          (o) =>
            o.renewalOfContractId === c.id && (o.status === "pending" || o.status === "accepted"),
        );
      })
      .map((c) =>
        mk(s, "commercial-expiry-warning", {
          eventKey: `commercial-expiry-warning:${c.id}`,
          sender: s.commercial.directorName,
          department: "Commercial",
          category: "warning",
          priority: "high",
          subject: `${c.category} deal expiring — ${sponsorName(s, c.sponsorId)}`,
          body:
            `${sponsorName(s, c.sponsorId)} have not tabled renewal terms and the ` +
            `${c.category} agreement expires in ${c.endAbsoluteWeek - nowAbs} week(s).\n\n` +
            `That is ${money(c.weeklyPayment)} a week off the books unless we replace it. ` +
            `I will work the market, but the relationship is ` +
            `${relationshipLabel(sponsorById(s, c.sponsorId)?.relationshipScore ?? 50).toLowerCase()}.`,
        }),
      );
  },
};

/* -- Commercial: contract expired -- */
const G_COMMERCIAL_EXPIRED: Generator = {
  id: "commercial-contract-expired",
  run: (s) => {
    if (!s.commercial) return [];
    return s.commercial.history
      .filter((r) => r.outcome !== "renewed")
      .slice(-6)
      .map((r) =>
        mk(s, "commercial-contract-expired", {
          eventKey: `commercial-contract-expired:${r.contractId}`,
          sender: s.commercial.directorName,
          department: "Commercial",
          category: "financial",
          priority: "normal",
          subject: `${r.category} agreement ended — ${r.sponsorName}`,
          body:
            `The ${r.category} agreement with ${r.sponsorName} has ` +
            `${r.outcome === "terminated" ? "been terminated" : "run its course"}.\n\n` +
            `Weeks active ....... ${r.weeksActive}\n` +
            `Weekly fee ......... ${money(r.weeklyPayment)}\n` +
            `Total value ........ ${money(r.totalValue)}\n` +
            (r.objectives.length
              ? `\nClauses:\n${r.objectives
                  .map((o) => `  • ${o.label} — ${o.met ? "met" : "missed"} (${money(o.bonus)})`)
                  .join("\n")}\n`
              : "") +
            `\nThe ${r.category} slot is open again.`,
        }),
      );
  },
};

/* =========================================================================
   RECRUITMENT GENERATORS
   -------------------------------------------------------------------------
   These read canonical football state produced by runRecruitmentWeek().
   They never open, advance or complete a negotiation themselves — every
   mutation goes through the recruitment effects below, which call the
   in-place functions in recruitment.ts. eventKeys are derived from stable
   negotiation / contract / record ids so replays cannot duplicate an item.
========================================================================= */

const RECRUITMENT_SENDER = (s: GameState) =>
  s.football?.department?.headOfRecruitment ?? "Head of Recruitment";

function negotiationLines(s: GameState, n: TransferNegotiation): string {
  const p = transferTargetPlayer(s, n.playerId);
  if (!p) return "";
  return [
    `Player ............. ${playerName(p)} (${p.primaryPosition}, ${ageOf(p, s.season)})`,
    `Ability ............ ${p.currentAbility}`,
    `Valuation .......... ${money(p.marketValue)}`,
    `Fee on the table ... ${money(n.clubCounterFee ?? n.fee)}`,
    `Wage proposed ...... ${money(n.proposedWeeklyWage)}/wk`,
    `Term ............... ${n.proposedLengthSeasons} season(s) as ${n.proposedRole}`,
  ].join("\n");
}

/* -- Recruitment: another club bids for one of ours -- */
const G_RECRUITMENT_INCOMING_OFFER: Generator = {
  id: "recruitment-incoming-offer",
  run: (s) => {
    if (!s.football) return [];
    return s.football.negotiations
      .filter((n) => n.direction === "out" && n.stage === "clubTalks")
      .map((n) => {
        const p = playerById(s, n.playerId);
        if (!p) return null;
        const fee = n.fee;
        return mk(s, "recruitment-incoming-offer", {
          eventKey: `recruitment-incoming-offer:${n.id}:r${n.clubRounds}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "decision",
          priority: "high",
          subject: `${n.fromClubId ?? "A club"} bid ${money(fee)} for ${playerName(p)}`,
          body:
            `We have a formal approach for ${playerName(p)}.\n\n${negotiationLines(s, n)}\n\n` +
            `Selling banks the fee and frees the wage. Holding firm keeps the player, ` +
            `but they may not come back.`,
          choices: [
            {
              id: "accept",
              label: `Accept ${money(fee)}`,
              hint: "Fee is booked to the club's cash the moment the deal completes.",
              effects: [{ kind: "recruitmentAcceptOffer", negotiationId: n.id }],
            },
            {
              id: "counter",
              label: `Demand ${money(Math.round(fee * 1.25))}`,
              hint: "They may improve, hold firm or walk away.",
              effects: [
                {
                  kind: "recruitmentCounterOffer",
                  negotiationId: n.id,
                  fee: Math.round(fee * 1.25),
                },
              ],
            },
            {
              id: "reject",
              label: "Reject the bid",
              hint: "He stays. The approach is closed.",
              effects: [{ kind: "recruitmentRejectOffer", negotiationId: n.id }],
            },
          ],
          expiresAtAbsoluteWeek: n.expiresAtAbsoluteWeek,
        });
      })
      .filter((x): x is InboxItem => !!x);
  },
};

/* -- Recruitment: our target's agent comes back on wages -- */
const G_RECRUITMENT_PLAYER_TERMS: Generator = {
  id: "recruitment-player-terms",
  run: (s) => {
    if (!s.football) return [];
    return s.football.negotiations
      .filter(
        (n) => n.direction === "in" && n.stage === "playerTalks" && n.playerCounterWage != null,
      )
      .map((n) => {
        const p = transferTargetPlayer(s, n.playerId);
        if (!p) return null;
        const wanted = n.playerCounterWage!;
        return mk(s, "recruitment-player-terms", {
          eventKey: `recruitment-player-terms:${n.id}:r${n.playerRounds}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "decision",
          priority: "high",
          subject: `${playerName(p)} wants ${money(wanted)}/wk`,
          body:
            `The fee is agreed. His representatives have come back on personal terms.\n\n` +
            `${negotiationLines(s, n)}\n\nAsking ........... ${money(wanted)}/wk\n\n` +
            `Meeting it closes the deal subject to the wage ceiling. Holding our number ` +
            `risks him walking.`,
          choices: [
            {
              id: "meet",
              label: `Meet ${money(wanted)}/wk`,
              hint: "Adds directly to the weekly wage bill.",
              effects: [{ kind: "recruitmentAcceptPlayerTerms", negotiationId: n.id }],
            },
            {
              id: "improve",
              label: "Improve our offer slightly",
              hint: "A measured rise. He may still refuse.",
              effects: [{ kind: "recruitmentImproveTerms", negotiationId: n.id }],
            },
            {
              id: "withdraw",
              label: "Walk away",
              hint: "Ends the negotiation. No fee is paid.",
              effects: [{ kind: "recruitmentWithdraw", negotiationId: n.id }],
            },
          ],
          expiresAtAbsoluteWeek: n.expiresAtAbsoluteWeek,
        });
      })
      .filter((x): x is InboxItem => !!x);
  },
};

/* -- Recruitment: deal agreed, awaiting the chairman's signature -- */
const G_RECRUITMENT_DEAL_AGREED: Generator = {
  id: "recruitment-deal-agreed",
  run: (s) => {
    if (!s.football) return [];
    return s.football.negotiations
      .filter((n) => n.stage === "agreed" && !n.completedTransferId)
      .map((n) => {
        const p = transferTargetPlayer(s, n.playerId);
        if (!p) return null;
        const incoming = n.direction === "in";
        return mk(s, "recruitment-deal-agreed", {
          eventKey: `recruitment-deal-agreed:${n.id}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "decision",
          priority: "urgent",
          subject: `${incoming ? "Register" : "Sell"} ${playerName(p)} — terms agreed`,
          body:
            `${incoming ? "Both the club and the player have agreed" : "Terms are agreed with the buying club"}.\n\n` +
            `${negotiationLines(s, n)}\n\n` +
            (incoming
              ? `The next step is medical and registration. Ownership does not change until registration is completed.`
              : `The sale is ready to complete and the fee will be banked as transfer income.`),
          choices: [
            {
              id: incoming ? "register" : "complete",
              label: incoming ? "Begin medical & registration" : "Complete the sale",
              effects: [
                incoming
                  ? { kind: "recruitmentBeginRegistration", negotiationId: n.id }
                  : { kind: "recruitmentCompleteTransfer", negotiationId: n.id },
              ],
            },
            {
              id: "withdraw",
              label: "Pull out of the deal",
              hint: "No money moves. Our standing takes a knock.",
              effects: [{ kind: "recruitmentWithdraw", negotiationId: n.id }],
            },
          ],
          expiresAtAbsoluteWeek: n.expiresAtAbsoluteWeek,
        });
      })
      .filter((x): x is InboxItem => !!x);
  },
};

/* -- Recruitment: incoming deal passed into registration and is still eligible -- */
const G_RECRUITMENT_REGISTRATION_READY: Generator = {
  id: "recruitment-registration-ready",
  run: (s) => {
    if (!s.football) return [];
    return s.football.negotiations
      .filter((n) => n.direction === "in" && n.stage === "registration" && !n.completedTransferId)
      .map((n) => {
        const p = transferTargetPlayer(s, n.playerId);
        if (!p) return null;
        const readiness = transferRegistrationReadiness(s, n.id);
        if (!readiness.allowed) return null;
        return mk(s, "recruitment-registration-ready", {
          eventKey: `recruitment-registration-ready:${n.id}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "decision",
          priority: "urgent",
          subject: `${playerName(p)} — registration ready to complete`,
          body:
            `Medical and registration paperwork are open and the deal still passes the live window, squad and financial checks.\n\n` +
            `${negotiationLines(s, n)}\n\nCompleting registration is the point at which the player joins the club.`,
          choices: [
            {
              id: "complete",
              label: "Complete registration",
              effects: [{ kind: "recruitmentCompleteTransfer", negotiationId: n.id }],
            },
            {
              id: "withdraw",
              label: "Pull out of the deal",
              hint: "No fee or signing bonus is paid.",
              effects: [{ kind: "recruitmentWithdraw", negotiationId: n.id }],
            },
          ],
          expiresAtAbsoluteWeek: n.expiresAtAbsoluteWeek,
        });
      })
      .filter((x): x is InboxItem => !!x);
  },
};

/* -- Recruitment: contract running down -- */
const G_RECRUITMENT_CONTRACT_EXPIRING: Generator = {
  id: "recruitment-contract-expiring",
  run: (s) => {
    if (!s.football) return [];
    const out: InboxItem[] = [];
    for (const p of userSquad(s)) {
      const c = activeContract(s, p.id);
      if (!c) continue;
      const left = weeksLeftOnContract(s, c);
      if (left > RENEWAL_WINDOW_WEEKS || left <= 0) continue;
      const terms = renewalTerms(s, p.id);
      if (!terms) continue;
      out.push(
        mk(s, "recruitment-contract-expiring", {
          eventKey: `recruitment-contract-expiring:${c.id}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "decision",
          priority: p.currentAbility >= 65 ? "high" : "normal",
          subject: `${playerName(p)} — ${left} week(s) left on his deal`,
          body:
            `${playerName(p)} (${p.primaryPosition}, ${ageOf(p, s.season)}) is inside the ` +
            `renewal window.\n\n` +
            `Current wage ....... ${money(c.weeklyWage)}/wk\n` +
            `Asking ............. ${money(terms.weeklyWage)}/wk over ${terms.seasons} season(s)\n` +
            `Signing bonus ...... ${money(terms.signingBonus)}\n` +
            `Ability ............ ${p.currentAbility}\n\n` +
            `Let it run out and he leaves for nothing.`,
          choices: [
            {
              id: "renew",
              label: `Renew at ${money(terms.weeklyWage)}/wk`,
              effects: [{ kind: "recruitmentRenewContract", playerId: p.id }],
            },
            {
              id: "renew-short",
              label: "Offer one season only",
              hint: "Cheaper commitment, shorter security.",
              effects: [{ kind: "recruitmentRenewContract", playerId: p.id, seasons: 1 }],
            },
            {
              id: "release",
              label: "Let him go",
              hint: "Ends the contract and clears the wage.",
              effects: [{ kind: "recruitmentReleasePlayer", playerId: p.id }],
            },
          ],
        }),
      );
    }
    return out;
  },
};

/* -- Recruitment: completed movement, for the record -- */
const G_RECRUITMENT_TRANSFER_DONE: Generator = {
  id: "recruitment-transfer-complete",
  run: (s) => {
    if (!s.football) return [];
    return s.football.transferHistory
      .filter((r) => isUserClubReference(s, r.toClubId) || isUserClubReference(s, r.fromClubId))
      .slice(-6)
      .map((r) => {
        const incoming = isUserClubReference(s, r.toClubId);
        return mk(s, "recruitment-transfer-complete", {
          eventKey: `recruitment-transfer-complete:${r.id}`,
          sender: RECRUITMENT_SENDER(s),
          department: "Director of Football",
          category: "financial",
          priority: "normal",
          subject: `${incoming ? "Signed" : "Sold"} — ${r.playerName}`,
          body:
            `${r.playerName} (${r.position}) has ${incoming ? "joined" : "left"} the club.\n\n` +
            `Fee ................ ${money(r.fee)}\n` +
            (incoming
              ? `Signing bonus ...... ${money(r.signingBonus)}\n` +
                `Weekly wage ........ ${money(r.weeklyWage)}/wk\n`
              : `Wage freed ......... ${money(r.weeklyWage)}/wk\n`) +
            `Recorded ........... Season ${r.season}, week ${r.week}`,
        });
      });
  },
};

/* ---------- Registry ---------- */

/* =========================================================================
   Facilities generators
   -------------------------------------------------------------------------
   These read canonical infrastructure state only. Informational items carry
   no effects at all, so re-reading or re-opening them can never move money
   or condition. Actionable items dispatch infra* effects, which call the
   canonical infrastructure functions.
========================================================================= */

/* -- Deterioration warning: one per asset per season -- */
const G_INFRA_WARNING: Generator = {
  id: "facilities-condition-warning",
  run: (s) => {
    if (!s.infrastructure) return [];
    return infraAssets(s)
      .filter((a) => a.status !== "closed" && a.condition < 45 && a.condition >= 20)
      .map((a) =>
        mk(s, "facilities-condition-warning", {
          eventKey: `facilities-condition-warning:${a.id}:s${s.season}`,
          sender: "Eddie Kerr",
          department: "Groundskeeper",
          category: "facilities",
          priority: "normal",
          subject: `${a.name} is deteriorating (${Math.round(a.condition)}%)`,
          body:
            `${a.name} is now rated ${conditionBand(a.condition)} at ` +
            `${Math.round(a.condition)}%. Left alone it will keep sliding and ` +
            `start costing us on matchdays. Worth raising some work in the ` +
            `Facilities office.`,
        }),
      );
  },
};

/* -- Critical warning: one per asset per season, actionable -- */
const G_INFRA_CRITICAL: Generator = {
  id: "facilities-critical-warning",
  run: (s) => {
    if (!s.infrastructure) return [];
    return infraAssets(s)
      .filter((a) => a.status !== "closed" && a.condition < 20)
      .map((a) =>
        mk(s, "facilities-critical-warning", {
          eventKey: `facilities-critical-warning:${a.id}:s${s.season}`,
          sender: "Eddie Kerr",
          department: "Groundskeeper",
          category: "warning",
          priority: "high",
          subject: `${a.name} is in a critical state`,
          body:
            `${a.name} has fallen to ${Math.round(a.condition)}%. I can't ` +
            `certify it as safe for much longer. We either close it now or ` +
            `carry the risk.`,
          choices: [
            {
              id: "close",
              label: `Close ${a.name}`,
              hint: "Removes it from use until it is repaired.",
              effects: [{ kind: "infraCloseAsset", assetId: a.id }],
            },
            {
              id: "carry-on",
              label: "Keep it open for now",
              hint: "No cost today. Supporters will notice.",
              effects: [{ kind: "fanHappiness", delta: -1 }],
            },
          ],
        }),
      );
  },
};

/* -- Works proposal: the worst poor asset, once per asset per season -- */
const G_INFRA_PROPOSAL: Generator = {
  id: "facilities-project-proposal",
  run: (s) => {
    if (!s.infrastructure) return [];
    const cap = projectCapacity(s);
    if (!cap.canStartMinor && !cap.canStartMajor) return [];
    const worst = infraAssets(s)
      .filter((a) => !a.activeProjectId && a.condition < 55)
      .sort((a, b) => a.condition - b.condition)[0];
    if (!worst) return [];
    const spec = projectCatalogue(s, worst.id).find(
      (x) =>
        (x.major ? cap.canStartMajor : cap.canStartMinor) &&
        (x.type === "majorRepair" || x.type === "minorRepair"),
    );
    if (!spec) return [];
    return [
      mk(s, "facilities-project-proposal", {
        eventKey: `facilities-project-proposal:${worst.id}:${spec.type}:s${s.season}`,
        sender: "Eddie Kerr",
        department: "Groundskeeper",
        category: "facilities",
        priority: "normal",
        subject: `Proposal — ${spec.title} on ${worst.name}`,
        body:
          `${spec.description}\n\nCost £${spec.cost.toLocaleString("en-GB")} over ` +
          `${spec.durationWeeks} week(s). Approving here raises exactly the same ` +
          `project as the Facilities office would.`,
        expiresInWeeks: 4,
        choices: [
          {
            id: "approve",
            label: `Approve — £${spec.cost.toLocaleString("en-GB")}`,
            hint: "Raises the project through the Facilities department.",
            requirements: [{ kind: "cash", amount: spec.cost }],
            effects: [{ kind: "infraApproveProject", assetId: worst.id, projectType: spec.type }],
          },
          { id: "decline", label: "Not now", hint: "No cost. No work.", effects: [] },
        ],
      }),
    ];
  },
};

/* -- Works bulletin: one informational item per infrastructure record -- */
const RECORD_SUBJECT: Record<string, string> = {
  delay: "Programme delay",
  overrun: "Cost overrun",
  cancellation: "Works cancelled",
  emergencyClosure: "Emergency closure",
  reopening: "Reopened",
  repair: "Works completed",
  refurbishment: "Refurbishment completed",
  redevelopment: "Redevelopment completed",
  expansion: "Expansion completed",
  newFacility: "New facility open",
  capacityChange: "Capacity change",
};

const G_INFRA_WORKS_UPDATE: Generator = {
  id: "facilities-works-update",
  run: (s) => {
    if (!s.infrastructure) return [];
    const nowAbs = absoluteWeek(s.season, s.week);
    const items: InboxItem[] = [];
    for (const r of s.infrastructure.history) {
      if (!(r.kind in RECORD_SUBJECT)) continue;
      if (nowAbs - r.absoluteWeek > 2 || r.absoluteWeek > nowAbs) continue;
      items.push(
        mk(s, "facilities-works-update", {
          eventKey: `facilities-works-update:${r.id}`,
          sender: "Eddie Kerr",
          department: "Groundskeeper",
          category: "facilities",
          priority: r.kind === "overrun" || r.kind === "delay" ? "high" : "normal",
          subject: `${RECORD_SUBJECT[r.kind]} — ${r.assetName}`,
          body:
            `${r.description}.` +
            (r.cost > 0 ? ` Cost booked: £${r.cost.toLocaleString("en-GB")}.` : "") +
            ` Condition ${r.conditionBefore}% → ${r.conditionAfter}%.`,
        }),
      );
    }
    // Halfway milestone on live work.
    for (const p of infraActiveProjects(s)) {
      if (p.progress < 50) continue;
      const a = infraAssetById(s, p.assetId);
      items.push(
        mk(s, "facilities-works-update", {
          eventKey: `facilities-works-update:milestone:${p.id}:50`,
          sender: "Eddie Kerr",
          department: "Groundskeeper",
          category: "facilities",
          priority: "low",
          subject: `${p.title} — halfway`,
          body: `${p.title}${a ? ` on ${a.name}` : ""} has passed the halfway mark.`,
        }),
      );
    }
    return items;
  },
};

/* =========================================================================
   Sustainability generators
   -------------------------------------------------------------------------
   Strategic pressure made visible. Every one of these is a pure read of the
   canonical sustainability selectors, emits a stable eventKey, and never
   moves cash. The only thing a choice can do is record a promise to the
   Board (a StrategicCommitment) — the money still has to be spent through
   Recruitment, Facilities or Commercial like any other decision.
========================================================================= */

const SUS_SENDER = (s: GameState) =>
  s.board?.directors?.find((d) => d.role === "Finance Director")?.name ?? "Finance Director";

/** Deterministic investment figure a promise is measured against, £. */
function commitmentTarget(strategicCapital: number, share: number): number {
  return Math.max(250_000, Math.round((strategicCapital * share) / 50_000) * 50_000);
}

const hasOpenCommitment = (s: GameState, category: string) =>
  openCommitments(s).some((c) => c.category === category);

/* -- Periodic reserve report: informational, fixed cadence, never spam -- */
const G_SUS_RESERVE_REPORT: Generator = {
  id: "sustainability-reserve-report",
  run: (s) => {
    const abs = absoluteWeek(s.season, s.week);
    if (abs % RESERVE_REPORT_WEEKS !== 0) return [];
    const res = reservePicture(s);
    const h = financialHealth(s);
    const p = reinvestmentPressure(s);
    return [
      mk(s, "sustainability-reserve-report", {
        eventKey: `sustainability-reserve-report:${abs}`,
        sender: SUS_SENDER(s),
        department: "Finance",
        category: "information",
        priority: "normal",
        subject: `Reserve report — ${h.label}`,
        body:
          `Cash: ${money(res.cash)}\n` +
          `Recommended reserve: ${money(res.recommended)}\n` +
          (res.excess > 0
            ? `Above reserve by ${money(res.excess)}\n`
            : `Short of reserve by ${money(res.deficit)}\n`) +
          `Operating cover: ${res.coverMonths.toFixed(1)} months\n` +
          `Wage-to-revenue: ${h.wageRatio}%\n\n` +
          `${h.summary}\n\n${p.headline}`,
      }),
    ];
  },
};

/* -- Football Director asks for the money to be used on the squad -- */
const G_SUS_FOOTBALL_REQUEST: Generator = {
  id: "sustainability-football-request",
  run: (s) => {
    const n = sustainabilityNeeds(s);
    const p = reinvestmentPressure(s);
    const res = reservePicture(s);
    if (n.squad < 0.45 || p.byArea.squad < 45 || res.strategicCapital <= 0) return [];
    if (hasOpenCommitment(s, "football")) return [];
    const d = s.board?.directors?.find((x) => x.role === "Football Director");
    const target = commitmentTarget(res.strategicCapital, 0.35);
    return [
      mk(s, "sustainability-football-request", {
        eventKey: `sustainability-football-request:s${s.season}`,
        sender: d?.name ?? "Football Director",
        department: "Board of Directors",
        category: "decision",
        priority: "high",
        subject: "The squad is falling behind this division",
        body:
          `We are carrying ${money(res.strategicCapital)} of capital that is not ` +
          `committed to anything, and the squad is rated well below the clubs ` +
          `we are playing every week.\n\n` +
          `I am not asking you to empty the account. I am asking you to tell ` +
          `the board what this money is for.`,
        expiresInWeeks: 6,
        choices: [
          {
            id: "squad",
            label: `Commit ${money(target)} to the squad`,
            hint: "Promise measured against real transfer and wage spend.",
            effects: [
              {
                kind: "strategicCommitment",
                category: "football",
                weeks: 26,
                targetInvestment: target,
                note: "Chairman promised the Football Director squad investment.",
              },
            ],
          },
          {
            id: "training",
            label: `Commit ${money(target)} to training and medical`,
            hint: "Promise measured against facilities and capital spend.",
            effects: [
              {
                kind: "strategicCommitment",
                category: "infrastructure",
                weeks: 34,
                targetInvestment: target,
                note: "Chairman promised investment in training and medical facilities.",
              },
            ],
          },
          {
            id: "hold",
            label: "Maintain the current strategy",
            hint: "No promise made. The director will remember at the review.",
            effects: [],
          },
          {
            id: "refuse",
            label: "Refuse to commit funds",
            hint: "Blunt, and the dressing room will hear about it.",
            effects: [{ kind: "fanHappiness", delta: -1 }],
          },
        ],
      }),
    ];
  },
};

/* -- Supporters' Director: only after sustained visible underinvestment -- */
const G_SUS_SUPPORTER_PRESSURE: Generator = {
  id: "sustainability-supporter-pressure",
  run: (s) => {
    const n = sustainabilityNeeds(s);
    const res = reservePicture(s);
    const cap = capacityPicture(s);
    const idle = s.sustainability?.excessWeeks ?? 0;
    const sustained = idle >= 24 && res.excess > 0;
    if (!sustained || (n.supporters < 0.5 && cap.pressure < 60)) return [];
    if (hasOpenCommitment(s, "supporters")) return [];
    const d = s.board?.directors?.find((x) => x.role === "Supporters' Director");
    const target = commitmentTarget(res.strategicCapital, 0.25);
    return [
      mk(s, "sustainability-supporter-pressure", {
        eventKey: `sustainability-supporter-pressure:s${s.season}`,
        sender: d?.name ?? "Supporters' Director",
        department: "Board of Directors",
        category: "warning",
        priority: "high",
        subject: "Supporters can see the balance sheet",
        body:
          `We have been sitting on money above our reserve for ${idle} weeks. ` +
          `In the same period the ground has been left as it is` +
          (cap.pressure >= 60 ? ` and we are turning people away most weeks` : ``) +
          `.\n\nThe supporters' trust has asked me directly what the money is for. ` +
          `I would like an answer I can give them.`,
        expiresInWeeks: 6,
        choices: [
          {
            id: "commit",
            label: `Commit ${money(target)} to supporter facilities`,
            hint: "Measured against real facilities and capital spend.",
            effects: [
              {
                kind: "strategicCommitment",
                category: "supporters",
                weeks: 30,
                targetInvestment: target,
                note: "Chairman promised investment in supporter facilities.",
              },
            ],
          },
          {
            id: "listen",
            label: "Meet the trust without promising anything",
            hint: "Buys goodwill now, changes nothing.",
            effects: [{ kind: "fanHappiness", delta: 1 }],
          },
          {
            id: "dismiss",
            label: "Tell them the reserves are not for spending",
            hint: "Honest. Unpopular.",
            effects: [{ kind: "fanHappiness", delta: -2 }],
          },
        ],
      }),
    ];
  },
};

/* -- Commercial Director: untapped revenue while capital sits idle -- */
const G_SUS_COMMERCIAL_REQUEST: Generator = {
  id: "sustainability-commercial-request",
  run: (s) => {
    const n = sustainabilityNeeds(s);
    const p = reinvestmentPressure(s);
    const res = reservePicture(s);
    if (n.commercial < 0.45 || p.byArea.commercial < 40 || res.strategicCapital <= 0) return [];
    if (hasOpenCommitment(s, "commercial")) return [];
    const d = s.board?.directors?.find((x) => x.role === "Commercial Director");
    const target = commitmentTarget(res.strategicCapital, 0.3);
    return [
      mk(s, "sustainability-commercial-request", {
        eventKey: `sustainability-commercial-request:s${s.season}`,
        sender: d?.name ?? "Commercial Director",
        department: "Board of Directors",
        category: "opportunity",
        priority: "normal",
        subject: "We are leaving money on the table every matchday",
        body:
          `Our retail, hospitality and catering are behind what this club could ` +
          `support. With ${money(res.strategicCapital)} uncommitted, developing ` +
          `them would raise recurring income rather than spend it once.\n\n` +
          `Approve the work through the Facilities office and I will do the rest.`,
        expiresInWeeks: 6,
        choices: [
          {
            id: "commit",
            label: `Commit ${money(target)} to commercial development`,
            hint: "Measured against real capital and operations spend.",
            effects: [
              {
                kind: "strategicCommitment",
                category: "commercial",
                weeks: 30,
                targetInvestment: target,
                note: "Chairman promised commercial development.",
              },
            ],
          },
          {
            id: "later",
            label: "Not this season",
            hint: "No promise recorded.",
            effects: [],
          },
        ],
      }),
    ];
  },
};

/* -- Strategic capital review: sustained pressure, chairman sets priority -- */
const G_SUS_STRATEGIC_REVIEW: Generator = {
  id: "sustainability-strategic-review",
  run: (s) => {
    const p = reinvestmentPressure(s);
    const res = reservePicture(s);
    const idle = s.sustainability?.excessWeeks ?? 0;
    if (p.score < 70 || idle < 20) return [];
    if (openCommitments(s).length > 0) return [];
    const chair = s.board?.directors?.find((x) => x.role === "Chairman");
    const target = commitmentTarget(res.strategicCapital, 0.3);
    const promise = (
      category: "football" | "infrastructure" | "commercial" | "supporters",
      label: string,
      weeks: number,
    ) => ({
      id: category,
      label,
      hint: `Recorded as a promise to the board. Measured over ${weeks} weeks.`,
      effects: [
        {
          kind: "strategicCommitment" as const,
          category,
          weeks,
          targetInvestment: target,
          note: `Strategic capital review: ${label}.`,
        },
      ],
    });
    return [
      mk(s, "sustainability-strategic-review", {
        eventKey: `sustainability-strategic-review:s${s.season}`,
        sender: chair?.name ?? "Chairman",
        department: "Board of Directors",
        category: "decision",
        priority: "high",
        subject: "Strategic capital review",
        body:
          `${p.headline}\n\n` +
          `Uncommitted capital: ${money(res.strategicCapital)}\n` +
          `Weeks above reserve: ${idle}\n\n` +
          `The board would like a stated priority for this money. Preserving ` +
          `it is a legitimate answer — but it has to be an answer.`,
        expiresInWeeks: 8,
        choices: [
          {
            id: "preserve",
            label: "Preserve reserves",
            hint: "Promise to hold cover through the period.",
            effects: [
              {
                kind: "strategicCommitment",
                category: "financial",
                weeks: 26,
                targetInvestment: 0,
                note: "Chairman committed to protecting the club's reserves.",
              },
            ],
          },
          promise("football", "Prioritise the squad", 26),
          promise("infrastructure", "Prioritise stadium and training infrastructure", 34),
          promise("supporters", "Prioritise supporter facilities", 30),
        ],
      }),
    ];
  },
};

/* -- Promotion / relegation: one sustainability briefing per season -- */
const G_SUS_TIER_SHOCK: Generator = {
  id: "sustainability-tier-shock",
  run: (s) => {
    const shock = tierShock(s);
    if (!shock.movement || s.week > 6) return [];
    const up = shock.movement === "promoted";
    return [
      mk(s, "sustainability-tier-shock", {
        eventKey: `sustainability-tier-shock:${shock.movement}:s${s.season}`,
        sender: SUS_SENDER(s),
        department: "Finance",
        category: up ? "information" : "warning",
        priority: up ? "normal" : "high",
        subject: up ? "What promotion means for the books" : "What relegation means for the books",
        body:
          `${shock.summary}\n\n` +
          `Recurring income at this level: ${money(shock.weeklyIncome)}/week\n` +
          `Running cost we carry: ${money(shock.weeklyCost)}/week\n` +
          `Wages already contracted this season: ${money(shock.committedWages)}\n` +
          `Cash: ${money(shock.reserve.cash)} against a recommended reserve of ` +
          `${money(shock.reserve.recommended)}\n` +
          `Status: ${shock.health.label} — ${shock.reserve.coverMonths.toFixed(1)} months cover\n\n` +
          (up
            ? `Sponsors, attendances and distributions all improve at this level. ` +
              `So do wage demands at renewal, transfer prices and what the board ` +
              `considers an acceptable squad and ground.`
            : `Nothing on the cost side falls with us: signed contracts, maintenance ` +
              `and any approved works continue exactly as they are. Expect the ` +
              `financial health indicators to tighten before they recover.`),
      }),
    ];
  },
};

const GENERATORS: Generator[] = [
  G_WELCOME,
  G_FINANCE_WEEKLY,
  G_ROOF,
  G_ROOF_FOLLOWUP,
  G_FAN_WARN,
  G_SPONSOR_RENEW,
  G_SPONSOR_PUSHBACK,
  G_MEDIA_MATCH,
  G_BOARD_OBJECTIVES,
  G_BOARD_REVIEW,
  G_BOARD_PRESSURE,
  G_COMMERCIAL_OFFER,
  G_COMMERCIAL_RENEWAL,
  G_COMMERCIAL_COUNTER_OUTCOME,
  G_COMMERCIAL_EXPIRY_WARNING,
  G_COMMERCIAL_EXPIRED,
  G_RECRUITMENT_INCOMING_OFFER,
  G_RECRUITMENT_PLAYER_TERMS,
  G_RECRUITMENT_DEAL_AGREED,
  G_RECRUITMENT_REGISTRATION_READY,
  G_RECRUITMENT_CONTRACT_EXPIRING,
  G_RECRUITMENT_TRANSFER_DONE,
  G_INFRA_WARNING,
  G_INFRA_CRITICAL,
  G_INFRA_PROPOSAL,
  G_INFRA_WORKS_UPDATE,
  G_SUS_RESERVE_REPORT,
  G_SUS_FOOTBALL_REQUEST,
  G_SUS_SUPPORTER_PRESSURE,
  G_SUS_COMMERCIAL_REQUEST,
  G_SUS_STRATEGIC_REVIEW,
  G_SUS_TIER_SHOCK,
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
  //    Collect first, then apply — applying effects while iterating the same
  //    collection is exactly the pattern that caused lost/duplicated writes.
  const expiring: InboxItem[] = [];
  for (const it of s.inbox) {
    const deadline = it.expiresAtAbsoluteWeek;
    if (
      deadline != null &&
      it.status !== "completed" &&
      it.status !== "expired" &&
      nowAbs > deadline
    ) {
      expiring.push(it);
    }
  }
  for (const it of expiring) {
    it.status = "expired";
    // Exactly-once guard: survives reloads and repeated weekly runs.
    if (it.consequenceOnExpire && !it.consequenceApplied) {
      it.consequenceApplied = true;
      applyEffectsInPlace(s, it.consequenceOnExpire, {
        sourceItemId: it.id,
        sourceEventKey: it.eventKey,
      });
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
  const existingKeys = new Set([...s.inbox.map((i) => i.eventKey), ...archivedInboxGuardKeys(s)]);

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
  low: { label: "Low", className: "text-muted-foreground" },
  normal: { label: "Normal", className: "text-foreground" },
  high: { label: "High", className: "text-amber-600 font-medium" },
  urgent: { label: "Urgent", className: "text-rose-600 font-semibold" },
};

export const DEPARTMENTS_ALL: InboxDepartment[] = [
  "Board of Directors",
  "Manager",
  "Director of Football",
  "Finance",
  "Commercial",
  "Head Scout",
  "Medical",
  "Groundskeeper",
  "Fan Liaison",
  "Sponsors",
  "League",
  "Media",
  "Club",
];
