# app/lib/hotspots: single hotspots

The kept hotspots one by one, for the day view's map and the hotspots CSV. No UI and no packages. Format of the files: `docs/event/HOTSPOTS_FORMAT.md`.

| File | What it does |
|---|---|
| `hotspots.ts` | Lazy loader, filter by shape and dates, per-day summary, CSV builder |
| `day.ts` | One day: its hotspots for the map, and its week and month against the median |

## Use

```ts
import { createHotspotLoader, dailySummary, hotspotsCsv, regionsFor, selectHotspots } from "@/lib/hotspots/hotspots";
import type { HotspotIndex } from "@/lib/hotspots/hotspots";
import { dayView } from "@/lib/hotspots/day";

// Once, when the day view or the hotspots download is first opened (4 KB):
const index: HotspotIndex = await (await fetch("/data/hotspots/index.json")).json();
const loader = createHotspotLoader(index);   // fetches nothing yet; keep one for the session

// An area is a box [west, south, east, north] or a GeoJSON polygon.
// For an area document `doc` (a preset file or a drawn area's): const shape = doc.polygon ?? doc.box;
const { files, covered } = await loader.load(shape, from, to);   // fetches the region's file once
if (!covered) { /* say: single hotspots are not shipped here (Argentina outside the two preset boxes) */ }

// The day view:
const view = dayView(files, index, doc, "2026-07-29");
// view.hotspots: latitude, longitude, time_utc, satellite, sensor, confidence, frp_mw, daynight, version
// view.summary:  counts per sensor and satellite; null where a satellite was not flying
// view.week, view.month: value, band, median, pct_vs_median, flag; view.month.to_date for the running month

// A date range:
const selection = selectHotspots(files, index, shape, from, to);
const perDay = dailySummary(selection, index);
const csv = hotspotsCsv(selection, index, { area: doc.name, country: doc.country });
```

- Print the sensor as a word on the map as well as a colour: `view.hotspots[i].sensor` is `MODIS` or `VIIRS`.
- Counts are detections, never averaged over satellites and never harmonized: MODIS and VIIRS numbers do not compare.
- `covered: false` with no files means no single hotspots for that area. The panel's weekly counts (from `lib/fit`) are still there.

## Tests

From `app/`, with Node 22.15 or later and nothing installed:

```
node --import ./lib/fit/test/register.mjs --test "lib/hotspots/test/*.test.mjs"
```

They compare the counts with the pipeline's own. After a pipeline rebuild, run `uv run python -m zij hotspots` first: it rewrites the files and the test's reference counts.
