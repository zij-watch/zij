"use client";

// Canvases painted once, while the browser is idle, and again only when their size changes: the
// night sky, the Delta's fields from above, and the desk's wood. Never painted in a frame.

import { useEffect, useRef } from "react";
import { paintFields, paintSky, paintWood, whenIdle, type SkyOptions } from "@/lib/diary/paint";

function usePainted(paint: (cv: HTMLCanvasElement) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let size = "", cancel = () => {};
    const go = () => {
      const s = `${cv.clientWidth}x${cv.clientHeight}`;
      if (s === size || !cv.clientWidth) return;
      size = s;
      cancel();
      cancel = whenIdle(() => paint(cv));
    };
    const ro = new ResizeObserver(go);
    ro.observe(cv);
    go();
    return () => { ro.disconnect(); cancel(); };
  }, [paint]);
  return ref;
}

const SKY: SkyOptions = { seed: 1977, stars: 900, bandStars: 1400, horizon: 1, band: { a: [0.08, 1.05], c: [0.42, 0.42], b: [0.95, -0.1], width: 0.34 } };
const paintTheSky = (cv: HTMLCanvasElement) => { paintSky(cv, SKY); };
export function SkyCanvas({ className = "" }: { className?: string }) {
  return <canvas ref={usePainted(paintTheSky)} className={`tex-sky ${className}`} aria-hidden="true" />;
}

const paintTheFields = (cv: HTMLCanvasElement) => { paintFields(cv, 2004); };
export function FieldsCanvas({ className = "" }: { className?: string }) {
  return <canvas ref={usePainted(paintTheFields)} className={`tex-fields ${className}`} aria-hidden="true" />;
}

const paintTheWood = (cv: HTMLCanvasElement) => {
  const w = cv.clientWidth, h = cv.clientHeight;
  const tile = paintWood(Math.max(600, Math.round(w)), 900, 977);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let y = 0; y < h; y += 900) g.drawImage(tile, 0, y);
};
export function WoodCanvas({ className = "" }: { className?: string }) {
  return <canvas ref={usePainted(paintTheWood)} className={`tex-wood ${className}`} aria-hidden="true" />;
}
