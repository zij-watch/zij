"use client";

// The third film (/studio/film/v3): six shots on four surfaces on the night desk, every beat keyed
// to a word of the voice-over (lib/film/v3.ts, docs/event/FILM.md). The same handle as the board's:
// the renderer seeks each frame, asks for motion blur only on the camera's glides, and checks the
// numbers on screen (window.__film.facts) before any frame is taken.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { loadArea, type Area } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Polygon } from "@/lib/fit/cells";
import { CHUNKS } from "@/lib/film/board";
import type { Cue } from "@/lib/film/srt";
import { clamp, DURATION, FPS, FRAMES, HEIGHT, lerp, move, PRESET, WIDTH } from "@/lib/film/timeline";
import { BLUR, blurOf, lampAt, layerTransform, makeCut, pinAt, shadowOf, SURFACES, type Cam, type Surface, type Timing } from "@/lib/film/v3";
import { useAppState } from "@/lib/url";
import { areaVerdict, standing } from "@/lib/verdict";
import { TooltipProvider } from "../../ui";
import { Desk } from "../board/Board";
import { FilmContext, frame, type Driver, type FilmHandle } from "../kit";
import { Finale, type Findings } from "./Finale";
import { Machine, type Trials } from "./Machine";
import { MapSheet } from "./MapSheet";
import { RecordSheet } from "./RecordSheet";

interface Loaded { delta: Area; drawn: Area; country: string; shape: Polygon; day: string; dayResult: DayResult; fitMs: number }

const PARTS = ["data", "fonts", "desk", "record", "map"];
const DESK_F = 0.965, PIN_F = 1.012;

function OnDesk({ surface, blur, shadow, children }: { surface: Surface; blur: number; shadow: [number, number]; children: ReactNode }) {
  return (
    <section className="board-paper"
      style={{
        left: surface.x, top: surface.y, width: surface.w, height: surface.h,
        transformOrigin: `${surface.pin[0]}px ${surface.pin[1]}px`, transform: `rotate(${surface.rot}deg)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
        ["--sx" as string]: `${shadow[0].toFixed(2)}px`, ["--sy" as string]: `${shadow[1].toFixed(2)}px`,
      } as CSSProperties}>
      {children}
    </section>
  );
}

export default function Cut({ cues, seal, timing, trials, findings }: { cues: Cue[]; seal: string; timing: Timing; trials: Trials; findings: Findings }) {
  const [state] = useAppState();
  const [t, setT] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fit, setFit] = useState(1);
  const drivers = useRef(new Set<Driver>());
  const parts = useRef(new Map<string, boolean>());
  const warnings = useRef<string[]>([]);
  const cut = useMemo(() => makeCut(timing), [timing]);
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

  // The numbers the film shows, read back from what it loaded, for the renderer's checks.
  const facts = useMemo(() => {
    if (!loaded) return null;
    const s = loaded.delta.seasons, k12 = s.year.indexOf(2012), k11 = s.year.indexOf(2011);
    const m = loaded.drawn.this_month;
    const own = m.value_to_date !== null && m.to_date_values ? standing(m.value_to_date, m.to_date_values) : null;
    return {
      tenfold: { modis2011: s.modis[k11], viirs2012: s.viirs[k12] },
      error: { raw: trials.raw, zij: trials.zij, factor: trials.factor },
      ban: findings.ban, since: findings.since,
      rank: { computed: own?.rank ?? null, sentence: areaVerdict(loaded.drawn)?.sentence ?? null },
      fitMs: loaded.fitMs,
    };
  }, [loaded, trials, findings]);

  useEffect(() => {
    const handle: FilmHandle & { facts: unknown; timing: Timing } = {
      fps: FPS, duration: DURATION, frames: FRAMES, width: WIDTH, height: HEIGHT, scenes: cut.scenes, cues, chunks: CHUNKS, proof: { raw: trials.raw, zij: trials.zij, areas: 0, train: [0, 0] },
      subframes: BLUR.subframes, shutter: BLUR.shutter, blurAt: cut.blurAt, slideAt: cut.slideAt, facts, timing,
      ready: gate.promise.then(() => seek(0)).then(() => { document.documentElement.dataset.film = "ready"; }),
      seek,
    };
    window.__film = handle;
    document.documentElement.dataset.film = "loading";
    return () => {
      delete window.__film;
    };
  }, [seek, cues, gate, cut, facts, timing, trials]);

  const shapeKey = state.shape && !Array.isArray(state.shape) ? JSON.stringify(state.shape) : "";
  const day = state.day;
  const addressProblem = !shapeKey || !day ? "The film needs a drawn box and a day in the address: ?poly=...&day=YYYY-MM-DD." : null;
  useEffect(() => {
    if (!shapeKey || !day) return;
    let live = true;
    const shape = JSON.parse(shapeKey) as Polygon;
    (async () => {
      const [delta, drawn] = await Promise.all([loadArea(PRESET), resolveDrawn(shape)]);
      // The fit, timed as Explore runs it once the country's cells are in memory: from the drawn
      // shape to the area's document (its months, seasons and verdict), in the browser.
      const started = performance.now();
      await resolveDrawn(shape);
      const ms = performance.now() - started;
      if (drawn.status !== "ok") throw new Error(drawn.status === "two-countries" ? `The drawn area touches ${drawn.countries.join(" and ")}.` : `The drawn area is outside the regions Zij has processed (${COVERED}).`);
      const dayResult = await loadDay(drawn.area, day);
      if (!dayResult.covered) throw new Error("Single hotspots are not shipped for this area.");
      if (live) setLoaded({ delta, drawn: drawn.area, country: drawn.country, shape, day, dayResult, fitMs: ms });
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
  const b = cut.beats;
  const cam: Cam = cut.camAt(t);
  const lamp = lampAt(cut, t, cam);
  const lampUp = move(t, 0, 0.35);

  const content = (i: number): ReactNode => {
    if (!loaded) return null;
    if (i === 0) return <RecordSheet area={loaded.delta} b={b} day={loaded.day} dayResult={loaded.dayResult} />;
    if (i === 1) return <Machine area={loaded.delta} b={b} trials={trials} />;
    if (i === 2) return <MapSheet area={loaded.drawn} country={loaded.country} shape={loaded.shape} day={loaded.day} dayResult={loaded.dayResult} b={b} fitMs={loaded.fitMs} />;
    return <Finale area={loaded.delta} b={b} findings={findings} seal={seal} />;
  };
  const team = t < b.team[1] ? 1 - move(t, b.team[1] - 0.15, 0.15) : 0;

  return (
    <FilmContext.Provider value={context}>
      <TooltipProvider>
        <div className="film board v3" data-theme="night">
          <div className="film-stage" style={{ transform: `scale(${fit})` }}>
            <div className="board-layer" style={{ transform: layerTransform(cam, DESK_F) }}>
              <Desk />
            </div>
            <div className="board-layer board-papers" data-theme="folio" style={{ transform: layerTransform(cam) }}>
              {SURFACES.map((surface, i) => (
                <OnDesk key={surface.n} surface={surface} blur={blurOf(cut, i, t, cam) / cam.z} shadow={shadowOf(i, cam, lamp)}>{content(i)}</OnDesk>
              ))}
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
            <div className="film-layer film-dark" style={{ opacity: lerp(0.5, 0, lampUp) }} aria-hidden="true" />
            {team > 0 && <div className="v3-team" style={{ opacity: team }}><p>Team Zij · Cairo</p><p className="v3-challenge">Harmonization of MODIS and VIIRS Hot Spots</p></div>}
            {(addressProblem ?? problem) && <p className="film-problem" role="alert">{addressProblem ?? problem}</p>}
          </div>
        </div>
      </TooltipProvider>
    </FilmContext.Provider>
  );
}
