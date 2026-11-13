"""Build steps 1 to 4 of the method: raw FIRMS rows to weekly fire cell-days.

    load      FIRMS yearly country CSVs into DuckDB
    classify  one filter reason per detection (type, confidence, static-source mask)
    grid      fire cell-days: a 0.1 degree cell counts once per day per satellite
    weeks     days flown per satellite and week, known gaps left out
    weekly    weekly sums per satellite, then the per-satellite average of each sensor
    write     Parquet files in data/processed/<Country>/
"""

from __future__ import annotations

import json
from datetime import date, timedelta

import duckdb
import numpy as np
import shapely
import shapely.geometry

from . import config as c

CSV_TYPES = {
    "latitude": "DOUBLE",
    "longitude": "DOUBLE",
    "acq_date": "DATE",
    "acq_time": "VARCHAR",
    "satellite": "VARCHAR",
    "confidence": "VARCHAR",
    "frp": "DOUBLE",
    "daynight": "VARCHAR",
    "type": "INTEGER",
}


def _cell_index(column: str, deg: float) -> str:
    """SQL for the integer index of the grid cell holding a coordinate.

    FIRMS coordinates have at most 5 decimals, so they are turned into whole
    1e-5 degree units first. That keeps a point like 30.07 in the cell starting
    at 30.07 instead of falling below it through floating point error.
    """
    units = round(deg * 100_000)
    return f"CAST(floor(round({column} * 100000) / {units}.0) AS INTEGER)"


def connect() -> duckdb.DuckDBPyConnection:
    c.DATA.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(c.DB_PATH))


def load(con: duckdb.DuckDBPyConnection) -> None:
    """Step a: every row of the yearly country files, then the 2026 API pulls."""
    con.execute(
        """
        CREATE OR REPLACE TABLE detections (
            country VARCHAR, source VARCHAR, family VARCHAR, satellite VARCHAR,
            acq_date DATE, acq_time VARCHAR, latitude DOUBLE, longitude DOUBLE,
            confidence VARCHAR, frp DOUBLE, daynight VARCHAR, type INTEGER, processing VARCHAR
        )
        """
    )
    for country in c.COUNTRIES:
        for source, family in c.SOURCES.items():
            folder = c.FIRMS_RAW / "firms" / country / source
            files = sorted(str(p) for p in folder.glob("*.csv"))
            if not files:
                continue  # NOAA-21 has no yearly files
            con.execute(
                """
                INSERT INTO detections
                SELECT ?, ?, ?, satellite, acq_date, acq_time, latitude, longitude,
                       confidence, frp, daynight, type, 'SP'
                FROM read_csv(?, header = true, union_by_name = true, types = ?)
                WHERE acq_date <= ?
                """,
                [country, source, family, files, CSV_TYPES, c.YEARLY_LAST_DAY],
            )
    missing_type = con.execute("SELECT count(*) FROM detections WHERE type IS NULL").fetchone()[0]
    if missing_type:
        raise ValueError(f"{missing_type} yearly rows have no type; the yearly files should all have one")
    load_api(con)
    unknown = con.execute(
        "SELECT DISTINCT satellite FROM detections WHERE satellite NOT IN ?",
        [list(c.SATELLITES)],
    ).fetchall()
    if unknown:
        raise ValueError(f"Unknown satellite codes in the raw files: {unknown}")


def _api_manifest() -> list[tuple]:
    """Every API pull on disk: the pre-event ones in the raw folder, then our top-ups."""
    rows = []
    for root in (c.FIRMS_RAW / "firms_api", c.DATA / "firms_api"):
        for country in c.COUNTRIES:
            for source in c.SOURCES:
                manifest = root / country / source / "pulls.json"
                if not manifest.exists():
                    continue
                for name, entry in json.loads(manifest.read_text(encoding="utf-8")).items():
                    path = manifest.parent / name
                    # An empty answer still says "nothing on these days", so it stays in the list.
                    has_rows = entry["rows"] > 0 and path.exists()
                    rows.append((str(path) if has_rows else None, country, source, entry["processing"],
                                 date.fromisoformat(name[0:10]), date.fromisoformat(name[11:21]),
                                 entry["pulled_at_utc"]))
    return rows


def last_full_day() -> date:
    """The last whole UTC day the pulls cover."""
    topup = c.DATA / "firms_api" / "topup.json"
    if topup.exists():
        return date.fromisoformat(json.loads(topup.read_text(encoding="utf-8"))["last_full_day"])
    return max(row[5] for row in _api_manifest()) - timedelta(days=1)


def load_api(con: duckdb.DuckDBPyConnection) -> None:
    """The 2026 pulls.

    For each country, source and day one file wins: standard processing over
    near real time, then the most recent pull. Rows outside the country outline
    (the API answers with a box) and rows of the unfinished last day are counted
    and left out.
    """
    manifest = _api_manifest()
    end = last_full_day()
    con.execute("CREATE OR REPLACE TABLE build_info AS SELECT CAST(? AS DATE) AS last_full_day", [end])
    con.execute(
        "CREATE OR REPLACE TABLE api_files (path VARCHAR, country VARCHAR, source VARCHAR, processing VARCHAR, "
        "first_day DATE, last_day DATE, pulled_at TIMESTAMPTZ)"
    )
    con.executemany("INSERT INTO api_files VALUES (?, ?, ?, ?, ?, ?, ?)", manifest)
    files = [row[0] for row in manifest if row[0]]
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE api_raw AS
        SELECT filename AS path, satellite, acq_date, acq_time, latitude, longitude, confidence, frp, daynight, type
        FROM read_csv(?, header = true, union_by_name = true, filename = true, types = ?)
        """,
        [files, CSV_TYPES],
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE api_rows AS
        WITH file_days AS (
            SELECT f.*, CAST(g.day AS DATE) AS day
            FROM api_files f, generate_series(f.first_day, f.last_day, INTERVAL 1 DAY) AS g(day)
        ), winner AS (
            SELECT country, source, day,
                   arg_max(coalesce(path, ''), (processing = 'SP', pulled_at)) AS path,
                   arg_max(processing, (processing = 'SP', pulled_at)) AS processing
            FROM file_days GROUP BY ALL
        )
        SELECT row_number() OVER () AS id, w.country, w.source, w.processing, r.* EXCLUDE (path)
        FROM api_raw r
        JOIN api_files f ON f.path = r.path
        JOIN winner w ON w.country = f.country AND w.source = f.source AND w.day = r.acq_date AND w.path = r.path
        WHERE r.acq_date > ?
        """,
        [c.YEARLY_LAST_DAY],
    )
    points = con.sql("SELECT id, country, longitude, latitude FROM api_rows").df()
    outlines = {f["properties"]["ADM0_A3"]: shapely.geometry.shape(f["geometry"])
                for f in json.loads(c.OUTLINES.read_text(encoding="utf-8"))["features"]}
    inside = np.zeros(len(points), dtype=bool)
    for country, info in c.COUNTRY_INFO.items():
        rows = (points.country == country).to_numpy()
        outline = outlines[info["iso3"]]
        shapely.prepare(outline)
        inside[rows] = shapely.contains_xy(outline, points.longitude[rows].to_numpy(), points.latitude[rows].to_numpy())
    inside_ids = points.loc[inside, ["id"]]  # read by name in the SQL below
    con.register("inside_ids", inside_ids)
    con.execute(
        """
        CREATE OR REPLACE TABLE api_left_out AS
        SELECT r.country, r.source, r.processing,
               CASE WHEN r.acq_date > ? THEN 'incomplete_day' ELSE 'outside_country' END AS reason,
               count(*) AS n
        FROM api_rows r
        WHERE r.acq_date > ? OR r.id NOT IN (SELECT id FROM inside_ids)
        GROUP BY ALL
        """,
        [end, end],
    )
    families = "CASE r.source " + " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in c.SOURCES.items()) + " END"
    con.execute(
        f"""
        INSERT INTO detections
        SELECT r.country, r.source, {families}, r.satellite, r.acq_date, r.acq_time, r.latitude, r.longitude,
               r.confidence, r.frp, r.daynight, r.type, r.processing
        FROM api_rows r
        WHERE r.acq_date <= ? AND r.id IN (SELECT id FROM inside_ids)
        """,
        [end],
    )
    con.unregister("inside_ids")


def classify(con: duckdb.DuckDBPyConnection) -> None:
    """Steps b and c: the static-source mask, then one filter reason per row."""
    sy = _cell_index("latitude", c.STATIC_CELL_DEG)
    sx = _cell_index("longitude", c.STATIC_CELL_DEG)
    con.execute(
        f"""
        CREATE OR REPLACE TABLE static_cells AS
        SELECT country, {sy} AS sy, {sx} AS sx, count(DISTINCT acq_date) AS static_days
        FROM detections
        WHERE type IN {c.STATIC_TYPES}
        GROUP BY ALL
        HAVING count(DISTINCT acq_date) >= {c.STATIC_MIN_DAYS}
        """
    )
    gy = _cell_index("d.latitude", c.GRID_DEG)
    gx = _cell_index("d.longitude", c.GRID_DEG)
    viirs_keep = ", ".join(f"'{v}'" for v in c.VIIRS_KEEP_CONFIDENCE)
    con.execute(
        f"""
        CREATE OR REPLACE TABLE classified AS
        SELECT d.*,
               {gy} AS gy,
               {gx} AS gx,
               CASE
                   WHEN d.type = 2 THEN 'static_source'
                   WHEN d.type = 3 THEN 'offshore'
                   WHEN d.type = 1 THEN 'volcano'
                   WHEN d.type <> {c.KEEP_TYPE} THEN 'other_type'
                   WHEN d.family = 'MODIS'
                        AND TRY_CAST(d.confidence AS INTEGER) < {c.MODIS_MIN_CONFIDENCE} THEN 'low_confidence'
                   WHEN d.family = 'MODIS' AND TRY_CAST(d.confidence AS INTEGER) IS NULL THEN 'low_confidence'
                   WHEN d.family = 'VIIRS' AND d.confidence NOT IN ({viirs_keep}) THEN 'low_confidence'
                   WHEN s.sy IS NOT NULL THEN 'static_source_masked'
                   ELSE 'kept'
               END AS filter_reason
        FROM detections d
        LEFT JOIN static_cells s
               ON s.country = d.country
              AND s.sy = {_cell_index("d.latitude", c.STATIC_CELL_DEG)}
              AND s.sx = {_cell_index("d.longitude", c.STATIC_CELL_DEG)}
        """
    )


def flown(con: duckdb.DuckDBPyConnection) -> None:
    """Step e: the days each satellite flew, known gaps left out."""
    con.execute("CREATE OR REPLACE TABLE known_gaps (satellite VARCHAR, first_day DATE, last_day DATE)")
    rows = [(sat, a, b) for sat, gaps in c.KNOWN_GAPS.items() for a, b in gaps]
    con.executemany("INSERT INTO known_gaps VALUES (?, ?, ?)", rows)
    # NOAA-21 has no verified gap list yet, so the same silence rule is applied to it
    # here: a week with no NOAA-21 detection of any type in any loaded country, while
    # NOAA-20 has detections, is no data for NOAA-21.
    con.execute(
        """
        CREATE OR REPLACE TABLE silent_weeks AS
        WITH seen AS (
            SELECT DISTINCT satellite, CAST(date_trunc('week', acq_date) AS DATE) AS week_start
            FROM detections WHERE satellite IN ('N20', 'N21')
        )
        SELECT 'N21' AS satellite, week_start
        FROM seen
        WHERE satellite = 'N20'
          AND week_start >= (SELECT min(week_start) FROM seen WHERE satellite = 'N21')
          AND week_start NOT IN (SELECT week_start FROM seen WHERE satellite = 'N21')
        """
    )
    con.execute("INSERT INTO known_gaps SELECT satellite, week_start, week_start + 6 FROM silent_weeks")
    con.execute("CREATE OR REPLACE TABLE mission_end (satellite VARCHAR, last_day DATE)")
    con.executemany("INSERT INTO mission_end VALUES (?, ?)", list(c.MISSION_END.items()))
    con.execute(
        """
        CREATE OR REPLACE TABLE sat_days AS
        WITH span AS (
            SELECT satellite, any_value(family) AS family, min(acq_date) AS first_day
            FROM detections GROUP BY satellite
        )
        SELECT s.family, s.satellite, CAST(g.day AS DATE) AS day
        FROM span s
        LEFT JOIN mission_end e ON e.satellite = s.satellite,
             generate_series(s.first_day, coalesce(e.last_day, (SELECT last_full_day FROM build_info)), INTERVAL 1 DAY) AS g(day)
        WHERE NOT EXISTS (
            SELECT 1 FROM known_gaps k
            WHERE k.satellite = s.satellite AND CAST(g.day AS DATE) BETWEEN k.first_day AND k.last_day
        )
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TABLE sat_weeks AS
        SELECT family, satellite, CAST(date_trunc('week', day) AS DATE) AS week_start,
               CAST(count(*) AS TINYINT) AS satellite_days
        FROM sat_days GROUP BY ALL
        """
    )
    con.execute(
        f"""
        CREATE OR REPLACE TABLE weeks AS
        SELECT family,
               CAST(date_trunc('week', day) AS DATE) AS week_start,
               count(*) AS satellite_days,
               CAST(count(*) / 7.0 AS FLOAT) AS n_satellites,
               string_agg(DISTINCT satellite, ',' ORDER BY satellite) AS satellites,
               count(DISTINCT day) < 7 AS is_partial,
               count(*) / 7.0 < {c.MIN_WEEK_SHARE} - 1e-9 AS no_data
        FROM sat_days GROUP BY ALL
        """
    )


def grid(con: duckdb.DuckDBPyConnection) -> None:
    """Step d: fire cell-days. A cell counts once per day for each satellite."""
    con.execute(
        """
        CREATE OR REPLACE TABLE cell_days AS
        SELECT k.country, k.family, k.satellite, k.acq_date AS day, k.gy, k.gx,
               count(*) AS hotspots, sum(k.frp) AS frp_sum
        FROM classified k
        JOIN sat_days f ON f.satellite = k.satellite AND f.day = k.acq_date
        WHERE k.filter_reason = 'kept'
        GROUP BY ALL
        """
    )


def weekly(con: duckdb.DuckDBPyConnection) -> None:
    """Step f: weekly sums per satellite, then the average over each sensor's satellites."""
    half = c.GRID_DEG / 2
    con.execute(
        f"""
        CREATE OR REPLACE TABLE cell_week_sat AS
        SELECT d.country, d.family, d.satellite,
               round(d.gy * {c.GRID_DEG} + {half}, 2) AS cell_lat,
               round(d.gx * {c.GRID_DEG} + {half}, 2) AS cell_lon,
               CAST(date_trunc('week', d.day) AS DATE) AS week_start,
               CAST(count(*) AS TINYINT) AS fire_days,
               CAST(sum(d.hotspots) AS INTEGER) AS hotspots,
               CAST(sum(d.frp_sum) AS FLOAT) AS frp_sum
        FROM cell_days d
        GROUP BY ALL
        """
    )
    # Sensor value: cell-days summed over the satellites, divided by the
    # satellite-days flown that week, times 7. Weeks under 3/7 are no data: no row.
    con.execute(
        """
        CREATE OR REPLACE TABLE cell_weeks AS
        SELECT s.country, s.family, s.cell_lat, s.cell_lon, s.week_start,
               CAST(sum(s.fire_days) * 7.0 / any_value(w.satellite_days) AS FLOAT) AS fire_days,
               CAST(sum(s.hotspots) AS INTEGER) AS hotspots,
               CAST(sum(s.frp_sum) AS FLOAT) AS frp_sum
        FROM cell_week_sat s
        JOIN weeks w ON w.family = s.family AND w.week_start = s.week_start
        WHERE NOT w.no_data
        GROUP BY ALL
        """
    )


def write(con: duckdb.DuckDBPyConnection) -> None:
    """Step g: Parquet, one folder per country."""
    opts = "(FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 50000)"
    for country in c.COUNTRIES:
        out = c.PROCESSED / country
        out.mkdir(parents=True, exist_ok=True)
        con.execute(
            f"""
            COPY (
                SELECT family, satellite, cell_lat, cell_lon, week_start, fire_days, hotspots, frp_sum
                FROM cell_week_sat WHERE country = '{country}'
                ORDER BY family, satellite, cell_lat, cell_lon, week_start
            ) TO '{(out / "cell_week_sat.parquet").as_posix()}' {opts}
            """
        )
        con.execute(
            f"""
            COPY (
                SELECT family, cell_lat, cell_lon, week_start, fire_days, hotspots, frp_sum
                FROM cell_weeks WHERE country = '{country}'
                ORDER BY family, cell_lat, cell_lon, week_start
            ) TO '{(out / "cell_weeks.parquet").as_posix()}' {opts}
            """
        )
        con.execute(
            f"""
            COPY (SELECT * FROM sat_weeks ORDER BY family, satellite, week_start)
            TO '{(out / "sat_weeks.parquet").as_posix()}' {opts}
            """
        )
        con.execute(
            f"""
            COPY (
                SELECT family, week_start, n_satellites, satellites, is_partial, no_data
                FROM weeks ORDER BY family, week_start
            ) TO '{(out / "weeks.parquet").as_posix()}' {opts}
            """
        )
        con.execute(
            f"""
            COPY (
                SELECT family, satellite, CAST(year(acq_date) AS SMALLINT) AS year, filter_reason,
                       CAST(count(*) AS INTEGER) AS n
                FROM classified WHERE country = '{country}'
                GROUP BY ALL ORDER BY ALL
            ) TO '{(out / "filters.parquet").as_posix()}' {opts}
            """
        )


def summary(con: duckdb.DuckDBPyConnection) -> None:
    print("\nRows loaded, by country and source")
    print(con.sql(
        "SELECT country, source, count(*) AS n, min(acq_date) AS first_day, max(acq_date) AS last_day "
        "FROM detections GROUP BY ALL ORDER BY ALL"
    ).df().to_string(index=False))
    print("\nDetections by filter reason")
    print(con.sql(
        "PIVOT (SELECT country, filter_reason FROM classified) ON country USING count(*) GROUP BY filter_reason ORDER BY filter_reason"
    ).df().to_string(index=False))
    print("\n2026 API rows left out")
    print(con.sql("PIVOT (SELECT country, reason, n FROM api_left_out) ON country USING sum(n) GROUP BY reason").df().to_string(index=False))
    print("\nLast full day:", con.sql("SELECT last_full_day FROM build_info").fetchone()[0])
    print("\nNOAA-21 weeks silent everywhere while NOAA-20 saw fires (counted as no data):",
          [str(r[0]) for r in con.sql("SELECT week_start FROM silent_weeks ORDER BY 1").fetchall()] or "none")
    print("\nStatic-source cells (0.01 degree)")
    print(con.sql("SELECT country, count(*) AS cells FROM static_cells GROUP BY ALL ORDER BY ALL").df().to_string(index=False))
    print("\nFirst day flown per satellite")
    print(con.sql("SELECT family, satellite, min(day) AS first_day, max(day) AS last_day, count(*) AS days FROM sat_days GROUP BY ALL ORDER BY first_day").df().to_string(index=False))
    print("\nSensor weeks")
    print(con.sql(
        "SELECT family, min(week_start) AS first_week, max(week_start) AS last_week, count(*) AS weeks, "
        "count(*) FILTER (WHERE no_data) AS no_data_weeks, count(*) FILTER (WHERE is_partial AND NOT no_data) AS partial_weeks "
        "FROM weeks GROUP BY ALL ORDER BY ALL"
    ).df().to_string(index=False))
    print("\nCell-weeks to the week of 22 Dec 2025")
    print(con.sql(
        "SELECT country, family, count(*) AS cell_weeks, round(sum(fire_days), 1) AS fire_days, min(week_start) AS first_week "
        "FROM cell_weeks WHERE week_start <= DATE '2025-12-22' GROUP BY ALL ORDER BY ALL"
    ).df().to_string(index=False))


def run() -> None:
    con = connect()
    for step in (load, classify, flown, grid, weekly, write):
        print(f"{step.__name__} ...", flush=True)
        step(con)
    summary(con)
    con.close()
    print(f"\nWrote Parquet to {c.PROCESSED}")
