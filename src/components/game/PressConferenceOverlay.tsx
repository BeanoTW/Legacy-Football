import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Mic2 } from "lucide-react";
import type { GameState, InboxEffect, InboxItem } from "@/lib/game/types";
import { inboxConversationKey } from "@/lib/game/inboxCommunication";
import { randomIncidentById } from "@/lib/game/randomIncidents";
import { journalistForConversation, mediaRelationship, type JournalistStyle } from "@/lib/game/mediaRelations";
import {
  calendarPressRound,
  pressOutcomeLabel,
  pressRoundThree,
  pressRoundTwo,
  type CalendarPressContext,
  type PressAnswer,
  type PressTone,
} from "@/lib/game/pressConference";
import { managerPressView, pressHeadline, pressReaction, pressRoomMood } from "@/lib/game/pressRoom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CharacterPortrait } from "./CharacterPortrait";
import { useChairmanProfile } from "./ChairmanStudio";

type Exchange = {
  question: string;
  answer: string;
};

const STYLE_LABEL: Record<JournalistStyle, string> = {
  balanced: "Fair but thorough",
  supporter: "Writes for the fans",
  financial: "Follows the money",
  confrontational: "Looking for a story",
};

const MOOD_STEPS = ["Hostile", "Tense", "Even", "Receptive", "Warm"] as const;
/** A beat for the room to react before the next question. */
const THINK_MS = 750;

/** Step-and-repeat sponsor wall behind the desk, carrying the club's name. */
function sponsorWall(club: string): string {
  const safe = club.replace(/[<&>"']/g, "").toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='70'><g font-family='Arial, sans-serif' font-weight='800' fill='#1d7f75' fill-opacity='0.09'><text x='6' y='24' font-size='13' letter-spacing='2'>${safe}</text><text x='126' y='58' font-size='11' letter-spacing='3'>LEGACY FOOTBALL</text></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function PressConferenceOverlay({
  state,
  item,
  onComplete,
}: {
  state: GameState;
  item: InboxItem;
  onComplete: (
    firstChoiceId: string,
    laterEffects: InboxEffect[],
    summary: {
      outcome: string;
      exchanges: Exchange[];
      journalistId: string;
      journalistName: string;
      journalistOutlet: string;
      journalistStyle: "balanced" | "supporter" | "financial" | "confrontational";
    },
  ) => void;
}) {
  const profile = useChairmanProfile();
  const conversationKey = inboxConversationKey(item);
  const journalist = journalistForConversation(state, conversationKey);
  const journalistRelationship = mediaRelationship(state, journalist.id);
  const incidentId = conversationKey.split(":")[1] ?? "";
  const incident = randomIncidentById(incidentId);
  const calendarContexts: CalendarPressContext[] = [
    "summer-window-open",
    "season-preview",
    "summer-window-review",
    "midseason-checkpoint",
    "winter-window-preview",
    "winter-window-review",
    "season-review",
  ];
  const calendarContextCandidate = item.generatorId === "calendar-press" ? conversationKey.split(":")[1] : undefined;
  const calendarContext = calendarContexts.includes(calendarContextCandidate as CalendarPressContext)
    ? (calendarContextCandidate as CalendarPressContext)
    : undefined;
  const routineWindowConference =
    calendarContext === "summer-window-open" ||
    calendarContext === "summer-window-review" ||
    calendarContext === "winter-window-preview" ||
    calendarContext === "winter-window-review";
  const maxQuestions = routineWindowConference ? 2 : 3;
  const original = state.inbox.find(
    (candidate) =>
      candidate.generatorId === "random-incident" &&
      inboxConversationKey(candidate) === conversationKey,
  );
  const originalDecisionId = original?.chosenChoiceId ?? "unknown";
  const originalDecisionLabel = original?.choices?.find((choice) => choice.id === originalDecisionId)?.label;
  const bodyQuestion = item.body.split(/\n\s*\n/).at(-1);

  // Only rebuild the question from the original incident when we still know
  // what was decided. Otherwise use the question written into this briefing
  // when it was created (the original may since have been deleted), instead
  // of quoting a placeholder like "the club's response" back at the player.
  const openingQuestion =
    (originalDecisionLabel ? incident?.press?.question(state, originalDecisionLabel) : undefined) ??
    bodyQuestion ??
    incident?.press?.question(state, "the way the club handled it") ??
    "Can you explain the club's decision?";

  const topic = incident?.subject(state) ?? item.subject.replace(/^Press conference\s*—\s*/i, "");

  const firstAnswers = useMemo<PressAnswer[]>(
    () =>
      (item.choices ?? []).map((choice) => {
        const tone: PressTone =
          choice.id === "dismiss"
            ? "dismiss"
            : choice.id === "reassure" ||
                choice.id === "rebuilding" ||
                choice.id === "happy-squad" ||
                choice.id === "stability"
              ? "reassure"
              : "transparent";
        return {
          id: choice.id,
          tone,
          label: choice.label,
          hint: choice.hint ?? "",
          effects: choice.effects,
        };
      }),
    [item.choices],
  );

  const [round, setRound] = useState<1 | 2 | 3 | "complete">(1);
  const [tones, setTones] = useState<PressTone[]>([]);
  const [firstChoiceId, setFirstChoiceId] = useState<string | null>(null);
  const [laterEffects, setLaterEffects] = useState<InboxEffect[]>([]);
  const [exchanges, setExchanges] = useState<(Exchange & { reaction: string })[]>([]);
  const [thinking, setThinking] = useState(false);
  const pending = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  const roundTwo =
    incident && tones[0]
      ? pressRoundTwo(state, incident, originalDecisionId, tones[0], journalist)
      : calendarContext && tones[0]
        ? calendarPressRound(state, calendarContext, 2, tones, journalist)
        : null;
  const roundThree =
    incident && tones.length >= 2
      ? pressRoundThree(state, incident, originalDecisionId, tones.slice(0, 2), journalist)
      : calendarContext && tones.length >= 2
        ? calendarPressRound(state, calendarContext, 3, tones, journalist)
        : null;

  const currentQuestion =
    round === 1
      ? openingQuestion
      : round === 2
        ? roundTwo?.question ?? "Why should supporters accept that explanation?"
        : round === 3
          ? roundThree?.question ?? "What do you want supporters to take from this?"
          : "";

  const currentAnswers =
    round === 1
      ? firstAnswers
      : round === 2
        ? roundTwo?.answers ?? []
        : round === 3
          ? roundThree?.answers ?? []
          : [];

  const choose = (answer: PressAnswer) => {
    if (round === "complete" || thinking) return;
    const reaction = pressReaction(journalist, round, answer.tone);
    setExchanges((current) => [...current, { question: currentQuestion, answer: answer.label, reaction }]);
    setTones((current) => [...current, answer.tone]);

    let next: 2 | 3 | "complete";
    if (round === 1) {
      setFirstChoiceId(answer.id);
      next = 2;
    } else {
      setLaterEffects((current) => [...current, ...answer.effects]);
      next = round === 2 && maxQuestions === 3 ? 3 : "complete";
    }
    setThinking(true);
    pending.current = window.setTimeout(() => {
      setThinking(false);
      setRound(next);
    }, THINK_MS);
  };

  const questionNumber = round === "complete" ? maxQuestions : Math.min(round, maxQuestions);
  const outcome = round === "complete" ? pressOutcomeLabel(tones) : null;
  const mood = pressRoomMood(state, journalist, tones);
  const headline = round === "complete" ? pressHeadline(state, journalist, tones, topic) : null;
  const managerView = round === "complete" ? managerPressView(state, tones) : null;
  const firstName = journalist.name.split(" ")[0];

  return (
    <div className="lf-press fixed inset-0 z-[90] overflow-y-auto bg-[#eef2f0] text-[#10262b]">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        {/* The room: sponsor wall, title, desk and microphones */}
        <header
          className="relative overflow-hidden border-b border-[#d6e0dd] bg-[#f8faf9] px-4 pt-[calc(0.9rem+env(safe-area-inset-top))] sm:px-6"
          style={{ backgroundImage: sponsorWall(state.clubName), backgroundSize: "240px 70px" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#1d7f75]">
                <span className="relative flex size-2">
                  <span className="lf-live-dot absolute inline-flex size-full rounded-full bg-rose-500 opacity-70" />
                  <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
                </span>
                Live · Press conference
              </div>
              <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">{topic}</h1>
            </div>
            <span className="shrink-0 rounded-full border border-[#d6e0dd] bg-white px-3 py-1 text-xs font-bold tnum shadow-sm">
              {questionNumber} / {maxQuestions}
            </span>
          </div>
          <div className="relative mt-3 h-14" aria-hidden="true">
            <svg viewBox="0 0 360 56" className="absolute inset-x-0 bottom-0 h-full w-full" preserveAspectRatio="xMidYMax meet">
              {[150, 180, 210].map((x, i) => (
                <g key={x} transform={`rotate(${(i - 1) * 9} ${x} 44)`}>
                  <rect x={x - 1.5} y={14} width={3} height={30} rx={1.5} fill="#2b3a3d" />
                  <rect x={x - 5} y={4} width={10} height={14} rx={5} fill={["#1d7f75", "#10262b", "#b8322f"][i]} />
                  <rect x={x - 6} y={12} width={12} height={4} rx={1} fill="#ffffff" fillOpacity={0.85} />
                </g>
              ))}
              <rect x={0} y={42} width={360} height={14} fill="#c79a63" />
              <rect x={0} y={42} width={360} height={3} fill="#e0b47a" />
            </svg>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 sm:px-6">
          {/* Who is asking, and how the room feels */}
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-[#d6e0dd] bg-white p-3 shadow-sm">
            <div className="shrink-0 overflow-hidden rounded-xl">
              <CharacterPortrait identity={{ id: `journalist-${journalist.id}`, subject: "staff" }} size={46} title={journalist.name} />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{journalist.name}</strong>
              <span className="block truncate text-[11px] text-[#5d7176]">
                {journalist.outlet} · {journalist.role}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">{STYLE_LABEL[journalist.style]}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    journalistRelationship.band === "Warm"
                      ? "bg-emerald-50 text-emerald-700"
                      : journalistRelationship.band === "Professional"
                        ? "bg-sky-50 text-sky-700"
                        : journalistRelationship.band === "Cool"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700",
                  )}
                >
                  {journalistRelationship.band} · {journalistRelationship.score}
                </span>
              </span>
            </div>
            <div className="w-[5.5rem] shrink-0 text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.16em] text-[#5d7176]">The room</div>
              <div className="mt-1 flex justify-end gap-0.5" role="meter" aria-label={`Room mood: ${mood.label}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={mood.step}>
                {MOOD_STEPS.map((step, i) => (
                  <span
                    key={step}
                    className={cn(
                      "h-2 w-3.5 rounded-sm transition-colors duration-500",
                      i === mood.step ? (i <= 1 ? "bg-rose-500" : i === 2 ? "bg-slate-400" : "bg-emerald-500") : "bg-[#e3eae8]",
                    )}
                  />
                ))}
              </div>
              <div className="mt-0.5 text-[11px] font-bold">{mood.label}</div>
            </div>
          </div>

          {/* The exchange so far */}
          {exchanges.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {exchanges.map((exchange, index) => (
                <div key={`${index}-${exchange.answer}`} className="space-y-1.5">
                  <div className="mr-8 rounded-2xl rounded-tl-sm border border-[#d6e0dd] bg-white px-3 py-2 text-xs leading-relaxed text-[#5d7176] shadow-sm">
                    <span className="font-bold text-[#10262b]">{firstName}</span> · {exchange.question}
                  </div>
                  <div className="ml-8 rounded-2xl rounded-tr-sm bg-[#1d7f75] px-3 py-2 text-xs font-semibold leading-relaxed text-white shadow-sm">
                    “{exchange.answer}”
                  </div>
                  {(index < exchanges.length - 1 || !thinking) && (
                    <p className="px-2 text-[11px] italic text-[#5d7176]">{exchange.reaction}</p>
                  )}
                </div>
              ))}
              {thinking && (
                <div className="mr-8 inline-flex items-center gap-1 rounded-2xl rounded-tl-sm border border-[#d6e0dd] bg-white px-3 py-2.5 shadow-sm" aria-label={`${firstName} is responding`}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="lf-typing size-1.5 rounded-full bg-[#9fb0b3]" style={{ animationDelay: `${i * 140}ms` }} />
                  ))}
                </div>
              )}
            </div>
          )}

          {round !== "complete" && !thinking ? (
            <>
              <section key={`q-${round}`} className="lf-press-question relative overflow-hidden rounded-2xl border border-[#d6e0dd] bg-white p-4 shadow-md">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5d7176]">
                  <Mic2 className="size-3.5 text-[#1d7f75]" /> {firstName} asks
                </div>
                <p className="font-display text-xl leading-snug sm:text-2xl">“{currentQuestion}”</p>
              </section>

              <div className="my-4 flex items-center gap-3">
                <div className="overflow-hidden rounded-xl">
                  <CharacterPortrait avatar={profile.avatar} size={44} title="Managing Director" />
                </div>
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-[#1d7f75]">Your answer</span>
                  <strong className="text-sm">{state.managerName}</strong>
                </div>
              </div>

              <div className="space-y-2">
                {currentAnswers.map((answer) => (
                  <Button
                    key={answer.id}
                    variant="ghost"
                    className="lf-press-answer flex h-auto min-h-14 w-full items-center justify-between rounded-xl border border-[#d6e0dd] bg-white px-3.5 py-3 text-left text-[#10262b] shadow-sm hover:border-[#1d7f75]/50 hover:bg-[#f4faf8]"
                    onClick={() => choose(answer)}
                  >
                    <strong className="min-w-0 whitespace-normal pr-3 text-sm leading-relaxed">“{answer.label}”</strong>
                    <ChevronRight className="size-4 shrink-0 text-[#1d7f75]" />
                  </Button>
                ))}
              </div>
            </>
          ) : round === "complete" && !thinking ? (
            <section className="space-y-3">
              {headline && (
                <article className="rounded-xl border border-[#d9d2c3] bg-[#fbf8f1] p-4 shadow-md">
                  <div className="flex items-baseline justify-between border-b-2 border-[#1c1a17] pb-1">
                    <span className="font-display text-sm font-black uppercase tracking-[0.16em]">{headline.outlet}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#6b6458]">Tomorrow's back page</span>
                  </div>
                  <h2 className="mt-2 font-display text-3xl font-black leading-[0.95] tracking-tight">{headline.headline}</h2>
                  <p className="mt-2 font-serif text-sm italic leading-snug text-[#4a443a]">{headline.standfirst}</p>
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#6b6458]">
                    By {journalist.name} · Verdict: {outcome}
                  </div>
                </article>
              )}

              {managerView && (
                <div className="flex items-start gap-3 rounded-2xl border border-[#d6e0dd] bg-white p-3 shadow-sm">
                  <div className="shrink-0 overflow-hidden rounded-xl">
                    <CharacterPortrait identity={{ id: managerView.managerId, subject: "manager" }} size={44} title={managerView.name} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#5d7176]">{managerView.name} · your manager</div>
                    <p className="mt-0.5 text-sm font-semibold">“{managerView.quote}”</p>
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-[#1d7f75] text-white hover:bg-[#186b62]"
                disabled={!firstChoiceId}
                onClick={() =>
                  firstChoiceId &&
                  outcome &&
                  onComplete(firstChoiceId, laterEffects, {
                    outcome,
                    exchanges: exchanges.map(({ question, answer }) => ({ question, answer })),
                    journalistId: journalist.id,
                    journalistName: journalist.name,
                    journalistOutlet: journalist.outlet,
                    journalistStyle: journalist.style,
                  })
                }
              >
                Leave the press room
              </Button>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}