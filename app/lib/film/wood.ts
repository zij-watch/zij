// The desk of the film: the landing page's wood (app/landing-src/landing.js, paintWood) brought
// here as it is, in the Night colours. Long planks, each its own tone, straight grain with a few
// knots, flat-sawn arches on some, butt joints and seams. The same seed always paints the same desk.

import { rng } from "../paper";
import { NIGHT } from "../tokens";

type RGB = [number, number, number];
const TAU = Math.PI * 2;
const rgbOf = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(Math.min(1, Math.max(0, a)) * 1000) / 1000})`;

export function paintWood(c: HTMLCanvasElement, W: number, H: number, seed: number): void {
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return;
  const r = rng(seed);
  const N = { wood: rgbOf(NIGHT.wood), brass: rgbOf(NIGHT.brass), shadow: rgbOf(NIGHT.shadow), flame: rgbOf(NIGHT.flame) };
  const lit = mix(N.wood, N.brass, 0.3), base = mix(N.wood, N.brass, 0.16), deep = mix(N.wood, N.shadow, 0.42), pale = mix(N.wood, N.flame, 0.34);
  const planks: { x: number; w: number }[] = [];
  for (let x = 0; x < W;) {
    let pw = Math.round(150 + r() * 120);
    if (W - x - pw < 110) pw = W - x;
    planks.push({ x, w: pw });
    x += pw;
  }
  const wave = (k: number) => {
    const hs = [1, 2, 3, 5, 7].map((n) => [n, ((r() * 2 - 1) * k) / n, r() * TAU]);
    return (y: number) => {
      let s = 0;
      for (const [n, a, p] of hs) s += a * Math.sin((TAU * n * y) / H + p);
      return s;
    };
  };
  for (const pl of planks) {
    const tone = r() * 2 - 1, col = tone > 0 ? mix(base, lit, tone * 0.75) : mix(base, deep, -tone * 0.5);
    const gr = g.createLinearGradient(pl.x, 0, pl.x + pl.w, 0);
    gr.addColorStop(0, rgba(mix(col, deep, 0.22)));
    gr.addColorStop(0.5, rgba(mix(col, lit, 0.08)));
    gr.addColorStop(1, rgba(mix(col, deep, 0.28)));
    g.fillStyle = gr;
    g.fillRect(pl.x, 0, pl.w, H);
    g.save();
    g.beginPath();
    g.rect(pl.x, 0, pl.w, H);
    g.clip();
    for (let i = 0; i < 7; i++) {
      const x0 = pl.x + r() * pl.w, sw = 8 + r() * 30, sc = r() < 0.5 ? deep : pale, sg = g.createLinearGradient(x0 - sw, 0, x0 + sw, 0);
      sg.addColorStop(0, rgba(sc, 0));
      sg.addColorStop(0.5, rgba(sc, 0.05 + r() * 0.07));
      sg.addColorStop(1, rgba(sc, 0));
      g.fillStyle = sg;
      g.fillRect(x0 - sw, 0, sw * 2, H);
    }
    const knots: { x: number; y: number; r: number }[] = [];
    if (r() < 0.55) {
      knots.push({ x: pl.x + pl.w * (0.2 + r() * 0.6), y: H * (0.14 + r() * 0.72), r: 6 + r() * 9 });
      if (r() < 0.3) knots.push({ x: pl.x + pl.w * (0.2 + r() * 0.6), y: H * (0.14 + r() * 0.72), r: 4 + r() * 6 });
    }
    const bend = (x: number, y: number) => {
      let d = 0;
      for (const k of knots) {
        const dx = x - k.x, dy = y - k.y;
        d += Math.sign(dx || 1) * k.r * 2.2 * Math.exp(-(dy * dy) / (2 * (k.r * 3.2) ** 2)) * Math.exp(-Math.abs(dx) / (k.r * 2.5));
      }
      return d;
    };
    const shared = wave(5 + r() * 9), n = Math.round(pl.w / 2.4);
    for (let i = 0; i < n; i++) {
      const x0 = pl.x + ((i + r() * 0.8) * pl.w) / n, own = wave(1.5 + r() * 2.5), late = r() < 0.16;
      g.strokeStyle = rgba(late ? deep : mix(deep, base, 0.4), late ? 0.15 + r() * 0.12 : 0.04 + r() * 0.08);
      g.lineWidth = late ? 1 + r() * 1.2 : 0.5 + r() * 0.7;
      g.beginPath();
      for (let y = 0; y <= H; y += 6) {
        const x = x0 + shared(y) + own(y), xx = x + bend(x, y);
        if (y === 0) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
    }
    if (r() < 0.5) {
      const cx = pl.x + pl.w * (0.35 + r() * 0.3), ya = H * (0.12 + r() * 0.3), gap = 9 + r() * 6, cc = 0.012 * (0.8 + r() * 0.6);
      for (let j = 1; j < 14; j++) {
        g.strokeStyle = rgba(deep, 0.05 + r() * 0.08);
        g.lineWidth = 0.6 + r() * 0.8;
        g.beginPath();
        for (let x = pl.x - 2, first = true; x <= pl.x + pl.w + 2; x += 3, first = false) {
          const dx = x - cx, y = ya + j * gap + (dx * dx * cc) / j + shared(ya);
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    for (const k of knots) {
      for (let j = 0; j < 7; j++) {
        g.strokeStyle = rgba(deep, 0.2 - j * 0.022);
        g.lineWidth = j === 0 ? 2.2 : 1;
        g.beginPath();
        g.ellipse(k.x, k.y, k.r * 0.55 + j * 2.2, k.r * 0.9 + j * 4.2, 0, 0, TAU);
        g.stroke();
      }
      g.fillStyle = rgba(deep, 0.6);
      g.beginPath();
      g.ellipse(k.x, k.y, k.r * 0.45, k.r * 0.7, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(deep, 0.12);
    for (let i = 0, m = (pl.w * H) / 900; i < m; i++) g.fillRect(pl.x + r() * pl.w, r() * H, 0.8, 2 + r() * 5);
    if (r() < 0.45) {
      const yj = H * (0.1 + r() * 0.8);
      g.fillStyle = rgba(N.shadow, 0.65);
      g.fillRect(pl.x, yj, pl.w, 1.6);
      g.fillStyle = rgba(pale, 0.12);
      g.fillRect(pl.x, yj + 1.6, pl.w, 1);
    }
    g.restore();
    g.fillStyle = rgba(N.shadow, 0.75);
    g.fillRect(pl.x + pl.w - 1.6, 0, 1.6, H);
    g.fillStyle = rgba(pale, 0.1);
    g.fillRect(pl.x, 0, 1, H);
  }
  for (let i = 0; i < 90; i++) {
    const x = r() * W, y = H * (0.03 + r() * 0.94), a = r() * TAU, l = 10 + r() * 70;
    g.strokeStyle = rgba(pale, 0.03 + r() * 0.05);
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}
