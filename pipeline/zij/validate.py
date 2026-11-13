"""Calibration and validation on the named areas (method steps 5 and 7).

For each area: the weekly MODIS and VIIRS series, the fits of raw and M0 to M4
on 2012 to 2020, and two tests. Leave one year out: fit on the other eight
years, predict the held-out one. Out of time: fit on 2012 to 2020, predict
2021 to 2025. Scores: the season-total error and the weekly Spearman rank
correlation, per year.

Writes data/processed/calibration/ and docs/event/VALIDATION.md.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import duckdb
import numpy as np
import pandas as pd

from . import areas as p
from . import config as c
from . import models as m

OUT = c.PROCESSED / "calibration"
REPORT = c.REPO / "docs" / "event" / "VALIDATION.md"

# What our pre-event research got: mean absolute season error over the 8 areas,
# leave-one-year-out and out-of-time. Printed next to our numbers, never fitted to.
EXPECTED = {"raw": (77, 75), "M0": (24, 37), "M1": (19, 33), "M2": (20, 33), "M3": (17, 27), "M4": (14, 25)}


def _in_box(box) -> str:
    west, south, east, north = box
    return f"cell_lon > {west} AND cell_lon < {east} AND cell_lat > {south} AND cell_lat < {north}"


def series(con: duckdb.DuckDBPyConnection, country: str, box) -> pd.DataFrame:
    """One row per week when both sensors have a full week of data."""
    return con.sql(f"""
        WITH full_weeks AS (
            SELECT mw.week_start, mw.satellites
            FROM weeks mw JOIN weeks vw ON vw.week_start = mw.week_start
            WHERE mw.family = 'MODIS' AND vw.family = 'VIIRS'
              AND NOT mw.no_data AND NOT vw.no_data AND NOT mw.is_partial AND NOT vw.is_partial
        ), sums AS (
            SELECT family, week_start, sum(fire_days) AS fire_days, sum(hotspots) AS hotspots, sum(frp_sum) AS frp_sum
            FROM cell_weeks WHERE country = '{country}' AND {_in_box(box)}
            GROUP BY ALL
        )
        SELECT w.week_start,
               CAST(isoyear(w.week_start) AS INTEGER) AS year,
               CAST(month(w.week_start + 3) AS INTEGER) AS month,
               coalesce(ms.fire_days, 0) AS M,
               coalesce(vs.fire_days, 0) AS V,
               CASE WHEN ms.hotspots > 0 THEN ms.frp_sum / ms.hotspots END AS frp,
               w.satellites
        FROM full_weeks w
        LEFT JOIN sums ms ON ms.week_start = w.week_start AND ms.family = 'MODIS'
        LEFT JOIN sums vs ON vs.week_start = w.week_start AND vs.family = 'VIIRS'
        ORDER BY w.week_start
    """).df()


def single_satellite_ratios(con: duckdb.DuckDBPyConnection, country: str, box) -> dict[str, list[float]]:
    """By calendar month: (Terra + Aqua average) / one satellite alone.

    Measured on the training-year weeks when both flew all 7 days. Each month
    is pulled towards the area's overall ratio by RATIO_PSEUDO cell-days.
    """
    sw = con.sql(f"""
        WITH two_sat AS (
            SELECT week_start FROM sat_weeks
            WHERE family = 'MODIS' AND satellite_days = 7
              AND isoyear(week_start) BETWEEN {p.TRAIN_YEARS[0]} AND {p.TRAIN_YEARS[-1]}
            GROUP BY week_start HAVING count(*) = 2
        ), per AS (
            SELECT satellite, week_start, sum(fire_days) AS v
            FROM cell_week_sat WHERE country = '{country}' AND family = 'MODIS' AND {_in_box(box)}
            GROUP BY ALL
        )
        SELECT CAST(month(b.week_start + 3) AS INTEGER) AS month,
               coalesce(sum(v) FILTER (WHERE satellite = 'Terra'), 0) AS Terra,
               coalesce(sum(v) FILTER (WHERE satellite = 'Aqua'), 0) AS Aqua
        FROM two_sat b LEFT JOIN per USING (week_start) GROUP BY ALL
    """).df().set_index("month").reindex(range(1, 13), fill_value=0.0)
    average = (sw.Terra + sw.Aqua) / 2
    out = {}
    for sat in ("Terra", "Aqua"):
        overall = average.sum() / sw[sat].sum() if sw[sat].sum() > 0 else 1.0
        out[sat] = ((average + p.RATIO_PSEUDO * overall) / (sw[sat] + p.RATIO_PSEUDO)).tolist()
    return out


def adjust_single_satellite(df: pd.DataFrame, ratios: dict[str, list[float]]) -> np.ndarray:
    """MODIS on the Terra + Aqua footing: weeks when one satellite flew alone are scaled."""
    M = df.M.to_numpy(float).copy()
    for sat, ratio in ratios.items():
        alone = (df.satellites == sat).to_numpy()
        M[alone] *= np.asarray(ratio)[df.month.to_numpy()[alone] - 1]
    return M


def _arrays(df: pd.DataFrame, model: str) -> dict:
    """M4 reads MODIS after the single-satellite adjustment; the others read it as counted."""
    return {"M": df.M_adj.to_numpy(float) if model == "M4" else df.M.to_numpy(float),
            "V": df.V.to_numpy(float), "month": df.month.to_numpy(), "year": df.year.to_numpy(),
            "frp": df.frp.to_numpy(float)}


def _spearman(x: np.ndarray, y: np.ndarray) -> float:
    if len(x) < 3 or np.ptp(x) == 0 or np.ptp(y) == 0:
        return float("nan")
    return float(np.corrcoef(pd.Series(x).rank(), pd.Series(y).rank())[0, 1])


def validate_area(name: str, df: pd.DataFrame, country_df: pd.DataFrame) -> tuple[pd.DataFrame, dict, list[int]]:
    train = df[df.year.isin(p.TRAIN_YEARS)]
    country_train = country_df[country_df.year.isin(p.TRAIN_YEARS)]
    season = m.season_months(train.V.to_numpy(float), train.month.to_numpy())
    rows, fits = [], {}
    for model in p.MODELS:
        full = m.fit_area(model, _arrays(train, model), _arrays(country_train, model), season)
        fits[model] = {"mode": full["mode"], "n_fire_weeks": full["n_fire_weeks"],
                       "parts": [{**f, "weight": w} for f, w in full["parts"]]}
        for scheme, years in (("LOYO", p.TRAIN_YEARS), ("out-of-time", p.TEST_YEARS)):
            for year in years:
                test = df[df.year == year]
                if test.empty:
                    continue
                af = full if scheme == "out-of-time" else m.fit_area(
                    model, _arrays(train[train.year != year], model),
                    _arrays(country_train[country_train.year != year], model), season)
                if af["mode"] == "none":
                    continue
                t = _arrays(test, model)
                pred = m.predict_area(af, t["M"], t["month"], t["year"], t["frp"])
                ins = np.isin(t["month"], season)
                actual_season, pred_season = float(t["V"][ins].sum()), float(pred[ins].sum())
                rows.append({
                    "area": name, "scheme": scheme, "model": model, "year": year,
                    "fit": af["mode"], "n_fire_weeks": af["n_fire_weeks"],
                    "actual_season": actual_season, "predicted_season": pred_season,
                    "season_err_pct": 100 * (pred_season - actual_season) / actual_season if actual_season > 0 else np.nan,
                    "spearman": _spearman(t["V"], pred),
                })
    return pd.DataFrame(rows), fits, season


def summarize(v: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Per area and over the 8 areas: mean absolute season error, median weekly Spearman."""
    v = v.assign(abs_err=v.season_err_pct.abs())
    per_area = (v.groupby(["area", "scheme", "model"], sort=False)
                 .agg(season_err_abs_pct=("abs_err", "mean"), season_bias_pct=("season_err_pct", "mean"),
                      spearman=("spearman", "median"), years=("abs_err", "count")).reset_index())
    v = v[v.area.isin(p.RESEARCH_AREAS)]
    per_research = per_area[per_area.area.isin(p.RESEARCH_AREAS)]
    overall = (v.groupby(["scheme", "model"], sort=False)
                .agg(season_err_abs_pct=("abs_err", "mean"), area_years=("abs_err", "count")).reset_index())
    sp = per_research.groupby(["scheme", "model"], sort=False).spearman.mean().reset_index()
    return per_area, overall.merge(sp, on=["scheme", "model"])


def _table(rows: list[list], header: list[str]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(lines)


def _wide(per_area: pd.DataFrame, value: str, digits: int) -> str:
    """Areas down, models across, each cell 'leave-one-year-out (out-of-time)'."""
    rows = []
    for area in p.AREAS:
        row = [area]
        for model in p.MODELS:
            cell = per_area[(per_area.area == area) & (per_area.model == model)].set_index("scheme")[value]
            fmt = lambda s: f"{cell[s]:.{digits}f}" if s in cell.index and np.isfinite(cell[s]) else "-"
            row.append(f"{fmt('LOYO')} ({fmt('out-of-time')})")
        rows.append(row)
    return _table(rows, ["Area"] + list(p.MODELS))


def report(per_area: pd.DataFrame, overall: pd.DataFrame, info: dict) -> str:
    o = overall.set_index(["scheme", "model"])
    rows = []
    for model in p.MODELS:
        lo, ot = o.loc[("LOYO", model)], o.loc[("out-of-time", model)]
        rows.append([model, f"{lo.season_err_abs_pct:.1f}", f"{ot.season_err_abs_pct:.1f}",
                     f"{EXPECTED[model][0]} / {EXPECTED[model][1]}", f"{lo.spearman:.2f}", f"{ot.spearman:.2f}"])
    area_rows = [[a, i["country"], ", ".join(str(x) for x in i["season"]), i["n_fire_weeks"], i["fit"]]
                 for a, i in info.items()]
    return f"""# Validation

Built {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')} by `uv run python -m zij validate`. This file is generated: change the code, not the file.

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

## The 8 research areas

Mean absolute season error over every year of the 8 areas of our pre-event research (Egypt and Portugal), in percent. The two Argentine areas were added at the event and are in the tables below, not in this average.

{_table(rows, ["Model", "Leave one year out", "Out of time", "Pre-event research", "Spearman, leave one year out", "Spearman, out of time"])}

## Season error per area

Mean absolute season error in percent: leave one year out, with out of time in brackets.

{_wide(per_area, "season_err_abs_pct", 1)}

## Weekly Spearman per area

Median over the years: leave one year out, with out of time in brackets.

{_wide(per_area, "spearman", 2)}

## The areas

{_table(area_rows, ["Area", "Country", "Season months", "MODIS fire weeks, 2012 to 2020", "M4 fit"])}

An area with 100 or more MODIS fire weeks gets its own fit. From 30 to 99 it gets a blend of its own fit and the country's fit scaled to the area.
"""


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    OUT.mkdir(parents=True, exist_ok=True)
    country_series = {}
    for country, box in p.COUNTRY_BOX.items():
        df = series(con, country, box)
        df["M_adj"] = adjust_single_satellite(df, single_satellite_ratios(con, country, box))
        country_series[country] = df

    all_rows, all_series, fits_out, info = [], [], {}, {}
    for name, (country, box) in p.AREAS.items():
        df = series(con, country, box)
        ratios = single_satellite_ratios(con, country, box)
        df["M_adj"] = adjust_single_satellite(df, ratios)
        rows, fits, season = validate_area(name, df, country_series[country])
        all_rows.append(rows)
        all_series.append(df.assign(area=name))
        fits_out[name] = {"country": country, "box": list(box), "season": season,
                          "single_satellite_ratio": ratios, "train_years": [p.TRAIN_YEARS[0], p.TRAIN_YEARS[-1]],
                          "fits": fits}
        info[name] = {"country": country, "season": season, "n_fire_weeks": fits["M4"]["n_fire_weeks"],
                      "fit": fits["M4"]["mode"]}
        print(f"{name}: season {season}, {fits['M4']['n_fire_weeks']} MODIS fire weeks, M4 fit {fits['M4']['mode']}", flush=True)
    con.close()

    v = pd.concat(all_rows, ignore_index=True)
    per_area, overall = summarize(v)
    v.to_parquet(OUT / "validation_years.parquet", index=False)
    per_area.to_parquet(OUT / "validation_areas.parquet", index=False)
    pd.concat(all_series, ignore_index=True).to_parquet(OUT / "area_series.parquet", index=False)
    (OUT / "fits.json").write_text(json.dumps(fits_out, indent=1), encoding="utf-8")
    (OUT / "validation_summary.json").write_text(json.dumps({
        "expected_from_research": {k: {"loyo": a, "out_of_time": b} for k, (a, b) in EXPECTED.items()},
        "all_areas": overall.to_dict(orient="records"),
        "per_area": per_area.to_dict(orient="records"),
    }, indent=1), encoding="utf-8")
    REPORT.write_text(report(per_area, overall, info), encoding="utf-8")

    print("\nMean absolute season error over the 8 areas, percent (expected from research in brackets)")
    o = overall.set_index(["scheme", "model"])
    for model in p.MODELS:
        lo, ot = o.loc[("LOYO", model)], o.loc[("out-of-time", model)]
        print(f"  {model:4} LOYO {lo.season_err_abs_pct:5.1f} ({EXPECTED[model][0]})   out-of-time {ot.season_err_abs_pct:5.1f} ({EXPECTED[model][1]})"
              f"   Spearman {lo.spearman:.2f} / {ot.spearman:.2f}   area-years {int(lo.area_years)} / {int(ot.area_years)}")
    print("\nPer area, mean absolute season error (LOYO / out-of-time)")
    print(per_area.pivot_table(index=["area", "scheme"], columns="model", values="season_err_abs_pct", sort=False)[list(p.MODELS)].round(1).to_string())
    print(f"\nWrote {OUT} and {REPORT}")
