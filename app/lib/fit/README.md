# app/lib/fit: drawn areas

Everything a preset file holds, computed in the browser for a box or polygon the user draws. No UI and no packages.

| File | What it does |
|---|---|
| `m4.ts` | The M4 fit, its prediction and the small-area rule |
| `cells.ts` | Reads the cell files; sums a box or polygon into a weekly record; raw hotspot counts |
| `drawn.ts` | Record, fit, harmonized weeks, the Terra-only test and the bands |
| `panel.ts` | The preset-shaped document (`AreaDocument`, also the type of a preset file) |

## Use

```ts
import { countriesFor, hotspotCounts, loadCells } from "@/lib/fit/cells";
import type { Cells, CellsIndex, Shape } from "@/lib/fit/cells";
import { fitDrawnArea } from "@/lib/fit/drawn";
import { areaDocument } from "@/lib/fit/panel";

// Once, when drawing starts (31 KB):
const index: CellsIndex = await (await fetch("/data/cells/index.json")).json();

// Per country, the first time an area falls in it (Argentina is 4.2 MB): keep the result.
const files = new Map<string, Promise<Cells>>();
const cellsOf = (country: string) =>
  files.get(country) ?? files.set(country, loadCells("/data/" + index.countries[country].file)).get(country)!;

// Per drawn shape: a box [west, south, east, north] or a GeoJSON polygon.
const [country] = countriesFor(index, shape);          // none: the shape is outside Egypt, Portugal and Argentina
const area = fitDrawnArea(await cellsOf(country), index, country, shape);   // 50 to 100 ms
const doc = areaDocument(area, index, { id: "drawn", name: "Drawn area" }); // same shape as areas/<id>.json

// The "number of fires detected" view, for a date range (widened to whole weeks):
const counts = hotspotCounts(area.record, index, "2026-07-20", "2026-08-02");
```

- `doc.fit.mode` is `own`, `blend` (show the warning; the season band is the pooled one) or `none` (raw counts only: `weeks.source` is `none` on MODIS-only weeks and `value` is `null` there).
- While a shape is being dragged, `fitDrawnArea(..., { bands: false })` skips the nine extra fits; call it again without the option when the drag ends.
- A shape that spans two countries is not handled: `countriesFor` returns both and each file knows only its own country.
- `fitDrawnArea` and `areaDocument` run on the main thread. They are plain functions of typed arrays, so they move to a worker unchanged if the panel ever stutters.

## Tests

From `app/`, with Node 22.15 or later and nothing installed:

```
node --import ./lib/fit/test/register.mjs --test "lib/fit/test/*.test.mjs"
```

They compare the TypeScript with the pipeline: the fits of 22 areas and boxes, and whole documents against the 10 exported area files and 6 random boxes. After a pipeline rebuild, run `uv run python -m zij cells`, `boxes` and `fixtures` (in that order) before the tests.
