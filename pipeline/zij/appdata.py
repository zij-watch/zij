"""Two more files for the app, beside the per-area exports.

    app/public/data/method.json     the numbers the "How it works" page shows
    app/public/data/basemap/countries.json   simplified Natural Earth outlines, for the offline basemap
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import duckdb
import shapely
import shapely.geometry

from . import areas as p
from . import checkpoint
from . import config as c
from .harmonize import EXPORT, slug

SIMPLIFY_DEG = 0.05      # outline detail kept for the basemap, about 5 km
COORD_DECIMALS = 2


def _round(geometry: dict) -> dict:
    def walk(x):
        if isinstance(x[0], (int, float)):
            return [round(x[0], COORD_DECIMALS), round(x[1], COORD_DECIMALS)]
        return [walk(y) for y in x]
    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}


def basemap() -> int:
    source = json.loads(c.OUTLINES.read_text(encoding="utf-8"))
    features = []
    for f in source["features"]:
        shape = shapely.simplify(shapely.geometry.shape(f["geometry"]), SIMPLIFY_DEG, preserve_topology=True)
        if shape.is_empty:
            continue
        features.append({"type": "Feature",
                         "properties": {"name": f["properties"].get("NAME"), "iso3": f["properties"].get("ADM0_A3")},
                         "geometry": _round(shapely.geometry.mapping(shape))})
    out = EXPORT / "basemap"
    out.mkdir(parents=True, exist_ok=True)
    path = out / "countries.json"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    return path.stat().st_size


def method() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    raw = checkpoint.raw_pixels(con).reset_index()
    raw_gap = [{"year": int(r.year), **{k: (None if str(r[k]) in ("<NA>", "nan") else float(r[k]))
                                        for k in raw.columns if k != "year"}} for _, r in raw.iterrows()]
    filters = con.sql("SELECT country, filter_reason AS reason, count(*) AS n FROM classified GROUP BY ALL ORDER BY ALL").df()
    left_out = con.sql("SELECT country, reason, CAST(sum(n) AS BIGINT) AS n FROM api_left_out GROUP BY ALL ORDER BY ALL").df()
    static = con.sql("SELECT country, count(*) AS cells FROM static_cells GROUP BY ALL ORDER BY ALL").df()
    satellites = con.sql("SELECT satellite, family, min(day) AS first_day, max(day) AS last_day FROM sat_days GROUP BY ALL ORDER BY first_day").df()
    last_day = con.sql("SELECT last_full_day FROM build_info").fetchone()[0]
    con.close()

    summary = json.loads((c.PROCESSED / "calibration" / "validation_summary.json").read_text(encoding="utf-8"))
    per_area = {}
    for row in summary["per_area"]:
        per_area.setdefault(row["area"], {}).setdefault(row["model"], {})[row["scheme"]] = {
            "season_err_abs_pct": row["season_err_abs_pct"], "spearman": row["spearman"]}
    areas = []
    for name, (country, box) in p.AREAS.items():
        doc = json.loads((EXPORT / "areas" / f"{slug(name)}.json").read_text(encoding="utf-8"))
        areas.append({"id": doc["id"], "name": name, "country": country, "box": list(box),
                      "research_area": name in p.RESEARCH_AREAS,
                      "fit": doc["fit"]["mode"], "n_fire_weeks": doc["fit"]["n_fire_weeks"], "season": doc["fit"]["season"],
                      "b": doc["fit"]["parts"][0]["b"] if doc["fit"]["parts"] else None,
                      "g": doc["fit"]["parts"][0]["g"] if doc["fit"]["parts"] else None,
                      "bands": doc["bands"], "terra_only_test": doc["terra_only_test"],
                      "validation": per_area.get(name, {})})

    def clean(x):
        if isinstance(x, float):
            return None if x != x else round(x, 2)
        if isinstance(x, dict):
            return {k: clean(v) for k, v in x.items()}
        if isinstance(x, list):
            return [clean(v) for v in x]
        return x

    doc = {
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_full_day": last_day.isoformat(),
        "unit": p.UNIT, "unit_label": p.UNIT_LABEL,
        "raw_gap": {"area": "Nile Delta", "months": "September to November", "what": "raw type 0 fire pixels", "rows": raw_gap},
        "filters": {"kept_confidence": {"MODIS": f">= {c.MODIS_MIN_CONFIDENCE}", "VIIRS": "nominal, high"},
                    "static_mask": {"cell_deg": c.STATIC_CELL_DEG, "min_days": c.STATIC_MIN_DAYS,
                                    "cells": dict(zip(static.country, static.cells.astype(int)))},
                    "grid_deg": c.GRID_DEG,
                    "counts": filters.to_dict(orient="records"), "api_left_out": left_out.to_dict(orient="records"),
                    "known_gaps": sum(len(v) for v in c.KNOWN_GAPS.values())},
        "satellites": [{"satellite": c.SATELLITES[r.satellite][1], "family": r.family,
                        "first_day": str(r.first_day)[:10], "last_day": str(r.last_day)[:10]} for r in satellites.itertuples()],
        "models": {"train_years": [p.TRAIN_YEARS[0], p.TRAIN_YEARS[-1]], "test_years": [p.TEST_YEARS[0], p.TEST_YEARS[-1]],
                   "research_areas": 8, "all_areas": summary["all_areas"], "expected_from_research": summary["expected_from_research"]},
        "areas": areas,
    }
    (EXPORT / "method.json").write_text(json.dumps(clean(doc), separators=(",", ":"), default=str), encoding="utf-8")


def run() -> None:
    size = basemap()
    method()
    print(f"Wrote method.json and basemap/countries.json ({size / 1024:.0f} KB) to {EXPORT}")
