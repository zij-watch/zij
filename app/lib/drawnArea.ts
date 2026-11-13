// Drawn areas: from a box or polygon to the same document a preset has.
// The work is done by lib/fit (see its README). This file loads what it needs, lazily:
// the cell index when drawing starts, and a country's cell file the first time a shape falls in it.

import { versioned } from "./version";
import type { Area } from "./data";
import { fetchData } from "./download";
import { boundsOf, countriesFor, decodeCells, type Cells, type CellsIndex, type Shape } from "./fit/cells";
import { fitDrawnArea } from "./fit/drawn";
import { areaDocument } from "./fit/panel";

export type DrawnResult =
  | { status: "ok"; area: Area; country: string; draft: boolean }
  | { status: "outside" | "two-countries" | "too-big"; countries: string[] };

/** Timing of the last drawn-area fit, in milliseconds. */
export let lastTiming: { country: string; cells: number; draft: boolean; fit_ms: number; document_ms: number } | null = null;

/** The regions drawn areas can be in. */
export const COVERED = "Egypt, mainland Portugal and Argentina";

let indexPromise: Promise<CellsIndex> | null = null;
export function loadCellsIndex(): Promise<CellsIndex> {
  indexPromise ??= fetch(versioned("/data/cells/index.json")).then((response) => {
    if (!response.ok) throw new Error(`Could not load the cell index (${response.status})`);
    return response.json() as Promise<CellsIndex>;
  });
  return indexPromise;
}

const files = new Map<string, Promise<Cells>>();
function cellsOf(index: CellsIndex, country: string): Promise<Cells> {
  let promise = files.get(country);
  if (!promise) {
    const file = index.countries[country];
    promise = fetchData(`/data/${file.file}`, `the cells of ${country}`, file.bytes).then(decodeCells);
    promise.catch(() => files.delete(country)); // a failed download can be tried again
    files.set(country, promise);
  }
  return promise;
}

/** True when the country's cell file is already in memory, so a fit can run at once. */
export function isLoaded(country: string): boolean {
  return files.has(country);
}

function nameOf(shape: Shape): string {
  const [w, s, e, n] = boundsOf(shape);
  const lat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "S" : "N"}`;
  const lon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? "W" : "E"}`;
  return `${Array.isArray(shape) ? "Drawn box" : "Drawn polygon"}, ${lat(s)} to ${lat(n)}, ${lon(w)} to ${lon(e)}`;
}

/**
 * Fit a drawn shape. `draft` is for while the shape is still being dragged:
 * it skips the bands (nine extra fits) so the panel can follow the pointer.
 */
export async function resolveDrawn(shape: Shape, draft = false): Promise<DrawnResult> {
  const index = await loadCellsIndex();
  const countries = countriesFor(index, shape);
  if (countries.length === 0) return { status: "outside", countries };
  if (countries.length > 1) return { status: "two-countries", countries };
  const [country] = countries;
  const cells = await cellsOf(index, country);
  const started = performance.now();
  const fitted = fitDrawnArea(cells, index, country, shape, draft ? { bands: false } : {});
  const fitMs = performance.now() - started;
  const doc = areaDocument(fitted, index, { id: "drawn", name: nameOf(shape) });
  // How long the fit and the document took, for anyone checking the main thread (see DECISIONS.md).
  lastTiming = { country, cells: doc.n_cells, draft, fit_ms: Math.round(fitMs), document_ms: Math.round(performance.now() - started - fitMs) };
  (globalThis as { __zijTiming?: typeof lastTiming }).__zijTiming = lastTiming;
  return { status: "ok", area: doc as unknown as Area, country, draft };
}
