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
  scene.flat(ellipsePts(0, 0, 0.5, 0.5, 0, Mat