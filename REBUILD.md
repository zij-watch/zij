# Rebuild every number

Every number Zij shows comes out of `pipeline/` from public NASA FIRMS files. This page is for someone who has never seen the project and wants to check that: what to download, the exact commands, how long each takes, and how to compare the result with what is committed.

Short version, on a machine that has the raw files:

```powershell
python scripts/verify_rebuild.py --raw D:\Zij\firms-raw
```

It rebuilds everything in a clean folder and lists every number that differs from the committed files. The last run is at the bottom of this page.

## What you need

| | Version used | Notes |
|---|---|---|
| [uv](https://docs.astral.sh/uv/) | 0.12.24 | installs Python 3.12 and the pinned packages from `pipeline/uv.lock` |
| git | any | |
| Node.js | 22.15 or later (24.20 used) | only for the app's library tests; nothing to install |
| Disk | about 2 GB | 0.7 GB of raw files, 0.5 GB for the database, the rest for the packages |

Windows 11 was used. Nothing in the pipeline is Windows-only: on another system set `ZIJ_FIRMS_RAW` (step 2).

## 1. The raw files

Zij reads its inputs in place from one folder outside the repository, never committed:

```
firms-raw/
  firms/<Country>/<source>/<source>_<year>_<Country>.csv      FIRMS yearly country files, 2000 to 2025
  firms_api/<Country>/<source>/<first>_<last>.csv             2026, from the FIRMS area API, 5 days per file
  firms_api/<Country>/<source>/pulls.json                     what each of those files holds
  boundaries/ne_10m_admin_0_countries.geojson                 Natural Earth country outlines
```

Countries: `Egypt`, `Portugal`, `Argentina`. Sources: `modis`, `viirs-snpp` (Suomi NPP), `viirs-jpss1` (NOAA-20), `viirs-jpss2` (NOAA-21, 2026 only).

### The yearly files, 2000 to 2025: anyone can download them

No account is needed. 144 files, 561 MB (Egypt 56 MB, Portugal 18 MB, Argentina 488 MB):

```
https://firms.modaps.eosdis.nasa.gov/data/country/modis/<year>/modis_<year>_<Country>.csv              2000 to 2025
https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/<year>/viirs-snpp_<year>_<Country>.csv    2012 to 2025
https://firms.modaps.eosdis.nasa.gov/data/country/viirs-jpss1/<year>/viirs-jpss1_<year>_<Country>.csv  2018 to 2025
```

In PowerShell, from the folder that will hold `firms-raw`:

```powershell
$sources = @{ 'modis' = 2000..2025; 'viirs-snpp' = 2012..2025; 'viirs-jpss1' = 2018..2025 }
foreach ($country in 'Egypt', 'Portugal', 'Argentina') {
  foreach ($source in $sources.Keys) {
    $folder = "firms-raw\firms\$country\$source"
    New-Item -ItemType Directory -Force $folder | Out-Null
    foreach ($year in $sources[$source]) {
      $name = "${source}_${year}_${country}.csv"
      Invoke-WebRequest "https://firms.modaps.eosdis.nasa.gov/data/country/$source/$year/$name" -OutFile "$folder\$name"
    }
  }
}
```

FIRMS publishes no yearly files for NOAA-21. The same pages are browsable from https://firms.modaps.eosdis.nasa.gov/country/.

The outlines, 13 MB:

```powershell
New-Item -ItemType Directory -Force firms-raw\boundaries | Out-Null
Invoke-WebRequest https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson -OutFile firms-raw\boundaries\ne_10m_admin_0_countries.geojson
```

### The 2026 files: these cannot be downloaded again as they were

2026 has no yearly files yet, so its rows come from the FIRMS area API (https://firms.modaps.eosdis.nasa.gov/api/area/, with a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/map_key/). We pulled them twice:

| Pull | When | Where it is | Size |
|---|---|---|---|
| Before the event: 1 January to 7 November 2026 | 7 November 2026 | `firms-raw/firms_api/` | 57 MB |
| Top-up at the event (`uv run python -m zij pull`): the last 60 days of standard processing again, and near real time from 24 October | 13 November 2026, 11:06 UTC | `data/firms_api/` in the repository folder (git-ignored) | 12 MB |

FIRMS keeps revising recent data: near-real-time rows are replaced by standard processing a few months later, and late rows fill in. A pull made today answers differently from ours for the last months of 2026. So:

- **To reproduce the committed numbers exactly, you need our two sets of 2026 pulls** (69 MB). They are NASA FIRMS data, as the FIRMS area API returned it on 7 and 13 November 2026, unchanged. They are not in the repository's files; they are attached as a zip to the GitHub Release named `data-2026-11-13`: https://github.com/zij-watch/zij/releases/tag/data-2026-11-13. Unzip it so that the 7 November pulls are in `firms-raw/firms_api/` and the 13 November top-up in `data/firms_api/` at the repository root (or pass that folder to the check with `--topup`). Credit: NASA FIRMS, https://firms.modaps.eosdis.nasa.gov.
- **Without them** you can still rebuild from the yearly files and a 2026 pull of your own. Everything up to 31 December 2025 is then the same data. We have not run that. What we did run is a rebuild without the event top-up, which only changes weeks from August 2026 on (see the last run, below), so we expect the same of your own pull: the same fits, bands and validation, and a different end of 2026. One reason it may not be exact: the static-source mask also counts 2026 detections that have a `type`, and the mask applies to every year.

The build needs at least one set of 2026 pulls in that layout to know the last full day; `pipeline/zij/pull.py` shows the calls and writes the layout.

## 2. Build

```powershell
git clone https://github.com/zij-watch/zij.git
cd zij\pipeline
uv sync --frozen
$env:ZIJ_FIRMS_RAW = 'D:\Zij\firms-raw'     # where your raw folder is; this is the default
```

If you have our top-up pulls, put them in `data\firms_api\` at the repository root first. Then, in this order:

| Step | Command | Time | Writes |
|---|---|---|---|
| Packages | `uv sync --frozen` | 2 s from uv's cache; a minute or two the first time, with the Python download | `pipeline/.venv` |
| 1 | `uv run python -m zij all` | 42 s | `data/zij.duckdb` (0.5 GB), `data/processed/`, `docs/event/VALIDATION.md`, `app/public/data/areas/`, `index.json`, `method.json`, `notes.json`, `basemap/` |
| 2 | `uv run python -m zij cells` | 11 s | `app/public/data/cells/` |
| 3 | `uv run python -m zij boxes` | 1.6 min | `docs/event/SMALL_AREAS.md`, `data/processed/calibration/random_boxes.json` |
| 4 | `uv run python -m zij fixtures` | 15 s | `app/lib/fit/test/fixtures.json.gz` |
| 5 | `uv run python -m zij hotspots` | 3 s | `app/public/data/hotspots/`, `app/lib/hotspots/test/fixtures.json` |
| 6 | `uv run python -m zij validate` | 6 s | `docs/event/VALIDATION.md` again |
| | **All** | **3 minutes** | |

`all` is five commands in a row, which can be run one by one: `build`, `checkpoint`, `validate`, `harmonize`, `appdata`. The order matters: `cells`, `boxes`, `fixtures` and `hotspots` read the database that `build` writes, and `fixtures` also reads what `boxes` wrote. `validate` at the end only repeats the step inside `all`; it is there so that `docs/event/VALIDATION.md` is the last thing written.

Timings are from one run on a laptop with a 20-thread Intel CPU and an SSD, raw files on the same disk.

Do not run `uv run python -m zij pull` if you want our numbers: it fetches today's answer from FIRMS and moves the last full day.

## 3. Check

```powershell
cd ..\app
node --import ./lib/fit/test/register.mjs --test "lib/fit/test/*.test.mjs" "lib/hotspots/test/*.test.mjs"
git status --short
git diff --stat
```

The tests run the browser's code (the fit, the drawn-area panel, the hotspot library) against the rebuilt pipeline output. `git diff` then shows what changed against the committed files. Every JSON file carries the time it was built (`built_at_utc`), and the two reports their `Built` line, so those always change; nothing else should.

`scripts/verify_rebuild.py` does steps 2 and 3 in a clean copy of the committed files, ignores the build times, and prints each number that differs:

```powershell
python scripts/verify_rebuild.py --raw D:\Zij\firms-raw --topup D:\path\to\data\firms_api
```

Options: `--work <folder>` to choose the clean folder (default: a new temporary one), `--topup none` to rebuild from the raw folder alone, `--revision <commit>` to check another commit, `--skip-tests`. It leaves a `REPORT.md` and one log per step in the work folder.

## Where each number comes from

| What you see | File | Written by |
|---|---|---|
| Weekly fire cell-days per satellite and sensor | `data/processed/<Country>/*.parquet` (not committed) | `build` |
| The Nile Delta check, 11 to 20 times and 42 times in 2018 | printed; `docs/event/DECISIONS.md` | `checkpoint` |
| Validation tables, the fits | `docs/event/VALIDATION.md` | `validate` |
| The 10 preset areas: weeks, months, seasons, bands, anomalies | `app/public/data/areas/*.json`, `index.json` | `harmonize` |
| "How it works" numbers, the notes, the basemap outlines | `app/public/data/method.json`, `notes.json`, `basemap/countries.json` | `appdata` |
| Drawn areas | `app/public/data/cells/` | `cells` |
| Small areas and the blend band | `docs/event/SMALL_AREAS.md` | `boxes` |
| Reference values for the app's tests | `app/lib/fit/test/fixtures.json.gz`, `app/lib/hotspots/test/fixtures.json` | `fixtures`, `hotspots` |
| Single hotspots: the day view, the CSV | `app/public/data/hotspots/` | `hotspots` |

The formats are in `docs/event/DATA_CONTRACT.md`, `CELLS_FORMAT.md` and `HOTSPOTS_FORMAT.md`; every method choice, with its reason, is in `docs/event/DECISIONS.md`.

## The last run

13 November 2026, 14:34 (Cairo), commit `914ad93`, Windows 11, in a clean folder made by `scripts/verify_rebuild.py`. 27 generated files were compared with the committed ones.

**With our two sets of 2026 pulls** (the raw folder and the event top-up): 26 of 27 files are identical, build times aside. That is every file under `app/public/data/` (the areas, the index, the method numbers, the notes, the basemap, the cell files, the hotspot files), both reports (`VALIDATION.md`, `SMALL_AREAS.md`) and the fit's test fixtures. The cell and hotspot files are the same byte for byte once unzipped. The app's 84 library tests pass on the rebuilt files. One value differs:

| File | Value | Committed | Rebuilt |
|---|---|---|---|
| `app/lib/hotspots/test/fixtures.json` | `cases[4].frp_sum` (Alentejo, 1 to 10 August 2003) | 15680.300000000001 | 15680.3 |

It is a reference value for a test, not a number the app shows: a sum of FRP values that the database adds in a different order from one run to the next, so it moves in the 13th digit. The test that reads it allows one part in ten thousand.

**From the raw folder alone, without the event top-up:** 1,320 values differ in 23 of the 27 files, and every one of them is in the last weeks of 2026. The data then ends on 6 November instead of 12 November, and the weeks from August 2026 on lack the rows FIRMS filled in between the two pulls: the last full day, the last week, the weeks and months of August to November 2026, "this month", the raw counts per satellite for those weeks, and with them the 2026 end of the cell and hotspot files (Egypt: 173,696 kept hotspots against 173,938). Nothing before August 2026 changes: every fit, every band, the typical year, the critical periods, the seasons, and both reports (`VALIDATION.md`, `SMALL_AREAS.md`) are identical. The 84 tests pass on that rebuild too.

Rebuilding from the yearly files and a 2026 pull of your own was not run here.

