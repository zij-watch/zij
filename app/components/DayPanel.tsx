"use client";

// The day view's figures and table: that day's detections per sensor and satellite. How the day's
// week and month compare with past years is said by their verdicts, above it.

import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { num } from "@/lib/format";

// Every satellite of a sensor is listed on every day: one that was not flying says so.
const SATELLITES = { MODIS: ["Terra", "Aqua"], VIIRS: ["Suomi NPP", "NOAA-20", "NOAA-21"] } as const;

const count = (value: number | null) => (value === null ? "not flying" : num(value));

export function HotspotLegend() {
  return (
    <p className="legend" aria-label="Map legend">
      <span><i className="mark-viirs" aria-hidden="true" /> VIIRS</span>
      <span><i className="mark-modis" aria-hidden="true" /> MODIS</span>
      <span>Click a mark for its details</span>
    </p>
  );
}

function sensorsOf(result: DayResult) {
  return (["VIIRS", "MODIS"] as const).map((name) => ({ name, ...result.view.summary.sensors[name] }));
}

/** The day in figures: all detections, then each sensor's, with day and night. */
export function DayFigures({ area, result, loading, loadingText }: { area: Area; result: DayResult | null; loading: boolean; loadingText?: string | null }) {
  if (loading && !result) return <p role="status" className="marginal">{loadingText ?? "Loading the hotspots of this region…"}</p>;
  if (!result) return null;
  if (!result.covered) {
    return <p className="erratum">No single hotspots for this part of {area.country}: only Chilecito and the Parana Delta in Argentina.</p>;
  }
  return (
    <>
      <dl className="figures">
        <div className="figure-main"><dt>Detections</dt><dd>{num(result.view.summary.hotspots)}</dd></div>
        {sensorsOf(result).map((s) => (
          <div key={s.name}>
            <dt><i className={s.name === "VIIRS" ? "mark-viirs" : "mark-modis"} aria-hidden="true" /> {s.name}</dt>
            <dd>{count(s.hotspots)}</dd>
            {s.hotspots !== null && <dd className="figure-sub">day {num(s.day)} · night {num(s.night)}</dd>}
          </div>
        ))}
      </dl>
      <HotspotLegend />
    </>
  );
}

/** The day per satellite: for the tables at the foot of Results. */
export function DayTable({ result }: { result: DayResult | null }) {
  if (!result || !result.covered) return null;
  return (
    <div className="table-block">
    <div className="table-head"><p className="t-label">The day, per satellite</p></div>
    <div className="table-scroll jadwal-box">
    <table>
      <thead><tr><th>Sensor</th><th>Detections</th><th>Day / night</th>{SATELLITES.VIIRS.map((s) => <th key={s}>{s}</th>)}{SATELLITES.MODIS.map((s) => <th key={s}>{s}</th>)}</tr></thead>
      <tbody>
        {sensorsOf(result).map((s) => (
          <tr key={s.name}>
            <td><i className={s.name === "VIIRS" ? "mark-viirs" : "mark-modis"} aria-hidden="true" /> {s.name}</td>
            <td><strong>{count(s.hotspots)}</strong></td>
            <td>{s.hotspots === null ? "–" : `${num(s.day)} / ${num(s.night)}`}</td>
            {[...SATELLITES.VIIRS, ...SATELLITES.MODIS].map((name) => (
              <td key={name}>{(SATELLITES[s.name] as readonly string[]).includes(name) ? count(s.satellites[name] ?? null) : ""}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
    </div>
  );
}
