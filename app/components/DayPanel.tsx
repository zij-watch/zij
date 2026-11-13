"use client";

// The day view's words and numbers: that day's detections per sensor and satellite,
// and how its week and month compare with the historical median.

import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { MONTHS, againstNormal, num } from "@/lib/format";

// Every satellite of a sensor is listed on every day: one that was not flying says so.
const SATELLITES = { MODIS: ["Terra", "Aqua"], VIIRS: ["Suomi NPP", "NOAA-20", "NOAA-21"] } as const;

function dayWords(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function count(value: number | null): string {
  return value === null ? "not flying" : num(value);
}

export function HotspotLegend() {
  return (
    <p className="legend" aria-label="Map legend">
      <span><i className="mark-viirs" aria-hidden="true" /> VIIRS: filled dot</span>
      <span><i className="mark-modis" aria-hidden="true" /> MODIS: open ring</span>
      <span>Click a mark for its details.</span>
    </p>
  );
}

export default function DayPanel({ area, date, result, loading, onClose }: { area: Area; date: string; result: DayResult | null; loading: boolean; onClose: () => void }) {
  const view = result?.view;
  const sensors = view ? (["VIIRS", "MODIS"] as const).map((name) => ({ name, ...view.summary.sensors[name] })) : [];
  const week = view?.week;
  const month = view?.month;
  const toDate = month?.to_date;
  return (
    <section className="block day">
      <div className="detail-head">
        <h3>{dayWords(date)}</h3>
        <button type="button" onClick={onClose}>Close day</button>
      </div>
      {loading && <p>Loading the hotspots of this region&hellip;</p>}
      {result && !result.covered && (
        <p className="warning">
          Single hotspots are not shipped for this part of {area.country}: in Argentina they cover only the Chilecito and Parana Delta
          areas. The map shows none here. The weekly and monthly numbers below still hold.
        </p>
      )}
      {result && result.covered && view && (
        <>
          <p>
            <strong>{num(view.summary.hotspots)}</strong> fire detections in this area on this day (kept detections, all satellites).
            MODIS and VIIRS counts are not on the same scale: VIIRS sees much smaller fires.
          </p>
          <HotspotLegend />
          <div className="table-scroll">
            <table>
              <thead><tr><th>Sensor</th><th>Detections</th><th>By day / night</th><th>Per satellite</th></tr></thead>
              <tbody>
                {sensors.map((s) => (
                  <tr key={s.name}>
                    <td><i className={s.name === "VIIRS" ? "mark-viirs" : "mark-modis"} aria-hidden="true" /> {s.name}</td>
                    <td><strong>{count(s.hotspots)}</strong></td>
                    <td>{s.hotspots === null ? "–" : `${num(s.day)} / ${num(s.night)}`}</td>
                    <td>{SATELLITES[s.name].map((name) => `${name}: ${count(s.satellites[name] ?? null)}`).join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {week && week.value !== null && week.median !== null && (
        <p>
          <strong>Its week</strong> (from {week.week_start}): {num(week.value, 1)} {area.unit_label}
          {week.source === "MODIS" && week.lo !== null ? `, converted from MODIS (likely ${num(week.lo, 1)} to ${num(week.hi, 1)})` : ""}.
          The median for this week of the year is {num(week.median, 1)}: <strong>{againstNormal(week.value, week.median)}</strong>
          {week.flag ? `, unusually ${week.flag}` : ""}.{week.is_partial ? " The week is not complete." : ""}
          {week.in_critical_period ? " This week is inside the critical period." : ""}
        </p>
      )}
      {month && toDate && toDate.value_to_date !== null && toDate.median_to_date !== undefined && toDate.median_to_date !== null && (
        <p>
          <strong>Its month</strong>, {MONTHS[month.month - 1]} {month.year}, is still running: {num(toDate.value_to_date, 1)} {area.unit_label} in
          its first {toDate.days_so_far} days. The median for the same days of past years is {num(toDate.median_to_date, 1)}:{" "}
          <strong>{againstNormal(toDate.value_to_date, toDate.median_to_date)}</strong>.
        </p>
      )}
      {month && !toDate && month.value !== null && month.median !== null && (
        <p>
          <strong>Its month</strong>, {MONTHS[month.month - 1]} {month.year}: {num(month.value)} {area.unit_label}
          {month.source !== "VIIRS" && month.lo !== null ? `, converted from MODIS (likely ${num(month.lo)} to ${num(month.hi)})` : ""}.
          The median {MONTHS[month.month - 1]} is {num(month.median)}: <strong>{againstNormal(month.value, month.median)}</strong>
          {month.flag ? `, unusually ${month.flag}` : ""}.{month.complete ? "" : ` Only ${month.days_with_data} days have data.`}
        </p>
      )}
      {view && !week && <p>MODIS and VIIRS have no data for the week of this day.</p>}
    </section>
  );
}
