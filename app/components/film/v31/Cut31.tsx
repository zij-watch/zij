"use client";

// The film v3.1 (/studio/film/v31): v3's story to Yassen's take (lib/film/v31.ts, docs/event/FILM.md).
// NASA's picture of the Delta fills the frame, then is seen as a printed photo on the desk; its dots
// fly to the record sheet; one brass string, held by flat tacks, leads from sheet to sheet; at the
// end the sheets slide together along it and are bound into a book with the Seal on its cover.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { loadArea, type Area } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Polygon } from "@/lib/fit/cells";
import type { Cue } from "@/lib/film/srt";
import { clamp, FPS, HEIGHT, lerp, move, PRESET, WIDTH } from "@/lib/film/timeline";
import { layerTransform, type Timing } from "@/lib/film/v3";
import { CHUNKS31, DURATION31, FRAMES31, LASSO, makeCut31, placeOf, S31, STILL31 } from "@/lib/film/v31";
import { useAppState } from "@/lib/url";
import { areaVerdict, standing } from "@/lib/verdict";
import { TooltipProvider } from "../../ui";
import { Desk } from "../board/Board";
import { FilmContext, frame, type Driver, type FilmHandle } from "../kit";
import { Finale, type Findings } from "../v3/Finale";
import { Machine, type Trials } from "../v3/Machine";
import { MapSheet } from "../v3/MapSheet";
import { Book } from "./Book";
import { Photo } from "./Photo";
import { Record31 } from "./Record31";

interface Loaded { delta: Area; drawn: Area; country: string; shape: Polygon; day: string; dayResult: DayResult; fitMs: number }

const PARTS = ["data", "fonts", "desk", "photo", "record", "map"];
const DESK_F = 0.965;

export default function Cut31({ cues, seal, timing, trials, findings }: { cues: Cue[]; seal: string; timing: Timing; trials: Trials; findings: Findings }) {
  const [state] = useAppState();
  const [t, setT] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fit, setFit] = useState(1);
  const drivers = useRef(new Set<Driver>());
  const parts = useRef(new Map<string, boolean>());
  const warnings = useRef<string[]>([]);
  const cut = useMemo(() => makeCut31(timing), [timing]);
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
    const at = clamp(Number(time) || 0, 0, DURATION31);
    warnings.current = [];
    flushSync(() => setT(at));
    await frame();
    for (const fn of [...drivers.current]) await fn(at);
    await frame();
    await frame();
    return { t: at, warnings: [...warnings.current] };
  }, []);

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
    const handle: FilmHandle & { facts: unknown } = {
      fps: FPS, duration: DURATION31, frames: FRAMES31, width: WIDTH, height: HEIGHT, scenes: cut.scenes, cues, chunks: CHUNKS31, stillFrom: STILL31,
      proof: { raw: trials.raw, zij: trials.zij, areas: 0, train: [0, 0] },
      subframes: 12, shutter: 1 / 60, blurAt: cut.blurAt, slideAt: cut.slideAt, facts,
      ready: gate.promise.then(() => seek(0)).then(() => { document.documentElement.dataset.film = "ready"; }),
      seek,
    };
    window.__film = handle;
    document.documentElement.dataset.film = "loading";
    return () => {
      delete window.__film;
    };
  }, [seek, cues, gate, cut, facts, trials]);

  const shapeKey = state.shape && !Array.isArray(state.shape) ? JSON.stringify(state.shape) : "";
  const day = state.day;
  const addressProblem = !shapeKey || !day ? "The film needs a drawn box and a day in the address: ?poly=...&day=YYYY-MM-DD." : null;
  useEffect(() => {
    if (!shapeKey || !day) return;
    let live = true;
    const shape = JSON.parse(shapeKey) as Polygon;
    (async () => {
      const [delta, drawn] = await Promise.all([loadArea(PRESET), resolveDrawn(shape)]);
      // The fit, timed as Explore runs it once the country's cells are in memory.
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
    return () => window.removeEventListener("resize", size);
  }, [seek, gate]);

  const context = useMemo(() => ({ t, drive, ready, warn }), [t, drive, ready, warn]);
  const b = cut.beats;
  const cam = cut.camAt(t);
  // The lamp follows the camera a little behind, as on the board.
  const before = cut.camAt(Math.max(0, t - 0.45));
  const lamp: [number, number] = [960 + (before.x - cam.x) * cam.z - 777, 540 + (before.y - cam.y) * cam.z - 605];
  const lampUp = move(t, 0, 0.3);

  const content = (i: number): ReactNode => {
    if (!loaded) return null;
    if (i === 0) return <Photo b={b} day={loaded.day} dayResult={loaded.dayResult} />;
    if (i === 1) return <Record31 area={loaded.delta} b={b} dayResult={loaded.dayResult} />;
    if (i === 2) return <Machine area={loaded.delta} b={b} trials={trials} />;
    if (i === 3) return <MapSheet area={loaded.drawn} country={loaded.country} shape={loaded.shape} day={loaded.day} dayResult={loaded.dayResult} b={b} fitMs={loaded.fitMs} tagText="fitted live in your browser" coverageAt={b.coverage} lasso={LASSO} />;
    return (
      <>
        <Finale area={loaded.delta} b={b} findings={findings} seal={null} />
        <Book b={b} seal={seal} />
      </>
    );
  };

  // Where each sheet is now: in place, or sliding together to make the book.
  const places = S31.map((_, i) => placeOf(i, t, b));

  return (
    <FilmContext.Provider value={context}>
      <TooltipProvider>
        <div className="film board v3 v31" data-theme="night">
          <div className="film-stage" style={{ transform: `scale(${fit})` }}>
            <div className="board-layer" style={{ transform: layerTransform(cam, DESK_F) }}>
              <Desk />
            </div>
            <div className="board-layer board-papers" data-theme="folio" style={{ transform: layerTransform(cam) }}>
              {S31.map((s, i) => {
                const p = places[i];
                const blur = (1 - cut.focusOf(i, t)) * 3.5 / cam.z;
                return (
                  <section key={s.id} className={`board-paper v31-${s.id}-surface`}
                    style={{
                      left: s.x, top: s.y, width: s.w, height: s.h, transformOrigin: "50% 50%",
                      transform: `translate(${p.dx.toFixed(2)}px, ${p.dy.toFixed(2)}px) rotate(${p.rot.toFixed(3)}deg)`,
                      filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none",
                      ["--sx" as string]: "9px", ["--sy" as string]: "12px",
                    } as CSSProperties}>
                    {content(i)}
                  </section>
                );
              })}
            </div>
            <div className="board-light" aria-hidden="true"
              style={{ background: `radial-gradient(1750px 1300px at ${(lamp[0] + 90).toFixed(1)}px ${(lamp[1] + 90).toFixed(1)}px, #fff 0%, color-mix(in srgb, var(--flame) 14%, #fff) 26%, color-mix(in srgb, var(--wood) 22%, #fff) 56%, color-mix(in srgb, var(--wood) 42%, #fff) 80%, color-mix(in srgb, var(--wood) 56%, #fff) 100%)`, opacity: lerp(0.35, 1, move(t, b.pull[0], b.pull[1] - b.pull[0])) }} />
            <div className="board-glow" aria-hidden="true"
              style={{ background: `radial-gradient(1050px 800px at ${(lamp[0] + 90 - 168).toFixed(1)}px ${(lamp[1] + 90 - 126).toFixed(1)}px, color-mix(in srgb, var(--flame) 24%, transparent), color-mix(in srgb, var(--flame) 7%, transparent) 55%, transparent 76%)` }} />
            <div className="film-layer film-dark" style={{ opacity: lerp(0.4, 0, lampUp) }} aria-hidden="true" />
            {(addressProblem ?? problem) && <p className="film-problem" role="alert">{addressProblem ?? problem}</p>}
          </div>
        </div>
      </TooltipProvider>
    </FilmContext.Provider>
  );
}
