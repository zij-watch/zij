# Hotspot files: pipeline to app

Format version 1. The pipeline writes these files with `uv run python -m zij hotspots`. They hold the kept hotspots one by one, for the day view's map and the hotspots CSV. The reader is `app/lib/hotspots/hotspots.ts`; a change goes into this file first and raises `version`.

```
app/public/data/hotspots/index.json                 regions, files, satellites, the filters applied
app/public/data/hotspots/<region>.bin.gz            one row per kept hotspot
app/public/data/hotspots/<region>-<year>-<year>.bin.gz   the same, when a region is split by period
```

**Source and credit.** A row is a NASA FIRMS active fire detection: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21). FIRMS is NASA open data. It is credited in the README, in the app and in the header of every CSV made from these files; the credit text travels in `index.json` (`credit`).

**What is in them.** Only detections that passed every filter of the build, on a day their satellite counts as flying. These are the rows the fire cell-days are counted from, so a count made from these files equals the pipeline's own (tested). The filters, in the order applied:

1. `type` 0 only (presumed vegetation fire). Volcanoes, other static land sources and offshore detections are dropped. Near-real-time rows carry no `type` and pass this step.
2. Confidence: MODIS 30 percent or more, VIIRS nominal or high.
3. Static-source mask: every detection is dropped in a 0.01 degree cell where `type` 2 or 3 detections occur on 20 or more days (gas flares, industry).
4. Days inside a known satellite outage, and days after the last full UTC day, are left out.

**Where.** Egypt and Portugal whole. Argentina only inside the Chilecito and Paraná Delta preset boxes with 0.5 degree around each; the rest of Argentina has weekly counts (the cell files) but no single hotspots.

| File | Hotspots | Gzipped | Unzipped |
|---|---|---|---|
| `egypt.bin.gz` | 173,938 | 1.48 MB | 2.82 MB |
| `portugal.bin.gz` | 234,254 | 1.81 MB | 3.79 MB |
| `argentina-chilecito.bin.gz` | 28,857 | 0.24 MB | 0.50 MB |
| `argentina-parana-delta.bin.gz` | 338,675 | 2.63 MB | 5.46 MB |
| `index.json` | | 4 KB (not gzipped) | |

**Load lazily.** The app fetches `index.json` when the day view or the hotspots download is first opened, and a region's file only when the user's area is in that region (`createHotspotLoader`). Nothing here is needed for the calendar or the panel.

**Split by period.** A file that would pass 5 MB gzipped is cut into whole-year periods, each with its own file, and the loader fetches only the periods a date range touches. None passes 5 MB today, so every region is one file.

## `index.json`

| Key | Meaning |
|---|---|
| `version` | this format's version |
| `built_at_utc`, `last_full_day` | when the files were built, and the last whole UTC day of data |
| `epoch` | `2000-01-01`: day 0 of the files |
| `coord_units` | `100000`: coordinates are whole numbers of 1e-5 degree, as FIRMS gives them |
| `grid_deg` | `0.1` |
| `viirs_confidence` | `{"101": "nominal", "102": "high"}`: what the confidence column holds for VIIRS |
| `satellites[]` | in file order (Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21): `code` (the FIRMS code), `sensor`, `name`, `first_day`, `last_day`, and `gaps`, the day ranges in between when it delivered nothing (both ends included) |
| `filters` | the filter settings as numbers, `text` (one sentence per filter, printed in the CSV header) and `detections_by_reason` (per country, how many detections each filter removed and how many were kept) |
| `credit` | the NASA FIRMS credit, printed in the CSV header |
| `regions[]` | `id`, `name`, `country`, `whole_country`, `box` (what the files cover), `n`, and `files[]`: `file`, `bytes`, `bytes_unzipped`, `from`, `to`, `n` |

## `<region>.bin.gz`

Gzip. Unzipped, everything is little-endian and every array starts on a 4-byte boundary (zero padding in between). Rows are sorted by day, then time, satellite, latitude and longitude.

| Part | Type | Length | Meaning |
|---|---|---|---|
| magic | 4 bytes, `ZIJH` | | |
| header | uint32 | 6 | version, rows, first day (days since `epoch`), number of days, 0, 0 |
| `day_start` | uint32 | days + 1 | day `d` (counted from the first day) owns rows `day_start[d]` to `day_start[d + 1] - 1`. The date is not stored per row |
| `lat` | int32 | rows | latitude x 100000 |
| `lon` | int32 | rows | longitude x 100000 |
| `minute` | uint16 | rows | overpass time, minutes after 00:00 UTC |
| `flags` | uint8 | rows | satellite index, + 8 for a night-time overpass, + 16 for near-real-time processing |
| `confidence` | uint8 | rows | MODIS: percent, 30 to 100. VIIRS: 101 nominal, 102 high |
| `frp` | float32 | rows | fire radiative power, MW |

The sensor is the satellite's (`satellites[].sensor`). A hotspot's 0.1 degree cell is `floor(lon / 10000)`, `floor(lat / 10000)` on the stored whole numbers, exactly as the pipeline snaps it.

## In an area or not

`selectHotspots` keeps a hotspot when the centre of its 0.1 degree cell is in the shape (a box or a polygon): the rule every count in Zij follows, so the hotspots on the map add up to the counts in the panel. A few hotspots can then lie just outside a drawn outline, and a few just inside it are left out. `by: "point"` uses the hotspot's own coordinates instead; its counts no longer equal the panel's.
