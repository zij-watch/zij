"use client";

// Scenes 4 and 5: any area, any day. The map is the app's own MapView on a sheet of paper, twice:
// once on the Zij atlas and once on NASA's satellite picture of the chosen day, one over the other.
// Results is the app's own Panel, fed the document the browser fits for the drawn polygon
// (lib/drawnArea.ts), so the verdict and the day's counts are what Explore shows for this shape.
//
// The film sets the camera for each frame (a function of t), draws the shape under the cursor with
// the app's own sketch layer, and waits for the map to be idle before the frame is taken. A hotspot
// is the app's mark once it has landed; while it drops, the film draws the same mark over the map.

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area, Index } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { useLoading } from "@/lib/download";
import { boundsOf, type Polygon } from "@/lib/fit/cells";
import { arrive, clamp, ease, lerp, move, PRESET, RULE_FOR, SCENES, SLIDE, T } from "@/lib/film/timeline";
import { monthSpan } from "@/lib/format";
import type { DayHotspot } from "@/lib/hotspots/day";
import { fitBox, VIEWS, type Box, type View } from "@/lib/map/atlas/camera";
import { setSketch } from "@/lib/map/layers";
import { areaVerdict, dayVerdicts } from "@/lib/verdict";
import Panel from "../Panel";
import Paper from "../Paper";
import { frame, ruledOut, Sheet, shown, useDriver, useFilm, useReady, useT } from "./kit";

const MapView = dynamic(() => import("../MapView"), { ssr: false });

// The sheet and the map on it, in frame pixels.
const SHEET = { x: 96, y: 54, w: 1728, h: 746 };
const EDGE = 14;
const MAP = { w: SHEET.w - EDGE * 2, h: SHEET.h - EDGE * 2 };
// Results: the app's column, 464 wide, shown 1.4 times its size on the right of the sheet.
const COLUMN = { w: 464, k: 1.4, day: 1.1 };
const KEPT = COLUMN.w * COLUMN.k; // what Results take from the right of the map

const NONE: DayHotspot[] = [];
const NO_AREAS: Index["areas"] = [];
const noop = () => {};
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------- the camera, as numbers

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;

/** Where a place is on the map's sheet, for a north-up, untilted view (what MapLibre draws). */
function project(view: View, lon: number, lat: number): [number, number] {
  const world = 512 * 2 ** view.zoom;
  return [MAP.w / 2 + (mercX(lon) - mercX(view.center[0])) * world, MAP.h / 2 + (mercY(lat) - mercY(view.center[1])) * world];
}

/** The view that fits a box into the part of the map Results leave free. */
function fitFree(box: Box, pad: number): View {
  const view = fitBox(box, MAP.w - KEPT, MAP.h, pad);
  return { zoom: view.zoom, center: [view.center[0] + (360 * KEPT) / (2 * 512 * 2 ** view.zoom), view.center[1]] };
}

/** A paint value of the app's layer at a zoom: a number, or a linear interpolation over zoom. */
function atZoom(value: unknown, zoom: number): number {
  if (typeof value === "number") return value;
  if (!Array.isArray(value) || value[0] !== "interpolate") return 0;
  const stops = value.slice(3) as number[];
  if (zoom <= stops[0]) return stops[1];
  for (let i = 2; i < stops.length; i += 2) {
    if (zoom <= stops[i]) return lerp(stops[i - 1], stops[i + 1], (zoom - stops[i - 2]) / (stops[i] - stops[i - 2]));
  }
  return stops[stops.length - 1];
}

interface Marks { viirs: { r: number; opacity: number; stroke: number }; modis: { r: number; stroke: number; opacity: number; halo: number } }

export default function Atlas({ index, area, country, shape, day, dayResult }:
  { index: Index; area: Area; country: string; shape: Polygon; day: string; dayResult: DayResult }) {
  const t = useT();
  const { warn } = useFilm();
  const [atlas, setAtlas] = useState<MapLibreMap | null>(null);
  const [satellite, setSatellite] = useState<MapLibreMap | null>(null);
  const [marks, setMarks] = useState<Marks | null>(null);
  const [settled, setSettled] = useState(false);
  const results = useRef<HTMLElement>(null);
  const applied = useRef({ view: "", ring: "" });
  const loading = useLoading();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = loading !== null;
  }, [loading]);

  const ring = useMemo(() => shape.coordinates[0].slice(0, -1) as [number, number][], [shape]);
  const closeAt = T.draw + ring.length * T.drawEvery;
  const preset = index.areas.find((a) => a.id === PRESET) ?? index.areas[0];

  // Three views: Egypt, the preset, and the drawn shape. The camera only ever moves between them.
  const views = useMemo(() => ({
    wide: fitFree(VIEWS.find((v) => v.id === "egypt")!.box, 40),
    preset: fitFree(preset.box, 70),
    shape: fitFree(boundsOf(shape), 64),
  }), [preset, shape]);
  const cameraAt = useCallback((time: number): View => {
    if (time >= SCENES[4].from) return views.shape;
    const k = move(time, T.fly, T.flyFor);
    return { center: [lerp(views.wide.center[0], views.preset.center[0], k), lerp(views.wide.center[1], views.preset.center[1], k)], zoom: lerp(views.wide.zoom, views.preset.zoom, k) };
  }, [views]);

  // Where the cursor is, and the shape drawn so far.
  const penAt = useCallback((time: number): { at: [number, number]; ring: [number, number][] | null } => {
    if (time < T.draw) return { at: ring[0], ring: null };
    if (time >= closeAt) return { at: ring[0], ring: null };
    const i = Math.min(ring.length - 1, Math.floor((time - T.draw) / T.drawEvery));
    const k = ease(clamp((time - T.draw - i * T.drawEvery) / T.drawEvery));
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const at: [number, number] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    return { at, ring: [...ring.slice(0, i + 1), at] };
  }, [ring, closeAt]);

  // The day's hotspots in the order the satellites saw them, then west to east; each has its moment.
  const drops = useMemo(() => {
    const sorted = [...dayResult.view.hotspots].sort((a, b) => a.time_utc.localeCompare(b.time_utc) || a.longitude - b.longitude || a.latitude - b.latitude);
    return sorted.map((h, j) => ({ h, at: T.drops + (T.dropsFor * j) / Math.max(1, sorted.length - 1) }));
  }, [dayResult]);
  const landedCount = t < SCENES[4].from ? 0 : drops.filter((d) => t >= d.at + T.dropFor).length;
  const landed = useMemo(() => (landedCount === 0 ? NONE : drops.slice(0, landedCount).map((d) => d.h)), [drops, landedCount]);

  // The marks' sizes are the app's own: read from its layers, which MapView adds before it hands the map over.
  const onAtlas = useCallback((map: MapLibreMap) => {
    map.on("error", (event) => warn(`atlas map: ${event.error?.message ?? "error"}`));
    const z = views.shape.zoom;
    const get = (layer: string, key: string) => atZoom(map.getPaintProperty(layer, key as never), z);
    setMarks({
      viirs: { r: get("zij-hotspots-viirs", "circle-radius"), opacity: get("zij-hotspots-viirs", "circle-opacity"), stroke: get("zij-hotspots-viirs", "circle-stroke-width") },
      modis: { r: get("zij-hotspots-modis", "circle-radius"), stroke: get("zij-hotspots-modis", "circle-stroke-width"), opacity: get("zij-hotspots-modis", "circle-stroke-opacity"), halo: get("zij-hotspots-modis-halo", "circle-stroke-width") },
    });
    setAtlas(map);
  }, [warn, views]);
  const onSatellite = useCallback((map: MapLibreMap) => {
    map.on("error", (event) => warn(`satellite map: ${event.error?.message ?? "error"}`));
    setSatellite(map);
  }, [warn]);

  /** The map has drawn everything it was asked for: tiles, detail cells, the fade of its labels. */
  const idle = useCallback((map: MapLibreMap, name: string) => new Promise<void>((resolve) => {
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
        // The atlas loads its detail by region (lib/map/detail.ts); wait for that too.
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

  useEffect(() => {
    if (!atlas || !satellite) return;
    let live = true;
    Promise.all([idle(atlas, "atlas"), idle(satellite, "satellite")]).then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [atlas, satellite, idle]);
  useReady("atlas", settled && marks !== null);

  useDriver(async (time) => {
    if (!atlas || !satellite || time < T.mapIn - 1 || time >= T.endRule + RULE_FOR) return;
    const view = cameraAt(time);
    const viewKey = `${view.center[0]},${view.center[1]},${view.zoom}`;
    if (viewKey !== applied.current.view) {
      applied.current.view = viewKey;
      atlas.jumpTo({ center: view.center, zoom: view.zoom });
    }
    const pen = penAt(time);
    const ringKey = JSON.stringify(pen.ring);
    if (ringKey !== applied.current.ring) {
      applied.current.ring = ringKey;
      setSketch(atlas, pen.ring);
    }
    await idle(atlas, "atlas");
    if (time >= T.turn - 0.5) await idle(satellite, "satellite");

    // The verdict writes itself: the badge is set down, then the sentence is inked line by line.
    const verdict = results.current?.querySelector<HTMLElement>("#paper-verdict .verdict");
    const [badge, sentence] = verdict ? ([...verdict.children] as HTMLElement[]) : [];
    if (badge && sentence) {
      const writing = time < SCENES[4].from;
      const set = arrive(time, T.badge);
      badge.style.opacity = writing ? String(Math.min(1, set * 5)) : "";
      badge.style.transform = writing ? `scale(${(1 + 0.2 * (1 - set)).toFixed(4)})` : "";
      const lineHeight = parseFloat(getComputedStyle(sentence).lineHeight) || 27;
      const lines = Math.max(1, Math.round(sentence.offsetHeight / lineHeight));
      const q = move(time, T.verdict, T.verdictFor) * lines, n = Math.min(lines - 1, Math.floor(q)), f = q >= lines ? 1 : q - n;
      const w = sentence.offsetWidth;
      sentence.style.clipPath = !writing || q >= lines ? ""
        : `polygon(0 0, ${w}px 0, ${w}px ${n * lineHeight}px, ${f * w}px ${n * lineHeight}px, ${f * w}px ${(n + 1) * lineHeight}px, 0 ${(n + 1) * lineHeight}px)`;
      for (const more of [...verdict!.children].slice(2) as HTMLElement[]) more.style.visibility = writing && q < lines ? "hidden" : "";
    }
  });

  // ---------------------------------------------------------------- what is on the sheet at t

  const dayScene = t >= SCENES[4].from;
  const closed = t >= closeAt;
  const sheetIn = move(t, T.mapIn, SLIDE);
  const resultsIn = move(t, T.resultsIn, SLIDE);
  const turn = move(t, T.turn, T.turnFor);
  const view = cameraAt(t);
  const pen = penAt(t);
  const [penX, penY] = project(view, pen.at[0], pen.at[1]);
  const penSet = arrive(t, T.cursorIn);
  const penLift = move(t, closeAt + 0.05, 0.3);
  const [from, to] = monthSpan(area);
  const verdict = useMemo(() => areaVerdict(area), [area]);
  const ofDay = useMemo(() => dayVerdicts(area, day), [area, day]);
  const slip = arrive(t, T.daySlip);
  // The day's paper is longer than the verdict's: after the cut it is shown a little smaller, so its figures are on the sheet.
  const columnK = dayScene ? COLUMN.day : COLUMN.k;

  const mapProps = {
    date: day, sky: true, onSelect: noop, drawMode: null, onDraft: noop, onDrawn: noop,
    chrome: false, interactive: false, follow: false,
  } as const;

  return (
    <div className="film-group" style={{ ...shown(t, T.mapIn, T.endRule + RULE_FOR), ...ruledOut(t, T.endRule) }}>
      <Sheet {...SHEET} dx={(1 - sheetIn) * 1900}>
        <Paper as="div" kind="sheet" seed="film-map" className="film-mapsheet">
          <div className="film-map">
            <MapView {...mapProps} basemap="zij" areas={dayScene ? NO_AREAS : index.areas} selected={closed ? null : preset.id} tags={!dayScene}
              shape={closed ? shape : null} hotspots={landed} view={views.wide} onMap={onAtlas} />
            <div className="film-map-over" style={{ ...shown(t, T.turn - 1), opacity: turn }}>
              <MapView {...mapProps} basemap="satellite" areas={NO_AREAS} selected={null} tags={false}
                shape={shape} hotspots={dayScene ? landed : NONE} view={views.shape} onMap={onSatellite} />
            </div>

            {/* The marks on their way down: the app's own two marks, larger and lighter, each with its blot of ink. */}
            {dayScene && marks && (
              <svg className="film-drops" width={MAP.w} height={MAP.h} viewBox={`0 0 ${MAP.w} ${MAP.h}`} aria-hidden="true">
                {drops.map(({ h, at }, j) => {
                  if (t < at || t >= at + T.bloomFor) return null;
                  const [x, y] = project(views.shape, h.longitude, h.latitude);
                  const viirs = h.sensor === "VIIRS";
                  const size = viirs ? marks.viirs.r + marks.viirs.stroke : marks.modis.r + marks.modis.stroke;
                  const blot = ease(clamp((t - at) / T.bloomFor));
                  const fall = arrive(t, at, T.dropFor);
                  const scale = 1 + 1.9 * (1 - fall);
                  return (
                    <g key={j} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
                      <circle className={viirs ? "film-blot is-viirs" : "film-blot is-modis"} r={size * (1.2 + 3.4 * blot)} opacity={0.34 * (1 - blot) ** 1.6} />
                      {t < at + T.dropFor && (viirs ? (
                        <circle className="film-drop is-viirs" r={(marks.viirs.r + marks.viirs.stroke / 2) * scale} strokeWidth={marks.viirs.stroke}
                          fillOpacity={marks.viirs.opacity} opacity={Math.min(1, fall * 3)} />
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

            {/* The brass cursor. */}
            <i className="film-cursor" aria-hidden="true"
              style={{ ...shown(t, T.cursorIn, closeAt + 0.4), left: penX, top: penY - 18 * penLift, opacity: Math.min(1, penSet * 4) * (1 - penLift), transform: `translate(-50%, -50%) scale(${(1 + 0.9 * (1 - penSet) + 0.25 * penLift).toFixed(4)})` }} />

            {/* The day that is set, as the studio map writes it. */}
            <p className="studio-caption film-day" style={{ ...shown(t, T.daySlip), opacity: Math.min(1, slip * 4), transform: `scale(${(1 + 0.16 * (1 - slip)).toFixed(4)})` }}>
              {LONG_DATE.format(new Date(`${day}T00:00:00Z`))}
            </p>

            {/* Results, as on Explore. */}
            <aside ref={results} className="results film-results" aria-label="Results"
              style={{ ...shown(t, T.resultsIn), width: COLUMN.w, height: MAP.h / columnK, transform: `translateX(${((1 - resultsIn) * (KEPT + 60)).toFixed(2)}px) scale(${columnK})` }}>
              <header className="results-head slip">
                <div className="results-title">
                  <p className="eyebrow">Results</p>
                  <h2>{area.name}</h2>
                  <span className="results-country">Drawn, {country}</span>
                </div>
              </header>
              <Panel area={area} verdict={verdict} day={dayScene ? day : null} dayVerdict={ofDay} dayResult={dayResult} dayLoading={false}
                onCloseDay={noop} recorded={false} onRecorded={noop} from={from} to={to} month={null} year={null} onMonth={noop} onYear={noop} reportHref={null} />
            </aside>
          </div>
        </Paper>
      </Sheet>
    </div>
  );
}
