// The hotspot library against the pipeline.
//
// fixtures.json holds the pipeline's own counts (its cell_days table: kept
// detections per day, cell and satellite) for named areas and date ranges,
// written by `uv run python -m zij hotspots`. Counts made in TypeScript from the
// hotspot files have to equal them, and to equal the weekly counts of the
// exported area files and of the cell files.
//
//   node --import ./lib/fit/test/register.mjs --test "lib/hotspots/test/*.test.mjs"     (from app/)

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { areaRecord, decodeCells, hotspotCounts } from "../../fit/cells.ts";
import { dayView } from "../day.ts";
import { createHotspotLoader, CSV_COLUMNS, dailySummary, hotspotsCsv, regionsFor, selectHotspots, totals } from "../hotspots.ts";

const data = new URL("../../../public/data/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, data), "utf8"));
const index = read("hotspots/index.json");
const presets = read("index.json");
const fixtures = JSON.parse(readFileSync(new URL("fixtures.json", import.meta.url), "utf8"));

/** Stands in for fetch: reads the file from app/public/data/. */
const fromDisk = async (url) => {
  const bytes = readFileSync(new URL(url.replace(/^\/data\//, ""), data));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
const loader = createHotspotLoader(index, "/data/", fromDisk);

for (const c of fixtures.cases) {
  test(`counts equal the pipeline's: ${c.area}, ${c.from} to ${c.to}`, async () => {
    const { files, covered } = await loader.load(c.box, c.from, c.to);
    assert.ok(covered);
    const selection = selectHotspots(files, index, c.box, c.from, c.to);
    assert.equal(selection.n, c.hotspots, "hotspots");
    assert.deepEqual(totals(selection, index).satellites, c.by_satellite, "by satellite");
    let frp = 0;
    for (let k = 0; k < selection.n; k++) frp += selection.frp[k];
    assert.ok(Math.abs(frp - c.frp_sum) <= 1e-4 * Math.max(1, c.frp_sum), `FRP sum: ${frp} against ${c.frp_sum}`);

    const days = dailySummary(selection, index);
    assert.equal(days[0].date, c.from);
    assert.equal(days.reduce((s, d) => s + d.hotspots, 0), c.hotspots);
    if (c.days) {
      const mine = [];
      for (const d of days) {
        for (const sensor of Object.values(d.sensors)) {
          for (const [name, n] of Object.entries(sensor.satellites)) if (n) mine.push([d.date, name, n]);
        }
      }
      const key = (r) => `${r[0]} ${r[1]}`;
      assert.deepEqual(mine.sort((a, b) => key(a).localeCompare(key(b))), [...c.days].sort((a, b) => key(a).localeCompare(key(b))), "per day and satellite");
    }
  });
}

test("weekly counts equal the exported area files and the cell files", async () => {
  const cellsIndex = read("cells/index.json");
  for (const id of ["nile-delta", "alentejo", "chilecito", "parana-delta"]) {
    const entry = presets.areas.find((a) => a.id === id);
    const doc = read(entry.file);
    const from = "2019-12-30", to = "2021-01-03"; // whole ISO weeks
    const { files } = await loader.load(entry.box, from, to);
    const selection = selectHotspots(files, index, entry.box, from, to);
    const byWeek = new Map();
    const sensorOf = index.satellites.map((s) => s.sensor);
    const epoch = Date.parse(index.epoch);
    for (let k = 0; k < selection.n; k++) {
      const ms = epoch + selection.day[k] * 86400000;
      const monday = new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
      const w = byWeek.get(monday) ?? { MODIS: 0, VIIRS: 0 };
      w[sensorOf[selection.satellite[k]]] += 1;
      byWeek.set(monday, w);
    }
    let weeks = 0;
    doc.weeks.week_start.forEach((start, i) => {
      if (start < from || start > to) return;
      weeks++;
      const mine = byWeek.get(start) ?? { MODIS: 0, VIIRS: 0 };
      assert.equal(mine.MODIS, doc.weeks.modis_hotspots[i], `${id} ${start} MODIS`);
      assert.equal(mine.VIIRS, doc.weeks.viirs_hotspots[i], `${id} ${start} VIIRS`);
    });
    assert.equal(weeks, 53);

    const raw = gunzipSync(readFileSync(new URL(cellsIndex.countries[entry.country].file, data)));
    const cells = decodeCells(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const weekly = hotspotCounts(areaRecord(cells, cellsIndex, entry.box), cellsIndex, from, to);
    const mine = totals(selection, index);
    assert.equal(mine.sensors.MODIS, weekly.sensors.MODIS.hotspots, `${id}: MODIS, cell files`);
    assert.equal(mine.sensors.VIIRS, weekly.sensors.VIIRS.hotspots, `${id}: VIIRS, cell files`);
  }
});

test("shapes: a polygon that is the box, two halves, and the exact outline", async () => {
  const box = [29.8, 30.0, 32.3, 31.6];
  const [west, south, east, north] = box;
  const from = "2018-09-01", to = "2018-11-30";
  const { files } = await loader.load(box, from, to);
  const whole = selectHotspots(files, index, box, from, to);
  const polygon = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  assert.equal(selectHotspots(files, index, polygon, from, to).n, whole.n);
  const a = selectHotspots(files, index, { type: "Polygon", coordinates: [[[west, south], [east, south], [west, north], [west, south]]] }, from, to);
  const b = selectHotspots(files, index, { type: "Polygon", coordinates: [[[east, south], [east, north], [west, north], [east, south]]] }, from, to);
  assert.ok(a.n > 0 && b.n > 0);
  assert.equal(a.n + b.n, whole.n, "two halves make the box");
  // On a box whose edges are grid lines, the cell rule and the exact outline pick the same hotspots.
  assert.equal(selectHotspots(files, index, box, from, to, { by: "point" }).n, whole.n);
  // Off the grid they differ: the exact outline cuts cells the cell rule takes or leaves whole.
  const off = [30.03, 30.47, 31.26, 31.14];
  const byPoint = selectHotspots(files, index, off, from, to, { by: "point" });
  for (let k = 0; k < byPoint.n; k++) {
    assert.ok(byPoint.lon[k] > off[0] && byPoint.lon[k] < off[2] && byPoint.lat[k] > off[1] && byPoint.lat[k] < off[3]);
  }
  assert.ok(byPoint.n > 0 && byPoint.n !== selectHotspots(files, index, off, from, to).n);
  // Rows come out sorted by day, then time.
  for (let k = 1; k < whole.n; k++) {
    assert.ok(whole.day[k] > whole.day[k - 1] || (whole.day[k] === whole.day[k - 1] && whole.minute[k] >= whole.minute[k - 1]));
  }
});

test("the loader fetches a file once, and only the files the shape and dates need", async () => {
  const calls = [];
  const counting = async (url) => {
    calls.push(url);
    return fromDisk(url);
  };
  const lazy = createHotspotLoader(index, "/data/", counting);
  assert.deepEqual(calls, [], "nothing is fetched before load");
  await lazy.load([29.8, 30.0, 32.3, 31.6], "2020-01-01", "2020-12-31");
  await lazy.load([30.6, 31.0, 31.3, 31.5], "2005-01-01", "2005-12-31");
  assert.deepEqual(calls, ["/data/hotspots/egypt.bin.gz"]);
  await lazy.load([-68.2, -29.6, -67.2, -28.7], "2026-07-01", "2026-07-31");
  assert.deepEqual(lazy.fetched(), ["hotspots/egypt.bin.gz", "hotspots/argentina-chilecito.bin.gz"]);

  // A region cut in two periods: only the period the dates touch is fetched.
  const egypt = index.regions.find((r) => r.id === "egypt");
  const cut = { ...index, regions: [{ ...egypt, files: [
    { ...egypt.files[0], file: "hotspots/egypt.bin.gz?early", to: "2012-12-31" },
    { ...egypt.files[0], file: "hotspots/egypt.bin.gz?late", from: "2013-01-01" },
  ] }] };
  const seen = [];
  const periods = createHotspotLoader(cut, "/data/", async (url) => {
    seen.push(url);
    return fromDisk(url.replace(/\?.*$/, ""));
  });
  await periods.load([29.8, 30.0, 32.3, 31.6], "2020-01-01", "2020-12-31");
  assert.deepEqual(seen, ["/data/hotspots/egypt.bin.gz?late"]);
  await periods.load([29.8, 30.0, 32.3, 31.6], "2012-12-01", "2013-01-31");
  assert.equal(seen.length, 2);
});

test("where hotspots are shipped: whole Egypt and Portugal, two boxes in Argentina", () => {
  assert.equal(regionsFor(index, [29.8, 30.0, 32.3, 31.6]).covered, true);
  assert.equal(regionsFor(index, [-8.9, 37.3, -6.9, 39.0]).covered, true);
  assert.deepEqual(regionsFor(index, [-68.2, -29.6, -67.2, -28.7]).regions.map((r) => r.id), ["argentina-chilecito"]);
  assert.equal(regionsFor(index, [-60.8, -34.5, -58.2, -32.0]).covered, true);
  assert.equal(regionsFor(index, [-61.2, -34.9, -57.8, -31.6]).covered, true, "the margin is covered");
  assert.equal(regionsFor(index, [-62.5, -34.5, -58.2, -32.0]).covered, false, "past the margin is not");
  assert.deepEqual(regionsFor(index, [-66.5, -33.8, -65.7, -33.0]), { regions: [], covered: false });
});

test("the CSV credits NASA FIRMS, names every filter and has one row per hotspot", async () => {
  const entry = presets.areas.find((a) => a.id === "chilecito");
  const from = "2026-07-27", to = "2026-08-01";
  const { files } = await loader.load(entry.box, from, to);
  const selection = selectHotspots(files, index, entry.box, from, to);
  const csv = hotspotsCsv(selection, index, { area: entry.name, country: entry.country });
  const lines = csv.trimEnd().split("\n");
  const head = lines.filter((l) => l.startsWith("#"));
  const body = lines.filter((l) => !l.startsWith("#"));
  assert.ok(head.some((l) => l.includes("NASA FIRMS") && l.includes("https://earthdata.nasa.gov/firms")));
  for (const filter of index.filters.text) assert.ok(head.some((l) => l.includes(filter)), `filter not named: ${filter}`);
  assert.ok(head.some((l) => l.includes("Chilecito, Argentina") && l.includes("-68.2, -29.6, -67.2, -28.7")));
  assert.ok(head.some((l) => l.includes(`${from} to ${to}`) && l.includes(`Rows: ${selection.n}`)));
  assert.equal(body[0], CSV_COLUMNS.join(","));
  assert.equal(body.length - 1, selection.n);
  assert.ok(selection.n > 100);
  for (const line of body.slice(1)) {
    const f = line.split(",");
    assert.equal(f.length, CSV_COLUMNS.length);
    assert.match(f[0], /^-?\d+\.\d{5}$/);
    assert.match(f[2], /^2026-0[78]-\d\d$/);
    assert.match(f[3], /^\d\d:\d\d$/);
    assert.ok(["Terra", "Aqua", "Suomi NPP", "NOAA-20", "NOAA-21"].includes(f[4]));
    assert.equal(f[5], f[4] === "Terra" || f[4] === "Aqua" ? "MODIS" : "VIIRS");
    if (f[5] === "MODIS") assert.ok(Number(f[6]) >= 30 && Number(f[6]) <= 100);
    else assert.ok(f[6] === "nominal" || f[6] === "high");
    assert.ok(Number(f[7]) >= 0);
    assert.ok(f[8] === "D" || f[8] === "N");
    assert.ok(f[9] === "SP" || f[9] === "NRT");
  }
});

test("the day view: the day's hotspots, and its week and month against the median", async () => {
  const entry = presets.areas.find((a) => a.id === "chilecito");
  const doc = read(entry.file);
  const date = "2026-07-29";
  const { files } = await loader.load(entry.box, date, date);
  const view = dayView(files, index, doc, date);
  const expected = selectHotspots(files, index, entry.box, date, date);
  assert.equal(view.hotspots.length, expected.n);
  assert.ok(view.hotspots.length > 0);
  assert.equal(view.summary.date, date);
  assert.equal(view.summary.hotspots, expected.n);
  assert.ok(view.hotspots.every((h) => (h.sensor === "MODIS") === (h.satellite === "Terra" || h.satellite === "Aqua")));
  assert.equal(view.summary.sensors.MODIS.hotspots + view.summary.sensors.VIIRS.hotspots, expected.n);
  assert.equal(view.summary.sensors.VIIRS.satellites["Suomi NPP"] + view.summary.sensors.VIIRS.satellites["NOAA-20"] + view.summary.sensors.VIIRS.satellites["NOAA-21"],
    view.summary.sensors.VIIRS.hotspots);

  const i = doc.weeks.week_start.indexOf("2026-07-27");
  assert.equal(view.week.week_start, "2026-07-27");
  assert.equal(view.week.value, doc.weeks.value[i]);
  assert.equal(view.week.flag, doc.weeks.flag[i]);
  const k = doc.climatology.weeks.iso_week.indexOf(doc.weeks.iso_week[i]);
  assert.equal(view.week.median, doc.climatology.weeks.median[k]);
  const median = doc.climatology.weeks.median[k];
  assert.ok(Math.abs(view.week.pct_vs_median - (100 * (doc.weeks.value[i] - median)) / median) < 0.006);

  const j = doc.months.year.findIndex((y, n) => y === 2026 && doc.months.month[n] === 7);
  assert.equal(view.month.value, doc.months.value[j]);
  assert.equal(view.month.median, doc.climatology.months.median[6]);
  assert.equal(view.month.pct_vs_median, doc.months.anomaly_pct[j]);
  assert.equal(view.month.complete, true);
  assert.equal(view.month.to_date, null);

  // The running month is compared over its days so far.
  const late = dayView((await loader.load(entry.box, "2026-11-10", "2026-11-10")).files, index, doc, "2026-11-10");
  assert.equal(late.month.complete, false);
  assert.deepEqual(late.month.to_date, doc.this_month);

  // A satellite that was not flying has no count, not zero: Suomi NPP's data ends on 1 November 2026.
  assert.equal(late.summary.sensors.VIIRS.satellites["Suomi NPP"], undefined);
  const outage = dayView((await loader.load(entry.box, "2022-08-01", "2022-08-01")).files, index, doc, "2022-08-01");
  assert.equal(outage.summary.sensors.VIIRS.satellites["Suomi NPP"], null, "inside Suomi NPP's 2022 outage");
  assert.equal(typeof outage.summary.sensors.VIIRS.satellites["NOAA-20"], "number");
  // Before VIIRS flew, the sensor as a whole has no data.
  const early = dayView((await loader.load(entry.box, "2005-07-29", "2005-07-29")).files, index, doc, "2005-07-29");
  assert.equal(early.summary.sensors.VIIRS.hotspots, null);
  assert.equal(typeof early.summary.sensors.MODIS.hotspots, "number");
  assert.equal(early.week.source, "MODIS");
});
