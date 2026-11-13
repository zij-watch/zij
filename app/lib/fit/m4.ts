// The M4 fit and the small-area rule, in TypeScript.
//
//   V = scale * max(0, c[month] * r^g + m^b * (a + d * z)),   m = M / scale
//
// A port of pipeline/zij/models.py, step for step: the same grids, the same
// ridge, the same normal equations. app/lib/fit/test checks it against the
// Python fits. The fixed numbers below are the pipeline's (pipeline/zij/areas.py).

export const B_GRID: number[] = Array.from({ length: 71 }, (_, i) => Math.round((0.2 + 0.02 * i) * 100) / 100);
export const G_GRID: number[] = [0, 0.25, 0.5, 0.75, 1, 1.5];
export const MONTH_RIDGE = 2;
export const Z_CLIP = 2;
export const R_CLIP: [number, number] = [0.02, 10];
export const SEASON_LENGTH = 3;
export const MIN_FIRE_WEEKS = 100;
export const MIN_FIRE_WEEKS_ANY = 30;
export const TRAIN_YEARS: [number, number] = [2012, 2020];

type Numbers = ArrayLike<number>;

/** Weeks, as columns. `frp` is MODIS mean FRP per detection, NaN when MODIS saw nothing. */
export type Weeks = { M: Numbers; V: Numbers; month: Numbers; year: Numbers; frp: Numbers };

/** One fit, with the keys of `fit.parts[]` in docs/event/DATA_CONTRACT.md. */
export type Fit = {
  model: "M4";
  n_fire_weeks: number;
  scale: number;
  b: number;
  g: number;
  a: number;
  c: number[];
  d: number;
  z_ref: number;
  season: number[];
  s_typ: number;
};
export type Part = Fit & { weight: number };
export type AreaFit = { mode: "own" | "blend" | "none"; n_fire_weeks: number; parts: Part[] };
/** The country's fit and its MODIS training total: what a blend leans on. */
export type CountryPart = { fit: Fit; m_sum: number };

function clip(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function power(M: number, b: number): number {
  return M > 0 ? Math.pow(M, b) : 0;
}

function zOf(frp: number, zRef: number): number {
  return Number.isFinite(frp) && frp > 0 ? clip(Math.log(frp) - zRef, -Z_CLIP, Z_CLIP) : 0;
}

/** Solves G x = rhs in place by Gaussian elimination with partial pivoting. */
function solve(G: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(G[row][col]) > Math.abs(G[pivot][col])) pivot = row;
    if (pivot !== col) {
      [G[col], G[pivot]] = [G[pivot], G[col]];
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    }
    for (let row = col + 1; row < n; row++) {
      const f = G[row][col] / G[col][col];
      if (f === 0) continue;
      for (let k = col; k < n; k++) G[row][k] -= f * G[col][k];
      rhs[row] -= f * rhs[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let s = rhs[row];
    for (let k = row + 1; k < n; k++) s -= G[row][k] * x[k];
    x[row] = s / G[row][row];
  }
  return x;
}

/** The 3 calendar months in a row (December can run into January) with the highest mean weekly VIIRS. */
export function seasonMonths(V: Numbers, month: Numbers): number[] {
  const sum = new Array<number>(12).fill(0);
  const count = new Array<number>(12).fill(0);
  for (let i = 0; i < V.length; i++) {
    sum[month[i] - 1] += V[i];
    count[month[i] - 1] += 1;
  }
  const mean = sum.map((s, k) => (count[k] ? s / count[k] : 0));
  let start = 0;
  let best = -Infinity;
  for (let i = 0; i < 12; i++) {
    let total = 0;
    for (let j = 0; j < SEASON_LENGTH; j++) total += mean[(i + j) % 12];
    if (total > best) {
      best = total;
      start = i;
    }
  }
  return Array.from({ length: SEASON_LENGTH }, (_, j) => ((start + j) % 12) + 1);
}

/** MODIS total over the season months, per year that has a season week. */
function seasonTotals(M: Numbers, month: Numbers, year: Numbers, season: number[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (let i = 0; i < M.length; i++) {
    if (season.includes(month[i])) totals.set(year[i], (totals.get(year[i]) ?? 0) + M[i]);
  }
  return totals;
}

/** r per week: that year's MODIS season total over the typical one. 1 when unknown. */
export function activityRatio(M: Numbers, month: Numbers, year: Numbers, season: number[], sTyp: number): Float64Array {
  const r = new Float64Array(M.length).fill(1);
  if (sTyp <= 0) return r;
  const totals = seasonTotals(M, month, year, season);
  for (let i = 0; i < M.length; i++) r[i] = clip((totals.get(year[i]) ?? sTyp) / sTyp, R_CLIP[0], R_CLIP[1]);
  return r;
}

/** Fits M4 on the weeks given: training weeks, partial weeks already out, MODIS already on the Terra + Aqua footing. */
export function fit(weeks: Weeks, season: number[]): Fit {
  const { M, V, month, year, frp } = weeks;
  const n = M.length;
  let nFireWeeks = 0;
  const logs: number[] = [];
  for (let i = 0; i < n; i++) {
    if (M[i] > 0) nFireWeeks++;
    if (Number.isFinite(frp[i]) && frp[i] > 0) logs.push(Math.log(frp[i]));
  }
  const zRef = logs.length ? median(logs) : 0;
  const z = Float64Array.from({ length: n }, (_, i) => zOf(frp[i], zRef));

  const totals = [...seasonTotals(M, month, year, season).values()];
  const sTyp = totals.length ? median(totals) : 0;
  const r = activityRatio(M, month, year, season, sTyp);

  const bg = new Float64Array(n); // r^g, the weight of the week's month column
  const Mb = new Float64Array(n);
  let best: { sse: number; b: number; g: number; x: number[] } | null = null;
  for (const g of G_GRID) {
    for (let i = 0; i < n; i++) bg[i] = Math.pow(r[i], g);
    for (const b of B_GRID) {
      // The single background of c + a M^b at this b: the ridge's target.
      let s1 = 0, sM = 0, sMM = 0, sV = 0, sMV = 0;
      for (let i = 0; i < n; i++) {
        const m = (Mb[i] = power(M[i], b));
        s1 += 1; sM += m; sMM += m * m; sV += V[i]; sMV += m * V[i];
      }
      const cAll = solve([[s1 + 1e-9, sM], [sM, sMM + 1e-9]], [sV, sMV])[0];

      // Normal equations of [12 month columns x r^g, M^b, M^b z], with the ridge on the months.
      const G = Array.from({ length: 14 }, () => new Array<number>(14).fill(0));
      const rhs = new Array<number>(14).fill(0);
      for (let i = 0; i < n; i++) {
        const k = month[i] - 1;
        const m = Mb[i];
        const mz = m * z[i];
        G[k][k] += bg[i] * bg[i];
        G[k][12] += bg[i] * m;
        G[k][13] += bg[i] * mz;
        G[12][12] += m * m;
        G[12][13] += m * mz;
        G[13][13] += mz * mz;
        rhs[k] += bg[i] * V[i];
        rhs[12] += m * V[i];
        rhs[13] += mz * V[i];
      }
      for (let k = 0; k < 12; k++) {
        G[12][k] = G[k][12];
        G[13][k] = G[k][13];
        G[k][k] += MONTH_RIDGE;
        rhs[k] += MONTH_RIDGE * cAll;
      }
      G[13][12] = G[12][13];
      for (let k = 0; k < 14; k++) G[k][k] += 1e-9; // keeps an empty column solvable
      const x = solve(G, rhs);

      let sse = 0;
      for (let i = 0; i < n; i++) {
        const e = x[month[i] - 1] * bg[i] + Mb[i] * (x[12] + x[13] * z[i]) - V[i];
        sse += e * e;
      }
      if (best === null || sse < best.sse) best = { sse, b, g, x };
    }
  }

  const x = best!.x;
  return {
    model: "M4",
    n_fire_weeks: nFireWeeks,
    scale: 1,
    b: best!.b,
    g: best!.g,
    a: Math.max(x[12], 0),
    c: x.slice(0, 12).map((v) => Math.max(v, 0)),
    d: x[13],
    z_ref: zRef,
    season: [...season],
    s_typ: sTyp,
  };
}

/**
 * Weekly VIIRS-equivalent fire days of one fit. `scale` is the small-area rule: V = s f(M / s).
 * r is read from the weeks passed in, so pass whole years (the whole record), not single weeks.
 */
export function predict(f: Fit, M: Numbers, month: Numbers, year: Numbers, frp: Numbers): Float64Array {
  const n = M.length;
  const m = Float64Array.from({ length: n }, (_, i) => M[i] / f.scale);
  const r = activityRatio(m, month, year, f.season, f.s_typ);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = f.c[month[i] - 1] * Math.pow(r[i], f.g);
    out[i] = Math.max(c + power(m[i], f.b) * (f.a + f.d * zOf(frp[i], f.z_ref)), 0) * f.scale;
  }
  return out;
}

/** The country's half of a blend, from the country's own training weeks. */
export function countryPart(country: Weeks): CountryPart {
  let mSum = 0;
  for (let i = 0; i < country.M.length; i++) mSum += country.M[i];
  return { fit: fit(country, seasonMonths(country.V, country.month)), m_sum: mSum };
}

/**
 * The small-area rule. 100 or more MODIS fire weeks in the training weeks: the
 * area's own fit. 30 to 99: a blend, w x own + (1 - w) x the country's fit
 * scaled to the area, w = fire weeks / 100. Under 30: no fit.
 */
export function fitArea(area: Weeks, country: CountryPart | null, season: number[]): AreaFit {
  const own = fit(area, season);
  const n = own.n_fire_weeks;
  if (n >= MIN_FIRE_WEEKS || country === null) return { mode: "own", n_fire_weeks: n, parts: [{ ...own, weight: 1 }] };
  if (n < MIN_FIRE_WEEKS_ANY) return { mode: "none", n_fire_weeks: n, parts: [] };
  let mSum = 0;
  for (let i = 0; i < area.M.length; i++) mSum += area.M[i];
  const share = country.m_sum > 0 ? mSum / country.m_sum : 0;
  if (share <= 0) return { mode: "own", n_fire_weeks: n, parts: [{ ...own, weight: 1 }] };
  const w = n / MIN_FIRE_WEEKS;
  return {
    mode: "blend",
    n_fire_weeks: n,
    parts: [{ ...own, weight: w }, { ...country.fit, scale: share, weight: 1 - w }],
  };
}

/** The area's weekly prediction: the weighted sum of its parts. Empty parts (mode none) give NaN. */
export function predictArea(af: AreaFit, M: Numbers, month: Numbers, year: Numbers, frp: Numbers): Float64Array {
  const out = new Float64Array(M.length).fill(af.parts.length ? 0 : NaN);
  for (const part of af.parts) {
    const p = predict(part, M, month, year, frp);
    for (let i = 0; i < out.length; i++) out[i] += part.weight * p[i];
  }
  return out;
}
