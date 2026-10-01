import type { GameState, InboxEffect } from "./types";
import type { RandomIncidentDefinition } from "./randomIncidents";
import { journalistQuestionPressure, type JournalistProfile } from "./mediaRelations";

export type PressTone = "transparent" | "reassure" | "dismiss";
export type CalendarPressContext =
  | "summer-window-open"
  | "season-preview"
  | "summer-window-review"
  | "midseason-checkpoint"
  | "winter-window-preview"
  | "winter-window-review"
  | "season-review";


export interface PressAnswer {
  /** Stable answer id. Calendar conferences can use semantic statement ids. */
  id: string;
  /** Behavioural tone used for journalist pressure/outcome calculation. */
  tone: PressTone;
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
        tone: "transparent",
        label: risky
          ? "There was a risk, absolutely. We made the call because we believed it was the right one for the club."
          : "There are always trade-offs. We made the decision we believed gave the club the best outcome.",
        hint: "",
        effects: [
          { kind: "reputation", delta: risky ? 1 : 2 },
          { kind: "fanHappiness", delta: 1 },
        ],
      },
      {
        id: "reassure",
        tone: "reassure",
        label: "I stand by the plan. We're looking beyond one headline and doing what we believe is right for the club.",
        hint: "",
        effects: [
          { kind: "reputation", delta: 1 },
          { kind: "fanHappiness", delta: risky ? 0 : 1 },
        ],
      },
      {
        id: "dismiss",
        tone: "dismiss",
        label: risky
          ? "I don't accept that characterisation at all. We made a responsible decision and I won't apologise for it."
          : "I think you're trying to create a controversy where there isn't one. The decision speaks for itself.",
        hint: "",
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
        tone: "transparent",
      label: "Supporters can judge us on what we actually deliver. That's the standard I'm setting.",
      hint: "",
      effects: [
        { kind: "reputation", delta: 1 },
        { kind: "fanHappiness", delta: 1 },
      ],
    },
    {
      id: "reassure",
        tone: "reassure",
      label: "We've explained our position. Now the important thing is getting back to the football.",
      hint: "",
      effects: [{ kind: "reputation", delta: risky ? 0 : 1 }],
    },
    {
      id: "dismiss",
        tone: "dismiss",
      label: "I've answered the question. We're not going to keep going around in circles on it.",
      hint: "",
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


export function seasonPreviewStatement(state: GameState, season = state.season): string | null {
  const code = String(state.inboxFlags[`press:season-preview:s${season}`] ?? "");
  const labels: Record<string, string> = {
    promotion: "Promotion is the target.",
    rebuilding: "This is a rebuilding season.",
    "happy-squad": "We're happy with the squad.",
    reinforcements: "We still need reinforcements.",
    youth: "Youth development is a priority.",
    stability: "Financial stability comes first.",
  };
  return labels[code] ?? null;
}

export function calendarPressRound(
  state: GameState,
  context: CalendarPressContext,
  round: 2 | 3,
  previousTones: PressTone[],
  journalist?: JournalistProfile,
): PressRound {
  const pressure = journalist ? journalistQuestionPressure(state, journalist) : "normal";
  const combative = previousTones.includes("dismiss");
  const club = state.clubName;

  const roundTwoQuestions: Record<CalendarPressContext, string> = {
    "summer-window-open": "What would make this transfer window a successful one for the club?",
    "season-preview": "What should supporters realistically expect from this team once the competitive season begins?",
    "summer-window-review": "Now the summer window has closed, are you satisfied that the squad is stronger than it was when the window opened?",
    "midseason-checkpoint": "At this point in the season, what has pleased you most and what still has to improve?",
    "winter-window-preview": "With the mid-season window about to open, where does the squad most need help?",
    "winter-window-review": "The mid-season window is over. Did the club do enough business to meet its football objectives?",
    "season-review": "Looking back over the season as a whole, what is the biggest lesson the club should take from it?",
  };

  const roundThreeQuestions: Record<CalendarPressContext, string> = {
    "summer-window-open": "Before we finish, is there a clear recruitment principle you will not compromise on this summer?",
    "season-preview": "What would you personally regard as a successful season for " + club + "?",
    "summer-window-review": "If this squad falls short, will you accept responsibility for the decisions made during the window?",
    "midseason-checkpoint": "What is the single priority for the second half of the season?",
    "winter-window-preview": "Can supporters expect action, or should they prepare for a quiet window?",
    "winter-window-review": "What should supporters judge the club on between now and the end of the season?",
    "season-review": "What is the first thing that has to change before next season begins?",
  };

  let question = round === 2 ? roundTwoQuestions[context] : roundThreeQuestions[context];

  if (journalist?.style === "financial" && context.includes("window")) {
    question =
      round === 2
        ? "How much room does the club genuinely have to manoeuvre financially, and will value matter more than volume?"
        : "Can you assure supporters the club has not weakened its financial position to complete this business?";
  } else if (journalist?.style === "supporter" && pressure !== "soft") {
    question += " What should the people in the stands hold you accountable for?";
  } else if (journalist?.style === "confrontational" || pressure === "hard") {
    question += combative
      ? " You have been defensive so far, so give us a direct answer."
      : " I want a concrete answer rather than a general club message.";
  } else if (pressure === "soft") {
    question = "You have built a good working relationship with the local press, so let me ask this plainly: " + question;
  }

  const remembered = seasonPreviewStatement(state);
  if (
    remembered &&
    round === 2 &&
    (context === "summer-window-review" ||
      context === "midseason-checkpoint" ||
      context === "winter-window-review" ||
      context === "season-review")
  ) {
    question = `Earlier this season you told us, “${remembered}” ${question}`;
  }

  return { question, answers: answers(round, false) };
}


export function pressOutcomeLabel(tones: PressTone[]): string {
  const transparent = tones.filter((tone) => tone === "transparent").length;
  const dismiss = tones.filter((tone) => tone === "dismiss").length;
  if (transparent >= 2) return "Open and accountable";
  if (dismiss >= 2) return "Combative";
  return "Measured";
}
