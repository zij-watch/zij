# The pipeline

From raw FIRMS files to the files the app reads. For the commands to rebuild and check every number, see [REBUILD.md](../REBUILD.md). Paths below are from the repository root.

## Build

Needs [uv](https://docs.astral.sh/uv/) and the raw FIRMS files laid out as `firms/<Country>/<source>/*.csv` (yearly files) and `firms_api/<Country>/<source>/` (2026 API pulls with their `pulls.json`). Sources: `modis`, `viirs-snpp`, `viirs-jpss1`, `viirs-jpss2`. The country outlines are Natural Earth's, in `boundaries/`.

```powershell
cd pipeline
uv sync
$env:ZIJ_FIRMS_RAW = 'D:\Zij\firms-raw'   # only if the raw files are somewhere else
uv run python -m zij pull                 # optional: top up 2026 from the FIRMS API (needs MAP_KEY)
uv run python -m zij all                  # or: build, checkpoint, validate, harmonize, appdata, findings
```

What `build` does, for Egypt, Portugal and Argentina, from November 2000 to the last full day pulled:

1. **Load** every row of the FIRMS yearly country files (2000 to 2025) into DuckDB (`data/zij.duckdb`), then the 2026 API pulls. The API answers with a box, so its rows are clipped to the country outline. Standard processing wins over near real time, and a newer pull over an older one.
2. **Filter.** Keep `type` 0 (vegetation fire); near-real-time rows have no `type` and pass this step. Keep MODIS confidence 30 and above, and VIIRS nominal and high.
3. **Static-source mask.** A 0.01 degree cell where `type` 2 or 3 detections (gas flares, industry, offshore) occur on 20 or more days loses every detection, in every year.
4. **Grid.** Snap to a 0.1 degree grid. A cell counts once per day for each satellite: that is a fire cell-day.
5. **Outages.** A day inside a known satellite gap is "no data" for that satellite, never zero. Suomi NPP stops counting after 1 November 2026, the end of its data.
6. **Weekly.** Sum per satellite and ISO week. A sensor's value is its satellites' sum, divided by the satellite-days flown that week, times 7, so two satellites don't count double. A sensor-week with fewer than 3 satellite-days is "no data".
7. **Write** Parquet to `data/processed/<Country>/`.

| File | One row per | Columns |
|---|---|---|
| `cell_week_sat.parquet` | satellite, cell and week with a kept detection | `family`, `satellite`, `cell_lat`, `cell_lon`, `week_start`, `fire_days`, `hotspots`, `frp_sum` |
| `cell_weeks.parquet` | sensor, cell and week with a kept detection | `family`, `cell_lat`, `cell_lon`, `week_start`, `fire_days`, `hotspots`, `frp_sum` |
| `sat_weeks.parquet` | satellite and week it flew | `family`, `satellite`, `week_start`, `satellite_days` |
| `weeks.parquet` | sensor and week it flew | `family`, `week_start`, `n_satellites`, `satellites`, `is_partial`, `no_data` |
| `filters.parquet` | satellite, year and filter reason | `family`, `satellite`, `year`, `filter_reason`, `n` |

`family` is the sensor (`MODIS`, `VIIRS`). `satellite` uses the FIRMS codes: `Terra`, `Aqua`, `N` (Suomi NPP), `N20` (NOAA-20), `N21` (NOAA-21). `cell_lat` and `cell_lon` are the cell's centre. `week_start` is the Monday. A cell and week with no row had no kept detection: that is zero fires if the sensor has a row in `weeks.parquet` with `no_data` false, and no data otherwise.

`checkpoint` prints the Nile Delta check (September to November, 2012 to 2024, per satellite). The 13 November run is recorded in `docs/event/DECISIONS.md`.

## Calibration and validation

`validate` fits six ways of predicting weekly VIIRS fire days from weekly MODIS fire days, on 2012 to 2020, for 8 areas in Egypt and Portugal. It tests each one twice: leaving one year out, and predicting 2021 to 2025 from the 2012 to 2020 fit. The results are in the [README](../README.md#validation) and, per area and year, in [event/VALIDATION.md](event/VALIDATION.md).

The fits are plain least squares inside two small grid searches (numpy only), so they can run in the browser later. `validate` writes `data/processed/calibration/` (`fits.json`, `validation_years.parquet`, `validation_areas.parquet`, `validation_summary.json`, `area_series.parquet`) and `docs/event/VALIDATION.md`.

## The harmonized record

`harmonize` builds, for each named area, one weekly record from November 2000 to the last full day, in VIIRS-equivalent fire days: VIIRS itself from 2012, and before that MODIS converted with M4, each converted value with a band. Before July 2002 MODIS is Terra alone, so those weeks are first put on the Terra + Aqua footing, by month and area. From the record it derives month and season totals, the typical year over 2001 to 2025, the critical period (the fewest weeks holding 80% of a typical year), anomalies (outside the 10th to 90th percentile), and the running month against the same days of past years.

It writes one JSON file per area to `app/public/data/areas/`, with the raw counts per satellite alongside, and `app/public/data/index.json`. The format is in `docs/event/DATA_CONTRACT.md`. These files hold weekly totals, not FIRMS rows.
