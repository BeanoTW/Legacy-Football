import { useEffect, useMemo, useState } from "react";
import { Binoculars, CheckCircle2, Handshake, ListMinus, ListPlus, Pencil, RefreshCcw, Repeat2, Star, Trash2, X } from "lucide-react";
import type { GameState, LoanPlayingTimeExpectation, SquadRole, TacticalPosition } from "@/lib/game/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  activeContract,
  ageOf,
  arrangeUserPlayerLoanIn,
  arrangeUserPlayerLoanOut,
  loanInAvailabilityReason,
  playerName,
  releasePlayerInPlace,
  renewalTerms,
  renewContractInPlace,
  setTransferStatusInPlace,
  submitTransferEnquiry,
  submitTransferOffer,
} from "@/lib/game/recruitment";
import {
  chairmanRecruitmentEstimate,
  isChairmanShortlisted,
  toggleChairmanShortlist,
} from "@/lib/game/recruitmentKnowledge";
import { knownPlayerDetail } from "@/lib/game/knownPlayerDetail";
import { tacticalPositionProfile, positionFamiliarity, positionUnit } from "@/lib/game/positions";
import { activeLoanForPlayer, terminateUserPlayerLoan } from "@/lib/game/loans";
import { playerOwnerClubId } from "@/lib/game/playerRegistration";
import { clubDisplayName, isUserClubReference } from "@/lib/game/clubReference";
import { fmtMoney, fmtMoneyExact } from "@/lib/game/engine";
import { clubKitForReference } from "@/lib/game/clubKit";
import { PLAYER_ATTRIBUTE_GROUPS, scoutingAssignment, scoutingReportById, startScouting, type PlayerAttributeCategory } from "@/lib/game/scouting";
import { scoutedOverallPresentation } from "@/lib/game/scoutingPresentation";
import { isTransferWindowOpen, windowStatus } from "@/lib/game/calendar";
import { cn } from "@/lib/utils";
import { POSITION_BADGE_CLASS } from "../playerPosition";
import { fitnessLabel, playerFitness } from "@/lib/game/playerHealth";
import { fromAbsoluteWeek } from "@/lib/game/time";
import { playerCareerTotals, playerSeasonByPlayer, playerSeasonStats } from "@/lib/game/playerSeasonStats";
import { playerRecentForm } from "@/lib/game/playerForm";
import { dynamicOverall } from "@/lib/game/playerOverall";
import { playerAttributeIdentity } from "@/lib/game/playerAttributeIdentity";
import { CharacterPortrait } from "../CharacterPortrait";
import { CharacterPortraitStudio } from "../CharacterPortraitStudio";
import { useCharacterName } from "@/hooks/useCharacterName";

const PLAYER_PROFILE_EVENT = "legacy-football:open-player-profile";

export function openPlayerProfile(playerId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLAYER_PROFILE_EVENT, { detail: { playerId } }));
}

function moneyRange(range?: [number, number]) {
  if (!range) return "?";
  return `${fmtMoneyExact(range[0])}–${fmtMoneyExact(range[1])}`;
}

type ReportAttribute = {
  key: string;
  label: string;
  known: boolean;
  exact?: number;
  min?: number;
  max?: number;
};

const RADAR_AREAS: { id: string; label: string; match: RegExp }[] = [
  { id: "PAC", label: "Pace", match: /pace|acceleration|speed|agility/ },
  { id: "SHO", label: "Shooting", match: /finishing|shot|shooting|heading/ },
  { id: "PAS", label: "Passing", match: /pass|vision|crossing/ },
  { id: "DRI", label: "Dribbling", match: /dribbl|first touch|technique|ball control|flair/ },
  { id: "DEF", label: "Defending", match: /tackl|marking|positioning|interception|anticipation/ },
  { id: "PHY", label: "Physical", match: /strength|stamina|jumping|work rate|aggression|balance|fitness/ },
];

function attributeValue(attribute: ReportAttribute): number | null {
  if (!attribute.known) return null;
  if (attribute.exact !== undefined) return attribute.exact;
  if (attribute.min !== undefined && attribute.max !== undefined) {
    return Math.round((attribute.min + attribute.max) / 2);
  }
  return null;
}

function radarFrom(attributes: ReportAttribute[]) {
  return RADAR_AREAS.map((area) => {
    const values = attributes
      .filter(
        (attribute) =>
          area.match.test(`${attribute.key} ${attribute.label}`.toLowerCase()) &&
          !/goalkeep/i.test(attribute.label),
      )
      .map(attributeValue)
      .filter((value): value is number => value !== null);
    return {
      ...area,
      value: values.length
        ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
        : null,
    };
  });
}

function AttributeRadar({ areas }: { areas: ReturnType<typeof radarFrom> }) {
  const size = 132;
  const centre = size / 2;
  const radius = 46;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / areas.length;
    return [
      centre + Math.cos(angle) * radius * (value / 100),
      centre + Math.sin(angle) * radius * (value / 100),
    ] as const;
  };
  const ring = (value: number) => areas.map((_, index) => point(index, value).join(",")).join(" ");
  const complete = areas.every((area) => area.value !== null);
  // Unknown scouting dimensions sit at a neutral midpoint rather than zero,
  // so incomplete knowledge never masquerades as a weakness.
  const shape = areas
    .map((area, index) => point(index, area.value ?? 50).join(","))
    .join(" ");

  return (
    <div className="shrink-0 text-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-[132px] w-[132px]"
        role="img"
        aria-label={`Attribute radar: ${areas.map((area) => `${area.label} ${area.value ?? "unknown"}`).join(", ")}`}
      >
        {[25, 50, 75, 100].map((value) => (
          <polygon
            key={value}
            points={ring(value)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={value === 100 ? 0.22 : 0.1}
          />
        ))}
        {areas.map((_, index) => {
          const [x, y] = point(index, 100);
          return (
            <line
              key={index}
              x1={centre}
              y1={centre}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
          );
        })}
        <polygon
          points={shape}
          fill="#10b981"
          fillOpacity={complete ? 0.28 : 0.15}
          stroke="#059669"
          strokeWidth={1.6}
          strokeDasharray={complete ? undefined : "3 2"}
        />
        {areas.map((area, index) => {
          const [x, y] = point(index, 128);
          return (
            <g key={area.id}>
              <text
                x={x}
                y={y - 2}
                textAnchor="middle"
                fontSize={8}
                fontWeight={800}
                fill="currentColor"
                fillOpacity={0.55}
              >
                {area.id}
              </text>
              <text
                x={x}
                y={y + 7}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={800}
                fill="currentColor"
              >
                {area.value ?? "?"}
              </text>
            </g>
          );
        })}
      </svg>
      {!complete && (
        <div className="-mt-1 text-[7px] uppercase tracking-wide text-muted-foreground">
          ? = not yet known
        </div>
      )}
    </div>
  );
}

const barTone = (value: number) =>
  value >= 70
    ? "bg-emerald-500"
    : value >= 55
      ? "bg-teal-500"
      : value >= 40
        ? "bg-amber-500"
        : "bg-rose-400";

export function PlayerProfileSheet({
  state,
  update,
}: {
  state: GameState;
  update: (fn: (s: GameState) => GameState) => void;
}) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [portraitEditing, setPortraitEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showLoan, setShowLoan] = useState(false);
  const [loanDuration, setLoanDuration] = useState(12);
  const [loanContribution, setLoanContribution] = useState(50);
  const [loanRole, setLoanRole] = useState<LoanPlayingTimeExpectation>("Regular");
  const [showContract, setShowContract] = useState(false);
  const [showLoanOut, setShowLoanOut] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [renewWage, setRenewWage] = useState(0);
  const [renewSeasons, setRenewSeasons] = useState(2);
  const [renewRole, setRenewRole] = useState<SquadRole>("First Team");
  const [statsView, setStatsView] = useState<"season" | "form" | "career">("season");
  const [attributeTab, setAttributeTab] = useState<PlayerAttributeCategory | null>(null);

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ playerId?: string }>).detail;
      if (detail?.playerId) {
        setPlayerId(detail.playerId);
        setPortraitEditing(false);
        setNote(null);
        setShowLoan(false);
        setShowContract(false);
        setShowLoanOut(false);
        setReleaseConfirm(false);
        setStatsView("season");
        setAttributeTab(null);
      }
    };
    window.addEventListener(PLAYER_PROFILE_EVENT, listener);
    return () => window.removeEventListener(PLAYER_PROFILE_EVENT, listener);
  }, []);

  const player = useMemo(
    () => (playerId ? knownPlayerDetail(state, playerId) : null),
    [playerId, state],
  );
  const displayName = useCharacterName(player?.id ?? "", player ? playerName(player) : "");

  if (!player) {
    return (
      <Sheet open={Boolean(playerId)} onOpenChange={(open) => !open && setPlayerId(null)}>
        <SheetContent />
      </Sheet>
    );
  }

  const tactical = tacticalPositionProfile(player);
  const contract = activeContract(state, player.id);
  const loan = activeLoanForPlayer(state, player.id);
  const club = player.currentClubId ? clubDisplayName(state, player.currentClubId) : "Free agent";
  const userOwnsPlayer = isUserClubReference(state, playerOwnerClubId(player));
  const registeredWithUser = isUserClubReference(state, player.currentClubId);
  const owned = userOwnsPlayer || registeredWithUser;
  const report = scoutingReportById(state, player.id);
  const overall = scoutedOverallPresentation(state, player, report);
  const dynamic = owned ? dynamicOverall(state, player) : null;
  const assignment = scoutingAssignment(state, player.id);
  const knowledge = owned ? 100 : report?.knowledgePct ?? 0;
  const fullKnowledge = owned || Boolean(report?.complete);
  const hasScouting = knowledge > 0;
  const shortlisted = !owned && isChairmanShortlisted(state, player.id);
  const freeAgent = player.currentClubId === null;
  const estimate = !owned ? chairmanRecruitmentEstimate(state, player.id) : null;
  const transferWindowOpen = isTransferWindowOpen(state);
  const transferWindow = windowStatus(state);
  const loanUnavailable = freeAgent || owned ? null : loanInAvailabilityReason(state, player.id);
  const seasonLine = owned ? playerSeasonStats(state).find((row) => row.playerId === player.id) : undefined;
  const recentForm = owned ? playerRecentForm(state, player.id) : null;
  const career = owned ? playerCareerTotals(state, player.id) : null;
  const seasonHistory = owned ? playerSeasonByPlayer(state, player.id) : [];
  const attributeIdentity = report ? playerAttributeIdentity(tactical.primary, report.attributes) : null;
  const proposedRenewal = userOwnsPlayer ? renewalTerms(state, player.id) : null;
  const loanIsOut = Boolean(loan && userOwnsPlayer && !registeredWithUser);
  const loanIsIn = Boolean(loan && registeredWithUser && !userOwnsPlayer);
  const listed = player.transferStatus === "listed";
  const radar = report ? radarFrom(report.attributes as ReportAttribute[]) : null;
  const categories = Object.keys(PLAYER_ATTRIBUTE_GROUPS) as PlayerAttributeCategory[];
  const activeCategory = attributeTab ?? categories[0];
  const contractSeasons = contract
    ? Math.max(1, contract.expirySeason - state.season + 1)
    : null;
  const rating = dynamic ? dynamic.effective : overall.label;
  const clubIdentity = player.currentClubId
    ? clubKitForReference(state, player.currentClubId)
    : null;
  const shirt = clubIdentity
    ? { kit: clubIdentity.home, badge: clubIdentity.badge, clubName: club }
    : null;
  const ratingCaption = dynamic
    ? `Base ${dynamic.base}${dynamic.delta === 0 ? "" : dynamic.delta > 0 ? ` +${dynamic.delta}` : ` ${dynamic.delta}`}`
    : overall.exact
      ? "Ability"
      : overall.known
        ? "Estimate"
        : "Unknown";

  const keyFacts: { label: string; value: string }[] = owned
    ? [
        { label: "Wage", value: contract ? `${fmtMoney(contract.weeklyWage)}/wk` : "—" },
        {
          label: "Contract",
          value: contractSeasons
            ? `${contractSeasons} season${contractSeasons === 1 ? "" : "s"}`
            : "—",
        },
        { label: "Value", value: fmtMoney(player.marketValue) },
        { label: "Potential", value: String(player.potentialAbility) },
        {
          label: "Role",
          value: loan?.playingTimeExpectation ?? contract?.squadRole ?? "At club",
        },
        { label: "Personality", value: player.personality },
      ]
    : [
        {
          label: "Value",
          value: hasScouting ? moneyRange(report?.valueRange).replaceAll("£", "") : "?",
        },
        {
          label: "Wage",
          value: hasScouting ? `${moneyRange(report?.wageRange).replaceAll("£", "")}/wk` : "?",
        },
        {
          label: "Potential",
          value: fullKnowledge ? String(player.potentialAbility) : "?",
        },
        { label: "Status", value: freeAgent ? "Free agent" : "Under contract" },
        { label: "Personality", value: fullKnowledge ? player.personality : "?" },
        { label: "Knowledge", value: `${knowledge}%` },
      ];

  const statFigures =
    statsView === "season" && seasonLine
      ? {
          figures: [
            ["Apps", String(seasonLine.appearances)],
            ["Goals", String(seasonLine.goals)],
            ["Assists", String(seasonLine.assists)],
            ["Rating", seasonLine.averageRating.toFixed(2)],
          ],
          line: `${seasonLine.starts} starts · ${seasonLine.substituteAppearances} off the bench · ${seasonLine.minutes} min`,
        }
      : statsView === "form" && recentForm && recentForm.appearances > 0
        ? {
            figures: [
              ["Form", recentForm.band],
              ["Rating", recentForm.averageRating.toFixed(2)],
              ["Goals", String(recentForm.goals)],
              ["Assists", String(recentForm.assists)],
            ],
            line: `Last ${recentForm.appearances} appearance${recentForm.appearances === 1 ? "" : "s"} · ${recentForm.minutes} min`,
          }
        : statsView === "career" && career
          ? {
              figures: [
                ["Apps", String(career.appearances)],
                ["Goals", String(career.goals)],
                ["Assists", String(career.assists)],
                ["Rating", career.averageRating.toFixed(2)],
              ],
              line: `${career.seasons} season${career.seasons === 1 ? "" : "s"} at the club · ${career.starts} starts`,
            }
          : null;

  const approach = () => {
    if (!estimate || owned) return;
    update((s) => {
      const result = freeAgent
        ? submitTransferOffer(s, player.id, 0, "First Team", estimate.openingWeeklyWage)
        : submitTransferEnquiry(s, player.id, "First Team", estimate.openingWeeklyWage);
      setNote(result.result.reason);
      return result.state;
    });
  };

  const requestLoan = () => {
    if (owned || freeAgent) return;
    const result = arrangeUserPlayerLoanIn(state, player.id, {
      durationWeeks: loanDuration,
      loanClubWageContributionPct: loanContribution,
      playingTimeExpectation: loanRole,
    });
    setNote(result.result.reason);
    if (result.result.ok) {
      setShowLoan(false);
      update(() => result.state);
    }
  };

  const toggleTransferList = () => {
    if (!userOwnsPlayer) return;
    update((current) => {
      const next = structuredClone(current);
      const result = setTransferStatusInPlace(
        next,
        player.id,
        player.transferStatus === "listed" ? "unlisted" : "listed",
      );
      setNote(result.reason);
      return result.ok ? next : current;
    });
  };

  const openContractNegotiation = () => {
    if (!proposedRenewal) return;
    setRenewWage(proposedRenewal.weeklyWage);
    setRenewSeasons(proposedRenewal.seasons);
    setRenewRole(proposedRenewal.role);
    setShowContract((value) => !value);
    setShowLoanOut(false);
    setReleaseConfirm(false);
  };

  const negotiateContract = () => {
    if (!userOwnsPlayer || !proposedRenewal) return;
    update((current) => {
      const next = structuredClone(current);
      const result = renewContractInPlace(next, player.id, {
        weeklyWage: renewWage,
        seasons: renewSeasons,
        role: renewRole,
        signingBonus: proposedRenewal.signingBonus,
      });
      setNote(result.reason);
      if (result.ok) setShowContract(false);
      return result.ok ? next : current;
    });
  };

  const sendLoanOut = () => {
    if (!userOwnsPlayer) return;
    const result = arrangeUserPlayerLoanOut(state, player.id, {
      durationWeeks: loanDuration,
      loanClubWageContributionPct: loanContribution,
      playingTimeExpectation: loanRole,
    });
    setNote(result.result.reason);
    if (result.result.ok) {
      setShowLoanOut(false);
      update(() => result.state);
    }
  };

  const endLoan = () => {
    if (!loan) return;
    const result = terminateUserPlayerLoan(state, loan.id);
    setNote(result.result.reason);
    if (result.result.ok) update(() => result.state);
  };

  const releasePlayer = () => {
    if (!userOwnsPlayer) return;
    update((current) => {
      const next = structuredClone(current);
      const result = releasePlayerInPlace(next, player.id);
      setNote(result.reason);
      if (result.ok) {
        setReleaseConfirm(false);
        setPlayerId(null);
      }
      return result.ok ? next : current;
    });
  };

  return (
    <Sheet open onOpenChange={(open) => !open && setPlayerId(null)}>
      <SheetContent side="right" hideClose className="w-[96vw] overflow-y-auto border-l-0 bg-[#edf5f2] p-0 sm:max-w-md dark:bg-[#071713]">
        <CharacterPortraitStudio identity={{ id: player.id, subject: "player" }} name={playerName(player)} kit={shirt} open={portraitEditing} onOpenChange={setPortraitEditing} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setPlayerId(null)}
          className="absolute right-3 top-3 z-50 size-10 rounded-full border border-white/15 bg-black/30 text-white shadow-lg backdrop-blur-sm hover:bg-black/45 hover:text-white"
          aria-label="Close player profile"
        >
          <X className="size-5" />
        </Button>
        <div className="relative overflow-hidden border-b border-emerald-300/10 bg-[#061a15] px-3.5 pb-3 pt-3.5 pr-12 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(52,211,153,.22),transparent_38%),radial-gradient(circle_at_0%_100%,rgba(16,185,129,.12),transparent_45%)]" />
          <div className="pointer-events-none absolute -right-5 top-4 font-display text-[7.5rem] font-black leading-none text-white/[0.035]" aria-hidden="true">
            {tactical.primary}
          </div>
          <SheetHeader className="relative text-left">
            <div className="flex items-start gap-3 pr-[4.5rem]">
              <button
                type="button"
                onClick={() => setPortraitEditing(true)}
                className="relative shrink-0 overflow-hidden rounded-xl border border-white/15 bg-gradient-to-b from-emerald-400/20 to-white/[0.03] shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                aria-label={`Edit ${displayName} appearance`}
              >
                <CharacterPortrait identity={{ id: player.id, subject: "player" }} kit={shirt} size={76} title={`${displayName} portrait`} />
                <Pencil className="absolute bottom-0 right-0 size-3.5 rounded-tl bg-black/70 p-0.5 text-white" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1 pt-0.5">
                <SheetTitle className="truncate font-display text-[1.55rem] leading-none text-white">{displayName}</SheetTitle>
                <div className="mt-1 truncate text-[10.5px] text-white/55">
                  {player.nationality} · Age {ageOf(player, state.season)} · {player.preferredFoot} foot
                </div>
                <div className="truncate text-[10.5px] text-white/55">{club}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold", POSITION_BADGE_CLASS[positionUnit(tactical.primary)])}>{tactical.primary}</span>
                  {tactical.secondary.slice(0, 3).map((position) => (
                    <span key={position} className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[9px] text-white/60">{position}</span>
                  ))}
                  {listed && <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-amber-950">LISTED</span>}
                  {(loanIsOut || loanIsIn) && <span className="rounded-md bg-sky-400 px-1.5 py-0.5 text-[9px] font-black text-sky-950">{loanIsOut ? "ON LOAN" : "LOAN SIGNING"}</span>}
                  {shortlisted && <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-amber-950">SHORTLIST</span>}
                </div>
              </div>
            </div>

            <div className="absolute right-0 top-8 grid size-[3.9rem] place-items-center rounded-full border-2 border-emerald-300/50 bg-[#0b2b23] shadow-[0_0_0_4px_rgba(16,185,129,.12)]">
              <div className="text-center leading-none">
                <div className="font-display text-[1.6rem] text-white">{rating}</div>
                <div className="mt-0.5 text-[6.5px] font-bold uppercase tracking-wider text-emerald-200/70">{ratingCaption}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
              {keyFacts.map((fact) => (
                <div key={fact.label} className="min-w-0 bg-[#0a241d] px-2 py-1.5">
                  <div className="truncate text-[7.5px] font-bold uppercase tracking-wider text-white/40">{fact.label}</div>
                  <div className="truncate text-[12px] font-bold text-white">{fact.value}</div>
                </div>
              ))}
            </div>

            {owned && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-white/40">
                    <span>Fitness</span><span className="text-[11px] text-white">{playerFitness(player)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={cn("h-full rounded-full", playerFitness(player) >= 80 ? "bg-emerald-400" : playerFitness(player) >= 65 ? "bg-amber-400" : "bg-rose-400")} style={{ width: `${playerFitness(player)}%` }} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-white/40">
                    <span>Form</span><span className="truncate text-[11px] normal-case text-white">{recentForm?.appearances ? `${recentForm.band} · ${recentForm.averageRating.toFixed(2)}` : "No games yet"}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${recentForm?.appearances ? Math.max(4, Math.min(100, ((recentForm.averageRating - 5) / 4) * 100)) : 0}%` }} />
                  </div>
                </div>
              </div>
            )}
          </SheetHeader>
        </div>

        <div className="space-y-2.5 p-2.5 pb-8">
          {/* Compact management actions */}
          {owned ? (
            <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
              {(loanIsOut || loanIsIn) && (
                <div className="border-b bg-sky-50 px-3 py-1.5 text-[11px] text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                  {loanIsOut ? "Away on loan" : "On loan at your club"}
                  {loan ? ` · ${loan.playingTimeExpectation} playing time` : ""}
                </div>
              )}
              {note && <div className="mx-2.5 mt-2.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-[11px]">{note}</div>}
              <div className={cn("grid gap-1.5 p-2.5", userOwnsPlayer && !loanIsOut ? (loan ? "grid-cols-5" : "grid-cols-4") : "grid-cols-1")}>
                {userOwnsPlayer && !loanIsOut && (
                  <>
                    <ActionTile
                      icon={listed ? ListMinus : ListPlus}
                      label={listed ? "Unlist" : "Transfer list"}
                      active={listed}
                      onClick={toggleTransferList}
                    />
                    <ActionTile
                      icon={Handshake}
                      label="Contract"
                      active={showContract}
                      disabled={!proposedRenewal}
                      onClick={openContractNegotiation}
                    />
                    <ActionTile
                      icon={Repeat2}
                      label="Loan out"
                      active={showLoanOut}
                      disabled={!transferWindowOpen || Boolean(loan)}
                      title={!transferWindowOpen ? `${transferWindow.label} · ${transferWindow.detail}` : undefined}
                      onClick={() => {
                        setShowLoanOut((value) => !value);
                        setShowContract(false);
                        setReleaseConfirm(false);
                      }}
                    />
                    <ActionTile
                      icon={Trash2}
                      label="Release"
                      danger
                      active={releaseConfirm}
                      onClick={() => {
                        setReleaseConfirm((value) => !value);
                        setShowContract(false);
                        setShowLoanOut(false);
                      }}
                    />
                  </>
                )}
                {loan && (
                  <ActionTile
                    icon={RefreshCcw}
                    label={loanIsOut ? "Recall" : "End loan"}
                    onClick={endLoan}
                  />
                )}
              </div>

              {showContract && proposedRenewal && (
                <div className="border-t bg-muted/25 p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <strong className="text-sm">New contract</strong>
                    <span className="text-[10px] text-muted-foreground">
                      Asks {fmtMoneyExact(proposedRenewal.weeklyWage)}/wk · bonus {fmtMoneyExact(proposedRenewal.signingBonus)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Wage /wk
                      <input
                        type="number"
                        min={0}
                        step={25}
                        value={renewWage}
                        onChange={(event) => setRenewWage(Math.max(0, Number(event.target.value)))}
                        className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground"
                      />
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Length
                      <select
                        value={renewSeasons}
                        onChange={(event) => setRenewSeasons(Number(event.target.value))}
                        className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground"
                      >
                        {[1, 2, 3, 4].map((years) => (
                          <option key={years} value={years}>
                            {years} yr{years === 1 ? "" : "s"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Role
                      <select
                        value={renewRole}
                        onChange={(event) => setRenewRole(event.target.value as SquadRole)}
                        className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground"
                      >
                        {(["Key Player", "First Team", "Rotation", "Prospect"] as SquadRole[]).map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">The player can reject terms below his expectations.</p>
                  <Button className="mt-2 h-9 w-full" onClick={negotiateContract}>Offer contract</Button>
                </div>
              )}

              {showLoanOut && (
                <div className="border-t bg-muted/25 p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <strong className="text-sm">Loan terms</strong>
                    <span className="text-[10px] text-muted-foreground">Recruitment will find a club</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Length
                      <select value={loanDuration} onChange={(event) => setLoanDuration(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground">
                        {[4, 8, 12, 24].map((weeks) => <option key={weeks} value={weeks}>{weeks} wks</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      They pay
                      <select value={loanContribution} onChange={(event) => setLoanContribution(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground">
                        {[20, 35, 50, 65, 80, 100].map((pct) => <option key={pct} value={pct}>{pct}%</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Minutes
                      <select value={loanRole} onChange={(event) => setLoanRole(event.target.value as LoanPlayingTimeExpectation)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm text-foreground">
                        {(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>
                  </div>
                  <Button className="mt-2.5 h-9 w-full" onClick={sendLoanOut}>Find loan club</Button>
                </div>
              )}

              {releaseConfirm && contract && (
                <div className="border-t border-rose-200 bg-rose-50 p-3 dark:border-rose-950 dark:bg-rose-950/20">
                  <strong className="text-sm text-rose-800 dark:text-rose-200">Release {displayName}?</strong>
                  <p className="mt-0.5 text-[10px] text-rose-700/80 dark:text-rose-200/70">
                    His contract ends immediately and any required settlement is charged to the club.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-9" onClick={() => setReleaseConfirm(false)}>Keep</Button>
                    <Button className="h-9 bg-rose-600 text-white hover:bg-rose-700" onClick={releasePlayer}>Confirm release</Button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-950/10 bg-white p-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
              {note && <div className="mb-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-[11px]">{note}</div>}
              <div className={cn("grid gap-1.5", freeAgent ? "grid-cols-3" : "grid-cols-4")}>
                <ActionTile icon={Star} label={shortlisted ? "Shortlisted" : "Shortlist"} active={shortlisted} onClick={() => update((s) => toggleChairmanShortlist(s, player.id))} />
                {!assignment ? (
                  <ActionTile icon={Binoculars} label={hasScouting ? "Scout more" : "Scout"} onClick={() => update((s) => startScouting(s, player.id))} />
                ) : report?.complete ? (
                  <ActionTile icon={CheckCircle2} label="Full report" disabled onClick={() => {}} />
                ) : (
                  <ActionTile icon={Binoculars} label="Scouting…" disabled onClick={() => {}} />
                )}
                <ActionTile icon={Handshake} label={freeAgent ? "Approach" : "Approach club"} disabled={!estimate} onClick={approach} />
                {!freeAgent && (
                  <ActionTile
                    icon={Repeat2}
                    label="Loan"
                    active={showLoan}
                    disabled={!transferWindowOpen || Boolean(loanUnavailable)}
                    title={!transferWindowOpen ? `${transferWindow.label} · ${transferWindow.detail}` : loanUnavailable ?? "Request a temporary loan"}
                    onClick={() => setShowLoan((current) => !current)}
                  />
                )}
              </div>
              {showLoan && !freeAgent && (
                <div className="mt-2.5 rounded-xl border bg-muted/30 p-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Length
                      <select value={loanDuration} onChange={(event) => setLoanDuration(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-xs text-foreground">
                        {[4, 8, 12, 24].map((weeks) => <option key={weeks} value={weeks}>{weeks} wks</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      We pay
                      <select value={loanContribution} onChange={(event) => setLoanContribution(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-xs text-foreground">
                        {[20, 35, 50, 65, 80, 100].map((pct) => <option key={pct} value={pct}>{pct}%</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-muted-foreground">
                      Minutes
                      <select value={loanRole} onChange={(event) => setLoanRole(event.target.value as LoanPlayingTimeExpectation)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-xs text-foreground">
                        {(["Backup", "Rotation", "Regular", "Important"] as const).map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </label>
                  </div>
                  <Button size="sm" className="mt-2 h-9 w-full" onClick={requestLoan}>Send loan request</Button>
                </div>
              )}
            </section>
          )}

          {/* One performance card instead of three near-identical sections */}
          {owned && (seasonLine || career || (recentForm && recentForm.appearances > 0)) && (
            <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
              <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
                <div className="font-display text-base">Performance</div>
                <div className="flex rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label="Performance view">
                  {([
                    ["season", "Season", Boolean(seasonLine)],
                    ["form", "Form", Boolean(recentForm && recentForm.appearances > 0)],
                    ["career", "Career", Boolean(career)],
                  ] as const).map(([id, label, available]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={statsView === id}
                      disabled={!available}
                      onClick={() => setStatsView(id)}
                      className={cn(
                        "rounded-md px-2 py-1 text-[10px] font-bold disabled:opacity-35",
                        statsView === id
                          ? "bg-white text-foreground shadow-sm dark:bg-white/15"
                          : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {statFigures ? (
                <>
                  <div className="mt-2 grid grid-cols-4 divide-x border-y border-emerald-950/5 bg-emerald-50/40 text-center dark:border-white/5 dark:bg-white/[0.02]">
                    {statFigures.figures.map(([label, value]) => (
                      <div key={label} className="min-w-0 px-1 py-2">
                        <div className="truncate font-display text-xl leading-none">{value}</div>
                        <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-1.5 text-[10.5px] text-muted-foreground">{statFigures.line}</div>
                </>
              ) : (
                <div className="px-3 pb-2.5 pt-1.5 text-[11px] text-muted-foreground">No appearances recorded yet.</div>
              )}
              {statsView === "career" && seasonHistory.length > 1 && (
                <div className="mx-3 mb-2.5 overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[auto_repeat(5,1fr)] bg-muted/30 px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <span>Season</span><span className="text-right">Apps</span><span className="text-right">Min</span><span className="text-right">G</span><span className="text-right">A</span><span className="text-right">Rat</span>
                  </div>
                  {seasonHistory.map(({ season, record }) => (
                    <div key={season} className="grid grid-cols-[auto_repeat(5,1fr)] border-t px-2 py-1 text-[10px]">
                      <span>S{season}</span><span className="text-right">{record.appearances}</span><span className="text-right">{record.minutes}</span><span className="text-right">{record.goals}</span><span className="text-right">{record.assists}</span><span className="text-right">{record.averageRating.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Scouting / football identity + radar + tappable attribute groups */}
          <section className="overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <div>
                <div className="font-display text-base">{owned ? "Attributes" : "Scouting profile"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {owned
                    ? "Full club knowledge"
                    : fullKnowledge
                      ? "Full scouting report"
                      : assignment
                        ? "Scout following up"
                        : hasScouting
                          ? "Initial staff assessment"
                          : "Not scouted yet"}
                </div>
              </div>
              {!owned && (
                <div className="w-20 text-right">
                  <div className="text-[10px] font-bold">{knowledge}% known</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${knowledge}%` }} />
                  </div>
                </div>
              )}
            </div>

            {report ? (
              <div className="p-3 pt-2">
                <div className="flex items-center gap-3">
                  {radar && <AttributeRadar areas={radar} />}
                  {attributeIdentity && (
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Plays as</div>
                      <div className="font-display text-lg leading-tight">{attributeIdentity.label}</div>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{attributeIdentity.summary}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {attributeIdentity.strengths.map((strength) => (
                          <span key={strength} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                            {strength}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2.5 flex rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label="Attribute group">
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      role="tab"
                      aria-selected={activeCategory === category}
                      onClick={() => setAttributeTab(category)}
                      className={cn(
                        "flex-1 rounded-md py-1 text-[10px] font-bold capitalize",
                        activeCategory === category
                          ? "bg-white text-foreground shadow-sm dark:bg-white/15"
                          : "text-muted-foreground",
                      )}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {report.attributes
                    .filter((attribute) => PLAYER_ATTRIBUTE_GROUPS[activeCategory].includes(attribute.key))
                    .map((attribute) => {
                      const value = !attribute.known
                        ? "?"
                        : attribute.exact !== undefined
                          ? String(attribute.exact)
                          : `${attribute.min}–${attribute.max}`;
                      const midpoint = attributeValue(attribute as ReportAttribute) ?? 0;
                      return (
                        <div key={attribute.key} className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[11px] font-semibold">{attribute.label}</span>
                            <span className="font-display text-[15px] leading-none tabular-nums">{value}</span>
                          </div>
                          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                            {attribute.known && (
                              <div
                                className={cn("h-full rounded-full", barTone(midpoint))}
                                style={{ width: `${Math.max(3, Math.min(100, midpoint))}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              <div className="px-3 pb-3 pt-1.5 text-[11px] text-muted-foreground">
                No scouting information yet. Send a scout to reveal attributes and terms.
              </div>
            )}
          </section>

          {!owned && !fullKnowledge && hasScouting && (
            <div className="rounded-xl border border-dashed border-emerald-600/40 px-3 py-2 text-center text-[11px] font-semibold text-emerald-800 dark:text-emerald-200">
              Scout further for the complete picture
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionTile({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  title,
}: {
  icon: typeof ListPlus;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-[10px] font-bold leading-tight transition-colors disabled:opacity-40",
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : danger
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
            : "border-emerald-950/10 bg-white text-foreground hover:bg-emerald-50 dark:border-white/10 dark:bg-white/[0.04]",
      )}
    >
      <Icon className="size-4" />
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

function PositionChip({
  player,
  position,
}: {
  player: NonNullable<ReturnType<typeof knownPlayerDetail>>;
  position: TacticalPosition;
}) {
  const familiarity = positionFamiliarity(player, position);
  return (
    <span className={cn(
      "rounded border px-2 py-1 text-[11px] font-semibold",
      POSITION_BADGE_CLASS[positionUnit(position)],
    )}>
      {position} · {familiarity}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-emerald-950/10 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(6,78,59,0.03)] dark:border-white/10 dark:bg-white/[0.035]">
      <div className="font-display text-lg leading-tight">{value}</div>
      <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
    </div>
  );
}