import type { FixtureResult, GameState, MatchRecord, TransferRecord } from "./types";
import { hashString } from "./rng";
import { clubDisplayName, isUserClubReference } from "./clubReference";
import { clubPresentationName } from "./clubPresentation";
import { playerLeagueId } from "./league";
import { clubFootballStrength } from "./footballStrength";
import { aiClubManager } from "./aiClubManager";
import { managerFootballIdentity } from "./managerIdentity";
import { supporterEventArticles } from "./supporterEventNews";
import type { SupporterEventId } from "./supporterEvents";
import type { EventOutcome } from "./supporterEventPresentation";

export type NewsKind =
  | "matchReport"
  | "roundUp"
  | "upset"
  | "transfer"
  | "appointment"
  | "tableWatch"
  | "season"
  | "clubIncident"
  | "pressConference";

export interface NewsPublication {
  name: string;
  handle: string;
  mark: string;
  tone: "local" | "league" | "wire" | "touchline";
}

export interface NewsScoreline {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  label: string;
}

export interface NewsQuote {
  speaker: string;
  role: string;
  text: string;
  chairman?: boolean;
}

export interface NewsArticle {
  id: string;
  kind: NewsKind;
  season: number;
  week: number;
  publication: NewsPublication;
  byline: string;
  headline: string;
  standfirst: string;
  body: string[];
  scoreline?: NewsScoreline;
  facts?: { label: string; value: string }[];
  quote?: NewsQuote;
  communityEvent?: {
    eventId: SupporterEventId;
    phase: "announcement" | "result";
    outcome: EventOutcome | null;
    sarahFeatured?: boolean;
    sarahRole?: string;
  };
  tags: string[];
  involvesUser: boolean;
  reactions: { likes: number; comments: number; shares: number };
}

const PUBLICATIONS = {
  local: { name: "The Terrace Gazette", handle: "@TerraceGazette", mark: "TG", tone: "local" },
  league: { name: "Pyramid Weekly", handle: "@PyramidWeekly", mark: "PW", tone: "league" },
  wire: { name: "Transfer Wire", handle: "@TransferWire", mark: "TW", tone: "wire" },
  touchline: { name: "The Touchline", handle: "@TheTouchline", mark: "TT", tone: "touchline" },
} satisfies Record<string, NewsPublication>;

const REPORTERS = [
  "Dan Holloway",
  "Sarah Pike",
  "Marcus Reid",
  "Aoife Brennan",
  "Tom Ashcroft",
  "Priya Nair",
  "Gareth Lloyd",
  "Jess Morton",
] as const;

const pick = <T,>(key: string, items: readonly T[]): T =>
  items[(hashString(key) >>> 0) % items.length];

const clubName = (state: GameState, ref: string) =>
  clubPresentationName(clubDisplayName(state, ref));

const money = (value: number) =>
  value >= 1_000_000
    ? `£${(value / 1_000_000).toFixed(1)}m`
    : value >= 1_000
      ? `£${Math.round(value / 1_000)}k`
      : `£${Math.round(value)}`;

const ordinal = (value: number) => {
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"] as const)[value % 10] ?? "th";
  return `${value}${suffix}`;
};

function reactions(key: string, weight = 1): NewsArticle["reactions"] {
  const base = hashString(`${key}|reactions`) >>> 0;
  return {
    likes: Math.round((40 + (base % 260)) * weight),
    comments: Math.round((4 + ((base >>> 8) % 60)) * weight),
    shares: Math.round((2 + ((base >>> 16) % 30)) * weight),
  };
}

function currentPosition(state: GameState): number | null {
  const rows = [...(state.league ?? [])].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team),
  );
  const index = rows.findIndex((row) => isUserClubReference(state, row.team));
  return index >= 0 ? index + 1 : null;
}

function matchReport(state: GameState, result: FixtureResult): NewsArticle {
  const us = clubPresentationName(state.clubName);
  const them = clubName(state, result.opponent);
  const home = result.home ? us : them;
  const away = result.home ? them : us;
  const homeGoals = result.home ? result.goalsFor : result.goalsAgainst;
  const awayGoals = result.home ? result.goalsAgainst : result.goalsFor;
  const margin = result.goalsFor - result.goalsAgainst;
  const competition =
    result.competition === "preseason"
      ? "Pre-season friendly"
      : result.competition === "leagueCup"
        ? "League Cup"
        : result.competition === "faCup"
          ? "National Cup"
          : "League";
  const key = `report|${state.saveSeed}|${state.season}|${result.week}|${result.opponent}|${competition}`;

  const headline =
    margin >= 3
      ? pick(key, [`${us} run riot against ${them}`, `Ruthless ${us} sweep aside ${them}`])
      : margin > 0
        ? pick(key, [`${us} get the job done against ${them}`, `Hard-earned win for ${us}`])
        : margin === 0
          ? pick(key, [`Honours even between ${us} and ${them}`, `${us} and ${them} share the spoils`])
          : margin <= -3
            ? pick(key, [`Chastening afternoon for ${us}`, `${them} hand ${us} a harsh lesson`])
            : pick(key, [`${them} edge out ${us}`, `No way through for ${us}`]);

  const body = [
    result.home && result.attendance
      ? `${us} finished ${result.goalsFor}-${result.goalsAgainst} against ${them} in front of ${result.attendance.toLocaleString()} supporters.`
      : `${us} finished ${result.goalsFor}-${result.goalsAgainst} against ${them}.`,
  ];
  const position = competition === "League" ? currentPosition(state) : null;
  if (position) body.push(`The result leaves ${us} ${ordinal(position)} in the table.`);

  const quote =
    Math.abs(margin) >= 3
      ? {
          speaker: state.managerName,
          role: `${us} chairman`,
          chairman: true,
          text:
            margin > 0
              ? pick(`${key}|quote`, [
                  "Days like this are why we do it. The supporters deserved that performance.",
                  "We keep our feet on the ground, but it is a special feeling when it clicks like that.",
                ])
              : pick(`${key}|quote`, [
                  "It hurts, and it should. We regroup and we respond.",
                  "The fans deserved more. We know that, and we will put it right.",
                ]),
        }
      : undefined;

  return {
    id: key,
    kind: "matchReport",
    season: state.season,
    week: result.week,
    publication: PUBLICATIONS.local,
    byline: pick(`${key}|byline`, REPORTERS),
    headline,
    standfirst: `${competition} · ${home} ${homeGoals}-${awayGoals} ${away}`,
    body,
    scoreline: { home, away, homeGoals, awayGoals, label: competition },
    facts: [
      ...(result.home && result.attendance
        ? [{ label: "Attendance", value: result.attendance.toLocaleString() }]
        : []),
      ...(position ? [{ label: "League position", value: ordinal(position) }] : []),
    ],
    quote,
    tags: [us, them, competition],
    involvesUser: true,
    reactions: reactions(key, Math.abs(margin) >= 3 ? 2.1 : 1.35),
  };
}

function roundUp(state: GameState, week: number, records: MatchRecord[]): NewsArticle | null {
  if (!records.length) return null;
  const key = `roundup|${state.saveSeed}|${state.season}|${week}|${playerLeagueId(state)}`;
  const goals = records.reduce((sum, record) => sum + record.homeGoals + record.awayGoals, 0);
  const draws = records.filter((record) => record.homeGoals === record.awayGoals).length;
  const facts = records
    .slice()
    .sort((a, b) => a.home.localeCompare(b.home))
    .map((record) => ({
      label: `${clubName(state, record.home)} v ${clubName(state, record.away)}`,
      value: `${record.homeGoals}-${record.awayGoals}`,
    }));
  return {
    id: key,
    kind: "roundUp",
    season: state.season,
    week,
    publication: PUBLICATIONS.league,
    byline: pick(`${key}|byline`, REPORTERS),
    headline: `${goals} goals, ${draws} draw${draws === 1 ? "" : "s"}: the round in brief`,
    standfirst: `Every result from week ${week} around the division.`,
    body: facts.map((fact) => `${fact.label}: ${fact.value}.`),
    facts,
    tags: ["League", "Round-up"],
    involvesUser: records.some(
      (record) =>
        isUserClubReference(state, record.home) || isUserClubReference(state, record.away),
    ),
    reactions: reactions(key),
  };
}

function upsets(state: GameState, records: MatchRecord[]): NewsArticle[] {
  const out: NewsArticle[] = [];
  for (const record of records) {
    if (isUserClubReference(state, record.home) || isUserClubReference(state, record.away)) continue;
    if (record.homeGoals === record.awayGoals) continue;
    const winner = record.homeGoals > record.awayGoals ? record.home : record.away;
    const loser = winner === record.home ? record.away : record.home;
    const winnerStrength = clubFootballStrength(state, winner, record.season);
    const loserStrength = clubFootballStrength(state, loser, record.season);
    if (loserStrength - winnerStrength < 6) continue;
    const key = `upset|${record.id}`;
    out.push({
      id: key,
      kind: "upset",
      season: record.season,
      week: record.week,
      publication: PUBLICATIONS.touchline,
      byline: pick(`${key}|byline`, REPORTERS),
      headline: `${clubName(state, winner)} stun ${clubName(state, loser)}`,
      standfirst: `${clubName(state, record.home)} ${record.homeGoals}-${record.awayGoals} ${clubName(state, record.away)}`,
      body: [
        `${clubName(state, winner)} produced one of the round's standout results, beating a side rated notably stronger on paper.`,
        `The result is another reminder that the pyramid rarely follows the script.`,
      ],
      scoreline: {
        home: clubName(state, record.home),
        away: clubName(state, record.away),
        homeGoals: record.homeGoals,
        awayGoals: record.awayGoals,
        label: "League",
      },
      tags: [clubName(state, winner), clubName(state, loser), "Upset"],
      involvesUser: false,
      reactions: reactions(key, 1.6),
    });
  }
  return out;
}

function transferArticle(state: GameState, record: TransferRecord): NewsArticle | null {
  if ((record.type !== "transfer" && record.type !== "freeTransfer") || !record.toClubId) return null;
  const to = clubName(state, record.toClubId);
  const from = record.fromClubId ? clubName(state, record.fromClubId) : null;
  const involvesUser =
    isUserClubReference(state, record.toClubId) ||
    (record.fromClubId ? isUserClubReference(state, record.fromClubId) : false);
  const key = `transfer|${record.id}`;
  const fee = record.fee > 0 ? money(record.fee) : "Free";
  return {
    id: key,
    kind: "transfer",
    season: record.season,
    week: record.week,
    publication: PUBLICATIONS.wire,
    byline: pick(`${key}|byline`, REPORTERS),
    headline:
      record.fee > 0
        ? `${to} land ${record.playerName} for ${fee}`
        : `${record.playerName} joins ${to}`,
    standfirst: `${from ?? "Free agent"} → ${to}`,
    body: [
      record.fee > 0
        ? `${to} have completed the signing of ${record.playerName}${from ? ` from ${from}` : ""} for ${fee}.`
        : `${record.playerName} has signed for ${to}${from ? `, leaving ${from}` : " as a free agent"}.`,
    ],
    facts: [
      { label: "Position", value: record.position },
      { label: "Fee", value: fee },
    ],
    tags: [to, ...(from ? [from] : []), "Transfers"],
    involvesUser,
    reactions: reactions(key, involvesUser ? 2.4 : 0.9),
  };
}

function appointments(state: GameState): NewsArticle[] {
  if (state.season <= 1) return [];
  const league = (state.leagues ?? []).find((entry) => entry.id === playerLeagueId(state));
  const articles: NewsArticle[] = [];
  for (const club of league?.clubIds ?? []) {
    if (isUserClubReference(state, club)) continue;
    const now = aiClubManager(state, club, state.season);
    const before = aiClubManager(state, club, state.season - 1);
    if (now.id === before.id) continue;
    const identity = managerFootballIdentity(now);
    const key = `appointment|${now.id}`;
    const name = clubName(state, club);
    articles.push({
      id: key,
      kind: "appointment",
      season: state.season,
      week: 1,
      publication: PUBLICATIONS.touchline,
      byline: pick(`${key}|byline`, REPORTERS),
      headline: `${name} appoint ${now.name} as manager`,
      standfirst: `${before.name} departs after his spell in charge.`,
      body: [
        `${name} have named ${now.name} as their new manager, replacing ${before.name}.`,
        `His preferred shape is ${identity.preferredFormation}, with a ${identity.philosophy.toLowerCase()} approach.`,
      ],
      facts: [
        { label: "Shape", value: identity.preferredFormation },
        { label: "Approach", value: identity.philosophy },
        { label: "Pressing", value: identity.pressing },
      ],
      tags: [name, "Managers"],
      involvesUser: false,
      reactions: reactions(key, 1.1),
    });
  }
  return articles;
}

function tableWatch(state: GameState): NewsArticle | null {
  const rows = [...(state.league ?? [])].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team),
  );
  if (rows.length < 4 || (rows[0]?.p ?? 0) < 4) return null;
  const leader = rows[0];
  const second = rows[1];
  const bottom = rows[rows.length - 1];
  const gap = leader.pts - second.pts;
  const key = `table|${state.saveSeed}|${state.season}|${Math.floor(state.week / 4)}`;
  const position = currentPosition(state);
  return {
    id: key,
    kind: "tableWatch",
    season: state.season,
    week: Math.max(1, state.week - 1),
    publication: PUBLICATIONS.league,
    byline: pick(`${key}|byline`, REPORTERS),
    headline:
      gap >= 5
        ? `${clubName(state, leader.team)} pulling clear at the top`
        : gap === 0
          ? "Nothing to separate the leaders"
          : `${clubName(state, leader.team)} lead a tight title race`,
    standfirst: `Where the division stands after ${leader.p} games.`,
    body: [
      `${clubName(state, leader.team)} sit top on ${leader.pts} points, ${gap === 0 ? "level with" : `${gap} ahead of`} ${clubName(state, second.team)}.`,
      `At the bottom, ${clubName(state, bottom.team)} have ${bottom.pts} point${bottom.pts === 1 ? "" : "s"}.`,
      ...(position ? [`${clubPresentationName(state.clubName)} are ${ordinal(position)}.`] : []),
    ],
    facts: rows.slice(0, 6).map((row, index) => ({
      label: `${index + 1}. ${clubName(state, row.team)}`,
      value: `${row.pts} pts`,
    })),
    tags: ["League", "Table"],
    involvesUser: false,
    reactions: reactions(key),
  };
}

function seasonVerdicts(state: GameState): NewsArticle[] {
  const histories = (state.seasonHistory ?? []).filter(
    (entry) =>
      entry.season === state.season - 1 &&
      (entry.leagueId === playerLeagueId(state) ||
        entry.finalTable.some((row) => isUserClubReference(state, row.team))),
  );
  return histories.map((entry) => {
    const key = `season|${entry.season}|${entry.leagueId}`;
    const champion = clubName(state, entry.champion);
    return {
      id: key,
      kind: "season" as const,
      season: state.season,
      week: 1,
      publication: PUBLICATIONS.league,
      byline: pick(`${key}|byline`, REPORTERS),
      headline: `${champion} crowned ${entry.leagueName} champions`,
      standfirst: `Season ${entry.season} in review.`,
      body: [
        `${champion} finished top of ${entry.leagueName}${entry.runnerUp ? `, ahead of ${clubName(state, entry.runnerUp)}` : ""}.`,
        ...(entry.promoted.length
          ? [`Promoted: ${entry.promoted.map((club) => clubName(state, club)).join(", ")}.`]
          : []),
        ...(entry.relegated.length
          ? [`Relegated: ${entry.relegated.map((club) => clubName(state, club)).join(", ")}.`]
          : []),
      ],
      tags: [champion, "Season review"],
      involvesUser: entry.finalTable.some((row) => isUserClubReference(state, row.team)),
      reactions: reactions(key, 2),
    };
  });
}

function firstParagraph(text: string): string {
  return text.split(/\n\s*\n/).map((part) => part.trim()).find(Boolean) ?? text.trim();
}

function livingClubArticles(state: GameState): NewsArticle[] {
  const articles: NewsArticle[] = [];
  const us = clubPresentationName(state.clubName);

  for (const item of state.inbox ?? []) {
    if (item.generatorId === "random-incident" && (item.status === "completed" || item.status === "expired")) {
      const key = `club-incident|${item.eventKey}`;
      const choice = item.choices?.find((candidate) => candidate.id === item.chosenChoiceId);
      const decision = choice?.label ?? "No decision before the deadline";
      const subject = item.subject.replace(/[.!?]+$/, "");
      articles.push({
        id: key,
        kind: "clubIncident",
        season: item.season,
        week: item.week,
        publication: PUBLICATIONS.local,
        byline: pick(`${key}|byline`, REPORTERS),
        headline: `${us} respond to ${subject.toLowerCase()}`,
        standfirst: item.status === "expired" ? "The club allowed the decision deadline to pass." : `Chairman decision: ${decision}`,
        body: [
          firstParagraph(item.body),
          item.status === "expired"
            ? "The club did not announce a course of action before the chairman's deadline expired."
            : `The chairman's recorded decision was: ${decision}.`,
        ],
        facts: [
          { label: "Department", value: item.department },
          { label: "Decision", value: decision },
        ],
        tags: [us, "Club decision", item.department],
        involvesUser: true,
        reactions: reactions(key, item.priority === "urgent" ? 2.5 : item.priority === "high" ? 1.9 : 1.35),
      });
      continue;
    }

    if (item.generatorId === "fans-ticket-price-pressure" && (item.status === "completed" || item.status === "expired")) {
      const key = `ticket-pressure|${item.eventKey}`;
      const choice = item.choices?.find((candidate) => candidate.id === item.chosenChoiceId);
      const decision = choice?.label ?? "No chairman response before the deadline";
      articles.push({
        id: key,
        kind: "clubIncident",
        season: item.season,
        week: item.week,
        publication: PUBLICATIONS.local,
        byline: pick(`${key}|byline`, REPORTERS),
        headline:
          item.status === "expired"
            ? `Supporters accuse ${us} board of ignoring ticket-price row`
            : `${us} chairman responds to ticket-price pressure`,
        standfirst:
          item.status === "expired"
            ? "The Supporters' Trust says its challenge went unanswered."
            : `Chairman decision: ${decision}`,
        body: [
          firstParagraph(item.body),
          item.status === "expired"
            ? "The club did not announce a response before the deadline passed."
            : `The chairman's recorded response was: ${decision}.`,
        ],
        facts: [
          { label: "Issue", value: "Ticket prices" },
          { label: "Decision", value: decision },
        ],
        tags: [us, "Supporters", "Ticket prices"],
        involvesUser: true,
        reactions: reactions(key, item.status === "expired" || item.chosenChoiceId === "hold" ? 2.3 : 1.7),
      });
      continue;
    }

    if ((item.generatorId === "random-incident-press" || item.generatorId === "calendar-press") && item.status === "completed" && item.pressConference) {
      const key = `press-conference|${item.eventKey}`;
      const subject = item.subject.replace(/^Press conference\s*[—-]\s*/i, "").replace(/[.!?]+$/, "");
      const exchanges = item.pressConference.exchanges;
      articles.push({
        id: key,
        kind: "pressConference",
        season: item.season,
        week: item.week,
        publication: PUBLICATIONS.touchline,
        byline: item.pressConference.journalistName ?? pick(`${key}|byline`, REPORTERS),
        headline: `${us} chairman pressed on ${subject.toLowerCase()}`,
        standfirst: `Press-room verdict: ${item.pressConference.outcome}.`,
        body: [
          item.generatorId === "calendar-press"
            ? `The ${us} chairman faced ${exchanges.length} questions at a scheduled club media briefing.`
            : `The ${us} chairman faced ${exchanges.length} questions after the club's recent decision became a public talking point.`,
          ...exchanges.map(
            (exchange, index) =>
              `Q${index + 1}: ${exchange.question} Chairman response: ${exchange.answer}.`,
          ),
        ],
        facts: [
          { label: "Press approach", value: item.pressConference.outcome },
          { label: "Questions", value: String(exchanges.length) },
          ...(item.pressConference.journalistOutlet
            ? [{ label: "Reporter", value: `${item.pressConference.journalistName ?? "Reporter"} · ${item.pressConference.journalistOutlet}` }]
            : []),
        ],
        tags: [us, "Press conference", "Chairman"],
        involvesUser: true,
        reactions: reactions(
          key,
          item.pressConference.outcome === "Combative"
            ? 2.8
            : item.pressConference.outcome === "Open and accountable"
              ? 2.2
              : 1.7,
        ),
      });
    }
  }

  return articles;
}

const KIND_PRIORITY: Record<NewsKind, number> = {
  matchReport: 0,
  pressConference: 1,
  clubIncident: 2,
  season: 3,
  upset: 4,
  appointment: 5,
  transfer: 6,
  tableWatch: 7,
  roundUp: 8,
};

export function newsFeed(state: GameState, limit = 60): NewsArticle[] {
  const articles: NewsArticle[] = [];

  (state.results ?? [])
    .filter((result) => result.week <= state.week)
    .forEach((result) => articles.push(matchReport(state, result)));

  const leagueId = playerLeagueId(state);
  const records = (state.matchRecords ?? []).filter(
    (record) => record.season === state.season && record.league === leagueId,
  );
  const byWeek = new Map<number, MatchRecord[]>();
  for (const record of records) {
    byWeek.set(record.week, [...(byWeek.get(record.week) ?? []), record]);
  }
  for (const [week, weekRecords] of byWeek) {
    const article = roundUp(state, week, weekRecords);
    if (article) articles.push(article);
  }
  articles.push(...upsets(state, records));

  for (const record of state.football?.transferHistory ?? []) {
    if (record.season !== state.season) continue;
    const article = transferArticle(state, record);
    if (article && (article.involvesUser || record.fee > 0)) articles.push(article);
  }

  articles.push(...appointments(state));
  articles.push(...livingClubArticles(state));
  articles.push(...supporterEventArticles(state));
  const table = tableWatch(state);
  if (table) articles.push(table);
  articles.push(...seasonVerdicts(state));

  const unique = new Map(articles.map((article) => [article.id, article]));
  return [...unique.values()]
    .sort(
      (a, b) =>
        b.season - a.season ||
        b.week - a.week ||
        Number(b.involvesUser) - Number(a.involvesUser) ||
        KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

export function newsAge(state: GameState, article: NewsArticle): string {
  const weeks = (state.season - article.season) * 46 + (state.week - article.week);
  if (weeks <= 0) return "Today";
  if (weeks === 1) return "1w";
  return `${weeks}w`;
}
