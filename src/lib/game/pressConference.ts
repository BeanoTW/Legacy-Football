import type { GameState, InboxEffect } from "./types";
import type { RandomIncidentDefinition } from "./randomIncidents";
import { journalistQuestionPressure, type JournalistProfile } from "./mediaRelations";

export type PressTone = "transparent" | "reassure" | "dismiss";

export interface PressAnswer {
  id: PressTone;
  label: string;
  hint: string;
  effects: InboxEffect[];
}

export interface PressRound {
  question: string;
  answers: PressAnswer[];
}

function riskyDecision(incident: RandomIncidentDefinition, decisionId: string): boolean {
  return incident.press?.riskyChoices?.includes(decisionId) ?? false;
}

function answers(round: 2 | 3, risky: boolean): PressAnswer[] {
  if (round === 2) {
    return [
      {
        id: "transparent",
        label: "Acknowledge the trade-off",
        hint: risky
          ? "Admit the risk and explain why you still made the call."
          : "Explain the reasoning without pretending the decision was cost-free.",
        effects: [
          { kind: "reputation", delta: risky ? 1 : 2 },
          { kind: "fanHappiness", delta: 1 },
        ],
      },
      {
        id: "reassure",
        label: "Stand by the club's plan",
        hint: "Keep the answer controlled and focused on the longer term.",
        effects: [
          { kind: "reputation", delta: 1 },
          { kind: "fanHappiness", delta: risky ? 0 : 1 },
        ],
      },
      {
        id: "dismiss",
        label: "Reject the premise",
        hint: risky
          ? "A combative answer could make an already difficult story worse."
          : "Push back hard and risk turning the exchange confrontational.",
        effects: [
          { kind: "reputation", delta: risky ? -2 : -1 },
          { kind: "fanHappiness", delta: risky ? -1 : 0 },
        ],
      },
    ];
  }

  return [
    {
      id: "transparent",
      label: "Give supporters a clear commitment",
      hint: "End with something concrete the club can be judged against.",
      effects: [
        { kind: "reputation", delta: 1 },
        { kind: "fanHappiness", delta: 1 },
      ],
    },
    {
      id: "reassure",
      label: "Draw a line under it",
      hint: "Calmly close the subject and move attention back to football.",
      effects: [{ kind: "reputation", delta: risky ? 0 : 1 }],
    },
    {
      id: "dismiss",
      label: "Tell the press to move on",
      hint: "Ends the exchange quickly, but rarely wins over critics.",
      effects: [
        { kind: "reputation", delta: -1 },
        { kind: "fanHappiness", delta: risky ? -1 : 0 },
      ],
    },
  ];
}

export function pressRoundTwo(
  state: GameState,
  incident: RandomIncidentDefinition,
  decisionId: string,
  firstTone: PressTone,
  journalist?: JournalistProfile,
): PressRound {
  const risky = riskyDecision(incident, decisionId);
  const club = state.clubName;
  const pressure = journalist ? journalistQuestionPressure(state, journalist) : "normal";

  let question =
    firstTone === "transparent"
      ? risky
        ? `You accept there was a risk in that decision. Why should ${club} supporters believe the cheaper or more cautious route won't cost them later?`
        : `If the club was so clear about the right response, why wasn't the issue dealt with before it became a public story?`
      : firstTone === "reassure"
        ? risky
          ? "You keep talking about protecting the club long term. Did finances ultimately matter more than removing the immediate risk?"
          : "You say the club has a plan. What evidence should supporters look for to know that this isn't just damage control?"
        : risky
          ? "You've pushed back strongly on the criticism, but the underlying risk hasn't disappeared. Are you taking supporters' concerns seriously?"
          : "That was a fairly combative response. Do you worry you're creating a bigger story than the original issue?";

  if (journalist?.style === "financial") {
    question = risky
      ? "Supporters can see the risk, but they can also see the balance sheet. Was this decision ultimately driven by what the club could afford?"
      : "You have defended the decision publicly. What does it mean for the club's finances over the next few months?";
  } else if (journalist?.style === "supporter" && pressure !== "soft") {
    question = risky
      ? "The people paying through the turnstiles are the ones living with the risk. Why should supporters accept that?"
      : "Supporters want accountability, not just reassurance. What should they judge you on after this decision?";
  } else if (pressure === "hard") {
    question =
      firstTone === "dismiss"
        ? "You have rejected the criticism, but you have not answered the substance of it. Why should anyone accept that response?"
        : question + " Give me a direct answer rather than the club line.";
  } else if (pressure === "soft") {
    question = "You have built some trust with the local press, so let me put the concern plainly: " + question;
  }

  return { question, answers: answers(2, risky) };
}

export function pressRoundThree(
  state: GameState,
  incident: RandomIncidentDefinition,
  decisionId: string,
  previousTones: PressTone[],
  journalist?: JournalistProfile,
): PressRound {
  const risky = riskyDecision(incident, decisionId);
  const pressure = journalist ? journalistQuestionPressure(state, journalist) : "normal";
  const combative = previousTones.filter((tone) => tone === "dismiss").length >= 1;
  const transparent = previousTones.filter((tone) => tone === "transparent").length >= 2;

  let question = combative
    ? "One final question: if this decision backfires, will you personally accept responsibility for getting it wrong?"
    : transparent
      ? `You've been quite open about the decision. What concrete promise can you make to ${state.clubName} supporters before we finish?`
      : risky
        ? "Can you give supporters any guarantee that today's decision won't simply create a larger bill or a bigger problem later?"
        : "What should supporters take from this about how you intend to run the club when difficult decisions come up again?";

  if (journalist?.style === "confrontational" || pressure === "hard") {
    question = combative
      ? "Last chance to answer this directly: if it goes wrong, do you accept responsibility — yes or no?"
      : question + " And if that does not happen, should supporters hold you personally responsible?";
  } else if (journalist?.style === "financial") {
    question = risky
      ? "Before we finish: what is the financial limit beyond which you would reverse this decision?"
      : question;
  }

  return { question, answers: answers(3, risky) };
}

export function pressOutcomeLabel(tones: PressTone[]): string {
  const transparent = tones.filter((tone) => tone === "transparent").length;
  const dismiss = tones.filter((tone) => tone === "dismiss").length;
  if (transparent >= 2) return "Open and accountable";
  if (dismiss >= 2) return "Combative";
  return "Measured";
}
