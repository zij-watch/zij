// The verdict: one plain sentence and a badge that say how a period compares with the same
// period in the other years of the record. The rules (also in docs/event/DECISIONS.md):
//
//   badge         where the value falls among the comparison years
//   far below     under their 10th percentile
//   below         from the 10th to under the 25th
//   normal        from the 25th to the 75th
//   above         over the 75th up to the 90th
//   far above     over the 90th
//
// - The comparison is always like with like: the same days of the month, the same week of the
//   year, or the same calendar month, in every other year that has it. Years recorded by Terra
//   alone (before Aqua) are compared like any other: their values are already corrected.
// - Every verdict states an exact rank and percentile, with the number of years and their span:
//   "3rd lowest of 26 years, 2001 to 2026, the 8th percentile". The rank counts the year itself;
//   the percentile is the share of the other years under the value, ties counted half.
// - The percentiles that set the badge are interpolated the way the pipeline does (numpy's default).
// - Beside the verdict, an intensity line when a month is unusually intense for the area. The unit
//   counts places and days with fire, so one fierce fire in a few cells can read as "normal". The
//   measure is the month's VIIRS detections per VIIRS fire cell-day; it is unusual when it is over
//   the 90th percentile of the same calendar month in the other VIIRS years (5 or more of them,
//   and 30 or more detections). Mean fire radiative power is not in the area files, so it is not used.
// - No verdict where the area has no fit (fit mode "none"), where the value is missing, or where
//   fewer than 5 other years can be compared.

import type { Area } from "./data";
import { MONTHS, num } from "./format";

export type Level = "far-below" | "below" | "normal" | "above" | "far-above";
export const LEVEL_WORDS: Record<Level, string> = {
  "far-below": "far below normal",
  below: "below normal",
  normal: "normal",
  above: "above normal",
  "far-above": "far above normal",
};

const badge = (level: Level) => LEVEL_WORDS[level][0].toUpperCase() + LEVEL_WORDS[level].slice(1);

export interface Verdict {
  level: Level;
  badge: string; // "Below normal"
  percentile: number; // 0 to 100, exact
  rank: string; // "3rd lowest of 26 years"
  sentence: string;
  intensity?: string | null; // "Above normal in spread, unusually intense: about 900 detections in 8 cells."
}

/** A named fire from findings.json: its days, its VIIRS detections and the grid cells it burned in. */
export interface FireNote { fire_days: [string, string]; viirs_detections: number; grid_cells: number }

/** "about 900": a count as people say it. */
export const approx = (n: number) => (n >= 100 ? Math.round(n / 100) * 100 : n >= 20 ? Math.round(n / 10) * 10 : Math.round(n));

export const MIN_DETECTIONS = 30;

/**
 * The intensity line for a calendar month, or null when the month is not unusually intense.
 * `level` is the activity verdict it stands beside; `fire` gives the words for a named fire.
 */
export function monthIntensity(area: Area, year: number, month: number, level: Level, fire?: FireNote | null): string | null {
  const w = area.weeks as Area["weeks"] & { viirs_hotspots: (number | null)[]; viirs: (number | null)[]; month: number[] };
  if (!w.viirs_hotspots || !w.viirs || !w.month) return null; // an area file without the raw counts
  const detections = new Map<number, number>(), cellDays = new Map<number, number>();
  for (let i = 0; i < w.year.length; i++) {
    const d = w.viirs_hotspots[i], c = w.viirs[i];
    if (w.month[i] !== month || d === null || d === undefined || c === null || c === undefined) continue;
    detections.set(w.year[i], (detections.get(w.year[i]) ?? 0) + d);
    cellDays.set(w.year[i], (cellDays.get(w.year[i]) ?? 0) + c);
  }
  const d = detections.get(year) ?? 0, c = cellDays.get(year) ?? 0;
  if (d < MIN_DETECTIONS || !(c > 0)) return null;
  const others = [...cellDays.keys()].filter((y) => y !== year && (cellDays.get(y) as number) > 0).map((y) => (detections.get(y) as number) / (cellDays.get(y) as number));
  if (others.length < MIN_YEARS) return null;
  const sorted = others.sort((a, b) => a - b);
  const ratio = d / c;
  if (!(ratio > quantile(sorted, 0.9))) return null;
  const usual = quantile(sorted, 0.5);
  const named = fire && fire.fire_days[0].slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`;
  const what = named
    ? `about ${num(approx(fire.viirs_detections))} detections in ${fire.grid_cells} cells`
    : `about ${num(approx(d))} VIIRS detections over ${num(c)} cell-days${usual > 0 ? `, ${num(ratio / usual, 1)} times the usual for ${MONTHS[month - 1]} here` : ""}`;
  return `${badge(level)} in spread, unusually intense: ${what}.`;
}

export const MIN_YEARS = 5;
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

export function levelFrom(value: number, p10: number, p25: number, p75: number, p90: number): Level {
  if (value > p90) return "far-above";
  if (value > p75) return "above";
  if (value < p10) return "far-below";
  if (value < p25) return "below";
  return "normal";
}

export function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

export interface Standing { level: Level; percentile: number; rank: string; median: number; n: number }

/** A value against the same period of the other years: its level, exact percentile and rank. */
export function standing(value: number, others: number[]): Standing | null {
  if (others.length < MIN_YEARS) return null;
  const sorted = [...others].sort((a, b) => a - b);
  const under = sorted.filter((v) => v < value).length, over = sorted.filter((v) => v > value).length, same = sorted.length - under - over;
  const total = sorted.length + 1; // the year itself is one of the years ranked
  const place = (n: number, word: string) => (n === 1 ? `the ${word}` : `${ordinal(n)} ${word}`);
  return {
    level: levelFrom(value, quantile(sorted, 0.1), quantile(sorted, 0.25), quantile(sorted, 0.75), quantile(sorted, 0.9)),
    percentile: Math.round((100 * (under + same / 2)) / sorted.length),
    // Ranked from the nearer end, so the rank is never a big number.
    rank: `${under <= over ? place(under + 1, "lowest") : place(over + 1, "highest")} of ${total} years`,
    median: quantile(sorted, 0.5),
    n: sorted.length,
  };
}

const span = (years: number[]) => `${Math.min(...years)} to ${Math.max(...years)}`;
const make = (s: Standing, sentence: string): Verdict => ({ level: s.level, badge: badge(s.level), percentile: s.percentile, rank: s.rank, sentence });

/** The area's opening verdict: this month so far, against the same days of the past years. */
export function areaVerdict(area: Area, fire?: FireNote | null): Verdict | null {
  if (area.fit.mode === "none") return null;
  const t = area.this_month;
  if (t.value_to_date === null) return null;
  if (!t.to_date_values || !t.to_date_years) return olderFile(area);
  const s = standing(t.value_to_date, t.to_date_values);
  if (!s) return null;
  const years = [...t.to_date_years, t.year];
  return withIntensity(area, t.year, t.month, fire, make(s, `${MONTHS[t.month - 1]} ${t.year} so far is ${LEVEL_WORDS[s.level]} here: ${num(t.value_to_date, 1)} in its first ${t.days_so_far} days, ` +
    `against a median of ${num(s.median, 1)} for the same days. That is ${s.rank}, ${span(years)}, the ${ordinal(s.percentile)} percentile.`));
}

function withIntensity(area: Area, year: number, month: number, fire: FireNote | null | undefined, verdict: Verdict): Verdict {
  return { ...verdict, intensity: monthIntensity(area, year, month, verdict.level, fire) };
}

/**
 * An area file made before each year's value was exported (a browser may hold one for a day):
 * the badge is the same, from the file's five percentiles, and the percentile is read between
 * them and worded "about". No rank can be stated.
 */
function olderFile(area: Area): Verdict | null {
  const t = area.this_month;
  const { value_to_date: value, median_to_date: median, p25_to_date: p25, p75_to_date: p75, p10_to_date: p10, p90_to_date: p90 } = t;
  if (value === null || median === undefined || p25 === undefined || p75 === undefined || p10 === undefined || p90 === undefined || t.baseline_n < MIN_YEARS) return null;
  const level = levelFrom(value, p10, p25, p75, p90);
  const knots: [number, number][] = [[p10, 10], [p25, 25], [median, 50], [p75, 75], [p90, 90]];
  let pct = value < p10 ? 5 : value > p90 ? 95 : 50;
  for (let k = 0; k + 1 < knots.length; k++) {
    const [lo, plo] = knots[k], [hi, phi] = knots[k + 1];
    if (value >= lo && value <= hi) { pct = hi > lo ? plo + ((phi - plo) * (value - lo)) / (hi - lo) : (plo + phi) / 2; break; }
  }
  const where = value < p10 ? "under the 10th percentile" : value > p90 ? "over the 90th percentile" : `about the ${ordinal(Math.round(pct))} percentile`;
  const [b0, b1] = area.climatology.baseline_years;
  return {
    level, badge: badge(level), percentile: Math.round(pct), rank: "",
    sentence: `${MONTHS[t.month - 1]} ${t.year} so far is ${LEVEL_WORDS[level]} here: ${num(value, 1)} in its first ${t.days_so_far} days, against a median of ${num(median, 1)} for the same days. That is ${where} of the ${t.baseline_n} years ${b0} to ${b1}.`,
  };
}

/** A chosen day: the verdicts of the week and of the month that hold it. */
export function dayVerdicts(area: Area, date: string, fire?: FireNote | null): { week: Verdict | null; month: Verdict | null } {
  const out: { week: Verdict | null; month: Verdict | null } = { week: null, month: null };
  if (area.fit.mode === "none") return out;

  // The week: its Monday is the last week_start on or before the day. Partial weeks are left out.
  const w = area.weeks;
  let i = -1;
  for (let k = 0; k < w.week_start.length && w.week_start[k] <= date; k++) i = k;
  if (i >= 0 && Date.parse(date) - Date.parse(w.week_start[i]) <= 6 * 86400000 && w.value[i] !== null && !w.is_partial[i]) {
    const years: number[] = [], values: number[] = [];
    w.iso_week.forEach((iso, k) => {
      if (k !== i && iso === w.iso_week[i] && w.value[k] !== null && !w.is_partial[k]) { years.push(w.year[k]); values.push(w.value[k] as number); }
    });
    const s = standing(w.value[i] as number, values);
    if (s) {
      out.week = make(s, `Its week (from ${w.week_start[i]}) was ${LEVEL_WORDS[s.level]}: ${num(w.value[i] as number, 1)} against a median of ${num(s.median, 1)} ` +
        `for the same week of the year. That is ${s.rank}, ${span([...years, w.year[i]])}, the ${ordinal(s.percentile)} percentile.`);
    }
  }

  // The month: whole months against whole months. The running month uses the same days of past years.
  const m = area.months;
  const year = Number(date.slice(0, 4)), monthNumber = Number(date.slice(5, 7));
  const j = m.year.findIndex((y, k) => y === year && m.month[k] === monthNumber);
  if (j >= 0 && m.value[j] !== null) {
    if (!m.complete[j]) {
      const running = area.this_month.year === year && area.this_month.month === monthNumber ? areaVerdict(area, fire) : null;
      out.month = running && { ...running, sentence: running.sentence.replace(" here:", ":") };
    } else {
      const years: number[] = [], values: number[] = [];
      m.month.forEach((mo, k) => {
        if (k !== j && mo === monthNumber && m.complete[k] && m.value[k] !== null) { years.push(m.year[k]); values.push(m.value[k] as number); }
      });
      const s = standing(m.value[j] as number, values);
      if (s) {
        out.month = withIntensity(area, year, monthNumber, fire, make(s, `Its month, ${MONTHS[monthNumber - 1]} ${year}, was ${LEVEL_WORDS[s.level]}: ${num(m.value[j] as number, 1)} against a median ${MONTHS[monthNumber - 1]} of ${num(s.median, 1)}. ` +
          `That is ${s.rank}, ${span([...years, year])}, the ${ordinal(s.percentile)} percentile.`));
      }
    }
  }
  return out;
}
