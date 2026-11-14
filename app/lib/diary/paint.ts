// The game's textures, painted once into canvases: the night sky, the Delta's fields from above, the
// flame strip a fire flickers through, and the wood of the desk. The sky, flame and wood are the
// landing page's own painters (app/landing-src/landing.js: paintSky, flameStrip, paintWood) brought
// into TypeScript; the fields are new, in the same hand. Colours are the Night tokens (lib/tokens.ts).

import { rng } from "@/lib/paper";
import { NIGHT } from "@/lib/tokens";

type RGB = [number, number, number];
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rgbOf = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a) * 1000) / 1000})`;

const N = Object.fromEntries(Object.entries(NIGHT).map(([k, v]) => [k, rgbOf(v)])) as Record<string, RGB>;
const dprOf = () => Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);

function sized(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  const dpr = dprOf();
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

export type SkyOptions = { seed: number; stars: number; bandStars: number; horizon: number; band?: { a: [number, number]; c: [number, number]; b: [number, number]; width: number } };

/** A desert night: the Milky Way with its dark rift, and stars of every brightness with a little colour. */
export function paintSky(canvas: HTMLCanvasElement, o: SkyOptions): boolean {
  const s = sized(canvas);
  if (!s) return false;
  const { g, w, h } = s;
  const r = rng(o.seed), horizon = h * o.horizon;
  const fade = (y: number) => clamp((horizon - y) / (h * 0.22));
  const dot = (x: number, y: number, rad: number, col: RGB, a: number) => { if (a <= 0.01) return; g.globalAlpha = a; g.fillStyle = rgba(col); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
  const blob = (x: number, y: number, rad: number, col: RGB, a: number) => { if (a <= 0.002) return; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
  const gauss = () => (r() + r() + r() + r() - 2) / 2;

  if (o.band) {
    const b = o.band, A = [w * b.a[0], h * b.a[1]], C = [w * b.c[0], h * b.c[1]], B = [w * b.b[0], h * b.b[1]];
    const at = (t: number) => [(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
    const dir = (t: number) => { const dx = 2 * (1 - t) * (C[0] - A[0]) + 2 * t * (B[0] - C[0]), dy = 2 * (1 - t) * (C[1] - A[1]) + 2 * t * (B[1] - C[1]), l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const width = Math.min(w, h) * b.width;
    const cool = mix(N.ink, N.lapis, 0.35), warm = mix(N.ink, N.brass, 0.45);
    const rift = (t: number) => Math.sin(t * 11 + 1.3) * 0.15 * width;
    // the glow is painted small and drawn up smoothly, then blurred to take out the gradient dither
    const q = 4, gw = Math.ceil(w / q), gh = Math.ceil(h / q);
    const gc = document.createElement("canvas"); gc.width = gw; gc.height = gh;
    const gg = gc.getContext("2d")!;
    const soft = (x: number, y: number, rad: number, col: RGB, a: number) => { if (a <= 0.002) return; x /= q; y /= q; rad /= q; const gr = gg.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); gg.fillStyle = gr; gg.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    gg.globalCompositeOperation = "lighter";
    for (let i = 0; i < 340; i++) {
      const t = r(), [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.55;
      const cx = x - ty * off, cy = y + tx * off, rad = width * (0.16 + r() * 0.42) * (1.25 - 0.5 * t);
      soft(cx, cy, rad, t < 0.4 && r() < 0.5 ? warm : cool, (0.009 + r() * 0.021) * (1.35 - 0.85 * t) * fade(cy));
    }
    for (let i = 0; i < 30; i++) {
      const t = r() * 0.6, [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.3;
      const cx = x - ty * off, cy = y + tx * off;
      soft(cx, cy, width * (0.05 + r() * 0.12), warm, 0.045 * fade(cy));
    }
    gg.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 95; i++) {
      const t = 0.03 + r() * 0.84, [x, y] = at(t), [tx, ty] = dir(t), off = rift(t) + gauss() * 0.07 * width;
      const rad = (width * (0.035 + r() * 0.08)) / q;
      gg.save(); gg.translate((x - ty * off) / q, (y + tx * off) / q); gg.rotate(Math.atan2(ty, tx)); gg.scale(2.4 + r() * 2.2, 1);
      const gr = gg.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, `rgba(0,0,0,${(0.5 + r() * 0.35).toFixed(2)})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      gg.fillStyle = gr; gg.fillRect(-rad, -rad, rad * 2, rad * 2); gg.restore();
    }
    const gb = document.createElement("canvas"); gb.width = gw; gb.height = gh;
    const gbx = gb.getContext("2d")!; gbx.filter = "blur(2.5px)"; gbx.drawImage(gc, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(gbx.filter === "blur(2.5px)" ? gb : gc, 0, 0, gw * q, gh * q);
    for (let i = 0; i < o.bandStars; i++) {
      const t = r(), [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.62;
      const cx = x - ty * off, cy = y + tx * off, dust = 1 - 0.75 * Math.exp(-Math.pow((off - rift(t)) / (0.07 * width), 2));
      dot(cx, cy, 0.3 + r() * 0.42, r() < 0.3 ? warm : N.ink, (0.1 + r() * 0.42) * dust * fade(cy));
    }
  }
  const blue = mix(N.ink, N.lapis, 0.5), gold = mix(N.ink, N.brass, 0.55), red = mix(N.ink, N.rubric, 0.32);
  for (let i = 0; i < o.stars; i++) {
    const x = r() * w, y = Math.pow(r(), 1.15) * Math.min(h, horizon * 1.02);
    const m = Math.pow(r(), 3.2), pick = r();
    const col = pick < 0.16 ? blue : pick < 0.27 ? gold : pick < 0.31 ? red : N.ink;
    const a = (0.3 + 0.7 * m) * fade(y), rad = 0.35 + m * 1.3;
    if (m > 0.5) blob(x, y, rad * 6, col, 0.15 * a);
    dot(x, y, rad, col, a);
  }
  g.globalAlpha = 1;
  return true;
}

/**
 * The Delta from above at night: a patchwork of fields, each hatched at its own angle like an
 * engraved map, cut by canals whose water is drawn in horizontal hairlines. Starlight only.
 */
export function paintFields(canvas: HTMLCanvasElement, seed: number): boolean {
  const s = sized(canvas);
  if (!s) return false;
  const { g, w, h } = s;
  const r = rng(seed);
  const soil = mix(N.ground, N.sky, 0.45), lit = mix(soil, N.brass, 0.16), deep = mix(soil, N.shadow, 0.5);
  g.fillStyle = rgba(soil); g.fillRect(0, 0, w, h);
  const cols = Math.max(5, Math.round(w / 90)), rows = Math.max(4, Math.round(h / 70));
  const cw = w / cols, rh = h / rows;
  const P: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    P.push([]);
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      P[j].push([i * cw + (edge ? 0 : (r() - 0.5) * cw * 0.5), j * rh + (edge ? 0 : (r() - 0.5) * rh * 0.5)]);
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const q = [P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]];
      const path = new Path2D(); q.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
      const tone = r();
      g.fillStyle = rgba(tone < 0.3 ? deep : tone > 0.8 ? lit : soil, 0.9); g.fill(path);
      g.save(); g.clip(path);
      const ang = r() < 0.5 ? (r() - 0.5) * 0.5 : Math.PI / 2 + (r() - 0.5) * 0.5, gap = 3.2 + r() * 2.4;
      g.translate(q[0][0] + cw / 2, q[0][1] + rh / 2); g.rotate(ang);
      g.strokeStyle = rgba(mix(N.brass, N.ink, 0.2), 0.08 + r() * 0.07); g.lineWidth = 0.7;
      g.beginPath();
      for (let y = -cw * 1.5; y < cw * 1.5; y += gap) { g.moveTo(-cw * 1.5, y); g.lineTo(cw * 1.5, y + (r() - 0.5) * 1.5); }
      g.stroke();
      g.restore();
      g.strokeStyle = rgba(N.shadow, 0.55); g.lineWidth = 1.2; g.stroke(path);
    }
  // canals: a few lattice lines become water, a band of hairlines between two banks
  const water = mix(N.sky, N.lapis, 0.25);
  for (let c = 0; c < 3; c++) {
    const horiz = c !== 1, k = 1 + Math.floor(r() * ((horiz ? rows : cols) - 1));
    const line = horiz ? P[k] : P.map((row) => row[k]);
    g.save();
    g.strokeStyle = rgba(water, 0.95); g.lineWidth = 7; g.lineJoin = "round";
    g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    g.strokeStyle = rgba(mix(N.ink, N.lapis, 0.5), 0.35); g.lineWidth = 0.6;
    for (const d of [-2, 0, 2]) { g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x + (horiz ? 0 : d), y + (horiz ? d : 0)) : g.moveTo(x + (horiz ? 0 : d), y + (horiz ? d : 0)))); g.stroke(); }
    g.strokeStyle = rgba(N.shadow, 0.8); g.lineWidth = 1;
    for (const d of [-4, 4]) { g.beginPath(); line.forEach(([x, y], i) => (i ? g.lineTo(x + (horiz ? 0 : d), y + (horiz ? d : 0)) : g.moveTo(x + (horiz ? 0 : d), y + (horiz ? d : 0)))); g.stroke(); }
    g.restore();
  }
  return true;
}

/**
 * n drawings of one fire side by side, shown w by h px each: the page steps through them by
 * transform (CSS steps), so the fire flickers by changing shape. lean tips the flames sideways.
 */
export function flameStrip(cv: HTMLCanvasElement, w: number, h: number, n: number, seed: number, lean = 0): void {
  const d = dprOf() * 2;
  const fw = Math.max(6, Math.round(w * d)), fh = Math.max(8, Math.round(h * d));
  cv.width = fw * n; cv.height = fh;
  const g = cv.getContext("2d");
  if (!g) return;
  const r = rng(seed);
  const white = mix(N.flame, N.ink, 0.5), orange = mix(N.flame, N.rubric, 0.55);
  for (let i = 0; i < n; i++) {
    g.save(); g.beginPath(); g.rect(i * fw, 0, fw, fh); g.clip();
    g.translate(i * fw + fw / 2, fh * 0.96);
    g.save(); g.scale(1, 0.3);
    const e = g.createRadialGradient(0, 0, 0, 0, 0, fw * 0.46);
    e.addColorStop(0, rgba(orange, 0.9)); e.addColorStop(0.55, rgba(N.rubric, 0.35)); e.addColorStop(1, rgba(N.rubric, 0));
    g.fillStyle = e; g.fillRect(-fw / 2, -fw * 0.46, fw, fw * 0.92); g.restore();
    g.globalCompositeOperation = "lighter";
    const sway = lean + (r() - 0.5) * 0.4, tongues = r() < 0.55 ? 3 : 2;
    for (let k = 0; k < tongues; k++) {
      const main = k === 0;
      const ht = fh * (main ? 0.72 + r() * 0.24 : 0.3 + r() * 0.36);
      const bw = fw * (main ? 0.28 + r() * 0.07 : 0.13 + r() * 0.08);
      const bx = main ? (r() - 0.5) * fw * 0.1 : (k === 1 ? -1 : 1) * fw * (0.12 + r() * 0.12);
      const tx = bx + (sway + (r() - 0.5) * 0.3) * ht * 0.32, mx = (bx + tx) / 2 + (r() - 0.5) * bw * 0.9;
      const p = new Path2D();
      p.moveTo(bx - bw, 0);
      p.bezierCurveTo(bx - bw * 1.1, -ht * 0.3, mx - bw * 0.6, -ht * 0.62, tx, -ht);
      p.bezierCurveTo(mx + bw * 0.45, -ht * 0.58, bx + bw * 1.1, -ht * 0.28, bx + bw, 0);
      p.closePath();
      const gr = g.createLinearGradient(0, 0, 0, -ht);
      gr.addColorStop(0, rgba(white, main ? 0.95 : 0.75)); gr.addColorStop(0.28, rgba(N.flame, 0.9)); gr.addColorStop(0.62, rgba(orange, 0.72)); gr.addColorStop(1, rgba(N.rubric, 0));
      g.fillStyle = gr; g.fill(p);
    }
    if (r() < 0.4) {
      const ty = -fh * (0.82 + r() * 0.12), tx = sway * fh * 0.3 + (r() - 0.5) * fw * 0.3, tr = fw * (0.05 + r() * 0.04);
      const p = new Path2D(); p.moveTo(tx, ty - tr * 2.4); p.quadraticCurveTo(tx + tr * 1.2, ty, tx, ty + tr); p.quadraticCurveTo(tx - tr * 1.2, ty, tx, ty - tr * 2.4);
      g.fillStyle = rgba(orange, 0.6); g.fill(p);
    }
    g.restore();
  }
}

/** Long planks running away from you, each its own tone, straight grain with a few knots. Tiles down. */
export function paintWood(W: number, H: number, seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!, r = rng(seed);
  const lit = mix(N.wood, N.brass, 0.3), base = mix(N.wood, N.brass, 0.16), deep = mix(N.wood, N.shadow, 0.42), pale = mix(N.wood, N.flame, 0.34);
  const planks: { x: number; w: number }[] = [];
  for (let x = 0; x < W;) { let pw = Math.round(150 + r() * 120); if (W - x - pw < 110) pw = W - x; planks.push({ x, w: pw }); x += pw; }
  const wave = (k: number) => { const hs = [1, 2, 3, 5, 7].map((n) => [n, ((r() * 2 - 1) * k) / n, r() * TAU]); return (y: number) => { let s = 0; for (const [n, a, p] of hs) s += a * Math.sin((TAU * n * y) / H + p); return s; }; };
  for (const pl of planks) {
    const tone = r() * 2 - 1, col = tone > 0 ? mix(base, lit, tone * 0.75) : mix(base, deep, -tone * 0.5);
    const gr = g.createLinearGradient(pl.x, 0, pl.x + pl.w, 0);
    gr.addColorStop(0, rgba(mix(col, deep, 0.22))); gr.addColorStop(0.5, rgba(mix(col, lit, 0.08))); gr.addColorStop(1, rgba(mix(col, deep, 0.28)));
    g.fillStyle = gr; g.fillRect(pl.x, 0, pl.w, H);
    g.save(); g.beginPath(); g.rect(pl.x, 0, pl.w, H); g.clip();
    for (let i = 0; i < 7; i++) {
      const x0 = pl.x + r() * pl.w, sw = 8 + r() * 30, sc = r() < 0.5 ? deep : pale, sg = g.createLinearGradient(x0 - sw, 0, x0 + sw, 0);
      sg.addColorStop(0, rgba(sc, 0)); sg.addColorStop(0.5, rgba(sc, 0.05 + r() * 0.07)); sg.addColorStop(1, rgba(sc, 0));
      g.fillStyle = sg; g.fillRect(x0 - sw, 0, sw * 2, H);
    }
    const knots: { x: number; y: number; r: number }[] = [];
    if (r() < 0.55) knots.push({ x: pl.x + pl.w * (0.2 + r() * 0.6), y: H * (0.14 + r() * 0.72), r: 6 + r() * 9 });
    const bend = (x: number, y: number) => { let d = 0; for (const k of knots) { const dx = x - k.x, dy = y - k.y; d += Math.sign(dx || 1) * k.r * 2.2 * Math.exp(-(dy * dy) / (2 * (k.r * 3.2) ** 2)) * Math.exp(-Math.abs(dx) / (k.r * 2.5)); } return d; };
    const shared = wave(5 + r() * 9), n = Math.round(pl.w / 2.4);
    for (let i = 0; i < n; i++) {
      const x0 = pl.x + ((i + r() * 0.8) * pl.w) / n, own = wave(1.5 + r() * 2.5), late = r() < 0.16;
      g.strokeStyle = rgba(late ? deep : mix(deep, base, 0.4), late ? 0.15 + r() * 0.12 : 0.04 + r() * 0.08);
      g.lineWidth = late ? 1 + r() * 1.2 : 0.5 + r() * 0.7;
      g.beginPath();
      for (let y = 0; y <= H; y += 6) { const x = x0 + shared(y) + own(y), xx = x + bend(x, y); if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y); }
      g.stroke();
    }
    for (const k of knots) {
      for (let j = 0; j < 7; j++) { g.strokeStyle = rgba(deep, 0.2 - j * 0.022); g.lineWidth = j === 0 ? 2.2 : 1; g.beginPath(); g.ellipse(k.x, k.y, k.r * 0.55 + j * 2.2, k.r * 0.9 + j * 4.2, 0, 0, TAU); g.stroke(); }
      g.fillStyle = rgba(deep, 0.6); g.beginPath(); g.ellipse(k.x, k.y, k.r * 0.45, k.r * 0.7, 0, 0, TAU); g.fill();
    }
    g.restore();
    g.fillStyle = rgba(N.shadow, 0.75); g.fillRect(pl.x + pl.w - 1.6, 0, 1.6, H);
    g.fillStyle = rgba(pale, 0.1); g.fillRect(pl.x, 0, 1, H);
  }
  return c;
}

/** Run a paint once the browser is idle, so it never lands in a frame. */
export function whenIdle(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) { const id = w.requestIdleCallback(fn, { timeout: 400 }); return () => w.cancelIdleCallback?.(id); }
  const id = window.setTimeout(fn, 60);
  return () => window.clearTimeout(id);
}
