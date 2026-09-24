import { Button } from "@/components/ui/button";
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
      <div className="absolute inset-x-3 top-3 z-[3] flex items-center justify-between">
        <div>
          <div className="lf-ground-kicker text-[10px] font-semibold uppercase tracking-[0.16em]">Club ground</div>
          <div className="font-display text-lg text-foreground">Stadium campus</div>
        </div>
        <div className="rounded border border-foreground/15 bg-background/20 px-2 py-1 text-[10px] text-foreground backdrop-blur">Select an area</div>
      </div>

      <svg className="lf-ground-scene" viewBox="0 0 900 560" role="img" aria-label="Elevated view of the club stadium">
        <path className="ground-base" d="M75 190 450 28 830 197 451 535 56 355Z" />
        <path className="ground-concrete" d="M136 186 448 55 766 197 449 488 111 339Z" />
        <path className="ground-roof roof-upgrade" d="M130 169 448 37 771 179 719 211 448 92 180 204Z" />
        <path className="ground-tier" d="M160 190 446 74 739 202 686 240 446 135 211 233Z" />
        <path className="ground-tier upper-tier" d="M194 174 447 72 704 185 674 205 447 106 224 198Z" opacity=".92" />
        <path className="ground-roof" d="M113 329 169 287 447 410 719 165 776 190 450 486Z" />
        <path className="ground-tier" d="M145 320 187 291 446 405 698 178 739 198 449 461Z" />
        <path className="ground-pitch" d="M242 239 448 151 655 242 447 430Z" />
        <path className="ground-line" d="M264 247 448 169 633 249 447 411Z M448 169V411 M355 208C403 229 493 268 541 289 M356 370C405 344 491 265 539 229" />
        <path className="ground-building" d="M84 270 164 238 213 261 132 300Z M84 270V335L132 361V300 M132 300 213 261V320L132 361Z" />
        <path className="ground-building" d="M676 326 749 264 814 294 738 360Z M676 326V385L738 416V360 M738 360 814 294V354L738 416Z" />
        <path className="corner-fill ground-tier" d="M174 229 214 211 249 226 211 248Z M648 226 689 208 724 224 684 244Z" />
        <g className="ground-light"><circle cx="145" cy="154" r="13"/><circle cx="740" cy="161" r="13"/><circle cx="156" cy="402" r="13"/><circle cx="742" cy="407" r="13"/></g>
        <g className="ground-line"><path d="M145 154V260 M740 161V248 M156 402V330 M742 407V342" strokeWidth="7"/></g>
      </svg>

      {hotspots.map((hotspot) => (
        <Button
          key={hotspot.id}
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={selectedId === hotspot.id}
          onClick={() => onSelect(hotspot)}
          className={cn("lf-ground-label", hotspot.className, selectedId === hotspot.id && "border-banner bg-primary")}
        >
          <span className="truncate">{hotspot.label}</span>
          {hotspot.asset.activeProjectId ? <span className="size-1.5 shrink-0 rounded-full bg-banner" /> : null}
        </Button>
      ))}
    </div>
  );
}
