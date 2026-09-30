import type {
  GameState,
  InboxCategory,
  InboxChoice,
  InboxDepartment,
  InboxEffect,
  InboxPriority,
} from "./types";
import { footballLevelOfClub, type FootballLevel } from "./footballLevel";

export interface RandomIncidentDefinition {
  id: string;
  sender: string;
  department: InboxDepartment;
  category: InboxCategory;
  priority: InboxPriority;
  subject: (state: GameState) => string;
  body: (state: GameState) => string;
  choices: (state: GameState) => InboxChoice[];
  press?: {
    question: (state: GameState, decisionLabel: string) => string;
    riskyChoices?: string[];
  };
}

const COST_SCALE: Record<FootballLevel, number> = {
  1: 10,
  2: 6,
  3: 4,
  4: 2.5,
  5: 1.7,
  6: 1.25,
  7: 1,
  8: 0.75,
};

function scaledCost(state: GameState, levelSevenCost: number): number {
  const level = footballLevelOfClub(state, state.clubName);
  const scaled = levelSevenCost * COST_SCALE[level];
  return Math.max(5_000, Math.round(scaled / 5_000) * 5_000);
}

function cashExpense(amount: number, note: string): InboxEffect {
  return { kind: "cash", amount: -amount, expenseCategory: "other", note };
}

function money(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}m`;
  return `£${Math.round(amount / 1_000)}k`;
}

function threeWayRepair(
  state: GameState,
  options: {
    full: number;
    partial: number;
    fullLabel: string;
    partialLabel: string;
    deferLabel: string;
    fullEffects: InboxEffect[];
    partialEffects: InboxEffect[];
    deferEffects: InboxEffect[];
    note: string;
  },
): InboxChoice[] {
  const full = scaledCost(state, options.full);
  const partial = scaledCost(state, options.partial);
  return [
    {
      id: "full",
      label: `${options.fullLabel} — ${money(full)}`,
      hint: "The expensive answer, but the cleanest long-term fix.",
      effects: [cashExpense(full, options.note), ...options.fullEffects],
    },
    {
      id: "partial",
      label: `${options.partialLabel} — ${money(partial)}`,
      hint: "Cheaper now, with some risk left in the system.",
      effects: [cashExpense(partial, options.note), ...options.partialEffects],
    },
    {
      id: "defer",
      label: options.deferLabel,
      hint: "Protect the bank balance and accept the sporting/public risk.",
      effects: options.deferEffects,
    },
  ];
}

export const RANDOM_INCIDENTS: RandomIncidentDefinition[] = [
  {
    id: "storm-stand-damage",
    sender: "Eddie Kerr",
    department: "Groundskeeper",
    category: "facilities",
    priority: "high",
    subject: () => "Storm damage found in the main stand",
    body: (state) => {
      const full = scaledCost(state, 130_000);
      const partial = scaledCost(state, 40_000);
      return (
        "Overnight wind and water have damaged roof panels, cabling and part of the concourse. " +
        "The stand can remain open for now, but another bad spell could force sections to close.\n\n" +
        `Engineering estimate: full repair ${money(full)}, temporary repair ${money(partial)}, or monitor it and spend nothing today.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 130_000,
        partial: 40_000,
        fullLabel: "Authorise the full repair",
        partialLabel: "Make it safe for now",
        deferLabel: "Leave it and monitor the damage",
        note: "Emergency stand repairs",
        fullEffects: [
          { kind: "standCondition", standKey: "W", delta: 8 },
          { kind: "fanHappiness", delta: 2 },
          { kind: "reputation", delta: 1 },
        ],
        partialEffects: [
          { kind: "standCondition", standKey: "W", delta: 3 },
          { kind: "fanHappiness", delta: 0 },
        ],
        deferEffects: [
          { kind: "standCondition", standKey: "W", delta: -5 },
          { kind: "fanHappiness", delta: -2 },
          { kind: "reputation", delta: -1 },
        ],
      }),
    press: {
      question: (_state, decision) =>
        `You've chosen to “${decision}” after the storm damage. What do you say to supporters worried about safety and the club's priorities?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "pitch-drainage",
    sender: "Eddie Kerr",
    department: "Groundskeeper",
    category: "facilities",
    priority: "high",
    subject: () => "Pitch drainage is beginning to fail",
    body: (state) => {
      const full = scaledCost(state, 90_000);
      const partial = scaledCost(state, 25_000);
      return (
        "The grounds team have found standing water beneath two high-use areas of the pitch. " +
        "Heavy rain could turn a playable surface into a postponement risk.\n\n" +
        `A proper drainage intervention is ${money(full)}. A short-term surface treatment is ${money(partial)}.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 90_000,
        partial: 25_000,
        fullLabel: "Fix the drainage properly",
        partialLabel: "Treat the worst areas",
        deferLabel: "Play on and hope the weather holds",
        note: "Pitch drainage works",
        fullEffects: [{ kind: "pitch", delta: 10 }, { kind: "reputation", delta: 1 }],
        partialEffects: [{ kind: "pitch", delta: 4 }],
        deferEffects: [{ kind: "pitch", delta: -7 }, { kind: "fanHappiness", delta: -1 }],
      }),
    press: {
      question: (_state, decision) =>
        `The pitch problem is now public and your response was “${decision}”. Are you comfortable with the risk to fixtures and playing quality?`,
      riskyChoices: ["defer"],
    },
  },
  {
    id: "floodlight-inspection",
    sender: "Eddie Kerr",
    department: "Groundskeeper",
    category: "facilities",
    priority: "urgent",
    subject: () => "Floodlight inspection raises a match-night problem",
    body: (state) => {
      const replace = scaledCost(state, 160_000);
      const hire = scaledCost(state, 30_000);
      return (
        "An electrical inspection has failed part of the floodlight system. Daytime football is unaffected, " +
        "but an evening fixture could be stopped if the remaining circuit trips.\n\n" +
        `Replacement work is ${money(replace)}. A temporary lighting rig can be hired for ${money(hire)}.`
      );
    },
    choices: (state) => {
      const replace = scaledCost(state, 160_000);
      const hire = scaledCost(state, 30_000);
      return [
        {
          id: "full",
          label: `Replace the failed system — ${money(replace)}`,
          hint: "Expensive, permanent and difficult to criticise.",
          effects: [cashExpense(replace, "Floodlight replacement"), { kind: "reputation", delta: 2 }],
        },
        {
          id: "partial",
          label: `Hire temporary lighting — ${money(hire)}`,
          hint: "Keeps fixtures protected while buying time.",
          effects: [cashExpense(hire, "Temporary floodlight hire")],
        },
        {
          id: "defer",
          label: "Risk the remaining floodlights",
          hint: "No cost today, but supporters and the league may not be impressed.",
          effects: [{ kind: "reputation", delta: -2 }, { kind: "fanHappiness", delta: -1 }],
        },
      ];
    },
    press: {
      question: (_state, decision) =>
        `The floodlight report has leaked. You chose to “${decision}”. Why should supporters believe match nights are being protected?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "catering-hygiene",
    sender: "Club Operations",
    department: "Club",
    category: "warning",
    priority: "high",
    subject: () => "Catering inspection flags serious problems",
    body: (state) => {
      const full = scaledCost(state, 65_000);
      const partial = scaledCost(state, 20_000);
      return (
        "A routine inspection has identified hygiene and equipment issues in two stadium kiosks. " +
        "There is no confirmed illness, but the report will become public.\n\n" +
        `A full refit and deep clean is ${money(full)}; limited remedial work is ${money(partial)}.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 65_000,
        partial: 20_000,
        fullLabel: "Close both kiosks and fix everything",
        partialLabel: "Carry out minimum remedial work",
        deferLabel: "Challenge the report and keep trading",
        note: "Stadium catering remediation",
        fullEffects: [{ kind: "fanHappiness", delta: 3 }, { kind: "reputation", delta: 2 }],
        partialEffects: [{ kind: "fanHappiness", delta: 0 }],
        deferEffects: [{ kind: "fanHappiness", delta: -3 }, { kind: "reputation", delta: -3 }],
      }),
    press: {
      question: (_state, decision) =>
        `The inspection report is out and your decision was “${decision}”. What responsibility does the club take for the matchday experience?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "away-travel-support",
    sender: "Priya Bhatt",
    department: "Fan Liaison",
    category: "fans",
    priority: "normal",
    subject: () => "Supporters ask the club to help with away travel",
    body: (state) => {
      const full = scaledCost(state, 35_000);
      const partial = scaledCost(state, 12_000);
      return (
        "The Supporters' Trust says travel costs are pricing regular fans out of several upcoming away games. " +
        "They want the club to contribute rather than leave organised coaches entirely to supporters.\n\n" +
        `A meaningful subsidy costs about ${money(full)}; a smaller gesture would cost ${money(partial)}.`
      );
    },
    choices: (state) => {
      const full = scaledCost(state, 35_000);
      const partial = scaledCost(state, 12_000);
      return [
        {
          id: "full",
          label: `Subsidise official coaches — ${money(full)}`,
          hint: "A visible supporter-first gesture.",
          effects: [cashExpense(full, "Away travel subsidy"), { kind: "fanHappiness", delta: 6 }, { kind: "reputation", delta: 1 }],
        },
        {
          id: "partial",
          label: `Offer a smaller travel fund — ${money(partial)}`,
          hint: "Helps without taking on the whole bill.",
          effects: [cashExpense(partial, "Away supporter travel fund"), { kind: "fanHappiness", delta: 3 }],
        },
        {
          id: "defer",
          label: "Decline — away travel is not a club cost",
          hint: "Protects cash but will irritate regular travelling supporters.",
          effects: [{ kind: "fanHappiness", delta: -3 }],
        },
      ];
    },
    press: {
      question: (_state, decision) =>
        `Supporters have asked whether the club understands the cost of following the team. Your answer was “${decision}”. What is your message to them?`,
      riskyChoices: ["defer"],
    },
  },
  {
    id: "community-fundraiser",
    sender: "Priya Bhatt",
    department: "Fan Liaison",
    category: "opportunity",
    priority: "normal",
    subject: () => "Local community appeal asks for club backing",
    body: (state) => {
      const full = scaledCost(state, 50_000);
      const partial = scaledCost(state, 15_000);
      return (
        "A local community sports project has asked the club to become its lead backer. " +
        "It would fund equipment and coaching for children who currently cannot afford organised football.\n\n" +
        `Lead backing is ${money(full)}; a smaller contribution is ${money(partial)}.`
      );
    },
    choices: (state) => {
      const full = scaledCost(state, 50_000);
      const partial = scaledCost(state, 15_000);
      return [
        {
          id: "full",
          label: `Become the lead backer — ${money(full)}`,
          hint: "Costs real money, but ties the club closely to its community.",
          effects: [cashExpense(full, "Community sports partnership"), { kind: "fanHappiness", delta: 5 }, { kind: "reputation", delta: 3 }],
        },
        {
          id: "partial",
          label: `Make a smaller contribution — ${money(partial)}`,
          hint: "A useful gesture without becoming the headline sponsor.",
          effects: [cashExpense(partial, "Community sports donation"), { kind: "fanHappiness", delta: 2 }, { kind: "reputation", delta: 1 }],
        },
        {
          id: "defer",
          label: "Politely decline",
          hint: "No financial cost; a modest missed opportunity.",
          effects: [{ kind: "reputation", delta: -1 }],
        },
      ];
    },
  },
  {
    id: "stadium-security",
    sender: "Club Operations",
    department: "Club",
    category: "warning",
    priority: "high",
    subject: () => "Security review finds vulnerable stadium access",
    body: (state) => {
      const full = scaledCost(state, 110_000);
      const partial = scaledCost(state, 35_000);
      return (
        "A post-match security review has found weak perimeter gates and blind spots around two entrances. " +
        "Nothing serious happened, but the report recommends action before another high-attendance fixture.\n\n" +
        `Permanent work is ${money(full)}; temporary barriers and extra stewarding cost ${money(partial)}.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 110_000,
        partial: 35_000,
        fullLabel: "Upgrade the entrances properly",
        partialLabel: "Use barriers and extra stewards",
        deferLabel: "Accept the existing arrangements",
        note: "Stadium security improvements",
        fullEffects: [{ kind: "reputation", delta: 2 }, { kind: "fanHappiness", delta: 1 }],
        partialEffects: [{ kind: "reputation", delta: 0 }],
        deferEffects: [{ kind: "reputation", delta: -2 }, { kind: "fanHappiness", delta: -1 }],
      }),
    press: {
      question: (_state, decision) =>
        `The stadium security review is now public and you chose to “${decision}”. Are finances being put ahead of supporter safety?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "data-breach",
    sender: "Club Operations",
    department: "Club",
    category: "warning",
    priority: "urgent",
    subject: () => "Club systems hit by a data breach",
    body: (state) => {
      const full = scaledCost(state, 80_000);
      const partial = scaledCost(state, 25_000);
      return (
        "An external security firm has confirmed unauthorised access to a club account containing supporter contact data. " +
        "There is no evidence of payment details being taken, but the club needs to decide how aggressively to respond.\n\n" +
        `Full forensic response and support is ${money(full)}; a limited technical reset is ${money(partial)}.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 80_000,
        partial: 25_000,
        fullLabel: "Launch full response and notify supporters",
        partialLabel: "Secure the systems quietly",
        deferLabel: "Wait for firmer evidence before acting",
        note: "Cyber incident response",
        fullEffects: [{ kind: "reputation", delta: 3 }, { kind: "fanHappiness", delta: 1 }],
        partialEffects: [{ kind: "reputation", delta: -1 }],
        deferEffects: [{ kind: "reputation", delta: -4 }, { kind: "fanHappiness", delta: -2 }],
      }),
    press: {
      question: (_state, decision) =>
        `Supporters want to know why the club responded to the data breach by choosing to “${decision}”. How do you justify that call?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "ticketing-outage",
    sender: "Club Operations",
    department: "Club",
    category: "warning",
    priority: "high",
    subject: () => "Ticketing system outage before a home fixture",
    body: (state) => {
      const full = scaledCost(state, 45_000);
      const partial = scaledCost(state, 10_000);
      return (
        "The online ticketing provider has suffered a major outage with a home fixture approaching. " +
        "Supporters are already reporting failed purchases and duplicated queues.\n\n" +
        `An emergency replacement service costs ${money(full)}; a manual workaround costs ${money(partial)}.`
      );
    },
    choices: (state) =>
      threeWayRepair(state, {
        full: 45_000,
        partial: 10_000,
        fullLabel: "Bring in an emergency ticketing provider",
        partialLabel: "Run a manual sales workaround",
        deferLabel: "Wait for the provider to recover",
        note: "Emergency ticketing response",
        fullEffects: [{ kind: "fanHappiness", delta: 2 }, { kind: "reputation", delta: 1 }],
        partialEffects: [{ kind: "fanHappiness", delta: -1 }],
        deferEffects: [{ kind: "fanHappiness", delta: -4 }, { kind: "reputation", delta: -2 }],
      }),
    press: {
      question: (_state, decision) =>
        `Fans were unable to buy tickets and the club chose to “${decision}”. What do you say to supporters who feel they were taken for granted?`,
      riskyChoices: ["partial", "defer"],
    },
  },
  {
    id: "club-shop-rush",
    sender: "Commercial Team",
    department: "Commercial",
    category: "opportunity",
    priority: "normal",
    subject: () => "Club shop has a sudden run on shirts",
    body: (state) => {
      const rush = scaledCost(state, 30_000);
      const normal = scaledCost(state, 8_000);
      return (
        "A run of good results has triggered an unexpected spike in shirt sales and several sizes are nearly gone. " +
        "The supplier can prioritise a restock, but only if we pay for a rush production slot.\n\n" +
        `Rush production costs ${money(rush)}; a standard smaller order costs ${money(normal)}.`
      );
    },
    choices: (state) => {
      const rush = scaledCost(state, 30_000);
      const normal = scaledCost(state, 8_000);
      const rushReturn = Math.round(rush * 1.8);
      const normalReturn = Math.round(normal * 1.45);
      return [
        {
          id: "full",
          label: `Rush a full restock — ${money(rush)}`,
          hint: `Higher risk, but expected sales of about ${money(rushReturn)}.`,
          effects: [
            cashExpense(rush, "Rush merchandise restock"),
            { kind: "cash", amount: rushReturn, incomeCategory: "merchandise", note: "Merchandise restock sales" },
            { kind: "fanHappiness", delta: 1 },
          ],
        },
        {
          id: "partial",
          label: `Place a smaller standard order — ${money(normal)}`,
          hint: `Safer stock commitment with expected sales around ${money(normalReturn)}.`,
          effects: [
            cashExpense(normal, "Standard merchandise restock"),
            { kind: "cash", amount: normalReturn, incomeCategory: "merchandise", note: "Merchandise restock sales" },
          ],
        },
        {
          id: "defer",
          label: "Let the remaining stock sell out",
          hint: "No cash risk, but some supporters will miss out.",
          effects: [{ kind: "fanHappiness", delta: -1 }],
        },
      ];
    },
  },
];

export function randomIncidentById(id: string): RandomIncidentDefinition | undefined {
  return RANDOM_INCIDENTS.find((incident) => incident.id === id);
}

export function pressChoicesForIncident(
  incident: RandomIncidentDefinition,
  decisionId: string,
): InboxChoice[] {
  const risky = incident.press?.riskyChoices?.includes(decisionId) ?? false;
  return [
    {
      id: "transparent",
      label: "Explain the decision openly",
      hint: risky
        ? "Own the trade-off rather than pretending there was no risk."
        : "A calm, accountable explanation should land well.",
      effects: [
        { kind: "reputation", delta: risky ? 2 : 1 },
        { kind: "fanHappiness", delta: 1 },
      ],
    },
    {
      id: "reassure",
      label: "Focus on protecting the club",
      hint: "Reassure supporters without conceding every criticism.",
      effects: [
        { kind: "fanHappiness", delta: risky ? 0 : 1 },
        { kind: "reputation", delta: risky ? 0 : 1 },
      ],
    },
    {
      id: "dismiss",
      label: "Push back on the criticism",
      hint: risky
        ? "A combative answer could turn a difficult story into a bigger one."
        : "Strong language may please some people, but carries reputational risk.",
      effects: [
        { kind: "fanHappiness", delta: risky ? -2 : -1 },
        { kind: "reputation", delta: risky ? -3 : -1 },
      ],
    },
  ];
}
