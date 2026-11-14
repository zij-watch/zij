"use client";

// The tour of Explore, played: a dimmed layer over the page with one piece cut out of it and lit, a
// card beside that piece, and a drawn pointer that shows the gesture. The steps are in lib/tour.ts.
//
// The lit piece moves (the area's menu follows the map, Results arrive when their data does), so the
// cut-out, the card and the line between them are placed every frame, straight onto the elements:
// nothing here re-renders while the map flies. Outside the lit piece the page does not take clicks;
// inside it the page is live, unless the step is locked.

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { TOUR, type Act } from "@/lib/tour";
import type { AppState } from "@/lib/url";
import type { Insets } from "./AreaMenu";
import Paper from "./Paper";

interface Props {
  step: number;
  onStep: (step: number) => void;
  onEnd: (finished: boolean) => void;
  onState: (state: Partial<AppState>) => void; // the whole state the step wants: what it leaves out is default
  map: MapLibreMap | null;
  areas: { id: string; name: string; box: [number, number, number, number] }[];
  insets: Insets; // the map left free by the papers
  touch: boolean;
}

interface Rect { l: number; t: number; r: number; b: number }
interface Point { x: number; y: number }
type Side = "right" | "left" | "bottom" | "top" | "inside" | "none";

const GAP = 20; // between the lit piece and the card
const EDGE = 12; // between the card and the window
const MOVE_MS = 460;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const shown = (e: Element) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
};

export default function Tour({ step, onStep, onEnd, onState, map, areas, insets, touch }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const hole = useRef<HTMLDivElement>(null);
  const blocks = useRef<(HTMLDivElement | null)[]>([]);
  const card = useRef<HTMLDivElement>(null);
  const lead = useRef<HTMLSpanElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const cursorLabel = useRef<HTMLSpanElement>(null);
  const sketch = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const current = TOUR[step];
  const first = step === 0, last = step === TOUR.length - 1;
  const latest = useRef({ step, onStep, onEnd, onState, map, areas, insets, touch });
  latest.current = { step, onStep, onEnd, onState, map, areas, insets, touch };
  // What the placing reads. The lit piece can change inside a step (the timeline opens), so it is not the step's alone.
  const lit = useRef<{ target: string | null; side: Side | null; rect: Rect | null; had: boolean }>({ target: current.target, side: null, rect: null, had: false });
  const moving = useRef<ReturnType<typeof setTimeout> | null>(null);

  const free = (): Rect => {
    const i = latest.current.insets;
    return { l: i.left, t: i.top, r: window.innerWidth - i.right, b: window.innerHeight - i.bottom };
  };
  /** The cut-out glides to its next place, then follows it frame by frame. */
  const glideHole = () => {
    layer.current?.classList.add("is-moving");
    if (moving.current) clearTimeout(moving.current);
    moving.current = setTimeout(() => layer.current?.classList.remove("is-moving"), MOVE_MS + 60);
  };
  const light = (target: string | null) => {
    lit.current = { target, side: null, rect: null, had: lit.current.had };
    glideHole();
  };

  // ------------------------------------------------------------ placing, every frame
  useEffect(() => {
    let frame = 0;
    const set = (element: HTMLElement | null, r: Rect) => {
      if (!element) return;
      const text = `left:${r.l}px;top:${r.t}px;width:${Math.max(0, r.r - r.l)}px;height:${Math.max(0, r.b - r.t)}px`;
      if (element.dataset.at !== text) { element.dataset.at = text; element.style.cssText = text; }
    };
    const place = () => {
      frame = requestAnimationFrame(place);
      const holder = card.current, cut = hole.current;
      if (!holder || !cut) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const now = lit.current;
      const step = TOUR[latest.current.step];

      // The lit piece: every part of the target that is on screen, as one rectangle.
      let found: Rect | null = null;
      for (const token of now.target ? now.target.split(",").map((t) => t.trim()) : []) {
        const parts: Rect[] = token === "map" ? [free()]
          : [...document.querySelectorAll(token)].filter(shown).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
        for (const p of parts) found = found ? { l: Math.min(found.l, p.l), t: Math.min(found.t, p.t), r: Math.max(found.r, p.r), b: Math.max(found.b, p.b) } : p;
      }
      // Not on the page yet (its data is on the way): stay where the light was.
      const rect: Rect | null = found
        ? { l: Math.max(4, Math.round(found.l - 6)), t: Math.max(4, Math.round(found.t - 6)), r: Math.min(vw - 4, Math.round(found.r + 6)), b: Math.min(vh - 4, Math.round(found.b + 6)) }
        : now.rect;
      if (Boolean(rect) !== now.had) { now.had = Boolean(rect); glideHole(); }
      now.rect = rect;
      const h: Rect = rect ?? { l: vw / 2, t: vh / 2, r: vw / 2, b: vh / 2 };
      set(cut, h);
      cut.classList.toggle("is-none", !rect);

      // The page takes clicks only inside the lit piece.
      const open = rect && !step.locked;
      const walls: Rect[] = open
        ? [{ l: 0, t: 0, r: vw, b: h.t }, { l: 0, t: h.b, r: vw, b: vh }, { l: 0, t: h.t, r: h.l, b: h.b }, { l: h.r, t: h.t, r: vw, b: h.b }]
        : [{ l: 0, t: 0, r: vw, b: vh }, { l: 0, t: 0, r: 0, b: 0 }, { l: 0, t: 0, r: 0, b: 0 }, { l: 0, t: 0, r: 0, b: 0 }];
      walls.forEach((w, i) => set(blocks.current[i], w));

      // The card: beside the lit piece where there is room, else on it, in a corner.
      const cw = holder.offsetWidth, ch = holder.offsetHeight;
      const cx = (h.l + h.r) / 2, cy = (h.t + h.b) / 2;
      const fits: Record<Exclude<Side, "inside" | "none">, boolean> = {
        right: h.r + GAP + cw <= vw - EDGE, left: h.l - GAP - cw >= EDGE,
        bottom: h.b + GAP + ch <= vh - EDGE, top: h.t - GAP - ch >= EDGE,
      };
      // Once it has a side it keeps it while it fits, so it does not hop about as the piece moves.
      let side: Side = !rect ? "none" : step.inside || now.side === "inside" ? "inside" : now.side && now.side !== "none" && fits[now.side] ? now.side
        : (["right", "left", "bottom", "top"] as const).find((s) => fits[s]) ?? "inside";
      // A piece as wide as the window (the timeline, a phone's sheets) wants the card over or under it.
      if (rect && !step.inside && (now.side === null || now.side === "none") && h.r - h.l > vw * 0.6) side = fits.top ? "top" : fits.bottom ? "bottom" : side;
      now.side = side;
      let x = (vw - cw) / 2, y = Math.max(EDGE, (vh - ch) * 0.42);
      if (side === "right") { x = h.r + GAP; y = cy - ch / 2; }
      if (side === "left") { x = h.l - GAP - cw; y = cy - ch / 2; }
      if (side === "bottom") { x = cx - cw / 2; y = h.b + GAP; }
      if (side === "top") { x = cx - cw / 2; y = h.t - GAP - ch; }
      if (side === "inside") {
        x = h.l + 28;
        y = step.inside === "top-left" ? h.t + 28 : h.b - ch - 28;
        // It would hide most of a small piece (a phone's map): it lies past it instead, on the dimmed page.
        if (ch > (h.b - h.t) * 0.6) y = vh - h.b > h.t ? Math.max(h.b + GAP, vh - EDGE - ch) : EDGE;
      }
      x = Math.round(clamp(x, EDGE, vw - EDGE - cw));
      y = Math.round(clamp(y, EDGE, vh - EDGE - ch));
      const at = `${x}px ${y}px`;
      if (holder.style.translate !== at) holder.style.translate = at;

      // A hairline from the card to the piece it speaks of.
      const line = lead.current, end = dot.current;
      if (line && end) {
        const beside = side === "right" || side === "left", stacked = side === "top" || side === "bottom";
        line.classList.toggle("is-off", !beside && !stacked);
        end.classList.toggle("is-off", !beside && !stacked);
        if (beside) {
          const ly = Math.round(clamp(cy, y + 24, y + ch - 24));
          const [from, to] = side === "right" ? [h.r, x] : [x + cw, h.l];
          set(line, { l: from, t: ly, r: to, b: ly + 1 });
          set(end, { l: (side === "right" ? h.r : h.l) - 4, t: ly - 4, r: (side === "right" ? h.r : h.l) + 4, b: ly + 4 });
        } else if (stacked) {
          const lx = Math.round(clamp(cx, x + 24, x + cw - 24));
          const [from, to] = side === "bottom" ? [h.b, y] : [y + ch, h.t];
          set(line, { l: lx, t: from, r: lx + 1, b: to });
          set(end, { l: lx - 4, t: (side === "bottom" ? h.b : h.t) - 4, r: lx + 4, b: (side === "bottom" ? h.b : h.t) + 4 });
        }
      }
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ------------------------------------------------------------ a step: its state, then its gestures
  useEffect(() => {
    const stepNow = TOUR[step];
    const token = { dead: false };
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hand = cursor.current, box = sketch.current;
    let state: Partial<AppState> = { ...stepNow.state };
    light(stepNow.target);
    latest.current.onState(state);
    primary.current?.focus({ preventScroll: true });

    const until = async <T,>(find: () => T | null, ms: number): Promise<T | null> => {
      for (let waited = 0; waited <= ms && !token.dead; waited += 120) {
        const got = find();
        if (got) return got;
        await sleep(120);
      }
      return null;
    };
    /** Where on screen `on` is, and the element there if it is one. */
    const locate = (on: string): { at: Point; element: HTMLElement | null } | null => {
      if (on.startsWith("label:")) {
        const area = latest.current.areas.find((a) => a.id === on.slice(6));
        if (!area) return null;
        const f = free();
        const inside = (p: Point) => p.x > f.l + 20 && p.x < f.r - 20 && p.y > f.t + 20 && p.y < f.b - 20;
        const tag = [...document.querySelectorAll<HTMLElement>(".map-label")].find((e) => e.textContent === area.name && shown(e));
        if (tag) {
          const r = tag.getBoundingClientRect();
          const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          if (inside(at)) return { at, element: null };
        }
        const m = latest.current.map;
        if (!m) return null;
        const corner = m.getContainer().getBoundingClientRect();
        const p = m.project([(area.box[0] + area.box[2]) / 2, (area.box[1] + area.box[3]) / 2]);
        const at = { x: p.x + corner.left, y: p.y + corner.top };
        return inside(at) ? { at, element: null } : null;
      }
      const element = [...document.querySelectorAll<HTMLElement>(on)].find(shown);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { at: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, element };
    };
    const glide = async (to: Point, label: string, ms?: number) => {
      if (!hand) return;
      if (!hand.classList.contains("is-on")) {
        // The pointer sets out from the card, as if handed over.
        const from = card.current?.getBoundingClientRect();
        hand.style.transitionDuration = "0ms";
        hand.style.transform = from ? `translate(${Math.round(from.left + from.width / 2)}px, ${Math.round(from.bottom - 40)}px)` : `translate(${to.x}px, ${to.y + 80}px)`;
        void hand.offsetWidth;
        hand.classList.add("is-on");
      }
      if (cursorLabel.current) cursorLabel.current.textContent = label;
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(hand.style.transform);
      const far = m ? Math.hypot(to.x - Number(m[1]), to.y - Number(m[2])) : 400;
      const time = ms ?? Math.round(clamp(far * 1.5, 520, 1100));
      hand.style.transitionDuration = `${time}ms`;
      hand.style.transform = `translate(${Math.round(to.x)}px, ${Math.round(to.y)}px)`;
      await sleep(time + 140);
    };
    const click = async () => {
      if (!hand) return;
      hand.classList.add("is-down", "is-click");
      await sleep(190);
      hand.classList.remove("is-down");
      setTimeout(() => hand.classList.remove("is-click"), 420);
    };
    const patch = (more: Partial<AppState> | undefined) => {
      if (!more) return;
      state = { ...state, ...more };
      latest.current.onState(state);
    };

    const play = async (act: Act) => {
      if (act.kind === "scroll") {
        if (still) return;
        const element = await until(() => { const e = document.querySelector<HTMLElement>(act.on); return e && e.querySelector(".result") && e.scrollHeight > e.clientHeight + 80 ? e : null; }, 6000);
        if (!element || token.dead) return;
        await sleep(900);
        if (token.dead) return;
        element.scrollTo({ top: act.by, behavior: "smooth" });
        await sleep(1700);
        if (!token.dead) element.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (act.kind === "press") {
        const found = await until(() => locate(act.on), act.on.startsWith("label:") ? 3500 : 6000);
        if (token.dead) return;
        if (found && !still) {
          await glide(found.at, act.label ?? (latest.current.touch ? "Tap" : "Click"));
          if (token.dead) return;
          await click();
        }
        // Some things only the page's own button can do (the timeline's Play).
        if (act.real && found?.element && !still) found.element.click();
        patch(act.patch);
        if (act.then !== undefined) light(act.then);
        await sleep(still ? 0 : act.hold ?? 900);
        return;
      }
      // A drag: the box is drawn where the shape lies on the map, so the real one lands under it.
      const m = latest.current.map;
      const f = free();
      let a: Point = { x: (f.l + f.r) / 2 - 120, y: (f.t + f.b) / 2 - 80 }, b: Point = { x: a.x + 240, y: a.y + 160 };
      if (m) {
        const corner = m.getContainer().getBoundingClientRect();
        const nw = m.project([act.shape[0], act.shape[3]]), se = m.project([act.shape[2], act.shape[1]]);
        const p = { x: nw.x + corner.left, y: nw.y + corner.top }, q = { x: se.x + corner.left, y: se.y + corner.top };
        if (q.x - p.x > 60 && q.y - p.y > 40 && p.x > f.l && q.x < f.r && p.y > f.t && q.y < f.b) { a = p; b = q; }
      }
      if (!still && hand && box) {
        await glide(a, latest.current.touch ? "Drag" : "Right-drag");
        if (token.dead) return;
        hand.classList.add("is-down");
        box.style.cssText = `left:${a.x}px;top:${a.y}px;width:0;height:0;transition-duration:0ms`;
        void box.offsetWidth;
        box.classList.add("is-on");
        box.style.cssText = `left:${a.x}px;top:${a.y}px;width:${b.x - a.x}px;height:${b.y - a.y}px;transition-duration:1200ms`;
        await glide(b, latest.current.touch ? "Drag" : "Right-drag", 1200);
        hand.classList.remove("is-down");
        await sleep(260);
        if (token.dead) return;
      }
      patch(act.patch);
      await sleep(still ? 0 : 500);
      box?.classList.remove("is-on");
      await sleep(still ? 0 : act.hold ?? 900);
    };

    void (async () => {
      if (!stepNow.acts?.length) return;
      await sleep(still ? 0 : 850); // the light arrives first
      for (const act of stepNow.acts) {
        if (token.dead) return;
        await play(act);
      }
      if (!token.dead) hand?.classList.remove("is-on", "is-down");
    })();
    return () => {
      token.dead = true;
      hand?.classList.remove("is-on", "is-down", "is-click");
      box?.classList.remove("is-on");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ------------------------------------------------------------ keys
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const now = latest.current;
      const active = document.activeElement;
      const ours = !active || active === document.body || Boolean(card.current?.contains(active));
      // A menu or a dialog opened from the lit piece closes first.
      if (event.key === "Escape" && !document.querySelector(".ui-pop, .ui-dialog, .ui-menu")) return now.onEnd(false);
      if (!ours) return;
      if (event.key === "ArrowRight") { event.preventDefault(); if (now.step < TOUR.length - 1) now.onStep(now.step + 1); else now.onEnd(true); }
      if (event.key === "ArrowLeft" && now.step > 0) { event.preventDefault(); now.onStep(now.step - 1); }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (moving.current) clearTimeout(moving.current);
    };
  }, []);

  return (
    <div ref={layer} className={`tour-layer${first ? " is-welcome" : ""}`}>
      {[0, 1, 2, 3].map((i) => <div key={i} ref={(e) => { blocks.current[i] = e; }} className="tour-block" aria-hidden="true" />)}
      <div ref={hole} className="tour-hole is-none" aria-hidden="true" />
      <span ref={lead} className="tour-lead" aria-hidden="true" />
      <span ref={dot} className="tour-lead-dot" aria-hidden="true" />
      <div ref={sketch} className="tour-sketch" aria-hidden="true" />
      <div ref={card} className="tour-card-holder">
        <Paper as="section" kind="card" seed="tour" className="tour-card" role="dialog" aria-label="A tour of Explore">
          <span className="pin" style={{ left: "50%", top: 12 }} aria-hidden="true" />
          <div key={step} className="tour-body" aria-live="polite">
            <p className="plate-mark">{first ? "A one-minute tour" : `Tour · ${step} of ${TOUR.length - 1}`}</p>
            <h2>{current.title}</h2>
            <p>{touch && current.textTouch ? current.textTouch : current.text}</p>
            {current.try && !current.locked && <p className="tour-try">{touch ? current.try.replace("press", "tap") : current.try}</p>}
          </div>
          <div className="tour-acts">
            {!first && <button type="button" className="catchword" onClick={() => onStep(step - 1)}>Back</button>}
            <button ref={primary} type="button" className="stamp" onClick={() => (last ? onEnd(true) : onStep(step + 1))}>
              {first ? "Show me around" : last ? "Start exploring" : "Next"}
            </button>
            {!first && (
              <span className="tour-dots" aria-hidden="true">
                {TOUR.slice(1).map((s, i) => <i key={s.title} className={i + 1 === step ? "is-now" : i + 1 < step ? "is-done" : ""} />)}
              </span>
            )}
            {!last && <button type="button" className="catchword tour-skip" onClick={() => onEnd(false)}>{first ? "Not now" : "Skip"}</button>}
          </div>
        </Paper>
      </div>
      <div ref={cursor} className="tour-cursor" aria-hidden="true">
        <i className="tour-ripple" />
        <svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15 9.2-6.6 1.3 4 7.2-2.7 1.5-4-7.3L5.2 19z" /></svg>
        <span ref={cursorLabel} className="tour-cursor-label" />
      </div>
    </div>
  );
}
