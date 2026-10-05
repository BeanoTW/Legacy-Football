import type { GameState, InboxItem } from "./types";
import { openNegotiations, playerName } from "./recruitment";
import { transferTargetPlayer } from "./recruitmentTargetBridge";

/** Screen destinations for contextual links in club briefings.
 * Links are derived from existing stable IDs, not message text or save migrations.
 */
export type InboxDestination =
  | { tab: "recruitment"; view: "reports"; playerId: string; label: string }
  | { tab: "recruitment"; view: "find"; briefId: string; label: "View scouting results" | "Assign to Recruitment" }
  | { tab: "recruitment"; view: "operations"; negotiationId: string; label: "View negotiation" }
  | { tab: "recruitment"; view: "operations"; label: "Open transfers" }
  | { tab: "squad"; playerId: string; label: string }
  | { tab: "staff"; staffId?: string; label: string }
  | { tab: "board"; label: string }
  | { tab: "recruitment"; view: "sales"; label: "View sales" }
  | { tab: "stadium"; label: "Open facilities" }
  | { tab: "commercial"; label: "Open commercial" }
  | { tab: "board"; label: "Open boardroom" }
  | { tab: "staff"; label: "Open staff" }
  | { tab: "cashflow"; label: "Open finances" }
  | { tab: "tickets"; label: "Open tickets" };

export function inboxDestinations(state: GameState, item: InboxItem): InboxDestination[] {
  if (item.generatorId === "scouting-report" && item.eventKey.startsWith("scouting-batch:")) {
    const ids = item.eventKey.split(":").at(-1)?.split(",").filter(Boolean) ?? [];
    return ids.flatMap((playerId) => {
      const player = transferTargetPlayer(state, playerId);
      return player
        ? [{ tab: "recruitment", view: "reports", playerId, label: `View ${playerName(player)}` } as InboxDestination]
        : [];
    });
  }
  const destination = inboxDestination(state, item);
  return destination ? [destination] : [];
}

/** Don't advertise a deep link if the referenced report or deal no longer exists. */
export function inboxDestination(state: GameState, item: InboxItem): InboxDestination | null {
  if (item.generatorId === "club-conversations" && (
    item.eventKey.startsWith("club-conversation:scouting-focus:") ||
    item.eventKey.startsWith("club-conversation:keeper-depth:")
  )) {
    return { tab: "recruitment", view: "find", briefId: "", label: "Assign to Recruitment" };
  }
  if (item.generatorId === "club-conversations" && item.eventKey.startsWith("club-conversation:contracts:")) {
    return { tab: "recruitment", view: "operations", label: "Review contracts" };
  }
  if (item.generatorId === "club-conversations" && item.department === "Board of Directors") {
    return { tab: "board", label: "Open boardroom" };
  }
  if (item.generatorId === "club-conversations" && item.department === "Players") {
    const playerId = item.eventKey.match(/^club-conversation:player-playing-time:([^:]+):s\d+$/)?.[1];
    if (playerId && transferTargetPlayer(state, playerId)) {
      return { tab: "squad", playerId, label: "Speak to player" };
    }
  }
  if (item.generatorId === "club-conversations") {
    const staff = state.hiredStaff.find((candidate) => candidate.name === item.sender);
    if (staff) return { tab: "staff", staffId: staff.id, label: `Speak to ${staff.name}` };
  }
  if (item.generatorId === "scouting-report") {
    const assignment = state.football?.scouting?.assignments.find(
      (candidate) => item.eventKey.startsWith(`scouting:${candidate.playerId}:s`),
    );
    if (assignment && transferTargetPlayer(state, assignment.playerId)) {
      return { tab: "recruitment", view: "reports", playerId: assignment.playerId, label: "View scouting report" };
    }
    return null;
  }

  if (item.generatorId === "scouting-search") {
    const brief = state.football?.scoutingDiscovery?.briefs.find(
      (candidate) => item.eventKey === `scouting-search:${candidate.id}:complete` && candidate.status === "complete",
    );
    return brief ? { tab: "recruitment", view: "find", briefId: brief.id, label: "View scouting results" } : null;
  }

  if (item.generatorId.startsWith("recruitment-")) {
    const negotiation = openNegotiations(state).find(
      (candidate) =>
        item.eventKey === `${item.generatorId}:${candidate.id}` ||
        item.eventKey.startsWith(`${item.generatorId}:${candidate.id}:r`) ||
        item.eventKey.includes(`:${candidate.id}:`) ||
        item.eventKey.endsWith(`:${candidate.id}`),
    );
    if (negotiation) {
      return { tab: "recruitment", view: "operations", negotiationId: negotiation.id, label: "View negotiation" };
    }
    if (item.generatorId === "recruitment-incoming-offer") {
      return { tab: "recruitment", view: "sales", label: "View sales" };
    }
    if (item.generatorId === "recruitment-transfer-complete") {
      return { tab: "recruitment", view: "operations", label: "Open transfers" };
    }
    if (item.generatorId === "recruitment-contract-expiring") {
      return { tab: "recruitment", view: "operations", label: "Open transfers" };
    }
    return null;
  }

  switch (item.department) {
    case "Groundskeeper": return { tab: "stadium", label: "Open facilities" };
    case "Commercial":
    case "Sponsors": return { tab: "commercial", label: "Open commercial" };
    case "Board of Directors": return { tab: "board", label: "Open boardroom" };
    case "Manager":
    case "Medical":
    case "Head Scout":
    case "Director of Football": return { tab: "staff", label: "Open staff" };
    case "Finance": return { tab: "cashflow", label: "Open finances" };
    default: return null;
  }
}
