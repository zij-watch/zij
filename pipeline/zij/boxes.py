"""Small areas: random boxes, to see how the small-area rule holds and to get the blend band.

Our pre-event notes describe two sets and give no coordinates: 10 random
0.3 degree boxes, and 83 random boxes of 0.2 to 0.8 degree whose blended ones
(30 to 99 MODIS fire weeks) were pooled into one season band, -47% to +60%.
The boxes here are drawn new, to that description, with a fixed seed.

Each box goes through the same steps as a named area (harmonize.py): the
single-satellite adjustment, M4 with the small-area rule, leave one year out
over 2012 to 2020, and out of time on 2021 to 2025.

Writes data/processed/calibration/random_boxes.json and docs/event/SMALL_AREAS.md.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import duckdb
import numpy as np

from . import areas as p
from . import config as c
from . import harmonize as h
from . import models as m
from . import validate as v

SEED = 20261113
TEN_SIZE = 0.3
POOL_SIZES = (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)
POOL_N = 83
RESEARCH_COUNTRIES = ("Egypt", "Portugal")  # the countries of our pre-event research
OUT = c.PROCESSED / "calibration" / "random_boxes.json"
REPORT = c.REPO / "docs" / "event" / "SMALL_AREAS.md"


def draw(con: duckdb.DuckDBPyConnection, rng: np.random.Generator, country: str, n: int, sizes) -> list[tuple]:
    """Boxes on the 0.1 degree grid, each around a random cell that had a MODIS fire in the training years."""
    west, south, east, north = p.COUNTRY_BOX[country]
    cells = con.sql(f"""
        SELECT DISTINCT cell_lat, cell_lon FROM cell_weeks
        WHERE country = '{country}' AND family = 'MODIS'
          AND isoyear(week_start) BETWEEN {p.TRAIN_YEARS[0]} AND {p.TRAIN_YEARS[-1]}
          AND {v._in_box(p.COUNTRY_BOX[country])}
        ORDER BY 1, 2
    """).fetchall()
    boxes = []
    for _ in range(n):
        lat, lon = cells[int(rng.integers(len(cells)))]
        size = float(sizes[int(rng.integers(len(sizes)))])
        k = round(size / c.GRID_DEG)
        w = float(lon) - c.GRID_DEG / 2 - c.GRID_DEG * int(rng.integers(k))
        s = float(lat) - c.GRID_DEG / 2 - c.GRID_DEG * int(rng.integers(k))
        boxes.append((round(w, 1), round(s, 1), round(w + size, 1), round(s + size, 1)))
    return boxes


def evaluate(con, country: str, box, country_train) -> dict:
    rec = h.record(con, country, box)
    sw = h.two_satellite_weeks(con, country, box)
    rec["M_adj"] = v.adjust_single_satellite(rec, h.ratios_from(sw))
    full = (rec.V.notna() & ~rec.modis_partial.astype(bool) & ~rec.viirs_partial.astype(bool)).to_numpy()
    train = rec[full & rec.year.isin(p.TRAIN_YEARS).to_numpy()].reset_index(drop=True)
    season = m.season_months(train.V.to_numpy(float), train.month.to_numpy())
    af = m.fit_area("M4", h._arr(train), h._arr(country_train), season)
    out = {"country": country, "box": list(box), "season": season, "mode": af["mode"],
           "n_fire_weeks": af["n_fire_weeks"], "loyo_pct": {}, "out_of_time_pct": {}, "own_fit_loyo_pct": {}}

    def season_error(pred, rows) -> float | None:
        ins = rows.month.isin(season).to_numpy()
        actual = rows.V.to_numpy(float)[ins].sum()
        return float(100 * (pred[ins].sum() / actual - 1)) if actual > 0 else None

    for year in p.TRAIN_YEARS:
        rows = train[train.year == year]
        if rows.empty:
            continue
        rest = train[train.year != year]
        fold = m.fit_area("M4", h._arr(rest), h._arr(country_train[country_train.year != year]), season)
        if fold["mode"] != "none":
            out["loyo_pct"][year] = season_error(h._predict(fold, h._arr(rows)), rows)
        # The area's own fit whatever its size: what the rule saves us from below 100 fire weeks.
        own = m.fit_area("M4", h._arr(rest), None, season)
        out["own_fit_loyo_pct"][year] = season_error(h._predict(own, h._arr(rows)), rows)
    if af["mode"] != "none":
        for year in p.TEST_YEARS:
            rows = rec[full & (rec.year == year).to_numpy()]
            if not rows.empty:
                out["out_of_time_pct"][year] = season_error(h._predict(af, h._arr(rows)), rows)
    return out


def _errors(results: list[dict], key: str) -> np.ndarray:
    return np.array([e for r in results for e in r[key].values() if e is not None], float)


def _band(errors: np.ndarray) -> str:
    if len(errors) < 5:
        return "-"
    lo, hi = np.quantile(errors, [0.1, 0.9])
    return f"{lo:+.0f}% to {hi:+.0f}%"


def _median_abs(errors: np.ndarray) -> str:
    return f"{np.median(np.abs(errors)):.0f}%" if len(errors) else "-"


def _classes(results: list[dict]) -> list[list]:
    rows = []
    for label, pick in (("100 or more (own fit)", lambda r: r["n_fire_weeks"] >= p.MIN_FIRE_WEEKS),
                        ("30 to 99 (blend)", lambda r: r["mode"] == "blend"),
                        ("under 30 (no fit; own fit shown)", lambda r: r["n_fire_weeks"] < p.MIN_FIRE_WEEKS_ANY)):
        group = [r for r in results if pick(r)]
        key = "own_fit_loyo_pct" if label.startswith("under") else "loyo_pct"
        e = _errors(group, key)
        own = _errors(group, "own_fit_loyo_pct")
        rows.append([label, len(group), len(e), _median_abs(e), _band(e), _median_abs(own),
                     _median_abs(_errors(group, "out_of_time_pct"))])
    return rows


def report(ten: list[dict], pools: dict[str, list[dict]]) -> str:
    header = ["MODIS fire weeks, 2012 to 2020", "Boxes", "Box-years", "Median season error", "10th to 90th percentile",
              "Median with the own fit alone", "Median out of time"]
    research = [r for k in RESEARCH_COUNTRIES for r in pools[k]]
    everything = [r for rs in pools.values() for r in rs]
    blend = _errors([r for r in research if r["mode"] == "blend"], "loyo_pct")
    blend_all = _errors([r for r in everything if r["mode"] == "blend"], "loyo_pct")
    ten_rows = [[r["country"], str(r["box"]), r["n_fire_weeks"], r["mode"],
                 _median_abs(_errors([r], "loyo_pct")), _median_abs(_errors([r], "out_of_time_pct"))] for r in ten]
    per_country = "\n\n".join(f"### {k}: {len(rs)} boxes\n\n{v._table(_classes(rs), header)}" for k, rs in pools.items())
    return f"""# Small areas

Built {datetime.now(timezone.utc).strftime('%d %b %Y, %H:%M UTC')} by `uv run python -m zij boxes`. This file is generated: change the code, not the file.

A drawn area can be much smaller than our named areas. The small-area rule: 100 or more MODIS fire weeks in 2012 to 2020, the area gets its own fit; 30 to 99, a blend of its own fit and the country's fit scaled to the area; under 30, no harmonized values. This page checks the rule on random boxes and gives the season band for blended areas.

Our pre-event notes describe the boxes (10 of 0.3 degree; 83 of 0.2 to 0.8 degree) but not where they were, so these boxes are drawn new, with seed {SEED}: each one is placed around a random cell that had a MODIS fire in 2012 to 2020. Errors are season-total errors, predicted against VIIRS, leave one year out unless said.

## The blend band

Pooled over every blended box in Egypt and Portugal and its leave-one-year-out years: **{_band(blend)}** ({len(blend)} box-years). Our pre-event research: -47% to +60%. With Argentina's boxes added: {_band(blend_all)} ({len(blend_all)} box-years).

## {POOL_N} boxes of 0.2 to 0.8 degree, Egypt and Portugal

Our pre-event research: median error 10 to 16% with an own fit, 25 to 39% with the blend, 49% or worse under 30 fire weeks.

{v._table(_classes(research), header)}

{per_country}

## 10 boxes of 0.3 degree

{v._table(ten_rows, ["Country", "Box [west, south, east, north]", "MODIS fire weeks", "Fit", "Median season error", "Median out of time"])}
"""


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    rng = np.random.default_rng(SEED)
    train = {}
    for country, box in p.COUNTRY_BOX.items():
        df = v.series(con, country, box)
        df["M_adj"] = v.adjust_single_satellite(df, v.single_satellite_ratios(con, country, box))
        train[country] = df[df.year.isin(p.TRAIN_YEARS)]

    ten = [evaluate(con, k, box, train[k]) for k in RESEARCH_COUNTRIES for box in draw(con, rng, k, 5, (TEN_SIZE,))]
    print(f"10 boxes of {TEN_SIZE} degree done", flush=True)
    shares = {"Egypt": POOL_N // 2 + POOL_N % 2, "Portugal": POOL_N // 2, "Argentina": POOL_N}
    pools = {}
    for country, n in shares.items():
        pools[country] = [evaluate(con, country, box, train[country]) for box in draw(con, rng, country, n, POOL_SIZES)]
        modes = [r["mode"] for r in pools[country]]
        print(f"{country}: {n} boxes, own {modes.count('own')}, blend {modes.count('blend')}, none {modes.count('none')}", flush=True)
    con.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"seed": SEED, "ten": ten, "pools": pools}, indent=1), encoding="utf-8")
    REPORT.write_text(report(ten, pools), encoding="utf-8")
    research = [r for k in RESEARCH_COUNTRIES for r in pools[k]]
    print("Blend band, Egypt and Portugal:", _band(_errors([r for r in research if r["mode"] == "blend"], "loyo_pct")),
          "(research: -47% to +60%)")
    print(f"Wrote {OUT} and {REPORT}")
