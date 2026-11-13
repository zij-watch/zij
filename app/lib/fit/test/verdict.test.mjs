// The verdict rules (app/lib/verdict.ts), on small documents made here, and on the exported
// area files: each badge threshold, the running month, a month with data missing, an area with
// no fit, a Terra-only year, and the exact rank against the pipeline's own per-year values.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { approx, areaVerdict, dayVerdicts, levelFrom, monthIntensity, standing } from "../../verdict.ts";

const read = (path) => JSON.parse(readFileSync(new URL(`../../../public/data/${path}`, import.meta.url), "utf8"));

// Ten other years with values 10, 20, ... 100: p10 = 19, p25 = 32.5, median 55, p75 = 77.5, p90 = 91.
const TEN = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

test("badge thresholds: far below is under the 10th percentile", () => {
  assert.equal(standing(18.9, TEN).level, "far-below");
  assert.equal(standing(19, TEN).level, "below"); // exactly the 10th percentile is not under it
});
test("badge thresholds: below is from the 10th to under the 25th", () => {
  assert.equal(standing(32.4, TEN).level, "below");
  assert.equal(standing(32.5, TEN).level, "normal"); // exactly the 25th is normal
});
test("badge thresholds: normal is from the 25th to the 75th", () => {
  assert.equal(standing(55, TEN).level, "normal");
  assert.equal(standing(77.5, TEN).level, "normal"); // exactly the 75th is normal
});
test("badge thresholds: above is over the 75th up to the 90th", () => {
  assert.equal(standing(77.6, TEN).level, "above");
  assert.equal(standing(91, TEN).level, "above"); // exactly the 90th is not over it
});
test("badge thresholds: far above is over the 90th percentile", () => {
  assert.equal(standing(91.1, TEN).level, "far-above");
  assert.equal(levelFrom(5, 0, 0, 0, 0), "far-above"); // any fire where the past had none
  assert.equal(levelFrom(0, 0, 0, 0, 0), "normal");
});

test("rank and percentile are exact, and the rank counts the year itself", () => {
  const s = standing(25, TEN); // 2 of 10 others are under it
  assert.equal(s.percentile, 20);
  assert.equal(s.rank, "3rd lowest of 11 years");
  assert.equal(standing(95, TEN).rank, "2nd highest of 11 years");
  assert.equal(standing(5, TEN).rank, "the lowest of 11 years");
  assert.equal(standing(500, TEN).rank, "the highest of 11 years");
  assert.equal(standing(50, TEN).percentile, 45); // a tie counts half
});

test("fewer than 5 other years: no verdict", () => {
  assert.equal(standing(3, [1, 2, 3, 4]), null);
});

/** A small area document: `years` years of one whole month (October) and one whole week (ISO week 40). */
function document({ mode = "own", toDate = TEN, value = 25, complete = true, missing = null, terraOnly = [] } = {}) {
  const years = Array.from({ length: 11 }, (_, k) => 2001 + k);
  const monthValues = years.map((y, k) => (y === missing ? null : k === 10 ? 25 : TEN[k]));
  return {
    fit: { mode },
    climatology: { baseline_years: [2001, 2010] },
    this_month: { year: 2011, month: 11, days_so_far: 12, value_to_date: value, baseline_n: toDate.length, to_date_years: years.slice(0, toDate.length), to_date_values: toDate },
    months: { year: years, month: years.map(() => 10), value: monthValues, complete: years.map((_, k) => (k === 10 ? complete : true)) },
    weeks: {
      week_start: years.map((y) => `${y}-10-03`), year: years, iso_week: years.map(() => 40), value: years.map((_, k) => (k === 10 ? 25 : TEN[k])),
      is_partial: years.map(() => false),
    },
    seasons: { year: years, terra_only: years.map((y) => terraOnly.includes(y)) },
  };
}

test("the running month: this month so far against the same days of past years", () => {
  const v = areaVerdict(document());
  assert.equal(v.level, "below");
  assert.equal(v.percentile, 20);
  assert.equal(v.rank, "3rd lowest of 11 years");
  assert.match(v.sentence, /^November 2011 so far is below normal here: 25\.0 in its first 12 days, against a median of 55\.0 for the same days\. That is 3rd lowest of 11 years, 2001 to 2011, the 20th percentile\.$/);
});

test("a chosen day in the running month takes the month-so-far verdict, not a part-month against whole months", () => {
  const doc = document({ complete: false });
  doc.months.month[10] = 11; // the last month of the record is the running November
  const { month } = dayVerdicts(doc, "2011-11-05");
  assert.equal(month.rank, "3rd lowest of 11 years");
  assert.match(month.sentence, /^November 2011 so far is below normal: /);
});

test("a month with data missing: left out of the comparison, and no verdict for itself", () => {
  const doc = document({ missing: 2005 });
  const { month } = dayVerdicts(doc, "2011-10-05");
  assert.match(month.sentence, /of 10 years/); // 9 other Octobers and this one: 2005 is not counted
  assert.equal(dayVerdicts(doc, "2005-10-05").month, null);
  // An incomplete month in the past is no verdict either.
  const partial = document();
  partial.months.complete[3] = false;
  assert.equal(dayVerdicts(partial, "2004-10-05").month, null);
});

test("a day's week: the same week of the year in the other years", () => {
  const { week } = dayVerdicts(document(), "2011-10-05");
  assert.equal(week.level, "below");
  assert.match(week.sentence, /3rd lowest of 11 years, 2001 to 2011, the 20th percentile/);
  // A partial week gives no verdict.
  const doc = document();
  doc.weeks.is_partial[10] = true;
  assert.equal(dayVerdicts(doc, "2011-10-05").week, null);
});

test("fit mode none: never a verdict", () => {
  const doc = document({ mode: "none" });
  assert.equal(areaVerdict(doc), null);
  assert.deepEqual(dayVerdicts(doc, "2011-10-05"), { week: null, month: null });
});

test("a Terra-only year is compared like any other year", () => {
  const doc = document({ terraOnly: [2001] });
  // 2001 itself gets a verdict: the lowest of the 11 Octobers.
  const { month } = dayVerdicts(doc, "2001-10-05");
  assert.equal(month.level, "far-below");
  assert.match(month.sentence, /the lowest of 11 years, 2001 to 2011/);
  // And it stays in the comparison of the other years.
  assert.match(dayVerdicts(doc, "2011-10-05").month.sentence, /of 11 years, 2001 to 2011/);
  // In the real record 2001 is Terra-only in the Nile Delta, and its months still have verdicts.
  const delta = read("areas/nile-delta.json");
  assert.equal(delta.seasons.terra_only[delta.seasons.year.indexOf(2001)], true);
  assert.notEqual(dayVerdicts(delta, "2001-10-10").month, null);
});

test("against the pipeline: every exported area has each year's month so far, and the verdict's rank is the count", () => {
  for (const entry of read("index.json").areas) {
    const area = read(`areas/${entry.id}.json`);
    const t = area.this_month;
    assert.equal(t.to_date_values.length, t.baseline_n, `${entry.id}: one value per baseline year`);
    assert.equal(t.to_date_years.length, t.baseline_n);
    // The pipeline's own percentiles are the percentiles of the values it now exports.
    const sorted = [...t.to_date_values].sort((a, b) => a - b);
    const at = (sorted.length - 1) * 0.5;
    const median = sorted[Math.floor(at)] + (sorted[Math.ceil(at)] - sorted[Math.floor(at)]) * (at - Math.floor(at));
    assert.ok(Math.abs(median - t.median_to_date) <= 0.011, `${entry.id}: median ${median} against the pipeline's ${t.median_to_date}`);
    const v = areaVerdict(area);
    if (area.fit.mode === "none") { assert.equal(v, null); continue; }
    const under = t.to_date_values.filter((x) => x < t.value_to_date).length, over = t.to_date_values.filter((x) => x > t.value_to_date).length;
    const expected = under <= over ? under + 1 : over + 1;
    assert.match(v.rank, new RegExp(`^(the|${expected}(st|nd|rd|th)) (lowest|highest) of ${t.baseline_n + 1} years$`), `${entry.id}: ${v.rank}`);
    if (expected === 1) assert.match(v.rank, /^the /);
  }
});

test("an area file from before the per-year export still gets a verdict, worded about, with the same badge", () => {
  const area = read("areas/nile-delta.json");
  const exact = areaVerdict(area);
  const older = structuredClone(area);
  delete older.this_month.to_date_values;
  delete older.this_month.to_date_years;
  const v = areaVerdict(older);
  assert.equal(v.level, exact.level);
  assert.equal(v.rank, "");
  assert.match(v.sentence, /That is (about the \d+(st|nd|rd|th)|under the 10th|over the 90th) percentile of the 25 years 2001 to 2025\.$/);
});

// ---------------------------------------------------------------- intensity

/** Weeks of one July per year: `detections` VIIRS detections over `cellDays` VIIRS fire cell-days. */
function julys(rows) {
  return {
    weeks: {
      year: rows.map((r) => r[0]), month: rows.map(() => 7),
      viirs_hotspots: rows.map((r) => r[1]), viirs: rows.map((r) => r[2]),
    },
  };
}
const QUIET = [[2012, 20, 10], [2013, 30, 10], [2014, 25, 10], [2015, 40, 10], [2016, 35, 10], [2017, 30, 10]];

test("intensity: a month far over its usual detections per cell-day gets the line", () => {
  const line = monthIntensity(julys([...QUIET, [2018, 900, 20]]), 2018, 7, "normal");
  assert.equal(line, "Normal in spread, unusually intense: about 900 VIIRS detections over 20 cell-days, 15.0 times the usual for July here.");
});
test("intensity: an ordinary month gets no line", () => {
  assert.equal(monthIntensity(julys([...QUIET, [2018, 60, 20]]), 2018, 7, "normal"), null);
});
test("intensity: too few detections, or too few years to compare, gets no line", () => {
  assert.equal(monthIntensity(julys([...QUIET, [2018, 29, 1]]), 2018, 7, "normal"), null);
  assert.equal(monthIntensity(julys([...QUIET.slice(0, 4), [2018, 900, 20]]), 2018, 7, "normal"), null);
});
test("intensity: a named fire is worded with its detections and its cells", () => {
  const fire = { fire_days: ["2018-07-27", "2018-08-01"], viirs_detections: 918, grid_cells: 8 };
  assert.equal(monthIntensity(julys([...QUIET, [2018, 935, 23]]), 2018, 7, "above", fire), "Above normal in spread, unusually intense: about 900 detections in 8 cells.");
  assert.equal(approx(918), 900);
  assert.equal(approx(47), 50);
});

test("Chilecito in July 2026 never reads as plain normal: the intensity line is there, from findings.json", () => {
  const area = read("areas/chilecito.json");
  const finding = read("findings.json").areas.find((a) => a.id === "chilecito").numbers;
  const { month } = dayVerdicts(area, "2026-07-29", finding);
  assert.match(month.intensity, /in spread, unusually intense: about 900 detections in 8 cells\.$/);
  // Without the finding the line is still there, in the general words.
  assert.match(dayVerdicts(area, "2026-07-29").month.intensity, /unusually intense: about 900 VIIRS detections over/);
  // The July before it was an ordinary one.
  assert.equal(dayVerdicts(area, "2025-07-15").month.intensity, null);
});
