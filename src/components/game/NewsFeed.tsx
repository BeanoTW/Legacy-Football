import { useMemo, useState } from "react";
import { ArrowRight, Heart, MessageCircle, Newspaper, Repeat2, X } from "lucide-react";
import type { GameState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { newsAge, newsFeed, type NewsArticle, type NewsKind } from "@/lib/game/newsFeed";
import { socialFeed, type SocialPost } from "@/lib/game/socialFeed";
import { CharacterPortrait } from "./CharacterPortrait";
import { useChairmanProfile } from "./ChairmanStudio";
import { SupporterEventArt } from "./SupporterEventCards";
import { TurnoutIndicator } from "./EventVisualPrimitives";
import { EVENT_OUTCOME_LABEL, EVENT_VISUALS } from "@/lib/game/supporterEventPresentation";

type NewsFilter = "all" | "club" | "matches" | "transfers" | "league" | "social";

const FILTERS: { id: NewsFilter; label: string; kinds?: NewsKind[] }[] = [
  { id: "all", label: "For you" },
  { id: "club", label: "Our club" },
  { id: "matches", label: "Matches", kinds: ["matchReport", "upset", "roundUp"] },
  { id: "transfers", label: "Transfers", kinds: ["transfer", "appointment"] },
  { id: "league", label: "League", kinds: ["tableWatch", "season", "roundUp", "upset"] },
  { id: "social", label: "Social" },
];

const KIND_LABEL: Record<NewsKind, string> = {
  matchReport: "Match report",
  roundUp: "Round-up",
  upset: "Shock result",
  transfer: "Transfer",
  appointment: "Appointment",
  tableWatch: "Table watch",
  season: "Season review",
  clubIncident: "Club story",
  pressConference: "Press conference",
};

function compact(value: number) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function ScorePlate({ article, large = false }: { article: NewsArticle; large?: boolean }) {
  const score = article.scoreline;
  if (!score) return null;
  return (
    <div className={cn("lf-news-score", large && "is-large")}>
      <span className="lf-news-score-label">{score.label} · Full time</span>
      <div className="lf-news-score-row">
        <span className="lf-news-score-team"><i>{initials(score.home)}</i><b>{score.home}</b></span>
        <strong>{score.homeGoals}<em>–</em>{score.awayGoals}</strong>
        <span className="lf-news-score-team is-away"><i>{initials(score.away)}</i><b>{score.away}</b></span>
      </div>
    </div>
  );
}

function TransferPlate({ article }: { article: NewsArticle }) {
  const [from, to] = article.standfirst.split(" → ");
  const fee = article.facts?.find((fact) => fact.label === "Fee")?.value;
  return (
    <div className="lf-news-transfer">
      <span>{from}</span>
      <ArrowRight />
      <span className="is-to">{to}</span>
      {fee && <strong>{fee}</strong>}
    </div>
  );
}

function ShapePlate({ article }: { article: NewsArticle }) {
  const shape = article.facts?.find((fact) => fact.label === "Shape")?.value;
  const approach = article.facts?.find((fact) => fact.label === "Approach")?.value;
  if (!shape) return null;
  return (
    <div className="lf-news-shape">
      <strong>{shape}</strong>
      <span>{approach}</span>
    </div>
  );
}

function QuoteBlock({ article }: { article: NewsArticle }) {
  const profile = useChairmanProfile();
  const quote = article.quote;
  if (!quote) return null;
  return (
    <figure className="lf-news-quote">
      {quote.chairman && <CharacterPortrait avatar={profile.avatar} size={46} className="lf-news-quote-portrait" />}
      <blockquote>
        <p>“{quote.text}”</p>
        <figcaption>{quote.speaker} · {quote.role}</figcaption>
      </blockquote>
    </figure>
  );
}

function CommunityEventMedia({
  article,
  state,
  large = false,
}: {
  article: NewsArticle;
  state: GameState;
  large?: boolean;
}) {
  const event = article.communityEvent;
  if (!event) return null;
  const visual = EVENT_VISUALS[event.eventId];
  const sarah = event.sarahFeatured
    ? (state.hiredStaff ?? []).find((staff) => staff.id === "ST-community-sarah-malik" || staff.name === "Sarah Malik")
    : null;
  return (
    <div className={cn("lf-event-news-hero", visual.tone, large && "is-large", event.outcome && `outcome-${event.outcome}`)}>
      <div className="lf-event-news-rubric">
        <span>{visual.category}</span>
        {event.phase === "result" && event.outcome ? (
          <span className="lf-event-news-outcome">
            <TurnoutIndicator outcome={event.outcome} size="sm" />
            {EVENT_OUTCOME_LABEL[event.outcome]}
          </span>
        ) : (
          <span>Community event</span>
        )}
      </div>
      <SupporterEventArt eventId={event.eventId} />
      {sarah && (
        <div className="lf-event-sarah">
          <CharacterPortrait identity={{ id: sarah.id, subject: "staff" }} size={large ? 38 : 30} title="Sarah Malik" />
          <span><strong>Sarah Malik</strong><small>{event.sarahRole ?? "Coordinator"}</small></span>
        </div>
      )}
    </div>
  );
}

function NewsCard({ article, state, onOpen }: { article: NewsArticle; state: GameState; onOpen: () => void }) {
  return (
    <article className={cn("lf-news-post", `tone-${article.publication.tone}`, article.involvesUser && "is-ours")}>
      <header className="lf-news-post-head">
        <span className="lf-news-avatar">{article.publication.mark}</span>
        <span className="lf-news-source">
          <strong>{article.publication.name}</strong>
          <small>{article.publication.handle} · {newsAge(state, article)}</small>
        </span>
        <span className="lf-news-kind">{KIND_LABEL[article.kind]}</span>
      </header>
      <button type="button" className="lf-news-post-body" onClick={onOpen}>
        <h3>{article.headline}</h3>
        <p>{article.standfirst}</p>
        {article.communityEvent && <CommunityEventMedia article={article} state={state} />}
        {(article.kind === "matchReport" || article.kind === "upset") && <ScorePlate article={article} />}
        {article.kind === "transfer" && <TransferPlate article={article} />}
        {article.kind === "appointment" && <ShapePlate article={article} />}
        {article.quote && <QuoteBlock article={article} />}
      </button>
      <footer className="lf-news-reactions" aria-label="Reactions">
        <span><Heart /> {compact(article.reactions.likes)}</span>
        <span><MessageCircle /> {compact(article.reactions.comments)}</span>
        <span><Repeat2 /> {compact(article.reactions.shares)}</span>
        <button type="button" onClick={onOpen}>Read <ArrowRight /></button>
      </footer>
    </article>
  );
}

function SocialCard({ post, state, onOpen }: { post: SocialPost; state: GameState; onOpen: () => void }) {
  const ageWeeks = (state.season - post.season) * 46 + (state.week - post.week);
  const age = ageWeeks <= 0 ? "Today" : ageWeeks === 1 ? "1w" : `${ageWeeks}w`;
  return (
    <article className={cn("lf-news-post tone-local", `is-social sentiment-${post.sentiment}`)}>
      <header className="lf-news-post-head">
        <span className="lf-news-avatar">{post.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</span>
        <span className="lf-news-source">
          <strong>{post.displayName}</strong>
          <small>{post.handle} · {age}</small>
        </span>
        <span className="lf-news-kind">Supporter post</span>
      </header>
      <div className="lf-news-post-body">
        <p className="text-sm leading-relaxed text-foreground">{post.body}</p>
      </div>
      <footer className="lf-news-reactions" aria-label="Reactions">
        <span><Heart /> {compact(post.likes)}</span>
        <span><MessageCircle /> {compact(post.replies)}</span>
        <span><Repeat2 /> {compact(post.reposts)}</span>
        <button type="button" onClick={onOpen}>View story <ArrowRight /></button>
      </footer>
    </article>
  );
}

function ArticleReader({ article, state, onClose }: { article: NewsArticle; state: GameState; onClose: () => void }) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" hideClose className="lf-paper-sheet">
        <div className="lf-paper">
          <div className="lf-paper-masthead">
            <span>Season {article.season} · Week {article.week}</span>
            <SheetTitle className="lf-paper-name">{article.publication.name}</SheetTitle>
            <Button variant="ghost" size="icon" className="lf-paper-close" onClick={onClose} aria-label="Close article"><X /></Button>
          </div>
          <div className="lf-paper-rule" />
          <span className="lf-paper-kicker">{KIND_LABEL[article.kind]}</span>
          <h2 className="lf-paper-headline">{article.headline}</h2>
          <p className="lf-paper-standfirst">{article.standfirst}</p>
          <p className="lf-paper-byline">By {article.byline} · {newsAge(state, article)}</p>
          {article.communityEvent && <CommunityEventMedia article={article} state={state} large />}
          {article.scoreline && <ScorePlate article={article} large />}
          <div className="lf-paper-body">
            {article.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          {article.quote && <QuoteBlock article={article} />}
          {article.facts && article.facts.length > 0 && (
            <dl className="lf-paper-facts">
              {article.facts.map((fact) => (
                <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
              ))}
            </dl>
          )}
          <div className="lf-paper-tags">{article.tags.map((tag) => <span key={tag}>#{tag.replace(/\s+/g, "")}</span>)}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function NewsFeed({ state }: { state: GameState }) {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const articles = useMemo(() => newsFeed(state), [state]);
  const socialPosts = useMemo(() => socialFeed(state), [state]);
  const visible = useMemo(() => {
    const config = FILTERS.find((entry) => entry.id === filter)!;
    if (filter === "social") return [];
    if (filter === "club") return articles.filter((article) => article.involvesUser);
    return config.kinds ? articles.filter((article) => config.kinds!.includes(article.kind)) : articles;
  }, [articles, filter]);
  const open = openId ? articles.find((article) => article.id === openId) ?? null : null;

  return (
    <div className="lf-newsroom">
      <div className="lf-news-filters" role="tablist" aria-label="News filters">
        {FILTERS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={filter === entry.id} className={cn(filter === entry.id && "is-active")} onClick={() => setFilter(entry.id)}>
            {entry.label}
          </button>
        ))}
      </div>
      <div className="lf-news-stream touch-pan-y">
        {filter === "social" ? (
          socialPosts.length === 0 ? (
            <div className="lf-inbox-empty">
              <MessageCircle />
              <h2>The timeline is quiet</h2>
              <p>Supporter reaction will build as matches, chairman decisions and press conferences create talking points.</p>
            </div>
          ) : (
            socialPosts.map((post) => <SocialCard key={post.id} post={post} state={state} onOpen={() => setOpenId(post.sourceArticleId)} />)
          )
        ) : visible.length === 0 ? (
          <div className="lf-inbox-empty">
            <Newspaper />
            <h2>The presses are quiet</h2>
            <p>Match reports, results and transfer news will appear here as the season unfolds.</p>
          </div>
        ) : (
          visible.map((article) => <NewsCard key={article.id} article={article} state={state} onOpen={() => setOpenId(article.id)} />)
        )}
      </div>
      {open && <ArticleReader article={open} state={state} onClose={() => setOpenId(null)} />}
    </div>
  );
}
