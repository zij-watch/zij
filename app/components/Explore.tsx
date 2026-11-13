"use client";

import { useEffect, useState } from "react";
import { loadArea, loadIndex, type Area, type Index } from "@/lib/data";
import { monthSpan } from "@/lib/format";
import { BASEMAPS } from "@/lib/map/style";
import { useAppState } from "@/lib/url";
import MapView from "./MapView";
import Panel from "./Panel";

const THEME = "night" as const;

/** Last day of a YYYY-MM month, not after `cap`. */
function lastDayOf(ym: string, cap: string): string {
  const [y, m] = ym.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return day > cap ? cap : day;
}

export default function Explore() {
  const [state, update] = useAppState();
  const [index, setIndex] = useState<Index | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex).catch((e: Error) => setError(e.message));
  }, []);

  const areaId = state.area && index?.areas.some((a) => a.id === state.area) ? state.area : null;
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

  const span = area ? monthSpan(area) : null;
  const from = span ? (state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span[0]) : "2000-11";
  const to = span ? (state.to && state.to <= span[1] && state.to >= from ? state.to : span[1]) : (index?.last_full_day.slice(0, 7) ?? "2026-11");
  const mapDate = lastDayOf(to, index?.last_full_day ?? "2026-11-12");

  return (
    <div className={`explore${areaId ? " has-area" : ""}`}>
      <div className="toolbar">
        <label>
          <span>Area</span>
          <select value={areaId ?? ""} onChange={(e) => update({ area: e.target.value || null, month: null })}>
            <option value="">Choose an area</option>
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
        <div className="switch" role="group" aria-label="Basemap">
          {BASEMAPS.map((b) => (
            <button key={b.id} type="button" className={state.basemap === b.id ? "is-active" : ""} aria-pressed={state.basemap === b.id}
              onClick={() => update({ basemap: b.id })}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stage">
        <MapView theme={THEME} basemap={state.basemap} date={mapDate} areas={index?.areas ?? []} selected={areaId}
          onSelect={(id) => update({ area: id, month: null })} />
        {state.basemap === "satellite" && <p className="map-note">NASA GIBS true colour, {mapDate}</p>}
        <aside className="panel" aria-live="polite">
          {error && <p className="panel-body">Could not load the data: {error}</p>}
          {!error && !areaId && (
            <div className="panel-body">
              <p className="eyebrow">Zij</p>
              <h2>26 years of fire, on one scale</h2>
              <p>
                MODIS has watched fires since 2000, VIIRS since 2012, and VIIRS sees many more of them. Zij puts both records
                in one unit, so a year before 2012 can be read against a year after it.
              </p>
              <p>Choose an area on the map or from the list.</p>
              <ul className="plain">
                {index?.areas.map((a) => (
                  <li key={a.id}><button type="button" className="link" onClick={() => update({ area: a.id })}>{a.name}</button>, {a.country}</li>
                ))}
              </ul>
            </div>
          )}
          {!error && areaId && !area && <p className="panel-body">Loading&hellip;</p>}
          {!error && area && areaId === area.id && (
            <Panel area={area} theme={THEME} from={from} to={to} view={state.view} month={state.month}
              onView={(view) => update({ view })} onMonth={(month) => update({ month })} />
          )}
        </aside>
      </div>
    </div>
  );
}
