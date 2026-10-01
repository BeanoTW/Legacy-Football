import { useMemo, useState } from "react";
import { ChevronRight, Mic2, Newspaper, UsersRound } from "lucide-react";
import type { GameState, InboxEffect, InboxItem } from "@/lib/game/types";
import { inboxConversationKey } from "@/lib/game/inboxCommunication";
import { randomIncidentById } from "@/lib/game/randomIncidents";
import { journalistForConversation, mediaRelationship } from "@/lib/game/mediaRelations";
import {
  calendarPressRound,
  pressOutcomeLabel,
  pressRoundThree,
  pressRoundTwo,
  type CalendarPressContext,
  type PressAnswer,
  type PressTone,
} from "@/lib/game/pressConference";
import { Button } from "@/components/ui/button";
import { CharacterPortrait } from "./CharacterPortrait";
import { useChairmanProfile } from "./ChairmanStudio";

type Exchange = {
  question: string;
  answer: string;
};

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
  const originalDecisionLabel =
    original?.choices?.find((choice) => choice.id === originalDecisionId)?.label ??
    "the club's response";

  const openingQuestion =
    incident?.press?.question(state, originalDecisionLabel) ??
    item.body.split(/\n\s*\n/).at(-1) ??
    "Can you explain the club's decision?";

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
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

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
    if (round === "complete") return;

    setExchanges((current) => [...current, { question: currentQuestion, answer: answer.label }]);
    setTones((current) => [...current, answer.tone]);

    if (round === 1) {
      setFirstChoiceId(answer.id);
      setRound(2);
      return;
    }

    setLaterEffects((current) => [...current, ...answer.effects]);
    if (round === 2) {
      if (maxQuestions === 2) {
        setRound("complete");
      } else {
        setRound(3);
      }
      return;
    }

    setRound("complete");
  };

  const questionNumber = round === "complete" ? maxQuestions : Math.min(round, maxQuestions);
  const outcome = round === "complete" ? pressOutcomeLabel(tones) : null;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#071719] text-white">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
        <header className="border-b border-white/10 bg-[#0a2526] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">
                <Mic2 className="size-4" /> Press conference
              </div>
              <h1 className="mt-1 font-display text-2xl leading-tight sm:text-3xl">
                {incident?.subject(state) ?? item.subject.replace(/^Press conference\s*—\s*/i, "")}
              </h1>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold">
              Question {questionNumber} / {maxQuestions}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6">
          <div className="mb-4 grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="grid size-11 place-items-center rounded-full bg-white/10">
              <Newspaper className="size-5 text-emerald-200" />
            </div>
            <div>
              <strong className="block text-sm">{journalist.name} · {journalist.role}</strong>
              <span className="text-xs text-white/55">
                {journalist.outlet} · {journalistRelationship.band} relationship ({journalistRelationship.score}/100)
              </span>
            </div>
          </div>

          {exchanges.length > 0 && (
            <div className="mb-5 space-y-2">
              {exchanges.map((exchange, index) => (
                <div key={`${index}-${exchange.answer}`} className="rounded-xl border border-white/8 bg-black/15 p-3 text-xs">
                  <p className="text-white/55">Q{index + 1} · {exchange.question}</p>
                  <p className="mt-2 font-semibold text-emerald-100">You: {exchange.answer}</p>
                </div>
              ))}
            </div>
          )}

          {round !== "complete" ? (
            <>
              <section className="rounded-2xl border border-white/10 bg-[#0d2b2b] p-5 shadow-xl">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/50">
                  <UsersRound className="size-4" /> Journalist
                </div>
                <p className="font-display text-xl leading-snug sm:text-2xl">“{currentQuestion}”</p>
              </section>

              <div className="my-5 flex items-center gap-3">
                <CharacterPortrait avatar={profile.avatar} size={52} title="Managing Director" />
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200/65">Your response</span>
                  <strong className="text-sm">{state.managerName}</strong>
                </div>
              </div>

              <div className="space-y-2.5">
                {currentAnswers.map((answer) => (
                  <Button
                    key={answer.id}
                    variant="ghost"
                    className="h-auto min-h-16 w-full justify-between rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left text-white hover:bg-white/[0.09] hover:text-white"
                    onClick={() => choose(answer)}
                  >
                    <span className="min-w-0 pr-3">
                      <strong className="block whitespace-normal text-sm leading-relaxed">“{answer.label}”</strong>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-emerald-200/70" />
                  </Button>
                ))}
              </div>
            </>
          ) : (
            <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-5">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/70">
                Press conference complete
              </span>
              <h2 className="mt-1 font-display text-2xl">{outcome}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65">
                Your answers will now feed into supporter and reputation reaction. The interview remains part of the club communications history and can shape the media relationship around future stories.
              </p>
              <Button
                className="mt-5 w-full bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                disabled={!firstChoiceId}
                onClick={() =>
                  firstChoiceId &&
                  outcome &&
                  onComplete(firstChoiceId, laterEffects, {
                    outcome,
                    exchanges,
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
          )}
        </main>
      </div>
    </div>
  );
}
