# Validation

Built 13 Nov 2026, 10:52 UTC by `uv run python -m zij validate`. This file is generated: change the code, not the file.

Can weekly MODIS fire days predict weekly VIIRS fire days? Each model is fitted on 2012 to 2020, the years both sensors flew before Aqua's overpass drifted later, and tested two ways:

- **Leave one year out:** fit on eight of the years 2012 to 2020, predict the ninth.
- **Out of time:** fit on 2012 to 2020, predict 2021 to 2025.

**Season error** is the predicted season total against the VIIRS one, as an absolute percentage, averaged over the years. **Spearman** is the weekly rank correlation within a year (median over the years). An area's season is its 3 busiest VIIRS months in a row. Weeks when either sensor flew fewer than 7 days are left out.

## The models

| Model | Formula |
|---|---|
| raw | V = M (no calibration) |
| M0 | V = k M |
| M1 | V = c + a M^b |
| M2 | V = c[month] + a M^b |
| M3 | V = c[month] + a M^b + d M^b z, z = fire size (log of MODIS FRP per detection) |
| M4 | V = c[month] r^g + a M^b + d M^b z, r = the year's MODIS season total over the typical one; MODIS first put on the Terra + Aqua footing |

## All 8 areas

Mean absolute season error over every area and year, in percent.

| Model | Leave one year out | Out of time | Pre-event research | Spearman, leave one year out | Spearman, out of time |
|---|---|---|---|---|---|
| raw | 76.5 | 74.6 | 77 / 75 | 0.76 | 0.71 |
| M0 | 24.1 | 36.6 | 24 / 37 | 0.76 | 0.71 |
| M1 | 19.1 | 33.5 | 19 / 33 | 0.76 | 0.71 |
| M2 | 19.6 | 33.3 | 20 / 33 | 0.75 | 0.68 |
| M3 | 16.6 | 27.2 | 17 / 27 | 0.75 | 0.68 |
| M4 | 14.2 | 25.2 | 14 / 25 | 0.75 | 0.68 |

## Season error per area

Mean absolute season error in percent: leave one year out, with out of time in brackets.

| Area | raw | M0 | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|---|
| Nile Delta | 91.8 (93.4) | 25.2 (23.6) | 14.0 (17.9) | 10.0 (12.1) | 9.5 (11.8) | 7.0 (10.3) |
| Kafr El Sheikh rice core | 91.5 (94.5) | 23.6 (41.3) | 19.1 (36.8) | 17.3 (25.6) | 17.4 (25.6) | 10.1 (23.7) |
| East Delta (Sharqia) | 91.5 (93.1) | 31.3 (34.7) | 25.5 (29.5) | 22.4 (22.9) | 20.9 (21.7) | 9.9 (18.1) |
| Upper Egypt sugarcane belt | 90.2 (87.1) | 13.2 (45.5) | 13.8 (24.8) | 9.5 (17.1) | 10.1 (17.2) | 11.8 (16.5) |
| Portugal mainland | 62.4 (55.5) | 24.1 (41.4) | 17.9 (46.3) | 27.4 (61.3) | 15.7 (36.4) | 14.0 (31.4) |
| Northern Portugal | 61.5 (56.4) | 27.9 (35.1) | 29.0 (56.9) | 35.9 (68.5) | 23.5 (39.4) | 23.6 (40.6) |
| Central Portugal (Pinhal) | 49.2 (48.9) | 26.7 (32.3) | 13.7 (25.0) | 12.0 (9.3) | 12.8 (14.1) | 12.8 (15.1) |
| Alentejo | 74.0 (67.8) | 20.5 (38.7) | 20.0 (30.6) | 22.0 (49.3) | 22.7 (51.2) | 24.0 (46.1) |

## Weekly Spearman per area

Median over the years: leave one year out, with out of time in brackets.

| Area | raw | M0 | M1 | M2 | M3 | M4 |
|---|---|---|---|---|---|---|
| Nile Delta | 0.72 (0.72) | 0.72 (0.72) | 0.72 (0.72) | 0.78 (0.78) | 0.78 (0.78) | 0.78 (0.78) |
| Kafr El Sheikh rice core | 0.69 (0.58) | 0.69 (0.58) | 0.69 (0.58) | 0.61 (0.46) | 0.61 (0.46) | 0.60 (0.45) |
| East Delta (Sharqia) | 0.64 (0.64) | 0.64 (0.64) | 0.64 (0.64) | 0.69 (0.66) | 0.67 (0.64) | 0.69 (0.65) |
| Upper Egypt sugarcane belt | 0.79 (0.71) | 0.79 (0.71) | 0.79 (0.71) | 0.80 (0.74) | 0.79 (0.74) | 0.79 (0.74) |
| Portugal mainland | 0.93 (0.87) | 0.93 (0.87) | 0.93 (0.87) | 0.92 (0.87) | 0.92 (0.86) | 0.91 (0.86) |
| Northern Portugal | 0.92 (0.89) | 0.92 (0.89) | 0.92 (0.89) | 0.89 (0.84) | 0.89 (0.86) | 0.89 (0.85) |
| Central Portugal (Pinhal) | 0.72 (0.68) | 0.72 (0.68) | 0.72 (0.68) | 0.67 (0.47) | 0.67 (0.46) | 0.67 (0.52) |
| Alentejo | 0.67 (0.62) | 0.67 (0.62) | 0.67 (0.62) | 0.66 (0.62) | 0.68 (0.62) | 0.68 (0.62) |

## The areas

| Area | Country | Season months | MODIS fire weeks, 2012 to 2020 | M4 fit |
|---|---|---|---|---|
| Nile Delta | Egypt | 8, 9, 10 | 404 | own |
| Kafr El Sheikh rice core | Egypt | 8, 9, 10 | 137 | own |
| East Delta (Sharqia) | Egypt | 8, 9, 10 | 180 | own |
| Upper Egypt sugarcane belt | Egypt | 2, 3, 4 | 167 | own |
| Portugal mainland | Portugal | 8, 9, 10 | 401 | own |
| Northern Portugal | Portugal | 8, 9, 10 | 315 | own |
| Central Portugal (Pinhal) | Portugal | 7, 8, 9 | 234 | own |
| Alentejo | Portugal | 10, 11, 12 | 279 | own |

An area with 100 or more MODIS fire weeks gets its own fit. From 30 to 99 it gets a blend of its own fit and the country's fit scaled to the area.
