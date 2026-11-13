// The TypeScript fit against the Python pipeline.
//
// fixtures.json.gz holds what the pipeline's own functions give for every named
// area and some random boxes (written by `uv run python -m zij fixtures`).
// Two kinds of test:
//   same inputs   the pipeline's weekly arrays go into the TypeScript fit;
//   cell files    the TypeScript starts from app/public/data/cells/, as the browser does.
// Both have to end at the pipeline's parameters, predictions and bands.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { areaRecord, decodeCells, trainingWeeks } from "../cells.ts";
import { fitDrawnArea } from "../drawn.ts";
import { countryPart, fitArea, predictArea, seasonMonths, TRAIN_YEARS } from "../m4.ts";

const here = new URL(".", import.meta.url);
const data = new URL("../../../public/data/cells/", here);
const fixtures = JSON.parse(gunzipSync(readFileSync(new URL("fixtures.json.gz", here))).toString("utf8"));
const index = JSON.parse(readFileSync(new URL("index.json", data), "utf8"));

const cellFiles = new Map();
function cellsOf(country) {
  if (!cellFiles.has(country)) {
    const zipped = readFileSync(new URL(index.countries[country].file.replace("cells/", ""), data));
    const raw = gunzipSync(zipped);
    cellFiles.set(country, decodeCells(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));
  }
  return cellFiles.get(country);
}

const nan = (xs) => xs.map((x) => (x === null ? NaN : x));

/** Equal within a relative 1e-6 (or 1e-7 absolute): far tighter than anything shown, loose enough for two maths libraries. */
function close(actual, expected, what) {
  if (expected === null || Number.isNaN(expected)) {
    assert.ok(actual === null || Number.isNaN(actual), `${what}: expected no value, got ${actual}`);
    return;
  }
  const tolerance = 1e-7 + 1e-6 * Math.abs(expected);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} against ${expected}`);
}

function closeAll(actual, expected, what) {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let i = 0; i < expected.length; i++) close(actual[i], expected[i], `${what}[${i}]`);
}

function sameFit(actual, expected, what) {
  assert.equal(actual.b, expected.b, `${what}: b`);
  assert.equal(actual.g, expected.g, `${what}: g`);
  assert.equal(actual.n_fire_weeks, expected.n_fire_weeks, `${what}: fire weeks`);
  assert.deepEqual(actual.season, expected.season, `${what}: season`);
  for (const key of ["a", "d", "z_ref", "s_typ", "scale"]) close(actual[key], expected[key], `${what}: ${key}`);
  closeAll(actual.c, expected.c, `${what}: c`);
}

function sameAreaFit(actual, expected, what) {
  assert.equal(actual.mode, expected.mode, `${what}: mode`);
  assert.equal(actual.n_fire_weeks, expected.n_fire_weeks, `${what}: fire weeks`);
  assert.equal(actual.parts.length, expected.parts.length, `${what}: parts`);
  expected.parts.forEach((part, k) => {
    sameFit(actual.parts[k], part, `${what}, part ${k + 1}`);
    close(actual.parts[k].weight, part.weight, `${what}, part ${k + 1}: weight`);
  });
}

/** The pipeline's training weeks of a case, as the fit's input. */
function pipelineTraining(c, withoutYear) {
  const r = c.record;
  const rows = r.year.map((y, i) => i).filter((i) => r.full[i] && r.year[i] >= TRAIN_YEARS[0] && r.year[i] <= TRAIN_YEARS[1] && r.year[i] !== withoutYear);
  const pick = (xs) => rows.map((i) => (xs[i] === null ? NaN : xs[i]));
  return { M: pick(r.M_adj), V: pick(r.V), month: pick(r.month), year: pick(r.year), frp: pick(r.frp) };
}

test("the fixtures cover every mode of the small-area rule", () => {
  const modes = fixtures.cases.map((c) => c.fit.mode);
  for (const mode of ["own", "blend", "none"]) assert.ok(modes.includes(mode), `no case with mode ${mode}`);
});

test("same inputs: the country fits", () => {
  for (const [country, f] of Object.entries(fixtures.countries)) {
    const t = f.train;
    const weeks = { M: t.M, V: t.V, month: t.month, year: t.year, frp: nan(t.frp) };
    const part = countryPart(weeks);
    sameFit(part.fit, index.countries[country].parts.all.fit, country);
    close(part.m_sum, index.countries[country].parts.all.m_sum, `${country}: MODIS total`);
    // One fold of the leave-one-year-out fits.
    const rows = t.year.map((y, i) => i).filter((i) => t.year[i] !== 2018);
    const pick = (xs) => rows.map((i) => xs[i]);
    const fold = countryPart({ M: pick(weeks.M), V: pick(weeks.V), month: pick(weeks.month), year: pick(weeks.year), frp: pick(weeks.frp) });
    sameFit(fold.fit, index.countries[country].parts["2018"].fit, `${country} without 2018`);
  }
});

for (const c of fixtures.cases) {
  test(`same inputs: ${c.name}`, () => {
    const train = pipelineTraining(c);
    const season = seasonMonths(train.V, train.month);
    assert.deepEqual(season, c.season, "season");
    const af = fitArea(train, index.countries[c.country].parts.all, season);
    sameAreaFit(af, c.fit, c.name);
    if (c.predicted) {
      const r = c.record;
      closeAll(predictArea(af, r.M_adj, r.month, r.year, nan(r.frp)), c.predicted, "prediction");
    }
  });

  test(`cell files: ${c.name}`, () => {
    const cells = cellsOf(c.country);
    const rec = areaRecord(cells, index, c.box);
    const r = c.record;
    assert.deepEqual(rec.weekStart, r.week_start, "weeks");
    assert.deepEqual([...rec.year], r.year, "ISO years");
    assert.deepEqual([...rec.month], r.month, "months");
    assert.deepEqual([...rec.full], r.full, "full weeks");
    closeAll(rec.M, r.M, "MODIS fire days");
    closeAll(rec.Madj, r.M_adj, "MODIS, adjusted");
    closeAll(rec.V, r.V, "VIIRS fire days");
    closeAll(rec.frp, r.frp, "FRP per detection");
    closeAll(rec.modisHotspots, r.modis_hotspots, "MODIS hotspots");
    closeAll(rec.viirsHotspots, r.viirs_hotspots, "VIIRS hotspots");
    closeAll(rec.ratios.Terra, c.ratios.Terra, "Terra ratio");
    closeAll(rec.ratios.Aqua, c.ratios.Aqua, "Aqua ratio");

    const area = fitDrawnArea(cells, index, c.country, c.box);
    assert.deepEqual(area.season, c.season, "season");
    sameAreaFit(area.fit, c.fit, c.name);
    if (c.fit.mode === "none") {
      assert.ok(area.source.every((s) => s !== "MODIS"), "no converted weeks without a fit");
      assert.equal(area.bands.basis, "none");
      return;
    }
    closeAll(area.predicted, c.predicted, "prediction");
    // The bands are rounded as the pipeline rounds them: 3 decimals, and 1 for percent.
    const own = area.bands.own_season_pct ?? area.bands.season_pct;
    for (const k of [0, 1]) {
      assert.ok(Math.abs(area.bands.week_mult[k] - c.bands.week_mult[k]) <= 0.0011, `week band: ${area.bands.week_mult} against ${c.bands.week_mult}`);
      assert.ok(Math.abs(own[k] - c.bands.season_pct[k]) <= 0.11, `season band: ${own} against ${c.bands.season_pct}`);
    }
    assert.equal(area.bands.season_errors_pct.length, c.bands.season_errors_pct.length, "season errors");
    area.bands.season_errors_pct.forEach((e, k) => assert.ok(Math.abs(e - c.bands.season_errors_pct[k]) <= 0.11, `season error ${k}`));
    if (c.fit.mode === "blend") assert.deepEqual(area.bands.season_pct, index.blend_band_pct, "blended areas take the pooled band");
  });
}

test("training weeks read from the cell files are the pipeline's", () => {
  const c = fixtures.cases[0];
  const mine = trainingWeeks(areaRecord(cellsOf(c.country), index, c.box), index.train_years, 2015);
  const theirs = pipelineTraining(c, 2015);
  closeAll(mine.M, theirs.M, "MODIS");
  closeAll(mine.V, theirs.V, "VIIRS");
});
