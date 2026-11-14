// The third film, /studio/film/v3 (docs/event/FILM.md): the final cut. Six shots on four surfaces,
// every beat keyed to the word of the voice-over that names it.
//   L1  the Delta from space (NASA GIBS), folding down into the record chart; the leap on "tenfold"
//   L2  the ink circle round 2012, the two sensors named; a beat of stillness
//   L3, L4  the machine: four stages, the dial from 77% to 14%, the margin
//   L5  the real app: a box drawn, fitted in the browser, the verdict, the day's fires
//   L6  the harmonized record: the split halves, the ban, the fall since 2018; the Seal
// The words' times are one file, docs/event/zij-demo30-v3-timing.json: the planned timings, or the
// recorded voice's word times from whisper. Everything here is a pure function of it and of t.

import { clamp, DURATION, FPS, lerp, type Scene } from "./timeline";

// ---------------------------------------------------------------- the script

/** The script, spoken and captioned word for word. */
export const SCRIPT = [
  "In 2012, NASA's fire record jumps tenfold.",
  "The fires didn't change. The satellite did.",
  "So we built a machine that learns how both satellites see, area by area.",
  "Tested on years it never saw, its error falls from 77% to 14%, and every value shows its margin.",
  "Draw any area: Zij fits it live in your browser, and tells emergency teams if this season is normal.",
  "And it reveals what the split record hid: in the Delta, detected burning rose after the 2004 ban, and has halved since 2018.",
];
/** Each line's captions: the index of the word each cue starts at. Short cues, no gaps. */
export const CUE_STARTS = [[0, 5], [0, 4], [0, 5, 11], [0, 6, 13], [0, 3, 10, 14], [0, 8, 14, 18]];

export interface Word { w: string; from: number; to: number }
export interface Timing { source: string; tempo: number; lines: Word[][] }

export const words = (line: string) => line.split(/\s+/).filter(Boolean);
const bare = (w: string) => w.toLowerCase().replace(/[^a-z0-9%']/g, "");

/** A word of a line, by its text: the first one, or the nth. */
function find(timing: Timing, line: number, word: string, nth = 1): Word {
  const list = timing.lines[line - 1];
  let seen = 0;
  for (const w of list) if (bare(w.w) === bare(word) && ++seen === nth) return w;
  throw new Error(`no "${word}" (${nth}) in line ${line}`);
}

// ---------------------------------------------------------------- the surfaces

export interface Surface { n: number; x: number; y: number; w: number; h: number; rot: number; pin: [number, number] }
export const SURFACES: Surface[] = [
  { n: 1, x: 0, y: 0, w: 1800, h: 1000, rot: -0.5, pin: [900, 20] }, // the record sheet
  { n: 2, x: 2150, y: 210, w: 1800, h: 1000, rot: 0.4, pin: [900, 20] }, // the machine
  { n: 3, x: 4300, y: -60, w: 1800, h: 1000, rot: 0.6, pin: [900, 20] }, // the app
  { n: 4, x: 6450, y: 170, w: 1800, h: 1000, rot: -0.4, pin: [900, 20] }, // the harmonized record and the Seal
];
export const centreOf = (s: Surface): [number, number] => [s.x + s.w / 2, s.y + s.h / 2];
export const pinAt = (s: Surface): [number, number] => [s.x + s.pin[0], s.y + s.pin[1]];

export interface Cam { x: number; y: number; z: number; roll: number }

// ---------------------------------------------------------------- the cut, from the words' times

export interface Beats {
  shots: number[]; // each shot's start, L1 to L6, and the end of speech
  end: number; // the last word's end
  // L1
  team: [number, number]; dots: [number, number]; fold: [number, number]; modis: [number, number]; leap: number; numbers: number;
  // L2
  circle: number; sensors: [number, number]; still: number;
  // L3, L4
  machine: number; feed: [number, number]; stages: number[]; out: [number, number]; dial: [number, number]; smallText: number; margin: number;
  // L5
  box: [number, number]; tag: number; results: number; badge: number; verdict: number; drops: [number, number];
  // L6
  line: [number, number]; flash: number; ban: number; stamp: number; seal: number;
}

export interface Cut {
  timing: Timing; beats: Beats; scenes: Scene[]; glides: [number, number][];
  camAt: (t: number) => Cam; blurAt: (t: number) => boolean; slideAt: (t: number, dt: number) => number[];
  focusOf: (i: number, t: number) => number;
}

const RAD = Math.PI / 180;
const FRAME = { w: 1920, h: 1080 };
const CX = FRAME.w / 2, CY = FRAME.h / 2;
const smooth = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};
const smoother = (x: number) => {
  const k = clamp(x);
  return k * k * k * (k * (6 * k - 15) + 10);
};

export function makeCut(timing: Timing): Cut {
  const W = (line: number, word: string, nth = 1) => find(timing, line, word, nth);
  const starts = timing.lines.map((l) => l[0].from);
  const last = timing.lines[5][timing.lines[5].length - 1];
  const end = last.to;
  // Each shot starts a little before its line's first word; L1 at 0.
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const shots = [0, ...starts.slice(1).map((s) => r3(s - 0.12)), end];

  // L1
  const tenfold = W(1, "tenfold").from;
  const fold0 = Math.min(Math.max(0.95, W(1, "record").from - 0.15), tenfold - 1.0);
  const fold: [number, number] = [fold0, fold0 + 0.5];
  const modis: [number, number] = [fold[1] + 0.05, Math.max(fold[1] + 0.25, tenfold - 0.1)];
  // L2
  const satellite = W(2, "satellite").from, did = W(2, "did");
  // L3, L4
  const machine = W(3, "machine").from;
  const stages = [W(3, "machine").to, W(3, "learns").from, W(3, "both").from, W(3, "area", 1).from];
  const outFrom = stages[3] + 0.35;
  const fourteen = W(4, "14%").from;
  // L5
  const draw = W(5, "area").from - 0.15;
  const tells = W(5, "tells").from;
  const season = W(5, "season").from;
  // L6
  const beats: Beats = {
    shots, end,
    team: [0, 2], dots: [0.1, 0.9], fold, modis, leap: tenfold, numbers: tenfold + 0.35,
    circle: satellite - 0.1, sensors: [satellite + 0.25, satellite + 0.55], still: did.to,
    machine, feed: [machine, stages[3] + 0.3], stages, out: [outFrom, Math.min(outFrom + 1.0, starts[3] - 0.05)],
    dial: [W(4, "tested").from + 0.15, fourteen + 0.2], smallText: W(4, "77%").from, margin: W(4, "margin").from,
    box: [draw, Math.max(draw + 0.6, Math.min(draw + 1.1, W(5, "fits").from))], tag: W(5, "browser").from,
    results: W(5, "browser").to + 0.05, badge: tells, verdict: tells + 0.1, drops: [season - 0.3, shots[5] - 0.3],
    line: [shots[5] + 0.55, shots[5] + 1.35], flash: W(6, "split").from, ban: W(6, "ban").from - 0.25, stamp: W(6, "halved").from, seal: last.from,
  };

  const scenes: Scene[] = ["The leap", "Two sensors", "The machine", "Tested", "Any area", "What the record hid"].map((name, k) => ({
    n: k + 1, id: `l${k + 1}`, name, from: shots[k], to: k === 5 ? DURATION : shots[k + 1],
  }));

  // The camera: a close shot of each surface, drifting in all the time (never still for more than
  // half a second, except the beat after L2), and three glides of 0.8 s, A to M, M to B, B to C.
  // The first waits for its line, so the beat after "The satellite did." is still.
  const glides: [number, number][] = [[shots[2] - 0.05, shots[2] + 0.75], [shots[4] - 0.3, shots[4] + 0.5], [shots[5] - 0.3, shots[5] + 0.5]];
  const holds: [number, number][] = [[0, did.to], [glides[0][1], glides[1][0]], [glides[1][1], glides[2][0]], [glides[2][1], DURATION]];
  const Z = [1, 0.97, 1, 0.99];
  const DRIFT = 0.008; // the push-in, per second of the hold
  const shot = (i: number, t: number): Cam => {
    const s = SURFACES[i], [h0, h1] = holds[i];
    const at = clamp(t, h0, h1);
    const [x, y] = centreOf(s);
    return { x, y, z: Z[i] * (1 + DRIFT * (at - h0)), roll: 0.6 * s.rot };
  };
  const glideAt = (t: number) => {
    const i = glides.findIndex(([a, b]) => t > a && t < b);
    return i < 0 ? null : { i, p: (t - glides[i][0]) / (glides[i][1] - glides[i][0]) };
  };
  const camAt = (t: number): Cam => {
    const time = clamp(t, 0, DURATION);
    const g = glideAt(time);
    if (!g) {
      const i = time <= glides[0][0] ? 0 : time <= glides[1][0] ? 1 : time <= glides[2][0] ? 2 : 3;
      return shot(i, time);
    }
    const a = shot(g.i, glides[g.i][0]), b = shot(g.i + 1, glides[g.i][1]);
    const k = smoother(g.p);
    const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) * Math.exp(-0.12 * Math.sin(Math.PI * g.p));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z, roll: lerp(a.roll, b.roll, k) };
  };
  const toWorld = (cam: Cam, p: [number, number]): [number, number] => {
    const dx = p[0] - CX, dy = p[1] - CY, r = cam.roll * RAD;
    return [cam.x + (dx * Math.cos(r) - dy * Math.sin(r)) / cam.z, cam.y + (dx * Math.sin(r) + dy * Math.cos(r)) / cam.z];
  };
  const frameMotion = (t: number, span: number) => {
    const a = camAt(t), b = camAt(t + span);
    return Math.max(...([[0, 0], [FRAME.w, 0], [0, FRAME.h], [FRAME.w, FRAME.h], [CX, CY]] as [number, number][])
      .map((p) => { const q = toScreen(b, toWorld(a, p)); return Math.hypot(q[0] - p[0], q[1] - p[1]); }));
  };
  const blurAt = (t: number) => glides.some(([a, b]) => t + 1 / FPS > a && t < b) && frameMotion(t, 1 / FPS) > BLUR.over;
  const slideAt = (t: number, dt: number) => {
    const a = camAt(t), b = camAt(t + dt);
    const map = (p: [number, number]) => toScreen(b, toWorld(a, p));
    const o = map([0, 0]), x = map([1, 0]), y = map([0, 1]);
    return [x[0] - o[0] - 1, y[0] - o[0], o[0], x[1] - o[1], y[1] - o[1] - 1, o[1]];
  };
  const focusOf = (i: number, t: number) => {
    const g = glideAt(t);
    if (g) return g.i === i ? 1 - smooth(g.p) : g.i + 1 === i ? smooth(g.p) : 0;
    const held = t <= glides[0][0] ? 0 : t <= glides[1][0] ? 1 : t <= glides[2][0] ? 2 : 3;
    return held === i ? 1 : 0;
  };
  return { timing, beats, scenes, glides, camAt, blurAt, slideAt, focusOf };
}

export function toScreen(cam: Cam, p: [number, number], f = 1): [number, number] {
  const dx = (p[0] - cam.x) * cam.z * f, dy = (p[1] - cam.y) * cam.z * f, r = -cam.roll * RAD;
  return [CX + dx * Math.cos(r) - dy * Math.sin(r), CY + dx * Math.sin(r) + dy * Math.cos(r)];
}
export const layerTransform = (cam: Cam, f = 1) =>
  `translate(${CX}px, ${CY}px) rotate(${(-cam.roll).toFixed(4)}deg) scale(${(cam.z * f).toFixed(6)}) translate(${(-cam.x).toFixed(3)}px, ${(-cam.y).toFixed(3)}px)`;

export const BLUR = { subframes: 12, shutter: 1 / 60, over: 2 };

export function blurOf(cut: Cut, i: number, t: number, cam: Cam): number {
  const [x, y] = toScreen(cam, centreOf(SURFACES[i]));
  const far = clamp((Math.hypot(x - CX, y - CY) - 320) / 900);
  return (1 - cut.focusOf(i, t)) * far * 4.5;
}
const LAG = 0.45;
const LAMP: [number, number] = [-777, -605];
export function lampAt(cut: Cut, t: number, cam = cut.camAt(t)): [number, number] {
  const before = cut.camAt(Math.max(0, t - LAG));
  const [x, y] = toScreen(cam, [before.x, before.y]);
  return [x + LAMP[0], y + LAMP[1]];
}
export function shadowOf(i: number, cam: Cam, lamp: [number, number]): [number, number] {
  const [x, y] = toScreen(cam, centreOf(SURFACES[i]));
  const dx = x - lamp[0], dy = y - lamp[1], d = Math.hypot(dx, dy) || 1;
  const length = 9 + 9 * clamp(d / 1800);
  return [(dx / d) * length, (dy / d) * length];
}

// ---------------------------------------------------------------- the captions, from the same times

export interface CueOut { from: number; to: number; text: string }
/** Short cues that follow the words: each starts on its first word, and runs to the next one's start. */
export function cuesOf(cut: Cut): CueOut[] {
  const out: CueOut[] = [];
  cut.timing.lines.forEach((line, k) => {
    const marks = CUE_STARTS[k];
    marks.forEach((m, j) => {
      const next = marks[j + 1];
      const text = line.slice(m, next ?? line.length).map((w) => w.w).join(" ");
      out.push({ from: k === 0 && j === 0 ? Math.max(0.05, line[0].from - 0.05) : line[m].from - 0.05, to: 0, text });
    });
  });
  out.forEach((c, i) => (c.to = i + 1 < out.length ? out[i + 1].from : Math.min(DURATION - 0.1, cut.beats.end + 0.35)));
  // Each cue begins inside its shot: a line's first cue starts with its shot (shots start 0.12 s before the word).
  let i = 0;
  cut.timing.lines.forEach((_, k) => {
    out[i].from = k === 0 ? out[i].from : cut.beats.shots[k];
    if (i > 0) out[i - 1].to = out[i].from;
    i += CUE_STARTS[k].length;
  });
  return out;
}

/** The box drawn on the map, corner to corner, as [lon, lat]: over the rice country of the northern Nile Delta. */
export const BOX: [[number, number], [number, number]] = [[30.55, 31.38], [31.75, 30.65]];
export const V3_QUERY = `poly=${BOX[0][0]},${BOX[0][1]};${BOX[1][0]},${BOX[0][1]};${BOX[1][0]},${BOX[1][1]};${BOX[0][0]},${BOX[1][1]}&day=2023-10-20`;
