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

function rect(x0: number, y0