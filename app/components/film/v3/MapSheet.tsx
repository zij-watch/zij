"use client";

// The third film's second surface (lib/film/v3.ts): the map sheet. The app's own MapView, set on
// the Nile Delta. A box is drawn corner to corner as the app's right-drag draws one; Results come
// in with the verdict, which writes itself; then that day's VIIRS dots and MODIS rings drop in.
// Results are the app's own Panel, fed the document the browser fits for the box (lib/drawnArea.ts).

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { boundsOf, type Polygon } from "@/lib/fit/cells";
import { arrive, clamp, ease, lerp, move } from "@/lib/film/timeline";
import { BOX, type Beats } from "@/lib/film/v3";
import { monthSpan } from "@/lib/format";
import type { DayHotspot } from "@/lib/hotspots/day";
import { fitBox, type Box, type View } from "@/lib/map/atlas/camera";
import { setSketch } from "@/lib/map/layers";
import { areaVerdict } from "@/lib/verdict";
import Panel from "../../Panel";
import Paper from "../../Paper";
import { atZoom, mapProps, useIdle } from "../board/Maps";
import { shown, useDriver, useFilm, useReady, useT } from "../kit";

const MapView = dynamic(() => import("../../MapView"), { ssr: false });

const MAP = { w: 1772, h: 972 };
const COLUMN = { w: 464, k: 1.4 };
const NONE: DayHotspot[] = [];
const NO_AREAS: never[] = [];
const noop = () => {};
const LONG_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
function project(view: View, lon: number, lat: number): [number, number] {
  const world = 512 * 2 ** view.zoom;
  return [MAP.w / 2 + (mercX(lon) - mercX(view.center[0])) * world, MAP.h / 2 + (mercY(lat) - mercY(view.center[1])) * world];
}
function fitFree(box: Box, pad: number, kept: number): View {
  const view = fitBox(box, MAP.w - kept, MAP.h, pad);
  return { zoom: view.zoom, center: [view.center[0] + (360 * kept) / (2 * 512 * 2 ** view.zoom), view.center[1]] };
}
const rect = (a: [number, number], b: [number, number]): [number, number][] => [a, [b[0], a[1]], b, [a[0], b[1]]];

interface Marks { viirs: { r: number; opacity: number; stroke: number }; modis: { r: number; stroke: number; opacity: number; halo: number } }

export function MapSheet({ area, country, shape, day, dayResult, b, fitMs, tagText = "fitted in your browser", coverageAt, lasso }: { area: Area; country: string; shape: Polygon; day: string; dayResult: DayResult; b: Beats; fitMs: number; tagText?: string; coverageAt?: number; lasso?: [number, number][] }) {
  const t = useT();
  const { warn } = useFilm();
  const idle = useIdle();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [marks, setMarks] = useState<Marks | null>(null);
  const [settled, setSettled] = useState(false);
  const results = useRef<HTMLElement>(null);
  const applied = useRef("");
  const kept = COLUMN.w * COLUMN.k;
  const view = useMemo(() => fitFree(boundsOf(shape), 150, kept), [shape, kept]);
  const B = { press: b.box[0], dragFor: b.box[1] - b.box[0], cursor: b.box[0] - 0.35, results: b.results, resultsFor: 0.5, badge: b.badge, verdict: b.verdict, verdictFor: 0.7, drops: b.drops[0], dropsFor: b.drops[1] - b.drops[0] - 0.4, dropFor: 0.4, bloomFor: 0.8, slip: b.drops[0] - 0.25 };
  const closeAt = B.press + B.dragFor;

  // The box: pressed at one corner, dragged to the other.
  // A freehand loop is traced point by point at an even pace; a box is dragged corner to corner.
  const trace = useMemo(() => {
    if (!lasso) return null;
    const path = [...lasso, lasso[0]];
    const at = [0];
    for (let i = 1; i < path.length; i++) at.push(at[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
    return { path, at };
  }, [lasso]);
  const penAt = useCallback((time: number): { at: [number, number]; ring: [number, number][] | null } => {
    const start: [number, number] = trace ? trace.path[0] : BOX[0];
    if (time < B.press) return { at: start, ring: null };
    if (time >= closeAt) return { at: trace ? start : BOX[1], ring: null };
    if (trace) {
      const d = ease(clamp((time - B.press) / B.dragFor)) * trace.at[trace.at.length - 1];
      const i = Math.max(0, trace.at.findIndex((v) => v > d) - 1);
      const f = (d - trace.at[i]) / Math.max(1e-9, trace.at[i + 1] - trace.at[i]);
      const at: [number, number] = [lerp(trace.path[i][0], trace.path[i + 1][0], f), lerp(trace.path[i][1], trace.path[i + 1][1], f)];
      return { at, ring: [...trace.path.slice(0, i + 1), at] };
    }
    const k = ease(clamp((time - B.press) / B.dragFor));
    const at: [number, number] = [lerp(BOX[0][0], BOX[1][0], k), lerp(BOX[0][1], BOX[1][1], k)];
    return { at, ring: rect(BOX[0], at) };
  }, [closeAt, B.press, B.dragFor, trace]);

  // The day's hotspots in the order the satellites saw them, then west to east; each has its moment.
  const drops = useMemo(() => {
    const sorted = [...dayResult.view.hotspots].sort((a, b) => a.time_utc.localeCompare(b.time_utc) || a.longitude - b.longitude || a.latitude - b.latitude);
    return sorted.map((h, j) => ({ h, at: B.drops + (B.dropsFor * j) / Math.max(1, sorted.length - 1) }));
  }, [dayResult, B.drops, B.dropsFor]);
  const landedAt = useCallback((time: number) => drops.filter((d) => time >= d.at + B.dropFor).length, [drops, B.dropFor]);
  const landedCount = landedAt(t);
  const landed = useMemo(() => (landedCount === 0 ? NONE : drops.slice(0, landedCount).map((d) => d.h)), [drops, landedCount]);

  const onMap = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`map: ${event.error?.message ?? "error"}`));
    const get = (layer: string, key: string) => atZoom(m.getPaintProperty(layer, key as never), view.zoom);
    setMarks({
      viirs: { r: get("zij-hotspots-viirs", "circle-radius"), opacity: get("zij-hotspots-viirs", "circle-opacity"), stroke: get("zij-hotspots-viirs", "circle-stroke-width") },
      modis: { r: get("zij-hotspots-modis", "circle-radius"), stroke: get("zij-hotspots-modis", "circle-stroke-width"), opacity: get("zij-hotspots-modis", "circle-stroke-opacity"), halo: get("zij-hotspots-modis-halo", "circle-stroke-width") },
    });
    setMap(m);
  }, [warn, view]);
  useEffect(() => {
    if (!map) return;
    let live = true;
    idle(map, "map").then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [map, idle]);
  useReady("map", settled && marks !== null);

  useDriver(async (time) => {
    if (!map) return;
    const pen = penAt(time);
    const key = `${JSON.stringify(pen.ring)}|${time >= closeAt}|${landedAt(time)}`;
    if (key !== applied.current) {
      applied.current = key;
      setSketch(map, pen.ring);
      await idle(map, "map");
    }
    // The verdict writes itself: the badge is set down, then the sentence is inked line by line.
    const verdict = results.current?.querySelector<HTMLElement>("#paper-verdict .verdict");
    const [badge, sentence] = verdict ? ([...verdict.children] as HTMLElement[]) : [];
    if (!badge || !sentence) return;
    const set = arrive(time, B.badge);
    badge.style.opacity = String(Math.min(1, set * 5));
    badge.style.transform = set >= 1 ? "" : `scale(${(1 + 0.2 * (1 - set)).toFixed(4)})`;
    const lineHeight = parseFloat(getComputedStyle(sentence).lineHeight) || 27;
    const lines = Math.max(1, Math.round(sentence.offsetHeight / lineHeight));
    const q = move(time, B.verdict, B.verdictFor) * lines, n = Math.min(lines - 1, Math.floor(q)), f = q >= lines ? 1 : q - n;
    const w = sentence.offsetWidth;
    sentence.style.clipPath = q >= lines ? ""
      : `polygon(0 0, ${w}px 0, ${w}px ${n * lineHeight}px, ${f * w}px ${n * lineHeight}px, ${f * w}px ${(n + 1) * lineHeight}px, 0 ${(n + 1) * lineHeight}px)`;
    for (const more of [...verdict!.children].slice(2) as HTMLElement[]) more.style.visibility = q < lines ? "hidden" : "";
  });

  const tagAt: [number, number] = lasso ? [Math.min(...lasso.map((p) => p[0])), Math.max(...lasso.map((p) => p[1]))] : BOX[0];
  const closed = t >= closeAt;
  const pen = penAt(t);
  const [penX, penY] = project(view, pen.at[0], pen.at[1]);
  const penSet = arrive(t, B.cursor);
  const penLift = move(t, closeAt + 0.05, 0.3);
  const resultsIn = move(t, B.results, B.resultsFor);
  const slip = arrive(t, B.slip);
  const [from, to] = monthSpan(area);
  const verdict = useMemo(() => areaVerdict(area), [area]);
  const noDay = useMemo(() => ({ week: null, month: null }), []);

  return (
    <Paper as="div" kind="sheet" seed="v3-map" className="film-mapsheet v3-mapsheet">
      <div className="film-map">
        <MapView {...mapProps} basemap="satellite" date={day} areas={NO_AREAS} selected={null} tags={false} shape={closed ? shape : null} hotspots={landed} view={view} onMap={onMap} />
        <i className="film-cursor" aria-hidden="true"
          style={{ ...shown(t, B.cursor, closeAt + 0.4), left: penX, top: penY - 18 * penLift, opacity: Math.min(1, penSet * 4) * (1 - penLift), transform: `translate(-50%, -50%) scale(${(1 + 0.9 * (1 - penSet) + 0.25 * penLift).toFixed(4)})` }} />

        <p className="v3-coverage" style={{ opacity: Math.min(1, move(t, coverageAt ?? B.cursor - 0.3, 0.3)) }}>Today: Egypt, Portugal, Argentina</p>

        {/* Fitted in the browser: the time the page took to fit the box, measured as it loaded. */}
        <p className="v3-fit-tag" style={{ ...shown(t, b.tag), left: project(view, ...tagAt)[0] + 4, top: project(view, ...tagAt)[1] - 58, opacity: Math.min(1, arrive(t, b.tag) * 4), transform: `scale(${(1 + 0.12 * (1 - arrive(t, b.tag))).toFixed(4)})` }}>
          {tagText} · {(fitMs / 1000).toFixed(fitMs < 1000 ? 2 : 1)} s
        </p>

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

        <p className="studio-caption film-day" style={{ ...shown(t, B.slip), opacity: Math.min(1, slip * 4), transform: `scale(${(1.4 + 0.2 * (1 - slip)).toFixed(4)})` }}>
          {LONG_DATE.format(new Date(`${day}T00:00:00Z`))}
        </p>

        <aside ref={results} className="results film-results" aria-label="Results"
          style={{ ...shown(t, B.results), width: COLUMN.w, height: MAP.h / COLUMN.k, transform: `translateX(${((1 - resultsIn) * (kept + 60)).toFixed(2)}px) scale(${COLUMN.k})` }}>
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
