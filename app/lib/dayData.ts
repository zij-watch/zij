// The day view and the hotspots download: single hotspots, loaded lazily.
// The work is done by lib/hotspots (see its README). Nothing is fetched until a day is
// chosen or the hotspots CSV is asked for, and then only the region the area is in.

import type { Area } from "./data";
import type { Shape } from "./fit/cells";
import type { AreaDocument } from "./fit/panel";
import { dayView, type DayView } from "./hotspots/day";
import { createHotspotLoader, hotspotsCsv, selectHotspots, type HotspotIndex, type HotspotLoader } from "./hotspots/hotspots";

let session: Promise<{ index: HotspotIndex; loader: HotspotLoader }> | null = null;
function hotspotSession() {
  session ??= fetch("/data/hotspots/index.json").then(async (response) => {
    if (!response.ok) throw new Error(`Could not load the hotspot index (${response.status})`);
    const index = (await response.json()) as HotspotIndex;
    return { index, loader: createHotspotLoader(index) };
  });
  return session;
}

/** The shape of an area: its polygon if it was drawn as one, else its box. */
export function shapeOf(area: Area): Shape {
  return (area.polygon ?? area.box) as Shape;
}

export type DayResult = { covered: boolean; view: DayView };

/** One day of an area. `covered` is false where single hotspots are not shipped. */
export async function loadDay(area: Area, date: string): Promise<DayResult> {
  const { index, loader } = await hotspotSession();
  const { files, covered } = await loader.load(shapeOf(area), date, date);
  return { covered, view: dayView(files, index, area as unknown as AreaDocument, date) };
}

/** The hotspots CSV of an area and date range, or null where hotspots are not shipped. */
export async function hotspotsCsvFor(area: Area, from: string, to: string): Promise<{ csv: string; rows: number } | null> {
  const { index, loader } = await hotspotSession();
  const shape = shapeOf(area);
  const { files, covered } = await loader.load(shape, from, to);
  if (!covered) return null;
  const selection = selectHotspots(files, index, shape, from, to);
  const csv = hotspotsCsv(selection, index, { area: area.name, country: area.country });
  return { csv, rows: Math.max(csv.split("\n").filter((line) => line && !line.startsWith("#")).length - 1, 0) };
}
