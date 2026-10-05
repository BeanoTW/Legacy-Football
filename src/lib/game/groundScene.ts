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

import type { CornerSlot, GroundDesign, GroundStandDesign, SceneLook, StandSide } from "./groundIdentity";

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

  // Mowing: stripes across the pitch by default, or the club's own pattern.
  const mowing = LOOK?.mowing ?? "stripes";
  const stripes = 12;
  if (mowing === "checks") {
    const rows = 8;
    for (let i = 0; i < stripes; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const x0 = -HALF_L + (i * 2 * HALF_L) / stripes;
        const y0 = -HALF_W + (j * 2 * HALF_W) / rows;
        scene.flat(rect(x0, y0, x0 + (2 * HALF_L) / stripes, y0 + (2 * HALF_W) / rows), (i + j) % 2 ? C.pitchA : C.pitchB);
      }
    }
  } else if (mowing === "diagonal") {
    scene.flat(rect(-HALF_L, -HALF_W, HALF_L, HALF_W), C.pitchB);
    const band = 9;
    for (let k = -14; k <= 14; k += 2) {
      const c0 = k * band;
      const poly = [v(c0 - HALF_W, -HALF_W), v(c0 - HALF_W + band, -HALF_W), v(c0 + HALF_W + band, HALF_W), v(c0 + HALF_W, HALF_W)];
      const clipped = clipToRect(poly, -HALF_L, -HALF_W, HALF_L, HALF_W);
      if (clipped.length >= 3) scene.flat(clipped, C.pitchA);
    }
  } else {
    for (let i = 0; i < stripes; i += 1) {
      const x0 = -HALF_L + (i * 2 * HALF_L) / stripes;
      const x1 = x0 + (2 * HALF_L) / stripes;
      scene.flat(rect(x0, -HALF_W, x1, HALF_W), i % 2 ? C.pitchA : C.pitchB);
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
}

/** Returns the anchor (roof centre) for hotspot placement. */
function stand(scene: Scene, spec: StandSpec): V3 {
  const W = spec.mapper ?? sideMapper(spec.side, spec.front);
  const prims: ScenePrimitive[] = [];
  const frontFacing = facesCamera(W(spec.from, 0, 1.1), W(spec.to, 0, 1.1), W(spec.from, spec.depth, spec.rake), W(spec.from, spec.depth + 2, 0));
  const shadowPts: V3[] = [];
  const back = spec.back ?? C.cladding;
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
    prims.push(...solid(prismFaces(roof, spec.from - 0.5, spec.to + 0.5, W), C.roof, { faceColors: [C.roofDark, C.roofDark, C.roofDark, C.roof, C.roofDark, C.roofDark] }));
    // Roof sheeting ribs.
    for (let c = spec.from + 3; c < spec.to; c += 4) {
      const a = W(c, -1.4, roofZ + 0.02);
      const b = W(c, depth + 0.7, roofZ + 1.62);
      prims.push({ d: pathOf([a, b], false), fill: "none", stroke: shade(C.roof, 0.82), sw: widthAt(a, 0.5), opacity: 0.8 });
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


/* Slot-based composition (GroundDesign). Axes follow sideMapper: +x North, -x South, +y West, -y East. */
const SIDE_SIGN: Record<CornerSlot, [number, number]> = { NW:[1,1], NE:[1,-1], SW:[-1,1], SE:[-1,-1] };
const isTouchline=(s:StandSide)=>s==="W"||s==="E";
const clampN=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const sideFront=(s:StandSide,d:GroundStandDesign)=>(isTouchline(s)?HALF_W:HALF_L)+3+clampN(d.setback,2,10);

function perimeter(scene:Scene, design:GroundDesign){
  const inset=4.2, loop=rect(-HALF_L-inset,-HALF_W-inset,HALF_L+inset,HALF_W+inset);
  if(design.perimeter.style==="chainLink"){ fenceRun(scene,loop,2.2); return; }
  const tone=design.perimeter.colour==="club"?(LOOK?.seat??C.seat):design.perimeter.colour==="green"?"#2f6b3c":design.perimeter.colour==="galvanized"?"#a8b0b5":"#f1f3f0";
  for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];const mid=v((a.x+b.x)/2,(a.y+b.y)/2);
    if(design.perimeter.style==="brick") scene.add(solid(boxFaces(Math.min(a.x,b.x)-.12,Math.min(a.y,b.y)-.12,0,Math.max(a.x,b.x)+.12,Math.max(a.y,b.y)+.12,1.05),C.brick),mid);
    else scene.add([{d:pathOf([v(a.x,a.y,1),v(b.x,b.y,1)],false),fill:"none",stroke:design.perimeter.style==="barrier"?"#59636b":tone,sw:1,cap:"round"}],mid);
  }
}
function dugouts(scene:Scene,modern:boolean){for(const x of [-9,9]){const y0=HALF_W+2.2,y1=HALF_W+3.8;scene.add(solid(boxFaces(x-3.6,y0,0,x+3.6,y1,2.1),modern?"#9fc7d6":"#8a6a45"),v(x,(y0+y1)/2,1));}}
function latticePylon(scene:Scene,x:number,y:number,h:number){const top=v(x,y,h),prims:ScenePrimitive[]=[];for(const dx of [-2,2])prims.push({d:pathOf([v(x+dx,y,0),top],false),fill:"none",stroke:"#7f878d",sw:1});scene.add(prims,v(x,y,h/2));scene.shadowLine(v(x,y,0),top,1.6,.22);}
function scoreboard(scene:Scene,x:number,y:number){const board=[v(x,y-3,2.6),v(x,y+3,2.6),v(x,y+3,5.4),v(x,y-3,5.4)];scene.add([{d:pathOf(board),fill:"#1f2a24",stroke:"#e9e6da",sw:.6}],v(x,y,3));}
function designedCarPark(scene:Scene,design:GroundDesign,rand:()=>number,withCoach:boolean):V3{const [sx,sy]=SIDE_SIGN[design.surroundings.carParkLocation],x0=sx>0?76:-104,y0=sy>0?44:-72,x1=x0+28,y1=y0+28;scene.flat(rect(x0,y0,x1,y1),design.surroundings.carParkSurface==="tarmac"?C.tarmac:C.gravel);const palette=["#b8322c","#dfe3e6","#23324a","#8a9097"];for(let x=x0+4;x<x1-3;x+=4){if(rand()<.6)car(scene,x,y0+4,"y",palette[Math.floor(rand()*palette.length)]);}if(withCoach)scene.add(solid(boxFaces((x0+x1)/2-6,(y0+y1)/2-1.3,.3,(x0+x1)/2+6,(y0+y1)/2+1.3,3.2),"#dfe3e6"),v((x0+x1)/2,(y0+y1)/2,1.5));return v((x0+x1)/2,(y0+y1)/2,0);}
function designedStandSpec(side:StandSide,d:GroundStandDesign):StandSpec|null{if(d.form==="open")return null;const span=clampN(d.span,12,isTouchline(side)?100:64),front=sideFront(side,d),depth=clampN(d.depth,3,26),terrace=d.standing==="terrace",seat=side==="W"?C.seat:(LOOK?.twoTone?C.seatAlt:C.seat),base={side,front,seat,terrace,rearDetail:true} as const;if(d.form==="shelter"){const w=Math.min(span,24);return{...base,from:-w/2,to:w/2,depth:3,rake:1.2,roof:true};}if(d.form==="terrace")return{...base,terrace:true,from:-span/2,to:span/2,depth:clampN(depth*.75,4,16),rake:depth*.3,roof:d.roof!=="open"};if(d.form==="traditional")return{...base,from:-span/2,to:span/2,depth,rake:depth*.55,roof:d.roof!=="open",back:C.brick};if(d.form==="cantilever")return{...base,from:-span/2,to:span/2,depth,rake:depth*.6,roof:true,cantilever:true,back:C.cladding};return{...base,from:-span/2,to:span/2,depth:depth*.7,rake:depth*.42,roof:true,cantilever:true,back:C.cladding,upper:{depth:depth*.55,rake:depth*.45}};}
function openSide(scene:Scene,side:StandSide,d:GroundStandDesign):V3{const W=sideMapper(side,sideFront(side,d)-2),half=isTouchline(side)?44:28;scene.flat([W(-half,0,0),W(half,0,0),W(half,3.2,0),W(-half,3.2,0)],C.concrete,.9);return W(0,2,1);}
function corner(scene:Scene,slot:CornerSlot,form:GroundDesign["corners"][CornerSlot]["form"],design:GroundDesign){if(form==="open"||form==="pylon")return;const [sx,sy]=SIDE_SIGN[slot],end:StandSide=sx>0?"N":"S",touch:StandSide=sy>0?"W":"E",cx=sx*sideFront(end,design.stands[end]),cy=sy*sideFront(touch,design.stands[touch]),out=norm(v(sx,sy,0)),along=v(-out.y,out.x,0),mapper=(a:number,o:number,z:number)=>v(cx+along.x*a+out.x*o,cy+along.y*a+out.y*o,z);if(form==="access"){scene.flat([mapper(-2,-1,0),mapper(2,-1,0),mapper(2,14,0),mapper(-2,14,0)],C.path);return;}stand(scene,{side:end,front:0,mapper,from:-7,to:7,depth:form==="seated"?9:7,rake:form==="seated"?4.5:2.6,roof:form==="seated",cantilever:form==="seated",seat:form==="seated"?C.seatAlt:C.terrace,terrace:form!=="seated",rearDetail:form==="seated"});}
function composeDesigned(scene:Scene,input:SceneInput,design:GroundDesign,anchors:Record<string,V3>){const stage=clampN(Math.round(input.stage),0,6),rand=rng(0x5eed+stage*7919),sides=["N","E","S","W"] as StandSide[],maxLevel=Math.max(...sides.map(s=>design.stands[s].level));countryside(scene,rng(20260924));neighbourPitch(scene,stage);scene.flat(rect(-HALF_L-9,-HALF_W-8,HALF_L+9,HALF_W+8),maxLevel>=2?C.path:"#a8ad93");scene.flat(rect(-HALF_L-6.5,-HALF_W-5.5,HALF_L+6.5,HALF_W+5.5),"#6e9b44");pitch(scene,stage,input.pitchCondition);anchors.pitch=v(0,0,0);goal(scene,-HALF_L,1);goal(scene,HALF_L,-1);perimeter(scene,design);dugouts(scene,maxLevel>=3);for(const side of ["W","E","N","S"] as StandSide[]){const d=design.stands[side],spec=designedStandSpec(side,d),a=spec?stand(scene,spec):openSide(scene,side,d);if(side==="W")anchors.main=a;if(side==="E")anchors.stands=a;}for(const slot of ["NW","NE","SW","SE"] as CornerSlot[])corner(scene,slot,design.corners[slot].form,design);for(const slot of ["NW","NE","SW","SE"] as CornerSlot[]){if(design.corners[slot].form==="pylon"||(LOOK?.floodlights??"auto")==="pylons"||((LOOK?.floodlights??"auto")==="auto"&&maxLevel<=2)){const [sx,sy]=SIDE_SIGN[slot];latticePylon(scene,sx*(sideFront(sx>0?"N":"S",design.stands[sx>0?"N":"S"])+6),sy*(sideFront(sy>0?"W":"E",design.stands[sy>0?"W":"E"])+6),24);}}const openEnd=(["N","S"] as StandSide[]).find(s=>design.stands[s].form==="open");if(openEnd&&maxLevel<=3)scoreboard(scene,(openEnd==="N"?1:-1)*(sideFront(openEnd,design.stands[openEnd])+9),18);anchors.parking=designedCarPark(scene,design,rand,maxLevel>=2);treeBelts(scene,rand);}
function designedFrame(design:GroundDesign):V3[]{const reach=(s:StandSide)=>sideFront(s,design.stands[s])+(design.stands[s].form==="open"?6:clampN(design.stands[s].depth,3,26)+2),xN=reach("N"),xS=reach("S"),yW=reach("W"),yE=reach("E"),tall=Math.max(...(["N","E","S","W"] as StandSide[]).map(s=>design.stands[s].form==="twoTier"?22:design.stands[s].level>=3?16:10)),[px,py]=SIDE_SIGN[design.surroundings.carParkLocation];return[v(-xS,-yE,0),v(xN,-yE,0),v(xN,yW,0),v(-xS,yW,0),v(-xS,yW,tall),v(xN,yW,tall),v(px*82,py*50,0)];}

export function buildGroundScene(input: SceneInput): SceneOutput {
  configureCamera(input);
  // Reset the palette and look for this build (pure: same input, same picture).
  Object.assign(C, BASE_C, { field: [...BASE_C.field] });
  LOOK = input.look;
  if (LOOK) {
    C.seat = LOOK.seat;
    C.seatAlt = LOOK.seatAlt;
    C.roof = LOOK.roof;
    C.roofDark = LOOK.roofDark;
    C.brick = LOOK.cladding;
  }

  const scene = new Scene();
  const anchors: Record<string, V3> = {};
  if (input.design?.version === 1) composeDesigned(scene, input, input.design, anchors);
  else compose(scene, input, anchors);

  // Frame the ground itself (pitch, stands, club buildings), fitted to the viewport's shape.
  const stage = Math.max(0, Math.min(6, Math.round(input.stage)));
  const reachX = stage >= 4 ? 78 : stage >= 2 ? 70 : 62;
  const reachY = stage >= 4 ? 64 : stage >= 2 ? 56 : 46;
  const tall = stage >= 5 ? 34 : stage >= 3 ? 20 : 10;
  const designed = input.design?.version === 1;
  const core = designed ? designedFrame(input.design!).map(project) : [
    v(-reachX, -reachY, 0), v(reachX, -reachY, 0), v(reachX, reachY, 0), v(-reachX, reachY, 0),
    v(-reachX, reachY, tall), v(reachX, reachY, tall),
// Club buildings to the left and hospitality to the right.
    ...(stage >= 2 ? [v(-106, -8, 0), v(-106, 16, 10), v(-90, -56, 0), v(116, 40, 8)] : [v(-86, -12, 0), v(-86, 12, 8), v(-66, -48, 0), v(78, 30, 6)]),
  ].map(project);
  let minX = Math.min(...core.map((p) => p.x));
  let maxX = Math.max(...core.map((p) => p.x));
  let minY = Math.min(...core.map((p) => p.y));
  let maxY = Math.max(...core.map((p) => p.y));
  const aspect = Math.max(0.3, input.width / Math.max(1, input.height));
  const pad = 1.06;
  let w = (maxX - minX) * pad;
  let h = (maxY - minY) * pad;
  if (w / h > aspect) h = w / aspect;
  else w = h * aspect;
  const cx = (minX + maxX) / 2;
  // Leave a little more room at the top for the stage badge.
  const cy = (minY + maxY) / 2 - h * 0.02;
  minX = cx - w / 2;
  minY = cy - h / 2;
  maxX = cx + w / 2;
  maxY = cy + h / 2;

  const objects = [...scene.objects].sort((a, b) => b.depth - a.depth).flatMap((o) => o.prims);
  const outAnchors: SceneOutput["anchors"] = {};
  for (const [id, point] of Object.entries(anchors)) {
    const p = project(point);
    outAnchors[id] = { x: (p.x - minX) / w, y: (p.y - minY) / h };
  }

  return {
    viewBox: { x: minX, y: minY, w, h },
    background: "#6f9a42",
    prims: [...scene.ground, ...scene.shadows, ...objects],
    anchors: outAnchors,
  };
}