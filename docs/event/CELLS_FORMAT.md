# Cell files: pipeline to app, for drawn areas

Format version 1. The pipeline writes these files with `uv run python -m zij cells`. They let the browser do for any box what the pipeline does for a named area. The reader is `app/lib/fit/cells.ts`; a change goes into this file first and raises `version`.

```
app/public/data/cells/index.json           weeks, days flown, the country fits, the file list
app/public/data/cells/<country>.bin.gz     one row per cell, week and satellite with a kept detection
```

The numbers are the pipeline's `cell_week_sat` table, nothing else: fire cell-days and kept detections per 0.1 degree cell, ISO week and satellite. No FIRMS rows are in them.

## `index.json`

| Key | Meaning |
|---|---|
| `version` | this format's version |
| `built_at_utc`, `last_full_day` | when the files were built, and the last whole UTC day of data |
| `grid_deg` | `0.1` |
| `first_week`, `n_weeks` | the Monday of week 0, and how many weeks follow. Week `i` starts `7 i` days later |
| `satellites[]` | in file order (Terra, Aqua, Suomi NPP, NOAA-20, NOAA-21): `code` (the FIRMS code), `family`, `name`, and `days`, the days flown per week, known gaps left out |
| `partial` | per sensor (`MODIS`, `VIIRS`) and week: 1 when the sensor flew on fewer than 7 different days |
| `min_week_days` | `3`: a sensor-week with fewer satellite-days is "no data" |
| `train_years` | `[2012, 2020]` |
| `blend_band_pct` | the season band for blended areas |
| `countries` | per country: `file`, `bytes`, `bytes_unzipped`, `n_cells`, `n_modis_rows`, `n_viirs_rows`, `cells_box` (what the file covers), `box` (the country box of the small-area rule) and `parts` |

`parts` holds the country's half of a blend: `all` for the fit on every training year, and one entry per training year left out (`"2012"` to `"2020"`), for the leave-one-year-out bands. Each has `fit` (the keys of `fit.parts[]` in `DATA_CONTRACT.md`) and `m_sum`, the country's MODIS training total that an area's share is measured against.

## `<country>.bin.gz`

Gzip. Unzipped, everything is little-endian and every array starts on a 4-byte boundary (zero padding in between).

| Part | Type | Length |
|---|---|---|
| magic | 4 bytes, `ZIJC` | |
| header | uint32 | 6: version, number of cells, MODIS rows, VIIRS rows, 0, 0 |
| `gy` | int16 | cells. The cell's south edge is `gy x 0.1` degrees, its centre `gy x 0.1 + 0.05` |
| `gx` | int16 | cells. The same for the west edge |
| MODIS table | | |
| VIIRS table | | the same without `frp` |

Cells are sorted by `gy`, then `gx`. A table holds one sensor's rows, sorted by cell, week and satellite:

| Array | Type | Length | Meaning |
|---|---|---|---|
| `start` | uint32 | cells + 1 | cell `i` owns rows `start[i]` to `start[i + 1] - 1` |
| `week` | uint16 | rows | index from `first_week` |
| `sat_days` | uint8 | rows | satellite index x 8 + fire cell-days (1 to 7) |
| `hotspots` | uint16 | rows | kept detections |
| `frp` | float32 | rows | MODIS only: the sum of the detections' FRP, in MW |

## From rows to a weekly record

For a box, take the cells whose centre is inside it. Then, as `pipeline/zij/build.py` does:

- per cell and week, a sensor's fire days are its satellites' `fire cell-days` summed, times 7, divided by the satellite-days the sensor flew that week (rounded to 32-bit, as the pipeline stores it), and the area's value is the sum over its cells;
- a sensor-week under `min_week_days` is no data, never zero;
- a week belongs to the ISO year of its Monday and the month of its Thursday.

`areaRecord` in `app/lib/fit/cells.ts` does exactly this and is tested against the pipeline's numbers for every named area.
