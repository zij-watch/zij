"""The harmonized record of every named area, and the files the app reads.

For each area:
  1. the weekly record from November 2000 to the last full day: VIIRS where it
     flew, MODIS converted with M4 before that, each MODIS value with a band;
  2. the Terra-only test: how a season comes out when MODIS is Terra alone,
     before and after the single-satellite correction;
  3. the bands, from leave-one-year-out residuals;
  4. months, seasons, the typical year, the critical period and anomalies;
  5. one JSON file in app/public/data/areas/, described in docs/event/DATA_CONTRACT.md.
"""

from __future__ import annotations

import calendar
import json
import re
from datetime import date, datetime, timedelta, timezone

import duckdb
import numpy as np
import pandas as pd

from . import areas as p
from . import config as c
from . import models as m
from . import validate as v

EXPORT = c.REPO / "app" / "public" / "data"
CONTRACT_VERSION = 1
BASELINE_YEARS = (2001, 2025)   # every complete calendar year in the record
CRITICAL_SHARE = 0.8
PCT_LOW, PCT_HIGH = 10, 90


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ---------------------------------------------------------------- data

def record(con: duckdb.DuckDBPyConnection, country: str, box) -> pd.DataFrame:
    """One row per week MODIS has data, with VIIRS beside it where VIIRS has data."""
    return con.sql(f"""
        WITH sums AS (
            SELECT family, week_start, sum(fire_days) AS fire_days, sum(hotspots) AS hotspots, sum(frp_sum) AS frp_sum
            FROM cell_weeks WHERE country = '{country}' AND {v._in_box(box)}
            GROUP BY ALL
        )
        SELECT mw.week_start,
               CAST(isoyear(mw.week_start) AS INTEGER) AS year,
               CAST(weekofyear(mw.week_start) AS INTEGER) AS iso_week,
               CAST(month(mw.week_start + 3) AS INTEGER) AS month,
               coalesce(ms.fire_days, 0) AS M,
               CASE WHEN ms.hotspots > 0 THEN ms.frp_sum / ms.hotspots END AS frp,
               coalesce(ms.hotspots, 0) AS modis_hotspots,
               mw.satellites, mw.n_satellites AS n_sat_modis, mw.is_partial AS modis_partial,
               CASE WHEN vw.week_start IS NOT NULL THEN coalesce(vs.fire_days, 0) END AS V,
               CASE WHEN vw.week_start IS NOT NULL THEN coalesce(vs.hotspots, 0) END AS viirs_hotspots,
               vw.n_satellites AS n_sat_viirs, vw.satellites AS viirs_satellites,
               coalesce(vw.is_partial, false) AS viirs_partial
        FROM weeks mw
        LEFT JOIN weeks vw ON vw.week_start = mw.week_start AND vw.family = 'VIIRS' AND NOT vw.no_data
        LEFT JOIN sums ms ON ms.week_start = mw.week_start AND ms.family = 'MODIS'
        LEFT JOIN sums vs ON vs.week_start = mw.week_start AND vs.family = 'VIIRS'
        WHERE mw.family = 'MODIS' AND NOT mw.no_data
        ORDER BY mw.week_start
    """).df()


def two_satellite_weeks(con: duckdb.DuckDBPyConnection, country: str, box) -> pd.DataFrame:
    """Terra and Aqua fire days per week, training-year weeks when both flew all 7 days."""
    return con.sql(f"""
        WITH two_sat AS (
            SELECT week_start FROM sat_weeks
            WHERE family = 'MODIS' AND satellite_days = 7
              AND isoyear(week_start) BETWEEN {p.TRAIN_YEARS[0]} AND {p.TRAIN_YEARS[-1]}
            GROUP BY week_start HAVING count(*) = 2
        ), per AS (
            SELECT satellite, week_start, sum(fire_days) AS n
            FROM cell_week_sat WHERE country = '{country}' AND family = 'MODIS' AND {v._in_box(box)}
            GROUP BY ALL
        )
        SELECT t.week_start, CAST(isoyear(t.week_start) AS INTEGER) AS year,
               CAST(month(t.week_start + 3) AS INTEGER) AS month,
               coalesce(sum(n) FILTER (WHERE satellite = 'Terra'), 0) AS Terra,
               coalesce(sum(n) FILTER (WHERE satellite = 'Aqua'), 0) AS Aqua
        FROM two_sat t LEFT JOIN per USING (week_start) GROUP BY ALL ORDER BY 1
    """).df()


def ratios_from(sw: pd.DataFrame) -> dict[str, list[float]]:
    """(Terra + Aqua average) / one satellite, by month, pulled to the overall ratio."""
    by_month = sw.groupby("month")[["Terra", "Aqua"]].sum().reindex(range(1, 13), fill_value=0.0)
    average = (by_month.Terra + by_month.Aqua) / 2
    out = {}
    for sat in ("Terra", "Aqua"):
        overall = average.sum() / by_month[sat].sum() if by_month[sat].sum() > 0 else 1.0
        out[sat] = ((average + p.RATIO_PSEUDO * overall) / (by_month[sat] + p.RATIO_PSEUDO)).tolist()
    return out


def satellite_counts(con: duckdb.DuckDBPyConnection, country: str, box) -> pd.DataFrame:
    """Raw counts per satellite and week: fire cell-days, hotspots, days flown."""
    return con.sql(f"""
        WITH per AS (
            SELECT satellite, week_start, sum(fire_days) AS fire_days, sum(hotspots) AS hotspots
            FROM cell_week_sat WHERE country = '{country}' AND {v._in_box(box)}
            GROUP BY ALL
        )
        SELECT s.satellite, s.week_start, s.satellite_days,
               CAST(coalesce(per.fire_days, 0) AS INTEGER) AS fire_days,
               CAST(coalesce(per.hotspots, 0) AS INTEGER) AS hotspots
        FROM sat_weeks s LEFT JOIN per USING (satellite, week_start)
    """).df()


# ---------------------------------------------------------------- fit, tests and bands

def _arr(df: pd.DataFrame, M=None) -> dict:
    return {"M": df.M_adj.to_numpy(float) if M is None else np.asarray(M, float),
            "V": df.V.to_numpy(float), "month": df.month.to_numpy(), "year": df.year.to_numpy(),
            "frp": df.frp.to_numpy(float)}


def _predict(af: dict, a: dict) -> np.ndarray:
    return m.predict_area(af, a["M"], a["month"], a["year"], a["frp"])


def loyo(train: pd.DataFrame, country_train: pd.DataFrame, season: list[int]) -> tuple[np.ndarray, dict[int, dict]]:
    """Leave-one-year-out M4 predictions for every training week, and each year's fit."""
    pred, fits = np.full(len(train), np.nan), {}
    for year in p.TRAIN_YEARS:
        af = m.fit_area("M4", _arr(train[train.year != year]), _arr(country_train[country_train.year != year]), season)
        fits[year] = af
        rows = (train.year == year).to_numpy()
        if af["mode"] != "none" and rows.any():
            pred[rows] = _predict(af, _arr(train[rows]))
    return pred, fits


def terra_only_test(train: pd.DataFrame, sw: pd.DataFrame, fits: dict[int, dict], season: list[int]) -> pd.DataFrame:
    """Each training year replayed with MODIS = Terra alone, as in 2000 to mid 2002.

    The fit and the Terra ratio both leave the year out. Season error before the
    correction (Terra's count used as it is) and after (times the month's ratio).
    """
    rows = []
    for year in p.TRAIN_YEARS:
        af = fits[year]
        terra = sw[sw.year == year].set_index("week_start").Terra
        test = train[(train.year == year) & train.week_start.isin(terra.index)]
        if af["mode"] == "none" or test.empty:
            continue
        ratio = np.asarray(ratios_from(sw[sw.year != year])["Terra"])
        before = test.week_start.map(terra).to_numpy(float)
        after = before * ratio[test.month.to_numpy() - 1]
        ins = test.month.isin(season).to_numpy()
        actual = test.V.to_numpy(float)[ins].sum()
        if actual <= 0:
            continue
        rows.append({"year": year,
                     "before": _predict(af, _arr(test, before))[ins].sum() / actual - 1,
                     "after": _predict(af, _arr(test, after))[ins].sum() / actual - 1,
                     "two_satellites": _predict(af, _arr(test))[ins].sum() / actual - 1})
    return pd.DataFrame(rows)


def bands(train: pd.DataFrame, pred: np.ndarray, season: list[int], terra: pd.DataFrame) -> dict:
    """10th to 90th percentile of the leave-one-year-out errors.

    week_mult: on (value + 1), so a week's band is (P + 1) x lo - 1 to (P + 1) x hi - 1.
    season_pct, terra_only_season_pct: predicted against true season total, in
    percent. The true total lies between P / (1 + hi) and P / (1 + lo).
    """
    ok = np.isfinite(pred)
    week = np.exp(np.quantile(np.log((train.V.to_numpy(float)[ok] + 1) / (pred[ok] + 1)), [0.1, 0.9]))
    errors = []
    for year in p.TRAIN_YEARS:
        rows = ((train.year == year) & train.month.isin(season)).to_numpy() & ok
        actual = train.V.to_numpy(float)[rows].sum()
        if actual > 0:
            errors.append(pred[rows].sum() / actual - 1)
    season_band = np.quantile(errors, [0.1, 0.9]) * 100
    # Months: the same leave-one-year-out predictions, split over days and summed by calendar month.
    both = pd.DataFrame({"week_start": np.repeat(train.week_start.to_numpy()[ok], 7),
                         "actual": np.repeat(train.V.to_numpy(float)[ok], 7) / 7,
                         "predicted": np.repeat(pred[ok], 7) / 7})
    day = pd.to_datetime(both.week_start) + pd.to_timedelta(np.tile(np.arange(7), int(ok.sum())), unit="D")
    by_month = both.groupby([day.dt.year, day.dt.month])[["actual", "predicted"]].sum()
    month = np.exp(np.quantile(np.log((by_month.actual + 1) / (by_month.predicted + 1)), [0.1, 0.9]))
    terra_band = np.quantile(terra.after, [0.1, 0.9]) * 100 if len(terra) else season_band
    return {"week_mult": [round(float(x), 3) for x in week],
            "month_mult": [round(float(x), 3) for x in month],
            "season_pct": [round(float(x), 1) for x in season_band],
            "terra_only_season_pct": [round(float(x), 1) for x in terra_band],
            "season_errors_pct": [round(float(e) * 100, 1) for e in errors]}


# ---------------------------------------------------------------- the record and what is read from it

def harmonize(rec: pd.DataFrame, af: dict, band: dict) -> pd.DataFrame:
    """VIIRS where it has data, otherwise MODIS converted, with the weekly band."""
    out = rec.copy()
    if af["mode"] == "none":
        P = np.full(len(out), np.nan)
    else:
        P = _predict(af, {"M": out.M_adj.to_numpy(float), "month": out.month.to_numpy(),
                          "year": out.year.to_numpy(), "frp": out.frp.to_numpy(float)})
    has_viirs = out.V.notna().to_numpy()
    out["predicted"] = P
    out["value"] = np.where(has_viirs, out.V.to_numpy(float), P)
    out["source"] = np.where(has_viirs, "VIIRS", "MODIS" if af["mode"] != "none" else "none")
    lo_mult, hi_mult = band["week_mult"]
    out["lo"] = np.where(has_viirs, np.nan, np.maximum((P + 1) * lo_mult - 1, 0))
    out["hi"] = np.where(has_viirs, np.nan, (P + 1) * hi_mult - 1)
    out["is_partial"] = out.modis_partial.where(~has_viirs, out.viirs_partial)
    return out


def _flags(values: pd.Series, low: pd.Series, high: pd.Series) -> list:
    return [None if not np.isfinite(x) or not np.isfinite(a) else ("high" if x > b else "low" if x < a else None)
            for x, a, b in zip(values, low, high)]


def _season_range(value: float, source: str, pct: list[float]) -> tuple[float | None, float | None]:
    if source != "MODIS" or not np.isfinite(value):
        return None, None
    return value / (1 + pct[1] / 100), value / (1 + pct[0] / 100)


def daily(h: pd.DataFrame) -> pd.DataFrame:
    """Each week's value spread evenly over its 7 days."""
    days = h.loc[h.index.repeat(7), ["week_start", "value", "source"]].reset_index(drop=True)
    days["day"] = pd.to_datetime(days.week_start) + pd.to_timedelta(np.tile(np.arange(7), len(h)), unit="D")
    days["value"] = days.value / 7
    days["year"], days["month"], days["dom"] = days.day.dt.year, days.day.dt.month, days.day.dt.day
    return days


def months(days: pd.DataFrame, band: dict, last_day: date) -> pd.DataFrame:
    days = days[(days.day.dt.date <= last_day) & days.value.notna()]
    g = days.groupby(["year", "month"])
    out = g.agg(value=("value", "sum"), days_with_data=("value", "size")).reset_index()
    part = days.pivot_table(index=["year", "month"], columns="source", values="value", aggfunc="sum").reset_index()
    out = out.merge(part, on=["year", "month"], how="left")
    for col in ("MODIS", "VIIRS"):
        if col not in out:
            out[col] = np.nan
    out["source"] = np.where(out.MODIS.notna() & out.VIIRS.notna(), "mixed", np.where(out.VIIRS.notna(), "VIIRS", "MODIS"))
    out["complete"] = [n == calendar.monthrange(y, mo)[1] for y, mo, n in zip(out.year, out.month, out.days_with_data)]
    lo_mult, hi_mult = band["month_mult"]
    modis, viirs = out.MODIS.fillna(0), out.VIIRS.fillna(0)
    out["lo"] = np.where(out.source == "VIIRS", np.nan, viirs + np.maximum((modis + 1) * lo_mult - 1, 0))
    out["hi"] = np.where(out.source == "VIIRS", np.nan, viirs + (modis + 1) * hi_mult - 1)
    return out.drop(columns=["MODIS", "VIIRS"])


def _stats(values: pd.Series) -> dict:
    x = values.dropna().to_numpy(float)
    if len(x) == 0:
        return {"median": np.nan, "mean": np.nan, "p10": np.nan, "p25": np.nan, "p75": np.nan, "p90": np.nan, "n_years": 0}
    q = np.percentile(x, [PCT_LOW, 25, 50, 75, PCT_HIGH])
    return {"median": q[2], "mean": x.mean(), "p10": q[0], "p25": q[1], "p75": q[3], "p90": q[4], "n_years": len(x)}


def climatology(h: pd.DataFrame, mo: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, list[int]]:
    """The typical year over the baseline years, and the critical period."""
    base_m = mo[mo.complete & mo.year.between(*BASELINE_YEARS)]
    clim_m = pd.DataFrame([{"month": k, **_stats(base_m[base_m.month == k].value)} for k in range(1, 13)])
    base_w = h[h.year.between(*BASELINE_YEARS) & ~h.is_partial.astype(bool)]
    clim_w = pd.DataFrame([{"iso_week": k, **_stats(base_w[base_w.iso_week == k].value)} for k in range(1, 54)])
    typical = clim_w[clim_w.iso_week <= 52].set_index("iso_week")["mean"].fillna(0)
    order = typical.sort_values(ascending=False, kind="stable")
    n = int(np.searchsorted(order.cumsum().to_numpy(), CRITICAL_SHARE * typical.sum()) + 1) if typical.sum() > 0 else 0
    critical = sorted(int(k) for k in order.index[:n])
    clim_w["critical"] = clim_w.iso_week.isin(critical)
    return clim_m, clim_w, critical


def seasons(h: pd.DataFrame, season: list[int], band: dict, mode: str) -> pd.DataFrame:
    s = h[h.month.isin(season) & h.value.notna()]
    out = s.groupby("year").agg(
        value=("value", "sum"), weeks=("value", "size"),
        modis_weeks=("source", lambda x: int((x == "MODIS").sum())),
        terra_only=("satellites", lambda x: float((x == "Terra").mean())),
        modis=("M", "sum"), viirs=("V", lambda x: x.sum(min_count=1)),
    ).reset_index()
    out = out[out.weeks >= 12]  # a whole season: 3 months are 13 weeks, give or take one
    out["source"] = np.where(out.modis_weeks == 0, "VIIRS", np.where(out.modis_weeks == out.weeks, "MODIS", "mixed"))
    pct = [band["terra_only_season_pct"] if t > 0.5 else band["season_pct"] for t in out.terra_only]
    rng = [_season_range(val, src, q) for val, src, q in zip(out.value, out.source, pct)]
    out["lo"], out["hi"] = [r[0] for r in rng], [r[1] for r in rng]
    base = out[out.year.between(*BASELINE_YEARS)].value
    low, high = (np.percentile(base, [PCT_LOW, PCT_HIGH]) if len(base) else (np.nan, np.nan))
    out["flag"] = _flags(out.value, pd.Series(low, index=out.index), pd.Series(high, index=out.index))
    out["terra_only"] = out.terra_only > 0.5
    return out


def this_month(days: pd.DataFrame, last_day: date) -> dict:
    """The running month against the same days of the baseline years."""
    upto = days[(days.month == last_day.month) & (days.dom <= last_day.day) & days.value.notna()]
    now = upto[(upto.year == last_day.year) & (upto.day.dt.date <= last_day)]
    past = upto[upto.year.between(*BASELINE_YEARS)].groupby("year").agg(value=("value", "sum"), n=("value", "size"))
    past = past[past.n == last_day.day].value
    out = {"year": last_day.year, "month": last_day.month, "days_so_far": int(len(now)),
           "value_to_date": float(now.value.sum()) if len(now) else None, "baseline_n": int(len(past))}
    if len(past):
        q = np.percentile(past, [PCT_LOW, 25, 50, 75, PCT_HIGH])
        out.update({"p10_to_date": q[0], "p25_to_date": q[1], "median_to_date": q[2], "p75_to_date": q[3], "p90_to_date": q[4]})
        if out["value_to_date"] is not None and q[2] > 0:
            out["pct_vs_median"] = 100 * (out["value_to_date"] - q[2]) / q[2]
    return out


# ---------------------------------------------------------------- export

def _clean(x, digits=2):
    if isinstance(x, dict):
        return {k: _clean(val, digits) for k, val in x.items()}
    if isinstance(x, (list, tuple, np.ndarray, pd.Series)):
        return [_clean(val, digits) for val in x]
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), digits)
    if isinstance(x, (date, datetime, pd.Timestamp)):
        return str(x)[:10]
    if x is None or x is pd.NA or x is pd.NaT:
        return None
    return x


def _columns(df: pd.DataFrame, names: list[str]) -> dict:
    return {n: _clean(df[n].tolist()) for n in names}


def build_area(con, name: str, country: str, box, country_cache: dict, last_day: date) -> tuple[dict, dict]:
    rec = record(con, country, box)
    sw = two_satellite_weeks(con, country, box)
    ratios = ratios_from(sw)
    rec["M_adj"] = v.adjust_single_satellite(rec, ratios)

    full = (rec.V.notna() & ~rec.modis_partial.astype(bool) & ~rec.viirs_partial.astype(bool)).to_numpy()
    train = rec[full & rec.year.isin(p.TRAIN_YEARS).to_numpy()].reset_index(drop=True)
    country_train = country_cache[country]
    season = m.season_months(train.V.to_numpy(float), train.month.to_numpy())
    af = m.fit_area("M4", _arr(train), _arr(country_train), season)

    pred, fits = loyo(train, country_train, season)
    terra = terra_only_test(train, sw, fits, season)
    if af["mode"] == "none":
        band = {"week_mult": [None, None], "month_mult": [None, None], "season_pct": [None, None], "terra_only_season_pct": [None, None],
                "season_errors_pct": [], "basis": "none"}
        h = harmonize(rec, af, {"week_mult": [1.0, 1.0]})
    else:
        band = bands(train, pred, season, terra)
        band["basis"] = "own leave-one-year-out errors"
        if af["mode"] == "blend":
            band["own_season_pct"] = band["season_pct"]
            band["season_pct"] = band["terra_only_season_pct"] = list(p.BLEND_BAND_PCT)
            band["basis"] = "pooled small-area band from pre-event research (30 to 99 MODIS fire weeks)"
        h = harmonize(rec, af, band)

    days = daily(h)
    season_band = band if af["mode"] != "none" else {"month_mult": [1.0, 1.0], "season_pct": [0, 0], "terra_only_season_pct": [0, 0]}
    mo = months(days, season_band, last_day)
    clim_m, clim_w, critical = climatology(h, mo)
    mo = mo.merge(clim_m[["month", "p10", "p90", "median"]], on="month")
    mo = mo.sort_values(["year", "month"]).reset_index(drop=True)
    mo["flag"] = [f if ok else None for f, ok in zip(_flags(mo.value, mo.p10, mo.p90), mo.complete)]
    mo["anomaly_pct"] = np.where(mo["median"] > 0, 100 * (mo.value - mo["median"]) / mo["median"], np.nan)
    hw = h.merge(clim_w[["iso_week", "p10", "p90"]], on="iso_week", how="left")
    h["flag"] = [f if not part else None for f, part in zip(_flags(hw.value, hw.p10, hw.p90), h.is_partial.astype(bool))]
    sea = seasons(h, season, season_band, af["mode"])
    month_now = this_month(days, last_day)

    sats = satellite_counts(con, country, box)
    week_index = pd.Index(h.week_start)
    satellites = {}
    for code, (_, label) in c.SATELLITES.items():
        s = sats[sats.satellite == code].set_index("week_start").reindex(week_index)
        if s.satellite_days.notna().any():
            satellites[label] = {"code": code, "family": c.SATELLITES[code][0],
                                 "days": _clean(s.satellite_days.tolist()),
                                 "fire_days": _clean(s.fire_days.tolist()),
                                 "hotspots": _clean(s.hotspots.tolist())}

    west, south, east, north = box
    n_cells = round((east - west) / c.GRID_DEG) * round((north - south) / c.GRID_DEG)
    doc = {
        "contract": CONTRACT_VERSION, "id": slug(name), "name": name, "country": country,
        "box": list(box), "n_cells": int(n_cells), "unit": p.UNIT, "unit_label": p.UNIT_LABEL,
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_full_day": last_day.isoformat(),
        "first_week": str(h.week_start.iloc[0])[:10], "last_week": str(h.week_start.iloc[-1])[:10],
        "fit": {"model": "M4", "mode": af["mode"], "n_fire_weeks": af["n_fire_weeks"], "season": season,
                "train_years": [p.TRAIN_YEARS[0], p.TRAIN_YEARS[-1]],
                "parts": _clean([{**f, "weight": w} for f, w in af["parts"]], 5),
                "single_satellite_ratio": _clean(ratios, 4)},
        "bands": _clean(band, 3),
        "terra_only_test": {"mean_bias_before_pct": _clean(terra.before.mean() * 100 if len(terra) else None, 1),
                            "mean_bias_after_pct": _clean(terra.after.mean() * 100 if len(terra) else None, 1),
                            "mean_bias_two_satellites_pct": _clean(terra.two_satellites.mean() * 100 if len(terra) else None, 1)},
        "weeks": {**_columns(h, ["week_start", "year", "iso_week", "month", "value", "lo", "hi", "source", "flag",
                                 "is_partial", "modis_hotspots", "viirs_hotspots", "n_sat_modis", "n_sat_viirs"]),
                  "modis": _clean(h.M.tolist()), "viirs": _clean(h.V.tolist())},
        "months": _columns(mo, ["year", "month", "value", "lo", "hi", "source", "days_with_data", "complete", "anomaly_pct", "flag"]),
        "seasons": _columns(sea, ["year", "value", "lo", "hi", "source", "terra_only", "flag", "modis", "viirs"]),
        "climatology": {"baseline_years": list(BASELINE_YEARS), "percentiles": [PCT_LOW, PCT_HIGH],
                        "months": _columns(clim_m, ["month", "median", "mean", "p10", "p25", "p75", "p90", "n_years"]),
                        "weeks": _columns(clim_w, ["iso_week", "median", "mean", "p10", "p90", "n_years", "critical"]),
                        "critical_share": CRITICAL_SHARE, "critical_weeks": critical},
        "this_month": _clean(month_now),
        "satellites": satellites,
    }
    report = {"name": name, "country": country, "mode": af["mode"], "n_fire_weeks": af["n_fire_weeks"],
              "season": season, "band": band, "terra": terra, "seasons": sea, "months": mo, "weeks": h,
              "this_month": month_now, "critical": critical}
    return doc, report


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    last_day = con.sql("SELECT last_full_day FROM build_info").fetchone()[0]
    country_cache = {}
    for country, box in p.COUNTRY_BOX.items():
        df = v.series(con, country, box)
        df["M_adj"] = v.adjust_single_satellite(df, v.single_satellite_ratios(con, country, box))
        country_cache[country] = df[df.year.isin(p.TRAIN_YEARS)]

    out_dir = EXPORT / "areas"
    out_dir.mkdir(parents=True, exist_ok=True)
    index, reports = [], {}
    for name, (country, box) in p.AREAS.items():
        doc, rep = build_area(con, name, country, box, country_cache, last_day)
        path = out_dir / f"{doc['id']}.json"
        path.write_text(json.dumps(doc, separators=(",", ":"), allow_nan=False), encoding="utf-8")
        index.append({"id": doc["id"], "name": name, "country": country, "box": list(box), "n_cells": doc["n_cells"],
                      "fit": doc["fit"]["mode"], "n_fire_weeks": doc["fit"]["n_fire_weeks"], "season": doc["fit"]["season"],
                      "file": f"areas/{doc['id']}.json", "bytes": path.stat().st_size})
        reports[name] = rep
        print(f"{name}: {rep['mode']} fit, {rep['n_fire_weeks']} MODIS fire weeks, season {rep['season']}, "
              f"{path.stat().st_size / 1024:.0f} KB", flush=True)
    (EXPORT / "index.json").write_text(json.dumps({
        "contract": CONTRACT_VERSION, "method": "M4", "unit": p.UNIT, "unit_label": p.UNIT_LABEL,
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_full_day": last_day.isoformat(), "areas": index,
    }, indent=1), encoding="utf-8")
    print_report(con, reports, last_day)
    con.close()


def print_report(con, reports: dict, last_day: date) -> None:
    pd.set_option("display.width", 250)
    print("\nBands (10th to 90th percentile of leave-one-year-out errors) and the Terra-only test")
    print("Research, Nile Delta: season -8% to +10%, Terra-only -11% to +9%, week x0.60 to x1.95")
    rows = []
    for name, r in reports.items():
        b, t = r["band"], r["terra"]
        rows.append({"area": name, "fit": r["mode"], "fire weeks": r["n_fire_weeks"],
                     "season %": b["season_pct"], "Terra-only season %": b["terra_only_season_pct"],
                     "month x": b["month_mult"], "week x": b["week_mult"],
                     "Terra bias before %": round(t.before.mean() * 100, 1) if len(t) else None,
                     "after %": round(t.after.mean() * 100, 1) if len(t) else None,
                     "two satellites %": round(t.two_satellites.mean() * 100, 1) if len(t) else None})
    print(pd.DataFrame(rows).to_string(index=False))

    d = reports["Nile Delta"]
    print("\nNile Delta season totals (fire days, VIIRS-equivalent)")
    print(d["seasons"][["year", "value", "lo", "hi", "source", "terra_only", "flag", "modis", "viirs"]].round(0).to_string(index=False))
    mo = d["months"]
    print("\nNile Delta months of 2018, 2019 with a flag")
    print(mo[mo.year.isin([2018, 2019]) & mo.flag.notna()][["year", "month", "value", "median", "p10", "p90", "flag"]].round(1).to_string(index=False))
    print("\nThis month against the median of the same days")
    print(pd.DataFrame([{"area": n, **{k: (round(val, 1) if isinstance(val, float) else val) for k, val in r["this_month"].items()}}
                        for n, r in reports.items()]).to_string(index=False))
    print("\nCritical period (ISO weeks holding 80% of a typical year)")
    for n, r in reports.items():
        print(f"  {n}: {len(r['critical'])} weeks: {r['critical']}")
    west, south, east, north = p.AREAS["Chilecito"][1]
    in_box = f"country = 'Argentina' AND longitude >= {west} AND longitude < {east} AND latitude >= {south} AND latitude < {north}"
    print("\nChilecito: the fire of late July 2026, detections per day in the box")
    print(con.sql(f"""
        SELECT acq_date, count(*) FILTER (WHERE family = 'VIIRS') AS viirs, count(*) FILTER (WHERE family = 'MODIS') AS modis
        FROM classified WHERE {in_box} AND acq_date BETWEEN DATE '2026-07-01' AND DATE '2026-08-05'
        GROUP BY ALL ORDER BY 1
    """).df().to_string(index=False))
    print("\nChilecito, July 2026: detections per satellite")
    print(con.sql(f"""
        SELECT satellite, count(*) AS detections, count(*) FILTER (WHERE filter_reason = 'kept') AS kept,
               count(DISTINCT acq_date) AS days, string_agg(DISTINCT processing, ',') AS processing
        FROM classified WHERE {in_box} AND acq_date BETWEEN DATE '2026-07-01' AND DATE '2026-07-31'
        GROUP BY ALL ORDER BY satellite
    """).df().to_string(index=False))
    print("\nChilecito: first detection per sensor")
    print(con.sql(f"""
        SELECT family, min(acq_date) AS first_detection, min(acq_date) FILTER (WHERE filter_reason = 'kept') AS first_kept,
               count(*) AS detections, count(*) FILTER (WHERE filter_reason = 'kept') AS kept
        FROM classified WHERE {in_box} GROUP BY ALL ORDER BY family
    """).df().to_string(index=False))
