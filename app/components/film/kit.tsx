"use client";

// The film's small kit: the clock every piece reads, the work done by hand after React has drawn
// a frame, and the pieces of paper the scenes are laid out with.

import { createContext, useContext, useEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { clamp, HEIGHT, INK, move, RULE, WIDTH } from "@/lib/film/timeline";

/** Work a scene does by hand for a frame (a chart, a map, an SVG it did not draw itself). */
export type Driver = (t: number) => void | Promise<void>;

interface FilmState {
  t: number;
  drive: (fn: Driver) => () => void;
  /** Tell the film a part is loaded, or not yet. The film is ready when every part is. */
  ready: (part: string, done: boolean) => void;
  /** Something a frame could not wait for: the renderer prints it. */
  warn: (text: string) => void;
}

export const FilmContext = createContext<FilmState>({ t: 0, drive: () => () => {}, ready: () => {}, warn: () => {} });
export const useFilm = () => useContext(FilmContext);
export const useT = () => useContext(FilmContext).t;

/** Run `fn` on every frame, after React has drawn it and the app's own components have settled. */
export function useDriver(fn: Driver): void {
  const { drive } = useFilm();
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => drive((t) => latest.current(t)), [drive]);
}

export function useReady(part: string, done: boolean): void {
  const { ready } = useFilm();
  useEffect(() => {
    ready(part, done);
  }, [ready, part, done]);
}

/** One animation frame from now: the browser has laid out and painted what was asked. */
export const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// ---------------------------------------------------------------- laying things out

/** Shown from `from` up to (not including) `to`; laid out all the time, so nothing loads late.
 *  Never "visible": a piece inside a hidden sheet stays hidden with it. */
export const shown = (t: number, from: number, to = Infinity): CSSProperties => (t >= from && t < to ? {} : { visibility: "hidden" });

/** Text inked in left to right, starting at `from`. */
export function inked(t: number, from: number, dur = INK): CSSProperties {
  const k = move(t, from, dur);
  if (k <= 0) return { visibility: "hidden" };
  return k >= 1 ? {} : { clipPath: `inset(-10% ${((1 - k) * 100).toFixed(3)}% -10% 0)` };
}

/** A piece of paper on the desk: placed by its top left corner, `w` wide before it is scaled. */
export function Sheet({ x, y, w, h, k = 1, rot = 0, dx = 0, dy = 0, className, style, children, ref }:
  { x: number; y: number; w: number; h?: number; k?: number; rot?: number; dx?: number; dy?: number; className?: string; style?: CSSProperties; children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} className={`film-sheet${className ? ` ${className}` : ""}`}
      style={{ left: x, top: y, width: w, height: h, transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${k}) rotate(${rot}deg)`, ...style }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- the ink rule

const RULE_TOP = 28;

/** Where the rule is at time t: how much of its length is drawn (0 to 1) and how far down it has travelled (px). */
export function ruleAt(t: number, at: number): { drawn: number; y: number; on: boolean; done: boolean } {
  const drawn = move(t, at, RULE.draw);
  // It is drawn across near the top of the frame, above every sheet, and leaves past the bottom.
  const y = RULE_TOP + move(t, at + RULE.draw, RULE.sweep) * (HEIGHT + 12 - RULE_TOP);
  return { drawn, y, on: t >= at && t < at + RULE.draw + RULE.sweep, done: t >= at + RULE.draw + RULE.sweep };
}

/** The sheet that leaves: it is kept only below the rule. */
export function ruledOut(t: number, at: number): CSSProperties {
  const r = ruleAt(t, at);
  if (r.done) return { visibility: "hidden" };
  return r.on ? { clipPath: `inset(${r.y.toFixed(2)}px 0 0 0)` } : {};
}

/** The sheet that comes: it is behind the rule, seen only above it. */
export function ruledIn(t: number, at: number): CSSProperties {
  const r = ruleAt(t, at);
  if (t < at) return { visibility: "hidden" };
  return r.on ? { clipPath: `inset(0 0 ${clamp(HEIGHT - r.y, 0, HEIGHT).toFixed(2)}px 0)` } : {};
}

/** The ruled line itself: the manuscript's double rule, brass over a thinner line. */
export function InkRule({ at }: { at: number }) {
  const t = useT();
  const r = ruleAt(t, at);
  if (!r.on) return null;
  return <i className="film-rule" data-theme="night" style={{ top: r.y, width: r.drawn * WIDTH }} aria-hidden="true" />;
}
