// The day view: one day's hotspots for the map, each labelled with its sensor,
// and how the week and the month that hold that day compare with their
// historical median. The comparison is read from the area's document (a preset
// file, or a drawn area's from app/lib/fit/panel.ts), so both kinds of area work.

import { roundTo } from "../fit/drawn";
import type { AreaDocument } from "../fit/panel";
import { confidenceOf, dailySummary, selectHotspots, timeOf } from "./hotspots";
import type { DaySummary, HotspotFile, HotspotIndex, Sensor } from "./hotspots";

type N = number | null;

export type DayHotspot = {
  latitude: number;
  longitude: number;
  time_utc: string;            // HH:MM
  satellite: string;           // Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21
  sensor: Sensor;              // print this word on the map as well as a colour
  confidence: number | string; // MODIS: percent. VIIRS: nominal or high
  frp_mw: number;
  daynight: "D" | "N";
  version: "SP" | "NRT";
};

export type DayView = {
  date: string;
  hotspots: DayHotspot[];
  summary: DaySummary; // counts per sensor and satellite; null where a satellite was not flying
  /** The ISO week holding the day. Null when MODIS has no data that week. */
  week: null | {
    week_start: string; iso_week: number;
    value: N; lo: N; hi: N; source: string; flag: "high" | "low" | null; is_partial: boolean;
    median: N; p10: N; p90: N; n_years: number;
    pct_vs_median: N;        // percent above (+) or below (-) the median of the same ISO week
    in_critical_period: boolean;
    modis_hotspots: N; viirs_hotspots: N;
  };
  /** The calendar month holding the day. Null when the record has no day of that month. */
  month: null | {
    year: number; month: number;
    value: N; lo: N; hi: N; source: string; flag: "high" | "low" | null; complete: boolean; days_with_data: number;
    median: N; p10: N; p90: N; n_years: number;
    pct_vs_median: N;        // against the same calendar month; for the running month it compares part of a month with whole ones
    /** The running month only: its days so far against the same days of past years, the fair comparison. */
    to_date: AreaDocument["this_month"] | null;
  };
};

function percent(value: N, median: N): N {
  return value !== null && median !== null && median > 0 ? roundTo((100 * (value - median)) / median, 2) : null;
}

/**
 * Everything the day view shows for `date` (YYYY-MM-DD). `files` are the decoded
 * hotspot files for the area and that day (HotspotLoader.load); `doc` is the
 * area's document. The area is the document's polygon if it has one, else its box.
 */
export function dayView(files: HotspotFile[], index: HotspotIndex, doc: AreaDocument, date: string,
                        options: { by?: "cell" | "point" } = {}): DayView {
  const selection = selectHotspots(files, index, doc.polygon ?? doc.box, date, date, options);
  const hotspots: DayHotspot[] = [];
  for (let k = 0; k < selection.n; k++) {
    const s = index.satellites[selection.satellite[k]];
    hotspots.push({
      latitude: selection.lat[k], longitude: selection.lon[k], time_utc: timeOf(selection.minute[k]),
      satellite: s.name, sensor: s.sensor, confidence: confidenceOf(index, selection.confidence[k]),
      frp_mw: Math.round(selection.frp[k] * 100) / 100, daynight: selection.night[k] ? "N" : "D", version: selection.nrt[k] ? "NRT" : "SP",
    });
  }
  const summary = dailySummary(selection, index)[0]
    ?? { date, hotspots: 0, sensors: { MODIS: { hotspots: null, frp_sum: null, day: null, night: null, satellites: {} },
                                        VIIRS: { hotspots: null, frp_sum: null, day: null, night: null, satellites: {} } } };

  // The week: its Monday is the last week_start on or before the day, if the day is within 6 days of it.
  const w = doc.weeks;
  let week: DayView["week"] = null;
  let i = -1;
  for (let k = 0; k < w.week_start.length && w.week_start[k] <= date; k++) i = k;
  if (i >= 0 && Date.parse(date) - Date.parse(w.week_start[i]) <= 6 * 86400000) {
    const c = doc.climatology.weeks;
    const at = c.iso_week.indexOf(w.iso_week[i]);
    week = {
      week_start: w.week_start[i], iso_week: w.iso_week[i],
      value: w.value[i], lo: w.lo[i], hi: w.hi[i], source: w.source[i], flag: w.flag[i], is_partial: w.is_partial[i],
      median: c.median[at], p10: c.p10[at], p90: c.p90[at], n_years: c.n_years[at],
      pct_vs_median: percent(w.value[i], c.median[at]),
      in_critical_period: doc.climatology.critical_weeks.includes(w.iso_week[i]),
      modis_hotspots: w.modis_hotspots[i], viirs_hotspots: w.viirs_hotspots[i],
    };
  }

  const year = Number(date.slice(0, 4)), monthNumber = Number(date.slice(5, 7));
  const m = doc.months;
  let month: DayView["month"] = null;
  const j = m.year.findIndex((y, k) => y === year && m.month[k] === monthNumber);
  if (j >= 0) {
    const c = doc.climatology.months;
    const at = monthNumber - 1;
    const running = doc.this_month.year === year && doc.this_month.month === monthNumber;
    month = {
      year, month: monthNumber,
      value: m.value[j], lo: m.lo[j], hi: m.hi[j], source: m.source[j], flag: m.flag[j], complete: m.complete[j], days_with_data: m.days_with_data[j],
      median: c.median[at], p10: c.p10[at], p90: c.p90[at], n_years: c.n_years[at],
      pct_vs_median: m.anomaly_pct[j],
      to_date: running ? doc.this_month : null,
    };
  }
  return { date, hotspots, summary, week, month };
}
