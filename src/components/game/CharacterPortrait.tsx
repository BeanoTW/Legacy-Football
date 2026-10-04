import { createContext, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { ChairmanAvatar } from "@/lib/game/chairmanProfile";
import type { GameState } from "@/lib/game/types";
import { generatedPortrait, onPortraitOverrideChange, portraitOverride, type PortraitIdentity } from "@/lib/game/characterPortrait";
import { clubKitForReference, readableOn, shadeHex, type BadgeDesign, type KitDesign } from "@/lib/game/clubKit";
import { ChairmanPortrait } from "./ChairmanPortrait";
import { ClubBadge } from "./ClubKitArt";

/** A club shirt for a player portrait. Display only: never touches the face seed. */
export interface PortraitKit {
  kit: KitDesign;
  badge?: BadgeDesign;
  clubName?: string;
}

type KitResolver = (playerId: string) => PortraitKit | undefined;
const PortraitKitContext = createContext<KitResolver | null>(null);

export function PortraitKitProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const players = state.football.players;
  const resolver = useMemo<KitResolver>(() => {
    const clubByPlayer = new Map<string, string | null>();
    for (const player of players) clubByPlayer.set(player.id, player.currentClubId);
    const kitByClub = new Map<string, PortraitKit>();
    return (playerId: string) => {
      const clubId = clubByPlayer.get(playerId);
      if (!clubId) return undefined;
      let entry = kitByClub.get(clubId);
      if (!entry) {
        const identity = clubKitForReference(state, clubId);
        entry = { kit: identity.home, badge: identity.badge };
        kitByClub.set(clubId, entry);
      }
      return entry;
    };
  }, [players, state.clubKit, state.aiClubKits, state.clubName]);
  return <PortraitKitContext.Provider value={resolver}>{children}</PortraitKitContext.Provider>;
}

const TORSO = "M18 220 C20 190 48 172 84 168 L116 168 C152 172 180 190 182 220Z";
const SLEEVE_L = "M18 220 C21 199 33 186 50 177 L57 220 Z";
const SLEEVE_R = "M182 220 C179 199 167 186 150 177 L143 220 Z";

function shirtPattern(kit: KitDesign): ReactNode {
  const secondary = kit.secondary;
  switch (kit.pattern) {
    case "stripes":
      return <path d={[34, 62, 90, 118, 146].map((x) => `M${x} 160H${x + 14}V222H${x}Z`).join("")} fill={secondary} />;
    case "pinstripes":
      return <path d={Array.from({ length: 16 }, (_, index) => `M${24 + index * 10} 160H${25.6 + index * 10}V222H${24 + index * 10}Z`).join("")} fill={secondary} />;
    case "doubleStripe":
      return <path d="M78 150H88V230H78ZM112 150H122V230H112Z" fill={secondary} />;
    case "centreStripe":
      return <rect x="88" y="150" width="24" height="80" fill={secondary} />;
    case "hoops":
      return <path d="M0 180H200V192H0ZM0 204H200V216H0Z" fill={secondary} />;
    case "halves":
      return <rect x="100" y="150" width="100" height="80" fill={secondary} />;
    case "thirds":
      return <path d="M0 150H67V230H0ZM133 150H200V230H133Z" fill={secondary} />;
    case "quarters":
      return <path d="M100 150H200V196H100ZM0 196H100V230H0Z" fill={secondary} />;
    case "sash":
      return <path d="M44 172L62 166L162 226L140 232Z" fill={secondary} />;
    case "diagonal":
      return <path d="M100 150H200V230H40Z" fill={secondary} />;
    case "chevron":
      return <path d="M40 188L100 204L160 188V200L100 216L40 200Z" fill={secondary} />;
    case "doubleChevron":
      return <path d="M40 180L100 196L160 180V190L100 206L40 190ZM40 200L100 216L160 200V210L100 226L40 210Z" fill={secondary} />;
    case "band":
      return <rect x="0" y="194" width="200" height="12" fill={secondary} />;
    case "yoke":
      return <path d="M34 150H166L150 184Q100 170 50 184Z" fill={secondary} />;
    default:
      return null;
  }
}

function PortraitShirt({
  kit,
  badge,
  clubName,
  skin,
  framed,
}: PortraitKit & { skin: string; framed: boolean }) {
  const uid = useId().replace(/:/g, "");
  const outline = shadeHex(kit.body, -0.4);
  const sponsorColour =
    kit.sponsorColour ||
    (kit.pattern === "band" ? readableOn(kit.secondary) : readableOn(kit.body));

  return (
    <svg
      viewBox="20 18 160 192"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`${uid}-frame`}>
          <rect x="20" y="18" width="160" height="192" rx={framed ? 24 : 0} />
        </clipPath>
        <clipPath id={`${uid}-torso`}>
          <path d={TORSO} />
        </clipPath>
        <linearGradient id={`${uid}-fold`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity={0.26} />
          <stop offset="0.24" stopColor="#000" stopOpacity={0.03} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.09} />
          <stop offset="0.76" stopColor="#000" stopOpacity={0.03} />
          <stop offset="1" stopColor="#000" stopOpacity={0.28} />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${uid}-frame)`}>
        <path d={TORSO} fill={kit.body} />
        <g clipPath={`url(#${uid}-torso)`}>
          {shirtPattern(kit)}
          <path d={SLEEVE_L} fill={kit.sleeves} />
          <path d={SLEEVE_R} fill={kit.sleeves} />
          <path
            d="M50 177L57 220M150 177L143 220"
            stroke={outline}
            strokeOpacity={0.45}
            strokeWidth={1.2}
            fill="none"
          />
          <rect x="0" y="160" width="200" height="70" fill={`url(#${uid}-fold)`} />
        </g>

        {kit.collar === "vneck" ? (
          <g>
            <path d="M86 167L100 185L114 167Z" fill={skin} />
            <path
              d="M84 166L100 187L116 166"
              fill="none"
              stroke={kit.trim}
              strokeWidth={4}
              strokeLinejoin="round"
            />
          </g>
        ) : kit.collar === "polo" ? (
          <g>
            <path
              d="M80 164L98 182L100 170Z M120 164L102 182L100 170Z"
              fill={kit.trim}
              stroke={shadeHex(kit.trim, -0.3)}
              strokeWidth={0.8}
            />
            <path d="M96 170H104V196H96Z" fill={shadeHex(kit.body, -0.1)} />
            {[178, 186].map((y) => (
              <circle key={y} cx={100} cy={y} r={1.3} fill={kit.trim} />
            ))}
          </g>
        ) : kit.collar === "mandarin" ? (
          <path d="M84 166Q100 174 116 166V176Q100 184 84 176Z" fill={kit.trim} stroke={outline} strokeWidth={1} />
        ) : kit.collar === "lace" ? (
          <g>
            <path d="M84 166L100 187L116 166" fill="none" stroke={kit.trim} strokeWidth={3.5} strokeLinejoin="round" />
            <path d="M92 174L106 180M94 180L108 174" stroke={kit.trim} strokeWidth={1.5} />
          </g>
        ) : (
          <path
            d="M83 167C88 177 112 177 117 167"
            fill="none"
            stroke={kit.trim}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        )}

        {badge && (
          <foreignObject x={125} y={184} width={14} height={14}>
            <div className="h-full w-full">
              <ClubBadge design={badge} clubName={clubName} size={14} />
            </div>
          </foreignObject>
        )}

        {kit.sponsor && (
          <text
            x={100}
            y={kit.sponsorPosition === "high" ? 200 : 210}
            textAnchor="middle"
            fontSize={kit.sponsor.length > 10 ? 6.5 : 8}
            fontWeight={800}
            letterSpacing={0.6}
            fill={sponsorColour}
            className="font-display"
          >
            {kit.sponsor.toUpperCase()}
          </text>
        )}
        <path
          d={TORSO}
          fill="none"
          stroke={outline}
          strokeOpacity={0.55}
          strokeWidth={1.2}
        />
      </g>
    </svg>
  );
}

/** One renderer for chairman, players and football staff. The existing
 * chairman studio remains the authoritative editable profile. Players wear
 * their club's home shirt when a kit is known; faces, hair and manual edits
 * are never affected. */
export function CharacterPortrait({
  identity,
  avatar,
  kit,
  size = 64,
  framed = true,
  className,
  title,
}: {
  identity?: PortraitIdentity;
  avatar?: ChairmanAvatar;
  /** Explicit shirt. null forces normal clothes; omitted uses the provider for players. */
  kit?: PortraitKit | null;
  size?: number;
  framed?: boolean;
  className?: string;
  title?: string;
}) {
  const generated = useMemo(
    () => (identity ? generatedPortrait(identity) : undefined),
    [
      identity?.id,
      identity?.subject,
      identity?.sex,
      identity?.outfitColour,
      identity?.accentColour,
    ],
  );
  const [override, setOverride] = useState<ChairmanAvatar | null>(() =>
    identity ? portraitOverride(identity.id) : null,
  );

  useEffect(() => {
    const refresh = () =>
      setOverride(identity ? portraitOverride(identity.id) : null);
    refresh();
    return onPortraitOverrideChange(refresh);
  }, [identity?.id]);

  const resolveKit = useContext(PortraitKitContext);
  const appearance = avatar ?? override ?? generated;
  if (!appearance) return null;

  const shirt =
    kit === null
      ? undefined
      : kit ??
        (identity?.subject === "player" && !avatar && resolveKit
          ? resolveKit(identity.id)
          : undefined);

  const portrait = (
    <ChairmanPortrait
      avatar={shirt ? { ...appearance, outfit: "knit" } : appearance}
      size={size}
      framed={framed}
      className={shirt ? undefined : className}
      title={title ?? (identity ? `${identity.subject} portrait` : "Chairman portrait")}
    />
  );

  if (!shirt) return portrait;

  return (
    <span
      className={`relative inline-block align-top leading-none ${className ?? ""}`}
      style={{ width: size, height: (size * 192) / 160 }}
    >
      {portrait}
      <PortraitShirt {...shirt} skin={appearance.skin} framed={framed} />
    </span>
  );
}
