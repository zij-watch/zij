# Zij

Built at NASA Space Apps Cairo, 13 to 14 November 2026, by Team Zij. Contact: info@zij.watch.

## What it is

Zij puts 26 years of satellite fire detections on one scale.

NASA has two families of fire sensors. MODIS (on Terra and Aqua) has watched since 2000 with 1 km pixels. VIIRS (on Suomi NPP, NOAA-20 and NOAA-21) has watched since 2012 with 375 m pixels, and it sees many more small fires. Over the Nile Delta in autumn, Suomi NPP reports 11 to 20 times as many fire pixels as Aqua in most years, and 42 times as many in 2018. So a fire record that starts in 2000 can't be read year against year as it is.

Zij counts both records in one unit, the **fire cell-day**: one map square of 0.1 degree (about 10 km) with at least one fire detection on one day, for one satellite.

- `pipeline/`: from raw FIRMS files to weekly fire cell-days per satellite and per sensor.
- `app/`: the web app: Explore (map, calendar, typical year, anomalies), Downloads and How it works, on 10 preset areas. `app/public/data/` holds the files the pipeline exports for it. See `app/README.md`.
- `docs/event/DECISIONS.md`: every decision made during the event, with its reason.
- `docs/event/VALIDATION.md`: how well the calibration predicts VIIRS from MODIS, per area and model.
- `docs/event/DATA_CONTRACT.md`: the format of the exported files.

Status: the record runs from November 2000 to yesterday for 10 preset areas, and for any box or polygon drawn in Egypt, mainland Portugal or Argentina, fitted in the browser. The day view and the final How it works text come next.

## Before the event

- **Research and method decisions were done before the event.** We studied the challenge and the two sensors, tested methods, and wrote a spec. That work is in private repositories (available to the organizers on request). During the event we read its spec, its notes and its reference numbers. No code, notebook or generated data from it is in this repository.
- **The public FIRMS files were downloaded before the event.** They are public NASA data, not project work. The raw archive is not committed. What the app needs from it is: a filtered copy of the kept hotspots and the weekly counts per cell (see "What is shipped from FIRMS" below).
- **The design system was made before the event.** From it this repository takes the colour and font tokens, the Seal (the mark that reads Zij and زيج; `Seal` in `app/components/Shell.tsx`, and the favicon set drawn from it by `app/scripts/icons.mjs`), and the paper material: the grain file `app/public/paper-grain.svg` and the sheet's shading, shadow and scrollbar rules in `app/app/globals.css`. The landing page at `/` is also from it: `app/landing-src/` holds its page, script, tokens, materials and patterns unchanged, and `app/scripts/build-landing.mjs`, written during the event, puts the real record into it. Nothing else of it is here.
- **All other code in this repository was written during the event.**
- **AI assistance: Claude and Claude Code (Anthropic).** They write code and documentation here under our direction. We decide the method, log every decision in `docs/event/DECISIONS.md`, and check the output against our own research numbers before building on it. No AI-generated images, video or audio are in this repository.

## The pipeline

Needs [uv](https://docs.astral.sh/uv/) and the raw FIRMS files laid out as `firms/<Country>/<source>/*.csv` (yearly files) and `firms_api/<Country>/<source>/` (2026 API pulls with their `pulls.json`). Sources: `modis`, `viirs-snpp`, `viirs-jpss1`, `viirs-jpss2`. The country outlines are Natural Earth's, in `boundaries/`.

```powershell
cd pipeline
uv sync
$env:ZIJ_FIRMS_RAW = 'D:\Zij\firms-raw'   # only if the raw files are somewhere else
uv run python -m zij pull                 # optional: top up 2026 from the FIRMS API (needs MAP_KEY)
uv run python -m zij all                  # or: build, checkpoint, validate, harmonize, appdata
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

`validate` fits six ways of predicting weekly VIIRS fire days from weekly MODIS fire days, on 2012 to 2020, for 8 areas in Egypt and Portugal. It tests each one twice: leaving one year out, and predicting 2021 to 2025 from the 2012 to 2020 fit. Mean absolute error of the season total over the 8 areas:

| Model | Leave one year out | 2021 to 2025 |
|---|---|---|
| raw MODIS, no calibration | 76.5% | 74.6% |
| M0: one fixed multiplier | 24.1% | 36.6% |
| M1: c + a M^b | 19.1% | 33.5% |
| M2: M1 with a background per month | 19.6% | 33.3% |
| M3: M2 with fire size | 16.6% | 27.2% |
| M4: M3 with the background scaled by the year's activity | 14.2% | 25.2% |

For the Nile Delta, M4 is off by 7.0% (10.3% for 2021 to 2025). The fits are plain least squares inside two small grid searches (numpy only), so they can run in the browser later. `validate` writes `data/processed/calibration/` (`fits.json`, `validation_years.parquet`, `validation_areas.parquet`, `validation_summary.json`, `area_series.parquet`) and `docs/event/VALIDATION.md`.

## The harmonized record

`harmonize` builds, for each named area, one weekly record from November 2000 to the last full day, in VIIRS-equivalent fire days: VIIRS itself from 2012, and before that MODIS converted with M4, each converted value with a band. Before July 2002 MODIS is Terra alone, so those weeks are first put on the Terra + Aqua footing, by month and area. From the record it derives month and season totals, the typical year over 2001 to 2025, the critical period (the fewest weeks holding 80% of a typical year), anomalies (outside the 10th to 90th percentile), and the running month against the same days of past years.

It writes one JSON file per area to `app/public/data/areas/`, with the raw counts per satellite alongside, and `app/public/data/index.json`. The format is in `docs/event/DATA_CONTRACT.md`. These files hold weekly totals, not FIRMS rows.

## What is shipped from FIRMS

The raw FIRMS archive (the yearly country files and the API pulls, about 1.2 GB) is not in this repository. The pipeline reads it from a folder outside the repository and writes its working files to `data/`, which git ignores.

Three things made from it are committed in `app/public/data/`, because the deployed app reads them:

- `areas/`: weekly, monthly and seasonal totals for the 10 preset areas.
- `cells/`: weekly counts per 0.1 degree cell and satellite, for drawn areas (`docs/event/CELLS_FORMAT.md`).
- `hotspots/`: a filtered copy of the kept FIRMS detections (position, time, satellite, confidence, fire radiative power), for the day view and the hotspots CSV: all of Egypt and Portugal, and in Argentina around Chilecito and the Parana Delta (`docs/event/HOTSPOTS_FORMAT.md`).

FIRMS is NASA open data. It is credited here, in the app's footer and in the header of every downloaded CSV.

## Data sources

- **NASA FIRMS active fire detections**: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20), yearly country files for Egypt, Portugal and Argentina, 2000 to 2025, and the FIRMS area API for 2026 (standard processing where it exists, near real time after, NOAA-21 included). https://firms.modaps.eosdis.nasa.gov
- **NASA GIBS** true-colour imagery (MODIS Terra, VIIRS Suomi NPP, VIIRS NOAA-20 corrected reflectance), as the app's satellite basemap.
- **Natural Earth** (1:10m, public domain): country outlines, used to clip the API's boxes to each country; and land, rivers, lakes, borders, places and physical regions, simplified, as the app's offline basemap. https://www.naturalearthdata.com

We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms) and Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).

Zij is not affiliated with or endorsed by NASA.

## Libraries

| Library | Used for | Licence |
|---|---|---|
| [DuckDB](https://duckdb.org) | loading, filtering and aggregating the detections | MIT |
| [pandas](https://pandas.pydata.org) | the checkpoint tables | BSD-3-Clause |
| [NumPy](https://numpy.org) | arrays under pandas | BSD-3-Clause |
| [Apache Arrow (PyArrow)](https://arrow.apache.org) | Parquet | Apache-2.0 |
| [Shapely](https://shapely.readthedocs.io) | which API rows fall inside a country outline | BSD-3-Clause |
| [uv](https://docs.astral.sh/uv/) | Python and package management | Apache-2.0 or MIT |

Exact versions are in `pipeline/pyproject.toml` and `pipeline/uv.lock`. The app (`app/package.json`, `app/pnpm-lock.yaml`):

| Library | Used for | Licence |
|---|---|---|
| [Next.js](https://nextjs.org) and [React](https://react.dev) | the app | MIT |
| [MapLibre GL JS](https://maplibre.org) | the map | BSD-3-Clause |
| [zij-map](https://github.com/zij-watch/zij-map), the Zij atlas, by our team | the look of the map: style, patterns, signs and drawings | by our team; its repository has no licence file yet |
| [Apache ECharts](https://echarts.apache.org) | the charts | Apache-2.0 |
| [Terra Draw](https://terradraw.io) and its MapLibre adapter | drawing a box or polygon on the map | MIT |
| [Radix UI](https://www.radix-ui.com) primitives (Select, Popover, Tabs, Checkbox, Tooltip, Dialog) | the controls: keyboard, focus and screen-reader behaviour | MIT |
| [React DayPicker](https://daypicker.dev) | the date pickers | MIT |
| [Fontsource](https://fontsource.org) packages of Cormorant Garamond, Reem Kufi and Amiri | fonts, bundled | fonts: SIL Open Font License 1.1 |
| [TypeScript](https://www.typescriptlang.org), [ESLint](https://eslint.org) | development | Apache-2.0, MIT |

## Licence

Apache-2.0, see `LICENSE`.
