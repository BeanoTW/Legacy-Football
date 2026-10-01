import type { GameState, InboxChoice, InboxItem, ProjectEffect } from "./types";
import { postEntry } from "./finance";
import { isUserClubReference } from "./clubReference";
import { playerOwnerClubId } from "./playerRegistration";
import { absoluteWeek } from "./time";
import { RANDOM_INCIDENTS, randomIncidentById } from "./randomIncidents";
import {
  ASSET_CONFIG,
  assetById,
  recomputeDerived,
  syncLegacyStadium,
} from "./infrastructure";
import { startScouting } from "./scouting";
import { runWeeklyGenerators } from "./inbox";

export const DEV_MODE_KEY = "legacy-football:developer-mode";
export const DEV_CASH_TARGET = 999_999_999;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function developerModeEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DEV_MODE_KEY) === "1";
}

export function setDeveloperModeEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (enabled) localStorage.setItem(DEV_MODE_KEY, "1");
  else localStorage.removeItem(DEV_MODE_KEY);
}

export function developerSetInfiniteMoney(state: GameState): GameState {
  const next = structuredClone(state);
  const amount = Math.max(0, DEV_CASH_TARGET - next.cash);
  if (amount > 0) {
    postEntry(next, {
      category: "Miscellaneous",
      subcategory: "Developer mode",
      description: "Developer mode cash injection",
      amount,
      direction: "income",
      sourceSystem: "developer-mode",
      dedupeKey: `dev-money:s${next.season}:w${next.week}:n${next.financeLedger.length}`,
    });
  }
  next.inboxFlags["dev:infiniteMoney"] = true;
  return next;
}

export function developerBoostClub(state: GameState): GameState {
  const next = structuredClone(state);
  next.reputation = 100;
  next.fanHappiness = 100;
  next.clubReputations[next.clubName] = 100;
  if (next.football?.department) {
    next.football.department.recruitmentRating = 100;
    next.football.department.negotiationRating = 100;
    next.football.department.recruitmentReputation = 100;
  }
  next.inboxFlags["dev:boostedClub"] = true;
  return next;
}

export function developerBoostSquad(state: GameState): GameState {
  const next = structuredClone(state);
  let boosted = 0;
  for (const player of next.football.players) {
    const ownedByUser = isUserClubReference(next, playerOwnerClubId(player));
    const registeredWithUser = isUserClubReference(next, player.currentClubId);
    if (!ownedByUser && !registeredWithUser) continue;
    player.currentAbility = clamp(Math.max(player.currentAbility + 12, 88), 1, 95);
    player.potentialAbility = clamp(Math.max(player.potentialAbility, player.currentAbility + 2), player.currentAbility, 99);
    player.reputation = clamp(Math.max(player.reputation, player.currentAbility), 0, 100);
    player.marketValue = Math.max(player.marketValue, Math.round(player.currentAbility * player.currentAbility * 4_000));
    player.fitness = 100;
    player.injury = null;
    player.availability = "available";
    boosted += 1;
  }
  next.inboxFlags["dev:lastSquadBoostCount"] = boosted;
  return next;
}

export function developerHealSquad(state: GameState): GameState {
  const next = structuredClone(state);
  let healed = 0;
  for (const player of next.football.players) {
    const ownedByUser = isUserClubReference(next, playerOwnerClubId(player));
    const registeredWithUser = isUserClubReference(next, player.currentClubId);
    if (!ownedByUser && !registeredWithUser) continue;
    player.fitness = 100;
    player.injury = null;
    player.availability = "available";
    healed += 1;
  }
  next.inboxFlags["dev:lastHealCount"] = healed;
  return next;
}

export function developerInstantScout(state: GameState): GameState {
  let next = structuredClone(state);
  const targets = new Set<string>([
    ...(next.football.shortlist ?? []),
    ...((next.football.scouting?.assignments ?? []).map((assignment) => assignment.playerId)),
  ]);

  for (const playerId of targets) {
    next = startScouting(next, playerId);
  }

  next.football.scouting ??= { assignments: [] };
  const nowWeek = absoluteWeek(next.season, next.week);
  const nowDay = nowWeek * 7 + 6;
  for (const assignment of next.football.scouting.assignments) {
    if (!targets.has(assignment.playerId) && assignment.status !== "active") continue;
    assignment.weeksObserved = 6;
    assignment.status = "complete";
    assignment.startedAtDay ??= nowDay - 6;
    assignment.lastProgressDay = nowDay;
    assignment.lastProgressAbsoluteWeek = nowWeek;
  }
  next.inboxFlags["dev:lastInstantScoutCount"] = targets.size;
  return next;
}

function applyDeveloperProjectEffect(
  state: GameState,
  assetId: string,
  effect: ProjectEffect,
): void {
  const asset = assetById(state, assetId);
  if (!asset) return;
  switch (effect.kind) {
    case "condition":
      asset.condition = clamp(
        effect.to != null ? effect.to : asset.condition + (effect.add ?? 0),
        0,
        asset.maximumCondition,
      );
      return;
    case "maximumCondition":
      asset.maximumCondition = clamp(asset.maximumCondition + effect.add, 50, 100);
      asset.condition = Math.min(asset.condition, asset.maximumCondition);
      return;
    case "capacity":
      asset.capacity = Math.max(0, asset.capacity + effect.add);
      return;
    case "level":
      asset.level = clamp(asset.level + effect.add, 1, ASSET_CONFIG[asset.type].maxLevel);
      return;
    case "quality":
      asset.qualityRating = clamp(asset.qualityRating + effect.add, 0, 100);
      asset.maintenanceRequirement = clamp(asset.maintenanceRequirement - effect.add * 0.3, 10, 100);
      return;
    case "metadata":
      asset.metadata[effect.key] =
        effect.to != null
          ? effect.to
          : clamp((asset.metadata[effect.key] ?? 0) + (effect.add ?? 0), 0, 100_000);
      return;
    case "refurbish":
      asset.lastRefurbishedSeason = state.season;
      return;
    case "resetAge":
      asset.ageYears = 0;
      asset.openedSeason = state.season;
      return;
  }
}

export function developerCompleteProjects(state: GameState): GameState {
  const next = structuredClone(state);
  const nowAbs = absoluteWeek(next.season, next.week);
  let completed = 0;
  for (const project of next.infrastructure.projects) {
    if (!["approved", "active", "delayed"].includes(project.status)) continue;
    if (!project.effectsApplied) {
      for (const effect of project.effectsOnCompletion) {
        applyDeveloperProjectEffect(next, project.assetId, effect);
      }
      project.effectsApplied = true;
    }
    for (const payment of project.paymentSchedule) payment.paid = true;
    project.spentToDate = project.approvedBudget + project.costOverrun;
    project.weeksWorked = project.durationWeeks + project.delayWeeks;
    project.progress = 100;
    project.status = "completed";
    project.completedAtAbsoluteWeek = nowAbs;
    project.expectedCompletionAbsoluteWeek = nowAbs;
    project.history.push({ absoluteWeek: nowAbs, note: "Completed instantly in developer mode." });
    const asset = assetById(next, project.assetId);
    if (asset) asset.activeProjectId = null;
    completed += 1;
  }
  recomputeDerived(next);
  syncLegacyStadium(next);
  next.inboxFlags["dev:lastCompletedProjects"] = completed;
  return next;
}

export function developerMaxFacilities(state: GameState): GameState {
  const next = structuredClone(state);
  for (const asset of next.infrastructure.assets) {
    asset.level = ASSET_CONFIG[asset.type].maxLevel;
    asset.maximumCondition = 100;
    asset.condition = 100;
    asset.status = "operational";
    asset.ageYears = 0;
    asset.lastRefurbishedSeason = next.season;
    asset.activeProjectId = null;
    if (asset.type === "stand") asset.capacity = Math.max(asset.capacity, 25_000);
    for (const key of Object.keys(asset.metadata)) {
      asset.metadata[key] = Math.max(asset.metadata[key] ?? 0, 100);
    }
  }
  for (const project of next.infrastructure.projects) {
    if (["approved", "active", "delayed"].includes(project.status)) {
      project.status = "cancelled";
      project.progress = 100;
    }
  }
  recomputeDerived(next);
  syncLegacyStadium(next);
  next.inboxFlags["dev:maxFacilities"] = true;
  return next;
}

function developerIncidentChoices(
  state: GameState,
  incidentId: string,
  eventKey: string,
  conversationKey: string,
): InboxChoice[] {
  const incident = randomIncidentById(incidentId);
  if (!incident) return [];
  return incident.choices(state).map((choice) => ({
    ...choice,
    effects: [
      ...choice.effects,
      ...(incident.press
        ? [{
            kind: "scheduleGenerator" as const,
            generatorId: "random-incident-press",
            inWeeks: 1,
            payload: {
              incidentId,
              decisionId: choice.id,
              incidentEventKey: eventKey,
              conversationKey,
            },
          }]
        : []),
    ],
  }));
}

export function developerTriggerIncident(state: GameState, incidentId: string): GameState {
  const incident = randomIncidentById(incidentId);
  if (!incident) return state;
  const next = structuredClone(state);
  const nowAbs = absoluteWeek(next.season, next.week);
  const serial = next.inbox.length + next.scheduledGenerators.length + 1;
  const eventKey = `dev-random-incident:${incident.id}:s${next.season}:abs${nowAbs}:n${serial}`;
  const conversationKey = `incident:${incident.id}:s${next.season}:abs${nowAbs}:dev${serial}`;
  const item: InboxItem = {
    id: `dev-inbox-${nowAbs}-${serial}`,
    generatorId: "random-incident",
    eventKey,
    conversationKey,
    sender: incident.sender,
    department: incident.department,
    category: incident.category,
    subject: incident.subject(next),
    body: incident.body(next),
    priority: incident.priority,
    week: next.week,
    season: next.season,
    status: "awaitingDecision",
    choices: developerIncidentChoices(next, incident.id, eventKey, conversationKey),
  };
  next.inbox.push(item);
  next.inboxFlags["dev:lastIncident"] = incident.id;
  return next;
}

export function developerTriggerPressConference(state: GameState): GameState {
  const next = structuredClone(state);
  const nowAbs = absoluteWeek(next.season, next.week);
  const serial = next.inbox.length + 1;
  const context = "season-preview";
  next.inbox.push({
    id: `dev-press-${nowAbs}-${serial}`,
    generatorId: "calendar-press",
    eventKey: `dev-calendar-press:${context}:s${next.season}:n${serial}`,
    conversationKey: `calendar-press:${context}:s${next.season}:dev${serial}`,
    sender: "Local Press Pool",
    department: "Media",
    category: "media",
    subject: "Press conference — developer test",
    body: "Developer mode has opened a full press-room interaction.\n\nWhat should supporters expect from the club?",
    priority: "high",
    week: next.week,
    season: next.season,
    status: "awaitingDecision",
    choices: [
      {
        id: "transparent",
        label: "Judge us by what we actually deliver.",
        hint: "Direct and accountable.",
        effects: [],
      },
      {
        id: "reassure",
        label: "The plan is strong and the club is moving forward.",
        hint: "Confident without making a hard promise.",
        effects: [],
      },
      {
        id: "dismiss",
        label: "I'm not setting targets for headlines.",
        hint: "Push back on the premise.",
        effects: [],
      },
    ],
  });
  return next;
}

export function developerRunGenerators(state: GameState): GameState {
  return runWeeklyGenerators(state);
}

export function developerClearInbox(state: GameState): GameState {
  const next = structuredClone(state);
  next.inbox = [];
  next.scheduledGenerators = [];
  return next;
}

export const DEVELOPER_INCIDENT_OPTIONS = RANDOM_INCIDENTS.map((incident) => ({
  id: incident.id,
  label: incident.id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" "),
}));
