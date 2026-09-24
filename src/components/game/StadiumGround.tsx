import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { InfrastructureAsset } from "@/lib/game/types";
import { conditionBand } from "@/lib/game/infrastructure";
import { buildGroundScene } from "@/lib/game/groundScene";
import { cn } from "@/lib/utils";

export interface GroundHotspot {
  id: string;
  label: string;
  asset: InfrastructureAsset;
  /** Legacy CSS position class. Labels are now anchored to the scene, so this is unused. */
  className: string;
}

const BAND_COLOUR: Record<string, string> = {
  excellent: "oklch(0.73 0.17 145)",
  good: "oklch(0.73 0.17 145)",
  worn: "oklch(0.78 0.14 86)",
  poor: "oklch(0.66 0.2 30)",
  critical: "oklch(0.66 0.2 30)",
  closed: "oklch(0.5 0.02 240)",
};

/* Leader lines replace the old fixed stem; everything else reuses .lf-ground-label. */
const SCENE_CSS = `
.lf-ground-scene-label.lf-ground-label { position: absolute; max-width: 7.3rem; }
.lf-ground-scene-label.lf-ground-label::after { display: none; }
.lf-ground-aerial-shade {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  background:
    radial-gradient(120% 90% at 50% 45%, transparent 55%, rgb(8 24 16 / 32%) 100%),
    linear-gradient(180deg, rgb(255 255 255 / 6%), transparent 30%);
}
`;

const LABEL_H = 28;
const GAP = 5;
const EDGE = 6;

interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  ax: number;
  ay: number;
}

/** Places pills above their anchors, then pushes overlapping ones apart. */
export function layoutLabels(
  items: Array<{ id: string; label: string; ax: number; ay: number }>,
  width: number,
  height: number,
): LabelBox[] {
  const compact = width <= 430;
  const charW = compact ? 5.4 : 5.8;
  const maxW = compact ? 101 : 117;
  const boxes: LabelBox[] = items.map((item) => {
    const w = Math.min(maxW, 30 + item.label.length * charW);
    return { id: item.id, w, ax: item.ax, ay: item.ay, x: item.ax - w / 2, y: item.ay - LABEL_H - 12 };
  });
  // The stage badge in the top-right corner is a fixed obstacle.
  const badge = { x: width - 104, y: 0, w: 104, h: 44 };

  const clamp = (b: LabelBox) => {
    b.x = Math.max(EDGE, Math.min(width - EDGE - b.w, b.x));
    b.y = Math.max(EDGE, Math.min(height - EDGE - LABEL_H, b.y));
  };
  boxes.forEach(clamp);

  for (let iteration = 0; iteration < 80; iteration += 1) {
    let moved = false;
    for (let i = 0; i < boxes.length; i += 1) {
      const a = boxes[i];
      for (let j = i + 1; j < boxes.length; j += 1) {
        const b = boxes[j];
        const ox = Math.min(a.x + a.w + GAP - b.x, b.x + b.w + GAP - a.x);
        const oy = Math.min(a.y + LABEL_H + GAP - b.y, b.y + LABEL_H + GAP - a.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox) {
          const dir = a.y + LABEL_H / 2 <= b.y + LABEL_H / 2 ? -1 : 1;
          a.y += (dir * oy) / 2 + dir * 0.5;
          b.y -= (dir * oy) / 2 + dir * 0.5;
        } else {
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
          a.x += (dir * ox) / 2 + dir * 0.5;
          b.x -= (dir * ox) / 2 + dir * 0.5;
        }
        clamp(a);
        clamp(b);
      }
      const ox = Math.min(a.x + a.w + GAP - badge.x, badge.x + badge.w + GAP - a.x);
      const oy = Math.min(a.y + LABEL_H + GAP - badge.y, badge.y + badge.h + GAP - a.y);
      if (ox > 0 && oy > 0) {
        moved = true;
        a.y = badge.y + badge.h + GAP;
        clamp(a);
      }
    }
    if (!moved) break;
  }
  return boxes;
}

function useViewportSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 390, height: 470 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = (width: number, height: number) => {
      // Round so tiny layout jitters don't rebuild the scene.
      const next = { width: Math.max(200, Math.round(width / 4) * 4), height: Math.max(200, Math.round(height / 4) * 4) };
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next));
    };
    measure(node.clientWidth, node.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const { width, height } = useViewportSize(viewportRef);

  const pitchCondition = Math.round((hotspots.find((h) => h.id === "pitch")?.asset.condition ?? 80) / 5) * 5;
  const worksKey = hotspots
    .filter((h) => h.asset.activeProjectId)
    .map((h) => h.id)
    .sort()
    .join(",");

  const scene = useMemo(
    () =>
      buildGroundScene({
        stage,
        pitchCondition,
        worksAt: worksKey ? worksKey.split(",") : [],
        width,
        height,
      }),
    [height, pitchCondition, stage, width, worksKey],
  );

  const strokeScale = scene.viewBox.w / width;

  const paths = useMemo(
    () =>
      scene.prims.map((prim, index) => (
        <path
          key={index}
          d={prim.d}
          fill={prim.fill}
          stroke={prim.stroke}
          strokeWidth={prim.stroke ? (prim.sw ?? 1) * strokeScale : undefined}
          strokeLinecap={prim.cap}
          strokeLinejoin={prim.stroke ? "round" : undefined}
          opacity={prim.opacity}
        />
      )),
    [scene, strokeScale],
  );

  const labels = useMemo(() => {
    const items = hotspots.flatMap((hotspot) => {
      const anchor = scene.anchors[hotspot.id];
      return anchor ? [{ id: hotspot.id, label: hotspot.label, ax: anchor.x * width, ay: anchor.y * height }] : [];
    });
    return layoutLabels(items, width, height);
  }, [height, hotspots, scene.anchors, width]);

  const byId = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const { x, y, w, h } = scene.viewBox;

  return (
    <div ref={viewportRef} className={cn("lf-ground-viewport rounded-lg", `lf-ground-stage-${stage}`)} style={{ background: scene.background }}>
      <style>{SCENE_CSS}</style>
      <div className="lf-ground-scene-heading">
        <span className="lf-ground-scene-stage">Stage {stage + 1}</span>
      </div>

      <svg
        className="absolute inset-0 z-[2] h-full w-full"
        viewBox={`${x} ${y} ${w} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Aerial view of the club ground"
      >
        {paths}
      </svg>
      <div className="lf-ground-aerial-shade" aria-hidden="true" />

      {/* Leader lines from each label to the part of the ground it describes. */}
      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true">
        {labels.map((box) => {
          const hotspot = byId.get(box.id);
          if (!hotspot) return null;
          const colour = BAND_COLOUR[conditionBand(hotspot.asset.condition)] ?? "white";
          const lx = Math.max(box.x + 10, Math.min(box.x + box.w - 10, box.ax));
          const ly = box.y + LABEL_H / 2 < box.ay ? box.y + LABEL_H : box.y;
          const selected = selectedId === hotspot.asset.id;
          return (
            <g key={box.id}>
              <line x1={lx} y1={ly} x2={box.ax} y2={box.ay} stroke="white" strokeOpacity={selected ? 0.9 : 0.55} strokeWidth={1.2} />
              <circle cx={box.ax} cy={box.ay} r={selected ? 4.5 : 3.5} fill={colour} stroke="rgb(10 30 25 / 70%)" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>

      {labels.map((box) => {
        const hotspot = byId.get(box.id);
        if (!hotspot) return null;
        const selected = selectedId === hotspot.asset.id;
        return (
          <button
            key={box.id}
            type="button"
            aria-pressed={selected}
            aria-label={`Open ${hotspot.label}`}
            data-band={conditionBand(hotspot.asset.condition)}
            onClick={() => onSelect(hotspot)}
            className={cn("lf-ground-label lf-ground-scene-label", selected && "is-selected")}
            style={{ left: box.x, top: box.y, width: box.w, justifyContent: "flex-start" }}
          >
            <span className="lf-ground-label-dot" aria-hidden="true" />
            <span className="truncate">{hotspot.label}</span>
            {hotspot.asset.activeProjectId ? <span className="lf-ground-project-dot" aria-label="Project active" /> : null}
          </button>
        );
      })}
    </div>
  );
}