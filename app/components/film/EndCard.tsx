"use client";

// Scene 7: the end card. The Seal is the landing page's, written with its brush: the drawing is
// read out of the built landing page (public/landing.html, where scripts/build-landing.mjs puts the
// eight shapes, the nine brush strokes and each stroke's start and length). The landing runs those
// strokes as CSS animations; here the same keyframes are worked out for the frame's time instead,
// so the Seal is written the same way and the last second can be held still.

import { useRef } from "react";
import { clamp, lerp, T } from "@/lib/film/timeline";
import { inked, shown, useDriver, useT } from "./kit";

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

const seconds = (element: Element, name: string) => parseFloat((element as HTMLElement | SVGElement).style.getPropertyValue(name)) || 0;

export default function EndCard({ seal }: { seal: string }) {
  const t = useT();
  const holder = useRef<HTMLDivElement>(null);

  useDriver((time) => {
    const svg = holder.current?.querySelector("svg");
    if (!svg || time < T.endRule) return;
    const now = time - T.seal;
    // seal-write: a stroke runs from nothing to its whole length.
    svg.querySelectorAll<SVGPathElement>(".seal-stroke").forEach((path) => {
      const k = brush((now - seconds(path, "--at")) / (seconds(path, "--dur") || 0.4));
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = String(1 - k);
    });
    // seal-dot: a dot is set down whole, in one touch.
    svg.querySelectorAll<SVGPathElement>(".seal-dot").forEach((path) => {
      path.style.opacity = String(clamp((now - seconds(path, "--at")) / 0.08));
    });
    // seal-tip and seal-dry: the wet tip runs with the stroke's head and dries just after it.
    svg.querySelectorAll<SVGPathElement>(".seal-wet-stroke").forEach((path) => {
      const at = seconds(path, "--at"), dur = seconds(path, "--dur") || 0.4, tip = seconds(path, "--tip") || 0.1;
      const k = brush((now - at) / dur);
      const dry = clamp((now - at) / (dur + 0.3));
      path.style.strokeDasharray = `${tip} 2`;
      path.style.strokeDashoffset = String(lerp(tip, tip - 1, k));
      path.style.opacity = String(dry <= 0 || dry >= 1 ? 0 : dry < 0.08 ? dry / 0.08 : dry <= 0.62 ? 1 : 1 - (dry - 0.62) / 0.38);
    });
  });

  return (
    <div className="film-group film-end" style={shown(t, T.endRule)}>
      <div ref={holder} className="film-seal" dangerouslySetInnerHTML={{ __html: seal }} />
      <p className="film-team" style={inked(t, T.team)}>Team Zij · zij.watch</p>
      <p className="film-credit" style={inked(t, T.credit)}>Data: NASA FIRMS · Imagery: NASA GIBS · Map: Natural Earth</p>
    </div>
  );
}
