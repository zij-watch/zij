// Types and loaders for the files the pipeline exports. The format is docs/event/DATA_CONTRACT.md.

export type Source = "VIIRS" | "MODIS" | "mixed" | "none";
export type Flag = "high" | "low" | null;

export interface AreaIndexEntry {
  id: string;
  name: string;
  country: string;
  box: [number, number, number, number];
  n_cells: number;
  fit: "own" | "blend" | "none";
  n_fire_weeks: number;
  season: number[];
  file: string;
}

export interface Index {
  contract: number;
  method: string;
  unit: string;
  unit_label: string;
  built_at_utc: string;
  last_full_day: string;
  areas: AreaIndexEntry[];
}

export interface Weeks {
  week_start: string[];
  year: number[];
  iso_week: number[];
  month: number[];
  value: (number | null)[];
  lo: (number | null)[];
  hi: (number | null)[];
  source: Source[];
  flag: Flag[];
  is_partial: boolean[];
  modis: (number | null)[];
  viirs: (number | null)[];
  modis_hotspots: (number | null)[];
  viirs_hotspots: (number | null)[];
  n_sat_modis: (number | null)[];
  n_sat_viirs: (number | null)[];
}

export interface Months {
  year: number[];
  month: number[];
  value: number[];
  lo: (number | null)[];
  hi: (number | null)[];
  source: Source[];
  days_with_data: number[];
  complete: boolean[];
  anomaly_pct: (number | null)[];
  flag: Flag[];
}

export interface Seasons {
  year: number[];
  value: number[];
  lo: (number | null)[];
  hi: (number | null)[];
  source: Source[];
  terra_only: boolean[];
  flag: Flag[];
  modis: (number | null)[];
  viirs: (number | null)[];
}

export interface SatelliteCounts {
  code: string;
  family: "MODIS" | "VIIRS";
  days: (number | null)[];
  fire_days: (number | null)[];
  hotspots: (number | null)[];
}

export interface Area {
  id: string;
  name: string;
  country: string;
  box: [number, number, number, number];
  n_cells: number;
  unit_label: string;
  built_at_utc: string;
  last_full_day: string;
  polygon?: { type: "Polygon"; coordinates: number[][][] }; // drawn polygons only
  fit: { model: string; mode: "own" | "blend" | "none"; n_fire_weeks: number; season: number[] };
  bands: {
    week_mult: [number | null, number | null];
    month_mult: [number | null, number | null];
    season_pct: [number | null, number | null];
    terra_only_season_pct: [number | null, number | null];
    basis?: string;
  };
  weeks: Weeks;
  months: Months;
  seasons: Seasons;
  climatology: {
    baseline_years: [number, number];
    months: { month: number[]; median: number[]; mean: number[]; p10: number[]; p25: number[]; p75: number[]; p90: number[] };
    weeks: { iso_week: number[]; median: (number | null)[]; mean: (number | null)[]; p10: (number | null)[]; p90: (number | null)[]; critical: boolean[] };
    critical_share: number;
    critical_weeks: number[];
  };
  this_month: {
    year: number;
    month: number;
    days_so_far: number;
    value_to_date: number | null;
    median_to_date?: number;
    p25_to_date?: number;
    p75_to_date?: number;
    baseline_n: number;
    pct_vs_median?: number;
  };
  satellites: Record<string, SatelliteCounts>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return (await response.json()) as T;
}

let indexPromise: Promise<Index> | null = null;
export function loadIndex(): Promise<Index> {
  indexPromise ??= getJson<Index>("/data/index.json");
  return indexPromise;
}

const areaCache = new Map<string, Promise<Area>>();
export function loadArea(id: string): Promise<Area> {
  let promise = areaCache.get(id);
  if (!promise) {
    promise = getJson<Area>(`/data/areas/${id}.json`);
    areaCache.set(id, promise);
  }
  return promise;
}

/** Notes per area id, shown at the top of the panel. Written by the pipeline (appdata). */
let notesPromise: Promise<Record<string, string>> | null = null;
export function loadNotes(): Promise<Record<string, string>> {
  notesPromise ??= getJson<Record<string, string>>("/data/notes.json").catch(() => ({}));
  return notesPromise;
}
