"""Paths, constants and the known satellite gaps.

The method constants come from our pre-event spec (SPEC.md, sections 4 and 5).
Each one is logged in docs/event/DECISIONS.md.
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# Raw FIRMS files are read in place, outside the repository. Never copied in.
FIRMS_RAW = Path(os.environ.get("ZIJ_FIRMS_RAW", r"D:\Zij\firms-raw"))

# Outputs. data/ is git-ignored.
DATA = REPO / "data"
DB_PATH = DATA / "zij.duckdb"
PROCESSED = DATA / "processed"

# Country folder -> ISO code (Natural Earth outline) and the box the FIRMS area API is asked for.
# Boxes are [west, south, east, north]. Portugal's box is the mainland.
COUNTRY_INFO = {
    "Egypt": {"iso3": "EGY", "box": (24.6, 21.9, 37.0, 31.8)},
    "Portugal": {"iso3": "PRT", "box": (-9.6, 36.9, -6.1, 42.2)},
    "Argentina": {"iso3": "ARG", "box": (-73.6, -55.1, -53.6, -21.7)},
}
COUNTRIES = list(COUNTRY_INFO)
OUTLINES = FIRMS_RAW / "boundaries" / "ne_10m_admin_0_countries.geojson"

# Folder under firms/<Country>/ -> sensor family.
SOURCES = {
    "modis": "MODIS",
    "viirs-snpp": "VIIRS",
    "viirs-jpss1": "VIIRS",
    "viirs-jpss2": "VIIRS",  # NOAA-21: API pulls only, FIRMS publishes no yearly files
}

# Folder -> FIRMS area API source name, without the _SP or _NRT ending.
API_SOURCES = {
    "modis": "MODIS",
    "viirs-snpp": "VIIRS_SNPP",
    "viirs-jpss1": "VIIRS_NOAA20",
    "viirs-jpss2": "VIIRS_NOAA21",
}

# FIRMS `satellite` codes -> (family, readable name).
SATELLITES = {
    "Terra": ("MODIS", "Terra"),
    "Aqua": ("MODIS", "Aqua"),
    "N": ("VIIRS", "Suomi NPP"),
    "N20": ("VIIRS", "NOAA-20"),
    "N21": ("VIIRS", "NOAA-21"),
}

# The yearly country files end here; the API pulls carry on from the next day.
YEARLY_LAST_DAY = date(2025, 12, 31)

# A satellite counts as flying from its first detection in the loaded countries
# to the last full day pulled, known gaps left out. Suomi NPP's data ends on
# 2 Nov 2026, a partial day, so its last day flown is 1 Nov 2026 (end of mission,
# not an outage).
MISSION_END = {"N": date(2026, 11, 1)}

# Filters (SPEC 5.1).
MODIS_MIN_CONFIDENCE = 30
VIIRS_KEEP_CONFIDENCE = ("n", "h")
KEEP_TYPE = 0  # presumed vegetation fire

# Static-source mask (SPEC 5.1): a 0.01 degree cell with type 2 or 3 detections
# on this many days or more loses every detection, in every year.
STATIC_TYPES = (2, 3)
STATIC_CELL_DEG = 0.01
STATIC_MIN_DAYS = 20

# Counting grid (SPEC 5.2).
GRID_DEG = 0.1

# A sensor-week with fewer satellite-days than this share of 7 is "no data" (SPEC 5.3).
MIN_WEEK_SHARE = 3 / 7

# Known satellite gaps: days when a satellite delivered nothing anywhere.
# Read from SPEC.md section 4 (31 gaps, verified before the event against four
# regions and NASA's outage notices). Both ends are inclusive. The 2026 gaps are
# listed for when the 2026 API pulls are loaded.
KNOWN_GAPS: dict[str, list[tuple[date, date]]] = {
    "Terra": [
        (date(2001, 6, 16), date(2001, 7, 2)),
        (date(2002, 3, 20), date(2002, 3, 28)),
        (date(2002, 4, 15), date(2002, 4, 15)),
        (date(2003, 12, 17), date(2003, 12, 24)),
        (date(2006, 6, 21), date(2006, 6, 21)),
        (date(2008, 12, 21), date(2008, 12, 22)),
        (date(2014, 10, 26), date(2014, 10, 26)),
        (date(2016, 2, 19), date(2016, 2, 27)),
        (date(2022, 10, 11), date(2022, 10, 23)),
    ],
    "Aqua": [
        (date(2002, 7, 30), date(2002, 8, 7)),
        (date(2002, 9, 12), date(2002, 9, 13)),
        (date(2002, 11, 15), date(2002, 11, 15)),
        (date(2003, 5, 12), date(2003, 5, 12)),
        (date(2014, 5, 21), date(2014, 5, 22)),
        (date(2020, 8, 28), date(2020, 8, 28)),
        (date(2020, 9, 2), date(2020, 9, 2)),
        (date(2021, 9, 23), date(2021, 9, 23)),
        (date(2022, 4, 1), date(2022, 4, 16)),
    ],
    "N": [
        (date(2022, 7, 27), date(2022, 8, 10)),
        (date(2024, 5, 30), date(2024, 6, 3)),
        (date(2024, 7, 10), date(2024, 7, 15)),
        (date(2024, 7, 25), date(2024, 7, 28)),
        (date(2024, 9, 26), date(2024, 9, 26)),
        (date(2024, 11, 3), date(2024, 11, 5)),
        (date(2026, 3, 10), date(2026, 3, 12)),
        (date(2026, 4, 28), date(2026, 4, 30)),
        (date(2026, 6, 1), date(2026, 6, 2)),
        (date(2026, 7, 11), date(2026, 7, 16)),
    ],
    "N20": [
        (date(2023, 7, 19), date(2023, 7, 22)),
        (date(2023, 9, 30), date(2023, 9, 30)),
        (date(2024, 2, 4), date(2024, 2, 4)),
    ],
}

# Check areas. Boxes are [west, south, east, north].
NILE_DELTA = (29.8, 30.0, 32.3, 31.6)
