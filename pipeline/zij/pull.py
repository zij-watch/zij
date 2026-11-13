"""Top up the 2026 record from the FIRMS area API.

The pulls made before the event stay untouched in the raw folder. This writes
new ones to data/firms_api/ (git-ignored), in the same layout:

    data/firms_api/<Country>/<source>/<first>_<last>_<SP|NRT>.csv   the API's answer, as it came
    data/firms_api/<Country>/<source>/pulls.json                    what each file holds
    data/firms_api/topup.json                                       when, and the last full day

FIRMS backfills standard processing (SP), so every top-up fetches the last
60 days of SP again, then near real time (NRT) for the recent days.

The MAP_KEY is read from app/.env.local (or the raw folder's .env.local). It
is sent to FIRMS only, and never printed or written anywhere.
"""

from __future__ import annotations

import io
import json
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

import pandas as pd

from . import config as c

API = "https://firms.modaps.eosdis.nasa.gov/api"
OUT = c.DATA / "firms_api"
WINDOW_DAYS = 5          # the area API takes 1 to 5 days per call
SP_REFETCH_DAYS = 60     # FIRMS backfills standard processing
NRT_REFETCH_FROM = date(2026, 10, 24)  # two weeks before the pre-event pull: late NRT rows fill in
PAUSE_SECONDS = 0.4


def _map_key() -> str:
    for path in (c.REPO / "app" / ".env.local", c.FIRMS_RAW / ".env.local"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("MAP_KEY="):
                    key = line.split("=", 1)[1].strip().strip("'\"")
                    if key:
                        return key
    raise SystemExit("No MAP_KEY found in app/.env.local")


def _get(path: str, key: str) -> str:
    """GET an API path. Errors never show the URL, because the key is in it."""
    url = f"{API}/{path.format(key=key)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            reason = f"HTTP {error.code}"
        except (urllib.error.URLError, TimeoutError) as error:
            reason = type(error).__name__
        time.sleep(5 * (attempt + 1))
    raise SystemExit(f"FIRMS did not answer for {path.split('{key}')[0]}... ({reason})")


def availability(key: str) -> dict[str, date]:
    """Last day each API source has data for."""
    text = _get("data_availability/csv/{key}/ALL", key)
    df = pd.read_csv(io.StringIO(text))
    return {row.data_id: date.fromisoformat(row.max_date) for row in df.itertuples()}


def _windows(first: date, last: date):
    day = first
    while day <= last:
        end = min(day + timedelta(days=WINDOW_DAYS - 1), last)
        yield day, end
        day = end + timedelta(days=1)


def _previous_sp_end(country: str, source: str) -> date:
    """The last day the pre-event pulls hold as standard processing."""
    manifest = c.FIRMS_RAW / "firms_api" / country / source / "pulls.json"
    last = date(2026, 1, 1)
    if manifest.exists():
        for name, entry in json.loads(manifest.read_text(encoding="utf-8")).items():
            if entry["processing"] == "SP":
                last = max(last, date.fromisoformat(name[11:21]))
    return last


def run() -> None:
    key = _map_key()
    now = datetime.now(timezone.utc)
    last_full_day = now.date() - timedelta(days=1)
    available = availability(key)
    print("FIRMS has data to:", {k: v.isoformat() for k, v in sorted(available.items()) if k in
                                 {f"{a}_{p}" for a in c.API_SOURCES.values() for p in ("SP", "NRT")}}, flush=True)
    calls = 0
    for country, info in c.COUNTRY_INFO.items():
        west, south, east, north = info["box"]
        area = f"{west:g},{south:g},{east:g},{north:g}"
        for source, api_name in c.API_SOURCES.items():
            folder = OUT / country / source
            folder.mkdir(parents=True, exist_ok=True)
            manifest_path = folder / "pulls.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
            sp_end = min(available.get(f"{api_name}_SP", date(2026, 1, 1)), last_full_day)
            sp_from = max(date(2026, 1, 1), _previous_sp_end(country, source) - timedelta(days=SP_REFETCH_DAYS))
            nrt_end = min(available.get(f"{api_name}_NRT", last_full_day), now.date())
            nrt_from = max(sp_end + timedelta(days=1), NRT_REFETCH_FROM)
            plan = [("SP", a, b) for a, b in _windows(sp_from, sp_end)]
            plan += [("NRT", a, b) for a, b in _windows(nrt_from, nrt_end)]
            rows = 0
            for processing, first, last in plan:
                days = (last - first).days + 1
                text = _get(f"area/csv/{{key}}/{api_name}_{processing}/{area}/{days}/{first.isoformat()}", key)
                calls += 1
                if not text.startswith("latitude"):
                    raise SystemExit(f"FIRMS refused {api_name}_{processing} {first} for {country}: {text[:120].replace(key, '<key>')}")
                name = f"{first.isoformat()}_{last.isoformat()}_{processing}.csv"
                (folder / name).write_text(text, encoding="utf-8", newline="")
                n = max(text.count("\n") - 1, 0)
                rows += n
                manifest[name] = {"api_source": f"{api_name}_{processing}", "area": f"bbox:{area}",
                                  "processing": processing, "first_day": first.isoformat(), "last_day": last.isoformat(),
                                  "pulled_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "rows": n}
                time.sleep(PAUSE_SECONDS)
            manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True), encoding="utf-8")
            print(f"{country:9} {source:11} SP {sp_from} to {sp_end}, NRT to {nrt_end}: {len(plan)} calls, {rows} rows", flush=True)
    (OUT / "topup.json").write_text(json.dumps({
        "pulled_at_utc": now.isoformat(timespec="seconds"),
        "last_full_day": last_full_day.isoformat(),
        "available_to": {k: v.isoformat() for k, v in sorted(available.items())},
    }, indent=1), encoding="utf-8")
    print(f"{calls} calls. Last full day: {last_full_day}")
