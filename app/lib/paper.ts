// Paper, painted. The landing page's sheets (app/landing-src/landing.js, paintPaper) brought into
// the app: a deckled edge, slow mottling, tooth, fibres, the edges toasted by age, a little foxing.
// One canvas per piece, painted once per size. The same seed always gives the same sheet, so a
// piece that grows keeps its look.

import { COLOURS } from "./tokens";

export type PaperKind = "sheet" | "card" | "slip";
export type Side = "t" | "r" | "b" | "l";

type RGB = [number, number, number];
const TAU = Math.PI * 2;

const rgbOf = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000})`;

/** A small, fast, seeded generator (mulberry32), as on the landing page. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

let tooth: HTMLCanvasElement | null = null;
function noiseTile(): HTMLCanvasElement {
  if (tooth) return tooth;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const img = g.createImageData(128, 128);
  const r = rng(5), dark = rgbOf(COLOURS.shadow), light = rgbOf(COLOURS["ground-raised"]);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r(), col = v < 0.5 ? dark : light;
    img.data[i] = col[0];
    img.data[i + 1] = col[1];
    img.data[i + 2] = col[2];
    img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 30);
  }
  g.putImageData(img, 0, 0);
  tooth = c;
  return c;
}

export interface PaperOptions { kind?: PaperKind; torn?: Side | ""; seed?: string }

/**
 * Paint a sheet of paper `w` by `h` CSS pixels into `canvas`. The edge is drawn inside the box,
 * a few pixels in from each side, so the box itself never shows.
 */
export function paintPaper(canvas: HTMLCanvasElement, w: number, h: number, { kind = "sheet", torn = "", seed = kind }: PaperOptions = {}): void {
  if (!w || !h) return;
  const F = {
    ground: rgbOf(COLOURS.ground),
    raised: rgbOf(COLOURS["ground-raised"]),
    brass: rgbOf(COLOURS.brass),
    shadow: rgbOf(COLOURS.shadow),
  };
  const r = rng(hashStr(seed));
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const amp = { card: 1.1, sheet: 1.5, slip: 1.2 }[kind];

  // The deckle: each side walks along in 4 px steps, its depth drifting.
  const edge: [number, number][] = [];
  const side = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, key: Side) => {
    const length = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(2, Math.round(length / 4));
    let drift = 0;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      drift = drift * 0.82 + (r() - 0.5) * 0.9;
      let d = amp * (1 + drift * 0.7 + r() * 0.5);
      if (torn === key) d = 3 + Math.abs(drift) * 7 + r() * 3.5;
      else if (r() < 0.012) d += 2 + r() * 3;
      edge.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
    }
  };
  side(0, 0, w, 0, 0, 1, "t");
  side(w, 0, w, h, -1, 0, "r");
  side(w, h, 0, h, 0, -1, "b");
  side(0, h, 0, 0, 1, 0, "l");
  const outline = () => {
    g.beginPath();
    edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };

  // A sheet is fresh paper with a little of the older ground in it: light enough that brass and
  // rubric text keep 4.5:1 after the grain and the washes (scripts/contrast.mjs).
  const base = kind === "card" ? F.raised : kind === "slip" ? mix(F.raised, F.brass, 0.035) : mix(F.raised, F.ground, 0.2);
  const toast = mix(F.brass, F.shadow, 0.3);
  g.clearRect(0, 0, w, h);
  outline();
  g.fillStyle = rgba(base);
  g.fill();
  g.save();
  outline();
  g.clip();
  // Mottling: a few large, faint washes.
  for (let i = 0; i < 14; i++) {
    const x = r() * w, y = r() * h, rad = (0.15 + r() * 0.45) * Math.max(w, h);
    const col = r() < 0.55 ? mix(base, F.brass, 0.5) : mix(base, F.raised, 0.9);
    const wash = g.createRadialGradient(x, y, 0, x, y, rad);
    wash.addColorStop(0, rgba(col, 0.05 + r() * 0.06));
    wash.addColorStop(1, rgba(col, 0));
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);
  }
  // Tooth.
  const pattern = g.createPattern(noiseTile(), "repeat");
  if (pattern) {
    g.fillStyle = pattern;
    g.fillRect(0, 0, w, h);
  }
  // Fibres, in four batches: one path per shade.
  g.lineWidth = 0.5;
  for (const [col, a] of [[F.shadow, 0.03], [F.shadow, 0.06], [F.raised, 0.04], [F.raised, 0.075]] as [RGB, number][]) {
    g.strokeStyle = rgba(col, a);
    g.beginPath();
    for (let i = 0, n = (w * h) / 2200; i < n; i++) {
      const x = r() * w, y = r() * h, an = r() * TAU, l = 2 + r() * 9;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(an + 0.6) * l * 0.5, y + Math.sin(an + 0.6) * l * 0.5, x + Math.cos(an) * l, y + Math.sin(an) * l);
    }
    g.stroke();
  }
  // Age at the edges. A slip is new paper: lighter toasting.
  const age = kind === "slip" ? 0.6 : 1;
  for (const [lw, a] of [[48, 0.045], [22, 0.06], [9, 0.08], [3, 0.12]]) {
    outline();
    g.lineWidth = lw;
    g.strokeStyle = rgba(toast, a * age);
    g.stroke();
  }
  // Foxing, mostly near the edges.
  for (let i = 0, n = (6 + r() * 12) * Math.min(1, (w * h) / 120000); i < n; i++) {
    const nearEdge = r() < 0.6;
    const x = nearEdge ? (r() < 0.5 ? r() * 40 : w - r() * 40) : r() * w, y = r() * h;
    g.fillStyle = rgba(toast, 0.08 + r() * 0.12);
    g.beginPath();
    g.arc(x, y, 0.6 + r() * 2.6, 0, TAU);
    g.fill();
  }
  g.restore();
}
