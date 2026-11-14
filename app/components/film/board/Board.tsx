"use client";

// The second film (/studio/film/v2): one continuous camera take across a board, drawn from the real
// app one frame at a time. docs/event/FILM.md says how it is made and from what.
//
// window.__film.seek(t) draws the exact frame for the time t and resolves when the page is still.
// The board is the landing page's night desk with seven papers pinned on it and a brass thread from
// pin to pin; the camera is a transform on the board (lib/film/board.ts). The layers move at slightly
// different rates: the desk least, the papers, then the pins and the thread; the lamp's light follows
// the camera a little behind, and the papers' shadows turn with it. Papers other than the one in
// focus are softened, more the further they are from the middle of the frame. Each paper carries
// a short title in ink; the captions are a separate track, not in the picture.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { loadArea, loadIndex, type Area, type Index } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Polygon } from "@/lib/fit/cells";
import { BLUR, blurAt, blurOf, camAt, CHUNKS, lampAt, layerTransform, pinsOf, shadowOf, slideAt, SPOTS, THREAD, threadDrawn, toScreen, type Cam, type Spot } from "@/lib/film/board";
import type { Cue } from "@/lib/film/srt";
import { clamp, DURATION, FPS, FRAMES, HEIGHT, lerp, move, PRESET, SCENES, T, WIDTH } from "@/lib/film/timeline";
import { paintWood } from "@/lib/film/wood";
import { useAppState } from "@/lib/url";
import { TooltipProvider } from "../../ui";
import { FilmContext, frame, useReady, type Driver, type FilmHandle } from "../kit";
import type { ProofNumbers } from "../Proof";
import { OffstageDownloads, SealCard, TakePaper, type Files } from "./Cards";
import { JumpPaper, LinkPaper, ProofPaper } from "./Charts";
import { AreaPaper, DayPaper } from "./Maps";

interface Loaded { index: Index; delta: Area; drawn: Area; country: string; shape: Polygon; day: string; dayResult: DayResult }

const PARTS = ["data", "fonts", "desk", "jump", "link", "area", "day", "take"];
// How fast each layer moves against the papers.
const DESK_F = 0.965, PIN_F = 1.012;
// The desk, in world pixels: wider than the board, so the frame never runs off it.
const DESK = { x: -800, y: -1200, w: 9200, h: 5200 };

/** The desk: the landing page's wood in the Night colours, darkened to a desk at night, painted once. */
export function Desk() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    paintWood(c, DESK.w, DESK.h, 1811);
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(0, 0, 0, 0.3)";
    g.fillRect(0, 0, DESK.w, DESK.h);
    setPainted(true);
  }, []);
  useReady("desk", painted);
  return <canvas ref={canvas} className="board-desk" style={{ left: DESK.x, top: DESK.y, width: DESK.w, height: DESK.h }} aria-hidden="true" />;
}

/** One paper on the board: pinned and turned a little, its shadow cast away from the lamp, softened when out of focus. */
function OnBoard({ spot, cam, lamp, t, children }: { spot: Spot; cam: Cam; lamp: [number, number]; t: number; children: ReactNode }) {
  const [sx, sy] = shadowOf(spot.n, cam, lamp);
  const blur = blurOf(spot.n, t, cam) / cam.z; // the blur is asked for in frame pixels
  return (
    <section className="board-paper"
      style={{
        left: spot.x, top: spot.y, width: spot.w, height: spot.h,
        transformOrigin: `${spot.pin[0]}px ${spot.pin[1]}px`, transform: `rotate(${spot.rot}deg)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
        ["--sx" as string]: `${sx.toFixed(2)}px`, ["--sy" as string]: `${sy.toFixed(2)}px`,
      } as CSSProperties}>
      {children}
    </section>
  );
}

export default function Board({ cues, validation, seal, proof }: { cues: Cue[]; validation: string; seal: string; proof: ProofNumbers | null }) {
  const [state] = useAppState();
  const [t, setT] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [files, setFiles] = useState<Files | null>(null);
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
    const debug = (window as { __filmDebug?: boolean }).__filmDebug;
    const t0 = performance.now();
    flushSync(() => setT(at));
    if (debug) console.log(`seek ${at}: rendered in ${Math.round(performance.now() - t0)} ms`);
    await frame(); // the app's own components have run their effects
    if (debug) console.log(`seek ${at}: frame at ${Math.round(performance.now() - t0)} ms`);
    let k = 0;
    for (const fn of [...drivers.current]) {
      await fn(at);
      if (debug) console.log(`seek ${at}: driver ${k++} done at ${Math.round(performance.now() - t0)} ms`);
    }
    await frame();
    await frame(); // and the browser has painted
    if (debug) console.log(`seek ${at}: painted at ${Math.round(performance.now() - t0)} ms`);
    return { t: at, warnings: [...warnings.current] };
  }, []);

  useEffect(() => {
    const handle: FilmHandle = {
      fps: FPS, duration: DURATION, frames: FRAMES, width: WIDTH, height: HEIGHT, scenes: SCENES, cues, chunks: CHUNKS, proof,
      subframes: BLUR.subframes, shutter: BLUR.shutter, blurAt, slideAt,
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
    Promise.all(['600 20px "Cormorant Garamond"', '500 20px "Cormorant Garamond"', "400 20px Amiri", "700 20px Amiri", "italic 400 20px Amiri"].map((font) => document.fonts.load(font)))
      .then(() => document.fonts.ready).then(() => ready("fonts", true));
  }, [ready]);

  // ---------------------------------------------------------------- looking at it by hand

  useEffect(() => {
    const size = () => setFit(Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT));
    size();
    window.addEventListener("resize", size);
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
  const onFiles = useCallback((next: Files) => setFiles(next), []);
  const cam = camAt(t);
  const lamp = lampAt(t, cam);
  const lampUp = move(t, 0, T.lampUp);
  const drawn = threadDrawn(t);
  // The thread's shadow falls away from the lamp, as the papers' do.
  const [tx, ty] = (() => {
    const mid = toScreen(cam, [cam.x, cam.y]);
    const dx = mid[0] - lamp[0], dy = mid[1] - lamp[1], d = Math.hypot(dx, dy) || 1;
    return [(dx / d) * 5, (dy / d) * 5];
  })();

  const content = (n: number): ReactNode => {
    if (!loaded) return null;
    switch (n) {
      case 1: return <JumpPaper area={loaded.delta} />;
      case 2: return <LinkPaper area={loaded.delta} />;
      case 3: return proof ? <ProofPaper svg={validation} numbers={proof} /> : null;
      case 4: return <AreaPaper index={loaded.index} area={loaded.drawn} country={loaded.country} shape={loaded.shape} />;
      case 5: return <DayPaper area={loaded.drawn} country={loaded.country} shape={loaded.shape} day={loaded.day} dayResult={loaded.dayResult} />;
      case 6: return <TakePaper files={files} />;
      default: return <SealCard seal={seal} />;
    }
  };

  return (
    <FilmContext.Provider value={context}>
      <TooltipProvider>
        <div className="film board" data-theme="night">
          <div className="film-stage" style={{ transform: `scale(${fit})` }}>
            <div className="board-layer" style={{ transform: layerTransform(cam, DESK_F) }}>
              <Desk />
            </div>
            <div className="board-layer board-papers" data-theme="folio" style={{ transform: layerTransform(cam) }}>
              {SPOTS.map((spot) => <OnBoard key={spot.n} spot={spot} cam={cam} lamp={lamp} t={t}>{content(spot.n)}</OnBoard>)}
            </div>
            <div className="board-layer board-pins" style={{ transform: layerTransform(cam, PIN_F) }}>
              <svg className="board-thread" width="1" height="1" aria-hidden="true">
                <path className="board-thread-shadow" d={THREAD.d} transform={`translate(${tx.toFixed(2)} ${ty.toFixed(2)})`}
                  strokeDasharray={`${THREAD.length} ${THREAD.length}`} strokeDashoffset={THREAD.length - drawn} />
                <path className="board-thread-line" d={THREAD.d} strokeDasharray={`${THREAD.length} ${THREAD.length}`} strokeDashoffset={THREAD.length - drawn} />
              </svg>
              {SPOTS.flatMap((spot) => pinsOf(spot).map(([x, y], k) => <i key={`${spot.n}-${k}`} className={k ? "board-pin is-small" : "board-pin"} style={{ left: x, top: y }} aria-hidden="true" />))}
            </div>
            <div className="board-light" aria-hidden="true"
              style={{ background: `radial-gradient(1750px 1300px at ${(lamp[0] + 90).toFixed(1)}px ${(lamp[1] + 90).toFixed(1)}px, #fff 0%, color-mix(in srgb, var(--flame) 14%, #fff) 26%, color-mix(in srgb, var(--wood) 22%, #fff) 56%, color-mix(in srgb, var(--wood) 42%, #fff) 80%, color-mix(in srgb, var(--wood) 56%, #fff) 100%)` }} />
            <div className="board-glow" aria-hidden="true"
              style={{ background: `radial-gradient(1050px 800px at ${(lamp[0] + 90 - 168).toFixed(1)}px ${(lamp[1] + 90 - 126).toFixed(1)}px, color-mix(in srgb, var(--flame) 24%, transparent), color-mix(in srgb, var(--flame) 7%, transparent) 55%, transparent 76%)` }} />
            <div className="film-layer film-dark" style={{ opacity: lerp(0.62, 0, lampUp) }} aria-hidden="true" />
            {(addressProblem ?? problem) && <p className="film-problem" role="alert">{addressProblem ?? problem}</p>}
          </div>
          {loaded && <OffstageDownloads onFiles={onFiles} />}
        </div>
      </TooltipProvider>
    </FilmContext.Provider>
  );
}
