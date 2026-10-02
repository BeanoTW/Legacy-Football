import type { FootballPlayer, GameState, PlayerContract, Position } from "./types";
import { hashString, rngInt, rngRange, seededRng } from "./rng";
import { clubDisplayName, isUserClubReference, userClubReference } from "./clubReference";
import { footballLevelOfClub, footballLevelOfUser } from "./footballLevel";
import { clubOverallProfile, playerReputationForAbility } from "./playerOverall";
import { clubReputation } from "./reputation";
import { recruitmentPlayerValue, recruitmentWageForLevel } from "./recruitmentEconomy";
import { postEntry } from "./finance";
import { absoluteWeek } from "./time";
import { syncLegacySquad } from "./recruitment";

export type AcademyStatusId = 0 | 1 | 2 | 3 | 4 | 5;

export interface AcademyStatusDefinition {
  id: AcademyStatusId;
  name: string;
  maxFootballLevel: number;
  weeklyCost: number;
  upgradeCost: number;
  coaching: number;
  quality: number;
  maxScholarships: number;
  blurb: string;
}

export const ACADEMY_STATUSES: readonly AcademyStatusDefinition[] = [
  { id: 0, name: "No academy", maxFootballLevel: 8, weeklyCost: 0, upgradeCost: 0, coaching: 0, quality: 0, maxScholarships: 0, blurb: "The club relies on local triallists each summer." },
  { id: 1, name: "Youth Scheme", maxFootballLevel: 8, weeklyCost: 150, upgradeCost: 5_000, coaching: 0.08, quality: 0, maxScholarships: 4, blurb: "Evening sessions and a small scholarship programme." },
  { id: 2, name: "Development Centre", maxFootballLevel: 8, weeklyCost: 450, upgradeCost: 25_000, coaching: 0.16, quality: 2, maxScholarships: 6, blurb: "Full-time youth coaching and a proper under-18s programme." },
  { id: 3, name: "Category 3", maxFootballLevel: 6, weeklyCost: 1_100, upgradeCost: 90_000, coaching: 0.25, quality: 4, maxScholarships: 8, blurb: "A licensed academy with a regional catchment." },
  { id: 4, name: "Category 2", maxFootballLevel: 4, weeklyCost: 2_600, upgradeCost: 350_000, coaching: 0.35, quality: 7, maxScholarships: 10, blurb: "Professional development phase and sports science." },
  { id: 5, name: "Category 1", maxFootballLevel: 2, weeklyCost: 6_000, upgradeCost: 1_500_000, coaching: 0.5, quality: 11, maxScholarships: 12, blurb: "An elite academy capable of attracting top young talent." },
];

export const SCHOLAR_STIPEND = 15;
export const DECISION_DEADLINE_WEEK = 12;
const OFFER_DURATION_WEEKS = 4;
const OFFER_WEEKS = [14, 30];
const REPORT_WEEK = 24;

export interface AcademyProspect {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: FootballPlayer["dateOfBirth"];
  nationality: string;
  preferredFoot: FootballPlayer["preferredFoot"];
  position: Position;
  ability: number;
  potential: number;
  personality: FootballPlayer["personality"];
  joinedSeason: number;
  lastGain: number;
  extended?: boolean;
  golden?: boolean;
}

export interface AcademyOffer {
  id: string;
  prospectId: string;
  clubId: string;
  fee: number;
  expiresAtAbsoluteWeek: number;
}

export type AcademyGraduateOutcome = "promoted" | "released" | "sold";

export interface AcademyGraduate {
  prospectId: string;
  name: string;
  position: Position;
  season: number;
  outcome: AcademyGraduateOutcome;
  playerId?: string;
  fee?: number;
  clubId?: string;
}

export interface AcademyState {
  status: AcademyStatusId;
  scholarships: number;
  reputation: number;
  prospects: AcademyProspect[];
  offers: AcademyOffer[];
  graduates: AcademyGraduate[];
  lastIntakeSeason: number;
  intakeSeenSeason: number;
}

declare module "./types" {
  interface GameState {
    academy?: AcademyState;
  }
}

const FIRST = ["Aaron","Archie","Callum","Cameron","Dylan","Elliot","Finlay","Harry","Jamie","Kai","Lewis","Logan","Mason","Noah","Reece","Rory","Sam","Theo"];
const LAST = ["Bell","Campbell","Clark","Doyle","Fraser","Graham","Hamilton","Kelly","MacDonald","Murray","Reid","Ross","Stewart","Tait","Ward","Walsh","Wilson","Young"];
const NATIONS = ["England","Scotland","Wales","Northern Ireland","Ireland"];
const FEET: FootballPlayer["preferredFoot"][] = ["Right","Right","Right","Left","Both"];
const PERSONALITIES: FootballPlayer["personality"][] = ["Balanced","Ambitious","Loyal","Professional","Temperamental"];
const POSITIONS: Position[] = ["GK","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD"];

const clamp = (n:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, n));

export function academyState(state: GameState): AcademyState {
  return state.academy ?? {
    status: 0,
    scholarships: 0,
    reputation: 20,
    prospects: [],
    offers: [],
    graduates: [],
    lastIntakeSeason: 0,
    intakeSeenSeason: 0,
  };
}

function ensureAcademy(state: GameState): AcademyState {
  state.academy ??= academyState(state);
  return state.academy;
}

export const academyStatus = (state: GameState) => ACADEMY_STATUSES[academyState(state).status];
export const academyActive = (state: GameState) => academyState(state).status > 0;

export function prospectAge(state: GameState, prospect: Pick<AcademyProspect,"dateOfBirth">): number {
  return 2000 + state.season - 1 - prospect.dateOfBirth.year;
}

export function academyWeeklyCost(state: GameState): number {
  const academy = academyState(state);
  if (!academy.status) return 0;
  return ACADEMY_STATUSES[academy.status].weeklyCost + academy.prospects.length * SCHOLAR_STIPEND;
}

export function maxAcademyStatusFor(state: GameState): AcademyStatusId {
  const level = footballLevelOfUser(state);
  let best: AcademyStatusId = 0;
  for (const def of ACADEMY_STATUSES) if (level <= def.maxFootballLevel) best = def.id;
  return best;
}

function headOfYouth(state: GameState) {
  return state.hiredStaff.find((staff) => staff.role === "Head of Youth");
}

export function academyCoachingFactor(state: GameState): number {
  const academy = academyState(state);
  const def = ACADEMY_STATUSES[academy.status];
  const hoy = headOfYouth(state);
  const hoyDevelopment = hoy?.stats.development ?? 35;
  const training = clamp(state.trainingRating ?? 60, 20, 100);
  return 1 + def.coaching + (hoyDevelopment - 50) / 220 + (training - 60) / 500;
}

export function academyPotentialError(state: GameState): number {
  const scouting = headOfYouth(state)?.stats.scouting ?? 25;
  return scouting >= 85 ? 3 : scouting >= 70 ? 5 : scouting >= 55 ? 7 : scouting >= 40 ? 9 : 12;
}

export function estimatedPotential(state: GameState, prospect: AcademyProspect): number {
  const error = academyPotentialError(state);
  const rng = seededRng(state.saveSeed, "academy-potential-read", prospect.id);
  return clamp(prospect.potential + rngInt(rng, -error, error), prospect.ability, 95);
}

export function prospectStars(state: GameState, prospect: AcademyProspect): number {
  const profile = clubOverallProfile(state, userClubReference(state));
  const estimate = estimatedPotential(state, prospect);
  const relative = estimate - profile.average;
  return relative >= 10 ? 5 : relative >= 5 ? 4 : relative >= 0 ? 3 : relative >= -5 ? 2 : 1;
}

export function prospectReadiness(state: GameState, prospect: AcademyProspect): number {
  const profile = clubOverallProfile(state, userClubReference(state));
  return clamp(Math.round(50 + (prospect.ability - profile.average) * 5), 5, 100);
}

function pushInbox(state: GameState, eventKey: string, subject: string, body: string, priority: "normal"|"high" = "normal") {
  if (state.inbox.some((item) => item.eventKey === eventKey)) return;
  state.inbox.push({
    id: `inbox-${hashString(eventKey).toString(36)}`,
    generatorId: "academy",
    eventKey,
    sender: headOfYouth(state)?.name ?? "Academy",
    department: "Club",
    category: "information",
    subject,
    body,
    priority,
    week: state.week,
    season: state.season,
    status: "unread",
  });
}

function generateProspect(state: GameState, ordinal: number, golden: boolean): AcademyProspect {
  const academy = ensureAcademy(state);
  const def = ACADEMY_STATUSES[academy.status];
  const profile = clubOverallProfile(state, userClubReference(state));
  const hoyDevelopment = headOfYouth(state)?.stats.development ?? 30;
  const rng = seededRng(state.saveSeed, "academy-intake", state.season, ordinal);
  const age = rngInt(rng, 15, 17);
  const base = profile.floor - 5 + def.quality * 0.55 + academy.reputation / 30 + hoyDevelopment / 45;
  const ability = clamp(Math.round(base + rngRange(rng, -4, 4) + (golden ? 2 : 0)), 25, Math.min(72, profile.star - 1));
  const upside = rngRange(rng, 4, 15) + def.quality * 0.8 + academy.reputation / 18 + hoyDevelopment / 18 + (golden ? rngRange(rng, 5, 10) : 0);
  const potential = clamp(Math.round(Math.max(ability + 2, ability + upside)), ability, 92);
  const firstName = FIRST[rngInt(rng,0,FIRST.length-1)];
  const lastName = LAST[rngInt(rng,0,LAST.length-1)];
  return {
    id: `acad-${hashString(`${state.saveSeed}|s${state.season}|i${ordinal}|${firstName}|${lastName}`).toString(36)}`,
    firstName,
    lastName,
    dateOfBirth: { year: 2000 + state.season - 1 - age, month: rngInt(rng,1,12), day: rngInt(rng,1,28) },
    nationality: NATIONS[rngInt(rng,0,NATIONS.length-1)],
    preferredFoot: FEET[rngInt(rng,0,FEET.length-1)],
    position: POSITIONS[rngInt(rng,0,POSITIONS.length-1)],
    ability,
    potential,
    personality: PERSONALITIES[rngInt(rng,0,PERSONALITIES.length-1)],
    joinedSeason: state.season,
    lastGain: 0,
    golden,
  };
}

function runIntakeInPlace(state: GameState): void {
  const academy = state.academy;
  if (!academy || academy.status === 0 || academy.scholarships <= 0 || academy.lastIntakeSeason === state.season) return;
  const goldenRng = seededRng(state.saveSeed, "academy-golden", state.season);
  const golden = goldenRng() < 1 / 12;
  const intake = Array.from({ length: academy.scholarships }, (_, i) => generateProspect(state, i, golden));
  academy.prospects.push(...intake);
  academy.lastIntakeSeason = state.season;
  pushInbox(
    state,
    `academy:intake:s${state.season}`,
    golden ? "Intake day: a golden generation?" : "Academy intake day",
    `${intake.length} new scholars have joined the academy${golden ? ", and the coaches think this group could be special" : ""}. Meet them in the Academy.`,
    golden ? "high" : "normal",
  );
}

export function foundAcademy(state: GameState): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  if (academy.status > 0) return next;
  const def = ACADEMY_STATUSES[1];
  const entry = postEntry(next, {
    category: "Facilities",
    subcategory: "Academy",
    description: "Found Youth Scheme",
    amount: def.upgradeCost,
    direction: "expense",
    sourceSystem: "facilities",
    dedupeKey: `academy:found:s${next.season}:w${next.week}`,
  });
  if (!entry) return next;
  academy.status = 1;
  academy.scholarships = def.maxScholarships;
  runIntakeInPlace(next);
  return next;
}

export function upgradeAcademy(state: GameState): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  const target = (academy.status + 1) as AcademyStatusId;
  if (target > 5 || target > maxAcademyStatusFor(next)) return next;
  const def = ACADEMY_STATUSES[target];
  const entry = postEntry(next, {
    category: "Facilities",
    subcategory: "Academy",
    description: `Upgrade academy to ${def.name}`,
    amount: def.upgradeCost,
    direction: "expense",
    sourceSystem: "facilities",
    dedupeKey: `academy:upgrade:${target}:s${next.season}:w${next.week}`,
  });
  if (!entry) return next;
  academy.status = target;
  academy.scholarships = Math.min(def.maxScholarships, Math.max(academy.scholarships, Math.min(4, def.maxScholarships)));
  return next;
}

export function setAcademyScholarships(state: GameState, count: number): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  const max = ACADEMY_STATUSES[academy.status].maxScholarships;
  academy.scholarships = clamp(Math.round(count), academy.status ? 1 : 0, max);
  return next;
}

export function markAcademyIntakeSeen(state: GameState): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  academy.intakeSeenSeason = academy.lastIntakeSeason;
  return next;
}

export function academyIntakeNeedsReveal(state: GameState): boolean {
  const academy = academyState(state);
  return academy.status > 0 && academy.lastIntakeSeason > academy.intakeSeenSeason;
}

function graduateRecord(prospect: AcademyProspect, state: GameState, outcome: AcademyGraduateOutcome, extra: Partial<AcademyGraduate> = {}): AcademyGraduate {
  return { prospectId: prospect.id, name: `${prospect.firstName} ${prospect.lastName}`, position: prospect.position, season: state.season, outcome, ...extra };
}

export function graduateWage(state: GameState, prospect: AcademyProspect): number {
  return recruitmentWageForLevel(footballLevelOfUser(state), prospect.ability, clubReputation(state, userClubReference(state)), prospectAge(state, prospect), prospect.potential);
}

export function signAcademyProspect(state: GameState, prospectId: string): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  const prospect = academy.prospects.find((p) => p.id === prospectId);
  if (!prospect) return next;
  const clubId = userClubReference(next);
  const wage = graduateWage(next, prospect);
  const playerId = `academy-player-${prospect.id}`;
  const contractId = `academy-contract-${prospect.id}`;
  const level = footballLevelOfUser(next);
  const player: FootballPlayer = {
    id: playerId,
    firstName: prospect.firstName,
    lastName: prospect.lastName,
    dateOfBirth: prospect.dateOfBirth,
    nationality: prospect.nationality,
    preferredFoot: prospect.preferredFoot,
    primaryPosition: prospect.position,
    secondaryPositions: [],
    currentClubId: clubId,
    reputation: playerReputationForAbility(prospect.ability, level, clubReputation(next, clubId)),
    currentAbility: prospect.ability,
    potentialAbility: prospect.potential,
    marketValue: recruitmentPlayerValue(prospect.ability, prospect.potential, prospectAge(next, prospect), level),
    wageExpectation: wage,
    personality: prospect.personality,
    contractId,
    transferStatus: "unlisted",
    availability: "available",
    fitness: 100,
    injury: null,
    createdSeason: next.season,
  };
  const contract: PlayerContract = {
    id: contractId,
    playerId,
    clubId,
    startSeason: next.season,
    startWeek: next.week,
    expirySeason: next.season + 2,
    expiryWeek: next.week,
    weeklyWage: wage,
    squadRole: "Prospect",
    signingBonus: 0,
    agreedTransferFee: 0,
    status: "Active",
  };
  next.football.players.push(player);
  next.football.contracts.push(contract);
  academy.prospects = academy.prospects.filter((p) => p.id !== prospectId);
  academy.offers = academy.offers.filter((offer) => offer.prospectId !== prospectId);
  academy.graduates.push(graduateRecord(prospect, next, "promoted", { playerId }));
  academy.reputation = clamp(academy.reputation + 2, 0, 100);
  next.fanHappiness = clamp(next.fanHappiness + 1, 0, 100);
  syncLegacySquad(next);
  return next;
}

export function extendAcademyProspect(state: GameState, prospectId: string): GameState {
  const next = structuredClone(state);
  const prospect = next.academy?.prospects.find((p) => p.id === prospectId);
  if (prospect && prospectAge(next, prospect) >= 18 && !prospect.extended) prospect.extended = true;
  return next;
}

export function releaseAcademyProspect(state: GameState, prospectId: string): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  const prospect = academy.prospects.find((p) => p.id === prospectId);
  if (!prospect) return next;
  academy.prospects = academy.prospects.filter((p) => p.id !== prospectId);
  academy.offers = academy.offers.filter((offer) => offer.prospectId !== prospectId);
  academy.graduates.push(graduateRecord(prospect, next, "released"));
  return next;
}

export function acceptAcademyOffer(state: GameState, offerId: string): GameState {
  const next = structuredClone(state);
  const academy = ensureAcademy(next);
  const offer = academy.offers.find((o) => o.id === offerId);
  const prospect = offer ? academy.prospects.find((p) => p.id === offer.prospectId) : undefined;
  if (!offer || !prospect) return next;
  postEntry(next, {
    category: "Transfers",
    subcategory: "Academy compensation",
    description: `${prospect.firstName} ${prospect.lastName} joins ${clubDisplayName(next, offer.clubId)}`,
    amount: offer.fee,
    direction: "income",
    sourceSystem: "transfers",
    linkedEntityId: prospect.id,
    dedupeKey: `academy:offer:${offer.id}`,
  });
  academy.prospects = academy.prospects.filter((p) => p.id !== prospect.id);
  academy.offers = academy.offers.filter((o) => o.prospectId !== prospect.id);
  academy.graduates.push(graduateRecord(prospect, next, "sold", { fee: offer.fee, clubId: offer.clubId }));
  academy.reputation = clamp(academy.reputation + 4, 0, 100);
  return next;
}

export function rejectAcademyOffer(state: GameState, offerId: string): GameState {
  const next = structuredClone(state);
  if (next.academy) next.academy.offers = next.academy.offers.filter((offer) => offer.id !== offerId);
  return next;
}

export function decisionsDue(state: GameState): AcademyProspect[] {
  return academyState(state).prospects.filter((p) => prospectAge(state, p) >= (p.extended ? 19 : 18));
}

function developProspect(state: GameState, prospect: AcademyProspect): void {
  const age = prospectAge(state, prospect) - 1;
  const rng = seededRng(state.saveSeed, "academy-development", prospect.id, state.season);
  const base = age <= 16 ? rngRange(rng, 1.5, 4.2) : age <= 18 ? rngRange(rng, 1, 3.4) : rngRange(rng, 0.3, 2);
  const personality = prospect.personality === "Professional" ? 1.15 : prospect.personality === "Temperamental" ? 0.9 : 1;
  const gain = clamp(Math.round(base * academyCoachingFactor(state) * personality), 0, Math.max(0, prospect.potential - prospect.ability));
  prospect.ability = clamp(prospect.ability + gain, 20, prospect.potential);
  prospect.lastGain = gain;
}

function generateOffers(state: GameState, now: number): void {
  const academy = state.academy;
  if (!academy) return;
  const userLevel = footballLevelOfUser(state);
  const bigger = (state.leagues ?? [])
    .flatMap((league) => league.clubIds ?? [])
    .filter((clubId) => !isUserClubReference(state, clubId) && footballLevelOfClub(state, clubId) < userLevel)
    .sort();
  if (!bigger.length) return;
  const profile = clubOverallProfile(state, userClubReference(state));
  for (const prospect of academy.prospects) {
    if (academy.offers.some((offer) => offer.prospectId === prospect.id)) continue;
    if (prospect.potential < profile.star + 2) continue;
    const rng = seededRng(state.saveSeed, "academy-offer", prospect.id, state.season, state.week);
    if (rng() > 0.35) continue;
    const clubId = bigger[rngInt(rng, 0, bigger.length - 1)];
    const buyerLevel = footballLevelOfClub(state, clubId);
    const value = recruitmentPlayerValue(prospect.ability, prospect.potential, prospectAge(state, prospect), buyerLevel);
    const fee = Math.max(1_000, Math.round((value * rngRange(rng, 1.05, 1.4)) / 500) * 500);
    const offer: AcademyOffer = {
      id: `ao-${hashString(`${state.saveSeed}|${prospect.id}|s${state.season}|w${state.week}`).toString(36)}`,
      prospectId: prospect.id,
      clubId,
      fee,
      expiresAtAbsoluteWeek: now + OFFER_DURATION_WEEKS,
    };
    academy.offers.push(offer);
    pushInbox(state, `academy:offer:${offer.id}`, `${clubDisplayName(state, clubId)} want ${prospect.firstName} ${prospect.lastName}`, `${clubDisplayName(state, clubId)} have offered £${fee.toLocaleString()} in compensation. The approach stays open for four weeks.`, "high");
  }
}

export function runAcademyWeek(state: GameState): void {
  const academy = state.academy;
  if (!academy || academy.status === 0) return;
  postEntry(state, {
    category: "Facilities",
    subcategory: "Academy",
    description: `${ACADEMY_STATUSES[academy.status].name}: coaching and ${academy.prospects.length} scholarships`,
    amount: academyWeeklyCost(state),
    direction: "expense",
    sourceSystem: "facilities",
    recurring: true,
    dedupeKey: `academy:s${state.season}:w${state.week}`,
    metadata: { legacyBucket: "trainingOps" },
  });

  const now = absoluteWeek(state.season, state.week);
  academy.offers = academy.offers.filter((offer) => offer.expiresAtAbsoluteWeek >= now);

  if (state.week === DECISION_DEADLINE_WEEK + 1) {
    const overdue = decisionsDue(state);
    for (const prospect of overdue) {
      academy.prospects = academy.prospects.filter((p) => p.id !== prospect.id);
      academy.offers = academy.offers.filter((offer) => offer.prospectId !== prospect.id);
      academy.graduates.push(graduateRecord(prospect, state, "released"));
    }
    if (overdue.length) pushInbox(state, `academy:lapsed:s${state.season}`, "Scholars released at the deadline", `No decision was made in time for ${overdue.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}.`);
  }

  if (state.week === REPORT_WEEK && academy.prospects.length) {
    const top = [...academy.prospects].sort((a,b) => b.potential-a.potential).slice(0,3);
    pushInbox(state, `academy:report:s${state.season}`, "Academy progress report", `Ones to watch: ${top.map((p) => `${p.firstName} ${p.lastName} (${p.position}, ${prospectAge(state,p)})`).join("; ")}.`);
  }
  if (OFFER_WEEKS.includes(state.week)) generateOffers(state, now);
}

export function runAcademySeasonRollover(state: GameState): void {
  const academy = state.academy;
  if (!academy) return;

  const cap = maxAcademyStatusFor(state);
  if (academy.status > cap) {
    const from = ACADEMY_STATUSES[academy.status].name;
    academy.status = cap;
    academy.scholarships = Math.min(academy.scholarships, ACADEMY_STATUSES[cap].maxScholarships);
    pushInbox(state, `academy:downgrade:s${state.season}`, "Academy status reduced", `At this level of football the club cannot retain ${from} status. The academy now operates as ${ACADEMY_STATUSES[cap].name}.`, "high");
  }
  if (academy.status === 0) return;

  for (const prospect of academy.prospects) developProspect(state, prospect);
  runIntakeInPlace(state);

  const due = decisionsDue(state);
  if (due.length) pushInbox(state, `academy:decisions:s${state.season}`, `${due.length} scholar${due.length === 1 ? "" : "s"} need a decision`, `${due.map((p) => `${p.firstName} ${p.lastName}`).join(", ")} have reached the end of their scholarship. Sign, extend once, or release them by week ${DECISION_DEADLINE_WEEK}.`, "high");
}
