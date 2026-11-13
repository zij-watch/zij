// Things the panel reads from an area document that are not stored in it.

import type { Area } from "./data";

/** Percentile with linear interpolation between ranks (the pipeline's method). */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const h = ((sorted.length - 1) * p) / 100;
  const low = Math.floor(h);
  const high = Math.min(low + 1, sorted.length - 1);
  return sorted[low] + (h - low) * (sorted[high] - sorted[low]);
}

export interface RawMonth {
  modis: number | null; // raw MODIS fire days in the month, null when MODIS has no data
  viirs: number | null;
  modis_hotspots: number | null;
  viirs_hotspots: number | null;
}

/**
 * Raw counts per sensor for every month, keyed "YYYY-MM": each week's raw value
 * spread evenly over its 7 days, like the harmonized months.
 */
export function rawByMonth(area: Area): Map<string, RawMonth> {
  const out = new Map<string, RawMonth>();
  const w = area.weeks;
  const add = (row: RawMonth, key: keyof RawMonth, value: number | null) => {
    if (value !== null) row[key] = (row[key] ?? 0) + value / 7;
  };
  for (let i = 0; i < w.week_start.length; i++) {
    const day = new Date(`${w.week_start[i]}T00:00:00Z`);
    for (let d = 0; d < 7; d++) {
      const ym = day.toISOString().slice(0, 7);
      let row = out.get(ym);
      if (!row) {
        row = { modis: null, viirs: null, modis_hotspots: null, viirs_hotspots: null };
        out.set(ym, row);
      }
      add(row, "modis", w.modis[i]);
      add(row, "viirs", w.viirs[i]);
      add(row, "modis_hotspots", w.modis_hotspots[i]);
      add(row, "viirs_hotspots", w.viirs_hotspots[i]);
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  return out;
}

export const STRONG_PERCENTILES: [number, number] = [5, 95];

/**
 * Strong anomalies, for the calendar: a complete month outside the 5th to 95th
 * percentile of the same calendar month over the baseline years. "YYYY-MM" -> high | low.
 */
export function strongAnomalies(area: Area): Map<string, "high" | "low"> {
  const m = area.months;
  const [b0, b1] = area.climatology.baseline_years;
  const limits = Array.from({ length: 12 }, (_, k) => {
    const base = m.value.filter((_, i) => m.month[i] === k + 1 && m.complete[i] && m.year[i] >= b0 && m.year[i] <= b1);
    return [percentile(base, STRONG_PERCENTILES[0]), percentile(base, STRONG_PERCENTILES[1])];
  });
  const out = new Map<string, "high" | "low">();
  m.year.forEach((year, i) => {
    if (!m.complete[i] || m.value[i] === null) return;
    const [low, high] = limits[m.month[i] - 1];
    const tolerance = 1e-9 * Math.max(1, Math.abs(high));
    if (m.value[i] > high + tolerance) out.set(`${year}-${String(m.month[i]).padStart(2, "0")}`, "high");
    else if (m.value[i] < low - tolerance) out.set(`${year}-${String(m.month[i]).padStart(2, "0")}`, "low");
  });
  return out;
}
