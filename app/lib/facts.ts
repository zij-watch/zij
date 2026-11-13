// An area's headline facts, in words, for the first HTML the server sends: readable before any
// script runs. The numbers come from the same area file the panel reads, with the same rules.

import type { Area } from "./data";
import { MONTHS, againstNormal, num } from "./format";

export interface AreaFacts {
  id: string;
  name: string;
  country: string;
  unitLabel: string;
  lastFullDay: string;
  busiestMonths: string[]; // "October (median 828)"
  season: string; // "August to October"
  thisMonth: string | null; // the running month against the same days of past years
  anomalies: string[]; // the strongest unusual seasons, newest first
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function areaFacts(area: Area): AreaFacts {
  const clim = area.climatology.months;
  const busiestMonths = clim.month
    .map((m, i) => ({ m, median: clim.median[i] }))
    .sort((a, b) => b.median - a.median)
    .slice(0, 3)
    .map(({ m, median: v }) => `${MONTHS[m - 1]} (median ${num(v)})`);

  const season = area.fit.season;
  const seasonWords = season.length ? `${MONTHS[season[0] - 1]} to ${MONTHS[season[season.length - 1] - 1]}` : "";

  const t = area.this_month;
  const thisMonth =
    t && t.value_to_date !== null && t.median_to_date !== undefined && t.median_to_date !== null
      ? `${MONTHS[t.month - 1]} ${t.year}, first ${t.days_so_far} days: ${num(t.value_to_date, 1)} ${area.unit_label}, ` +
        `${againstNormal(t.value_to_date, t.median_to_date)} (median for the same days ${num(t.median_to_date, 1)}).`
      : null;

  const s = area.seasons;
  const [b0, b1] = area.climatology.baseline_years;
  const normal = median(s.value.filter((_, i) => s.year[i] >= b0 && s.year[i] <= b1));
  const anomalies = s.year
    .map((year, i) => ({ year, i }))
    .filter(({ i }) => s.flag[i] && Number.isFinite(normal) && normal > 0)
    .sort((a, b) => Math.abs(s.value[b.i] - normal) - Math.abs(s.value[a.i] - normal))
    .slice(0, 4)
    .sort((a, b) => b.year - a.year)
    .map(({ year, i }) =>
      `${year} season: ${num(s.value[i])}, ${againstNormal(s.value[i], normal)}` +
      (s.source[i] !== "VIIRS" ? " (converted from MODIS)" : "") + ".");

  return {
    id: area.id,
    name: area.name,
    country: area.country,
    unitLabel: area.unit_label,
    lastFullDay: area.last_full_day,
    busiestMonths,
    season: seasonWords,
    thisMonth,
    anomalies,
  };
}
