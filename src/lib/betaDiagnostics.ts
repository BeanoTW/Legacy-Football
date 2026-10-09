import type { GameState } from "./game/types";
import type { SaveSlotId, SaveSlotSummary } from "./game/engine";

export interface BetaDiagnosticBundle {
  generatedAt: string;
  buildId: string;
  gameSchemaVersion: number;
  career: {
    slot: SaveSlotId;
    clubName: string;
    season: number;
    week: number;
    leagueId: string | null;
    cash: number;
    squadPlayers: number;
    inboxItems: number;
    awaitingDecisions: number;
    activeNegotiations: number;
    lastSavedAt: string | null;
  };
  client: {
    userAgent: string;
    language: string;
    viewport: string;
    devicePixelRatio: number;
    online: boolean;
    standalone: boolean;
    appearance: string | null;
    clubTheme: string | null;
  };
}

export function buildBetaDiagnosticBundle(args: {
  state: GameState;
  activeSlot: SaveSlotId;
  slots: SaveSlotSummary[];
  buildId: string;
}): BetaDiagnosticBundle {
  const { state, activeSlot, slots, buildId } = args;
  const slot = slots.find((candidate) => candidate.id === activeSlot);
  const browser = typeof window !== "undefined";
  const standalone =
    browser &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      (typeof navigator !== "undefined" &&
        "standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true));

  return {
    generatedAt: new Date().toISOString(),
    buildId,
    gameSchemaVersion: state.version,
    career: {
      slot: activeSlot,
      clubName: state.clubName,
      season: state.season,
      week: state.week,
      leagueId: state.playerLeagueId ?? null,
      cash: state.cash,
      squadPlayers: state.squad.length,
      inboxItems: state.inbox.length,
      awaitingDecisions: state.inbox.filter((item) => item.status === "awaitingDecision").length,
      activeNegotiations: state.football.negotiations.length,
      lastSavedAt: slot?.updatedAt ? new Date(slot.updatedAt).toISOString() : null,
    },
    client: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      language: typeof navigator !== "undefined" ? navigator.language : "unknown",
      viewport: browser ? `${window.innerWidth}x${window.innerHeight}` : "unknown",
      devicePixelRatio: browser ? window.devicePixelRatio || 1 : 1,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
      standalone,
      appearance:
        browser && typeof localStorage !== "undefined"
          ? localStorage.getItem("chairman.appearance")
          : null,
      clubTheme:
        browser && typeof localStorage !== "undefined"
          ? localStorage.getItem("chairman.colour-theme")
          : null,
    },
  };
}

export function formatBetaDiagnosticBundle(bundle: BetaDiagnosticBundle): string {
  return [
    "Legacy Football beta diagnostics",
    `Generated: ${bundle.generatedAt}`,
    `Build: ${bundle.buildId}`,
    `Schema: v${bundle.gameSchemaVersion}`,
    "",
    `Career: ${bundle.career.clubName} · ${bundle.career.slot}`,
    `Season/week: ${bundle.career.season}/${bundle.career.week}`,
    `League: ${bundle.career.leagueId ?? "unknown"}`,
    `Cash: £${Math.round(bundle.career.cash).toLocaleString("en-GB")}`,
    `Squad players: ${bundle.career.squadPlayers}`,
    `Inbox: ${bundle.career.inboxItems} (${bundle.career.awaitingDecisions} awaiting decision)`,
    `Active negotiations: ${bundle.career.activeNegotiations}`,
    `Last local save: ${bundle.career.lastSavedAt ?? "unknown"}`,
    "",
    `Viewport: ${bundle.client.viewport} @ ${bundle.client.devicePixelRatio}x`,
    `Standalone/PWA: ${bundle.client.standalone ? "yes" : "no"}`,
    `Online: ${bundle.client.online ? "yes" : "no"}`,
    `Language: ${bundle.client.language}`,
    `Appearance: ${bundle.client.appearance ?? "system/default"}`,
    `Theme: ${bundle.client.clubTheme ?? "club/default"}`,
    `User agent: ${bundle.client.userAgent}`,
  ].join("\n");
}
