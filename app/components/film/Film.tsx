"use client";

// The film (/studio/film): 29.5 seconds drawn from the real app, one frame at a time.
//
// The whole film is one page and one function, window.__film.seek(t): it draws the exact frame for
// the time t in seconds and resolves when the page is still (React has drawn, the charts and maps
// have been set by hand and are idle). The renderer (scripts/film/render.mjs) steps t by 1/30 s
// and photographs each frame. How it is made, and from what: docs/event/FILM.md.
//
// The world is the landing page's night desk under lamp light; the app lies on it as sheets of
// paper. Every chart, map and number is a real component fed the exported data.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { loadArea, loadIndex, type Area, type Index } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Polygon } from "@/lib/fit/cells";
import type { Cue } from "@/lib/film/srt";
import { clamp, DURATION, FPS, FRAMES, HEIGHT, lerp, move, PRESET, push, sceneAt, SCENES, STILL_FROM, T, WIDTH } from "@/lib/film/timeline";
import { paintWood } from "@/lib/film/wood";
import { useAppState } from "@/lib/url";
import { TooltipProvider } from "../ui";
import Atlas from "./Atlas";
import EndCard from "./EndCard";
import { FilmContext, frame, InkRule, inked, shown, type Driver, type FilmHandle } from "./kit";
import Proof, { type ProofNumbers } from "./Proof";
import Record from "./Record";
import Take from "./Take";

interface Loaded { index: Index; delta: Area; drawn: Area; country: string; shape: Polygon; day: string; dayResult: DayResult }

const PARTS = ["data", "fonts", "record", "atlas", "take"];

/** The desk: wood under a lamp that stands off the top left corner of the frame. */
function Desk({ p }: { p: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) paintWood(canvas.current, 2000, 1140, 1811);
  }, []);
  return <canvas ref={canvas} className="film-desk" style={{ transform: `scale(${(1 + 0.014 * p).toFixed(5)})` }} aria-hidden="true" />;
}

export default function Film({ cues, validation, seal, proof }: { cues: Cue[]; validation: string; seal: string; proof: ProofNumbers | null }) {
  const [state] = useAppState();
  const [t, setT] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fit, setFit] = useState(1);
  const drivers = useRef(new Set<Driver>());
  const parts = useRef(new Map<string, boolean>());
  const warnings = useRef<string[]>([]);
  const [gate] = useState(() => {
    let resolve = () => {};
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  });

  // ---------------------------------------------------------------- the clock and the handle

  const drive = useCallback((fn: Driver) => {
    drivers.current.add(fn);
    return () => void drivers.current.delete(fn);
  }, []);
  const warn = useCallback((text: string) => {
    if (!warnings.current.includes(text)) warnings.current.push(text);
  }, []);
  const ready = useCallback((part: string, done: boolean) => {
    parts.current.set(part, done);
    document.documentElement.dataset.filmWaiting = PARTS.filter((p) => !parts.current.get(p)).join(" ");
    if (PARTS.every((p) => parts.current.get(p))) gate.resolve();
  }, [gate]);

  const seek = useCallback(async (time: number) => {
    const at = clamp(Number(time) || 0, 0, DURATION);
    warnings.current = [];
    flushSync(() => setT(at));
    await frame(); // the app's own components have run their effects
    for (const fn of [...drivers.current]) await fn(at);
    await frame();
    await frame(); // and the browser has painted
    return { t: at, warnings: [...warnings.current] };
  }, []);

  useEffect(() => {
    const handle: FilmHandle = {
      fps: FPS, duration: DURATION, frames: FRAMES, width: WIDTH, height: HEIGHT, scenes: SCENES, cues, proof,
      stillFrom: STILL_FROM,
      ready: gate.promise.then(() => seek(0)).then(() => { document.documentElement.dataset.film = "ready"; }),
      seek,
    };
    window.__film = handle;
    document.documentElement.dataset.film = "loading";
    return () => {
      delete window.__film;
    };
  }, [seek, cues, gate, proof]);

  // ---------------------------------------------------------------- what the film needs

  const shapeKey = state.shape && !Array.isArray(state.shape) ? JSON.stringify(state.shape) : "";
  const day = state.day;
  const addressProblem = !shapeKey || !day ? "The film needs a drawn polygon and a day in the address: ?poly=...&day=YYYY-MM-DD." : null;
  useEffect(() => {
    if (!shapeKey || !day) return;
    let live = true;
    const shape = JSON.parse(shapeKey) as Polygon;
    (async () => {
      const [index, delta, drawn] = await Promise.all([loadIndex(), loadArea(PRESET), resolveDrawn(shape)]);
      if (drawn.status !== "ok") throw new Error(drawn.status === "two-countries" ? `The drawn area touches ${drawn.countries.join(" and ")}.` : `The drawn area is outside the regions Zij has processed (${COVERED}).`);
      const dayResult = await loadDay(drawn.area, day);
      if (!dayResult.covered) throw new Error("Single hotspots are not shipped for this area.");
      if (live) setLoaded({ index, delta, drawn: drawn.area, country: drawn.country, shape, day, dayResult });
    })().catch((error: Error) => live && setProblem(error.message));
    return () => {
      live = false;
    };
  }, [shapeKey, day]);
  useEffect(() => ready("data", loaded !== null), [ready, loaded]);
  useEffect(() => {
    // The faces the sheets, the charts and the captions are set in.
    Promise.all(['600 20px "Cormorant Garamond"', '500 20px "Cormorant Garamond"', "400 20px Amiri", "700 20px Amiri", "italic 400 20px Amiri"].map((font) => document.fonts.load(font)))
      .then(() => document.fonts.ready).then(() => ready("fonts", true));
  }, [ready]);

  // ---------------------------------------------------------------- looking at it by hand

  useEffect(() => {
    const size = () => setFit(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT));
    size();
    window.addEventListener("resize", size);
    // ?t=12.3 opens at a time; the arrow keys step a frame (with Shift, a second).
    const initial = Number(new URLSearchParams(window.location.search).get("t"));
    if (initial > 0) void gate.promise.then(() => seek(initial));
    let at = initial > 0 ? initial : 0;
    const key = (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      at = clamp(Math.round((at + step * (event.shiftKey ? 1 : 1 / FPS)) * FPS) / FPS, 0, DURATION);
      void seek(at);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("keydown", key);
    };
  }, [seek, gate]);

  // ---------------------------------------------------------------- the frame at t

  const context = useMemo(() => ({ t, drive, ready, warn }), [t, drive, ready, warn]);
  const p = push(t);
  const scene = sceneAt(t);
  const lamp = move(t, 0, T.lampUp);
  // Three depths: the desk moves least, the sheets most, the lamp's light drifts between them.
  const sheets: CSSProperties = { transform: `scale(${(1 + 0.03 * p).toFixed(5)})` };
  const light: CSSProperties = { transform: `translate(${(-10 * p).toFixed(2)}px, ${(-6 * p).toFixed(2)}px) scale(${(1 + 0.05 * p).toFixed(5)})` };

  return (
    <FilmContext.Provider value={context}>
      <TooltipProvider>
        <div className="film" data-theme="night" data-scene={scene.n}>
          <div className="film-stage" style={{ transform: `scale(${fit})` }}>
            <Desk p={p} />
            <div className="film-layer film-sheets" data-theme="folio" style={sheets}>
              {loaded && <Record area={loaded.delta} />}
              {loaded && proof && <Proof svg={validation} numbers={proof} />}
              {loaded && <Atlas index={loaded.index} area={loaded.drawn} country={loaded.country} shape={loaded.shape} day={loaded.day} dayResult={loaded.dayResult} />}
              {loaded && <Take />}
              <InkRule at={T.proofRule} />
              <InkRule at={T.endRule} />
            </div>
            <div className="film-layer" style={sheets}>
              <EndCard seal={seal} />
            </div>
            <div className="film-layer film-light" style={light} aria-hidden="true" />
            <div className="film-layer film-glow" style={light} aria-hidden="true" />
            <p className="film-corner" style={{ ...shown(t, 0, SCENES[0].to), ...inked(t, T.corner) }}>Team Zij · Harmonization of MODIS and VIIRS Hot Spots</p>
            <div className="film-layer film-dark" style={{ opacity: lerp(0.62, 0, lamp) }} aria-hidden="true" />
            {(addressProblem ?? problem) && <p className="film-problem" role="alert">{addressProblem ?? problem}</p>}
          </div>
        </div>
      </TooltipProvider>
    </FilmContext.Provider>
  );
}
