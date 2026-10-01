import type {
  GameState,
  InboxChoice,
  InboxItem,
  ScheduledGenerator,
} from "./types";
import { hashString } from "./rng";
import { absoluteWeek, fromAbsoluteWeek } from "./time";
import { isTransferWindowOpen } from "./calendar";
import {
  currentManager,
  managerPersonality,
} from "./managerRelationship";
import { managerRecruitmentBrief } from "./managerRecruitmentBrief";
import {
  managerRecruitmentCommitment,
  managerRecruitmentCommitmentFlag,
} from "./managerRecruitmentCommitment";

const POSITION_LABEL: Record<string, string> = {
  GK: "goalkeeper",
  DEF: "defender",
  MID: "midfielder",
  FWD: "forward",
};

type Draft = Omit<
  InboxItem,
  "id" | "generatorId" | "week" | "season" | "status" | "expiresWeek"
> & {
  expiresInWeeks?: number;
};

function makeItem(
  state: GameState,
  generatorId: string,
  draft: Draft,
): InboxItem {
  const expiresAtAbsoluteWeek =
    draft.expiresAtAbsoluteWeek ??
    (draft.expiresInWeeks != null
      ? absoluteWeek(state.season, state.week) + draft.expiresInWeeks
      : undefined);
  const expiresWeek =
    expiresAtAbsoluteWeek != null
      ? fromAbsoluteWeek(expiresAtAbsoluteWeek).week
      : undefined;
  const { expiresInWeeks: _drop, ...rest } = draft;
  void _drop;
  return {
    id: "inbox-" + hashString(draft.eventKey).toString(36),
    generatorId,
    week: state.week,
    season: state.season,
    status: draft.choices?.length ? "awaitingDecision" : "unread",
    ...rest,
    expiresAtAbsoluteWeek,
    expiresWeek,
  };
}

function roleLabel(priority: ReturnType<typeof managerRecruitmentBrief>["priorities"][number]): string {
  return priority.tacticalPosition
    ? priority.tacticalPosition
    : POSITION_LABEL[priority.position] ?? priority.position;
}

export function managerRecruitmentRequestItems(state: GameState): InboxItem[] {
  const manager = currentManager(state);
  if (!manager || !isTransferWindowOpen(state)) return [];

  const nowAbs = absoluteWeek(state.season, state.week);
  const cooldownKey = "managerRecruitmentRequestAsked:" + manager.id;
  const last = Number(state.inboxFlags[cooldownKey] ?? -999);
  if (nowAbs - last < 10) return [];

  const existing = managerRecruitmentCommitment(state, manager.id);
  if (existing?.active) return [];
  if (
    state.inbox.some(
      (item) =>
        item.generatorId === "manager-recruitment-request" &&
        item.relatedEntityId === manager.id &&
        item.status === "awaitingDecision",
    )
  ) return [];

  const brief = managerRecruitmentBrief(state, manager);
  const priority = brief.priorities[0];
  if (!priority) return [];

  const role = roleLabel(priority);
  const level =
    priority.playerLevel === "startingXI"
      ? "a genuine starting-quality player"
      : priority.playerLevel === "firstTeam"
        ? "a first-team level player"
        : "reliable squad depth";

  const choices: InboxChoice[] = [
    {
      id: "promise",
      label: "Promise to strengthen the position",
      hint: "You have six weeks to deliver. Keeping the promise will build significant trust.",
      effects: [
        { kind: "managerRelationship", managerId: manager.id, backing: 1, autonomy: 1 },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "position"), value: priority.position },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "tacticalPosition"), value: priority.tacticalPosition ?? "" },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "playerLevel"), value: priority.playerLevel },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "acceptedAtAbsoluteWeek"), value: nowAbs },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "dueAtAbsoluteWeek"), value: nowAbs + 6 },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "active"), value: true },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "fulfilled"), value: false },
        { kind: "flag", key: managerRecruitmentCommitmentFlag(manager.id, "fulfilledPlayerName"), value: "" },
        { kind: "flag", key: cooldownKey, value: nowAbs },
        {
          kind: "scheduleGenerator",
          generatorId: "manager-recruitment-promise-review",
          inWeeks: 6,
          payload: {
            managerId: manager.id,
            position: priority.position,
            playerLevel: priority.playerLevel,
            requestAbsoluteWeek: nowAbs,
          },
        },
      ],
    },
    {
      id: "consider",
      label: "Say you will explore the market",
      hint: "No promise. The manager gets no guarantee, but neither of you is boxed in.",
      effects: [{ kind: "flag", key: cooldownKey, value: nowAbs }],
    },
    {
      id: "decline",
      label: "Tell him it is not a priority",
      hint: "Protect your recruitment plan, at the cost of managerial goodwill.",
      effects: [
        { kind: "managerRelationship", managerId: manager.id, trust: -1, backing: -3, autonomy: -1 },
        { kind: "flag", key: cooldownKey, value: nowAbs },
      ],
    },
  ];

  return [
    makeItem(state, "manager-recruitment-request", {
      eventKey: "manager-recruitment-request:" + manager.id + ":abs" + nowAbs,
      conversationKey: "manager:" + manager.id + ":recruitment",
      relatedEntityId: manager.id,
      sender: manager.name,
      department: "Manager",
      category: "staff",
      priority: "high",
      subject: "Manager asks for backing at " + role,
      body:
        brief.message + "\n\nMy priority is " + priority.headline.toLowerCase() + ": " +
        priority.rationale + " I am asking for " + level + " before this window gets away from us.",
      expiresInWeeks: 1,
      choices,
      consequenceOnExpire: [
        { kind: "managerRelationship", managerId: manager.id, trust: -1, backing: -2 },
        { kind: "flag", key: cooldownKey, value: nowAbs },
      ],
    }),
  ];
}

export function managerRecruitmentPromiseReviewItems(
  state: GameState,
  dueEntries: ScheduledGenerator[],
): InboxItem[] {
  return dueEntries.flatMap((entry) => {
    const managerId = String(entry.payload?.managerId ?? "");
    const position = String(entry.payload?.position ?? "");
    const manager = state.hiredStaff.find(
      (staff) => staff.id === managerId && staff.role === "Manager",
    );
    if (!manager || !managerId || !position) return [];

    const commitment = managerRecruitmentCommitment(state, managerId);
    if (!commitment || commitment.position !== position) return [];

    const role = POSITION_LABEL[position] ?? position;
    if (commitment.fulfilled) {
      return [
        makeItem(state, "manager-recruitment-promise-review", {
          eventKey:
            "manager-recruitment-promise-review:" +
            managerId +
            ":" +
            entry.dueAtAbsoluteWeek +
            ":kept",
          conversationKey: "manager:" + managerId + ":recruitment",
          relatedEntityId: managerId,
          sender: manager.name,
          department: "Manager",
          category: "staff",
          priority: "normal",
          subject:
            "Promise kept — " +
            (commitment.fulfilledPlayerName ?? role) +
            " delivered",
          body:
            "You said you would strengthen " +
            role +
            ", and you did it before the deadline. " +
            (commitment.fulfilledPlayerName ?? "The new signing") +
            " has made that commitment real. That matters when I ask the squad to trust the direction of the club.",
        }),
      ];
    }

    const personality = managerPersonality(manager);
    const financePenalty =
      personality.financialPragmatism === "High" ? 0 : -1;
    const nowAbs = absoluteWeek(state.season, state.week);

    return [
      makeItem(state, "manager-recruitment-promise-review", {
        eventKey:
          "manager-recruitment-promise-review:" +
          managerId +
          ":" +
          entry.dueAtAbsoluteWeek +
          ":missed",
        conversationKey: "manager:" + managerId + ":recruitment",
        relatedEntityId: managerId,
        sender: manager.name,
        department: "Manager",
        category: "staff",
        priority: "urgent",
        subject: "Manager confronts chairman over broken recruitment promise",
        body:
          "Six weeks ago you promised me reinforcements at " +
          role +
          ". That player has not arrived. I need to know whether this was a failed deal, a change of plan, or a promise I should never have relied on.",
        expiresInWeeks: 1,
        choices: [
          {
            id: "renew",
            label: "Own it and renew the promise",
            hint: "Ask for four more weeks and accept some loss of trust now.",
            effects: [
              { kind: "managerRelationship", managerId, trust: -1, backing: -2 },
              { kind: "flag", key: managerRecruitmentCommitmentFlag(managerId, "dueAtAbsoluteWeek"), value: nowAbs + 4 },
              { kind: "flag", key: managerRecruitmentCommitmentFlag(managerId, "active"), value: true },
              {
                kind: "scheduleGenerator",
                generatorId: "manager-recruitment-promise-review",
                inWeeks: 4,
                payload: {
                  managerId,
                  position,
                  ...(commitment.playerLevel ? { playerLevel: commitment.playerLevel } : {}),
                  requestAbsoluteWeek:
                    typeof entry.payload?.requestAbsoluteWeek === "number"
                      ? entry.payload.requestAbsoluteWeek
                      : commitment.acceptedAtAbsoluteWeek,
                },
              },
            ],
          },
          {
            id: "finances",
            label: "Explain the financial reality",
            hint:
              personality.financialPragmatism === "High"
                ? "He is financially pragmatic and may accept that explanation."
                : "He may understand it, but he will still feel under-backed.",
            effects: [
              { kind: "managerRelationship", managerId, trust: financePenalty, backing: -2, autonomy: -1 },
              { kind: "flag", key: managerRecruitmentCommitmentFlag(managerId, "active"), value: false },
            ],
          },
          {
            id: "withdraw",
            label: "Tell him the plan has changed",
            hint: "End the commitment and make clear recruitment remains the chairman's call.",
            effects: [
              { kind: "managerRelationship", managerId, trust: -3, backing: -5, autonomy: -2 },
              { kind: "flag", key: managerRecruitmentCommitmentFlag(managerId, "active"), value: false },
            ],
          },
        ],
        consequenceOnExpire: [
          { kind: "managerRelationship", managerId, trust: -4, backing: -6 },
          { kind: "flag", key: managerRecruitmentCommitmentFlag(managerId, "active"), value: false },
        ],
      }),
    ];
  });
}
