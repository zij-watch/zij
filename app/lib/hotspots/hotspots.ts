// Kept hotspots in the browser: the files of app/public/data/hotspots/
// (format: docs/event/HOTSPOTS_FORMAT.md), loaded lazily, filtered by shape and
// dates, summed per day, and written out as CSV.
//
// A hotspot here is a FIRMS detection that passed every filter of the pipeline
// on a day its satellite counts as flying: the rows the fire cell-days are
// counted from. Counts are never averaged over satellites and never harmonized,
// so MODIS and VIIRS numbers do not compare with each other.

import { versioned } from "../version";
import { boundsOf, centreIn, gunzip, inPolygon, isBox } from "../fit/cells";
import type { Box, Shape } from "../fit/cells";

export type Sensor = "MODIS" | "VIIRS";

export type HotspotIndex = {
  version: number;
  built_at_utc: string;
  last_full_day: string;
  epoch: string;        // day 0 of the files, YYYY-MM-DD
  coord_units: number;  // coordinates are whole numbers of 1 / coord_units degree
  grid_deg: number;
  viirs_confidence: Record<string, string>; // "101" -> "nominal", "102" -> "high"
  satellites: { code: string; sensor: Sensor; name: string; first_day: string; last_day: string; gaps: [string, string][] }[];
  filters: {
    type: number;
    modis_min_confidence: number;
    viirs_confidence: string[];
    static_mask: { cell_deg: number; min_days: number; types: number[] };
    flown_days_only: boolean;
    text: string[]; // one sentence per filter, in the order applied
    detections_by_reason: Record<string, Record<string, number>>;
  };
  credit: string;
  regions: HotspotRegion[];
};

export type HotspotRegion = {
  id: string;
  name: string;
  country: string;
  whole_country: boolean; // false: only `box` is covered, the rest of the country has no hotspot file
  box: Box;
  n: number;
  files: { file: string; bytes: number; bytes_unzipped: number; from: string; to: string; n: number }[];
};

/** One decoded file. Rows are sorted by day, then time; `dayStart` finds a day's rows at once. */
export type HotspotFile = {
  n: number;
  firstDay: number;       // days since index.epoch
  nDays: number;
  dayStart: Uint32Array;  // day d (from firstDay) owns rows dayStart[d] to dayStart[d + 1] - 1
  lat: Int32Array;        // whole 1e-5 degrees
  lon: Int32Array;
  minute: Uint16Array;    // minutes after 00:00 UTC
  flags: Uint8Array;      // satellite index, + 8 for night, + 16 for near real time
  confidence: Uint8Array; // MODIS: percent. VIIRS: 101 nominal, 102 high
  frp: Float32Array;      // MW
};

const DAY_MS = 86400000;

export function dayNumber(index: HotspotIndex, iso: string): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(index.epoch + "T00:00:00Z")) / DAY_MS);
}

export function dayIso(index: HotspotIndex, day: number): string {
  return new Date(Date.parse(index.epoch + "T00:00:00Z") + day * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- files

/** Reads one unzipped hotspot file. The arrays are views on `buffer`: keep it. */
export function decodeHotspots(buffer: ArrayBuffer): HotspotFile {
  const head = new Uint32Array(buffer, 0, 7);
  if (head[0] !== 0x484a495a) throw new Error("Not a Zij hotspot file"); // "ZIJH"
  if (head[1] !== 1) throw new Error(`Hotspot file version ${head[1]}: this reader knows version 1`);
  const n = head[2], firstDay = head[3], nDays = head[4];
  let at = 28;
  const take = <T>(make: (offset: number, length: number) => T, length: number, bytes: number): T => {
    const view = make(at, length);
    at = (at + length * bytes + 3) & ~3; // every array starts on a 4-byte boundary
    return view;
  };
  return {
    n, firstDay, nDays,
    dayStart: take((o, k) => new Uint32Array(buffer, o, k), nDays + 1, 4),
    lat: take((o, k) => new Int32Array(buffer, o, k), n, 4),
    lon: take((o, k) => new Int32Array(buffer, o, k), n, 4),
    minute: take((o, k) => new Uint16Array(buffer, o, k), n, 2),
    flags: take((o, k) => new Uint8Array(buffer, o, k), n, 1),
    confidence: take((o, k) => new Uint8Array(buffer, o, k), n, 1),
    frp: take((o, k) => new Float32Array(buffer, o, k), n, 4),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/**
 * The regions that hold hotspots for a shape. `covered` is false when part of
 * the shape lies where no hotspot file reaches: in Argentina, outside the two
 * preset boxes and their margin. Say so in the interface: there the map and the
 * CSV have no hotspots, although the weekly counts of the panel still do.
 */
export function regionsFor(index: HotspotIndex, shape: Shape): { regions: HotspotRegion[]; covered: boolean } {
  const box = boundsOf(shape);
  const regions = index.regions.filter((r) => overlaps(box, r.box));
  const inside = (r: HotspotRegion) => box[0] >= r.box[0] && box[2] <= r.box[2] && box[1] >= r.box[1] && box[3] <= r.box[3];
  return { regions, covered: regions.some((r) => r.whole_country || inside(r)) };
}

/** A region's files that hold days from `from` to `to` (YYYY-MM-DD, both included). */
export function filesFor(region: HotspotRegion, from: string, to: string): HotspotRegion["files"] {
  return region.files.filter((f) => f.from <= to && f.to >= from);
}

export type HotspotLoader = {
  /** The decoded files a shape and date range need, fetched once each and kept. */
  load(shape: Shape, from: string, to: string): Promise<{ files: HotspotFile[]; covered: boolean }>;
  /** Paths fetched so far, for the curious and for tests. */
  fetched(): string[];
};

/**
 * The lazy loader. Nothing is fetched until `load` is called, and then only the
 * files of the regions the shape touches and the periods the dates touch.
 * `base` is where app/public/data/ is served ("/data/"); `fetchBytes` can replace fetch.
 */
export function createHotspotLoader(index: HotspotIndex, base = "/data/",
                                    fetchBytes?: (url: string) => Promise<ArrayBuffer>): HotspotLoader {
  const kept = new Map<string, Promise<HotspotFile>>();
  const get = fetchBytes ?? (async (url: string) => {
    const response = await fetch(versioned(url));
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.arrayBuffer();
  });
  const one = (path: string) => {
    let file = kept.get(path);
    if (!file) {
      file = get(base + path).then(gunzip).then(decodeHotspots);
      file.catch(() => kept.delete(path)); // a failed fetch can be tried again
      kept.set(path, file);
    }
    return file;
  };
  return {
    async load(shape, from, to) {
      const { regions, covered } = regionsFor(index, shape);
      const files = await Promise.all(regions.flatMap((r) => filesFor(r, from, to).map((f) => one(f.file))));
      return { files, covered };
    },
    fetched: () => [...kept.keys()],
  };
}

// ---------------------------------------------------------------- filter

/** Hotspots picked by shape and dates, as columns, sorted by day and time. */
export type HotspotSelection = {
  n: number;
  from: string;
  to: string;
  shape: Shape;
  by: "cell" | "point";
  day: Int32Array;        // days since index.epoch
  minute: Uint16Array;    // minutes after 00:00 UTC
  lat: Float64Array;      // degrees
  lon: Float64Array;
  satellite: Uint8Array;  // index into index.satellites
  confidence: Uint8Array; // MODIS: percent. VIIRS: 101 nominal, 102 high
  frp: Float32Array;      // MW
  night: Uint8Array;      // 1 for a night-time overpass
  nrt: Uint8Array;        // 1 for near-real-time processing, 0 for standard
};

/**
 * Filters decoded files by shape (a box or a GeoJSON polygon) and date range,
 * both ends included.
 *
 * `by: "cell"` (the default) keeps a hotspot when the centre of its 0.1 degree
 * cell is in the shape: the rule every other number of the panel follows, so
 * the counts agree with the weekly counts and the fire cell-days. `by: "point"`
 * keeps it when the hotspot itself is in the shape: use it only where the exact
 * outline matters more than agreeing with the panel.
 */
export function selectHotspots(files: HotspotFile[], index: HotspotIndex, shape: Shape, from: string, to: string,
                               options: { by?: "cell" | "point" } = {}): HotspotSelection {
  const by = options.by ?? "cell";
  const bounds = boundsOf(shape);
  const units = index.coord_units;
  const cell = Math.round(units * index.grid_deg);
  const [west, south, east, north] = bounds.map((v) => v * units);
  const first = dayNumber(index, from), last = dayNumber(index, to);
  const rows: { file: HotspotFile; i: number; day: number }[] = [];
  for (const file of files) {
    const a = Math.max(first, file.firstDay), b = Math.min(last, file.firstDay + file.nDays - 1);
    for (let day = a; day <= b; day++) {
      for (let i = file.dayStart[day - file.firstDay]; i < file.dayStart[day - file.firstDay + 1]; i++) {
        const lon = file.lon[i], lat = file.lat[i];
        const inside = by === "cell"
          ? centreIn(shape, bounds, Math.floor(lon / cell), Math.floor(lat / cell))
          : lon > west && lon < east && lat > south && lat < north && (isBox(shape) || inPolygon(shape, lon / units, lat / units));
        if (inside) rows.push({ file, i, day });
      }
    }
  }
  if (files.length > 1) rows.sort((x, y) => x.day - y.day || x.file.minute[x.i] - y.file.minute[y.i]);
  const n = rows.length;
  const out: HotspotSelection = {
    n, from, to, shape, by,
    day: new Int32Array(n), minute: new Uint16Array(n), lat: new Float64Array(n), lon: new Float64Array(n),
    satellite: new Uint8Array(n), confidence: new Uint8Array(n), frp: new Float32Array(n), night: new Uint8Array(n), nrt: new Uint8Array(n),
  };
  rows.forEach(({ file, i, day }, k) => {
    out.day[k] = day;
    out.minute[k] = file.minute[i];
    out.lat[k] = file.lat[i] / units;
    out.lon[k] = file.lon[i] / units;
    out.satellite[k] = file.flags[i] & 7;
    out.night[k] = (file.flags[i] >> 3) & 1;
    out.nrt[k] = (file.flags[i] >> 4) & 1;
    out.confidence[k] = file.confidence[i];
    out.frp[k] = file.frp[i];
  });
  return out;
}

// ---------------------------------------------------------------- words for a row

export function timeOf(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** MODIS: the percent. VIIRS: "nominal" or "high". */
export function confidenceOf(index: HotspotIndex, value: number): number | string {
  return index.viirs_confidence[String(value)] ?? value;
}

/** Was the satellite flying that day? False before its first day, after its last, and inside an outage. */
export function wasFlying(index: HotspotIndex, satellite: number, iso: string): boolean {
  const s = index.satellites[satellite];
  return iso >= s.first_day && iso <= s.last_day && !s.gaps.some(([a, b]) => iso >= a && iso <= b);
}

// ---------------------------------------------------------------- per-day summary

export type SensorDay = {
  hotspots: number | null;                  // null: none of the sensor's satellites was flying that day
  frp_sum: number | null;                   // MW
  day: number | null;                       // daytime overpasses
  night: number | null;
  satellites: Record<string, number | null>; // by satellite name; null when that satellite was not flying
};
export type DaySummary = { date: string; hotspots: number; sensors: Record<Sensor, SensorDay> };

/**
 * One entry per day of the selection's range, days without hotspots included.
 * A satellite that was not flying has null, never zero.
 */
export function dailySummary(selection: HotspotSelection, index: HotspotIndex): DaySummary[] {
  const first = dayNumber(index, selection.from);
  const last = Math.min(dayNumber(index, selection.to), dayNumber(index, index.last_full_day));
  const days: DaySummary[] = [];
  for (let day = first; day <= last; day++) {
    const date = dayIso(index, day);
    const sensor = (name: Sensor): SensorDay => {
      const satellites: Record<string, number | null> = {};
      let flying = false;
      index.satellites.forEach((s, k) => {
        if (s.sensor !== name || date < s.first_day || date > s.last_day) return;
        const up = wasFlying(index, k, date);
        satellites[s.name] = up ? 0 : null;
        flying = flying || up;
      });
      return flying ? { hotspots: 0, frp_sum: 0, day: 0, night: 0, satellites }
                    : { hotspots: null, frp_sum: null, day: null, night: null, satellites };
    };
    days.push({ date, hotspots: 0, sensors: { MODIS: sensor("MODIS"), VIIRS: sensor("VIIRS") } });
  }
  for (let k = 0; k < selection.n; k++) {
    const entry = days[selection.day[k] - first];
    if (!entry) continue;
    const s = index.satellites[selection.satellite[k]];
    const sensor = entry.sensors[s.sensor];
    entry.hotspots += 1;
    sensor.hotspots = (sensor.hotspots ?? 0) + 1;
    sensor.frp_sum = (sensor.frp_sum ?? 0) + selection.frp[k];
    if (selection.night[k]) sensor.night = (sensor.night ?? 0) + 1;
    else sensor.day = (sensor.day ?? 0) + 1;
    sensor.satellites[s.name] = (sensor.satellites[s.name] ?? 0) + 1;
  }
  for (const d of days) {
    for (const s of Object.values(d.sensors)) if (s.frp_sum !== null) s.frp_sum = Math.round(s.frp_sum * 100) / 100;
  }
  return days;
}

/** Totals of a selection by sensor and by satellite name. */
export function totals(selection: HotspotSelection, index: HotspotIndex) {
  const out = { hotspots: selection.n, sensors: { MODIS: 0, VIIRS: 0 } as Record<Sensor, number>, satellites: {} as Record<string, number> };
  for (let k = 0; k < selection.n; k++) {
    const s = index.satellites[selection.satellite[k]];
    out.sensors[s.sensor] += 1;
    out.satellites[s.name] = (out.satellites[s.name] ?? 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------- CSV

function csvCell(x: unknown): string {
  if (x === null || x === undefined) return "";
  const text = String(x);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_COLUMNS = ["latitude", "longitude", "acq_date", "acq_time_utc", "satellite", "sensor", "confidence", "frp_mw", "daynight", "version"];

/**
 * The hotspots CSV. Lines starting with # credit NASA FIRMS and name every
 * filter applied; then one row per hotspot. `area` is the name to print, e.g.
 * the preset's name or "Drawn area".
 */
export function hotspotsCsv(selection: HotspotSelection, index: HotspotIndex, meta: { area: string; country?: string }): string {
  const shape = isBox(selection.shape)
    ? `Box [west, south, east, north]: ${selection.shape.join(", ")}`
    : `Polygon inside the box [west, south, east, north]: ${boundsOf(selection.shape).map((v) => Math.round(v * 1e5) / 1e5).join(", ")}`;
  const rule = selection.by === "cell"
    ? "A hotspot is in the area when the centre of its 0.1 degree grid cell is, the rule of every Zij count, so a few rows can lie just outside the outline."
    : "A hotspot is in the area when its own coordinates are.";
  const lines = [
    "# Zij: hotspots (satellite active fire detections that passed the filters below)",
    `# Area: ${meta.area}${meta.country ? `, ${meta.country}` : ""}. ${shape}. ${rule}`,
    `# Dates: ${selection.from} to ${selection.to} (UTC days). Data to ${index.last_full_day}. Built ${index.built_at_utc}. Rows: ${selection.n}.`,
    `# Source: ${index.credit}`,
    "# Filters applied, in this order:",
    ...index.filters.text.map((t, k) => `#   ${k + 1}. ${t}`),
    "# These are detections, not fires: one fire can be many rows, and MODIS (1 km pixels) and VIIRS (375 m pixels) counts do not compare. Nothing here is harmonized.",
    "# Columns: latitude and longitude in degrees (WGS 84); acq_time_utc is the overpass time; confidence is a percent for MODIS and nominal or high for VIIRS;",
    "#   frp_mw is fire radiative power in megawatts; daynight is D or N; version is SP (standard processing) or NRT (near real time, not yet reprocessed).",
    CSV_COLUMNS.join(","),
  ];
  for (let k = 0; k < selection.n; k++) {
    const s = index.satellites[selection.satellite[k]];
    lines.push([
      selection.lat[k].toFixed(5), selection.lon[k].toFixed(5), dayIso(index, selection.day[k]), timeOf(selection.minute[k]),
      s.name, s.sensor, confidenceOf(index, selection.confidence[k]), Math.round(selection.frp[k] * 100) / 100,
      selection.night[k] ? "N" : "D", selection.nrt[k] ? "NRT" : "SP",
    ].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
