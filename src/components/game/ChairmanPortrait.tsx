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

const LONG_BACK = new Set<HairStyle>(["long", "waves", "bob", "lob", "shag"]);


/** New styles are additive: existing hairstyle SVG paths and face seeds stay unchanged. */
function Coils({ d, uid, colour, count = 140 }: { d: string; uid: string; colour: string; count?: number }) {
  const id = "coils-" + uid;
  return <g>
    <defs><clipPath id={id}><path d={d} /></clipPath></defs>
    <path d={d} fill={colour} />
    <g clipPath={"url(#" + id + ")"}>
      {Array.from({ length: count }, (_, i) => {
        const x = 52 + ((i * 73) % 97) * 0.99;
        const y = 30 + ((i * 41) % 89) * 0.85;
        return <circle key={i} cx={x} cy={y} r={i % 5 === 0 ? 1.25 : 1.7}
          fill={i % 5 === 0 ? shade(colour, 0.22) : shade(colour, -0.38)} opacity={0.55} />;
      })}
    </g>
  </g>;
}
function FadedSides({ colour, uid }: { colour: string; uid: string }) {
  const id = "fade-" + uid;
  return <g>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor={colour} stopOpacity={0.65} />
      <stop offset="0.55" stopColor={colour} stopOpacity={0.24} />
      <stop offset="1" stopColor={colour} stopOpacity={0} />
    </linearGradient></defs>
    <path d="M65 104 C62 80 66 70 74 64 L126 64 C134 70 138 80 135 104 C131 90 126 82 100 80 C74 82 69 90 65 104Z"
      fill={"url(#" + id + ")"} />
  </g>;
}
const AFRO_BACK = "M48 92 C40 50 70 26 100 26 C130 26 160 50 152 92 C156 118 148 136 136 144 L64 144 C52 136 44 118 48 92Z";
function NewHairBack({ style, colour, uid }: { style: HairStyle; colour: string; uid: string }) {
  const dark = shade(colour, -0.18);
  if (style === "afroLong") return <Coils d={AFRO_BACK} uid={uid+"-back"} colour={dark} count={260} />;
  if (style === "mullet") return <path d="M66 100 C62 118 64 134 70 146 C76 152 84 150 86 142 L114 142 C116 150 124 152 130 146 C136 134 138 118 134 100Z" fill={dark} />;
  if (style === "manBun") return <ellipse cx={100} cy={40} rx={12} ry={10} fill={dark} />;
  if (style === "locs") return <g fill="none" stroke={dark} strokeLinecap="round">
    {[[70,70,58,150],[76,66,64,160],[82,62,72,146],[124,70,142,150],[118,66,136,160],[112,62,128,146],[66,84,54,170],[134,84,146,170]].map(([x,y,x2,y2],i) =>
      <path key={i} d={"M"+x+" "+y+" Q"+(x-4)+" "+(y+36)+" "+x2+" "+y2} strokeWidth={7} strokeDasharray="3 1" />)}
  </g>;
  return null;
}
function NewHairFront({ style, colour, uid }: { style: HairStyle; colour: string; uid: string }) {
  const light = shade(colour, 0.14);
  const dark = shade(colour, -0.3);
  const standard = "M64 100 C60 64 80 50 100 50 C120 50 140 64 136 100 C132 84 124 72 100 71 C76 72 68 84 64 100Z";
  switch (style) {
    case "fade": return <g><FadedSides colour={colour} uid={uid} /><path d="M71 80 C68 58 84 48 100 48 C116 48 132 58 129 80 C122 73 112 70 100 70 C88 70 78 73 71 80Z" fill={colour} />
      <path d="M80 58 C90 54 110 54 120 58" stroke={light} strokeWidth={1.4} fill="none" /></g>;
    case "textured": return <g><path d="M64 98 C60 62 82 46 100 46 C120 46 140 62 136 98 C132 86 128 80 124 78 L119 85 L113 77 L106 84 L99 76 L92 83 L86 76 L80 82 C72 84 66 90 64 98Z" fill={colour} />
      <path d="M78 58 L84 66 M92 52 L96 62 M108 52 L106 62 M120 58 L116 66" stroke={light} strokeWidth={1.5} opacity={0.6} /></g>;
    case "slickBack": return <g><path d="M64 98 C60 58 84 42 102 42 C122 42 142 58 136 98 C133 78 126 64 102 60 C82 62 70 76 64 98Z" fill={colour} />
      <path d="M76 60 C90 50 112 48 128 56 M74 70 C90 58 114 56 132 66 M72 80 C88 66 112 64 134 76" stroke={light} strokeWidth={1.8} fill="none" opacity={0.55} /></g>;
    case "curtains": return <g><path d="M62 104 C56 60 82 44 100 46 C118 44 144 60 138 104 C134 90 128 80 116 74 C108 72 102 70 100 62 C98 70 92 72 84 74 C72 80 66 90 62 104Z" fill={colour} /><path d="M100 48 L100 62" stroke={dark} strokeWidth={1.4} /></g>;
    case "spiky": return <g fill={colour}><path d={standard} /><path d="M70 70 L72 50 L80 62 L84 42 L92 58 L98 38 L104 56 L112 40 L116 58 L124 46 L126 62 L134 54 L132 72Z" /></g>;
    case "mullet": return <path d={standard} fill={colour} />;
    case "manBun": return <g><path d="M64 98 C60 60 84 46 100 46 C118 46 140 60 136 98 C132 80 124 68 100 66 C78 68 68 80 64 98Z" fill={colour} />
      <path d="M80 56 C90 50 110 50 120 56" stroke={light} strokeWidth={1.4} fill="none" opacity={0.6} /></g>;
    case "waves360": return <g><path d="M65 100 C61 64 82 52 100 52 C118 52 139 64 135 100 C131 86 124 76 100 74 C76 76 69 86 65 100Z" fill={colour} />
      <g stroke={light} strokeWidth={1.2} fill="none" opacity={0.5}><path d="M78 62 C88 56 112 56 122 62 M72 70 C86 62 114 62 128 70 M70 80 C84 72 116 72 130 80 M86 58 C94 55 106 55 114 58" /></g></g>;
    case "afroShort": return <Coils d="M60 100 C52 58 76 38 100 38 C124 38 148 58 140 100 C136 84 128 74 100 72 C72 74 64 84 60 100Z" uid={uid} colour={colour} count={170} />;
    case "afroFade": return <g><FadedSides colour={colour} uid={uid} /><Coils d="M69 84 C64 50 82 32 100 32 C118 32 136 50 131 84 C124 76 112 72 100 72 C88 72 76 76 69 84Z" uid={uid} colour={colour} count={140} /></g>;
    case "highTop": return <g><FadedSides colour={colour} uid={uid} /><Coils d="M68 90 C66 72 67 52 72 42 C74 38 78 37 82 37 L118 37 C122 37 126 38 128 42 C133 52 134 72 132 90 C124 80 114 76 100 76 C86 76 76 80 68 90Z" uid={uid} colour={colour} count={150} /></g>;
    case "twists": return <g><path d={standard} fill={dark} />
      {Array.from({length:30},(_,i)=>{const x=70+(i%8)*8.5;const y=52+Math.floor(i/8)*10;return <ellipse key={i} cx={x} cy={y} rx={3.2} ry={5.2} fill={light} stroke={dark} strokeWidth={1} transform={"rotate("+((i%2?1:-1)*12)+" "+x+" "+y+")"} />;})}</g>;
    case "cornrows": return <g><path d="M65 100 C61 64 82 52 100 52 C118 52 139 64 135 100 C131 86 124 76 100 74 C76 76 69 86 65 100Z" fill={dark} />
      {[74,83,92,100,108,117,126].map((x,i)=><path key={i} d={"M"+x+" 76 Q"+x+" 56 "+(100+(x-100)*0.55)+" 52"} stroke={colour} strokeWidth={5} strokeLinecap="round" strokeDasharray="3 1.6" fill="none" />)}</g>;
    case "afroLong": return <Coils d="M60 102 C52 60 76 40 100 40 C124 40 148 60 140 102 C136 86 128 76 100 74 C72 76 64 86 60 102Z" uid={uid} colour={colour} count={160} />;
    case "locs": return <g><path d="M63 100 C58 62 82 46 100 46 C118 46 142 62 137 100 C133 84 124 74 100 72 C76 74 67 84 63 100Z" fill={colour} />
      {[74,84,94,106,116,126].map((x,i)=><path key={i} d={"M"+x+" 52 Q"+(x-2)+" 65 "+x+" 78"} stroke={dark} strokeWidth={1.2} fill="none" opacity={0.55} />)}
      <path d="M66 86 C62 100 62 112 64 120 M134 86 C138 100 138 112 136 120" stroke={colour} strokeWidth={6} strokeLinecap="round" fill="none" /></g>;
    default: return null;
  }
}
function ExtraHairBack({ style, colour }: { style: HairStyle; colour: string }) {
  const dark = shade(colour, -0.2);
  if (style === "shag") return <path d="M60 96 C54 60 80 42 100 42 C120 42 146 60 140 96 C144 116 142 134 146 150 L132 146 L134 158 L120 150 L82 150 L68 158 L68 146 L54 150 C58 134 56 116 60 96Z" fill={dark} />;
  if (style === "lob") return <path d="M60 98 C56 60 80 44 100 44 C120 44 144 60 140 98 C142 128 146 152 142 166 L122 162 C120 150 118 142 116 138 L84 138 C82 142 80 150 78 162 L58 166 C54 152 58 128 60 98Z" fill={dark} />;
  if (style === "boxBraids") return <g stroke={dark} strokeLinecap="round" fill="none">
    {[64,70,76,82,118,124,130,136].map((x,i)=><path key={i} d={"M"+x+" 80 C"+(x+(x<100?-6:6))+" 120 "+(x+(x<100?-4:4))+" 160 "+(x+(x<100?-8:8))+" 200"} strokeWidth={5.4} strokeDasharray="4 1.4" />)}
  </g>;
  if (style === "afroPuffs") return <g>
    <Coils d="M48 58 C48 40 60 30 74 32 C88 34 92 48 88 60 C84 72 70 76 60 72 C52 68 48 64 48 58Z" uid="puff-l" colour={dark} count={70} />
    <Coils d="M152 58 C152 40 140 30 126 32 C112 34 108 48 112 60 C116 72 130 76 140 72 C148 68 152 64 152 58Z" uid="puff-r" colour={dark} count={70} />
  </g>;
  return null;
}
function ExtraHairFront({ style, colour, uid }: { style: HairStyle; colour: string; uid: string }) {
  const light = shade(colour, 0.2), dark = shade(colour, -0.3);
  switch (style) {
    case "frenchCrop": return <g><FadedSides colour={colour} uid={uid} />
      <path d="M68 86 C64 60 82 48 100 48 C118 48 136 60 132 86 C130 80 126 78 120 78 L80 78 C74 78 70 80 68 86Z" fill={colour} />
      <path d="M78 78 L80 72 M86 78 L88 70 M94 78 L95 70 M102 78 L102 70 M110 78 L109 70 M118 78 L116 72" stroke={dark} strokeWidth={1.2} opacity={0.6} /></g>;
    case "undercut": return <g><path d="M66 100 C63 80 66 70 72 66 L128 66 C134 70 137 80 134 100 C130 90 124 84 100 82 C76 84 70 90 66 100Z" fill={colour} opacity={0.35} />
      <path d="M72 70 C70 50 86 38 104 38 C124 38 138 50 134 68 C120 62 106 64 94 72 C86 76 78 76 72 70Z" fill={colour} />
      <path d="M84 50 C96 44 114 44 126 52 M80 60 C94 52 116 52 130 62" stroke={light} strokeWidth={1.4} fill="none" opacity={0.6} /></g>;
    case "pompadour": return <g><FadedSides colour={colour} uid={uid} />
      <path d="M68 90 C64 64 72 48 84 40 C96 30 120 30 130 42 C138 52 136 70 132 90 C128 78 120 70 100 69 C82 70 72 78 68 90Z" fill={colour} />
      <path d="M84 46 C96 36 116 36 126 46 M80 56 C94 44 118 44 130 56" stroke={light} strokeWidth={1.8} fill="none" opacity={0.6} /></g>;
    case "shag": return <g><path d="M60 104 C54 60 80 42 100 42 C120 42 146 60 140 104 C136 92 132 84 126 80 L122 88 L116 78 L110 86 L104 76 L98 86 L92 76 L86 86 L80 78 L74 88 C68 92 62 98 60 104Z" fill={colour} />
      <path d="M78 54 L84 66 M96 48 L98 60 M112 50 L110 62 M124 58 L118 68" stroke={light} strokeWidth={1.4} opacity={0.55} /></g>;
    case "lob": return <g><path d="M60 106 C54 62 82 44 100 44 C118 44 146 62 140 106 C136 86 126 70 104 66 L100 58 C94 68 76 74 68 86 C64 92 62 98 60 106Z" fill={colour} />
      <path d="M100 46 C98 52 99 56 100 58" stroke={dark} strokeWidth={1.2} fill="none" /></g>;
    case "boxBraids": return <g><path d="M63 100 C58 62 82 46 100 46 C118 46 142 62 137 100 C133 84 124 74 100 72 C76 74 67 84 63 100Z" fill={dark} />
      {[70,78,86,94,102,110,118,126].map((x,i)=><path key={i} d={"M"+x+" 54 Q"+(x+(x<100?-4:4))+" 66 "+(x+(x<100?-6:6))+" 78"} stroke={colour} strokeWidth={4} strokeLinecap="round" strokeDasharray="3 1.2" fill="none" />)}</g>;
    case "afroPuffs": return <g><path d="M65 100 C61 64 82 52 100 52 C118 52 139 64 135 100 C131 86 124 76 100 74 C76 76 69 86 65 100Z" fill={colour} />
      <path d="M100 52 L100 72" stroke={dark} strokeWidth={1.2} /><path d="M76 62 C86 58 94 57 100 58 M124 62 C114 58 106 57 100 58" stroke={light} strokeWidth={1} opacity={0.5} fill="none" /></g>;
    default: return null;
  }
}
const EXTRA_HAIR = new Set<HairStyle>(["frenchCrop","undercut","pompadour","shag","lob","boxBraids","afroPuffs"]);
/** Soft hairline shadow and sheen applied to solid styles for depth. */
const NO_SHEEN = new Set<HairStyle>(["bald","buzz","afroShort","afroFade","highTop","afroLong","twists","cornrows","boxBraids","curly","receding"]);
function HairSheen({ style, colour }: { style: HairStyle; colour: string }) {
  if (NO_SHEEN.has(style)) return null;
  return <g pointerEvents="none" fill="none" strokeLinecap="round">
    <path d="M82 58 C92 53 108 53 118 58" stroke={shade(colour, 0.38)} strokeWidth={3} opacity={0.22} />
    <path d="M88 55 C96 52 104 52 110 54" stroke="#fff" strokeWidth={1.2} opacity={0.18} />
  </g>;
}
const NEW_HAIR = new Set<HairStyle>(["fade","textured","slickBack","curtains","spiky","mullet","manBun","waves360","afroShort","afroFade","highTop","twists","cornrows","afroLong","locs"]);
function HairBack({ style, colour, uid }: { style: HairStyle; colour: string; uid: string }) {
  if (EXTRA_HAIR.has(style)) return <ExtraHairBack style={style} colour={colour} />;
  if (NEW_HAIR.has(style)) return <NewHairBack style={style} colour={colour} uid={uid} />;
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

function HairFront(props: { style: HairStyle; colour: string; uid: string }) {
  return <g><HairFrontShape {...props} /><HairSheen style={props.style} colour={props.colour} /></g>;
}
function HairFrontShape({ style, colour, uid }: { style: HairStyle; colour: string; uid: string }) {
  if (EXTRA_HAIR.has(style)) return <ExtraHairFront style={style} colour={colour} uid={uid} />;
  if (NEW_HAIR.has(style)) return <NewHairFront style={style} colour={colour} uid={uid} />;
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
    case "designer":
      return <path d="M68 110 C69 138 84 152 100 153 C116 152 131 138 132 110 C127 128 114 134 100 134 C86 134 73 128 68 110Z M84 123 C91 118 109 118 116 123 C110 126 90 126 84 123Z" fill={colour} opacity={0.5} />;
    case "horseshoe":
      return <path d="M84 124 C90 118 97 119 100 121 C103 119 110 118 116 124 L118 146 L113 146 L111 127 C106 125 94 125 89 127 L87 146 L82 146Z" fill={colour} />;
    case "vandyke":
      return <g fill={colour}><path d="M84 124 C88 118 96 118 100 121 C104 118 112 118 116 124 C110 122 104 124 100 125 C96 124 90 122 84 124Z" /><path d="M94 136 C97 138 103 138 106 136 C106 146 103 154 100 156 C97 154 94 146 94 136Z" /></g>;
    case "chinstrap":
      return <path d="M67 104 C66 136 82 154 100 155 C118 154 134 136 133 104 L129 106 C128 132 116 147 100 148 C84 147 72 132 71 106Z" fill={colour} />;
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


const TORSO = "M18 220 C20 190 48 172 84 168 L116 168 C152 172 180 190 182 220Z";
function ClothShading({ uid, colour }: { uid: string; colour: string }) {
  const id = "cloth-" + uid;
  return <g pointerEvents="none">
    <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#000" stopOpacity={0.28} />
      <stop offset="0.22" stopColor="#000" stopOpacity={0.04} />
      <stop offset="0.5" stopColor="#fff" stopOpacity={0.06} />
      <stop offset="0.78" stopColor="#000" stopOpacity={0.04} />
      <stop offset="1" stopColor="#000" stopOpacity={0.3} />
    </linearGradient></defs>
    <path d={TORSO} fill={"url(#"+id+")"} />
    <path d="M50 182 C44 196 40 208 38 220 M150 182 C156 196 160 208 162 220"
      stroke={shade(colour,-0.35)} strokeWidth={1.4} fill="none" opacity={0.6} />
  </g>;
}
function NewOutfit({avatar, uid}: {avatar:ChairmanAvatar;uid:string}) {
  const main=avatar.outfitColour, dark=shade(main,-0.3), light=shade(main,0.14), accent=avatar.accentColour;
  const trim=shade(main,main === "#e9e3d4" ? -0.35 : 0.3);
  const base=<><path d={TORSO} fill={main}/><ClothShading uid={uid} colour={main}/></>;
  const tie=<><path d="M95 171 L100 179 L105 171Z" fill={shade(accent,-0.2)}/><path d="M96 178 L104 178 L107 206 L100 216 L93 206Z" fill={accent}/></>;
  const crest=<><path d="M130 190 l9 0 l0 8 l-4.5 6 l-4.5 -6Z" fill={accent}/><path d="M132 193 l5 0" stroke={trim} strokeWidth={1}/></>;
  switch(avatar.outfit){
    case "waistcoat": return <g>{base}<path d="M84 168 L100 206 L116 168Z" fill="#f4f4f1"/>
      <path d="M84 166 L94 186 L100 172Z M116 166 L106 186 L100 172Z" fill="#fff"/>{tie}
      <path d="M84 176 L96 206 L100 220 L68 220 L74 186Z M116 176 L104 206 L100 220 L132 220 L126 186Z" fill={light}/>
      {[204,212].map(y=><circle key={y} cx={100} cy={y} r={1.5} fill={dark}/>)}
      <path d="M84 168 L70 178 L76 186 L70 192 L80 220 L86 220Z M116 168 L130 178 L124 186 L130 192 L120 220 L114 220Z" fill={dark}/></g>;
    case "turtleneck": return <g>{base}<path d="M82 160 C90 166 110 166 118 160 L120 176 C110 182 90 182 80 176Z" fill={accent}/>
      <path d="M82 166 C92 172 108 172 118 166 M81 171 C92 177 108 177 119 171" stroke={shade(accent,-0.25)} strokeWidth={1} fill="none"/>
      <path d="M86 176 L100 180 L114 176 L110 220 L90 220Z" fill={accent}/>
      <path d="M84 170 L70 180 L76 188 L70 194 L88 220 L92 220 L90 190Z M116 170 L130 180 L124 188 L130 194 L112 220 L108 220 L110 190Z" fill={dark}/></g>;
    case "shirtTie": return <g><path d={TORSO} fill="#eef2f6"/><ClothShading uid={uid} colour="#eef2f6"/>
      <path d="M84 166 L94 186 L100 172Z M116 166 L106 186 L100 172Z" fill="#fff" stroke="#c9d3de" strokeWidth={0.8}/>{tie}
      <path d="M100 179 L100 220" stroke="#c9d3de" strokeWidth={0.8}/>
      <rect x={126} y={192} width={12} height={12} stroke="#c9d3de" fill="none"/>
      <path d="M78 172 L84 220 M122 172 L116 220" stroke={main} strokeWidth={4.5}/></g>;
    case "puffer": return <g><path d="M16 220 C18 188 46 170 82 164 L118 164 C154 170 182 188 184 220Z" fill={main}/>
      <ClothShading uid={uid} colour={main}/>
      {[182,194,206].map(y=><path key={y} d={"M34 "+(y+2)+" C70 "+(y-4)+" 130 "+(y-4)+" 166 "+(y+2)} stroke={dark} strokeWidth={1.6} fill="none"/>)}
      <path d="M80 154 C90 160 110 160 120 154 L122 172 C112 178 88 178 78 172Z" fill={light}/>
      <path d="M100 160 L100 220" stroke={dark} strokeWidth={2}/><rect x={98} y={166} width={4} height={7} rx={1.4} fill={trim}/>{crest}</g>;
    case "tracksuit": return <g>{base}
      <path d="M22 206 C30 190 50 176 76 170 L80 178 C58 184 40 196 30 212Z M178 206 C170 190 150 176 124 170 L120 178 C142 184 160 196 170 212Z" fill={accent}/>
      <path d="M26 214 C36 198 54 186 78 180 M174 214 C164 198 146 186 122 180" stroke={trim} strokeWidth={1.4} fill="none"/>
      <path d="M80 158 C90 166 110 166 120 158 L121 170 C112 176 88 176 79 170Z" fill={accent}/>
      <path d="M100 164 L100 220" stroke={trim} strokeWidth={1.8}/><rect x={98} y={170} width={4} height={7} rx={1.4} fill={trim}/>{crest}</g>;
    case "polo": return <g>{base}
      <path d="M82 164 L96 184 L100 172Z M118 164 L104 184 L100 172Z" fill={light}/>
      <path d="M84 166 L96 183 M116 166 L104 183" stroke={accent} strokeWidth={1.6}/>
      <path d="M96 172 L104 172 L104 198 L96 198Z" fill={dark}/>
      {[178,186,194].map(y=><circle key={y} cx={100} cy={y} r={1.4} fill={trim}/>)}
      {crest}<path d="M36 214 C44 206 50 200 56 196 M164 214 C156 206 150 200 144 196" stroke={accent} strokeWidth={2.4} fill="none"/></g>;
    case "doubleBreasted": return <g>{base}<path d="M86 168 L100 196 L114 168Z" fill="#f4f4f1"/>{tie}
      <path d="M84 168 L70 178 L78 188 L72 194 L100 220 L104 206Z" fill={dark}/>
      <path d="M116 168 L130 178 L122 188 L128 194 L112 212 L104 206Z" fill={dark}/>
      {[[90,204],[110,204],[92,214],[108,214]].map(([x,y])=><circle key={x+"-"+y} cx={x} cy={y} r={1.8} fill={trim}/>)}
      <path d="M136 194 l9 -2 l1 4 l-9 2Z" fill={accent}/></g>;
    case "trench": return <g><path d="M14 220 C16 188 46 170 82 166 L118 166 C154 170 184 188 186 220Z" fill={main}/><ClothShading uid={uid} colour={main}/>
      <path d="M86 168 L100 194 L114 168Z" fill="#eef2f6"/>{tie}
      <path d="M82 164 L64 176 L74 186 L66 194 L94 220 L100 214Z M118 164 L136 176 L126 186 L134 194 L106 220 L100 214Z" fill={dark}/>
      <path d="M36 206 L80 206 M120 206 L164 206" stroke={dark} strokeWidth={4}/>
      <rect x={96} y={203} width={8} height={6} rx={1} fill="none" stroke={trim} strokeWidth={1.2}/>
      <path d="M40 190 L60 186 M160 190 L140 186" stroke={dark} strokeWidth={3}/></g>;
    case "bomber": return <g>{base}
      <path d="M80 160 C90 168 110 168 120 160 L122 172 C112 178 88 178 78 172Z" fill={accent}/>
      <path d="M80 163 C90 171 110 171 120 163" stroke={trim} strokeWidth={1.2} fill="none"/>
      <path d="M90 174 L100 220 L110 174Z" fill="#1d1f22"/>
      <path d="M100 172 L100 220" stroke={trim} strokeWidth={1.6}/><rect x={98} y={176} width={4} height={7} rx={1.4} fill={trim}/>
      <path d="M30 214 L170 214" stroke={accent} strokeWidth={3}/>
      <path d="M48 192 L60 198 L58 206" stroke={dark} strokeWidth={1.4} fill="none"/>{crest}</g>;
    case "hoodie": return <g>{base}
      <path d="M72 166 C76 150 124 150 128 166 C120 176 110 180 100 180 C90 180 80 176 72 166Z" fill={dark}/>
      <path d="M80 168 C88 176 112 176 120 168" stroke={light} strokeWidth={1.4} fill="none"/>
      <path d="M94 178 L92 200 M106 178 L108 200" stroke={trim} strokeWidth={1.6} strokeLinecap="round"/>
      <circle cx={92} cy={201} r={1.6} fill={trim}/><circle cx={108} cy={201} r={1.6} fill={trim}/>
      <path d="M74 214 C88 206 112 206 126 214" stroke={dark} strokeWidth={1.6} fill="none"/>{crest}</g>;
    case "gilet": return <g><path d={TORSO} fill={accent}/><ClothShading uid={uid+"-sleeve"} colour={accent}/>
      <path d="M58 220 C58 196 66 180 82 168 L118 168 C134 180 142 196 142 220Z" fill={main}/>
      {[186,198,210].map(y=><path key={y} d={"M62 "+y+" C80 "+(y-4)+" 120 "+(y-4)+" 138 "+y} stroke={dark} strokeWidth={1.4} fill="none"/>)}
      <path d="M82 160 C90 168 110 168 118 160 L120 172 C110 178 90 178 80 172Z" fill={light}/>
      <path d="M100 166 L100 220" stroke={dark} strokeWidth={2}/>{crest}</g>;
    case "blazerTee": return <g>{base}<path d="M84 168 L100 220 L116 168Z" fill={accent}/>
      <path d="M86 168 C92 176 108 176 114 168" stroke={shade(accent,-0.25)} strokeWidth={1.6} fill="none"/>
      <path d="M84 168 L72 178 L78 186 L72 192 L96 220 L100 220Z M116 168 L128 178 L122 186 L128 192 L104 220 L100 220Z" fill={dark}/>
      <path d="M132 192 l10 -2" stroke="#f4f4f1" strokeWidth={2}/></g>;
    default: return null;
  }
}
const NEW_OUTFITS=new Set<ChairmanAvatar["outfit"]>(["waistcoat","turtleneck","shirtTie","puffer","tracksuit","polo","doubleBreasted","trench","bomber","hoodie","gilet","blazerTee"]);
function OutfitLayer({ avatar, skin, uid }: { avatar: ChairmanAvatar; skin: string; uid: string }) {
  if (NEW_OUTFITS.has(avatar.outfit)) return <NewOutfit avatar={avatar} uid={uid} />;
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


/** Fabric details for the five original outfits; existing garment silhouettes
 * remain stable while gaining shoulder shading, seams and trim. */
function OriginalOutfitDetails({avatar,uid}: {avatar:ChairmanAvatar;uid:string}) {
  if (NEW_OUTFITS.has(avatar.outfit)) return null;
  const dark=shade(avatar.outfitColour,-0.38), light=shade(avatar.outfitColour,0.28), accent=avatar.accentColour;
  return <g>
    <ClothShading uid={uid+"-original"} colour={avatar.outfitColour}/>
    {avatar.outfit === "suit" && <g>
      <path d="M78 186 L74 190 M122 186 L126 190" stroke={dark} strokeWidth={1.2}/>
      <path d="M132 196 l10 -3 l1 5 l-10 3Z" fill={accent} opacity={0.9}/>
      <circle cx={100} cy={216} r={1.8} fill={dark}/>
    </g>}
    {avatar.outfit === "openCollar" && <g>
      <path d="M93 188 L99 174 M107 188 L101 174" stroke="#c9d3de" strokeWidth={0.8}/>
      <circle cx={100} cy={214} r={1.8} fill={dark}/>
    </g>}
    {avatar.outfit === "overcoat" && <g>
      {[200,212].map(y=><g key={y}><circle cx={90} cy={y} r={1.8} fill={dark}/><circle cx={110} cy={y} r={1.8} fill={dark}/></g>)}
      <path d="M107 212 l0 4 M110 212 l0 4 M113 212 l0 4 M116 212 l0 4" stroke={accent} strokeWidth={1.2}/>
    </g>}
    {avatar.outfit === "quarterZip" && <g>
      <path d="M100 170 L100 204" stroke={accent} strokeWidth={1.1}/>
      <path d="M130 190 l8 0 l0 9 l-4 4 l-4 -4Z" fill={accent}/>
      <path d="M174 212 C160 196 142 188 128 186" stroke={accent} strokeWidth={3} fill="none" opacity={0.8}/>
    </g>}
    {avatar.outfit === "knit" && <g>
      {[56,76,124,144].map(x=><path key={x} d={"M"+x+" 196 c3 3 -3 6 0 9 c3 3 -3 6 0 9"}
        stroke={dark} strokeWidth={1.4} fill="none" opacity={0.55}/>)}
      <path d="M20 216 L180 216" stroke={dark} strokeWidth={2} opacity={0.4}/>
      <path d="M80 169 C90 180 110 180 120 169" stroke={light} strokeWidth={0.8} fill="none" opacity={0.6}/>
    </g>}
  </g>;
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
  if (kind === "aviator") return <g stroke="#b9a46a" strokeWidth={1.4}>
    <path d="M76 98 L97 98 C98 108 94 113 87 113 C80 113 76 108 76 98Z M103 98 L124 98 C124 108 120 113 113 113 C106 113 102 108 103 98Z" fill="rgba(40,50,60,.55)" />
    <path d="M97 99 L103 99 M76 99 L67 98 M124 99 L133 98" fill="none" /></g>;
  if (kind === "browline") return <g>
    <path d="M76 97 L97 97 L97 101 L76 101Z M103 97 L124 97 L124 101 L103 101Z" fill={frame} />
    <path d="M77 100 C77 110 96 112 96 100 M104 100 C104 112 123 110 123 100" stroke="#b9a46a" strokeWidth={1} fill="rgba(255,255,255,.1)" />
    <path d="M97 99 L103 99 M76 99 L67 98 M124 99 L133 98" stroke={frame} strokeWidth={1.6} fill="none" /></g>;
  if (kind === "wire") return <g stroke="#c9b27a" strokeWidth={1} fill="rgba(255,255,255,.08)">
    <ellipse cx={87} cy={103} rx={9.5} ry={7.5} /><ellipse cx={113} cy={103} rx={9.5} ry={7.5} />
    <path d="M96.5 102 C98 100 102 100 103.5 102 M77.5 102 L67 100 M122.5 102 L133 100" fill="none" /></g>;
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
      viewBox="20 18 160 192"
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
          <rect x="20" y="18" width="160" height="192" rx={framed ? 24 : 0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        {framed && <rect width="200" height="220" fill={`url(#bg-${id})`} />}
        <HairBack style={avatar.hair} colour={avatar.hairColour} uid={id} />
        <path d="M85 136 L85 172 Q100 182 115 172 L115 136Z" fill={skinShadow} />
        <OutfitLayer avatar={avatar} skin={skin} uid={id} />
        <OriginalOutfitDetails avatar={avatar} uid={id} />
        <ellipse cx={66} cy={106} rx={6} ry={10} fill={skinShadow} />
        <ellipse cx={134} cy={106} rx={6} ry={10} fill={skinShadow} />
        <path d={face} fill={skin} />
        <path d="M78 140 C88 150 112 150 122 140 C114 148 86 148 78 140Z" fill={skinShadow} opacity={0.5} />
        <HairFront style={avatar.hair} colour={avatar.hairColour} uid={id} />
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
