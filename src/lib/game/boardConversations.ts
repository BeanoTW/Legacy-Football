import type { Director, GameState } from "./types";
import {
  BAND_LABEL,
  TRAIT_LABEL,
  confidenceBand,
  directorConcern,
  directorSatisfaction,
  recomputeConfidence,
  weeklyIncomeEstimate,
  weeklyWageBill,
} from "./board";
import { currentPosition } from "./board";
import { managerRecruitmentBrief } from "./managerRecruitmentBrief";
import { currentManager } from "./managerRelationship";

export interface BoardConversationTopic {
  id: string;
  label: string;
  answer: string;
  tone?: "normal" | "positive" | "warning";
}

const money = (value: number) =>
  value.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function personalityLine(director: Director): string {
  const traits = director.traits.map((trait) => TRAIT_LABEL[trait].toLowerCase());
  if (!traits.length) return "";
  return `You know my approach: ${traits.join(" and ")}.`;
}

export function boardConversationTopics(state: GameState, director: Director): BoardConversationTopic[] {
  const satisfaction = directorSatisfaction(state, director);
  const concern = directorConcern(state, director);
  const band = confidenceBand(director.confidence);
  const topics: BoardConversationTopic[] = [
    {
      id: "standing",
      label: "How are we doing?",
      answer: `From my side of the club, we're at ${satisfaction}% against the plan and the wider relationship is ${BAND_LABEL[band].toLowerCase()}. ${concern ? `The area I'd like us to look at together is “${concern.objective.label}” — ${concern.progress.detail}.` : "I do not have an outstanding concern in my portfolio."} ${personalityLine(director)}`,
      tone: satisfaction < 45 ? "warning" : satisfaction >= 75 ? "positive" : "normal",
    },
    {
      id: "priority",
      label: "Where can I use your help?",
      answer: concern
        ? `I'd put ${concern.objective.label.toLowerCase()} on our agenda. ${concern.objective.description} Current position: ${concern.progress.detail}. I can help you work through the options from my side of the club.`
        : "Nothing urgent from my department. If you want my view on a decision, bring it to me — that's what I'm here for.",
    },
  ];

  if (director.role === "Chairman") {
    const boardConfidence = recomputeConfidence(state.board);
    topics.push({
      id: "boardroom",
      label: "Where does the whole board stand?",
      answer: `The boardroom position is ${boardConfidence}% overall — ${BAND_LABEL[confidenceBand(boardConfidence)].toLowerCase()}. That is a measure of how well the plan is working across our different portfolios, not a countdown on your job. Individual directors may still have issues they can help you solve.`,
      tone: boardConfidence < 45 ? "warning" : boardConfidence >= 75 ? "positive" : "normal",
    });
  }

  if (director.role === "Finance Director" || director.role === "Chairman") {
    const wageBill = weeklyWageBill(state);
    const income = weeklyIncomeEstimate(state);
    topics.push({
      id: "finance",
      label: "Can we afford to invest?",
      answer: `We have ${money(state.cash)} cash. Recurring weekly income is roughly ${money(income)} against a wage bill of ${money(wageBill)}. ${state.cash < wageBill * 8 ? "I would be very cautious about asking the club to take on another major commitment." : "There is room to discuss investment, but I still expect a clear football or commercial case for it."}`,
      tone: state.cash < wageBill * 8 ? "warning" : "normal",
    });
  }

  if (director.role === "Football Director" || director.role === "Chairman") {
    const manager = currentManager(state);
    const brief = manager ? managerRecruitmentBrief(state, manager) : null;
    topics.push({
      id: "football",
      label: "What does the football side need?",
      answer: manager && brief
        ? brief.priorities.length
          ? `${manager.name}'s recruitment brief currently points to ${brief.priorities.map((item) => item.headline.toLowerCase()).join(", ")}. If you want board backing for football spend, that is the case I expect you to make.`
          : `${manager.name} does not have an urgent recruitment hole. I would rather see targeted improvement than spending for activity's sake.`
        : "Appointing a permanent manager is the football priority before we start reshaping the squad around a temporary setup.",
    });
  }

  if (director.role === "Supporters' Director") {
    topics.push({
      id: "supporters",
      label: "What are supporters saying?",
      answer: `Supporter mood is ${Math.round(state.fanHappiness)}%. ${state.fanHappiness >= 70 ? "The terraces broadly like the direction of travel." : state.fanHappiness >= 50 ? "The support is still with us, but they need reasons to believe the club is moving forward." : "There is real frustration around the club. Decisions that look detached from supporters will land badly right now."}`,
      tone: state.fanHappiness < 50 ? "warning" : state.fanHappiness >= 70 ? "positive" : "normal",
    });
  }

  if (director.role === "Commercial Director") {
    topics.push({
      id: "commercial",
      label: "Where should we invest off the pitch?",
      answer: `The commercial case has to connect facilities, matchday demand and sustainable income. With ${money(state.cash)} in cash, I would prioritise projects that either protect the ground or create a believable return rather than prestige spending.`,
    });
  }

  return topics;
}

export function boardRequestResponse(state: GameState, director: Director, request: "budget" | "facilities" | "patience"): { accepted: boolean; answer: string } {
  const satisfaction = directorSatisfaction(state, director);
  const cashCover = state.cash / Math.max(1, weeklyWageBill(state));
  if (request === "budget") {
    const accepted = satisfaction >= 62 && cashCover >= 10;
    return accepted
      ? { accepted: true, answer: "I'll support you taking a more aggressive case to the board. We have enough confidence and cash cover to discuss additional football spending." }
      : { accepted: false, answer: `Not yet. At ${satisfaction}% satisfaction and roughly ${cashCover.toFixed(1)} weeks of wage cover, I don't think the numbers support it yet. Let's improve the current position and revisit the case rather than stretching the club now.` };
  }
  if (request === "facilities") {
    const accepted = satisfaction >= 55 && state.cash > weeklyWageBill(state) * 12;
    return accepted
      ? { accepted: true, answer: "Bring me a properly costed facilities proposal. I am prepared to put it in front of the board rather than dismiss it on principle." }
      : { accepted: false, answer: "I don't think this is the moment to commit more capital. Stabilise the club first, then bring the facilities case back." };
  }
  const position = currentPosition(state);
  const accepted = satisfaction >= 50 || director.traits.includes("patient");
  return accepted
    ? { accepted: true, answer: `You have some room. I will judge the trend rather than one result, but I still expect progress from the current league position of ${position}.` }
    : { accepted: false, answer: "I don't think changing the timetable helps us yet. Let's identify what is blocking the plan and work on that first; I'll be clear with you about what the board needs to see improve." };
}
