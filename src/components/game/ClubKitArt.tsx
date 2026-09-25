import { useId, type ReactNode } from "react";
import {
  readableOn,
  shadeHex,
  type BadgeDesign,
  type BadgeEmblem,
  type BadgeShape,
  type KitDesign,
} from "@/lib/game/clubKit";

/* ================================================================== */
/* Badge                                                               */
/* ================================================================== */

const SHAPE_PATHS: Record<BadgeShape, string> = {
  shield: "M10 8H90V46C90 70 72 86 50 95C28 86 10 70 10 46Z",
  classic: "M8 12Q29 18 50 8Q71 18 92 12V50C92 74 73 88 50 96C27 88 8 74 8 50Z",
  round: "M4 50A46 46 0 1 0 96 50A46 46 0 1 0 4 50Z",
  roundel: "M4 50A46 46 0 1 0 96 50A46 46 0 1 0 4 50Z",
  pennant: "M14 6H86V58L50 96L14 58Z",
  diamond: "M50 3L96 50L50 97L4 50Z",
  octagon: "M31 4H69L96 31V69L69 96H31L4 69V31Z",
  square: "M12 6H88Q94 6 94 12V76Q94 83 87 86L50 97L13 86Q6 83 6 76V12Q6 6 12 6Z",
};

/** Roundels carry lettering in a ring; the field is the inner disc. */
const ROUNDEL_FIELD = "M18 50A32 32 0 1 0 82 50A32 32 0 1 0 18 50Z";

function divisionShapes(division: BadgeDesign["division"], colour: string): ReactNode {
  switch (division) {
    case "perPale":
      return <rect x="50" y="0" width="50" height="100" fill={colour} />;
    case "perFess":
      return <rect x="0" y="50" width="100" height="50" fill={colour} />;
    case "perBend":
      return <path d="M0 0L100 100H0Z" fill={colour} />;
    case "quarterly":
      return <path d="M50 0H100V50H50ZM0 50H50V100H0Z" fill={colour} />;
    case "stripes":
      return <path d="M12.5 0H25V100H12.5ZM37.5 0H50V100H37.5ZM62.5 0H75V100H62.5ZM87.5 0H100V100H87.5Z" fill={colour} />;
    case "hoops":
      return <path d="M0 12.5H100V25H0ZM0 37.5H100V50H0ZM0 62.5H100V75H0ZM0 87.5H100V100H0Z" fill={colour} />;
    case "chevron":
      return <path d="M0 64L50 38L100 64V82L50 56L0 82Z" fill={colour} />;
    case "cross":
      return <path d="M42 0H58V42H100V58H58V100H42V58H0V42H42Z" fill={colour} />;
    case "saltire":
      return <path d="M0 9L9 0L100 91L91 100ZM91 0L100 9L9 100L0 91Z" fill={colour} />;
    case "chief":
      return <rect x="0" y="0" width="100" height="30" fill={colour} />;
    default:
      return null;
  }
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const result: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    result.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return result.join(" ");
}

/** Original emblem drawings in a 100 × 100 box. */
function emblemArt(emblem: BadgeEmblem, colour: string, field: string): ReactNode {
  const edge = shadeHex(colour, luminanceIsLight(colour) ? -0.35 : 0.25);
  switch (emblem) {
    case "ball": {
      const pentagon = starPoints(50, 50, 15, 15, 5)
        .split(" ")
        .filter((_, i) => i % 2 === 0)
        .join(" ");
      const spokes = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return `M${50 + Math.cos(a) * 15} ${50 + Math.sin(a) * 15}L${50 + Math.cos(a) * 36} ${50 + Math.sin(a) * 36}`;
      }).join("");
      const patches = Array.from({ length: 5 }, (_, i) => {
        const a = -Math.PI / 2 + Math.PI / 5 + (i * 2 * Math.PI) / 5;
        return starPoints(50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38, 9, 9, 5)
          .split(" ")
          .filter((_, j) => j % 2 === 0)
          .join(" ");
      });
      return (
        <g>
          <circle cx="50" cy="50" r="44" fill={colour} stroke={edge} strokeWidth="3" />
          <polygon points={pentagon} fill={field} />
          <path d={spokes} stroke={field} strokeWidth="3" />
          {patches.map((points, i) => (
            <polygon key={i} points={points} fill={field} />
          ))}
          <circle cx="50" cy="50" r="44" fill="none" stroke={edge} strokeWidth="3" />
        </g>
      );
    }
    case "star":
      return <polygon points={starPoints(50, 53, 46, 19)} fill={colour} stroke={edge} strokeWidth="2.5" strokeLinejoin="round" />;
    case "crown":
      return (
        <g fill={colour} stroke={edge} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M12 76L6 28L30 50L50 16L70 50L94 28L88 76Z" />
          <rect x="12" y="78" width="76" height="12" rx="2" />
          <circle cx="6" cy="26" r="5" />
          <circle cx="50" cy="13" r="5" />
          <circle cx="94" cy="26" r="5" />
          <circle cx="50" cy="84" r="3" fill={field} stroke="none" />
          <circle cx="30" cy="84" r="3" fill={field} stroke="none" />
          <circle cx="70" cy="84" r="3" fill={field} stroke="none" />
        </g>
      );
    case "castle":
      return (
        <g>
          <path
            d="M14 92V38H8V14H22V24H32V14H46V24H54V14H68V24H78V14H92V38H86V92H62V72Q62 60 50 60Q38 60 38 72V92Z"
            fill={colour}
            stroke={edge}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M26 44H32V56H26ZM68 44H74V56H68ZM47 36H53V48H47Z" fill={field} />
          <path d="M14 38H86" stroke={edge} strokeWidth="2" />
        </g>
      );
    case "anchor":
      return (
        <g fill="none" stroke={colour} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="15" r="8" />
          <path d="M50 23V88M30 36H70M14 58Q16 88 50 88Q84 88 86 58" />
          <path d="M14 58L6 68M14 58L25 64M86 58L94 68M86 58L75 64" strokeWidth="6" />
        </g>
      );
    case "swallow":
      return (
        <path
          d="M4 36Q26 38 42 52Q50 36 66 32L96 18L80 38Q76 52 62 60L74 92L56 70Q46 72 38 64Q24 60 4 36Z"
          fill={colour}
          stroke={edge}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      );
    case "oak":
      return (
        <g stroke={edge} strokeWidth="2.5">
          <path d="M44 58H56L62 94H38Z" fill={colour} />
          <g fill={colour}>
            <circle cx="50" cy="30" r="22" />
            <circle cx="28" cy="44" r="18" />
            <circle cx="72" cy="44" r="18" />
            <circle cx="38" cy="58" r="15" />
            <circle cx="62" cy="58" r="15" />
          </g>
          <circle cx="50" cy="30" r="22" fill={colour} stroke="none" />
          <circle cx="50" cy="48" r="16" fill={colour} stroke="none" />
        </g>
      );
    case "wheel": {
      const spokes = Array.from({ length: 10 }, (_, i) => {
        const a = (i * Math.PI) / 5;
        return `M${50 + Math.cos(a) * 11} ${50 + Math.sin(a) * 11}L${50 + Math.cos(a) * 38} ${50 + Math.sin(a) * 38}`;
      }).join("");
      return (
        <g fill="none" stroke={colour} strokeLinecap="round">
          <circle cx="50" cy="50" r="41" strokeWidth="8" />
          <circle cx="50" cy="50" r="47" strokeWidth="3" />
          <path d={spokes} strokeWidth="5" />
          <circle cx="50" cy="50" r="10" fill={colour} strokeWidth="2" />
          <circle cx="50" cy="50" r="3.5" fill={field} stroke="none" />
          <circle cx="72" cy="62" r="5" fill={colour} stroke="none" />
        </g>
      );
    }
    case "locomotive":
      return (
        <g stroke={edge} strokeWidth="2" strokeLinejoin="round">
          <g fill={colour}>
            <path d="M18 38H70V64H18Z" />
            <path d="M68 24H90V64H68Z" />
            <path d="M64 19H94V26H64Z" />
            <path d="M26 16H38V38H26Z" />
            <path d="M23 12H41V17H23Z" />
            <path d="M44 38Q50 27 56 38Z" />
            <path d="M18 62L6 76H18Z" />
            <path d="M10 64H94V70H10Z" />
            <circle cx="30" cy="79" r="10" />
            <circle cx="56" cy="79" r="10" />
            <circle cx="81" cy="81" r="8" />
          </g>
          <path d="M73 30H85V42H73Z" fill={field} stroke="none" />
          <path d="M30 79L56 79" stroke={field} strokeWidth="3" />
          <g fill={field} stroke="none">
            <circle cx="30" cy="79" r="3" />
            <circle cx="56" cy="79" r="3" />
            <circle cx="81" cy="81" r="2.5" />
          </g>
        </g>
      );
    case "mountains":
      return (
        <g strokeLinejoin="round">
          <path d="M2 88L34 32L52 58L66 26L98 88Z" fill={colour} stroke={edge} strokeWidth="2.5" />
          <path d="M34 32L26 46L34 42L41 48ZM66 26L58 40L66 36L74 42Z" fill={field} />
        </g>
      );
    case "waves":
      return (
        <g fill="none" stroke={colour} strokeWidth="8" strokeLinecap="round">
          <path d="M8 34Q20 22 32 34T56 34T80 34T96 30" />
          <path d="M8 54Q20 42 32 54T56 54T80 54T96 50" />
          <path d="M8 74Q20 62 32 74T56 74T80 74T96 70" />
        </g>
      );
    case "hammers":
      return (
        <g fill={colour} stroke={edge} strokeWidth="2" strokeLinejoin="round">
          <g transform="rotate(40 50 50)">
            <rect x="46" y="24" width="8" height="70" rx="2" />
            <rect x="30" y="10" width="40" height="17" rx="2" />
          </g>
          <g transform="rotate(-40 50 50)">
            <rect x="46" y="24" width="8" height="70" rx="2" />
            <rect x="30" y="10" width="40" height="17" rx="2" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

function luminanceIsLight(hex: string): boolean {
  return readableOn(hex) !== "#ffffff";
}

interface BadgeProps {
  design: BadgeDesign;
  /** Club name, used for ring lettering on round badges. */
  clubName?: string;
  size?: number | string;
  className?: string;
  title?: string;
}

/** Renders a club badge. Scales to any size; use in headers, fixtures and shirts. */
export function ClubBadge({ design, clubName = "", size = 64, className, title }: BadgeProps) {
  const uid = useId().replace(/:/g, "");
  const outline = SHAPE_PATHS[design.shape];
  const roundel = design.shape === "roundel";
  const fieldPath = roundel ? ROUNDEL_FIELD : outline;
  const round = design.shape === "round" || roundel;
  const ring = design.lettering === "ring";
  const ribbon = design.lettering === "initials" && design.initials.length > 0;
  const fieldCentre = roundel ? 50 : design.shape === "pennant" ? 40 : design.shape === "diamond" ? 50 : 46;
  const emblemSize = roundel ? 38 : ribbon ? 38 : 46;
  const emblemY = ribbon && !roundel ? fieldCentre - 6 : fieldCentre;
  const ringText = `${(clubName || design.initials).toUpperCase()}`;
  const yearSplit = design.founded.length === 4 ? [design.founded.slice(0, 2), design.founded.slice(2)] : null;
  const accentText = readableOn(design.accent);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={typeof size === "number" ? size : undefined}
      className={className}
      role="img"
      aria-label={title ?? `${clubName || "Club"} badge`}
    >
      <defs>
        <clipPath id={`${uid}-field`}>
          <path d={fieldPath} />
        </clipPath>
        <path id={`${uid}-ring-top`} d="M13 50A37 37 0 0 1 87 50" />
        <path id={`${uid}-ring-bottom`} d="M9 50A41 41 0 0 0 91 50" />
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      {/* Outer body (the ring on roundels) */}
      <path d={outline} fill={roundel ? design.accent : design.primary} />

      {/* Field with its heraldic division */}
      <g clipPath={`url(#${uid}-field)`}>
        <rect x="0" y="0" width="100" height="100" fill={design.primary} />
        {divisionShapes(design.division, design.secondary)}
        <g transform={`translate(${50 - emblemSize / 2} ${emblemY - emblemSize / 2}) scale(${emblemSize / 100})`}>
          {emblemArt(design.emblem, design.emblemColour, design.primary)}
        </g>
        {ring && !round && yearSplit ? (
          <g fontWeight="700" fontSize="11" textAnchor="middle" fill={design.accent} className="font-display">
            <text x="22" y={emblemY + 4}>{yearSplit[0]}</text>
            <text x="78" y={emblemY + 4}>{yearSplit[1]}</text>
          </g>
        ) : null}
      </g>

      {roundel ? (
        <>
          <path d={ROUNDEL_FIELD} fill="none" stroke={shadeHex(design.accent, -0.3)} strokeWidth="1.5" />
          <g fill={accentText} fontWeight="700" className="font-display" letterSpacing="1.2">
            <text fontSize="9.5" textAnchor="middle">
              <textPath href={`#${uid}-ring-top`} startOffset="50%">
                {ring || !ribbon ? ringText : design.initials}
              </textPath>
            </text>
            {design.founded ? (
              <text fontSize="8" textAnchor="middle">
                <textPath href={`#${uid}-ring-bottom`} startOffset="50%">
                  {`EST ${design.founded}`}
                </textPath>
              </text>
            ) : null}
          </g>
        </>
      ) : null}

      {ring && design.shape === "round" ? (
        <g fill={design.accent} fontWeight="700" className="font-display" letterSpacing="1">
          <text fontSize="9" textAnchor="middle">
            <textPath href={`#${uid}-ring-top`} startOffset="50%">{ringText}</textPath>
          </text>
        </g>
      ) : null}

      {ribbon && !roundel ? (
        <g>
          <path d="M12 70H88L83 78.5L88 87H12L17 78.5Z" fill={design.accent} stroke={shadeHex(design.accent, -0.35)} strokeWidth="1.2" />
          <text
            x="50"
            y="82.6"
            textAnchor="middle"
            fontSize={design.initials.length > 3 ? 10.5 : 12}
            fontWeight="800"
            letterSpacing="1.5"
            fill={accentText}
            className="font-display"
          >
            {design.initials}
          </text>
        </g>
      ) : null}

      {/* Sheen and borders */}
      <path d={outline} fill={`url(#${uid}-sheen)`} />
      <path d={outline} fill="none" stroke={design.accent} strokeWidth="4" strokeLinejoin="round" />
      <path d={outline} fill="none" stroke={shadeHex(design.accent, -0.45)} strokeWidth="1" strokeLinejoin="round" />
      {!roundel ? (
        <path
          d={outline}
          transform="translate(6 6) scale(0.88)"
          fill="none"
          stroke={design.accent}
          strokeOpacity="0.7"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

/* ================================================================== */
/* Shirt and kit                                                       */
/* ================================================================== */

const BODY = "M80 18Q100 31 120 18L150 26L148 70L151 190Q100 197 49 190L52 70L50 26Z";
const SLEEVE_R = "M150 26L187 61L167 85L148 70Z";
const SLEEVE_L = "M50 26L13 61L33 85L52 70Z";
const CUFF_R = "M187 61L167 85L162 80L182 56Z";
const CUFF_L = "M13 61L33 85L38 80L18 56Z";

function kitPattern(kit: KitDesign): ReactNode {
  const s = kit.secondary;
  switch (kit.pattern) {
    case "stripes":
      return <path d="M58 0H72V200H58ZM86 0H100V200H86ZM114 0H128V200H114ZM142 0H156V200H142Z" fill={s} />;
    case "pinstripes":
      return (
        <path
          d={Array.from({ length: 11 }, (_, i) => `M${52 + i * 10} 0H${53.6 + i * 10}V200H${52 + i * 10}Z`).join("")}
          fill={s}
        />
      );
    case "hoops":
      return <path d="M0 44H200V62H0ZM0 80H200V98H0ZM0 116H200V134H0ZM0 152H200V170H0Z" fill={s} />;
    case "halves":
      return <rect x="100" y="0" width="100" height="200" fill={s} />;
    case "quarters":
      return <path d="M100 0H200V100H100ZM0 100H100V200H0Z" fill={s} />;
    case "sash":
      return <path d="M50 30L72 22L152 176L130 190Z" fill={s} />;
    case "chevron":
      return <path d="M40 58L100 96L160 58V80L100 118L40 80Z" fill={s} />;
    case "band":
      return <rect x="0" y="82" width="200" height="26" fill={s} />;
    default:
      return null;
  }
}

function collarArt(kit: KitDesign): ReactNode {
  const inner = shadeHex(kit.body, -0.45);
  switch (kit.collar) {
    case "vneck":
      return (
        <g>
          <path d="M80 18L100 44L120 18Q100 26 80 18Z" fill={inner} />
          <path d="M80 18L100 44L120 18" fill="none" stroke={kit.trim} strokeWidth="6" strokeLinejoin="round" />
        </g>
      );
    case "polo":
      return (
        <g>
          <path d="M80 18Q100 28 120 18Q100 24 80 18Z" fill={inner} />
          <path d="M95 26H105V60H95Z" fill={kit.trim} />
          <circle cx="100" cy="38" r="1.8" fill={kit.body} />
          <circle cx="100" cy="50" r="1.8" fill={kit.body} />
          <path d="M77 14L100 26L90 42L72 24Z" fill={kit.trim} stroke={shadeHex(kit.trim, -0.3)} strokeWidth="1" />
          <path d="M123 14L100 26L110 42L128 24Z" fill={kit.trim} stroke={shadeHex(kit.trim, -0.3)} strokeWidth="1" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M80 18Q100 30 120 18Q100 24 80 18Z" fill={inner} />
          <path d="M79 17Q100 32 121 17" fill="none" stroke={kit.trim} strokeWidth="6" strokeLinecap="round" />
        </g>
      );
  }
}

interface ShirtProps {
  kit: KitDesign;
  badge?: BadgeDesign;
  clubName?: string;
  /** Show shorts and socks below the shirt. */
  full?: boolean;
  size?: number | string;
  className?: string;
  label?: string;
}

/** Front view of a shirt (optionally the full kit) with badge and sponsor. */
export function ClubShirt({ kit, badge, clubName, full = false, size = 160, className, label }: ShirtProps) {
  const uid = useId().replace(/:/g, "");
  const outline = shadeHex(kit.body, -0.4);
  const sponsorColour = kit.pattern === "band" ? readableOn(kit.secondary) : readableOn(kit.body);
  const height = full ? 330 : 200;
  return (
    <svg
      viewBox={`0 0 200 ${height}`}
      width={size}
      height={typeof size === "number" ? (size * height) / 200 : undefined}
      className={className}
      role="img"
      aria-label={label ?? "Club kit"}
    >
      <defs>
        <clipPath id={`${uid}-body`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`${uid}-fold`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${uid}-drop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>

      {/* Sleeves */}
      <path d={SLEEVE_L} fill={kit.sleeves} />
      <path d={SLEEVE_R} fill={kit.sleeves} />
      <path d={CUFF_L} fill={kit.trim} />
      <path d={CUFF_R} fill={kit.trim} />
      <path d={SLEEVE_L} fill={`url(#${uid}-drop)`} />
      <path d={SLEEVE_R} fill={`url(#${uid}-drop)`} />
      <path d={`${SLEEVE_L}${SLEEVE_R}`} fill="none" stroke={outline} strokeWidth="1.6" strokeLinejoin="round" />

      {/* Body */}
      <g clipPath={`url(#${uid}-body)`}>
        <rect x="0" y="0" width="200" height="200" fill={kit.body} />
        {kitPattern(kit)}
        <rect x="0" y="0" width="200" height="200" fill={`url(#${uid}-fold)`} />
        <path d="M70 120Q76 150 72 186M132 118Q124 150 130 186" fill="none" stroke="#000" strokeOpacity="0.07" strokeWidth="3" />
      </g>
      <path d="M52 70L148 70" stroke={outline} strokeOpacity="0.25" strokeWidth="1" />
      {collarArt(kit)}
      <path d={BODY} fill="none" stroke={outline} strokeWidth="1.8" strokeLinejoin="round" />

      {badge ? (
        <svg x="116" y="46" width="24" height="24" viewBox="0 0 100 100" overflow="visible">
          <ClubBadge design={badge} clubName={clubName} size={100} />
        </svg>
      ) : null}
      {kit.sponsor ? (
        <text
          x="100"
          y={kit.pattern === "band" ? 101 : 106}
          textAnchor="middle"
          fontSize={kit.sponsor.length > 10 ? 13 : 16}
          fontWeight="800"
          letterSpacing="1"
          fill={sponsorColour}
          className="font-display"
        >
          {kit.sponsor.toUpperCase()}
        </text>
      ) : null}

      {full ? (
        <g>
          {/* Shorts */}
          <path d="M54 204H146L152 262H108L100 246L92 262H48Z" fill={kit.shorts} stroke={shadeHex(kit.shorts, -0.4)} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M54 204H146L147 212H53Z" fill={kit.trim} />
          <path d="M146 214L151 258M54 214L49 258" stroke={kit.trim} strokeWidth="4" />
          <path d="M54 204H146L152 262H108L100 246L92 262H48Z" fill={`url(#${uid}-drop)`} />
          {/* Socks */}
          {[64, 112].map((x) => (
            <g key={x}>
              <path d={`M${x} 270H${x + 24}V318Q${x + 24} 326 ${x + 16} 326H${x}Z`} fill={kit.socks} stroke={shadeHex(kit.socks, -0.4)} strokeWidth="1.4" />
              <rect x={x} y="270" width="24" height="9" fill={kit.trim} />
            </g>
          ))}
        </g>
      ) : null}
    </svg>
  );
}