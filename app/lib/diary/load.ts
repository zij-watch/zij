// Reads the data files on the server and works out the diary's numbers and the game's data.
// Server components only: the browser gets the small GameData, never the files.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkScript, resolveLines } from "./check";
import type { GameData, Season } from "./game";
import { claims, diaryNumbers, picks, placeholders, type DataFiles, type DiaryNumbers } from "./numbers";
import { RUNNING_HEAD, SCRIPT, UI_LABELS } from "./script";

const DATA = join(process.cwd(), "public", "data");
const read = async <T,>(f: string) => JSON.parse(await readFile(join(DATA, f), "utf-8")) as T;

async function readFiles(): Promise<DataFiles> {
  const [delta, method, findings] = await Promise.all([
    read<DataFiles["delta"]>("areas/nile-delta.json"),
    read<DataFiles["method"]>("method.json"),
    read<DataFiles["findings"]>("findings.json"),
  ]);
  return { delta, method, findings };
}

export async function readDiaryNumbers(): Promise<DiaryNumbers> {
  return diaryNumbers(await readFiles());
}

type SeasonFile = { seasons: { year: number[]; value: number[]; lo: (number | null)[]; hi: (number | null)[]; modis: (number | null)[]; viirs: (number | null)[]; source: string[] } };
type Countries = { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] };
type Areas = { areas: { id: string; box: [number, number, number, number] }[] };

const seasonsOf = (f: SeasonFile): Season[] =>
  f.seasons.year.map((year, i) => ({
    year,
    value: f.seasons.value[i],
    lo: f.seasons.lo[i] ?? f.seasons.value[i],
    hi: f.seasons.hi[i] ?? f.seasons.value[i],
    modis: f.seasons.modis[i],
    viirs: f.seasons.viirs[i],
    source: f.seasons.source[i] === "MODIS" ? "MODIS" : "VIIRS",
  }));

// An orthographic globe turned so Egypt, Portugal and Argentina all face the reader.
const GLOBE = { size: 400, r: 186, lon0: -20, lat0: 6 };
const RAD = Math.PI / 180;
function project(lon: number, lat: number): [number, number] | null {
  const { r, lon0, lat0, size } = GLOBE;
  const l = (lon - lon0) * RAD, p = lat * RAD, p0 = lat0 * RAD;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  if (cosc < 0) return null;
  return [size / 2 + r * Math.cos(p) * Math.sin(l), size / 2 - r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l))];
}

/** The land as one path, thinned to a point every 2 px, on the side that faces the reader. */
function landPath(c: Countries): string {
  let d = "";
  const rings = c.features.flatMap((f) => (f.geometry.type === "Polygon" ? (f.geometry.coordinates as number[][][]) : (f.geometry.coordinates as number[][][][]).flat()));
  for (const ring of rings) {
    let last: [number, number] | null = null, pen = false, part = "", n = 0;
    for (const [lon, lat] of ring) {
      const q = project(lon, lat);
      if (!q) { pen = false; continue; }
      if (last && pen && Math.hypot(q[0] - last[0], q[1] - last[1]) < 2) continue;
      part += `${pen ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
      pen = true; last = q; n++;
    }
    if (n > 2) d += part;
  }
  return d;
}

const centre = (b: [number, number, number, number]) => project((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) ?? [0, 0];

/** Meridians every 30° and parallels every 30°, as one path. */
function graticule(): string {
  let d = "";
  const line = (pts: [number, number][]) => {
    let pen = false;
    for (const [lon, lat] of pts) {
      const q = project(lon, lat);
      if (!q) { pen = false; continue; }
      d += `${pen ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
      pen = true;
    }
  };
  for (let lon = -180; lon < 180; lon += 30) line(Array.from({ length: 61 }, (_, i) => [lon, -90 + i * 3] as [number, number]));
  for (let lat = -60; lat <= 60; lat += 30) line(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, lat] as [number, number]));
  return d;
}

export async function readDiaryData(): Promise<GameData> {
  const files = await readFiles();
  const n = diaryNumbers(files);
  const ph = placeholders(n);
  const pk = picks(n);
  // The game never runs on words the checker would refuse.
  const report = checkScript({ chapters: SCRIPT, runningHead: RUNNING_HEAD, ui: UI_LABELS }, ph, pk, claims(n));
  if (report.issues.length) throw new Error(`Hudhud's script fails its check:\n${report.issues.join("\n")}`);
  const { lines, notes, speakers } = resolveLines({ chapters: SCRIPT, ui: UI_LABELS }, ph, pk);

  const seasons = seasonsOf(files.delta as unknown as SeasonFile);
  const [t0, t1] = n.trainYears;
  const train = seasons.filter((s) => s.year >= t0 && s.year <= t1 && s.viirs != null && s.modis != null);
  const kCurve: GameData["kCurve"] = [];
  for (let k = 1; k <= 20.001; k += 0.25) {
    const err = train.reduce((s, x) => s + Math.abs(k * (x.modis as number) - (x.viirs as number)) / (x.viirs as number), 0) / train.length;
    kCurve.push({ k, err: err * 100 });
  }
  const viirsOf = (y: number) => seasons.find((s) => s.year === y)?.viirs ?? 0;

  const [countries, method, kafrFile] = await Promise.all([
    read<Countries>("basemap/countries.json"),
    read<Areas>("method.json"),
    read<SeasonFile>("areas/kafr-el-sheikh-rice-core.json"),
  ]);
  const box = (id: string) => method.areas.find((a) => a.id === id)?.box ?? [0, 0, 0, 0];
  const pins = (["kafr", "portugal", "chilecito"] as const).map((id) => {
    const [x, y] = centre(box(id === "kafr" ? "kafr-el-sheikh-rice-core" : id === "portugal" ? "portugal-mainland" : "chilecito"));
    return { id, x, y };
  });

  return {
    lines,
    notes,
    speakers,
    runningHead: RUNNING_HEAD,
    seasons,
    jump: { modisYear: n.jump.modisYear, viirsYear: n.jump.viirsYear },
    train: n.trainYears,
    test: n.testYears,
    needle: n.needle,
    kCurve,
    magic: n.magic.rounded,
    heat: n.gears.heat,
    hide: n.hideYear.map((h) => ({ year: h.year, viirs: viirsOf(h.year), guess: viirsOf(h.year) * (1 + h.errPct / 100), errPct: h.errPct })),
    worstYear: n.worst.year,
    testCounts: seasons.filter((s) => s.year >= n.testYears[0] && s.year <= n.testYears[1]).map((s) => ({ year: s.year, viirs: s.viirs ?? s.value })),
    thisYear: { year: n.thisYear.year, verdict: n.thisYear.verdict },
    since: { reference: n.since.reference, recent: n.since.recent, referenceMean: n.since.referenceMean, recentMean: n.since.recentMean, answer: n.since.answer, bounceYear: n.since.bounce.year },
    ban: { year: n.ban.year, before: n.ban.before.years, after: n.ban.after.years, beforeMean: n.ban.before.mean, afterMean: n.ban.after.mean },
    realWeek: n.realWeek ? { off: n.realWeek.off, on: n.realWeek.on } : null,
    globe: { size: GLOBE.size, land: landPath(countries), graticule: graticule(), pins },
    kafr: seasonsOf(kafrFile).map((s) => ({ year: s.year, value: s.value, source: s.source })),
  };
}
