import type { FixtureResult, GameState } from "./types";
import { sameClubReference, userClubReference } from "./clubReference";
import { playerLeagueId } from "./league";

export type MatchStakes = "friendly" | "routine" | "notable" | "major";
export type MatchReactionTone =
  | "encouraging"
  | "satisfied"
  | "measured"
  | "frustrated"
  | "concerned"
  | "celebratory";

export interface MatchReaction {
  stakes: MatchStakes;
  tone: MatchReactionTone;
  subject: string;
  body: string;
}

function isLeagueFixture(s: GameState, r: FixtureResult): boolean {
  if (r.competition) return r.competition === "league";
  const user = userClubReference(s);
  return (s.leagueSchedule ?? []).some(
    (f) =>
      f.week === r.week &&
      (f.league ?? playerLeagueId(s)) === playerLeagueId(s) &&
      ((sameClubReference(s, f.home, user) && sameClubReference(s, f.away, r.opponent)) ||
        (sameClubReference(s, f.away, user) && sameClubReference(s, f.home, r.opponent))),
  );
}

function recentFormBefore(s: GameState, r: FixtureResult): FixtureResult[] {
  return s.results
    .filter(
      (x) =>
        x.week < r.week ||
        (x.week === r.week && (x.dayOfWeek ?? 5) < (r.dayOfWeek ?? 5)),
    )
    .slice()
    .sort((a, b) => b.week - a.week || (b.dayOfWeek ?? 5) - (a.dayOfWeek ?? 5))
    .slice(0, 5);
}

function leaguePosition(s: GameState, club: string): number | undefined {
  const row = s.league?.find((x) => sameClubReference(s, x.team, club));
  if (!row) return undefined;
  const sorted = [...s.league].sort(
    (a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga),
  );
  const index = sorted.findIndex((x) => sameClubReference(s, x.team, club));
  return index >= 0 ? index + 1 : undefined;
}

export function postMatchReaction(s: GameState, r: FixtureResult): MatchReaction {
  const score = `${r.goalsFor}-${r.goalsAgainst}`;
  const venue = r.home ? "at home" : "away";
  const margin = Math.abs(r.goalsFor - r.goalsAgainst);
  const leagueGame = isLeagueFixture(s, r);

  if (!leagueGame) {
    if (r.result === "W") {
      return {
        stakes: "friendly",
        tone: "encouraging",
        subject: `Useful run-out against ${r.opponent}`,
        body: `${score} ${venue} against ${r.opponent}. A positive friendly result, but the emphasis remains on fitness, sharpness and preparation rather than the scoreline.`,
      };
    }
    if (r.result === "D") {
      return {
        stakes: "friendly",
        tone: "measured",
        subject: `Pre-season minutes against ${r.opponent}`,
        body: `${score} ${venue} against ${r.opponent}. Little will be read into the friendly scoreline; attention stays on preparation and the minutes in players' legs.`,
      };
    }
    return {
      stakes: "friendly",
      tone: "measured",
      subject: `Friendly defeat to ${r.opponent}`,
      body: `${score} ${venue} against ${r.opponent}. The result is secondary in a friendly, though the staff will still have details to work on before competitive football.`,
    };
  }

  const form = recentFormBefore(s, r);
  const winless = form.length >= 3 && form.every((x) => x.result !== "W");
  const unbeaten = form.length >= 3 && form.every((x) => x.result !== "L");
  const userPos = leaguePosition(s, userClubReference(s));
  const oppPos = leaguePosition(s, r.opponent);
  const tableGap = userPos !== undefined && oppPos !== undefined ? userPos - oppPos : 0;
  const upsetWin = r.result === "W" && tableGap >= 5;
  const badLoss = r.result === "L" && tableGap <= -5;
  const major = margin >= 4 || upsetWin || badLoss;

  if (r.result === "W") {
    if (major) {
      return {
        stakes: "major",
        tone: "celebratory",
        subject: `Statement win over ${r.opponent}`,
        body: `${score} ${venue} against ${r.opponent}. ${upsetWin ? "A result above the pre-match expectations has caught attention." : "The emphatic margin has caught attention."} ${winless ? "It also ends a difficult run and eases some of the pressure around the club." : "Supporters have plenty to enjoy from this one."}`,
      };
    }
    return {
      stakes: unbeaten ? "notable" : "routine",
      tone: "satisfied",
      subject: unbeaten ? `Momentum continues against ${r.opponent}` : `Three points against ${r.opponent}`,
      body: `${score} ${venue} against ${r.opponent}. ${unbeaten ? "Another result added to a strong recent run." : "A useful league win, with the focus quickly moving to the next fixture."}`,
    };
  }

  if (r.result === "D") {
    const favoured = tableGap <= -5;
    return {
      stakes: favoured ? "notable" : "routine",
      tone: favoured ? "frustrated" : "measured",
      subject: favoured ? `Points left behind against ${r.opponent}` : `Honours even with ${r.opponent}`,
      body: `${score} ${venue} against ${r.opponent}. ${favoured ? "With the sides' league positions in mind, the reaction is more frustration than satisfaction." : "The draw is being treated in context rather than as either a success or a failure on its own."}`,
    };
  }

  if (major || winless) {
    return {
      stakes: major ? "major" : "notable",
      tone: "concerned",
      subject: major ? `Questions after defeat to ${r.opponent}` : `Pressure builds after ${r.opponent} defeat`,
      body: `${score} ${venue} against ${r.opponent}. ${badLoss ? "Losing to a side well below the club in the table has sharpened the criticism." : margin >= 4 ? "The scale of the defeat has made the performance, not merely the result, the story." : "A continuing winless run is beginning to shape the reaction around the club."}`,
    };
  }

  return {
    stakes: "routine",
    tone: "frustrated",
    subject: `Defeat to ${r.opponent}`,
    body: `${score} ${venue} against ${r.opponent}. A disappointing league result, but one defeat on its own is not being treated as a crisis.`,
  };
}
