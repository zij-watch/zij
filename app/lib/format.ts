import type { Area, Flag, Source } from "./data";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The unit as people read it. Its exact definition is one hover or one tab away (UnitTerm in components/ui.tsx). */
export const UNIT = "fire activity";
export const UNIT_EXACT =
  "Fire activity is counted in hotspot-days, VIIRS-equivalent: a 0.1° cell of the map that burns on a day counts once for each satellite, " +
  "the count is averaged over the satellites flying, and the MODIS years are converted to what VIIRS would have counted.";
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function num(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "–";
  return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "78% below normal", "2.4 times normal", "close to normal". */
export function againstNormal(value: number, normal: number): string {
  if (!(normal > 0)) return value > 0 ? "above normal (normal is zero)" : "normal";
  const pct = (100 * (value - normal)) / normal;
  if (Math.abs(pct) < 5) return "close to normal";
  if (pct >= 100) return `${num(value / normal, 1)} times normal`;
  return `${num(Math.abs(pct))}% ${pct > 0 ? "above" : "below"} normal`;
}

export function sourceWords(source: Source): string {
  if (source === "VIIRS") return "measured by VIIRS";
  if (source === "MODIS") return "converted from MODIS";
  if (source === "mixed") return "part VIIRS, part converted from MODIS";
  return "no value";
}

export function flagWords(flag: Flag): string {
  return flag === "high" ? "unusually high" : flag === "low" ? "unusually low" : "";
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM of the first and last month an area has data for. */
export function monthSpan(area: Area): [string, string] {
  const m = area.months;
  const ym = (i: number) => `${m.year[i]}-${String(m.month[i]).padStart(2, "0")}`;
  return [ym(0), ym(m.year.length - 1)];
}

export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
