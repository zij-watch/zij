# Data contract: pipeline to app

Contract version 1. The pipeline writes these files with `uv run python -m zij harmonize`. The app reads them and nothing else. A change goes into this file first and raises `contract`.

```
app/public/data/index.json            the list of areas, read first
app/public/data/areas/<id>.json       one file per area, 200 to 300 KB
app/public/data/notes.json            optional note per area id, shown at the top of its panel
app/public/data/method.json           the numbers on the How it works page
app/public/data/basemap/countries.json  simplified Natural Earth outlines
app/public/data/cells/                per-cell files for drawn areas: docs/event/CELLS_FORMAT.md
```

## Conventions

- **Unit.** `fire_days` is the name in the files. On screen it is `unit_label`: "hotspot-days (VIIRS-equivalent)". It counts fire cell-days per satellite. A 0.1 degree cell counts once per day for each satellite with a kept detection; a sensor's weekly value is its satellites' sum divided by the satellite-days flown, times 7. Harmonized values are in VIIRS-equivalent fire days. `hotspots` are FIRMS detections, summed over a sensor's satellites, never averaged and never harmonized.
- **Weeks** are ISO weeks. `week_start` is the Monday, as `YYYY-MM-DD` (UTC days). A week belongs to the ISO year of its Monday and the month of its Thursday.
- **Months** split each week evenly over its 7 days, so a week across two months gives each its share.
- **Tables are columns.** Every table is an object of arrays of the same length: `weeks.value[i]` goes with `weeks.week_start[i]`.
- **No data is `null`, zero is `0`.** A week that is missing from `weeks` had no MODIS data at all.
- **Boxes** are `[west, south, east, north]` in degrees. A cell is in an area when its centre is.
- **Percent** values are in percent: `-58.0` is 58% below.
- Numbers are rounded to 2 decimals.

## `index.json`

| Key | Meaning |
|---|---|
| `contract` | this contract's version |
| `method` | `M4` |
| `unit`, `unit_label` | `fire_days`, and the label to show: `hotspot-days (VIIRS-equivalent)` |
| `built_at_utc`, `last_full_day` | when the files were built, and the last whole UTC day of data |
| `areas[]` | `id`, `name`, `country`, `box`, `n_cells`, `fit` (`own`, `blend`, `none`), `n_fire_weeks`, `season` (3 months), `file`, `bytes` |

## `areas/<id>.json`

### Top level

| Key | Meaning |
|---|---|
| `contract`, `id`, `name`, `country`, `box`, `n_cells`, `unit`, `unit_label` | as in the index |
| `built_at_utc`, `last_full_day`, `first_week`, `last_week` | the build and what it covers |
| `fit` | the area's M4 fit, below |
| `bands` | the uncertainty bands, below |
| `terra_only_test` | `mean_bias_before_pct`, `mean_bias_after_pct`, `mean_bias_two_satellites_pct`: season bias when MODIS is Terra alone, before and after the single-satellite correction, and with both satellites |
| `weeks`, `months`, `seasons` | the harmonized record |
| `climatology` | the typical year and the critical period |
| `this_month` | the running month against the same days of past years |
| `satellites` | raw counts per satellite |

### `weeks`: one entry per week MODIS has data, from November 2000

| Column | Meaning |
|---|---|
| `week_start`, `year`, `iso_week`, `month` | the week |
| `value` | harmonized fire days: VIIRS where VIIRS has data, otherwise MODIS converted with M4 |
| `lo`, `hi` | the weekly band, `null` on VIIRS weeks |
| `source` | `VIIRS`, `MODIS` (converted) or `none` (no fit for this area) |
| `flag` | `high` or `low` when the value is outside the 10th to 90th percentile of the same ISO week over the baseline years, else `null`. Partial weeks get no flag |
| `is_partial` | the sensor behind `value` flew on fewer than 7 days that week |
| `modis`, `viirs` | raw fire days per sensor, before any correction. `viirs` is `null` when VIIRS has no data |
| `modis_hotspots`, `viirs_hotspots` | kept detections |
| `n_sat_modis`, `n_sat_viirs` | satellite-days flown / 7 |

### `months`: one entry per calendar month with data

`year`, `month`, `value`, `lo`, `hi`, `source` (`VIIRS`, `MODIS`, `mixed`), `days_with_data`, `complete` (every day of the month has data), `anomaly_pct` (against the month's median), `flag` (as for weeks, against the same calendar month; complete months only). The month x year table is this list pivoted.

`lo` and `hi` apply `bands.month_mult` to the MODIS part of the month: `(P + 1) * lo - 1` to `(P + 1) * hi - 1`, floored at 0, plus the month's VIIRS part if it has one.

### `seasons`: one entry per year with a whole season

`year`, `value`, `lo`, `hi`, `source`, `terra_only` (most of the season's MODIS weeks are Terra alone: the wider band is used), `flag` (against the baseline seasons), `modis`, `viirs` (raw season totals). The season is `fit.season`: the 3 busiest VIIRS months in a row.

### `climatology`

| Key | Meaning |
|---|---|
| `baseline_years` | `[2001, 2025]`: every complete calendar year |
| `percentiles` | `[10, 90]`, the anomaly thresholds |
| `months` | per calendar month: `median`, `mean`, `p10`, `p25`, `p75`, `p90`, `n_years` |
| `weeks` | per ISO week 1 to 53: `median`, `mean`, `p10`, `p90`, `n_years`, `critical` |
| `critical_share`, `critical_weeks` | `0.8`, and the smallest set of ISO weeks (1 to 52) holding that share of the typical (mean) year |

### `this_month`

`year`, `month`, `days_so_far`, `value_to_date`, and over the same days of the baseline years: `median_to_date`, `p10_to_date`, `p25_to_date`, `p75_to_date`, `p90_to_date`, `baseline_n`, `pct_vs_median`.

### `fit`

`model` (`M4`), `mode`, `n_fire_weeks` (MODIS fire weeks in 2012 to 2020), `season`, `train_years`, `single_satellite_ratio` (`Terra` and `Aqua`, 12 values each, January first), and `parts`: one fit for `own`, two for `blend`. Each part has `weight`, `scale`, `b`, `g`, `a`, `c` (12 values), `d`, `z_ref`, `season`, `s_typ`.

Weekly prediction of one part, with M the MODIS fire days after the single-satellite correction:

```
m = M / scale
r = clip(year's sum of m over the season months / s_typ, 0.02, 10)     (1 when s_typ is 0)
z = clip(log(MODIS FRP per detection) - z_ref, -2, 2)                  (0 when MODIS saw nothing)
V = scale * max(0, c[month] * r^g + m^b * (a + d * z))
```

The area's value is the weighted sum of its parts.

### `bands`

| Key | Meaning |
|---|---|
| `week_mult` | `[lo, hi]`: a converted week's band is `(P + 1) * lo - 1` to `(P + 1) * hi - 1`, floored at 0 |
| `month_mult` | `[lo, hi]`: the same for a converted month total, from the month totals of the leave-one-year-out predictions |
| `season_pct` | `[lo, hi]`: 10th and 90th percentile of the season error. The true total lies between `P / (1 + hi/100)` and `P / (1 + lo/100)` |
| `terra_only_season_pct` | the same for seasons when MODIS was Terra alone |
| `season_errors_pct` | the leave-one-year-out season errors behind `season_pct` |
| `basis` | where the season band comes from: the area's own errors, or the pooled small-area band |

### `satellites`

One entry per satellite that ever flew (`Terra`, `Aqua`, `Suomi NPP`, `NOAA-20`, `NOAA-21`): `code` (the FIRMS code), `family`, and three arrays aligned with `weeks.week_start`:

- `days`: days flown that week, known gaps left out; `null` when it was not flying;
- `fire_days`: its fire cell-days that week, a plain count, not scaled to 7 days;
- `hotspots`: its kept detections.

## Drawn areas

A drawn area's document is made in the browser (`app/lib/fit/`) with the same keys as `areas/<id>.json`. A polygon adds `polygon` (GeoJSON), and its `box` is the box around it. With `fit.mode` `none`, `weeks.value` is `null` on MODIS-only weeks and `weeks.source` is `none`.
