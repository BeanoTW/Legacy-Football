import type { FootballPlayer, GameState, InboxItem, Staff } from "./types";
import { activeContract, ageOf, playerName, userSquad, weeksLeftOnContract } from "./recruitment";
import { managerRecruitmentBrief } from "./managerRecruitmentBrief";
import { managerSquadFit } from "./managerSquadFit";
import { currentManager } from "./managerRelationship";
import { MANAGER_FORMATION_SLOTS } from "./managerFormationLayout";
import { positionEffectiveness, positionDevelopment, tacticalPositionProfile } from "./positions";
import { playerRecentForm } from "./playerForm";
import { playerSeasonStats } from "./playerSeasonStats";
import { playerFitness } from "./playerHealth";
import { hashString } from "./rng";
import { absoluteWeek } from "./time";

export interface ClubConversationTopic {
  id: string;
  label: string;
  answer: string;
  tone?: "normal" | "positive" | "warning";
}

function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function contractLine(state: GameState, player: FootballPlayer): string {
  const contract = activeContract(state, player.id);
  if (!contract) return "He is not currently tied to an active contract.";
  const weeks = weeksLeftOnContract(state, player.id);
  const seasons = Math.max(1, Math.ceil(weeks / 46));
  return `He has roughly ${seasons} season${seasons === 1 ? "" : "s"} left on ${contract.weeklyWage.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 })}/wk as a ${contract.squadRole.toLowerCase()}.`;
}

function managerSaleSuggestions(state: GameState, manager: Staff): Array<{ player: FootballPlayer; reason: string }> {
  const squad = userSquad(state);
  const fit = managerSquadFit(state, manager);
  const slots = MANAGER_FORMATION_SLOTS[fit.bestFormation];
  const scored = squad.map((player) => {
    const bestFit = slots.reduce((best, role) => Math.max(best, positionEffectiveness(player, role)), 0);
    const contract = activeContract(state, player.id);
    const roleProtection =
      contract?.squadRole === "Key Player" ? 10 :
      contract?.squadRole === "First Team" ? 6 :
      contract?.squadRole === "Rotation" ? 2 : 0;
    const score = player.currentAbility * bestFit + roleProtection;
    return { player, bestFit, score, contract };
  }).sort((a, b) => a.score - b.score);

  return scored.slice(0, Math.min(3, Math.max(0, squad.length - 14))).map(({ player, bestFit, contract }) => {
    const age = ageOf(player, state.season);
    const reasons: string[] = [];
    if (bestFit < 0.9) reasons.push(`he is an awkward fit for the ${fit.bestFormation}`);
    if (age >= 31) reasons.push("we should think about succession");
    if (contract?.squadRole === "Prospect" && age >= 24) reasons.push("his pathway has stalled");
    if (!reasons.length) reasons.push("he is behind stronger options for the minutes available");
    return { player, reason: reasons.join(" and ") };
  });
}

function loanSuggestions(state: GameState): FootballPlayer[] {
  const stats = new Map(playerSeasonStats(state).map((row) => [row.playerId, row]));
  return userSquad(state)
    .filter((player) => ageOf(player, state.season) <= 23)
    .filter((player) => {
      const contract = activeContract(state, player.id);
      if (contract?.squadRole === "Key Player" || contract?.squadRole === "First Team") return false;
      return (stats.get(player.id)?.minutes ?? 0) < 450;
    })
    .sort((a, b) => (b.potentialAbility - b.currentAbility) - (a.potentialAbility - a.currentAbility))
    .slice(0, 4);
}

function expiringPlayers(state: GameState): FootballPlayer[] {
  return userSquad(state)
    .filter((player) => weeksLeftOnContract(state, player.id) <= 24)
    .sort((a, b) => a.currentAbility - b.currentAbility);
}

function developmentPlayers(state: GameState): FootballPlayer[] {
  return userSquad(state)
    .slice()
    .sort((a, b) => (b.potentialAbility - b.currentAbility) - (a.potentialAbility - a.currentAbility))
    .slice(0, 4);
}

export function staffConversationTopics(state: GameState, staff: Staff): ClubConversationTopic[] {
  const topics: ClubConversationTopic[] = [];
  const manager = currentManager(state);
  const squad = userSquad(state);

  if (staff.role === "Manager") {
    const fit = managerSquadFit(state, staff);
    const brief = managerRecruitmentBrief(state, staff);
    topics.push({
      id: "squad",
      label: "How do you feel about the squad?",
      answer: `${fit.summary} ${fit.strengths.length ? `The strongest parts are ${sentenceList(fit.strengths.map((item) => item.toLowerCase()))}.` : ""} ${fit.gaps.length ? `The main concerns are ${sentenceList(fit.gaps.map((item) => item.toLowerCase()))}.` : ""}`.trim(),
      tone: fit.band === "Poor" ? "warning" : fit.band === "Excellent" ? "positive" : "normal",
    });
    topics.push({
      id: "recruitment",
      label: "What do you want from recruitment?",
      answer: brief.priorities.length
        ? `${brief.message} My priorities are ${sentenceList(brief.priorities.map((item) => `${item.headline.toLowerCase()} (${item.playerLevel === "backup" ? "depth" : item.playerLevel === "firstTeam" ? "first-team quality" : "starting quality"})`))}.`
        : "I do not see an urgent positional hole. If we recruit, I would rather improve quality than add bodies for the sake of it.",
    });
    const sales = managerSaleSuggestions(state, staff);
    topics.push({
      id: "sales",
      label: "Who would you be willing to sell?",
      answer: sales.length
        ? sales.map(({ player, reason }) => `${playerName(player)} — ${reason}.`).join("\n")
        : "I would not push anyone out at the moment. The squad is not deep enough for me to recommend sales just to trim numbers.",
    });
    const loans = loanSuggestions(state);
    topics.push({
      id: "loans",
      label: "Who should go out on loan?",
      answer: loans.length
        ? `I would look for useful minutes for ${sentenceList(loans.map(playerName))}. They need football more than another season sitting around the first team.`
        : "I do not have an obvious loan priority right now.",
    });
  }

  if (staff.role === "Head of Transfers" || staff.role === "Chief Scout" || staff.role === "Scout") {
    const brief = manager ? managerRecruitmentBrief(state, manager) : null;
    topics.push({
      id: "market",
      label: staff.role === "Head of Transfers" ? "Where should we focus the market?" : "What should we be scouting?",
      answer: brief?.priorities.length
        ? `The football need is clear: ${sentenceList(brief.priorities.map((item) => item.headline.toLowerCase()))}. I would focus our work there before widening the net.`
        : "There is no urgent positional hole, so I would search for value, upside and players who are clearly better than what we already have.",
    });
    if (staff.role === "Head of Transfers") {
      const sales = manager ? managerSaleSuggestions(state, manager) : [];
      topics.push({
        id: "sales",
        label: "Who could we move on?",
        answer: sales.length
          ? sales.map(({ player, reason }) => `${playerName(player)} — ${reason}.`).join("\n")
          : "There is no obvious sale I would force right now.",
      });
      const expiring = expiringPlayers(state);
      topics.push({
        id: "contracts",
        label: "Which contracts need attention?",
        answer: expiring.length
          ? `${sentenceList(expiring.map(playerName))} are inside the final 24 weeks of their deals. We should decide whether each is staying before the market gains leverage.`
          : "Nothing is immediately pressing on player contracts.",
      });
    }
  }

  if (["Assistant Manager", "Head Coach", "Goalkeeping Coach", "Fitness Coach", "Head of Youth"].includes(staff.role)) {
    const prospects = developmentPlayers(state).filter((player) => staff.role !== "Goalkeeping Coach" || player.primaryPosition === "GK");
    topics.push({
      id: "development",
      label: "Who needs your attention?",
      answer: prospects.length
        ? `The biggest development gaps are with ${sentenceList(prospects.map((player) => `${playerName(player)} (+${Math.max(0, player.potentialAbility - player.currentAbility)} potential headroom)`))}.`
        : "There is no single player who stands out as a development priority.",
    });
  }

  if (staff.role === "Head Physio" || staff.role === "Sports Scientist" || staff.role === "Fitness Coach") {
    const concerns = squad
      .filter((player) => player.injury || playerFitness(player) < 72)
      .sort((a, b) => playerFitness(a) - playerFitness(b))
      .slice(0, 5);
    topics.push({
      id: "fitness",
      label: "Any fitness or medical concerns?",
      answer: concerns.length
        ? concerns.map((player) => `${playerName(player)} — ${player.injury ? player.injury.type : `${playerFitness(player)}% fitness`}.`).join("\n")
        : "The group is in good shape. I do not have an urgent fitness or medical concern.",
      tone: concerns.length ? "warning" : "positive",
    });
  }

  if (!topics.length) {
    topics.push({
      id: "overview",
      label: "What should I know from your area?",
      answer: `From my ${staff.role.toLowerCase()} remit, I do not have an urgent issue for you right now. If that changes, I will bring it to you rather than wait for you to ask.`,
    });
  }

  return topics;
}

export function playerConversationTopics(state: GameState, player: FootballPlayer): ClubConversationTopic[] {
  const contract = activeContract(state, player.id);
  const season = playerSeasonStats(state).find((row) => row.playerId === player.id);
  const form = playerRecentForm(state, player.id);
  const age = ageOf(player, state.season);
  const tactical = tacticalPositionProfile(player);
  const previousResponse = state.inboxFlags[`playerConversation:${player.id}:playingTimeResponse`];

  const roleExpectation =
    contract?.squadRole === "Key Player" ? 65 :
    contract?.squadRole === "First Team" ? 45 :
    contract?.squadRole === "Rotation" ? 25 : 10;
  const elapsed = Math.max(1, state.week - 1);
  const minutesPerWeek = (season?.minutes ?? 0) / elapsed;
  const roleHappy = !contract || minutesPerWeek >= roleExpectation;

  const topics: ClubConversationTopic[] = [
    {
      id: "feeling",
      label: "How are you feeling?",
      answer: player.injury
        ? `I'm focused on getting back from the ${player.injury.type}. I am currently at ${playerFitness(player)}% fitness.`
        : form?.appearances
          ? `I feel ${form.band.toLowerCase()} at the moment. I've averaged ${form.averageRating.toFixed(2)} over my last ${form.appearances} appearance${form.appearances === 1 ? "" : "s"}.`
          : "I am fit and ready. I just need enough football to build rhythm.",
      tone: player.injury ? "warning" : "normal",
    },
    {
      id: "role",
      label: "Are you happy with your role?",
      answer: `${contract ? `You have me down as a ${contract.squadRole.toLowerCase()}.` : ""} I've played ${season?.minutes ?? 0} minutes this season. ${roleHappy ? "That is broadly in line with what I expected." : "I expected to be more involved than this."}${previousResponse ? ` I remember you previously told me: ${String(previousResponse).replaceAll("-", " ")}.` : ""}`,
      tone: roleHappy ? "normal" : "warning",
    },
    {
      id: "future",
      label: "How do you see your future here?",
      answer: `${contractLine(state, player)} ${player.transferStatus === "listed" ? "Being transfer-listed makes it pretty clear the club is open to a change." : age >= 31 ? "At my age, I want clarity rather than drifting into the last part of my career." : "If the pathway is right, I am happy to keep building here."}`,
    },
  ];

  if (age <= 23 && contract?.squadRole !== "Key Player") {
    topics.push({
      id: "loan",
      label: "Would you consider a loan?",
      answer: (season?.minutes ?? 0) < 450
        ? "Yes. If I am not going to play regularly here, a good loan where I actually get minutes would make sense."
        : "I am getting meaningful football here, so I would rather keep competing for my place unless the loan is clearly a step up.",
    });
  }

  const learned = tactical.secondary
    .map((position) => ({ position, ...positionDevelopment(player, position) }))
    .filter((row) => row.minutes > 0 || row.familiarity !== "Unfamiliar")
    .slice(0, 4);
  if (learned.length) {
    topics.push({
      id: "positions",
      label: "How are you adapting positionally?",
      answer: learned.map((row) => `${row.position}: ${row.familiarity}${row.next && row.minutesToNext != null ? ` — about ${row.minutesToNext} more minutes to ${row.next.toLowerCase()}` : ""}.`).join("\n"),
    });
  }

  return topics;
}

function inboxItem(state: GameState, draft: Omit<InboxItem, "id" | "generatorId" | "week" | "season" | "status">): InboxItem {
  return {
    ...draft,
    id: `inbox-${hashString(draft.eventKey).toString(36)}`,
    generatorId: "club-conversations",
    week: state.week,
    season: state.season,
    status: draft.choices?.length ? "awaitingDecision" : "unread",
  };
}

export function proactiveClubConversationItems(state: GameState): InboxItem[] {
  const items: InboxItem[] = [];
  const stats = new Map(playerSeasonStats(state).map((row) => [row.playerId, row]));

  if (state.week >= 8) {
    const concern = userSquad(state)
      .map((player) => ({ player, contract: activeContract(state, player.id), minutes: stats.get(player.id)?.minutes ?? 0 }))
      .filter(({ contract }) => contract?.squadRole === "Key Player" || contract?.squadRole === "First Team")
      .filter(({ contract, minutes }) => {
        const expected = (state.week - 3) * (contract?.squadRole === "Key Player" ? 55 : 35);
        return minutes < expected;
      })
      .sort((a, b) => a.minutes - b.minutes)[0];

    if (concern) {
      const name = playerName(concern.player);
      items.push(inboxItem(state, {
        eventKey: `club-conversation:player-playing-time:${concern.player.id}:s${state.season}`,
        sender: name,
        department: "Players",
        category: "staff",
        priority: "high",
        subject: `${name} asks for clarity on playing time`,
        body: `I wanted to speak before this becomes a bigger issue. My agreed role is ${concern.contract!.squadRole}, but I have only played ${concern.minutes} minutes this season. I need to know whether I am still part of the plan.`,
        choices: [
          {
            id: "manager",
            label: "Tell him you'll speak to the manager",
            hint: "Acknowledge the concern without making a playing-time promise.",
            effects: [{ kind: "flag", key: `playerConversation:${concern.player.id}:playingTimeResponse`, value: "you-will-speak-to-the-manager" }],
          },
          {
            id: "patient",
            label: "Ask him to stay patient",
            hint: "Make clear that selection remains the manager's call.",
            effects: [{ kind: "flag", key: `playerConversation:${concern.player.id}:playingTimeResponse`, value: "stay-patient-and-keep-working" }],
          },
          {
            id: "move",
            label: "Be open to a move",
            hint: "Tell him you will not stand in the way if the right opportunity appears.",
            effects: [{ kind: "flag", key: `playerConversation:${concern.player.id}:playingTimeResponse`, value: "the-club-is-open-to-a-move" }],
          },
        ],
      }));
    }
  }

  const physio = state.hiredStaff.find((staff) => staff.role === "Head Physio");
  const injured = userSquad(state).find((player) => player.injury);
  if (physio && injured?.injury) {
    items.push(inboxItem(state, {
      eventKey: `club-conversation:medical:${injured.id}:${injured.injury.returnAbsoluteWeek}`,
      sender: physio.name,
      department: "Medical",
      category: "staff",
      priority: Math.max(0, injured.injury.returnAbsoluteWeek - absoluteWeek(state.season, state.week)) >= 4 ? "high" : "normal",
      subject: `${physio.name} wants to review ${playerName(injured)}'s recovery`,
      body: (() => {
        const weeksOut = Math.max(0, injured.injury.returnAbsoluteWeek - absoluteWeek(state.season, state.week));
        return `${playerName(injured)} is recovering from ${injured.injury.type}. The current estimate is ${weeksOut} week${weeksOut === 1 ? "" : "s"} out. I wanted this on your desk so the football and recruitment plans account for it.`;
      })(),
    }));
  }

  const transferLead = state.hiredStaff.find((staff) => staff.role === "Head of Transfers");
  const expiring = expiringPlayers(state);
  if (transferLead && expiring.length) {
    items.push(inboxItem(state, {
      eventKey: `club-conversation:contracts:${transferLead.id}:s${state.season}`,
      sender: transferLead.name,
      department: "Director of Football",
      category: "staff",
      priority: "normal",
      subject: `${transferLead.name} flags player contracts for review`,
      body: `${sentenceList(expiring.slice(0, 4).map(playerName))} are inside the final 24 weeks of their deals. We should decide who is staying before the players or the market make that decision for us.`,
    }));
  }

  return items;
}
