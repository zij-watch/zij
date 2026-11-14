"use client";

// The end of the film v3.1: the sheets, stacked on the findings sheet, are bound into one book.
// Its cover closes over them, and the Seal is brushed onto it with the landing page's brush (its
// strokes' own timings, played faster), then "zij.watch" and the credit line.

import { useRef } from "react";
import { clamp, lerp, move } from "@/lib/film/timeline";
import type { Beats31 } from "@/lib/film/v31";
import { inked, useDriver, useT } from "../kit";

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

export function Book({ b, seal }: { b: Beats31; seal: string }) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);

  // The landing's keyframes, worked out for the frame's time, faster so the Seal is written in its slot.
  useDriver((time) => {
    const svg = holder.current?.querySelector("svg");
    if (!svg) return;
    const strokes = [...svg.querySelectorAll<SVGPathElement>(".seal-stroke, .seal-dot, .seal-wet-stroke")];
    const length = Math.max(...strokes.map((p) => seconds(p, "--at") + (seconds(p, "--dur") || 0.4)), 0.1);
    const speed = length / (b.brush[1] - b.brush[0]);
    const now = (time - b.brush[0]) * speed;
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

  // The cover lies open to the left, then closes over the stack about its spine.
  const close = move(t, b.close[0], b.close[1] - b.close[0]);
  const shown = t >= b.stack[0] + 0.2;
  return (
    <div className="v31-book" style={{ visibility: shown ? undefined : "hidden" }} aria-hidden="true">
      <div className="v31-cover" style={{ transform: `perspective(3200px) rotateY(${(-178 * (1 - close)).toFixed(3)}deg)` }}>
        <div className="v31-cover-face" style={{ opacity: close > 0.5 ? 1 : 0 }}>
          <div ref={holder} className="film-seal v31-seal" dangerouslySetInnerHTML={{ __html: seal }} style={{ visibility: t < b.brush[0] ? "hidden" : undefined }} />
          <p className="v31-site" style={inked(t, b.site, 0.25)}>zij.watch</p>
          <p className="v31-credit" style={inked(t, b.credit, 0.25)}>Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth</p>
        </div>
        <div className="v31-cover-back" style={{ opacity: close > 0.5 ? 0 : 1 }} />
      </div>
    </div>
  );
}
