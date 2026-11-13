"""Checkpoint: the Nile Delta, per satellite and year.

Prints three tables from the built database, next to the numbers our pre-event
research expects. A mismatch is reported, never tuned away.
"""

from __future__ import annotations

import duckdb
import pandas as pd

from . import config as c

YEARS = (2012, 2024)
SEASON_MONTHS = (9, 10, 11)  # September to November


def _box_cells(box: tuple[float, float, float, float]) -> str:
    """SQL condition: the 0.1 degree cells whose centre is in the box."""
    west, south, east, north = (round(v / c.GRID_DEG) for v in box)
    return f"gx >= {west} AND gx < {east} AND gy >= {south} AND gy < {north}"


def _box_points(box: tuple[float, float, float, float]) -> str:
    west, south, east, north = box
    return f"longitude >= {west} AND longitude < {east} AND latitude >= {south} AND latitude < {north}"


def _per_satellite(con: duckdb.DuckDBPyConnection, sql: str) -> pd.DataFrame:
    df = con.sql(sql).df().pivot(index="year", columns="satellite", values="n")
    df = df.reindex(columns=list(c.SATELLITES)).rename(columns={k: v[1] for k, v in c.SATELLITES.items()})
    df["NPP/Aqua"] = (df["Suomi NPP"] / df["Aqua"]).round(1)
    return df.astype({col: "Int64" for col in df.columns if col != "NPP/Aqua"})


def raw_pixels(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Raw fire pixels: every type 0 detection in the box, no other filter."""
    return _per_satellite(con, f"""
        SELECT year(acq_date) AS year, satellite, count(*) AS n
        FROM detections
        WHERE country = 'Egypt' AND type = {c.KEEP_TYPE} AND {_box_points(c.NILE_DELTA)}
          AND month(acq_date) IN {SEASON_MONTHS} AND year(acq_date) BETWEEN {YEARS[0]} AND {YEARS[1]}
        GROUP BY ALL
    """)


def cell_days(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """The pipeline's unit: fire cell-days per satellite, after every filter."""
    return _per_satellite(con, f"""
        SELECT year(day) AS year, satellite, count(*) AS n
        FROM cell_days
        WHERE country = 'Egypt' AND {_box_cells(c.NILE_DELTA)}
          AND month(day) IN {SEASON_MONTHS} AND year(day) BETWEEN {YEARS[0]} AND {YEARS[1]}
        GROUP BY ALL
    """)


def sensor_season(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Per-sensor weekly averages, summed over the weeks whose Thursday is in the season."""
    west, south, east, north = c.NILE_DELTA
    df = con.sql(f"""
        SELECT isoyear(week_start + 3) AS year, family, round(sum(fire_days)) AS n
        FROM cell_weeks
        WHERE country = 'Egypt'
          AND cell_lon > {west} AND cell_lon < {east} AND cell_lat > {south} AND cell_lat < {north}
          AND month(week_start + 3) IN {SEASON_MONTHS}
          AND isoyear(week_start + 3) BETWEEN {YEARS[0]} AND {YEARS[1]}
        GROUP BY ALL
    """).df().pivot(index="year", columns="family", values="n")
    df["VIIRS/MODIS"] = (df["VIIRS"] / df["MODIS"]).round(1)
    return df.astype({"MODIS": "Int64", "VIIRS": "Int64"})


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    west, south, east, north = c.NILE_DELTA
    print(f"Nile Delta: lon {west} to {east}, lat {south} to {north}. September to November, {YEARS[0]} to {YEARS[1]}.")
    print("Expected from our research: Suomi NPP / Aqua of 11 to 20 in most years, about 42 in 2018.\n")
    print("A. Raw fire pixels (type 0 detections, no other filter), per satellite")
    print(raw_pixels(con).to_string(na_rep="-"))
    print("\nB. Fire cell-days per satellite (type 0, confidence, static-source mask, 0.1 degree grid)")
    print(cell_days(con).to_string(na_rep="-"))
    print("\nC. Fire cell-days per sensor (average over the satellites flying, weekly, summed over the season)")
    print(sensor_season(con).to_string(na_rep="-"))
    con.close()
