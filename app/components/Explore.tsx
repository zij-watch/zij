"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { loadArea, loadIndex, loadNotes, type Area, type Index } from "@/lib/data";
import { loadDay, type DayResult } from "@/lib/dayData";
import { COVERED, loadCellsIndex, resolveDrawn, type DrawnResult } from "@/lib/drawnArea";
import type { Shape } from "@/lib/fit/cells";
import { monthSpan } from "@/lib/format";
import { BASEMAPS } from "@/lib/map/style";
import type { AreaFacts } from "@/lib/facts";
import { useAppState } from "@/lib/url";
import { AreaLinks, FactsBlock, INTRO } from "./Shell";
import DayPanel from "./DayPanel";
import type { DrawMode } from "./MapView";
import { loadingWords, useLoading } from "@/lib/download";

// MapLibre is the heaviest script on the page. It is loaded on its own, after the panel has its text.
const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="map map-waiting">Loading the map…</div> });
import Panel from "./Panel";

const THEME = "night" as const;
const NO_HOTSPOTS: DayResult["view"]["hotspots"] = [];

/** Last day of a YYYY-MM month, not after `cap`. */
function lastDayOf(ym: string, cap: string): string {
  const [y, m] = ym.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return day > cap ? cap : day;
}

function CoverageMessage({ result }: { result: Exclude<DrawnResult, { status: "ok" }> }) {
  return (
    <div className="panel-body">
      <p className="eyebrow">Drawn area</p>
      <h2>{result.status === "two-countries" ? "This area crosses two regions" : "No data here yet"}</h2>
      {result.status === "two-countries" ? (
        <p>The shape touches {result.countries.join(" and ")}. Zij reads one region at a time: draw the area inside one of them.</p>
      ) : (
        <p>This shape is outside the regions Zij has processed.</p>
      )}
      <p>Covered regions: {COVERED}.</p>
    </div>
  );
}

function CoordinateEntry({ shape, onBox }: { shape: Shape | null; onBox: (box: Shape) => void }) {
  const start = Array.isArray(shape) ? shape : null;
  const [south, setSouth] = useState(start ? String(start[1]) : "");
  const [west, setWest] = useState(start ? String(start[0]) : "");
  const [north, setNorth] = useState(start ? String(start[3]) : "");
  const [east, setEast] = useState(start ? String(start[2]) : "");
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const [s, w, n, e] = [south, west, north, east].map((v) => Number(v.trim().replace(",", ".")));
    if (![s, w, n, e].every(Number.isFinite) || [south, west, north, east].some((v) => v.trim() === "")) return setProblem("Give four numbers, in decimal degrees.");
    if (s < -90 || n > 90 || w < -180 || e > 180) return setProblem("Latitude runs from -90 to 90, longitude from -180 to 180.");
    if (!(s < n) || !(w < e)) return setProblem("South must be below north, and west left of east. South and west are negative numbers.");
    setProblem(null);
    onBox([w, s, e, n]);
  };
  const field = (label: string, value: string, set: (v: string) => void, hint: string) => (
    <label>
      <span>{label}</span>
      <input inputMode="decimal" value={value} placeholder={hint} onChange={(e) => set(e.target.value)} size={7} />
    </label>
  );
  return (
    <form className="coords" onSubmit={submit}>
      {field("South (lat)", south, setSouth, "30.0")}
      {field("West (lon)", west, setWest, "29.8")}
      {field("North (lat)", north, setNorth, "31.6")}
      {field("East (lon)", east, setEast, "32.3")}
      <button type="submit">Show box</button>
      {problem && <p className="coords-problem" role="alert">{problem}</p>}
    </form>
  );
}

export default function Explore({ initialIndex = null, facts = null }: { initialIndex?: Index | null; facts?: AreaFacts | null }) {
  const [state, update] = useAppState();
  const [index, setIndex] = useState<Index | null>(initialIndex);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [drawn, setDrawn] = useState<DrawnResult | null>(null);
  const [draft, setDraft] = useState<DrawnResult | null>(null);
  const [working, setWorking] = useState(false);
  const draftTicket = useRef(0);
  const loading = useLoading();
  const [mapWanted, setMapWanted] = useState(false);
  useEffect(() => {
    // Let the first paint and the area's data go first.
    const timer = setTimeout(() => setMapWanted(true), 300);
    return () => clearTimeout(timer);
  }, []);
  const [dayResult, setDayResult] = useState<DayResult | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    if (!initialIndex) loadIndex().then(setIndex).catch((e: Error) => setError(e.message));
    loadNotes().then(setNotes);
  }, []);

  // Presets.
  const shapeKey = state.shape ? JSON.stringify(state.shape) : "";
  const areaId = !shapeKey && state.area && index?.areas.some((a) => a.id === state.area) ? state.area : null;
  useEffect(() => {
    if (!areaId) {
      setArea(null);
      return;
    }
    let current = true;
    loadArea(areaId).then((a) => current && setArea(a)).catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [areaId]);

  // The drawn area: fitted in the browser, with its bands.
  useEffect(() => {
    if (!shapeKey) {
      setDrawn(null);
      return;
    }
    let current = true;
    setWorking(true);
    resolveDrawn(JSON.parse(shapeKey) as Shape)
      .then((result) => current && setDrawn(result))
      .catch((e: Error) => current && setError(e.message))
      .finally(() => current && setWorking(false));
    return () => {
      current = false;
    };
  }, [shapeKey]);

  // The cell index is small: fetch it as soon as drawing starts, so the first shape is quick.
  useEffect(() => {
    if (drawMode || showCoords) loadCellsIndex().catch(() => undefined);
    if (!drawMode) setDraft(null);
  }, [drawMode, showCoords]);

  // While a shape is being drawn: a quick fit without bands. Only the newest one is shown.
  const onDraft = (shape: Shape) => {
    const ticket = ++draftTicket.current;
    resolveDrawn(shape, true).then((result) => ticket === draftTicket.current && setDraft(result)).catch(() => undefined);
  };
  const onDrawn = (shape: Shape) => {
    draftTicket.current += 1;
    setDrawMode(null);
    update({ shape, area: null, month: null });
  };

  const shown: DrawnResult | null = drawMode ? draft : shapeKey ? drawn : null;
  const panelArea = shown ? (shown.status === "ok" ? shown.area : null) : area && areaId === area.id ? area : null;
  const isDraft = Boolean(drawMode && shown && shown.status === "ok");
  const hasPanel = Boolean(areaId || shapeKey || drawMode);

  const span = panelArea && panelArea.months.year.length ? monthSpan(panelArea) : null;
  const from = span ? (state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span[0]) : state.from ?? "2000-11";
  const to = span ? (state.to && state.to <= span[1] && state.to >= from ? state.to : span[1]) : state.to ?? (index?.last_full_day.slice(0, 7) ?? "2026-11");
  // The day view. The satellite basemap follows the chosen day.
  const lastDay = index?.last_full_day ?? "2026-11-12";
  const day = state.day && state.day >= "2000-11-01" && state.day <= lastDay ? state.day : null;
  const mapDate = day ?? lastDayOf(to, lastDay);
  const dayArea = !isDraft ? panelArea : null;
  useEffect(() => {
    if (!day || !dayArea) {
      setDayResult(null);
      return;
    }
    let current = true;
    setDayLoading(true);
    loadDay(dayArea, day)
      .then((result) => current && setDayResult(result))
      .catch((e: Error) => current && setError(e.message))
      .finally(() => current && setDayLoading(false));
    return () => {
      current = false;
    };
  }, [day, dayArea]);
  const hotspots = day && dayResult && dayResult.view.date === day ? dayResult.view.hotspots : NO_HOTSPOTS;

  return (
    <div className={`explore${hasPanel ? " has-area" : ""}`}>
      <div className="toolbar">
        <label>
          <span>Area</span>
          <select value={areaId ?? (shapeKey ? "drawn" : "")} onChange={(e) => { setDrawMode(null); update({ area: e.target.value && e.target.value !== "drawn" ? e.target.value : null, shape: null, month: null }); }}>
            <option value="">Choose an area</option>
            {shapeKey && <option value="drawn">Your drawn area</option>}
            {index?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}, {a.country}</option>)}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="month" value={from} min={span?.[0]} max={to} onChange={(e) => e.target.value && update({ from: e.target.value })} />
        </label>
        <label>
          <span>To</span>
          <input type="month" value={to} min={from} max={span?.[1]} onChange={(e) => e.target.value && update({ to: e.target.value })} />
        </label>
        <label>
          <span>Day</span>
          <input type="date" value={day ?? ""} min="2000-11-01" max={lastDay} onChange={(e) => update({ day: e.target.value || null })} />
        </label>
        <div className="switch" role="group" aria-label="Draw your own area">
          <button type="button" className={drawMode === "box" ? "is-active" : ""} aria-pressed={drawMode === "box"} onClick={() => setDrawMode(drawMode === "box" ? null : "box")}>Draw box</button>
          <button type="button" className={drawMode === "polygon" ? "is-active" : ""} aria-pressed={drawMode === "polygon"} onClick={() => setDrawMode(drawMode === "polygon" ? null : "polygon")}>Draw polygon</button>
          <button type="button" className={showCoords ? "is-active" : ""} aria-pressed={showCoords} onClick={() => setShowCoords(!showCoords)}>Type coordinates</button>
          {shapeKey && <button type="button" onClick={() => update({ shape: null, month: null })}>Clear</button>}
        </div>
        <div className="switch basemap-switch" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button key={b.id} type="button" className={state.basemap === b.id ? "is-active" : ""} aria-pressed={state.basemap === b.id}
              onClick={() => update({ basemap: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
        {showCoords && <CoordinateEntry key={shapeKey} shape={state.shape} onBox={(box) => { setDrawMode(null); update({ shape: box, area: null, month: null }); }} />}
        {drawMode && (
          <p className="draw-hint">
            {drawMode === "box" ? "Click one corner, move, and click the opposite corner." : "Click each corner; click the first point again to close the shape."}
            {" "}The panel follows as you draw.
          </p>
        )}
      </div>

      <div className="stage">
        {!mapWanted && <div className="map map-waiting">Loading the map…</div>}
        {mapWanted && <MapView theme={THEME} basemap={state.basemap} date={mapDate} areas={index?.areas ?? []} selected={areaId}
          onSelect={(id) => update({ area: id, shape: null, month: null })}
          shape={drawMode ? null : state.shape} drawMode={drawMode} onDraft={onDraft} onDrawn={onDrawn} hotspots={hotspots} />}
        {state.basemap === "satellite" && <p className="map-note">NASA GIBS true colour, {mapDate}</p>}
        <aside className="panel" aria-live="polite">
          {error && <p className="panel-body">Could not load the data: {error}</p>}
          {!error && !hasPanel && (
            <div className="panel-body">
              <p className="eyebrow">Zij</p>
              <h2>26 years of fire, on one scale</h2>
              {INTRO.map((text) => <p key={text}>{text}</p>)}
              <p>Choose an area on the map or below, or draw your own in {COVERED}.</p>
              <div onClick={(event) => {
                // The links work without scripts; with them, the page changes area without reloading.
                const link = (event.target as HTMLElement).closest("a");
                const id = link ? new URL(link.href).searchParams.get("area") : null;
                if (id) {
                  event.preventDefault();
                  update({ area: id, shape: null, month: null });
                }
              }}>
                <AreaLinks areas={index?.areas ?? []} />
              </div>
            </div>
          )}
          {!error && drawMode && !shown && <p className="panel-body" role="status">{loading ? loadingWords(loading) : "Draw on the map. The numbers appear here as the shape grows."}</p>}
          {!error && !drawMode && hasPanel && !panelArea && !(shown && shown.status !== "ok") && (
            facts && facts.id === areaId ? (
              <FactsBlock facts={facts} />
            ) : (
              <div className="panel-body" role="status">
                <p>{loading ? loadingWords(loading) : shapeKey ? "Fitting your drawn area. This runs in your browser, once the page's scripts and the region's cells have loaded." : "Loading…"}</p>
                {shapeKey && INTRO.map((text) => <p key={text} className="note">{text}</p>)}
              </div>
            )
          )}
          {!error && shown && shown.status !== "ok" && <CoverageMessage result={shown} />}
          {!error && day && !panelArea && !drawMode && (
            <p className="panel-body">Choose an area to see {day}: its hotspots on the map and how the day compares.</p>
          )}
          {!error && day && dayArea && (
            <div className="panel-body day-wrap">
              <DayPanel area={dayArea} date={day} result={dayResult && dayResult.view.date === day ? dayResult : null} loading={dayLoading}
                loadingText={loading ? loadingWords(loading) : null} onClose={() => update({ day: null })} />
            </div>
          )}
          {!error && panelArea && (
            <Panel area={panelArea} theme={THEME} from={from} to={to} view={state.view} month={state.month} year={state.year}
              note={notes[panelArea.id]} drawn={Boolean(shown)} draft={isDraft}
              onView={(view) => update({ view })} onMonth={(month) => update({ month })} onYear={(year) => update({ year })} />
          )}
        </aside>
      </div>
    </div>
  );
}
