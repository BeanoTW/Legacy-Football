import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { InfrastructureAsset } from "@/lib/game/types";
import { conditionBand } from "@/lib/game/infrastructure";
import { buildGroundScene } from "@/lib/game/groundScene";
import type { GroundCameraMode, GroundDesign, SceneLook } from "@/lib/game/groundIdentity";
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

const DEFAULT_CAMERA = { azimuthDeg: -122, elevationDeg: 50, zoom: 1, panX: 0, panY: 0 };

export function StadiumGround({
  stage,
  hotspots,
  selectedId,
  onSelect,
  look,
  design,
  interactiveCamera = true,
  cameraMode = "orbit",
  selection = null,
  onSelectComponent,
  componentLabels,
}: {
  stage: number;
  hotspots: GroundHotspot[];
  selectedId: string | null;
  onSelect: (hotspot: GroundHotspot) => void;
  /** The club's own look (groundIdentity.sceneLook). Optional. */
  look?: SceneLook;
  /** Slot-based ground design (groundIdentity.groundDesign). Omitted: legacy stage drawing. */
  design?: GroundDesign;
  interactiveCamera?: boolean;
  cameraMode?: GroundCameraMode;
  /** Ground Studio: the selected component ("stand:W", "corner:NE", "pitch", …). */
  selection?: string | null;
  /** Ground Studio: tap a component to select it (null when tapping empty ground). */
  onSelectComponent?: (id: string | null) => void;
  /** Friendly names for selectable components (shown on the selected pin). */
  componentLabels?: Record<string, string>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { width, height } = useViewportSize(viewportRef);
  const [camera, setCamera] = useState(DEFAULT_CAMERA);
  // Gesture state: one finger orbits, two fingers pinch-zoom, a quick tap selects.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ az: number; el: number; zoom: number; x: number; y: number; dist: number; moved: boolean; t: number; pinch: boolean } | null>(null);

  // Keep Facilities resilient when a legacy save or editor render has no hotspot list yet.
  const safeHotspots = Array.isArray(hotspots) ? hotspots : [];
  const pitchCondition = Math.round((safeHotspots.find((h) => h.id === "pitch")?.asset?.condition ?? 80) / 5) * 5;
  const worksKey = safeHotspots
    .filter((h) => h.asset.activeProjectId)
    .map((h) => h.id)
    .sort()
    .join(",");
  // Rebuild only when the look actually changes, not on every render.
  const lookKey = look ? JSON.stringify(look) : "";
  const designKey = design ? JSON.stringify(design) : "";

  const scene = useMemo(
    () =>
      buildGroundScene({
        stage,
        pitchCondition,
        worksAt: worksKey ? worksKey.split(",") : [],
        width,
        height,
        look: lookKey ? (JSON.parse(lookKey) as SceneLook) : undefined,
        design: designKey ? (JSON.parse(designKey) as GroundDesign) : undefined,
        camera: { ...camera, mode: cameraMode },
        highlight: selection ?? undefined,
      }),
    [camera, cameraMode, designKey, height, lookKey, pitchCondition, selection, stage, width, worksKey],
  );

  // Frame the selected component (once per selection change).
  const focusedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!onSelectComponent || selection === focusedFor.current) return;
    focusedFor.current = selection;
    const target = selection ? scene.selectables?.[selection] : undefined;
    if (!target) return;
    const wide = selection === "pitch" || selection === "perimeter" || selection === "lights";
    setCamera((current) => ({
      ...current,
      panX: wide ? 0 : (target.world.x + 4) * 0.8,
      panY: wide ? 0 : (target.world.y - 2) * 0.8,
      zoom: wide ? 1 : Math.max(current.zoom, selection?.startsWith("corner") || selection === "dugouts" || selection === "scoreboard" ? 1.8 : 1.45),
    }));
  }, [onSelectComponent, scene.selectables, selection]);

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
    const facilityHotspots = hotspots.filter((hotspot) => !["shop", "offices", "hospitality", "access"].includes(hotspot.id));
    const items = facilityHotspots.flatMap((hotspot) => {
      const anchor = scene.anchors[hotspot.id];
      return anchor ? [{ id: hotspot.id, label: hotspot.label, ax: anchor.x * width, ay: anchor.y * height }] : [];
    });
    const facilities = hotspots.filter((hotspot) => ["shop", "offices", "hospitality", "access"].includes(hotspot.id));
    if (facilities.length) {
      const anchors = facilities.map((hotspot) => scene.anchors[hotspot.id]).filter(Boolean);
      if (anchors.length) items.push({ id: "__facilities", label: "Facilities", ax: anchors.reduce((sum,a)=>sum+a.x*width,0)/anchors.length, ay: anchors.reduce((sum,a)=>sum+a.y*height,0)/anchors.length });
    }
    return layoutLabels(items, width, height);
  }, [height, hotspots, scene.anchors, width]);

  const byId = new Map(hotspots.map((hotspot) => [hotspot.id, hotspot]));
  const { x, y, w, h } = scene.viewBox;

  return (
    <div
      ref={viewportRef}
      className={cn("lf-ground-viewport rounded-lg", `lf-ground-stage-${stage}`)}
      style={{ background: scene.background, touchAction: interactiveCamera ? "none" : undefined }}
      onPointerDown={interactiveCamera ? (event) => {
        // Capture can fail (synthetic or already-released pointers); gestures still work.
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pts = [...pointers.current.values()];
        const pinch = pts.length >= 2;
        gesture.current = {
          az: camera.azimuthDeg,
          el: camera.elevationDeg,
          zoom: camera.zoom,
          x: event.clientX,
          y: event.clientY,
          dist: pinch ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
          moved: pinch || Boolean(gesture.current?.moved),
          t: Date.now(),
          pinch,
        };
      } : undefined}
      onPointerMove={interactiveCamera ? (event) => {
        const g = gesture.current;
        if (!g || !pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const pts = [...pointers.current.values()];
        if (pts.length >= 2 && g.pinch && g.dist > 0) {
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          setCamera((current) => ({ ...current, zoom: Math.max(0.75, Math.min(2.6, g.zoom * (dist / g.dist))) }));
          return;
        }
        if (g.pinch) return;
        const dx = event.clientX - g.x;
        const dy = event.clientY - g.y;
        if (!g.moved && Math.hypot(dx, dy) < 8) return;
        g.moved = true;
        setCamera((current) => ({
          ...current,
          azimuthDeg: g.az + dx * 0.35,
          elevationDeg: Math.max(20, Math.min(75, g.el - dy * 0.25)),
        }));
      } : undefined}
      onPointerUp={interactiveCamera ? (event) => {
        const g = gesture.current;
        pointers.current.delete(event.pointerId);
        // A quick tap that didn't move selects the nearest component.
        if (g && !g.moved && !g.pinch && onSelectComponent && Date.now() - g.t < 600) {
          const rect = event.currentTarget.getBoundingClientRect();
          const fx = (event.clientX - rect.left) / rect.width;
          const fy = (event.clientY - rect.top) / rect.height;
          let best: string | null = null;
          let bestDist = 46;
          for (const [id, at] of Object.entries(scene.selectables ?? {})) {
            const d = Math.hypot((at.x - fx) * rect.width, (at.y - fy) * rect.height);
            if (d < bestDist) { bestDist = d; best = id; }
          }
          onSelectComponent(best);
        }
        if (pointers.current.size === 0) gesture.current = null;
        else if (g) {
          // One finger left after a pinch: continue as an orbit from here, never as a tap.
          const [rest] = [...pointers.current.values()];
          gesture.current = { ...g, pinch: false, moved: true, x: rest.x, y: rest.y, az: camera.azimuthDeg, el: camera.elevationDeg, zoom: camera.zoom };
        }
      } : undefined}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size === 0) gesture.current = null;
      }}
      onWheel={interactiveCamera ? (event) => {
        event.preventDefault();
        setCamera((current) => ({ ...current, zoom: Math.max(0.75, Math.min(2.6, current.zoom - event.deltaY * 0.0015)) }));
      } : undefined}
    >
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

      {onSelectComponent && scene.selectables ? (
        <div className="pointer-events-none absolute inset-0 z-[6]" aria-hidden="true">
          {Object.entries(scene.selectables).map(([id, at]) => {
            if (at.x < 0.02 || at.x > 0.98 || at.y < 0.02 || at.y > 0.98) return null;
            const active = id === selection;
            return (
              <span
                key={id}
                data-selectable={id}
                className={cn("absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all", active ? "size-3.5 border-white bg-amber-400 shadow-[0_0_0_4px_rgba(255,197,61,.35)]" : "size-2.5 border-white/90 bg-white/45")}
                style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
              >
                {active && componentLabels?.[id] ? (
                  <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white">{componentLabels[id]}</span>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {interactiveCamera && cameraMode === "orbit" ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={() => { setCamera(DEFAULT_CAMERA); focusedFor.current = null; }}
          className="absolute left-2 top-2 z-[7] rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm"
          aria-label="Reset the camera to the default view"
        >
          ⟲ View
        </button>
      ) : null}

      {/* Leader lines from each label to the part of the ground it describes. */}
      <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full" aria-hidden="true">
        {labels.map((box) => {
          const hotspot = byId.get(box.id);
          if (box.id === "__facilities") return <line key={box.id} x1={box.x + box.w / 2} y1={box.y + LABEL_H} x2={box.ax} y2={box.ay} stroke="white" strokeOpacity={0.55} strokeWidth={1.2} />;
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
        if (box.id === "__facilities") {
          const facilities = hotspots.filter((item) => ["shop", "offices", "hospitality", "access"].includes(item.id));
          return <details key={box.id} className="absolute z-[6]" style={{ left: box.x, top: box.y, width: box.w }}>
            <summary className="lf-ground-label lf-ground-scene-label cursor-pointer list-none" style={{ position: "relative", left: 0, top: 0, width: box.w }}><span className="lf-ground-label-dot" aria-hidden="true" /><span>Facilities</span></summary>
            <div className="mt-1 overflow-hidden rounded-lg border border-white/15 bg-black/80 p-1 text-[10px] text-white shadow-xl backdrop-blur-sm">
              {facilities.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10">{item.label}</button>)}
            </div>
          </details>;
        }
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
