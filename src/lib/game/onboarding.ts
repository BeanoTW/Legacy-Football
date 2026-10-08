import type { GameState } from "./types";

export type OnboardingArea =
  | "welcome"
  | "hub"
  | "inbox"
  | "squad"
  | "recruitment"
  | "staff"
  | "academy"
  | "cashflow"
  | "stadium"
  | "fixtures"
  | "calendar"
  | "board"
  | "commercial"
  | "tickets"
  | "dashboard"
  | "world"
  | "history"
  | "settings";

export type OnboardingChapterId =
  | "welcome"
  | "home"
  | "inbox"
  | "squad"
  | "transfers"
  | "staff"
  | "academy"
  | "finances"
  | "facilities"
  | "matches"
  | "calendar"
  | "board"
  | "commercial"
  | "tickets"
  | "reports"
  | "competitions"
  | "legacy"
  | "settings";

export interface OnboardingStep {
  title: string;
  body: string;
  /** Optional stable selector to visually spotlight. Missing targets degrade to a normal modal. */
  target?: string;
  kicker?: string;
}

export interface OnboardingChapter {
  id: OnboardingChapterId;
  area: OnboardingArea;
  title: string;
  summary: string;
  steps: OnboardingStep[];
}

export interface OnboardingProgress {
  enabled: boolean;
  completedChapterIds: OnboardingChapterId[];
  skippedAll?: boolean;
  replayChapterId?: OnboardingChapterId | null;
}

export const NEW_CAREER_ONBOARDING: OnboardingProgress = {
  enabled: true,
  completedChapterIds: [],
  skippedAll: false,
  replayChapterId: null,
};

export const ONBOARDING_CHAPTERS: readonly OnboardingChapter[] = [
  {
    id: "welcome",
    area: "welcome",
    title: "Your club, your decisions",
    summary: "The role, the living world and the philosophy behind Legacy Football.",
    steps: [
      {
        kicker: "Your role",
        title: "You are Director of Football & Operations",
        body: "You own the direction of the club, but you do not personally perform every job. Your manager manages, scouts discover players, specialists advise, and departments bring important decisions to your desk. You decide where to intervene and what the club becomes.",
      },
      {
        kicker: "The world",
        title: "The game moves when you do",
        body: "Advance time and the football world keeps living: matches are played, contracts run down, clubs negotiate, scouts work, finances move and people react. Advance until something needs you, deal with it, then let the world move again.",
        target: ".lf-dock-advance",
      },
      {
        kicker: "Decision philosophy",
        title: "You are not shown the answer",
        body: "Legacy Football explains the situation and the choice in front of you. It does not reveal hidden reputation, relationship or supporter effects before you commit. Make the call from the information you actually have and discover the consequences afterwards.",
      },
      {
        kicker: "Information",
        title: "Your staff shape the menu",
        body: "The quality of your staff changes what reaches you: how quickly they work, how accurate their judgement is and which realistic options they uncover. Staff do not secretly run your club for you. They improve the information and execution behind your decisions.",
      },
    ],
  },
  {
    id: "home",
    area: "hub",
    title: "Home",
    summary: "Your executive overview and the fastest route to what matters now.",
    steps: [
      {
        title: "Treat Home as your executive desk",
        body: "Home is not a checklist of everything in the game. It surfaces what deserves your attention now: decisions, upcoming football, club context and useful routes into the departments that own the detail.",
        target: '[data-tutorial-area="hub"]',
      },
      {
        title: "You do not need to change everything",
        body: "Understanding the club is a valid decision. Read what your manager and departments are telling you, decide where the genuine weaknesses are, and avoid spending money simply because a button exists.",
      },
    ],
  },
  {
    id: "inbox",
    area: "inbox",
    title: "Inbox & decisions",
    summary: "How departments bring real decisions to you without revealing the correct answer.",
    steps: [
      {
        title: "The Inbox is your decision queue",
        body: "Departments use the Inbox for information, offers, warnings and decisions that need director-level authority. An item marked Decision required can stop Advance until you deal with it.",
        target: '[data-tutorial-area="inbox"]',
      },
      {
        title: "Read the context, then own the outcome",
        body: "Choices show what you are agreeing to — including explicit costs or contractual terms — but not hidden simulation effects. News, finances, staff and supporters will reveal what your decision actually caused afterwards.",
      },
    ],
  },
  {
    id: "squad",
    area: "squad",
    title: "Squad",
    summary: "Understand the team through your manager's plans, contracts and positional use.",
    steps: [
      {
        title: "This is the squad your manager has to use",
        body: "Ratings matter, but squad building is not just collecting the highest number. Position, role, tactical fit, age, contract security, fitness and the manager's planned use all affect whether a player genuinely solves a problem.",
        target: '[data-tutorial-area="squad"]',
      },
      {
        title: "Depth is contextual",
        body: "A backup goalkeeper is not judged like a first-choice striker. Use the manager's assessments and the shape of the whole squad before deciding that a position needs another signing.",
      },
    ],
  },
  {
    id: "transfers",
    area: "recruitment",
    title: "Transfers & recruitment",
    summary: "Staff-led discovery, scouting uncertainty and realistic negotiations.",
    steps: [
      {
        title: "You do not browse the whole football database",
        body: "Recruitment is staff-led. Your manager identifies needs, you can send scouting assignments, and your recruitment team brings back a small market of players they believe are realistic for your club.",
        target: ".lf-transfer-desk",
      },
      {
        title: "The market reflects what your club knows",
        body: "Staff picks, scouting reports and shortlist entries are your working recruitment market. Better scouts improve discovery, speed and accuracy; they do not magically make elite players willing to join a small club.",
        target: ".lf-desk-search",
      },
      {
        title: "Deals become live business",
        body: "Once you approach a club or player, the deal moves into Live Business. Fees, wages, loans, rival interest and replies unfold over time. An enquiry is information; an agreement is a commitment.",
        target: ".lf-desk-lenses",
      },
    ],
  },
  {
    id: "staff",
    area: "staff",
    title: "Staff",
    summary: "Competence, delegation and the special role of your manager.",
    steps: [
      {
        title: "Staff quality changes execution",
        body: "Coaches, scouts, medical staff and specialists improve the quality of work in their department. Poorer staff are slower, less precise or less effective; ordinary staff are not a workplace-politics minigame.",
        target: '[data-tutorial-area="staff"]',
      },
      {
        title: "Your manager is different",
        body: "The manager owns football direction and team selection. His tactical ideas, squad needs, trust, backing and autonomy matter because you hired him to run the team. You can challenge him, but repeated interference has consequences.",
      },
    ],
  },
  {
    id: "academy",
    area: "academy",
    title: "Academy",
    summary: "A long-term player pipeline rather than instant transfer-market value.",
    steps: [
      {
        title: "Youth development is an investment in time",
        body: "The academy is about creating future first-team options and club value. Facilities, staff and opportunities matter over seasons; it should not behave like a shop that produces a ready-made senior player on demand.",
        target: '[data-tutorial-area="academy"]',
      },
    ],
  },
  {
    id: "finances",
    area: "cashflow",
    title: "Finances",
    summary: "One real bank balance, recurring commitments and the cost of ambition.",
    steps: [
      {
        title: "There is one bank balance",
        body: "Transfer spending, wages, facilities, commercial activity and matchday operations ultimately hit the same club cash. Budgets are authority and planning tools — they are not separate pots of imaginary money.",
        target: '[data-tutorial-area="cashflow"]',
      },
      {
        title: "Think beyond the purchase price",
        body: "A cheap signing with an expensive wage can be a bigger commitment than a higher fee. Watch recurring costs, reserves and future obligations, especially when revenue at your level is limited.",
      },
    ],
  },
  {
    id: "facilities",
    area: "stadium",
    title: "Facilities & Ground Studio",
    summary: "Physical infrastructure, maintenance and long-term development.",
    steps: [
      {
        title: "Your ground is a persistent physical asset",
        body: "Repairs restore what you already have; improvements and rebuilds change what the club can support. Ground Studio controls what a stand actually is — roof, structure and look belong to the build rather than being disconnected upgrade bars.",
        target: '[data-tutorial-area="stadium"]',
      },
      {
        title: "Condition becomes a football-club problem",
        body: "Neglected infrastructure eventually affects operations, supporters and the stories around the club. You will hear about genuine problems through the world rather than being nagged every week by arbitrary maintenance meters.",
      },
    ],
  },
  {
    id: "matches",
    area: "fixtures",
    title: "Matches",
    summary: "How your decisions reach the pitch without turning you into the manager.",
    steps: [
      {
        title: "You built the environment; the manager runs the team",
        body: "The match engine reflects squad quality, tactical fit, fitness, form and the manager's plan. You can watch what your football operation produced, but this is not a touchline tactics game where the director micromanages every pass.",
        target: '[data-tutorial-area="fixtures"]',
      },
      {
        title: "Results are evidence, not the whole diagnosis",
        body: "A bad result can come from a bad squad, poor fit, injuries, variance or simply a stronger opponent. Judge patterns over time before rebuilding the club after one match.",
      },
    ],
  },
  {
    id: "calendar",
    area: "calendar",
    title: "Calendar",
    summary: "The dated rhythm behind matches, windows, replies and club work.",
    steps: [
      {
        title: "Time is an actual operating constraint",
        body: "Fixtures, transfer windows, scouting returns, negotiation replies and deadlines all exist on the calendar. When you choose to act can matter as much as what you choose.",
        target: '[data-tutorial-area="calendar"]',
      },
    ],
  },
  {
    id: "board",
    area: "board",
    title: "Board",
    summary: "Different directors, different priorities and a long view of your performance.",
    steps: [
      {
        title: "The board is not one approval meter",
        body: "Directors care about different parts of the club and judge you against the responsibilities they actually hold. Their confidence develops from results, finances, supporters, facilities and the objectives they set.",
        target: '[data-tutorial-area="board"]',
      },
      {
        title: "Objectives are pressure, not a quest log",
        body: "Use objectives to understand what ownership expects. You may decide another priority matters more, but the board will remember what was promised and what was delivered.",
      },
    ],
  },
  {
    id: "commercial",
    area: "commercial",
    title: "Commercial",
    summary: "Revenue, sponsors and the club's relationship with its community.",
    steps: [
      {
        title: "Commercial work builds the club around the football",
        body: "Sponsors, supporter events and commercial relationships create revenue and local value. They cost time or money to execute and should scale with the level and reputation of the club.",
        target: '[data-tutorial-area="commercial"]',
      },
    ],
  },
  {
    id: "tickets",
    area: "tickets",
    title: "Tickets",
    summary: "Pricing as a trade-off between revenue, demand and supporter trust.",
    steps: [
      {
        title: "The highest price is not automatically the best price",
        body: "Ticket policy trades short-term revenue against demand and supporter sentiment. Capacity, club level, form and local expectations all shape what the crowd will tolerate.",
        target: '[data-tutorial-area="tickets"]',
      },
    ],
  },
  {
    id: "reports",
    area: "dashboard",
    title: "Reports",
    summary: "Use evidence and trends to understand the club beneath individual events.",
    steps: [
      {
        title: "Reports turn noise into patterns",
        body: "Use club reports to judge trends across finances, performance and operations. They are most useful when a week-to-week story feels unclear and you need the underlying direction.",
        target: '[data-tutorial-area="dashboard"]',
      },
    ],
  },
  {
    id: "competitions",
    area: "world",
    title: "Competitions & world",
    summary: "A persistent football pyramid that keeps moving beyond your club.",
    steps: [
      {
        title: "Your club exists inside a larger world",
        body: "Other clubs develop, recruit, win, fail, get promoted and get relegated. The pyramid is persistent, so today's non-league rival may be somewhere very different ten seasons from now.",
        target: '[data-tutorial-area="world"]',
      },
    ],
  },
  {
    id: "legacy",
    area: "history",
    title: "Legacy",
    summary: "The permanent record of the club you actually built.",
    steps: [
      {
        title: "The point is the story across seasons",
        body: "Legacy records what survived: promotions, seasons, major performances and the changing identity of the club. The game is designed for long careers where earlier decisions become history rather than disposable save-state noise.",
        target: '[data-tutorial-area="history"]',
      },
    ],
  },
  {
    id: "settings",
    area: "settings",
    title: "Settings & tutorial library",
    summary: "Save, appearance, updates and replaying how any system works.",
    steps: [
      {
        title: "You can revisit the rules whenever you want",
        body: "Settings contains the tutorial library. Replaying a chapter explains the mechanic and philosophy again without changing your career or resetting any decisions.",
        target: '[data-tutorial-area="settings"]',
      },
    ],
  },
] as const;

const CHAPTER_BY_ID = new Map(ONBOARDING_CHAPTERS.map((chapter) => [chapter.id, chapter]));

export function onboardingChapter(id: OnboardingChapterId): OnboardingChapter {
  const chapter = CHAPTER_BY_ID.get(id);
  if (!chapter) throw new Error(`Unknown onboarding chapter: ${id}`);
  return chapter;
}

export function onboardingProgress(state: GameState): OnboardingProgress | null {
  return state.onboarding ?? null;
}

export function activeOnboardingChapter(
  state: GameState,
  area: OnboardingArea,
): OnboardingChapter | null {
  const progress = onboardingProgress(state);
  if (!progress?.enabled || progress.skippedAll) return null;

  if (progress.replayChapterId) return onboardingChapter(progress.replayChapterId);

  if (!progress.completedChapterIds.includes("welcome")) {
    return onboardingChapter("welcome");
  }

  return (
    ONBOARDING_CHAPTERS.find(
      (chapter) =>
        chapter.area === area &&
        chapter.id !== "welcome" &&
        !progress.completedChapterIds.includes(chapter.id),
    ) ?? null
  );
}

export function completeOnboardingChapterInPlace(
  state: GameState,
  chapterId: OnboardingChapterId,
): void {
  const progress = state.onboarding;
  if (!progress) return;
  if (!progress.completedChapterIds.includes(chapterId)) {
    progress.completedChapterIds.push(chapterId);
  }
  progress.replayChapterId = null;
}

export function skipAllOnboardingInPlace(state: GameState): void {
  state.onboarding ??= structuredClone(NEW_CAREER_ONBOARDING);
  state.onboarding.skippedAll = true;
  state.onboarding.replayChapterId = null;
}

export function replayOnboardingChapterInPlace(
  state: GameState,
  chapterId: OnboardingChapterId,
): void {
  state.onboarding ??= structuredClone(NEW_CAREER_ONBOARDING);
  state.onboarding.enabled = true;
  state.onboarding.skippedAll = false;
  state.onboarding.replayChapterId = chapterId;
}

export function restartOnboardingInPlace(state: GameState): void {
  state.onboarding = structuredClone(NEW_CAREER_ONBOARDING);
}
