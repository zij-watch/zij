"use client";

// The end of the film v3.1: the sheets, stacked on the findings sheet, are bound into a book. A
// leather cover, its spine with raised bands, gold tooling round its edge, closes over the page
// block; the Seal is brushed onto it in gold leaf with the landing page's brush (its strokes' own
// timings, played faster), then "zij.watch" and the credit line are stamped in gold.

import { useRef } from "react";
import { clamp, lerp, move } from "@/lib/film/timeline";
import type { Beats31 } from "@/lib/film/v31";
import { useDriver, useT } from "../kit";

/** cubic-bezier(0.3, 0.1, 0.25, 1): the brush's own pace, from the landing's stylesheet. */
function brush(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * 0.3, bx = 3 * (0.25 - 0.3) - cx, ax = 1 - cx - bx;
  const cy = 3 * 0.1, by = 3 * (1 - 0.1) - cy, ay = 1 - cy - by;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(d) < 1e-6) break;
    u -= (((ax * u + bx) * u + cx) * u - x) / d;
  }
  return ((ay * u + by) * u + cy) * u;
}
const seconds = (element: Element, name: string) => parseFloat((element as SVGElement).style.getPropertyValue(name)) || 0;

/** A small gold ornament for the cover's corners: an eight-pointed star in a diamond, the zij's tiles. */
function Corner({ x, y, r }: { x: number; y: number; r: number }) {
  const star = Array.from({ length: 16 }, (_, k) => {
    const a = (k * Math.PI) / 8, d = k % 2 ? 0.42 : 1;
    return `${(x + r * d * Math.cos(a)).toFixed(1)},${(y + r * d * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <g>
      <polygon points={star} className="v31-gold-fill" />
      <circle cx={x} cy={y} r={r * 0.22} className="v31-leather-fill" />
    </g>
  );
}

/** Gold leaf, stamped: text whose letters are gold, pressed into the leather. */
function Stamped({ x, y, size, weight = 600, spacing = 0, children, k }: { x: number; y: number; size: number; weight?: number; spacing?: number; children: string; k: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="v31-stamped" style={{ fontSize: size, fontWeight: weight, letterSpacing: spacing, clipPath: k >= 1 ? undefined : `inset(-20% ${(100 * (1 - k)).toFixed(2)}% -20% 0)` }} opacity={k > 0 ? 1 : 0}>
      {children}
    </text>
  );
}

export function Book({ b, seal }: { b: Beats31; seal: string }) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);

  // The landing's keyframes, worked out for the frame's time, faster so the Seal is written in its slot.
  useDriver((time) => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const strokes = [...svg.querySelectorAll<SVGPathElement>(".seal-stroke, .seal-dot, .seal-wet-stroke")];
    const length = Math.max(...strokes.map((p) => seconds(p, "--at") + (seconds(p, "--dur") || 0.4)), 0.1);
    const now = ((time - b.brush[0]) * length) / (b.brush[1] - b.brush[0]);
    svg.querySelectorAll<SVGPathElement>(".seal-stroke").forEach((path) => {
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = String(1 - brush((now - seconds(path, "--at")) / (seconds(path, "--dur") || 0.4)));
    });
    svg.querySelectorAll<SVGPathElement>(".seal-dot").forEach((path) => {
      path.style.opacity = String(clamp((now - seconds(path, "--at")) / 0.08));
    });
    svg.querySelectorAll<SVGPathElement>(".seal-wet-stroke").forEach((path) => {
      const at = seconds(path, "--at"), dur = seconds(path, "--dur") || 0.4, tip = seconds(path, "--tip") || 0.1;
      const k = brush((now - at) / dur), dry = clamp((now - at) / (dur + 0.3));
      path.style.strokeDasharray = `${tip} 2`;
      path.style.strokeDashoffset = String(lerp(tip, tip - 1, k));
      path.style.opacity = String(dry <= 0 || dry >= 1 ? 0 : dry < 0.08 ? dry / 0.08 : dry <= 0.62 ? 1 : 1 - (dry - 0.62) / 0.38);
    });
  });

  // The cover lies open to the left, then closes over the page block about its spine.
  const close = move(t, b.close[0], b.close[1] - b.close[0]);
  const shown = t >= b.stack[0] + 0.15;
  const W = 1820, H = 1020;
  return (
    <div className="v31-book" style={{ visibility: shown ? undefined : "hidden" }} aria-hidden="true">
      <svg width="0" height="0" className="v31-defs">
        <defs>
          <linearGradient id="v31-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4dd96" />
            <stop offset="0.35" stopColor="#c99a3e" />
            <stop offset="0.6" stopColor="#e8c873" />
            <stop offset="1" stopColor="#9c7428" />
          </linearGradient>
          <linearGradient id="v31-gold-wet" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1c4" />
            <stop offset="1" stopColor="#e2b85a" />
          </linearGradient>
          <filter id="v31-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11" result="noise" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0 0.03  0 0 0 0.55 0" />
          </filter>
          <filter id="v31-pebble" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="turbulence" baseFrequency="0.035" numOctaves="2" seed="5" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0 0.01  0 0 0 0.35 0" />
          </filter>
        </defs>
      </svg>
      {/* The page block: its edges show a little past the cover, at the fore-edge and the foot. */}
      <div className="v31-pages" style={{ opacity: move(t, b.close[0] - 0.05, 0.12) }} />
      <div className="v31-cover" style={{ transform: `perspective(3400px) rotateY(${(-178 * (1 - close)).toFixed(3)}deg)` }}>
        <div className="v31-cover-back" style={{ opacity: close > 0.5 ? 0 : 1 }} />
        <div className="v31-cover-face" style={{ opacity: close > 0.5 ? 1 : 0 }}>
          <svg className="v31-leather" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
            <rect width={W} height={H} filter="url(#v31-pebble)" />
            <rect width={W} height={H} filter="url(#v31-grain)" />
            {/* The spine: darker, with four raised bands, each ruled in gold. */}
            <rect x={0} y={0} width={96} height={H} className="v31-spine" />
            {[0.16, 0.38, 0.62, 0.84].map((f) => (
              <g key={f}>
                <rect x={0} y={H * f - 13} width={96} height={26} rx={6} className="v31-band" />
                <line x1={6} x2={90} y1={H * f - 17} y2={H * f - 17} className="v31-gold-line" />
                <line x1={6} x2={90} y1={H * f + 17} y2={H * f + 17} className="v31-gold-line" />
              </g>
            ))}
            <line x1={104} x2={104} y1={0} y2={H} className="v31-hinge" />
            {/* Gold tooling: a double fillet round the board, corner ornaments. */}
            <rect x={160} y={56} width={W - 216} height={H - 112} className="v31-gold-line is-thick" />
            <rect x={178} y={74} width={W - 252} height={H - 148} className="v31-gold-line" />
            {[[160, 56], [W - 56, 56], [160, H - 56], [W - 56, H - 56]].map(([x, y]) => <Corner key={`${x}-${y}`} x={x} y={y} r={30} />)}
            <Stamped x={(W + 104) / 2} y={760} size={96} spacing={6} k={move(t, b.site, 0.25)}>zij.watch</Stamped>
            <line x1={(W + 104) / 2 - 220} x2={(W + 104) / 2 + 220} y1={806} y2={806} className="v31-gold-line" opacity={move(t, b.site + 0.1, 0.2)} />
            <Stamped x={(W + 104) / 2} y={866} size={36} weight={500} spacing={1} k={move(t, b.credit, 0.25)}>Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth</Stamped>
          </svg>
          <div ref={holder} className="film-seal v31-seal" dangerouslySetInnerHTML={{ __html: seal }} style={{ visibility: t < b.brush[0] ? "hidden" : undefined }} />
        </div>
      </div>
    </div>
  );
}
