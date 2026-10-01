/* =========================================================================
   Press room presentation
   -------------------------------------------------------------------------
   UI-only helpers for the press conference screen: how the journalist reacts
   to each answer, the mood in the room, tomorrow's back-page headline and
   the manager's view. Deterministic (same situation, same words) and
   display-only: no effects, so the dialogue-first design of the press
   room is unchanged. Kept out of pressConference.ts so the inbox code never
   imports manager modules.
========================================================================= */

import type { GameState } from "./types";
import { hashString } from "./rng";
import { mediaRelationship, type JournalistProfile, type JournalistStyle } from "./mediaRelations";
import { pressOutcomeLabel, type PressTone } from "./pressConference";
import { currentManager, managerPersonality } from "./managerRelationship";

const pick = <T,>(seed: string, items: readonly T[]): T => items[(hashString(seed) >>> 0) % items.length];

const REACTIONS: Record<JournalistStyle, Record<PressTone, readonly string[]>> = {
  balanced: {
    transparent: ["Nods and writes that down.", "Looks up from the notebook. That was more than expected.", "A pause. \"Fair enough.\""],
    reassure: ["Writes something short. Possibly \"club line\".", "Tilts the head, unconvinced but polite.", "\"We'll see,\" comes the reply, mostly to nobody."],
    dismiss: ["An eyebrow goes up; something gets underlined.", "The room goes quiet for a second.", "\"Noted.\" It isn't a compliment."],
  },
  supporter: {
    transparent: ["Looks relieved. \"The fans will want to hear that.\"", "A small smile. That one will go down well on the terraces.", "Writes quickly. That's the headline."],
    reassure: ["\"Supporters have heard 'trust us' before.\"", "A polite nod. Not sold.", "A glance at the fans' group chat on the phone."],
    dismiss: ["The pen stops. \"The fans won't like that.\"", "A murmur from the back of the room.", "A shake of the head, and the typing carries on."],
  },
  financial: {
    transparent: ["Sits forward. Numbers, finally.", "\"That's helpful.\" And meant.", "Checks something on the laptop and nods."],
    reassure: ["\"Under control according to whom?\"", "Writes \"no figures\" and underlines it twice.", "A tight smile. The accounts will get checked anyway."],
    dismiss: ["\"So there is something in the numbers.\"", "The typing stops. Just a long look.", "That's a story about what the club won't say."],
  },
  confrontational: {
    transparent: ["Almost disappointed. No row to report.", "\"Right.\" A grudging respect.", "Didn't expect a straight answer."],
    reassure: ["Leans back. \"That's not what I asked.\"", "A thin smile. The pushing will continue.", "\"Same answer as last time, then.\""],
    dismiss: ["A grin. That's tonight's clip.", "Cameras click. Got what was needed.", "\"Thanks, that's very quotable.\""],
  },
};

export function pressReaction(journalist: JournalistProfile, round: number, tone: PressTone): string {
  return pick(`${journalist.id}|${round}|${tone}`, REACTIONS[journalist.style][tone]);
}

export type RoomMood = "Hostile" | "Tense" | "Even" | "Receptive" | "Warm";

/** The room after the answers so far: -3 (hostile) to +3 (warm). */
export function pressRoomMood(
  state: GameState,
  journalist: JournalistProfile,
  tones: PressTone[],
): { score: number; label: RoomMood; step: number } {
  const band = mediaRelationship(state, journalist.id).band;
  let score = band === "Warm" ? 1 : band === "Professional" ? 0 : band === "Cool" ? -1 : -2;
  for (const tone of tones) {
    if (tone === "transparent") score += 1;
    if (tone === "dismiss") score -= journalist.style === "confrontational" ? 1 : 1.5;
    if (tone === "reassure" && (journalist.style === "financial" || journalist.style === "confrontational")) score -= 0.5;
  }
  const clamped = Math.max(-3, Math.min(3, score));
  const label: RoomMood =
    clamped <= -2 ? "Hostile" : clamped < -0.5 ? "Tense" : clamped <= 0.5 ? "Even" : clamped < 2 ? "Receptive" : "Warm";
  return { score: clamped, label, step: Math.round(((clamped + 3) / 6) * 4) };
}

export function pressHeadline(
  state: GameState,
  journalist: JournalistProfile,
  tones: PressTone[],
  topic: string,
): { outlet: string; headline: string; standfirst: string } {
  const outcome = pressOutcomeLabel(tones);
  const club = state.clubName.toUpperCase();
  const seed = `${state.saveSeed}|${journalist.id}|${topic}|${tones.join("")}`;
  const subject = topic.replace(/^Press conference\s*—\s*/i, "").replace(/\.$/, "").toLowerCase();
  const headline =
    outcome === "Open and accountable"
      ? pick(seed, [`${club} CHIEF: "JUDGE US ON THIS"`, "MANAGING DIRECTOR FRONTS UP", `"WE OWE THE FANS AN ANSWER"`])
      : outcome === "Combative"
        ? pick(seed, ["MD HITS BACK", `${club} BOSS IN PRESS ROOM ROW`, `"I WON'T BE LECTURED"`])
        : pick(seed, ["STEADY AS SHE GOES", `${club} KEEP CALM AND CARRY ON`, `NO U-TURN AT ${club}`]);
  const standfirst =
    outcome === "Open and accountable"
      ? `An unusually candid managing director answered every question on ${subject}.`
      : outcome === "Combative"
        ? `A fiery press conference on ${subject} raised more questions than it answered.`
        : `The club line held on ${subject}, with little given away.`;
  return { outlet: journalist.outlet, headline, standfirst };
}

const MANAGER_LINES: Record<string, Record<string, string>> = {
  Fiery: {
    "Open and accountable": "Fair play. I'd have told them where to go, mind.",
    Combative: "Good. Someone needed to tell them.",
    Measured: "Bit polite for my liking. They'll smell blood.",
  },
  Diplomatic: {
    "Open and accountable": "That was the right way to handle it. It'll calm the dressing room too.",
    Combative: "We didn't need that fight. I'll be answering questions about it on Saturday.",
    Measured: "Sensible. Nothing for them to run with.",
  },
  Pragmatic: {
    "Open and accountable": "Fine. As long as we can actually deliver what you promised.",
    Combative: "Doesn't change the league table either way. Let's move on.",
    Measured: "No harm done. Back to work.",
  },
  Reserved: {
    "Open and accountable": "I'd rather keep things in-house, but I understand why you did it.",
    Combative: "I'd prefer we kept our heads down.",
    Measured: "Quiet is good. Quiet suits us.",
  },
};

/** What the manager makes of it, in his own voice. Display only. */
export function managerPressView(
  state: GameState,
  tones: PressTone[],
): { name: string; managerId: string; quote: string } | null {
  const manager = currentManager(state);
  if (!manager) return null;
  const { temperament } = managerPersonality(manager);
  const outcome = pressOutcomeLabel(tones);
  return { name: manager.name, managerId: manager.id, quote: MANAGER_LINES[temperament]?.[outcome] ?? "Let's get back to football." };
}