# Small areas

Built 13 Nov 2026, 11:54 UTC by `uv run python -m zij boxes`. This file is generated: change the code, not the file.

A drawn area can be much smaller than our named areas. The small-area rule: 100 or more MODIS fire weeks in 2012 to 2020, the area gets its own fit; 30 to 99, a blend of its own fit and the country's fit scaled to the area; under 30, no harmonized values. This page checks the rule on random boxes and gives the season band for blended areas.

Our pre-event notes describe the boxes (10 of 0.3 degree; 83 of 0.2 to 0.8 degree) but not where they were, so these boxes are drawn new, with seed 20261113: each one is placed around a random cell that had a MODIS fire in 2012 to 2020. Errors are season-total errors, predicted against VIIRS, leave one year out unless said.

## The blend band

Pooled over every blended box in Egypt and Portugal and its leave-one-year-out years: **-53% to +56%** (270 box-years). Our pre-event research: -47% to +60%. With Argentina's boxes added: -54% to +63% (459 box-years).

## 83 boxes of 0.2 to 0.8 degree, Egypt and Portugal

Our pre-event research: median error 10 to 16% with an own fit, 25 to 39% with the blend, 49% or worse under 30 fire weeks.

| MODIS fire weeks, 2012 to 2020 | Boxes | Box-years | Median season error | 10th to 90th percentile | Median with the own fit alone | Median out of time |
|---|---|---|---|---|---|---|
| 100 or more (own fit) | 25 | 225 | 12% | -26% to +36% | 12% | 20% |
| 30 to 99 (blend) | 34 | 270 | 25% | -53% to +56% | 25% | 34% |
| under 30 (no fit; own fit shown) | 24 | 176 | 41% | -66% to +192% | 41% | - |

### Egypt: 42 boxes

| MODIS fire weeks, 2012 to 2020 | Boxes | Box-years | Median season error | 10th to 90th percentile | Median with the own fit alone | Median out of time |
|---|---|---|---|---|---|---|
| 100 or more (own fit) | 16 | 144 | 9% | -20% to +18% | 9% | 17% |
| 30 to 99 (blend) | 13 | 101 | 19% | -37% to +38% | 17% | 20% |
| under 30 (no fit; own fit shown) | 13 | 104 | 36% | -55% to +271% | 36% | - |

### Portugal: 41 boxes

| MODIS fire weeks, 2012 to 2020 | Boxes | Box-years | Median season error | 10th to 90th percentile | Median with the own fit alone | Median out of time |
|---|---|---|---|---|---|---|
| 100 or more (own fit) | 9 | 81 | 22% | -36% to +51% | 22% | 46% |
| 30 to 99 (blend) | 21 | 169 | 30% | -63% to +67% | 30% | 45% |
| under 30 (no fit; own fit shown) | 11 | 72 | 46% | -67% to +71% | 46% | - |

### Argentina: 83 boxes

| MODIS fire weeks, 2012 to 2020 | Boxes | Box-years | Median season error | 10th to 90th percentile | Median with the own fit alone | Median out of time |
|---|---|---|---|---|---|---|
| 100 or more (own fit) | 35 | 315 | 10% | -24% to +28% | 10% | 12% |
| 30 to 99 (blend) | 24 | 189 | 29% | -55% to +81% | 27% | 32% |
| under 30 (no fit; own fit shown) | 24 | 142 | 51% | -97% to +84% | 51% | - |

## 10 boxes of 0.3 degree

| Country | Box [west, south, east, north] | MODIS fire weeks | Fit | Median season error | Median out of time |
|---|---|---|---|---|---|
| Egypt | [30.7, 31.0, 31.0, 31.3] | 93 | blend | 23% | 30% |
| Egypt | [33.7, 30.9, 34.0, 31.2] | 10 | none | - | - |
| Egypt | [32.2, 25.3, 32.5, 25.6] | 30 | blend | - | 25% |
| Egypt | [32.5, 30.1, 32.8, 30.4] | 2 | none | - | - |
| Egypt | [31.7, 30.3, 32.0, 30.6] | 69 | blend | 31% | 37% |
| Portugal | [-7.8, 37.3, -7.5, 37.6] | 27 | none | - | - |
| Portugal | [-8.0, 41.0, -7.7, 41.3] | 87 | blend | 12% | 61% |
| Portugal | [-7.0, 41.2, -6.7, 41.5] | 42 | blend | 33% | 84% |
| Portugal | [-9.2, 38.9, -8.9, 39.2] | 32 | blend | 34% | 27% |
| Portugal | [-7.9, 41.0, -7.6, 41.3] | 75 | blend | 27% | 47% |
