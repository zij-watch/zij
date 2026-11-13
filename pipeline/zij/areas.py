"""Named areas for calibration and validation, and the fit's fixed parameters.

Every value here is a parameter from our pre-event research, listed in
docs/event/DECISIONS.md. Boxes are [west, south, east, north].
"""

from __future__ import annotations

# name -> (country, box)
AREAS: dict[str, tuple[str, tuple[float, float, float, float]]] = {
    "Nile Delta": ("Egypt", (29.8, 30.0, 32.3, 31.6)),
    "Kafr El Sheikh rice core": ("Egypt", (30.6, 31.0, 31.3, 31.5)),
    "East Delta (Sharqia)": ("Egypt", (31.3, 30.4, 32.0, 31.0)),
    "Upper Egypt sugarcane belt": ("Egypt", (32.4, 24.3, 33.1, 26.3)),
    "Portugal mainland": ("Portugal", (-9.6, 36.9, -6.1, 42.2)),
    "Northern Portugal": ("Portugal", (-8.9, 40.8, -6.2, 42.2)),
    "Central Portugal (Pinhal)": ("Portugal", (-8.6, 39.4, -7.0, 40.6)),
    "Alentejo": ("Portugal", (-8.9, 37.3, -6.9, 39.0)),
    "Parana Delta": ("Argentina", (-60.8, -34.5, -58.2, -32.0)),
    # Same size as the research box, moved 0.2 degree west to centre on the fire of 27 July to 1 August 2026.
    "Chilecito": ("Argentina", (-68.2, -29.6, -67.2, -28.7)),
}

# The 8 areas of our pre-event research. The averages we compare with are over these.
RESEARCH_AREAS = tuple(list(AREAS)[:8])

# The country a small area leans on (small-area rule, SPEC 5.5c).
COUNTRY_BOX = {
    "Egypt": (24.6, 21.9, 37.0, 31.8),
    "Portugal": (-9.6, 36.9, -6.1, 42.2),  # mainland
    "Argentina": (-73.6, -55.1, -53.6, -21.7),
}

TRAIN_YEARS = tuple(range(2012, 2021))  # before Aqua's overpass drifted later
TEST_YEARS = tuple(range(2021, 2026))

B_GRID = tuple(round(0.20 + 0.02 * i, 2) for i in range(71))  # 0.20 to 1.60
G_GRID = (0.0, 0.25, 0.5, 0.75, 1.0, 1.5)
MONTH_RIDGE = 2.0          # pulls c[month] towards the overall background
Z_CLIP = 2.0               # fire-size term z is kept within -2 to 2
R_CLIP = (0.02, 10.0)      # the year's activity ratio r is kept within these
SEASON_LENGTH = 3          # consecutive calendar months, by mean weekly VIIRS in the training years
RATIO_PSEUDO = 20.0        # cell-days pulling a month's single-satellite ratio to the overall one
MIN_FIRE_WEEKS = 100       # own fit from this many MODIS fire weeks in the training years
MIN_FIRE_WEEKS_ANY = 30    # below this, no harmonized values
BLEND_BAND_PCT = (-54.0, 63.0)  # season band for blended areas: measured at the event on random boxes (docs/event/SMALL_AREAS.md)

MODELS = ("raw", "M0", "M1", "M2", "M3", "M4")

UNIT = "fire_days"                               # the name in code and files
UNIT_LABEL = "hotspot-days (VIIRS-equivalent)"   # the name on screen

# A note per area, shown at the top of its panel. Wording agreed in docs/event/DECISIONS.md.
AREA_NOTES = {
    "Chilecito": "The fire of 27 July to 1 August 2026: VIIRS and MODIS first see it one day apart, "
                 "with about 900 VIIRS detections against 37 MODIS.",
}
