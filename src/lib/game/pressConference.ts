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

function answerEffects(round: 2 | 3, tone: PressTone, risky: boolean): InboxEffect[] {
  if (round === 2) {
    if (tone === "transparent") return [{ kind: "reputation", delta: risky ? 1 : 2 }, { kind: "fanHappiness", delta: 1 }];
    if (tone === "reassure") return [{ kind: "reputation", delta: 1 }, { kind: "fanHappiness", delta: risky ? 0 : 1 }];
    return [{ kind: "reputation", delta: risky ? -2 : -1 }, { kind: "fanHappiness", delta: risky ? -1 : 0 }];
  }
  if (tone === "transparent") return [{ kind: "reputation", delta: 1 }, { kind: "fanHappiness", delta: 1 }];
  if (tone === "reassure") return [{ kind: "reputation", delta: risky ? 0 : 1 }];
  return [{ kind: "reputation", delta: -1 }, { kind: "fanHappiness", delta: risky ? -1 : 0 }];
}

function incidentAnswerCopy(
  incident: RandomIncidentDefinition,
  round: 2 | 3,
  risky: boolean,
): Record<PressTone, string> {
  const id = incident.id;

  if (id === "data-breach") {
    return round === 2
      ? {
          transparent: "The test is simple: contain the breach, tell affected supporters what we know, and prove we've closed the weakness that allowed it.",
          reassure: "We've brought the right people in and we're following the evidence. I won't create panic by pretending we know more than we do.",
          dismiss: "I'm not going to publish a technical incident response through a press conference. Verified information will go directly to supporters.",
        }
      : {
          transparent: "My promise is that supporters will hear material facts from the club, not discover them later from somebody else.",
          reassure: "We'll keep people informed when there is something useful to say, and we'll judge the response by whether the systems are genuinely secure.",
          dismiss: "I've answered what I can responsibly answer. Security work is more important than feeding a running commentary.",
        };
  }

  if (id === "ticketing-outage") {
    return round === 2
      ? {
          transparent: "Supporters should judge us on whether buying a ticket for the next home game is straightforward and whether anyone affected is put right.",
          reassure: "The immediate focus is restoring a reliable service. We can review suppliers and compensation once people can actually buy tickets again.",
          dismiss: "The outage was unacceptable, but it was an operational failure, not a conspiracy. We've moved to fix it.",
        }
      : {
          transparent: "If the same failure happens again after this response, then supporters are entitled to say we didn't solve it properly.",
          reassure: "The standard now is reliability. That's what the operations team has been told to deliver.",
          dismiss: "We've dealt with the failure. I'm not going to keep apologising after the system is back on its feet.",
        };
  }

  if (id === "catering-hygiene") {
    return round === 2
      ? {
          transparent: "People paid us for food in our ground, so the responsibility sits with us. The kiosks have to meet the standard before anything else matters.",
          reassure: "The remedial work is being checked properly. We won't reopen or continue trading on wishful thinking.",
          dismiss: "The inspection identified specific problems and we're dealing with those specific problems. I'm not going to invent a wider crisis.",
        }
      : {
          transparent: "Supporters can hold us to a basic promise: if we sell it inside this stadium, it will meet the required standard.",
          reassure: "The next inspection matters more than another statement from me. We need to show the fix worked.",
          dismiss: "The club has responded to the report. Repeating the accusation doesn't change the work already under way.",
        };
  }

  if (id === "stadium-security" || id === "storm-damage" || id === "floodlight-inspection" || id === "pitch-drainage") {
    const subject =
      id === "pitch-drainage" ? "pitch and fixture risk" :
      id === "floodlight-inspection" ? "match-night operation" :
      id === "storm-damage" ? "damaged part of the ground" :
      "stadium security";
    return round === 2
      ? {
          transparent: `The key issue is the ${subject}. We took advice, looked at the immediate risk and chose the response we believe keeps the club operating safely.`,
          reassure: "There are clear checks in place before the next fixture. If the risk changes, the decision changes with it.",
          dismiss: "I don't accept that managing a known risk is the same as ignoring it. The club has professionals responsible for this.",
        }
      : {
          transparent: "If the evidence says the current plan is no longer safe or workable, we'll change it. Pride won't override the facts.",
          reassure: "Supporters should judge us by whether fixtures go ahead safely and the underlying problem is actually resolved.",
          dismiss: "I've been clear about the club's position. I'm not going to manufacture uncertainty for the sake of a stronger headline.",
        };
  }

  if (id === "away-travel-support" || id === "community-fundraiser") {
    const community = id === "community-fundraiser";
    return round === 2
      ? {
          transparent: community
            ? "The question is what difference the club can genuinely make locally, not how good the cheque looks in a photograph."
            : "We know travelling support is part of what gives the club its identity. The question is how much help we can sustain fairly across a season.",
          reassure: community
            ? "We want community work that lasts rather than a one-week gesture we cannot maintain."
            : "We'll keep talking to supporter groups about where help has the biggest effect rather than promising to cover every cost.",
          dismiss: community
            ? "The club cannot become the funding body for every good cause in the area."
            : "Following a team has costs the club simply cannot absorb in full. Pretending otherwise would be dishonest.",
        }
      : {
          transparent: community
            ? "Supporters can judge us on whether the club is visibly contributing to the place it represents."
            : "Supporters can judge us on whether we listen and whether any help we promise actually reaches the people travelling.",
          reassure: community
            ? "We'll keep community commitments within what the club can genuinely deliver."
            : "We'll review it with the Supporters' Trust rather than make promises from this room.",
          dismiss: community
            ? "I've explained where the boundary is. A football club still has to remain financially responsible."
            : "I've explained the club's position. I won't promise money we do not believe we should spend.",
        };
  }

  return round === 2
    ? {
        transparent: risky
          ? "There was a real risk in the call. We made it with the information available and we'll be accountable for the result."
          : "There were trade-offs, but the decision was deliberate and supporters can judge it by what happens next.",
        reassure: "I stand by the plan. We're looking beyond one headline and doing what we believe is right for the club.",
        dismiss: risky
          ? "I don't accept the way the decision is being characterised. We made a responsible call and I won't apologise for making one."
          : "I think you're trying to create a controversy where there isn't one. The decision speaks for itself.",
      }
    : {
        transparent: "Supporters can judge us on what we actually deliver. That's the standard I'm setting.",
        reassure: "We've explained our position. Now the important thing is delivering on it.",
        dismiss: "I've answered the question. We're not going to keep going around in circles on it.",
      };
}

function incidentAnswers(
  incident: RandomIncidentDefinition,
  round: 2 | 3,
  risky: boolean,
): PressAnswer[] {
  const copy = incidentAnswerCopy(incident, round, risky);
  return (["transparent", "reassure", "dismiss"] as const).map((tone) => ({
    id: tone,
    tone,
    label: copy[tone],
    hint: "",
    effects: answerEffects(round, tone, risky),
  }));
}

function calendarAnswers(state: GameState, context: CalendarPressContext, round: 2 | 3): PressAnswer[] {
  const lines: Record<CalendarPressContext, Record<2 | 3, Record<PressTone, string>>> = {
    "summer-window-open": {
      2: {
        transparent: "A good window means improving the squad without chasing names for the sake of it. We have positions and price points in mind.",
        reassure: "We like the base of the squad. We'll move when the right deal is there rather than force business.",
        dismiss: "I'm not giving other clubs our shopping list. Recruitment is better done quietly.",
      },
      3: {
        transparent: "We won't break the wage structure or sign someone just because the deadline is getting closer.",
        reassure: "Patience is part of the plan. The right player at the right value matters more than a busy window.",
        dismiss: "Our recruitment principles are internal. You'll see them in the deals we do.",
      },
    },
    "season-preview": {
      2: {
        transparent: "Supporters should expect a side that improves as the season develops and competes properly every week.",
        reassure: "We have a clear plan for the season and I don't want to create pressure with a league-table promise in July.",
        dismiss: "Predictions before a ball is kicked don't help us. The table will tell the story soon enough.",
      },
      3: {
        transparent: "Success means meeting the football targets we've set while leaving the club stronger than we found it.",
        reassure: "I want progress that is sustainable, not one good month followed by six months of repair work.",
        dismiss: "I'm not setting an artificial pass mark for the press. We'll judge the season internally.",
      },
    },
    "summer-window-review": {
      2: {
        transparent: "We filled some needs and missed on others. I'm not going to call every piece of business perfect just because the window is shut.",
        reassure: "The squad is capable of doing what we're asking of it. Now the focus shifts from recruitment to performance.",
        dismiss: "The window is closed. Re-litigating every deal now won't win us a point.",
      },
      3: {
        transparent: "Yes. Recruitment sits under my responsibility and I'll own the judgement if the squad proves short.",
        reassure: "Responsibility is shared, but I'm comfortable with the decisions we made with the information we had.",
        dismiss: "I'm not accepting a hypothetical failure before we've even seen this squad play the season.",
      },
    },
    "midseason-checkpoint": {
      2: {
        transparent: "There are areas where we've progressed and areas where the numbers say we have to improve. Both matter.",
        reassure: "We're broadly where the plan expected us to be. The second half is about sharpening rather than ripping everything up.",
        dismiss: "Half a season is not the finish line. I won't overreact to a snapshot.",
      },
      3: {
        transparent: "The priority is turning our biggest weakness into something dependable before the run-in.",
        reassure: "Consistency. We do not need a revolution; we need more weeks where the plan is executed properly.",
        dismiss: "Our priorities are clear inside the club. I'm not giving opponents a briefing on them.",
      },
    },
    "winter-window-preview": {
      2: {
        transparent: "We'll look first at the positions where injuries, depth or performance have left the manager short.",
        reassure: "We can improve, but January is a bad time to panic-buy. Any deal still has to make sense in June.",
        dismiss: "I'm not discussing positions or targets while negotiations may be live.",
      },
      3: {
        transparent: "Supporters can expect us to act if the right deal is available, but not to spend for the appearance of activity.",
        reassure: "A quiet window can be the correct window if the squad and market don't justify forcing a move.",
        dismiss: "Transfer activity is not a performance for the press. We'll announce business when there is business.",
      },
    },
    "winter-window-review": {
      2: {
        transparent: "We addressed what we reasonably could and there are still areas we'd like stronger. That's the fair assessment.",
        reassure: "The manager has enough to work with for the run-in and the deals did not compromise the wider plan.",
        dismiss: "The window is finished. The useful question now is what this squad does on the pitch.",
      },
      3: {
        transparent: "Judge us on the run-in: results, squad availability and whether the players we backed actually contribute.",
        reassure: "Judge us on whether the team finishes the season stronger than it entered January.",
        dismiss: "You'll have a league table soon enough. That's a better judgement than another transfer-window grade.",
      },
    },
    "season-review": {
      2: {
        transparent: "The biggest lesson is where our plan held up under pressure and where reality exposed something we need to change.",
        reassure: "We have a much clearer picture of the squad and club now. That gives us a better base for next season.",
        dismiss: "I'll do the detailed post-mortem with the board and manager, not in soundbites tonight.",
      },
      3: {
        transparent: "The first job is fixing the clearest weakness we've identified, then building the summer around that rather than chasing everything at once.",
        reassure: "We need a calm review, clear priorities and then decisive work once the window opens.",
        dismiss: "I'm not announcing next season's plan before this one is properly closed.",
      },
    },
  };

  if (state.season === 1 && context === "summer-window-open") {
    const opening: Record<2 | 3, Record<PressTone, string>> = {
      2: {
        transparent: "I bought the club because I want to build something lasting. I've put myself in charge of football and operations, but I'll employ good people and let specialists do their jobs.",
        reassure: "This isn't about pretending I can do every job. My role is to set the direction, appoint the right people and give the club a stable platform to grow.",
        dismiss: "I didn't buy the club for a vanity title. Judge the ownership by what the club becomes, not by what I say on day one.",
      },
      3: {
        transparent: "The promise is simple: every promotion, signing and stand we build should leave this club stronger than it was before. There is no short-term exit plan.",
        reassure: "We're starting in non-league and we'll grow at the club's pace. I want supporters to recognise the same club even if one day we're playing at the top.",
        dismiss: "I'm not going to put a ceiling on a club I've just bought. We start here, we build properly, and we'll see how far we can take it.",
      },
    };
    const copy = opening[round];
    return (["transparent", "reassure", "dismiss"] as const).map((tone) => ({
      id: tone, tone, label: copy[tone], hint: "", effects: answerEffects(round, tone, false),
    }));
  }

  const copy = lines[context][round];
  return (["transparent", "reassure", "dismiss"] as const).map((tone) => ({
    id: tone,
    tone,
    label: copy[tone],
    hint: "",
    effects: answerEffects(round, tone, false),
  }));
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

  return { question, answers: incidentAnswers(incident, 2, risky) };
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

  return { question, answers: incidentAnswers(incident, 3, risky) };
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
    "summer-window-open": state.season === 1
      ? "You've made yourself responsible for football and operations rather than sitting back as owner. How hands-on do you intend to be?"
      : "What would make this transfer window a successful one for the club?",
    "season-preview": "What should supporters realistically expect from this team once the competitive season begins?",
    "summer-window-review": "Now the summer window has closed, are you satisfied that the squad is stronger than it was when the window opened?",
    "midseason-checkpoint": "At this point in the season, what has pleased you most and what still has to improve?",
    "winter-window-preview": "With the mid-season window about to open, where does the squad most need help?",
    "winter-window-review": "The mid-season window is over. Did the club do enough business to meet its football objectives?",
    "season-review": "Looking back over the season as a whole, what is the biggest lesson the club should take from it?",
  };

  const roundThreeQuestions: Record<CalendarPressContext, string> = {
    "summer-window-open": state.season === 1
      ? "You own the club, so nobody can sack you. What should supporters hold you accountable for as you build it?"
      : "Before we finish, is there a clear recruitment principle you will not compromise on this summer?",
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

  return { question, answers: calendarAnswers(state, context, round) };
}


export function pressOutcomeLabel(tones: PressTone[]): string {
  const transparent = tones.filter((tone) => tone === "transparent").length;
  const dismiss = tones.filter((tone) => tone === "dismiss").length;
  if (transparent >= 2) return "Open and accountable";
  if (dismiss >= 2) return "Combative";
  return "Measured";
}
