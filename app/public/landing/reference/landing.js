/* Zij landing reference: the drawings and the behaviour of landing.html.
   A design reference, not app code: nothing in app/ imports it. Every map, table and figure it draws
   is an illustration, not data.

   What it does, in order: paints the night sky; draws the things on the desk (the lantern, an
   astrolabe, books, an inkwell and reeds, a spool of thread); makes the textures (wood, plaster,
   paper, ink blots) in canvases; paints the room for the opening (the wall and what hangs on it, the
   top of the desk, the standing lantern) into canvases and turns them in 3D with a scroll-driven
   camera; and on scroll keeps the lantern in view on bare wood (and throws it into the sky at the
   end), lets one drop of ink spread on each sheet and draws thread between the pins.

   Keep it light (see the brand book): work happens only when something changes; everything moved
   per frame is a transform or an opacity; what turns in 3D is a canvas; layout is measured on load
   and resize, never in a frame. */
(() => {
  'use strict';
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]still\b/.test(location.search);
  if (still) root.classList.add('still');
  // Wallpaper mode (?wallpaper, or data-wallpaper on <html>, which the wallpaper build sets): the
  // opening scene alone, held at the top, its words given back to the sky as the seal written in
  // stars, and nothing drawn that it never shows. See docs/design/wallpaper/.
  const wallpaper = root.hasAttribute('data-wallpaper') || /[?&]wallpaper\b/.test(location.search);
  if (wallpaper) { root.classList.add('wallpaper'); history.scrollRestoration = 'manual'; scrollTo(0, 0); }

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const seg = (p, a, b) => smooth((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const n1 = (v) => Math.round(v * 10) / 10;
  const pts = (a) => a.map(([x, y]) => n1(x) + ',' + n1(y)).join(' ');
  const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const toURL = (canvas, type, q) => new Promise((res) => { try { canvas.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), type, q); } catch (e) { res(''); } });
  const offsetWithin = (node, ancestor) => { let x = 0, y = 0; while (node && node !== ancestor) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent; } return [x, y]; };
  const docTop = (n) => { let y = 0; while (n) { y += n.offsetTop; n = n.offsetParent; } return y; };
  const later = (fn, ms) => (ms > 0 ? setTimeout(fn, ms) : fn());

  // ---------------------------------------------------------------- tokens
  // Canvas needs colour values: read them from tokens.css, Night from the page and Folio from a probe.
  const probe = document.createElement('i'); probe.setAttribute('data-theme', 'folio'); probe.hidden = true; document.body.appendChild(probe);
  const tokenRGB = (node, name) => { let h = getComputedStyle(node).getPropertyValue('--' + name).trim().replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };
  const NAMES = ['ground', 'ground-raised', 'sky', 'rule', 'ink', 'ink-muted', 'brass', 'rubric', 'lapis', 'wood', 'flame', 'shadow'];
  const N = {}, F = {};
  for (const k of NAMES) { N[k] = tokenRGB(root, k); F[k] = tokenRGB(probe, k); }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.round(clamp(a) * 1000) / 1000})`;

  // ================================================================ 1. The sky
  // A desert night: the Milky Way rising from the horizon with its dark rift, a field of stars of
  // every brightness and a little colour, fainter towards the horizon. Painted once into a canvas.
  function paintSky(canvas, o) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const r = rng(o.seed), horizon = h * o.horizon, safe = o.safe || [];
    const fade = (y) => clamp((horizon - y) / (h * 0.22));
    const calm = (x, y) => { let k = 1; for (const s of safe) { const dx = Math.max(s.x - x, 0, x - s.x - s.w), dy = Math.max(s.y - y, 0, y - s.y - s.h), d = Math.hypot(dx, dy); if (d < 70) k = Math.min(k, 0.16 + 0.84 * d / 70); } return k; };
    const dot = (x, y, rad, col, a) => { if (a <= 0.01) return; g.globalAlpha = a; g.fillStyle = rgba(col); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); };
    const blob = (x, y, rad, col, a) => { if (a <= 0.002) return; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
    const gauss = () => (r() + r() + r() + r() - 2) / 2;

    if (o.band) {
      const b = o.band, A = [w * b.a[0], h * b.a[1]], C = [w * b.c[0], h * b.c[1]], B = [w * b.b[0], h * b.b[1]];
      const at = (t) => [(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
      const dir = (t) => { const dx = 2 * (1 - t) * (C[0] - A[0]) + 2 * t * (B[0] - C[0]), dy = 2 * (1 - t) * (C[1] - A[1]) + 2 * t * (B[1] - C[1]), l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
      const width = Math.min(w, h) * b.width;
      const cool = mix(N.ink, N.lapis, 0.35), warm = mix(N.ink, N.brass, 0.45);
      const rift = (t) => Math.sin(t * 11 + 1.3) * 0.15 * width;
      // The glow is painted small and drawn up smoothly: many stacked gradients at full size show
      // the browser's dither as a fine grid, and a soft glow needs no detail anyway.
      const q = 4, gw = Math.ceil(w / q), gh = Math.ceil(h / q);
      const gc = document.createElement('canvas'); gc.width = gw; gc.height = gh;
      const gg = gc.getContext('2d');
      const soft = (x, y, rad, col, a) => { if (a <= 0.002) return; x /= q; y /= q; rad /= q; const gr = gg.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); gg.fillStyle = gr; gg.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
      // the glow of the band, brightest and widest low down
      gg.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 340; i++) {
        const t = r(), [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.55;
        const cx = x - ty * off, cy = y + tx * off;
        const rad = width * (0.16 + r() * 0.42) * (1.25 - 0.5 * t);
        soft(cx, cy, rad, t < 0.4 && r() < 0.5 ? warm : cool, (0.009 + r() * 0.021) * (1.35 - 0.85 * t) * fade(cy) * calm(cx, cy));
      }
      // star clouds: brighter knots low in the band
      for (let i = 0; i < 30; i++) {
        const t = r() * 0.6, [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.3;
        const cx = x - ty * off, cy = y + tx * off;
        soft(cx, cy, width * (0.05 + r() * 0.12), warm, 0.045 * fade(cy) * calm(cx, cy));
      }
      // the dark rift that runs down the middle of the band takes light away
      gg.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 95; i++) {
        const t = 0.03 + r() * 0.84, [x, y] = at(t), [tx, ty] = dir(t), off = rift(t) + gauss() * 0.07 * width;
        const rad = width * (0.035 + r() * 0.08) / q;
        gg.save(); gg.translate((x - ty * off) / q, (y + tx * off) / q); gg.rotate(Math.atan2(ty, tx)); gg.scale(2.4 + r() * 2.2, 1);
        const gr = gg.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, `rgba(0,0,0,${(0.5 + r() * 0.35).toFixed(2)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        gg.fillStyle = gr; gg.fillRect(-rad, -rad, rad * 2, rad * 2); gg.restore();
      }
      // the browser dithers each gradient in the same pattern, and hundreds of faint ones add the
      // pattern up into a grid: a blur takes it out
      const gb = document.createElement('canvas'); gb.width = gw; gb.height = gh;
      const gbx = gb.getContext('2d'); gbx.filter = 'blur(2.5px)'; gbx.drawImage(gc, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(gbx.filter === 'blur(2.5px)' ? gb : gc, 0, 0, gw * q, gh * q);
      // a dust of faint stars that makes the band grainy, thinner in the rift
      for (let i = 0; i < o.bandStars; i++) {
        const t = r(), [x, y] = at(t), [tx, ty] = dir(t), off = gauss() * width * 0.62;
        const cx = x - ty * off, cy = y + tx * off, dust = 1 - 0.75 * Math.exp(-Math.pow((off - rift(t)) / (0.07 * width), 2));
        dot(cx, cy, 0.3 + r() * 0.42, r() < 0.3 ? warm : N.ink, (0.1 + r() * 0.42) * dust * fade(cy) * calm(cx, cy));
      }
    }
    // the field: many faint stars, few bright, a little colour (blue-white, gold, a few orange)
    const blue = mix(N.ink, N.lapis, 0.5), gold = mix(N.ink, N.brass, 0.55), red = mix(N.ink, N.rubric, 0.32);
    for (let i = 0; i < o.stars; i++) {
      const x = r() * w, y = Math.pow(r(), 1.15) * Math.min(h, horizon * 1.02);
      const m = Math.pow(r(), 3.2), pick = r();
      const col = pick < 0.16 ? blue : pick < 0.27 ? gold : pick < 0.31 ? red : N.ink;
      const a = (0.3 + 0.7 * m) * fade(y) * calm(x, y), rad = 0.35 + m * 1.3;
      if (m > 0.5) blob(x, y, rad * 6, col, 0.15 * a);
      dot(x, y, rad, col, a);
    }
    g.globalAlpha = 1;
    // fade the whole sky in from the top, slowly at first: o.fade is [from, to] in px
    if (o.fade) {
      const fg = g.createLinearGradient(0, o.fade[0], 0, o.fade[1]);
      [[0, 0], [0.35, 0.1], [0.7, 0.5], [1, 1]].forEach(([t, a]) => fg.addColorStop(t, `rgba(0,0,0,${a})`));
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = fg; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    }
    return true;
  }

  // the brightest stars scintillate, each on its own small layer
  function twinkles(box, n, seed, safe, hFrac) {
    box.textContent = '';
    const W = box.clientWidth, H = box.clientHeight; if (!W || !H) return;
    const r = rng(seed);
    const near = (x, y) => safe.some((s) => x > s.x - 24 && x < s.x + s.w + 24 && y > s.y - 24 && y < s.y + s.h + 24);
    for (let i = 0, made = 0; made < n && i < n * 8; i++) {
      const x = r(), y = Math.pow(r(), 1.3) * hFrac;
      if (near(x * W, y * H)) continue;
      const pick = r(), col = pick < 0.24 ? mix(N.ink, N.lapis, 0.4) : pick < 0.4 ? mix(N.ink, N.brass, 0.45) : N.ink;
      const s = 3 + Math.pow(r(), 2) * 6;
      const t = document.createElement('i'); t.className = 'tw';
      t.style.cssText = `left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%;--s:${s.toFixed(1)}px;--c:${rgba(col)};--d:${(1.8 + r() * 4.6).toFixed(2)}s;--o:${(-r() * 6).toFixed(2)}s`;
      box.appendChild(t); made++;
    }
  }

  // where the words are, so the stars thin out behind them
  function rectsIn(box, nodes) {
    const br = box.getBoundingClientRect(), k = br.width / (box.clientWidth || 1) || 1;
    return nodes.map((n) => { const r = n.getBoundingClientRect(); return { x: (r.left - br.left) / k, y: (r.top - br.top) / k, w: r.width / k, h: r.height / k }; });
  }
  const skyCanvas = $('sky-canvas'), heroEl = $('hero');
  function paintSkyNow() {
    paintLand();
    // the wallpaper keeps the stars of the sky behind its seal, but no big twinkling star sits on it
    const words = wallpaper ? (sigil ? [sigil.box] : []) : [...heroEl.querySelectorAll('h1, .line, .dek, .begin')];
    paintSky(skyCanvas, { seed: 977, stars: 1100, bandStars: 2600, horizon: 0.8, safe: wallpaper ? [] : rectsIn(skyCanvas, words), band: { a: [0.8, 1.02], c: [0.6, 0.42], b: [0.32, -0.1], width: 0.3 } });
    twinkles($('sky-twinkles'), 26, 31, rectsIn($('sky-twinkles'), words), 0.7);
    if (sigil) sigil.paint();
  }
  let closingPainted = false;
  function paintClosing() {
    const cv = $('close-canvas'), cl = $('closing');
    const words = [...cl.querySelectorAll('h2, .sub, .acts, .colophon, .t-eyebrow')];
    const vh0 = innerHeight;
    if (paintSky(cv, { seed: 1009, stars: 820, bandStars: 1700, horizon: 1.2, safe: rectsIn(cv, words), fade: [vh0 * 0.34, vh0 * 0.74], band: { a: [0.06, 1.05], c: [0.46, 0.56], b: [1.02, 0.2], width: 0.26 } })) closingPainted = true;
    twinkles($('close-twinkles'), 14, 77, rectsIn($('close-twinkles'), words), 0.75);
  }

  // The wallpaper's seal, written in the sky where the page has its words. The letters are a drift of
  // faint stars, as the Milky Way is; brighter stars string their outlines and mark every corner; the
  // dots of زيج are four-pointed stars and the ring a ring of light round a star; and the whole sits
  // in a nebula of its own shape. It is read from the seal's own SVG, so it follows the logo. Painted
  // once into canvases; what moves is opacity and transform only: three sets of stars shimmer in
  // turn, the aura breathes, the dots glint, and now and then a wave of light runs through the letters.
  function readSeal(text) {
    const vb = (text.match(/viewBox="([^"]+)"/) || [])[1];
    if (!vb) return null;
    const [vx, vy, vw, vh] = vb.trim().split(/[\s,]+/).map(Number);
    const paths = [], bodies = [], dots = [], rings = [];
    for (const [, d] of text.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)) {
      paths.push(d);
      const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
      const polys = [], arcs = [];
      let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0;
      const n = () => parseFloat(tok[i++]);
      while (i < tok.length) {
        if (/^[a-zA-Z]$/.test(tok[i])) { cmd = tok[i++]; if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; } continue; }
        const rel = cmd === cmd.toLowerCase();
        if ('MmLl'.includes(cmd)) {
          const x = n(), y = n(); cx = rel ? cx + x : x; cy = rel ? cy + y : y;
          if (cmd === 'M' || cmd === 'm') { polys.push([]); sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; }
          polys[polys.length - 1].push([cx, cy]);
        } else if (cmd === 'A' || cmd === 'a') {
          const rx = n(); n(); n(); n(); n();
          const x = n(), y = n(), ex = rel ? cx + x : x, ey = rel ? cy + y : y;
          arcs.push([(cx + ex) / 2, (cy + ey) / 2, rx]); cx = ex; cy = ey;   // the seal's arcs are half circles: the centre is midway
        } else i++;   // a command the seal doesn't use: skip its numbers
      }
      if (arcs.length) { rings.push({ cx: arcs.reduce((t, a) => t + a[0], 0) / arcs.length, cy: arcs.reduce((t, a) => t + a[1], 0) / arcs.length, r: Math.max(...arcs.map((a) => a[2])) }); continue; }
      for (const poly of polys) {
        const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
        if (Math.max(w, h) < vh * 0.2) dots.push({ cx: x0 + w / 2, cy: y0 + h / 2, r: Math.max(w, h) / 2, pts: poly });
        else bodies.push(poly);
      }
    }
    return { vx, vy, vw, vh, paths, bodies, dots, rings };
  }

  function makeSigil(sky) {
    const box = document.createElement('div'); box.className = 'sigil'; box.setAttribute('aria-hidden', 'true');
    const add = (tag, cls, parent = box) => { const n = document.createElement(tag); n.className = cls; parent.appendChild(n); return n; };
    const aura = add('canvas', 'aura'), sets = ['a', 'b', 'c'].map((k) => add('canvas', 'stars ' + k));
    const wave = add('div', 'wave'); add('i', '', wave);
    sky.insertBefore(box, $('sky-twinkles'));
    let seal = null, done = '', maskURL = '';
    fetch(heroEl.querySelector('h1 img').src).then((r) => r.text()).then((t) => {
      seal = readSeal(t); if (!seal) return;
      const { vx, vy, vw, vh } = seal, at = (x, y) => `left:${((x - vx) / vw * 100).toFixed(2)}%;top:${((y - vy) / vh * 100).toFixed(2)}%`;
      box.style.aspectRatio = `${vw} / ${vh}`;
      const r = rng(907);
      // sizes in % of the seal's width, timings each their own
      for (const d of seal.dots) add('i', 'star4').style.cssText = `${at(d.cx, d.cy)};--z:${(d.r * 4.6 / vw * 100).toFixed(2)};--d:${(3.2 + r() * 2.6).toFixed(2)}s;--o:${(-r() * 5).toFixed(2)}s`;
      for (const g of seal.rings) add('i', 'loop').style.cssText = `${at(g.cx, g.cy)};--z:${(g.r * 2.5 / vw * 100).toFixed(2)}`;
      paint();
    }).catch(() => {});

    function paint() {
      const W = box.clientWidth, H = box.clientHeight;
      if (!seal || !W || !H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), key = [W, H, dpr].join();
      if (key === done) return;
      done = key;
      const { vx, vy, vw, vh } = seal, k = W / vw, s = clamp(H / 420, 0.85, 1.5);
      // the star layers reach a margin past the seal, so stars that stray over its edge aren't cut off
      const M = 0.15, P = (x, y) => [(x - vx) * k + W * M, (y - vy) * k + H * M];
      const CW = Math.round(W * (1 + 2 * M) * dpr), CH = Math.round(H * (1 + 2 * M) * dpr);
      const all = new Path2D(); for (const d of seal.paths) all.addPath(new Path2D(d));
      const ask = document.createElement('canvas'); ask.width = Math.ceil(vx + vw); ask.height = Math.ceil(vy + vh);
      const ac = ask.getContext('2d'), inside = (x, y) => ac.isPointInPath(all, x, y);
      const r = rng(5807), gauss = () => (r() + r() + r() + r() - 2) / 2;
      const warm = mix(N.ink, N.brass, 0.5), cool = mix(N.ink, N.lapis, 0.35);
      const groups = [[], [], []], bright = [];
      const star = (x, y, rad, a, col, glow) => { const o = [...P(x, y), rad, a, col, glow]; groups[(r() * 3) | 0].push(o); return o; };

      // the bodies of the letters: a drift of faint stars. Each is let wander a little from where it
      // was picked, so the letters thin out at their edges instead of stopping at a line, and a few
      // stray well out, as a cluster's outliers do
      for (let i = 0, made = 0; made < 2200 && i < 90000; i++) {
        let x = vx + r() * vw, y = vy + r() * vh;
        if (!inside(x, y)) continue;
        made++;
        const far = r() < 0.1, spread = far ? 11 : 3.2;
        x += gauss() * spread; y += gauss() * spread;
        const p = r(), fade = inside(x, y) ? 1 : far ? 0.45 : 0.7;
        star(x, y, (0.24 + Math.pow(r(), 1.6) * 0.6) * s, (0.14 + Math.pow(r(), 2.2) * 0.7) * fade, p < 0.3 ? warm : p < 0.45 ? cool : N.ink);
      }
      // their outlines strung with brighter stars at uneven steps, a little off the line and now and
      // then missing, as stars are; every corner a bright one
      for (const poly of seal.bodies) for (let j = 0; j < poly.length; j++) {
        const A = poly[j], B = poly[(j + 1) % poly.length], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (L < 1) continue;
        const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
        for (let d = 3 + r() * 5; d < L - 3; d += 3.5 + r() * 7.5) {
          if (r() < 0.12) continue;
          const t = d / L, off = gauss() * 2.4, big = r() < 0.12;
          bright.push(star(A[0] + (B[0] - A[0]) * t + nx * off, A[1] + (B[1] - A[1]) * t + ny * off, (big ? 0.85 + r() * 0.4 : 0.4 + r() * 0.55) * s, big ? 0.95 : 0.4 + r() * 0.5, r() < 0.3 ? warm : N.ink, big));
        }
        bright.push(star(A[0], A[1], (1 + r() * 0.5) * s, 1, N.ink, true));
      }
      for (const g of seal.rings) for (let q = 0; q < 16; q++) {
        const a = (q + r() * 0.4) / 16 * TAU;
        bright.push(star(g.cx + Math.cos(a) * g.r, g.cy + Math.sin(a) * g.r, (0.5 + r() * 0.5) * s, 0.75, N.ink));
      }
      for (const d of seal.dots) for (const [x, y] of d.pts) bright.push(star(x, y, 0.65 * s, 0.8, warm));

      const dot = (c, [px, py, rad, a, col, glow], grow = 1) => {
        rad *= grow;
        if (glow) { const R = rad * 5, gr = c.createRadialGradient(px, py, 0, px, py, R); gr.addColorStop(0, rgba(col, a * 0.45)); gr.addColorStop(1, rgba(col, 0)); c.fillStyle = gr; c.fillRect(px - R, py - R, R * 2, R * 2); }
        c.globalAlpha = a; c.fillStyle = rgba(col); c.beginPath(); c.arc(px, py, rad, 0, TAU); c.fill(); c.globalAlpha = 1;
      };
      groups.forEach((list, g) => {
        const c = sets[g]; c.width = CW; c.height = CH;
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const o of list) dot(x, o);
      });

      // the wave of light shows only where the bright stars are: they are its mask
      const m = document.createElement('canvas'); m.width = CW; m.height = CH;
      const mx = m.getContext('2d'); mx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const o of bright) dot(mx, [o[0], o[1], o[2], 1, [255, 255, 255], true], 1.8);
      toURL(m, 'image/png').then((url) => {
        if (!url) return;
        if (maskURL) URL.revokeObjectURL(maskURL);
        maskURL = url; wave.style.webkitMaskImage = wave.style.maskImage = `url("${url}")`;
      });

      // the aura: a nebula of the seal's shape, painted small (it has no detail) and drawn up smoothly
      const pad = 0.35, q = 3, aw = Math.ceil(W * (1 + 2 * pad) / q), ah = Math.ceil(H * (1 + 2 * pad) / q);
      const kq = k / q, ox = W * pad / q, oy = H * pad / q;
      const tmp = document.createElement('canvas'); tmp.width = aw; tmp.height = ah;
      const t = tmp.getContext('2d'); t.globalCompositeOperation = 'lighter';
      const glowOf = (col, a, blur) => { t.save(); t.filter = `blur(${(blur * kq).toFixed(2)}px)`; t.setTransform(kq, 0, 0, kq, ox - vx * kq, oy - vy * kq); t.fillStyle = rgba(col, a); t.fill(all); t.restore(); };
      glowOf(cool, 0.34, 40);    // the wide halo, cool as starlight
      glowOf(warm, 0.13, 17);    // nearer and warmer, as brass is
      glowOf(N.ink, 0.04, 7);    // the letters themselves, faintly lit
      // clouds over and round the letters, thicker in some places than others, so the glow is a
      // nebula and not a blurred copy of the letters
      for (let i = 0, made = 0; made < 320 && i < 30000; i++) {
        const x = vx + r() * vw, y = vy + r() * vh;
        if (!inside(x, y)) continue;
        made++;
        const far = r() < 0.3, spread = far ? 26 : 9;
        const cx = ox + (x + gauss() * spread - vx) * kq, cy = oy + (y + gauss() * spread - vy) * kq, R = (far ? 14 + r() * 26 : 4 + r() * 12) * kq, col = r() < 0.45 ? warm : cool;
        const gr = t.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, rgba(col, far ? 0.015 + r() * 0.025 : 0.02 + r() * 0.05)); gr.addColorStop(1, rgba(col, 0));
        t.fillStyle = gr; t.fillRect(cx - R, cy - R, R * 2, R * 2);
      }
      aura.width = aw; aura.height = ah;
      const ax = aura.getContext('2d'); ax.filter = 'blur(1.5px)'; ax.drawImage(tmp, 0, 0);
    }
    return { box, paint };
  }
  const sigil = wallpaper ? makeSigil($('sky')) : null;

  // ================================================================ 2. Orbits and the Earth
  (function rete() {
    const s = $('rete');
    el('circle', { class: 'ring', r: 286, 'stroke-width': 1.3, opacity: 0.6 }, s);
    el('circle', { class: 'ring', r: 262, 'stroke-width': 0.8, opacity: 0.3 }, s);
    el('circle', { class: 'ring', cy: -64, r: 176, 'stroke-width': 0.8, opacity: 0.3, 'stroke-dasharray': '2 5' }, s);
    let d1 = '', d2 = '';
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU, long = i % 6 === 0, r2 = long ? 268 : 278;
      const seg = `M${n1(Math.sin(a) * 286)} ${n1(-Math.cos(a) * 286)}L${n1(Math.sin(a) * r2)} ${n1(-Math.cos(a) * r2)}`;
      if (long) d1 += seg; else d2 += seg;
    }
    el('path', { class: 'tick', d: d1, 'stroke-width': 1.4, opacity: 0.7 }, s);
    el('path', { class: 'tick', d: d2, 'stroke-width': 0.8, opacity: 0.45 }, s);
  })();

  // An engraved globe in orthographic projection that turns (scripts/build-landing.mjs): graticule,
  // the continents, the night half hatched (the terminator seen edge on, a straight line), and fires
  // that come and go on the land.
  (function globe() {
    const g = $('globe'), R = 36, lat0 = 14 * RAD, PERIOD = 160, START = 24;
    const sinL = Math.sin(lat0), cosL = Math.cos(lat0);
    const LAND = [
      [[-17, 21], [-17, 14.7], [-12, 8], [-8, 4.5], [0, 5.5], [9, 4], [9.5, 1], [12, -6], [13.5, -12], [12, -17], [15, -27], [18.5, -34.4], [25, -34], [32, -29], [35, -24], [35, -18], [40.5, -15], [39.5, -6], [42, -1], [48, 5], [51, 11.8], [43.5, 11.5], [39, 15.5], [37.5, 18.5], [35.5, 23.8], [33.5, 27.5], [32.5, 29.9], [32, 31.3], [30, 31.4], [25, 31.6], [20, 32], [15.5, 31.5], [10.5, 34], [10, 37], [3, 36.8], [-2, 35.1], [-6, 35.8], [-9.8, 31], [-13, 27.5], [-17, 21]],
      [[34.6, 29.5], [35, 28], [38.5, 24], [39, 21.5], [42.5, 16.5], [43.4, 12.7], [45, 12.8], [52, 15.5], [57, 18.8], [59.5, 22.5], [56.4, 26.3], [51.5, 24.2], [50, 26.5], [48, 29.9], [44, 33], [40, 34.5], [36, 34], [34.8, 32], [34.6, 29.5]],
      [[-9, 37], [-6, 36.5], [-2, 37], [3, 42.5], [9, 44], [12.5, 41.5], [16, 38], [18.5, 40], [15, 44], [13.5, 45.5], [19, 42], [23, 38], [26, 40.5], [29, 41], [36, 36.5], [36, 41], [41, 41.5], [41, 50], [30, 60], [30, 70], [20, 70], [5, 62], [10, 58], [10, 54], [5, 52], [-4, 48], [-1.5, 46], [-9, 43], [-9, 37]],
      [[-5, 50], [1.5, 51], [1.7, 53], [-3, 56], [-2, 58.5], [-5, 58.5], [-6, 55], [-3, 54], [-5, 52], [-5, 50]],
      [[44, -25], [47, -25], [50, -15], [49.5, -12], [44, -17], [44, -25]],
      [[36, 36.5], [36, 41], [41, 41.5], [41, 50], [30, 60], [30, 70], [60, 68], [70, 73], [90, 76], [110, 77], [140, 72], [160, 70], [180, 68], [180, 65], [170, 60], [162, 57], [156, 51], [155, 59], [143, 59], [140, 54], [135, 43], [129, 35], [127, 39.5], [121, 40], [122, 37], [119, 35], [121, 31], [122, 25], [117, 23], [110, 21], [108, 16], [109, 12], [105, 9], [103, 10.5], [100, 13.5], [100, 8], [103, 1.5], [98, 8], [98, 16], [94, 17], [92, 22], [88, 21.5], [86.5, 20], [80, 15], [80, 10], [77, 8], [73, 16], [72.5, 21], [68, 23.5], [61, 25], [57, 26], [54, 27], [50, 30], [48, 30], [44, 33], [40, 34.5], [36, 36.5]],
      [[130, 31], [135, 34], [140, 36], [141, 41], [142, 45], [139, 40], [136, 36], [132, 34], [130, 31]],
      [[109, 1], [117, 7], [119, 5], [118, 1], [116, -4], [110, -3], [109, 1]],
      [[95, 5.5], [104, -2], [106, -6], [101, -3], [95, 5.5]],
      [[114, -22], [114, -27], [115, -34], [118, -35], [124, -34], [129, -32], [135, -35], [138, -35], [141, -38], [147, -38], [150, -37], [153, -31], [153, -25], [146, -19], [142, -11], [140, -17], [136, -12], [131, -11], [126, -14], [122, -18], [114, -22]],
      [[-80, 9], [-77, 8.5], [-72, 12], [-63, 10.7], [-60, 8.5], [-52, 5], [-50, 0], [-44, -2.5], [-35, -5.5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-69, -55], [-74, -52], [-73, -45], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, -1], [-78, 2], [-77, 7], [-80, 9]],
      [[-168, 66], [-160, 70], [-140, 70], [-125, 70], [-110, 73], [-95, 72], [-82, 73], [-78, 63], [-94, 59], [-90, 57], [-80, 55], [-77, 62], [-65, 60], [-60, 55], [-56, 52], [-66, 45], [-70, 43], [-74, 40], [-76, 35], [-81, 31], [-80, 25.5], [-82, 27], [-84, 30], [-90, 29.5], [-97, 27], [-97, 22], [-92, 18.5], [-88, 21], [-87, 16], [-83, 15], [-83, 10], [-79, 9], [-80, 7.5], [-85, 10], [-92, 15], [-105, 20], [-110, 23], [-114, 30], [-117, 32.5], [-121, 35], [-124, 40], [-124, 48], [-130, 54], [-140, 60], [-150, 60], [-158, 57], [-165, 60], [-168, 66]],
      [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 70], [-35, 65], [-45, 60], [-52, 65], [-55, 70], [-60, 76], [-73, 78]],
    ];
    // Places that burn, as the satellites see them, the record's own areas first.
    const FIRES = [
      [31.0, 30.8], [32.8, 26.2], [-8.2, 39.6], [-7.9, 38.1], [-67.7, -29.2], [-59.5, -33.5],
      [-1, 11], [8, 9.5], [20, 9], [15, 6.5], [38, 9.5], [22, -9], [27, -12], [18, -12.5], [31, -15], [46.5, -18.5],
      [-55, -9], [-62, -11], [-48, -14], [-92, 17], [-82, 32], [-115, 57], [-105, 62],
      [36, 48], [45, 52], [70, 51], [115, 58], [130, 52], [75.5, 30.5], [80, 22], [102, 18], [97, 20],
      [133, -14], [125, -17], [145, -18], [113.5, 0.5], [103, -1.5],
    ];
    const r = rng(2026);
    const fires = FIRES.map(([lon, lat]) => ({ lon, lat, period: 8 + r() * 7, phase: r(), on: 0.3 + r() * 0.2 }));
    const term = 14 * RAD, tx = Math.sin(term) * R, ty = Math.cos(term) * R;
    g.setAttribute('transform', 'rotate(-23.4)');
    g.innerHTML =
      `<line class="axis" x1="0" y1="${-R * 1.32}" x2="0" y2="${R * 1.32}"/>` +
      `<circle class="sea" r="${R}"/>` +
      '<path class="land"/><path class="grat"/>' +
      `<path class="night" d="M${n1(-tx)} ${n1(-ty)} A${R} ${R} 0 0 1 ${n1(tx)} ${n1(ty)} Z" transform="rotate(180)"/>` +
      '<g class="fires"></g>' +
      `<circle r="${R}" style="fill:none; stroke: var(--brass); stroke-width: 1.3"/>`;
    const landEl = g.querySelector('.land'), gratEl = g.querySelector('.grat'), fireBox = g.querySelector('.fires');
    const dots = [{ lon: 31.2, lat: 30, cairo: true }, ...fires].map((f) => {
      const glow = el('circle', { class: 'cairo-glow', r: 7 }, fireBox), dot = el('circle', { class: 'cairo', r: 1.5 }, fireBox);
      return { ...f, glow, dot };
    });
    const r2 = (v) => Math.round(v * 100) / 100;
    function draw(lon0deg, t) {
      const lon0 = lon0deg * RAD;
      const proj = (lon, lat) => {
        lon *= RAD; lat *= RAD;
        const cl = Math.cos(lat), sl = Math.sin(lat), d = lon - lon0, cd = Math.cos(d);
        return [R * cl * Math.sin(d), -R * (cosL * sl - sinL * cl * cd), sinL * sl + cosL * cl * cd];
      };
      // a line on the sphere: lifted where it goes round the back
      const line = (pairs) => { let d = '', pen = false; for (const [lo, la] of pairs) { const [x, y, c] = proj(lo, la); if (c < 0) { pen = false; continue; } d += (pen ? 'L' : 'M') + r2(x) + ' ' + r2(y); pen = true; } return d; };
      // a shape on the sphere: what lies behind is laid on the limb, so the fill follows the edge
      const shape = (pairs) => {
        const pts = pairs.map(([lo, la]) => proj(lo, la));
        if (pts.every((p) => p[2] < 0)) return '';
        return pts.map(([x, y, c], i) => { if (c < 0) { const k = R / (Math.hypot(x, y) || 1); x *= k; y *= k; } return (i ? 'L' : 'M') + r2(x) + ' ' + r2(y); }).join('') + 'Z';
      };
      let grat = '';
      for (const la of [-60, -30, 0, 30, 60]) { const p = []; for (let lo = -180; lo <= 180; lo += 6) p.push([lo, la]); grat += line(p); }
      for (let lo = -180; lo < 180; lo += 30) { const p = []; for (let la = -90; la <= 90; la += 6) p.push([lo, la]); grat += line(p); }
      landEl.setAttribute('d', LAND.map(shape).join(''));
      gratEl.setAttribute('d', grat);
      for (const f of dots) {
        const [x, y, c] = proj(f.lon, f.lat);
        // seen only on the near side, fading out towards the limb
        const face = Math.min(1, Math.max(0, (c - 0.04) / 0.22));
        let b;
        if (f.cairo) b = 0.82 + 0.18 * Math.sin(t * 1.7);
        else { const u = ((t / f.period + f.phase) % 1) / f.on; b = u < 1 ? Math.pow(Math.sin(Math.PI * u), 1.6) : 0; }
        const a = b * face;
        if (a < 0.01) { f.dot.setAttribute('opacity', 0); f.glow.setAttribute('opacity', 0); continue; }
        f.dot.setAttribute('cx', r2(x)); f.dot.setAttribute('cy', r2(y)); f.dot.setAttribute('r', r2(f.cairo ? 1.5 : 0.8 + 0.6 * b)); f.dot.setAttribute('opacity', r2(a));
        f.glow.setAttribute('cx', r2(x)); f.glow.setAttribute('cy', r2(y)); f.glow.setAttribute('r', r2(f.cairo ? 7 : 2.4 + 3.6 * b)); f.glow.setAttribute('opacity', r2(a));
      }
    }
    if (still) { draw(START, 0); return; }
    // turning: only while the opening is in view and the tab is shown
    // its clock runs only while it is drawn, so it never jumps ahead after a pause
    let seen = true, raf = 0, last = 0, t = 0;
    const frame = (now) => {
      raf = 0;
      if (!seen || document.hidden) { last = 0; return; }
      if (last) t += Math.min(now - last, 50) / 1000;
      last = now;
      draw(START - (t / PERIOD) * 360, t);
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && seen && !document.hidden) raf = requestAnimationFrame(frame); };
    new IntersectionObserver((entries) => { seen = entries.some((e) => e.isIntersecting); kick(); }).observe(g.ownerSVGElement || g);
    document.addEventListener('visibilitychange', kick);
    draw(START, 0); kick();
  })();

  // ================================================================ Fire
  // A flame is drawn, not glowed: two or three tongues, warm white at the root through flame to rubric
  // at the tips, over a dull bed of embers, and now and then a tip torn off above them. flameStrip
  // paints n drawings of one fire side by side into a canvas shown w by h px; the page shows them one
  // at a time (.blaze steps the strip along by transform), so the fire flickers by changing shape.
  // lean tips the flames to one side (the wind, or a torch carried through the air).
  function flameStrip(cv, w, h, n, seed, lean = 0) {
    const d = Math.min(window.devicePixelRatio || 1, 2) * 2;   // drawn larger than it is shown: it is small
    const fw = Math.max(6, Math.round(w * d)), fh = Math.max(8, Math.round(h * d));
    cv.width = fw * n; cv.height = fh;
    const g = cv.getContext('2d'), r = rng(seed);
    const white = mix(N.flame, N.ink, 0.5), orange = mix(N.flame, N.rubric, 0.55);
    for (let i = 0; i < n; i++) {
      g.save(); g.beginPath(); g.rect(i * fw, 0, fw, fh); g.clip();
      g.translate(i * fw + fw / 2, fh * 0.96);
      // the embers it burns on
      g.save(); g.scale(1, 0.3);
      const e = g.createRadialGradient(0, 0, 0, 0, 0, fw * 0.46);
      e.addColorStop(0, rgba(orange, 0.9)); e.addColorStop(0.55, rgba(N.rubric, 0.35)); e.addColorStop(1, rgba(N.rubric, 0));
      g.fillStyle = e; g.fillRect(-fw / 2, -fw * 0.46, fw, fw * 0.92); g.restore();
      g.globalCompositeOperation = 'lighter';
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
      if (r() < 0.4) {   // a tip torn off, burning out above the rest
        const ty = -fh * (0.82 + r() * 0.12), tx = sway * fh * 0.3 + (r() - 0.5) * fw * 0.3, tr = fw * (0.05 + r() * 0.04);
        const p = new Path2D(); p.moveTo(tx, ty - tr * 2.4); p.quadraticCurveTo(tx + tr * 1.2, ty, tx, ty + tr); p.quadraticCurveTo(tx - tr * 1.2, ty, tx, ty - tr * 2.4);
        g.fillStyle = rgba(orange, 0.6); g.fill(p);
      }
      g.restore();
    }
  }

  // ================================================================ 3. The land
  // The desert under the sky, seen from the ground floor: the eye a few metres above the sand, so the
  // land is a narrow band under the horizon and what stands on it rises against the sky. Painted once
  // into a canvas, again only on resize. Far off, under banks of mist, a limestone escarpment and the
  // sand sea, and fields burning at the foot of the escarpment (what the satellites see), their smoke
  // leaning with the wind; nearer, dunes lit by starlight from the right with their slip faces in
  // shadow, an oasis of date palms, a camp, a man walking to it with a torch, acacias and scrub; and
  // the yard under the window, behind a low mud-brick wall, which only the camera sees as it rises and
  // looks down. Fire is the only warm light. Everything is placed by its distance on the ground: m
  // metres away it stands on row y0 + P·h/m, and a metre there is P/m px (P the camera's focal
  // length, h the eye's height above the sand).
  const LAND = { top: 0.5, bottom: 1.8, y0: 0.79, h: 3 };   // top: high enough for the smoke to thin out on the sky
  // The wallpaper paints the land in strata, so that each can move by its own distance when the
  // pointer moves, the near ground more than the far (the wallpaper's life.js moves them). Each holds
  // what stands from `from` metres away out to the next stratum; it is painted from row `row` (a share
  // of the view's height, clear above the tallest thing it holds) down to just below the screen; and it
  // moves as if it stood `as` metres away. Far to near: the escarpment, the far dunes and the burning
  // fields; the dunes with fires behind them; the oasis; the camp and the palms; the near dunes and
  // the acacia; the ground at your feet.
  const STRATA = [{ from: 1400, row: 0.5, as: 3000 }, { from: 400, row: 0.6, as: 750 }, { from: 130, row: 0.66, as: 220 }, { from: 50, row: 0.64, as: 80 }, { from: 20, row: 0.68, as: 30 }, { from: 0, row: 0.84, as: 14 }];
  const strata = [];   // their canvases, made once
  let landKey = '';
  function paintLand() {
    const box = $('land'), cv = $('land-canvas'), V = $('view').clientHeight, sw = box.clientWidth;
    if (!V || !sw) return;
    const key = sw + 'x' + V; if (key === landKey) return; landKey = key;
    // the wallpaper never looks down: its land need only reach a little below the screen
    const top = LAND.top * V, bot = (wallpaper ? 1.14 : LAND.bottom) * V;
    box.style.top = n1(top) + 'px'; box.style.height = n1(bot - top) + 'px';
    const s = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(9e6 / (sw * (bot - top))));
    // what is being painted on: the one canvas, or in the wallpaper the stratum of the thing in hand
    let c, cs = s, li = 0;
    const layers = [];
    if (wallpaper) {
      cv.style.display = 'none';
      if (!strata.length) for (const S of STRATA) { const k = document.createElement('canvas'); k.className = 'stratum'; k.dataset.from = S.from; k.dataset.as = S.as; box.insertBefore(k, $('far-a')); strata.push(k); }
      STRATA.forEach((S, i) => {
        const k = strata[i], kt = S.row * V, h = bot - kt, ks = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3e6 / (sw * h)));
        k.width = Math.round(sw * ks); k.height = Math.round(h * ks);
        Object.assign(k.style, { left: '0px', top: n1(kt - top) + 'px', width: sw + 'px', height: n1(h) + 'px' });
        const g = k.getContext('2d'); g.setTransform(ks, 0, 0, ks, 0, -kt * ks);
        layers.push({ from: S.from, g, ks });
      });
      c = layers[0].g; cs = layers[0].ks;
    } else {
      cv.width = Math.round(sw * s); cv.height = Math.round((bot - top) * s);
      c = cv.getContext('2d');
      c.setTransform(s, 0, 0, s, 0, -top * s);   // drawn in the sky's own px, rows from its top
    }
    // in the wallpaper, paint what stands m metres away on its stratum
    const stratumFor = (m) => { if (!layers.length) return; while (li < layers.length - 1 && m < layers[li].from) li++; c = layers[li].g; cs = layers[li].ks; };
    const X = (f) => f * sw, y0 = LAND.y0 * V, P = 0.95 * V, mid = X(0.5);
    const sz = clamp(sw / (1.5 * V), 0.5, 1);   // on a narrow screen things are drawn a little smaller
    const rowAt = (m) => y0 + P * LAND.h / m;   // the row of the ground m metres away
    const um = (y) => Math.max(0.004, (y - y0) / LAND.h) * sz;   // px per metre of height, standing on row y
    const gp = (lat, m) => [mid + lat * P / m, rowAt(m)];   // a point on the ground, lat metres to the side
    const near = (m) => clamp(1 - Math.log(m / 4) / Math.log(1500));   // 0 far … 1 under the window
    // sand in starlight (a little warm), sand in shadow (holding the blue of the sky), things seen
    // against it, and the mist, from far (0) to near (1)
    const litC = (d) => mix(mix(N.sky, N.brass, 0.1), mix(N.ground, N.brass, 0.2), d);
    const darkC = (d) => mix(mix(N.sky, N.ground, 0.25), mix(N.sky, N.shadow, 0.55), d);
    const silC = (d) => mix(mix(N.sky, N.shadow, 0.4), mix(N.ground, N.shadow, 0.55), d);
    const mistC = mix(mix(N.sky, N.lapis, 0.12), N['ink-muted'], 0.14);
    const deep = mix(N.ground, N.sky, 0.25);   // the ground below it all (.sky .below)
    const scene = [], ridges = [], far = [];   // far: the fires far off, drawn on their own two layers

    const wave = (seed, oct) => {
      const q = rng(seed), F = [], Ph = [], A = []; let tot = 0;
      for (let i = 0; i < oct; i++) { F.push((0.8 + 0.4 * q()) * Math.pow(2.1, i)); Ph.push(q() * TAU); A.push(Math.pow(0.5, i)); tot += A[i]; }
      return (x) => { let v = 0; for (let i = 0; i < oct; i++) v += A[i] * Math.sin(x * F[i] + Ph[i]); return v / tot; };
    };
    const line = (pts, close) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
    // a shape's soft shadow, cast up and to the left onto the land already painted, never the sky
    // (in the wallpaper, onto its own stratum and the one behind it, where most of it falls)
    const castOnto = (p, dx, dy, blur, a) => {
      const onto = layers.length ? [layers[li], layers[li - 1]].filter(Boolean) : [{ g: c, ks: cs }];
      for (const { g, ks } of onto) {
        g.save(); g.globalCompositeOperation = 'source-atop';
        g.shadowColor = rgba(N.shadow, a); g.shadowBlur = blur * ks; g.shadowOffsetX = (dx + 1e4) * ks; g.shadowOffsetY = dy * ks;
        g.translate(-1e4, 0); g.fillStyle = '#000'; g.fill(p); g.restore();
      }
    };
    // firelight: a pool on the ground (flattened as the ground is, seen from this low) or a glow in the air
    const glowAt = (x, y, r, a, flat, cx = c) => {
      cx.save(); cx.translate(x, y); cx.scale(1, flat);
      const g = cx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(N.flame, a)); g.addColorStop(0.25, rgba(N.flame, a * 0.4)); g.addColorStop(0.6, rgba(N.rubric, a * 0.12)); g.addColorStop(1, rgba(N.rubric, 0));
      cx.fillStyle = g; cx.fillRect(-r, -r, 2 * r, 2 * r); cx.restore();
    };
    // something soft painted small (q times smaller) is blurred and drawn up, so it has no edges or banding
    const drawSoft = (off, q, x, y) => {
      const b = document.createElement('canvas'); b.width = off.width; b.height = off.height;
      const bx = b.getContext('2d'); bx.filter = 'blur(2px)'; bx.drawImage(off, 0, 0);
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(bx.filter === 'blur(2px)' ? b : off, x, y, off.width * q, off.height * q); c.restore();
    };

    // ---- dunes ----
    // A range of dunes m metres away: each climbs steeply from the left (its slip face, turned from
    // the light) to a sharp crest and falls gently away to the right, lit. Gaps flatten it where
    // something behind has to show; `only` keeps it to stretches of the view.
    function ridge(o) {
      const base = rowAt(o.dist), amp = P * o.hm / o.dist * sz, lam = P * o.lam / o.dist * (0.6 + 0.4 * sz);
      const warp = wave(o.seed, 2), env = wave(o.seed + 1, 3), fine = wave(o.seed + 2, 2);
      const a = o.rise || 0.3, step = clamp(lam / 90, 1.5, 5);
      const R = { ...o, a, step, base, amp, xs: [], ys: [], ph: [] };
      for (let x = -step; x <= sw + step; x += step) {
        const t = x / lam, w = t + 0.33 * warp(t * 0.8), f = w - Math.floor(w);
        const prof = f < a ? Math.pow(f / a, 1.4) : Math.pow(1 - (f - a) / (1 - a), 1.6);
        let k = 0.62 + 0.38 * env(t * 0.45);
        for (const [gx, gw, gd] of o.gaps || []) k *= 1 - gd * Math.exp(-Math.pow((x / sw - gx) / gw, 4));
        if (o.only) k *= Math.max(...o.only.map(([ox, ow]) => Math.exp(-Math.pow((x / sw - ox) / ow, 4))));
        R.xs.push(x); R.ys.push(base - amp * k * (prof + 0.12 * (1 + fine(t * 3)))); R.ph.push(f);
      }
      R.at = (x) => R.ys[clamp(Math.round(x / step) + 1, 0, R.ys.length - 1)];
      R.top = Math.min(...R.ys); R.foot = base + amp * 0.4 + 8;
      ridges.push(R);
      paintRidge(R);
      return R;
    }
    function paintRidge(R) {
      const d = R.d, L = litC(d), D = darkC(d), { xs, ys, ph, a } = R, crest = xs.map((x, i) => [x, ys[i]]);
      const body = line([[xs[0], bot + 4], ...crest, [xs[xs.length - 1], bot + 4]], true);
      // the shadow it casts on the range behind: a band along its crest is enough
      castOnto(line([...crest, ...crest.map(([x, y]) => [x, y + 40]).reverse()], true), -(2 + 7 * d), -(1.5 + 4 * d), 3 + 12 * d, 0.5);
      let g = c.createLinearGradient(0, R.top, 0, R.foot);
      g.addColorStop(0, rgba(L)); g.addColorStop(1, rgba(mix(L, D, 0.55)));
      c.fillStyle = g; c.fill(body);
      c.save(); c.clip(body);
      // wind ripples on the lit faces, in broken marks, flattening out lower down
      if (d > 0.15) {
        const q = rng(R.seed + 9), dk = new Path2D(), lt = new Path2D(), rows = 5 + Math.round(12 * d), base = R.base;
        for (let j = 1; j <= rows; j++) {
          const t = j / rows, off = (R.foot - base + R.amp) * Math.pow(t, 1.35) + 2, wl = 6 + 22 * d, p0 = q() * TAU, br = 14 + 30 * d;
          let pen = false;
          for (let i = 0; i < xs.length; i++) {
            const y = lerp(ys[i], base, 0.55 * t) + off + Math.sin(xs[i] / wl + p0) * (0.5 + 1.8 * d);
            const on = ph[i] > a + 0.04 && Math.sin(xs[i] / br + j * 1.9 + p0) + 0.6 * Math.sin(xs[i] / (br * 2.7) + j) > 0.1;
            if (on) { if (pen) { dk.lineTo(xs[i], y); lt.lineTo(xs[i], y - 0.7 - d); } else { dk.moveTo(xs[i], y); lt.moveTo(xs[i], y - 0.7 - d); } }
            pen = on;
          }
        }
        c.lineWidth = 0.5 + 1.1 * d; c.strokeStyle = rgba(D, 0.42); c.stroke(dk);
        c.lineWidth = 0.4 + 0.5 * d; c.strokeStyle = rgba(N.ink, 0.035 + 0.04 * d); c.stroke(lt);
      }
      // Each dune: its slip face, from the trough before it up to the crest, in shadow; the brink of
      // the crest swinging down from the peak to the dune's foot; and the flank beside the brink, the
      // part that faces the light most, brightest, fading away from it.
      const troughs = [0], peaks = [];
      for (let i = 1; i < xs.length; i++) { if (ph[i] < ph[i - 1]) troughs.push(i); else if (ph[i - 1] < a && ph[i] >= a) peaks.push(i); }
      troughs.push(xs.length - 1);
      const sl = new Path2D(), brink = new Path2D(), foot = R.base + R.amp * 0.15;
      for (const ip of peaks) {
        const iv = troughs.filter((t) => t < ip).pop(), iw = troughs.find((t) => t > ip);
        if (iv === undefined || iw === undefined) continue;   // a peak at the edge of the land: no slope on one side
        const xp = xs[ip], yp = ys[ip], xv = xs[iv], xw = xs[iw], wl = Math.max(3, xp - xv), wr = Math.max(3, xw - xp), hh = foot - yp;
        if (hh < 1.5) continue;
        const bx = xp + wr * 0.22, c1 = [xp - wl * 0.12, yp + hh * 0.42], c2 = [xp + wr * 0.3, foot - hh * 0.18];
        sl.moveTo(xv, ys[iv]); for (let k = iv + 1; k <= ip; k++) sl.lineTo(xs[k], ys[k]);
        sl.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], bx, foot);
        sl.quadraticCurveTo(xv + wl * 0.3, foot + hh * 0.08, xv - wl * 0.04, ys[iv] + (foot - ys[iv]) * 0.5);
        sl.closePath();
        brink.moveTo(xp, yp); brink.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], bx, foot);
        const fl = new Path2D(); fl.moveTo(xp, yp); for (let k = ip + 1; k <= iw; k++) fl.lineTo(xs[k], ys[k]);
        fl.lineTo(xw, foot); fl.lineTo(bx, foot); fl.bezierCurveTo(c2[0], c2[1], c1[0], c1[1], xp, yp); fl.closePath();
        const hg = c.createLinearGradient(xp - wl * 0.1, 0, xp + wr * 0.85, 0);
        hg.addColorStop(0, rgba(mix(L, N.ink, 0.12), 0.55 + 0.25 * d)); hg.addColorStop(0.35, rgba(mix(L, N.ink, 0.06), 0.25)); hg.addColorStop(1, rgba(L, 0));
        c.fillStyle = hg; c.fill(fl);
      }
      g = c.createLinearGradient(0, R.top, 0, foot + 4);
      g.addColorStop(0, rgba(D, 0.94)); g.addColorStop(1, rgba(D, 0.6));
      c.fillStyle = g; c.fill(sl);
      c.lineWidth = 0.5 + 0.7 * d; c.strokeStyle = rgba(N.ink, 0.04 + 0.08 * d); c.stroke(brink);
      // the grain of the sand
      const q = rng(R.seed + 21), gl = new Path2D(), gd = new Path2D(), y1 = Math.min(bot, R.foot + 0.08 * V);
      const n = Math.round(sw * (y1 - R.top) / (700 - 450 * d));
      for (let i = 0; i < n; i++) { const x = q() * sw, y = R.top + q() * (y1 - R.top), r = 0.4 + q() * (0.3 + 0.7 * d); (q() < 0.45 ? gl : gd).rect(x, y, r, r); }
      c.fillStyle = rgba(N.ink, 0.045); c.fill(gl); c.fillStyle = rgba(N.shadow, 0.22); c.fill(gd);
      c.restore();
      // the crest catches the starlight
      c.lineWidth = 0.6 + 0.8 * d; c.strokeStyle = rgba(N.ink, 0.09 + 0.1 * d); c.stroke(line(crest));
    }

    // ---- the escarpment: a long flat-topped scarp, cut by wadis, stepping down at its end ----
    function escarpment(x0, x1, yt, yb, seed) {
      const q = rng(seed), noise = wave(seed, 3), xa = X(x0), xb = X(x1), ht = yb - yt;
      const wadis = [0.2, 0.43, 0.64, 0.82].map((t) => [lerp(xa, xb, t + (q() - 0.5) * 0.06), X(0.012 + q() * 0.018), 0.18 + q() * 0.26]);
      const e0 = xb - X(0.09), e1 = xb - X(0.078), e2 = xb - X(0.018), e4 = xb + X(0.05);
      const drop = (x) => x < e0 ? 0 : x < e1 ? 0.36 * smooth((x - e0) / (e1 - e0)) : x < e2 ? 0.36 + 0.08 * (x - e1) / (e2 - e1) : x < xb ? 0.44 + 0.38 * smooth((x - e2) / (xb - e2)) : 0.82 + 0.18 * Math.pow(clamp((x - xb) / (e4 - xb)), 0.6);
      const pts = [];
      for (let x = xa; x <= e4; x += 2) {
        let v = 0.035 * noise(x / 28) + drop(x);
        for (const [wx, ww, wd] of wadis) { const t = Math.abs(x - wx) / ww; if (t < 1) v += wd * Math.pow(1 - t, 1.6); }
        pts.push([x, yt + ht * v]);
      }
      const body = line([...pts, [e4, yb + 6], [xa, yb + 6]], true);
      const face = mix(mix(N.sky, N.ground, 0.4), N['ink-muted'], 0.06);
      c.fillStyle = rgba(face); c.fill(body);
      c.save(); c.clip(body);
      c.strokeStyle = rgba(N.shadow, 0.35); c.lineWidth = 0.7;
      for (const f of [0.3, 0.52, 0.7]) { c.beginPath(); for (let x = xa; x < e4; x += 3) { const y = yt + ht * (f + 0.02 * noise(x / 60 + f * 9)); if (Math.sin(x / 37 + f * 20) > -0.4) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
      c.strokeStyle = rgba(N.shadow, 0.28); c.lineWidth = 0.6; c.beginPath();
      for (let i = 0; i < 70; i++) { const x = lerp(xa, e2, q()), y = yt + ht * (0.08 + drop(x)); c.moveTo(x, y); c.lineTo(x + (q() - 0.5) * 3, y + ht * (0.15 + q() * 0.3)); }
      c.stroke();
      c.fillStyle = rgba(mix(face, N['ink-muted'], 0.12));
      c.fill(line([[e0, yt], [e1, yt + ht * 0.36], [e1 + 4, yb + 6], [e0 + 2, yb + 6]], true));
      c.fill(line([[e2, yt + ht * 0.44], [xb, yt + ht * 0.82], [xb + 3, yb + 6], [e2 + 2, yb + 6]], true));
      c.restore();
      c.strokeStyle = rgba(N.ink, 0.1); c.lineWidth = 0.7; c.stroke(line(pts));
    }

    // ---- mist and smoke ----
    // A bank of mist lying along the horizon: thickest at yc, thinning up into the sky and down over
    // the land in front of it, uneven, drawn out in wisps.
    function mist(a, yc, up, down, seed) {
      const q = 4, r = rng(seed), n = wave(seed + 50, 3), off = document.createElement('canvas');
      off.width = Math.ceil(sw / q); off.height = Math.ceil((up + down) / q) + 2;
      const g = off.getContext('2d'), t0 = up / (up + down);
      const lg = g.createLinearGradient(0, 0, 0, (up + down) / q);
      lg.addColorStop(0, rgba(mistC, 0)); lg.addColorStop(t0 * 0.5, rgba(mistC, a * 0.22)); lg.addColorStop(t0, rgba(mistC, a)); lg.addColorStop(1, rgba(mistC, 0));
      g.fillStyle = lg; g.fillRect(0, 0, off.width, off.height);
      g.globalCompositeOperation = 'destination-out';
      for (let x = 0; x < off.width; x += 2) { const v = n(x * q / 340); if (v < 0) { g.fillStyle = `rgba(0,0,0,${Math.min(0.7, -v * 1.1).toFixed(3)})`; g.fillRect(x, 0, 2, off.height); } }
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 28; i++) {
        const wx = r() * off.width, wy = (up + (r() - 0.6) * down * 1.4) / q, rx = (50 + r() * 180) / q, ry = (3 + r() * 6) / q;
        g.save(); g.translate(wx, wy); g.scale(1, ry / rx);
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); rg.addColorStop(0, rgba(mistC, a * (0.3 + r() * 0.4))); rg.addColorStop(1, rgba(mistC, 0));
        g.fillStyle = rg; g.fillRect(-rx, -rx, 2 * rx, 2 * rx); g.restore();
      }
      drawSoft(off, q, 0, yc - up);
    }
    // the smoke of burning fields, rising and leaning with the wind, lit from below by the fire
    function plumes(pts, seed) {
      const q = 3, r = rng(seed), H = 110 + 60 * sz;
      const x0 = Math.min(...pts.map((p) => p.x)) - 30, x1 = Math.max(...pts.map((p) => p.x)) + H, ya = Math.min(...pts.map((p) => p.y)) - H - 20, yb = Math.max(...pts.map((p) => p.y)) + 8;
      const off = document.createElement('canvas'); off.width = Math.ceil((x1 - x0) / q); off.height = Math.ceil((yb - ya) / q);
      const g = off.getContext('2d'), warm = mix(N.flame, N.rubric, 0.35), grey = mix(N['ink-muted'], N.sky, 0.45);
      for (const p of pts) for (let j = 0; j < 30; j++) {
        const t = j / 29, px = (p.x - x0 + t * t * H * 0.75 + (r() - 0.5) * 5) / q, py = (p.y - ya - t * H) / q, rad = (2.5 + t * 24 * sz) / q;
        const col = t < 0.2 ? mix(warm, grey, t / 0.2) : grey, al = t < 0.2 ? 0.34 - 0.6 * t : 0.15 * (1 - t) + 0.02;
        const rg = g.createRadialGradient(px, py, 0, px, py, rad); rg.addColorStop(0, rgba(col, al)); rg.addColorStop(1, rgba(col, 0));
        g.fillStyle = rg; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      drawSoft(off, q, x0, ya);
    }

    // ---- palms, acacias, scrub and stones ----
    // a frond: a curved, toothed blade from the crown, arching over and drooping at the tip
    function frond(p, x, y, ang, L, droop, wid, teeth) {
      const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L + droop * L;
      const cx = x + Math.cos(ang) * L * 0.55, cy = y + Math.sin(ang) * L * 0.55 - droop * L * 0.12;
      const up = [], dn = [];
      for (let i = 0; i <= teeth; i++) {
        const t = i / teeth, mt = 1 - t;
        const px = mt * mt * x + 2 * mt * t * cx + t * t * ex, py = mt * mt * y + 2 * mt * t * cy + t * t * ey;
        const tx = 2 * mt * (cx - x) + 2 * t * (ex - cx), ty = 2 * mt * (cy - y) + 2 * t * (ey - cy), l = Math.hypot(tx, ty) || 1;
        const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) * (i % 2 ? 1.5 : 0.55);
        up.push([px - ty / l * w, py + tx / l * w]); dn.push([px + ty / l * w * 0.8, py - tx / l * w * 0.8]);
      }
      p.moveTo(x, y); for (const [a, b] of up) p.lineTo(a, b); for (let i = dn.length - 1; i >= 0; i--) p.lineTo(dn[i][0], dn[i][1]); p.closePath();
    }
    // a date palm: a leaning ringed trunk and a crown of fronds, a skirt of old ones, dates
    function palm(x, y, hm, o) {
      const h = hm * um(y); if (h < 2) return;
      const q = rng(o.seed), lean = o.lean || 0, p = new Path2D();
      if (!o.reflected) {
        // its shadow on the sand, and young offshoots round its foot
        c.fillStyle = rgba(N.shadow, 0.4); c.beginPath(); c.ellipse(x - h * 0.07, y + h * 0.003, h * 0.13, h * 0.012, 0, 0, TAU); c.fill();
        if (h > 24) for (const sd of [-1, 1]) if (q() < 0.7) { const ox = x + sd * h * (0.05 + q() * 0.04); for (let i = 0; i < 5; i++) frond(p, ox, y, Math.PI * (1.15 + 0.7 * i / 4), h * (0.06 + q() * 0.04), 0.25, h * 0.008, 6); }
      }
      const tx = x + lean * h * 0.22, ty = y - h, w0 = Math.max(0.5, h * 0.034), w1 = Math.max(0.4, h * 0.022), bx = x + lean * h * 0.04, by = y - h * 0.5;
      p.moveTo(x - w0, y); p.quadraticCurveTo(bx - w0 * 0.9, by, tx - w1, ty); p.lineTo(tx + w1, ty); p.quadraticCurveTo(bx + w0 * 0.9, by, x + w0, y); p.closePath();
      const n = 11 + Math.floor(q() * 5), teeth = Math.round(clamp(h / 5, 6, 26));
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (0.96 + 1.08 * i / (n - 1)) + (q() - 0.5) * 0.3, side = Math.abs(Math.cos(a));
        const L = h * (0.27 + q() * 0.1) * (0.85 + 0.15 * side);
        frond(p, tx, ty, a, L, 0.12 + 0.6 * side * side + q() * 0.1, L * 0.075, teeth);
      }
      for (let i = 0, m = 3 + Math.floor(q() * 3); i < m; i++) frond(p, tx, ty + h * 0.01, Math.PI / 2 + (q() - 0.5) * 1.5, h * (0.12 + q() * 0.06), 0.04, h * 0.012, Math.max(4, teeth >> 1));
      if (h > 50) for (let i = 0; i < 3; i++) p.ellipse(tx + (i - 1) * h * 0.035, ty + h * (0.045 + q() * 0.02), h * 0.016, h * 0.028, 0, 0, TAU);
      c.fillStyle = o.fill; c.fill(p);
      if (h > 90) {
        // the bases of cut fronds, crosshatched up the trunk
        c.strokeStyle = rgba(N.ink, 0.07); c.lineWidth = 0.7; c.beginPath();
        for (let t = 0.04; t < 0.96; t += 0.045) { const mt = 1 - t, cx = mt * mt * x + 2 * mt * t * bx + t * t * tx, cy = mt * mt * y + 2 * mt * t * by + t * t * ty, w = lerp(w0, w1, t); c.moveTo(cx - w, cy + w * 0.5); c.lineTo(cx + w, cy - w * 0.4); }
        c.stroke();
      }
    }
    // an umbrella thorn: a stout, leaning trunk forking low into a few limbs, and a crown that is flat
    // on top and clumped underneath
    function acacia(x, y, hm, seed) {
      const h = hm * um(y); if (h < 3) return;
      const q = rng(seed), fill = rgba(silC(0.7)), cw = h * (1.15 + q() * 0.2), ct = y - h, p = new Path2D();
      for (let i = 0; i < 9; i++) { const t = i / 8 - 0.5; p.ellipse(x + t * cw * 0.8 + (q() - 0.5) * cw * 0.05, ct + h * (0.1 + Math.abs(t) * 0.12 + q() * 0.04), cw * (0.1 + q() * 0.05), h * (0.09 + q() * 0.04), 0, 0, TAU); }
      for (let i = 0; i < 6; i++) { const t = i / 5 - 0.5; p.ellipse(x + t * cw * 0.6 + (q() - 0.5) * cw * 0.06, ct + h * (0.22 + q() * 0.06), cw * (0.09 + q() * 0.05), h * (0.08 + q() * 0.03), 0, 0, TAU); }
      c.fillStyle = fill; c.fill(p);
      c.strokeStyle = rgba(N.ink, 0.08); c.lineWidth = 0.8; c.beginPath(); c.ellipse(x, ct + h * 0.06, cw * 0.4, h * 0.05, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      c.strokeStyle = fill; c.lineCap = 'round';
      const lean = (q() - 0.5) * h * 0.12, fx = x + lean, fy = y - h * 0.38;
      c.lineWidth = Math.max(0.9, h * 0.065); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + lean * 0.2, y - h * 0.2, fx, fy); c.stroke();
      c.lineWidth = Math.max(0.7, h * 0.035);
      for (const t of [-0.32, -0.1, 0.12, 0.3]) { c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + t * cw * 0.3, fy - h * 0.18, x + t * cw * 0.85, ct + h * 0.26); c.stroke(); }
      c.fillStyle = rgba(N.shadow, 0.35); c.beginPath(); c.ellipse(x - cw * 0.2, y + 1, cw * 0.45, Math.max(1, cw * 0.02), 0, 0, TAU); c.fill();
    }
    // scrub, stones and pebbles; sc scales their size
    function thing(kind, x, y, q, d, sc = 1) {
      const k = um(y) * sc, dark = rgba(silC(d)), sh = rgba(N.shadow, 0.3);
      if (kind === 'grass') {
        // a tuft of grass, dry and pale, or still green and dark
        const hh = (0.35 + q() * 0.5) * k, p = new Path2D(), dry = q() < 0.55;
        for (let j = 0, n = 5 + Math.floor(q() * 6); j < n; j++) { const a = -Math.PI / 2 + (q() - 0.5) * 1.6, l = hh * (0.5 + q() * 0.6), bx = x + (q() - 0.5) * hh * 0.4; p.moveTo(bx, y); p.quadraticCurveTo(bx + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.7, bx + Math.cos(a) * l, y + Math.sin(a) * l + Math.abs(Math.cos(a)) * l * 0.35); }
        c.lineCap = 'round'; c.lineWidth = Math.max(0.5, k * 0.012);
        if (dry) { c.strokeStyle = rgba(N.shadow, 0.35); c.save(); c.translate(-k * 0.08, 0); c.stroke(p); c.restore(); }
        c.strokeStyle = dry ? rgba(mix(litC(d), N['ink-muted'], 0.3)) : dark; c.stroke(p);
      } else if (kind === 'bush') {
        const w = (0.5 + q() * 1.1) * k, p = new Path2D();
        c.fillStyle = sh; c.beginPath(); c.ellipse(x - w * 0.35, y + w * 0.02, w * 0.8, w * 0.07, 0, 0, TAU); c.fill();
        for (let j = 0; j < 4; j++) { const bx = x + (j - 1.5) * w * 0.32 + (q() - 0.5) * w * 0.2, br = w * (0.24 + q() * 0.2); p.moveTo(bx + br, y); p.ellipse(bx, y, br, br * 0.85, 0, 0, Math.PI, true); }
        c.fillStyle = dark; c.fill(p);
        c.strokeStyle = rgba(N.ink, 0.06); c.lineWidth = 0.6; c.stroke(p);
      } else {
        const w = (kind === 'pebble' ? 0.06 + q() * 0.14 : 0.3 + Math.pow(q(), 2) * 1.6) * k, h = w * (0.45 + q() * 0.35), n = 6 + Math.floor(q() * 3), pts = [];
        for (let j = 0; j < n; j++) { const a = Math.PI + (j / (n - 1)) * Math.PI; pts.push([x + Math.cos(a) * w * (0.8 + q() * 0.3), y + Math.sin(a) * h * (0.75 + q() * 0.4)]); }
        c.fillStyle = sh; c.beginPath(); c.ellipse(x - w * 0.45, y + h * 0.04, w * 1.05, h * 0.18, 0, 0, TAU); c.fill();
        const body = line(pts, true);
        c.fillStyle = rgba(mix(darkC(d), silC(d), 0.4)); c.fill(body);
        c.fillStyle = rgba(mix(litC(d), N['ink-muted'], 0.08)); c.fill(line([...pts.slice(Math.floor(n / 2)), [x + w * 0.1, y - h * 0.2]], true));
        c.strokeStyle = rgba(N.shadow, 0.6); c.lineWidth = 0.6; c.stroke(body);
      }
    }
    // scatter n things between m0 and m1 metres away, across xr of the view
    function scatterG(n, m0, m1, kinds, seed, xr = [0, 1], sc = 1) {
      const q = rng(seed);
      for (let i = 0; i < n; i++) {
        const m = lerp(m0, m1, q()), x = X(lerp(xr[0], xr[1], q())), kind = kinds[Math.floor(q() * kinds.length)];
        scene.push([m, () => thing(kind, x, rowAt(m), q, near(m), sc)]);
      }
    }

    // ---- the oasis: date palms round a pool, a shaduf at its edge ----
    function oasis(cx, cy, seed) {
      const q = rng(seed), k = um(cy), rx = 22 * k, ry = Math.max(2.2, rx * (cy - y0) / P * 1.3);
      c.save(); c.translate(cx, cy); c.scale(1, ry / rx * 1.4);
      let g = c.createRadialGradient(0, 0, rx * 0.7, 0, 0, rx * 2.1);
      g.addColorStop(0, rgba(N.shadow, 0.5)); g.addColorStop(1, rgba(N.shadow, 0));
      c.fillStyle = g; c.fillRect(-rx * 2.1, -rx * 2.1, rx * 4.2, rx * 4.2); c.restore();
      const pool = new Path2D(); pool.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g = c.createLinearGradient(0, cy - ry, 0, cy + ry);
      g.addColorStop(0, rgba(mix(N.sky, N.lapis, 0.3))); g.addColorStop(1, rgba(mix(N.sky, N.lapis, 0.1)));
      c.fillStyle = g; c.fill(pool);
      const trees = [[-1.55, -1.25, 15, -0.15], [-1.3, -0.55, 11, 0.12], [-1.05, -1.45, 17, 0.05], [-0.72, -1.3, 13, -0.08], [-0.38, -1.55, 16, 0.1], [0.02, -1.35, 12, -0.1],
        [0.42, -1.5, 17, -0.05], [0.78, -1.25, 14, 0.15], [1.12, -0.95, 16, -0.12], [1.42, -0.3, 12, 0.2], [1.68, -1.05, 15, 0.05], [1.95, -0.55, 13, -0.1], [-1.8, 0.7, 9, -0.2], [1.3, 0.95, 10, 0.16], [2.25, 0.4, 7, 0.1]];
      const specs = trees.map(([dx, dy, hm, lean], i) => ({ x: cx + dx * rx, y: cy + dy * ry, hm, lean, seed: seed * 31 + i }));
      // the water holds the sky, and the palms upside down
      c.save(); c.clip(pool); c.globalAlpha = 0.5;
      for (const p of specs) if (p.y < cy) { c.save(); c.translate(0, 2 * p.y); c.scale(1, -1); palm(p.x, p.y, p.hm, { ...p, reflected: true, fill: rgba(mix(silC(0.15), N.sky, 0.3)) }); c.restore(); }
      c.globalAlpha = 1; c.restore();
      c.lineWidth = 0.7; c.strokeStyle = rgba(N.ink, 0.2); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, Math.PI + 0.1, TAU - 0.1); c.stroke();
      // a shaduf: two posts, a beam across them with a weight at one end and a bucket at the other
      const sx = cx - rx * 0.92, sy = cy - ry * 0.3, sk = um(sy), py = sy - 2.4 * sk;
      c.strokeStyle = c.fillStyle = rgba(silC(0.2)); c.lineCap = 'round';
      c.lineWidth = Math.max(0.7, 0.2 * sk); c.beginPath(); c.moveTo(sx - 0.35 * sk, sy); c.lineTo(sx - 0.2 * sk, py); c.moveTo(sx + 0.35 * sk, sy); c.lineTo(sx + 0.2 * sk, py); c.stroke();
      c.lineWidth = Math.max(0.6, 0.13 * sk); c.beginPath(); c.moveTo(sx - 1.6 * sk, py - 0.9 * sk); c.lineTo(sx + 3.4 * sk, py + 1.3 * sk); c.stroke();
      c.beginPath(); c.ellipse(sx - 1.7 * sk, py - 0.8 * sk, 0.42 * sk, 0.32 * sk, 0, 0, TAU); c.fill();
      c.lineWidth = 0.5; c.beginPath(); c.moveTo(sx + 3.4 * sk, py + 1.3 * sk); c.lineTo(sx + 3.4 * sk, py + 2.3 * sk); c.stroke();
      for (let i = 0; i < 9; i++) { const a = 0.25 + i / 8 * (Math.PI - 0.5); thing('grass', cx + Math.cos(a) * rx * 1.02, cy + Math.sin(a) * ry * 1.05, q, 0.3); }
      specs.sort((a, b) => a.y - b.y).forEach((p) => palm(p.x, p.y, p.hm, { ...p, fill: rgba(silC(0.15)) }));
    }

    // ---- the camp: a tent of goat hair, its fire, people round it ----
    function camp(x, y) {
      const k = um(y), W = 11 * k, H = 2.3 * k, fx = x + W * 0.68, fy = y + 0.6 * k, Lx = x - W / 2, Rx = x + W / 2, flat = Math.max(0.06, (y - y0) / P * 1.6);
      // What the fire lights is painted in two parts: half on the land, half on a small layer of its
      // own (#camp-lit) that brightens and dims with the flame. Solid things are cut out of that layer,
      // so only their lit edges flicker.
      const R = 16 * k, lcv = $('camp-lit');
      const bx = Math.floor(Lx - W * 0.2), by = Math.floor(y - H * 1.15), bw = Math.ceil(fx + R - bx), bh = Math.ceil(fy + Math.max(R * flat, 1.5 * k) - by);
      lcv.width = Math.max(1, Math.round(bw * s)); lcv.height = Math.max(1, Math.round(bh * s));
      Object.assign(lcv.style, { left: bx + 'px', top: n1(by - top) + 'px', width: bw + 'px', height: bh + 'px' });
      const lc = lcv.getContext('2d'); lc.setTransform(s, 0, 0, s, -bx * s, -by * s);
      const both = (fn) => { fn(c, 0.5); fn(lc, 0.5); };
      const cut = (p) => { lc.globalCompositeOperation = 'destination-out'; lc.fill(p); lc.globalCompositeOperation = 'source-over'; };
      both((g, f) => glowAt(fx, fy, R, 0.4 * f, flat, g));
      glowAt(fx, fy - 0.8 * k, 4.5 * k, 0.07, 0.85);   // the air round it is .air, flickering
      c.fillStyle = rgba(N.shadow, 0.45); c.beginPath(); c.ellipse(x - W * 0.1, y + 0.5, W * 0.62, Math.max(1.2, W * flat * 0.5), 0, 0, TAU); c.fill();
      const ridgeL = [[Lx + W * 0.02, y - H * 0.62], [Lx + W * 0.1, y - H * 0.8], [Lx + W / 6, y - H * 0.98], [Lx + W / 3, y - H * 0.84], [x, y - H], [Rx - W / 3, y - H * 0.84], [Rx - W / 6, y - H * 0.97], [Rx - W * 0.1, y - H * 0.8], [Rx - W * 0.02, y - H * 0.62]];
      const front = [[Rx + W * 0.03, y - H * 0.5], [Rx - W / 6, y - H * 0.7], [Rx - W / 3, y - H * 0.62], [x, y - H * 0.72], [Lx + W / 3, y - H * 0.62], [Lx + W / 6, y - H * 0.7], [Lx - W * 0.03, y - H * 0.5]];
      // inside, in the dark, with the fire's light on the back cloth
      const inside = line([...front, [Lx - W * 0.06, y], [Rx + W * 0.06, y]], true);
      c.fillStyle = rgba(N.shadow); c.fill(inside);
      both((cx, f) => {
        cx.save(); cx.clip(inside);
        const g = cx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.95);
        g.addColorStop(0, rgba(N.flame, 0.46 * f)); g.addColorStop(0.5, rgba(N.rubric, 0.13 * f)); g.addColorStop(1, rgba(N.rubric, 0));
        cx.fillStyle = g; cx.fillRect(Lx - W * 0.1, y - H, W * 1.2, H * 1.1); cx.restore();
      });
      // the roof, woven in strips, starlight on its ridge and firelight on its front edge
      const roof = line([...ridgeL, ...front], true);
      c.fillStyle = rgba(mix(N.shadow, N.wood, 0.3)); c.fill(roof);
      c.save(); c.clip(roof); c.strokeStyle = rgba(N.shadow, 0.7); c.lineWidth = 0.6; c.beginPath();
      for (let i = 1; i < 10; i++) { const t = i / 10; c.moveTo(Lx + W * t, y - H * 1.1); c.lineTo(Lx + W * t + W * 0.01, y - H * 0.4); }
      c.stroke(); c.restore();
      c.strokeStyle = rgba(N.ink, 0.12); c.lineWidth = 0.7; c.stroke(line(ridgeL));
      cut(roof);
      both((g, f) => { g.strokeStyle = rgba(N.flame, 0.5 * f); g.lineWidth = 0.9; g.stroke(line(front.slice(0, 4))); });
      c.strokeStyle = rgba(mix(N.shadow, N.wood, 0.5)); c.lineWidth = Math.max(0.6, k * 0.09); c.beginPath();
      for (const [px, py] of [front[1], front[3], front[5]]) { c.moveTo(px, py); c.lineTo(px, y); }
      c.stroke();
      c.strokeStyle = rgba(N['ink-muted'], 0.22); c.lineWidth = 0.5; c.beginPath();
      for (const [[ax, ay], bx] of [[ridgeL[0], Lx - W * 0.2], [ridgeL[2], Lx - W * 0.1], [ridgeL[8], Rx + W * 0.2], [ridgeL[6], Rx + W * 0.1]]) { c.moveTo(ax, ay); c.lineTo(bx, y + 0.5); }
      c.stroke();
      // sticks under the fire, charred, no wider than its embers
      c.strokeStyle = rgba(mix(N.shadow, N.rubric, 0.3), 0.85); c.lineWidth = Math.max(0.6, k * 0.09); c.beginPath();
      for (const a of [-0.5, 0.1, 0.6]) { c.moveTo(fx - Math.cos(a) * k * 0.32, fy + Math.sin(a) * k * 0.08); c.lineTo(fx + Math.cos(a) * k * 0.32, fy - Math.sin(a) * k * 0.08); }
      c.stroke();
      // people round it, lit on the side that faces it
      const person = (px, py, face, seated) => {
        const F = (dx) => px + dx * k * face, Py = (dy) => py + dy * k, p = new Path2D(), rim = new Path2D();
        if (seated) {
          p.moveTo(F(-0.42), Py(0)); p.bezierCurveTo(F(-0.5), Py(-0.4), F(-0.32), Py(-0.78), F(-0.06), Py(-0.82)); p.lineTo(F(0.12), Py(-0.8)); p.bezierCurveTo(F(0.22), Py(-0.62), F(0.42), Py(-0.34), F(0.56), Py(0)); p.closePath();
          p.moveTo(F(0.04) + 0.14 * k, Py(-0.97)); p.arc(F(0.04), Py(-0.97), 0.14 * k, 0, TAU);
          rim.moveTo(F(0.12), Py(-0.8)); rim.bezierCurveTo(F(0.22), Py(-0.62), F(0.42), Py(-0.34), F(0.56), Py(0));
          rim.moveTo(F(0.04), Py(-1.11)); rim.arc(F(0.04), Py(-0.97), 0.14 * k, -Math.PI / 2, face > 0 ? 0.3 : Math.PI - 0.3, face < 0);
        } else {
          p.moveTo(F(-0.2), Py(-1.48)); p.bezierCurveTo(F(-0.3), Py(-1.0), F(-0.36), Py(-0.5), F(-0.42), Py(0)); p.lineTo(F(0.36), Py(0)); p.bezierCurveTo(F(0.3), Py(-0.5), F(0.26), Py(-1.0), F(0.18), Py(-1.48)); p.closePath();
          p.moveTo(F(0) + 0.16 * k, Py(-1.63)); p.arc(F(0), Py(-1.63), 0.16 * k, 0, TAU);
          rim.moveTo(F(0.18), Py(-1.48)); rim.bezierCurveTo(F(0.26), Py(-1.0), F(0.3), Py(-0.5), F(0.36), Py(0));
        }
        c.fillStyle = rgba(silC(0.6)); c.fill(p); cut(p);
        both((g, f) => { g.strokeStyle = rgba(N.flame, 0.7 * f); g.lineWidth = Math.max(0.5, k * 0.08); g.stroke(rim); });
      };
      person(fx - 1.5 * k, fy - 0.1 * k, 1, true);
      person(fx + 1.6 * k, fy + 0.1 * k, -1, true);
      person(Lx + W * 0.66, y + 0.2 * k, 1, false);
      return [fx, fy];
    }
    // the track to the camp, worn pale; seen from this low it is a thread across the sand
    function track(pts) {
      c.lineJoin = c.lineCap = 'round';
      c.strokeStyle = rgba(mix(litC(0.6), N.ink, 0.08), 0.5); c.lineWidth = 1; c.stroke(line(pts.map(([f, m]) => [X(f), rowAt(m)])));
    }

    // ---- the yard under the window ----
    // wind ripples on the open ground between m0 and m1 metres away, closer together as they recede
    function groundRipples(m0, m1, seed, w) {
      const q = rng(seed), dk = new Path2D(), lt = new Path2D();
      for (let m = m1; m > m0;) {
        const stp = 0.14 + q() * 0.1, y = rowAt(m), gap = P * LAND.h * stp / (m * m), pm = P / m;
        m -= stp; if (gap < 3.5) continue;
        const wl = pm * (0.25 + q() * 0.2), amp = pm * 0.02, p0 = q() * TAU, br = pm * (0.35 + q() * 0.4), up = Math.max(0.6, gap * 0.14);
        let pen = false;
        for (let x = -4; x <= sw + 4; x += 4) {
          const on = Math.sin(x / br + p0 * 3) + 0.6 * Math.sin(x / (br * 2.9) + p0) > 0.15, yy = y + Math.sin(x / wl + p0) * amp + Math.sin(x / (wl * 3.7) + p0 * 2) * amp * 1.5;
          if (on) { if (pen) { dk.lineTo(x, yy); lt.lineTo(x, yy - up); } else { dk.moveTo(x, yy); lt.moveTo(x, yy - up); } }
          pen = on;
        }
      }
      c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = rgba(darkC(1), 0.45); c.stroke(dk);
      c.lineWidth = w * 0.7; c.strokeStyle = rgba(N.ink, 0.05); c.stroke(lt);
    }
    // someone's footprints, out from the house through the gap in the wall: path in ground metres
    // ([lat, m], from near to far), drawn only between m0 and m1
    function footprints(path, m0, m1) {
      let side = 1;
      for (let i = 0; i < path.length - 1; i++) {
        const [la, ma] = path[i], [lb, mb] = path[i + 1], L = Math.hypot(lb - la, mb - ma), n = Math.floor(L / 0.68);
        for (let j = 0; j < n; j++, side = -side) {
          const t = j / n, m = lerp(ma, mb, t), lat = lerp(la, lb, t) + side * 0.11 * (mb - ma) / L;
          if (m < m0 || m > m1) continue;
          const [x, y] = gp(lat, m), rx = 0.055 * P / m, ry = 0.13 * P * LAND.h / (m * m);
          if (ry < 0.7) continue;
          c.fillStyle = rgba(N.shadow, 0.34); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
          c.strokeStyle = rgba(N.ink, 0.07); c.lineWidth = Math.max(0.5, rx * 0.12); c.beginPath(); c.ellipse(x, y + ry * 0.12, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
        }
      }
    }
    // a dead frond fallen on the sand, len metres long, lying at angle ang
    function frondOnGround(lat, m, len, ang, seed) {
      const q = rng(seed), pts = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push([lat + Math.cos(ang) * len * t, m + Math.sin(ang) * len * t + Math.sin(t * 3) * 0.08]); }
      const col = rgba(mix(mix(litC(1), darkC(1), 0.35), N['ink-muted'], 0.12), 0.85), sp = new Path2D();
      c.lineCap = 'round'; c.strokeStyle = col;
      c.lineWidth = Math.max(0.8, 0.03 * P / m); c.stroke(line(pts.map(([l, mm]) => gp(l, mm))));
      // the leaflets: short, swept towards the tip, some broken off
      for (let i = 2; i < pts.length; i++) for (const sd of [-1, 1]) {
        if (q() < 0.25) continue;
        const [l, mm] = pts[i], t = i / 18, lf = (0.14 + q() * 0.12) * (1 - t * 0.5), a = ang + sd * (0.55 + q() * 0.3);
        const [x1, y1] = gp(l, mm), [x2, y2] = gp(l + Math.cos(a) * lf, mm + Math.sin(a) * lf);
        sp.moveTo(x1, y1); sp.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + Math.abs(y2 - y1) * 0.15 + 1, x2, y2);
      }
      c.strokeStyle = rgba(N.shadow, 0.3); c.lineWidth = Math.max(0.5, 0.01 * P / m); c.save(); c.translate(-0.02 * P / m, 1.5); c.stroke(sp); c.restore();
      c.strokeStyle = col; c.stroke(sp);
    }
    // a low garden wall of mud brick m metres out, hm high, in segments [lat0, lat1]: the eroded top
    // in starlight, the face towards us in shadow with its courses, the ends at the gap
    function wall(m, hm, segs, seed) {
      const q = rng(seed), mb = m + 0.45, er = wave(seed, 3);
      const faceC = mix(mix(darkC(1), N.wood, 0.3), litC(1), 0.12), topC = mix(litC(1), N['ink-muted'], 0.1);
      for (const [l0, l1] of segs) {
        const hf = hm * P / m * sz, hb = hm * P / mb * sz, n = 40, ft = [], bt = [];
        for (let i = 0; i <= n; i++) {
          const t = i / n, l = lerp(l0, l1, t), e = 0.1 * (0.5 + 0.5 * er(l * 1.7)) + (i === 0 || i === n ? 0.06 : 0);
          const [xf, yf] = gp(l, m), [xb, yb] = gp(l, mb);
          ft.push([xf, yf - hf * (1 - e)]); bt.push([xb, yb - hb * (1 - e)]);
        }
        const [xa, ya] = gp(l0, m), [xz] = gp(l1, m);
        // its shadow on the sand in front, then the face, the top, and the end towards the gap
        const sg = c.createLinearGradient(0, ya, 0, rowAt(m - 0.7));
        sg.addColorStop(0, rgba(N.shadow, 0.35)); sg.addColorStop(1, rgba(N.shadow, 0));
        c.fillStyle = sg; c.fillRect(Math.min(xa, xz), ya, Math.abs(xz - xa), rowAt(m - 0.7) - ya);
        const face = line([...ft, [xz, ya], [xa, ya]], true);
        c.fillStyle = rgba(faceC); c.fill(face);
        c.save(); c.clip(face); c.strokeStyle = rgba(N.shadow, 0.4); c.lineWidth = Math.max(0.5, hf * 0.012); c.beginPath();
        const rows = Math.round(hm / 0.1);
        for (let r = 1; r < rows; r++) { const yy = ya - hf * r / rows; c.moveTo(Math.min(xa, xz), yy); c.lineTo(Math.max(xa, xz), yy); }
        for (let r = 0; r < rows; r++) for (let l = l0 + (r % 2 ? 0.15 : 0); l < l1; l += 0.3) { const [xx] = gp(l, m); c.moveTo(xx, ya - hf * r / rows); c.lineTo(xx, ya - hf * (r + 1) / rows); }
        c.stroke();
        c.fillStyle = rgba(N.ink, 0.04); for (let i = 0; i < 6; i++) { const l = lerp(l0, l1, q()), [xx] = gp(l, m); c.beginPath(); c.ellipse(xx, ya - hf * (0.3 + q() * 0.5), hf * (0.3 + q() * 0.4), hf * 0.12, 0, 0, TAU); c.fill(); }
        c.restore();
        c.fillStyle = rgba(topC); c.fill(line([...ft, ...bt.slice().reverse()], true));
        c.strokeStyle = rgba(N.ink, 0.12); c.lineWidth = 0.8; c.stroke(line(bt));
        const end = l1 < 0 ? n : 0, [ex, ey] = gp(end === n ? l1 : l0, mb);
        c.fillStyle = rgba(mix(faceC, topC, 0.35)); c.fill(line([ft[end], bt[end], [ex, ey], [end === n ? xz : xa, ya]], true));
        for (let i = 0; i < 5; i++) { const l = lerp(l0, l1, q()), [xx, yy] = gp(l, m - 0.15); thing('grass', xx, yy, q, 1, 0.8); }
      }
    }

    // ================ the scene, far to near ================
    const at = (m, f) => scene.push([m, f]);
    at(6000, () => escarpment(-0.06, 0.42, rowAt(6000) - 180 * P / 6000 * sz, rowAt(6000) + 2, 41));
    at(4000, () => ridge({ dist: 4000, hm: 45, lam: 900, seed: 101, d: 0.02, rise: 0.4 }));
    at(3500, () => mist(0.8, rowAt(4000) - 5, 160, 22, 1));
    at(2000, () => ridge({ dist: 2000, hm: 35, lam: 500, seed: 113, d: 0.1 }));
    at(1700, () => mist(0.55, rowAt(2000) - 4, 120, 18, 2));
    // a far grove, and fields burning at the foot of the escarpment: three of different lengths (a
    // field is metres long, so px by P/m), each a fire front with the light it throws on the ground and
    // on the underside of its smoke
    for (const [f, hm, lean] of [[0.875, 12, 0.1], [0.89, 15, -0.05], [0.905, 11, 0.15], [0.92, 14, -0.1], [0.94, 10, 0.05]]) at(1600, () => palm(X(f), rowAt(1600), hm, { seed: f * 1e3 | 0, lean, fill: rgba(silC(0.08)) }));
    const fields = [[0.268, 55, 11], [0.305, 20, 12], [0.322, 50, 13]].map(([f, len, seed]) => ({ x0: X(f), x1: X(f) + len * P / 1500 * sz, y: rowAt(1500), seed, dist: 1500 }));
    far.push(...fields);
    at(1500, () => { for (const F of fields) { const w = F.x1 - F.x0; glowAt((F.x0 + F.x1) / 2, F.y, w * 0.8 + 8, 0.28, 0.22); } });
    at(1490, () => plumes(fields.map((F) => ({ x: (F.x0 + F.x1) / 2, y: F.y })), 3));
    // and a fire behind a dune, showing over its crest
    at(1000, () => {
      const R = ridge({ dist: 1000, hm: 25, lam: 300, seed: 127, d: 0.2, gaps: [[0.32, 0.06, 1], [0.91, 0.045, 1]] });
      const x = X(0.56), y = R.at(x) + 2.5; far.push({ x0: x - 2.2, x1: x + 2.2, y, seed: 21, dist: 999 }); glowAt(x, y - 1, 12, 0.14, 0.45);
    });
    at(700, () => mist(0.38, rowAt(1000) - 2, 90, 20, 3));
    at(450, () => {
      const R = ridge({ dist: 450, hm: 16, lam: 150, seed: 131, d: 0.35, gaps: [[0.32, 0.06, 1], [0.6, 0.12, 0.95], [0.91, 0.05, 1]] });
      const x = X(0.71), y = R.at(x) + 3; far.push({ x0: x - 3, x1: x + 3, y, seed: 22, dist: 449 }); glowAt(x, y - 1, 16, 0.16, 0.45);
    });
    at(300, () => oasis(X(0.6), rowAt(300), 71));
    at(250, () => mist(0.22, rowAt(300), 60, 26, 4));
    at(180, () => ridge({ dist: 180, hm: 8, lam: 90, seed: 149, d: 0.5, gaps: [[0.32, 0.06, 1], [0.6, 0.12, 0.95], [0.91, 0.05, 1]] }));
    at(150, () => acacia(X(0.75), rowAt(150), 6, 7));
    const trail = [[1.06, 118], [0.88, 112], [0.52, 96], [0.3, 94], [0.21, 92.5]];
    at(120, () => track(trail));
    at(100, () => palm(X(0.125), rowAt(100), 10, { seed: 81, lean: 0.12, fill: rgba(silC(near(100))) }));
    at(97, () => palm(X(0.225), rowAt(97), 8, { seed: 82, lean: -0.15, fill: rgba(silC(near(97))) }));
    let fire = [0, 0];
    at(92, () => { fire = camp(X(0.17), rowAt(92)); });
    scatterG(70, 40, 220, ['grass', 'grass', 'bush', 'stone'], 17);
    at(60, () => ridge({ dist: 60, hm: 5, lam: 70, seed: 157, d: 0.75, only: [[0, 0.09], [1, 0.08]] }));
    at(42, () => acacia(X(0.9), rowAt(42), 5, 8));
    at(25, () => ridge({ dist: 25, hm: 0.9, lam: 35, seed: 163, d: 0.86 }));
    scatterG(45, 12.5, 40, ['grass', 'grass', 'bush', 'stone'], 19, [0, 1], 0.6);
    at(12, () => ridge({ dist: 12, hm: 0.45, lam: 18, seed: 173, d: 0.94 }));
    // someone went out through the gap in the wall, towards the camp
    const steps = [[0.2, 3.2], [0.12, 5], [-0.15, 8], [-1.2, 12.5], [-3.6, 19], [-7, 26]];
    at(11.9, () => { groundRipples(8.5, 12, 5, 0.9); footprints(steps, 8.5, 30); });
    scatterG(14, 8.7, 11.5, ['grass', 'pebble', 'grass', 'stone'], 23, [0.08, 0.92], 0.5);
    at(8, () => wall(8, 0.75, [[-16, -1.1], [1.1, 16]], 31));
    at(5, () => ridge({ dist: 5, hm: 0.2, lam: 9, seed: 179, d: 1 }));
    at(4.9, () => { groundRipples(3.2, 7.8, 6, 1.4); footprints(steps, 3, 8); frondOnGround(1.1, 4.3, 2.1, 0.7, 61); frondOnGround(-2.2, 6.4, 1.8, 2.5, 62); });
    scatterG(12, 3.5, 7.6, ['pebble', 'pebble', 'grass'], 29, [0.2, 0.8]);
    scene.sort((a, b) => b[0] - a[0]).forEach(([m, f]) => { stratumFor(m); f(); });
    // at its foot the land goes to the ground below it all (the wallpaper's land ends above it)
    const fy0 = 1.64 * V;
    if (bot > fy0) {
      const fg = c.createLinearGradient(0, fy0, 0, 1.78 * V);
      fg.addColorStop(0, rgba(deep, 0)); fg.addColorStop(1, rgba(deep, 1));
      c.fillStyle = fg; c.fillRect(0, fy0, sw, bot - fy0 + 4);
    }
    // and at its top there is only mist and smoke, thinning: fade it out, so it has no edge on the sky
    for (const g of layers.length ? layers.map((l) => l.g) : [c]) {
      g.save(); g.globalCompositeOperation = 'destination-in';
      const tg = g.createLinearGradient(0, top, 0, top + 0.1 * V); tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = tg; g.fillRect(0, top, sw, bot - top); g.restore();
    }

    // ---- what flickers and moves, as small layers of its own ----
    const shown = (x, y, dist) => ridges.every((R) => R.dist >= dist || y < R.at(x) + 1.5);   // a fire just behind a crest still glows over it
    // The fires far off, on two layers that hold the same fires at two moments and cross-fade. Each
    // fire front is a row of tiny flames along the ground: where it burns is a slow random walk shared
    // by both layers (the gaps stay put), how high and bright each flame is, each layer its own.
    const white = mix(N.flame, N.ink, 0.5), ys = far.map((F) => F.y);
    const fTop = Math.floor(Math.min(...ys) - 12), fH = Math.ceil(Math.max(...ys) + 5) - fTop, fd = Math.min(window.devicePixelRatio || 1, 2);
    [['far-a', 41], ['far-b', 43]].forEach(([id, seed]) => {
      const cv = $(id); cv.width = Math.round(sw * fd); cv.height = Math.max(1, Math.round(fH * fd));
      Object.assign(cv.style, { left: '0px', top: n1(fTop - top) + 'px', width: sw + 'px', height: fH + 'px' });
      const g = cv.getContext('2d'), r = rng(seed);
      g.setTransform(fd, 0, 0, fd, 0, -fTop * fd); g.globalCompositeOperation = 'lighter';
      for (const F of far) {
        const q = rng(F.seed), len = F.x1 - F.x0, n = Math.max(3, Math.round(len / 0.75)), tall = F.dist > 1200 ? 1 : 1.5;
        let v = 0.5 + q() * 0.5, b = r();
        for (let i = 0; i <= n; i++) {
          v = clamp(v + (q() - 0.5) * 0.45); b = clamp(b + (r() - 0.5) * 0.8);
          const x = F.x0 + len * i / n, y = F.y + Math.sin(i * 0.7 + F.seed) * 0.3;
          if ((len > 10 && v < 0.32) || !shown(x, y, F.dist)) continue;   // a small fire burns whole
          const h = (0.6 + 1.5 * b * v) * tall, a = 0.3 + 0.7 * b * (0.4 + 0.6 * v);
          const gr = g.createLinearGradient(0, y + 0.4, 0, y - h);
          gr.addColorStop(0, rgba(white, a)); gr.addColorStop(0.45, rgba(N.flame, a * 0.8)); gr.addColorStop(1, rgba(N.rubric, 0));
          g.fillStyle = gr; g.fillRect(x - 0.45, y - h, 0.9, h + 0.4);
          if (b > 0.6) { const rg = g.createRadialGradient(x, y - h * 0.4, 0, x, y - h * 0.4, 3.2 * tall); rg.addColorStop(0, rgba(N.flame, 0.16 * b)); rg.addColorStop(1, rgba(N.rubric, 0)); g.fillStyle = rg; g.fillRect(x - 3.2 * tall, y - h * 0.4 - 3.2 * tall, 6.4 * tall, 6.4 * tall); }
        }
      }
    });
    const place = (node, x, y) => { node.style.left = n1(x) + 'px'; node.style.top = n1(y - top) + 'px'; };
    // the camp's fire: its flame painted to the camp's scale (.fx draws 10px to the metre at --s 1)
    const cp = $('camp'), ck = um(fire[1]) / 10;
    place(cp, fire[0], fire[1]); cp.style.setProperty('--s', ck.toFixed(3));
    flameStrip($('camp-flame'), 7 * ck, 10 * ck, 8, 977, 0.15);
    // the smoke over the burning fields, drawn larger the taller the view
    for (const [id, F] of [['burn-1', fields[0]], ['burn-2', fields[2]]]) { const e = $(id); place(e, (F.x0 + F.x1) / 2, F.y); e.style.setProperty('--s', (0.95 * V / 900 * (0.7 + 0.3 * sz)).toFixed(3)); }
    // the walker: his box is the stretch of track he walks, crossed corner to corner
    const wk = $('walker'), ax = X(trail[1][0]), ay = rowAt(trail[1][1]), bx = X(trail[2][0]), by = rowAt(trail[2][1]);
    Object.assign(wk.style, { left: n1(bx) + 'px', top: n1(ay - top) + 'px', width: n1(ax - bx) + 'px', height: n1(by - ay) + 'px' });
    const wkK = um((ay + by) / 2) * 0.0515;
    wk.style.setProperty('--k', wkK.toFixed(3));
    flameStrip($('torch-flame'), 4 * wkK, 7 * wkK, 8, 61, 0.55);
  }

  // ================================================================ 4. Things on the desk
  // Drawn in code, in ink outline with flat brass, leather and wood. Seen from above and a little in
  // front, as the camera sees the desk. Colours are tokens, mixed in landing.html's .pr and .lt rules.

  // the lantern: hexagonal, brass frame, glass panes, a pierced cap; an oil cup and wick inside
  function lanternSVG() {
    const cx = 70, k = 0.4;
    const hex = (R, y) => [0, 60, 120, 180, 240, 300].map((a) => [cx + R * Math.cos(a * RAD), y + R * k * Math.sin(a * RAD)]);
    const T = hex(38, 92), B = hex(38, 166), Pl = hex(46, 171), C = hex(42, 90);
    const dn = (a, d) => a.map(([x, y]) => [x, y + d]);
    const Pd = dn(Pl, 7), Cd = dn(C, 5), A = [cx, 44];
    const ln = (p, q) => `<line x1="${n1(p[0])}" y1="${n1(p[1])}" x2="${n1(q[0])}" y2="${n1(q[1])}"/>`;
    let s = '';
    s += `<polygon class="br-d" points="${pts([Pl[3], Pl[2], Pl[1], Pl[0], Pd[0], Pd[1], Pd[2], Pd[3]])}"/>`;
    s += `<polygon class="br-m" points="${pts(Pl)}"/>`;
    for (const p of [Pd[3], Pd[2], Pd[1], Pd[0]]) s += `<ellipse class="br-d" cx="${n1(p[0])}" cy="${n1(p[1] + 2)}" rx="4" ry="2.6"/>`;
    s += `<polygon class="glass" points="${pts([T[3], T[4], T[5], T[0], B[0], B[1], B[2], B[3]])}"/>`;
    s += `<g class="bar-back">${ln(T[4], B[4])}${ln(T[5], B[5])}<polyline points="${pts([B[3], B[4], B[5], B[0]])}"/></g>`;
    s += `<path class="cup" d="M58 158 C58 164 62 167 70 167 C78 167 82 164 82 158 Z"/><ellipse class="br-m" cx="70" cy="158" rx="12" ry="4.2"/><ellipse class="cup" cx="70" cy="158" rx="7" ry="2.2"/>`;
    s += `<path class="glint" d="M${n1(T[2][0] + 6)} ${n1(T[2][1] + 10)} L${n1(B[2][0] + 6)} ${n1(B[2][1] - 20)}"/><path class="glint" style="opacity:.1" d="M${n1(T[1][0] + 5)} ${n1(T[1][1] + 6)} L${n1(B[1][0] + 5)} ${n1(B[1][1] - 44)}"/>`;
    s += `<g class="bar">${[0, 1, 2, 3].map((i) => ln(T[i], B[i])).join('')}<polyline points="${pts([T[3], T[2], T[1], T[0]])}"/><polyline points="${pts([B[3], B[2], B[1], B[0]])}"/></g>`;
    s += `<g class="bar-hl">${ln([T[1][0] - 1.7, T[1][1] + 3], [B[1][0] - 1.7, B[1][1] - 3])}${ln([T[2][0] + 1.7, T[2][1] + 3], [B[2][0] + 1.7, B[2][1] - 3])}${ln([T[0][0] - 1.7, T[0][1] + 4], [B[0][0] - 1.7, B[0][1] - 4])}${ln([T[3][0] + 1.7, T[3][1] + 4], [B[3][0] + 1.7, B[3][1] - 4])}</g>`;
    s += `<polygon class="br-d" points="${pts([C[3], C[2], C[1], C[0], Cd[0], Cd[1], Cd[2], Cd[3]])}"/>`;
    s += `<polygon class="cap-l" points="${pts([C[2], C[3], A])}"/><polygon class="cap-m" points="${pts([C[1], C[2], A])}"/><polygon class="cap-r" points="${pts([C[0], C[1], A])}"/>`;
    const holes = [];
    const facet = (P1, P2, P3, n0) => { for (const t of [0.17, 0.37, 0.57, 0.75]) { const a = [lerp(P1[0], P3[0], t), lerp(P1[1], P3[1], t)], b = [lerp(P2[0], P3[0], t), lerp(P2[1], P3[1], t)], n = Math.max(1, Math.round(n0 * (1 - t))); for (let j = 1; j <= n; j++) { const u = j / (n + 1); holes.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]); } } };
    facet(C[2], C[1], A, 5); facet(C[3], C[2], A, 3); facet(C[1], C[0], A, 3);
    s += holes.map(([x, y]) => `<circle class="hole" cx="${n1(x)}" cy="${n1(y)}" r="1.25"/>`).join('');
    s += `<line class="bar-hl" style="opacity:.45" x1="${n1(Cd[2][0])}" y1="${n1(Cd[2][1] - 0.6)}" x2="${n1(Cd[1][0])}" y2="${n1(Cd[1][1] - 0.6)}"/>`;
    s += `<ellipse class="ring" cx="70" cy="33" rx="7.5" ry="10.5"/><circle class="br-l" cx="70" cy="44.5" r="3.4"/>`;
    s += `<polyline class="ol" points="${pts([Cd[3], C[3], A, C[0], Cd[0]])}"/><polyline class="ol" points="${pts([Cd[3], Cd[2], Cd[1], Cd[0]])}"/><polyline class="ol" points="${pts([Pl[3], Pd[3], Pd[2], Pd[1], Pd[0], Pl[0]])}"/>`;
    return `<svg class="body" viewBox="0 0 140 210" aria-hidden="true">${s}</svg>`;
  }
  const FLAME = '<svg viewBox="0 0 140 210" aria-hidden="true"><circle cx="70" cy="138" r="52" style="fill: url(#lt-glow)"/><path class="fl" d="M70 156 C62.5 149 62.5 135 70 115 C77.5 135 77.5 149 70 156 Z"/><path class="fl-core" d="M70 155 C67 150 67 143 70 134 C73 143 73 150 70 155 Z"/><ellipse class="fl-blue" cx="70" cy="154" rx="3" ry="2"/></svg>';
  const FOOT = '<div class="foot"><i class="spokes"></i><i class="sheen"></i><i class="contact"></i></div>';
  const lanternHTML = (foot) => `${foot ? FOOT : ''}<i class="halo"></i>${lanternSVG()}<div class="sway"><div class="flame-wrap">${FLAME}</div></div><i class="wisp"></i>`;

  // an astrolabe: the mater and its degree scale, the plate's circles, the rete, the rule, the throne
  function astrolabeSVG() {
    let s = '<ellipse class="sh" cx="10" cy="14" rx="103" ry="101"/>';
    s += '<path class="br-m" d="M-34 -88 C-30 -104 -16 -116 0 -122 C16 -116 30 -104 34 -88 Z"/><path class="br-d" d="M-20 -94 C-16 -104 -8 -110 0 -113 C8 -110 16 -104 20 -94 Z"/><circle class="br-l" cx="0" cy="-108" r="4"/>';
    s += '<ellipse class="ring" cx="0" cy="-133" rx="9" ry="13"/>';
    s += '<circle class="disc" r="100"/><circle class="plate" r="84"/>';
    let d = '';
    for (let i = 0; i < 120; i++) { const a = i / 120 * TAU, l = i % 10 === 0 ? 12 : i % 5 === 0 ? 8 : 4.5; d += `M${n1(Math.sin(a) * 98)} ${n1(-Math.cos(a) * 98)}L${n1(Math.sin(a) * (98 - l))} ${n1(-Math.cos(a) * (98 - l))}`; }
    s += `<path class="eng" d="${d}"/><circle class="eng" r="86"/><circle class="eng" r="98"/><circle class="eng" r="58"/><circle class="eng" r="36"/>`;
    let alm = '';
    for (let j = 0; j < 9; j++) { const rr = 70 - j * 7.6, cy = -12 - j * 4.4; alm += `<circle cy="${n1(cy)}" r="${n1(rr)}"/>`; }
    s += `<g class="eng" clip-path="url(#astro-clip)">${alm}<path d="M-84 6 Q0 -40 84 6"/><path d="M0 -84 L0 84 M-84 0 L84 0"/></g>`;
    s += '<g transform="rotate(-28)"><circle class="rete-r" cy="-16" r="56"/><circle class="rete-s" r="60" style="opacity:.6"/>';
    for (const [a, r1, r2] of [[20, 60, 78], [75, 40, 72], [140, 60, 80], [200, 46, 76], [255, 60, 79], [310, 38, 68]]) {
      const x1 = Math.sin(a * RAD) * r1, y1 = -Math.cos(a * RAD) * r1, x2 = Math.sin((a + 9) * RAD) * r2, y2 = -Math.cos((a + 9) * RAD) * r2;
      s += `<path class="rete-s" d="M${n1(x1)} ${n1(y1)} Q${n1((x1 + x2) / 2 + 6)} ${n1((y1 + y2) / 2)} ${n1(x2)} ${n1(y2)}"/><circle class="br-l" cx="${n1(x2)}" cy="${n1(y2)}" r="2.5"/>`;
    }
    s += '</g>';
    s += '<g transform="rotate(34)"><path class="br-l" d="M-97 0 L-10 -6 L10 -6 L97 0 L10 6 L-10 6 Z"/><path class="br-d" style="opacity:.55" d="M-97 0 L97 0 L10 6 L-10 6 Z"/><circle class="br-d" r="6.5"/><circle class="br-l" r="3"/></g>';
    s += '<path class="hl" d="M-86 -50 A100 100 0 0 1 -30 -95"/><circle class="ol" r="100"/>';
    return `<svg viewBox="-125 -152 250 282" aria-hidden="true">${s}</svg>`;
  }
  const defs = document.querySelector('svg defs');
  el('circle', { r: 84 }, el('clipPath', { id: 'astro-clip' }, defs));

  // two closed codices, tooled with a double rule and a medallion
  function booksSVG() {
    const book = (w, h, cls, rot, dx, dy) => {
      const x = -w / 2, y = -h / 2;
      let b = `<g transform="translate(${dx} ${dy}) rotate(${rot})">`;
      b += `<rect class="sh" x="${x + 7}" y="${y + 10}" width="${w}" height="${h}" rx="3"/>`;
      b += `<rect class="pages" x="${x + 3}" y="${y + 3}" width="${w}" height="${h}" rx="2"/>`;
      for (let i = 1; i < 5; i++) b += `<line class="pages-l" x1="${n1(x + w + 3 - i * 0.9)}" y1="${y + 7}" x2="${n1(x + w + 3 - i * 0.9)}" y2="${y + h + 1}"/>`;
      b += `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
      b += `<rect class="tool" x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${h - 18}"/><rect class="tool" x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}"/>`;
      const mh = h * 0.22, mw = w * 0.13;
      b += `<path class="tool-f" d="M0 ${n1(-mh)} C${n1(mw)} ${n1(-mh * 0.5)} ${n1(mw)} ${n1(mh * 0.5)} 0 ${n1(mh)} C${n1(-mw)} ${n1(mh * 0.5)} ${n1(-mw)} ${n1(-mh * 0.5)} 0 ${n1(-mh)} Z"/>`;
      b += `<path class="tool" d="M0 ${n1(-mh - 7)} L0 ${n1(-mh)} M0 ${n1(mh)} L0 ${n1(mh + 7)}"/>`;
      for (const [cx, cy, sx, sy] of [[x + 13, y + 13, 1, 1], [x + w - 13, y + 13, -1, 1], [x + 13, y + h - 13, 1, -1], [x + w - 13, y + h - 13, -1, -1]]) b += `<path class="tool-f" d="M${n1(cx)} ${n1(cy)} l${n1(16 * sx)} 0 q${n1(-4 * sx)} ${n1(10 * sy)} ${n1(-16 * sx)} ${n1(16 * sy)} Z"/>`;
      b += `<rect class="ol" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`;
      return b + '</g>';
    };
    return `<svg viewBox="-130 -100 260 200" aria-hidden="true">${book(220, 150, 'leather-b', 5, 4, 8)}${book(176, 122, 'leather-r', -7, -10, -6)}</svg>`;
  }

  // a glazed inkwell, two reed pens, drops of ink
  function inkwellSVG() {
    const reed = (x1, y1, x2, y2, w) => {
      const a = Math.atan2(y2 - y1, x2 - x1) / RAD, L = Math.hypot(x2 - x1, y2 - y1);
      return `<g transform="translate(${n1(x1)} ${n1(y1)}) rotate(${n1(a)})"><rect class="sh" x="4" y="${n1(-w / 2 + 5)}" width="${n1(L)}" height="${w}" rx="${w / 2}"/><path class="reed" d="M0 ${-w / 2} L${n1(L - 22)} ${-w / 2} L${n1(L)} 0.6 L${n1(L - 22)} ${w / 2} L0 ${w / 2} Z"/><path class="nib-ink" d="M${n1(L - 9)} ${n1(-w * 0.25)} L${n1(L)} 0.6 L${n1(L - 9)} ${n1(w * 0.3)} Z"/><line class="pages-l" x1="${n1(L * 0.3)}" y1="${-w / 2}" x2="${n1(L * 0.3)}" y2="${w / 2}"/><line class="pages-l" x1="${n1(L * 0.62)}" y1="${-w / 2}" x2="${n1(L * 0.62)}" y2="${w / 2}"/><path class="ol" d="M0 ${-w / 2} L${n1(L - 22)} ${-w / 2} L${n1(L)} 0.6 L${n1(L - 22)} ${w / 2} L0 ${w / 2} Z"/></g>`;
    };
    let s = reed(-122, 36, 66, 2, 7) + reed(-112, 54, 90, 32, 6);
    s += '<path class="stain" d="M96 30 c4 -3 9 -1 9 3 c0 4 -6 6 -9 3 c-2 -2 -2 -4 0 -6 Z"/><circle class="stain" cx="112" cy="41" r="2.2"/><circle class="stain" cx="87" cy="45" r="1.4"/><path class="stain" style="opacity:.35" d="M-70 -30 c6 -4 14 -2 15 3 c1 5 -9 8 -14 5 c-3 -2 -4 -6 -1 -8 Z"/>';
    // a brass inkwell, its body engraved with two bands, its mouth wet with ink
    s += '<ellipse class="sh" cx="9" cy="9" rx="38" ry="18"/>';
    s += '<path class="glaze" d="M-32 -20 L-32 0 A32 13 0 0 0 32 0 L32 -20 Z"/><path class="eng" d="M-32 -13 A32 13 0 0 0 32 -13 M-32 -6 A32 13 0 0 0 32 -6"/><ellipse class="glaze-top" cx="0" cy="-20" rx="32" ry="13"/>';
    s += '<ellipse class="br-m" cx="0" cy="-21" rx="15" ry="6.4"/><ellipse class="inkpool" cx="0" cy="-20" rx="11.5" ry="4.6"/><path class="wet" d="M-6 -22 q4 -1.5 9 -0.5"/>';
    s += '<path class="hl" style="opacity:.4" d="M-24 -11 L-24 0"/><path class="ol" d="M-32 -20 L-32 0 A32 13 0 0 0 32 0 L32 -20"/><ellipse class="ol" cx="0" cy="-20" rx="32" ry="13"/>';
    return `<svg viewBox="-130 -70 260 140" aria-hidden="true">${s}</svg>`;
  }

  // a spool of brass thread on its side: the thread on the desk starts here
  function spoolSVG() {
    let s = '<ellipse class="sh" cx="6" cy="10" rx="50" ry="26"/><ellipse class="wood-d" cx="-40" cy="0" rx="9" ry="30"/><rect class="thread-w" x="-40" y="-22" width="80" height="44"/>';
    let d = ''; for (let i = 0; i < 19; i++) { const x = -39 + i * 4.3; d += `M${n1(x)} -22 L${n1(x + 3)} 22`; }
    s += `<path class="thread-l" d="${d}"/><path class="ol" d="M-40 -22 L40 -22 M-40 22 L40 22"/>`;
    s += '<ellipse class="wood-l" cx="40" cy="0" rx="9" ry="30"/><ellipse class="wood-d" cx="40" cy="0" rx="3" ry="9"/><ellipse class="ol" cx="40" cy="0" rx="9" ry="30"/><ellipse class="ol" cx="-40" cy="0" rx="9" ry="30"/>';
    return `<svg viewBox="-60 -40 120 80" aria-hidden="true">${s}</svg>`;
  }

  // a shallow brass dish of pins, and pins lying loose
  function dishSVG() {
    let s = '<ellipse class="sh" cx="5" cy="7" rx="44" ry="20"/><ellipse class="br-d" cx="0" cy="0" rx="42" ry="18"/><ellipse class="br-m" cx="0" cy="-1" rx="36" ry="14"/><ellipse class="br-d" cx="0" cy="1" rx="30" ry="10.5"/>';
    for (const [x, y] of [[-14, -2], [-4, 3], [8, -4], [16, 2], [2, -7], [-20, 4], [24, -3]]) s += `<circle class="sh" cx="${x + 1.5}" cy="${y + 2}" r="3.6"/><circle class="pin-h" cx="${x}" cy="${y}" r="3.6"/>`;
    s += '<path class="hl" style="opacity:.35" d="M-36 -6 A42 18 0 0 1 -4 -18"/><ellipse class="ol" cx="0" cy="0" rx="42" ry="18"/>';
    return `<svg viewBox="-50 -30 100 60" aria-hidden="true">${s}</svg>`;
  }
  const loosePinSVG = () => '<svg viewBox="0 0 60 14" aria-hidden="true"><line class="needle-sh" x1="10" y1="9" x2="58" y2="10"/><line class="needle" x1="8" y1="7" x2="56" y2="7.6"/><circle class="sh" cx="9" cy="9" r="4.4"/><circle class="pin-h" cx="7" cy="7" r="4.4"/></svg>';

  // a rolled sheet, lying by the wall
  function scrollSVG() {
    let s = '<rect class="sh" x="-86" y="-10" width="180" height="30" rx="14"/><rect class="vellum" x="-92" y="-16" width="180" height="32" rx="3"/>';
    s += '<path class="pages-l" d="M-80 -9 L76 -9 M-80 2 L76 2 M-80 10 L76 10" style="opacity:.6"/>';
    s += '<ellipse class="vellum-d" cx="88" cy="0" rx="7" ry="16"/><path class="pages-l" d="M88 -10 a4 9 0 1 1 -1 18 a3 6 0 1 1 1 -12"/><ellipse class="vellum-d" cx="-92" cy="0" rx="7" ry="16"/>';
    s += '<path class="ol" d="M-92 -16 L88 -16 M-92 16 L88 16"/><ellipse class="ol" cx="88" cy="0" rx="7" ry="16"/>';
    return `<svg viewBox="-104 -26 208 52" aria-hidden="true">${s}</svg>`;
  }

  // brass dividers lying open on the map
  function dividersSVG() {
    let s = '';
    const leg = (a, L, sh) => {
      const ux = Math.sin(a * RAD), uy = Math.cos(a * RAD), nx = uy, ny = -ux, tip = [ux * L, uy * L];
      const p = [[nx * 4.2, ny * 4.2], [-nx * 4.2, -ny * 4.2], [tip[0] - nx * 0.7, tip[1] - ny * 0.7], [tip[0] + nx * 0.7, tip[1] + ny * 0.7]].map(([x, y]) => [x + sh, y + sh * 1.4]);
      return p;
    };
    for (const a of [-11, 15]) s += `<polygon class="sh" style="opacity:.3" points="${pts(leg(a, 190, 7))}"/>`;
    for (const a of [-11, 15]) s += `<polygon class="br-m" points="${pts(leg(a, 190, 0))}"/><polygon class="ol" points="${pts(leg(a, 190, 0))}"/>`;
    s += '<circle class="sh" style="opacity:.35" cx="7" cy="10" r="10"/><circle class="br-m" r="10"/><circle class="br-l" r="4.5"/><circle class="ol" r="10"/><path class="br-d" d="M-4 -9 L0 -22 L4 -9 Z"/>';
    return `<svg viewBox="-50 -30 140 230" aria-hidden="true">${s}</svg>`;
  }

  // a wooden rule with brass ticks
  function ruleSVG() {
    let s = '<rect class="sh" x="6" y="9" width="410" height="22" rx="2"/><rect class="wood-l" x="0" y="0" width="410" height="22" rx="2"/>';
    let d = ''; for (let i = 0; i <= 78; i++) { const x = 10 + i * 5, l = i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4; d += `M${x} 0 L${x} ${l}`; }
    s += `<path class="tick" d="${d}"/><rect class="ol" x="0" y="0" width="410" height="22" rx="2"/><line class="hl" style="opacity:.3" x1="4" y1="1.5" x2="300" y2="1.5"/>`;
    return `<svg viewBox="0 0 420 34" aria-hidden="true">${s}</svg>`;
  }

  // the top of the desk, under the window (the opening paints a picture of the same, see paintPlane)
  function deskProps() {
    const items = [['p-scroll', scrollSVG()], ['p-books', booksSVG()], ['p-astro', astrolabeSVG()], ['p-ink', inkwellSVG()], ['p-dish', dishSVG()],
      ['p-spool', spoolSVG() + '<i class="anchor" data-anchor="spool" style="left: 70%; top: 78%"></i>'], ['p-pin1', loosePinSVG()], ['p-pin2', loosePinSVG()]];
    return items.map(([cls, svg]) => `<div class="prop pr ${cls}">${svg}</div>`).join('');
  }
  $('desk-props').innerHTML = deskProps();
  const lantern = $('lantern'), lanternCopy = $('lantern-copy');
  lantern.innerHTML = lanternHTML(true);
  lanternCopy.innerHTML = lanternHTML(false);   // until its canvases are painted (paintCopy)
  $('dividers').innerHTML = dividersSVG(); $('dividers').classList.add('pr');
  $('rule-stick').innerHTML = ruleSVG(); $('rule-stick').classList.add('pr');

  // ================================================================ 5. Figures on the papers
  // Chapter one: the same fields and fires under two grids
  (function twin() {
    const r = rng(2012), plots = [];
    (function split(x, y, w, h, d) {
      if (d === 0 || (w < 70 && h < 70)) { plots.push([x, y, w, h]); return; }
      if (w > h) { const c = w * (0.38 + r() * 0.24); split(x, y, c, h, d - 1); split(x + c, y, w - c, h, d - 1); }
      else { const c = h * (0.38 + r() * 0.24); split(x, y, w, c, d - 1); split(x, y + c, w, h - c, d - 1); }
    })(0, 0, 400, 400, 6);
    const fires = [];
    for (const [x, y, w, h] of plots.filter(() => r() < 0.3)) {
      const big = r() < 0.25, rx = big ? 14 + r() * 12 : 3 + r() * 6, ry = rx * (0.5 + r() * 0.5);
      fires.push({ cx: x + w * (0.3 + r() * 0.4), cy: y + h * (0.3 + r() * 0.4), rx, ry, rot: r() * 180 });
    }
    function hits(size, minArea) {
      const area = new Map();
      for (const f of fires) {
        const c = Math.cos(f.rot * RAD), s = Math.sin(f.rot * RAD);
        for (let dx = -f.rx; dx <= f.rx; dx += 1.5) for (let dy = -f.rx; dy <= f.rx; dy += 1.5) {
          const u = dx * c + dy * s, v = -dx * s + dy * c;
          if ((u * u) / (f.rx * f.rx) + (v * v) / (f.ry * f.ry) > 1) continue;
          const px = f.cx + dx, py = f.cy + dy;
          if (px < 0 || py < 0 || px >= 400 || py >= 400) continue;
          const k = `${Math.floor(px / size)},${Math.floor(py / size)}`;
          area.set(k, (area.get(k) || 0) + 2.25);
        }
      }
      return [...area].filter(([, a]) => a >= minArea).map(([k]) => k.split(',').map(Number));
    }
    function draw(svgId, size, minArea, countId) {
      const svg = $(svgId), r2 = rng(77), dfs = el('defs', {}, svg);
      for (const step of [5, 6, 7]) for (const dir of ['h', 'v']) {
        const pat = el('pattern', { id: `${svgId}-f${dir}${step}`, width: step, height: step, patternUnits: 'userSpaceOnUse' }, dfs);
        el('line', dir === 'h' ? { class: 'furrow', x1: 0, y1: step / 2, x2: step, y2: step / 2 } : { class: 'furrow', x1: step / 2, y1: 0, x2: step / 2, y2: step }, pat);
      }
      for (const [x, y, w, h] of plots) {
        el('rect', { class: 'plot', x: x + 1, y: y + 1, width: Math.max(0, w - 2), height: Math.max(0, h - 2) }, svg);
        if (r2() < 0.55) { const vertical = w < h, step = 5 + Math.floor(r2() * 3); el('rect', { x: x + 3, y: y + 3, width: Math.max(0, w - 6), height: Math.max(0, h - 6), fill: `url(#${svgId}-f${vertical ? 'v' : 'h'}${step})` }, svg); }
      }
      el('path', { class: 'canal', d: 'M -10 300 C 80 270 150 290 220 240 S 330 160 410 150' }, svg);
      el('path', { class: 'canal', d: 'M -10 306 C 80 276 150 296 220 246 S 330 166 410 156' }, svg);
      for (const f of fires) el('ellipse', { class: 'fire', cx: f.cx, cy: f.cy, rx: f.rx, ry: f.ry, transform: `rotate(${f.rot} ${f.cx} ${f.cy})` }, svg);
      const cells = hits(size, minArea);
      for (const [i, j] of cells) el('rect', { class: 'hit', x: i * size, y: j * size, width: Math.min(size, 400 - i * size), height: Math.min(size, 400 - j * size) }, svg);
      let gd = '';
      for (let v = size; v < 400; v += size) gd += `M${n1(v)} 0V400M0 ${n1(v)}H400`;
      el('path', { class: 'gridl', d: gd }, svg);
      $(countId).textContent = cells.length;
    }
    draw('grid-modis', 100, 260, 'count-modis');
    draw('grid-viirs', 37.5, 30, 'count-viirs');
  })();

  // the reading stone: a lens on the fine grid, showing it larger
  (function lens() {
    const lensEl = $('lens'), src = $('grid-viirs'); if (!lensEl || !src) return;
    const m = 1.75, L = 0.36, lx = 0.46, ly = 0.08, cx = lx + L / 2, cy = ly + L / 2;
    const clone = src.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('role'); clone.removeAttribute('aria-label');
    Object.assign(clone.style, { width: (m / L * 100) + '%', left: ((0.5 - cx * m / L) * 100) + '%', top: ((0.5 - cy * m / L) * 100) + '%', border: 'none', outline: 'none' });
    lensEl.querySelector('.mag').appendChild(clone);
  })();

  // Chapter two: the sea in hairlines, the desert in stipple
  (function map() {
    const sea = $('sea');
    let d = '';
    for (let y = 14; y < 210; y += 8) { const wob = (x) => y + Math.sin(x / 70 + y) * 1.2; d = `M 0 ${wob(0).toFixed(1)}`; for (let x = 40; x <= 1000; x += 40) d += ` L ${x} ${wob(x).toFixed(1)}`; el('path', { class: 'sea-line', d, fill: 'none', opacity: (0.35 + (210 - y) / 420).toFixed(2) }, sea); }
    const r = rng(64);
    let dots = '';
    for (let i = 0; i < 520; i++) { const x = r() * 1000, y = 240 + r() * 400; r(); if (!(Math.abs(x - 500) < (640 - y) * 0.62 && y < 590)) dots += `M${x.toFixed(1)} ${y.toFixed(1)}h0`; }
    el('path', { d: dots }, $('stipple'));
  })();

  // Chapter three: the table, drawn from the Nile Delta's months (window.ZIJ_TABLE, put in the page
  // by scripts/build-landing.mjs). Colour classes are the app's: quintiles of the non-zero months.
  (function table() {
    const data = window.ZIJ_TABLE, cal = $('cal'); if (!cal || !data) return;
    const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const div = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text !== undefined) d.textContent = text; return d; };
    const headRow = div('cal-row mh-row'), headCells = div('cells');
    headRow.append(div('mh'), headCells);
    months.forEach((m) => headCells.appendChild(div('mh', m)));
    cal.appendChild(headRow);
    for (const r of data.rows) {
      const row = div('cal-row'), cells = div('cells');
      row.append(div('yr' + (r.year % 5 === 0 ? ' decade' : ''), r.year), cells);
      for (const cls of r.cells) cells.appendChild(div('cell ' + cls));
      cal.appendChild(row);
    }
    const box = div('anomaly'); cal.appendChild(box);
    const place = () => {
      const row = cal.children[1 + data.box.year - data.rows[0].year], yr = row.firstChild, cellW = (row.offsetWidth - yr.offsetWidth) / 12;
      Object.assign(box.style, { top: row.offsetTop + 'px', left: yr.offsetWidth + cellW * data.box.from + 'px', width: cellW * data.box.months + 'px', height: row.offsetHeight + 'px' });
      $('margin-note').style.marginTop = innerWidth > 760 ? Math.max(0, row.offsetTop - 10) + 'px' : '';
    };
    place(); addEventListener('resize', place); document.fonts && document.fonts.ready.then(place);
  })();

  // ================================================================ 6. Textures
  // wood: long planks running away from you towards the wall, each its own tone, straight grain with
  // a few knots, flat-sawn arches on some, butt joints and seams. Tiles seamlessly down the desk.
  function paintWood(W, H, seed) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rng(seed);
    const lit = mix(N.wood, N.brass, 0.3), base = mix(N.wood, N.brass, 0.16), deep = mix(N.wood, N.shadow, 0.42), pale = mix(N.wood, N.flame, 0.34);
    const planks = [];
    for (let x = 0; x < W;) { let pw = Math.round(150 + r() * 120); if (W - x - pw < 110) pw = W - x; planks.push({ x, w: pw }); x += pw; }
    const wave = (k) => { const hs = [1, 2, 3, 5, 7].map((n) => [n, (r() * 2 - 1) * k / n, r() * TAU]); return (y) => { let s = 0; for (const [n, a, p] of hs) s += a * Math.sin(TAU * n * y / H + p); return s; }; };
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
      const knots = [];
      if (r() < 0.55) { knots.push({ x: pl.x + pl.w * (0.2 + r() * 0.6), y: H * (0.14 + r() * 0.72), r: 6 + r() * 9 }); if (r() < 0.3) knots.push({ x: pl.x + pl.w * (0.2 + r() * 0.6), y: H * (0.14 + r() * 0.72), r: 4 + r() * 6 }); }
      const bend = (x, y) => { let d = 0; for (const k of knots) { const dx = x - k.x, dy = y - k.y; d += Math.sign(dx || 1) * k.r * 2.2 * Math.exp(-(dy * dy) / (2 * (k.r * 3.2) ** 2)) * Math.exp(-Math.abs(dx) / (k.r * 2.5)); } return d; };
      const shared = wave(5 + r() * 9), n = Math.round(pl.w / 2.4);
      for (let i = 0; i < n; i++) {
        const x0 = pl.x + (i + r() * 0.8) * pl.w / n, own = wave(1.5 + r() * 2.5), late = r() < 0.16;
        g.strokeStyle = rgba(late ? deep : mix(deep, base, 0.4), late ? 0.15 + r() * 0.12 : 0.04 + r() * 0.08);
        g.lineWidth = late ? 1 + r() * 1.2 : 0.5 + r() * 0.7;
        g.beginPath();
        for (let y = 0; y <= H; y += 6) { const x = x0 + shared(y) + own(y), xx = x + bend(x, y); if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y); }
        g.stroke();
      }
      if (r() < 0.5) {
        const cx = pl.x + pl.w * (0.35 + r() * 0.3), ya = H * (0.12 + r() * 0.3), gap = 9 + r() * 6, cc = 0.012 * (0.8 + r() * 0.6);
        for (let j = 1; j < 14; j++) {
          g.strokeStyle = rgba(deep, 0.05 + r() * 0.08); g.lineWidth = 0.6 + r() * 0.8; g.beginPath();
          for (let x = pl.x - 2, first = true; x <= pl.x + pl.w + 2; x += 3, first = false) { const dx = x - cx, y = ya + j * gap + dx * dx * cc / j + shared(ya); if (first) g.moveTo(x, y); else g.lineTo(x, y); }
          g.stroke();
        }
      }
      for (const k of knots) {
        for (let j = 0; j < 7; j++) { g.strokeStyle = rgba(deep, 0.2 - j * 0.022); g.lineWidth = j === 0 ? 2.2 : 1; g.beginPath(); g.ellipse(k.x, k.y, k.r * 0.55 + j * 2.2, k.r * 0.9 + j * 4.2, 0, 0, TAU); g.stroke(); }
        g.fillStyle = rgba(deep, 0.6); g.beginPath(); g.ellipse(k.x, k.y, k.r * 0.45, k.r * 0.7, 0, 0, TAU); g.fill();
      }
      g.fillStyle = rgba(deep, 0.12);
      for (let i = 0, m = pl.w * H / 900; i < m; i++) g.fillRect(pl.x + r() * pl.w, r() * H, 0.8, 2 + r() * 5);
      if (r() < 0.45) { const yj = H * (0.1 + r() * 0.8); g.fillStyle = rgba(N.shadow, 0.65); g.fillRect(pl.x, yj, pl.w, 1.6); g.fillStyle = rgba(pale, 0.12); g.fillRect(pl.x, yj + 1.6, pl.w, 1); }
      g.restore();
      g.fillStyle = rgba(N.shadow, 0.75); g.fillRect(pl.x + pl.w - 1.6, 0, 1.6, H);
      g.fillStyle = rgba(pale, 0.1); g.fillRect(pl.x, 0, 1, H);
    }
    for (let i = 0; i < 90; i++) { const x = r() * W, y = H * (0.03 + r() * 0.94), a = r() * TAU, l = 10 + r() * 70; g.strokeStyle = rgba(pale, 0.03 + r() * 0.05); g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    return c;
  }

  // lime plaster for the wall: fine tooth and slow trowel marks, tiling
  function paintPlaster(S, seed) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = rng(seed);
    const base = mix(N['ground-raised'], N.ground, 0.28);
    g.fillStyle = rgba(base); g.fillRect(0, 0, S, S);
    const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };
    for (let i = 0; i < 18; i++) {
      const x = r() * S, y = r() * S, rad = 30 + r() * 90, col = r() < 0.5 ? N.shadow : mix(base, N.ink, 0.25), a = 0.03 + r() * 0.04;
      wrap((ox, oy) => { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); });
    }
    for (let i = 0; i < 2600; i++) { const x = r() * S, y = r() * S; g.fillStyle = rgba(r() < 0.5 ? N.shadow : mix(base, N.ink, 0.3), 0.05 + r() * 0.07); g.fillRect(x, y, 1 + r(), 1 + r()); }
    return c;
  }

  // ink blots: an uneven edge and a few droplets thrown just ahead of it. Each comes as a mask (where
  // ink has reached) and as a bloom (the wet ink itself, darker where it pools at its edge), the same
  // shape. `reach` is the blot's narrowest radius as a share of its size, so a sheet can size its one
  // drop to cover it corner to corner.
  async function makeBlots() {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const S = 384, r = rng(4100 + k * 77);
      const harm = []; for (let n = 2; n < 40; n++) harm.push([n, (r() * 2 - 1) * 0.22 / Math.pow(n, 0.9), r() * TAU]);
      const Rf = (th) => { let s = 1; for (const [n, a, p] of harm) s += a * Math.sin(n * th + p); return S * 0.34 * s; };
      let minR = Infinity; for (let i = 0; i < 720; i++) minR = Math.min(minR, Rf(i / 720 * TAU));
      const shape = (g) => { g.beginPath(); for (let i = 0; i <= 360; i++) { const th = i / 360 * TAU, rr = Rf(th); if (i) g.lineTo(S / 2 + Math.cos(th) * rr, S / 2 + Math.sin(th) * rr); else g.moveTo(S / 2 + Math.cos(th) * rr, S / 2 + Math.sin(th) * rr); } g.closePath(); };
      const splash = []; for (let i = 0; i < 4; i++) { const th = r() * TAU, d = Rf(th) + S * (0.008 + r() * 0.016); splash.push([S / 2 + Math.cos(th) * d, S / 2 + Math.sin(th) * d, S * (0.0018 + r() * 0.0032)]); }
      const m = document.createElement('canvas'); m.width = m.height = S; const gm = m.getContext('2d');
      gm.filter = 'blur(2px)'; gm.fillStyle = '#000'; shape(gm); gm.fill(); for (const [x, y, rr] of splash) { gm.beginPath(); gm.arc(x, y, rr, 0, TAU); gm.fill(); }
      const b = document.createElement('canvas'); b.width = b.height = S; const gb = b.getContext('2d');
      gb.save(); shape(gb); gb.clip();
      const gr = gb.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
      gr.addColorStop(0, rgba(F.ink, 0.08)); gr.addColorStop(0.6, rgba(F.ink, 0.2)); gr.addColorStop(0.8, rgba(F.ink, 0.6)); gr.addColorStop(0.92, rgba(F.ink, 0.85)); gr.addColorStop(1, rgba(F.ink, 0.9));
      gb.fillStyle = gr; gb.fillRect(0, 0, S, S);
      gb.filter = 'blur(1.5px)'; gb.lineWidth = 6; gb.strokeStyle = rgba(F.ink, 0.7); shape(gb); gb.stroke();
      gb.restore(); gb.filter = 'none';
      gb.fillStyle = rgba(F.ink, 0.8); for (const [x, y, rr] of splash) { gb.beginPath(); gb.arc(x, y, rr, 0, TAU); gb.fill(); }
      out.push({ mask: await toURL(m, 'image/png'), bloom: await toURL(b, 'image/png'), reach: minR / S });
    }
    return out;
  }
  let blotReach = [0.2, 0.2, 0.2];

  // paper: a canvas behind each sheet. Deckled edges (torn on one side for some), slow mottling,
  // tooth, fibres, age darkening towards the edges, foxing, and for the map its folds.
  const noiseTile = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const img = g.createImageData(128, 128), r = rng(5), dk = F.shadow, lt = F['ground-raised'];
    for (let i = 0; i < img.data.length; i += 4) { const v = r(), col = v < 0.5 ? dk : lt; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = Math.round(Math.abs(v - 0.5) * 2 * 30); }
    g.putImageData(img, 0, 0); return c;
  })();
  function paintPaper(sheet) {
    const w = Math.round(sheet.offsetWidth), h = Math.round(sheet.offsetHeight);
    if (!w || !h) return;
    const had = sheet._paper;
    if (had && had.w === w && had.h === h) return;
    const kind = sheet.dataset.paper || 'sheet', torn = sheet.dataset.torn || '', r = rng(hashStr(sheet.id || kind));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const c = had ? had.c : document.createElement('canvas');
    c.className = 'paper'; c.setAttribute('aria-hidden', 'true');
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const amp = { card: 1.1, sheet: 1.5, map: 1.3, slip: 2 }[kind] || 1.4;
    const edge = [];
    const side = (x0, y0, x1, y1, nx, ny, key) => {
      const L = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(2, Math.round(L / 4));
      let drift = 0;
      for (let i = 0; i < steps; i++) {
        const t = i / steps; drift = drift * 0.82 + (r() - 0.5) * 0.9;
        let d = amp * (1 + drift * 0.7 + r() * 0.5);
        if (torn === key) d = 3 + Math.abs(drift) * 7 + r() * 3.5;
        else if (r() < 0.012) d += 2 + r() * 3;
        edge.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
      }
    };
    side(0, 0, w, 0, 0, 1, 't'); side(w, 0, w, h, -1, 0, 'r'); side(w, h, 0, h, 0, -1, 'b'); side(0, h, 0, 0, 1, 0, 'l');
    const outline = () => { g.beginPath(); edge.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const base = kind === 'card' ? F['ground-raised'] : kind === 'slip' ? mix(F.ground, F.brass, 0.07) : kind === 'map' ? mix(F.ground, F.brass, 0.035) : F.ground;
    const toast = mix(F.brass, F.shadow, 0.3);
    g.clearRect(0, 0, w, h);
    outline(); g.fillStyle = rgba(base); g.fill();
    g.save(); outline(); g.clip();
    for (let i = 0; i < 14; i++) {
      const x = r() * w, y = r() * h, rad = (0.15 + r() * 0.45) * Math.max(w, h), col = r() < 0.55 ? mix(base, F.brass, 0.5) : mix(base, F['ground-raised'], 0.9);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(col, 0.05 + r() * 0.06)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    g.fillStyle = g.createPattern(noiseTile, 'repeat'); g.fillRect(0, 0, w, h);
    // fibres, stroked in a few batches (one path per shade) so a big sheet costs a few strokes
    g.lineWidth = 0.5;
    for (const [col, a] of [[F.shadow, 0.03], [F.shadow, 0.06], [F['ground-raised'], 0.04], [F['ground-raised'], 0.075]]) {
      g.strokeStyle = rgba(col, a); g.beginPath();
      for (let i = 0, n = w * h / 2200; i < n; i++) {
        const x = r() * w, y = r() * h, an = r() * TAU, l = 2 + r() * 9;
        g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(an + 0.6) * l * 0.5, y + Math.sin(an + 0.6) * l * 0.5, x + Math.cos(an) * l, y + Math.sin(an) * l);
      }
      g.stroke();
    }
    if (kind === 'map') {
      [[0, 0, 0.03], [w / 2, 0, -0.02], [0, h / 2, -0.035], [w / 2, h / 2, 0.015]].forEach(([x, y, t]) => { g.fillStyle = rgba(t > 0 ? F['ground-raised'] : F.shadow, Math.abs(t)); g.fillRect(x, y, w / 2, h / 2); });
    }
    for (const [lw, a] of [[48, 0.045], [22, 0.06], [9, 0.08], [3, 0.12]]) { outline(); g.lineWidth = lw; g.strokeStyle = rgba(toast, a); g.stroke(); }
    for (let i = 0, n = 6 + r() * 12; i < n; i++) {
      const edgey = r() < 0.6, x = edgey ? (r() < 0.5 ? r() * 40 : w - r() * 40) : r() * w, y = r() * h;
      g.fillStyle = rgba(toast, 0.08 + r() * 0.12); g.beginPath(); g.arc(x, y, 0.6 + r() * 2.6, 0, TAU); g.fill();
    }
    g.restore();
    if (!had) { sheet.prepend(c); sheet.classList.add('has-paper'); }
    // the blank copy that lies over the drawing until the ink reaches it
    let cover = had && had.cover;
    if (sheet.hasAttribute('data-ink') && !sheet.classList.contains('is-dry')) {
      if (!cover) { cover = document.createElement('canvas'); cover.className = 'cover'; cover.setAttribute('aria-hidden', 'true'); sheet.appendChild(cover); }
      cover.width = c.width; cover.height = c.height; cover.getContext('2d').drawImage(c, 0, 0);
    }
    sheet._paper = { c, w, h, cover };
  }

  // ================================================================ 7. The room, the lamp, the thread
  const view = $('view'), stage = $('top'), rig = $('rig'), wall = $('wall'), plane = $('plane');
  const sky = $('sky'), desk = $('desk'), lampUnder = $('lamp-under'), lampOver = $('lamp-over'), closing = $('closing');
  const chapters = [...document.querySelectorAll('.chapter')];
  const BASE = 0.848;   // where the lantern's foot is, as a fraction of its height
  let G = null;
  // Where the browser can, the camera is a scroll-driven animation: the compositor moves it with the
  // scroll itself, so it never waits for this script and never lags. Elsewhere the script moves it.
  const scrollLinked = !still && typeof ViewTimeline === 'function' && typeof ScrollTimeline === 'function';

  // The camera. It starts at the window, close enough that the frame is out of sight, pulls back into
  // the room, holds on the window, then rises and tilts down over the desk until it looks straight
  // down; for the last stretch it glides back at the speed of the scroll, so the page takes over
  // without a seam. Distances are in px; the desk is the plane z = 0, the wall stands at its far edge.
  function geometry() {
    const V = view.clientHeight, W = view.clientWidth, phone = W < 760;
    const P = Math.round(V * 0.95);
    let winW = Math.min(0.45 * V, 0.72 * W), winH = winW * 635 / 460;
    if (winH > 0.62 * V) { winH = 0.62 * V; winW = winH * 460 / 635; }
    const Hw = 0.12 * V + winH / 2;
    const D0 = P / Math.max(1.15 * W / winW, 1.1 * V / (winH * 0.62));
    const range = Math.max(1, stage.offsetHeight - V);
    const p1 = 0.86, Dmin = 0.56 * V, Dend = Dmin + range * (1 - p1) / 2;
    const E = Math.max(0, Dend - V / 2);
    const lw = phone ? 82 : Math.round(clamp(W * 0.1, 104, 160));
    const g = { V, W, P, winW, winH, Hw, D0, range, p1, Dmin, E, lw, R: Math.round(Math.max(W, V) * 1.08), S0: { x: W * (phone ? 0.2 : 0.17), y: (still ? 0 : E) + V * (phone ? 0.3 : 0.27) }, Y0: -V / 2 - E, phone };
    // the desk and the wall are drawn just big enough for everything the camera ever sees of them
    const k = reach(g);
    g.M = Math.ceil(k.dx - W / 2 + 32); g.planeH = Math.ceil(k.dy + 32);
    g.Ww = Math.ceil(2 * k.wx + 64); g.Hw2 = Math.ceil(k.wh + 40);
    return g;
  }
  function cam(p, g = G) {
    let D;
    if (p < 0.3) D = lerp(g.D0, g.P, smooth(p / 0.3));
    else if (p < 0.36) D = g.P;
    else if (p < g.p1) D = lerp(g.P, g.Dmin, smooth((p - 0.36) / (g.p1 - 0.36)));
    else D = g.Dmin + g.range * (p - g.p1) * (p - g.p1) / (2 * (1 - g.p1));
    return { D, H: lerp(g.Hw, g.P, seg(p, 0.35, g.p1)), phi: 90 * (1 - seg(p, 0.36, g.p1)) };
  }
  // Cast rays through the edges of the screen at every point of the move: how far across and along
  // the desk they land, and how wide and high up the wall (once it has faded in).
  function reach(g) {
    let dx = g.W / 2, dy = g.E + g.V, wx = g.W / 2, wh = g.Hw + g.V / 2;
    const edge = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16 - 0.5; edge.push([t * g.W, -g.V / 2], [t * g.W, g.V / 2], [-g.W / 2, t * g.V], [g.W / 2, t * g.V]); }
    for (let i = 0; i <= 120; i++) {
      const p = i / 120, c = cam(p, g), sn = Math.sin(c.phi * RAD), cs = Math.cos(c.phi * RAD);
      for (const [sx, sy] of edge) {
        const ry = sy * cs - g.P * sn, rz = -sy * sn - g.P * cs;   // the ray, in the room
        const tw = ry < 0 ? -c.D / ry : Infinity, td = rz < 0 ? -c.H / rz : Infinity;
        if (tw < td) { if (p >= 0.05) { wx = Math.max(wx, Math.abs(tw * sx)); wh = Math.max(wh, c.H + tw * rz); } }
        else if (td < Infinity) { dx = Math.max(dx, Math.abs(td * sx)); dy = Math.max(dy, c.D + td * ry); }
      }
    }
    return { dx, dy, wx, wh };
  }

  // What the camera does at a point of the opening: the room, the sky behind the window, the words
  // fading, the wall fading in, the lantern standing up off the desk.
  function camState(p) {
    const c = cam(p), h = 1 - seg(p, 0.03, 0.2), turn = (90 - c.phi) * RAD;
    // The sky and the land are far away: the camera's travel doesn't move them, only where it looks.
    // As it rises above the window and tilts down, the window looks down onto the desert: what shows
    // in the window's middle is the row as far below the horizon as the window is below the camera.
    const dip = Math.atan(Math.max(0, c.H - G.Hw) / c.D);
    return {
      rig: `translateZ(${G.P}px) rotateX(${c.phi.toFixed(3)}deg) translate3d(0px, ${(-(G.Y0 + c.D)).toFixed(2)}px, ${(-c.H).toFixed(2)}px)`,
      heroO: +h.toFixed(4), heroT: `translateY(${(-70 * (1 - h)).toFixed(1)}px)`,
      wall: +seg(p, 0.05, 0.18).toFixed(4),
      sky: `translateY(${(G.P * (Math.tan(dip - turn) - Math.tan(dip))).toFixed(1)}px) scale(${lerp(1.04, 1, smooth(p / 0.3)).toFixed(4)})`,
      copy: `translate3d(0px, 0px, 0.5px) rotateX(${(-c.phi).toFixed(3)}deg)`,
    };
  }
  // The same, as scroll-driven animations: the opening sampled finely, the browser runs between.
  let camAnims = [], camKey = '';
  function buildCamera() {
    const key = [G.W, G.V, G.range, G.E].join();
    if (key === camKey) return; camKey = key;
    camAnims.forEach((a) => a.cancel()); camAnims = [];
    const ps = [...new Set([...Array(201).keys()].map((i) => i / 200).concat([0.03, 0.05, 0.08, 0.18, 0.2, 0.3, 0.35, 0.36, G.p1]))].sort((a, b) => a - b);
    const st = ps.map(camState);
    const opts = { timeline: new ViewTimeline({ subject: stage, axis: 'block' }), rangeStart: 'contain 0%', rangeEnd: 'contain 100%', fill: 'both', easing: 'linear' };
    const add = (node, fn) => camAnims.push(node.animate(ps.map((p, i) => ({ offset: p, ...fn(st[i]) })), opts));
    add(rig, (s) => ({ transform: s.rig }));
    add(heroEl, (s) => ({ opacity: s.heroO, transform: s.heroT }));
    add(wall, (s) => ({ opacity: s.wall }));
    add(sky, (s) => ({ transform: s.sky }));
    add(lanternCopy, (s) => ({ transform: s.copy }));
  }

  // ---- the room, painted into canvases ----
  // The wall, the top of the desk and the standing lantern are turned in 3D by the camera. Chrome
  // redraws an SVG or a gradient each time its size on screen changes, which in a camera move is every
  // frame; a canvas it only moves. So each is painted once into a canvas, and again only on resize.
  const A = {};   // what the painting waits for: plaster, wood, the desk's things, the lantern, the dial, the Kufic face
  const keys = {};
  const scaleFor = (w, h) => Math.min(Math.min(window.devicePixelRatio || 1, 2), 8192 / w, 8192 / h);
  const toPath = (d) => (typeof d === 'string' ? new Path2D(d) : d);
  const fillP = (c, d, col) => { c.fillStyle = col; c.fill(toPath(d)); };
  const strokeP = (c, d, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.stroke(toPath(d)); };
  const tok = (n) => parseFloat(getComputedStyle(root).getPropertyValue('--' + n)) || 0;
  let roomQueued = false;
  function paintRoomSoon() { if (roomQueued || still || wallpaper) return; roomQueued = true; setTimeout(() => { roomQueued = false; paintRoom(); }, 0); }
  function paintRoom() {
    const g = G; if (!g || still) return;
    const geo = [g.W, g.V, g.E, g.M, g.planeH, g.Ww, g.Hw2].join();
    const once = (name, deps, fn) => { const k = geo + deps.map((d) => !!A[d]).join(); if (keys[name] !== k) { keys[name] = k; fn(g); } };
    once('wall', ['plaster', 'dial', 'kufi'], paintWall);
    once('plane', ['wood', 'props'], paintPlane);
    once('copy', ['lantern'], paintCopy);
  }
  function ready(name, value) { if (value) { A[name] = value; paintRoomSoon(); } }

  // An inline SVG as a picture a canvas can draw: each element's computed style written onto it, and
  // the page's gradients and clips that it uses copied in. pad widens the view for what overhangs it.
  const SVG_STYLE = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'stop-color', 'stop-opacity'];
  function inlineStyle(src, dst, refs) {
    const a = [src, ...src.querySelectorAll('*')], b = [dst, ...dst.querySelectorAll('*')];
    a.forEach((n, i) => {
      const cs = getComputedStyle(n);
      let st = '';
      for (const p of SVG_STYLE) {
        const v = cs.getPropertyValue(p).replace(/url\((["']?)[^"')]*#([^"')]+)\1\)/g, (m, q, id) => { refs.add(id); return `url(#${id})`; });
        if (v) st += `${p}:${v};`;
      }
      const cp = n.getAttribute('clip-path'); if (cp) { const m = /#([^"')]+)/.exec(cp); if (m) refs.add(m[1]); }
      b[i].setAttribute('style', st); b[i].removeAttribute('class');
    });
  }
  function svgPicture(svg, pad = 0) {
    const clone = svg.cloneNode(true), refs = new Set(), done = new Set(), dfs = document.createElementNS(NS, 'defs');
    inlineStyle(svg, clone, refs);
    const copy = (id) => { if (done.has(id)) return; done.add(id); const n = document.getElementById(id); if (!n || svg.contains(n)) return; const c = n.cloneNode(true), more = new Set(); inlineStyle(n, c, more); dfs.appendChild(c); more.forEach(copy); };
    [...refs].forEach(copy);
    clone.insertBefore(dfs, clone.firstChild);
    const vb = svg.viewBox.baseVal, w = vb.width * (1 + 2 * pad), h = vb.height * (1 + 2 * pad);
    clone.setAttribute('viewBox', `${vb.x - pad * vb.width} ${vb.y - pad * vb.height} ${w} ${h}`);
    clone.setAttribute('width', w); clone.setAttribute('height', h); clone.setAttribute('xmlns', NS);
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    return img.decode().then(() => ({ img, pad }), () => null);
  }
  const drawPicture = (c, pic, x, y, w, h) => c.drawImage(pic.img, x - pic.pad * w, y - pic.pad * h, w * (1 + 2 * pic.pad), h * (1 + 2 * pic.pad));

  // the keel arch of the window, in its own units (460 wide, 635 tall), offset outward by d; scaled
  // and moved it makes the niche too
  const keel = (d, close = true, x0 = 0, y0 = 0, sx = 1, sy = 1) => {
    const X = (x) => n1(x0 + x * sx), Y = (y) => n1(y0 + y * sy);
    return `M${X(-d)} ${Y(635)}L${X(-d)} ${Y(238)}C${X(-d)} ${Y(128 - 0.53 * d)} ${X(118 - 0.68 * d)} ${Y(62 - 0.79 * d)} ${X(230)} ${Y(-1.16 * d)}C${X(342 + 0.68 * d)} ${Y(62 - 0.79 * d)} ${X(460 + d)} ${Y(128 - 0.53 * d)} ${X(460 + d)} ${Y(238)}L${X(460 + d)} ${Y(635)}${close ? 'Z' : ''}`;
  };
  // the khatam band's tile, from the pattern in landing.html
  function khatamTile(s) {
    const t = document.createElement('canvas'), n = Math.max(1, Math.round(48 * s)); t.width = t.height = n;
    const g = t.getContext('2d'); g.setTransform(n / 96, 0, 0, n / 96, 0, 0);
    g.strokeStyle = rgba(N.brass); g.lineWidth = 0.8;
    document.querySelectorAll('#khatam-band polygon').forEach((pg) => { g.stroke(new Path2D('M' + pg.getAttribute('points').trim().replace(/\s+/g, ' L') + 'Z')); });
    return t;
  }

  // The wall: lime plaster round a Fatimid keel arch in a khatam band, a Kufic inscription above it,
  // and the things of an astronomer's room on it. Lit from below by the lantern on the desk, falling
  // into dark above.
  function paintWall(g) {
    const Ww = g.Ww, Hh = g.Hw2, s = scaleFor(Ww, Hh);
    wall.width = Math.round(Ww * s); wall.height = Math.round(Hh * s);
    const c = wall.getContext('2d');
    const f = g.winW / 460, ox = Ww / 2 - g.winW / 2, oy = Hh - g.Hw - g.winH / 2, u = 1 / f;
    const px = () => c.setTransform(s, 0, 0, s, 0, 0), un = () => c.setTransform(s * f, 0, 0, s * f, s * ox, s * oy);
    const box = { L: -ox / f, T: -oy / f, R: (Ww - ox) / f, B: (Hh - oy) / f, u };   // the wall's edges in window units
    px(); c.clearRect(0, 0, Ww, Hh);
    c.fillStyle = A.plaster ? c.createPattern(A.plaster, 'repeat') : rgba(mix(N.ground, N['ground-raised'], 0.72));
    c.fillRect(0, 0, Ww, Hh);
    un(); wallThings(c, box);
    // the khatam band round the window and its rules
    c.save(); c.clip(new Path2D(keel(38) + keel(0)), 'evenodd'); px();
    const pat = c.createPattern(khatamTile(s), 'repeat'); pat.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, 0, 0]));
    c.globalAlpha = 0.55; c.fillStyle = pat; c.fillRect(0, 0, Ww, Hh); c.restore(); un();
    strokeP(c, keel(38, false), rgba(N.brass), 1.4 * u); strokeP(c, keel(44, false), rgba(N.rule), u);
    // the dial on its cord
    c.beginPath(); c.moveTo(640, 150); c.lineTo(640, 246); c.strokeStyle = rgba(N.brass); c.lineWidth = u; c.stroke();
    c.beginPath(); c.arc(640, 150, 3.2 * u, 0, TAU); c.fillStyle = rgba(N.brass); c.fill();
    if (A.dial) { c.save(); c.translate(640, 296); c.rotate(-4 * RAD); c.drawImage(A.dial, -56, -56, 112, 112); c.restore(); }
    // lamplight from the desk below, dark above, and the shadow at the foot of the wall
    px();
    const lx = Ww / 2 + g.S0.x - g.W / 2;
    const radial = (cx, cy, r, col, stops) => { const gr = c.createRadialGradient(cx, cy, 0, cx, cy, r); stops.forEach(([o, a]) => gr.addColorStop(o, rgba(col, a))); c.fillStyle = gr; c.fillRect(0, 0, Ww, Hh); };
    radial(lx, Hh, g.V * 0.95, N.flame, [[0, 0.28], [0.35, 0.09], [0.7, 0], [1, 0]]);
    radial(lx, Hh + g.V * 0.15, g.V * 1.6, N.shadow, [[0, 0], [0.28, 0.16], [0.6, 0.52], [1, 0.8]]);
    const fg = c.createLinearGradient(0, Hh, 0, Hh - g.V * 0.12); fg.addColorStop(0, rgba(N.shadow, 0.7)); fg.addColorStop(1, rgba(N.shadow, 0));
    c.fillStyle = fg; c.fillRect(0, Hh - g.V * 0.12, Ww, g.V * 0.12);
    // the window: cut out (the sky is behind), dark round its inside where the wall is thick
    un();
    const win = new Path2D(keel(-0.7 * u));
    c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill(win); c.restore();
    c.save(); c.clip(win); for (const [w, a] of [[48, 0.22], [26, 0.28], [10, 0.4]]) strokeP(c, keel(0), rgba(N.shadow, a), w); c.restore();
    strokeP(c, keel(0, false), rgba(N.brass, 0.9), 1.4 * u);
    // the sill
    c.fillStyle = rgba(mix(N['ground-raised'], N.brass, 0.086), 0.93); c.fillRect(-70, 632, 600, 20);
    c.beginPath(); c.moveTo(-70, 632); c.lineTo(530, 632); c.strokeStyle = rgba(N.brass); c.lineWidth = 1.2 * u; c.stroke();
    const sg = c.createLinearGradient(0, 652, 0, 686); sg.addColorStop(0, rgba(N.shadow, 0.6)); sg.addColorStop(1, rgba(N.shadow, 0));
    c.fillStyle = sg; c.fillRect(-70, 652, 600, 34);
  }

  // The house of Ibn Yunus: what hangs on and stands against the wall, in window units (the window is
  // x 0 to 460, y 0 to 635; the desk meets the wall at box.B). Drawn like the desk's things: flat
  // colour, ink outline, light from the lantern below and to the left.
  function wallThings(c, { L, T, R, B, u }) {
    const plaster = mix(N['ground-raised'], N.ground, 0.28);
    const hi = mix(plaster, N.ink, 0.16), lit = mix(plaster, N.flame, 0.3), ol = rgba(N.shadow, 0.85);
    const brass = mix(N.brass, N.shadow, 0.28), brassL = mix(N.brass, N.flame, 0.3), brassD = mix(N.brass, N.shadow, 0.6);
    const wood = mix(N.wood, N.brass, 0.14), woodL = mix(N.wood, N.brass, 0.38), woodD = mix(N.wood, N.shadow, 0.45);
    const r = rng(1009);
    const line = (pts, col, w) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
    const nail = (x, y) => { c.beginPath(); c.arc(x + 1.2, y + 1.6, 3.4 * u, 0, TAU); c.fillStyle = rgba(N.shadow, 0.6); c.fill(); c.beginPath(); c.arc(x, y, 3.2 * u, 0, TAU); c.fillStyle = rgba(brassL); c.fill(); };
    const vgrad = (y0, y1, stops) => { const gr = c.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };

    // -- the dado: a moulded rail at the height of the sill, a darker band of plaster below it --
    c.fillStyle = rgba(N.shadow, 0.13); c.fillRect(L, 668, R - L, B - 668);
    line([[L, 661], [R, 661]], rgba(hi, 0.5), 1.4 * u); line([[L, 668], [R, 668]], rgba(N.shadow, 0.55), 1.4 * u);
    line([[L, 674], [R, 674]], rgba(N.shadow, 0.2), u);

    // -- the inscription: carved stucco, the zij's title in Kufic, rosettes along the band --
    const fy0 = -172, fy1 = -98, fm = (fy0 + fy1) / 2;
    c.fillStyle = rgba(N.shadow, 0.14); c.fillRect(L, fy0, R - L, fy1 - fy0);
    for (const [y, col, w] of [[fy0, rgba(N.brass, 0.5), 1.2 * u], [fy1, rgba(N.brass, 0.5), 1.2 * u], [fy0 + 8, rgba(N.rule, 0.9), u], [fy1 - 8, rgba(N.rule, 0.9), u]]) line([[L, y], [R, y]], col, w);
    const title = 'الزيج الحاكمي الكبير';
    c.save(); c.font = `700 42px "Reem Kufi", Amiri, serif`; c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(title).width;
    c.fillStyle = rgba(N.shadow, 0.8); c.fillText(title, 230, fm - 2);                   // the cut, in shadow above (the light is below)
    c.fillStyle = rgba(mix(plaster, N.flame, 0.5), 0.85); c.fillText(title, 230, fm + 1.6); // the lit lower edge
    c.fillStyle = rgba(mix(plaster, N.ink, 0.34)); c.fillText(title, 230, fm + 0.2);      // the face
    c.restore();
    const star = (x, y, rr) => { const p = new Path2D(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU - Math.PI / 2, q = k % 2 ? rr * 0.58 : rr; k ? p.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : p.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } p.closePath(); return p; };
    for (const dir of [-1, 1]) {
      let x = 230 + dir * (tw / 2 + 64);
      line([[230 + dir * (tw / 2 + 26), fm], [dir < 0 ? L : R, fm]], rgba(N.brass, 0.22), u);
      for (; dir < 0 ? x > L - 40 : x < R + 40; x += dir * 104) {
        const p = star(x, fm, 19);
        c.save(); c.translate(0, 1.4); fillP(c, p, rgba(N.shadow, 0.5)); c.restore();
        fillP(c, p, rgba(plaster)); strokeP(c, p, rgba(N.brass, 0.55), 1.1 * u);
        c.beginPath(); c.arc(x, fm, 5, 0, TAU); c.fillStyle = rgba(N.brass, 0.45); c.fill();
      }
    }

    // -- cracks in the plaster, from the corners of the window, and where the wall settled --
    const crack = (x, y, a, n, seed) => {
      const q = rng(seed), pts = [[x, y]];
      for (let i = 0; i < n; i++) { a += (q() - 0.5) * 0.9; x += Math.cos(a) * (8 + q() * 12); y += Math.sin(a) * (8 + q() * 12); pts.push([x, y]); if (q() < 0.16) line([[x, y], [x + Math.cos(a + 1) * 22, y + Math.sin(a + 1) * 22], [x + Math.cos(a + 1.3) * 34, y + Math.sin(a + 1.4) * 38]], rgba(N.shadow, 0.35), 0.8 * u); }
      c.save(); c.translate(0, 1.2 * u); line(pts, rgba(lit, 0.16), 0.9 * u); c.restore();
      line(pts, rgba(N.shadow, 0.55), 1 * u);
    };
    crack(506, 646, 0.9, 9, 3); crack(-46, 96, -2.4, 10, 7); crack(1140, 610, -2.2, 6, 11); crack(-620, 520, 1.1, 7, 13);

    // -- where the plaster has come away and the mud brick shows --
    (() => {
      const cx = 612, cy = 590, q = rng(17), blob = new Path2D();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, rr = (i % 24 ? 1 : 1) * (40 + q() * 14) * (1 + 0.25 * Math.cos(a)); const x = cx + Math.cos(a) * rr * 1.25, y = cy + Math.sin(a) * rr * 0.6; i ? blob.lineTo(x, y) : blob.moveTo(x, y); }
      blob.closePath();
      fillP(c, blob, rgba(mix(N.wood, N.shadow, 0.35)));
      c.save(); c.clip(blob);
      for (let y = cy - 40, row = 0; y < cy + 40; y += 13, row++) { line([[cx - 80, y], [cx + 80, y]], rgba(N.shadow, 0.7), 1.4 * u); for (let x = cx - 80 + (row % 2) * 16; x < cx + 80; x += 32) line([[x, y], [x, y + 13]], rgba(N.shadow, 0.6), 1.2 * u); }
      c.translate(0, -2.4); strokeP(c, blob, rgba(N.shadow, 0.6), 3 * u);
      c.restore();
      c.save(); c.translate(0, 1.6); strokeP(c, blob, rgba(hi, 0.35), 1.2 * u); c.restore();
    })();

    // -- a niche in the wall, keel-arched like the window, with a water jar and a brass cup in it --
    const nx = -404, ny = 300, nsx = 172 / 460, nsy = 300 / 635;
    const niche = new Path2D(keel(0, true, nx, ny, nsx, nsy));
    fillP(c, niche, vgrad(ny, ny + 300, [[0, rgba(N.shadow, 0.62)], [0.7, rgba(N.shadow, 0.4)], [1, rgba(N.shadow, 0.3)]]));
    c.save(); c.clip(niche); strokeP(c, keel(0, true, nx, ny, nsx, nsy), rgba(N.shadow, 0.35), 30); c.restore();
    strokeP(c, keel(14, false, nx, ny, nsx, nsy), rgba(N.brass, 0.45), 1.1 * u);
    strokeP(c, keel(22, false, nx, ny, nsx, nsy), rgba(N.rule, 0.9), u);
    // its ledge
    c.fillStyle = rgba(hi, 0.55); c.fillRect(nx - 14, ny + 296, 200, 5);
    c.fillStyle = rgba(mix(plaster, N.shadow, 0.25)); c.fillRect(nx - 14, ny + 301, 200, 11);
    c.fillStyle = vgrad(ny + 312, ny + 340, [[0, rgba(N.shadow, 0.55)], [1, rgba(N.shadow, 0)]]); c.fillRect(nx - 14, ny + 312, 200, 28);
    // a qulla, the porous clay jar that keeps Cairo's water cool
    (() => {
      const x = nx + 86, yb = ny + 296;
      const half = [[12, -146], [9, -138], [10, -122], [30, -114, 44, -92, 43, -64], [42, -34, 27, -12, 17, -8], [20, 0]];
      const p = new Path2D(); p.moveTo(x - 12, yb - 146);
      for (const s of half) s.length === 2 ? p.lineTo(x + s[0], yb + s[1]) : p.bezierCurveTo(x + s[0], yb + s[1], x + s[2], yb + s[3], x + s[4], yb + s[5]);
      p.lineTo(x - 20, yb);
      for (const s of [[-17, -8], [-27, -12, -42, -34, -43, -64], [-44, -92, -30, -114, -10, -122], [-9, -138]]) s.length === 2 ? p.lineTo(x + s[0], yb + s[1]) : p.bezierCurveTo(x + s[0], yb + s[1], x + s[2], yb + s[3], x + s[4], yb + s[5]);
      p.closePath();
      c.beginPath(); c.ellipse(x + 8, yb, 48, 6, 0, 0, TAU); c.fillStyle = rgba(N.shadow, 0.55); c.fill();
      const clay = mix(mix(N.wood, N.brass, 0.5), N.rubric, 0.14);
      const gr = c.createLinearGradient(x - 44, yb - 10, x + 40, yb - 130); gr.addColorStop(0, rgba(mix(clay, N.flame, 0.22))); gr.addColorStop(0.55, rgba(clay)); gr.addColorStop(1, rgba(mix(clay, N.shadow, 0.5)));
      fillP(c, p, gr);
      c.save(); c.clip(p); for (const y of [-104, -98, -91]) { c.beginPath(); c.ellipse(x, yb + y, 40, 5, 0, 0, Math.PI); c.strokeStyle = rgba(N.shadow, 0.35); c.lineWidth = u; c.stroke(); } c.restore();
      c.beginPath(); c.ellipse(x, yb - 146, 12, 3.4, 0, 0, TAU); c.fillStyle = rgba(N.shadow, 0.9); c.fill();
      strokeP(c, p, ol, 1.1 * u);
      line([[x - 30, yb - 78], [x - 32, yb - 54], [x - 24, yb - 30]], rgba(N.flame, 0.16), 3);
    })();
    // a small brass cup beside it
    (() => {
      const x = nx + 146, yb = ny + 296, p = new Path2D(`M${x - 13} ${yb - 30} L${x - 10} ${yb - 3} Q${x} ${yb + 1} ${x + 10} ${yb - 3} L${x + 13} ${yb - 30} Z`);
      c.beginPath(); c.ellipse(x + 5, yb, 18, 3.5, 0, 0, TAU); c.fillStyle = rgba(N.shadow, 0.5); c.fill();
      const gr = c.createLinearGradient(x - 13, 0, x + 13, 0); gr.addColorStop(0, rgba(brassL)); gr.addColorStop(0.45, rgba(brass)); gr.addColorStop(1, rgba(brassD));
      fillP(c, p, gr); strokeP(c, p, ol, u);
      c.beginPath(); c.ellipse(x, yb - 30, 13, 3.2, 0, 0, TAU); c.fillStyle = rgba(brassD); c.fill(); c.strokeStyle = ol; c.stroke();
    })();

    // -- a brass quadrant hung from a nail by its corner, its plumb line falling across the scale --
    (() => {
      const ax = -520, ay = 70, rr = 140, tilt = 11 * RAD;
      nail(ax, ay - 46); line([[ax, ay - 46], [ax - 3, ay - 22], [ax, ay]], rgba(mix(N.brass, N.shadow, 0.3)), 1.2 * u);
      c.save(); c.translate(ax, ay); c.rotate(tilt);
      const plate = new Path2D(); plate.moveTo(0, 0); plate.lineTo(Math.cos(Math.PI / 4) * rr, Math.sin(Math.PI / 4) * rr); plate.arc(0, 0, rr, Math.PI / 4, Math.PI * 3 / 4); plate.closePath();
      c.save(); c.translate(4, 6); fillP(c, plate, rgba(N.shadow, 0.5)); c.restore();
      const gr = c.createLinearGradient(-60, rr, 60, 20); gr.addColorStop(0, rgba(brassL)); gr.addColorStop(0.5, rgba(brass)); gr.addColorStop(1, rgba(brassD));
      fillP(c, plate, gr);
      c.lineWidth = 0.9 * u; c.strokeStyle = rgba(brassD);
      for (const q of [134, 122, 58]) { c.beginPath(); c.arc(0, 0, q, Math.PI / 4, Math.PI * 3 / 4); c.stroke(); }
      for (let k = 0; k <= 30; k++) { const a = Math.PI / 4 + k / 30 * Math.PI / 2, l = k % 5 ? 122 : 112; c.beginPath(); c.moveTo(Math.cos(a) * l, Math.sin(a) * l); c.lineTo(Math.cos(a) * 134, Math.sin(a) * 134); c.stroke(); }
      c.strokeStyle = rgba(brassD, 0.5);   // the sine lines, parallel to both edges
      const e1 = [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)], e2 = [-e1[0], e1[1]];
      for (let k = 1; k < 6; k++) { const d = k * 20, t = Math.sqrt(122 * 122 - d * d); for (const [a, b] of [[e1, e2], [e2, e1]]) { c.beginPath(); c.moveTo(b[0] * d, b[1] * d); c.lineTo(b[0] * d + a[0] * t, b[1] * d + a[1] * t); c.stroke(); } }
      for (const d of [26, 112]) { const a = Math.PI * 3 / 4, x = Math.cos(a) * d, y = Math.sin(a) * d; c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = rgba(brassD); c.fillRect(-5, -12, 10, 12); c.strokeStyle = ol; c.strokeRect(-5, -12, 10, 12); c.restore(); }
      strokeP(c, plate, ol, 1.1 * u);
      c.restore();
      line([[ax, ay], [ax, ay + 136]], rgba(N.ink, 0.45), 0.8 * u);   // the plumb line hangs straight down
      const bob = new Path2D(`M${ax} ${ay + 134} C${ax + 6} ${ay + 140} ${ax + 6} ${ay + 150} ${ax} ${ay + 152} C${ax - 6} ${ay + 150} ${ax - 6} ${ay + 140} ${ax} ${ay + 134} Z`);
      fillP(c, bob, rgba(brassL)); strokeP(c, bob, ol, 0.8 * u);
      c.beginPath(); c.arc(ax, ay, 3 * u, 0, TAU); c.fillStyle = rgba(brassD); c.fill();
    })();

    // -- a star chart, nailed up by two corners --
    (() => {
      const x0 = 772, y0 = 118, w = 206, h = 252, q = rng(29);
      c.save(); c.translate(x0 + w / 2, y0 + h / 2); c.rotate(2.2 * RAD); c.translate(-w / 2, -h / 2);
      const sheet = new Path2D(); const edge = (ax, ay, bx, by, n) => { for (let i = 1; i <= n; i++) sheet.lineTo(ax + (bx - ax) * i / n + (q() - 0.5) * 1.6, ay + (by - ay) * i / n + (q() - 0.5) * 1.6); };
      sheet.moveTo(0, 0); edge(0, 0, w, 0, 14); edge(w, 0, w, h, 16); edge(w, h, 0, h, 14); edge(0, h, 0, 0, 16); sheet.closePath();
      c.save(); c.translate(4, 7); fillP(c, sheet, rgba(N.shadow, 0.5)); c.restore();
      const paper = mix(F.ground, N.ground, 0.42), ink = rgba(mix(F.ink, paper, 0.25), 0.8), faint = rgba(mix(F.ink, paper, 0.55), 0.5);
      fillP(c, sheet, vgrad(0, h, [[0, rgba(mix(paper, N.shadow, 0.08))], [1, rgba(mix(paper, N.flame, 0.06))]]));
      c.save(); c.clip(sheet);
      for (const [lw2, a] of [[22, 0.08], [8, 0.1]]) strokeP(c, sheet, rgba(mix(F.brass, F.shadow, 0.3), a), lw2);
      // the title, a line of writing, and the rete of the sky below it
      for (const [yy, l] of [[24, 120], [36, 84]]) { let xx = (w - l) / 2; c.strokeStyle = yy === 24 ? ink : faint; c.lineWidth = yy === 24 ? 2.2 : 1.4; c.beginPath(); while (xx < (w + l) / 2) { const seg2 = 6 + q() * 16; c.moveTo(xx, yy + (q() - 0.5) * 1.2); c.lineTo(Math.min(xx + seg2, (w + l) / 2), yy + (q() - 0.5) * 1.2); xx += seg2 + 4 + q() * 4; } c.stroke(); }
      const cx = w / 2, cy = 146, R1 = 80;
      c.lineWidth = 1.3; c.strokeStyle = ink; c.beginPath(); c.arc(cx, cy, R1, 0, TAU); c.stroke();
      c.lineWidth = 0.8; c.beginPath(); c.arc(cx, cy, R1 - 6, 0, TAU); c.stroke();
      c.strokeStyle = faint; c.beginPath(); c.arc(cx + 12, cy - 18, 58, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(cx - R1, cy); c.lineTo(cx + R1, cy); c.moveTo(cx, cy - R1); c.lineTo(cx, cy + R1); c.stroke();
      for (let k = 0; k < 72; k++) { const a = k / 72 * TAU, l = k % 6 ? 3 : 6; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R1 - 6), cy + Math.sin(a) * (R1 - 6)); c.lineTo(cx + Math.cos(a) * (R1 - 6 + l), cy + Math.sin(a) * (R1 - 6 + l)); c.strokeStyle = ink; c.lineWidth = 0.6; c.stroke(); }
      const stars = []; for (let k = 0; k < 46; k++) { const a = q() * TAU, d = Math.sqrt(q()) * (R1 - 12); stars.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.8 + Math.pow(q(), 3) * 2.6]); }
      c.strokeStyle = faint; c.lineWidth = 0.7;
      for (const fig of [[0, 5, 9, 14], [3, 11, 20, 26, 31], [7, 16, 22, 35]]) { c.beginPath(); fig.forEach((k, i) => (i ? c.lineTo(stars[k][0], stars[k][1]) : c.moveTo(stars[k][0], stars[k][1]))); c.stroke(); }
      c.fillStyle = ink; for (const [sx2, sy2, sr] of stars) { c.beginPath(); c.arc(sx2, sy2, sr, 0, TAU); c.fill(); }
      c.restore();
      strokeP(c, sheet, rgba(N.shadow, 0.5), 0.8 * u);
      c.restore();
      nail(x0 + 10, y0 + 9); nail(x0 + w - 4, y0 + 17);
    })();

    // -- a shelf on two brackets: books lying flat, a rolled sheet, a small celestial globe --
    (() => {
      const y = 470, x0 = 742, x1 = 1086;
      c.fillStyle = vgrad(y + 16, y + 60, [[0, rgba(N.shadow, 0.55)], [1, rgba(N.shadow, 0)]]); c.fillRect(x0 + 4, y + 16, x1 - x0, 44);
      for (const bx of [x0 + 40, x1 - 40]) { const p = new Path2D(`M${bx - 8} ${y + 16} L${bx + 8} ${y + 16} L${bx + 8} ${y + 26} C${bx + 8} ${y + 44} ${bx - 2} ${y + 56} ${bx - 8} ${y + 60} Z`); fillP(c, p, rgba(woodD)); strokeP(c, p, ol, u); }
      c.fillStyle = rgba(woodL); c.fillRect(x0, y - 5, x1 - x0, 5);
      c.fillStyle = rgba(wood); c.fillRect(x0, y, x1 - x0, 16);
      line([[x0, y + 6], [x1, y + 7]], rgba(woodD, 0.6), u); line([[x0 + 30, y + 11], [x1 - 20, y + 10]], rgba(woodD, 0.4), u);
      c.strokeStyle = ol; c.lineWidth = u; c.strokeRect(x0, y - 5, x1 - x0, 21);
      // the books, stacked flat as they were kept, their page edges out
      const books = [[760, 136, 17, mix(N.rubric, N.wood, 0.62)], [767, 120, 14, mix(N.wood, N.shadow, 0.25)], [772, 112, 13, mix(N.lapis, N.wood, 0.72)], [779, 96, 11, mix(N.rubric, N.wood, 0.7)]];
      let by = y - 5;
      for (const [bx, bw, bh, col] of books) {
        by -= bh;
        c.fillStyle = rgba(col); c.fillRect(bx, by, bw, bh);
        c.fillStyle = rgba(mix(mix(F.ground, N.ground, 0.45), N.flame, 0.08)); c.fillRect(bx + 3, by + 2.6, bw - 9, bh - 5.2);
        c.strokeStyle = rgba(N.shadow, 0.25); c.lineWidth = 0.5 * u; c.beginPath(); for (let k = by + 5; k < by + bh - 3; k += 2.2) { c.moveTo(bx + 3, k); c.lineTo(bx + bw - 6, k); } c.stroke();
        c.strokeStyle = ol; c.lineWidth = u; c.strokeRect(bx, by, bw, bh);
      }
      // a rolled sheet
      c.fillStyle = rgba(mix(F.ground, N.ground, 0.5)); c.fillRect(906, y - 19, 52, 14); c.beginPath(); c.ellipse(958, y - 12, 4, 7, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(958, y - 12, 2, 4, 0, 0, TAU); c.strokeStyle = rgba(N.shadow, 0.5); c.stroke();
      c.strokeStyle = ol; c.strokeRect(906, y - 19, 52, 14);
      // the globe on its stand
      const gx = 1026, gy = y - 52, gr2 = 30;
      const stand = new Path2D(`M${gx - 16} ${y - 5} L${gx + 16} ${y - 5} L${gx + 10} ${y - 12} L${gx + 4} ${y - 14} L${gx + 4} ${gy + gr2} L${gx - 4} ${gy + gr2} L${gx - 4} ${y - 14} L${gx - 10} ${y - 12} Z`);
      fillP(c, stand, rgba(brassD)); strokeP(c, stand, ol, u);
      c.beginPath(); c.arc(gx, gy, gr2 + 6, 0.15 * Math.PI, 0.85 * Math.PI, true); c.strokeStyle = rgba(brass); c.lineWidth = 3; c.stroke();
      const sph = c.createRadialGradient(gx - 10, gy + 10, 2, gx, gy, gr2 * 1.1); sph.addColorStop(0, rgba(brassL)); sph.addColorStop(0.55, rgba(brass)); sph.addColorStop(1, rgba(brassD));
      c.beginPath(); c.arc(gx, gy, gr2, 0, TAU); c.fillStyle = sph; c.fill();
      c.save(); c.beginPath(); c.arc(gx, gy, gr2, 0, TAU); c.clip();
      c.strokeStyle = rgba(brassD); c.lineWidth = 0.9 * u;
      c.beginPath(); c.ellipse(gx, gy, gr2, 9, -0.41, 0, TAU); c.stroke();
      c.beginPath(); c.ellipse(gx, gy, 12, gr2, 0, 0, TAU); c.stroke();
      c.fillStyle = rgba(mix(N.ink, N.brass, 0.4), 0.8); for (let k = 0; k < 14; k++) { c.beginPath(); c.arc(gx + (r() - 0.5) * 50, gy + (r() - 0.5) * 50, 0.7 + r(), 0, TAU); c.fill(); }
      c.restore();
      c.beginPath(); c.arc(gx, gy, gr2, 0, TAU); c.strokeStyle = ol; c.lineWidth = u; c.stroke();
    })();
  }

  // The top of the desk under the window, as the camera sees it before the page takes over: the
  // wood, the things on it and the lamp's pool, painted to match the real desk below exactly.
  function paintPlane(g) {
    const Wp = g.W + 2 * g.M, Hp = g.planeH, s = scaleFor(Wp, Hp);
    plane.width = Math.round(Wp * s); plane.height = Math.round(Hp * s);
    const c = plane.getContext('2d'); c.setTransform(s, 0, 0, s, 0, 0);
    if (A.wood) { const pat = c.createPattern(A.wood, 'repeat'); pat.setTransform(new DOMMatrix([1, 0, 0, 1, g.M, 0])); c.fillStyle = pat; }
    else c.fillStyle = rgba(mix(N.wood, N.brass, 0.2));
    c.fillRect(0, 0, Wp, Hp);
    for (const pr of A.props || []) {
      const n = pr.el, w = n.offsetWidth, h = n.offsetHeight, rot = parseFloat(getComputedStyle(n).getPropertyValue('--r')) || 0;
      c.save(); c.translate(g.M + n.offsetLeft, n.offsetTop); c.rotate(rot * RAD); drawPicture(c, pr, -w / 2, -h / 2, w, h); c.restore();
    }
    // the lamp's pool and the dark round it, as on the desk
    const sx = g.S0.x + g.M, sy = g.S0.y, L = lampStops();
    for (const stops of [L.under, L.over]) { const gr = c.createRadialGradient(sx, sy, 0, sx, sy, g.R); stops.forEach(([o, col, a]) => gr.addColorStop(o, rgba(col, a))); c.fillStyle = gr; c.fillRect(0, 0, Wp, Hp); }
    drawFoot(c, sx, sy, g.lw, s);
  }
  // The lamp's light: a pool of flame at the centre, and the room falling to dark round it; `under`
  // lies under the papers, `over` on them (paper darkens far from the lamp by at most shade-max).
  // Offsets are shares of the lamp's reach R; past it, the last colour carries on.
  function lampStops() {
    const gl = tok('glow'), vg = tok('vignette'), sm = tok('shade-max');
    return {
      under: [[0, N.flame, gl], [0.12, N.flame, gl * 0.42], [0.24, N.flame, gl * 0.12], [0.36, N.flame, 0], [0.36, N.shadow, 0], [0.5, N.shadow, vg * 0.5], [0.7, N.shadow, vg], [1, N.shadow, vg]],
      over: [[0, N.flame, 0.06], [0.24, N.flame, 0], [0.24, N.shadow, 0], [0.62, N.shadow, sm], [1, N.shadow, sm]],
    };
  }
  // The same light on the desk, under and over the papers: two canvases that the lamp carries. They
  // reach well past the screen wherever the lamp stands, and are painted small (a soft gradient needs
  // no detail) and drawn up. A CSS gradient this big would be redrawn tile by tile as the page scrolls.
  let lampKey = '';
  function paintLamp(g) {
    const key = g.R + ',' + g.V; if (key === lampKey) return; lampKey = key;
    const size = Math.ceil(2 * Math.max(2.6 * g.R, g.R + 2.4 * g.V)), q = 1400 / size, L = lampStops();
    for (const [box, stops] of [[lampUnder, L.under], [lampOver, L.over]]) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1400;
      Object.assign(cv.style, { position: 'absolute', left: -size / 2 + 'px', top: -size / 2 + 'px', width: size + 'px', height: size + 'px', maxWidth: 'none' });
      const c = cv.getContext('2d'); c.setTransform(q, 0, 0, q, 0, 0);
      const gr = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, g.R); stops.forEach(([o, col, a]) => gr.addColorStop(o, rgba(col, a)));
      c.fillStyle = gr; c.fillRect(0, 0, size, size);
      box.replaceChildren(cv);
    }
  }
  // the lantern's foot on the desk: the spokes of its frame's shadow, its glass in the polish, its
  // contact shadow (the same as .foot in landing.html)
  function drawFoot(c, x, y, lw, s) {
    const R2 = 2.3 * lw, o = document.createElement('canvas'); o.width = o.height = Math.ceil(2 * R2 * s);
    const g = o.getContext('2d'); g.setTransform(s, 0, 0, s, 0, 0);
    const cg = g.createConicGradient((12 - 90) * RAD, R2, R2), on = rgba(N.shadow, 0.2), off = rgba(N.shadow, 0);
    for (let k = 0; k < 6; k++) for (const [d, col] of [[0, off], [22, off], [27, on], [33, on], [38, off], [60, off]]) cg.addColorStop((k * 60 + d) / 360, col);
    g.fillStyle = cg; g.fillRect(0, 0, 2 * R2, 2 * R2);
    const m = g.createRadialGradient(R2, R2, 0, R2, R2, R2);
    for (const [t, a] of [[0, 0], [0.18, 0], [0.26, 1], [0.38, 1], [0.82, 0], [1, 0]]) m.addColorStop(t, `rgba(0,0,0,${a})`);
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = m; g.fillRect(0, 0, 2 * R2, 2 * R2);
    c.drawImage(o, x - R2, y - R2, 2 * R2, 2 * R2);
    const ell = (cx, cy, rx, ry, stops) => { c.save(); c.translate(cx, cy); c.scale(1, ry / rx); const gr = c.createRadialGradient(0, 0, 0, 0, 0, rx); stops.forEach(([t, col, a]) => gr.addColorStop(t, rgba(col, a))); c.fillStyle = gr; c.fillRect(-rx, -rx, 2 * rx, 2 * rx); c.restore(); };
    ell(x, y + 0.33 * lw, 0.55 * lw, 0.31 * lw, [[0, N.flame, 0.26], [0.55, N.flame, 0.07], [1, N.flame, 0]]);
    ell(x + 0.055 * lw, y + 0.03 * lw, 0.475 * lw, 0.13 * lw, [[0, N.shadow, 0.8], [1, N.shadow, 0]]);
  }
  // the lantern standing on the desk in the opening: its body, its flame and halo as canvases (the
  // flame still flickers and the halo breathes: those move the canvases, they don't redraw them)
  function paintCopy(g) {
    if (!A.lantern) return;   // its pictures aren't made yet: the SVG stands in until they are
    const lw = g.lw, s = Math.min(window.devicePixelRatio || 1, 2) * 1.6;
    const make = (w, h, draw, cls) => { const cv = document.createElement('canvas'); cv.width = Math.ceil(w * s); cv.height = Math.ceil(h * s); const x = cv.getContext('2d'); x.setTransform(s, 0, 0, s, 0, 0); draw(x, w, h); if (cls) cv.className = cls; return cv; };
    const halo = document.createElement('i'); halo.className = 'halo';
    // The halo stands up with the lantern, so its lower half would go down through the desk and be
    // cut off there in a hard line. It fades out before the foot instead (the foot is 62% of the way
    // down the halo); the pool painted on the desk lights the wood round the foot.
    halo.appendChild(make(2.6 * lw, 2.6 * lw, (x, w) => {
      const r0 = w / 2, gr = x.createRadialGradient(r0, r0, 0, r0, r0, r0); gr.addColorStop(0, rgba(N.flame, 0.34)); gr.addColorStop(0.46, rgba(N.flame, 0.09)); gr.addColorStop(1, rgba(N.flame, 0)); x.fillStyle = gr; x.fillRect(0, 0, w, w);
      const fade = x.createLinearGradient(0, 0, 0, w); fade.addColorStop(0, '#000'); fade.addColorStop(0.4, '#000'); fade.addColorStop(0.58, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalCompositeOperation = 'destination-in'; x.fillStyle = fade; x.fillRect(0, 0, w, w); x.globalCompositeOperation = 'source-over';
    }));
    const sway = document.createElement('div'); sway.className = 'sway';
    const wrap = document.createElement('div'); wrap.className = 'flame-wrap'; sway.appendChild(wrap);
    wrap.appendChild(make(lw, 1.5 * lw, (x, w, h) => drawPicture(x, A.lantern.flame, 0, 0, w, h)));
    lanternCopy.replaceChildren(halo, make(lw, 1.5 * lw, (x, w, h) => drawPicture(x, A.lantern.body, 0, 0, w, h), 'body'), sway);
    lanternCopy.classList.add('is-canvas');
  }

  function applyGeometry() {
    const g = geometry(); G = g;
    const set = (k, v) => { if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v); };
    set('--V', g.V + 'px'); set('--E', (still ? 0 : g.E) + 'px');
    set('--R', g.R + 'px'); set('--lw', g.lw + 'px'); set('--persp', g.P + 'px');
    paintLamp(g);
    if (still) return;
    Object.assign(wall.style, { width: g.Ww + 'px', height: g.Hw2 + 'px', left: -g.Ww / 2 + 'px', top: (g.Y0 - g.Hw2) + 'px' });
    Object.assign(plane.style, { width: (g.W + 2 * g.M) + 'px', height: g.planeH + 'px', left: (-g.W / 2 - g.M) + 'px', top: g.Y0 + 'px' });
    Object.assign(lanternCopy.style, { left: n1(-g.W / 2 + g.S0.x - g.lw / 2) + 'px', top: n1(g.Y0 + g.S0.y - g.lw * 1.5 * BASE) + 'px' });
    paintRoomSoon();
    if (scrollLinked) buildCamera();
  }

  // ---- the lamp: it is always on screen, standing on bare wood, never on the words ----
  // In the opening it stands where the camera set it down. On the desk it stays where it is while
  // the whole of it is in view; when it is about to leave, it is picked up and set down again on the
  // best free patch of wood on screen, ahead of the reading so it stays a while. At the closing it is
  // thrown off the desk and floats in the sky.
  // mode: -1 not set down yet, 0 at the opening spot, 1 on the desk, 2 afloat
  const lamp = { x: 0, y: 0, rot: 0, sc: 1, from: [0, 0, 0, 1], to: [0, 0], hand: null, bow: 0, sought: -1e9, t0: 0, dur: 1000, moving: false, mode: -1, dir: 1, recheck: false };
  let opening = { x: 0, y: 0 }, homes = [], regions = [-Infinity], sheets = [];
  // the lantern turns and grows about the middle of its glass, not its foot (CSS has the origin at
  // the foot): with no turn and no scale, (x, y) is where the foot stands
  const MID = BASE - 0.55;
  const lampTransform = (x, y, lift, rot = 0, sc = 1) => {
    const c = n1(G.lw * 1.5 * MID);
    return `translate3d(${n1(x - G.lw / 2)}px, ${n1(y - G.lw * 1.5 * BASE)}px, 0) translateY(${-c}px) rotate(${rot.toFixed(2)}deg) scale(${(sc * (1 + 0.08 * lift)).toFixed(3)}) translateY(${c}px)`;
  };
  function placeLamp(x, y, lift, rot = 0, sc = 1) {
    lampUnder.style.transform = lampOver.style.transform = `translate3d(${n1(x)}px, ${n1(y)}px, 0)`;
    lantern.style.transform = lampTransform(x, y, lift, rot, sc);
    lantern.style.setProperty('--lift', lift.toFixed(3));
  }
  // Once picked up on the desk, it is in hand: where it starts from moves with the view, so the
  // page scrolling on under it doesn't take it off screen while it is being carried.
  function carryTo(s, instant, inHand = false) {
    if (!s) return;
    if (instant || still) { lamp.moving = false; lamp.x = s.x; lamp.y = s.y; lamp.rot = 0; lamp.sc = 1; placeLamp(s.x, s.y, 0); castShadows(); return; }
    let fx = lamp.x, fy = lamp.y;
    const far = innerHeight * 1.3;
    if (Math.abs(s.y - fy) > far) fy = s.y - Math.sign(s.y - fy) * far;   // a long way off: start nearer, out of sight
    // the turn is unwound the short way round
    lamp.hand = inHand ? scrollY - deskTop : null;
    lamp.from = [fx, fy - (inHand ? lamp.hand : 0), ((lamp.rot % 360) + 540) % 360 - 180, lamp.sc]; lamp.to = [s.x, s.y]; lamp.t0 = performance.now();
    const d = Math.hypot(s.x - fx, s.y - fy);
    lamp.dur = clamp(d / 900, 0.8, 1.5) * 1000;
    // it is carried along a curve, never in a straight line: it sets off ahead (up or down with the
    // reading) and swings across, by a random amount (bowing back up past where it started would
    // take it under the running head)
    const turn = Math.sign((s.x - fx) * (s.y - fy)) || (Math.random() < 0.5 ? -1 : 1);
    lamp.bow = turn * (0.1 + 0.18 * Math.random()) * d;
    lamp.moving = true;
    lantern.style.setProperty('--sway', (s.x > fx ? -6 : 6) + 'deg');
    kick();
  }
  function stepLamp(now) {
    // picked up briskly, set down gently
    const t = clamp((now - lamp.t0) / lamp.dur), e = 0.5 * t * t * (3 - 2 * t) + 0.5 * (1 - Math.pow(1 - t, 3));
    const ax = lamp.from[0], ay = lamp.from[1] + (lamp.hand !== null ? scrollY - deskTop : 0), [bx, by] = lamp.to;
    const L = Math.hypot(bx - ax, by - ay) || 1, cx = (ax + bx) / 2 - (by - ay) / L * lamp.bow, cy = (ay + by) / 2 + (bx - ax) / L * lamp.bow;
    lamp.x = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * cx + e * e * bx; lamp.y = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * cy + e * e * by;
    lamp.rot = lerp(lamp.from[2], 0, e); lamp.sc = lerp(lamp.from[3], 1, e);
    placeLamp(lamp.x, lamp.y, t >= 1 ? 0 : Math.sin(Math.PI * t), lamp.rot, lamp.sc);
    castShadows();
    if (t >= 1) { lamp.moving = false; lantern.style.setProperty('--sway', '0deg'); }
  }

  // ---- where the lantern may stand: a map of the desk, in cells of 8px ----
  // Words, drawings and tokens must stay clear ("hard"); paper and the things lying on the desk had
  // better stay clear ("soft"). Each is kept as a summed-area table, so the cover under any box is
  // four lookups.
  const CELL = 8;
  let room = null;
  function sat(g, cols, rows) {
    const w = cols + 1, s = new Int32Array(w * (rows + 1));
    for (let y = 0; y < rows; y++) { let run = 0; for (let x = 0; x < cols; x++) { run += g[y * cols + x]; s[(y + 1) * w + x + 1] = s[y * w + x + 1] + run; } }
    return s;
  }
  function mapDesk() {
    const dr = desk.getBoundingClientRect(), cols = Math.ceil(desk.clientWidth / CELL), rows = Math.ceil(desk.offsetHeight / CELL);
    const hard = new Uint8Array(cols * rows), soft = new Uint8Array(cols * rows);
    const mark = (g, r, pad) => {
      if (!r.width || !r.height) return;
      const x0 = clamp(Math.floor((r.left - dr.left - pad) / CELL), 0, cols), x1 = clamp(Math.ceil((r.right - dr.left + pad) / CELL), 0, cols);
      const y0 = clamp(Math.floor((r.top - dr.top - pad) / CELL), 0, rows), y1 = clamp(Math.ceil((r.bottom - dr.top + pad) / CELL), 0, rows);
      if (x1 > x0) for (let y = y0; y < y1; y++) g.fill(1, y * cols + x0, y * cols + x1);
    };
    const skip = (n) => !n || n.closest('.lantern, .lamp-under, .lamp-over, .desk-threads, .desk-pins, .props, .drops, .dark-all');
    // every line of words
    const range = document.createRange();
    const walk = document.createTreeWalker(desk, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.data.trim() && !skip(t.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let t; (t = walk.nextNode());) { range.selectNodeContents(t); for (const r of range.getClientRects()) mark(hard, r, 14); }
    // drawings, maps, tables and tokens
    desk.querySelectorAll('img, svg, canvas:not(.paper):not(.cover), .token, table').forEach((n) => { if (!skip(n)) mark(hard, n.getBoundingClientRect(), 14); });
    // paper, and the things lying on the desk
    desk.querySelectorAll('.sheet, .prop').forEach((n) => mark(soft, n.getBoundingClientRect(), 10));
    room = { cols, rows, hard: sat(hard, cols, rows), soft: sat(soft, cols, rows) };
  }
  // how much of the lantern's body would stand on words and on paper, its foot at (x, y)
  function cover(x, y) {
    if (!room) return [0, 0];
    const lw = G.lw, lh = lw * 1.5, w = room.cols + 1;
    const x0 = clamp(Math.floor((x - lw * 0.42) / CELL), 0, room.cols), x1 = clamp(Math.ceil((x + lw * 0.42) / CELL), 0, room.cols);
    const y0 = clamp(Math.floor((y - lh * 0.8) / CELL), 0, room.rows), y1 = clamp(Math.ceil((y + lh * 0.08) / CELL), 0, room.rows);
    const sum = (s) => s[y1 * w + x1] - s[y0 * w + x1] - s[y1 * w + x0] + s[y0 * w + x0];
    return [sum(room.hard), sum(room.soft)];
  }
  // the part of the desk the lantern can be seen whole in: under the running head, above the
  // closing's dark, clear of the screen's edges (desk coordinates). It is moved a little before it
  // reaches an edge (m), so it is never seen cut off while it waits to be picked up.
  function band() {
    const top = scrollY - deskTop, m = Math.min(72, vh * 0.08);
    return { x0: 12, x1: deskW - 12, y0: top + headH + 12 + m, y1: Math.min(top + vh - 12, closingTop - deskTop + vh * 0.12) - m };
  }
  function fits(x, y, b = band()) {
    const lw = G.lw, lh = lw * 1.5;
    return y - lh * BASE >= b.y0 - 1 && y + lh * (1 - BASE) <= b.y1 + 1 && x - lw / 2 >= b.x0 - 1 && x + lw / 2 <= b.x1 + 1;
  }
  // Where to set it down: off the words, off the paper if it can be, and ahead of the reading (low on
  // screen going down, high going up) so the page can scroll a long way before it has to be moved
  // again. Each time it wants somewhere a little different: a height somewhere in the part of the
  // screen ahead, and a step to one side or the other, so it wanders over the desk rather than
  // riding straight up and down with the reader. Of the places that are about as good as the best,
  // one is taken at random. A chapter's own spot (.spot in the page), where it is free, is favoured.
  function findSpot(dir) {
    const b = band(), lw = G.lw, lh = lw * 1.5, W = b.x1 - b.x0, R = Math.random;
    let y0 = b.y0 + lh * BASE, y1 = b.y1 - lh * (1 - BASE);
    if (y1 < y0) y0 = y1 = (y0 + y1) / 2;   // a screen shorter than the lantern: the middle
    const x0 = b.x0 + lw / 2, x1 = Math.max(x0, b.x1 - lw / 2);
    const wantY = lerp(y0, y1, dir > 0 ? 0.6 + 0.32 * R() : 0.08 + 0.32 * R());
    // a step aside: a sixth to a half of the screen, to whichever side has room for it
    let side = R() < 0.5 ? -1 : 1, step = W * (0.16 + 0.34 * R());
    if (lamp.x + side * step > x1 || lamp.x + side * step < x0) side = -side;
    const wantX = clamp(lamp.x + side * step, x0, x1);
    const cost = (x, y) => { const [h, s] = cover(x, y); return h * 5000 + s * 30 + 0.8 * Math.abs(y - wantY) + 0.4 * Math.abs(x - wantX); };
    const found = [];
    for (const s of homes) if (s.y >= y0 && s.y <= y1 && s.x >= x0 && s.x <= x1) found.push({ x: s.x, y: s.y, c: cost(s.x, s.y) - 250 });
    for (let y = y0; y <= y1 + 0.1; y += CELL) for (let x = x0; x <= x1 + 0.1; x += CELL) found.push({ x, y, c: cost(x, y) });
    if (!found.length) return null;
    let best = Infinity;
    for (const f of found) best = Math.min(best, f.c);
    const near = found.filter((f) => f.c <= best + 160);
    let sum = 0;
    for (const f of near) sum += (f.w = Math.exp(-(f.c - best) / 60));
    let pick = R() * sum;
    for (const f of near) if ((pick -= f.w) <= 0) return { x: f.x, y: f.y };
    return { x: near[0].x, y: near[0].y };
  }
  // where the lantern will be once it is set down
  const lampAt = () => (lamp.moving ? lamp.to : [lamp.x, lamp.y]);
  function keepInView() {
    const [x, y] = lampAt();
    const moved = lamp.recheck && cover(x, y)[0] > 0;   // the layout changed under it
    lamp.recheck = false;
    if (lamp.mode === 1 && fits(x, y) && !moved) return;
    // a spot is chosen at random, so once one is chosen it isn't chosen again until the page has
    // moved on (on a screen too short for the lantern no spot fits, and it would never settle)
    if (lamp.mode === 1 && !moved && Math.abs(scrollY - lamp.sought) < 24) return;
    const s = findSpot(lamp.dir);
    if (!s) return;
    lamp.sought = scrollY;
    carryTo(s, lamp.mode < 0, lamp.mode === 1);
    lamp.mode = 1;
  }

  // ---- the closing: the lantern is thrown off the desk and floats in the sky ----
  // It is lifted out of the desk into a layer of its own over the closing, tossed up and across,
  // and drifts on a soft spring towards a patch of sky above the last words, turning slowly and
  // falling away into the distance. Scrolling back up catches it and sets it down on the desk again.
  const space = document.createElement('div');
  space.className = 'space'; space.setAttribute('aria-hidden', 'true');
  document.body.appendChild(space);
  const float = { p: [0, 0], v: [0, 0], rot: 0, w: 0, s: 1, spin: 1, t0: 0, last: 0 };
  function floatHome(t) {
    const W = innerWidth, lh = G.lw * 1.5 * 0.6, sky = lastTop - scrollY - lh - 40;
    // above the last words while there is sky there; once they scroll up, it drifts up and away
    const y = Math.min(vh * 0.32, sky);
    return [W * (G.phone ? 0.7 : 0.76) + W * 0.035 * Math.sin(t * 0.23), y + vh * 0.025 * Math.sin(t * 0.31 + 1)];
  }
  function throwLamp() {
    const now = performance.now();
    float.t0 = float.last = now;
    if (lamp.mode < 0) {   // never set down (the page opened at the end): it is already out there
      float.p = floatHome(0); float.v = [0, 0]; float.s = 0.6; float.rot = 0; float.w = 9;
    } else {
      float.p = [lamp.x, deskTop - scrollY + lamp.y - G.lw * 1.5 * MID];
      float.spin = float.p[0] < floatHome(0)[0] ? 1 : -1;
      float.v = [float.spin * 320, -600]; float.w = float.spin * 210; float.rot = lamp.rot; float.s = lamp.sc;
    }
    lamp.moving = false; lamp.mode = 2;
    space.appendChild(lantern);
    lantern.classList.add('is-afloat');
    lantern.style.setProperty('--lift', '0');
    stepFloat(now);
  }
  function stepFloat(now) {
    const dt = Math.min(0.05, (now - float.last) / 1000), t = (now - float.t0) / 1000;
    float.last = now;
    const home = floatHome(t);
    for (let k = 0; k < 2; k++) { float.v[k] += (2.2 * (home[k] - float.p[k]) - 1.8 * float.v[k]) * dt; float.p[k] += float.v[k] * dt; }
    const drift = 9 * float.spin;   // in space a turn never stops: the toss's spin dies down to this
    float.w = drift + (float.w - drift) * Math.exp(-1.1 * dt); float.rot += float.w * dt;
    float.s = 0.6 + (float.s - 0.6) * Math.exp(-0.7 * dt);
    lantern.style.transform = lampTransform(float.p[0], float.p[1] + G.lw * 1.5 * MID, 0, float.rot, float.s);
  }
  function catchLamp() {
    if (lamp.mode !== 2) return;
    lantern.classList.remove('is-afloat');
    desk.appendChild(lantern);
    lamp.x = float.p[0]; lamp.y = float.p[1] + G.lw * 1.5 * MID - (deskTop - scrollY); lamp.rot = float.rot; lamp.sc = float.s;
    placeLamp(lamp.x, lamp.y, 1, lamp.rot, lamp.sc);
    lamp.mode = 1;
    carryTo(findSpot(-1), false, true);
  }
  // each sheet's shadow falls away from the lamp, longer the further it is
  function castShadows() {
    for (const s of sheets) {
      let dx = s.cx - lamp.x, dy = s.cy - lamp.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const len = clamp(d / 55, 6, 24), ox = Math.round(dx * len), oy = Math.round(dy * len);
      if (ox !== s.ox || oy !== s.oy) { s.ox = ox; s.oy = oy; s.cast.style.transform = `translate(${ox}px, ${oy}px)`; }
    }
  }

  // ---- thread between pins on different sheets, and down the line of pins at the end ----
  const THREADS = [['spool', 'rec-in'], ['rec-out', 'shows-in'], ['shows-out', 'modis1'], ['shows-out', 'viirs1'], ['modis1', 'map-m'], ['viirs1', 'map-v'], ['map-m', 'map-k'], ['map-v', 'map-k'], ['map-k', 'table-in'], ['table-out', 'l0'], ['l0', 'l1'], ['l1', 'l2'], ['l2', 'l3'], ['l3', 'l4'], ['l4', 'l5']];
  let threads = [];
  const chapterOf = (n) => chapters.indexOf(n.closest('.chapter')) + 1;
  function layThreads() {
    const svg = $('desk-threads'), pinBox = $('desk-pins'), dr = desk.getBoundingClientRect();
    const W = desk.offsetWidth, H = desk.offsetHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const A = {};
    desk.querySelectorAll('[data-anchor]').forEach((n) => {
      const r = n.getBoundingClientRect(), tok = n.querySelector('.token');
      A[n.dataset.anchor] = { x: r.left + r.width / 2 - dr.left, y: r.top + r.height / 2 - dr.top, r: tok ? tok.offsetWidth / 2 : 0, el: n };
    });
    const drawn = new Set(threads.filter((t) => t.drawn).map((t) => t.key));
    threads = [];
    let paths = '', pins = '';
    THREADS.forEach(([a, b], i) => {
      const P = A[a], Q = A[b]; if (!P || !Q) return;
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const p = [P.x + ux * P.r * 0.94, P.y + uy * P.r * 0.94], q = [Q.x - ux * Q.r * 0.94, Q.y - uy * Q.r * 0.94];
      const bend = (i % 2 ? 1 : -1) * 0.05 * L, nx = -uy, ny = ux;
      const c1 = [p[0] + (q[0] - p[0]) / 3 + nx * bend, p[1] + (q[1] - p[1]) / 3 + ny * bend], c2 = [p[0] + 2 * (q[0] - p[0]) / 3 + nx * bend * 0.7, p[1] + 2 * (q[1] - p[1]) / 3 + ny * bend * 0.7];
      const d = `M${n1(p[0])} ${n1(p[1])} C${n1(c1[0])} ${n1(c1[1])} ${n1(c2[0])} ${n1(c2[1])} ${n1(q[0])} ${n1(q[1])}`;
      const t = { key: a + '>' + b, d, end: b, chapter: chapterOf(Q.el), lineage: /^l\d/.test(b), pins: [] };
      const pinAt = (pt, k) => { t.pins.push(k); pins += `<i class="pin" data-k="${threads.length}-${k}" style="left:${n1(pt[0])}px;top:${n1(pt[1])}px"></i>`; };
      if (a !== 'spool') pinAt(p, 0);
      pinAt(q, 1);
      threads.push(t);
      paths += `<path class="t-sh" d="${d}" transform="translate(1.5 2.5)"/><path class="t" d="${d}"/>`;
    });
    svg.innerHTML = paths; pinBox.innerHTML = pins;
    const lines = svg.querySelectorAll('.t');
    threads.forEach((t, i) => {
      const path = lines[i], len = Math.ceil(path.getTotalLength()) + 2;
      t.els = [path.previousElementSibling, path];
      t.pinEls = t.pins.map((k) => pinBox.querySelector(`[data-k="${i}-${k}"]`));
      for (const e of t.els) e.style.setProperty('--len', len);
      if (drawn.has(t.key) || still) { t.drawn = true; for (const e of t.els) e.classList.add('is-drawn'); }
      for (const p of t.pinEls) p.style.opacity = t.drawn ? '1' : '0';
    });
  }
  function threadsOverRecord() {
    const src = $('desk-threads'), dr = desk.getBoundingClientRect();
    desk.querySelectorAll(':scope > .record').forEach((sec) => {
      let svg = sec.querySelector(':scope > .record-threads'), box = sec.querySelector(':scope > .record-pins');
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'desk-threads record-threads'); svg.setAttribute('aria-hidden', 'true');
        sec.appendChild(svg);
        box = document.createElement('div'); box.className = 'desk-pins record-pins'; box.setAttribute('aria-hidden', 'true');
        sec.appendChild(box);
      }
      const r = sec.getBoundingClientRect(), w = sec.offsetWidth, h = sec.offsetHeight, x0 = r.left - dr.left, y0 = r.top - dr.top;
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', `${n1(x0)} ${n1(y0)} ${n1(w)} ${n1(h)}`);
      svg.innerHTML = src.innerHTML;
      const copies = svg.querySelectorAll('.t');
      threads.forEach((t, i) => { const path = copies[i]; if (path) t.els.push(path.previousElementSibling, path); });
      (box._watch || []).forEach((o) => o.disconnect());
      box.innerHTML = ''; box._watch = [];
      $('desk-pins').querySelectorAll('.pin').forEach((pin) => {
        const x = parseFloat(pin.style.left) - x0, y = parseFloat(pin.style.top) - y0;
        if (x < -8 || y < -8 || x > w + 8 || y > h + 8) return;
        const copy = pin.cloneNode(); copy.style.left = n1(x) + 'px'; copy.style.top = n1(y) + 'px';
        box.appendChild(copy);
        const o = new MutationObserver(() => { copy.style.opacity = pin.style.opacity; });
        o.observe(pin, { attributes: true, attributeFilter: ['style'] }); box._watch.push(o);
      });
    });
  }
  function drawThread(t) {
    if (!t || t.drawn) return;
    t.drawn = true;
    for (const e of t.els) e.classList.add('is-drawn');
    if (t.pinEls[0]) t.pinEls[0].style.opacity = '1';
    const endPin = t.pinEls[t.pinEls.length - 1];
    setTimeout(() => { if (endPin) endPin.style.opacity = '1'; }, 1900);
  }

  // ---- ink: where each sheet's one drop lands, and how big it grows to cover the sheet ----
  function inkLayout(sheet) {
    if (sheet.classList.contains('is-in')) return;   // already spreading or dry: leave it alone
    const h0 = hashStr(sheet.id || 'x'), r = rng(h0), w = sheet.offsetWidth, h = sheet.offsetHeight;
    if (!w || !h) return;
    // it lands a little above and left of the middle, where the eye starts reading
    const k = h0 % 3, x = w * (0.3 + r() * 0.22), y = h * (0.24 + r() * 0.2);
    const far = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    const S = far / (blotReach[k] * 0.97), T = clamp(1.6 + far / 1600, 1.8, 2.3);
    const st = sheet.style;
    st.setProperty('--x', n1(x) + 'px'); st.setProperty('--y', n1(y) + 'px'); st.setProperty('--S', n1(S) + 'px');
    st.setProperty('--t', T.toFixed(2) + 's'); st.setProperty('--blot', `var(--blot-${k + 1})`);
    sheet._inkT = T;
    let drops = sheet.querySelector(':scope > .drops');
    if (!drops) { drops = document.createElement('div'); drops.className = 'drops'; drops.setAttribute('aria-hidden', 'true'); sheet.appendChild(drops); }
    const d = S / 2.3;
    drops.innerHTML = `<i class="drop" style="left:${n1(x - d / 2)}px;top:${n1(y - d / 2)}px;width:${n1(d)}px;height:${n1(d)}px;--bloom:var(--bloom-${k + 1})"></i>`;
  }
  function inkIn(sheet) {
    if (sheet.classList.contains('is-in')) return;
    sheet.classList.add('is-in');
    setTimeout(() => sheet.classList.add('is-dry'), (sheet._inkT || 2) * 1000 + 350);
  }

  // ---- reaching a part of the desk: ink spreads on its sheets, its tokens are set down, its thread drawn ----
  const reached = new Set();
  function activate(i) {
    for (let j = 1; j <= i; j++) {
      if (reached.has(j)) continue;
      reached.add(j);
      const ch = chapters[j - 1], lag = j < i || still ? 0 : 1;
      const sh = [...ch.querySelectorAll('[data-ink]')];
      sh.forEach((s, k) => later(() => inkIn(s), lag * (350 + k * 480)));
      const settle = 350 + sh.length * 480 + 900;
      later(() => ch.querySelectorAll('.sheet .tk').forEach((t) => t.classList.add('is-in')), lag * settle);
      threads.filter((t) => t.chapter === j && !t.lineage).forEach((t, k) => later(() => drawThread(t), lag * (settle + 500 + k * 320)));
    }
  }
  // the line of pins at the end: each is set down as it comes into view, and the thread is run to it
  // from the one before, in order, one at a time (on a wide desk several come into view at once)
  const lineStops = [...document.querySelectorAll('.lineage .stop')];
  let lineNext = 0, lineBusy = false;
  function runLine() {
    const stop = lineStops[lineNext];
    if (lineBusy || !stop || !stop.classList.contains('is-in')) return;
    lineBusy = true; lineNext++;
    const key = stop.querySelector('[data-anchor]').dataset.anchor;
    later(() => { drawThread(threads.find((t) => t.end === key)); later(() => { lineBusy = false; runLine(); }, still ? 0 : 560); }, still ? 0 : 300);
  }
  const stopIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { stopIO.unobserve(e.target); e.target.classList.add('is-in'); }
    runLine();
  }, { rootMargin: '0px 0px -18% 0px', threshold: 0.6 });
  lineStops.forEach((s) => stopIO.observe(s));
  const recordIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const sheet = e.target, sec = sheet.closest('.record');
      recordIO.unobserve(sheet);
      later(() => inkIn(sheet), still ? 0 : 350);
      const mine = threads.filter((t) => { const end = desk.querySelector('[data-anchor="' + t.end + '"]'); return end && sec.contains(end); });
      mine.forEach((t, k) => later(() => drawThread(t), still ? 0 : 350 + (sheet._inkT || 2) * 1000 + 300 + k * 320));
    }
  }, { threshold: 0.2 });
  document.querySelectorAll('.desk > .record [data-ink]').forEach((s) => recordIO.observe(s));

  // paper is painted while the page is idle, one sheet at a time, long before it is needed; a sheet
  // that comes near first is painted then
  const paperIO = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) paintPaper(e.target); }, { rootMargin: '100% 0px' });
  document.querySelectorAll('.desk .sheet').forEach((s) => paperIO.observe(s));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
  const paperQueue = [...document.querySelectorAll('.desk .sheet')];
  const paintNext = () => { const s = paperQueue.shift(); if (!s) return; paintPaper(s); idle(paintNext, { timeout: 1500 }); };
  idle(paintNext, { timeout: 1500 });
  const closeIO = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !closingPainted) requestAnimationFrame(paintClosing); }, { rootMargin: '100% 0px' });
  closeIO.observe(closing);

  // ================================================================ 8. Scroll
  const head = $('head'), chap = $('chap'), progress = $('progress');
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) chap.innerHTML = `<span class="abjad">${e.target.dataset.abjad}</span>${e.target.dataset.name}`;
  }, { rootMargin: '-45% 0px -50% 0px' });
  chapters.forEach((c) => watch.observe(c));
  const btn = $('contents-btn'), slip = $('contents');
  const setSlip = (open) => { slip.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', open); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); setSlip(!slip.classList.contains('is-open')); });
  slip.addEventListener('click', (e) => { if (e.target.closest('a')) setSlip(false); });
  addEventListener('click', (e) => { if (!slip.contains(e.target)) setSlip(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { setSlip(false); btn.focus(); } });

  // "Begin reading": the camera is carried through the opening to chapter one, as if scrolled, over
  // about the camera's own duration. One finite tween; the reader's own wheel, touch or key stops it.
  // Without the script, or with reduced motion, the link simply jumps.
  $('begin').addEventListener('click', (e) => {
    if (still) return;
    const to = $('ch-1'), y1 = to.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(to).scrollMarginTop) || 0);
    const y0 = scrollY, dist = y1 - y0;
    if (dist <= 0) return;
    e.preventDefault();
    const T = clamp(dist / innerHeight * 640, 2400, 3600), t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // in and out, like ease-lamp
    let stop = false;
    const quit = () => { stop = true; };
    const off = () => { ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => removeEventListener(t, quit)); };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, quit, { passive: true }));
    const step = (now) => {
      if (stop) { off(); return; }
      const t = clamp((now - t0) / T);
      scrollTo(0, y0 + dist * ease(t));
      if (t < 1) requestAnimationFrame(step);
      else { off(); to.setAttribute('tabindex', '-1'); to.focus({ preventScroll: true }); }
    };
    requestAnimationFrame(step);
  });

  let vh = 0, range = 1, stageH = 1, docH = 1, deskTop = 0, closingTop = 0, chIdx = -1, lastY = 0;
  let deskW = 1, headH = 0, lastTop = 0;   // what the lantern needs: the desk's width, the head's height, the closing's last words
  let queued = false, last = {};
  const set = (key, node, prop, value) => { if (last[key] !== value) { last[key] = value; node.style[prop] = value; } };
  const kick = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };

  function measure() {
    vh = innerHeight;
    applyGeometry();
    stageH = stage.offsetHeight; range = Math.max(1, stageH - view.clientHeight);
    docH = Math.max(1, document.documentElement.scrollHeight - vh);
    deskTop = docTop(desk); closingTop = docTop(closing);
    deskW = desk.clientWidth; headH = head.offsetHeight; lastTop = docTop(closing.querySelector('.last'));
    regions = [-Infinity, ...chapters.map((c) => offsetWithin(c, desk)[1])];
    opening = { x: G.S0.x, y: G.S0.y };
    homes = chapters.map((c) => { const [x, y] = offsetWithin(c.querySelector('.spot'), desk); return { x, y }; });
    const dr = desk.getBoundingClientRect();
    sheets = [...desk.querySelectorAll('.sheet')].map((s) => { const r = s.getBoundingClientRect(); return { el: s, cast: s.querySelector(':scope > .cast'), cx: r.left + r.width / 2 - dr.left, cy: r.top + r.height / 2 - dr.top }; }).filter((s) => s.cast);
    desk.querySelectorAll('.sheet').forEach((s) => { if (s._paper) paintPaper(s); });
    desk.querySelectorAll('[data-ink]').forEach(inkLayout);
    layThreads();
    threadsOverRecord();
    mapDesk();
    if (lamp.mode === 0 && !lamp.moving) { lamp.x = opening.x; lamp.y = opening.y; placeLamp(lamp.x, lamp.y, 0); }
    else if (lamp.mode === 1 && !lamp.moving) { placeLamp(lamp.x, lamp.y, 0); lamp.recheck = true; }
    castShadows();
    last = { done: last.done, near: last.near, past: last.past, head: last.head, out: last.out };
  }

  function frame(now) {
    queued = false;
    const y = scrollY;
    if (!still) {
      const p = clamp(y / range);
      if (!scrollLinked) {
        const s = camState(p);
        set('hero-o', heroEl, 'opacity', String(s.heroO)); set('hero-t', heroEl, 'transform', s.heroT);
        set('rig', rig, 'transform', s.rig);
        set('wall-o', wall, 'opacity', String(s.wall)); set('sky', sky, 'transform', s.sky); set('copy', lanternCopy, 'transform', s.copy);
      }
      set('sky-v', sky, 'visibility', p > 0.8 ? 'hidden' : 'visible');
      const done = p >= 0.9995;
      if (last.done !== done) { last.done = done; stage.classList.toggle('is-done', done); }
    }
    // the wallpaper is the opening and nothing else: no desk to read, no lantern to carry or throw
    if (wallpaper) return;
    const near = y + vh * 1.5 > closingTop;
    if (last.near !== near) { last.near = near; closing.classList.toggle('is-near', near); }
    const past = y > stageH + 40;
    if (last.past !== past) { last.past = past; stage.classList.toggle('is-past', past); }
    const on = y > range + vh * 0.35 || (still && y > vh * 0.8);
    if (last.head !== on) { last.head = on; head.classList.toggle('is-on', on); }
    if (!scrollLinked) set('progress', progress, 'transform', `scaleX(${clamp(y / docH).toFixed(4)})`);

    // which part of the desk is being read: its ink spreads, its thread is drawn
    const focus = y + vh * 0.5 - deskTop;
    let idx = 0;
    for (let i = 1; i < regions.length; i++) if (focus > regions[i] + (chIdx >= i ? -60 : 60)) idx = i;
    if (idx !== chIdx) { chIdx = idx; activate(idx); }
    if (y !== lastY) { lamp.dir = y > lastY ? 1 : -1; lastY = y; }

    // the room goes dark as the closing comes up, and the lantern is thrown out into the sky
    // (a little later going down than coming back up, so it doesn't flicker at the line)
    const out = y + vh > closingTop + vh * (last.out ? 0.3 : 0.45);
    if (last.out !== out) {
      last.out = out; root.classList.toggle('lamp-out', out);
      if (!still) { if (out) throwLamp(); else catchLamp(); }
    }
    // the lantern: at its spot in the opening, on screen on the desk, or afloat
    if (lamp.mode === 2) stepFloat(now || performance.now());
    else if (idx === 0) { if (lamp.mode !== 0) { carryTo(opening, lamp.mode < 0); lamp.mode = 0; } }
    else keepInView();
    if (lamp.moving) stepLamp(now || performance.now());
    if (lamp.moving || lamp.mode === 2) kick();
  }

  // ---- start ----
  paintSkyNow();
  measure();
  // the running head's rule fills as the page is read: a scroll-driven animation where it can be
  if (scrollLinked) progress.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { timeline: new ScrollTimeline({ source: document.documentElement, axis: 'block' }), fill: 'both', easing: 'linear' });
  // what the room's canvases wait for: pictures of the desk's things and the lantern, the dial, the
  // Kufic face for the inscription (plaster and wood come below, once the first frame is up). The
  // wallpaper never shows the room, so it makes none of them.
  if (!still && !wallpaper) {
    Promise.all([...$('desk-props').querySelectorAll('.prop')].map((el) => svgPicture(el.querySelector('svg'), 0.15).then((p) => p && { el, ...p }))).then((ps) => ready('props', ps.filter(Boolean)));
    Promise.all([svgPicture(lantern.querySelector('svg.body'), 0.1), svgPicture(lantern.querySelector('.flame-wrap svg'), 0.1)]).then(([body, flame]) => { if (body && flame) ready('lantern', { body, flame }); });
    const dial = new Image(); dial.src = '/landing/assets/marks/dial-night.svg'; dial.decode().then(() => ready('dial', dial), () => {});
    if (document.fonts) document.fonts.load('600 46px "Reem Kufi"', 'الزيج الحاكمي').then((f) => ready('kufi', f.length > 0), () => {});
  }
  addEventListener('scroll', kick, { passive: true });
  let resizeQueued = false;
  addEventListener('resize', () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; measure(); paintSkyNow(); if (closingPainted) paintClosing(); kick(); }); });
  new ResizeObserver(() => { measure(); kick(); }).observe(desk);
  document.fonts && document.fonts.ready.then(() => { measure(); paintSkyNow(); kick(); });
  addEventListener('load', () => { measure(); kick(); });
  kick();

  // textures that take a moment are made after the first frame is on screen
  requestAnimationFrame(() => setTimeout(async () => {
    if (wallpaper) return;
    const wood = await toURL(paintWood(1400, 1800, 8), 'image/jpeg', 0.88);
    if (wood) {
      root.style.setProperty('--wood-tex', `url("${wood}")`);
      if (!still) { const img = new Image(); img.src = wood; img.decode().then(() => ready('wood', img), () => {}); }
    }
    if (!still) ready('plaster', paintPlaster(256, 21));
    if (!still) {
      const blots = await makeBlots();
      blots.forEach(({ mask, bloom }, k) => { root.style.setProperty(`--blot-${k + 1}`, `url("${mask}")`); root.style.setProperty(`--bloom-${k + 1}`, `url("${bloom}")`); });
      blotReach = blots.map((b) => b.reach);
      document.querySelectorAll('.desk [data-ink]').forEach(inkLayout);
      if (blots.every((b) => b.mask && b.bloom)) root.classList.add('ink-ready');
    }
  }, 30));
})();
