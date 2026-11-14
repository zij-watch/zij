// The film's clock (/studio/film, docs/event/FILM.md): 29.5 seconds at 30 frames a second.
// Every motion in the film is a function of the time t, in seconds, made from the pieces here.
// Nothing in the film uses a timer, a CSS transition or a random number without a seed, so the
// same t always draws the same frame.

import { easeLamp } from "../map/atlas/camera";

export const FPS = 30;
export const DURATION = 29.5;
export const FRAMES = Math.round(DURATION * FPS);
/** From here to the end nothing moves: the last second is held still. */
export const STILL_FROM = DURATION - 1;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export interface Scene { n: number; id: string; name: string; from: number; to: number }

/** The seven scenes. Each is rendered to one file; a transition lives inside the scene it opens. */
export const SCENES: Scene[] = [
  { n: 1, id: "jump", name: "The jump", from: 0, to: 6.4 },
  { n: 2, id: "link", name: "The link", from: 6.4, to: 10.6 },
  { n: 3, id: "proof", name: "The proof", from: 10.6, to: 14 },
  { n: 4, id: "area", name: "Any area", from: 14, to: 18.4 },
  { n: 5, id: "day", name: "Any day", from: 18.4, to: 22.2 },
  { n: 6, id: "take", name: "Take it", from: 22.2, to: 25 },
  { n: 7, id: "end", name: "End card", from: 25, to: DURATION },
];

export const sceneAt = (t: number): Scene => SCENES.find((s) => t < s.to) ?? SCENES[SCENES.length - 1];

/**
 * The area and the day the film shows, as the address carries them: the same `poly` and `day`
 * Explore, the brief and Downloads read. A drawn polygon over the rice country of the northern
 * Nile Delta, and a day of the 2023 straw burning.
 */
export const FILM_QUERY = "poly=30.55,31.05;30.95,31.4;31.55,31.38;31.8,30.95;31.25,30.6;30.5,30.72&day=2023-10-20";
/** The preset the map flies to before the polygon is drawn. */
export const PRESET = "nile-delta";

// ---------------------------------------------------------------- motion

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The one easing curve for moves: the design system's ease-lamp, in and out, no overshoot. */
export const ease = easeLamp;
/** A move that starts at `from` and lasts `dur` seconds: 0 before, 1 after. */
export const move = (t: number, from: number, dur: number) => ease(clamp((t - from) / dur));

/**
 * The one spring for arrivals. It is critically damped: it runs in fast and settles flat, with no
 * bounce (the design system's rule for paper). After `dur` seconds it is exactly 1.
 */
export const SPRING = 0.6;
export function arrive(t: number, from: number, dur = SPRING): number {
  const s = (t - from) / dur;
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const w = 7.8; // stiffness over the spring's own length
  const at = (x: number) => 1 - (1 + w * x) * Math.exp(-w * x);
  return at(s) / at(1);
}

/** Text is inked in left to right over this long. */
export const INK = 0.25;
/** The caption strip fades in and out over this long, inside its caption's own time. */
export const CAPTION_FADE = 0.15;
/** A sheet slides over and settles in this long. */
export const SLIDE = 0.7;
/** The ink rule: the line draws across, then travels down the frame with the next sheet behind it. */
export const RULE = { draw: 0.25, sweep: 0.45 };
export const RULE_FOR = RULE.draw + RULE.sweep;

/**
 * The slow push-in: 0 at the start of a scene, 1 at its end, at a steady pace. The end card stops
 * a second early, so the last second is still.
 */
export function push(t: number): number {
  const s = sceneAt(t);
  const to = s.n === SCENES.length ? STILL_FROM : s.to;
  return clamp((t - s.from) / (to - s.from));
}

// ---------------------------------------------------------------- the beats, in seconds

export const T = {
  lampUp: 0.9, // the lamp comes up over the first 0.9 s
  // 1. The jump
  corner: 0.3,
  modisBars: 0.5, modisEvery: 0.09, modisFor: 0.35,
  viirsBars: 1.9, viirsEvery: 0.05,
  modisLabel: 1.45, divide: 1.7, viirsLabel: 2.7,
  // 2. The link
  lever: 6.75, leverFor: 0.3, flip: 6.9, settle: 0.8, whiskers: 7.35, median: 7.7,
  calendarIn: 7.9, rows: 8.6, rowEvery: 0.055, rowFor: 0.35,
  // 3. The proof
  proofRule: 10.6, proofCard: 11.2, proofBars: 11.3, proofEvery: 0.2, proofFor: 0.32, counter: 11.6, counterFor: 1.5,
  // 4. Any area
  mapIn: 14, fly: 14.5, flyFor: 1.2, cursorIn: 15.4, draw: 15.8, drawEvery: 0.2,
  resultsIn: 17.05, badge: 17.45, verdict: 17.55, verdictFor: 0.7,
  // 5. Any day
  daySlip: 18.6, drops: 19, dropsFor: 1.4, dropFor: 0.4, bloomFor: 0.8, turn: 20.7, turnFor: 1,
  // 6. Take it
  briefIn: 22.2, csv: 23, picture: 23.5,
  // 7. End card
  endRule: 25, seal: 25.6, team: 27.7, credit: 28,
};

/** A frame's time. Frame 0 is t = 0; the last frame is one frame short of the full length. */
export const timeOf = (frame: number) => frame / FPS;
