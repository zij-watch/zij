# Findings

Built 13 Nov 2026, 17:07 UTC by `uv run python -m zij findings`. This file is generated: change the code, not the file.

Three questions, answered from the harmonized record of the named areas (data to 2026-11-12). The same numbers are in `app/public/data/findings.json` for the app.

How to read the numbers:

- The unit is hotspot-days (VIIRS-equivalent): a 0.1 degree cell counts once per day for each satellite that saw a fire in it. It counts places and days with fire. It is not burned area, not smoke, and not the number of fires.
- From 2012 a season is measured by VIIRS. Before 2012 it is MODIS converted with M4, and it comes with a band: the 10th to 90th percentile of the conversion's error on 2012 to 2020, the years both sensors flew. Eight in ten such seasons fell inside their band; it is not a 95% interval. A measured season has no conversion band, which does not make it exact.
- 2001 is the only season when MODIS was Terra alone. It carries the wider Terra-only band.
- The range of a period's mean takes every converted season at the low end of its band, then at the high end. The range of a change puts the low end of one period against the high end of the other. Both are the widest the bands allow.
- Every comparison that was made is printed. None was dropped for looking weaker.

## 1. Did burning in the Nile Delta change after Egypt's 2004 ban?

**Cannot tell whether the ban changed burning. What the record shows is that detected burning did not fall after 2004: the August to October total averaged 916 in 2001 to 2003 and 1,804 in 2005 to 2011, +97% (+62% to +137%). The rise had started before the ban, there are only three seasons before it, and one of them is Terra alone. The seasons since 2018 are back near the level of before the ban (-4%, -13% to +6%). MODIS night detections are too few to show a move between day and night.**

The ban year is taken from the question. Nothing in the data dates the ban or says how it was enforced. The season is August to October, the Delta's three busiest months. The 2004 season is kept out of both sides, then counted on each side in turn.

### The seasons

August to October totals, with the band, and beside them what each MODIS satellite counted on its own (fire cell-days, no conversion).

| Season | Hotspot-days | Band | Source | Terra, cell-days | Aqua, cell-days |
|---|---|---|---|---|---|
| 2001 | 702 | 641 to 791 | converted, Terra alone | 38 |  |
| 2002 | 1,087 | 984 to 1,186 | converted | 81 |  |
| 2003 | 961 | 870 to 1,049 | converted | 53 | 78 |
| 2004 | 1,251 | 1,133 to 1,366 | converted | 71 | 129 |
| 2005 | 1,623 | 1,470 to 1,772 | converted | 132 | 176 |
| 2006 | 2,014 | 1,825 to 2,199 | converted | 238 | 196 |
| 2007 | 1,788 | 1,620 to 1,952 | converted | 162 | 221 |
| 2008 | 1,720 | 1,558 to 1,878 | converted | 133 | 188 |
| 2009 | 1,851 | 1,677 to 2,021 | converted | 143 | 216 |
| 2010 | 1,907 | 1,727 to 2,082 | converted | 172 | 203 |
| 2011 | 1,725 | 1,563 to 1,883 | converted | 136 | 188 |
| 2012 | 1,609 |  | VIIRS | 113 | 180 |
| 2013 | 2,302 |  | VIIRS | 237 | 303 |
| 2014 | 2,234 |  | VIIRS | 224 | 243 |
| 2015 | 1,713 |  | VIIRS | 172 | 132 |
| 2016 | 2,135 |  | VIIRS | 180 | 240 |
| 2017 | 1,615 |  | VIIRS | 127 | 145 |

The band of a converted season is -8.4% to +10.4% on the conversion's error; 2001, with Terra alone, takes the wider -11.3% to +9.5%, measured by replaying 2012 to 2020 without Aqua. Aqua starts on 4 July 2002 and has two gaps in the 2002 season, so its column starts in 2003.

### Before against after, every way it was cut

| Before (seasons) | After (seasons) | Before, mean (range) | After, mean (range) | Change (range) | Why this cut |
|---|---|---|---|---|---|
| 2001 to 2003 (3) | 2005 to 2007 (3) | 916 (832 to 1,009) | 1,809 (1,638 to 1,974) | +97% (+62% to +137%) | the three seasons each side of the ban year |
| 2001 to 2003 (3) | 2005 to 2011 (7) | 916 (832 to 1,009) | 1,804 (1,634 to 1,970) | +97% (+62% to +137%) | every later season that is also converted from MODIS |
| 2001 to 2003 (3) | 2005 to 2017 (13) | 916 (832 to 1,009) | 1,864 (1,773 to 1,954) | +103% (+76% to +135%) | up to the last season before the fall of 2018 |
| 2001 to 2003 (3) | 2018 to 2026 (9) | 916 (832 to 1,009) | 882 (measured) | -4% (-13% to +6%) | the seasons since the fall of 2018 |
| 2001 to 2003 (3) | 2005 to 2026 (22) | 916 (832 to 1,009) | 1,462 (1,408 to 1,515) | +60% (+40% to +82%) | every season after the ban year |
| 2002 to 2003 (2) | 2005 to 2011 (7) | 1,024 (927 to 1,118) | 1,804 (1,634 to 1,970) | +76% (+46% to +112%) | without 2001, the Terra-only season |
| 2001 to 2004 (4) | 2005 to 2011 (7) | 1,000 (907 to 1,098) | 1,804 (1,634 to 1,970) | +80% (+49% to +117%) | the ban year counted as before |
| 2001 to 2003 (3) | 2004 to 2011 (8) | 916 (832 to 1,009) | 1,735 (1,572 to 1,894) | +89% (+56% to +128%) | the ban year counted as after |

Seven of the eight cuts say more burning was detected after 2004, over the whole of their range. The eighth, which uses the seasons since 2018 as "after", says about the same as before the ban (-4%, -13% to +6%). So the answer depends on which years are called "after", and no single cut is the answer.

The conversion is not what makes the rise. Each MODIS satellite on its own, counted the same way in every year, shows it too: Terra averaged 57 fire cell-days a season in 2001 to 2003 and 159 in 2005 to 2011 (2.8 times); Aqua 78 in 2003, its one whole season before the ban year, and 198 in 2005 to 2011 (2.5 times).

### Day and night

MODIS fire cell-days in the season, day and night overpasses counted apart. The night share is night / (day + night), with a 95% Wilson interval. The interval treats cell-days as independent, which they are not (one night of burning lights several cells), so the true uncertainty is wider.

| Satellite |  | Seasons | Day | Night | Night share | 95% interval | Night cell-days in one season |
|---|---|---|---|---|---|---|---|
| Terra | Before | 2001 to 2003 (3) | 163 | 9 | 5.2% | 2.8% to 9.6% | 2 to 5 |
| Terra | After | 2005 to 2011 (7) | 1,094 | 22 | 2.0% | 1.3% to 3.0% | 1 to 6 |
| Terra | After | 2005 to 2017 (13) | 2,105 | 62 | 2.9% | 2.2% to 3.6% | 1 to 11 |
| Aqua | Before | 2002 to 2003 (2) | 137 | 4 | 2.8% | 1.1% to 7.1% | 1 to 3 |
| Aqua | After | 2005 to 2011 (7) | 1,374 | 14 | 1.0% | 0.6% to 1.7% | 0 to 7 |
| Aqua | After | 2005 to 2017 (13) | 2,606 | 25 | 0.9% | 0.6% to 1.4% | 0 to 7 |

| Season | Terra day | Terra night | Aqua day | Aqua night |
|---|---|---|---|---|
| 2001 | 33 | 5 |  |  |
| 2002 | 79 | 2 | 60 | 3 |
| 2003 | 51 | 2 | 77 | 1 |
| 2004 | 65 | 6 | 127 | 2 |
| 2005 | 127 | 5 | 175 | 1 |
| 2006 | 237 | 1 | 196 | 0 |
| 2007 | 161 | 1 | 214 | 7 |
| 2008 | 131 | 2 | 187 | 1 |
| 2009 | 137 | 6 | 213 | 3 |
| 2010 | 167 | 5 | 203 | 0 |
| 2011 | 134 | 2 | 186 | 2 |
| 2012 | 108 | 5 | 179 | 1 |
| 2013 | 235 | 2 | 301 | 2 |
| 2014 | 215 | 7 | 242 | 1 |
| 2015 | 164 | 8 | 129 | 3 |
| 2016 | 169 | 11 | 237 | 3 |
| 2017 | 120 | 7 | 144 | 1 |

The night share is lower after 2004, not higher: on Terra 5.2% before and 2.0% after. But that is the day count rising while the night count stays at a handful: 9 night cell-days in the three seasons before, and 1 to 6 a season after. With counts this small the shares cannot carry a conclusion either way: **cannot tell**.

The satellites and the two periods are kept apart on purpose. Terra passes at about 10:51 and 22:09 local solar time, Aqua at about 13:13 and 01:58. Aqua is missing from 2001, so a pooled MODIS share would change with the satellite mix alone. The comparison stops at 2017 because the orbits drift afterwards: in the 2026 season Terra's daytime detections are at 09:07 on average and Aqua's at 15:14.

### What the data can show

- Detected burning in August to October was higher in every season from 2005 to 2017 than in any season from 2001 to 2003, bands included.
- The rise is in the raw counts of each MODIS satellite, so it is not made by the conversion to VIIRS-equivalent values.
- The rise began before the ban year (2001 to 2004: 702, 1,087, 961, 1,251) and shows no break at it.
- No move from day to night is visible at the hours MODIS passes.

### What the data cannot show

- **Whether the ban had any effect.** There is no record of what would have burned without it. A ban that slowed a rise and a ban that did nothing look the same here. Rice area, harvest dates and how the straw was handled are not in satellite fire data.
- **A level before the ban worth the name.** Three seasons, one of them Terra alone, on a record that was already climbing.
- **Burning between overpasses.** MODIS looks four times a day. A fire lit after the early-afternoon pass and out before the late-evening one is never counted, so a move to those hours would read as less burning, and a move out of them as more.
- **Whether the bands hold before 2012.** They are measured on 2012 to 2020. Nothing can test the conversion on 2001 to 2011, because VIIRS was not flying. If fires then were smaller or timed differently, the converted values are off by an amount the band does not cover.
- **How much straw burned.** Hotspot-days count cells and days, not hectares or tonnes. Small, short or smoke-covered fires are missed by both sensors.

## 2. The Delta since 2018

**The Nile Delta's August to October seasons of 2018 to 2026 average 882 hotspot-days, 53% below (50% to 55% below) the 1,864 of 2005 to 2017. It is not a steady low: 2023 came back to 1,706. Kafr El Sheikh is 61% below (60% to 64% below) and Sharqia 56% below (53% to 58% below): both fell by more than half. Kafr El Sheikh is 5 points further down, a gap smaller than what leaving out one season does to either figure, so whether it fell further: cannot tell. The lowest season is 2026 in Kafr El Sheikh and 2018 in Sharqia.**

Reference: the 13 seasons of 2005 to 2017, of which 7 are converted (with bands) and 6 measured. Recent: the 9 seasons of 2018 to 2026, all measured by VIIRS.

| Area | 2005 to 2017, mean (range) | 2018 to 2026, mean | Change of the mean (range) | Change of the median | Against 2012 to 2017 only (no conversion) | Without 2026 (range) | One recent season left out | Seasons below every reference season |
|---|---|---|---|---|---|---|---|---|
| Nile Delta | 1,864 (1,773 to 1,954) | 882 | -53% (-55% to -50%) | -50% | -54% | -51% (-53% to -48%) | -58% to -50% | 8 of 9 |
| Kafr El Sheikh rice core | 355 (347 to 386) | 139 | -61% (-64% to -60%) | -63% | -65% | -57% (-61% to -57%) | -67% to -57% | 8 of 9 |
| East Delta (Sharqia) | 541 (514 to 569) | 240 | -56% (-58% to -53%) | -54% | -60% | -53% (-55% to -50%) | -63% to -52% | 8 of 9 |

The range beside the change of the mean is the conversion band on the reference seasons. "One recent season left out" drops each of the nine recent seasons in turn: it shows how much the figure leans on single years, 2023 above all. Every way of measuring the fall puts each area more than 50% below, so the result does not hang on the mean, on the conversion, or on 2026. "Below every reference season" means below the low end of the lowest season of 2005 to 2017.

Each season against the reference mean:

| Season | Nile Delta | against reference | Kafr El Sheikh | against reference | Sharqia | against reference |
|---|---|---|---|---|---|---|
| 2018 | 537.0 | -71% (-73% to -70%) | 115.0 | -68% (-70% to -67%) | 98.5 | -82% (-83% to -81%) |
| 2019 | 622.5 | -67% (-68% to -65%) | 114.5 | -68% (-70% to -67%) | 151.5 | -72% (-73% to -71%) |
| 2020 | 892.5 | -52% (-54% to -50%) | 129.5 | -63% (-66% to -63%) | 241.0 | -55% (-58% to -53%) |
| 2021 | 924.0 | -50% (-53% to -48%) | 140.5 | -60% (-64% to -60%) | 251.0 | -54% (-56% to -51%) |
| 2022 | 944.1 | -49% (-52% to -47%) | 148.8 | -58% (-61% to -57%) | 264.6 | -51% (-54% to -49%) |
| 2023 | 1,706.1 | -8% (-13% to -4%) | 317.0 | -11% (-18% to -9%) | 553.2 | +2% (-3% to +8%) |
| 2024 | 1,117.3 | -40% (-43% to -37%) | 175.9 | -50% (-54% to -49%) | 353.6 | -35% (-38% to -31%) |
| 2025 | 600.5 | -68% (-69% to -66%) | 65.0 | -82% (-83% to -81%) | 138.0 | -75% (-76% to -73%) |
| 2026 | 592.7 | -68% (-70% to -67%) | 41.3 | -88% (-89% to -88%) | 104.7 | -81% (-82% to -80%) |

**Is it the same in Kafr El Sheikh and Sharqia?** Both fell by more than half: 61% below (60% to 64%) and 56% below (53% to 58%). Kafr El Sheikh comes out 5 points further down, and the conversion bands alone do not close that gap. But leaving out one recent season moves Kafr El Sheikh between 57% and 67% below and Sharqia between 52% and 63%, far more than the gap. Kafr El Sheikh also has the smallest counts and the widest conversion band (-15% to +4% on season totals). Whether it fell further than Sharqia: **cannot tell**. The shape over the years is alike: both drop in 2018, come back in 2023 and fall again. They differ in where the bottom is: Sharqia's lowest season is 2018 (98.5, -82%), the first year of the fall; Kafr El Sheikh's is 2026 (41.3, -88%).

Three cautions:

- **2026 is near-real-time data.** FIRMS had not yet published standard processing for August to October 2026 when this was built (100% of the Delta's kept VIIRS detections in that season are near real time). Those rows will be replaced. The column "Without 2026" is the fall with that season left out.
- **The fall is mostly at the early-afternoon overpass.** Suomi NPP alone, Nile Delta, fire cell-days a season: by day 1,736 in 2012 to 2017 and 709 in 2018 to 2026 (-59%); by night 236 and 182 (-23%). In Kafr El Sheikh -66% by day and -6% by night (about 9 night cell-days a season, too few to lean on); in Sharqia -63% and -40%. Suomi NPP passes at about 13:04 and 01:46 local solar time. How much burning there is at other hours, the data cannot say.
- **A fall in detections is not a measured fall in straw burned.** Fewer hotspot-days can come from less burning, from smaller or shorter fires, or from burning at hours no satellite passes. The record cannot separate these, and it says nothing about why.

## 3. One sentence per area

Each sentence is checked against its numbers when this file is built.

### Nile Delta

Since 2018 satellites have seen about half as much burning in the Nile Delta in August to October as before: 882 hotspot-days a season against 1,864 in 2005 to 2017, and only 2023 (1,706) came back near the old level.

Numbers: `{"unit": "hotspot-days per season", "recent_years": [2018, 2026], "recent_mean": 881.85, "reference_years": [2005, 2017], "reference_mean": 1864.41, "reference_range": [1772.89, 1953.5], "change_pct": -52.7, "change_range_pct": [-54.86, -50.26], "season_2023": 1706.12}`

The 2026 season is near-real-time data, which FIRMS replaces with standard processing later.

### Kafr El Sheikh rice core

In the rice fields of Kafr El Sheikh the last two seasons are the quietest VIIRS has measured: 65 hotspot-days in 2025 and 41.3 in 2026, against 395 a season in 2012 to 2017.

Numbers: `{"unit": "hotspot-days per season", "season": [8, 9, 10], "season_2025": 65.0, "season_2026": 41.33, "viirs_seasons": 15, "reference_years": [2012, 2017], "reference_mean": 395.0, "next_lowest": {"year": 2019, "value": 114.5}}`

The 2026 season is near-real-time data, which FIRMS replaces with standard processing later.

### East Delta (Sharqia)

In Sharqia the fall came in a single year: 535 hotspot-days in the 2017 season and 98.5 in 2018, 82% fewer, both measured by VIIRS with no conversion.

Numbers: `{"unit": "hotspot-days per season", "season": [8, 9, 10], "season_2017": 535.0, "season_2018": 98.5, "change_pct": -81.59}`

### Upper Egypt sugarcane belt

The sugarcane belt of Upper Egypt burns every February to April and shows no fall like the Delta's: 225 hotspot-days a season in 2018 to 2026 against 183 in 2005 to 2017 (+23%, +10% to +31%).

Numbers: `{"unit": "hotspot-days per season", "season": [2, 3, 4], "recent_years": [2018, 2026], "recent_mean": 225.29, "reference_years": [2005, 2017], "reference_mean": 182.91, "reference_range": [171.94, 204.89], "change_pct": 23.17, "change_range_pct": [9.95, 31.03]}`

### Portugal mainland

Mainland Portugal's August to October burning since 2018 runs at less than 40% of what it was: 339 hotspot-days a season against 875 to 987 in 2001 to 2017, and no season since 2018 has passed 555.

Numbers: `{"unit": "hotspot-days per season", "season": [8, 9, 10], "recent_years": [2018, 2026], "recent_mean": 338.67, "recent_max": 555.0, "reference_years": [2001, 2017], "reference_mean": 1004.38, "reference_range": [875.43, 987.18], "change_pct": -66.28, "change_range_pct": [-65.69, -61.31], "reference_seasons_above_recent_max": [12, 14], "reference_seasons": 17}`

The conversion runs high in this area (+2% to +22% on season totals), so the converted mean, 1,004, sits above its own range; the sentence uses the range.

### Northern Portugal

Northern Portugal has two burning seasons, not one: a typical March has 91 hotspot-days and a typical August 191, while May, June and November each have 9 to 35.

Numbers: `{"unit": "hotspot-days per month, median of 2001 to 2025", "february": 65.0, "march": 91.09, "august": 190.6, "september": 121.4, "may": 34.71, "june": 19.56, "november": 9.22}`

### Central Portugal (Pinhal)

In central Portugal 2017 stands far above every other whole year VIIRS has measured (2013 to 2025): 474 hotspot-days across the year, more than twice the next (197 in 2025), with 182 of them in June and October, outside the usual July to September season.

Numbers: `{"unit": "hotspot-days per calendar year", "year_2017": 473.58, "next_highest": {"year": 2025, "value": 197.22}, "measured_years": [2013, 2025], "median_year": 147.27, "june_2017": 58.0, "october_2017": 123.86, "season_2017": 218.29, "converted_years_above": {"2003": 475.21, "2005": 618.19}}`

Two years converted from MODIS are as high or higher: 2003 and 2005, in converted_years_above.

### Alentejo

The Alentejo burns most after the summer, not during it: a typical October has 51 hotspot-days and a typical November 33, against 7 to 12 in each month from June to September.

Numbers: `{"unit": "hotspot-days per month, median of 2001 to 2025", "october": 50.56, "november": 33.45, "june": 8.16, "july": 12.37, "august": 9.71, "september": 7.29}`

### Parana Delta

In the Parana Delta four seasons stand far above the rest: 2004, 2006, 2008 and 2020 each had about 3,000 hotspot-days in July to September (2,964 to 3,274), five times the median season of 588.

Numbers: `{"unit": "hotspot-days per season", "season": [7, 8, 9], "big_seasons": [{"year": 2004, "value": 3018.42, "lo": 2486.34, "hi": 4269.33, "source": "MODIS"}, {"year": 2006, "value": 2963.67, "lo": 2441.25, "hi": 4191.9, "source": "MODIS"}, {"year": 2008, "value": 3273.83, "lo": 2696.73, "hi": 4630.59, "source": "MODIS"}, {"year": 2020, "value": 2986.5, "lo": 2986.5, "hi": 2986.5, "source": "VIIRS"}], "median_season": 588.36, "highest_other": {"year": 2022, "value": 1576.82}}`

2004, 2006 and 2008 are converted from MODIS: their ranges are in big_seasons. 2020 is measured.

### Chilecito

The fire near Chilecito of 27 July to 1 August 2026 gave about 900 VIIRS detections but burned in only 8 grid cells, so the 2026 season counts 43 hotspot-days, inside the range of other years (19 to 64): this unit counts places and days with fire, not the size of a fire.

Numbers: `{"unit": "hotspot-days per season", "season": [7, 8, 9], "fire_days": ["2026-07-27", "2026-08-01"], "viirs_detections": 918, "grid_cells": 8, "days_with_detections": 6, "cell_deg": 0.1, "season_2026": 42.57, "other_seasons_range": [19.0, 63.6]}`

## Where these numbers come from

`pipeline/zij/findings.py`. Seasons, bands and typical months are read from the exported area files (`app/public/data/areas/`, format in `DATA_CONTRACT.md`). Counts per satellite by day and night, overpass times and the Chilecito fire come from the built database, after the same filters as everything else (type, confidence, static-source mask). To rebuild, from `pipeline/`:

    uv run python -m zij build
    uv run python -m zij findings

`findings` reads the area files as committed; run `harmonize` first to rebuild those too.
