# The studio map

`/studio/map` is the map alone, edge to edge: no top bar, no panel, no credits, no buttons, no cursor. It is for recording the video. Everything is set in the address, so a link reproduces a shot.

Record at 1920 x 1080. The page fills the window, so set the browser window (or the capture) to that size.

Credits are not on the picture. Put them in the video: fire data NASA FIRMS, imagery NASA GIBS, map made with Natural Earth.

## Parameters

| Parameter | Values | Default | What it does |
|---|---|---|---|
| `area` | a preset id (list below) | none | Shows that area: its outline and its hotspots. The map opens fitted to it. |
| `box` | `west,south,east,north` | none | The same for any box. `poly=lon,lat;lon,lat;...` works too. |
| `day` | `YYYY-MM-DD` | none | The day whose hotspots are shown. Also the day of the satellite picture. |
| `basemap` | `zij`, `satellite` | `zij` | The Zij atlas, or NASA GIBS true colour for the day. |
| `centre` | `longitude,latitude` | fitted to the area | Where the map opens. `center` is accepted too. |
| `zoom` | 0 to 9 | fitted to the area | Zoom the map opens at. |
| `bearing` | -180 to 180 | 0 | Degrees the map is turned. |
| `pitch` | 0 to 60 | 0 | Degrees the map is tilted. |
| `hotspots` | `1`, `0` | `1` | Hotspot marks on or off. |
| `labels` | `1`, `0` | `1` | Names on the map on or off. |
| `outline` | `1`, `0` | `1` | The area's outline on or off. |
| `pad` | 0 to 400 | 120 | Pixels kept free around the area when the map fits to it. |
| `play` | `from,to` (two days) | none | Steps through the days, one after another, at a steady pace. |
| `pace` | 100 to 10000 | 800 | Milliseconds each day stays on screen while playing. |
| `caption` | `1` | off | Shows the date, bottom left. |
| `fly` | a preset id | none | Flies from the opening view to that area. |
| `flyms` | 500 to 60000 | 6000 | How long the flight takes, in milliseconds. |
| `delay` | 0 to 30000 | 1500 | Milliseconds the opening view is held before anything moves. |

Preset ids: `nile-delta`, `kafr-el-sheikh-rice-core`, `east-delta-sharqia`, `upper-egypt-sugarcane-belt`, `portugal-mainland`, `northern-portugal`, `central-portugal-pinhal`, `alentejo`, `parana-delta`, `chilecito`.

## How a shot runs

1. The page loads the map and every day it will show. Nothing moves yet.
2. It holds the opening view for `delay`.
3. With `fly`, it flies to that area. If there is no `area` or `box`, the flown-to area's outline and hotspots are the ones shown.
4. With `play`, it then steps through the days. With both, the flight comes first.

The `<html>` element says where the shot is, in `data-studio`: `loading`, `ready`, `flying`, `playing`, `done`. A recorder can wait for `ready` to start and `done` to stop.

## Marks

The map has one look, the paper sheet. VIIRS is a small filled red dot, MODIS a larger open blue ring, each with a thin light halo, the same as on Explore. Hotspots exist for Egypt, Portugal, and the two Argentine areas with half a degree around them. Outside those, the map shows no marks.

## Examples

Nile Delta, one day in the October rice-straw season:

    /studio/map?area=nile-delta&day=2018-10-20

Nile Delta, all of October 2018, half a second a day, with the date:

    /studio/map?area=nile-delta&play=2018-10-01,2018-10-31&pace=500&caption=1

The Chilecito fire, 27 July to 1 August 2026, one second a day:

    /studio/map?area=chilecito&play=2026-07-27,2026-08-01&pace=1000&caption=1

Chilecito on the satellite picture on the fire's third day, no names:

    /studio/map?area=chilecito&day=2026-07-29&basemap=satellite&labels=0

Portugal in August: from Iberia, fly to the central pine country, then play 15 to 24 August 2025:

    /studio/map?centre=-4,40&zoom=4.6&fly=central-portugal-pinhal&flyms=7000&play=2025-08-15,2025-08-24&caption=1

## Limits

- The Zij basemap needs no outside service. The satellite basemap loads pictures from NASA GIBS; while playing it swaps the picture every day, which flickers. Play on the Zij basemap.
- Zoom stops at 9. The atlas has no terrain shading here (that would need elevation tiles from an outside service), so far inland at high zoom the sheet is plain.
- A played range is at most 400 days.

## Reusing the map

The map is one component, `app/components/MapView.tsx`. Explore and the studio page both use it. Its required props are the theme, the basemap, the areas and the hotspots; `labels`, `chrome` (buttons and name tags), `interactive`, `follow`, `view` and `onMap` are optional and make it a bare map. Its look comes from `app/lib/map/style.ts` only.
