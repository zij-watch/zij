"""Findings: three questions answered from the harmonized record.

    1. Did burning in the Nile Delta change after Egypt's 2004 ban?
    2. The Delta since 2018, against 2005 to 2017, and the same in two parts of it.
    3. One sentence per named area that the data supports, with its numbers.

Reads the exported area files (app/public/data/areas/, written by `harmonize`)
for the seasons and their bands, and the built database for what the exports do
not hold: counts per satellite split by day and night, and overpass times.

Every comparison that was looked at is written out, not only the clearest one.
The wording of each finding is checked against its numbers at build time: when
a rebuild no longer supports a sentence, the build stops instead of printing it.

Writes app/public/data/findings.json and docs/event/FINDINGS.md.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import duckdb
import numpy as np
import pandas as pd

from . import areas as p
from . import config as c
from .harmonize import EXPORT, slug

REPORT = c.REPO / "docs" / "event" / "FINDINGS.md"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]

# Question 1. The year of the ban is taken from the question, not from the data.
BAN_YEAR = 2004
BEFORE = (2001, 2003)
# Every pair of periods compared, in the order they are printed. None is left out.
COMPARISONS = [
    ((2001, 2003), (2005, 2007), "the three seasons each side of the ban year"),
    ((2001, 2003), (2005, 2011), "every later season that is also converted from MODIS"),
    ((2001, 2003), (2005, 2017), "up to the last season before the fall of 2018"),
    ((2001, 2003), (2018, 2026), "the seasons since the fall of 2018"),
    ((2001, 2003), (2005, 2026), "every season after the ban year"),
    ((2002, 2003), (2005, 2011), "without 2001, the Terra-only season"),
    ((2001, 2004), (2005, 2011), "the ban year counted as before"),
    ((2001, 2003), (2004, 2011), "the ban year counted as after"),
]
# MODIS day and night shares are compared up to 2017 only: after that the overpass times move.
DAYNIGHT_AFTER = [(2005, 2011), (2005, 2017)]
STABLE_YEARS = (2003, 2017)

# Question 2.
REFERENCE = (2005, 2017)
RECENT = (2018, 2026)
VIIRS_REFERENCE = (2012, 2017)
DELTA_AREAS = ("Nile Delta", "Kafr El Sheikh rice core", "East Delta (Sharqia)")


class WordingError(ValueError):
    """A sentence in the findings is no longer what the numbers say."""


def _check(ok: bool, what: str) -> None:
    if not ok:
        raise WordingError(f"The findings text no longer matches the data: {what}. Rewrite it in findings.py.")


# ---------------------------------------------------------------- reading

def load_area(name: str) -> dict:
    return json.loads((EXPORT / "areas" / f"{slug(name)}.json").read_text(encoding="utf-8"))


def season_table(doc: dict) -> pd.DataFrame:
    """Season totals with a range on every row: a measured (VIIRS) season is its own range."""
    s = pd.DataFrame(doc["seasons"])
    s["lo"] = s.lo.astype(float).fillna(s.value)
    s["hi"] = s.hi.astype(float).fillna(s.value)
    return s


def _cells(box) -> str:
    """SQL condition on the 0.1 degree cell indexes: the cells whose centre is in the box."""
    west, south, east, north = (round(v / c.GRID_DEG) for v in box)
    return f"k.gx >= {west} AND k.gx < {east} AND k.gy >= {south} AND k.gy < {north}"


def satellite_seasons(con, country: str, box, season: list[int]) -> pd.DataFrame:
    """Fire cell-days per satellite, season and day or night, with the days the satellite flew.

    A cell counts once per day for each satellite and for each of day and night.
    `scale` puts a season with missing days on the footing of a whole one.
    """
    months = ", ".join(str(m) for m in season)
    counts = con.sql(f"""
        WITH cd AS (
            SELECT DISTINCT k.satellite, k.acq_date AS day, k.gy, k.gx, k.daynight
            FROM classified k JOIN sat_days f ON f.satellite = k.satellite AND f.day = k.acq_date
            WHERE k.country = '{country}' AND k.filter_reason = 'kept' AND {_cells(box)}
              AND month(k.acq_date) IN ({months})
        )
        SELECT CAST(year(day) AS INTEGER) AS year, satellite, daynight, count(*) AS n
        FROM cd GROUP BY ALL
    """).df()
    flown = con.sql(f"""
        SELECT CAST(year(day) AS INTEGER) AS year, satellite, count(*) AS days_flown
        FROM sat_days WHERE month(day) IN ({months}) GROUP BY ALL
    """).df()
    whole = con.sql(f"""
        SELECT CAST(year(d) AS INTEGER) AS year, count(*) AS season_days
        FROM generate_series(DATE '2000-01-01', DATE '2026-12-31', INTERVAL 1 DAY) AS g(d)
        WHERE month(d) IN ({months}) GROUP BY ALL
    """).df()
    wide = counts.pivot_table(index=["year", "satellite"], columns="daynight", values="n", fill_value=0).reset_index()
    for col in ("D", "N"):
        if col not in wide:
            wide[col] = 0
    out = flown.merge(whole, on="year").merge(wide, on=["year", "satellite"], how="left").fillna({"D": 0, "N": 0})
    out["day"], out["night"] = out.D.astype(int), out.N.astype(int)
    out["scale"] = out.season_days / out.days_flown
    return out[["year", "satellite", "days_flown", "season_days", "day", "night", "scale"]].sort_values(["satellite", "year"])


def overpass_times(con, country: str, box, season: list[int]) -> pd.DataFrame:
    """Local solar time of every kept detection in the box and season."""
    west, _, east, _ = box
    months = ", ".join(str(m) for m in season)
    df = con.sql(f"""
        SELECT CAST(year(k.acq_date) AS INTEGER) AS year, k.satellite, k.daynight,
               CAST(substr(lpad(k.acq_time, 4, '0'), 1, 2) AS INTEGER) * 60
                 + CAST(substr(lpad(k.acq_time, 4, '0'), 3, 2) AS INTEGER) AS utc_minute
        FROM classified k
        WHERE k.country = '{country}' AND k.filter_reason = 'kept' AND {_cells(box)}
          AND month(k.acq_date) IN ({months})
    """).df()
    df["local_h"] = (df.utc_minute / 60 + (west + east) / 2 / 15) % 24
    return df


# ---------------------------------------------------------------- arithmetic

def period(s: pd.DataFrame, years: tuple[int, int]) -> dict:
    """Mean season of a period. Its range takes every converted season at its low end, then at its high end."""
    rows = s[s.year.between(*years)]
    return {"years": list(years), "n": int(len(rows)), "n_converted": int((rows.source != "VIIRS").sum()),
            "mean": float(rows.value.mean()), "lo": float(rows.lo.mean()), "hi": float(rows.hi.mean()),
            "median": float(rows.value.median())}


def change(after: dict, before: dict) -> dict:
    """After against before, in percent, with the widest range the two periods' ranges allow."""
    return {"pct": 100 * (after["mean"] / before["mean"] - 1),
            "lo_pct": 100 * (after["lo"] / before["hi"] - 1),
            "hi_pct": 100 * (after["hi"] / before["lo"] - 1)}


def wilson(k: int, n: int) -> tuple[float, float]:
    """95% Wilson interval of a share k / n, in percent."""
    if n == 0:
        return float("nan"), float("nan")
    z = 1.959964
    centre = (k + z * z / 2) / (n + z * z)
    half = z * np.sqrt(k * (n - k) / n + z * z / 4) / (n + z * z)
    return 100 * (centre - half), 100 * (centre + half)


def night_share(sat: pd.DataFrame, satellite: str, years: tuple[int, int]) -> dict:
    rows = sat[(sat.satellite == satellite) & sat.year.between(*years)]
    day, night = int(rows.day.sum()), int(rows.night.sum())
    lo, hi = wilson(night, day + night)
    return {"satellite": satellite, "years": [int(rows.year.min()), int(rows.year.max())], "seasons": int(len(rows)),
            "day": day, "night": night, "night_share_pct": 100 * night / (day + night) if day + night else None,
            "ci95_pct": [lo, hi], "night_per_season": [int(rows.night.min()), int(rows.night.max())]}


# ---------------------------------------------------------------- words

def n0(x: float) -> str:
    return f"{x:,.0f}"


def n1(x: float) -> str:
    return f"{x:,.1f}"


def num(x: float) -> str:
    """Whole numbers from 100 up; one decimal below, unless it is whole."""
    return f"{x:,.0f}" if x >= 100 or float(x).is_integer() else f"{x:,.1f}"


def signed(x: float) -> str:
    return f"{x:+.0f}%"


def span(years) -> str:
    return f"{years[0]} to {years[1]}"


def clock(hours: float) -> str:
    minutes = int(round(hours * 60)) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def months_words(season: list[int]) -> str:
    return f"{MONTHS[season[0] - 1]} to {MONTHS[season[-1] - 1]}"


def below(ch: dict) -> str:
    """'53% below (49% to 57% below)' from a change that is negative over its whole range."""
    return f"{-ch['pct']:.0f}% below ({-ch['hi_pct']:.0f}% to {-ch['lo_pct']:.0f}% below)"


# ---------------------------------------------------------------- question 1

def ban(con, doc: dict) -> dict:
    name, season = doc["name"], doc["fit"]["season"]
    country, box = p.AREAS[name]
    s = season_table(doc)
    _check(s[s.year < 2012].source.eq("MODIS").all() and s[s.year >= 2012].source.eq("VIIRS").all(),
           "seasons before 2012 are converted from MODIS and later ones are VIIRS")
    _check(s[s.terra_only].year.tolist() == [2001], "2001 is the only Terra-only season")
    comparisons = []
    for before_years, after_years, why in COMPARISONS:
        before, after = period(s, before_years), period(s, after_years)
        comparisons.append({"before": before, "after": after, "why": why, "change": change(after, before)})

    sat = satellite_seasons(con, country, box, season)
    same = {}
    for satellite, first in (("Terra", 2001), ("Aqua", 2003)):
        rows = sat[(sat.satellite == satellite) & (sat.year >= first)].copy()
        rows["total"] = (rows.day + rows.night) * rows.scale
        before = rows[rows.year.between(first, BEFORE[1])].total
        windows = []
        for years in ((2005, 2007), (2005, 2011), (2005, 2017)):
            after = rows[rows.year.between(*years)].total
            windows.append({"years": list(years), "mean": float(after.mean()), "times_before": float(after.mean() / before.mean())})
        same[satellite] = {"before_years": [first, BEFORE[1]], "before_seasons": int(len(before)),
                           "before_mean": float(before.mean()), "after": windows,
                           "by_year": {int(y): float(v) for y, v in zip(rows.year, rows.total) if y <= 2017}}

    shares = []
    for satellite, first in (("Terra", 2001), ("Aqua", 2002)):
        shares.append({"period": "before", **night_share(sat, satellite, (first, BEFORE[1]))})
        for years in DAYNIGHT_AFTER:
            shares.append({"period": "after", **night_share(sat, satellite, years)})
    by_year = sat[sat.satellite.isin(["Terra", "Aqua"]) & (sat.year <= 2017)]
    by_year = by_year.pivot(index="year", columns="satellite", values=["day", "night"])

    times = overpass_times(con, country, box, season)
    passes = {}
    for satellite in ("Terra", "Aqua"):
        t = times[(times.satellite == satellite) & times.year.between(2001, 2017)]
        night = t[t.daynight == "N"].local_h
        night = night.where(night >= 12, night + 24)  # an overpass after midnight belongs to the same night
        yearly = times[(times.satellite == satellite) & (times.daynight == "D")].groupby("year").local_h.mean()
        stable = yearly[yearly.index.to_series().between(*STABLE_YEARS)]
        passes[satellite] = {"day_median_local": float(t[t.daynight == "D"].local_h.median()),
                             "night_median_local": float(night.median() % 24),
                             "stable_years": list(STABLE_YEARS),
                             "day_mean_range_stable": [float(stable.min()), float(stable.max())],
                             "day_mean_by_year": {int(y): float(v) for y, v in yearly.items() if y > STABLE_YEARS[1]}}
    for satellite, info in passes.items():
        lo, hi = info["day_mean_range_stable"]
        _check(hi - lo < 0.25, f"{satellite}'s daytime overpass stays within 15 minutes in {span(STABLE_YEARS)}")
        _check(abs(info["day_mean_by_year"][2026] - (lo + hi) / 2) > 1, f"{satellite}'s overpass has moved by over an hour by 2026")

    # The wording below, checked.
    main, since_2018 = comparisons[1], comparisons[3]
    up = [k for k in comparisons if k is not since_2018]
    _check(all(k["change"]["lo_pct"] > 0 for k in up), "every comparison except the one with 2018 on is higher over its whole range")
    _check(since_2018["change"]["lo_pct"] < 0 < since_2018["change"]["hi_pct"], "2018 on against before the ban is not clearly higher or lower")
    pre = s[s.year.between(2001, BAN_YEAR)]
    _check(pre.value.iloc[-1] > pre.value.iloc[0] and s[s.year == 2005].lo.iloc[0] > pre.hi.max(),
           "the record was already rising before the ban year and kept rising after it")
    _check(s[s.year.between(2005, 2017)].lo.min() > s[s.year.between(*BEFORE)].hi.max(),
           "every season of 2005 to 2017 is above every season of 2001 to 2003, bands included")
    _check(all(w["times_before"] > 1.5 for sat_ in same.values() for w in sat_["after"]), "each MODIS satellite alone also counts more after")
    terra_before, terra_after = shares[0], shares[1]
    _check(terra_before["night_share_pct"] > terra_after["night_share_pct"] and shares[3]["night_share_pct"] > shares[4]["night_share_pct"],
           "the night share is lower after than before on both satellites")
    _check(max(r["night_per_season"][1] for r in shares) <= 15, "night cell-days stay at a handful per season")

    return {
        "area": doc["id"], "ban_year": BAN_YEAR, "season": season,
        "season_band_pct": doc["bands"]["season_pct"], "terra_only_season_band_pct": doc["bands"]["terra_only_season_pct"],
        "verdict": {"seasons": "higher_after", "day_night": "cannot_tell", "effect_of_ban": "cannot_tell"},
        "answer": (
            f"Cannot tell whether the ban changed burning. What the record shows is that detected burning did not fall "
            f"after {BAN_YEAR}: the {months_words(season)} total averaged {n0(main['before']['mean'])} in {span(main['before']['years'])} "
            f"and {n0(main['after']['mean'])} in {span(main['after']['years'])}, {signed(main['change']['pct'])} "
            f"({signed(main['change']['lo_pct'])} to {signed(main['change']['hi_pct'])}). The rise had started before the ban, "
            f"there are only three seasons before it, and one of them is Terra alone. The seasons since 2018 are back near the "
            f"level of before the ban ({signed(since_2018['change']['pct'])}, {signed(since_2018['change']['lo_pct'])} to "
            f"{signed(since_2018['change']['hi_pct'])}). MODIS night detections are too few to show a move between day and night."),
        "seasons": [{"year": int(r.year), "value": r.value, "lo": r.lo, "hi": r.hi, "source": r.source, "terra_only": bool(r.terra_only),
                     "terra_cell_days": same["Terra"]["by_year"].get(int(r.year)), "aqua_cell_days": same["Aqua"]["by_year"].get(int(r.year))}
                    for r in s[s.year <= 2017].itertuples()],
        "comparisons": comparisons,
        "one_satellite": same,
        "day_night": {"unit": "fire cell-days per satellite, day and night counted apart", "shares": shares,
                      "by_year": [{"year": int(y), "terra_day": int(by_year.loc[y, ("day", "Terra")]), "terra_night": int(by_year.loc[y, ("night", "Terra")]),
                                   "aqua_day": None if y < 2002 else int(by_year.loc[y, ("day", "Aqua")]),
                                   "aqua_night": None if y < 2002 else int(by_year.loc[y, ("night", "Aqua")])} for y in by_year.index],
                      "overpass": passes},
    }


# ---------------------------------------------------------------- question 2

def since_2018(con, docs: dict[str, dict]) -> dict:
    out = []
    for name in DELTA_AREAS:
        doc = docs[name]
        country, box = p.AREAS[name]
        s = season_table(doc)
        ref, recent = period(s, REFERENCE), period(s, RECENT)
        viirs_ref = period(s, VIIRS_REFERENCE)
        _check(viirs_ref["n_converted"] == 0 and recent["n_converted"] == 0, "2012 on is measured by VIIRS")
        ch = change(recent, ref)
        years = []
        for r in s[s.year.between(*RECENT)].itertuples():
            one = {"mean": r.value, "lo": r.value, "hi": r.value}
            years.append({"year": int(r.year), "value": r.value, "change": change(one, ref),
                          "below_every_reference_season": bool(r.value < s[s.year.between(*REFERENCE)].lo.min())})
        without_last = period(s, (RECENT[0], RECENT[1] - 1))
        recent_values = s[s.year.between(*RECENT)].value.to_numpy(float)
        one_out = [100 * ((recent_values.sum() - x) / (len(recent_values) - 1) / ref["mean"] - 1) for x in recent_values]

        sat = satellite_seasons(con, country, box, doc["fit"]["season"])
        npp = sat[sat.satellite == "N"].copy()
        npp["day_s"], npp["night_s"] = npp.day * npp.scale, npp.night * npp.scale
        a, b = npp[npp.year.between(*VIIRS_REFERENCE)], npp[npp.year.between(*RECENT)]
        t = overpass_times(con, country, box, doc["fit"]["season"])
        t = t[t.satellite == "N"]
        night_h = t[t.daynight == "N"].local_h
        night_h = night_h.where(night_h >= 12, night_h + 24)
        nrt = con.sql(f"""
            SELECT count(*) FILTER (WHERE k.processing = 'NRT') * 100.0 / count(*)
            FROM classified k WHERE k.country = '{country}' AND k.family = 'VIIRS' AND k.filter_reason = 'kept' AND {_cells(box)}
              AND year(k.acq_date) = {RECENT[1]} AND month(k.acq_date) IN ({", ".join(str(m) for m in doc["fit"]["season"])})
        """).fetchone()[0]
        out.append({
            "area": doc["id"], "name": name, "season": doc["fit"]["season"], "season_band_pct": doc["bands"]["season_pct"],
            "reference": ref, "recent": recent, "change": ch,
            "change_median_pct": 100 * (recent["median"] / ref["median"] - 1),
            "viirs_only": {"reference": viirs_ref, "change_pct": 100 * (recent["mean"] / viirs_ref["mean"] - 1)},
            "without_last_season": {"recent": without_last, "change": change(without_last, ref)},
            "one_season_left_out_pct": [min(one_out), max(one_out)],
            "years": years,
            "seasons_below_every_reference_season": int(sum(y["below_every_reference_season"] for y in years)),
            "last_season_near_real_time_pct": float(nrt),
            "suomi_npp_day_night": {
                "day_median_local": float(t[t.daynight == "D"].local_h.median()), "night_median_local": float(night_h.median() % 24),
                "before_years": list(VIIRS_REFERENCE), "after_years": list(RECENT),
                "day_before": float(a.day_s.mean()), "day_after": float(b.day_s.mean()),
                "night_before": float(a.night_s.mean()), "night_after": float(b.night_s.mean()),
                "day_change_pct": 100 * (b.day_s.mean() / a.day_s.mean() - 1),
                "night_change_pct": 100 * (b.night_s.mean() / a.night_s.mean() - 1)},
        })

    delta, kafr, sharqia = out
    for a in out:
        _check(a["change"]["hi_pct"] < -40, f"{a['name']} is more than 40% below over its whole range")
        _check(a["seasons_below_every_reference_season"] >= 7 and not next(y for y in a["years"] if y["year"] == 2023)["below_every_reference_season"],
               f"{a['name']}: at least seven of the nine seasons are below every reference season, and 2023 is not")
        _check(a["last_season_near_real_time_pct"] > 99, "the 2026 season is near-real-time data")
        _check(a["suomi_npp_day_night"]["day_change_pct"] < a["suomi_npp_day_night"]["night_change_pct"], "the fall is larger by day than by night")
    _check(kafr["change"]["hi_pct"] < sharqia["change"]["lo_pct"], "Kafr El Sheikh is further below than Sharqia, conversion bands included")
    _check(kafr["one_season_left_out_pct"][1] > sharqia["one_season_left_out_pct"][0],
           "leaving one season out moves each area by more than the gap between them")
    low = {a["name"]: min(a["years"], key=lambda y: y["value"]) for a in out}
    _check(low[kafr["name"]]["year"] == 2026 and low[sharqia["name"]]["year"] == 2018, "Kafr El Sheikh is lowest in 2026 and Sharqia in 2018")

    return {
        "reference_years": list(REFERENCE), "recent_years": list(RECENT),
        "verdict": {"delta": "lower", "same_in_kafr_el_sheikh_and_sharqia": "both_lower_gap_cannot_tell"},
        "answer": (
            f"The Nile Delta's {months_words(delta['season'])} seasons of {span(RECENT)} average {n0(delta['recent']['mean'])} hotspot-days, "
            f"{below(delta['change'])} the {n0(delta['reference']['mean'])} of {span(REFERENCE)}. It is not a steady low: 2023 came back to "
            f"{n0(next(y['value'] for y in delta['years'] if y['year'] == 2023))}. Kafr El Sheikh is {below(kafr['change'])} and Sharqia "
            f"{below(sharqia['change'])}: both fell by more than half. Kafr El Sheikh is {sharqia['change']['pct'] - kafr['change']['pct']:.0f} points "
            f"further down, a gap smaller than what leaving out one season does to either figure, so whether it fell further: cannot tell. "
            f"The lowest season is {low[kafr['name']]['year']} in Kafr El Sheikh and {low[sharqia['name']]['year']} in Sharqia."),
        "areas": out,
    }


# ---------------------------------------------------------------- question 3

def year_totals(doc: dict) -> pd.Series:
    """Calendar-year totals, for the years with all 12 months complete."""
    m = pd.DataFrame(doc["months"])
    g = m.groupby("year").agg(value=("value", "sum"), complete=("complete", "sum"), converted=("source", lambda x: (x != "VIIRS").any()))
    return g[g.complete == 12]


def area_sentences(con, docs: dict[str, dict], q2: dict) -> list[dict]:
    facts = []

    def add(name: str, sentence: str, numbers: dict, note: str | None = None) -> None:
        doc = docs[name]
        facts.append({"id": doc["id"], "name": name, "country": doc["country"], "sentence": sentence,
                      "numbers": numbers, **({"note": note} if note else {})})

    def typical(doc: dict) -> list[float]:
        return doc["climatology"]["months"]["median"]

    near_real_time = "The 2026 season is near-real-time data, which FIRMS replaces with standard processing later."

    # Nile Delta: the answer to question 2.
    d = q2["areas"][0]
    back = [y for y in d["years"] if y["change"]["hi_pct"] > -20]
    _check([y["year"] for y in back] == [2023], "2023 is the only Delta season since 2018 within 20% of the reference")
    add("Nile Delta",
        f"Since 2018 satellites have seen about half as much burning in the Nile Delta in {months_words(d['season'])} as before: {n0(d['recent']['mean'])} "
        f"hotspot-days a season against {n0(d['reference']['mean'])} in {span(REFERENCE)}, and only 2023 ({n0(back[0]['value'])}) came back near the old level.",
        {"unit": "hotspot-days per season", "recent_years": d["recent"]["years"], "recent_mean": d["recent"]["mean"],
         "reference_years": d["reference"]["years"], "reference_mean": d["reference"]["mean"],
         "reference_range": [d["reference"]["lo"], d["reference"]["hi"]], "change_pct": d["change"]["pct"],
         "change_range_pct": [d["change"]["lo_pct"], d["change"]["hi_pct"]], "season_2023": back[0]["value"]}, near_real_time)

    # Kafr El Sheikh: the two quietest measured seasons are the last two.
    name = "Kafr El Sheikh rice core"
    s = season_table(docs[name])
    v = s[s.source == "VIIRS"].sort_values("value")
    early = s[s.year.between(*VIIRS_REFERENCE)].value.mean()
    _check(sorted(v.year.iloc[:2].tolist()) == [2025, 2026], "2025 and 2026 are the two lowest VIIRS seasons in Kafr El Sheikh")
    y25, y26 = (float(s[s.year == y].value.iloc[0]) for y in (2025, 2026))
    add(name,
        f"In the rice fields of Kafr El Sheikh the last two seasons are the quietest VIIRS has measured: {n0(y25)} hotspot-days in 2025 and "
        f"{num(y26)} in 2026, against {n0(early)} a season in {span(VIIRS_REFERENCE)}.",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"], "season_2025": y25, "season_2026": y26,
         "viirs_seasons": int(len(v)), "reference_years": list(VIIRS_REFERENCE), "reference_mean": float(early),
         "next_lowest": {"year": int(v.year.iloc[2]), "value": float(v.value.iloc[2])}}, near_real_time)

    # Sharqia: the fall came in one year.
    name = "East Delta (Sharqia)"
    s = season_table(docs[name])
    y17, y18 = (float(s[s.year == y].value.iloc[0]) for y in (2017, 2018))
    _check(s[s.year.isin([2017, 2018])].source.eq("VIIRS").all() and y18 < 0.25 * y17, "Sharqia fell by over three quarters from 2017 to 2018, both measured")
    add(name,
        f"In Sharqia the fall came in a single year: {n0(y17)} hotspot-days in the 2017 season and {num(y18)} in 2018, "
        f"{100 * (1 - y18 / y17):.0f}% fewer, both measured by VIIRS with no conversion.",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"], "season_2017": y17, "season_2018": y18,
         "change_pct": 100 * (y18 / y17 - 1)})

    # Upper Egypt: no fall. Same two periods as the Delta.
    name = "Upper Egypt sugarcane belt"
    s = season_table(docs[name])
    ref, recent = period(s, REFERENCE), period(s, RECENT)
    ch = change(recent, ref)
    _check(ch["lo_pct"] > 0, "Upper Egypt is higher in 2018 on than in the reference years over its whole range")
    add(name,
        f"The sugarcane belt of Upper Egypt burns every {months_words(docs[name]['fit']['season'])} and shows no fall like the Delta's: "
        f"{n0(recent['mean'])} hotspot-days a season in {span(RECENT)} against {n0(ref['mean'])} in {span(REFERENCE)} "
        f"({signed(ch['pct'])}, {signed(ch['lo_pct'])} to {signed(ch['hi_pct'])}).",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"], "recent_years": recent["years"], "recent_mean": recent["mean"],
         "reference_years": ref["years"], "reference_mean": ref["mean"], "reference_range": [ref["lo"], ref["hi"]],
         "change_pct": ch["pct"], "change_range_pct": [ch["lo_pct"], ch["hi_pct"]]})

    # Portugal mainland: about a third of the earlier level.
    name = "Portugal mainland"
    s = season_table(docs[name])
    ref, recent = period(s, (2001, 2017)), period(s, RECENT)
    ch = change(recent, ref)
    top = float(s[s.year.between(*RECENT)].value.max())
    reached = [int((s[s.year.between(2001, 2017)][col] > top).sum()) for col in ("lo", "hi")]
    _check(ch["hi_pct"] < -60, "mainland Portugal is more than 60% below over its whole range")
    add(name,
        f"Mainland Portugal's {months_words(docs[name]['fit']['season'])} burning since 2018 runs at less than 40% of what it was: "
        f"{n0(recent['mean'])} hotspot-days a season against {n0(ref['lo'])} to {n0(ref['hi'])} in {span(ref['years'])}, "
        f"and no season since 2018 has passed {n0(top)}.",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"], "recent_years": recent["years"], "recent_mean": recent["mean"],
         "recent_max": top, "reference_years": ref["years"], "reference_mean": ref["mean"], "reference_range": [ref["lo"], ref["hi"]],
         "change_pct": ch["pct"], "change_range_pct": [ch["lo_pct"], ch["hi_pct"]],
         "reference_seasons_above_recent_max": reached, "reference_seasons": ref["n"]},
        f"The conversion runs high in this area ({docs[name]['bands']['season_pct'][0]:+.0f}% to {docs[name]['bands']['season_pct'][1]:+.0f}% on season totals), so the converted mean, "
        f"{n0(ref['mean'])}, sits above its own range; the sentence uses the range.")

    # Northern Portugal: two seasons.
    name = "Northern Portugal"
    t = typical(docs[name])
    quiet = {MONTHS[i]: t[i] for i in (4, 5, 10)}
    _check(t[2] > 2 * max(quiet.values()) and t[7] > t[2] and t[1] > max(quiet.values()), "Northern Portugal has a late-winter rise between quiet months")
    add(name,
        f"Northern Portugal has two burning seasons, not one: a typical March has {n0(t[2])} hotspot-days and a typical August {n0(t[7])}, "
        f"while May, June and November each have {n0(min(quiet.values()))} to {n0(max(quiet.values()))}.",
        {"unit": "hotspot-days per month, median of 2001 to 2025", "february": t[1], "march": t[2], "august": t[7], "september": t[8],
         "may": t[4], "june": t[5], "november": t[10]})

    # Central Portugal: 2017.
    name = "Central Portugal (Pinhal)"
    yt = year_totals(docs[name])
    measured = yt[~yt.converted].value.sort_values(ascending=False)
    m = pd.DataFrame(docs[name]["months"])
    in_season = float(m[(m.year == 2017) & m.month.isin(docs[name]["fit"]["season"])].value.sum())
    june, october = (float(m[(m.year == 2017) & (m.month == k)].value.iloc[0]) for k in (6, 10))
    _check(yt[yt.converted & (yt.value > measured.iloc[0])].index.tolist() == [2003, 2005], "2003 and 2005 are the converted years above 2017")
    _check(measured.index[0] == 2017 and measured.iloc[0] > 2 * measured.iloc[1], "2017 is over twice any other measured year in central Portugal")
    add(name,
        f"In central Portugal 2017 stands far above every other whole year VIIRS has measured ({measured.index.min()} to {measured.index.max()}): "
        f"{n0(measured.iloc[0])} hotspot-days across the year, "
        f"more than twice the next ({n0(measured.iloc[1])} in {measured.index[1]}), with {n0(june + october)} of them in June and October, "
        f"outside the usual {months_words(docs[name]['fit']['season'])} season.",
        {"unit": "hotspot-days per calendar year", "year_2017": float(measured.iloc[0]),
         "next_highest": {"year": int(measured.index[1]), "value": float(measured.iloc[1])},
         "measured_years": [int(measured.index.min()), int(measured.index.max())], "median_year": float(yt.value.median()),
         "june_2017": june, "october_2017": october, "season_2017": in_season,
         "converted_years_above": {int(y): float(val) for y, val in yt[yt.converted & (yt.value > measured.iloc[0])].value.items()}},
        "Two years converted from MODIS are as high or higher: 2003 and 2005, in converted_years_above.")

    # Alentejo: an autumn peak.
    name = "Alentejo"
    t = typical(docs[name])
    _check(t[9] == max(t) and t[10] > max(t[5:9]) and t[9] > 3 * max(t[5:9]), "Alentejo peaks in October and November, well above its summer months")
    add(name,
        f"The Alentejo burns most after the summer, not during it: a typical October has {n0(t[9])} hotspot-days and a typical November {n0(t[10])}, "
        f"against {n0(min(t[5:9]))} to {n0(max(t[5:9]))} in each month from June to September.",
        {"unit": "hotspot-days per month, median of 2001 to 2025", "october": t[9], "november": t[10],
         "june": t[5], "july": t[6], "august": t[7], "september": t[8]})

    # Parana Delta: four seasons far above the rest.
    name = "Parana Delta"
    s = season_table(docs[name])
    big = s.sort_values("value", ascending=False).head(4).sort_values("year")
    rest = s[~s.year.isin(big.year)]
    _check(big.year.tolist() == [2004, 2006, 2008, 2020] and big.lo.min() > 1.4 * rest.hi.max(), "four Parana seasons stand clear of all the others")
    add(name,
        f"In the Parana Delta four seasons stand far above the rest: 2004, 2006, 2008 and 2020 each had about 3,000 hotspot-days in "
        f"{months_words(docs[name]['fit']['season'])} ({n0(big.value.min())} to {n0(big.value.max())}), five times the median season of {n0(s.value.median())}.",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"],
         "big_seasons": [{"year": int(r.year), "value": r.value, "lo": r.lo, "hi": r.hi, "source": r.source} for r in big.itertuples()],
         "median_season": float(s.value.median()), "highest_other": {"year": int(rest.sort_values("value").year.iloc[-1]), "value": float(rest.value.max())}},
        "2004, 2006 and 2008 are converted from MODIS: their ranges are in big_seasons. 2020 is measured.")

    # Chilecito: a big fire is few cell-days.
    name = "Chilecito"
    country, box = p.AREAS[name]
    s = season_table(docs[name])
    fire = con.sql(f"""
        SELECT count(*) AS detections, count(DISTINCT (k.gy, k.gx)) AS cells, count(DISTINCT k.acq_date) AS days
        FROM classified k WHERE k.country = '{country}' AND k.family = 'VIIRS' AND k.filter_reason = 'kept' AND {_cells(box)}
          AND k.acq_date BETWEEN DATE '2026-07-27' AND DATE '2026-08-01'
    """).fetchone()
    y26 = float(s[s.year == 2026].value.iloc[0])
    others = s[s.year < 2026].value
    _check(850 <= fire[0] <= 950 and others.min() < y26 < others.max(), "the Chilecito fire has about 900 VIIRS detections and 2026 is inside the range of other seasons")
    add(name,
        f"The fire near Chilecito of 27 July to 1 August 2026 gave about 900 VIIRS detections but burned in only {fire[1]} grid cells, so the 2026 season "
        f"counts {n0(y26)} hotspot-days, inside the range of other years ({n0(others.min())} to {n0(others.max())}): this unit counts places and days with fire, not the size of a fire.",
        {"unit": "hotspot-days per season", "season": docs[name]["fit"]["season"], "fire_days": ["2026-07-27", "2026-08-01"],
         "viirs_detections": int(fire[0]), "grid_cells": int(fire[1]), "days_with_detections": int(fire[2]), "cell_deg": c.GRID_DEG,
         "season_2026": y26, "other_seasons_range": [float(others.min()), float(others.max())]})
    return facts


# ---------------------------------------------------------------- report

def _clean(x, digits: int = 2):
    if isinstance(x, dict):
        return {str(k): _clean(v, digits) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v, digits) for v in x]
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), digits)
    return x


def _table(head: list[str], rows: list[list]) -> list[str]:
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + ["| " + " | ".join(str(x) for x in r) + " |" for r in rows] + [""]


def _rng(lo: float, hi: float) -> str:
    return f"{n0(lo)} to {n0(hi)}"


def report(doc: dict, built: datetime) -> str:
    q1, q2, facts = doc["ban"], doc["since_2018"], doc["areas"]
    season = months_words(q1["season"])
    cmp_main, cmp_2018 = q1["comparisons"][1], q1["comparisons"][3]
    terra, aqua = q1["one_satellite"]["Terra"], q1["one_satellite"]["Aqua"]
    shares = q1["day_night"]["shares"]
    over = q1["day_night"]["overpass"]
    delta, kafr, sharqia = q2["areas"]
    L = [
        "# Findings", "",
        f"Built {built:%d %b %Y, %H:%M} UTC by `uv run python -m zij findings`. This file is generated: change the code, not the file.", "",
        f"Three questions, answered from the harmonized record of the named areas (data to {doc['last_full_day']}). The same numbers are in "
        "`app/public/data/findings.json` for the app.", "",
        "How to read the numbers:", "",
        f"- The unit is {doc['unit_label']}: a 0.1 degree cell counts once per day for each satellite that saw a fire in it. It counts places and days with "
        "fire. It is not burned area, not smoke, and not the number of fires.",
        "- From 2012 a season is measured by VIIRS. Before 2012 it is MODIS converted with M4, and it comes with a band: the 10th to 90th percentile of "
        "the conversion's error on 2012 to 2020, the years both sensors flew. Eight in ten such seasons fell inside their band; it is not a 95% interval. "
        "A measured season has no conversion band, which does not make it exact.",
        "- 2001 is the only season when MODIS was Terra alone. It carries the wider Terra-only band.",
        "- The range of a period's mean takes every converted season at the low end of its band, then at the high end. The range of a change puts the low "
        "end of one period against the high end of the other. Both are the widest the bands allow.",
        "- Every comparison that was made is printed. None was dropped for looking weaker.", "",
        "## 1. Did burning in the Nile Delta change after Egypt's 2004 ban?", "",
        f"**{q1['answer']}**", "",
        f"The ban year is taken from the question. Nothing in the data dates the ban or says how it was enforced. The season is {season}, the Delta's three "
        f"busiest months. The {BAN_YEAR} season is kept out of both sides, then counted on each side in turn.", "",
        "### The seasons", "",
        f"{season} totals, with the band, and beside them what each MODIS satellite counted on its own (fire cell-days, no conversion).", "",
    ]
    rows = []
    for r in q1["seasons"]:
        what = "VIIRS" if r["source"] == "VIIRS" else ("converted, Terra alone" if r["terra_only"] else "converted")
        rows.append([r["year"], n0(r["value"]), "" if r["source"] == "VIIRS" else _rng(r["lo"], r["hi"]), what,
                     "" if r["terra_cell_days"] is None else n0(r["terra_cell_days"]), "" if r["aqua_cell_days"] is None else n0(r["aqua_cell_days"])])
    L += _table(["Season", "Hotspot-days", "Band", "Source", "Terra, cell-days", "Aqua, cell-days"], rows)
    L += [f"The band of a converted season is {q1['season_band_pct'][0]:+.1f}% to {q1['season_band_pct'][1]:+.1f}% on the conversion's error; 2001, with Terra alone, takes "
          f"the wider {q1['terra_only_season_band_pct'][0]:+.1f}% to {q1['terra_only_season_band_pct'][1]:+.1f}%, measured by replaying 2012 to 2020 without Aqua. "
          "Aqua starts on 4 July 2002 and has two gaps in the 2002 season, so its column starts in 2003.", "",
          "### Before against after, every way it was cut", ""]
    rows = []
    for k in q1["comparisons"]:
        b, a, ch = k["before"], k["after"], k["change"]
        rows.append([f"{span(b['years'])} ({b['n']})", f"{span(a['years'])} ({a['n']})", f"{n0(b['mean'])} ({_rng(b['lo'], b['hi'])})",
                     f"{n0(a['mean'])} ({_rng(a['lo'], a['hi'])})" if a["n_converted"] else f"{n0(a['mean'])} (measured)",
                     f"{signed(ch['pct'])} ({signed(ch['lo_pct'])} to {signed(ch['hi_pct'])})", k["why"]])
    L += _table(["Before (seasons)", "After (seasons)", "Before, mean (range)", "After, mean (range)", "Change (range)", "Why this cut"], rows)
    L += [
        f"Seven of the eight cuts say more burning was detected after {BAN_YEAR}, over the whole of their range. The eighth, which uses the seasons since 2018 as "
        f"\"after\", says about the same as before the ban ({signed(cmp_2018['change']['pct'])}, {signed(cmp_2018['change']['lo_pct'])} to "
        f"{signed(cmp_2018['change']['hi_pct'])}). So the answer depends on which years are called \"after\", and no single cut is the answer.", "",
        "The conversion is not what makes the rise. Each MODIS satellite on its own, counted the same way in every year, shows it too: Terra averaged "
        f"{n0(terra['before_mean'])} fire cell-days a season in {span(terra['before_years'])} and {n0(terra['after'][1]['mean'])} in "
        f"{span(terra['after'][1]['years'])} ({terra['after'][1]['times_before']:.1f} times); Aqua {n0(aqua['before_mean'])} in 2003, its one whole season before the ban year, and "
        f"{n0(aqua['after'][1]['mean'])} in {span(aqua['after'][1]['years'])} ({aqua['after'][1]['times_before']:.1f} times).", "",
        "### Day and night", "",
        "MODIS fire cell-days in the season, day and night overpasses counted apart. The night share is night / (day + night), with a 95% Wilson interval. "
        "The interval treats cell-days as independent, which they are not (one night of burning lights several cells), so the true uncertainty is wider.", "",
    ]
    rows = [[r["satellite"], "Before" if r["period"] == "before" else "After", f"{span(r['years'])} ({r['seasons']})", n0(r["day"]), r["night"],
             f"{r['night_share_pct']:.1f}%", f"{r['ci95_pct'][0]:.1f}% to {r['ci95_pct'][1]:.1f}%", f"{r['night_per_season'][0]} to {r['night_per_season'][1]}"]
            for r in shares]
    L += _table(["Satellite", "", "Seasons", "Day", "Night", "Night share", "95% interval", "Night cell-days in one season"], rows)
    rows = [[r["year"], r["terra_day"], r["terra_night"], "" if r["aqua_day"] is None else r["aqua_day"], "" if r["aqua_night"] is None else r["aqua_night"]]
            for r in q1["day_night"]["by_year"]]
    L += _table(["Season", "Terra day", "Terra night", "Aqua day", "Aqua night"], rows)
    L += [
        f"The night share is lower after {BAN_YEAR}, not higher: on Terra {shares[0]['night_share_pct']:.1f}% before and {shares[1]['night_share_pct']:.1f}% after. "
        f"But that is the day count rising while the night count stays at a handful: {shares[0]['night']} night cell-days in the three seasons before, and "
        f"{shares[1]['night_per_season'][0]} to {shares[1]['night_per_season'][1]} a season after. With counts this small the shares cannot carry a conclusion "
        "either way: **cannot tell**.", "",
        f"The satellites and the two periods are kept apart on purpose. Terra passes at about {clock(over['Terra']['day_median_local'])} and "
        f"{clock(over['Terra']['night_median_local'])} local solar time, Aqua at about {clock(over['Aqua']['day_median_local'])} and "
        f"{clock(over['Aqua']['night_median_local'])}. Aqua is missing from 2001, so a pooled MODIS share would change with the satellite mix alone. "
        f"The comparison stops at 2017 because the orbits drift afterwards: in the 2026 season Terra's daytime detections are at "
        f"{clock(over['Terra']['day_mean_by_year']['2026'])} on average and Aqua's at {clock(over['Aqua']['day_mean_by_year']['2026'])}.", "",
        "### What the data can show", "",
        f"- Detected burning in {season} was higher in every season from 2005 to 2017 than in any season from 2001 to 2003, bands included.",
        "- The rise is in the raw counts of each MODIS satellite, so it is not made by the conversion to VIIRS-equivalent values.",
        f"- The rise began before the ban year (2001 to {BAN_YEAR}: {n0(q1['seasons'][0]['value'])}, {n0(q1['seasons'][1]['value'])}, {n0(q1['seasons'][2]['value'])}, "
        f"{n0(q1['seasons'][3]['value'])}) and shows no break at it.",
        "- No move from day to night is visible at the hours MODIS passes.", "",
        "### What the data cannot show", "",
        "- **Whether the ban had any effect.** There is no record of what would have burned without it. A ban that slowed a rise and a ban that did nothing "
        "look the same here. Rice area, harvest dates and how the straw was handled are not in satellite fire data.",
        "- **A level before the ban worth the name.** Three seasons, one of them Terra alone, on a record that was already climbing.",
        "- **Burning between overpasses.** MODIS looks four times a day. A fire lit after the early-afternoon pass and out before the late-evening one is "
        "never counted, so a move to those hours would read as less burning, and a move out of them as more.",
        "- **Whether the bands hold before 2012.** They are measured on 2012 to 2020. Nothing can test the conversion on 2001 to 2011, because VIIRS was not "
        "flying. If fires then were smaller or timed differently, the converted values are off by an amount the band does not cover.",
        "- **How much straw burned.** Hotspot-days count cells and days, not hectares or tonnes. Small, short or smoke-covered fires are missed by both sensors.", "",
        "## 2. The Delta since 2018", "",
        f"**{q2['answer']}**", "",
        f"Reference: the {len(range(REFERENCE[0], REFERENCE[1] + 1))} seasons of {span(REFERENCE)}, of which {delta['reference']['n_converted']} are converted (with bands) and "
        f"{delta['reference']['n'] - delta['reference']['n_converted']} measured. Recent: the {delta['recent']['n']} seasons of {span(RECENT)}, all measured by VIIRS.", "",
    ]
    rows = []
    for a in q2["areas"]:
        ch, wl = a["change"], a["without_last_season"]["change"]
        rows.append([a["name"], f"{n0(a['reference']['mean'])} ({_rng(a['reference']['lo'], a['reference']['hi'])})", n0(a["recent"]["mean"]),
                     f"{signed(ch['pct'])} ({signed(ch['lo_pct'])} to {signed(ch['hi_pct'])})", signed(a["change_median_pct"]),
                     signed(a["viirs_only"]["change_pct"]), f"{signed(wl['pct'])} ({signed(wl['lo_pct'])} to {signed(wl['hi_pct'])})",
                     f"{signed(a['one_season_left_out_pct'][0])} to {signed(a['one_season_left_out_pct'][1])}",
                     f"{a['seasons_below_every_reference_season']} of {a['recent']['n']}"])
    L += _table(["Area", f"{span(REFERENCE)}, mean (range)", f"{span(RECENT)}, mean", "Change of the mean (range)", "Change of the median",
                 f"Against {span(VIIRS_REFERENCE)} only (no conversion)", "Without 2026 (range)", "One recent season left out", "Seasons below every reference season"], rows)
    L += [
        "The range beside the change of the mean is the conversion band on the reference seasons. \"One recent season left out\" drops each of the nine recent "
        "seasons in turn: it shows how much the figure leans on single years, 2023 above all. "
        "Every way of measuring the fall puts each area more than 50% below, so the result does not hang on the mean, on the conversion, or on 2026. "
        f"\"Below every reference season\" means below the low end of the lowest season of {span(REFERENCE)}.", "",
        "Each season against the reference mean:", "",
    ]
    rows = []
    for i, y in enumerate(delta["years"]):
        cells = [y["year"]]
        for a in q2["areas"]:
            v = a["years"][i]
            cells += [n1(v["value"]), f"{signed(v['change']['pct'])} ({signed(v['change']['lo_pct'])} to {signed(v['change']['hi_pct'])})"]
        rows.append(cells)
    L += _table(["Season", "Nile Delta", "against reference", "Kafr El Sheikh", "against reference", "Sharqia", "against reference"], rows)
    low_k, low_s = min(kafr["years"], key=lambda y: y["value"]), min(sharqia["years"], key=lambda y: y["value"])
    npp = delta["suomi_npp_day_night"]
    L += [
        "**Is it the same in Kafr El Sheikh and Sharqia?** Both fell by more than half: "
        f"{-kafr['change']['pct']:.0f}% below ({-kafr['change']['hi_pct']:.0f}% to {-kafr['change']['lo_pct']:.0f}%) and {-sharqia['change']['pct']:.0f}% below "
        f"({-sharqia['change']['hi_pct']:.0f}% to {-sharqia['change']['lo_pct']:.0f}%). Kafr El Sheikh comes out {sharqia['change']['pct'] - kafr['change']['pct']:.0f} points further down, "
        "and the conversion bands alone do not close that gap. But leaving out one recent season moves Kafr El Sheikh between "
        f"{-kafr['one_season_left_out_pct'][1]:.0f}% and {-kafr['one_season_left_out_pct'][0]:.0f}% below and Sharqia between {-sharqia['one_season_left_out_pct'][1]:.0f}% and "
        f"{-sharqia['one_season_left_out_pct'][0]:.0f}%, far more than the gap. Kafr El Sheikh also has the smallest counts and the widest conversion band "
        f"({kafr['season_band_pct'][0]:+.0f}% to {kafr['season_band_pct'][1]:+.0f}% on season totals). Whether it fell further than Sharqia: **cannot tell**. "
        "The shape over the years is alike: both drop in 2018, come back in 2023 and fall again. They differ in where the bottom is: Sharqia's lowest season is "
        f"{low_s['year']} ({n1(low_s['value'])}, {signed(low_s['change']['pct'])}), the first year of the fall; Kafr El Sheikh's is {low_k['year']} "
        f"({n1(low_k['value'])}, {signed(low_k['change']['pct'])}).", "",
        "Three cautions:", "",
        f"- **2026 is near-real-time data.** FIRMS had not yet published standard processing for {season} 2026 when this was built "
        f"({delta['last_season_near_real_time_pct']:.0f}% of the Delta's kept VIIRS detections in that season are near real time). Those rows will be replaced. "
        "The column \"Without 2026\" is the fall with that season left out.",
        "- **The fall is mostly at the early-afternoon overpass.** Suomi NPP alone, Nile Delta, fire cell-days a season: by day "
        f"{n0(npp['day_before'])} in {span(npp['before_years'])} and {n0(npp['day_after'])} in {span(npp['after_years'])} ({signed(npp['day_change_pct'])}); by night "
        f"{n0(npp['night_before'])} and {n0(npp['night_after'])} ({signed(npp['night_change_pct'])}). In Kafr El Sheikh {signed(kafr['suomi_npp_day_night']['day_change_pct'])} by day and "
        f"{signed(kafr['suomi_npp_day_night']['night_change_pct'])} by night (about {n0(kafr['suomi_npp_day_night']['night_before'])} night cell-days a season, too few to lean on); in Sharqia "
        f"{signed(sharqia['suomi_npp_day_night']['day_change_pct'])} and {signed(sharqia['suomi_npp_day_night']['night_change_pct'])}. Suomi NPP passes at about {clock(npp['day_median_local'])} and "
        f"{clock(npp['night_median_local'])} local solar time. How much burning there is at other hours, the data cannot say.",
        "- **A fall in detections is not a measured fall in straw burned.** Fewer hotspot-days can come from less burning, from smaller or shorter fires, or from "
        "burning at hours no satellite passes. The record cannot separate these, and it says nothing about why.", "",
        "## 3. One sentence per area", "",
        "Each sentence is checked against its numbers when this file is built.", "",
    ]
    for f in facts:
        L += [f"### {f['name']}", "", f["sentence"], ""]
        L += ["Numbers: `" + json.dumps(f["numbers"], separators=(", ", ": ")) + "`", ""]
        if "note" in f:
            L += [f["note"], ""]
    L += [
        "## Where these numbers come from", "",
        "`pipeline/zij/findings.py`. Seasons, bands and typical months are read from the exported area files (`app/public/data/areas/`, format in "
        "`DATA_CONTRACT.md`). Counts per satellite by day and night, overpass times and the Chilecito fire come from the built database, after the same "
        "filters as everything else (type, confidence, static-source mask). To rebuild, from `pipeline/`:", "",
        "    uv run python -m zij build", "    uv run python -m zij findings", "",
        "`findings` reads the area files as committed; run `harmonize` first to rebuild those too.", "",
    ]
    return "\n".join(L)


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    index = json.loads((EXPORT / "index.json").read_text(encoding="utf-8"))
    docs = {name: load_area(name) for name in p.AREAS}
    q1 = ban(con, docs["Nile Delta"])
    q2 = since_2018(con, docs)
    facts = area_sentences(con, docs, q2)
    con.close()
    _check([f["name"] for f in facts] == list(p.AREAS), "one sentence for each named area, in order")

    built = datetime.now(timezone.utc)
    doc = _clean({
        "built_at_utc": built.isoformat(timespec="seconds"), "last_full_day": index["last_full_day"],
        "unit": p.UNIT, "unit_label": p.UNIT_LABEL,
        "band_note": "Ranges on converted (MODIS) seasons are the 10th to 90th percentile of the conversion error on 2012 to 2020. "
                     "A period's range takes every converted season at one end of its band; a change's range sets one period's low against the other's high.",
        "ban": q1, "since_2018": q2, "areas": facts,
    })
    (EXPORT / "findings.json").write_text(json.dumps(doc, indent=1, allow_nan=False), encoding="utf-8")
    REPORT.write_text(report(doc, built), encoding="utf-8")

    print("\n1. " + doc["ban"]["answer"])
    print("\n2. " + doc["since_2018"]["answer"])
    print("\n3. One sentence per area")
    for f in doc["areas"]:
        print(f"  {f['name']}: {f['sentence']}")
    print(f"\nWrote {EXPORT / 'findings.json'} and {REPORT}")
