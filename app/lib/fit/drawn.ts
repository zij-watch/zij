// A drawn box or polygon, start to finish: the weekly record from the cell file,
// the M4 fit under the small-area rule, the harmonized weeks, the Terra-only
// test and the bands. The steps are those of pipeline/zij/harmonize.py for a
// named area. panel.ts turns the result into a preset-shaped document.

import { areaRecord, DAY_MS, singleSatelliteRatios, TERRA, trainingWeeks, weekCalendar } from "./cells";
import type { AreaRecord, Cells, CellsIndex, Shape } from "./cells";
import { fitArea, predictArea, seasonMonths } from "./m4";
import type { AreaFit } from "./m4";

type Pair = [number, number] | [null, null];

/** The keys of `bands` in docs/event/DATA_CONTRACT.md, rounded as the pipeline rounds them. */
export type Bands = {
  week_mult: Pair;               // a converted week's band is (P + 1) x lo - 1 to (P + 1) x hi - 1, floored at 0
  month_mult: Pair;              // the same for the MODIS part of a month
  season_pct: Pair;              // the true season total lies between P / (1 + hi/100) and P / (1 + lo/100)
  terra_only_season_pct: Pair;   // the same for seasons when MODIS was Terra alone
  season_errors_pct: number[];
  basis: string;
  own_season_pct?: Pair;         // blended areas: the area's own errors, beside the pooled band used
};

export const BASIS_OWN = "own leave-one-year-out errors";
export const BASIS_POOLED = "pooled small-area band (30 to 99 MODIS fire weeks)";
const NO_BANDS: Bands = {
  week_mult: [null, null], month_mult: [null, null], season_pct: [null, null], terra_only_season_pct: [null, null],
  season_errors_pct: [], basis: "none",
};

/** One training year replayed with MODIS = Terra alone: season error as a fraction, before and after the correction. */
export type TerraYear = { year: number; before: number; after: number; two_satellites: number };

export type DrawnArea = {
  country: string;
  shape: Shape;
  record: AreaRecord;
  season: number[];
  fit: AreaFit;                          // mode "own", "blend" (show the warning) or "none" (raw counts only)
  predicted: Float64Array;               // MODIS converted with M4, for every week of the record; NaN with no fit
  value: Float64Array;                   // VIIRS where VIIRS has data, otherwise `predicted`
  lo: Float64Array;                      // the weekly band; NaN on VIIRS weeks and with no fit
  hi: Float64Array;
  source: ("VIIRS" | "MODIS" | "none")[];
  isPartial: Uint8Array;                 // the sensor behind `value` flew on fewer than 7 days
  bands: Bands;
  terra: TerraYear[];
};

/** numpy's default quantile and percentile: linear between the two nearest ranks. */
export function quantile(values: ArrayLike<number>, q: number): number {
  const s = Array.from(values).sort((x, y) => x - y);
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (at - lo) : s[lo];
}

/**
 * Rounds as Python does: to the nearest, and an exact half to the even digit.
 * Not finite gives null, as in the exported files.
 */
export function roundTo(x: number, digits = 2): number | null {
  if (!Number.isFinite(x)) return null;
  const fixed = Number(x.toFixed(digits));
  if (/^50*$/.test(Math.abs(x).toFixed(digits + 20).slice(-20))) { // an exact half
    const scale = 10 ** digits;
    const n = Math.round(Math.abs(fixed) * scale);
    if (n % 2 === 1) return (Math.sign(x) * (n - 1)) / scale;
  }
  return fixed;
}

const pair = (lo: number, hi: number, digits: number): Pair => {
  const a = roundTo(lo, digits), b = roundTo(hi, digits);
  return a === null || b === null ? [null, null] : [a, b];
};

/** Leave one year out over the training years: each year predicted by a fit that never saw it. */
function leaveOneYearOut(rec: AreaRecord, index: CellsIndex, country: string, season: number[]) {
  const all = trainingWeeks(rec, index.train_years);
  const predicted = new Float64Array(all.rows.length).fill(NaN);
  const fits = new Map<number, AreaFit>();
  for (let year = index.train_years[0]; year <= index.train_years[1]; year++) {
    const fold = fitArea(trainingWeeks(rec, index.train_years, year), index.countries[country].parts[String(year)], season);
    fits.set(year, fold);
    const at: number[] = [];
    for (let i = 0; i < all.year.length; i++) if (all.year[i] === year) at.push(i);
    if (fold.mode === "none" || at.length === 0) continue;
    const pick = (xs: ArrayLike<number>) => at.map((i) => xs[i]);
    const p = predictArea(fold, pick(all.M), pick(all.month), pick(all.year), pick(all.frp));
    at.forEach((i, k) => { predicted[i] = p[k]; });
  }
  return { all, predicted, fits };
}

/**
 * Each training year replayed with MODIS = Terra alone, as in 2000 to mid 2002.
 * The fit and the Terra ratio both leave the year out.
 */
function terraOnlyTest(rec: AreaRecord, index: CellsIndex, fits: Map<number, AreaFit>, season: number[]): TerraYear[] {
  const all = trainingWeeks(rec, index.train_years);
  const terraOf = new Map(rec.twoSatelliteWeeks.map((w) => [w.week, w.terra]));
  const out: TerraYear[] = [];
  for (let year = index.train_years[0]; year <= index.train_years[1]; year++) {
    const fold = fits.get(year)!;
    const at: number[] = [];
    for (let i = 0; i < all.rows.length; i++) if (all.year[i] === year && terraOf.has(rec.week[all.rows[i]])) at.push(i);
    if (fold.mode === "none" || at.length === 0) continue;
    const ratio = singleSatelliteRatios(rec.twoSatelliteWeeks.filter((w) => w.year !== year)).Terra;
    const pick = (xs: ArrayLike<number>) => at.map((i) => xs[i]);
    const month = pick(all.month), years = pick(all.year), frp = pick(all.frp), V = pick(all.V);
    const before = at.map((i) => terraOf.get(rec.week[all.rows[i]])!);
    const after = before.map((m, k) => m * ratio[month[k] - 1]);
    const inSeason = month.map((m) => season.includes(m));
    const total = (xs: ArrayLike<number>) => inSeason.reduce((s, ins, k) => (ins ? s + xs[k] : s), 0);
    const actual = total(V);
    if (actual <= 0) continue;
    const error = (M: ArrayLike<number>) => total(predictArea(fold, M, month, years, frp)) / actual - 1;
    out.push({ year, before: error(before), after: error(after), two_satellites: error(pick(all.M)) });
  }
  return out;
}

function bandsOf(rec: AreaRecord, index: CellsIndex, country: string, season: number[], mode: AreaFit["mode"]): { bands: Bands; terra: TerraYear[] } {
  const { all, predicted, fits } = leaveOneYearOut(rec, index, country, season);
  const terra = terraOnlyTest(rec, index, fits, season);
  if (mode === "none") return { bands: NO_BANDS, terra };

  const cal = weekCalendar(index);
  const weekLogs: number[] = [];
  const byMonth = new Map<number, { actual: number; predicted: number }>();
  for (let i = 0; i < predicted.length; i++) {
    if (!Number.isFinite(predicted[i])) continue;
    weekLogs.push(Math.log((all.V[i] + 1) / (predicted[i] + 1)));
    // Months: the same predictions, split evenly over the week's 7 days and summed by calendar month.
    const start = cal.startMs[rec.week[all.rows[i]]];
    for (let k = 0; k < 7; k++) {
      const day = new Date(start + k * DAY_MS);
      const key = day.getUTCFullYear() * 12 + day.getUTCMonth();
      const m = byMonth.get(key) ?? { actual: 0, predicted: 0 };
      m.actual += all.V[i] / 7;
      m.predicted += predicted[i] / 7;
      byMonth.set(key, m);
    }
  }
  const monthLogs = [...byMonth.values()].map((m) => Math.log((m.actual + 1) / (m.predicted + 1)));
  const errors: number[] = [];
  for (let year = index.train_years[0]; year <= index.train_years[1]; year++) {
    let actual = 0, p = 0;
    for (let i = 0; i < predicted.length; i++) {
      if (all.year[i] === year && season.includes(all.month[i]) && Number.isFinite(predicted[i])) {
        actual += all.V[i];
        p += predicted[i];
      }
    }
    if (actual > 0) errors.push(p / actual - 1);
  }
  const seasonBand = pair(quantile(errors, 0.1) * 100, quantile(errors, 0.9) * 100, 1);
  const after = terra.map((t) => t.after);
  const bands: Bands = {
    week_mult: pair(Math.exp(quantile(weekLogs, 0.1)), Math.exp(quantile(weekLogs, 0.9)), 3),
    month_mult: pair(Math.exp(quantile(monthLogs, 0.1)), Math.exp(quantile(monthLogs, 0.9)), 3),
    season_pct: seasonBand,
    terra_only_season_pct: after.length ? pair(quantile(after, 0.1) * 100, quantile(after, 0.9) * 100, 1) : seasonBand,
    season_errors_pct: errors.map((e) => roundTo(e * 100, 1) as number),
    basis: BASIS_OWN,
  };
  if (mode === "blend") {
    bands.own_season_pct = bands.season_pct;
    bands.season_pct = bands.terra_only_season_pct = [index.blend_band_pct[0], index.blend_band_pct[1]];
    bands.basis = BASIS_POOLED;
  }
  return { bands, terra };
}

/**
 * Everything for a drawn box or polygon. `cells` is the country's cell file
 * (loadCells), `index` is cells/index.json. Takes about 50 to 100 ms: the bands
 * need nine more fits. Pass `bands: false` to skip them while the shape is being dragged.
 */
export function fitDrawnArea(cells: Cells, index: CellsIndex, country: string, shape: Shape, options: { bands?: boolean } = {}): DrawnArea {
  const record = areaRecord(cells, index, shape);
  const train = trainingWeeks(record, index.train_years);
  const season = seasonMonths(train.V, train.month);
  const fit = fitArea(train, index.countries[country].parts.all, season);
  const predicted = predictArea(fit, record.Madj, record.month, record.year, record.frp);
  const { bands, terra } = options.bands === false ? { bands: NO_BANDS, terra: [] } : bandsOf(record, index, country, season, fit.mode);

  const n = record.week.length;
  const value = new Float64Array(n), lo = new Float64Array(n).fill(NaN), hi = new Float64Array(n).fill(NaN);
  const source: DrawnArea["source"] = new Array(n);
  const isPartial = new Uint8Array(n);
  const [loMult, hiMult] = bands.week_mult;
  for (let i = 0; i < n; i++) {
    const hasViirs = !Number.isNaN(record.V[i]);
    value[i] = hasViirs ? record.V[i] : predicted[i];
    source[i] = hasViirs ? "VIIRS" : fit.mode === "none" ? "none" : "MODIS";
    isPartial[i] = hasViirs ? record.viirsPartial[i] : record.modisPartial[i];
    if (!hasViirs && loMult !== null && hiMult !== null) {
      lo[i] = Math.max((predicted[i] + 1) * loMult - 1, 0);
      hi[i] = (predicted[i] + 1) * hiMult - 1;
    }
  }
  return { country, shape, record, season, fit, predicted, value, lo, hi, source, isPartial, bands, terra };
}
