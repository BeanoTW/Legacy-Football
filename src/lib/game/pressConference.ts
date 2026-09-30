import type { GameState, InboxEffect } from "./types";
import type { RandomIncidentDefinition } from "./randomIncidents";

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
): PressRound {
  const risky = riskyDecision(incident, decisionId);
  const club = state.clubName;

  const question =
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

  return { question, answers: answers(2, risky) };
}

export function pressRoundThree(
  state: GameState,
  incident: RandomIncidentDefinition,
  decisionId: string,
  previousTones: PressTone[],
): PressRound {
  const risky = riskyDecision(incident, decisionId);
  const combative = previousTones.filter((tone) => tone === "dismiss").length >= 1;
  const transparent = previousTones.filter((tone) => tone === "transparent").length >= 2;

  const question = combative
    ? "One final question: if this decision backfires, will you personally accept responsibility for getting it wrong?"
    : transparent
      ? `You've been quite open about the decision. What concrete promise can you make to ${state.clubName} supporters before we finish?`
      : risky
        ? "Can you give supporters any guarantee that today's decision won't simply create a larger bill or a bigger problem later?"
        : "What should supporters take from this about how you intend to run the club when difficult decisions come up again?";

  return { question, answers: answers(3, risky) };
}

export function pressOutcomeLabel(tones: PressTone[]): string {
  const transparent = tones.filter((tone) => tone === "transparent").length;
  const dismiss = tones.filter((tone) => tone === "dismiss").length;
  if (transparent >= 2) return "Open and accountable";
  if (dismiss >= 2) return "Combative";
  return "Measured";
}
