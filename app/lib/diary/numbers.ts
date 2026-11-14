// Every number in Hudhud's Fire Diary, worked out from the exported data files, never typed in.
// The files are rebuilt daily (public/data/: areas/nile-delta.json, method.json, findings.json), so
// the game says whatever they say. This module is pure: the caller reads the three files and passes
// them in, so the Next server (lib/diary/load.ts) and scripts/check-diary.mjs share it unchanged.
// Plain TypeScript only (no enums, no namespaces): Node runs this file directly in the checker.

// ---------------------------------------------------------------- the parts of the files we read

type Nullable = number | null;

export type DeltaFile = {
  built_at_utc: string;
  last_full_day: string;
  fit: { model: string; season: number[]; parts: { b: number; g: number; d: number }[] };
  bands: { season_pct: [number, number]; season_errors_pct: number[] };
  seasons: { year: number[]; value: number[]; modis: Nullable[]; viirs: Nullable[]; source: string[] };
  weeks: { week_start: string[] };
  satellites: Record<string, { family: string; days: Nullable[] }>;
};

type ModelScore = { LOYO: { season_err_abs_pct: number }; "out-of-time": { season_err_abs_pct: number } };

export type MethodFile = {
  raw_gap: { rows: { year: number; "NPP/Aqua": Nullable }[] };
  filters: { grid_deg: number; known_gaps: number; counts: { reason: string; n: number }[] };
  satellites: { satellite: string; family: string; first_day: string }[];
  models: { train_years: [number, number]; test_years: [number, number] };
  areas: { id: string; validation: Record<string, ModelScore> }[];
};

type Mean = { years: [number, number]; n: number; mean: number };

export type FindingsFile = {
  ban: {
    ban_year: number;
    verdict: { seasons: string; effect_of_ban: string };
    comparisons: { before: Mean; after: Mean; why: string }[];
  };
  since_2018: { reference_years: [number, number]; recent_years: [number, number] };
  areas: { id: string; numbers: Record<string, unknown> }[];
};

export type DataFiles = { delta: DeltaFile; method: MethodFile; findings: FindingsFile };

// ---------------------------------------------------------------- what the game uses

export type Verdict = "lower" | "usual" | "higher";
export type Ratio = "same" | "half" | "double";

export type DiaryNumbers = {
  builtAt: string;
  lastFullDay: string;
  seasonMonths: number[];
  /** Instrument facts, not data: the pixel sizes of the two sensors (README, sensor specifications). */
  pixel: { modisKm: number; viirsM: number };
  /** Suomi NPP against Aqua fire pixels, Delta autumn: the usual range and the one year far outside it. */
  pixelRatio: { lo: number; hi: number; outlierYear: number | null; outlier: number | null };
  start: { modis: number; viirs: number };
  satelliteCount: number;
  seasons: { first: number; last: number; count: number };
  detections: { kept: number; staticSource: number; lowConfidence: number; leftOut: number };
  gaps: number;
  /** Level 3's real week: a VIIRS satellite switched off while another one flew every day. */
  realWeek: { weekStart: string; off: string; on: string } | null;
  gridDeg: number;
  /** 4.1: raw MODIS in its last year against VIIRS in its first. */
  jump: { modisYear: number; modis: number; viirsYear: number; viirs: number; times: number; translated: number };
  trainYears: [number, number];
  testYears: [number, number];
  /** 4.3 to 4.5: how far off the translator is, in %, raw then each gear (leave one year out). */
  needle: { raw: number; M0: number; M1: number; M2: number; M3: number; M4: number; outOfTime: number };
  model: string;
  /** 4.3: the one magic number, VIIRS over MODIS in the years both flew. */
  magic: { k: number; rounded: number };
  /** 4.4: the signs the gear lines depend on. */
  gears: { b: number; g: number; d: number; heat: "cool" | "hot" };
  hideYear: { year: number; errPct: number }[];
  worst: { year: number; errPct: number };
  doubtBand: [number, number];
  thisYear: { year: number; value: number; rank: number; of: number; lowest: { year: number; value: number }; verdict: Verdict; rankBand: "first" | "among" | "other" };
  since: { recent: [number, number]; reference: [number, number]; recentMean: number; referenceMean: number; ratio: number; answer: Ratio; bounce: { year: number; value: number } };
  ban: { year: number; before: Mean; after: Mean; wentUp: boolean; cantTell: boolean };
  kafr: { season2025: number; season2026: number; referenceMean: number; lastTwoLowest: boolean };
  portugal: { recentMean: number; referenceMean: number; ratio: number };
  chilecito: { detections: number; cells: number };
};

const README_PIXELS = { modisKm: 1, viirsM: 375 };

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const yearOf = (day: string) => Number(day.slice(0, 4));
const percentile = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};
const num = (o: Record<string, unknown>, k: string) => {
  const v = o[k];
  if (typeof v !== "number") throw new Error(`findings: ${k} is not a number`);
  return v;
};
const area = (f: FindingsFile, id: string) => {
  const a = f.areas.find((x) => x.id === id);
  if (!a) throw new Error(`findings: no area ${id}`);
  return a.numbers;
};

export function diaryNumbers({ delta, method, findings }: DataFiles): DiaryNumbers {
  const S = delta.seasons;
  const seasons = S.year.map((year, i) => ({ year, value: S.value[i], modis: S.modis[i], viirs: S.viirs[i], source: S.source[i] }));
  const first = (fam: string) => Math.min(...method.satellites.filter((s) => s.family === fam).map((s) => yearOf(s.first_day)));

  // Fire pixels: the range of most years, and the one year far outside it (2018 in the 13 Nov build).
  const ratios = method.raw_gap.rows.filter((r) => r["NPP/Aqua"] != null).map((r) => ({ year: r.year, x: r["NPP/Aqua"] as number })).sort((a, b) => a.x - b.x);
  const top = ratios[ratios.length - 1], next = ratios[ratios.length - 2];
  const outlier = top.x > next.x * 1.5 ? top : null;
  const usual = outlier ? ratios.slice(0, -1) : ratios;

  const count = (reason: string) => sum(method.filters.counts.filter((c) => c.reason === reason).map((c) => c.n));
  const staticSource = count("static_source") + count("static_source_masked"), lowConfidence = count("low_confidence");

  // A week when one VIIRS satellite was off for all of it, flew again later, and another flew all 7 days.
  const viirs = Object.entries(delta.satellites).filter(([, s]) => s.family === "VIIRS");
  let realWeek: DiaryNumbers["realWeek"] = null;
  for (let i = 1; i < delta.weeks.week_start.length && !realWeek; i++) {
    const off = viirs.find(([, s]) => s.days[i] == null && s.days[i - 1] != null && s.days.slice(i + 1).some((d) => d != null));
    const on = viirs.find(([, s]) => s.days[i] === 7);
    if (off && on) realWeek = { weekStart: delta.weeks.week_start[i], off: off[0], on: on[0] };
  }

  // The fake jump: raw MODIS (seasons.modis, not the translated seasons.value) against VIIRS.
  const lastModis = [...seasons].reverse().find((s) => s.source === "MODIS")!;
  const firstViirs = seasons.find((s) => s.source === "VIIRS" && s.viirs != null)!;

  const [t0, t1] = method.models.train_years;
  const train = seasons.filter((s) => s.year >= t0 && s.year <= t1 && s.viirs != null && s.modis != null);
  const k = sum(train.map((s) => s.viirs as number)) / sum(train.map((s) => s.modis as number));

  const v = method.areas.find((a) => a.id === "nile-delta")?.validation;
  if (!v) throw new Error("method: no validation for nile-delta");
  const loyo = (m: string) => v[m].LOYO.season_err_abs_pct;

  const part = delta.fit.parts[0];
  const hideYear = delta.bands.season_errors_pct.map((errPct, i) => ({ year: t0 + i, errPct }));
  const worst = hideYear.reduce((a, b) => (Math.abs(b.errPct) > Math.abs(a.errPct) ? b : a));

  // This year against the others: its rank from the lowest, and lower or higher than the middle half.
  const now = seasons[seasons.length - 1], others = seasons.slice(0, -1).map((s) => s.value);
  const rank = 1 + others.filter((x) => x < now.value).length;
  const lowest = seasons.reduce((a, b) => (b.value < a.value ? b : a));
  const verdict: Verdict = now.value < percentile(others, 0.25) ? "lower" : now.value > percentile(others, 0.75) ? "higher" : "usual";

  const mean = (y0: number, y1: number) => { const x = seasons.filter((s) => s.year >= y0 && s.year <= y1).map((s) => s.value); return sum(x) / x.length; };
  const { recent_years: recent, reference_years: reference } = findings.since_2018;
  const recentMean = mean(...recent), referenceMean = mean(...reference), ratio = recentMean / referenceMean;
  const near = (x: number) => Math.abs(Math.log(ratio / x));
  const answer: Ratio = near(1) < near(0.5) && near(1) < near(2) ? "same" : near(0.5) < near(2) ? "half" : "double";
  const bounce = seasons.filter((s) => s.year > recent[0] && s.year <= recent[1]).reduce((a, b) => (b.value > a.value ? b : a));

  const ban = findings.ban, cut = ban.comparisons.find((c) => c.why.startsWith("every later season that is also converted")) ?? ban.comparisons[0];

  const kafr = area(findings, "kafr-el-sheikh-rice-core"), kafrNext = kafr.next_lowest as { value: number };
  const pt = area(findings, "portugal-mainland"), ch = area(findings, "chilecito");

  return {
    builtAt: delta.built_at_utc,
    lastFullDay: delta.last_full_day,
    seasonMonths: delta.fit.season,
    pixel: README_PIXELS,
    pixelRatio: { lo: Math.floor(usual[0].x), hi: Math.round(usual[usual.length - 1].x), outlierYear: outlier?.year ?? null, outlier: outlier ? Math.round(outlier.x) : null },
    start: { modis: first("MODIS"), viirs: first("VIIRS") },
    satelliteCount: method.satellites.length,
    seasons: { first: seasons[0].year, last: now.year, count: seasons.length },
    detections: { kept: count("kept"), staticSource, lowConfidence, leftOut: staticSource + lowConfidence },
    gaps: method.filters.known_gaps,
    realWeek,
    gridDeg: method.filters.grid_deg,
    jump: { modisYear: lastModis.year, modis: lastModis.modis as number, viirsYear: firstViirs.year, viirs: firstViirs.viirs as number, times: Math.round((firstViirs.viirs as number) / (lastModis.modis as number)), translated: lastModis.value },
    trainYears: method.models.train_years,
    testYears: method.models.test_years,
    needle: { raw: loyo("raw"), M0: loyo("M0"), M1: loyo("M1"), M2: loyo("M2"), M3: loyo("M3"), M4: loyo("M4"), outOfTime: v.M4["out-of-time"].season_err_abs_pct },
    model: delta.fit.model,
    magic: { k, rounded: Math.round(k) },
    gears: { b: part.b, g: part.g, d: part.d, heat: part.d < 0 ? "cool" : "hot" },
    hideYear,
    worst,
    doubtBand: delta.bands.season_pct,
    thisYear: { year: now.year, value: now.value, rank, of: seasons.length, lowest: { year: lowest.year, value: lowest.value }, verdict, rankBand: rank === 1 ? "first" : rank <= 3 ? "among" : "other" },
    since: { recent, reference, recentMean, referenceMean, ratio, answer, bounce: { year: bounce.year, value: bounce.value } },
    ban: { year: ban.ban_year, before: cut.before, after: cut.after, wentUp: ban.verdict.seasons === "higher_after", cantTell: ban.verdict.effect_of_ban === "cannot_tell" },
    kafr: { season2025: num(kafr, "season_2025"), season2026: num(kafr, "season_2026"), referenceMean: num(kafr, "reference_mean"), lastTwoLowest: Math.max(num(kafr, "season_2025"), num(kafr, "season_2026")) < kafrNext.value },
    portugal: { recentMean: num(pt, "recent_mean"), referenceMean: num(pt, "reference_mean"), ratio: num(pt, "recent_mean") / num(pt, "reference_mean") },
    chilecito: { detections: num(ch, "viirs_detections"), cells: num(ch, "grid_cells") },
  };
}

// ---------------------------------------------------------------- numbers as the game writes them

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A whole number a child reads as a word: "ten". Above twenty, figures. */
export const inWords = (n: number) => (Number.isInteger(n) && n >= 0 && n <= 20 ? WORDS[n] : n.toLocaleString("en-GB"));
/** A share as a child says it. */
export const shareWords = (r: number) => (r < 0.4 ? "less than half" : r < 0.6 ? "about half" : r < 0.85 ? "a bit less" : r < 1.2 ? "about the same" : r < 1.7 ? "a bit more" : r < 2.5 ? "about double" : "more than double");
const millions = (n: number) => (n / 1e6).toFixed(1);
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export type Fill = { value: string; kind: "number" | "name"; from: string };

/** Every placeholder a line may use, as {name}. Write {Name} to capitalise the first letter. */
export function placeholders(n: DiaryNumbers): Record<string, Fill> {
  const N = (value: string | number, from: string): Fill => ({ value: String(value), kind: "number", from });
  const range = ([a, b]: [number, number]) => `${a} to ${b}`;
  const week = n.realWeek ? `${MONTHS[Number(n.realWeek.weekStart.slice(5, 7)) - 1]} ${n.realWeek.weekStart.slice(0, 4)}` : "";
  return {
    modisStart: N(n.start.modis, "method.json satellites: first MODIS day"),
    viirsStart: N(n.start.viirs, "method.json satellites: first VIIRS day"),
    satelliteWord: N(inWords(n.satelliteCount), "method.json satellites: how many"),
    seasonCount: N(n.seasons.count, "nile-delta.json seasons: how many"),
    realWeek: N(week, "nile-delta.json satellites: a VIIRS satellite off a whole week"),
    timesWord: N(inWords(n.jump.times), `nile-delta.json seasons: VIIRS ${n.jump.viirsYear} over raw MODIS ${n.jump.modisYear}`),
    magic: N(n.magic.rounded, "nile-delta.json seasons: VIIRS over MODIS in the training years"),
    model: { value: n.model, kind: "name", from: "nile-delta.json fit.model" },
    worstYear: N(n.worst.year, "nile-delta.json bands.season_errors_pct: the largest"),
    testYears: N(range(n.testYears), "method.json models.test_years"),
    banYear: N(n.ban.year, "findings.json ban.ban_year"),
    banBeforeWord: N(inWords(n.ban.before.n), "findings.json ban: seasons before"),
    sinceShare: N(shareWords(n.since.ratio), "nile-delta.json seasons: recent mean over reference mean"),
    bounceYear: N(n.since.bounce.year, "nile-delta.json seasons: the highest recent season"),
    portugalShare: N(shareWords(n.portugal.ratio), "findings.json portugal-mainland: recent over reference"),
    chilecitoCells: N(n.chilecito.cells, "findings.json chilecito.grid_cells"),
    // grown-up notes
    modisKm: N(n.pixel.modisKm, "README: MODIS pixel size"),
    viirsM: N(n.pixel.viirsM, "README: VIIRS pixel size"),
    pixelRange: N(`${n.pixelRatio.lo} to ${n.pixelRatio.hi}`, "method.json raw_gap: Suomi NPP over Aqua, most years"),
    keptMillions: N(millions(n.detections.kept), "method.json filters.counts: kept"),
    leftOutMillions: N(millions(n.detections.leftOut), "method.json filters.counts: static sources and low confidence"),
    gaps: N(n.gaps, "method.json filters.known_gaps"),
    gridDeg: N(n.gridDeg, "method.json filters.grid_deg"),
    loyoPct: N(Math.round(n.needle.M4), "method.json validation: M4, leave one year out"),
    outOfTimePct: N(Math.round(n.needle.outOfTime), "method.json validation: M4, out of time"),
    chilecitoDots: N(`about ${roundTo(n.chilecito.detections, 100)}`, "findings.json chilecito.viirs_detections"),
    recentFrom: N(n.since.recent[0], "findings.json since_2018.recent_years"),
    recentMean: N(Math.round(n.since.recentMean).toLocaleString("en-GB"), "nile-delta.json seasons: mean of the recent years"),
    referenceMean: N(Math.round(n.since.referenceMean).toLocaleString("en-GB"), "nile-delta.json seasons: mean of the reference years"),
    referenceYears: N(range(n.since.reference), "findings.json since_2018.reference_years"),
    sincePct: N(Math.round((1 - n.since.ratio) * 100), "nile-delta.json seasons: recent against reference"),
  };
}

/** Which version of a data-dependent line the game uses (Variants.pick in script.ts). */
export function picks(n: DiaryNumbers): Record<string, string> {
  return { heat: n.gears.heat, thisYear: n.thisYear.rankBand };
}

/** The claims the script makes that the data could take back. The checker fails if one no longer holds. */
export function claims(n: DiaryNumbers): { claim: string; holds: boolean }[] {
  return [
    { claim: "VIIRS is about ten times MODIS at the jump (4.1 labels)", holds: n.jump.times >= 5 },
    { claim: "Quiet weeks: tiny fires matter more (M1 power b below 1)", holds: n.gears.b < 1 },
    { claim: "Busy years have more tiny fires (M4 g above 0)", holds: n.gears.g > 0 },
    { claim: "The translator gets closer with each gear (4.4)", holds: n.needle.raw > n.needle.M0 && n.needle.M0 > n.needle.M1 && n.needle.M1 > n.needle.M2 && n.needle.M2 > n.needle.M3 && n.needle.M3 > n.needle.M4 },
    { claim: "This autumn is lower than usual (5.1's right answer)", holds: n.thisYear.verdict === "lower" && n.thisYear.rankBand !== "other" },
    { claim: "Since 2018, about half the burning (5.2's right answer)", holds: n.since.answer === "half" },
    { claim: "After the ban the fires seen went up (5.3)", holds: n.ban.wentUp },
    { claim: "The diary can't tell what the ban did (5.3)", holds: n.ban.cantTell },
    { claim: "Kafr El Sheikh: the last two autumns are the quietest VIIRS has seen (5.5)", holds: n.kafr.lastTwoLowest },
    { claim: "Portugal: less than half the burning (5.5)", holds: n.portugal.ratio < 0.5 },
    { claim: "Level 3 has a real week with one VIIRS satellite off", holds: n.realWeek != null },
  ];
}
