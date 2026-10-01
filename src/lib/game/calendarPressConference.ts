import type { GameState, InboxChoice, InboxEffect } from "./types";
import { journalistQuestionPressure, type JournalistProfile } from "./mediaRelations";
import type { PressAnswer, PressRound, PressTone } from "./pressConference";

export type CalendarPressKind =
  | "summer-window-open"
  | "season-launch"
  | "summer-window-review"
  | "midseason-window-preview"
  | "midseason-window-review"
  | "season-review";

export interface CalendarPressDefinition {
  kind: CalendarPressKind;
  week: number;
  questionCount: 2 | 3;
  subject: string;
  openingQuestion: string;
}

export function calendarPressDefinition(state: GameState, kind: CalendarPressKind): CalendarPressDefinition {
  const club = state.clubName;
  switch (kind) {
    case "summer-window-open":
      return { kind, week: 1, questionCount: 2, subject: "Opening transfer-window briefing", openingQuestion: "The summer window is open. Where does " + club + " most need to strengthen before the season settles down?" };
    case "season-launch":
      return { kind, week: 4, questionCount: 3, subject: "Season launch press conference", openingQuestion: "Pre-season is almost over. What should " + club + " supporters expect from this team once the competitive season begins?" };
    case "summer-window-review":
      return { kind, week: 10, questionCount: 2, subject: "Summer transfer-window review", openingQuestion: "The summer window has closed. Are you satisfied with the business " + club + " completed?" };
    case "midseason-window-preview":
      return { kind, week: 23, questionCount: 2, subject: "Mid-season transfer-window preview", openingQuestion: "The mid-season window opens next week. Should supporters expect " + club + " to be active?" };
    case "midseason-window-review":
      return { kind, week: 28, questionCount: 2, subject: "Mid-season transfer-window review", openingQuestion: "The mid-season window is shut. Is the squad stronger now than it was before the window opened?" };
    case "season-review":
      return { kind, week: 46, questionCount: 3, subject: "End-of-season press conference", openingQuestion: "The season is at its end. How do you assess " + club + "'s year as a whole?" };
  }
}

export function calendarPressKindsForWeek(week: number): CalendarPressKind[] {
  if (week === 1) return ["summer-window-open"];
  if (week === 4) return ["season-launch"];
  if (week === 10) return ["summer-window-review"];
  if (week === 23) return ["midseason-window-preview"];
  if (week === 28) return ["midseason-window-review"];
  if (week === 46) return ["season-review"];
  return [];
}

export function calendarPressConversationKey(kind: CalendarPressKind, season: number): string {
  return "calendar-press:" + kind + ":s" + season;
}

export function calendarPressKindFromConversationKey(key: string): CalendarPressKind | null {
  const prefix = "calendar-press:";
  if (!key.startsWith(prefix)) return null;
  const raw = key.slice(prefix.length).split(":")[0];
  const allowed: CalendarPressKind[] = ["summer-window-open", "season-launch", "summer-window-review", "midseason-window-preview", "midseason-window-review", "season-review"];
  return allowed.includes(raw as CalendarPressKind) ? (raw as CalendarPressKind) : null;
}

export function calendarPressOpeningChoices(kind: CalendarPressKind): InboxChoice[] {
  const seasonMoment = kind === "season-launch" || kind === "season-review";
  return [
    { id: "transparent", label: seasonMoment ? "Set clear expectations" : "Answer openly", hint: seasonMoment ? "Give supporters a clear view of how you judge the club and what comes next." : "Be direct about the club's plans and accept that they can be judged later.", effects: [{ kind: "reputation", delta: 1 }, { kind: "fanHappiness", delta: 1 }] },
    { id: "reassure", label: seasonMoment ? "Keep expectations measured" : "Keep the message measured", hint: "Stay positive without making a hard promise.", effects: [{ kind: "fanHappiness", delta: 1 }] },
    { id: "dismiss", label: "Keep plans inside the club", hint: "Give the press very little. It avoids promises but may frustrate supporters.", effects: [{ kind: "reputation", delta: -1 }] },
  ];
}

function laterAnswers(round: 2 | 3): PressAnswer[] {
  const effects = (tone: PressTone): InboxEffect[] => tone === "transparent"
    ? [{ kind: "reputation", delta: 1 }, { kind: "fanHappiness", delta: 1 }]
    : tone === "reassure"
      ? [{ kind: "fanHappiness", delta: 1 }]
      : [{ kind: "reputation", delta: -1 }];
  return [
    { id: "transparent", label: round === 3 ? "Give them something concrete" : "Answer directly", hint: "Put a clear position on the record.", effects: effects("transparent") },
    { id: "reassure", label: round === 3 ? "End on a steady message" : "Keep expectations controlled", hint: "Stay positive without overcommitting.", effects: effects("reassure") },
    { id: "dismiss", label: round === 3 ? "Close the subject" : "Keep details private", hint: "Shut the line of questioning down.", effects: effects("dismiss") },
  ];
}

function secondQuestion(state: GameState, kind: CalendarPressKind): string {
  switch (kind) {
    case "summer-window-open": return "How much of the recruitment plan is about immediate first-team improvement rather than longer-term development?";
    case "season-launch": return "What would count as a successful season for " + state.clubName + " from where you stand today?";
    case "summer-window-review": return "Is there one area of the squad you still wish you had strengthened before the deadline?";
    case "midseason-window-preview": return "Will results over the next few weeks change how aggressive the club is in the market?";
    case "midseason-window-review": return "If results do not improve from here, should supporters judge the window as a missed opportunity?";
    case "season-review": return "What did this season teach you about what " + state.clubName + " needs to change next?";
  }
}

function thirdQuestion(state: GameState, kind: CalendarPressKind, tones: PressTone[]): string {
  const combative = tones.includes("dismiss");
  if (kind === "season-launch") return combative ? "You have kept expectations guarded. What, then, should supporters actually hold you accountable for this season?" : "Before the first competitive ball is kicked, what is the one standard you want this club judged against?";
  return combative ? "You have resisted putting much on the record. What responsibility do you personally take for the season just finished?" : "What is the first thing supporters should expect the club to do differently before next season?";
}

export function calendarPressRound(state: GameState, kind: CalendarPressKind, round: 2 | 3, previousTones: PressTone[], journalist?: JournalistProfile): PressRound {
  const pressure = journalist ? journalistQuestionPressure(state, journalist) : "normal";
  let question = round === 2 ? secondQuestion(state, kind) : thirdQuestion(state, kind, previousTones);
  if (pressure === "hard") question += " Please give me a direct answer.";
  else if (pressure === "soft") question = "You have built some trust with the local press, so let me ask it plainly: " + question;
  if (journalist?.style === "financial" && (kind.includes("window") || kind === "season-review")) question += " And how much did finances shape that position?";
  if (journalist?.style === "supporter" && round === 2) question += " What should the people in the stands judge you on?";
  return { question, answers: laterAnswers(round) };
}
