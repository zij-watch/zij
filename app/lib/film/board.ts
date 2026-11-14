// The second film, /studio/film/v2: one continuous camera take across a board (docs/event/FILM.md).
// The board is the landing page's night desk with the seven papers pinned on it, about four frames
// wide and two and a half tall. Everything here is a pure function of the time t in seconds: where
// the camera is, how far the thread is drawn, where the lamp is, how soft each paper is.

import { clamp, FPS, lerp, SCENES } from "./timeline";

export const FRAME = { w: 1920, h: 1080 };
const CX = FRAME.w / 2, CY = FRAME.h / 2;
/** A paper in focus lies between these lines of the frame. */
const VIEW = { top: 40, bottom: 1040 };

const RAD = Math.PI / 180;
const smooth = (x: number) => {
  const k = clamp(x);
  return k * k * (3 - 2 * k);
};

// ---------------------------------------------------------------- the papers

export interface Spot {
  n: number;
  /** Top left on the board, in world pixels. In focus, one world pixel is one pixel of the frame. */
  x: number; y: number;
  w: number; h: number;
  /** Degrees, about the main pin. */
  rot: number;
  /** The main pin, from the paper's top left. The thread runs through these. */
  pin: [number, number];
  /** Pins of the paper's other sheets, from the paper's top left. */
  pins?: [number, number][];
}

export const SPOTS: Spot[] = [
  { n: 1, x: 320, y: 300, w: 1170, h: 750, rot: -1.4, pin: [585, 18] },
  { n: 2, x: 2050, y: 200, w: 1630, h: 725, rot: 1.1, pin: [538, 18], pins: [[1366, 26]] },
  { n: 3, x: 3980, y: 360, w: 1722, h: 715, rot: -0.7, pin: [616, 18], pins: [[1496, 108]] },
  { n: 4, x: 5960, y: 220, w: 1600, h: 890, rot: 1.3, pin: [800, 18] },
  { n: 5, x: 5780, y: 1490, w: 1600, h: 890, rot: -1, pin: [800, 18] },
  { n: 6, x: 3720, y: 1430, w: 1663, h: 1120, rot: 0.6, pin: [470, 18], pins: [[1321, 18]] },
  { n: 7, x: 1980, y: 1560, w: 1180, h: 730, rot: -0.9, pin: [590, 18] },
];
/** The slip with the team and the challenge, pinned at paper 1's top left corner (paper 1's own coordinates). */
export const CORNER = { x: -70, y: -50 };

export const pinAt = (s: Spot): [number, number] => [s.x + s.pin[0], s.y + s.pin[1]];
export const centreOf = (s: Spot): [number, number] => [s.x + s.w / 2, s.y + s.h / 2];

/** Every pin of a paper on the board, the main one first; the paper turns about its main pin. */
export function pinsOf(s: Spot): [number, number][] {
  const [px, py] = pinAt(s), r = s.rot * RAD;
  return [[px, py], ...(s.pins ?? []).map(([lx, ly]): [number, number] => {
    const dx = lx - s.pin[0], dy = ly - s.pin[1];
    return [px + dx * Math.cos(r) - dy * Math.sin(r), py + dx * Math.sin(r) + dy * Math.cos(r)];
  })];
}

/** The board's papers, as a box: [west, north, east, south] in world pixels. */
function boardBox(): [number, number, number, number] {
  const xs = SPOTS.flatMap((s) => [s.x, s.x + s.w]), ys = SPOTS.flatMap((s) => [s.y, s.y + s.h]);
  return [Math.min(...xs, SPOTS[0].x + CORNER.x), Math.min(...ys, SPOTS[0].y + CORNER.y), Math.max(...xs), Math.max(...ys)];
}

// ---------------------------------------------------------------- the camera's keyframes

export interface Cam { x: number; y: number; z: number; roll: number }

/** A paper in focus: one world pixel to one frame pixel, its top near the top of the frame, turned a little with it. */
function focusKey(s: Spot): Cam {
  const top = s.h <= VIEW.bottom - VIEW.top ? (VIEW.bottom + VIEW.top - s.h) / 2 : VIEW.top;
  return { x: s.x + s.w / 2, y: s.y + (CY - top), z: 1, roll: 0.6 * s.rot };
}

export const KEYS: Cam[] = (() => {
  const [w, n, e, s] = boardBox();
  const z = 1800 / (e - w);
  // The whole board, in the middle of the frame.
  const wide: Cam = { x: (w + e) / 2, y: (n + s) / 2, z, roll: 0 };
  const papers = SPOTS.map(focusKey);
  const last = papers[papers.length - 1];
  // The end: the whole board again with room round it (the thread's loop on the right included),
  // drawn a little towards the Seal card.
  const end: Cam = { x: lerp(wide.x, last.x, 0.15), y: lerp(wide.y, last.y, 0.15), z: 1640 / (e - w), roll: -0.2 };
  return [wide, ...papers, end];
})();

// ---------------------------------------------------------------- time to path: the remap

/**
 * The camera's place along its path, u: 0 is the wide shot, 1 to 7 are the papers, 8 the end.
 * On each paper the camera drifts at a crawl (it never stops dead); between papers it glides, with
 * a speed that rises and falls smoothly from the crawl on one side to the crawl on the other (it
 * never starts suddenly). The last glide eases to rest on the whole board just before the end.
 */
export const TRAVELS: [number, number][] = [[0.6, 1.8], [5.65, 6.7], [9.85, 10.9], [13.25, 14.3], [17.65, 18.7], [21.45, 22.5], [24.25, 25.3], [27.7, 29.2]];
const CRAWL = 0.0032; // the camera's speed along its path while a paper is in focus, in u per second

interface Span { t0: number; t1: number; u0: number; u1: number; travel: number; vs: number; ve: number }

const SPANS: Span[] = (() => {
  const spans: Span[] = [];
  const dwell = (t0: number, t1: number, u0: number, u1: number) => spans.push({ t0, t1, u0, u1, travel: 0, vs: (u1 - u0) / (t1 - t0), ve: (u1 - u0) / (t1 - t0) });
  // While a paper is in focus the camera crawls past it, centred on it: half the crawl before, half after.
  const half = (j: number) => (j === 0 ? 0 : (CRAWL * (TRAVELS[j][0] - TRAVELS[j - 1][1])) / 2);
  dwell(0, TRAVELS[0][0], 0, CRAWL * TRAVELS[0][0]);
  TRAVELS.forEach(([t0, t1], j) => {
    const to = j + 1, last = j === TRAVELS.length - 1;
    spans.push({ t0, t1, u0: j === 0 ? CRAWL * TRAVELS[0][0] : j + half(j), u1: last ? to : to - half(to), travel: to, vs: 0, ve: 0 });
    if (!last) dwell(t1, TRAVELS[j + 1][0], to - half(to), to + half(to));
  });
  // Each glide starts at the crawl of the paper it leaves and ends at the crawl of the one it reaches.
  spans.forEach((span, i) => {
    if (!span.travel) return;
    span.vs = spans[i - 1].ve;
    span.ve = spans[i + 1]?.vs ?? 0;
  });
  return spans;
})();

const spanAt = (t: number) => SPANS.find((s) => t < s.t1) ?? SPANS[SPANS.length - 1];

/** u at time t. A glide's speed is the crawl blended across, plus a smooth hump (sin²) that covers the distance. */
export function pathAt(t: number): number {
  const s = spanAt(t);
  const d = s.t1 - s.t0, x = clamp((t - s.t0) / d);
  if (!s.travel) return s.u0 + (s.u1 - s.u0) * x;
  const hump = (2 * (s.u1 - s.u0)) / d - (s.vs + s.ve);
  return s.u0 + d * (s.vs * x + (s.ve - s.vs) * (x ** 3 - x ** 4 / 2) + hump * (x / 2 - Math.sin(2 * Math.PI * x) / (4 * Math.PI)));
}

/** How far a glide has got, 0 to 1, or null between glides. */
export function travelAt(t: number): { n: number; p: number } | null {
  const s = spanAt(t);
  if (!s.travel || t < s.t0 || t > s.t1) return null;
  return { n: s.travel, p: clamp((pathAt(t) - s.u0) / (s.u1 - s.u0)) };
}

/** When a paper's story starts: its glide is 70% of the way there. */
export function storyStart(n: number): number {
  const s = SPANS.find((span) => span.travel === n)!;
  let lo = s.t0, hi = s.t1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if ((pathAt(mid) - s.u0) / (s.u1 - s.u0) < 0.7) lo = mid;
    else hi = mid;
  }
  return Math.round(hi * 1000) / 1000;
}
export const STORY: number[] = [0, ...SPOTS.map((s) => storyStart(s.n))];

// ---------------------------------------------------------------- the camera at t

/** Centripetal Catmull-Rom between b and c, with a and d either side. */
function catmull(a: number[], b: number[], c: number[], d: number[], s: number): number[] {
  const gap = (p: number[], q: number[]) => Math.max(1e-6, Math.hypot(q[0] - p[0], q[1] - p[1]) ** 0.5);
  const t0 = 0, t1 = t0 + gap(a, b), t2 = t1 + gap(b, c), t3 = t2 + gap(c, d);
  const t = lerp(t1, t2, s);
  const mix = (p: number[], q: number[], ta: number, tb: number) => p.map((v, i) => ((tb - t) * v + (t - ta) * q[i]) / (tb - ta));
  const a1 = mix(a, b, t0, t1), a2 = mix(b, c, t1, t2), a3 = mix(c, d, t2, t3);
  const b1 = mix(a1, a2, t0, t2), b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** The camera at u: position on the spline; zoom (in log) and roll eased from key to key. */
function camOnPath(u: number): Cam {
  const last = KEYS.length - 1;
  const i = Math.min(last - 1, Math.max(0, Math.floor(u))), s = clamp(u - i);
  const P = (k: number) => {
    if (k < 0) return [2 * KEYS[0].x - KEYS[1].x, 2 * KEYS[0].y - KEYS[1].y];
    if (k > last) return [2 * KEYS[last].x - KEYS[last - 1].x, 2 * KEYS[last].y - KEYS[last - 1].y];
    return [KEYS[k].x, KEYS[k].y];
  };
  const [x, y] = catmull(P(i - 1), P(i), P(i + 1), P(i + 2), s);
  const k = smooth(s);
  return { x, y, z: Math.exp(lerp(Math.log(KEYS[i].z), Math.log(KEYS[i + 1].z), k)), roll: lerp(KEYS[i].roll, KEYS[i + 1].roll, k) };
}

export function camAt(t: number): Cam {
  const time = clamp(t, 0, SCENES[SCENES.length - 1].to);
  const cam = camOnPath(pathAt(time));
  const glide = travelAt(time);
  if (glide && glide.n >= 2 && glide.n <= 7) cam.z *= Math.exp(-0.13 * Math.sin(Math.PI * glide.p)); // out a little between papers
  if (glide && glide.n === 8) cam.z *= Math.exp(-0.09 * Math.sin(Math.PI * clamp((glide.p - 0.35) / 0.65))); // past the whole board, then settle
  return cam;
}

/** A world point on screen, for a layer that moves `f` times as fast as the papers (parallax). */
export function toScreen(cam: Cam, p: [number, number], f = 1): [number, number] {
  const dx = (p[0] - cam.x) * cam.z * f, dy = (p[1] - cam.y) * cam.z * f, r = -cam.roll * RAD;
  return [CX + dx * Math.cos(r) - dy * Math.sin(r), CY + dx * Math.sin(r) + dy * Math.cos(r)];
}
function toWorld(cam: Cam, p: [number, number]): [number, number] {
  const dx = p[0] - CX, dy = p[1] - CY, r = cam.roll * RAD;
  return [cam.x + (dx * Math.cos(r) - dy * Math.sin(r)) / cam.z, cam.y + (dx * Math.sin(r) + dy * Math.cos(r)) / cam.z];
}
/** The same, as a CSS transform for a layer whose origin is the world's (0, 0). */
export const layerTransform = (cam: Cam, f = 1) =>
  `translate(${CX}px, ${CY}px) rotate(${(-cam.roll).toFixed(4)}deg) scale(${(cam.z * f).toFixed(6)}) translate(${(-cam.x).toFixed(3)}px, ${(-cam.y).toFixed(3)}px)`;

/**
 * Motion blur: a frame is the mean of 12 pictures spread over 1/60 s (a 180 degree shutter), each
 * standing for its 1/720 s of it. Only frames in which the camera moves more than 2 px get it; on a
 * paper the camera crawls slower than that, and those frames are one picture each.
 */
export const BLUR = { subframes: 12, shutter: 1 / 60, over: 2 };
export const blurAt = (t: number) => frameMotion(t, 1 / FPS) > BLUR.over;

/**
 * How the picture slides between t and t + dt, as an affine field in frame pixels: a point of the
 * papers on screen at p at t is at p + d(p) at t + dt, where d(p) = [a·x + b·y + c, e·x + f·y + g],
 * returned as [a, b, c, e, f, g]. A subframe of the motion blur is smeared along it over its slice
 * of the shutter, so its neighbours meet without a gap.
 */
export function slideAt(t: number, dt: number): number[] {
  const a = camAt(t), b = camAt(t + dt);
  const map = (p: [number, number]) => toScreen(b, toWorld(a, p));
  const o = map([0, 0]), x = map([1, 0]), y = map([0, 1]);
  return [x[0] - o[0] - 1, y[0] - o[0], o[0], x[1] - o[1], y[1] - o[1] - 1, o[1]];
}

/** How far the frame moves, in frame pixels, between t and t + span: the corners and the middle. */
export function frameMotion(t: number, span: number): number {
  const a = camAt(t), b = camAt(t + span);
  return Math.max(...([[0, 0], [FRAME.w, 0], [0, FRAME.h], [FRAME.w, FRAME.h], [CX, CY]] as [number, number][])
    .map((p) => { const q = toScreen(b, toWorld(a, p)); return Math.hypot(q[0] - p[0], q[1] - p[1]); }));
}

// ---------------------------------------------------------------- focus

/** How much a paper is the one in focus, 0 to 1: it grows as the camera arrives and falls as it leaves. */
export function focusOf(n: number, t: number): number {
  const glide = travelAt(t);
  if (glide) {
    if (glide.n === 8) return n === 7 ? 1 : 0;
    if (glide.n === n) return smooth(glide.p);
    if (glide.n === n + 1) return 1 - smooth(glide.p);
    return 0;
  }
  const u = pathAt(t);
  if (u >= 7.5) return n === 7 ? 1 : 0; // at rest on the whole board, the card is still the paper in focus
  return Math.abs(u - n) < 0.5 ? 1 : 0;
}

/** The soft blur of a paper, in frame pixels: none in focus, more the further it is from the middle of the frame. */
export function blurOf(n: number, t: number, cam: Cam): number {
  const [x, y] = toScreen(cam, centreOf(SPOTS[n - 1]));
  const far = clamp((Math.hypot(x - CX, y - CY) - 320) / 900);
  return (1 - focusOf(n, t)) * far * 4.5;
}

// ---------------------------------------------------------------- the lamp

const LAG = 0.45; // seconds the lamp's light is behind the camera
const LAMP: [number, number] = [-777, -605]; // where the lamp stands, from the middle of the frame, when the camera rests

/** The lamp on screen: where the camera was a moment ago, seen from where it is now. */
export function lampAt(t: number, cam = camAt(t)): [number, number] {
  const before = camAt(Math.max(0, t - LAG));
  const [x, y] = toScreen(cam, [before.x, before.y]);
  return [x + LAMP[0], y + LAMP[1]];
}

/** A paper's shadow, in world pixels: cast away from the lamp, longer the further the paper is from it. */
export function shadowOf(n: number, cam: Cam, lamp: [number, number]): [number, number] {
  const [x, y] = toScreen(cam, centreOf(SPOTS[n - 1]));
  const dx = x - lamp[0], dy = y - lamp[1], d = Math.hypot(dx, dy) || 1;
  const length = 9 + 9 * clamp(d / 1800);
  return [(dx / d) * length, (dy / d) * length];
}

// ---------------------------------------------------------------- the thread

export interface Thread { d: string; length: number; at: number[] }

/**
 * The brass thread from pin to pin. Between neighbours it arcs above the papers' top edges, so it
 * never lies across a heading; from paper 4 down to paper 5 it runs round the right of the board.
 * Also the length of thread up to each pin.
 */
export const THREAD: Thread = (() => {
  const pins = SPOTS.map(pinAt);
  const right = Math.max(...SPOTS.map((s) => s.x + s.w)) + 340;
  let d = `M${pins[0][0]} ${pins[0][1]}`;
  const at = [0];
  for (let i = 0; i + 1 < pins.length; i++) {
    const [ax, ay] = pins[i], [bx, by] = pins[i + 1];
    let c1: [number, number], c2: [number, number];
    if (Math.abs(by - ay) > Math.abs(bx - ax)) {
      c1 = [right, ay - 80];
      c2 = [right, by - 60];
    } else {
      const lift = Math.min(ay, by) - 150;
      c1 = [ax + (bx - ax) / 3, lift];
      c2 = [ax + (2 * (bx - ax)) / 3, lift];
    }
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${bx} ${by}`;
    let sum = 0, px = ax, py = ay;
    for (let k = 1; k <= 96; k++) {
      const s = k / 96, r = 1 - s;
      const qx = r ** 3 * ax + 3 * r * r * s * c1[0] + 3 * r * s * s * c2[0] + s ** 3 * bx;
      const qy = r ** 3 * ay + 3 * r * r * s * c1[1] + 3 * r * s * s * c2[1] + s ** 3 * by;
      sum += Math.hypot(qx - px, qy - py);
      px = qx;
      py = qy;
    }
    at.push(at[at.length - 1] + sum);
  }
  return { d, length: at[at.length - 1], at };
})();

/** How much of the thread is drawn at t: its end runs a little under half a stretch ahead of the camera. */
export function threadDrawn(t: number): number {
  const q = clamp(pathAt(t) + 0.45 - 1, 0, THREAD.at.length - 1);
  const i = Math.min(THREAD.at.length - 2, Math.floor(q));
  return THREAD.at[i] + (THREAD.at[i + 1] - THREAD.at[i]) * (q - i);
}

// ---------------------------------------------------------------- each paper's story, from its start

export const BEATS = {
  jump: { modis: 0, modisEvery: 0.06, modisFor: 0.3, modisLabel: 0.6, divide: 0.85, viirs: 0.95, viirsEvery: 0.05, viirsLabel: 1.6 },
  link: { lever: 0.1, leverFor: 0.3, flip: 0.25, settle: 0.8, whiskers: 0.7, median: 1.05, rows: 1.3, rowEvery: 0.055, rowFor: 0.35 },
  proof: { bars: 0.15, barEvery: 0.18, barFor: 0.32, counter: 0.45, counterFor: 1.5 },
  area: { fly: 0.15, flyFor: 1, cursor: 1, draw: 1.3, drawEvery: 0.18, results: 2.4, resultsFor: 0.6, badge: 2.75, verdict: 2.85, verdictFor: 0.6 },
  day: { slip: 0.05, drops: 0.3, dropsFor: 1.1, dropFor: 0.4, bloomFor: 0.8, turn: 1.75, turnFor: 0.9 },
  take: { csv: 0.35, picture: 0.85 },
  seal: { seal: 0.1, team: 1.8, credit: 2.1 },
};

// ---------------------------------------------------------------- the titles, written on the papers

/**
 * Each paper's title, in ink, as its heading: written in left to right as the camera arrives (from
 * the paper's story start) and left on the paper. The Seal card has none; it carries the team and
 * the credit line. The captions are not in the picture: they are a separate track (zij-demo30.en.srt).
 */
export const TITLES: Record<number, string> = {
  1: "As recorded",
  2: "One record, 2000 to today",
  3: "Tested on unseen years",
  4: "Any area",
  5: "Any day",
  6: "Take it with you",
};
/** A title is inked in, left to right, in this long. */
export const TITLE_INK = 0.45;
/** On screen, in focus, a title's letters are this tall. */
export const TITLE_PX = 56;

/** The film is encoded in pieces of about five seconds, cut on frame boundaries. */
export const CHUNKS = Array.from({ length: Math.ceil(SCENES[SCENES.length - 1].to / 5) }, (_, i) => ({
  n: i + 1, name: `chunk ${i + 1}`, from: i * 5, to: Math.min((i + 1) * 5, SCENES[SCENES.length - 1].to),
}));
