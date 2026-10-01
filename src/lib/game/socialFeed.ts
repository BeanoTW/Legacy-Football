import type { GameState } from "./types";
import { hashString } from "./rng";
import { newsFeed, type NewsArticle } from "./newsFeed";
import { clubPresentationName } from "./clubPresentation";

export type SocialSentiment = "positive" | "negative" | "mixed" | "neutral";

export interface SocialPost {
  id: string;
  season: number;
  week: number;
  handle: string;
  displayName: string;
  body: string;
  likes: number;
  replies: number;
  reposts: number;
  sentiment: SocialSentiment;
  sourceArticleId: string;
}

const ACCOUNTS = [
  { handle: "@TownEndVoice", displayName: "Town End Voice" },
  { handle: "@AwayDaysNorth", displayName: "Away Days North" },
  { handle: "@PyramidWatch", displayName: "Pyramid Watch" },
  { handle: "@StandSide", displayName: "Stand Side" },
  { handle: "@ClubTalkLive", displayName: "Club Talk Live" },
  { handle: "@TerraceMurmur", displayName: "Terrace Murmur" },
] as const;

const pick = <T,>(key: string, items: readonly T[]): T =>
  items[(hashString(key) >>> 0) % items.length];

function reactionCounts(key: string, sentiment: SocialSentiment) {
  const h = hashString(key) >>> 0;
  const weight = sentiment === "negative" ? 1.35 : sentiment === "positive" ? 1.15 : 1;
  return {
    likes: Math.round((18 + (h % 190)) * weight),
    replies: Math.round((3 + ((h >>> 7) % 44)) * weight),
    reposts: Math.round((1 + ((h >>> 14) % 25)) * weight),
  };
}

function pressSentiment(article: NewsArticle): SocialSentiment {
  const approach = article.facts?.find((fact) => fact.label === "Press approach")?.value;
  if (approach === "Open and accountable") return "positive";
  if (approach === "Combative") return "negative";
  return "mixed";
}

function incidentSentiment(article: NewsArticle): SocialSentiment {
  const decision = article.facts?.find((fact) => fact.label === "Decision")?.value ?? "";
  const lower = decision.toLowerCase();
  if (lower.includes("cut all ticket") || lower.includes("full repair") || lower.includes("fully")) {
    return "positive";
  }
  if (lower.includes("hold prices") || lower.includes("ignore") || lower.includes("no chairman response")) {
    return "negative";
  }
  return "mixed";
}

function sentimentFor(article: NewsArticle, state: GameState): SocialSentiment {
  if (article.kind === "pressConference") return pressSentiment(article);
  if (article.kind === "clubIncident") return incidentSentiment(article);
  if (article.kind === "matchReport" && article.scoreline) {
    const oursAtHome = article.scoreline.home === clubPresentationName(state.clubName);
    const gf = oursAtHome ? article.scoreline.homeGoals : article.scoreline.awayGoals;
    const ga = oursAtHome ? article.scoreline.awayGoals : article.scoreline.homeGoals;
    return gf > ga ? "positive" : gf < ga ? "negative" : "neutral";
  }
  return "neutral";
}

function postBody(article: NewsArticle, sentiment: SocialSentiment, index: number): string {
  if (article.kind === "pressConference") {
    if (sentiment === "positive") {
      return index === 0
        ? "Fair play. The chairman actually answered the questions instead of hiding behind a statement."
        : article.standfirst + " More of that kind of accountability, please.";
    }
    if (sentiment === "negative") {
      return index === 0
        ? "That press conference got needlessly prickly. The original issue is still there."
        : article.standfirst + " Picking a fight with the local press helps nobody.";
    }
    return index === 0
      ? "Not a disaster, not exactly inspiring either. At least we got some answers."
      : article.standfirst + " Supporters will judge the follow-through now.";
  }

  if (article.kind === "clubIncident") {
    const decision = article.facts?.find((fact) => fact.label === "Decision")?.value;
    if (sentiment === "positive") {
      return decision
        ? "Club decision: " + decision + ". Feels like the sensible call."
        : article.standfirst;
    }
    if (sentiment === "negative") {
      return decision
        ? "Club decision: " + decision + ". Hard to see supporters being happy with that."
        : article.standfirst;
    }
    return decision
      ? "Club decision: " + decision + ". Can see both sides of this one."
      : article.standfirst;
  }

  if (article.kind === "matchReport") {
    return sentiment === "positive"
      ? article.headline + ". Huge three points."
      : sentiment === "negative"
        ? article.headline + ". That one hurts."
        : article.headline + ". Take the point and move on.";
  }

  return article.headline + ". " + article.standfirst;
}

export function socialFeed(state: GameState, limit = 80): SocialPost[] {
  const articles = newsFeed(state, 60).filter((article) => article.involvesUser);
  const posts: SocialPost[] = [];

  for (const article of articles) {
    const count = article.kind === "pressConference" || article.kind === "clubIncident" ? 2 : 1;
    for (let index = 0; index < count; index++) {
      const key = `${article.id}|social|${index}`;
      const account = pick(`${key}|account`, ACCOUNTS);
      const sentiment = sentimentFor(article, state);
      const counts = reactionCounts(key, sentiment);
      posts.push({
        id: key,
        season: article.season,
        week: article.week,
        handle: account.handle,
        displayName: account.displayName,
        body: postBody(article, sentiment, index),
        ...counts,
        sentiment,
        sourceArticleId: article.id,
      });
    }
  }

  return posts
    .sort(
      (a, b) =>
        b.season - a.season ||
        b.week - a.week ||
        a.sourceArticleId.localeCompare(b.sourceArticleId) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
