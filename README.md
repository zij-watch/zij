# Zij

Built at NASA Space Apps Cairo, 13 to 14 November 2026, by Team Zij. Contact: info@zij.watch.

## What it is

Zij puts 26 years of satellite fire detections on one scale.

NASA has two families of fire sensors. MODIS (on Terra and Aqua) has watched since 2000 with 1 km pixels. VIIRS (on Suomi NPP and NOAA-20) has watched since 2012 with 375 m pixels, and it sees many more small fires. Over the Nile Delta in autumn, Suomi NPP reports 11 to 20 times as many fire pixels as Aqua in most years, and 42 times as many in 2018. So a fire record that starts in 2000 can't be read year against year as it is.

Zij counts both records in one unit, the **fire cell-day**: one map square of 0.1 degree (about 10 km) with at least one fire detection on one day, for one satellite.

- `pipeline/`: from raw FIRMS files to weekly fire cell-days per satellite and per sensor.
- `app/`: the web app (not started yet).
- `docs/event/DECISIONS.md`: every decision made during the event, with its reason.

Status: the pipeline's first checkpoint. Calibration, validation, the harmonized record and the app come next.

## Before the event

- **Research and method decisions were done before the event.** We studied the challenge and the two sensors, tested methods, and wrote a spec. That work is in private repositories (available to the organizers on request). During the event we read its spec, its notes and its reference numbers. No code, notebook or generated data from it is in this repository.
- **The public FIRMS files were downloaded before the event.** They are public NASA data, not project work, and they are never committed here.
- **All code in this repository was written during the event.**
- **AI assistance: Claude and Claude Code (Anthropic).** They write code and documentation here under our direction. We decide the method, log every decision in `docs/event/DECISIONS.md`, and check the output against our own research numbers before building on it. No AI-generated images, video or audio are in this repository.

## The pipeline

Needs [uv](https://docs.astral.sh/uv/) and the raw FIRMS files laid out as `firms/<Country>/<source>/*.csv`, with the sources `modis`, `viirs-snpp` and `viirs-jpss1`.

```powershell
cd pipeline
uv sync
$env:ZIJ_FIRMS_RAW = 'D:\Zij\firms-raw'   # only if the raw files are somewhere else
uv run python -m zij all                  # or: build, checkpoint
```

What `build` does, for Egypt and Portugal, 2000 to 2025:

1. **Load** every row of the FIRMS yearly country files into DuckDB (`data/zij.duckdb`).
2. **Filter.** Keep `type` 0 (vegetation fire). Keep MODIS confidence 30 and above, and VIIRS nominal and high.
3. **Static-source mask.** A 0.01 degree cell where `type` 2 or 3 detections (gas flares, industry, offshore) occur on 20 or more days loses every detection, in every year.
4. **Grid.** Snap to a 0.1 degree grid. A cell counts once per day for each satellite: that is a fire cell-day.
5. **Outages.** A day inside a known satellite gap is "no data" for that satellite, never zero.
6. **Weekly.** Sum per satellite and ISO week. A sensor's value is its satellites' sum, divided by the satellite-days flown that week, times 7, so two satellites don't count double. A sensor-week with fewer than 3 satellite-days is "no data".
7. **Write** Parquet to `data/processed/<Country>/`.

| File | One row per | Columns |
|---|---|---|
| `cell_week_sat.parquet` | satellite, cell and week with a kept detection | `family`, `satellite`, `cell_lat`, `cell_lon`, `week_start`, `fire_days`, `hotspots`, `frp_sum` |
| `cell_weeks.parquet` | sensor, cell and week with a kept detection | `family`, `cell_lat`, `cell_lon`, `week_start`, `fire_days`, `hotspots`, `frp_sum` |
| `sat_weeks.parquet` | satellite and week it flew | `family`, `satellite`, `week_start`, `satellite_days` |
| `weeks.parquet` | sensor and week it flew | `family`, `week_start`, `n_satellites`, `satellites`, `is_partial`, `no_data` |
| `filters.parquet` | satellite, year and filter reason | `family`, `satellite`, `year`, `filter_reason`, `n` |

`family` is the sensor (`MODIS`, `VIIRS`). `satellite` uses the FIRMS codes: `Terra`, `Aqua`, `N` (Suomi NPP), `N20` (NOAA-20). `cell_lat` and `cell_lon` are the cell's centre. `week_start` is the Monday. A cell and week with no row had no kept detection: that is zero fires if the sensor has a row in `weeks.parquet` with `no_data` false, and no data otherwise.

`checkpoint` prints the Nile Delta check (September to November, 2012 to 2024, per satellite). The 13 November run is recorded in `docs/event/DECISIONS.md`.

## Data sources

- **NASA FIRMS active fire detections**: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20), yearly country files for Egypt and Portugal, 2000 to 2025. https://firms.modaps.eosdis.nasa.gov

We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS).

Zij is not affiliated with or endorsed by NASA.

## Libraries

| Library | Used for | Licence |
|---|---|---|
| [DuckDB](https://duckdb.org) | loading, filtering and aggregating the detections | MIT |
| [pandas](https://pandas.pydata.org) | the checkpoint tables | BSD-3-Clause |
| [NumPy](https://numpy.org) | arrays under pandas | BSD-3-Clause |
| [Apache Arrow (PyArrow)](https://arrow.apache.org) | Parquet | Apache-2.0 |
| [uv](https://docs.astral.sh/uv/) | Python and package management | Apache-2.0 or MIT |

Exact versions are in `pipeline/pyproject.toml` and `pipeline/uv.lock`. The app's libraries will be listed here when the app is added.

## Licence

Apache-2.0, see `LICENSE`.
