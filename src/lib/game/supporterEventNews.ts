import type { GameState } from "./types";
import type { NewsArticle } from "./newsFeed";
import { hashString } from "./rng";
import { clubPresentationName } from "./clubPresentation";
import { SUPPORTER_EVENTS, supporterEvents, type SupporterEventId } from "./supporterEvents";
import { EVENT_OUTCOME_LABEL, EVENT_VISUALS, eventDateLabel, eventDateSlot, supporterEventOutcome } from "./supporterEventPresentation";
import { currentAbsoluteDay } from "./timeline";

const COPY: Record<SupporterEventId, { invitation: string; focus: string; strong: string; average: string; weak: string }> = {
  "open-training": { invitation: "Supporters are invited to watch the squad at work.", focus: "a closer look at first-team training", strong: "Training day draws a lively following", average: "A steady audience for open training", weak: "Open training attracts a small gathering" },
  "meet-team": { invitation: "The first team will meet supporters for photos and autographs.", focus: "time with the players away from matchday", strong: "Supporters turn out for their first-team favourites", average: "Meet the Team strengthens familiar ties", weak: "Quiet response to squad meet-and-greet" },
  "kids-coaching": { invitation: "Players and coaches will run a local children's football session.", focus: "grassroots coaching and a connection with young families", strong: "Kids' coaching occasion brings the community together", average: "A steady start for young supporters' coaching day", weak: "Kids' coaching day has room to grow" },
  "school-visits": { invitation: "The club is taking football into local schools.", focus: "introducing the club to the next generation", strong: "School outreach earns an enthusiastic response", average: "School visits build local links", weak: "School outreach makes a modest first impression" },
  "volunteer-ground": { invitation: "Supporters are invited to help spruce up their ground.", focus: "supporters giving time to the ground they call home", strong: "Volunteers rally around their ground", average: "Ground volunteers put in a steady shift", weak: "Small volunteer turnout leaves scope for more hands" },
  "supporters-evening": { invitation: "The director and manager will meet supporters in a face-to-face forum.", focus: "direct contact between the club and its supporters", strong: "Strong interest in supporters' forum", average: "Supporters' evening keeps the conversation going", weak: "Supporters' evening draws a quiet audience" },
  "family-day": { invitation: "Food, games and player appearances are planned for a community occasion.", focus: "welcoming families into the club", strong: "Families turn out in force for club occasion", average: "Family Fun Day finds a steady following", weak: "Family Fun Day falls short of a bustling occasion" },
  "preseason-launch": { invitation: "The club will present its squad, kit, sponsors and ambitions for the coming season.", focus: "bringing supporters together around the new campaign", strong: "New-season launch catches supporters' imagination", average: "A measured welcome for the new campaign", weak: "Low-key turnout for new-season launch" },
  "heritage-day": { invitation: "The club will celebrate its ground, history and the supporters who built it.", focus: "the club's history and its place in the community", strong: "Club history draws an enthusiastic following", average: "Heritage Day keeps the club's story alive", weak: "Heritage occasion draws a modest gathering" },
  "legends-day": { invitation: "Former favourites are being welcomed back for a supporter occasion.", focus: "reconnecting supporters with former club favourites", strong: "Former favourites bring supporters out in numbers", average: "Legends Day offers a steady dose of nostalgia", weak: "Former favourites return to a quiet reception" },
};

function sarahAtClub(state: GameState) {
  return (state.hiredStaff ?? []).find((staff) =>
    staff.id === "ST-community-sarah-malik" || staff.name === "Sarah Malik",
  );
}

function sarahFeatureFor(
  state: GameState,
  eventId: SupporterEventId,
  articleId: string,
  result: boolean,
  outcome: ReturnType<typeof supporterEventOutcome>,
) {
  const sarah = sarahAtClub(state);
  const role = EVENT_VISUALS[eventId].sarahMalikRole;
  if (!sarah || !role) return { featured: false, role: undefined as string | undefined, label: "" };

  const volunteer =
    state.inboxFlags?.communityEventsSarahStatus === "volunteer" || sarah.wage === 0;
  const score = (hashString(`${articleId}|sarah`) >>> 0) % 100;
  const chance = result
    ? outcome === "strong"
      ? 70
      : outcome === "average"
        ? 50
        : outcome === "weak"
          ? 25
          : 35
    : 40;
  return {
    featured: score < chance,
    role,
    label: volunteer ? "Volunteer coordinator" : "Community & Events Officer",
  };
}

/** Stories are projected from persisted bookings/results; no new event lifecycle. */
export function supporterEventArticles(state: GameState): NewsArticle[] {
  const club = clubPresentationName(state.clubName);
  const now = currentAbsoluteDay(state);
  const articles: NewsArticle[] = [];
  for (const event of supporterEvents(state)) {
    const definition = SUPPORTER_EVENTS.find((entry) => entry.id === event.eventId);
    if (!definition || event.bookedAbsoluteDay > now) continue;
    const copy = COPY[event.eventId];
    for (const phase of ["announcement", "result"] as const) {
      if (phase === "result" && (event.status !== "completed" || event.scheduledAbsoluteDay > now)) continue;
      const id = `supporter-event|${event.id}|${phase}`;
      const variant = (hashString(id) >>> 0) % 2;
      const outcome = supporterEventOutcome(event);
      const result = phase === "result";
      const date = eventDateSlot(result ? event.scheduledAbsoluteDay : event.bookedAbsoluteDay);
      const turnout = event.attendance?.toLocaleString();
      const sarah = sarahFeatureFor(state, event.eventId, id, result, outcome);
      const sarahLine = sarah.featured
        ? result
          ? outcome === "strong"
            ? `Sarah Malik, the club's ${sarah.label.toLowerCase()}, was credited with helping turn the occasion into a busy community day.`
            : outcome === "weak"
              ? `Sarah Malik, the club's ${sarah.label.toLowerCase()}, acknowledged the quieter turnout while stressing the value of keeping the club visible locally.`
              : `Sarah Malik, the club's ${sarah.label.toLowerCase()}, described the event as a useful step in building regular community contact.`
          : `Sarah Malik, the club's ${sarah.label.toLowerCase()}, is coordinating the arrangements.`
        : null;
      const body = result ? [
        `${club}'s ${definition.name} recorded ${turnout == null ? "no confirmed attendance figure" : `a turnout of ${turnout}`}. The occasion centred on ${copy.focus}.`,
        outcome === "strong" ? "The response was stronger than the event's turnout benchmark: a visible reward for the club's community investment."
          : outcome === "weak" ? "Attendance was below the event's turnout benchmark. The occasion still made a contribution, but the club has work to do to broaden its reach."
          : outcome === "average" ? "Attendance sat around the event's turnout benchmark: useful community work rather than a breakthrough occasion."
          : "The recorded result does not include enough attendance data to judge turnout.",
        ...(sarahLine ? [sarahLine] : []),
        ...(event.fanGain != null && event.reputationGain != null ? [`The recorded payoff was +${event.fanGain} fan backing and +${event.reputationGain.toFixed(1)} club reputation.`] : []),
      ] : [
        `${club} have booked ${definition.name} for ${eventDateLabel(event.scheduledAbsoluteDay)}. ${copy.invitation}`,
        ...(sarahLine ? [sarahLine] : []),
        `${event.cost.toLocaleString("en-GB", {style:"currency", currency:"GBP", maximumFractionDigits:0})} has been committed to the occasion. Its impact will depend on the actual turnout, not just the announcement.`,
      ];
      articles.push({
        id, kind: "clubIncident", ...date,
        publication: {name:"The Terrace Gazette", handle:"@TerraceGazette", mark:"TG", tone:"local"},
        byline: variant ? "Jess Morton" : "Dan Holloway",
        headline: result ? outcome ? variant ? `${club}: ${copy[outcome]}` : `${definition.name} at ${club} — ${EVENT_OUTCOME_LABEL[outcome].toLowerCase()}` : `${club} complete ${definition.name}` : variant ? `${club} announce ${definition.name}` : `${definition.name} on the calendar at ${club}`,
        standfirst: result ? `${definition.name} · ${turnout == null ? "Turnout unrecorded" : `${turnout} attended`}${outcome ? ` · ${EVENT_OUTCOME_LABEL[outcome]}` : ""}` : `${definition.name} · ${eventDateLabel(event.scheduledAbsoluteDay)}`,
        body, facts: [{label:"Event",value:definition.name}, {label:"Coverage",value:result ? "Event result" : "Announcement"}, {label:"Date",value:eventDateLabel(event.scheduledAbsoluteDay)},
          ...(result && turnout != null ? [{label:"Turnout",value:turnout}] : []), ...(result && outcome ? [{label:"Outcome",value:EVENT_OUTCOME_LABEL[outcome]}] : []),
          ...(result && event.fanGain != null ? [{label:"Fan gain",value:`+${event.fanGain}`}] : []), ...(result && event.reputationGain != null ? [{label:"Reputation gain",value:`+${event.reputationGain.toFixed(1)}`}] : []),
          ...(sarah.featured ? [{label:"Coordinator",value:`Sarah Malik · ${sarah.label}`}] : [])],
        tags:[club,"Community",definition.name,...(sarah.featured ? ["Sarah Malik"] : [])], involvesUser:true,
        communityEvent: {eventId:event.eventId, phase, outcome:result ? outcome : null, sarahFeatured:sarah.featured, sarahRole:sarah.role},
        reactions:{likes:Math.round((result ? event.attendance ?? 0 : 40)*.3), comments:Math.round((event.attendance ?? 40)*.04), shares:Math.round((event.attendance ?? 40)*.02)},
      });
    }
  }
  return articles;
}