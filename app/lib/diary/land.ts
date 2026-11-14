// The land of Roro's Fire Diary: the Nile Delta on an autumn night, seen from the edge of a village,
// in the landing page's hand (app/landing-src/landing.js: its palms, its silhouettes, its soft light).
// It is flat, like the rest of the game: the land lies in layers, one in front of the other like
// sheets of cut paper, each a row of fields hatched like an engraving, nearer ones darker. A canal
// runs straight across between them, holding the sky; a village and its palms stand against the
// glow of the burning straw.
// Painted once into a canvas over the whole scene; the sky above the horizon is left clear for the
// sky canvas under it. Colours are the Night tokens (lib/tokens.ts).

import { rng } from "@/lib/paper";
import { NIGHT } from "@/lib/tokens";

type RGB = [number, number, number];
const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgbOf = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a) * 1000) / 1000})`;
const N = Object.fromEntries(Object.entries(NIGHT).map(([k, v]) => [k, rgbOf(v)])) as Record<string, RGB>;

/** Where the far fires burn, as fractions of the scene's width, for the flames laid over the canvas. */
export const FAR_FIRES: { x: number; depth: number; k: number }[] = [
  { x: 0.52, depth: 0.035, k: 0.7 },
  { x: 0.685, depth: 0.075, k: 1 },
  { x: 0.9, depth: 0.05, k: 0.8 },
];
/** How far down the scene the horizon lies. */
export const HORIZON = 0.6;
/** The depth scale: 0 at the horizon, 1 at the foot of the scene; things shrink towards the horizon. */
export const depthY = (h: number, s: number) => h * (HORIZON + (1 - HORIZON) * s);

// a frond: a curved, toothed blade from the crown, arching over and drooping at the tip
function frond(p: Path2D, x: number, y: number, ang: number, L: number, droop: number, wid: number, teeth: number) {
  const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L + droop * L;
  const cx = x + Math.cos(ang) * L * 0.55, cy = y + Math.sin(ang) * L * 0.55 - droop * L * 0.12;
  const up: [number, number][] = [], dn: [number, number][] = [];
  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth, mt = 1 - t;
    const px = mt * mt * x + 2 * mt * t * cx + t * t * ex, py = mt * mt * y + 2 * mt * t * cy + t * t * ey;
    const tx = 2 * mt * (cx - x) + 2 * t * (ex - cx), ty = 2 * mt * (cy - y) + 2 * t * (ey - cy), l = Math.hypot(tx, ty) || 1;
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (i % 2 ? 1.5 : 0.55);
    up.push([px - (ty / l) * w, py + (tx / l) * w]); dn.push([px + (ty / l) * w * 0.8, py - (tx / l) * w * 0.8]);
  }
  p.moveTo(x, y); for (const [a, b] of up) p.lineTo(a, b); for (let i = dn.length - 1; i >= 0; i--) p.lineTo(dn[i][0], dn[i][1]); p.closePath();
}

// a date palm: a leaning ringed trunk and a crown of fronds, a skirt of old ones, dates
function palm(c: CanvasRenderingContext2D, x: number, y: number, h: number, o: { seed: number; lean?: number; fill: string; rings?: string }) {
  if (h < 2) return;
  const q = rng(o.seed), lean = o.lean ?? 0, p = new Path2D();
  const tx = x + lean * h * 0.22, ty = y - h, w0 = Math.max(0.5, h * 0.034), w1 = Math.max(0.4, h * 0.022), bx = x + lean * h * 0.04, by = y - h * 0.5;
  p.moveTo(x - w0, y); p.quadraticCurveTo(bx - w0 * 0.9, by, tx - w1, ty); p.lineTo(tx + w1, ty); p.quadraticCurveTo(bx + w0 * 0.9, by, x + w0, y); p.closePath();
  const n = 11 + Math.floor(q() * 5), teeth = Math.round(clamp(h / 3.4, 6, 72));
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.96 + (1.08 * i) / (n - 1)) + (q() - 0.5) * 0.3, side = Math.abs(Math.cos(a));
    const L = h * (0.27 + q() * 0.1) * (0.85 + 0.15 * side);
    frond(p, tx, ty, a, L, 0.12 + 0.6 * side * side + q() * 0.1, L * 0.075, teeth);
  }
  for (let i = 0, m = 3 + Math.floor(q() * 3); i < m; i++) frond(p, tx, ty + h * 0.01, Math.PI / 2 + (q() - 0.5) * 1.5, h * (0.12 + q() * 0.06), 0.04, h * 0.012, Math.max(4, teeth >> 1));
  if (h > 50) for (let i = 0; i < 3; i++) p.ellipse(tx + (i - 1) * h * 0.035, ty + h * (0.045 + q() * 0.02), h * 0.016, h * 0.028, 0, 0, TAU);
  c.fillStyle = o.fill; c.fill(p);
  if (h > 90 && o.rings) {
    // the bases of cut fronds, crosshatched up the trunk
    c.strokeStyle = o.rings; c.lineWidth = 0.8; c.beginPath();
    for (let t = 0.04; t < 0.96; t += 0.04) { const mt = 1 - t, cx = mt * mt * x + 2 * mt * t * bx + t * t * tx, cy = mt * mt * y + 2 * mt * t * by + t * t * ty, w = lerp(w0, w1, t); c.moveTo(cx - w, cy + w * 0.5); c.lineTo(cx + w, cy - w * 0.4); }
    c.stroke();
  }
}

/** A soft round light, added to what is there. */
function glow(c: CanvasRenderingContext2D, x: number, y: number, rad: number, col: RGB, a: number, squash = 1) {
  c.save(); c.translate(x, y); c.scale(1, squash);
  const gr = c.createRadialGradient(0, 0, 0, 0, 0, rad);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.5, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
  c.fillStyle = gr; c.fillRect(-rad, -rad, rad * 2, rad * 2); c.restore();
}

export function paintLand(canvas: HTMLCanvasElement, seed: number): boolean {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const c = canvas.getContext("2d");
  if (!c) return false;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const r = rng(seed);
  const hz = h * HORIZON, land = h - hz;
  const Y = (s: number) => hz + land * s;

  const sil = mix(N.shadow, N.sky, 0.3), far = mix(mix(N.sky, N.ground, 0.45), N.brass, 0.1);
  const soil = mix(N.ground, N.sky, 0.3);
  const stubble = mix(soil, N.brass, 0.16), plough = mix(soil, N.shadow, 0.4), crop = mix(soil, N.lapis, 0.1), burnt = mix(soil, N.shadow, 0.7);
  const ember = mix(N.rubric, N.flame, 0.45);

  // ---- the glow of the burning straw along the horizon, and its smoke ----
  c.save();
  c.globalCompositeOperation = "lighter";
  const haze = c.createLinearGradient(0, hz - h * 0.2, 0, hz);
  haze.addColorStop(0, rgba(ember, 0)); haze.addColorStop(0.7, rgba(ember, 0.05)); haze.addColorStop(1, rgba(ember, 0.13));
  c.fillStyle = haze; c.fillRect(0, hz - h * 0.2, w, h * 0.2);
  for (const f of FAR_FIRES) glow(c, w * f.x, Y(f.depth), w * 0.16 * f.k, ember, 0.2 * f.k, 0.5);
  c.restore();
  // smoke: soft, low, drifting one way on the night wind, darker than the sky it crosses
  for (const f of FAR_FIRES) {
    const q = rng(seed + Math.round(f.x * 977));
    for (let i = 0; i < 46; i++) {
      const t = i / 45, rise = Math.pow(t, 0.75);
      const x = w * f.x + rise * w * 0.2 * f.k + (q() - 0.5) * 16 * t, y = Y(f.depth) - 6 - rise * h * 0.24 * f.k + (q() - 0.5) * 10 * t;
      const rad = (6 + t * 54) * f.k;
      glow(c, x, y, rad, mix(N.ground, ember, 0.22 * (1 - t)), 0.085 * (1 - t * 0.75));
    }
  }

  // ---- the land in layers, far to near: each a row of fields with a gently rolling top edge ----
  // [top, bottom] as shares of the land below the horizon; the canal lies between the third and fourth
  const LAYERS: [number, number][] = [[0, 0.075], [0.075, 0.17], [0.17, 0.29], [0.355, 0.52], [0.52, 0.72]];
  const CANAL: [number, number] = [0.29, 0.355];
  const edge = (k: number, x: number) => {
    const a = 1.2 + k * 0.9, ph = k * 1.7 + 0.4;
    return Math.sin(x * (0.004 + k * 0.0006) + ph) * a + Math.sin(x * 0.011 + ph * 2.3) * a * 0.45;
  };
  const tones = [stubble, plough, crop, stubble, burnt, plough];
  const layer = (k: number, top: number, bottom: number) => {
    const near = k / (LAYERS.length - 1);
    const yt = (x: number) => Y(top) + edge(k, x), yb = Y(bottom) + 2;
    // the layer's own ground, to the foot of the scene: the next one is laid over it
    const body = new Path2D();
    body.moveTo(-10, h); for (let x = -10; x <= w + 10; x += 8) body.lineTo(x, yt(x)); body.lineTo(w + 10, h); body.closePath();
    c.fillStyle = rgba(mix(mix(soil, far, (1 - near) * 0.6), N.shadow, near * 0.3)); c.fill(body);
    // its fields, side by side
    let x0 = -10 - r() * 60;
    while (x0 < w + 10) {
      const fw = w * (0.05 + r() * 0.1) * (0.8 + near * 0.6), x1 = Math.min(w + 10, x0 + fw);
      const f = new Path2D();
      f.moveTo(x0, yb); for (let x = x0; x <= x1; x += 6) f.lineTo(x, yt(x) + 1.5); f.lineTo(x1, yt(x1) + 1.5); f.lineTo(x1, yb); f.closePath();
      const tone = tones[Math.floor(r() * tones.length)];
      c.fillStyle = rgba(mix(mix(tone, far, (1 - near) * 0.45), N.shadow, near * 0.22), 0.95); c.fill(f);
      c.save(); c.clip(f);
      c.strokeStyle = rgba(mix(N.brass, N.ink, 0.25), tone === plough ? 0.12 : 0.08); c.lineWidth = 0.7; c.beginPath();
      const gap = 2.6 + near * 2.6 + r() * 1.4, ty = Y(top) - 6;
      if (r() < 0.6) for (let x = x0 + gap / 2; x < x1; x += gap) { c.moveTo(x, ty); c.lineTo(x + (r() - 0.5), yb); }   // furrows standing up
      else for (let y = ty; y < yb; y += gap * 0.8) { c.moveTo(x0, y); c.lineTo(x1, y + (r() - 0.5)); }                    // furrows lying across
      c.stroke(); c.restore();
      // the bank between two fields
      c.strokeStyle = rgba(N.shadow, 0.55 + near * 0.3); c.lineWidth = 0.8 + near * 0.8;
      c.beginPath(); c.moveTo(x1, yt(x1) + 1.5); c.lineTo(x1, yb); c.stroke();
      x0 = x1;
    }
    // the layer's top edge: a dark line, and the faint light of the fires along its lip
    c.beginPath(); c.moveTo(-10, yt(-10)); for (let x = -2; x <= w + 10; x += 8) c.lineTo(x, yt(x));
    c.strokeStyle = rgba(N.shadow, 0.85); c.lineWidth = 1.4; c.stroke();
    c.save(); c.translate(0, -1.2); c.strokeStyle = rgba(mix(N.brass, N.flame, 0.4), 0.26 + (1 - near) * 0.16); c.lineWidth = 1; c.stroke(); c.restore();
  };

  // the sky's glow on the far ground, behind everything
  const ground = c.createLinearGradient(0, hz, 0, h);
  ground.addColorStop(0, rgba(far)); ground.addColorStop(1, rgba(mix(far, N.shadow, 0.5)));
  c.fillStyle = ground; c.fillRect(0, hz, w, land);

  LAYERS.slice(0, 3).forEach(([a, b], k) => layer(k, a, b));

  // ---- the canal: straight across, holding the sky and the stars ----
  const ct = Y(CANAL[0]), cb = Y(CANAL[1]);
  const water = c.createLinearGradient(0, ct, 0, cb);
  water.addColorStop(0, rgba(mix(N.sky, ember, 0.18))); water.addColorStop(0.45, rgba(mix(N.sky, N.lapis, 0.28))); water.addColorStop(1, rgba(mix(N.sky, N.shadow, 0.3)));
  c.fillStyle = water; c.fillRect(-10, ct, w + 20, cb - ct + 4);
  for (let i = 0; i < 140; i++) {
    const x = r() * w, y = ct + 3 + r() * (cb - ct - 5), len = 2 + r() * 10;
    c.fillStyle = rgba(r() < 0.25 ? mix(N.ink, N.brass, 0.5) : N.ink, 0.1 + r() * 0.35); c.fillRect(x - len / 2, y, len, 0.9);
  }
  // the fires' light lying on the water under each
  c.save(); c.globalCompositeOperation = "lighter";
  for (const f of FAR_FIRES) glow(c, w * f.x, (ct + cb) / 2, w * 0.05 * f.k, ember, 0.22, 0.18);
  c.restore();
  c.strokeStyle = rgba(mix(N.ink, N.lapis, 0.5), 0.12); c.lineWidth = 0.6; c.beginPath();
  for (let y = ct + 4; y < cb - 2; y += 4 + r() * 3) { const x = r() * w * 0.2; c.moveTo(x, y); c.lineTo(x + w * (0.3 + r() * 0.6), y); }
  c.stroke();
  c.strokeStyle = rgba(N.shadow, 0.9); c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-10, ct); c.lineTo(w + 10, ct); c.stroke();

  LAYERS.slice(3).forEach(([a, b], k) => layer(k + 3, a, b));

  // reeds along the near bank of the canal, standing on the fourth layer's edge
  c.strokeStyle = rgba(mix(N.shadow, N.sky, 0.2), 0.95); c.lineCap = "round";
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = Y(LAYERS[3][0]) + edge(3, x) + 1, len = 8 + r() * 22;
    c.lineWidth = 0.7 + r() * 0.8; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.5) * 4, y - len * 0.6, x + (r() - 0.5) * 10, y - len); c.stroke();
  }

  // ---- the far fires: the ground lit round each ----
  c.save(); c.globalCompositeOperation = "lighter";
  for (const f of FAR_FIRES) {
    glow(c, w * f.x, Y(f.depth) + 2, w * 0.075 * f.k, ember, 0.34, 0.22);
    glow(c, w * f.x, Y(f.depth), 9 * f.k, N.flame, 0.5, 0.5);
  }
  c.restore();

  // ---- the village on the horizon: flat roofs, a minaret, a pigeon tower, a few lit windows ----
  const vy = hz + 1.5, v0 = w * 0.2, u = clamp(w / 1440, 0.55, 1.2);
  const town = new Path2D();
  let bx = v0;
  const lights: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const bw = (10 + r() * 22) * u, bh = (7 + r() * 15) * u;
    town.rect(bx, vy - bh, bw, bh + 2);
    if (r() < 0.3) town.rect(bx + bw * 0.2, vy - bh - 3 * u, bw * 0.3, 3 * u);   // a roof room
    if (r() < 0.55) lights.push([bx + bw * (0.25 + r() * 0.5), vy - bh * (0.35 + r() * 0.4)]);
    bx += bw + (r() < 0.25 ? r() * 12 * u : -1);
  }
  // the minaret: a slender shaft, a balcony, a cap and its finial
  const mx = v0 + (bx - v0) * 0.42, mh = 52 * u;
  town.rect(mx - 2.2 * u, vy - mh, 4.4 * u, mh); town.rect(mx - 4 * u, vy - mh * 0.72, 8 * u, 2 * u);
  town.moveTo(mx - 3 * u, vy - mh); town.quadraticCurveTo(mx, vy - mh - 11 * u, mx + 3 * u, vy - mh); town.closePath();
  town.rect(mx - 0.5, vy - mh - 13 * u, 1, 6 * u);
  // the pigeon tower: tapered, of mud, studded with perches
  const px = v0 + (bx - v0) * 0.84, ph = 30 * u;
  town.moveTo(px - 8 * u, vy + 2); town.quadraticCurveTo(px - 6 * u, vy - ph * 0.7, px - 2.4 * u, vy - ph); town.quadraticCurveTo(px, vy - ph - 4 * u, px + 2.4 * u, vy - ph); town.quadraticCurveTo(px + 6 * u, vy - ph * 0.7, px + 8 * u, vy + 2); town.closePath();
  c.fillStyle = rgba(sil); c.fill(town);
  for (const [lx, ly] of lights) { c.save(); c.globalCompositeOperation = "lighter"; glow(c, lx, ly, 7 * u, N.flame, 0.3); c.restore(); c.fillStyle = rgba(N.flame, 0.95); c.fillRect(lx - 0.8 * u, ly - 1.1 * u, 1.6 * u, 2.2 * u); }

  // ---- palms: a grove behind the village, lone ones across the plain, growing as they near ----
  const grove: { x: number; s: number; hm: number; lean: number; seed: number }[] = [];
  for (let i = 0; i < 12; i++) grove.push({ x: v0 - w * 0.03 + r() * (bx - v0 + w * 0.06), s: 0.002 + r() * 0.012, hm: 0.075 + r() * 0.05, lean: (r() - 0.5) * 0.5, seed: 300 + i });
  for (let i = 0; i < 7; i++) grove.push({ x: w * (0.5 + r() * 0.5), s: 0.004 + r() * 0.03, hm: 0.05 + r() * 0.05, lean: (r() - 0.5) * 0.6, seed: 400 + i });
  grove.push({ x: w * 0.93, s: LAYERS[2][0], hm: 0.17, lean: -0.2, seed: 71 }, { x: w * 0.975, s: LAYERS[3][0], hm: 0.24, lean: 0.12, seed: 72 }, { x: w * 0.3, s: LAYERS[1][0], hm: 0.12, lean: 0.2, seed: 73 });
  grove.sort((a, b) => a.s - b.s);
  for (const t of grove) {
    const y = Y(t.s) + 2, ph2 = h * t.hm;
    c.fillStyle = rgba(N.shadow, 0.42); c.beginPath(); c.ellipse(t.x - ph2 * 0.08, y + 1, ph2 * 0.16, Math.max(1, ph2 * 0.014), 0, 0, TAU); c.fill();
    palm(c, t.x, y, ph2, { seed: t.seed, lean: t.lean, fill: rgba(mix(sil, N.shadow, t.s)) });
  }

  // ---- at our feet: the dark, and the great palm where Roro keeps watch ----
  const foot = c.createLinearGradient(0, Y(0.62), 0, h);
  foot.addColorStop(0, rgba(N.shadow, 0)); foot.addColorStop(1, rgba(N.shadow, 0.6));
  c.fillStyle = foot; c.fillRect(0, Y(0.62), w, h - Y(0.62));
  const big = Math.min(h * 0.62, w * 0.5);
  palm(c, w * 0.075, Y(0.72), big, { seed: 19, lean: 0.3, fill: rgba(mix(N.shadow, N.sky, 0.12)), rings: rgba(N.brass, 0.16) });
  // grasses along the foot of the scene
  c.strokeStyle = rgba(N.shadow, 0.95);
  for (let i = 0; i < 220; i++) {
    const x = r() * w, len = 10 + r() * 34, y = h + 2;
    c.lineWidth = 0.8 + r() * 1.2; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.5) * 8, y - len * 0.6, x + (r() - 0.5) * 22, y - len); c.stroke();
  }
  return true;
}
