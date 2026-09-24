import type { InfrastructureAsset } from "@/lib/game/types";
import { cn } from "@/lib/utils";

export interface GroundHotspot {
  id: string;
  label: string;
  asset: InfrastructureAsset;
  className: string;
}

export function StadiumGround({
  stage,
  hotspots,
  selectedId,
  onSelect,
}: {
  stage: number;
  hotspots: GroundHotspot[];
  selectedId: string | null;
  onSelect: (hotspot: GroundHotspot) => void;
}) {
  return (
    <div className={cn("lf-ground-viewport rounded-lg", `lf-ground-stage-${stage}`)}>
      <div className="lf-ground-scene-heading">
        <span className="lf-ground-kicker">Your ground</span>
        <span className="lf-ground-scene-stage">Stage {stage + 1}</span>
      </div>

      <svg className="lf-ground-scene" viewBox="0 0 900 610" role="img" aria-label="Elevated view of the club ground">
        <defs>
          <linearGradient id="lf-ground-grass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".92" />
            <stop offset="1" stopColor="currentColor" stopOpacity=".72" />
          </linearGradient>
        </defs>

        <path className="ground-site" d="M44 212 449 38 861 220 450 586 30 392Z" />
        <path className="ground-carpark" d="M54 350 177 298 279 343 153 451 47 401Z" />
        <path className="ground-carpark-line" d="M76 355 163 319M94 378 183 340M113 399 203 361M133 420 222 382" />
        <path className="ground-walkway" d="M121 208 449 70 785 219 451 520 91 365Z" />

        <g className="ground-main-stand">
          <path className="ground-stand-shadow" d="M146 199 447 76 738 204 680 245 447 143 204 246Z" />
          <path className="ground-stand-face" d="M177 200 446 91 708 207 665 235 446 141 220 236Z" />
          <path className="ground-seat-row" d="M202 201 446 104 684 209M218 217 446 126 664 221" />
          <path className="ground-stand-roof" d="M136 179 447 52 753 187 709 213 447 99 182 211Z" />
        </g>

        <g className="ground-opposite-stand">
          <path className="ground-stand-shadow" d="M131 350 195 305 447 417 690 199 759 229 451 512Z" />
          <path className="ground-stand-face" d="M159 347 202 318 446 426 681 215 728 236 449 485Z" />
          <path className="ground-seat-row" d="M190 348 445 459 701 230M180 331 446 444 715 214" />
          <path className="ground-stand-roof secondary-roof" d="M122 347 183 302 447 419 699 193 770 224 450 521Z" />
        </g>

        <g className="ground-corner-build corner-build">
          <path className="ground-stand-face" d="M192 245 229 221 269 239 232 266Z" />
          <path className="ground-stand-face" d="M625 236 665 214 708 233 665 260Z" />
        </g>

        <path className="ground-pitch-surround" d="M218 244 448 146 682 248 447 462Z" />
        <path className="ground-pitch" d="M239 253 448 164 659 257 447 443Z" />
        <path className="ground-pitch-stripe" d="M271 264 447 189 626 267 595 294 447 230 302 292ZM331 319 447 269 565 321 532 351 447 314 365 350ZM391 374 447 350 507 377 447 430Z" />
        <path className="ground-marking" d="M257 260 448 178 641 263 447 429ZM448 178V429M350 219 350 303 448 346 545 302 545 220M414 253C432 244 462 244 480 253 499 262 499 278 480 287 462 296 432 296 414 287 395 278 395 262 414 253Z" />

        <g className="ground-clubhouse">
          <path className="ground-building-side" d="M77 282 143 252 198 276 132 307 77 282Z" />
          <path className="ground-building-front" d="M77 282V347L132 376V307L77 282Z" />
          <path className="ground-building-side" d="M132 307 198 276V338L132 376V307Z" />
          <path className="ground-building-roof" d="M70 277 143 244 205 272 132 306Z" />
          <path className="ground-window" d="M92 310 112 320V344L92 334ZM151 308 178 295V318L151 332Z" />
        </g>

        <g className="ground-hospitality future-campus">
          <path className="ground-building-side" d="M692 330 752 279 820 309 758 363 692 330Z" />
          <path className="ground-building-front" d="M692 330V389L758 424V363L692 330Z" />
          <path className="ground-building-side" d="M758 363 820 309V368L758 424V363Z" />
          <path className="ground-building-roof" d="M685 325 751 270 829 305 758 364Z" />
          <path className="ground-window" d="M715 348 742 362V386L715 372ZM773 348 803 323V346L773 371Z" />
        </g>

        <g className="ground-turnstiles">
          <path d="M121 433 155 405 190 421 155 451Z" />
          <path d="M165 453 198 425 232 441 198 470Z" />
        </g>

        <g className="ground-fence">
          <path d="M98 229 449 84 805 239M93 374 449 548 807 236" />
        </g>

        <g className="ground-light-tower">
          <path className="ground-light-pole" d="M147 164V277M748 171V275M157 456V369M747 457V369" />
          <g className="ground-light-head">
            <rect x="128" y="145" width="38" height="18" rx="4" />
            <rect x="729" y="152" width="38" height="18" rx="4" />
            <rect x="138" y="456" width="38" height="18" rx="4" />
            <rect x="728" y="457" width="38" height="18" rx="4" />
          </g>
        </g>

        <g className="ground-tree-line">
          <circle cx="72" cy="236" r="12" /><circle cx="95" cy="220" r="9" /><circle cx="821" cy="260" r="11" />
          <circle cx="838" cy="279" r="9" /><circle cx="79" cy="447" r="10" /><circle cx="823" cy="430" r="12" />
        </g>
      </svg>

      <div className="lf-ground-hint">Tap an area to manage it</div>

      {hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          type="button"
          aria-pressed={selectedId === hotspot.id}
          aria-label={`Open ${hotspot.label}`}
          onClick={() => onSelect(hotspot)}
          className={cn("lf-ground-label", hotspot.className, selectedId === hotspot.id && "is-selected")}
        >
          <span className="lf-ground-label-dot" aria-hidden="true" />
          <span className="truncate">{hotspot.label}</span>
          {hotspot.asset.activeProjectId ? <span className="lf-ground-project-dot" aria-label="Project active" /> : null}
        </button>
      ))}
    </div>
  );
}
