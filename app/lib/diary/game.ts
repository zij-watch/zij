// What the game receives from the server: its words, already filled, and the few small series it
// draws. Types and pure helpers only, safe in the browser. Built by readDiaryData (lib/diary/load.ts).

export type Season = { year: number; value: number; lo: number; hi: number; modis: number | null; viirs: number | null; source: "MODIS" | "VIIRS" };

export type GameData = {
  lines: Record<string, string>;
  notes: Record<string, string>;
  /** who says each spoken line */
  speakers: Record<string, "hudhud" | "modis" | "viirs">;
  runningHead: string[];
  seasons: Season[];
  jump: { modisYear: number; viirsYear: number };
  train: [number, number];
  test: [number, number];
  /** How far off, in %: raw, then each gear, then on the years it never saw. */
  needle: { raw: number; M0: number; M1: number; M2: number; M3: number; M4: number; outOfTime: number };
  /** 4.3: the season error of k times MODIS against VIIRS over the training years, for each k. */
  kCurve: { k: number; err: number }[];
  magic: number;
  heat: "cool" | "hot";
  /** 4.5: each training year hidden in turn: the translator's guess and how far off it was. */
  hide: { year: number; viirs: number; guess: number; errPct: number }[];
  worstYear: number;
  testCounts: { year: number; viirs: number }[];
  thisYear: { year: number; verdict: "lower" | "usual" | "higher" };
  since: { reference: [number, number]; recent: [number, number]; referenceMean: number; recentMean: number; answer: "same" | "half" | "double"; bounceYear: number };
  ban: { year: number; before: [number, number]; after: [number, number]; beforeMean: number; afterMean: number };
  realWeek: { off: string; on: string } | null;
  /** 5.5: an engraved globe: land as one path, the three pins, and Kafr El Sheikh's own diary. */
  globe: { size: number; land: string; graticule: string; pins: { id: "kafr" | "portugal" | "chilecito"; x: number; y: number }[] };
  kafr: { year: number; value: number; source: "MODIS" | "VIIRS" }[];
};

/** Where an error sits on the how-close scale: 0 far off (about 100%), 1 spot on (about 5%). */
export function closeness(errPct: number): number {
  const e = Math.max(1, Math.abs(errPct));
  return Math.min(1, Math.max(0, 1 - Math.log(e / 5) / Math.log(100 / 5)));
}

/** The error of k times MODIS for any k, read off the curve. */
export function errAt(curve: GameData["kCurve"], k: number): number {
  if (k <= curve[0].k) return curve[0].err;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (k <= b.k) return a.err + ((b.err - a.err) * (k - a.k)) / (b.k - a.k);
  }
  return curve[curve.length - 1].err;
}

export const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
