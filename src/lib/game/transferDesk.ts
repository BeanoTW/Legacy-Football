/* =========================================================================
   EXECUTIVE TRANSFER DESK — derived view model
   -------------------------------------------------------------------------
   Pure selectors that normalise the existing transfer systems into one
   presentation model for the Transfers workspace. Nothing here is persisted
   and nothing here mutates state:

   - negotiations   → football.negotiations (+ dated/rival/registration augmentations)
   - loans          → football.loans
   - completed      → football.transferHistory (append-only)
   - market         → chairman-visible players only (scouting knowledge contract)
   - funds / wages  → remainingTransferBudget, finance reserve, wage budget
   - window         → calendar window + deadline-day clock
   - priorities     → managerRecruitmentBrief

   The engine stays canonical: every action the desk offers still calls the
   existing recruitment / loan / scouting functions.
========================================================================= */

import type {
  FootballPlayer,
  GameState,
  PlayerContract,
  PlayerLoanAgreement,
  Position,
  Staff,
  TransferNegotiation,
} from "./types";
import {
  CALENDAR,
  WINDOW_PRESEASON_END,
  calendarDay,
  isTransferDeadlineDay,
  isTransferDeadlineWeek,
  isTransferWindowOpen,
  transferDeadlineHoursRemaining,
  windowStatus,
} from "./calendar";
import {
  activeContract,
  ageOf,
  loanInAvailabilityReason,
  openNegotiations,
  playerName,
  remainingTransferBudget,
  transferRegistrationReadiness,
  userWageBill,
  weeksLeftOnContract,
} from "./recruitment";
import { transferTargetPlayer } from "./recruitmentTargetBridge";
import { chairmanRecruitmentEstimate, chairmanShortlistIds } from "./recruitmentKnowledge";
import { chairmanRecruitmentPlayerIds } from "./chairmanRecruitmentView";
import { scoutingAssignment, scoutingReport } from "./scouting";
import { scoutedOverallPresentation } from "./scoutingPresentation";
import { scoutingBriefDaysRemaining } from "./scoutingDiscovery";
import { clubDisplayName, isUserClubReference, userClubReference } from "./clubReference";
import { playerOwnerClubId, playerRegisteredClubId } from "./playerRegistration";
import { tacticalPositionProfile } from "./positions";
import { absoluteWeek } from "./time";
import { transferAbsoluteDay } from "./transferResponses";
import { fmtMoney } from "./format";
import {
  activeManagerRecruitmentAssignment,
  managerRecruitmentBrief,
  recruitmentDelegationAvailability,
  type ManagerRecruitmentPriority,
} from "./managerRecruitmentBrief";
import { managerMatchStyle } from "./managerMatchStyle";
import type { InboxDestination } from "./inboxNavigation";
import { userMatchBench, userMatchLineup } from "./matchLineup";
import { clubOperatingModel, contractEmploymentType } from "./employment";

/* ------------------------------------------------------------------ */
/* Shared vocabulary                                                  */
/* ------------------------------------------------------------------ */

/** Explicit transaction types: never "incoming/outgoing". */
export type DeskDealKind = "recruiting" | "selling" | "loanIn" | "loanOut";
export type DeskPriority = "action" | "today" | "waiting" | "completed";

export const DESK_KIND_LABEL: Record<DeskDealKind, string> = {
  recruiting: "Recruiting",
  selling: "Selling",
  loanIn: "Loan in",
  loanOut: "Loan out",
};

export const DESK_PRIORITY_LABEL: Record<DeskPriority, string> = {
  action: "Needs action",
  today: "Today",
  waiting: "Waiting",
  completed: "Completed",
};

export const DESK_PRIORITY_ORDER: DeskPriority[] = ["action", "today", "waiting", "completed"];

/** Stage ladders. A deal's stage is an index into its ladder. */
export const RECRUITING_CLUB_STAGES = [
  "Enquiry sent",
  "Club replied",
  "Fee negotiation",
  "Fee agreed",
  "Player talks",
  "Registration",
  "Complete",
] as const;
export const RECRUITING_FREE_STAGES = [
  "Offer sent",
  "Player talks",
  "Registration",
  "Complete",
] as const;
export const SELLING_STAGES = [
  "Bid received",
  "Fee negotiation",
  "Fee agreed",
  "Complete",
] as const;
export const LOAN_STAGES = ["Agreed", "Active", "Returned"] as const;

export interface DeskRivalAlert {
  clubName: string;
  fee?: number;
  weeklyWage?: number;
  /** The rival package has made the agent reopen agreed terms. */
  reopened: boolean;
}

export interface DeskDeal {
  /** Stable row id: `neg:<id>`, `loan:<id>`, `history:<id>`. */
  id: string;
  kind: DeskDealKind;
  priority: DeskPriority;
  playerId: string;
  playerName: string;
  position: string;
  counterparty: string;
  stages: readonly string[];
  stageIndex: number;
  /** One plain line saying what happens next, or what happened. */
  headline: string;
  /** Money or terms currently relevant to the deal. */
  amount?: string;
  /** When the next external event is due, relative to today. */
  dueLabel?: string;
  /** For waiting/today rows: absolute day the reply is due. */
  dueDay?: number;
  rival?: DeskRivalAlert;
  /** Outcome text for completed rows. */
  outcome?: string;
  negotiationId?: string;
  loanId?: string;
  /** True when talks or the player are at risk of lapsing this week. */
  expiring: boolean;
  sortKey: number;
}

const nowWeek = (s: GameState) => absoluteWeek(s.season, s.week);

function dayLabel(state: GameState, day: number | undefined): string | undefined {
  if (day === undefined) return undefined;
  const delta = day - transferAbsoluteDay(state);
  if (delta <= 0) return "today";
  if (delta === 1) return "tomorrow";
  return `in ${delta} days`;
}

function hourLabel(negotiation: TransferNegotiation): string | undefined {
  return negotiation.pendingResponseAtHour !== undefined
    ? `by ${String(negotiation.pendingResponseAtHour).padStart(2, "0")}:00`
    : undefined;
}

/* ------------------------------------------------------------------ */
/* Negotiations → deals                                               */
/* ------------------------------------------------------------------ */

/** One live negotiation in desk form; also used by the deal room's stage ladder. */
export function deskDealForNegotiation(state: GameState, n: TransferNegotiation): DeskDeal | null {
  const player = transferTargetPlayer(state, n.playerId);
  if (!player) return null;
  const today = transferAbsoluteDay(state);
  const recruiting = n.direction === "in";
  const otherClub = recruiting ? n.fromClubId : n.toClubId;
  const counterparty = otherClub ? clubDisplayName(state, otherClub) : "Free agent";
  const freeAgent = recruiting && !n.fromClubId;
  const waiting = n.pendingResponseAtDay !== undefined;
  const dueDay = n.pendingResponseAtDay ?? n.registrationDueAtDay;
  const expiring = n.expiresAtAbsoluteWeek <= nowWeek(state);
  const rival: DeskRivalAlert | undefined =
    recruiting && n.competingClubId
      ? {
          clubName: clubDisplayName(state, n.competingClubId),
          fee: n.competingOfferFee,
          weeklyWage: n.competingWeeklyWage,
          reopened: Boolean(n.renegotiationRequested),
        }
      : undefined;

  let stages: readonly string[];
  let stageIndex: number;
  let priority: DeskPriority;
  let headline: string;
  let amount: string | undefined;

  if (recruiting && freeAgent) {
    stages = RECRUITING_FREE_STAGES;
    stageIndex =
      n.stage === "agreed" || n.stage === "registration"
        ? 2
        : n.playerRounds > 0 || n.stage === "playerTalks"
          ? 1
          : 0;
    amount = `${fmtMoney(n.proposedWeeklyWage)}/wk`;
  } else if (recruiting) {
    stages = RECRUITING_CLUB_STAGES;
    stageIndex =
      n.stage === "enquiry"
        ? waiting && n.clubCounterFee === undefined
          ? 0
          : 1
        : n.stage === "clubTalks"
          ? 2
          : n.stage === "playerTalks"
            ? 4
            : 5;
    amount =
      n.stage === "enquiry" && n.clubCounterFee === undefined
        ? undefined
        : fmtMoney(n.clubCounterFee ?? n.fee);
  } else {
    stages = SELLING_STAGES;
    stageIndex = n.stage === "agreed" ? 2 : n.clubRounds > 0 ? 1 : 0;
    amount = fmtMoney(n.clubCounterFee ?? n.fee);
  }

  if (recruiting) {
    if (n.stage === "registration") {
      priority = "waiting";
      headline = "Medical & registration under way";
    } else if (n.stage === "agreed") {
      const readiness = transferRegistrationReadiness(state, n.id);
      priority = "action";
      headline = readiness.allowed
        ? "Terms agreed · open medical & registration"
        : `Terms agreed · ${readiness.reason}`;
    } else if (waiting) {
      priority = "waiting";
      headline =
        n.stage === "enquiry"
          ? `Awaiting ${counterparty}'s valuation`
          : n.stage === "clubTalks"
            ? `${counterparty} considering our bid`
            : freeAgent
              ? "Player considering our offer"
              : "Agent considering our terms";
    } else if (n.stage === "enquiry") {
      priority = "action";
      headline =
        n.clubCounterFee !== undefined
          ? `${counterparty} value him at ${fmtMoney(n.clubCounterFee)} · make an opening bid`
          : "Club replied · make an opening bid";
    } else if (n.stage === "clubTalks") {
      priority = "action";
      headline =
        n.clubCounterFee !== undefined
          ? `${counterparty} want ${fmtMoney(n.clubCounterFee)} · respond`
          : "Club are ready to negotiate";
    } else {
      priority = "action";
      headline = n.renegotiationRequested
        ? "Agent has reopened terms · respond"
        : n.playerCounterWage !== undefined
          ? `Player wants ${fmtMoney(n.playerCounterWage)}/wk · respond`
          : "Player talks ready";
    }
  } else if (waiting) {
    priority = "waiting";
    headline = "Buying club considering our response";
  } else if (n.stage === "agreed") {
    priority = "waiting";
    headline = "Fee agreed · buyer completing player terms";
  } else {
    priority = "action";
    headline = n.clubCounterFee !== undefined
      ? `${counterparty} offer ${fmtMoney(n.clubCounterFee)} · respond`
      : `${counterparty} have made an offer · respond`;
  }

  // Anything due on the current date belongs under Today, not Waiting.
  if (priority === "waiting" && dueDay !== undefined && dueDay <= today) priority = "today";

  const due = hourLabel(n) ?? dayLabel(state, dueDay);
  return {
    id: `neg:${n.id}`,
    kind: recruiting ? "recruiting" : "selling",
    priority,
    playerId: n.playerId,
    playerName: playerName(player),
    position: tacticalPositionProfile(player).primary,
    counterparty,
    stages,
    stageIndex: Math.max(0, Math.min(stages.length - 1, stageIndex)),
    headline,
    amount,
    dueLabel: due,
    dueDay,
    rival,
    negotiationId: n.id,
    expiring,
    sortKey: dueDay ?? Number.MAX_SAFE_INTEGER,
  };
}

/* ------------------------------------------------------------------ */
/* Loans → deals                                                      */
/* ------------------------------------------------------------------ */

function deskDealForLoan(state: GameState, loan: PlayerLoanAgreement): DeskDeal | null {
  const player = transferTargetPlayer(state, loan.playerId);
  if (!player) return null;
  const userIsParent = isUserClubReference(state, loan.parentClubId);
  const kind: DeskDealKind = userIsParent ? "loanOut" : "loanIn";
  const otherClub = userIsParent ? loan.loanClubId : loan.parentClubId;
  const active = loan.status === "Active";
  const weeksLeft = Math.max(0, loan.endAbsoluteWeek - nowWeek(state));
  return {
    id: `loan:${loan.id}`,
    kind,
    priority: active ? "waiting" : "completed",
    playerId: loan.playerId,
    playerName: playerName(player),
    position: tacticalPositionProfile(player).primary,
    counterparty: clubDisplayName(state, otherClub),
    stages: LOAN_STAGES,
    stageIndex: active ? 1 : 2,
    headline: active
      ? `${weeksLeft} week${weeksLeft === 1 ? "" : "s"} remaining · ${loan.playingTimeExpectation} role`
      : loan.status === "Terminated"
        ? "Loan ended early"
        : "Loan completed",
    amount: `${loan.loanClubWageContributionPct}% wages`,
    dueLabel: active ? (weeksLeft === 0 ? "returns this week" : `returns in ${weeksLeft}w`) : undefined,
    outcome: active ? undefined : loan.status,
    loanId: loan.id,
    expiring: active && weeksLeft <= 1,
    sortKey: loan.endAbsoluteWeek * 7,
  };
}

/* ------------------------------------------------------------------ */
/* Completed transfer history → deals                                 */
/* ------------------------------------------------------------------ */

function historyKind(state: GameState, record: GameState["football"]["transferHistory"][number]): DeskDealKind {
  if (record.outcome === "Signed") return "recruiting";
  if (record.outcome === "Sold") return "selling";
  const fromUs = isUserClubReference(state, record.fromClubId);
  return fromUs ? "selling" : "recruiting";
}

function deskDealsFromHistory(state: GameState): DeskDeal[] {
  if (!state.football) return [];
  return state.football.transferHistory
    .slice(-40)
    .reverse()
    .map((record) => {
      const player = transferTargetPlayer(state, record.playerId);
      const kind = historyKind(state, record);
      const recruiting = kind === "recruiting";
      const otherClub = recruiting ? record.fromClubId : record.toClubId;
      const stages = recruiting
        ? otherClub
          ? RECRUITING_CLUB_STAGES
          : RECRUITING_FREE_STAGES
        : SELLING_STAGES;
      return {
        id: `history:${record.id}`,
        kind,
        priority: "completed" as const,
        playerId: record.playerId,
        playerName: record.playerName,
        position: player ? tacticalPositionProfile(player).primary : record.position,
        counterparty: otherClub ? clubDisplayName(state, otherClub) : "Free agent",
        stages,
        stageIndex: stages.length - 1,
        headline:
          record.outcome === "Signed"
            ? `Signed for ${fmtMoney(record.fee)}`
            : record.outcome === "Sold"
              ? `Sold for ${fmtMoney(record.fee)}`
              : record.outcome,
        amount: record.fee > 0 ? fmtMoney(record.fee) : undefined,
        outcome: record.outcome,
        expiring: false,
        sortKey: -record.absoluteWeek,
      };
    });
}

/**
 * Every chairman-relevant transfer transaction in one stream.
 * Live negotiations beat duplicate history rows; live loans and recent
 * completed loans are included beside permanent business.
 */
export function transferDealStream(state: GameState): DeskDeal[] {
  if (!state.football) return [];
  const negotiations = state.football.negotiations
    .map((n) => deskDealForNegotiation(state, n))
    .filter((deal): deal is DeskDeal => Boolean(deal));
  const activeNegotiationIds = new Set(negotiations.map((deal) => deal.playerId));
  const loans = (state.football.loans ?? [])
    .filter((loan) =>
      isUserClubReference(state, loan.parentClubId) || isUserClubReference(state, loan.loanClubId),
    )
    .map((loan) => deskDealForLoan(state, loan))
    .filter((deal): deal is DeskDeal => Boolean(deal));
  const history = deskDealsFromHistory(state).filter(
    (deal) => !activeNegotiationIds.has(deal.playerId),
  );
  return [...negotiations, ...loans, ...history].sort((a, b) => {
    const pa = DESK_PRIORITY_ORDER.indexOf(a.priority);
    const pb = DESK_PRIORITY_ORDER.indexOf(b.priority);
    return pa - pb || a.sortKey - b.sortKey || a.playerName.localeCompare(b.playerName);
  });
}

export function groupDealsByPriority(deals: DeskDeal[]) {
  return DESK_PRIORITY_ORDER.map((priority) => ({
    priority,
    deals: deals.filter((deal) => deal.priority === priority),
  })).filter((group) => group.deals.length > 0);
}

/* ------------------------------------------------------------------ */
/* Header                                                             */
/* ------------------------------------------------------------------ */

export type DeskUrgency = "normal" | "closing" | "deadline";

export interface DeskWindowStatus {
  open: boolean;
  label: string;
  countdown: string;
  countdownShort: string;
  deadlineDay: boolean;
  hoursRemaining?: number;
}

export interface TransferDeskHeader {
  cash: number;
  minimumReserve: number;
  spendableAboveReserve: number;
  wageBillWeekly: number;
  wageBudgetWeekly: number;
  wageHeadroomWeekly: number | null;
  window: DeskWindowStatus;
  urgency: DeskUrgency;
  topPriority: (ManagerRecruitmentPriority & { managerName: string; level: string }) | null;
}

/** Calendar countdown in chairman language, not internal week numbers. */
export function transferDeskWindow(state: GameState): DeskWindowStatus {
  const current = windowStatus(state);
  const open = isTransferWindowOpen(state);
  const deadlineDay = isTransferDeadlineDay(state);
  if (deadlineDay) {
    const hours = transferDeadlineHoursRemaining(state);
    return {
      open: true,
      label: "Transfer window",
      countdown: `${hours}h left`,
      countdownShort: `${hours}h`,
      deadlineDay: true,
      hoursRemaining: hours,
    };
  }
  if (!open) {
    const targetWeek = state.week < WINDOW_PRESEASON_END ? 1 : CALENDAR.winterWindowStart;
    const weeks =
      state.week < WINDOW_PRESEASON_END
        ? Math.max(0, WINDOW_PRESEASON_END - state.week + 1)
        : state.week < CALENDAR.winterWindowStart
          ? Math.max(0, CALENDAR.winterWindowStart - state.week)
          : Math.max(0, CALENDAR.seasonEndWeek - state.week + 1);
    const first = state.week < WINDOW_PRESEASON_END ? "Closes" : "Opens";
    return {
      open: false,
      label: current.label,
      countdown: `${first} ${weeks ? `in ${weeks} week${weeks === 1 ? "" : "s"}` : `week ${targetWeek}`}`,
      countdownShort: weeks ? `${weeks}w` : `W${targetWeek}`,
      deadlineDay: false,
    };
  }

  const daysRemainingInWeek = Math.max(1, 7 - calendarDay(state));
  const deadlineWeek = isTransferDeadlineWeek(state);
  const targetWeek = state.week <= CALENDAR.preseasonWindowEnd ? CALENDAR.preseasonWindowEnd : CALENDAR.winterWindowEnd;
  const fullWeeks = Math.max(0, targetWeek - state.week);
  const totalDays = fullWeeks * 7 + daysRemainingInWeek;
  const countdown =
    totalDays <= 1
      ? "1 day left"
      : totalDays < 14
        ? `${totalDays} days left`
        : `${Math.ceil(totalDays / 7)} weeks left`;
  const countdownShort = totalDays < 7 ? `${totalDays}d` : `${Math.ceil(totalDays / 7)}w`;
  return {
    open: true,
    label: current.label,
    countdown,
    countdownShort,
    deadlineDay: deadlineWeek && calendarDay(state) === 6,
  };
}

export function userManager(state: GameState): Staff | null {
  return state.hiredStaff.find((staff) => staff.role === "Manager") ?? null;
}

function topManagerPriority(state: GameState): TransferDeskHeader["topPriority"] {
  const manager = userManager(state);
  if (!manager || !state.football) return null;
  const priority = managerRecruitmentBrief(state, manager).priorities[0];
  if (!priority) return null;
  return { ...priority, managerName: manager.name, level: priorityLevelLabel(priority) };
}

export function priorityLevelLabel(priority: ManagerRecruitmentPriority): string {
  return priority.playerLevel === "star"
    ? "Star"
    : priority.playerLevel === "startingXI"
      ? "Starter"
      : priority.playerLevel === "firstTeam"
        ? "First team"
        : priority.playerLevel === "prospect"
          ? "Prospect"
          : "Depth";
}

export function transferDeskHeader(state: GameState): TransferDeskHeader {
  const cash = remainingTransferBudget(state);
  const minimumReserve = state.finance?.budgets?.minimumCashReserve ?? 0;
  const wageBillWeekly = userWageBill(state);
  const wageBudgetWeekly = state.finance?.budgets?.wages ?? 0;
  const window = transferDeskWindow(state);
  return {
    cash,
    minimumReserve,
    spendableAboveReserve: Math.max(0, cash - minimumReserve),
    wageBillWeekly,
    wageBudgetWeekly,
    wageHeadroomWeekly: wageBudgetWeekly > 0 ? wageBudgetWeekly - wageBillWeekly : null,
    window,
    urgency: window.deadlineDay ? "deadline" : window.open && isTransferDeadlineWeek(state) ? "closing" : "normal",
    topPriority: topManagerPriority(state),
  };
}

/* ------------------------------------------------------------------ */
/* Squad & contracts                                                  */
/* ------------------------------------------------------------------ */

export type ContractRisk = "final24" | "final52" | "secure" | "none";

export const CONTRACT_RISK_LABEL: Record<ContractRisk, string> = {
  final24: "Final 24 weeks",
  final52: "Final year",
  secure: "Secure",
  none: "No contract",
};

export type ManagerUse = "starter" | "bench" | "outside" | "away";

export interface SquadContractRow {
  player: FootballPlayer;
  name: string;
  position: string;
  age: number;
  overall: number;
  marketValue: number;
  weeklyWage: number | null;
  contract: PlayerContract | null;
  weeksLeft: number | null;
  risk: ContractRisk;
  squadRole: string | null;
  employment: string | null;
  managerUse: ManagerUse;
  managerRole?: string;
  listed: boolean;
  liveDeal?: DeskDeal;
  loan?: {
    id: string;
    direction: "in" | "out";
    clubName: string;
    weeksLeft: number;
    wageContributionPct: number;
    playingTime: string;
  };
}

export function contractRisk(state: GameState, contract?: PlayerContract | null): ContractRisk {
  if (!contract) return "none";
  const weeks = weeksLeftOnContract(state, contract);
  if (weeks <= 24) return "final24";
  if (weeks <= 52) return "final52";
  return "secure";
}

function managerUseMap(state: GameState): Map<string, { use: ManagerUse; role?: string }> {
  const map = new Map<string, { use: ManagerUse; role?: string }>();
  const manager = userManager(state);
  if (!manager || !state.football) return map;
  const formation = managerMatchStyle(state).formation;
  const lineup = userMatchLineup(state, formation);
  const bench = userMatchBench(state, lineup);
  for (const player of lineup) map.set(player.playerId, { use: "starter", role: player.role });
  for (const player of bench) map.set(player.playerId, { use: "bench", role: player.role });
  return map;
}

export function squadContractRows(
  state: GameState,
  deals: DeskDeal[] = transferDealStream(state),
): SquadContractRow[] {
  if (!state.football) return [];
  const useMap = managerUseMap(state);
  const liveByPlayer = new Map(
    deals
      .filter((deal) => deal.priority !== "completed" && deal.negotiationId)
      .map((deal) => [deal.playerId, deal] as const),
  );
  const userLoans = (state.football.loans ?? []).filter(
    (loan) =>
      loan.status === "Active" &&
      (isUserClubReference(state, loan.parentClubId) || isUserClubReference(state, loan.loanClubId)),
  );
  const loanByPlayer = new Map(userLoans.map((loan) => [loan.playerId, loan] as const));
  const players = state.football.players.filter((player) => {
    const owned = isUserClubReference(state, playerOwnerClubId(player));
    const registered = isUserClubReference(state, playerRegisteredClubId(player));
    return owned || registered;
  });
  return players
    .map((player): SquadContractRow => {
      const contract = activeContract(state, player.id) ?? null;
      const loan = loanByPlayer.get(player.id);
      const registeredHere = isUserClubReference(state, playerRegisteredClubId(player));
      const ownerHere = isUserClubReference(state, playerOwnerClubId(player));
      const use = !registeredHere
        ? { use: "away" as const }
        : (useMap.get(player.id) ?? { use: "outside" as const });
      const direction: "in" | "out" | undefined = loan
        ? isUserClubReference(state, loan.parentClubId)
          ? "out"
          : "in"
        : undefined;
      return {
        player,
        name: playerName(player),
        position: tacticalPositionProfile(player).primary,
        age: ageOf(player, state.season),
        overall: player.currentAbility,
        marketValue: player.marketValue,
        weeklyWage: contract?.weeklyWage ?? null,
        contract,
        weeksLeft: contract ? Math.max(0, weeksLeftOnContract(state, contract)) : null,
        risk: contractRisk(state, contract),
        squadRole: contract?.squadRole ?? null,
        employment: contract && ownerHere ? contractEmploymentType(state, contract) : null,
        managerUse: use.use,
        managerRole: use.role,
        listed: player.transferStatus === "listed",
        liveDeal: liveByPlayer.get(player.id),
        loan:
          loan && direction
            ? {
                id: loan.id,
                direction,
                clubName: clubDisplayName(
                  state,
                  direction === "out" ? loan.loanClubId : loan.parentClubId,
                ),
                weeksLeft: Math.max(0, loan.endAbsoluteWeek - nowWeek(state)),
                wageContributionPct: loan.loanClubWageContributionPct,
                playingTime: loan.playingTimeExpectation,
              }
            : undefined,
      };
    })
    .sort(
      (a, b) =>
        a.player.primaryPosition.localeCompare(b.player.primaryPosition) ||
        b.overall - a.overall ||
        a.name.localeCompare(b.name),
    );
}

/** Human-readable operating model for the Squad & Contracts summary. */
export function clubEmploymentLabel(state: GameState): string {
  return clubOperatingModel(state) === "FullTime" ? "Full-time" : "Part-time";
}

/* ------------------------------------------------------------------ */
/* Market                                                             */
/* ------------------------------------------------------------------ */

export type MarketFilter = "all" | "shortlist" | "scouted" | "free" | "listed" | "loans";
export const MARKET_FILTER_LABEL: Record<MarketFilter, string> = {
  all: "All",
  shortlist: "Shortlist",
  scouted: "Scouted",
  free: "Free",
  listed: "Listed",
  loans: "Loans",
};

export interface MarketRow {
  player: FootballPlayer;
  name: string;
  age: number;
  position: Position;
  tacticalPosition: string;
  clubId: string | null;
  clubName: string;
  overallLabel: string;
  valueRange: [number, number] | null;
  knowledgePct: number;
  scouting: "none" | "active" | "complete";
  reportComplete: boolean;
  shortlisted: boolean;
  freeAgent: boolean;
  listed: boolean;
  loanAvailable: boolean;
  recommended: boolean;
  /** Manager priority rank (0 = top priority), null when it does not match a need. */
  priorityRank: number | null;
  negotiationId?: string;
}

function managerPriorityRank(state: GameState, player: FootballPlayer): number | null {
  const manager = userManager(state);
  if (!manager || !state.football) return null;
  const priorities = managerRecruitmentBrief(state, manager).priorities;
  const unit = player.primaryPosition;
  const tactical = tacticalPositionProfile(player);
  const index = priorities.findIndex(
    (p) => p.position === unit || (p.tacticalPosition && tactical.all.includes(p.tacticalPosition)),
  );
  return index >= 0 ? index : null;
}

function recommendedPlayerIds(state: GameState): Set<string> {
  const briefs = state.football?.scoutingDiscovery?.briefs ?? [];
  return new Set(
    briefs
      .filter((brief) => brief.status === "complete")
      .flatMap((brief) => brief.candidateIds),
  );
}

/**
 * Known market only. This intentionally begins with
 * chairmanRecruitmentPlayerIds; it never iterates the whole simulated player
 * database and therefore preserves scouting fog-of-war.
 */
export function transferMarketRows(state: GameState): MarketRow[] {
  if (!state.football) return [];
  const shortlist = new Set(chairmanShortlistIds(state));
  const recommended = recommendedPlayerIds(state);
  const knownIds = chairmanRecruitmentPlayerIds(state);
  const negotiations = openNegotiations(state);
  const rows: MarketRow[] = [];
  for (const playerId of knownIds) {
    const player = transferTargetPlayer(state, playerId);
    if (!player || isUserClubReference(state, playerOwnerClubId(player))) continue;
    const registered = playerRegisteredClubId(player);
    if (registered && isUserClubReference(state, registered)) continue;
    const contract = activeContract(state, player.id);
    const assignment = scoutingAssignment(state, player.id);
    const report = scoutingReport(state, player.id);
    const knowledgePct = Math.round(report.knowledge * 100);
    const presentation = scoutedOverallPresentation(state, player);
    const estimate = chairmanRecruitmentEstimate(state, player.id);
    const availability = loanInAvailabilityReason(state, player.id);
    rows.push({
      player,
      name: playerName(player),
      age: ageOf(player, state.season),
      position: player.primaryPosition,
      tacticalPosition: tacticalPositionProfile(player).primary,
      clubId: registered,
      clubName: registered ? clubDisplayName(state, registered) : "Free agent",
      overallLabel: presentation.label,
      valueRange: estimate ? [estimate.feeRange[0], estimate.feeRange[1]] : null,
      knowledgePct,
      scouting: assignment?.status ?? "none",
      reportComplete: assignment?.status === "complete",
      shortlisted: shortlist.has(player.id),
      freeAgent: !contract && !registered,
      listed: player.transferStatus === "listed",
      loanAvailable: availability === null,
      recommended: recommended.has(player.id),
      priorityRank: managerPriorityRank(state, player),
      negotiationId: negotiations.find((n) => n.playerId === player.id)?.id,
    });
  }
  return rows.sort((a, b) => {
    const ap = a.priorityRank ?? 99;
    const bp = b.priorityRank ?? 99;
    return (
      ap - bp ||
      Number(b.recommended) - Number(a.recommended) ||
      Number(b.shortlisted) - Number(a.shortlisted) ||
      b.knowledgePct - a.knowledgePct ||
      a.name.localeCompare(b.name)
    );
  });
}

export function marketRowMatches(row: MarketRow, filter: MarketFilter): boolean {
  switch (filter) {
    case "shortlist":
      return row.shortlisted;
    case "scouted":
      return row.scouting !== "none" || row.knowledgePct > 0;
    case "free":
      return row.freeAgent;
    case "listed":
      return row.listed;
    case "loans":
      return row.loanAvailable;
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ */
/* Football Department briefing                                       */
/* ------------------------------------------------------------------ */

export type DeskLens = "live" | "market" | "squad";

/** Where a briefing line takes the chairman. Always a real workspace target. */
export type DeskTarget =
  | { lens: "live"; focus?: DeskPriority; negotiationId?: string }
  | {
      lens: "market";
      filter?: MarketFilter;
      position?: Position;
      surface?: "recommended" | "reports";
    }
  | { lens: "squad"; focus?: "contracts" | "listed" };

/** A navigation request: a desk target plus the exact player/brief to open. */
export type DeskRequest = DeskTarget & {
  /** Market: player to focus inside Scouting reports. */
  focusPlayerId?: string;
  /** Market: brief whose results should open. */
  briefId?: string;
};

type RecruitmentDestination = Extract<InboxDestination, { tab: "recruitment" }>;

/** Map an Inbox deep link onto the desk's lenses without changing the destination contract. */
export function deskRequestForDestination(
  destination?: RecruitmentDestination | null,
): DeskRequest {
  if (!destination) return { lens: "live" };
  switch (destination.view) {
    case "operations":
      if ("negotiationId" in destination)
        return { lens: "live", negotiationId: destination.negotiationId };
      return destination.label === "Review contracts"
        ? { lens: "squad", focus: "contracts" }
        : { lens: "live" };
    case "sales":
      return { lens: "live", focus: "action" };
    case "reports":
      return { lens: "market", surface: "reports", focusPlayerId: destination.playerId };
    case "find":
      return { lens: "market", surface: "recommended", briefId: destination.briefId || undefined };
    default:
      return { lens: "live" };
  }
}

export interface DeskBriefingItem {
  id: string;
  /** Speaker: a hired staff member's role, or the department when unstaffed. */
  speaker: string;
  speakerName?: string;
  text: string;
  tone: "urgent" | "attention" | "info";
  target: DeskTarget;
}

const staffNamed = (state: GameState, ...roles: Staff["role"][]) =>
  roles.map((role) => state.hiredStaff.find((staff) => staff.role === role)).find(Boolean);

/**
 * Live, actionable lines derived from the existing staff and transfer
 * systems. Nothing is shown unless the underlying state supports it.
 */
export function footballDepartmentBriefing(
  state: GameState,
  deals: DeskDeal[] = transferDealStream(state),
): DeskBriefingItem[] {
  if (!state.football) return [];
  const items: DeskBriefingItem[] = [];
  const manager = userManager(state);

  if (manager) {
    const brief = managerRecruitmentBrief(state, manager);
    const top = brief.priorities[0];
    if (top) {
      const delegated = activeManagerRecruitmentAssignment(state, manager);
      const role = top.headline.replace(/ needed$/, "").toLowerCase();
      items.push({
        id: "manager-priority",
        speaker: "Manager",
        speakerName: manager.name,
        text: `${priorityLevelLabel(top)} ${role} still required${delegated ? " · scouts searching" : ""}`,
        tone: top.playerLevel === "startingXI" || top.playerLevel === "star" ? "attention" : "info",
        target: { lens: "market", position: top.position },
      });
    }
  }

  const transfersLead = staffNamed(state, "Head of Transfers");
  const transfersSpeaker = transfersLead ? "Head of Transfers" : "Recruitment";
  const action = deals.filter((deal) => deal.priority === "action");
  const responses = action.filter((deal) => deal.kind === "recruiting").length;
  const bids = action.filter((deal) => deal.kind === "selling").length;
  if (responses > 0) {
    items.push({
      id: "transfers-responses",
      speaker: transfersSpeaker,
      speakerName: transfersLead?.name,
      text: `${responses} club or agent response${responses === 1 ? "" : "s"} need${responses === 1 ? "s" : ""} attention`,
      tone: "urgent",
      target: { lens: "live", focus: "action" },
    });
  }
  if (bids > 0) {
    items.push({
      id: "transfers-bids",
      speaker: transfersSpeaker,
      speakerName: transfersLead?.name,
      text: `${bids} bid${bids === 1 ? "" : "s"} for our players awaiting a decision`,
      tone: "urgent",
      target: { lens: "live", focus: "action" },
    });
  }
  const rivals = deals.filter((deal) => deal.rival && deal.priority !== "completed");
  if (rivals.length > 0) {
    const first = rivals[0];
    items.push({
      id: "transfers-rivals",
      speaker: transfersSpeaker,
      speakerName: transfersLead?.name,
      text:
        rivals.length === 1
          ? `${first.rival!.clubName} are competing for ${first.playerName}`
          : `Rival clubs are competing for ${rivals.length} of our targets`,
      tone: "attention",
      target: { lens: "live", negotiationId: first.negotiationId },
    });
  }

  const scout = staffNamed(state, "Chief Scout", "Scout");
  const scoutSpeaker = scout?.role ?? "Scouting";
  const discovery = state.football.scoutingDiscovery?.briefs ?? [];
  const activeBrief = discovery.find((brief) => brief.status === "active");
  const owned = (playerId: string) => {
    const player = transferTargetPlayer(state, playerId);
    return !player || isUserClubReference(state, playerOwnerClubId(player));
  };
  const liveTargets = new Set(openNegotiations(state).map((n) => n.playerId));
  const fullReports = (state.football.scouting?.assignments ?? []).filter(
    (assignment) =>
      assignment.status === "complete" &&
      !owned(assignment.playerId) &&
      !liveTargets.has(assignment.playerId),
  ).length;
  const activeReports = (state.football.scouting?.assignments ?? []).filter(
    (assignment) => assignment.status === "active",
  ).length;
  if (fullReports > 0) {
    items.push({
      id: "scouting-reports",
      speaker: scoutSpeaker,
      speakerName: scout?.name,
      text: `${fullReports} full report${fullReports === 1 ? "" : "s"} ready to act on${activeReports ? ` · ${activeReports} still being watched` : ""}`,
      tone: "info",
      target: { lens: "market", filter: "scouted", surface: "reports" },
    });
  }
  const newest = [...discovery].filter((brief) => brief.status === "complete").sort((a,b)=>(b.createdAtDay??0)-(a.createdAtDay??0))[0];
  if (activeBrief) {
    const days = scoutingBriefDaysRemaining(state, activeBrief.id);
    items.push({
      id: "scouting-search",
      speaker: scoutSpeaker,
      speakerName: scout?.name,
      text: `${activeBrief.delegatedLabel ?? "Player search"} returns ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      tone: "info",
      target: { lens: "market", surface: "recommended" },
    });
  } else if (newest && newest.candidateIds.some((id) => !owned(id) && !liveTargets.has(id))) {
    const fresh = newest.candidateIds.filter((id) => !owned(id) && !liveTargets.has(id)).length;
    items.push({
      id: "scouting-recommended",
      speaker: scoutSpeaker,
      speakerName: scout?.name,
      text: `${fresh} recommended target${fresh === 1 ? "" : "s"} from the latest search`,
      tone: "info",
      target: { lens: "market", surface: "recommended" },
    });
  }

  const rows = squadContractRows(state, deals).filter((row) => row.loan?.direction !== "in");
  const final24 = rows.filter((row) => row.risk === "final24").length;
  const final52 = rows.filter((row) => row.risk === "final52").length;
  if (final24 > 0 || final52 > 0) {
    items.push({
      id: "contracts",
      speaker: "Contracts",
      speakerName: transfersLead?.name,
      text:
        final24 > 0
          ? `${final24} player${final24 === 1 ? "" : "s"} inside final 24 weeks`
          : `${final52} player${final52 === 1 ? "" : "s"} entering the final year`,
      tone: final24 > 0 ? "attention" : "info",
      target: { lens: "squad", focus: "contracts" },
    });
  }

  return items;
}

/** Whether recruitment can take the manager's needs right now, and why not. */
export function deskDelegation(state: GameState): {
  available: boolean;
  reason?: string;
  alreadyActive: boolean;
  hasNeeds: boolean;
} {
  const manager = userManager(state);
  if (!manager || !state.football)
    return {
      available: false,
      reason: "No manager in post",
      alreadyActive: false,
      hasNeeds: false,
    };
  const availability = recruitmentDelegationAvailability(state);
  const hasNeeds = managerRecruitmentBrief(state, manager).priorities.length > 0;
  const alreadyActive = Boolean(activeManagerRecruitmentAssignment(state, manager));
  return {
    available: availability.available && hasNeeds && !alreadyActive,
    reason: availability.reason,
    alreadyActive,
    hasNeeds,
  };
}

/** Counts for the lens switch badges. */
export function transferDeskCounts(deals: DeskDeal[]) {
  return {
    action: deals.filter((deal) => deal.priority === "action").length,
    today: deals.filter((deal) => deal.priority === "today").length,
    live: deals.filter((deal) => deal.priority !== "completed").length,
  };
}
