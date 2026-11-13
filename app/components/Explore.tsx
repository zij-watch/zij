"use client";

import { useEffect, useRef, useState } from "react";
import { loadArea, loadIndex, loadNotes, type Area, type Index } from "@/lib/data";
import { COVERED, loadCellsIndex, resolveDrawn, type DrawnResult } from "@/lib/drawnArea";
import type { Shape } from "@/lib/fit/cells";
import { monthSpan } from "@/lib/format";
import { BASEMAPS } from "@/lib/map/style";
import { useAppState } from "@/lib/url";
import MapView, { type DrawMode } from "./MapView";
import Panel from "./Panel";

const THEME = "night" as const;

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

export default function Explore() {
  const [state, update] = useAppState();
  const [index, setIndex] = useState<Index | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [drawn, setDrawn] = useState<DrawnResult | null>(null);
  const [draft, setDraft] = useState<DrawnResult | null>(null);
  const [working, setWorking] = useState(false);
  const draftTicket = useRef(0);

  useEffect(() => {
    loadIndex().then(setIndex).catch((e: Error) => setError(e.message));
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
  const mapDate = lastDayOf(to, index?.last_full_day ?? "2026-11-12");

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
        <MapView theme={THEME} basemap={state.basemap} date={mapDate} areas={index?.areas ?? []} selected={areaId}
          onSelect={(id) => update({ area: id, shape: null, month: null })}
          shape={drawMode ? null : state.shape} drawMode={drawMode} onDraft={onDraft} onDrawn={onDrawn} />
        {state.basemap === "satellite" && <p className="map-note">NASA GIBS true colour, {mapDate}</p>}
        <aside className="panel" aria-live="polite">
          {error && <p className="panel-body">Could not load the data: {error}</p>}
          {!error && !hasPanel && (
            <div className="panel-body">
              <p className="eyebrow">Zij</p>
              <h2>26 years of fire, on one scale</h2>
              <p>
                MODIS has watched fires since 2000, VIIRS since 2012, and VIIRS sees many more of them. Zij puts both records
                in one unit, so a year before 2012 can be read against a year after it.
              </p>
              <p>Choose an area on the map or from the list, or draw your own in {COVERED}.</p>
              <ul className="plain">
                {index?.areas.map((a) => (
                  <li key={a.id}><button type="button" className="link" onClick={() => update({ area: a.id })}>{a.name}</button>, {a.country}</li>
                ))}
              </ul>
            </div>
          )}
          {!error && drawMode && !shown && <p className="panel-body">Draw on the map. The numbers appear here as the shape grows.</p>}
          {!error && !drawMode && hasPanel && !panelArea && !(shown && shown.status !== "ok") && (
            <p className="panel-body">{working && shapeKey ? "Reading the cells of this region and fitting your area…" : "Loading…"}</p>
          )}
          {!error && shown && shown.status !== "ok" && <CoverageMessage result={shown} />}
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
