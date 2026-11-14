// The third film, /studio/film/v3 (docs/event/FILM.md): three surfaces in close shots, with two
// short camera glides between them. No wide view of the desk at the start or the end.
//   A  the record sheet, 0 to 17.5 s: one paper that changes in place
//   B  the map sheet, 17.5 to 24.5 s: a box is drawn, the verdict writes in, the day's fires drop in
//   C  the Seal card, 24.5 to 29.5 s: still from 29.0 s
// As on the board (lib/film/board.ts), everything is a pure function of the time t in seconds.

import { clamp, DURATION, FPS, lerp, type Scene } from "./timeline";

export const FRAME = { w: 1920, h: 1080 };
const CX = FRAME.w / 2, CY = FRAME.h / 2;
const RAD = Math.PI / 180;
const smooth = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
/** Quintic smootherstep: no speed and no acceleration at either end. */
const smoother = (x: number) => {
  const k = clamp(x);
  return k * k * k * (k * (6 * k - 15) + 10);
};

/** The scenes the captions are checked against: each caption lies inside one. */
export const SCENES_V3: Scene[] = [
  { n: 1, id: "record", name: "The record", from: 0, to: 4.5 },
  { n: 2, id: "sensors", name: "Two sensors", from: 4.5, to: 8 },
  { n: 3, id: "trials", name: "The trials", from: 8, to: 14.5 },
  { n: 4, id: "one", name: "One record", from: 14.5, to: 17.5 },
  { n: 5, id: "area", name: "Any area", from: 17.5, to: 24.5 },
  { n: 6, id: "seal", name: "The Seal", from: 24.5, to: DURATION },
];
/** From here to the end nothing moves. */
export const STILL_V3 = 29;

// ---------------------------------------------------------------- the three surfaces

export interface Surface { n: number; x: number; y: number; w: number; h: number; rot: number; pin: [number, number] }

export const SURFACES: Surface[] = [
  { n: 1, x: 0, y: 0, w: 1800, h: 1000, rot: -0.5, pin: [900, 20] },
  { n: 2, x: 2180, y: 260, w: 1800, h: 1000, rot: 0.6, pin: [900, 20] },
  { n: 3, x: 4330, y: -40, w: 1180, h: 730, rot: -0.8, pin: [590, 20] },
];
export const centreOf = (s: Surface): [number, number] => [s.x + s.w / 2, s.y + s.h / 2];
export const pinAt = (s: Surface): [number, number] => [s.x + s.pin[0], s.y + s.pin[1]];

export interface Cam { x: number; y: number; z: number; roll: number }

/** Each surface's close shot: its middle in the middle of the frame, a slow push-in over its time. */
const SHOTS = [
  { z0: 1, z1: 1.025 },
  { z0: 1, z1: 1.018 },
  { z0: 1.3, z1: 1.33 },
];
/** The two glides, A to B and B to C. */
export const GLIDES: [number, number][] = [[17.5, 18.5], [24.5, 25.5]];
/** When each surface is held: from the end of the glide that brings it to the start of the one that takes it away. */
const HELD: [number, number][] = [[0, GLIDES[0][0]], [GLIDES[0][1], GLIDES[1][0]], [GLIDES[1][1], STILL_V3]];

function shot(i: number, t: number): Cam {
  const s = SURFACES[i], [h0, h1] = HELD[i];
  const k = clamp((t - h0) / (h1 - h0));
  const [x, y] = centreOf(s);
  return { x, y, z: lerp(SHOTS[i].z0, SHOTS[i].z1, k), roll: 0.6 * s.rot };
}

/** How far a glide has got, 0 to 1, or null when no glide is running. */
export function glideAt(t: number): { i: number; p: number } | null {
  const i = GLIDES.findIndex(([a, b]) => t > a && t < b);
  return i < 0 ? null : { i, p: (t - GLIDES[i][0]) / (GLIDES[i][1] - GLIDES[i][0]) };
}

export function camAt(t: number): Cam {
  const time = clamp(t, 0, DURATION);
  const g = glideAt(time);
  if (!g) {
    const i = time < GLIDES[0][0] ? 0 : time < GLIDES[1][0] ? 1 : 2;
    return shot(i, time);
  }
  const a = shot(g.i, GLIDES[g.i][0]), b = shot(g.i + 1, GLIDES[g.i][1]);
  const k = smoother(g.p);
  const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) * Math.exp(-0.12 * Math.sin(Math.PI * g.p));
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z, roll: lerp(a.roll, b.roll, k) };
}

export function toScreen(cam: Cam, p: [number, number], f = 1): [number, number] {
  const dx = (p[0] - cam.x) * cam.z * f, dy = (p[1] - cam.y) * cam.z * f, r = -cam.roll * RAD;
  return [CX + dx * Math.cos(r) - dy * Math.sin(r), CY + dx * Math.sin(r) + dy * Math.cos(r)];
}
function toWorld(cam: Cam, p: [number, number]): [number, number] {
  const dx = p[0] - CX, dy = p[1] - CY, r = cam.roll * RAD;
  return [cam.x + (dx * Math.cos(r) - dy * Math.sin(r)) / cam.z, cam.y + (dx * Math.sin(r) + dy * Math.cos(r)) / cam.z];
}
export const layerTransform = (cam: Cam, f = 1) =>
  `translate(${CX}px, ${CY}px) rotate(${(-cam.roll).toFixed(4)}deg) scale(${(cam.z * f).toFixed(6)}) translate(${(-cam.x).toFixed(3)}px, ${(-cam.y).toFixed(3)}px)`;

/** How far the frame moves, in frame pixels, between t and t + span: the corners and the middle. */
export function frameMotion(t: number, span: number): number {
  const a = camAt(t), b = camAt(t + span);
  return Math.max(...([[0, 0], [FRAME.w, 0], [0, FRAME.h], [FRAME.w, FRAME.h], [CX, CY]] as [number, number][])
    .map((p) => { const q = toScreen(b, toWorld(a, p)); return Math.hypot(q[0] - p[0], q[1] - p[1]); }));
}

/** Motion blur as on the board: 12 subframes over 1/60 s, only on the glides' frames that move more than 2 px. */
export const BLUR = { subframes: 12, shutter: 1 / 60, over: 2 };
export const blurAt = (t: number) => {
  const near = GLIDES.some(([a, b]) => t + 1 / FPS > a && t < b);
  return near && frameMotion(t, 1 / FPS) > BLUR.over;
};
export function slideAt(t: number, dt: number): number[] {
  const a = camAt(t), b = camAt(t + dt);
  const map = (p: [number, number]) => toScreen(b, toWorld(a, p));
  const o = map([0, 0]), x = map([1, 0]), y = map([0, 1]);
  return [x[0] - o[0] - 1, y[0] - o[0], o[0], x[1] - o[1], y[1] - o[1] - 1, o[1]];
}

/** How much a surface is the one in focus, 0 to 1. */
export function focusOf(i: number, t: number): number {
  const g = glideAt(t);
  if (g) return g.i === i ? 1 - smooth(g.p) : g.i + 1 === i ? smooth(g.p) : 0;
  const held = t < GLIDES[0][0] ? 0 : t < GLIDES[1][0] ? 1 : 2;
  return held === i ? 1 : 0;
}
export function blurOf(i: number, t: number, cam: Cam): number {
  const [x, y] = toScreen(cam, centreOf(SURFACES[i]));
  const far = clamp((Math.hypot(x - CX, y - CY) - 320) / 900);
  return (1 - focusOf(i, t)) * far * 4.5;
}

const LAG = 0.45;
const LAMP: [number, number] = [-777, -605];
export function lampAt(t: number, cam = camAt(t)): [number, number] {
  const before = camAt(Math.max(0, t - LAG));
  const [x, y] = toScreen(cam, [before.x, before.y]);
  return [x + LAMP[0], y + LAMP[1]];
}
export function shadowOf(i: number, cam: Cam, lamp: [number, number]): [number, number] {
  const [x, y] = toScreen(cam, centreOf(SURFACES[i]));
  const dx = x - lamp[0], dy = y - lamp[1], d = Math.hypot(dx, dy) || 1;
  const length = 9 + 9 * clamp(d / 1800);
  return [(dx / d) * length, (dy / d) * length];
}

// ---------------------------------------------------------------- the beats, in seconds from the start

export const V3 = {
  lampUp: 0.6,
  // A. The record sheet
  corner: 0.1,
  modis: 0.35, modisEvery: 0.07, modisFor: 0.3, modisLabel: 1.5,
  divide: 1.9, viirs: 2.3, viirsEvery: 0.05, viirsLabel: 3,
  circle: 4.6, circleFor: 0.7, modisSensor: 5.3, viirsSensor: 5.8, sensorFor: 0.35,
  trials: 8.15, row: 8.5, rowEvery: 0.95, rowInk: 0.25, tickFor: 0.55, underline: 13.1, underlineFor: 0.4,
  lever: 14.6, leverFor: 0.3, flip: 14.75, settle: 0.8, whiskers: 15.2, median: 15.55, areaError: 16,
  // B. The map sheet
  cursor: 18.4, press: 18.75, dragFor: 1.2, results: 20.15, resultsFor: 0.6, badge: 20.75, verdict: 20.85, verdictFor: 0.7,
  slip: 21.6, drops: 21.9, dropsFor: 1.5, dropFor: 0.4, bloomFor: 0.8,
  // C. The Seal card
  seal: 25.35, team: 27.15, credit: 27.5,
};

/** The trials, in the order they are written: each model's error, leaving one year out, from method.json. */
export const TRIALS: { model: string; label: string }[] = [
  { model: "raw", label: "Raw MODIS" },
  { model: "M0", label: "One factor" },
  { model: "M1", label: "M1" },
  { model: "M3", label: "M3" },
  { model: "M4", label: "M4" },
];

/** The box drawn on the map, corner to corner, as [lon, lat]: over the rice country of the northern Nile Delta. */
export const BOX: [[number, number], [number, number]] = [[30.55, 31.38], [31.75, 30.65]];
export const V3_QUERY = `poly=${BOX[0][0]},${BOX[0][1]};${BOX[1][0]},${BOX[0][1]};${BOX[1][0]},${BOX[1][1]};${BOX[0][0]},${BOX[1][1]}&day=2023-10-20`;
