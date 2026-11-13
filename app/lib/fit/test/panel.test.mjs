// The drawn-area document against the 10 exported area files.
//
// Each named area's box goes through the TypeScript, starting from the cell
// files, and has to come out as app/public/data/areas/<id>.json: the same keys
// and the same numbers. Two calculations in two languages can land on either
// side of a rounding edge, so a number may differ by one unit of its last
// printed digit; everything else has to be identical. The test prints how many
// numbers were compared and how many used that allowance.
//
// Also here: polygons, the raw hotspot counts and the choice of country file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { areaRecord, countriesFor, decodeCells, gridCellsIn, hotspotCounts } from "../cells.ts";
import { fitDrawnArea, roundTo } from "../drawn.ts";
import { drawnAreaDocument } from "../panel.ts";

const data = new URL("../../../public/data/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, data), "utf8"));
const index = read("cells/index.json");
const presets = read("index.json");

const cellFiles = new Map();
function cellsOf(country) {
  if (!cellFiles.has(country)) {
    const raw = gunzipSync(readFileSync(new URL(index.countries[country].file, data)));
    cellFiles.set(country, decodeCells(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));
  }
  return cellFiles.get(country);
}

/** One unit of the last digit the pipeline prints at this place in the file. */
function step(path) {
  if (path.startsWith("fit.parts")) return 1e-5;
  if (path.startsWith("fit.single_satellite_ratio")) return 1e-4;
  if (/^bands\.(week|month)_mult/.test(path)) return 1e-3;
  if (/^bands\.|^terra_only_test\./.test(path)) return 0.1;
  return 0.01;
}

function compare(mine, theirs, path, tally) {
  if (typeof theirs === "number") {
    assert.equal(typeof mine, "number", `${path}: ${JSON.stringify(mine)} against ${theirs}`);
    tally.numbers++;
    if (mine === theirs) return;
    tally.lastDigit.push(`${path}: ${mine} against ${theirs}`);
    assert.ok(Math.abs(mine - theirs) <= step(path) * 1.0001, `${path}: ${mine} against ${theirs}`);
  } else if (Array.isArray(theirs)) {
    assert.ok(Array.isArray(mine), `${path}: not a list`);
    assert.equal(mine.length, theirs.length, `${path}: length`);
    theirs.forEach((x, i) => compare(mine[i], x, `${path}[${i}]`, tally));
  } else if (theirs !== null && typeof theirs === "object") {
    assert.deepEqual(Object.keys(mine).sort(), Object.keys(theirs).sort(), `${path}: keys`);
    for (const key of Object.keys(theirs)) compare(mine[key], theirs[key], path ? `${path}.${key}` : key, tally);
  } else {
    assert.equal(mine, theirs, path); // strings, true and false, null
  }
}

let numbers = 0, lastDigit = 0;
for (const entry of presets.areas) {
  test(`same numbers as the exported file: ${entry.name}`, () => {
    const theirs = read(entry.file);
    const mine = drawnAreaDocument(cellsOf(entry.country), index, entry.country, entry.box, { id: entry.id, name: entry.name });
    assert.match(mine.built_at_utc, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$/);
    mine.built_at_utc = theirs.built_at_utc; // the one value that is the clock's
    const tally = { numbers: 0, lastDigit: [] };
    compare(JSON.parse(JSON.stringify(mine)), theirs, "", tally);
    numbers += tally.numbers;
    lastDigit += tally.lastDigit.length;
    assert.ok(tally.lastDigit.length <= tally.numbers / 2000, `too many last-digit differences: ${tally.lastDigit.slice(0, 5).join("; ")}`);
  });
}

// No named area is blended or too small to fit, so the pipeline's document for
// one such random box per country is kept in the fixtures.
const fixtures = JSON.parse(gunzipSync(readFileSync(new URL("fixtures.json.gz", import.meta.url))).toString("utf8"));
for (const c of fixtures.cases.filter((x) => x.document)) {
  test(`same numbers as the pipeline's document, fit ${c.fit.mode}: ${c.name}`, () => {
    const theirs = c.document;
    const mine = drawnAreaDocument(cellsOf(c.country), index, c.country, c.box, { id: theirs.id, name: theirs.name });
    mine.built_at_utc = theirs.built_at_utc;
    const tally = { numbers: 0, lastDigit: [] };
    compare(JSON.parse(JSON.stringify(mine)), theirs, "", tally);
    numbers += tally.numbers;
    lastDigit += tally.lastDigit.length;
    assert.equal(mine.fit.mode, c.fit.mode);
    if (c.fit.mode === "blend") assert.deepEqual(mine.bands.season_pct, index.blend_band_pct);
    if (c.fit.mode === "none") assert.ok(mine.weeks.source.every((s) => s !== "MODIS"));
    assert.ok(tally.lastDigit.length <= tally.numbers / 2000, `too many last-digit differences: ${tally.lastDigit.slice(0, 5).join("; ")}`);
  });
}

test("how exact the comparison was", () => {
  console.log(`${numbers} numbers compared with the 10 exported files and 6 box documents, ${lastDigit} differ in the last printed digit, none by more`);
  assert.ok(numbers > 100000);
});

test("rounding is Python's: an exact half goes to the even digit", () => {
  assert.equal(roundTo(0.125, 2), 0.12);
  assert.equal(roundTo(0.375, 2), 0.38);
  assert.equal(roundTo(2.5, 0), 2);
  assert.equal(roundTo(-0.125, 2), -0.12);
  assert.equal(roundTo(1.005, 2), 1); // 1.005 is stored a little under the half
  assert.equal(roundTo(NaN, 2), null);
});

test("a polygon that is the box gives the box's record", () => {
  const delta = presets.areas[0];
  const [west, south, east, north] = delta.box;
  const polygon = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  const cells = cellsOf(delta.country);
  const asBox = areaRecord(cells, index, delta.box), asPolygon = areaRecord(cells, index, polygon);
  assert.equal(asPolygon.nCells, asBox.nCells);
  assert.equal(asPolygon.nFireCells, asBox.nFireCells);
  assert.deepEqual([...asPolygon.M], [...asBox.M]);
  assert.deepEqual([...asPolygon.V], [...asBox.V]);
  assert.deepEqual(asPolygon.box, delta.box);
  const doc = drawnAreaDocument(cells, index, delta.country, polygon);
  assert.deepEqual(doc.polygon, polygon);
  assert.equal(doc.id, "drawn");
});

test("a polygon takes the cells whose centre is inside it, holes left out", () => {
  const cells = cellsOf("Egypt");
  const square = [[30, 30], [32, 30], [32, 31.5], [30, 31.5], [30, 30]];
  const triangle = { type: "Polygon", coordinates: [[[30, 30], [32, 30], [30, 31.5], [30, 30]]] };
  const other = { type: "Polygon", coordinates: [[[32, 30], [32, 31.5], [30, 31.5], [32, 30]]] };
  const whole = areaRecord(cells, index, [30, 30, 32, 31.5]);
  const a = areaRecord(cells, index, triangle), b = areaRecord(cells, index, other);
  assert.ok(a.nCells > 0 && b.nCells > 0);
  assert.equal(a.nCells + b.nCells, whole.nCells, "two halves make the box");
  assert.equal(a.nFireCells + b.nFireCells, whole.nFireCells);
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  assert.equal(sum(a.modisHotspots) + sum(b.modisHotspots), sum(whole.modisHotspots));

  const hole = [[30.5, 30.5], [31.5, 30.5], [31.5, 31], [30.5, 31], [30.5, 30.5]];
  const ring = areaRecord(cells, index, { type: "Polygon", coordinates: [square, hole] });
  const inner = areaRecord(cells, index, [30.5, 30.5, 31.5, 31]);
  assert.equal(ring.nCells, whole.nCells - inner.nCells);
  assert.equal(sum(ring.modisHotspots), sum(whole.modisHotspots) - sum(inner.modisHotspots));
  assert.equal(gridCellsIn(triangle), a.nCells);

  const fitted = fitDrawnArea(cells, index, "Egypt", triangle);
  assert.ok(["own", "blend", "none"].includes(fitted.fit.mode));
});

test("raw hotspot counts for a date range are the exported file's", () => {
  for (const entry of [presets.areas[0], presets.areas.find((a) => a.id === "chilecito")]) {
    const file = read(entry.file);
    const rec = areaRecord(cellsOf(entry.country), index, entry.box);
    const from = "2020-09-03", to = "2020-10-28"; // mid-week on purpose: the range widens to whole weeks
    const counts = hotspotCounts(rec, index, from, to);
    assert.equal(counts.from, "2020-08-31");
    assert.equal(counts.to, "2020-11-01");
    const at = file.weeks.week_start.map((d, i) => i).filter((i) => file.weeks.week_start[i] >= counts.from && file.weeks.week_start[i] <= counts.to);
    assert.deepEqual(counts.week_start, at.map((i) => file.weeks.week_start[i]));
    const sum = (xs) => at.reduce((s, i) => s + (xs[i] ?? 0), 0);
    assert.equal(counts.sensors.MODIS.hotspots, sum(file.weeks.modis_hotspots));
    assert.equal(counts.sensors.VIIRS.hotspots, sum(file.weeks.viirs_hotspots));
    assert.deepEqual(counts.sensors.MODIS.by_week, at.map((i) => file.weeks.modis_hotspots[i]));
    for (const family of ["MODIS", "VIIRS"]) {
      for (const [name, n] of Object.entries(counts.sensors[family].satellites)) {
        assert.equal(n, sum(file.satellites[name].hotspots), `${entry.name}, ${name}`);
      }
      assert.equal(counts.sensors[family].weeks_without_data, 0);
    }
  }
  // Before VIIRS flew, its weeks are "no data", not zero.
  const rec = areaRecord(cellsOf("Egypt"), index, presets.areas[0].box);
  const early = hotspotCounts(rec, index, "2005-01-03", "2005-01-30");
  assert.equal(early.sensors.VIIRS.weeks_without_data, 4);
  assert.deepEqual(early.sensors.VIIRS.by_week, [null, null, null, null]);
  assert.ok(!("NOAA-21" in early.sensors.MODIS.satellites));
});

test("only the country a shape is in needs its cell file", () => {
  assert.deepEqual(countriesFor(index, [29.8, 30.0, 32.3, 31.6]), ["Egypt"]);
  assert.deepEqual(countriesFor(index, [-68.2, -29.6, -67.2, -28.7]), ["Argentina"]);
  assert.deepEqual(countriesFor(index, [-8.9, 37.3, -6.9, 39.0]), ["Portugal"]);
  assert.deepEqual(countriesFor(index, [100, 0, 101, 1]), []);
});
