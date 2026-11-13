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
//   year, or the same calendar month, in every other year that has it.
// - The percentile is stated with the number of years and their span. For a week or a month it is
//   exact (the share of the other years at or under the value, ties counted half). For "this month
//   so far" the area file holds five percentiles of the past years, not each year, so the
//   percentile is read between them and stated as "about", or as "under the 10th" / "over the 90th".
// - No verdict where the area has no fit (fit mode "none"), where the value is missing, or where
//   fewer than 5 years can be compared.

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

export interface Verdict {
  level: Level;
  badge: string; // "Below normal"
  sentence: string;
}

const MIN_YEARS = 5;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const badge = (level: Level) => LEVEL_WORDS[level][0].toUpperCase() + LEVEL_WORDS[level].slice(1);

function levelFrom(value: number, p10: number, p25: number, p75: number, p90: number): Level {
  if (value > p90) return "far-above";
  if (value > p75) return "above";
  if (value < p10) return "far-below";
  if (value < p25) return "below";
  return "normal";
}

function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** A value against the same period of other years: the level and the exact percentile. */
function rank(value: number, others: number[]): { level: Level; percentile: number } | null {
  if (others.length < MIN_YEARS) return null;
  const sorted = [...others].sort((a, b) => a - b);
  const under = sorted.filter((v) => v < value).length, same = sorted.filter((v) => v === value).length;
  return {
    level: levelFrom(value, quantile(sorted, 0.1), quantile(sorted, 0.25), quantile(sorted, 0.75), quantile(sorted, 0.9)),
    percentile: Math.round((100 * (under + same / 2)) / sorted.length),
  };
}

const span = (years: number[]) => `${Math.min(...years)} to ${Math.max(...years)}`;

/** "the 83rd percentile of the 24 other years", or plainly "more than in any of them". */
function among(percentile: number, value: number, others: number[]): string {
  if (others.every((v) => v < value)) return `more than in any of the ${others.length} other years`;
  if (others.every((v) => v > value)) return `less than in any of the ${others.length} other years`;
  return `the ${ordinal(percentile)} percentile of the ${others.length} other years`;
}

/** The area's opening verdict: this month so far, against the same days of the past years. */
export function areaVerdict(area: Area): Verdict | null {
  if (area.fit.mode === "none") return null;
  const t = area.this_month as Area["this_month"] & { p10_to_date?: number | null; p90_to_date?: number | null };
  const { value_to_date: value, median_to_date: median, p25_to_date: p25, p75_to_date: p75, p10_to_date: p10, p90_to_date: p90 } = t;
  if (value === null || median === undefined || p25 === undefined || p75 === undefined || p10 == null || p90 == null || t.baseline_n < MIN_YEARS) return null;
  const level = levelFrom(value, p10, p25, p75, p90);
  // Read the percentile between the five known ones.
  const knots: [number, number][] = [[p10, 10], [p25, 25], [median, 50], [p75, 75], [p90, 90]];
  let where: string;
  if (value < p10) where = "under the 10th percentile";
  else if (value > p90) where = "over the 90th percentile";
  else {
    let pct = 50;
    for (let k = 0; k + 1 < knots.length; k++) {
      const [a, pa] = knots[k], [b, pb] = knots[k + 1];
      if (value >= a && value <= b) { pct = b > a ? pa + ((pb - pa) * (value - a)) / (b - a) : (pa + pb) / 2; break; }
    }
    where = `about the ${ordinal(Math.round(pct))} percentile`;
  }
  const [b0, b1] = area.climatology.baseline_years;
  const month = MONTHS[t.month - 1];
  return {
    level,
    badge: badge(level),
    sentence: `${month} ${t.year} so far is ${LEVEL_WORDS[level]} here: ${num(value, 1)} in its first ${t.days_so_far} days, against a median of ${num(median, 1)} for the same days. That is ${where} of the ${t.baseline_n} years ${b0} to ${b1}.`,
  };
}

/** A chosen day: the verdicts of the week and of the month that hold it. */
export function dayVerdicts(area: Area, date: string): { week: Verdict | null; month: Verdict | null } {
  if (area.fit.mode === "none") return { week: null, month: null };
  const out: { week: Verdict | null; month: Verdict | null } = { week: null, month: null };

  // The week: its Monday is the last week_start on or before the day.
  const w = area.weeks;
  let i = -1;
  for (let k = 0; k < w.week_start.length && w.week_start[k] <= date; k++) i = k;
  if (i >= 0 && Date.parse(date) - Date.parse(w.week_start[i]) <= 6 * 86400000 && w.value[i] !== null && !w.is_partial[i]) {
    const years: number[] = [], values: number[] = [];
    w.iso_week.forEach((iso, k) => {
      if (k !== i && iso === w.iso_week[i] && w.value[k] !== null && !w.is_partial[k]) { years.push(w.year[k]); values.push(w.value[k] as number); }
    });
    const r = rank(w.value[i] as number, values);
    if (r) {
      const sorted = [...values].sort((a, b) => a - b);
      out.week = {
        level: r.level,
        badge: badge(r.level),
        sentence: `Its week (from ${w.week_start[i]}) was ${LEVEL_WORDS[r.level]}: ${num(w.value[i] as number, 1)} against a median of ${num(quantile(sorted, 0.5), 1)} for the same week of the year, ${among(r.percentile, w.value[i] as number, values)}, ${span(years)}.`,
      };
    }
  }

  // The month: whole months against whole months. The running month uses the same days of past years.
  const m = area.months;
  const year = Number(date.slice(0, 4)), monthNumber = Number(date.slice(5, 7));
  const j = m.year.findIndex((y, k) => y === year && m.month[k] === monthNumber);
  if (j >= 0 && m.value[j] !== null) {
    if (!m.complete[j]) {
      const running = area.this_month.year === year && area.this_month.month === monthNumber ? areaVerdict(area) : null;
      out.month = running && { ...running, sentence: running.sentence.replace(" here:", ":") };
    } else {
      const years: number[] = [], values: number[] = [];
      m.month.forEach((mo, k) => {
        if (k !== j && mo === monthNumber && m.complete[k] && m.value[k] !== null) { years.push(m.year[k]); values.push(m.value[k] as number); }
      });
      const r = rank(m.value[j] as number, values);
      if (r) {
        const sorted = [...values].sort((a, b) => a - b);
        out.month = {
          level: r.level,
          badge: badge(r.level),
          sentence: `Its month, ${MONTHS[monthNumber - 1]} ${year}, was ${LEVEL_WORDS[r.level]}: ${num(m.value[j] as number, 1)} against a median ${MONTHS[monthNumber - 1]} of ${num(quantile(sorted, 0.5), 1)}, ${among(r.percentile, m.value[j] as number, values)}, ${span(years)}.`,
        };
      }
    }
  }
  return out;
}
