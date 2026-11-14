"use client";

// The third film (/studio/film/v3): three surfaces in close shots on the night desk, joined by two
// short camera glides (lib/film/v3.ts, docs/event/FILM.md). The same handle as the board's: the
// renderer seeks each frame, and asks for motion blur only on the glides.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { loadArea, type Area } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Polygon } from "@/lib/fit/cells";
import { CHUNKS } from "@/lib/film/board";
import type { Cue } from "@/lib/film/srt";
import { clamp, DURATION, FPS, FRAMES, HEIGHT, lerp, move, PRESET, WIDTH } from "@/lib/film/timeline";
import { BLUR, blurAt, blurOf, camAt, lampAt, layerTransform, pinAt, SCENES_V3, shadowOf, slideAt, STILL_V3, SURFACES, V3, type Cam, type Surface } from "@/lib/film/v3";
import { useAppState } from "@/lib/url";
import { TooltipProvider } from "../../ui";
import { Desk } from "../board/Board";
import { SealCard } from "../board/Cards";
import { FilmContext, frame, type Driver, type FilmHandle } from "../kit";
import type { ProofNumbers } from "../Proof";
import { MapSheet } from "./MapSheet";
import { RecordSheet, type Trial } from "./RecordSheet";

interface Loaded { delta: Area; drawn: Area; country: string; shape: Polygon; day: string; dayResult: DayResult }

const PARTS = ["data", "fonts", "desk", "record", "map"];
const DESK_F = 0.965, PIN_F = 1.012;

function OnDesk({ surface, i, cam, lamp, t, children }: { surface: Surface; i: number; cam: Cam; lamp: [number, number]; t: number; children: ReactNode }) {
  const [sx, sy] = shadowOf(i, cam, lamp);
  const blur = blurOf(i, t, cam) / cam.z;
  return (
    <section className="board-paper"
      style={{
        left: surface.x, top: surface.y, width: surface.w, height: surface.h,
        transformOrigin: `${surface.pin[0]}px ${surface.pin[1]}px`, transform: `rotate(${surface.rot}deg)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
        ["--sx" as string]: `${sx.toFixed(2)}px`, ["--sy" as string]: `${sy.toFixed(2)}px`,
      } as CSSProperties}>
      {children}
    </section>
  );
}

export default function Cut({ cues, seal, proof, trials, areaError }: { cues: Cue[]; seal: string; proof: ProofNumbers | null; trials: Trial[]; areaError: number }) {
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
    await frame();
    for (const fn of [...drivers.current]) await fn(at);
    await frame();
    await frame();
    return { t: at, warnings: [...warnings.current] };
  }, []);

  useEffect(() => {
    const handle: FilmHandle = {
      fps: FPS, duration: DURATION, frames: FRAMES, width: WIDTH, height: HEIGHT, scenes: SCENES_V3, cues, chunks: CHUNKS, proof, stillFrom: STILL_V3,
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

  const shapeKey = state.shape && !Array.isArray(state.shape) ? JSON.stringify(state.shape) : "";
  const day = state.day;
  const addressProblem = !shapeKey || !day ? "The film needs a drawn box and a day in the address: ?poly=...&day=YYYY-MM-DD." : null;
  useEffect(() => {
    if (!shapeKey || !day) return;
    let live = true;
    const shape = JSON.parse(shapeKey) as Polygon;
    (async () => {
      const [delta, drawn] = await Promise.all([loadArea(PRESET), resolveDrawn(shape)]);
      if (drawn.status !== "ok") throw new Error(drawn.status === "two-countries" ? `The drawn area touches ${drawn.countries.join(" and ")}.` : `The drawn area is outside the regions Zij has processed (${COVERED}).`);
      const dayResult = await loadDay(drawn.area, day);
      if (!dayResult.covered) throw new Error("Single hotspots are not shipped for this area.");
      if (live) setLoaded({ delta, drawn: drawn.area, country: drawn.country, shape, day, dayResult });
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

  const context = useMemo(() => ({ t, drive, ready, warn }), [t, drive, ready, warn]);
  const cam = camAt(t);
  const lamp = lampAt(t, cam);
  const lampUp = move(t, 0, V3.lampUp);

  const content = (i: number): ReactNode => {
    if (!loaded) return null;
    if (i === 0) return <RecordSheet area={loaded.delta} trials={trials} areaError={areaError} />;
    if (i === 1) return <MapSheet area={loaded.drawn} country={loaded.country} shape={loaded.shape} day={loaded.day} dayResult={loaded.dayResult} />;
    return <SealCard seal={seal} team="Zij · zij.watch" at={{ seal: V3.seal, team: V3.team, credit: V3.credit }} />;
  };

  return (
    <FilmContext.Provider value={context}>
      <TooltipProvider>
        <div className="film board v3" data-theme="night">
          <div className="film-stage" style={{ transform: `scale(${fit})` }}>
            <div className="board-layer" style={{ transform: layerTransform(cam, DESK_F) }}>
              <Desk />
            </div>
            <div className="board-layer board-papers" data-theme="folio" style={{ transform: layerTransform(cam) }}>
              {SURFACES.map((surface, i) => <OnDesk key={surface.n} surface={surface} i={i} cam={cam} lamp={lamp} t={t}>{content(i)}</OnDesk>)}
            </div>
            <div className="board-layer board-pins" style={{ transform: layerTransform(cam, PIN_F) }}>
              {SURFACES.map((surface) => {
                const [x, y] = pinAt(surface);
                return <i key={surface.n} className="board-pin" style={{ left: x, top: y }} aria-hidden="true" />;
              })}
            </div>
            <div className="board-light" aria-hidden="true"
              style={{ background: `radial-gradient(1750px 1300px at ${(lamp[0] + 90).toFixed(1)}px ${(lamp[1] + 90).toFixed(1)}px, #fff 0%, color-mix(in srgb, var(--flame) 14%, #fff) 26%, color-mix(in srgb, var(--wood) 22%, #fff) 56%, color-mix(in srgb, var(--wood) 42%, #fff) 80%, color-mix(in srgb, var(--wood) 56%, #fff) 100%)` }} />
            <div className="board-glow" aria-hidden="true"
              style={{ background: `radial-gradient(1050px 800px at ${(lamp[0] + 90 - 168).toFixed(1)}px ${(lamp[1] + 90 - 126).toFixed(1)}px, color-mix(in srgb, var(--flame) 24%, transparent), color-mix(in srgb, var(--flame) 7%, transparent) 55%, transparent 76%)` }} />
            <div className="film-layer film-dark" style={{ opacity: lerp(0.62, 0, lampUp) }} aria-hidden="true" />
            {(addressProblem ?? problem) && <p className="film-problem" role="alert">{addressProblem ?? problem}</p>}
          </div>
        </div>
      </TooltipProvider>
    </FilmContext.Provider>
  );
}
