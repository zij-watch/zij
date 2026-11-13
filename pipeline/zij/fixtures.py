"""Reference values for the TypeScript fit's tests (app/lib/fit/test/).

For every named area and a few random boxes (blended, too small, small with an
own fit): the weekly record, the single-satellite ratios, the M4 fit under the
small-area rule, its predictions and the bands, all from the pipeline's own
functions. The TypeScript port has to reproduce them.

Run `cells` and `boxes` first. Writes app/lib/fit/test/fixtures.json.gz.
"""

from __future__ import annotations

import gzip
import json

import duckdb
import numpy as np
import pandas as pd

from . import areas as p
from . import boxes
from . import config as c
from . import harmonize as h
from . import models as m
from . import validate as v

OUT = c.REPO / "app" / "lib" / "fit" / "test" / "fixtures.json.gz"


def _list(values) -> list:
    return [None if x is None or (isinstance(x, float) and x != x) else x for x in pd.Series(values).astype(object).tolist()]


def _floats(values) -> list:
    return [None if x != x else float(x) for x in np.asarray(values, float)]


def case(con, name: str, country: str, box, country_train) -> dict:
    rec = h.record(con, country, box)
    sw = h.two_satellite_weeks(con, country, box)
    ratios = h.ratios_from(sw)
    rec["M_adj"] = v.adjust_single_satellite(rec, ratios)
    full = (rec.V.notna() & ~rec.modis_partial.astype(bool) & ~rec.viirs_partial.astype(bool)).to_numpy()
    train = rec[full & rec.year.isin(p.TRAIN_YEARS).to_numpy()].reset_index(drop=True)
    season = m.season_months(train.V.to_numpy(float), train.month.to_numpy())
    af = m.fit_area("M4", h._arr(train), h._arr(country_train), season)
    out = {
        "name": name, "country": country, "box": list(box), "season": season, "ratios": ratios,
        "fit": {"mode": af["mode"], "n_fire_weeks": af["n_fire_weeks"], "parts": [{**f, "weight": w} for f, w in af["parts"]]},
        "record": {
            "week_start": [str(d)[:10] for d in rec.week_start], "year": rec.year.tolist(), "month": rec.month.tolist(),
            "M": _floats(rec.M), "M_adj": _floats(rec.M_adj), "frp": _floats(rec.frp), "V": _floats(rec.V),
            "modis_hotspots": _floats(rec.modis_hotspots), "viirs_hotspots": _floats(rec.viirs_hotspots),
            "full": [int(x) for x in full],
        },
        "predicted": None, "loyo": None, "bands": None,
    }
    if af["mode"] != "none":
        harmonized = h.harmonize(rec, af, {"week_mult": [1.0, 1.0]})
        out["predicted"] = _floats(harmonized.predicted)
        pred, _ = h.loyo(train, country_train, season)
        band = h.bands(train, pred, season, pd.DataFrame())
        out["loyo"] = _floats(pred)
        out["bands"] = {k: band[k] for k in ("week_mult", "season_pct", "season_errors_pct")}
    return out


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    countries, train = {}, {}
    for country, box in p.COUNTRY_BOX.items():
        df = v.series(con, country, box)
        df["M_adj"] = v.adjust_single_satellite(df, v.single_satellite_ratios(con, country, box))
        train[country] = df[df.year.isin(p.TRAIN_YEARS)]
        a = h._arr(train[country])
        countries[country] = {"box": list(box), "train": {"M": _floats(a["M"]), "V": _floats(a["V"]), "month": a["month"].tolist(),
                                                           "year": a["year"].tolist(), "frp": _floats(a["frp"])}}

    cases = [case(con, name, country, box, train[country]) for name, (country, box) in p.AREAS.items()]
    drawn = json.loads(boxes.OUT.read_text(encoding="utf-8"))
    pool = [r for rs in drawn["pools"].values() for r in rs]
    picks = []
    for country in p.COUNTRY_BOX:
        mine = [r for r in pool if r["country"] == country]
        picks += [r for r in mine if r["mode"] == "blend"][:2]
        picks += [r for r in mine if r["mode"] == "none"][:1]
        picks += [r for r in mine if r["mode"] == "own"][:1]
    for r in picks:
        cases.append(case(con, f"{r['country']} box {r['box']}", r["country"], tuple(r["box"]), train[r["country"]]))
    con.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps({"countries": countries, "cases": cases}, separators=(",", ":")).encode("utf-8")
    with open(OUT, "wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", compresslevel=9, mtime=0) as z:
            z.write(raw)
    modes = [x["fit"]["mode"] for x in cases]
    print(f"{len(cases)} cases (own {modes.count('own')}, blend {modes.count('blend')}, none {modes.count('none')}), "
          f"{OUT.stat().st_size / 1e3:.0f} KB gzip. Wrote {OUT}")
