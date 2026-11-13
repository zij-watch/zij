// A drawn box, start to finish: the weekly record from the cell file, the M4
// fit under the small-area rule, the harmonized weeks and the bands.
// The steps are those of pipeline/zij/harmonize.py for a named area.

import { areaRecord, trainingWeeks } from "./cells";
import type { AreaRecord, Box, Cells, CellsIndex } from "./cells";
import { fitArea, predictArea, seasonMonths } from "./m4";
import type { AreaFit } from "./m4";

export type Bands = {
  week_mult: [number, number] | [null, null];   // a converted week's band is (P + 1) x lo - 1 to (P + 1) x hi - 1, floored at 0
  season_pct: [number, number] | [null, null];  // the true season total lies between P / (1 + hi/100) and P / (1 + lo/100)
  own_season_pct?: [number, number];            // blended areas: the area's own errors, beside the pooled band used
  season_errors_pct: number[];
  basis: "own" | "pooled" | "none";
};

export type DrawnArea = {
  country: string;
  box: Box;
  record: AreaRecord;
  season: number[];
  fit: AreaFit;                          // mode "own", "blend" (show the warning) or "none" (raw counts only)
  predicted: Float64Array;               // MODIS converted with M4, for every week of the record; NaN with no fit
  value: Float64Array;                   // VIIRS where VIIRS has data, otherwise `predicted`
  lo: Float64Array;                      // the weekly band; NaN on VIIRS weeks and with no fit
  hi: Float64Array;
  source: ("VIIRS" | "MODIS" | "none")[];
  bands: Bands;
};

/** numpy's default quantile: linear between the two nearest ranks. */
function quantile(values: number[], q: number): number {
  const s = [...values].sort((x, y) => x - y);
  const at = (s.length - 1) * q;
  const lo = Math.floor(at);
  return lo + 1 < s.length ? s[lo] + (s[lo + 1] - s[lo]) * (at - lo) : s[lo];
}

const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits;

/** Leave one year out over the training years: each year predicted by a fit that never saw it. */
function leaveOneYearOut(rec: AreaRecord, index: CellsIndex, country: string, season: number[]) {
  const all = trainingWeeks(rec, index.train_years);
  const predicted = new Float64Array(all.rows.length).fill(NaN);
  for (let year = index.train_years[0]; year <= index.train_years[1]; year++) {
    const fold = fitArea(trainingWeeks(rec, index.train_years, year), index.countries[country].parts[String(year)], season);
    const at: number[] = [];
    for (let i = 0; i < all.year.length; i++) if (all.year[i] === year) at.push(i);
    if (fold.mode === "none" || at.length === 0) continue;
    const pick = (xs: ArrayLike<number>) => at.map((i) => xs[i]);
    const p = predictArea(fold, pick(all.M), pick(all.month), pick(all.year), pick(all.frp));
    at.forEach((i, k) => { predicted[i] = p[k]; });
  }
  return { all, predicted };
}

function bandsOf(rec: AreaRecord, index: CellsIndex, country: string, season: number[], mode: AreaFit["mode"]): Bands {
  if (mode === "none") return { week_mult: [null, null], season_pct: [null, null], season_errors_pct: [], basis: "none" };
  const { all, predicted } = leaveOneYearOut(rec, index, country, season);
  const logs: number[] = [];
  const errors: number[] = [];
  for (let i = 0; i < predicted.length; i++) {
    if (Number.isFinite(predicted[i])) logs.push(Math.log((all.V[i] + 1) / (predicted[i] + 1)));
  }
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
  // A blended area with no year to score keeps the pooled band below; an own fit always has years.
  const own: [number, number] = errors.length
    ? [round(quantile(errors, 0.1) * 100, 1), round(quantile(errors, 0.9) * 100, 1)]
    : [NaN, NaN];
  const bands: Bands = {
    week_mult: [round(Math.exp(quantile(logs, 0.1)), 3), round(Math.exp(quantile(logs, 0.9)), 3)],
    season_pct: own,
    season_errors_pct: errors.map((e) => round(e * 100, 1)),
    basis: "own",
  };
  if (mode === "blend") {
    bands.own_season_pct = own;
    bands.season_pct = index.blend_band_pct;
    bands.basis = "pooled";
  }
  return bands;
}

/**
 * Everything for a drawn box. `cells` is the country's cell file (loadCells),
 * `index` is cells/index.json. Takes a few tenths of a second: the bands need
 * nine more fits. Pass `bands: false` to skip them while the box is being dragged.
 */
export function fitDrawnArea(cells: Cells, index: CellsIndex, country: string, box: Box, options: { bands?: boolean } = {}): DrawnArea {
  const record = areaRecord(cells, index, box);
  const train = trainingWeeks(record, index.train_years);
  const season = seasonMonths(train.V, train.month);
  const fit = fitArea(train, index.countries[country].parts.all, season);
  const predicted = predictArea(fit, record.Madj, record.month, record.year, record.frp);
  const bands: Bands = options.bands === false
    ? { week_mult: [null, null], season_pct: [null, null], season_errors_pct: [], basis: "none" }
    : bandsOf(record, index, country, season, fit.mode);

  const n = record.week.length;
  const value = new Float64Array(n), lo = new Float64Array(n).fill(NaN), hi = new Float64Array(n).fill(NaN);
  const source: DrawnArea["source"] = new Array(n);
  const [loMult, hiMult] = bands.week_mult;
  for (let i = 0; i < n; i++) {
    const hasViirs = !Number.isNaN(record.V[i]);
    value[i] = hasViirs ? record.V[i] : predicted[i];
    source[i] = hasViirs ? "VIIRS" : fit.mode === "none" ? "none" : "MODIS";
    if (!hasViirs && loMult !== null && hiMult !== null) {
      lo[i] = Math.max((predicted[i] + 1) * loMult - 1, 0);
      hi[i] = (predicted[i] + 1) * hiMult - 1;
    }
  }
  return { country, box, record, season, fit, predicted, value, lo, hi, source, bands };
}
