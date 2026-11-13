// Reads app/public/data/cells/ (format: docs/event/CELLS_FORMAT.md) and sums the
// cells of a box into the weekly record the fit needs. The sums follow the
// pipeline's steps (pipeline/zij/build.py, harmonize.py), so a box that is also
// a named area gives that area's numbers.

import type { CountryPart, Weeks } from "./m4";

export type Box = [west: number, south: number, east: number, north: number];

export type CellsIndex = {
  version: number;
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
const TERRA = 0;
const AQUA = 1;

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
  const pad = () => { at = (at + 3) & ~3; };
  const take = <T>(make: (offset: number, length: number) => T, length: number, bytes: number): T => {
    const view = make(at, length);
    at += length * bytes;
    pad();
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

export async function loadCells(url: string): Promise<Cells> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return decodeCells(await gunzip(await response.arrayBuffer()));
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

/** The weekly record of a box: one entry per week MODIS has data, as columns. */
export type AreaRecord = {
  nCells: number;        // cells with a kept detection whose centre is in the box
  week: Int32Array;      // index from index.first_week
  weekStart: string[];   // the Monday, YYYY-MM-DD
  year: Int32Array;      // ISO year
  month: Int32Array;     // the month of the week's Thursday
  M: Float64Array;       // MODIS fire days, as counted
  Madj: Float64Array;    // MODIS on the Terra + Aqua footing: what M4 reads
  frp: Float64Array;     // MODIS mean FRP per detection, NaN when none
  modisHotspots: Float64Array;
  modisPartial: Uint8Array;
  alone: (null | "Terra" | "Aqua")[]; // the one MODIS satellite flying that week, if only one was
  V: Float64Array;       // VIIRS fire days, NaN when VIIRS has no data
  viirsHotspots: Float64Array; // NaN when VIIRS has no data
  viirsPartial: Uint8Array;
  full: Uint8Array;      // both sensors flew all 7 days: the weeks used for fitting and scoring
  ratios: { Terra: number[]; Aqua: number[] }; // single-satellite ratio by month, January first
  satellites: { code: string; days: Int32Array; fireDays: Float64Array; hotspots: Float64Array }[]; // per week of the whole index
};

const RATIO_PSEUDO = 20;

/** (Terra + Aqua average) / one satellite alone, by calendar month, pulled to the overall ratio. */
export function singleSatelliteRatios(terra: number[], aqua: number[]): { Terra: number[]; Aqua: number[] } {
  const average = terra.map((t, k) => (t + aqua[k]) / 2);
  const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const one = (sat: number[]) => {
    const overall = total(sat) > 0 ? total(average) / total(sat) : 1;
    return sat.map((s, k) => (average[k] + RATIO_PSEUDO * overall) / (s + RATIO_PSEUDO));
  };
  return { Terra: one(terra), Aqua: one(aqua) };
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function areaRecord(cells: Cells, index: CellsIndex, box: Box): AreaRecord {
  const [west, south, east, north] = box;
  // A cell is in the box when its centre is. Centres are compared in hundredths of a degree.
  const picked = new Uint8Array(cells.nCells);
  let nCells = 0;
  for (let i = 0; i < cells.nCells; i++) {
    const lon = cells.gx[i] * 10 + 5, lat = cells.gy[i] * 10 + 5;
    if (lon > west * 100 && lon < east * 100 && lat > south * 100 && lat < north * 100) {
      picked[i] = 1;
      nCells++;
    }
  }

  const n = index.n_weeks;
  const satFireDays = Array.from({ length: N_SATELLITES }, () => new Float64Array(n));
  const satHotspots = Array.from({ length: N_SATELLITES }, () => new Float64Array(n));
  const modisDays = familyDays(index, "MODIS");
  const viirsDays = familyDays(index, "VIIRS");
  const modis = sumFamily(cells.modis, picked, modisDays, index.min_week_days, n, satFireDays, satHotspots);
  const viirs = sumFamily(cells.viirs, picked, viirsDays, index.min_week_days, n, satFireDays, satHotspots);

  const first = Date.parse(index.first_week + "T00:00:00Z");
  const DAY = 86400000;
  const terraDays = index.satellites[TERRA].days, aquaDays = index.satellites[AQUA].days;
  const [trainFirst, trainLast] = index.train_years;

  // Single-satellite ratios: training-year weeks when Terra and Aqua both flew all 7 days.
  const terraByMonth = new Array<number>(12).fill(0), aquaByMonth = new Array<number>(12).fill(0);
  const rows: number[] = [];
  const yearOf = new Int32Array(n), monthOf = new Int32Array(n);
  for (let w = 0; w < n; w++) {
    const thursday = new Date(first + (w * 7 + 3) * DAY);
    yearOf[w] = thursday.getUTCFullYear(); // the ISO year is the year of the week's Thursday
    monthOf[w] = thursday.getUTCMonth() + 1;
    if (terraDays[w] === 7 && aquaDays[w] === 7 && yearOf[w] >= trainFirst && yearOf[w] <= trainLast) {
      terraByMonth[monthOf[w] - 1] += satFireDays[TERRA][w];
      aquaByMonth[monthOf[w] - 1] += satFireDays[AQUA][w];
    }
    if (modisDays[w] >= index.min_week_days) rows.push(w);
  }
  const ratios = singleSatelliteRatios(terraByMonth, aquaByMonth);

  const len = rows.length;
  const rec: AreaRecord = {
    nCells,
    week: Int32Array.from(rows),
    weekStart: rows.map((w) => isoDay(first + w * 7 * DAY)),
    year: new Int32Array(len), month: new Int32Array(len),
    M: new Float64Array(len), Madj: new Float64Array(len), frp: new Float64Array(len),
    modisHotspots: new Float64Array(len), modisPartial: new Uint8Array(len), alone: new Array(len).fill(null),
    V: new Float64Array(len), viirsHotspots: new Float64Array(len), viirsPartial: new Uint8Array(len),
    full: new Uint8Array(len),
    ratios,
    satellites: index.satellites.map((s, k) => ({
      code: s.code, days: Int32Array.from(s.days), fireDays: satFireDays[k], hotspots: satHotspots[k],
    })),
  };
  rows.forEach((w, i) => {
    const hasViirs = viirsDays[w] >= index.min_week_days;
    rec.year[i] = yearOf[w];
    rec.month[i] = monthOf[w];
    rec.M[i] = modis.fireDays[w];
    rec.frp[i] = modis.hotspots[w] > 0 ? modis.frpSum[w] / modis.hotspots[w] : NaN;
    rec.modisHotspots[i] = modis.hotspots[w];
    rec.modisPartial[i] = index.partial.MODIS[w];
    rec.alone[i] = terraDays[w] > 0 && aquaDays[w] === 0 ? "Terra" : aquaDays[w] > 0 && terraDays[w] === 0 ? "Aqua" : null;
    const alone = rec.alone[i];
    rec.Madj[i] = alone ? rec.M[i] * ratios[alone][rec.month[i] - 1] : rec.M[i];
    rec.V[i] = hasViirs ? viirs.fireDays[w] : NaN;
    rec.viirsHotspots[i] = hasViirs ? viirs.hotspots[w] : NaN;
    rec.viirsPartial[i] = hasViirs ? index.partial.VIIRS[w] : 0;
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
