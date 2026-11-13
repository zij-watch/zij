"""Kept hotspots for the browser: the day view, the map and the hotspots CSV.

    app/public/data/hotspots/index.json            regions, files, satellites, the filters applied
    app/public/data/hotspots/<region>[-years].bin.gz   one row per kept FIRMS detection

A row is a FIRMS detection that passed every filter of the build (type,
confidence, static-source mask) on a day its satellite counts as flying: the
same rows the fire cell-days are counted from, so counts made from these files
equal the pipeline's own. Egypt and Portugal are whole; Argentina is the
Chilecito and Parana Delta boxes with a margin. Format: docs/event/HOTSPOTS_FORMAT.md.

Also writes app/lib/hotspots/test/fixtures.json: the pipeline's own daily counts
for some named areas and date ranges, which the TypeScript has to reproduce.
"""

from __future__ import annotations

import gzip
import json
from datetime import date, datetime, timedelta, timezone

import duckdb
import numpy as np

from . import areas as p
from . import config as c
from .harmonize import EXPORT, slug

OUT = EXPORT / "hotspots"
FIXTURES = c.REPO / "app" / "lib" / "hotspots" / "test" / "fixtures.json"
VERSION = 1
MAGIC = b"ZIJH"
EPOCH = date(2000, 1, 1)                  # day 0 of the files
SAT_ORDER = ("Terra", "Aqua", "N", "N20", "N21")  # the satellite index in the files
VIIRS_CONFIDENCE = {"n": 101, "h": 102}  # MODIS confidence is its percent, 0 to 100; low-confidence VIIRS rows are never kept
MAX_FILE_BYTES = 5_000_000                # a file over this is split by period
MARGIN_DEG = 0.5                          # around the Argentine boxes
ARGENTINE_REGIONS = ("Chilecito", "Parana Delta")
COORD_UNITS = 100000                      # coordinates are whole 1e-5 degree units, as the grid snapping reads them

CREDIT = ("NASA FIRMS (Fire Information for Resource Management System) active fire detections: MODIS Collection 6.1 "
          "(Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21). We acknowledge the use of data from NASA's FIRMS "
          "(https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS). "
          "Zij is not affiliated with or endorsed by NASA.")


def regions() -> list[dict]:
    """Whole countries, and for Argentina the two preset boxes with a margin. Boxes are [west, south, east, north]."""
    out = [{"id": slug(k), "name": k, "country": k, "whole_country": True, "box": None} for k in ("Egypt", "Portugal")]
    for name in ARGENTINE_REGIONS:
        country, (west, south, east, north) = p.AREAS[name]
        box = [round(west - MARGIN_DEG, 1), round(south - MARGIN_DEG, 1), round(east + MARGIN_DEG, 1), round(north + MARGIN_DEG, 1)]
        out.append({"id": slug(f"{country} {name}"), "name": f"{name} and {MARGIN_DEG} degree around it",
                    "country": country, "whole_country": False, "box": box})
    return out


def _in_cells(box) -> str:
    """Cells whose centre is in the box, on whole numbers: gx counts tenths of a degree."""
    west, south, east, north = (round(v * 10) for v in box)
    return f"gx >= {west} AND gx < {east} AND gy >= {south} AND gy < {north}"


def kept(con: duckdb.DuckDBPyConnection, region: dict) -> dict[str, np.ndarray]:
    """The region's kept detections on flown days, sorted by day and time."""
    where = f"k.country = '{region['country']}'" + (f" AND {_in_cells(region['box'])}" if region["box"] else "")
    sat_case = " ".join(f"WHEN '{s}' THEN {i}" for i, s in enumerate(SAT_ORDER))
    conf_case = " ".join(f"WHEN '{k}' THEN {v}" for k, v in VIIRS_CONFIDENCE.items())
    df = con.sql(f"""
        SELECT CAST(k.acq_date - DATE '{EPOCH}' AS INTEGER) AS day,
               CAST(CAST(k.acq_time AS INTEGER) // 100 * 60 + CAST(k.acq_time AS INTEGER) % 100 AS INTEGER) AS minute,
               CAST(round(k.latitude * {COORD_UNITS}) AS INTEGER) AS lat,
               CAST(round(k.longitude * {COORD_UNITS}) AS INTEGER) AS lon,
               CASE k.satellite {sat_case} END AS sat,
               CASE WHEN k.family = 'MODIS' THEN CAST(k.confidence AS INTEGER) ELSE CASE k.confidence {conf_case} END END AS confidence,
               k.frp,
               CAST(k.daynight = 'N' AS INTEGER) AS night,
               CAST(k.processing <> 'SP' AS INTEGER) AS nrt
        FROM classified k
        JOIN sat_days f ON f.satellite = k.satellite AND f.day = k.acq_date
        WHERE k.filter_reason = 'kept' AND {where}
        ORDER BY day, minute, sat, lat, lon
    """).df()
    return {name: df[name].to_numpy() for name in df.columns}


def _pad(parts: list[bytes]) -> None:
    size = sum(len(x) for x in parts)
    if size % 4:
        parts.append(b"\0" * (4 - size % 4))


def encode(rows: dict[str, np.ndarray], first_day: int, last_day: int) -> bytes:
    """One file: the rows of days first_day to last_day (both included)."""
    pick = (rows["day"] >= first_day) & (rows["day"] <= last_day)
    day = rows["day"][pick]
    n_days = last_day - first_day + 1
    start = np.zeros(n_days + 1, dtype="<u4")
    start[1:] = np.cumsum(np.bincount(day - first_day, minlength=n_days))
    flags = (rows["sat"][pick] | (rows["night"][pick] << 3) | (rows["nrt"][pick] << 4)).astype(np.uint8)
    parts: list[bytes] = [MAGIC, np.array([VERSION, len(day), first_day, n_days, 0, 0], dtype="<u4").tobytes()]
    for arr in (start, rows["lat"][pick].astype("<i4"), rows["lon"][pick].astype("<i4"), rows["minute"][pick].astype("<u2"),
                flags, rows["confidence"][pick].astype(np.uint8), rows["frp"][pick].astype("<f4")):
        parts.append(arr.tobytes())
        _pad(parts)
    return b"".join(parts)


def _gzip(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=9, mtime=0)  # mtime 0: the same bytes every run


def _day(d: date) -> int:
    return (d - EPOCH).days


def split(rows: dict[str, np.ndarray], first_year: int, last_year: int, last_full_day: date) -> list[tuple[int, int, bytes, int]]:
    """Whole years per file; a file over MAX_FILE_BYTES is cut in two periods, again and again."""
    first = _day(date(first_year, 1, 1))
    last = min(_day(date(last_year, 12, 31)), _day(last_full_day))
    raw = encode(rows, first, last)
    zipped = _gzip(raw)
    if len(zipped) <= MAX_FILE_BYTES or first_year == last_year:
        return [(first, last, zipped, len(raw))]
    # Cut where the rows are halved, so the two files are of a size.
    years = EPOCH.year + (rows["day"][(rows["day"] >= first) & (rows["day"] <= last)] // 365.25).astype(int)
    middle = int(np.clip(np.median(years), first_year, last_year - 1))
    return split(rows, first_year, middle, last_full_day) + split(rows, middle + 1, last_year, last_full_day)


def satellites(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Each satellite's first and last day flown, and the days in between it delivered nothing."""
    out = []
    for code in SAT_ORDER:
        days = [r[0] for r in con.sql(f"SELECT day FROM sat_days WHERE satellite = '{code}' ORDER BY day").fetchall()]
        gaps, previous = [], days[0]
        for d in days[1:]:
            if (d - previous).days > 1:
                gaps.append([(previous + timedelta(days=1)).isoformat(), (d - timedelta(days=1)).isoformat()])
            previous = d
        out.append({"code": code, "sensor": c.SATELLITES[code][0], "name": c.SATELLITES[code][1],
                    "first_day": days[0].isoformat(), "last_day": days[-1].isoformat(), "gaps": gaps})
    return out


def filters(con: duckdb.DuckDBPyConnection) -> dict:
    counts = con.sql("SELECT country, filter_reason, count(*) AS n FROM classified GROUP BY ALL ORDER BY ALL").fetchall()
    by_country: dict[str, dict[str, int]] = {}
    for country, reason, n in counts:
        by_country.setdefault(country, {})[reason] = int(n)
    return {
        "type": c.KEEP_TYPE,
        "modis_min_confidence": c.MODIS_MIN_CONFIDENCE,
        "viirs_confidence": ["nominal", "high"],
        "static_mask": {"cell_deg": c.STATIC_CELL_DEG, "min_days": c.STATIC_MIN_DAYS, "types": list(c.STATIC_TYPES)},
        "flown_days_only": True,
        # One sentence per filter, in the order they are applied: the CSV header prints them.
        "text": [
            f"type {c.KEEP_TYPE} only (presumed vegetation fire; volcanoes, other static land sources and offshore detections are dropped; "
            "near-real-time rows carry no type and pass this step)",
            f"confidence: MODIS {c.MODIS_MIN_CONFIDENCE} percent or more, VIIRS nominal or high",
            f"static-source mask: every detection is dropped in a {c.STATIC_CELL_DEG} degree cell where type "
            f"{' or '.join(str(t) for t in c.STATIC_TYPES)} detections occur on {c.STATIC_MIN_DAYS} or more days (gas flares, industry)",
            "days inside a known satellite outage, and days after the last full UTC day, are left out",
        ],
        "detections_by_reason": by_country,
    }


def write_fixtures(con: duckdb.DuckDBPyConnection) -> None:
    """The pipeline's own counts (table cell_days: kept detections per day, cell and satellite)."""
    ranges = {
        "Nile Delta": [("2018-09-01", "2018-11-30"), ("2005-10-10", "2005-10-16"), ("2026-10-01", "2026-11-12")],
        "Alentejo": [("2017-06-01", "2017-10-31"), ("2003-08-01", "2003-08-10")],
        "Chilecito": [("2026-07-20", "2026-08-05"), ("2001-01-01", "2026-11-12")],
        "Parana Delta": [("2020-06-01", "2020-09-30"), ("2022-08-15", "2022-08-21")],
    }
    cases = []
    for name, spans in ranges.items():
        country, box = p.AREAS[name]
        for first, last in spans:
            rows = con.sql(f"""
                SELECT day, satellite, CAST(sum(hotspots) AS INTEGER) AS n, sum(frp_sum) AS frp
                FROM cell_days
                WHERE country = '{country}' AND {_in_cells(box)} AND day BETWEEN DATE '{first}' AND DATE '{last}'
                GROUP BY ALL ORDER BY ALL
            """).fetchall()
            by_satellite: dict[str, int] = {}
            for _, sat, n, _ in rows:
                by_satellite[c.SATELLITES[sat][1]] = by_satellite.get(c.SATELLITES[sat][1], 0) + n
            cases.append({"area": name, "id": slug(name), "country": country, "box": list(box), "from": first, "to": last,
                          "hotspots": sum(r[2] for r in rows), "frp_sum": float(sum(r[3] for r in rows)),
                          "by_satellite": by_satellite,
                          "days": [[d.isoformat(), c.SATELLITES[sat][1], n] for d, sat, n, _ in rows] if len(rows) <= 600 else None})
    FIXTURES.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES.write_text(json.dumps({"cases": cases}, separators=(",", ":")), encoding="utf-8")
    print(f"{len(cases)} test cases. Wrote {FIXTURES}")


def run() -> None:
    con = duckdb.connect(str(c.DB_PATH), read_only=True)
    last_full_day = con.sql("SELECT last_full_day FROM build_info").fetchone()[0]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.bin.gz"):
        old.unlink()
    listed = []
    for region in regions():
        rows = kept(con, region)
        first_year = (EPOCH + timedelta(days=int(rows["day"][0]))).year
        files = []
        pieces = split(rows, first_year, last_full_day.year, last_full_day)
        for first, last, zipped, unzipped in pieces:
            a, b = EPOCH + timedelta(days=first), EPOCH + timedelta(days=last)
            name = f"{region['id']}.bin.gz" if len(pieces) == 1 else f"{region['id']}-{a.year}-{b.year}.bin.gz"
            (OUT / name).write_bytes(zipped)
            n = int(((rows["day"] >= first) & (rows["day"] <= last)).sum())
            files.append({"file": f"hotspots/{name}", "bytes": len(zipped), "bytes_unzipped": unzipped,
                          "from": a.isoformat(), "to": b.isoformat(), "n": n})
            print(f"  {name}: {n} hotspots, {a} to {b}, {len(zipped) / 1e6:.2f} MB gzip ({unzipped / 1e6:.2f} MB unzipped)", flush=True)
        box = region["box"] or [round(float(rows["lon"].min()) / COORD_UNITS - 0.05, 1), round(float(rows["lat"].min()) / COORD_UNITS - 0.05, 1),
                                round(float(rows["lon"].max()) / COORD_UNITS + 0.05, 1), round(float(rows["lat"].max()) / COORD_UNITS + 0.05, 1)]
        listed.append({**region, "box": box, "n": int(len(rows["day"])), "files": files})
        print(f"{region['name']}: {len(rows['day'])} hotspots in {len(files)} file(s), {sum(f['bytes'] for f in files) / 1e6:.2f} MB gzip", flush=True)

    index = {
        "version": VERSION,
        "built_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "last_full_day": last_full_day.isoformat(),
        "epoch": EPOCH.isoformat(), "coord_units": COORD_UNITS, "grid_deg": c.GRID_DEG,
        "viirs_confidence": {str(v): {"n": "nominal", "h": "high"}[k] for k, v in VIIRS_CONFIDENCE.items()},
        "satellites": satellites(con),
        "filters": filters(con),
        "credit": CREDIT,
        "regions": listed,
    }
    path = OUT / "index.json"
    path.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
    print(f"index.json: {path.stat().st_size / 1e3:.0f} KB. Total {sum(f['bytes'] for r in listed for f in r['files']) / 1e6:.2f} MB gzip. Wrote {OUT}")
    write_fixtures(con)
    con.close()
