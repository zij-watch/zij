"use client";

// Papers 4 and 5 of the board: any area and any day. Each is a sheet with the app's own MapView on
// it, drawn at the sheet's own size in pixels; while the camera travels the map is not redrawn, it
// is carried as a picture. Results are the app's own Panel, fed the document the browser fits for
// the drawn polygon (lib/drawnArea.ts), as Explore does. Each map is set for the frame by hand and
// the frame waits until it is idle.

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area, Index } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { useLoading } from "@/lib/download";
import { boundsOf, type Polygon } from "@/lib/fit/cells";
import { BEATS, STORY } from "@/lib/film/board";
import { arrive, clamp, ease, lerp, move, PRESET } from "@/lib/film/timeline";
import { monthSpan } from "@/lib/format";
import type { DayHotspot } from "@/lib/hotspots/day";
import { fitBox, VIEWS, type Box, type View } from "@/lib/map/atlas/camera";
import { setSketch } from "@/lib/map/layers";
import { areaVerdict, dayVerdicts } from "@/lib/verdict";
import Panel from "../../Panel";
import Paper from "../../Paper";
import { frame, shown, useDriver, useFilm, useReady, useT } from "../kit";
import { PaperTitle } from "./Title";

const MapView = dynamic(() => import("../../MapView"), { ssr: false });

/** A map sheet: its title across the top, then the map, 1572 by 766. */
export const MAP_SHEET = { w: 1600, h: 890 };
const MAP = { w: 1572, h: 766 };
const COLUMN = { w: 464, area: 1.4, day: 1.1 }; // Results: the app's column, shown this many times its size

const NONE: DayHotspot[] = [];
const NO_AREAS: Index["areas"] = [];
const noop = () => {};
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
/** Where a place is on the map, for a north-up, untilted view. */
function project(view: View, lon: number, lat: number): [number, number] {
  const world = 512 * 2 ** view.zoom;
  return [MAP.w / 2 + (mercX(lon) - mercX(view.center[0])) * world, MAP.h / 2 + (mercY(lat) - mercY(view.center[1])) * world];
}
/** The view that fits a box into the part of the map Results leave free. */
function fitFree(box: Box, pad: number, kept: number): View {
  const view = fitBox(box, MAP.w - kept, MAP.h, pad);
  return { zoom: view.zoom, center: [view.center[0] + (360 * kept) / (2 * 512 * 2 ** view.zoom), view.center[1]] };
}
/** A paint value of the app's layer at a zoom: a number, or a linear interpolation over zoom. */
function atZoom(value: unknown, zoom: number): number {
  if (typeof value === "number") return value;
  if (!Array.isArray(value) || value[0] !== "interpolate") return 0;
  const stops = value.slice(3) as number[];
  if (zoom <= stops[0]) return stops[1];
  for (let i = 2; i < stops.length; i += 2) if (zoom <= stops[i]) return lerp(stops[i - 1], stops[i + 1], (zoom - stops[i - 2]) / (stops[i] - stops[i - 2]));
  return stops[stops.length - 1];
}

/** The map has drawn all it was asked for: tiles, the atlas's detail cells, the fade of its labels. */
function useIdle() {
  const { warn } = useFilm();
  const loading = useLoading();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = loading !== null;
  }, [loading]);
  return useCallback((map: MapLibreMap, name: string) => new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(patience);
      resolve();
    };
    // Not motion: a limit on waiting. A frame that hits it is reported, not hidden.
    const patience = setTimeout(() => {
      warn(`${name} map was not idle after 20 s`);
      finish();
    }, 20000);
    const wait = () => {
      map.once("idle", async () => {
        if (busy.current) {
          while (busy.current && !done) await frame();
          await frame();
          if (!done) wait();
        } else finish();
      });
      map.triggerRepaint();
    };
    wait();
  }), [warn]);
}

const mapProps = { sky: true, onSelect: noop, drawMode: null, onDraft: noop, onDrawn: noop, chrome: false, interactive: false, follow: false } as const;

function closeOf(shape: Polygon): number {
  const B = BEATS.area;
  return STORY[4] + B.draw + (shape.coordinates[0].length - 1) * B.drawEvery;
}

// ---------------------------------------------------------------- 4. any area

export function AreaPaper({ index, area, country, shape }: { index: Index; area: Area; country: string; shape: Polygon }) {
  const t = useT();
  const { warn } = useFilm();
  const s = STORY[4], B = BEATS.area;
  const idle = useIdle();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [settled, setSettled] = useState(false);
  const results = useRef<HTMLElement>(null);
  const applied = useRef({ view: "", ring: "" });
  const ring = useMemo(() => shape.coordinates[0].slice(0, -1) as [number, number][], [shape]);
  const closeAt = closeOf(shape);
  const preset = index.areas.find((a) => a.id === PRESET) ?? index.areas[0];
  const kept = COLUMN.w * COLUMN.area;
  const views = useMemo(() => ({ wide: fitFree(VIEWS.find((v) => v.id === "egypt")!.box, 40, kept), preset: fitFree(preset.box, 70, kept) }), [preset, kept]);

  const cameraAt = useCallback((time: number): View => {
    const k = move(time, s + B.fly, B.flyFor);
    return { center: [lerp(views.wide.center[0], views.preset.center[0], k), lerp(views.wide.center[1], views.preset.center[1], k)], zoom: lerp(views.wide.zoom, views.preset.zoom, k) };
  }, [views, s, B.fly, B.flyFor]);
  const penAt = useCallback((time: number): { at: [number, number]; ring: [number, number][] | null } => {
    const start = s + B.draw;
    if (time < start || time >= closeAt) return { at: ring[0], ring: null };
    const i = Math.min(ring.length - 1, Math.floor((time - start) / B.drawEvery));
    const k = ease(clamp((time - start - i * B.drawEvery) / B.drawEvery));
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const at: [number, number] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    return { at, ring: [...ring.slice(0, i + 1), at] };
  }, [ring, closeAt, s, B.draw, B.drawEvery]);

  const onMap = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`area map: ${event.error?.message ?? "error"}`));
    setMap(m);
  }, [warn]);
  useEffect(() => {
    if (!map) return;
    let live = true;
    idle(map, "area").then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [map, idle]);
  useReady("area", settled);

  useDriver(async (time) => {
    if (!map) return;
    const view = cameraAt(time);
    const viewKey = `${view.center[0]},${view.center[1]},${view.zoom}`;
    const pen = penAt(time);
    const ringKey = JSON.stringify(pen.ring);
    if (viewKey !== applied.current.view || ringKey !== applied.current.ring) {
      applied.current = { view: viewKey, ring: ringKey };
      map.jumpTo({ center: view.center, zoom: view.zoom });
      setSketch(map, pen.ring);
      await idle(map, "area");
    }
    // The verdict writes itself: the badge is set down, then the sentence is inked line by line.
    const verdict = results.current?.querySelector<HTMLElement>("#paper-verdict .verdict");
    const [badge, sentence] = verdict ? ([...verdict.children] as HTMLElement[]) : [];
    if (!badge || !sentence) return;
    const set = arrive(time, s + B.badge);
    badge.style.opacity = String(Math.min(1, set * 5));
    badge.style.transform = set >= 1 ? "" : `scale(${(1 + 0.2 * (1 - set)).toFixed(4)})`;
    const lineHeight = parseFloat(getComputedStyle(sentence).lineHeight) || 27;
    const lines = Math.max(1, Math.round(sentence.offsetHeight / lineHeight));
    const q = move(time, s + B.verdict, B.verdictFor) * lines, n = Math.min(lines - 1, Math.floor(q)), f = q >= lines ? 1 : q - n;
    const w = sentence.offsetWidth;
    sentence.style.clipPath = q >= lines ? ""
      : `polygon(0 0, ${w}px 0, ${w}px ${n * lineHeight}px, ${f * w}px ${n * lineHeight}px, ${f * w}px ${(n + 1) * lineHeight}px, 0 ${(n + 1) * lineHeight}px)`;
    for (const more of [...verdict!.children].slice(2) as HTMLElement[]) more.style.visibility = q < lines ? "hidden" : "";
  });

  const closed = t >= closeAt;
  const view = cameraAt(t);
  const pen = penAt(t);
  const [penX, penY] = project(view, pen.at[0], pen.at[1]);
  const penSet = arrive(t, s + B.cursor);
  const penLift = move(t, closeAt + 0.05, 0.3);
  const resultsIn = move(t, s + B.results, B.resultsFor);
  const [from, to] = monthSpan(area);
  const verdict = useMemo(() => areaVerdict(area), [area]);
  const noDay = useMemo(() => ({ week: null, month: null }), []);

  return (
    <Paper as="div" kind="sheet" seed="board-area" className="film-mapsheet board-mapsheet">
      <PaperTitle n={4} />
      <div className="film-map">
        <MapView {...mapProps} basemap="zij" date={index.last_full_day} areas={index.areas} selected={closed ? null : preset.id} tags
          shape={closed ? shape : null} hotspots={NONE} view={views.wide} onMap={onMap} />
        <i className="film-cursor" aria-hidden="true"
          style={{ ...shown(t, s + B.cursor, closeAt + 0.4), left: penX, top: penY - 18 * penLift, opacity: Math.min(1, penSet * 4) * (1 - penLift), transform: `translate(-50%, -50%) scale(${(1 + 0.9 * (1 - penSet) + 0.25 * penLift).toFixed(4)})` }} />
        <aside ref={results} className="results film-results" aria-label="Results"
          style={{ ...shown(t, s + B.results), width: COLUMN.w, height: MAP.h / COLUMN.area, transform: `translateX(${((1 - resultsIn) * (kept + 60)).toFixed(2)}px) scale(${COLUMN.area})` }}>
          <header className="results-head slip">
            <div className="results-title">
              <p className="eyebrow">Results</p>
              <h2>{area.name}</h2>
              <span className="results-country">Drawn, {country}</span>
            </div>
          </header>
          <Panel area={area} verdict={verdict} day={null} dayVerdict={noDay} dayResult={null} dayLoading={false}
            onCloseDay={noop} recorded={false} onRecorded={noop} from={from} to={to} month={null} year={null} onMonth={noop} onYear={noop} reportHref={null} />
        </aside>
      </div>
    </Paper>
  );
}

// ---------------------------------------------------------------- 5. any day

interface Marks { viirs: { r: number; opacity: number; stroke: number }; modis: { r: number; stroke: number; opacity: number; halo: number } }

export function DayPaper({ area, country, shape, day, dayResult }: { area: Area; country: string; shape: Polygon; day: string; dayResult: DayResult }) {
  const t = useT();
  const { warn } = useFilm();
  const s = STORY[5], B = BEATS.day;
  const idle = useIdle();
  const [atlas, setAtlas] = useState<MapLibreMap | null>(null);
  const [satellite, setSatellite] = useState<MapLibreMap | null>(null);
  const [marks, setMarks] = useState<Marks | null>(null);
  const [settled, setSettled] = useState(false);
  const applied = useRef({ atlas: "", satellite: "" });
  const kept = COLUMN.w * COLUMN.day;
  const view = useMemo(() => fitFree(boundsOf(shape), 64, kept), [shape, kept]);
  // The shape and Results are here once paper 4 has drawn them.
  const drawn = t >= closeOf(shape);

  // The day's hotspots in the order the satellites saw them, then west to east; each has its moment.
  const drops = useMemo(() => {
    const sorted = [...dayResult.view.hotspots].sort((a, b) => a.time_utc.localeCompare(b.time_utc) || a.longitude - b.longitude || a.latitude - b.latitude);
    return sorted.map((h, j) => ({ h, at: s + B.drops + (B.dropsFor * j) / Math.max(1, sorted.length - 1) }));
  }, [dayResult, s, B.drops, B.dropsFor]);
  const landedCount = drops.filter((d) => t >= d.at + B.dropFor).length;
  const landed = useMemo(() => (landedCount === 0 ? NONE : drops.slice(0, landedCount).map((d) => d.h)), [drops, landedCount]);

  // The marks' sizes are the app's own: read from its layers, which MapView adds before it hands the map over.
  const onAtlas = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`day map: ${event.error?.message ?? "error"}`));
    const get = (layer: string, key: string) => atZoom(m.getPaintProperty(layer, key as never), view.zoom);
    setMarks({
      viirs: { r: get("zij-hotspots-viirs", "circle-radius"), opacity: get("zij-hotspots-viirs", "circle-opacity"), stroke: get("zij-hotspots-viirs", "circle-stroke-width") },
      modis: { r: get("zij-hotspots-modis", "circle-radius"), stroke: get("zij-hotspots-modis", "circle-stroke-width"), opacity: get("zij-hotspots-modis", "circle-stroke-opacity"), halo: get("zij-hotspots-modis-halo", "circle-stroke-width") },
    });
    setAtlas(m);
  }, [warn, view]);
  const onSatellite = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`satellite map: ${event.error?.message ?? "error"}`));
    setSatellite(m);
  }, [warn]);
  useEffect(() => {
    if (!atlas || !satellite) return;
    let live = true;
    Promise.all([idle(atlas, "day"), idle(satellite, "satellite")]).then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [atlas, satellite, idle]);
  useReady("day", settled && marks !== null);

  useDriver(async (time) => {
    if (!atlas || !satellite) return;
    const key = `${drops.filter((d) => time >= d.at + B.dropFor).length}|${time >= closeOf(shape)}`;
    const waits: Promise<void>[] = [];
    if (key !== applied.current.atlas) {
      applied.current.atlas = key;
      waits.push(idle(atlas, "day"));
    }
    if (time >= s + B.turn - 0.5 && key !== applied.current.satellite) {
      applied.current.satellite = key;
      waits.push(idle(satellite, "satellite"));
    }
    await Promise.all(waits);
  });

  const turn = move(t, s + B.turn, B.turnFor);
  const slip = arrive(t, s + B.slip);
  const [from, to] = monthSpan(area);
  const verdict = useMemo(() => areaVerdict(area), [area]);
  const ofDay = useMemo(() => dayVerdicts(area, day), [area, day]);

  return (
    <Paper as="div" kind="sheet" seed="board-day" className="film-mapsheet board-mapsheet">
      <PaperTitle n={5} />
      <div className="film-map">
        <MapView {...mapProps} basemap="zij" date={day} areas={NO_AREAS} selected={null} tags={false} shape={drawn ? shape : null} hotspots={landed} view={view} onMap={onAtlas} />
        <div className="film-map-over" style={{ ...shown(t, s + B.turn - 0.5), opacity: turn }}>
          <MapView {...mapProps} basemap="satellite" date={day} areas={NO_AREAS} selected={null} tags={false} shape={shape} hotspots={landed} view={view} onMap={onSatellite} />
        </div>

        {/* The marks on their way down: the app's own two marks, larger and lighter, each with its blot of ink. */}
        {marks && (
          <svg className="film-drops" width={MAP.w} height={MAP.h} viewBox={`0 0 ${MAP.w} ${MAP.h}`} aria-hidden="true">
            {drops.map(({ h, at }, j) => {
              if (t < at || t >= at + B.bloomFor) return null;
              const [x, y] = project(view, h.longitude, h.latitude);
              const viirs = h.sensor === "VIIRS";
              const size = viirs ? marks.viirs.r + marks.viirs.stroke : marks.modis.r + marks.modis.stroke;
              const blot = ease(clamp((t - at) / B.bloomFor));
              const fall = arrive(t, at, B.dropFor);
              const scale = 1 + 1.9 * (1 - fall);
              return (
                <g key={j} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
                  <circle className={viirs ? "film-blot is-viirs" : "film-blot is-modis"} r={size * (1.2 + 3.4 * blot)} opacity={0.34 * (1 - blot) ** 1.6} />
                  {t < at + B.dropFor && (viirs ? (
                    <circle className="film-drop is-viirs" r={(marks.viirs.r + marks.viirs.stroke / 2) * scale} strokeWidth={marks.viirs.stroke} fillOpacity={marks.viirs.opacity} opacity={Math.min(1, fall * 3)} />
                  ) : (
                    <g opacity={Math.min(1, fall * 3)}>
                      <circle className="film-drop is-halo" r={(marks.modis.r + marks.modis.halo / 2) * scale} strokeWidth={marks.modis.halo} />
                      <circle className="film-drop is-modis" r={(marks.modis.r + marks.modis.stroke / 2) * scale} strokeWidth={marks.modis.stroke} strokeOpacity={marks.modis.opacity} />
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        )}

        <p className="studio-caption film-day" style={{ ...shown(t, s + B.slip), opacity: Math.min(1, slip * 4), transform: `scale(${(1 + 0.16 * (1 - slip)).toFixed(4)})` }}>
          {LONG_DATE.format(new Date(`${day}T00:00:00Z`))}
        </p>

        <aside className="results film-results" aria-label="Results"
          style={{ ...(drawn ? {} : { visibility: "hidden" }), width: COLUMN.w, height: MAP.h / COLUMN.day, transform: `scale(${COLUMN.day})` }}>
          <header className="results-head slip">
            <div className="results-title">
              <p className="eyebrow">Results</p>
              <h2>{area.name}</h2>
              <span className="results-country">Drawn, {country}</span>
            </div>
          </header>
          <Panel area={area} verdict={verdict} day={day} dayVerdict={ofDay} dayResult={dayResult} dayLoading={false}
            onCloseDay={noop} recorded={false} onRecorded={noop} from={from} to={to} month={null} year={null} onMonth={noop} onYear={noop} reportHref={null} />
        </aside>
      </div>
    </Paper>
  );
}
