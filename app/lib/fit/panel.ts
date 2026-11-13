// A drawn area as a preset-shaped document: the same keys, units and rounding as
// app/public/data/areas/<id>.json (docs/event/DATA_CONTRACT.md), so one panel
// component can render both. `AreaDocument` is also the type of a preset file.
//
// A port of the second half of pipeline/zij/harmonize.py: months, seasons, the
// typical year, the critical period, anomalies and this month against the median.

import { DAY_MS, boundsOf, isBox, weekCalendar } from "./cells";
import type { Box, Cells, CellsIndex, Polygon, Shape } from "./cells";
import { fitDrawnArea, quantile, roundTo } from "./drawn";
import type { Bands, DrawnArea } from "./drawn";
import type { Part } from "./m4";

type N = number | null;
type Flag = "high" | "low" | null;
type Source = "VIIRS" | "MODIS" | "mixed" | "none";

export type AreaDocument = {
  contract: number;
  id: string;
  name: string;
  country: string;
  box: Box;
  polygon?: Polygon; // drawn polygons only: `box` is then the box around it
  n_cells: number;
  unit: string;
  unit_label: string;
  built_at_utc: string;
  last_full_day: string;
  first_week: string;
  last_week: string;
  fit: {
    model: "M4";
    mode: "own" | "blend" | "none";
    n_fire_weeks: number;
    season: number[];
    train_years: [number, number];
    parts: Part[];
    single_satellite_ratio: { Terra: number[]; Aqua: number[] };
  };
  bands: Bands;
  terra_only_test: { mean_bias_before_pct: N; mean_bias_after_pct: N; mean_bias_two_satellites_pct: N };
  weeks: {
    week_start: string[]; year: number[]; iso_week: number[]; month: number[];
    value: N[]; lo: N[]; hi: N[]; source: Source[]; flag: Flag[]; is_partial: boolean[];
    modis_hotspots: N[]; viirs_hotspots: N[]; n_sat_modis: N[]; n_sat_viirs: N[]; modis: N[]; viirs: N[];
  };
  months: {
    year: number[]; month: number[]; value: N[]; lo: N[]; hi: N[]; source: Source[];
    days_with_data: number[]; complete: boolean[]; anomaly_pct: N[]; flag: Flag[];
  };
  seasons: {
    year: number[]; value: N[]; lo: N[]; hi: N[]; source: Source[]; terra_only: boolean[]; flag: Flag[]; modis: N[]; viirs: N[];
  };
  climatology: {
    baseline_years: [number, number];
    percentiles: [number, number];
    months: { month: number[]; median: N[]; mean: N[]; p10: N[]; p25: N[]; p75: N[]; p90: N[]; n_years: number[] };
    weeks: { iso_week: number[]; median: N[]; mean: N[]; p10: N[]; p90: N[]; n_years: number[]; critical: boolean[] };
    critical_share: number;
    critical_weeks: number[];
  };
  this_month: {
    year: number; month: number; days_so_far: number; value_to_date: N; baseline_n: number; to_date_years: number[]; to_date_values: number[];
    p10_to_date?: N; p25_to_date?: N; median_to_date?: N; p75_to_date?: N; p90_to_date?: N; pct_vs_median?: N;
  };
  satellites: Record<string, { code: string; family: "MODIS" | "VIIRS"; days: N[]; fire_days: N[]; hotspots: N[] }>;
};

type Stats = { median: number; mean: number; p10: number; p25: number; p75: number; p90: number; n: number };

function stats(values: number[], low: number, high: number): Stats {
  if (values.length === 0) return { median: NaN, mean: NaN, p10: NaN, p25: NaN, p75: NaN, p90: NaN, n: 0 };
  return {
    median: quantile(values, 0.5), mean: values.reduce((s, x) => s + x, 0) / values.length,
    p10: quantile(values, low / 100), p25: quantile(values, 0.25), p75: quantile(values, 0.75), p90: quantile(values, high / 100),
    n: values.length,
  };
}

/**
 * Outside the low to high percentile? No flag without a value or without a baseline.
 * A value that sits on the percentile itself (it often is one of the baseline years)
 * is not outside it: sums that differ in the 15th decimal must not decide a flag.
 */
function flag(x: number, low: number, high: number): Flag {
  if (!Number.isFinite(x) || !Number.isFinite(low)) return null;
  const tie = 1e-9 * Math.max(1, Math.abs(x));
  return x > high + tie ? "high" : x < low - tie ? "low" : null;
}

const round2 = (xs: ArrayLike<number>): N[] => Array.from(xs, (x) => roundTo(x, 2));

function roundPart(part: Part): Part {
  const r = (x: number) => roundTo(x, 5) as number;
  return { ...part, scale: r(part.scale), b: r(part.b), g: r(part.g), a: r(part.a), c: part.c.map(r), d: r(part.d), z_ref: r(part.z_ref), s_typ: r(part.s_typ), weight: r(part.weight) };
}

/** The preset-shaped document of a fitted area. `meta` names it: a drawn area has no name of its own. */
export function areaDocument(area: DrawnArea, index: CellsIndex, meta: { id: string; name: string }): AreaDocument {
  const rec = area.record;
  const n = rec.week.length;
  const cal = weekCalendar(index);
  const [baseFirst, baseLast] = index.baseline_years;
  const [pLow, pHigh] = index.percentiles;
  const inBaseline = (year: number) => year >= baseFirst && year <= baseLast;
  const last = new Date(index.last_full_day + "T00:00:00Z");
  const lastMs = last.getTime();
  const noFit = area.fit.mode === "none";
  const monthMult = noFit ? [1, 1] : (area.bands.month_mult as [number, number]);
  const seasonPct = noFit ? [0, 0] : (area.bands.season_pct as [number, number]);
  const terraPct = noFit ? [0, 0] : (area.bands.terra_only_season_pct as [number, number]);

  // ---- days: each week's value spread evenly over its 7 days, then summed by calendar month.
  type MonthSum = { year: number; month: number; value: number; days: number; modis: number; viirs: number; hasModis: boolean; hasViirs: boolean };
  const monthSums = new Map<number, MonthSum>();
  const toDate = new Map<number, { value: number; days: number }>(); // this month's days so far, per year
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(area.value[i])) continue;
    const start = cal.startMs[rec.week[i]];
    const perDay = area.value[i] / 7;
    for (let k = 0; k < 7; k++) {
      const ms = start + k * DAY_MS;
      const day = new Date(ms);
      const year = day.getUTCFullYear(), month = day.getUTCMonth() + 1, dom = day.getUTCDate();
      if (month === last.getUTCMonth() + 1 && dom <= last.getUTCDate()) {
        const t = toDate.get(year) ?? { value: 0, days: 0 };
        t.value += perDay;
        t.days += 1;
        toDate.set(year, t);
      }
      if (ms > lastMs) continue;
      const key = year * 12 + month - 1;
      let m = monthSums.get(key);
      if (!m) monthSums.set(key, (m = { year, month, value: 0, days: 0, modis: 0, viirs: 0, hasModis: false, hasViirs: false }));
      m.value += perDay;
      m.days += 1;
      if (area.source[i] === "VIIRS") {
        m.viirs += perDay;
        m.hasViirs = true;
      } else {
        m.modis += perDay;
        m.hasModis = true;
      }
    }
  }
  const months = [...monthSums.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => {
    const source: Source = m.hasModis && m.hasViirs ? "mixed" : m.hasViirs ? "VIIRS" : "MODIS";
    return {
      ...m, source,
      complete: m.days === new Date(Date.UTC(m.year, m.month, 0)).getUTCDate(),
      lo: source === "VIIRS" ? NaN : m.viirs + Math.max((m.modis + 1) * monthMult[0] - 1, 0),
      hi: source === "VIIRS" ? NaN : m.viirs + (m.modis + 1) * monthMult[1] - 1,
    };
  });

  // ---- the typical year over the baseline years, and the critical period.
  const climMonths = Array.from({ length: 12 }, (_, k) =>
    stats(months.filter((m) => m.complete && inBaseline(m.year) && m.month === k + 1).map((m) => m.value), pLow, pHigh));
  const byIsoWeek: number[][] = Array.from({ length: 54 }, () => []);
  for (let i = 0; i < n; i++) {
    if (inBaseline(rec.year[i]) && !area.isPartial[i] && Number.isFinite(area.value[i])) byIsoWeek[rec.isoWeek[i]].push(area.value[i]);
  }
  const climWeeks = Array.from({ length: 53 }, (_, k) => stats(byIsoWeek[k + 1], pLow, pHigh));
  const typical = climWeeks.slice(0, 52).map((s) => (Number.isFinite(s.mean) ? s.mean : 0));
  const typicalTotal = typical.reduce((s, x) => s + x, 0);
  const order = typical.map((mean, k) => ({ mean, week: k + 1 })).sort((a, b) => b.mean - a.mean); // ties keep week order
  let nCritical = 0;
  if (typicalTotal > 0) {
    let running = 0;
    nCritical = order.length;
    for (let k = 0; k < order.length; k++) {
      running += order[k].mean;
      if (running >= index.critical_share * typicalTotal) {
        nCritical = k + 1;
        break;
      }
    }
  }
  const critical = order.slice(0, nCritical).map((o) => o.week).sort((a, b) => a - b);

  // ---- anomalies: a month against the same calendar month, a week against the same ISO week.
  const monthFlags = months.map((m) => (m.complete ? flag(m.value, climMonths[m.month - 1].p10, climMonths[m.month - 1].p90) : null));
  const monthAnomaly = months.map((m) => {
    const median = climMonths[m.month - 1].median;
    return median > 0 ? (100 * (m.value - median)) / median : NaN;
  });
  const weekFlags: Flag[] = Array.from({ length: n }, (_, i) => {
    const s = climWeeks[rec.isoWeek[i] - 1];
    return area.isPartial[i] ? null : flag(area.value[i], s.p10, s.p90);
  });

  // ---- seasons: the area's 3 season months, per ISO year, whole seasons only.
  type SeasonSum = { year: number; value: number; weeks: number; modisWeeks: number; terra: number; modis: number; viirs: number; hasViirs: boolean };
  const seasonSums = new Map<number, SeasonSum>();
  for (let i = 0; i < n; i++) {
    if (!area.season.includes(rec.month[i]) || !Number.isFinite(area.value[i])) continue;
    let s = seasonSums.get(rec.year[i]);
    if (!s) seasonSums.set(rec.year[i], (s = { year: rec.year[i], value: 0, weeks: 0, modisWeeks: 0, terra: 0, modis: 0, viirs: 0, hasViirs: false }));
    s.value += area.value[i];
    s.weeks += 1;
    if (area.source[i] === "MODIS") s.modisWeeks += 1;
    if (rec.alone[i] === "Terra") s.terra += 1;
    s.modis += rec.M[i];
    if (!Number.isNaN(rec.V[i])) {
      s.viirs += rec.V[i];
      s.hasViirs = true;
    }
  }
  const seasonRows = [...seasonSums.values()].filter((s) => s.weeks >= 12).sort((a, b) => a.year - b.year); // 3 months are 13 weeks, give or take one
  const seasonBase = seasonRows.filter((s) => inBaseline(s.year)).map((s) => s.value);
  const seasonLow = seasonBase.length ? quantile(seasonBase, pLow / 100) : NaN;
  const seasonHigh = seasonBase.length ? quantile(seasonBase, pHigh / 100) : NaN;
  const seasons = seasonRows.map((s) => {
    const source: Source = s.modisWeeks === 0 ? "VIIRS" : s.modisWeeks === s.weeks ? "MODIS" : "mixed";
    const terraOnly = s.terra / s.weeks > 0.5;
    const pct = terraOnly ? terraPct : seasonPct;
    const converted = source === "MODIS" && Number.isFinite(s.value);
    return {
      year: s.year, value: s.value, source, terraOnly,
      lo: converted ? s.value / (1 + pct[1] / 100) : NaN,
      hi: converted ? s.value / (1 + pct[0] / 100) : NaN,
      flag: flag(s.value, seasonLow, seasonHigh),
      modis: s.modis, viirs: s.hasViirs ? s.viirs : NaN,
    };
  });

  // ---- this month so far, against the same days of the baseline years.
  const lastYear = last.getUTCFullYear(), lastDom = last.getUTCDate();
  const now = toDate.get(lastYear);
  const pastYears = [...toDate.entries()].filter(([year, t]) => inBaseline(year) && t.days === lastDom).sort((a, b) => a[0] - b[0]);
  const past = pastYears.map(([, t]) => t.value);
  const thisMonth: AreaDocument["this_month"] = {
    year: lastYear, month: last.getUTCMonth() + 1, days_so_far: now ? now.days : 0,
    value_to_date: now ? roundTo(now.value, 2) : null, baseline_n: past.length,
    // Each baseline year's value for the same days, so a verdict can state an exact rank.
    to_date_years: pastYears.map(([year]) => year), to_date_values: past.map((v) => roundTo(v, 2) as number),
  };
  if (past.length) {
    const median = quantile(past, 0.5);
    thisMonth.p10_to_date = roundTo(quantile(past, pLow / 100), 2);
    thisMonth.p25_to_date = roundTo(quantile(past, 0.25), 2);
    thisMonth.median_to_date = roundTo(median, 2);
    thisMonth.p75_to_date = roundTo(quantile(past, 0.75), 2);
    thisMonth.p90_to_date = roundTo(quantile(past, pHigh / 100), 2);
    if (now && median > 0) thisMonth.pct_vs_median = roundTo((100 * (now.value - median)) / median, 2);
  }

  // ---- raw counts per satellite, on the record's weeks; null when the satellite was not flying.
  const satellites: AreaDocument["satellites"] = {};
  for (const s of rec.satellites) {
    const weeks = Array.from(rec.week);
    if (!weeks.some((w) => s.days[w] > 0)) continue;
    satellites[s.name] = {
      code: s.code, family: s.family,
      days: weeks.map((w) => (s.days[w] > 0 ? s.days[w] : null)),
      fire_days: weeks.map((w) => (s.days[w] > 0 ? s.fireDays[w] : null)),
      hotspots: weeks.map((w) => (s.days[w] > 0 ? s.hotspots[w] : null)),
    };
  }

  const mean = (xs: number[]) => (xs.length ? roundTo((xs.reduce((s, x) => s + x, 0) / xs.length) * 100, 1) : null);
  const doc: AreaDocument = {
    contract: index.contract, id: meta.id, name: meta.name, country: area.country,
    box: boundsOf(area.shape), n_cells: rec.nCells, unit: index.unit, unit_label: index.unit_label,
    built_at_utc: new Date().toISOString().slice(0, 19) + "+00:00",
    last_full_day: index.last_full_day,
    first_week: rec.weekStart[0], last_week: rec.weekStart[n - 1],
    fit: {
      model: "M4", mode: area.fit.mode, n_fire_weeks: area.fit.n_fire_weeks, season: area.season, train_years: index.train_years,
      parts: area.fit.parts.map(roundPart),
      single_satellite_ratio: {
        Terra: rec.ratios.Terra.map((x) => roundTo(x, 4) as number),
        Aqua: rec.ratios.Aqua.map((x) => roundTo(x, 4) as number),
      },
    },
    bands: area.bands,
    terra_only_test: {
      mean_bias_before_pct: mean(area.terra.map((t) => t.before)),
      mean_bias_after_pct: mean(area.terra.map((t) => t.after)),
      mean_bias_two_satellites_pct: mean(area.terra.map((t) => t.two_satellites)),
    },
    weeks: {
      week_start: rec.weekStart, year: Array.from(rec.year), iso_week: Array.from(rec.isoWeek), month: Array.from(rec.month),
      value: round2(area.value), lo: round2(area.lo), hi: round2(area.hi), source: area.source, flag: weekFlags,
      is_partial: Array.from(area.isPartial, (x) => x === 1),
      modis_hotspots: round2(rec.modisHotspots), viirs_hotspots: round2(rec.viirsHotspots),
      n_sat_modis: round2(rec.nSatModis), n_sat_viirs: round2(rec.nSatViirs),
      modis: round2(rec.M), viirs: round2(rec.V),
    },
    months: {
      year: months.map((m) => m.year), month: months.map((m) => m.month),
      value: round2(months.map((m) => m.value)), lo: round2(months.map((m) => m.lo)), hi: round2(months.map((m) => m.hi)),
      source: months.map((m) => m.source), days_with_data: months.map((m) => m.days), complete: months.map((m) => m.complete),
      anomaly_pct: round2(monthAnomaly), flag: monthFlags,
    },
    seasons: {
      year: seasons.map((s) => s.year), value: round2(seasons.map((s) => s.value)),
      lo: round2(seasons.map((s) => s.lo)), hi: round2(seasons.map((s) => s.hi)),
      source: seasons.map((s) => s.source), terra_only: seasons.map((s) => s.terraOnly), flag: seasons.map((s) => s.flag),
      modis: round2(seasons.map((s) => s.modis)), viirs: round2(seasons.map((s) => s.viirs)),
    },
    climatology: {
      baseline_years: index.baseline_years, percentiles: index.percentiles,
      months: {
        month: climMonths.map((_, k) => k + 1),
        median: round2(climMonths.map((s) => s.median)), mean: round2(climMonths.map((s) => s.mean)),
        p10: round2(climMonths.map((s) => s.p10)), p25: round2(climMonths.map((s) => s.p25)),
        p75: round2(climMonths.map((s) => s.p75)), p90: round2(climMonths.map((s) => s.p90)),
        n_years: climMonths.map((s) => s.n),
      },
      weeks: {
        iso_week: climWeeks.map((_, k) => k + 1),
        median: round2(climWeeks.map((s) => s.median)), mean: round2(climWeeks.map((s) => s.mean)),
        p10: round2(climWeeks.map((s) => s.p10)), p90: round2(climWeeks.map((s) => s.p90)),
        n_years: climWeeks.map((s) => s.n), critical: climWeeks.map((_, k) => critical.includes(k + 1)),
      },
      critical_share: index.critical_share, critical_weeks: critical,
    },
    this_month: thisMonth,
    satellites,
  };
  if (!isBox(area.shape)) doc.polygon = area.shape;
  return doc;
}

/** A drawn box or polygon straight to its document: record, fit, bands and everything the panel shows. */
export function drawnAreaDocument(cells: Cells, index: CellsIndex, country: string, shape: Shape,
                                  meta: { id: string; name: string } = { id: "drawn", name: "Drawn area" }): AreaDocument {
  return areaDocument(fitDrawnArea(cells, index, country, shape), index, meta);
}
