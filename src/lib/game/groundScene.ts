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
/* Scene pieces                                                        */
/* ------------------------------------------------------------------ */

const HALF_L = 50;
const HALF_W = 32;

function countryside(scene: Scene, rand: () => number) {
  // Patchwork fields, skipping the club site.
  const site = { x0: -120, x1: 122, y0: -80, y1: 76 };
  for (let gx = -6; gx < 6; gx += 1) {
    for (let gy = -5; gy < 5; gy += 1) {
      const x0 = gx * 70 - 10;
      const y0 = gy * 58 - 10;
      const x1 = x0 + 70;
      const y1 = y0 + 58;
      const tone = C.field[Math.floor(rand() * C.field.length)];
      scene.flat(rect(x0, y0, x1, y1), tone);
      // Subtle tramlines give fields a photographic texture.
      if (rand() < 0.55) {
        for (let k = 1; k < 6; k += 1) {
          const y = y0 + (k * (y1 - y0)) / 6;
          scene.flatLine([v(x0 + 3, y), v(x1 - 3, y)], shade(tone, 0.9), 1.1, 0.5);
        }
      }
    }
  }
  // Hedgerows along field boundaries.
  for (let gx = -6; gx <= 6; gx += 1) {
    const x = gx * 70 - 10;
    scene.flatLine([v(x, -300), v(x, 300)], C.hedge, 3.2, 0.85);
  }
  for (let gy = -5; gy <= 5; gy += 1) {
    const y = gy * 58 - 10;
    scene.flatLine([v(-440, y), v(440, y)], C.hedge, 3.2, 0.85);
  }
  // Club site grass sits on top as one mown block.
  scene.flat(rect(site.x0, site.y0, site.x1, site.y1), "#6e9b44");
  scene.flatLine(
    [v(site.x0, site.y0), v(site.x1, site.y0), v(site.x1, site.y1), v(site.x0, site.y1)],
    C.hedge,
    3.6,
    0.9,
    true,
  );

  // Road along the far boundary and a lane down to the car park.
  scene.flat(rect(-440, 86, 440, 95), C.road);
  scene.flatLine([v(-440, 90.5), v(440, 90.5)], "#e8e6d8", 1, 0.55);
  scene.flat(
    [v(-126, 86), v(-119, 86), v(-119, -44), v(-126, -44)],
    C.road,
  );
}

function tree(scene: Scene, x: number, y: number, r: number, rand: () => number) {
  const h = r * 1.5 + 2;
  const c = v(x, y, h);
  const top = project(c);
  const screenR = (FOCAL * r) / top.d;
  const circle = (cx: number, cy: number, rr: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      pts.push(`${i ? "L" : "M"}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr * 0.92)}`);
    }
    return pts.join("") + "Z";
  };
  scene.shadowPoly(ellipsePts(x, y, r * 1.05, r * 1.05, 0, Math.PI * 2, 18, h * 0.55), 0.18);
  const tone = rand() < 0.5 ? C.tree : mix(C.tree, C.treeDark, 0.4);
  scene.add(
    [
      { d: circle(top.x, top.y, screenR), fill: C.treeDark },
      { d: circle(top.x - screenR * 0.12, top.y - screenR * 0.1, screenR * 0.86), fill: tone },
      { d: circle(top.x - screenR * 0.32, top.y - screenR * 0.3, screenR * 0.42), fill: C.treeLight, opacity: 0.7 },
    ],
    c,
  );
}

function treeBelts(scene: Scene, rand: () => number) {
  // Mature belt along the road, like the railway embankment in the reference.
  for (let x = -230; x <= 230; x += 7 + rand() * 6) {
    tree(scene, x, 80 + rand() * 5, 4 + rand() * 3, rand);
  }
  // Clumps in the hedges and beyond the ends.
  const clumps: Array<[number, number]> = [
    [222, -40], [228, 10], [222, 40], [-200, -60], [-190, -20], [130, -120], [-60, -140], [40, 150], [210, -80],
  ];
  for (const [cx, cy] of clumps) {
    const n = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i += 1) tree(scene, cx + (rand() - 0.5) * 22, cy + (rand() - 0.5) * 16, 3.5 + rand() * 3, rand);
  }
  // Hedgerow trees around the site boundary.
  for (let x = -110; x <= 100; x += 18 + rand() * 14) tree(scene, x, -80 + (rand() - 0.5) * 3, 3 + rand() * 2.5, rand);
}

function neighbourPitch(scene: Scene, stage: number) {
  // A rec-ground pitch next door (the reference photo has one); it becomes
  // a fenced academy pitch as the club grows.
  const cx = 170;
  const cy = -2;
  const hl = 42;
  const hw = 28;
  const academy = stage >= 3;
  scene.flat(rect(cx - hl - 4, cy - hw - 4, cx + hl + 4, cy + hw + 4), academy ? "#3f9546" : "#78a44b");
  if (academy) {
    for (let i = 0; i < 8; i += 2) {
      const x0 = cx - hl + (i * 2 * hl) / 8;
      scene.flat(rect(x0, cy - hw, x0 + (2 * hl) / 8, cy + hw), "#37893e");
    }
  }
  const op = academy ? 0.9 : 0.55;
  scene.flatLine(rect(cx - hl, cy - hw, cx + hl, cy + hw), C.line, 1.1, op, true);
  scene.flatLine([v(cx, cy - hw), v(cx, cy + hw)], C.line, 1.1, op);
  scene.flatLine(ellipsePts(cx, cy, 7, 7), C.line, 1.1, op);
  for (const s of [-1, 1]) {
    const gx = cx + s * hl;
    scene.flatLine([v(gx, cy - 16), v(gx - s * 14, cy - 16), v(gx - s * 14, cy + 16), v(gx, cy + 16)], C.line, 1.1, op);
  }
  if (academy) fenceRun(scene, rect(cx - hl - 4, cy - hw - 4, cx + hl + 4, cy + hw + 4), 3.2);
}

function pitch(scene: Scene, stage: number, condition: number) {
  const runX = stage >= 2 ? 6 : 5;
  const runY = stage >= 2 ? 6 : 5;
  scene.flat(rect(-HALF_L - runX, -HALF_W - runY, HALF_L + runX, HALF_W + runY), C.surround);

  // Mowing: every pattern reads clearly from the air (and top-down on matchday).
  const mowing = LOOK?.mowing ?? "stripes";
  const light = mix(C.pitchA, "#ffffff", 0.06);
  const dark = shade(C.pitchB, 0.96);
  const L2 = 2 * HALF_L;
  const W2 = 2 * HALF_W;
  if (mowing === "checks") {
    const cols = 12;
    const rows = 8;
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const x0 = -HALF_L + (i * L2) / cols;
        const y0 = -HALF_W + (j * W2) / rows;
        scene.flat(rect(x0, y0, x0 + L2 / cols, y0 + W2 / rows), (i + j) % 2 ? light : dark);
      }
    }
  } else if (mowing === "diagonal") {
    scene.flat(rect(-HALF_L, -HALF_W, HALF_L, HALF_W), dark);
    const band = 7.5;
    for (let k = -20; k <= 20; k += 2) {
      const c0 = k * band;
      const poly = [v(c0 - HALF_W, -HALF_W), v(c0 - HALF_W + band, -HALF_W), v(c0 + HALF_W + band, HALF_W), v(c0 + HALF_W, HALF_W)];
      const clipped = clipToRect(poly, -HALF_L, -HALF_W, HALF_L, HALF_W);
      if (clipped.length >= 3) scene.flat(clipped, light);
    }
  } else if (mowing === "vertical") {
    // Lengthways: bands run goal to goal.
    const bands = 10;
    for (let j = 0; j < bands; j += 1) {
      const y0 = -HALF_W + (j * W2) / bands;
      scene.flat(rect(-HALF_L, y0, HALF_L, y0 + W2 / bands), j % 2 ? light : dark);
    }
  } else {
    // Stripes across the pitch: classic (12) or wide (6).
    const stripes = mowing === "wide" ? 6 : 12;
    for (let i = 0; i < stripes; i += 1) {
      const x0 = -HALF_L + (i * L2) / stripes;
      scene.flat(rect(x0, -HALF_W, x0 + L2 / stripes, HALF_W), i % 2 ? light : dark);
    }
  }

  // Wear: goalmouths and the centre go first.
  const wear = Math.max(0, Math.min(1, (78 - condition) / 45));
  if (wear > 0) {
    for (const [x, y, rx, ry] of [
      [-HALF_L + 6, 0, 7, 9],
      [HALF_L - 6, 0, 7, 9],
      [0, 0, 11, 7],
      [-HALF_L + 16, 0, 6, 12],
      [HALF_L - 16, 0, 6, 12],
    ] as const) {
      scene.flat(ellipsePts(x, y, rx * (0.45 + wear * 0.55), ry * (0.45 + wear * 0.55), 0, Math.PI * 2, 24), C.wear, 0.1 + wear * 0.38);
      scene.flat(ellipsePts(x, y, rx * (0.25 + wear * 0.3), ry * (0.25 + wear * 0.3), 0, Math.PI * 2, 20), C.wear, 0.08 + wear * 0.3);
    }
  }

  if (wear > 0) {
    for (const y of [-HALF_W + 1.3, HALF_W - 1.3]) {
      scene.flat(rect(-38, y - 0.9, 38, y + 0.9), C.wear, 0.06 + wear * 0.22);
    }
  }
  const mud = Math.max(0, Math.min(1, (55 - condition) / 30));
  if (mud > 0) {
    for (const [x, y, rx, ry] of [[-HALF_L + 5, 0, 5, 7],[HALF_L - 5, 0, 5, 7],[0, 0, 7, 5]] as const) {
      scene.flat(ellipsePts(x, y, rx * (0.6 + mud * 0.5), ry * (0.6 + mud * 0.5), 0, Math.PI * 2, 22), "#6b5537", 0.25 + mud * 0.45);
    }
  }

  const lw = 1.5;
  const L = (pts: V3[], close = false) => scene.flatLine(pts, C.line, lw, 0.95, close);
  L(rect(-HALF_L, -HALF_W, HALF_L, HALF_W), true);
  L([v(0, -HALF_W), v(0, HALF_W)]);
  L(ellipsePts(0, 0, 9.15, 9.15, 0, Math.PI * 2, 48));
  scene.flat(ellipsePts(0, 0, 0.5, 0.5, 0, Math.PI * 2, 10), C.line);
  for (const s of [-1, 1]) {
    const gx = s * HALF_L;
    L([v(gx, -20.16), v(gx - s * 16.5, -20.16), v(gx - s * 16.5, 20.16), v(gx, 20.16)]);
    L([v(gx, -9.16), v(gx - s * 5.5, -9.16), v(gx - s * 5.5, 9.16), v(gx, 9.16)]);
    const spot = gx - s * 11;
    scene.flat(ellipsePts(spot, 0, 0.45, 0.45, 0, Math.PI * 2, 10), C.line);
    const a = Math.acos(5.5 / 9.15);
    L(s > 0 ? ellipsePts(spot, 0, 9.15, 9.15, Math.PI - a, Math.PI + a, 16) : ellipsePts(spot, 0, 9.15, 9.15, -a, a, 16));
    for (const cy of [-HALF_W, HALF_W]) {
      const start = s > 0 ? (cy > 0 ? Math.PI : Math.PI / 2) : cy > 0 ? -Math.PI / 2 : 0;
      L(ellipsePts(gx, cy, 1, 1, start, start + Math.PI / 2, 6));
    }
  }
}

function goal(scene: Scene, x: number, facing: 1 | -1, small = false, yCentre = 0) {
  const hw = small ? 2.5 : 3.66;
  const h = small ? 1.8 : 2.44;
  const depth = small ? 1.4 : 2;
  const bx = x - facing * depth;
  const post = (p: V3, q: V3, w: number) => ({
    d: pathOf([p, q], false),
    fill: "none",
    stroke: C.white,
    sw: widthAt(p, w),
    cap: "round" as const,
  });
  const prims: ScenePrimitive[] = [
    // Net as a translucent tent.
    { d: pathOf([v(x, yCentre - hw, h), v(bx, yCentre - hw, 0), v(bx, yCentre + hw, 0), v(x, yCentre + hw, h)]), fill: "#ffffff", opacity: 0.22 },
    { d: pathOf([v(x, yCentre - hw, 0), v(x, yCentre - hw, h), v(bx, yCentre - hw, 0)]), fill: "#ffffff", opacity: 0.18 },
    { d: pathOf([v(x, yCentre + hw, 0), v(x, yCentre + hw, h), v(bx, yCentre + hw, 0)]), fill: "#ffffff", opacity: 0.18 },
    post(v(x, yCentre - hw, 0), v(x, yCentre - hw, h), 1.8),
    post(v(x, yCentre + hw, 0), v(x, yCentre + hw, h), 1.8),
    post(v(x, yCentre - hw, h), v(x, yCentre + hw, h), 1.8),
    post(v(bx, yCentre - hw, 0), v(bx, yCentre + hw, 0), 1),
  ];
  scene.shadowPoly([v(x, yCentre - hw, h), v(x, yCentre + hw, h), v(x, yCentre + hw, 0), v(x, yCentre - hw, 0)], 0.18);
  scene.add(prims, v(x, yCentre, h / 2));
}

/** Ball-stop mesh fence along a closed loop of ground points. */
function fenceRun(scene: Scene, loop: V3[], height: number) {
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const segments = Math.max(1, Math.round(len / 12));
    for (let s = 0; s < segments; s += 1) {
      const t0 = s / segments;
      const t1 = (s + 1) / segments;
      const p0 = v(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
      const p1 = v(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      const top0 = v(p0.x, p0.y, height);
      const top1 = v(p1.x, p1.y, height);
      const prims: ScenePrimitive[] = [
        { d: pathOf([p0, p1, top1, top0]), fill: C.fence, opacity: 0.3 },
        { d: pathOf([top0, top1], false), fill: "none", stroke: C.post, sw: widthAt(top0, 1.2), opacity: 0.9 },
        { d: pathOf([p0, p1], false), fill: "none", stroke: C.post, sw: widthAt(p0, 1.6), opacity: 0.85 },
      ];
      for (let k = 0; k <= 2; k += 1) {
        const t = k / 2;
        const px = p0.x + (p1.x - p0.x) * t;
        const py = p0.y + (p1.y - p0.y) * t;
        prims.push({ d: pathOf([v(px, py, 0), v(px, py, height)], false), fill: "none", stroke: C.post, sw: widthAt(v(px, py, 0), 1.1), opacity: 0.95 });
      }
      scene.shadowPoly([p0, p1, top1, top0], 0.12);
      scene.add(prims, v((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, height / 2));
    }
  }
}

function floodlight(scene: Scene, x: number, y: number, h: number, faceX: number, faceY: number, tower = false) {
  const base = v(x, y, 0);
  const top = v(x, y, h);
  const dir = norm(v(faceX - x, faceY - y, 0));
  const side = v(-dir.y, dir.x, 0);
  const hw = tower ? 3.2 : 1.4;
  const hh = tower ? 2.6 : 0.9;
  const head = [
    v(x - side.x * hw, y - side.y * hw, h),
    v(x + side.x * hw, y + side.y * hw, h),
    v(x + side.x * hw, y + side.y * hw, h + hh),
    v(x - side.x * hw, y - side.y * hw, h + hh),
  ];
  scene.shadowLine(base, top, tower ? 2.6 : 1.4, 0.3);
  scene.shadowPoly(head, 0.3);
  const glow = project(v(x + dir.x * 0.5, y + dir.y * 0.5, h + hh / 2));
  const gr = (FOCAL * (tower ? 6 : 3.2)) / glow.d;
  scene.add(
    [
      { d: pathOf([base, top], false), fill: "none", stroke: "#8d949a", sw: widthAt(base, tower ? 3.2 : 1.8), cap: "round" },
      { d: pathOf(head), fill: "#3b4148", stroke: "#23282d", sw: 0.6 },
      { d: pathOf(head.map((p) => v(p.x + dir.x * 0.15, p.y + dir.y * 0.15, p.z))), fill: C.lightHead, opacity: 0.85 },
      {
        d: `M${f1(glow.x - gr)} ${f1(glow.y)}a${f1(gr)} ${f1(gr)} 0 1 0 ${f1(gr * 2)} 0a${f1(gr)} ${f1(gr)} 0 1 0 ${f1(-gr * 2)} 0`,
        fill: "#fff6c8",
        opacity: 0.08,
      },
    ],
    v(x, y, h),
  );
}

/** A row of lamps along a roof front: the "gantry" floodlight style. */
function gantryLights(scene: Scene, y: number, z: number, from: number, to: number) {
  for (let x = from; x <= to; x += 7) {
    const head = [v(x - 1.6, y, z), v(x + 1.6, y, z), v(x + 1.6, y, z + 0.8), v(x - 1.6, y, z + 0.8)];
    const glow = project(v(x, y, z + 0.4));
    const gr = (FOCAL * 2.2) / glow.d;
    scene.add(
      [
        { d: pathOf(head), fill: "#3b4148", stroke: "#23282d", sw: 0.5 },
        { d: pathOf(head.map((p) => v(p.x, p.y - Math.sign(y) * 0.12, p.z))), fill: C.lightHead, opacity: 0.85 },
        { d: `M${f1(glow.x - gr)} ${f1(glow.y)}a${f1(gr)} ${f1(gr)} 0 1 0 ${f1(gr * 2)} 0a${f1(gr)} ${f1(gr)} 0 1 0 ${f1(-gr * 2)} 0`, fill: "#fff6c8", opacity: 0.07 },
      ],
      v(x, y, z + 2),
    );
  }
}

type Side = "W" | "E" | "N" | "S";

function facesCamera(a: V3, b: V3, c: V3, behind: V3): boolean {
  let n = cross(sub(b, a), sub(c, a));
  if (dot(n, sub(behind, a)) > 0) n = v(-n.x, -n.y, -n.z);
  return dot(n, sub(CAM, a)) > 0;
}

/** Maps stand-local coordinates (along the touchline, outwards, up) to world. */
function sideMapper(side: Side, front: number) {
  return (along: number, out: number, z: number): V3 => {
    switch (side) {
      case "W":
        return v(along, front + out, z);
      case "E":
        return v(-along, -(front + out), z);
      case "N":
        return v(front + out, -along, z);
      case "S":
        return v(-(front + out), along, z);
    }
  };
}

interface StandSpec {
  side: Side;
  from: number;
  to: number;
  front: number;
  depth: number;
  rake: number;
  roof: boolean;
  seat: string;
  /** Adds a second, steeper tier behind a hospitality band. */
  upper?: { depth: number; rake: number };
  back?: string;
  /** Standing terrace: crush barriers instead of seat rows. */
  terrace?: boolean;
  /** Cantilever roof: no columns at the front. */
  cantilever?: boolean;
  mapper?: (along: number, out: number, z: number) => V3;
  rearDetail?: boolean;
  /** Per-stand roof colours (fall back to the ground-wide palette). */
  roofColour?: string;
  roofDark?: string;
}

/** Returns the anchor (roof centre) for hotspot placement. */
function stand(scene: Scene, spec: StandSpec): V3 {
  const W = spec.mapper ?? sideMapper(spec.side, spec.front);
  const prims: ScenePrimitive[] = [];
  const frontFacing = facesCamera(W(spec.from, 0, 1.1), W(spec.to, 0, 1.1), W(spec.from, spec.depth, spec.rake), W(spec.from, spec.depth + 2, 0));
  const shadowPts: V3[] = [];
  const back = spec.back ?? C.cladding;
  const roofC = spec.roofColour ?? C.roof;
  const roofD = spec.roofDark ?? C.roofDark;
  const deckColour = spec.terrace ? C.terrace : spec.seat;

  // Lower tier: raked deck.
  const lowerTop = spec.rake;
  const deck: Array<[number, number]> = [[0, 0], [0, 1.1], [spec.depth, lowerTop], [spec.depth, 0]];
  prims.push(...solid(prismFaces(deck, spec.from, spec.to, W), C.concrete, { faceColors: [back, back, C.concrete, C.concrete, deckColour, back] }));
  // Seat rows, or crush barriers on a terrace.
  const rows = frontFacing ? Math.max(3, Math.round(spec.depth / 1.6)) : 0;
  for (let r = 1; r < rows; r += 1) {
    if (spec.terrace && r % 2) continue;
    const t = r / rows;
    const z = 1.1 + (lowerTop - 1.1) * t;
    if (spec.terrace) {
      for (let g = spec.from + 2; g < spec.to - 2; g += 9) {
        const a = W(g, spec.depth * t, z + 0.9);
        const b = W(Math.min(spec.to - 2, g + 6), spec.depth * t, z + 0.9);
        prims.push({ d: pathOf([a, b], false), fill: "none", stroke: C.barrier, sw: widthAt(a, 0.7), opacity: 0.95 });
      }
    } else {
      const a = W(spec.from + 0.5, spec.depth * t, z);
      const b = W(spec.to - 0.5, spec.depth * t, z);
      prims.push({ d: pathOf([a, b], false), fill: "none", stroke: shade(spec.seat, 0.72), sw: widthAt(a, 0.8), opacity: 0.9 });
    }
  }
  // Gangways.
  for (let g = spec.from + 12; frontFacing && g < spec.to - 6; g += 14) {
    const a = W(g, 0.3, 1.2);
    const b = W(g, spec.depth - 0.3, lowerTop);
    prims.push({ d: pathOf([a, b], false), fill: "none", stroke: C.concrete, sw: widthAt(a, 1.3), opacity: 0.9 });
  }

  let depth = spec.depth;
  let top = lowerTop;
  if (spec.upper) {
    // Hospitality band with glazing, then the upper tier.
    const band: Array<[number, number]> = [[depth, 0], [depth, top + 3.5], [depth + 2.5, top + 3.5], [depth + 2.5, 0]];
    prims.push(...solid(prismFaces(band, spec.from, spec.to, W), back));
    const glass = [W(spec.from + 1, depth - 0.05, top + 0.6), W(spec.to - 1, depth - 0.05, top + 0.6), W(spec.to - 1, depth - 0.05, top + 3), W(spec.from + 1, depth - 0.05, top + 3)];
    if (frontFacing) prims.push({ d: pathOf(glass), fill: C.glass, opacity: 0.85 });
    const u0 = depth + 1;
    const uBase = top + 3.5;
    const uTop = uBase + spec.upper.rake;
    const upper: Array<[number, number]> = [[u0, 0], [u0, uBase + 1], [u0 + spec.upper.depth, uTop], [u0 + spec.upper.depth, 0]];
    prims.push(...solid(prismFaces(upper, spec.from + 2, spec.to - 2, W), C.concrete, { faceColors: [back, back, C.concrete, C.concrete, spec.seat, back] }));
    const uRows = frontFacing ? Math.round(spec.upper.depth / 1.7) : 0;
    for (let r = 1; r < uRows; r += 1) {
      const t = r / uRows;
      const a = W(spec.from + 2.5, u0 + spec.upper.depth * t, uBase + 1 + (uTop - uBase - 1) * t);
      const b = W(spec.to - 2.5, u0 + spec.upper.depth * t, uBase + 1 + (uTop - uBase - 1) * t);
      prims.push({ d: pathOf([a, b], false), fill: "none", stroke: shade(spec.seat, 0.72), sw: widthAt(a, 0.8), opacity: 0.9 });
    }
    depth = u0 + spec.upper.depth;
    top = uTop;
  }

  const roofZ = top + 3.2;
  if (spec.roof) {
    // Back wall up to the roof, supporting columns, then the roof slab.
    const wall: Array<[number, number]> = [[depth, 0], [depth, roofZ], [depth + 0.6, roofZ], [depth + 0.6, 0]];
    prims.push(...solid(prismFaces(wall, spec.from, spec.to, W), back));
    if (!spec.cantilever && frontFacing) {
      for (let c = spec.from + 2; c <= spec.to - 2; c += Math.max(12, (spec.to - spec.from) / 5)) {
        const a = W(c, 0.4, 1.1);
        const b = W(c, 0.4, roofZ - 0.6);
        prims.push({ d: pathOf([a, b], false), fill: "none", stroke: "#e7e9ea", sw: widthAt(a, 1.1) });
      }
    }
    const roof: Array<[number, number]> = [[-1.5, roofZ - 0.5], [-1.5, roofZ], [depth + 0.8, roofZ + 1.6], [depth + 0.8, roofZ + 0.9]];
    prims.push(...solid(prismFaces(roof, spec.from - 0.5, spec.to + 0.5, W), roofC, { faceColors: [roofD, roofD, roofD, roofC, roofD, roofD] }));
    // Roof sheeting ribs.
    for (let c = spec.from + 3; c < spec.to; c += 4) {
      const a = W(c, -1.4, roofZ + 0.02);
      const b = W(c, depth + 0.7, roofZ + 1.62);
      prims.push({ d: pathOf([a, b], false), fill: "none", stroke: shade(roofC, 0.82), sw: widthAt(a, 0.5), opacity: 0.8 });
    }
    shadowPts.push(W(spec.from, -1.5, roofZ), W(spec.to, -1.5, roofZ), W(spec.from, depth + 0.8, roofZ + 1.6), W(spec.to, depth + 0.8, roofZ + 1.6));
  } else {
    shadowPts.push(W(spec.from, depth, top), W(spec.to, depth, top));
  }
  shadowPts.push(W(spec.from, 0, 0), W(spec.to, 0, 0), W(spec.from, depth + 0.8, 0), W(spec.to, depth + 0.8, 0));
  scene.shadowSolid(shadowPts, 0.3);

  if (spec.rearDetail && !frontFacing) {
    const backOut = depth + (spec.roof ? 0.65 : 0.05);
    const span = spec.to - spec.from;
    const doors = Math.max(1, Math.round(span / 16));
    for (let i = 0; i < doors; i += 1) {
      const d = spec.from + ((i + 0.5) * span) / doors;
      prims.push({ d: pathOf([W(d - 0.9, backOut, 0), W(d + 0.9, backOut, 0), W(d + 0.9, backOut, 2.3), W(d - 0.9, backOut, 2.3)]), fill: "#2b2f33", opacity: 0.92 });
    }
  }

  const anchor = W((spec.from + spec.to) / 2, (depth + 0.6) / 2, spec.roof ? roofZ + 1 : top + 1);
  scene.add(prims, W((spec.from + spec.to) / 2, depth / 2, top / 2));
  return anchor;
}

/** Apply the club's build for this side to a default stand spec. */
function styled(spec: StandSpec, stage: number): StandSpec {
  const build = LOOK?.stands?.[spec.side];
  const out: StandSpec = { ...spec };
  if (LOOK?.twoTone && (spec.side === "E" || spec.side === "N" || spec.side === "S")) out.seat = C.seatAlt;
  if (build) {
    out.terrace = build.terrace;
    if (stage >= 3 && spec.roof) {
      if (build.roof === "cantilever") {
        out.cantilever = true;
        out.upper = undefined;
      } else if (build.roof === "pitched") {
        out.upper = undefined;
      } else if (build.roof === "twoTier" && !out.upper) {
        out.upper = { depth: 7, rake: 5.5 };
      }
    }
  }
  // The home end: a deep, single-tier Kop.
  if (LOOK?.homeEnd === spec.side && stage >= 2) {
    out.depth = spec.depth + 3;
    out.rake = spec.rake + 1.5;
    out.roof = true;
    out.upper = undefined;
  }
  return out;
}

/** Simple building with a pitched or flat roof. Returns the roof anchor. */
function building(
  scene: Scene,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  wall: string,
  opts: { pitched?: boolean; roof?: string; windows?: string; glassy?: boolean } = {},
): V3 {
  const prims: ScenePrimitive[] = [];
  prims.push(...solid(boxFaces(x0, y0, 0, x1, y1, h), wall));
  // Window strip on the two faces most likely to be seen.
  const winZ0 = h * 0.35;
  const winZ1 = opts.glassy ? h * 0.9 : h * 0.62;
  const glassColour = opts.windows ?? C.glass;
  const windowFaces = [
    [v(x0 + 1, y0 - 0.05, winZ0), v(x1 - 1, y0 - 0.05, winZ0), v(x1 - 1, y0 - 0.05, winZ1), v(x0 + 1, y0 - 0.05, winZ1)],
    [v(x0 - 0.05, y0 + 1, winZ0), v(x0 - 0.05, y1 - 1, winZ0), v(x0 - 0.05, y1 - 1, winZ1), v(x0 - 0.05, y0 + 1, winZ1)],
    [v(x1 + 0.05, y0 + 1, winZ0), v(x1 + 0.05, y1 - 1, winZ0), v(x1 + 0.05, y1 - 1, winZ1), v(x1 + 0.05, y0 + 1, winZ1)],
  ];
  const normals = [v(0, -1, 0), v(-1, 0, 0), v(1, 0, 0)];
  windowFaces.forEach((face, i) => {
    if (dot(normals[i], sub(CAM, centroid(face))) > 0) prims.push({ d: pathOf(face), fill: glassColour, opacity: 0.8 });
  });
  let top = h;
  if (opts.pitched) {
    const ridge = h + Math.min(4, (y1 - y0) * 0.35);
    const ym = (y0 + y1) / 2;
    const section: Array<[number, number]> = [[y0 - 0.5, h], [ym, ridge], [y1 + 0.5, h]];
    const roofFaces = prismFaces(section, x0 - 0.5, x1 + 0.5, (along, out, z) => v(along, out, z));
    prims.push(...solid(roofFaces, opts.roof ?? C.roofDark));
    top = ridge;
  } else {
    prims.push(...solid(boxFaces(x0 - 0.2, y0 - 0.2, h, x1 + 0.2, y1 + 0.2, h + 0.4), opts.roof ?? C.roof));
    top = h + 0.4;
  }
  scene.shadowSolid([...rect(x0, y0, x1, y1, 0), ...rect(x0, y0, x1, y1, top)], 0.3);
  scene.add(prims, v((x0 + x1) / 2, (y0 + y1) / 2, h / 2));
  return v((x0 + x1) / 2, (y0 + y1) / 2, top);
}

function car(scene: Scene, x: number, y: number, along: "x" | "y", colour: string) {
  const [hx, hy] = along === "x" ? [2.1, 0.9] : [0.9, 2.1];
  const body = solid(boxFaces(x - hx, y - hy, 0.2, x + hx, y + hy, 1), colour, { outline: false });
  const cab = solid(boxFaces(x - hx * 0.55, y - hy * 0.8, 1, x + hx * 0.45, y + hy * 0.8, 1.45), shade(colour, 0.7).replace("rgb", "rgb"), { outline: false });
  scene.shadowSolid([...rect(x - hx, y - hy, x + hx, y + hy, 0), ...rect(x - hx, y - hy, x + hx, y + hy, 1.4)], 0.22);
  scene.add([...body, ...cab.map((p) => ({ ...p, fill: "#2d3a44" }))], v(x, y, 0.7));
}

function carPark(scene: Scene, stage: number, rand: () => number): V3 {
  const x0 = -118;
  const x1 = stage >= 2 ? -90 : -94;
  const y0 = -76;
  const y1 = stage >= 2 ? -36 : -30;
  scene.flat(rect(x0, y0, x1, y1), stage >= 1 ? C.tarmac : C.gravel);
  if (stage >= 1) {
    for (let y = y0 + 3; y <= y1 - 3; y += 2.6) {
      scene.flatLine([v(x0 + 1, y), v(x0 + 6, y)], "#e9e9e2", 0.8, 0.7);
      scene.flatLine([v(x1 - 6, y), v(x1 - 1, y)], "#e9e9e2", 0.8, 0.7);
    }
  }
  const palette = ["#b8322c", "#dfe3e6", "#23324a", "#8a9097", "#1d1f22", "#3d6ea5", "#c9b27a"];
  const fill = 0.35 + stage * 0.08;
  for (let y = y0 + 3.5; y <= y1 - 3; y += 2.6) {
    if (rand() < fill) car(scene, x0 + 3.5, y, "x", palette[Math.floor(rand() * palette.length)]);
    if (rand() < fill) car(scene, x1 - 3.5, y, "x", palette[Math.floor(rand() * palette.length)]);
  }
  return v((x0 + x1) / 2, (y0 + y1) / 2, 0);
}

function crane(scene: Scene, at: V3) {
  const base = v(at.x + 4, at.y - 3, 0);
  const h = Math.max(18, at.z + 12);
  const top = v(base.x, base.y, h);
  const jibEnd = v(base.x - 16, base.y + 6, h);
  const counter = v(base.x + 6, base.y - 2, h);
  scene.shadowLine(base, top, 1.6, 0.25);
  scene.shadowLine(counter, jibEnd, 1.2, 0.2);
  const line = (a: V3, b: V3, w: number, colour = C.crane) => ({
    d: pathOf([a, b], false),
    fill: "none",
    stroke: colour,
    sw: widthAt(a, w),
    cap: "round" as const,
  });
  scene.add(
    [
      line(base, top, 2.2),
      line(counter, jibEnd, 1.6),
      line(v(base.x, base.y, h + 3), jibEnd, 0.6, "#555"),
      line(v(base.x, base.y, h + 3), counter, 0.6, "#555"),
      line(top, v(base.x, base.y, h + 3), 1.4),
      line(v(jibEnd.x + 4, jibEnd.y - 1.5, h), v(jibEnd.x + 4, jibEnd.y - 1.5, h - 7), 0.5, "#333"),
    ],
    v(base.x, base.y, h / 2),
  );
}

/** Surface works: a roller, a tractor and a line of barriers. */
function groundworks(scene: Scene, at: V3) {
  const tractor = solid(boxFaces(at.x - 2, at.y - 1.1, 0, at.x + 1.2, at.y + 1.1, 1.6), "#d8641f");
  const cab = solid(boxFaces(at.x - 1.8, at.y - 0.9, 1.6, at.x - 0.2, at.y + 0.9, 2.8), "#c9d3d8");
  const roller = solid(boxFaces(at.x + 1.6, at.y - 1.6, 0, at.x + 3, at.y + 1.6, 1.1), "#6c7378");
  scene.shadowSolid([...rect(at.x - 2, at.y - 1.6, at.x + 3, at.y + 1.6), ...rect(at.x - 2, at.y - 1.6, at.x + 3, at.y + 1.6, 2.8)], 0.25);
  scene.add([...roller, ...tractor, ...cab], v(at.x, at.y, 1));
  const barriers: ScenePrimitive[] = [];
  for (let i = 0; i < 6; i += 1) {
    const x = at.x - 12 + i * 4.2;
    const y = at.y - 7;
    barriers.push({ d: pathOf([v(x, y, 0.9), v(x + 3.2, y, 0.9), v(x + 3.2, y, 0.3), v(x, y, 0.3)]), fill: i % 2 ? "#f2f2f2" : "#e8591a", stroke: "#8a3a12", sw: 0.4 });
  }
  scene.add(barriers, v(at.x - 2, at.y - 7, 0.5));
}

/* ------------------------------------------------------------------ */
/* Stage composition                                                   */
/* ------------------------------------------------------------------ */

function compose(scene: Scene, input: SceneInput, anchors: Record<string, V3>) {
  const stage = Math.max(0, Math.min(6, Math.round(input.stage)));
  const rand = rng(0x5eed + stage * 7919);

  countryside(scene, rng(20260924));
  neighbourPitch(scene, stage);

  // Paths and hard standing around the pitch.
  const ring = stage >= 2 ? 44 : 41;
  scene.flat(rect(-HALF_L - 11, -ring, HALF_L + 11, ring), stage >= 1 ? C.path : "#a8ad93");
  scene.flat(rect(-HALF_L - 7.5, -ring + 3, HALF_L + 7.5, ring - 3), "#6e9b44");
  pitch(scene, stage, input.pitchCondition);
  anchors.pitch = v(0, 0, 0);

  goal(scene, -HALF_L, 1);
  goal(scene, HALF_L, -1);

  // Access lane from the car park to the ground.
  if (stage >= 2) scene.flat([v(-90, -50), v(-90, -44), v(-70, -44), v(-70, -50)], C.path);
  else scene.flat([v(-92, -46), v(-92, -40), v(-60, -38), v(-60, -44)], C.path);

  anchors.parking = carPark(scene, stage, rand);

  if (stage <= 1) {
    // Ball-stop fence like a community 3G: tall behind the goals, lower along the sides.
    fenceRun(scene, rect(-HALF_L - 5.5, -HALF_W - 5.5, HALF_L + 5.5, HALF_W + 5.5), stage === 0 ? 4.5 : 3.2);
    // Spare training goals stacked outside the far fence.
    for (let i = 0; i < 5; i += 1) goal(scene, -30 + i * 14, -1, true, HALF_W + 9);
  } else {
    // Perimeter rail with advertising boards.
    const boards = rect(-HALF_L - 4.5, -HALF_W - 4.5, HALF_L + 4.5, HALF_W + 4.5);
    for (let i = 0; i < 4; i += 1) {
      const a = boards[i];
      const b = boards[(i + 1) % 4];
      const face = [a, b, v(b.x, b.y, 0.9), v(a.x, a.y, 0.9)];
      scene.add(
        [{ d: pathOf(face), fill: i % 2 ? "#1f6f69" : "#2a7f78", stroke: "#e7f2ef", sw: 0.6 }],
        v((a.x + b.x) / 2, (a.y + b.y) / 2, 0.5),
      );
    }
  }

  // Dugouts on the near (East) touchline.
  for (const x of [-10, 10]) {
    const x0 = x - 4;
    const x1 = x + 4;
    const y0 = -HALF_W - 4;
    const y1 = -HALF_W - 2.4;
    scene.add(solid(boxFaces(x0, y0, 0, x1, y1, 2.2), "#cfd6da"), v(x, (y0 + y1) / 2, 1));
    scene.shadowSolid([...rect(x0, y0, x1, y1), ...rect(x0, y0, x1, y1, 2.2)], 0.22);
  }

  /* ---- Floodlights ---- */
  const lightStyle = stage <= 1 ? "auto" : LOOK?.floodlights ?? "auto";
  if (stage <= 1) {
    const h = stage === 0 ? 15 : 18;
    for (const x of [-38, 0, 38]) {
      floodlight(scene, x, HALF_W + 7, h, x, 0);
      floodlight(scene, x, -HALF_W - 7, h, x, 0);
    }
  } else if (lightStyle === "pylons" || (lightStyle === "auto" && stage >= 5)) {
    const h = stage >= 5 ? 44 : 34;
    for (const [x, y] of [[-76, 60], [76, 60], [76, -58], [-76, -58]]) floodlight(scene, x, y, h, 0, 0, true);
  } else if (lightStyle === "masts" || lightStyle === "auto") {
    const h = 20 + Math.min(stage, 4) * 3;
    const westY = stage === 2 ? 51 : stage === 3 ? 54 : 64;
    const eastY = stage === 2 ? -47 : stage === 3 ? -51 : -53;
    for (const x of [-42, -14, 14, 42]) {
      floodlight(scene, x, westY, h + 6, x, 0);
      floodlight(scene, x, eastY, h, x, 0);
    }
  }
  // Gantries are drawn on the roof fronts once the stands exist (below).

  /* ---- West (main) and East sides ---- */
  const westFront = HALF_W + 7;
  const eastFront = HALF_W + 7;
  if (stage === 0) {
    // Open hard standing with a small shelter and benches.
    const shelter = stand(scene, { side: "W", from: -9, to: 9, front: westFront + 2, depth: 3, rake: 1.4, roof: true, seat: C.seat });
    anchors.main = shelter;
    for (const x of [-30, -20, 20, 30]) {
      scene.add(solid(boxFaces(x - 1.5, westFront + 1.5, 0, x + 1.5, westFront + 2.1, 0.5), "#8a6a45"), v(x, westFront + 2, 0.3));
    }
    anchors.stands = v(0, -HALF_W - 9, 1);
  } else {
    const main: StandSpec =
      stage === 1
        ? { side: "W", from: -18, to: 18, front: westFront, depth: 6, rake: 3.2, roof: true, seat: C.seat }
        : stage === 2
          ? { side: "W", from: -34, to: 34, front: westFront, depth: 9, rake: 5, roof: true, seat: C.seat, back: C.brick }
          : stage === 3
            ? { side: "W", from: -48, to: 48, front: westFront, depth: 12, rake: 6.5, roof: true, seat: C.seat, back: C.brick }
            : stage === 4
              ? { side: "W", from: -52, to: 52, front: westFront, depth: 13, rake: 7, roof: true, seat: C.seat, upper: { depth: 8, rake: 6 } }
              : { side: "W", from: -56, to: 56, front: westFront, depth: 14, rake: 7.5, roof: true, seat: C.seat, upper: { depth: 12, rake: 10 } };
    anchors.main = stand(scene, styled(main, stage));

    const east: StandSpec =
      stage === 1
        ? { side: "E", from: -14, to: 14, front: eastFront + 1, depth: 3.5, rake: 1.2, roof: true, seat: "#9aa3a8" }
        : stage === 2
          ? { side: "E", from: -40, to: 40, front: eastFront, depth: 5, rake: 2.2, roof: true, seat: "#9aa3a8" }
          : stage <= 4
            ? { side: "E", from: -48, to: 48, front: eastFront, depth: stage === 3 ? 9 : 11, rake: stage === 3 ? 4.5 : 6, roof: true, seat: C.seatAlt }
            : { side: "E", from: -56, to: 56, front: eastFront, depth: 13, rake: 7, roof: true, seat: C.seatAlt, upper: stage === 6 ? { depth: 10, rake: 8 } : undefined };
    anchors.stands = stand(scene, styled(east, stage));

    if (lightStyle === "gantry" && stage >= 2) {
      const z = 8 + Math.min(stage, 4) * 2.2;
      gantryLights(scene, westFront - 1.4, z, -40, 40);
      gantryLights(scene, -(eastFront - 1.4), z - 2, -40, 40);
    }
  }

  /* ---- Ends ---- */
  if (stage >= 2) {
    const endSpec = (side: Side): StandSpec =>
      stage === 2
        ? { side, from: -24, to: 24, front: HALF_L + 7, depth: 4, rake: 1.6, roof: false, seat: "#a9b0b3" }
        : stage === 3
          ? { side, from: -30, to: 30, front: HALF_L + 7, depth: 8, rake: 4, roof: true, seat: C.seatAlt }
          : { side, from: -34, to: 34, front: HALF_L + 7, depth: stage >= 5 ? 14 : 10, rake: stage >= 5 ? 8 : 5.5, roof: true, seat: C.seatAlt, upper: stage === 6 ? { depth: 8, rake: 7 } : undefined };
    stand(scene, styled(endSpec("N"), stage));
    stand(scene, styled(endSpec("S"), stage));
  }
  if (stage >= 4) {
    // Corners filled with lower infill blocks.
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x0 = sx > 0 ? HALF_L + 7 : -HALF_L - 20;
      const x1 = sx > 0 ? HALF_L + 20 : -HALF_L - 7;
      const y0 = sy > 0 ? HALF_W + 7 : -HALF_W - 18;
      const y1 = sy > 0 ? HALF_W + 18 : -HALF_W - 7;
      building(scene, x0, y0, x1, y1, stage === 6 ? 16 : stage === 5 ? 12 : 8, C.cladding, { roof: C.roof });
    }
  }

  /* ---- Club buildings ---- */
  if (stage === 0) {
    // Portacabins for offices and changing, a kiosk for the shop.
    anchors.offices = building(scene, -80, -8, -68, -2, 2.8, C.cabin, { roof: "#8f8f8a" });
    building(scene, -80, 2, -68, 8, 2.8, C.cabin, { roof: "#8f8f8a" });
    anchors.shop = building(scene, -72, -36, -66, -31, 2.5, "#3d6a8a", { roof: "#8f8f8a" });
    anchors.hospitality = building(scene, 64, 18, 72, 24, 2.6, "#e8e2d2", { roof: "#b04a3a" });
  } else {
    const clubhouseH = 4 + Math.min(stage, 4) * 1.5;
    anchors.offices =
      stage === 1
        ? building(scene, -84, -10, -66, 12, clubhouseH, "#c8b89a", { pitched: true, roof: C.roofDark })
        : building(scene, -106, -8, -84, 16, clubhouseH, C.brick, { pitched: stage === 2, roof: C.roofDark });
    anchors.shop =
      stage === 1
        ? building(scene, -78, -40, -66, -30, 4.5, "#3d6a8a", { roof: C.roof })
        : building(scene, -102, -30, -88, -18, 3.5 + Math.min(stage, 3), stage >= 3 ? "#1f6f69" : "#3d6a8a", { roof: C.roof });
    anchors.hospitality =
      stage <= 2
        ? building(scene, 66, 16, 80, 28, 4, "#e8e2d2", { glassy: true })
        : building(scene, 92, 14, 116, 40, 6 + stage * 2, C.cladding, { glassy: true, roof: C.roofDark });
  }

  // Turnstile block / entrance gate by the car park lane.
  anchors.access =
    stage >= 2
      ? building(scene, -90, -56, -82, -50, 3.2, C.brick, { roof: C.roofDark })
      : building(scene, -64, -46, -58, -40, 2.2, "#6f7b83", { roof: C.roofDark });

  treeBelts(scene, rand);

  for (const id of input.worksAt) {
    const at = anchors[id];
    if (!at) continue;
    if (id === "pitch" || id === "parking") groundworks(scene, id === "pitch" ? v(-HALF_L + 22, 6, 0) : at);
    else crane(scene, at);
  }
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/* Slot-based composition (GroundDesign)                               */
/* ------------------------------------------------------------------ */
/*
 * Axes follow sideMapper (authoritative): +x = North end, -x = South end,
 * +y = West (main) touchline, -y = East touchline, +z = up.
 *
 * Each side, corner, fence run, fixture and building is an independent object
 * so painter-order sorting holds from any orbit angle. Every component also
 * registers a selectable anchor and a footprint so Ground Studio can select and
 * highlight it. Optional design fields fall back to "auto" choices that follow
 * the ground's size, so old saves and generated away grounds keep rendering.
 */

const SIDE_SIGN: Record<CornerSlot, [number, number]> = { NW: [1, 1], NE: [1, -1], SW: [-1, 1], SE: [-1, -1] };
const isTouchline = (side: StandSide) => side === "W" || side === "E";
const clampN = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const sideFront = (side: StandSide, d: GroundStandDesign) => (isTouchline(side) ? HALF_W : HALF_L) + 3 + clampN(d.setback, 2, 10);

/** Selectable components and their outlines, gathered while composing. */
interface Selectable {
  anchor: V3;
  /** Ground footprint (closed polygon at z = 0). */
  footprint: V3[];
  /** Height of the highlight box (0 = flat outline). */
  height: number;
}
let SELECTABLES: Record<string, Selectable> = {};
const select = (id: string, anchor: V3, footprint: V3[], height = 0) => {
  SELECTABLES[id] = { anchor, footprint, height };
};

interface SideColours { seat: string; seatAlt: string; roof: string; roofDark: string; cladding: string; own: boolean }
function sideColours(side: StandSide): SideColours {
  const own = LOOK?.standColours?.[side];
  if (own) return { ...own, own: true };
  return { seat: C.seat, seatAlt: C.seatAlt, roof: C.roof, roofDark: C.roofDark, cladding: C.brick, own: false };
}

const MATERIAL_TONE: Record<StandMaterial, string> = {
  brick: "#9a5d42",
  timber: "#8a6a45",
  concrete: "#b5b1a6",
  cladding: "#cfd3d6",
};
function defaultMaterialFor(form: GroundStandDesign["form"]): StandMaterial {
  return form === "shelter" ? "timber" : form === "terrace" ? "concrete" : form === "traditional" ? "brick" : "cladding";
}
/** Back/fascia colour: a per-stand cladding colour wins; otherwise the material. */
function backColour(side: StandSide, d: GroundStandDesign): string {
  const colours = sideColours(side);
  const material = d.material ?? defaultMaterialFor(d.form);
  if (colours.own) return colours.cladding;
  // The ground-wide "cladding" choice tints brick (as it always has).
  if (material === "brick") return C.brick;
  return MATERIAL_TONE[material];
}

function maxStandLevel(design: GroundDesign) {
  return Math.max(...(["N", "E", "S", "W"] as StandSide[]).map((side) => design.stands[side].level));
}

/* ---------------- Stands ---------------- */

function designedStandSpec(side: StandSide, d: GroundStandDesign): StandSpec | null {
  if (d.form === "open") return null;
  const maxSpan = isTouchline(side) ? 100 : 64;
  const span = clampN(d.span, 12, maxSpan);
  const front = sideFront(side, d);
  const depth = clampN(d.depth, 3, 26);
  const colours = sideColours(side);
  const twoToneAlt = !colours.own && LOOK?.twoTone && side !== "W";
  const base = {
    side,
    front,
    seat: twoToneAlt ? colours.seatAlt : colours.seat,
    terrace: d.standing === "terrace",
    rearDetail: true,
    back: backColour(side, d),
    roofColour: colours.roof,
    roofDark: colours.roofDark,
  } as const;
  let spec: StandSpec;
  switch (d.form) {
    case "shelter": {
      const w = Math.min(span, 26);
      spec = { ...base, from: -w / 2, to: w / 2, depth: 3, rake: 1.2, roof: true };
      break;
    }
    case "terrace": {
      const dd = clampN(depth * 0.8, 4, 16);
      spec = { ...base, terrace: true, from: -span / 2, to: span / 2, depth: dd, rake: dd * 0.34, roof: d.roof !== "open" };
      break;
    }
    case "traditional":
      spec = { ...base, from: -span / 2, to: span / 2, depth, rake: depth * 0.55, roof: d.roof !== "open" };
      break;
    case "cantilever":
      spec = { ...base, from: -span / 2, to: span / 2, depth, rake: depth * 0.6, roof: true, cantilever: true };
      break;
    default:
      spec = { ...base, from: -span / 2, to: span / 2, depth: depth * 0.7, rake: depth * 0.42, roof: true, cantilever: true, upper: { depth: depth * 0.55, rake: depth * 0.45 } };
  }
  // The home end (the Kop): deeper and steeper, single tier, always covered.
  if (LOOK?.homeEnd === side && !isTouchline(side)) {
    spec = { ...spec, depth: spec.depth + 3, rake: spec.rake + 1.5, roof: true, upper: undefined };
  }
  return spec;
}

/** Visual depth of a side (for footprints, framing and what sits behind it). */
function standReach(side: StandSide, d: GroundStandDesign): number {
  const spec = designedStandSpec(side, d);
  if (!spec) return 6;
  return spec.depth + (spec.upper ? spec.upper.depth + 1 : 0) + 1;
}

function standHeight(spec: StandSpec): number {
  const top = spec.rake + (spec.upper ? spec.upper.rake + 4.5 : 0);
  return top + (spec.roof ? 4.8 : 1);
}

/** Hard standing (and a grass bank) where a side has no stand. */
function openSide(scene: Scene, side: StandSide, d: GroundStandDesign): V3 {
  const W = sideMapper(side, sideFront(side, d) - 2);
  const half = isTouchline(side) ? 44 : 28;
  scene.flat([W(-half, 0, 0), W(half, 0, 0), W(half, 3.2, 0), W(-half, 3.2, 0)], C.concrete, 0.9);
  scene.flat([W(-half, 3.2, 0), W(half, 3.2, 0), W(half, 6.5, 0), W(-half, 6.5, 0)], "#5f8f3f", 0.85);
  return W(0, 2, 1);
}

/* ---------------- Corners ---------------- */

function cornerFrame(slot: CornerSlot, design: GroundDesign) {
  const [sx, sy] = SIDE_SIGN[slot];
  const end: StandSide = sx > 0 ? "N" : "S";
  const touch: StandSide = sy > 0 ? "W" : "E";
  const endSpec = designedStandSpec(end, design.stands[end]);
  const touchSpec = designedStandSpec(touch, design.stands[touch]);
  // A: where the end stand stops; B: where the touchline stand stops.
  const endHalf = endSpec ? (endSpec.to - endSpec.from) / 2 : HALF_W - 6;
  const touchHalf = touchSpec ? (touchSpec.to - touchSpec.from) / 2 : HALF_L - 8;
  const A = v(sx * sideFront(end, design.stands[end]), sy * Math.min(endHalf + 0.5, HALF_W + 10), 0);
  const B = v(sx * Math.min(touchHalf + 0.5, HALF_L + 10), sy * sideFront(touch, design.stands[touch]), 0);
  const mid = v((A.x + B.x) / 2, (A.y + B.y) / 2, 0);
  let along = norm(sub(B, A));
  let out = v(along.y, -along.x, 0);
  if (dot(out, v(sx, sy, 0)) < 0) out = v(-out.x, -out.y, 0);
  // Keep "along" right-handed relative to "out" so the stand faces the pitch.
  along = v(-out.y, out.x, 0);
  const gap = Math.hypot(B.x - A.x, B.y - A.y);
  const mapper = (a: number, o: number, z: number) => v(mid.x + along.x * a + out.x * o, mid.y + along.y * a + out.y * o, z);
  const neighbourDepth = Math.min(endSpec?.depth ?? 8, touchSpec?.depth ?? 8);
  return { sx, sy, mapper, end, touch, gap, neighbourDepth };
}

function corner(scene: Scene, slot: CornerSlot, design: GroundDesign) {
  const c = design.corners[slot];
  const f = cornerFrame(slot, design);
  const large = c.size === "large";
  const half = Math.max(3, Math.min(large ? f.gap / 2 : 6, f.gap / 2));
  const foot = (depth: number) => [f.mapper(-half, 0, 0), f.mapper(half, 0, 0), f.mapper(half, depth, 0), f.mapper(-half, depth, 0)];
  const anchor = f.mapper(0, 4, 2);
  switch (c.form) {
    case "access": {
      // A gate in the corner, a path out and a little turnstile hut.
      scene.flat([f.mapper(-2.2, -2, 0), f.mapper(2.2, -2, 0), f.mapper(2.2, 16, 0), f.mapper(-2.2, 16, 0)], C.path);
      const g0 = f.mapper(-2.4, 0.5, 0);
      const g1 = f.mapper(2.4, 0.5, 0);
      scene.add([
        { d: pathOf([g0, v(g0.x, g0.y, 2.6)], false), fill: "none", stroke: "#3b3f43", sw: widthAt(g0, 1.2) },
        { d: pathOf([g1, v(g1.x, g1.y, 2.6)], false), fill: "none", stroke: "#3b3f43", sw: widthAt(g1, 1.2) },
        { d: pathOf([v(g0.x, g0.y, 2.4), v(g1.x, g1.y, 2.4)], false), fill: "none", stroke: "#3b3f43", sw: widthAt(g0, 0.7) },
        { d: pathOf([v(g0.x, g0.y, 1.2), v(g1.x, g1.y, 1.2)], false), fill: "none", stroke: "#e8a33d", sw: widthAt(g0, 0.5), opacity: 0.9 },
      ], v((g0.x + g1.x) / 2, (g0.y + g1.y) / 2, 1.2));
      const hut = f.mapper(4.5, 3, 0);
      scene.add(solid(boxFaces(hut.x - 1.4, hut.y - 1.4, 0, hut.x + 1.4, hut.y + 1.4, 2.5), C.brick), v(hut.x, hut.y, 1.2));
      scene.shadowSolid([...rect(hut.x - 1.4, hut.y - 1.4, hut.x + 1.4, hut.y + 1.4), ...rect(hut.x - 1.4, hut.y - 1.4, hut.x + 1.4, hut.y + 1.4, 2.5)], 0.22);
      select(`corner:${slot}`, anchor, foot(14), 3);
      return;
    }
    case "terrace":
      {
        const depth = large ? Math.max(7, f.neighbourDepth * 0.8) : 6;
        stand(scene, { side: f.end, front: 0, mapper: f.mapper, from: -half, to: half, depth, rake: depth * 0.36, roof: false, seat: C.terrace, terrace: true, rearDetail: false, back: MATERIAL_TONE.concrete });
        select(`corner:${slot}`, anchor, foot(depth), depth * 0.36 + 1);
      }
      return;
    case "seated": {
      const colours = sideColours(f.touch);
      const depth = large ? Math.max(9, f.neighbourDepth * 0.85) : 8;
      stand(scene, { side: f.end, front: 0, mapper: f.mapper, from: -half, to: half, depth, rake: depth * 0.5, roof: true, cantilever: true, seat: colours.seatAlt, back: MATERIAL_TONE.cladding, rearDetail: true, roofColour: colours.roof, roofDark: colours.roofDark });
      select(`corner:${slot}`, anchor, foot(depth), depth * 0.5 + 4.8);
      return;
    }
    default:
      // Open corners (and pylon corners, whose pylon is drawn with the lights) stay grass.
      select(`corner:${slot}`, anchor, foot(8), 0);
  }
}

/* ---------------- Perimeter ---------------- */

function perimeterTone(design: GroundDesign): string {
  switch (design.perimeter.colour) {
    case "club": return LOOK?.seat ?? C.seat;
    case "green": return "#2f6b3c";
    case "galvanized": return "#a8b0b5";
    default: return "#f1f3f0";
  }
}

function perimeter(scene: Scene, design: GroundDesign) {
  const inset = 4.2;
  const loop = rect(-HALF_L - inset, -HALF_W - inset, HALF_L + inset, HALF_W + inset);
  const style = design.perimeter.style;
  const tone = perimeterTone(design);
  const gates = new Set(design.perimeter.gates ?? ["N", "S"]);
  // Which side a fence position belongs to (for gate gaps).
  const sideAt = (m: V3): StandSide => (Math.abs(m.x) > HALF_L ? (m.x > 0 ? "N" : "S") : m.y > 0 ? "W" : "E");
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const segments = Math.max(1, Math.round(len / 8));
    for (let k = 0; k < segments; k += 1) {
      const p0 = v(a.x + ((b.x - a.x) * k) / segments, a.y + ((b.y - a.y) * k) / segments);
      const p1 = v(a.x + ((b.x - a.x) * (k + 1)) / segments, a.y + ((b.y - a.y) * (k + 1)) / segments);
      const mid = v((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      // Gate: leave the middle of that side open.
      const side = sideAt(mid);
      const alongCentre = isTouchline(side) ? Math.abs(mid.x) : Math.abs(mid.y);
      if (gates.has(side) && alongCentre < 4.5) continue;
      const prims: ScenePrimitive[] = [];
      if (style === "chainLink") {
        const h = 2.4;
        prims.push({ d: pathOf([p0, p1, v(p1.x, p1.y, h), v(p0.x, p0.y, h)]), fill: tone === "#f1f3f0" ? "#8f979c" : tone, opacity: 0.32 });
        // Diamond mesh hint.
        for (let q = 0; q < 4; q += 1) {
          const t0 = q / 4;
          const t1 = (q + 1) / 4;
          const m0 = v(p0.x + (p1.x - p0.x) * t0, p0.y + (p1.y - p0.y) * t0, 0.2);
          const m1 = v(p0.x + (p1.x - p0.x) * t1, p0.y + (p1.y - p0.y) * t1, h - 0.2);
          prims.push({ d: pathOf([m0, m1], false), fill: "none", stroke: "#6f777c", sw: widthAt(m0, 0.25), opacity: 0.6 });
        }
        prims.push({ d: pathOf([v(p0.x, p0.y, h), v(p1.x, p1.y, h)], false), fill: "none", stroke: "#4f575c", sw: widthAt(p0, 0.6) });
        for (const p of [p0, p1]) prims.push({ d: pathOf([p, v(p.x, p.y, h)], false), fill: "none", stroke: "#4f575c", sw: widthAt(p, 0.7) });
        scene.shadowPoly([p0, p1, v(p1.x, p1.y, h), v(p0.x, p0.y, h)], 0.08);
      } else if (style === "brick") {
        const nx = -(p1.y - p0.y) / len;
        const ny = (p1.x - p0.x) / len;
        const at = (t: number, o: number, z: number) => v(p0.x + (p1.x - p0.x) * t + nx * o, p0.y + (p1.y - p0.y) * t + ny * o, z);
        prims.push(...solid(prismFaces([[-0.17, 0], [-0.17, 1.1], [0.17, 1.1], [0.17, 0]], 0, 1, (t, o, z) => at(t, o, z)), "#9a5d42"));
        prims.push({ d: pathOf([at(0, 0, 1.12), at(1, 0, 1.12)], false), fill: "none", stroke: "#cfc6b6", sw: widthAt(p0, 0.6) });
        scene.shadowPoly([p0, p1, v(p1.x, p1.y, 1.1), v(p0.x, p0.y, 1.1)], 0.12);
      } else if (style === "hoardings") {
        const tones = ["#1f6f69", "#c8102e", "#f2c14e", "#23324a", "#ffffff", tone];
        const fill = tones[(i * 5 + k * 3) % tones.length];
        prims.push({ d: pathOf([p0, p1, v(p1.x, p1.y, 0.95), v(p0.x, p0.y, 0.95)]), fill, stroke: "#e7f2ef", sw: 0.5 });
        const s0 = v(p0.x + (p1.x - p0.x) * 0.2, p0.y + (p1.y - p0.y) * 0.2, 0.45);
        const s1 = v(p0.x + (p1.x - p0.x) * 0.8, p0.y + (p1.y - p0.y) * 0.8, 0.45);
        prims.push({ d: pathOf([s0, s1], false), fill: "none", stroke: fill === "#ffffff" || fill === "#f2c14e" ? "#23324a" : "#ffffff", sw: widthAt(s0, 1.1), opacity: 0.9 });
        scene.shadowPoly([p0, p1, v(p1.x, p1.y, 0.95), v(p0.x, p0.y, 0.95)], 0.14);
      } else {
        // Tubular rail, or heavier crush barriers.
        const barrier = style === "barrier";
        const h = barrier ? 1.15 : 1.05;
        const w = barrier ? 1.3 : 0.85;
        const rail = barrier ? (tone === "#f1f3f0" ? "#59636b" : tone) : tone;
        prims.push({ d: pathOf([v(p0.x, p0.y, h), v(p1.x, p1.y, h)], false), fill: "none", stroke: rail, sw: widthAt(p0, w), cap: "round" });
        if (barrier) prims.push({ d: pathOf([v(p0.x, p0.y, 0.55), v(p1.x, p1.y, 0.55)], false), fill: "none", stroke: rail, sw: widthAt(p0, 0.8), cap: "round" });
        for (let q = 0; q <= (barrier ? 2 : 3); q += 1) {
          const t = q / (barrier ? 2 : 3);
          const p = v(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t);
          prims.push({ d: pathOf([p, v(p.x, p.y, h)], false), fill: "none", stroke: rail, sw: widthAt(p, w * 0.8), cap: "round" });
        }
        scene.shadowLine(v(p0.x, p0.y, h), v(p1.x, p1.y, h), w, 0.16);
      }
      scene.add(prims, v(mid.x, mid.y, 0.5));
    }
  }
  select("perimeter", v(0, -HALF_W - inset, 1.2), loop, 1.2);
}

/* ---------------- Fixtures ---------------- */

function dugouts(scene: Scene, design: GroundDesign) {
  const level = maxStandLevel(design);
  const chosen = design.fixtures?.dugouts ?? "auto";
  const style = chosen === "auto" ? (level >= 4 ? "perspex" : level >= 3 ? "brick" : "wooden") : chosen;
  for (const x of [-9, 9]) {
    const x0 = x - 3.6;
    const x1 = x + 3.6;
    const y0 = HALF_W + 2.2;
    const y1 = HALF_W + 3.9;
    const prims: ScenePrimitive[] = [];
    if (style === "perspex") {
      // Clear curved-look shell over a row of seats.
      prims.push(...solid(boxFaces(x0 + 0.3, y0 + 0.5, 0, x1 - 0.3, y1 - 0.1, 0.7), "#2a3036"));
      prims.push(...solid(prismFaces([[0, 0], [0, 2.1], [1.2, 2.3], [1.7, 1.6], [1.7, 0]], x0, x1, (a, o, z) => v(a, y0 + o, z)), "#a9d3e2").map((p) => ({ ...p, opacity: 0.5 })));
    } else if (style === "brick") {
      prims.push(...solid(boxFaces(x0, y0 + 0.9, 0, x1, y1, 2.1), "#9a5d42"));
      prims.push(...solid(boxFaces(x0 - 0.2, y0 - 0.1, 2.1, x1 + 0.2, y1 + 0.1, 2.35), C.roofDark));
      prims.push(...solid(boxFaces(x0 + 0.4, y0 + 0.2, 0, x1 - 0.4, y0 + 0.9, 0.6), "#2a3036"));
    } else {
      // Wooden hut with a dark open front.
      prims.push(...solid(boxFaces(x0, y0, 0, x1, y1, 2), "#8a6a45"));
      prims.push({ d: pathOf([v(x0 + 0.5, y0 - 0.02, 0.4), v(x1 - 0.5, y0 - 0.02, 0.4), v(x1 - 0.5, y0 - 0.02, 1.6), v(x0 + 0.5, y0 - 0.02, 1.6)]), fill: "#2b231b", opacity: 0.9 });
    }
    scene.shadowSolid([...rect(x0, y0, x1, y1), ...rect(x0, y0, x1, y1, 2.2)], 0.22);
    scene.add(prims, v(x, (y0 + y1) / 2, 1));
  }
  select("dugouts", v(0, HALF_W + 3, 2.5), rect(-13, HALF_W + 2, 13, HALF_W + 4.2), 2.4);
}

function scoreboard(scene: Scene, design: GroundDesign) {
  const level = maxStandLevel(design);
  const chosen = design.fixtures?.scoreboard ?? "auto";
  const style = chosen === "auto" ? (level >= 4 ? "electronic" : "manual") : chosen;
  if (style === "none") return;
  // Behind an open end if there is one, otherwise in the South-East corner.
  const openEnd = (["N", "S"] as StandSide[]).find((side) => design.stands[side].form === "open");
  const x = openEnd ? (openEnd === "N" ? 1 : -1) * (sideFront(openEnd, design.stands[openEnd]) + 9) : -(sideFront("S", design.stands.S) + 6);
  const y = openEnd ? 18 : -(sideFront("E", design.stands.E) + 6);
  const prims: ScenePrimitive[] = [];
  const electronic = style === "electronic";
  const legH = electronic ? 6 : 2.6;
  const h = electronic ? 4 : 2.8;
  const w = electronic ? 5 : 3.2;
  for (const dy of [-w + 0.4, w - 0.4]) prims.push({ d: pathOf([v(x, y + dy, 0), v(x, y + dy, legH)], false), fill: "none", stroke: "#3b3f43", sw: widthAt(v(x, y, 0), electronic ? 1.1 : 0.8) });
  // Face the pitch: the board's normal points towards x = 0.
  const fx = x > 0 ? -0.06 : 0.06;
  const board = [v(x, y - w, legH), v(x, y + w, legH), v(x, y + w, legH + h), v(x, y - w, legH + h)];
  prims.push(...solid(prismFaces([[-0.25, legH], [-0.25, legH + h], [0.25, legH + h], [0.25, legH]], y - w, y + w, (a, o, z) => v(x + o, a, z)), electronic ? "#15181b" : "#1f2a24"));
  if (electronic) {
    // Lit amber score and a glow.
    for (const [dy, tone] of [[-2.4, "#ffcf5a"], [-0.8, "#ffffff"], [0.8, "#ffffff"], [2.4, "#ffcf5a"]] as const) {
      prims.push({ d: pathOf([v(x + fx * 5, y + dy - 0.55, legH + 1), v(x + fx * 5, y + dy + 0.55, legH + 1), v(x + fx * 5, y + dy + 0.55, legH + 3), v(x + fx * 5, y + dy - 0.55, legH + 3)]), fill: tone, opacity: 0.95 });
    }
  } else {
    // HOME 0 - 0 AWAY on hand-turned tiles.
    for (const [dy, tone] of [[-1.9, "#f2f0e6"], [-0.65, "#f2c14e"], [0.65, "#f2c14e"], [1.9, "#f2f0e6"]] as const) {
      prims.push({ d: pathOf([v(x + fx * 5, y + dy - 0.45, legH + 0.6), v(x + fx * 5, y + dy + 0.45, legH + 0.6), v(x + fx * 5, y + dy + 0.45, legH + 2.1), v(x + fx * 5, y + dy - 0.45, legH + 2.1)]), fill: tone, opacity: 0.92 });
    }
  }
  scene.shadowPoly(board, 0.18);
  scene.add(prims, v(x, y, legH));
  select("scoreboard", v(x, y, legH + h), rect(x - 1.5, y - w - 1, x + 1.5, y + w + 1), legH + h);
}

/* ---------------- Floodlights ---------------- */

function latticePylon(scene: Scene, x: number, y: number, h: number) {
  const dir = norm(v(-x, -y, 0));
  const side = v(-dir.y, dir.x, 0);
  const legs = [-1, 1].map((k) => v(x + side.x * 2.4 * k, y + side.y * 2.4 * k, 0));
  const top = v(x, y, h);
  const prims: ScenePrimitive[] = [];
  const line = (a: V3, b: V3, w: number) => ({ d: pathOf([a, b], false), fill: "none", stroke: "#7f878d", sw: widthAt(a, w), cap: "round" as const });
  for (const leg of legs) prims.push(line(leg, top, 0.9));
  for (let k = 0; k < 6; k += 1) {
    const t0 = k / 6;
    const t1 = (k + 1) / 6;
    const l0 = v(legs[0].x + (top.x - legs[0].x) * t0, legs[0].y + (top.y - legs[0].y) * t0, h * t0);
    const r1 = v(legs[1].x + (top.x - legs[1].x) * t1, legs[1].y + (top.y - legs[1].y) * t1, h * t1);
    prims.push(line(l0, r1, 0.45));
  }
  const hw = 3.4;
  const fh = 3;
  const frame = [
    v(x - side.x * hw, y - side.y * hw, h),
    v(x + side.x * hw, y + side.y * hw, h),
    v(x + side.x * hw + dir.x * 0.8, y + side.y * hw + dir.y * 0.8, h + fh),
    v(x - side.x * hw + dir.x * 0.8, y - side.y * hw + dir.y * 0.8, h + fh),
  ];
  prims.push({ d: pathOf(frame), fill: "#3b4148", stroke: "#23282d", sw: 0.6 });
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      const u = (c + 0.5) / 4;
      const w2 = (r + 0.5) / 3;
      const p = v(
        frame[0].x + (frame[1].x - frame[0].x) * u + (frame[3].x - frame[0].x) * w2 + dir.x * 0.1,
        frame[0].y + (frame[1].y - frame[0].y) * u + (frame[3].y - frame[0].y) * w2 + dir.y * 0.1,
        h + fh * w2,
      );
      const sp = project(p);
      const rr = (FOCAL * 0.42) / sp.d;
      prims.push({ d: `M${f1(sp.x - rr)} ${f1(sp.y)}a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(rr * 2)} 0a${f1(rr)} ${f1(rr)} 0 1 0 ${f1(-rr * 2)} 0`, fill: C.lightHead, opacity: 0.95 });
    }
  }
  scene.shadowLine(v(x, y, 0), top, 1.6, 0.22);
  scene.add(prims, v(x, y, h / 2));
}

/** Short pitch-side posts with a single lamp: the most basic floodlights. */
function lampPost(scene: Scene, x: number, y: number, h: number) {
  const base = v(x, y, 0);
  const top = v(x, y, h);
  const head = [v(x - 0.7, y, h), v(x + 0.7, y, h), v(x + 0.7, y, h + 0.6), v(x - 0.7, y, h + 0.6)];
  scene.shadowLine(base, top, 0.9, 0.22);
  scene.add([
    { d: pathOf([base, top], false), fill: "none", stroke: "#8d949a", sw: widthAt(base, 0.9), cap: "round" },
    { d: pathOf(head), fill: C.lightHead, stroke: "#3b4148", sw: 0.5 },
  ], v(x, y, h / 2));
}

function designedLights(scene: Scene, design: GroundDesign) {
  const level = maxStandLevel(design);
  const chosen = LOOK?.floodlights ?? "auto";
  const roofedTouchlines = (["W", "E"] as StandSide[]).filter((side) => {
    const d = design.stands[side];
    return d.form !== "open" && d.roof !== "open" && d.form !== "shelter";
  });
  const style = chosen === "auto"
    ? level <= 1 ? "posts" : level <= 3 ? "pylons" : roofedTouchlines.length === 2 ? "gantry" : "masts"
    : chosen === "gantry" && roofedTouchlines.length === 0 ? "masts" : chosen;
  const marks: V3[] = [];
  // Pylon corners always carry a pylon, whatever the style.
  const pylonAt = (slot: CornerSlot) => {
    const [sx, sy] = SIDE_SIGN[slot];
    const end: StandSide = sx > 0 ? "N" : "S";
    const touch: StandSide = sy > 0 ? "W" : "E";
    const px = sx * (sideFront(end, design.stands[end]) + Math.min(10, standReach(end, design.stands[end]) * 0.4) + 5);
    const py = sy * (sideFront(touch, design.stands[touch]) + Math.min(10, standReach(touch, design.stands[touch]) * 0.4) + 5);
    // A corner chosen as a pylon corner gets a taller landmark pylon on a concrete base,
    // so the choice reads even when the whole ground already uses pylons.
    const landmark = design.corners[slot].form === "pylon";
    const h = (level >= 4 ? 36 : 26) + (landmark ? 8 : 0);
    if (landmark) {
      scene.add(solid(boxFaces(px - 3.2, py - 3.2, 0, px + 3.2, py + 3.2, 1.2), MATERIAL_TONE.concrete), v(px, py, 0.6));
      scene.shadowSolid([...rect(px - 3.2, py - 3.2, px + 3.2, py + 3.2), ...rect(px - 3.2, py - 3.2, px + 3.2, py + 3.2, 1.2)], 0.2);
    }
    latticePylon(scene, px, py, h);
    marks.push(v(px, py, h));
  };
  const corners = ["NW", "NE", "SW", "SE"] as CornerSlot[];
  for (const slot of corners) if (design.corners[slot].form === "pylon" || style === "pylons") pylonAt(slot);
  if (style === "posts") {
    for (const x of [-36, 0, 36]) {
      for (const sy of [1, -1]) {
        const y = sy * (HALF_W + 6);
        lampPost(scene, x, y, 12);
        marks.push(v(x, y, 12));
      }
    }
  } else if (style === "masts") {
    for (const x of [-42, -14, 14, 42]) {
      const yW = sideFront("W", design.stands.W) + standReach("W", design.stands.W) + 3;
      const yE = -(sideFront("E", design.stands.E) + standReach("E", design.stands.E) + 3);
      floodlight(scene, x, yW, 26, x, 0);
      floodlight(scene, x, yE, 24, x, 0);
      marks.push(v(x, yW, 26), v(x, yE, 24));
    }
  } else if (style === "gantry") {
    for (const side of roofedTouchlines) {
      const spec = designedStandSpec(side, design.stands[side]);
      if (!spec) continue;
      const z = standHeight(spec) - 1.2;
     