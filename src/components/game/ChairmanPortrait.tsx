import { useId } from "react";
import type { ChairmanAvatar, HairStyle } from "@/lib/game/chairmanProfile";

/* Shoulders-up portrait, drawn in a 200 × 220 box and framed to the head
   and shoulders (viewBox 160 × 192). Pure SVG, no assets. */

function shade(hex: string, amount: number): string {
  const value = hex.replace("#", "");
  const channel = (index: number) => {
    const raw = parseInt(value.slice(index, index + 2), 16);
    const next = amount < 0 ? raw * (1 + amount) : raw + (255 - raw) * amount;
    return Math.max(0, Math.min(255, Math.round(next))).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const LONG_BACK = new Set<HairStyle>(["long", "waves", "bob"]);

function HairBack({ style, colour }: { style: HairStyle; colour: string }) {
  const dark = shade(colour, -0.18);
  if (style === "long") {
    return <path d="M62 96 C56 60 80 44 100 44 C120 44 144 60 138 96 C142 130 150 160 148 196 L122 200 C126 170 124 150 118 140 L82 140 C76 150 74 170 78 200 L52 196 C50 160 58 130 62 96Z" fill={dark} />;
  }
  if (style === "waves") {
    return <path d="M60 96 C54 58 80 42 100 42 C120 42 146 58 140 96 C148 118 138 132 148 150 C156 168 142 180 150 198 L122 200 C128 176 120 156 118 142 L82 142 C80 156 72 176 78 200 L50 198 C58 180 44 168 52 150 C62 132 52 118 60 96Z" fill={dark} />;
  }
  if (style === "bob") {
    return <path d="M60 98 C56 60 80 46 100 46 C120 46 144 60 140 98 C142 122 146 140 140 152 L124 150 C122 140 120 136 118 134 L82 134 C80 136 78 140 76 150 L60 152 C54 140 58 122 60 98Z" fill={dark} />;
  }
  if (style === "ponytail") {
    return <path d="M126 80 C150 84 158 108 152 134 C148 152 140 160 136 168 C140 150 140 132 134 118 C130 104 126 96 118 88Z" fill={dark} />;
  }
  return null;
}

function HairFront({ style, colour }: { style: HairStyle; colour: string }) {
  const light = shade(colour, 0.14);
  switch (style) {
    case "bald":
      return <path d="M68 108 C66 98 68 92 71 88 L73 104Z M132 108 C134 98 132 92 129 88 L127 104Z" fill={colour} opacity={0.55} />;
    case "buzz":
      return <path d="M65 100 C62 66 82 54 100 54 C118 54 138 66 135 100 C131 86 124 76 100 74 C76 76 69 86 65 100Z" fill={colour} opacity={0.62} />;
    case "crop":
      return <path d="M64 100 C60 64 80 50 100 50 C120 50 140 64 136 100 C132 84 124 72 100 71 C76 72 68 84 64 100Z" fill={colour} />;
    case "sidePart":
      return (
        <g>
          <path d="M63 99 C58 62 82 47 104 48 C127 49 142 64 137 99 C134 82 126 70 112 68 C100 67 90 69 82 74 C74 79 67 88 63 99Z" fill={colour} />
          <path d="M86 52 C84 60 83 66 84 72" stroke={light} strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      );
    case "quiff":
      return (
        <g>
          <path d="M64 100 C60 66 78 54 96 52 C98 40 112 34 126 40 C122 44 124 48 130 54 C140 64 140 82 136 100 C132 84 124 72 100 71 C76 72 68 84 64 100Z" fill={colour} />
          <path d="M100 50 C106 42 116 40 122 42" stroke={light} strokeWidth={2} fill="none" strokeLinecap="round" />
        </g>
      );
    case "swept":
      return (
        <g>
          <path d="M63 100 C58 60 82 44 102 44 C124 44 142 60 137 100 C134 80 126 64 102 62 C80 64 68 78 63 100Z" fill={colour} />
          <path d="M80 56 C92 52 110 52 124 58 M78 64 C92 60 110 60 126 66" stroke={light} strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.7} />
        </g>
      );
    case "curly":
      return (
        <g fill={colour}>
          {[[70, 80, 12], [80, 64, 13], [96, 56, 14], [112, 57, 14], [126, 66, 13], [134, 82, 12], [66, 94, 9], [136, 96, 9], [88, 70, 10], [106, 68, 10], [120, 74, 10]].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      );
    case "receding":
      return (
        <g fill={colour}>
          <path d="M65 100 C62 82 66 70 74 64 C78 72 76 84 74 104Z" />
          <path d="M135 100 C138 82 134 70 126 64 C122 72 124 84 126 104Z" />
          <path d="M84 60 C94 56 106 56 116 60 C110 62 104 66 100 72 C96 66 90 62 84 60Z" opacity={0.85} />
        </g>
      );
    case "pixie":
      return <path d="M63 102 C56 62 82 46 102 46 C124 46 144 62 137 102 C134 86 128 76 118 72 C108 80 90 86 70 88 C67 92 65 96 63 102Z" fill={colour} />;
    case "bob":
      return <path d="M62 104 C56 62 82 46 100 46 C118 46 144 62 138 104 C136 84 128 72 116 68 C104 74 88 76 74 76 C68 84 64 92 62 104Z" fill={colour} />;
    case "long":
    case "waves":
      return (
        <g>
          <path d="M62 106 C56 62 82 44 100 44 C118 44 144 62 138 106 C134 86 124 70 102 66 L100 60 L98 66 C76 70 66 86 62 106Z" fill={colour} />
          <path d="M100 48 L100 64" stroke={shade(colour, -0.25)} strokeWidth={1.4} />
        </g>
      );
    case "ponytail":
      return <path d="M64 100 C60 62 82 48 100 48 C120 48 140 62 136 100 C132 82 122 70 100 68 C80 70 68 82 64 100Z" fill={colour} />;
    case "bun":
      return (
        <g fill={colour}>
          <circle cx={100} cy={40} r={15} />
          <path d="M64 100 C60 62 82 48 100 48 C120 48 140 62 136 100 C132 82 122 70 100 68 C80 70 68 82 64 100Z" />
        </g>
      );
  }
}

function FacialHairLayer({ avatar }: { avatar: ChairmanAvatar }) {
  const colour = avatar.hairColour;
  switch (avatar.facialHair) {
    case "none":
      return null;
    case "stubble":
      return <path d="M69 112 C70 136 84 150 100 151 C116 150 130 136 131 112 C126 128 114 134 100 134 C86 134 74 128 69 112Z M86 122 C92 119 108 119 114 122 C110 124 90 124 86 122Z" fill={colour} opacity={0.28} />;
    case "moustache":
      return <path d="M84 124 C90 118 97 119 100 121 C103 119 110 118 116 124 C110 126 104 125 100 124 C96 125 90 126 84 124Z" fill={colour} />;
    case "goatee":
      return (
        <g fill={colour}>
          <path d="M86 123 C91 118 97 119 100 121 C103 119 109 118 114 123 C109 125 104 124 100 124 C96 124 91 125 86 123Z" />
          <path d="M90 134 C94 138 106 138 110 134 C112 142 108 150 100 151 C92 150 88 142 90 134Z" />
        </g>
      );
    case "short":
      return <path d="M68 108 C68 136 84 152 100 153 C116 152 132 136 132 108 C128 124 120 132 112 134 C108 128 92 128 88 134 C80 132 72 124 68 108Z M85 123 C91 118 97 119 100 121 C103 119 109 118 115 123 C109 126 91 126 85 123Z" fill={colour} opacity={0.92} />;
    case "full":
      return <path d="M66 104 C64 140 82 164 100 165 C118 164 136 140 134 104 C130 124 122 132 112 134 C108 128 92 128 88 134 C78 132 70 124 66 104Z M84 123 C90 117 97 118 100 121 C103 118 110 117 116 123 C110 127 90 127 84 123Z" fill={colour} />;
  }
}

function OutfitLayer({ avatar, skin }: { avatar: ChairmanAvatar; skin: string }) {
  const main = avatar.outfitColour;
  const dark = shade(main, -0.28);
  const light = shade(main, 0.12);
  const accent = avatar.accentColour;
  const torso = "M18 220 C20 190 48 172 84 168 L116 168 C152 172 180 190 182 220Z";
  switch (avatar.outfit) {
    case "suit":
      return (
        <g>
          <path d={torso} fill={main} />
          <path d="M84 168 L100 206 L116 168Z" fill="#f4f4f1" />
          <path d="M96 176 L104 176 L107 206 L100 216 L93 206Z" fill={accent} />
          <path d="M95 170 L100 178 L105 170Z" fill={shade(accent, -0.2)} />
          <path d="M84 168 L74 176 L94 210 L100 206Z M116 168 L126 176 L106 210 L100 206Z" fill={dark} />
          <path d="M84 168 L90 180 L100 176 Z M116 168 L110 180 L100 176Z" fill="#ffffff" />
        </g>
      );
    case "openCollar":
      return (
        <g>
          <path d={torso} fill={main} />
          <path d="M84 168 L100 204 L116 168Z" fill="#dfe8f2" />
          <path d="M88 168 L100 186 L112 168Z" fill={skin} />
          <path d="M84 166 L94 186 L100 172Z M116 166 L106 186 L100 172Z" fill="#ffffff" />
          <path d="M84 168 L72 178 L92 212 L100 204Z M116 168 L128 178 L108 212 L100 204Z" fill={dark} />
        </g>
      );
    case "overcoat":
      return (
        <g>
          <path d={torso} fill={main} />
          <path d="M84 168 L66 180 L88 220 L100 212Z M116 168 L134 180 L112 220 L100 212Z" fill={dark} />
          <path d="M80 164 C90 174 110 174 120 164 L124 176 C112 186 88 186 76 176Z" fill={accent} />
          <path d="M104 178 L116 178 L118 214 L106 214Z" fill={accent} />
          <path d="M106 206 L116 206 M106 210 L117 210" stroke={shade(accent, -0.3)} strokeWidth={1.2} />
        </g>
      );
    case "quarterZip":
      return (
        <g>
          <path d={torso} fill={main} />
          <path d="M82 162 C90 170 110 170 118 162 L120 174 C110 180 90 180 80 174Z" fill={light} />
          <path d="M100 170 L100 204" stroke={accent} strokeWidth={2.6} />
          <rect x={97} y={200} width={6} height={8} rx={1.5} fill={accent} />
          <path d="M130 190 l8 0 l0 9 l-4 4 l-4 -4Z" fill={accent} />
          <path d="M40 206 C60 196 80 194 90 196" stroke={accent} strokeWidth={3} fill="none" opacity={0.9} />
        </g>
      );
    case "knit":
      return (
        <g>
          <path d={torso} fill={main} />
          <path d="M80 166 C90 178 110 178 120 166 L122 172 C112 184 88 184 78 172Z" fill={dark} />
          <path d="M88 168 L96 176 L100 170 L104 176 L112 168 C106 172 94 172 88 168Z" fill="#f2f2ee" />
          {[40, 52, 148, 160].map((x) => (
            <path key={x} d={`M${x} 200 l0 20`} stroke={dark} strokeWidth={1} opacity={0.4} />
          ))}
        </g>
      );
  }
}

function Eyewear({ kind }: { kind: ChairmanAvatar["eyewear"] }) {
  if (kind === "none") return null;
  const frame = "#1b1c1f";
  if (kind === "round") {
    return (
      <g stroke={frame} strokeWidth={2} fill="rgba(255,255,255,.12)">
        <circle cx={87} cy={103} r={9} />
        <circle cx={113} cy={103} r={9} />
        <path d="M96 103 C98 101 102 101 104 103 M78 102 L68 100 M122 102 L132 100" fill="none" />
      </g>
    );
  }
  return (
    <g stroke={frame} strokeWidth={2} fill="rgba(255,255,255,.12)">
      <rect x={76} y={96} width={21} height={14} rx={3} />
      <rect x={103} y={96} width={21} height={14} rx={3} />
      <path d="M97 102 L103 102 M76 101 L67 99 M124 101 L133 99" fill="none" />
    </g>
  );
}

export function ChairmanPortrait({
  avatar,
  size = 96,
  framed = true,
  className,
  title,
}: {
  avatar: ChairmanAvatar;
  size?: number;
  framed?: boolean;
  className?: string;
  title?: string;
}) {
  const id = useId().replace(/:/g, "");
  const skin = avatar.skin;
  const skinShadow = shade(skin, -0.14);
  const female = avatar.sex === "female";
  const face = female
    ? "M67 100 C67 70 82 58 100 58 C118 58 133 70 133 100 C133 126 120 146 100 149 C80 146 67 126 67 100Z"
    : "M66 100 C66 68 82 57 100 57 C118 57 134 68 134 100 C134 130 122 148 100 151 C78 148 66 130 66 100Z";
  const brow = avatar.hair === "bald" ? shade(skin, -0.45) : shade(avatar.hairColour, -0.1);
  return (
    <svg
      viewBox="20 28 160 192"
      width={size}
      height={(size * 192) / 160}
      className={className}
      role="img"
      aria-label={title ?? "Chairman portrait"}
    >
      <defs>
        <radialGradient id={`bg-${id}`} cx="50%" cy="35%" r="75%">
          <stop offset="0" stopColor="#3f6f73" />
          <stop offset="1" stopColor="#15333a" />
        </radialGradient>
        <clipPath id={`clip-${id}`}>
          <rect x="20" y="28" width="160" height="192" rx={framed ? 24 : 0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        {framed && <rect width="200" height="220" fill={`url(#bg-${id})`} />}
        <HairBack style={avatar.hair} colour={avatar.hairColour} />
        <path d="M85 136 L85 172 Q100 182 115 172 L115 136Z" fill={skinShadow} />
        <OutfitLayer avatar={avatar} skin={skin} />
        <ellipse cx={66} cy={106} rx={6} ry={10} fill={skinShadow} />
        <ellipse cx={134} cy={106} rx={6} ry={10} fill={skinShadow} />
        <path d={face} fill={skin} />
        <path d="M78 140 C88 150 112 150 122 140 C114 148 86 148 78 140Z" fill={skinShadow} opacity={0.5} />
        <HairFront style={avatar.hair} colour={avatar.hairColour} />
        <path d="M79 93 C84 90 90 90 94 92 M106 92 C110 90 116 90 121 93" stroke={brow} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        <ellipse cx={87} cy={103} rx={3.4} ry={3.8} fill="#22201f" />
        <ellipse cx={113} cy={103} rx={3.4} ry={3.8} fill="#22201f" />
        <circle cx={88.2} cy={101.8} r={1} fill="#ffffff" />
        <circle cx={114.2} cy={101.8} r={1} fill="#ffffff" />
        {female && <path d="M82 99 L84 97 M118 99 L116 97" stroke="#22201f" strokeWidth={1.4} strokeLinecap="round" />}
        <path d="M100 104 C98 112 96 116 99 118 C101 119 103 118 104 117" stroke={shade(skin, -0.3)} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <FacialHairLayer avatar={avatar} />
        <path d="M90 129 C95 133 105 133 110 129" stroke={female ? "#a8545a" : shade(skin, -0.42)} strokeWidth={female ? 3 : 2.4} fill="none" strokeLinecap="round" />
        <Eyewear kind={avatar.eyewear} />
        {LONG_BACK.has(avatar.hair) && (
          <path d="M66 104 C64 116 66 128 70 136" stroke={shade(avatar.hairColour, -0.1)} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.9} />
        )}
      </g>
    </svg>
  );
}
