"""Per-cell weekly counts per satellite, for areas drawn in the browser.

    app/public/data/cells/index.json          weeks, days flown, the country fits, the file list
    app/public/data/cells/<country>.bin.gz    one row per cell, week and satellite with a kept detection

With these the browser can do for any box what the pipeline does for a named
area: sum the cells, put MODIS on the Terra + Aqua footing, fit M4 with the
small-area rule and convert the MODIS years. Format: docs/event/CELLS_FORMAT.md.
"""

from __future__ import annotations

import gzip
import json
from datetime import date, datetime, timezone

import duckdb
import numpy as np

from . import areas as p
from . import config as c
from . import models as m
from . import validate as v
from . import harmonize as h
from .harmonize import EXPORT, slug

OUT = EXPORT / "cells"
VERSION = 1
MAGIC = b"ZIJC"
SAT_ORDER = ("Terra", "Aqua", "N", "N20", "N21")  # the satellite index in the files


def _week_index(days, first: date) -> np.ndarray:
    return np.array([(d - first).days // 7 for d in days], dtype=np.int64)


def _pad(parts: list[bytes]) -> None:
    """Every array starts on a 4-byte boundary, so the browser can view it in place."""
    size = sum(len(x) for x in parts)
    if size % 4:
        parts.append(b"\0" * (4 - size % 4))


def _table(parts: list[bytes], rows, cell_id: dict, n_cells: int, first: date, with_frp: bool) -> int:
    """One family's rows, sorted by cell, week and satellite."""
    cells = np.array([cell_id[(r[0], r[1])] for r in rows], dtype=np.int64)
    counts = np.bincount(cells, minlength=n_cells)
    start = np.zeros(n_cells + 1, dtype="<u4")
    start[1:] = np.cumsum(counts)
    week = _week_index([r[2] for r in rows], first).astype("<u2")
    sat = np.array([r[3] for r in rows], dtype=np.uint8)
    days = np.array([r[4] for r in rows], dtype=np.uint8)
    hotspots = np.array([r[5] for r in rows], dtype="<u2")
    for arr in (start, week, ((sat << 3) | days).astype(np.uint8), hotspots):
        parts.append(arr.tobytes())
        _pad(parts)
    if with_frp:
        parts.append(np.array([r[6] for r in rows], dtype="<f4").tobytes())
    return len(rows)


def write_country(con: duckdb.DuckDBPyConnection, country: str, first: date) -> dict:
    sat_case = " ".join(f"WHEN '{s}' THEN {i}" for i, s in enumerate(SAT_ORDER))
    query = f"""
        SELECT CAST(round((cell_lat - {c.GRID_DEG / 2}) / {c.GRID_DEG}) AS INTEGER) AS gy,
               CAST(round((cell_lon - {c.GRID_DEG / 2}) / {c.GRID_DEG}) AS INTEGER) AS gx,
               week_start, CASE satellite {sat_case} END AS sat, fire_days, hotspots, frp_sum
        FROM cell_week_sat WHERE country = '{country}' AND family = '{{family}}'
        ORDER BY gy, gx, week_start, sat
    """
    modis = con.sql(query.format(family="MODIS")).fetchall()
    viirs = con.sql(query.format(family="VIIRS")).fetchall()
    if max(r[5] for r in modis + viirs) > 65535:
        raise ValueError("hotspots no longer fit 16 bits: raise VERSION and widen the column")
    cells = sorted({(r[0], r[1]) for r in modis} | {(r[0], r[1]) for r in viirs})
    cell_id = {cell: i for i, cell in enumerate(cells)}

    parts: list[bytes] = []
    header = np.zeros(6, dtype="<u4")
    parts += [MAGIC, header.tobytes()]
    parts.append(np.array([g[0] for g in cells], dtype="<i2").tobytes())
    _pad(parts)
    parts.append(np.array([g[1] for g in cells], dtype="<i2").tobytes())
    _pad(parts)
    n_modis = _table(parts, modis, cell_id, len(cells), first, with_frp=True)
    _pad(parts)
    n_viirs = _table(parts, viirs, cell_id, len(cells), first, with_frp=False)
    header[:] = (VERSION, len(cells), n_modis, n_viirs, 0, 0)
    parts[1] = header.tobytes()
    raw = b"".join(parts)

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{slug(country)}.bin.gz"
    with open(path, "wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", compresslevel=9, mtime=0) as z:  # mtime 0: same bytes every run
            z.write(raw)
    lats, lons = [g[0] for g in cells], [g[1] for g in cells]
    edge = lambda g: round(g * c.GRID_DEG, 1)
    return {"file": f"cells/{path.name}", "bytes": path.stat().st_size, "bytes_unzipped": len(raw),
            "n_cells": len(cells), "n_modis_rows": n_modis, "n_viirs_rows": n_viirs,
            "cells_box": [edge(min(lons)), edge(min(lats)), edge(max(lons) + 1), edge(max(lats) + 1)]}


def country_part(df, without_year: int | None = None) -> dict:
    """The country's M4 fit and its MODIS training total: the blend's second half."""
    train = df[df.year.isin(p.TRAIN_YEARS)]
    if without_year is not None:
        train = train[train.year != without_year]
    a = v._arrays(train, "M4")
    fit = m.fit("M4", a["M"], a["V"], a["month"], a["year"], a["frp"], m.season_months(a["V"], a["month"]))
    return {"fit": fit, "m_sum": float(np.sum(a["M"]))}


def country_series(con: duckdb.DuckDBPyConnection, country: str):
    box = p.COUNTRY_BOX[country]
    df = v.series(con, country, box)
    df["M_adj"] = v.adjust_single_satellite(df, v.single_satellite_ratios(con, country, box))
    return df


def weeks_tables(con: duckdb.DuckDBPyConnection) -> tuple[date, int, dict, dict]:
    first, last = con.sql("SELECT min(week_start), max(week_start) FROM weeks").fetchone()
    n = (last - first).days // 7 + 1
    sat_days = {s: [0] * n for s in SAT_ORDER}
    for sat, week, days in con.sql("SELECT satellite, week_start, satellite_days FROM sat_weeks").fetchall():
        sat_days[sat][(week - first).days // 7] = int(days)
    partial = {f: [1] * n for f in ("MODIS", "VIIRS")}  # a week with no row has no data, so partial too
    for family, week, is_partial in con.sql("SELECT family, week_start, is_partial FROM weeks").fetchall():
        partial[family][(week - first).days // 7] = int(is_partial)
    return first, n, sat_days, partial


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    first, n_weeks, sat_days, partial = weeks_tables(con)
    last_day = con.sql("SELECT last_full_day FROM build_info").fetchone()[0]
    countries = {}
    for country in p.COUNTRY_BOX:
        info = write_country(con, country, first)
        df = country_series(con, country)
        info["box"] = list(p.COUNTRY_BOX[country])
        info["parts"] = {"all": country_part(df), **{str(y): country_part(df, y) for y in p.TRAIN_YEARS}}
        countries[country] = info
        print(f"{country}: {info['n_cells']} cells, {info['n_modis_rows']} MODIS and {info['n_viirs_rows']} VIIRS rows, "
              f"{info['bytes'] / 1e6:.2f} MB gzip ({info['bytes_unzipped'] / 1e6:.2f} MB unzipped)", flush=True)
    con.close()

    index = {
        "version": VERSION,
        "contract": h.CONTRACT_VERSION, "unit": p.UNIT, "unit_label": p.UNIT_LABEL,
        "baseline_years": list(h.BASELINE_YEARS), "percentiles": [h.PCT_LOW, h.PCT_HIGH], "critical_share": h.CRITICAL_SHARE,
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_full_day": last_day.isoformat(),
        "grid_deg": c.GRID_DEG,
        "first_week": first.isoformat(), "n_weeks": n_weeks,
        "satellites": [{"code": s, "family": c.SATELLITES[s][0], "name": c.SATELLITES[s][1], "days": sat_days[s]}
                       for s in SAT_ORDER],
        "partial": partial,
        "min_week_days": 3,
        "train_years": [p.TRAIN_YEARS[0], p.TRAIN_YEARS[-1]],
        "blend_band_pct": list(p.BLEND_BAND_PCT),
        "countries": countries,
    }
    path = OUT / "index.json"
    path.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"index.json: {path.stat().st_size / 1e3:.0f} KB. Wrote {OUT}")
