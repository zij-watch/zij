"""Rebuild every number from the raw FIRMS files in a clean folder, and compare with what is committed.

    python scripts/verify_rebuild.py                  (from the repository root; Python 3.10 or later, no packages)

What it does:
  1. takes the committed files of a revision (HEAD) twice into a work folder: `reference` and `rebuild`.
     Nothing from your working copy goes in: no data/, no virtual environment, no uncommitted edits;
  2. copies the 2026 top-up pulls (data/firms_api, git-ignored) into `rebuild`, if there are any;
  3. in `rebuild/pipeline` runs: uv sync, then `python -m zij` all, cells, boxes, fixtures, hotspots, validate,
     timing each step, with the raw files read in place from --raw;
  4. runs the app's library tests on the rebuilt files (needs Node 22.15 or later; skipped without it);
  5. compares every generated file with the committed one and writes REPORT.md in the work folder:
     each number that differs, with where it is and both values.

Exit code 0 when nothing differs, 1 when something does, 2 when a step failed.
See REBUILD.md for the steps by hand.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# The pipeline steps, in order. `all` is build, checkpoint, validate, harmonize, appdata, findings.
STEPS = ("all", "cells", "boxes", "fixtures", "hotspots", "validate")

# Everything the steps write that is committed.
GENERATED = ("app/public/data/", "app/lib/fit/test/fixtures.json.gz", "app/lib/hotspots/test/fixtures.json",
             "docs/event/VALIDATION.md", "docs/event/SMALL_AREAS.md", "docs/event/FINDINGS.md")

# Values that are the clock's, not the data's.
CLOCK_KEYS = {"built_at_utc", "pulled_at_utc"}
CLOCK_LINE = re.compile(r"^Built \d")
MAX_LISTED = 40  # differences printed per file; all are counted


def run(cmd: list[str], cwd: Path, env: dict, log: Path) -> tuple[int, float]:
    start = time.monotonic()
    with open(log, "w", encoding="utf-8", errors="replace") as out:
        out.write("$ " + " ".join(cmd) + "\n")
        out.flush()
        code = subprocess.run(cmd, cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT).returncode
    return code, time.monotonic() - start


def minutes(seconds: float) -> str:
    return f"{seconds:.0f} s" if seconds < 90 else f"{seconds / 60:.1f} min"


def extract(revision: str, target: Path) -> None:
    """The committed files of a revision, and nothing else."""
    archive = target.with_suffix(".zip")
    subprocess.run(["git", "-C", str(REPO), "archive", "--format=zip", "-o", str(archive), revision], check=True)
    with zipfile.ZipFile(archive) as z:
        z.extractall(target)
    archive.unlink()


def generated_files(root: Path) -> set[str]:
    found = set()
    for item in GENERATED:
        path = root / item
        if path.is_dir():
            found |= {p.relative_to(root).as_posix() for p in path.rglob("*") if p.is_file()}
        elif path.exists():
            found.add(item)
    return found


# ---------------------------------------------------------------- comparing

def diff_json(a, b, path: str, out: list[str]) -> None:
    """a is committed, b is rebuilt."""
    if isinstance(a, dict) and isinstance(b, dict):
        for key in sorted(set(a) | set(b)):
            if key in CLOCK_KEYS:
                continue
            where = f"{path}.{key}" if path else key
            if key not in a:
                out.append(f"`{where}`: only in the rebuild")
            elif key not in b:
                out.append(f"`{where}`: only in the committed file")
            else:
                diff_json(a[key], b[key], where, out)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"`{path}`: {len(a)} entries committed, {len(b)} rebuilt")
        for i, (x, y) in enumerate(zip(a, b)):
            diff_json(x, y, f"{path}[{i}]", out)
    elif a != b:
        out.append(f"`{path}`: committed {json.dumps(a)}, rebuilt {json.dumps(b)}")


def diff_text(a: str, b: str, out: list[str]) -> None:
    keep = lambda text: [line for line in text.splitlines() if not CLOCK_LINE.match(line)]
    la, lb = keep(a), keep(b)
    if len(la) != len(lb):
        out.append(f"{len(la)} lines committed, {len(lb)} rebuilt")
    for i, (x, y) in enumerate(zip(la, lb), start=1):
        if x != y:
            out.append(f"line {i}: committed `{x.strip()[:160]}`, rebuilt `{y.strip()[:160]}`")


def diff_binary(a: bytes, b: bytes, out: list[str]) -> None:
    if a == b:
        return
    if len(a) != len(b):
        out.append(f"{len(a):,} bytes unzipped committed, {len(b):,} rebuilt")
    different = sum(x != y for x, y in zip(a, b))
    out.append(f"{different:,} of {min(len(a), len(b)):,} unzipped bytes differ")
    # Both binary formats start with a magic word and six counts.
    if len(a) >= 28 and len(b) >= 28:
        ha = [int.from_bytes(a[4 + 4 * i:8 + 4 * i], "little") for i in range(6)]
        hb = [int.from_bytes(b[4 + 4 * i:8 + 4 * i], "little") for i in range(6)]
        if ha != hb:
            out.append(f"header counts: committed {ha}, rebuilt {hb}")


def compare(reference: Path, rebuild: Path, started: float) -> tuple[dict[str, list[str]], list[str], list[str]]:
    """Differences per file, the files compared, and committed files no step rewrote."""
    differences: dict[str, list[str]] = {}
    before, after = generated_files(reference), generated_files(rebuild)
    untouched = []
    for name in sorted(before | after):
        out: list[str] = []
        if name not in after:
            out.append("committed, but missing after the rebuild")
        elif name not in before:
            out.append("written by the rebuild, but not committed")
        else:
            a, b = (reference / name).read_bytes(), (rebuild / name).read_bytes()
            if (rebuild / name).stat().st_mtime < started:
                untouched.append(name)
            if name.endswith(".bin.gz"):
                diff_binary(gzip.decompress(a), gzip.decompress(b), out)
            elif name.endswith(".json.gz"):
                diff_json(json.loads(gzip.decompress(a)), json.loads(gzip.decompress(b)), "", out)
            elif name.endswith(".json"):
                diff_json(json.loads(a.decode("utf-8")), json.loads(b.decode("utf-8")), "", out)
            else:
                diff_text(a.decode("utf-8"), b.decode("utf-8"), out)
        if out:
            differences[name] = out
    return differences, sorted(before | after), untouched


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--raw", default=os.environ.get("ZIJ_FIRMS_RAW", r"D:\Zij\firms-raw"), help="the raw FIRMS folder (default: ZIJ_FIRMS_RAW, or D:\\Zij\\firms-raw)")
    parser.add_argument("--topup", default=str(REPO / "data" / "firms_api"), help="the 2026 top-up pulls to copy in (default: this checkout's data/firms_api); 'none' to rebuild without them")
    parser.add_argument("--work", default=None, help="the clean folder to work in; must be empty or not exist (default: a new temporary folder)")
    parser.add_argument("--revision", default="HEAD", help="the committed state to rebuild and compare with (default: HEAD)")
    parser.add_argument("--skip-tests", action="store_true", help="do not run the app's library tests")
    args = parser.parse_args()

    raw = Path(args.raw)
    if not (raw / "firms").is_dir():
        print(f"No raw FIRMS files at {raw} (expected a firms/ folder). See REBUILD.md.")
        return 2
    work = Path(args.work) if args.work else Path(tempfile.mkdtemp(prefix="zij-verify-"))
    if work.exists() and any(work.iterdir()):
        print(f"{work} is not empty. Give an empty or new folder, so the rebuild starts clean.")
        return 2
    work.mkdir(parents=True, exist_ok=True)
    reference, rebuild, logs = work / "reference", work / "rebuild", work / "logs"
    logs.mkdir()
    revision = subprocess.run(["git", "-C", str(REPO), "rev-parse", args.revision], check=True, capture_output=True, text=True).stdout.strip()
    print(f"Revision {revision[:10]}, raw files {raw}, work folder {work}", flush=True)
    extract(revision, reference)
    extract(revision, rebuild)

    topup = None if args.topup == "none" else Path(args.topup)
    if topup and topup.is_dir():
        shutil.copytree(topup, rebuild / "data" / "firms_api")
        print(f"Top-up pulls copied from {topup}", flush=True)
    else:
        topup = None
        print("No top-up pulls: the rebuild uses the raw folder alone", flush=True)

    env = {**os.environ, "ZIJ_FIRMS_RAW": str(raw), "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    env.pop("VIRTUAL_ENV", None)
    started = time.time()
    timings: list[tuple[str, float]] = []
    failed = None
    commands = [("uv sync", ["uv", "sync", "--frozen"])] + [(f"zij {s}", ["uv", "run", "python", "-m", "zij", s]) for s in STEPS]
    for label, cmd in commands:
        print(f"  {label} ...", end=" ", flush=True)
        code, seconds = run(cmd, rebuild / "pipeline", env, logs / (label.replace(" ", "_") + ".log"))
        timings.append((label, seconds))
        print(minutes(seconds) if code == 0 else f"FAILED after {minutes(seconds)} (see {logs})", flush=True)
        if code != 0:
            failed = label
            break

    tests = "not run"
    if not failed and not args.skip_tests:
        node = shutil.which("node")
        if node:
            print("  app library tests ...", end=" ", flush=True)
            code, seconds = run([node, "--import", "./lib/fit/test/register.mjs", "--test", "lib/fit/test/*.test.mjs", "lib/hotspots/test/*.test.mjs"],
                                rebuild / "app", env, logs / "node_tests.log")
            timings.append(("app library tests", seconds))
            text = (logs / "node_tests.log").read_text(encoding="utf-8", errors="replace")
            counts = {k: int(v) for k, v in re.findall(r"^. (tests|pass|fail) (\d+)", text, flags=re.M)}
            tests = f"{counts.get('pass', '?')} of {counts.get('tests', '?')} pass" + ("" if code == 0 else " (FAILED)")
            print(tests, flush=True)
        else:
            tests = "skipped: no node on the PATH"

    differences, compared, untouched = ({}, [], []) if failed else compare(reference, rebuild, started)
    total = sum(len(v) for v in differences.values())
    lines = [
        "# Rebuild report", "",
        f"Revision `{revision}`. Raw files: `{raw}`. Top-up pulls: {f'`{topup}`' if topup else 'none'}.",
        f"Run on {time.strftime('%d %b %Y, %H:%M', time.localtime(started))}, {sys.platform}, in `{work}`.", "",
        "## Steps", "", "| Step | Time |", "|---|---|",
        *[f"| `{label}` | {minutes(seconds)} |" for label, seconds in timings],
        f"| **All** | **{minutes(sum(s for _, s in timings))}** |", "",
        f"App library tests on the rebuilt files: {tests}.", "",
    ]
    if failed:
        lines += [f"**Step `{failed}` failed.** Nothing was compared. Its log is in `{logs}`."]
    else:
        lines += ["## Comparison", "",
                  f"{len(compared)} generated files compared with the committed ones; values that are the clock's (`built_at_utc`, the `Built` line) are left out.", ""]
        if not differences:
            lines += ["**Nothing differs.** Every number in the committed files comes out of the rebuild."]
        else:
            lines += [f"**{total} differences in {len(differences)} of {len(compared)} files.**", ""]
            for name, out in differences.items():
                lines += [f"### `{name}`: {len(out)}", "", *[f"- {d}" for d in out[:MAX_LISTED]]]
                if len(out) > MAX_LISTED:
                    lines.append(f"- and {len(out) - MAX_LISTED} more")
                lines.append("")
        same = [n for n in compared if n not in differences]
        lines += ["", "## Files", "", "| File | Result |", "|---|---|",
                  *[f"| `{n}` | {'same' if n in same else str(len(differences[n])) + ' differences'}"
                    f"{' (no step rewrote it)' if n in untouched else ''} |" for n in compared]]
        if untouched:
            lines += ["", f"{len(untouched)} committed file(s) were not rewritten by any step, so the rebuild says nothing about them: "
                      + ", ".join(f"`{n}`" for n in untouched) + "."]
    report = work / "REPORT.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{'Step failed' if failed else 'Nothing differs' if not differences else f'{total} differences in {len(differences)} files'}. Report: {report}")
    return 2 if failed else 1 if differences or "FAILED" in tests else 0


if __name__ == "__main__":
    raise SystemExit(main())
