/* The life of the landing's opening scene, from the Zij wallpaper (the design repository's
   docs/design/wallpaper/life.js), fitted to a page that has words over the sky and scrolls on.
   It runs after landing.js (which paints the sky, the land, the camp and the walker) and adds:

   - shooting stars at random, now and then a bright one or a few from one radiant, instead of the
     page's three on fixed loops; and one wherever you click the sky
   - satellites: a steady point gliding across the stars, sometimes flaring as sunlight catches it,
     sometimes fading out mid-sky as it passes into the Earth's shadow
   - someone at the camp stokes the fire now and then (or when you click it): it rises, throws more
     light and a burst of sparks
   - a fennec fox trots across the near sand every few minutes, stops to look round, and if the
     pointer comes near, looks at you, eyes catching the light, and runs
   - the sky and the land shift a few pixels with the mouse, the land more, so the night has depth

   Everything moved is a transform or an opacity, run by the browser (CSS or Web Animations); the
   script only starts things and does no work between them. Nothing starts once the page has scrolled
   past the opening, and nothing here runs under reduced motion. */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const sky = $('sky'), land = $('land'), view = $('view'), stage = $('top');
  if (!sky || !land || !view) return;
  const still = root.classList.contains('still');
  if (!still) root.classList.add('life');
  const rnd = Math.random, between = (a, b) => a + rnd() * (b - a);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const make = (tag, cls, parent) => { const n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; };
  const later = (fn, s) => setTimeout(fn, s * 1000);
  // when the tab is hidden or the page has scrolled past the opening, start nothing new
  const awake = () => !document.hidden && !(stage && stage.classList.contains('is-past'));
  // how far the opening's camera has travelled, 0 to 1 (the words are gone by 0.2)
  const travel = () => stage ? clamp(scrollY / Math.max(1, stage.offsetHeight - view.clientHeight)) : 0;

  // ---------------------------------------------------------------- the scene's geometry
  // landing.js paints in the sky's own px: the horizon on row 0.79 of the view's height, the ground
  // m metres away on row 0.79V + 0.95V·3/m (see LAND in landing.js). The sky is scaled a little in
  // the opening and moved by the scroll, so screen and sky px differ by k. Measured on load, on resize
  // and before the pointer is next read after a scroll, never in a frame.
  const G = { k: 1, left: 0, top: 0, V: 1, sw: 1, sh: 1, horizon: 1 };
  let stale = true;
  function measure() {
    stale = false;
    const r = sky.getBoundingClientRect();
    G.k = r.width / (sky.offsetWidth || 1) || 1;
    G.left = r.left; G.top = r.top;
    G.W = innerWidth; G.H = innerHeight;
    G.V = view.clientHeight; G.sw = sky.offsetWidth; G.sh = sky.offsetHeight;
    G.horizon = 0.79 * G.V;
    G.landTop = land.offsetTop;
  }
  const toSky = (x, y) => [(x - G.left) / G.k, (y - G.top) / G.k];
  const rowAt = (m) => G.horizon + 0.95 * G.V * 3 / m;   // the row of the ground m metres away
  const pxPerMetre = (y) => Math.max(0.004, (y - G.horizon) / 3) * clamp(G.sw / (1.5 * G.V), 0.5, 1);

  // ---------------------------------------------------------------- the pointer, and depth
  const pointer = { x: -1, y: -1, in: false };
  const layers = [];   // [node, depth]: depth 1 moves the most
  const par = { x: 0, y: 0, tx: 0, ty: 0, raf: 0, t: 0 };
  const REACH = 16;    // px a layer of depth 1 (about 18 m away) moves at the edge of the screen
  // How much a thing moves with the pointer, by how far away it is, as a camera moving sideways sees
  // it: the nearer, the more. Softened (a square root rather than 1/m), so the far dunes still move a
  // little and the ground at your feet doesn't race. The sky is as far away as anything is.
  const depthAt = (m) => clamp(Math.sqrt(18 / m), 0.02, 1.2);
  const SKY = 0.025;
  // the land's strata (landing.js paints the wallpaper's land in them, far to near), each moving by
  // its own distance; and the depth of the ground m metres away, that of the stratum it is painted on
  const strata = [...land.querySelectorAll('canvas.stratum')].map((k) => ({ k, from: +k.dataset.from, d: depthAt(+k.dataset.as) }));
  const groundDepth = (m) => { for (const s of strata) if (m >= s.from) return s.d; return strata.length ? strata[strata.length - 1].d : 1; };
  // Under reduced motion landing.js paints the land on one canvas; nothing moves then, but should a
  // landing.js without strata come, the land moves as one, as if it all stood about 70 m away, and
  // what stands on it moves with it and is no layer of its own.
  const WHOLE = 0.5, whole = !strata.length;
  const CAMP = whole ? WHOLE : groundDepth(92), FOX_DEPTH = whole ? WHOLE : groundDepth(20);
  // Each layer glides to where the pointer leans it by a transition of its own (.leans, additions.css):
  // the browser runs it off the page's main thread, so the depth stays smooth while the page is busy
  // painting. A new target takes over from wherever the glide has got to.
  function addLayer(node, depth) { if (node) { layers.push([node, depth]); node.style.translate = `${(par.x * depth).toFixed(2)}px ${(par.y * depth).toFixed(2)}px`; if (!still) node.classList.add('leans'); } }
  const offsetOf = (depth) => [par.x * depth, par.y * depth];
  function steer() {
    const on = pointer.in && awake();
    par.tx = on ? -(pointer.x / G.W - 0.5) * 2 * REACH : 0;
    par.ty = on ? -(pointer.y / G.H - 0.5) * REACH : 0;
    // set at most once a frame; where the layers are headed is where the scene is taken to be
    if (!par.raf && !still) par.raf = requestAnimationFrame(lean);
  }
  function lean() {
    par.raf = 0;
    if (Math.abs(par.x - par.tx) < 0.02 && Math.abs(par.y - par.ty) < 0.02) return;
    par.x = par.tx; par.y = par.ty;
    for (const [n, d] of layers) n.style.translate = `${(par.x * d).toFixed(2)}px ${(par.y * d).toFixed(2)}px`;
  }
  const moved = [];
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;   // a finger scrolls the page; it doesn't lean the scene
    if (stale) measure();
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.in = true;
    steer();
    moved.forEach((fn) => fn(pointer, e));
  }, { passive: true });
  addEventListener('scroll', () => { stale = true; if (pointer.in && !awake()) steer(); }, { passive: true });
  root.addEventListener('pointerleave', () => { pointer.in = false; steer(); moved.forEach((fn) => fn(pointer)); });
  addEventListener('blur', () => { pointer.in = false; steer(); });

  // ---------------------------------------------------------------- layers of our own
  const orbits = sky.querySelector('.orbits');
  const shower = make('div', 'shower'), passes = make('div', 'passes');
  shower.setAttribute('aria-hidden', 'true'); passes.setAttribute('aria-hidden', 'true');
  sky.insertBefore(passes, orbits); sky.insertBefore(shower, orbits);

  // ---------------------------------------------------------------- shooting stars
  // x, y: where its head starts, in sky px. a: its heading in degrees (0 is to the right, 90 down).
  function meteor(x, y, o = {}) {
    if (still || !awake()) return;
    const a = o.a ?? (rnd() < 0.55 ? between(124, 168) : between(14, 58));
    const len = o.len ?? between(150, 330) * clamp(G.V / 900, 0.7, 1.6), w = len * between(0.42, 0.62) * (o.bright ? 1.25 : 1);
    const m = make('i', 'streak' + (o.bright ? ' bright' : ''), shower);
    m.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w.toFixed(1)}px;margin-left:${(-w).toFixed(1)}px`;
    const dur = len / between(480, 720) * 1000 * (o.bright ? 1.5 : 1);
    const go = m.animate([
      { transform: `rotate(${a}deg) translateX(0px) scaleX(0.1)`, opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { opacity: o.bright ? 1 : 0.9, offset: 0.72 },
      { transform: `rotate(${a}deg) translateX(${len.toFixed(1)}px) scaleX(1)`, opacity: 0 },
    ], { duration: dur, delay: o.delay || 0, easing: 'cubic-bezier(.3,.1,.6,1)' });
    go.onfinish = go.oncancel = () => m.remove();
  }
  // somewhere in the sky above the land, away from the very top
  const anywhere = () => [between(0.04, 0.96) * G.sw, between(0.05, 0.55) * G.horizon];
  function shootingStars() {
    if (awake()) {
      const [x, y] = anywhere(), p = rnd();
      if (p < 0.08) {
        // a few from one radiant, close together
        const a = between(118, 160), n = 2 + (rnd() * 2 | 0);
        for (let i = 0; i < n; i++) meteor(x + between(-160, 160), y + between(-60, 60), { a: a + between(-4, 4), delay: i * between(300, 900) });
      } else meteor(x, y, { bright: p > 0.86 });
    }
    later(shootingStars, between(5, 22));
  }

  // ---------------------------------------------------------------- satellites
  function satellite() {
    if (still || !awake()) return;
    const span = G.sw, top = G.horizon;
    let x0, y0, x1, y1;
    for (let tries = 0; tries < 12; tries++) {
      x0 = between(0.02, 0.98) * span; y0 = between(0.03, 0.5) * top;
      const th = between(0, Math.PI * 2), L = between(0.35, 0.75) * span;
      x1 = x0 + Math.cos(th) * L; y1 = y0 + Math.sin(th) * L;
      if (x1 > 0.01 * span && x1 < 0.99 * span && y1 > 0.02 * top && y1 < 0.62 * top) break;
      x1 = null;
    }
    if (x1 == null) return;
    const s = make('i', 'pass', passes), glint = make('b', '', s);
    const dur = Math.hypot(x1 - x0, y1 - y0) / (between(26, 44) * G.sw / 1550) * 1000;
    // some pass into the Earth's shadow and fade out partway, as satellites do after dusk
    const shade = rnd() < 0.35 ? between(0.45, 0.8) : 1;
    const frames = [
      { transform: `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`, opacity: 0 },
      { opacity: 0.85, offset: 0.06 },
      { opacity: 0.85, offset: Math.max(0.07, shade - (shade < 1 ? 0.07 : 0.05)) },
      { opacity: 0, offset: shade },
      { transform: `translate(${x1.toFixed(1)}px, ${y1.toFixed(1)}px)`, opacity: 0 },
    ];
    const go = s.animate(frames, { duration: dur, easing: 'linear' });
    go.onfinish = go.oncancel = () => s.remove();
    // and some flare for a moment, as the sun catches a panel
    if (rnd() < 0.25) {
      const at = between(0.2, Math.min(0.8, shade - 0.1));
      glint.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: 0.45 }, { opacity: 0, transform: 'scale(.5)' }], { duration: between(1400, 2600), delay: dur * at, easing: 'ease-in-out' });
    }
  }
  function satellites() { satellite(); if (rnd() < 0.1) later(satellite, between(4, 12)); later(satellites, between(28, 80)); }

  // ---------------------------------------------------------------- the camp's fire, stoked
  const camp = $('camp');
  function stoke() {
    if (still || !camp || !awake()) return;
    // the fire rises and throws its light further (its flame, air and sparks scale round its root)
    camp.animate([{ scale: 1 }, { scale: 1.34, offset: 0.16 }, { scale: 1.16, offset: 0.5 }, { scale: 1 }], { duration: 6000, easing: 'ease-out' });
    // a burst of sparks, carried up on the heat and off with the wind
    const fx = camp.querySelector('.fx');
    for (let i = 0; i < 11; i++) {
      const e = make('i', 'ember', fx);
      const dx = between(-5, 16), dy = -between(22, 54), d = between(1300, 2900);
      const go = e.animate([
        { transform: 'translate(0px, 0px)', opacity: 0 },
        { opacity: 1, offset: 0.06 },
        { transform: `translate(${(dx * 0.4).toFixed(1)}px, ${(dy * 0.55).toFixed(1)}px)`, opacity: 0.8, offset: 0.45 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, opacity: 0 },
      ], { duration: d, delay: between(0, 1100), easing: 'cubic-bezier(.2,.6,.4,1)' });
      go.onfinish = go.oncancel = () => e.remove();
    }
  }
  function stoking() { stoke(); later(stoking, between(55, 150)); }
  const campOnScreen = () => {
    if (!camp) return [-1e4, -1e4];
    const [ox, oy] = offsetOf(CAMP);
    return [G.left + (camp.offsetLeft + ox) * G.k, G.top + (G.landTop + camp.offsetTop + oy) * G.k];
  };

  // ---------------------------------------------------------------- the fox
  // A fennec in silhouette, drawn in centimetres facing left: torso and neck, a head in profile (or
  // turned to you, for the frame where it looks), the ears it is known for, a low bushy tail and thin
  // legs. Its trot is six drawings of one stride (the diagonal pairs of legs together) in a strip,
  // stepped through like the fires' flipbooks; then a drawing standing, and one looking at you.
  const FOX = { x0: -36, w: 84, y0: -48, h: 50, frames: 8 };
  function spline(p, closed) {
    // a smooth path through the points (Catmull-Rom, drawn as cubic Béziers)
    const n = p.length, P = (i) => p[closed ? (i + n) % n : clamp(i, 0, n - 1)];
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = P(i - 1), b = P(i), c = P(i + 1), e = P(i + 2);
      const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${c[0].toFixed(2)} ${c[1].toFixed(2)}`;
    }
    return d + (closed ? 'Z' : '');
  }
  const shift = (pts, dy) => pts.map(([x, y]) => [x, y + dy]);
  const TORSO = [[-13, -12.8], [-16.8, -17.5], [-19.4, -23], [-21, -27], [-18.5, -29.5], [-15, -27.8], [-9, -26.3], [2, -26], [12, -25.6], [17.8, -22.8], [18.5, -17.5], [14.5, -13.2], [2, -12.6], [-8, -12.9]];
  const HEAD = [[-19, -26], [-22.5, -25], [-26.5, -25.6], [-31, -27.2], [-30, -28.6], [-25.5, -30.4], [-21.5, -31.8], [-18, -30.8], [-17.5, -28]];
  const BACK = [[-15, -28], [-9, -26.5], [2, -26.2], [12, -25.8], [17.8, -23]];
  function leg(hip, fx, lift, front) {
    const [hx, hy] = hip;
    const pts = front
      ? [[hx, hy], [hx + 1 + fx * 0.3, hy + 5], [hx - 0.5 + fx * 0.8, -4 - lift * 0.7], [hx - 1.5 + fx, -lift]]
      : [[hx, hy], [hx - 2 + fx * 0.4, -10], [hx + 1.5 + fx * 0.6, -5.5 - lift * 0.4], [hx - 0.5 + fx, -lift]];
    return 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L');
  }
  // where each foot is in the stride: s from 0 to 1, on the ground for the first half
  const stride = (s) => { s = ((s % 1) + 1) % 1; return s < 0.5 ? [lerp(-4.5, 4.5, s / 0.5), 0] : [lerp(4.5, -4.5, (1 - Math.cos(Math.PI * (s - 0.5) / 0.5)) / 2), Math.sin(Math.PI * (s - 0.5) / 0.5) * 3]; };
  function foxFrame(i) {
    const trot = i < 6, look = i === 7, t = i / 6;
    const bob = trot ? -0.55 * Math.abs(Math.sin(2 * Math.PI * t)) : 0;
    const feet = trot
      ? { nf: stride(t), fh: stride(t), ff: stride(t + 0.5), nh: stride(t + 0.5) }
      : { nf: [-1.5, 0], ff: [1, 0], nh: [1.2, 0], fh: [-1, 0] };
    const sway = trot ? 5 * Math.sin(2 * Math.PI * t) : look ? -3 : 0;
    let s = `<g transform="translate(${(i * FOX.w - FOX.x0)} 0)">`;
    // the far legs, then the body, then the near legs
    s += `<path class="leg" d="${leg([-10.5, -17 + bob], feet.ff[0], feet.ff[1], true)}${leg([13.5, -18 + bob], feet.fh[0], feet.fh[1], false)}"/>`;
    s += `<g transform="translate(0 ${bob.toFixed(2)})">`;
    s += `<path class="fig" transform="rotate(${sway.toFixed(1)} 17 -21)" d="M17 -24C24 -24.5 32 -21 38 -15C41.5 -11.5 43 -8.5 41.5 -6.5C39 -5 34.5 -7 30.5 -9.5C25.5 -12.5 21 -15 16.5 -16.5Z"/>`;
    s += `<path class="fig" d="${spline(TORSO, true)}"/>`;
    if (look) {
      // turned to you: a round face, the muzzle, both ears up and open, and the eyes catching the light
      s += '<path class="fig" d="M-25.4 -28.6A4.4 3.8 0 1 1 -16.6 -28.6A4.4 3.8 0 1 1 -25.4 -28.6ZM-23.2 -26.4A2.2 2.6 0 1 0 -18.8 -26.4A2.2 2.6 0 1 0 -23.2 -26.4Z"/>';
      s += '<path class="fig" d="M-24.6 -30.2Q-29.4 -36 -28.6 -43Q-23.4 -38.4 -21.6 -31.6ZM-17.4 -30.2Q-12.6 -36 -13.4 -43Q-18.6 -38.4 -20.4 -31.6Z"/>';
      s += '<circle class="eye" cx="-22.7" cy="-29" r="0.85"/><circle class="eye" cx="-19.3" cy="-29" r="0.85"/>';
    } else {
      s += `<path class="fig" d="${spline(HEAD, true)}"/>`;
      s += '<path class="fig" d="M-21 -31.6Q-20 -38 -16.5 -44Q-15.6 -37 -17.2 -30.6ZM-24.5 -30.4Q-26.5 -38 -24.2 -45.5Q-20.5 -38.5 -19.6 -31.4Z"/>';
    }
    // starlight along its back and the top of its tail, from the right
    s += `<path class="rim" d="${spline(BACK, false)}"/>`;
    s += `<path class="rim" transform="rotate(${sway.toFixed(1)} 17 -21)" d="M17.5 -24C24 -24.4 32 -20.9 38 -14.9"/>`;
    s += '</g>';
    s += `<path class="leg" d="${leg([-12, -17 + bob], feet.nf[0], feet.nf[1], true)}${leg([12, -18 + bob], feet.nh[0], feet.nh[1], false)}"/>`;
    return s + '</g>';
  }
  const foxSVG = () => {
    let s = '';
    for (let i = 0; i < FOX.frames; i++) s += foxFrame(i);
    return `<svg viewBox="0 ${FOX.y0} ${FOX.w * FOX.frames} ${FOX.h}" preserveAspectRatio="none" aria-hidden="true">${s}</svg>`;
  };

  const fox = { node: null, anim: null, x0: 0, x1: 0, y: 0, k: 1, m: 20, sw: 1, dir: -1, speed: 1, strideM: 0.38, pose: 'trot', busy: false, scared: false, timers: [] };
  function foxNode() {
    if (fox.node) return fox.node;
    const n = make('div', 'fox', land); n.setAttribute('aria-hidden', 'true');
    const body = make('div', 'body', n), reel = make('div', 'reel', body);
    reel.innerHTML = foxSVG();
    if (!whole) addLayer(n, FOX_DEPTH);   // it moves with the ground it walks on
    return (fox.node = n);
  }
  const foxPose = (p) => { fox.pose = p; fox.node.classList.toggle('stand', p === 'stand'); fox.node.classList.toggle('look', p === 'look'); };
  const foxX = () => fox.anim ? lerp(fox.x0, fox.x1, clamp((fox.anim.currentTime || 0) / fox.anim.effect.getTiming().duration)) : fox.x0;
  const foxEdge = (dir) => { const pad = 1.5 * fox.k; return dir > 0 ? G.sw + pad : -pad; };   // just off screen
  function foxClear() { fox.timers.forEach(clearTimeout); fox.timers = []; }
  // its row and its size: m metres away on the flat sand, drawn in px per centimetre
  function foxPlace() {
    const y = rowAt(fox.m);
    fox.k = pxPerMetre(y); fox.y = y - G.landTop; fox.sw = G.sw;
    fox.node.style.setProperty('--u', (fox.k / 100).toFixed(4));
  }
  function foxRun(from, to, speed, strideM, pose = 'trot') {
    // trot (or run) from x `from` to x `to` on its row, in land px, at `speed` metres a second
    const n = fox.node, dir = Math.sign(to - from) || -1;
    fox.dir = dir; fox.speed = speed; fox.strideM = strideM;
    n.classList.toggle('rtl', dir > 0);
    n.style.setProperty('--stride', (strideM / speed).toFixed(3) + 's');
    if (fox.anim) fox.anim.cancel();
    fox.x0 = from; fox.x1 = to;
    const ms = Math.max(1, Math.abs(to - from) / (speed * fox.k) * 1000);
    fox.anim = n.animate([{ transform: `translate(${from.toFixed(1)}px, ${fox.y.toFixed(1)}px)` }, { transform: `translate(${to.toFixed(1)}px, ${fox.y.toFixed(1)}px)` }], { duration: ms, easing: 'linear', fill: 'forwards' });
    foxPose(pose);
    fox.anim.onfinish = () => foxGone();
    return fox.anim;
  }
  // the screen changed size: the same fox, at the same share of the way across, on the new ground
  function foxResize() {
    if (!fox.busy || !fox.anim) return;
    const frac = foxX() / (fox.sw || 1), paused = fox.anim.playState === 'paused', pose = fox.pose;
    foxPlace();
    foxRun(frac * G.sw, foxEdge(fox.dir), fox.speed, fox.strideM, pose);
    if (paused) fox.anim.pause();
  }
  function foxGone() { foxClear(); if (fox.anim) fox.anim.cancel(); fox.anim = null; if (fox.node) fox.node.classList.add('away'); fox.busy = false; fox.scared = false; later(foxComes, between(120, 260)); }
  function foxComes() {
    if (still || fox.busy) return;
    if (!awake() || !G.V) { later(foxComes, 20); return; }
    const n = foxNode(); n.classList.remove('away');
    fox.m = between(17, 23); fox.busy = true; fox.scared = false;
    foxPlace();
    const dir = rnd() < 0.5 ? -1 : 1;
    const go = foxRun(foxEdge(-dir), foxEdge(dir), between(0.9, 1.3), 0.38);
    // most of the time it stops once on the way, stands, looks round at you, and goes on
    if (rnd() < 0.75) {
      const dur = go.effect.getTiming().duration, at = between(0.28, 0.68) * dur;
      const stand = between(1.2, 2.2), look = between(1.4, 2.6);
      fox.timers.push(setTimeout(() => {
        if (fox.scared || !fox.anim) return;
        fox.anim.pause(); foxPose('stand');
        fox.timers.push(later(() => { if (!fox.scared) foxPose('look'); }, stand));
        fox.timers.push(later(() => { if (!fox.scared) foxPose('stand'); }, stand + look));
        fox.timers.push(later(() => { if (!fox.scared && fox.anim) { foxPose('trot'); fox.anim.play(); } }, stand + look + 0.5));
      }, at));
    }
  }
  // it hears you: stops, looks, and runs off the way away from you
  function foxStartle(px) {
    if (!fox.busy || fox.scared || !fox.anim) return;
    fox.scared = true; foxClear();
    const x = foxX();
    fox.anim.pause(); foxPose('look');
    fox.timers.push(later(() => {
      const away = px === undefined ? fox.dir : (px < foxScreen()[0] ? 1 : -1);
      foxRun(x, foxEdge(away), 4.2, 0.62);
    }, 0.55));
  }
  function foxScreen() {
    const [ox, oy] = offsetOf(FOX_DEPTH);
    return [G.left + (foxX() + ox) * G.k, G.top + (G.landTop + fox.y + oy - 0.18 * fox.k) * G.k];
  }
  moved.push((p) => {
    if (!p.in || !fox.busy || fox.scared) return;
    const [fx, fy] = foxScreen(), reach = Math.max(56, fox.k * 1.6 * G.k);
    if (Math.hypot(p.x - fx, p.y - fy) < reach) foxStartle(p.x);
  });

  // ---------------------------------------------------------------- clicks
  // only on the opening itself, before the camera pulls back into the room, and never on a link
  addEventListener('click', (e) => {
    if (still || !awake() || travel() > 0.03) return;
    if (!(e.target instanceof Element) || !view.contains(e.target) || e.target.closest('a, button, input, label, summary')) return;
    if (stale) measure();
    const x = e.clientX, y = e.clientY;
    if (fox.busy) { const [fx, fy] = foxScreen(); if (Math.hypot(x - fx, y - fy) < Math.max(40, fox.k * G.k)) { foxStartle(x); return; } }
    const [cx, cy] = campOnScreen();
    if (Math.hypot(x - cx, y - cy) < 44) { stoke(); return; }
    // a wish: a shooting star from where you clicked, if that is sky
    const [sx, sy] = toSky(x - offsetOf(SKY)[0] * G.k, y - offsetOf(SKY)[1] * G.k);
    if (sy < G.horizon - 12) meteor(sx, sy, { bright: rnd() < 0.3 });
  });

  // ---------------------------------------------------------------- start
  const skyCanvas = $('sky-canvas'), twinkles = $('sky-twinkles');
  // the sky barely moves; the armillary, drawn over it, a little; and the land by strata, each by its
  // distance, with what is drawn on its own small layers going with the ground it stands on
  for (const n of [skyCanvas, twinkles, shower, passes]) addLayer(n, SKY);
  addLayer(orbits, 0.1);
  if (strata.length) {
    for (const st of strata) addLayer(st.k, st.d);
    for (const [id, m] of [['far-a', 1500], ['far-b', 1500], ['burn-1', 1500], ['burn-2', 1500], ['camp-lit', 92], ['camp', 92], ['walker', 104]]) addLayer($(id), groundDepth(m));
  } else addLayer(land, WHOLE);
  measure();
  // landing.js repaints the land in the frame after a resize: measure in the frame after that
  addEventListener('resize', () => requestAnimationFrame(() => requestAnimationFrame(() => {
    measure();
    foxResize();
  })));
  if (!still) {
    later(shootingStars, between(2, 6));
    later(satellites, between(6, 16));
    later(stoking, between(30, 70));
    later(foxComes, between(14, 30));
  }

  window.ZijLife = { meteor, stoke, satellite, fox: () => foxComes() };
})();
