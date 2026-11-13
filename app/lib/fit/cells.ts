// Reads app/public/data/cells/ (format: docs/event/CELLS_FORMAT.md) and sums the
// cells of a box or polygon into the weekly record the fit needs. The sums follow
// the pipeline's steps (pipeline/zij/build.py, harmonize.py), so a box that is
// also a named area gives that area's numbers.
//
// Load a country's file only when the user's area is in that country
// (countriesFor): Argentina's is 4 MB.

import type { CountryPart, Weeks } from "./m4";

export type Box = [west: number, south: number, east: number, north: number];
/** A GeoJSON polygon: rings of [longitude, latitude]. Rings after the first are holes. */
export type Polygon = { type: "Polygon"; coordinates: number[][][] };
export type Shape = Box | Polygon;

export type CellsIndex = {
  version: number;
  contract: number;
  unit: string;
  unit_label: string;
  baseline_years: [number, number];
  percentiles: [number, number];
  critical_share: number;
  built_at_utc: string;
  last_full_day: string;
  grid_deg: number;
  first_week: string; // the Monday of week 0, YYYY-MM-DD
  n_weeks: number;
  satellites: { code: string; family: "MODIS" | "VIIRS"; name: string; days: number[] }[];
  partial: { MODIS: number[]; VIIRS: number[] };
  min_week_days: number;
  train_years: [number, number];
  blend_band_pct: [number, number];
  countries: Record<string, {
    file: string;
    bytes: number;
    bytes_unzipped: number;
    n_cells: number;
    n_modis_rows: number;
    n_viirs_rows: number;
    cells_box: Box;
    box: Box;
    parts: Record<string, CountryPart>; // "all", and one per training year left out
  }>;
};

type Table = { start: Uint32Array; week: Uint16Array; satDays: Uint8Array; hotspots: Uint16Array; frp: Float32Array | null };
export type Cells = { nCells: number; gy: Int16Array; gx: Int16Array; modis: Table; viirs: Table };

const N_SATELLITES = 5; // Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21: the order of index.satellites
export const TERRA = 0;
export const AQUA = 1;
export const DAY_MS = 86400000;

// ---------------------------------------------------------------- files

/** Unzips a .gz file's bytes. Works in browsers and in Node 18 and later. */
export async function gunzip(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Reads one country's unzipped cell file. The arrays are views on `buffer`: keep it. */
export function decodeCells(buffer: ArrayBuffer): Cells {
  const head = new Uint32Array(buffer, 0, 7);
  if (head[0] !== 0x434a495a) throw new Error("Not a Zij cell file"); // "ZIJC"
  if (head[1] !== 1) throw new Error(`Cell file version ${head[1]}: this reader knows version 1`);
  const nCells = head[2];
  let at = 28;
  const take = <T>(make: (offset: number, length: number) => T, length: number, bytes: number): T => {
    const view = make(at, length);
    at = (at + length * bytes + 3) & ~3; // every array starts on a 4-byte boundary
    return view;
  };
  const table = (rows: number, withFrp: boolean): Table => ({
    start: take((o, n) => new Uint32Array(buffer, o, n), nCells + 1, 4),
    week: take((o, n) => new Uint16Array(buffer, o, n), rows, 2),
    satDays: take((o, n) => new Uint8Array(buffer, o, n), rows, 1),
    hotspots: take((o, n) => new Uint16Array(buffer, o, n), rows, 2),
    frp: withFrp ? take((o, n) => new Float32Array(buffer, o, n), rows, 4) : null,
  });
  const gy = take((o, n) => new Int16Array(buffer, o, n), nCells, 2);
  const gx = take((o, n) => new Int16Array(buffer, o, n), nCells, 2);
  const modis = table(head[3], true);
  const viirs = table(head[4], false);
  return { nCells, gy, gx, modis, viirs };
}

/** Fetches and reads one country's cell file, e.g. loadCells("/data/" + index.countries.Egypt.file). */
export async function loadCells(url: string): Promise<Cells> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return decodeCells(await gunzip(await response.arrayBuffer()));
}

// ---------------------------------------------------------------- shapes

export function isBox(shape: Shape): shape is Box {
  return Array.isArray(shape);
}

/** The box around a shape: [west, south, east, north]. */
export function boundsOf(shape: Shape): Box {
  if (isBox(shape)) return shape;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const ring of shape.coordinates) {
    for (const [lon, lat] of ring) {
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

/** Even-odd rule over every ring, so holes are left out. */
function inPolygon(polygon: Polygon, lon: number, lat: number): boolean {
  let inside = false;
  for (const ring of polygon.coordinates) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Is the centre of grid cell (gx, gy) in the shape? Box edges are compared in hundredths of a degree, as exact numbers. */
function centreIn(shape: Shape, bounds: Box, gx: number, gy: number): boolean {
  const lon = gx * 10 + 5, lat = gy * 10 + 5;
  if (!(lon > bounds[0] * 100 && lon < bounds[2] * 100 && lat > bounds[1] * 100 && lat < bounds[3] * 100)) return false;
  return isBox(shape) || inPolygon(shape, lon / 100, lat / 100);
}

/** Grid cells whose centre is in the shape: the `n_cells` the panel reports. */
export function gridCellsIn(shape: Shape, gridDeg = 0.1): number {
  const [west, south, east, north] = boundsOf(shape);
  if (isBox(shape)) return Math.round((east - west) / gridDeg) * Math.round((north - south) / gridDeg); // the pipeline's count
  let n = 0;
  for (let gy = Math.floor(south / gridDeg) - 1; gy <= Math.ceil(north / gridDeg); gy++) {
    for (let gx = Math.floor(west / gridDeg) - 1; gx <= Math.ceil(east / gridDeg); gx++) {
      if (centreIn(shape, [west, south, east, north], gx, gy)) n++;
    }
  }
  return n;
}

/** The countries whose cell file can hold part of the shape: load only these. */
export function countriesFor(index: CellsIndex, shape: Shape): string[] {
  const [west, south, east, north] = boundsOf(shape);
  return Object.entries(index.countries)
    .filter(([, c]) => west < c.cells_box[2] && east > c.cells_box[0] && south < c.cells_box[3] && north > c.cells_box[1])
    .map(([name]) => name);
}

// ---------------------------------------------------------------- weeks

export type WeekCalendar = {
  startMs: Float64Array;  // the Monday, UTC
  year: Int32Array;       // ISO year: the year of the week's Thursday
  month: Int32Array;      // the month of the week's Thursday
  isoWeek: Int32Array;
};

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Every week of the index, with the pipeline's calendar rules. */
export function weekCalendar(index: CellsIndex): WeekCalendar {
  const n = index.n_weeks;
  const first = Date.parse(index.first_week + "T00:00:00Z");
  const cal: WeekCalendar = { startMs: new Float64Array(n), year: new Int32Array(n), month: new Int32Array(n), isoWeek: new Int32Array(n) };
  for (let w = 0; w < n; w++) {
    cal.startMs[w] = first + w * 7 * DAY_MS;
    const thursday = new Date(cal.startMs[w] + 3 * DAY_MS);
    cal.year[w] = thursday.getUTCFullYear();
    cal.month[w] = thursday.getUTCMonth() + 1;
    cal.isoWeek[w] = Math.floor((thursday.getTime() - Date.UTC(cal.year[w], 0, 1)) / (7 * DAY_MS)) + 1;
  }
  return cal;
}

/** Days a sensor's satellites flew, per week. */
function familyDays(index: CellsIndex, family: "MODIS" | "VIIRS"): Int32Array {
  const days = new Int32Array(index.n_weeks);
  for (const s of index.satellites) if (s.family === family) for (let w = 0; w < days.length; w++) days[w] += s.days[w];
  return days;
}

/** A sensor's weekly sums over the cells picked, and the raw counts per satellite. */
function sumFamily(table: Table, picked: Uint8Array, days: Int32Array, minDays: number, nWeeks: number,
                   satFireDays: Float64Array[], satHotspots: Float64Array[]) {
  const fireDays = new Float64Array(nWeeks);
  const hotspots = new Float64Array(nWeeks);
  const frpSum = new Float64Array(nWeeks);
  for (let cell = 0; cell < picked.length; cell++) {
    if (!picked[cell]) continue;
    const end = table.start[cell + 1];
    let i = table.start[cell];
    while (i < end) {
      // One cell and week: its satellites are summed first, as the pipeline's cell_weeks table does.
      const w = table.week[i];
      let d = 0, h = 0, f = 0;
      for (; i < end && table.week[i] === w; i++) {
        const sat = table.satDays[i] >> 3;
        const satDays = table.satDays[i] & 7;
        d += satDays;
        h += table.hotspots[i];
        if (table.frp) f += table.frp[i];
        satFireDays[sat][w] += satDays;
        satHotspots[sat][w] += table.hotspots[i];
      }
      if (days[w] < minDays) continue; // the sensor has no data that week
      fireDays[w] += Math.fround((d * 7) / days[w]);
      hotspots[w] += h;
      frpSum[w] += Math.fround(f);
    }
  }
  return { fireDays, hotspots, frpSum };
}

// ---------------------------------------------------------------- the record

/** The weekly record of an area: one entry per week MODIS has data, as columns. */
export type AreaRecord = {
  shape: Shape;
  box: Box;              // the shape itself, or the box around the polygon
  nCells: number;        // grid cells whose centre is in the shape
  nFireCells: number;    // those with a kept detection at any time
  week: Int32Array;      // index from index.first_week
  weekStart: string[];   // the Monday, YYYY-MM-DD
  year: Int32Array;      // ISO year
  isoWeek: Int32Array;
  month: Int32Array;     // the month of the week's Thursday
  M: Float64Array;       // MODIS fire days, as counted
  Madj: Float64Array;    // MODIS on the Terra + Aqua footing: what M4 reads
  frp: Float64Array;     // MODIS mean FRP per detection, NaN when none
  modisHotspots: Float64Array;
  modisPartial: Uint8Array;
  nSatModis: Float64Array;  // satellite-days flown / 7
  alone: (null | "Terra" | "Aqua")[]; // the one MODIS satellite flying that week, if only one was
  V: Float64Array;       // VIIRS fire days, NaN when VIIRS has no data
  viirsHotspots: Float64Array; // NaN when VIIRS has no data
  viirsPartial: Uint8Array;
  nSatViirs: Float64Array;  // NaN when VIIRS has no data
  full: Uint8Array;      // both sensors flew all 7 days: the weeks used for fitting and scoring
  ratios: { Terra: number[]; Aqua: number[] }; // single-satellite ratio by month, January first
  /** Raw counts per satellite, for every week of the index (not only the record's weeks). */
  satellites: { code: string; name: string; family: "MODIS" | "VIIRS"; days: Int32Array; fireDays: Float64Array; hotspots: Float64Array }[];
  /** Weeks of the training years when Terra and Aqua both flew all 7 days, with each one's fire days. */
  twoSatelliteWeeks: { week: number; year: number; month: number; terra: number; aqua: number }[];
};

const RATIO_PSEUDO = 20;

/** (Terra + Aqua average) / one satellite alone, by calendar month, pulled to the overall ratio. */
export function singleSatelliteRatios(weeks: { month: number; terra: number; aqua: number }[]): { Terra: number[]; Aqua: number[] } {
  const terra = new Array<number>(12).fill(0), aqua = new Array<number>(12).fill(0);
  for (const w of weeks) {
    terra[w.month - 1] += w.terra;
    aqua[w.month - 1] += w.aqua;
  }
  const average = terra.map((t, k) => (t + aqua[k]) / 2);
  const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const one = (sat: number[]) => {
    const overall = total(sat) > 0 ? total(average) / total(sat) : 1;
    return sat.map((s, k) => (average[k] + RATIO_PSEUDO * overall) / (s + RATIO_PSEUDO));
  };
  return { Terra: one(terra), Aqua: one(aqua) };
}

/** The weekly record of a box or polygon, from one country's cell file. */
export function areaRecord(cells: Cells, index: CellsIndex, shape: Shape): AreaRecord {
  const box = boundsOf(shape);
  const picked = new Uint8Array(cells.nCells);
  let nFireCells = 0;
  for (let i = 0; i < cells.nCells; i++) {
    if (centreIn(shape, box, cells.gx[i], cells.gy[i])) {
      picked[i] = 1;
      nFireCells++;
    }
  }

  const n = index.n_weeks;
  const satFireDays = Array.from({ length: N_SATELLITES }, () => new Float64Array(n));
  const satHotspots = Array.from({ length: N_SATELLITES }, () => new Float64Array(n));
  const modisDays = familyDays(index, "MODIS");
  const viirsDays = familyDays(index, "VIIRS");
  const modis = sumFamily(cells.modis, picked, modisDays, index.min_week_days, n, satFireDays, satHotspots);
  const viirs = sumFamily(cells.viirs, picked, viirsDays, index.min_week_days, n, satFireDays, satHotspots);

  const cal = weekCalendar(index);
  const terraDays = index.satellites[TERRA].days, aquaDays = index.satellites[AQUA].days;
  const [trainFirst, trainLast] = index.train_years;
  const twoSatelliteWeeks: AreaRecord["twoSatelliteWeeks"] = [];
  const rows: number[] = [];
  for (let w = 0; w < n; w++) {
    if (terraDays[w] === 7 && aquaDays[w] === 7 && cal.year[w] >= trainFirst && cal.year[w] <= trainLast) {
      twoSatelliteWeeks.push({ week: w, year: cal.year[w], month: cal.month[w], terra: satFireDays[TERRA][w], aqua: satFireDays[AQUA][w] });
    }
    if (modisDays[w] >= index.min_week_days) rows.push(w);
  }
  const ratios = singleSatelliteRatios(twoSatelliteWeeks);

  const len = rows.length;
  const rec: AreaRecord = {
    shape, box, nCells: gridCellsIn(shape, index.grid_deg), nFireCells,
    week: Int32Array.from(rows),
    weekStart: rows.map((w) => isoDay(cal.startMs[w])),
    year: Int32Array.from(rows, (w) => cal.year[w]),
    isoWeek: Int32Array.from(rows, (w) => cal.isoWeek[w]),
    month: Int32Array.from(rows, (w) => cal.month[w]),
    M: new Float64Array(len), Madj: new Float64Array(len), frp: new Float64Array(len),
    modisHotspots: new Float64Array(len), modisPartial: new Uint8Array(len), nSatModis: new Float64Array(len),
    alone: new Array(len).fill(null),
    V: new Float64Array(len), viirsHotspots: new Float64Array(len), viirsPartial: new Uint8Array(len), nSatViirs: new Float64Array(len),
    full: new Uint8Array(len),
    ratios,
    satellites: index.satellites.map((s, k) => ({
      code: s.code, name: s.name, family: s.family, days: Int32Array.from(s.days), fireDays: satFireDays[k], hotspots: satHotspots[k],
    })),
    twoSatelliteWeeks,
  };
  rows.forEach((w, i) => {
    const hasViirs = viirsDays[w] >= index.min_week_days;
    rec.M[i] = modis.fireDays[w];
    rec.frp[i] = modis.hotspots[w] > 0 ? modis.frpSum[w] / modis.hotspots[w] : NaN;
    rec.modisHotspots[i] = modis.hotspots[w];
    rec.modisPartial[i] = index.partial.MODIS[w];
    rec.nSatModis[i] = Math.fround(modisDays[w] / 7);
    rec.alone[i] = terraDays[w] > 0 && aquaDays[w] === 0 ? "Terra" : aquaDays[w] > 0 && terraDays[w] === 0 ? "Aqua" : null;
    const alone = rec.alone[i];
    rec.Madj[i] = alone ? rec.M[i] * ratios[alone][rec.month[i] - 1] : rec.M[i];
    rec.V[i] = hasViirs ? viirs.fireDays[w] : NaN;
    rec.viirsHotspots[i] = hasViirs ? viirs.hotspots[w] : NaN;
    rec.viirsPartial[i] = hasViirs ? index.partial.VIIRS[w] : 0;
    rec.nSatViirs[i] = hasViirs ? Math.fround(viirsDays[w] / 7) : NaN;
    rec.full[i] = hasViirs && !rec.modisPartial[i] && !rec.viirsPartial[i] ? 1 : 0;
  });
  return rec;
}

/** The record's training weeks as the fit's input: full weeks of the training years, one year left out if asked. */
export function trainingWeeks(rec: AreaRecord, trainYears: [number, number], withoutYear?: number): Weeks & { rows: number[] } {
  const rows: number[] = [];
  for (let i = 0; i < rec.week.length; i++) {
    if (rec.full[i] && rec.year[i] >= trainYears[0] && rec.year[i] <= trainYears[1] && rec.year[i] !== withoutYear) rows.push(i);
  }
  const pick = (xs: ArrayLike<number>) => Float64Array.from(rows, (i) => xs[i]);
  return { rows, M: pick(rec.Madj), V: pick(rec.V), month: pick(rec.month), year: pick(rec.year), frp: pick(rec.frp) };
}

// ---------------------------------------------------------------- raw hotspot counts

export type HotspotCounts = {
  /** The range asked for, widened to whole weeks: the cell files are weekly. */
  from: string;
  to: string;
  week_start: string[];
  sensors: Record<"MODIS" | "VIIRS", {
    hotspots: number;                  // kept detections in the range, summed over the sensor's satellites
    weeks_without_data: number;        // weeks of the range when the sensor has no data: not zero, unknown
    by_week: (number | null)[];        // null when the sensor has no data that week
    satellites: Record<string, number>; // by satellite name, the same weeks
  }>;
};

/**
 * Raw counts for the "number of fires detected" view: FIRMS detections that passed
 * the pipeline's filters, per sensor, for the area of `rec` and the weeks that
 * touch `from` to `to` (YYYY-MM-DD, both ends included). They are counted, never
 * averaged over satellites and never harmonized, so MODIS and VIIRS do not compare.
 */
export function hotspotCounts(rec: AreaRecord, index: CellsIndex, from: string, to: string): HotspotCounts {
  const cal = weekCalendar(index);
  const fromMs = Date.parse(from + "T00:00:00Z"), toMs = Date.parse(to + "T00:00:00Z");
  const weeks: number[] = [];
  for (let w = 0; w < index.n_weeks; w++) if (cal.startMs[w] <= toMs && cal.startMs[w] + 6 * DAY_MS >= fromMs) weeks.push(w);
  const sensor = (family: "MODIS" | "VIIRS") => {
    const days = familyDays(index, family);
    const sats = rec.satellites.filter((s) => s.family === family);
    const satellites: Record<string, number> = {};
    for (const s of sats) if (s.days.some((d) => d > 0)) satellites[s.name] = 0;
    let total = 0, without = 0;
    const byWeek = weeks.map((w) => {
      if (days[w] < index.min_week_days) {
        without++;
        return null;
      }
      let sum = 0;
      for (const s of sats) {
        sum += s.hotspots[w];
        if (s.name in satellites) satellites[s.name] += s.hotspots[w];
      }
      total += sum;
      return sum;
    });
    return { hotspots: total, weeks_without_data: without, by_week: byWeek, satellites };
  };
  return {
    from: weeks.length ? isoDay(cal.startMs[weeks[0]]) : from,
    to: weeks.length ? isoDay(cal.startMs[weeks[weeks.length - 1]] + 6 * DAY_MS) : to,
    week_start: weeks.map((w) => isoDay(cal.startMs[w])),
    sensors: { MODIS: sensor("MODIS"), VIIRS: sensor("VIIRS") },
  };
}
