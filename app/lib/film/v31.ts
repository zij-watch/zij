// The film v3.1, /studio/film/v31 (docs/event/FILM.md): v3's story told to Yassen's take. It opens
// full screen on NASA's picture of the Delta, pulls back to a printed photo on the desk, and follows
// one brass string from sheet to sheet; at the end the sheets slide together along it and bind into
// a book, and the Seal is brushed onto its cover. Every beat is keyed to a word of the voice.
// The words' times are docs/event/zij-demo30-v3.1-timing.json: planned from his captions, or from
// whisper on the placed voice. Everything is a pure function of it and of t.

import { clamp, FPS, lerp, type Scene } from "./timeline";
import type { Beats, Cam, Timing } from "./v3";

export const DURATION31 = 29.8;
export const FRAMES31 = Math.round(DURATION31 * FPS);
/** From here nothing moves. */
export const STILL31 = 29.5;
export const CHUNKS31 = Array.from({ length: Math.ceil(DURATION31 / 5) }, (_, i) => ({ n: i + 1, name: `chunk ${i + 1}`, from: i * 5, to: Math.min((i + 1) * 5, DURATION31) }));

/** His captions: the take's own times (before the gaps are shortened), his words exactly; "/" is a line break. */
export const CAPTIONS31: { from: number; to: number; text: string }[] = [
  { from: 0.1, to: 3.4, text: "In 2012, NASA's fire record jumps tenfold." },
  { from: 3.75, to: 5.8, text: "The fires didn't change. The satellite did." },
  { from: 6.15, to: 9.65, text: "So we built a model that learns how both satellites see, area by area." },
  { from: 10.0, to: 14.15, text: "On unseen years, error drops / from 77 to 14%," },
  { from: 14.35, to: 16.4, text: "and every value shows its margin." },
  { from: 16.75, to: 19.1, text: "Draw any area: / Zij fits it live," },
  { from: 19.25, to: 21.8, text: "and tells responders / if this season's normal." },
  { from: 22.15, to: 23.8, text: "And it reveals what the split record hid:" },
  { from: 24.0, to: 27.0, text: "in the Delta, detected burning rose after the 2004 ban," },
  { from: 27.15, to: 29.35, text: "and has halved since 2018." },
];
/** The voice is placed so its first word starts at about 0.5 s, and each gap between lines loses 0.1 s. */
export const VOICE31 = { at: 0.5, cut: 0.1 };
/** A time of the take, on the film's clock: the gaps before it shortened, the whole moved to start at VOICE31.at. */
export function shifted(t: number): number {
  const before = CAPTIONS31.filter((c, k) => k > 0 && c.from <= t + 1e-6).length;
  return Math.round((t + (VOICE31.at - CAPTIONS31[0].from) - VOICE31.cut * before) * 1000) / 1000;
}
/** The captions on the film's clock, one per cue, lines split at "/" and at 42 characters. */
export function captions31(): { from: number; to: number; lines: string[] }[] {
  const split = (line: string): string[] => {
    if (line.length <= 42) return [line];
    const words = line.split(" ");
    let best = 1, score = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ").length, b = words.slice(i).join(" ").length;
      if (Math.max(a, b) < score) { score = Math.max(a, b); best = i; }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  };
  return CAPTIONS31.map((c) => ({ from: shifted(c.from), to: shifted(c.to), lines: c.text.split(" / ").flatMap(split) }));
}
/** The words of each cue, as one line each for the timing (no "/"). */
export const SCRIPT31 = CAPTIONS31.map((c) => c.text.replace(/ \/ /g, " "));

const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9%']/g, "");
function find(timing: Timing, cue: number, word: string, nth = 1) {
  let seen = 0;
  for (const w of timing.lines[cue - 1]) if (bare(w.w) === bare(word) && ++seen === nth) return w;
  throw new Error(`no "${word}" (${nth}) in cue ${cue}`);
}

// ---------------------------------------------------------------- the desk

export interface Surface31 { id: string; x: number; y: number; w: number; h: number; rot: number }
/** The photo (a print with a white border), the record sheet, the machine, the app, the findings. */
export const S31: Surface31[] = [
  { id: "photo", x: 0, y: 70, w: 1160, h: 900, rot: 0 },
  { id: "record", x: 1300, y: 0, w: 1800, h: 1000, rot: 0 },
  { id: "machine", x: 3560, y: 230, w: 1800, h: 1000, rot: 0.4 },
  { id: "map", x: 5720, y: -50, w: 1800, h: 1000, rot: 0.6 },
  { id: "findings", x: 7890, y: 170, w: 1800, h: 1000, rot: -0.4 },
];
/** The photo's picture, inside its border. */
export const PHOTO = { x: 30, y: 30, w: 1100, h: 640 };
/** Each surface's tack, from its top left. */
export const TACK = (s: Surface31): [number, number] => (s.id === "photo" ? [s.w - 70, 26] : [s.w / 2, 22]);

export interface Beats31 extends Beats {
  pull: [number, number]; text: [number, number]; flyModis: [number, number]; flyViirs: number; fly: number;
  stack: [number, number]; close: [number, number]; brush: [number, number]; site: number; credit: number; coverage: number;
}

export interface Cut31 {
  timing: Timing; beats: Beats31; scenes: Scene[]; moves: [number, number][];
  camAt: (t: number) => Cam; blurAt: (t: number) => boolean; slideAt: (t: number, dt: number) => number[];
  focusOf: (i: number, t: number) => number; stringDrawn: (t: number) => number[];
}

const RAD = Math.PI / 180;
const CX = 960, CY = 540;
const smoother = (x: number) => {
  const k = clamp(x);
  return k * k * k * (k * (6 * k - 15) + 10);
};
const smooth = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
const centre = (s: Surface31): [number, number] => [s.x + s.w / 2, s.y + s.h / 2];

export function toWorld31(cam: Cam, p: [number, number]): [number, number] {
  const dx = p[0] - CX, dy = p[1] - CY, r = cam.roll * RAD;
  return [cam.x + (dx * Math.cos(r) - dy * Math.sin(r)) / cam.z, cam.y + (dx * Math.sin(r) + dy * Math.cos(r)) / cam.z];
}
function toScreen(cam: Cam, p: [number, number]): [number, number] {
  const dx = (p[0] - cam.x) * cam.z, dy = (p[1] - cam.y) * cam.z, r = -cam.roll * RAD;
  return [CX + dx * Math.cos(r) - dy * Math.sin(r), CY + dx * Math.sin(r) + dy * Math.cos(r)];
}

export function makeCut31(timing: Timing): Cut31 {
  const W = (cue: number, word: string, nth = 1) => find(timing, cue, word, nth);
  const first = (cue: number) => timing.lines[cue - 1][0].from;
  const lastOf = timing.lines[9][timing.lines[9].length - 1];
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  // Shots: the opening and line 1, line 2, lines 3-5, lines 6-7, lines 8-10 and the end.
  const shots = [0, r3(first(2) - 0.12), r3(first(3) - 0.12), r3(first(6) - 0.12), r3(first(8) - 0.12), DURATION31];

  const tenfold = W(1, "tenfold").from, fire = W(1, "fire").from;
  const fourteen = W(4, "14%").from;
  const tells = W(7, "tells").from;
  // The ending starts at about 28.0 s and is still from 29.5 s.
  const stack0 = Math.min(28.0, Math.max(27.8, W(10, "halved").to + 0.1));
  const b: Beats31 = {
    shots, end: lastOf.to,
    team: [0, 0], dots: [0.05, 0.45], fold: [NaN, NaN], modis: [fire, tenfold - 0.15], leap: tenfold, numbers: tenfold + 0.35,
    circle: W(2, "satellite").from - 0.1, sensors: [W(2, "satellite").from + 0.25, W(2, "satellite").from + 0.5], still: W(2, "did").to,
    machine: W(3, "model").from, feed: [W(3, "model").from, W(3, "area", 1).from + 0.3],
    stages: [W(3, "model").to, W(3, "learns").from, W(3, "both").from, W(3, "area", 1).from], out: [W(3, "area", 1).from + 0.35, Math.min(W(3, "area", 1).from + 1.35, first(4) - 0.05)],
    dial: [W(4, "77").from, fourteen + 0.2], smallText: W(4, "77").from, margin: W(5, "margin").from,
    box: [W(6, "draw").from - 0.1, Math.min(W(6, "draw").from + 0.9, W(6, "zij").from)], tag: W(6, "live").from,
    results: W(6, "live").to + 0.05, badge: tells, verdict: tells + 0.1, drops: [W(7, "season's").from - 0.3, shots[4] - 0.3],
    line: [shots[4] + 0.55, shots[4] + 1.3], flash: W(8, "split").from, ban: W(9, "ban").from - 0.25, stamp: W(10, "halved").from, seal: NaN,
    pull: [0.5, 1.45], text: [0.75, 0.95], flyModis: [fire - 0.55, tenfold - 0.75], flyViirs: tenfold - 0.62, fly: 0.6,
    stack: [stack0, stack0 + 0.45], close: [stack0 + 0.45, stack0 + 0.75], brush: [stack0 + 0.75, stack0 + 1.25], site: stack0 + 1.15, credit: stack0 + 1.25,
    coverage: W(7, "season's").from + 0.6,
  };

  const scenes: Scene[] = ["The leap", "Two sensors", "The model", "Any area", "What the record hid"].map((name, k) => ({
    n: k + 1, id: `s${k + 1}`, name, from: shots[k], to: shots[k + 1],
  }));

  // The camera: stations, each held with a slow push-in, and moves between them.
  const [P, R, M, B, F] = S31;
  const picture: Cam = { x: P.x + PHOTO.x + PHOTO.w / 2, y: P.y + PHOTO.y + PHOTO.h / 2, z: 1.76, roll: 0 };
  const wide: Cam = { x: (P.x + R.x + R.w) / 2, y: 520, z: 1920 / (R.x + R.w - P.x + 170), roll: 0 };
  const close = (s: Surface31, z = 1): Cam => ({ x: centre(s)[0], y: centre(s)[1], z, roll: 0.6 * s.rot });
  const stations: { cam: Cam; from: number; to: number; drift: number }[] = [
    { cam: picture, from: 0, to: b.pull[0], drift: 0.05 },
    { cam: wide, from: b.pull[1], to: shots[1] - 0.3, drift: 0.008 },
    { cam: close(R), from: shots[1] + 0.5, to: shots[2] + 0.0, drift: 0.008 },
    { cam: close(M, 0.97), from: shots[2] + 0.8, to: shots[3] - 0.3, drift: 0.008 },
    { cam: close(B), from: shots[3] + 0.5, to: shots[4] - 0.3, drift: 0.008 },
    { cam: close(F, 0.99), from: shots[4] + 0.5, to: b.stack[0], drift: 0.008 },
    { cam: { ...close(F, 0.93), y: centre(F)[1] + 10 }, from: b.stack[1], to: STILL31, drift: 0.01 },
  ];
  // The still beat after "did": the record sheet holds without drifting from that word to the next move.
  const held = (k: number, t: number): Cam => {
    const s = stations[k];
    const until = k === 2 ? Math.min(s.to, b.still) : s.to;
    const at = clamp(t, s.from, until);
    return { ...s.cam, z: s.cam.z * (1 + s.drift * (at - s.from)) };
  };
  const moves: [number, number][] = stations.slice(1).map((s, k) => [stations[k].to, s.from]);
  const camAt = (t: number): Cam => {
    const time = clamp(t, 0, DURATION31);
    for (let k = 0; k < stations.length; k++) {
      if (time <= stations[k].to) {
        if (k === 0 || time >= stations[k].from) return held(k, time);
        const a = held(k - 1, stations[k - 1].to), c = held(k, stations[k].from);
        const p = (time - stations[k - 1].to) / (stations[k].from - stations[k - 1].to);
        const e = smoother(p);
        const dip = k >= 2 && k <= 5 ? Math.exp(-0.12 * Math.sin(Math.PI * p)) : 1;
        return { x: lerp(a.x, c.x, e), y: lerp(a.y, c.y, e), z: Math.exp(lerp(Math.log(a.z), Math.log(c.z), e)) * dip, roll: lerp(a.roll, c.roll, e) };
      }
    }
    return held(stations.length - 1, time);
  };
  const frameMotion = (t: number, span: number) => {
    const a = camAt(t), c = camAt(t + span);
    return Math.max(...([[0, 0], [1920, 0], [0, 1080], [1920, 1080], [CX, CY]] as [number, number][])
      .map((p) => { const q = toScreen(c, toWorld31(a, p)); return Math.hypot(q[0] - p[0], q[1] - p[1]); }));
  };
  const blurAt = (t: number) => moves.some(([a, c]) => t + 1 / FPS > a && t < c) && frameMotion(t, 1 / FPS) > 2;
  const slideAt = (t: number, dt: number) => {
    const a = camAt(t), c = camAt(t + dt);
    const map = (p: [number, number]) => toScreen(c, toWorld31(a, p));
    const o = map([0, 0]), x = map([1, 0]), y = map([0, 1]);
    return [x[0] - o[0] - 1, y[0] - o[0], o[0], x[1] - o[1], y[1] - o[1] - 1, o[1]];
  };
  // Focus: the surface the camera is on; the photo and the record share the wide shot.
  const focusOf = (i: number, t: number) => {
    const on = t < shots[1] ? [0, 1] : t < shots[2] ? [1] : t < shots[3] ? [2] : t < shots[4] ? [3] : [4];
    return on.includes(i) || t >= b.stack[0] ? 1 : 0;
  };
  // The string: each stretch, tack to tack, drawn in just ahead of the camera.
  const reach = [[0.55, 1.3], [shots[1] - 0.6, shots[1] + 0.2], [shots[2] - 0.35, shots[2] + 0.45], [shots[3] - 0.6, shots[3] + 0.2], [shots[4] - 0.6, shots[4] + 0.2]];
  const stringDrawn = (t: number) => reach.slice(0, 4).map(([a, c]) => smooth((t - a) / (c - a)));
  void smooth;
  return { timing, beats: b, scenes, moves, camAt, blurAt, slideAt, focusOf, stringDrawn };
}

/** Where each surface is at t: in place, or sliding along the string to the findings sheet to make the book. */
export function placeOf(i: number, t: number, b: Beats31): { dx: number; dy: number; rot: number } {
  const s = S31[i], F = S31[4];
  if (i === 4) return { dx: 0, dy: 0, rot: s.rot };
  const k = smoother((t - b.stack[0] - (3 - i) * 0.05) / (b.stack[1] - b.stack[0] - 0.15));
  // Each lands a few pixels off the one under it, so the stack shows its edges.
  const tx = F.x + (F.w - s.w) / 2 + (4 - i) * 7, ty = F.y + (F.h - s.h) / 2 + (4 - i) * 6;
  return { dx: (tx - s.x) * k, dy: (ty - s.y) * k, rot: lerp(s.rot, F.rot + (i - 2) * 0.5, k) };
}
