/**
 * Aerial ground scene for the Facilities screen.
 *
 * The ground is modelled in metres (x along the pitch, y across it, z up) and
 * rendered through a perspective drone camera, so every stage reads like an
 * aerial photograph rather than a flat diagram. Output is a list of SVG path
 * primitives in painter's order plus projected anchor points for hotspots.
 *
 * Pure and deterministic: the same inputs always give the same picture.
 * An optional `look` (from groundIdentity.sceneLook) applies the club's own
 * choices: seat/roof/cladding colours, stand builds, home end, floodlight
 * style and mowing pattern. Without it the default ground is drawn.
 */

import type { CornerSlot, GroundDesign, GroundStandDesign, SceneLook, StandMaterial, StandSide } from "./groundIdentity";

export interface SceneInput {
  /** groundProgression().visualStage, 0 (basic non-league) → 6 (elite). */
  stage: number;
  /** Pitch condition 0-100; below ~75 wear starts to show. */
  pitchCondition: number;
  /** Hotspot ids with capital works in progress (a crane is drawn there). */
  worksAt: string[];
  /** Viewport size in CSS pixels, used to frame the scene. */
  width: number;
  height: number;
  /** The club's own look. Optional: omitted means the default ground. */
  look?: SceneLook;
  /**
   * Slot-based ground design (groundIdentity.groundDesign). When present the
   * ground is composed stand-by-stand and corner-by-corner from the design;
   * when omitted the legacy stage composition is used unchanged.
   */
  design?: GroundDesign;
  /**
   * Ground Studio selection to outline, e.g. "stand:W", "corner:NE", "pitch",
   * "lights", "perimeter", "dugouts", "scoreboard", "surroundings".
   */
  highlight?: string;
  /** Orbit camera. Omitted values preserve the legacy aerial composition. */
  camera?: {
    azimuthDeg?: number;
    elevationDeg?: number;
    zoom?: number;
    panX?: number;
    panY?: number;
    mode?: "orbit" | "matchday";
  };
}

export interface ScenePrimitive {
  d: string;
  fill: string;
  stroke?: string;
  /** Stroke width in screen pixels. */
  sw?: number;
  opacity?: number;
  cap?: "round" | "butt";
}

export interface SceneOutput {
  viewBox: { x: number; y: number; w: number; h: number };
  background: string;
  prims: ScenePrimitive[];
  /** Projected playable pitch rectangle as fractions of the scene viewport. */
  pitchBounds: { left: number; top: number; width: number; height: number };
  /**
   * Designed grounds only: every selectable component, with its projected
   * position (fractions of the viewport) and world point (for camera focus).
   */
  selectables?: Record<string, { x: number; y: number; world: { x: number; y: number; z: number } }>;
  /** Hotspot anchors as fractions (0-1) of the viewport. */
  anchors: Record<string, { x: number; y: number }>;
}

/* ------------------------------------------------------------------ */
/* Maths                                                               */
/* ------------------------------------------------------------------ */

interface V3 {
  x: number;
  y: number;
  z: number;
}
interface P2 {
  x: number;
  y: number;
  /** Camera-space depth. */
  d: number;
}

const v = (x: number, y: number, z = 0): V3 => ({ x, y, z });
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: V3): V3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / l, a.y / l, a.z / l);
};
const centroid = (pts: V3[]): V3 => {
  const s = pts.reduce((acc, p) => v(acc.x + p.x, acc.y + p.y, acc.z + p.z), v(0, 0, 0));
  return v(s.x / pts.length, s.y / pts.length, s.z / pts.length);
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[m(r1, r2), m(g1, g2), m(b1, b2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

let TARGET = v(-4, 2, 0);
const DISTANCE = 250;
const FOCAL = 1000;
let CAM = v(0, 0, DISTANCE);
let FWD = v(0, 0, -1);
let RIGHT = v(1, 0, 0);
let UP = v(0, 1, 0);

function configureCamera(input: SceneInput): void {
  const camera = input.camera;
  const matchday = camera?.mode === "matchday";
  const azimuth = ((matchday ? -90 : camera?.azimuthDeg ?? -122) * Math.PI) / 180;
  const elevation = ((matchday ? 89.5 : Math.max(20, Math.min(75, camera?.elevationDeg ?? 50))) * Math.PI) / 180;
  const zoom = Math.max(0.65, Math.min(2.2, camera?.zoom ?? 1));
  TARGET = v((matchday ? 0 : -4) + (camera?.panX ?? 0), (matchday ? 0 : 2) + (camera?.panY ?? 0), 0);
  const distance = DISTANCE / zoom;
  CAM = v(
    TARGET.x + distance * Math.cos(elevation) * Math.cos(azimuth),
    TARGET.y + distance * Math.cos(elevation) * Math.sin(azimuth),
    TARGET.z + distance * Math.sin(elevation),
  );
  FWD = norm(sub(TARGET, CAM));
  RIGHT = norm(cross(FWD, v(0, 0, 1)));
  UP = cross(RIGHT, FWD);
}
/** Direction towards the sun: low from behind-left so shadows fall to the right. */
const SUN = norm(v(-0.55, 0.62, 0.62));
const REF_DEPTH = DISTANCE;

function project(p: V3): P2 {
  const d = sub(p, CAM);
  const cz = Math.max(1, dot(d, FWD));
  return { x: (FOCAL * dot(d, RIGHT)) / cz, y: (-FOCAL * dot(d, UP)) / cz, d: cz };
}

/** Where a point's shadow lands on the ground. */
function shadowOf(p: V3): V3 {
  return v(p.x - (p.z * SUN.x) / SUN.z, p.y - (p.z * SUN.y) / SUN.z, 0);
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

function pathOf(points: V3[], close = true): string {
  return (
    points
      .map((p, i) => {
        const s = project(p);
        return `${i ? "L" : "M"}${f1(s.x)} ${f1(s.y)}`;
      })
      .join("") + (close ? "Z" : "")
  );
}

/** Stroke width that shrinks with distance, like a real photograph. */
function widthAt(p: V3, base: number): number {
  return (base * REF_DEPTH) / project(p).d;
}

function rect(x0: number, y0: number, x1: number, y1: number, z = 0): V3[] {
  return [v(x0, y0, z), v(x1, y0, z), v(x1, y1, z), v(x0, y1, z)];
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2, n = 40, z = 0): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = from + ((to - from) * i) / n;
    pts.push(v(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z));
  }
  return pts;
}

/** Clip a ground polygon to an axis-aligned rectangle (Sutherland-Hodgman). */
function clipToRect(points: V3[], x0: number, y0: number, x1: number, y1: number): V3[] {
  const edges: Array<[(p: V3) => boolean, (a: V3, b: V3) => V3]> = [
    [(p) => p.x >= x0, (a, b) => v(x0, a.y + ((b.y - a.y) * (x0 - a.x)) / (b.x - a.x))],
    [(p) => p.x <= x1, (a, b) => v(x1, a.y + ((b.y - a.y) * (x1 - a.x)) / (b.x - a.x))],
    [(p) => p.y >= y0, (a, b) => v(a.x + ((b.x - a.x) * (y0 - a.y)) / (b.y - a.y), y0)],
    [(p) => p.y <= y1, (a, b) => v(a.x + ((b.x - a.x) * (y1 - a.y)) / (b.y - a.y), y1)],
  ];
  let out = points;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scene assembly                                                      */
/* ------------------------------------------------------------------ */

interface Obj {
  depth: number;
  prims: ScenePrimitive[];
}

class Scene {
  ground: ScenePrimitive[] = [];
  shadows: ScenePrimitive[] = [];
  objects: Obj[] = [];
  bounds: V3[] = [];

  flat(points: V3[], fill: string, opacity?: number) {
    this.ground.push({ d: pathOf(points), fill, opacity });
  }

  flatLine(points: V3[], stroke: string, width: number, opacity?: number, close = false) {
    this.ground.push({
      d: pathOf(points, close),
      fill: "none",
      stroke,
      sw: widthAt(centroid(points), width),
      opacity,
      cap: "round",
    });
  }

  shadowPoly(points: V3[], opacity = 0.26) {
    this.shadows.push({ d: pathOf(points.map(shadowOf)), fill: "#0d1a10", opacity });
  }

  /** Shadow of a vertical solid: hull of its footprint and its projected roofline. */
  shadowSolid(pts: V3[], opacity = 0.26) {
    const ground = pts.map((p) => (p.z > 0.01 ? shadowOf(p) : p));
    this.shadowPoly(convexHull(ground), opacity);
  }

  shadowLine(a: V3, b: V3, width: number, opacity = 0.3) {
    this.shadows.push({
      d: pathOf([shadowOf(a), shadowOf(b)], false),
      fill: "none",
      stroke: "#0d1a10",
      sw: widthAt(a, width),
      opacity,
      cap: "round",
    });
  }

  add(prims: ScenePrimitive[], anchor: V3) {
    this.objects.push({ depth: project(anchor).d, prims });
  }
}

function convexHull(points: V3[]): V3[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const crossZ = (o: V3, a: V3, b: V3) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: V3[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: V3[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Convex solid from faces: culls faces turned away from the camera and
 * shades the rest by the sun, then orders them far → near.
 */
function solid(faces: V3[][], color: string, opts: { faceColors?: (string | undefined)[]; outline?: boolean } = {}): ScenePrimitive[] {
  const all = faces.flat();
  const centre = centroid(all);
  const visible: Array<{ depth: number; prim: ScenePrimitive }> = [];
  faces.forEach((face, index) => {
    const fc = centroid(face);
    let n = norm(cross(sub(face[1], face[0]), sub(face[2], face[0])));
    if (dot(n, sub(fc, centre)) < 0) n = v(-n.x, -n.y, -n.z);
    if (dot(n, sub(CAM, fc)) <= 0) return;
    const light = 0.62 + 0.46 * Math.max(0, dot(n, SUN));
    const base = opts.faceColors?.[index] ?? color;
    visible.push({
      depth: project(fc).d,
      prim: {
        d: pathOf(face),
        fill: shade(base, light),
        stroke: opts.outline === false ? undefined : shade(base, light * 0.8),
        sw: 0.6,
      },
    });
  });
  return visible.sort((a, b) => b.depth - a.depth).map((item) => item.prim);
}

function boxFaces(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): V3[][] {
  return [
    rect(x0, y0, x1, y1, z1),
    rect(x0, y0, x1, y1, z0),
    [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)],
    [v(x0, y1, z0), v(x1, y1, z0), v(x1, y1, z1), v(x0, y1, z1)],
    [v(x0, y0, z0), v(x0, y1, z0), v(x0, y1, z1), v(x0, y0, z1)],
    [v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), v(x1, y0, z1)],
  ];
}

/** A prism: cross-section polygon (in local "out, z") extruded along "along". */
function prismFaces(section: Array<[number, number]>, a0: number, a1: number, toWorld: (along: number, out: number, z: number) => V3): V3[][] {
  const capA = section.map(([o, z]) => toWorld(a0, o, z));
  const capB = section.map(([o, z]) => toWorld(a1, o, z));
  const sides = section.map((_, i) => {
    const j = (i + 1) % section.length;
    return [capA[i], capA[j], capB[j], capB[i]];
  });
  return [capA, capB, ...sides];
}

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const BASE_C = {
  field: ["#7aa24a", "#6f9a42", "#86ab55", "#94aa5d", "#6a9140"],
  hedge: "#35592a",
  treeDark: "#2c5226",
  tree: "#3f6f32",
  treeLight: "#5b8a44",
  pitchA: "#3c9442",
  pitchB: "#348a3b",
  surround: "#2f7f37",
  wear: "#8f8a55",
  line: "#f3f6ee",
  path: "#b7b4a6",
  tarmac: "#595e63",
  gravel: "#a79f89",
  fence: "#1f4b2c",
  post: "#18361f",
  concrete: "#c4c0b4",
  roof: "#56616c",
  roofDark: "#3e4852",
  seat: "#1f6f69",
  seatAlt: "#185a55",
  brick: "#9a5d42",
  cladding: "#d3d0c6",
  glass: "#8fb4c2",
  cabin: "#b88c4a",
  white: "#f5f6f2",
  lightHead: "#fff2b0",
  crane: "#e6b422",
  road: "#6b6f72",
  terrace: "#a9adae",
  barrier: "#59636b",
};

/** The palette in use for the scene being built (reset per build). */
const C = { ...BASE_C, field: [...BASE_C.field] };
/** The look in use for the scene being built (reset per build). */
let LOOK: SceneLook | undefined;

/* ------------------------------------------------------------------ */