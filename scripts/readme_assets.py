"""The README's graphics and numbers, made from the files the pipeline exports.

    python scripts/readme_assets.py            write docs/assets/*.svg and the generated blocks of README.md
    python scripts/readme_assets.py --check    change nothing; fail if a file on disk is not what would be written

Reads app/public/data/ (method.json, findings.json, areas/nile-delta.json) and the colours in
app/lib/design/tokens.json. Standard library only. Each graphic is written twice: light (the Folio theme)
and dark (Night). In README.md only the text between <!-- generated:NAME --> and <!-- /generated:NAME -->
is replaced, so no number in it is typed by hand.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "public" / "data"
ASSETS = ROOT / "docs" / "assets"
README = ROOT / "README.md"

AREA = "nile-delta"
W = 960
DISPLAY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif"
TEXT = "Georgia, 'Times New Roman', serif"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]
THEMES = {"light": "folio", "dark": "night"}

MODEL_LABELS = {
    "raw": "Raw MODIS, no calibration",
    "M0": "M0: one fixed multiplier",
    "M1": "M1: c + a M^b",
    "M2": "M2: M1 with a background per month",
    "M3": "M3: M2 with fire size",
    "M4": "M4: M3 with the background scaled by the year's activity",
}
MODEL_SHORT = {**MODEL_LABELS, "M4": "M4: M3, background scaled by the year"}


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def colours(theme: str) -> dict[str, str]:
    tokens = json.loads((ROOT / "app" / "lib" / "design" / "tokens.json").read_text(encoding="utf-8"))
    return {t["name"]: t["value"][THEMES[theme]] for t in tokens["color"]["tokens"]}


# ---------------------------------------------------------------- words and numbers

def n0(v: float) -> str:
    return f"{round(v):,}"


def pct(v: float, digits: int = 1) -> str:
    return f"{v:.{digits}f}%"


def signed(v: float) -> str:
    return f"{v:+.0f}%"


def day(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def season_words(months: list[int]) -> str:
    return f"{MONTHS[months[0] - 1]} to {MONTHS[months[-1] - 1]}"


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def nice_ticks(top: float, about: int = 5) -> list[float]:
    raw = top / about
    mag = 10 ** len(str(int(raw))) / 10
    step = next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= raw)
    ticks, v = [], 0.0
    while v < top + step * 0.999:
        ticks.append(v)
        v += step
    return ticks


# ---------------------------------------------------------------- SVG pieces

class Svg:
    def __init__(self, height: int, c: dict[str, str], title: str, desc: str):
        self.c, self.h, self.parts = c, height, []
        self.head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {height}" width="{W}" height="{height}" '
            f'role="img" aria-labelledby="t d" font-family="{TEXT}">\n'
            f'<title id="t">{esc(title)}</title>\n<desc id="d">{esc(desc)}</desc>\n'
            f'<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<line x1="0" y1="0" x2="0" y2="5" stroke="{c["rule"]}" stroke-width="1.5"/></pattern></defs>\n'
            f'<rect x="0.5" y="0.5" width="{W - 1}" height="{height - 1}" rx="6" fill="{c["ground"]}" stroke="{c["rule"]}"/>'
        )

    def add(self, s: str) -> None:
        self.parts.append(s)

    def text(self, x: float, y: float, s: str, size: float = 14, fill: str = "ink", anchor: str = "start",
             family: str | None = None, weight: str | None = None, spacing: float | None = None,
             style: str | None = None) -> None:
        extra = (f' font-family="{family}"' if family else "") + (f' font-weight="{weight}"' if weight else "") \
            + (f' letter-spacing="{spacing}"' if spacing else "") + (f' font-style="{style}"' if style else "") \
            + (f' text-anchor="{anchor}"' if anchor != "start" else "")
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{self.c[fill]}"{extra}>{esc(s)}</text>')

    def line(self, x1: float, y1: float, x2: float, y2: float, stroke: str = "rule", width: float = 1,
             dash: str | None = None) -> None:
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{self.c[stroke]}" '
                 f'stroke-width="{width}"{d}/>')

    def rect(self, x: float, y: float, w: float, h: float, fill: str, rx: float = 0, raw: bool = False) -> None:
        f = fill if raw else self.c[fill]
        self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{f}"/>')

    def heading(self, title: str, sub: str) -> None:
        self.text(32, 44, title, 26, family=DISPLAY, weight="600")
        self.text(32, 68, sub, 14.5, "ink-muted")

    def small_caps(self, x: float, y: float, s: str, anchor: str = "start") -> None:
        self.text(x, y, s.upper(), 11.5, "brass", anchor, spacing=1.4)

    def foot(self, s: str) -> None:
        self.text(32, self.h - 20, s, 12.5, "ink-muted")

    def out(self) -> str:
        return self.head + "\n" + "\n".join(self.parts) + "\n</svg>\n"


def polyline(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


# ---------------------------------------------------------------- 1. hero: recorded against harmonized

def hero(theme: str, area: dict, method: dict) -> str:
    c = colours(theme)
    s = area["seasons"]
    years = s["year"]
    months = season_words(area["fit"]["season"])
    both = [i for i in range(len(years)) if s["viirs"][i] is not None and s["modis"][i]]
    ratio = sum(s["viirs"][i] for i in both) / sum(s["modis"][i] for i in both)
    first_viirs = years[both[0]]
    lo_pct, hi_pct = area["bands"]["season_pct"]

    svg = Svg(486, c, f"{area['name']} burning seasons, recorded and harmonized",
              f"{months} totals for {years[0]} to {years[-1]}. Left: MODIS and VIIRS as recorded; where both flew, "
              f"VIIRS counts {ratio:.0f} times what MODIS does. Right: one harmonized record in VIIRS-equivalent "
              f"hotspot-days, with a band on the seasons converted from MODIS.")
    svg.heading(f"The {area['name']}'s burning season, {years[0]} to {years[-1]}",
                f"{months} totals. One unit: a 0.1 degree cell with a fire detection on one day, per satellite.")

    top = max(v for v in s["hi"] + s["value"] + s["viirs"] if v is not None) * 1.22
    ticks = nice_ticks(top)
    y0, y1 = 410.0, 138.0

    def ys(v: float) -> float:
        return y0 - (y0 - y1) * v / ticks[-1]

    def panel(x0: float, x1: float, label: str, note: str):
        def xs(year: float) -> float:
            return x0 + (x1 - x0) * (year - years[0]) / (years[-1] - years[0])
        svg.small_caps(x0, 104, label)
        svg.text(x0, 123, note, 13.5, "ink-muted", style="italic")
        for t in ticks:
            svg.line(x0, ys(t), x1, ys(t), "rule", 1 if t else 1.2, None if t == 0 else "1 4")
            svg.text(x0 - 8, ys(t) + 4.5, n0(t), 12.5, "brass", "end")
        for year in years:
            if year % 5 == 0:
                svg.line(xs(year), y0, xs(year), y0 + 5, "brass")
                svg.text(xs(year), y0 + 21, str(year), 12.5, "brass", "middle")
        return xs

    # left: what each sensor recorded
    xs = panel(78, 458, "As the satellites recorded it",
               f"Where both flew, VIIRS counts {ratio:.0f} times what MODIS does.")
    modis = [(xs(y), ys(s["modis"][i])) for i, y in enumerate(years) if s["modis"][i] is not None]
    viirs = [(xs(y), ys(s["viirs"][i])) for i, y in enumerate(years) if s["viirs"][i] is not None]
    for pts, col in ((modis, "lapis"), (viirs, "rubric")):
        svg.add(f'<polyline points="{polyline(pts)}" fill="none" stroke="{c[col]}" stroke-width="2" '
                f'stroke-linejoin="round" stroke-linecap="round"/>')
        for x, y in pts:
            svg.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.6" fill="{c[col]}"/>')
    mx = xs(years[0]) + 6
    my = min(y for _, y in modis[:8]) - 14
    svg.rect(mx, my - 9, 12, 3, "lapis")
    svg.text(mx + 18, my - 3, f"MODIS, 1 km, since {years[0] - 1}", 13.5)
    vx, vy = viirs[0][0] - 24, min(y for _, y in viirs) - 16
    svg.rect(vx, vy - 6, 12, 3, "rubric")
    svg.text(vx + 18, vy, f"VIIRS, 375 m, since {first_viirs}", 13.5)

    # right: the harmonized record
    xs = panel(560, 940, "Harmonized by Zij",
               f"One scale. A converted season carries a band, {signed(lo_pct)} to {signed(hi_pct)}.")
    conv = [i for i in range(len(years)) if s["lo"][i] is not None]
    band = [(xs(years[i]), ys(s["hi"][i])) for i in conv] + [(xs(years[i]), ys(s["lo"][i])) for i in reversed(conv)]
    svg.add(f'<polygon points="{polyline(band)}" fill="{c["ink"]}" fill-opacity="0.16"/>')
    edge = (xs(years[conv[-1]]) + xs(first_viirs)) / 2
    svg.line(edge, y1 - 2, edge, y0, "brass", 1, "3 3")
    pts = [(xs(y), ys(s["value"][i])) for i, y in enumerate(years)]
    svg.add(f'<polyline points="{polyline(pts)}" fill="none" stroke="{c["ink"]}" stroke-width="2" '
            f'stroke-linejoin="round" stroke-linecap="round"/>')
    for i, (x, y) in enumerate(pts):
        if i in conv:
            svg.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{c["ground"]}" stroke="{c["ink"]}" stroke-width="1.5"/>')
        else:
            svg.add(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{c["ink"]}"/>')
    svg.text(edge - 8, y1 + 12, "converted from MODIS", 13, "ink-muted", "end")
    svg.text(edge + 8, y1 + 12, "measured by VIIRS", 13, "ink-muted")

    svg.foot(f"Fire data: NASA FIRMS, to {day(method['last_full_day'])}. Left axis: fire cell-days per season. "
             f"Right axis: {method['unit_label']}.")
    return svg.out()


# ---------------------------------------------------------------- 2. validation: season error by model

def validation(theme: str, method: dict) -> str:
    c = colours(theme)
    m = method["models"]
    err = {(r["model"], r["scheme"]): r["season_err_abs_pct"] for r in m["all_areas"]}
    models = list(dict.fromkeys(r["model"] for r in m["all_areas"]))
    train, test = m["train_years"], m["test_years"]
    schemes = [("LOYO", "ink", f"Leave one year out, {train[0]} to {train[1]}"),
               ("out-of-time", "brass", f"{test[0]} to {test[1]}, predicted from the {train[0]} to {train[1]} fit")]

    row, y_first = 50, 128
    svg = Svg(y_first + row * len(models) + 44, c, "Season error by model, both tests",
              "Mean absolute error of the season total. " + " ".join(
                  f"{MODEL_LABELS[k]}: {pct(err[k, 'LOYO'])} leaving one year out, {pct(err[k, 'out-of-time'])} "
                  f"on {test[0]} to {test[1]}." for k in models))
    svg.heading("How far off is a season total?",
                f"Mean absolute error when weekly MODIS predicts the VIIRS season, over {m['research_areas']} areas. "
                f"Shorter is better.")
    x = 32
    for _, col, words in schemes:
        svg.rect(x, 91, 14, 10, col, 2)
        svg.text(x + 21, 101, words, 13.5)
        x += 290
    x0, x1 = 330.0, 880.0
    top = max(err.values()) * 1.04
    for i, k in enumerate(models):
        y = y_first + row * i
        chosen = k == models[-1]
        svg.text(x0 - 14, y + 20, MODEL_SHORT[k], 14, anchor="end", weight="bold" if chosen else None)
        for j, (scheme, col, _) in enumerate(schemes):
            w = (x1 - x0) * err[k, scheme] / top
            svg.rect(x0, y + 2 + j * 16, w, 13, col, 2)
            svg.text(x0 + w + 7, y + 13 + j * 16, pct(err[k, scheme]), 12.5, "ink" if chosen else "ink-muted",
                     weight="bold" if chosen else None)
    svg.line(x0, y_first - 6, x0, y_first + row * len(models) - 12, "brass")
    svg.foot(f"M4 is the model Zij uses. Every model is fitted on {train[0]} to {train[1]}, the years both sensors flew. "
             f"Details: docs/event/VALIDATION.md.")
    return svg.out()


# ---------------------------------------------------------------- 3. the calendar

def heat_breaks(values: list[float]) -> list[float]:
    """The app's rule (app/lib/heat.ts): quintiles of the non-zero month values of the whole record."""
    nz = sorted(v for v in values if v and v > 0)
    return [nz[min(len(nz) - 1, int(q * len(nz)))] for q in (0.2, 0.4, 0.6, 0.8)]


def calendar(theme: str, area: dict, method: dict) -> str:
    c = colours(theme)
    m = area["months"]
    cells = {(m["year"][i], m["month"][i]): i for i in range(len(m["year"]))}
    whole = [m["value"][i] for i in range(len(m["year"])) if m["complete"][i] and m["value"][i] is not None]
    breaks = heat_breaks(whole)
    years = list(range(min(m["year"]), max(m["year"]) + 1))
    first_viirs = min(y for y, s in zip(m["year"], m["source"]) if s == "VIIRS")

    x0, y0, cw, ch = 62.0, 112.0, 32.0, 22.0
    svg = Svg(486, c, f"The {area['name']} calendar, {years[0]} to {years[-1]}",
              f"Months down, years across, each month coloured by its {method['unit_label']} in five classes. "
              f"Before {first_viirs} the values are MODIS converted to VIIRS-equivalent; from {first_viirs} they are "
              f"measured by VIIRS.")
    svg.heading(f"The {area['name']} calendar, {years[0]} to {years[-1]}",
                f"Every month of the harmonized record, in {method['unit_label']}. "
                + ("Darker: more fire." if theme == "light" else "Brighter: more fire."))
    for r in range(12):
        svg.text(x0 - 10, y0 + r * ch + 15, MONTHS[r][:3], 12.5, "ink-muted", "end")
    for k, year in enumerate(years):
        x = x0 + k * cw
        if year % 2 == 0:
            svg.text(x + (cw - 2) / 2, y0 - 8, str(year), 12, "brass", "middle")
        for r in range(12):
            i = cells.get((year, r + 1))
            y = y0 + r * ch
            if i is None or not m["complete"][i] or m["value"][i] is None:
                if i is not None or (year, r + 1) > (m["year"][-1], m["month"][-1]) or (year, r + 1) < (m["year"][0], m["month"][0]):
                    svg.rect(x, y, cw - 2, ch - 2, "url(#hatch)", 2, raw=True)
                continue
            v = m["value"][i]
            k5 = 0 if v <= 0 else 1 + sum(v >= b for b in breaks)
            svg.rect(x, y, cw - 2, ch - 2, "ground-raised" if k5 == 0 else f"heat-{min(k5, 5)}", 2)
    yb = y0 + 12 * ch + 10
    split = x0 + years.index(first_viirs) * cw - 1
    end = x0 + len(years) * cw - 2
    svg.line(x0, yb, split - 5, yb, "lapis", 2)
    svg.line(split + 5, yb, end, yb, "rubric", 2)
    svg.text(x0, yb + 18, f"MODIS, converted to VIIRS-equivalent ({years[0]} to {first_viirs - 1})", 13, "ink-muted")
    svg.text(split + 5, yb + 18, f"VIIRS, measured (from {first_viirs})", 13, "ink-muted")

    yl = yb + 42
    edges = [0.0] + breaks
    x = x0
    for k in range(5):
        svg.rect(x, yl, 26, 14, f"heat-{k + 1}", 2)
        words = f"under {n0(edges[1])}" if k == 0 else f"{n0(edges[k])} and over" if k == 4 else f"{n0(edges[k])} to {n0(edges[k + 1])}"
        svg.text(x + 33, yl + 12, words, 12.5, "ink-muted")
        x += 46 + 7.2 * len(words)
    svg.rect(x + 8, yl, 26, 14, "url(#hatch)", 2, raw=True)
    svg.text(x + 41, yl + 12, "not a whole month of data", 12.5, "ink-muted")
    svg.foot(f"Fire data: NASA FIRMS, to {day(method['last_full_day'])}. Classes are the quintiles of the whole record, "
             f"as in the app's calendar.")
    return svg.out()


# ---------------------------------------------------------------- README blocks

def block_problem(method: dict) -> str:
    g = method["raw_gap"]
    rows = sorted(g["rows"], key=lambda r: r["NPP/Aqua"])
    top = rows[-1]
    return (
        f"- NASA's fire record is two records: MODIS (1 km pixels, since 2000) and VIIRS (375 m, since 2012). "
        f"VIIRS sees many more small fires.\n"
        f"- Over the {g['area']} in {g['months']}, Suomi NPP reports {rows[0]['NPP/Aqua']:.0f} to "
        f"{rows[-2]['NPP/Aqua']:.0f} times as many fire pixels as Aqua in most years, and {top['NPP/Aqua']:.0f} times "
        f"as many in {top['year']}.\n"
        f"- So the two can't be joined as they are: read year against year, the record shows a jump in "
        f"{min(r['year'] for r in g['rows'])} that is the sensor, not the burning."
    )


def block_numbers(method: dict, findings: dict) -> str:
    f = method["filters"]
    kept = {r["country"]: r["n"] for r in f["counts"] if r["reason"] == "kept"}
    out = {}
    for r in f["counts"]:
        if r["reason"] != "kept":
            out[r["reason"]] = out.get(r["reason"], 0) + r["n"]
    static = out.get("static_source", 0) + out.get("static_source_masked", 0)
    sats = method["satellites"]
    m = method["models"]
    err = {(r["model"], r["scheme"]): r["season_err_abs_pct"] for r in m["all_areas"]}
    delta = next(a for a in method["areas"] if a["id"] == AREA)
    dv = delta["validation"]["M4"]
    band = delta["bands"]["season_pct"]
    rows = [
        ("The record", f"{day(min(s['first_day'] for s in sats))} to {day(method['last_full_day'])}"),
        ("Satellites", f"{len(sats)}: " + ", ".join(s["satellite"] for s in sats)),
        ("Fire detections kept", f"{n0(sum(kept.values()))} (" + ", ".join(f"{k} {n0(v)}" for k, v in sorted(kept.items())) + ")"),
        ("Detections left out", f"{n0(out.get('low_confidence', 0))} low confidence; {n0(static)} at static sources "
                                f"(gas flares, industry); {n0(out.get('offshore', 0))} offshore"),
        ("Static-source mask", f"{n0(sum(f['static_mask']['cells'].values()))} cells of {f['static_mask']['cell_deg']} degree "
                               f"with such detections on {f['static_mask']['min_days']} or more days"),
        ("Grid", f"{f['grid_deg']} degree; the unit is {method['unit_label']}"),
        ("Known satellite gaps", f"{f['known_gaps']}, counted as no data, never as zero"),
        ("Preset areas", f"{len(method['areas'])}, of which {m['research_areas']} are used for validation; "
                         f"plus any box or polygon drawn in " + ", ".join(sorted(kept))),
        ("Season error, raw MODIS", f"{pct(err['raw', 'LOYO'])} leaving one year out, {pct(err['raw', 'out-of-time'])} "
                                    f"on {m['test_years'][0]} to {m['test_years'][1]}"),
        ("Season error, harmonized (M4)", f"{pct(err['M4', 'LOYO'])} and {pct(err['M4', 'out-of-time'])}"),
        (f"{delta['name']}, M4", f"{pct(dv['LOYO']['season_err_abs_pct'])} and {pct(dv['out-of-time']['season_err_abs_pct'])}; "
                                 f"a converted season's band is {signed_1(band[0])} to {signed_1(band[1])}"),
    ]
    lines = ["| | |", "|---|---|"] + [f"| {a} | {b} |" for a, b in rows]
    lines += ["", f"From `app/public/data/method.json`, built {day(method['built_at_utc'])} with data to "
                  f"{day(method['last_full_day'])}."]
    return "\n".join(lines)


def signed_1(v: float) -> str:
    return f"{v:+.1f}%"


def block_validation(method: dict) -> str:
    m = method["models"]
    err = {(r["model"], r["scheme"]): r["season_err_abs_pct"] for r in m["all_areas"]}
    models = list(dict.fromkeys(r["model"] for r in m["all_areas"]))
    train, test = m["train_years"], m["test_years"]
    delta = next(a for a in method["areas"] if a["id"] == AREA)
    lines = [f"| Model | Leave one year out, {train[0]} to {train[1]} | {test[0]} to {test[1]} | {delta['name']} alone |",
             "|---|---|---|---|"]
    for k in models:
        d = delta["validation"][k]
        name = f"**{MODEL_LABELS[k]}**" if k == models[-1] else MODEL_LABELS[k]
        lines.append(f"| {name} | {pct(err[k, 'LOYO'])} | {pct(err[k, 'out-of-time'])} | "
                     f"{pct(d['LOYO']['season_err_abs_pct'])} and {pct(d['out-of-time']['season_err_abs_pct'])} |")
    return "\n".join(lines)


def block_findings(findings: dict) -> str:
    ban, since = findings["ban"], findings["since_2018"]
    delta = next(a for a in since["areas"] if a["area"] == AREA)
    dn = delta["suomi_npp_day_night"]
    ref, rec = since["reference_years"], since["recent_years"]
    parts = [
        f"### 1. Did burning in the Nile Delta change after Egypt's {ban['ban_year']} ban?",
        "",
        ban["answer"],
        "",
        "Caveats:",
        "",
        "- There is no record of what would have burned without the ban. A ban that slowed a rise and a ban that "
        "did nothing look the same here.",
        f"- The seasons before {first_measured(ban)} are converted from MODIS. Their bands are measured on the years both "
        "sensors flew, and nothing can test the conversion before VIIRS existed.",
        "- MODIS looks four times a day. Burning between overpasses is never counted.",
        "",
        f"### 2. The Delta since {rec[0]}",
        "",
        since["answer"],
        "",
        "Caveats:",
        "",
        f"- The {rec[1]} season is near-real-time data ({delta['last_season_near_real_time_pct']:.0f}% of its kept VIIRS "
        f"detections). FIRMS replaces those rows with standard processing later. Without {rec[1]} the Nile Delta is "
        f"{abs(delta['without_last_season']['change']['pct']):.0f}% below.",
        f"- The fall is mostly at the early-afternoon overpass: on Suomi NPP alone, {signed(dn['day_change_pct'])} by day "
        f"and {signed(dn['night_change_pct'])} by night against {dn['before_years'][0]} to {dn['before_years'][1]}.",
        "- A fall in detections is not a measured fall in straw burned. Fewer hotspot-days can come from less burning, "
        "from smaller or shorter fires, or from burning at hours no satellite passes.",
        "",
        "### 3. One sentence per area",
        "",
        "| Area | What the record shows |",
        "|---|---|",
    ]
    for a in findings["areas"]:
        note = f" *{a['note']}*" if a.get("note") else ""
        parts.append(f"| {a['name']}, {a['country']} | {a['sentence']}{note} |")
    parts += ["", "The names in a note (`big_seasons`, `converted_years_above`) are fields of "
                  "`app/public/data/findings.json`.", "", f"Caveat for every area: the unit counts places and days with fire. It is not burned area, not smoke, and not "
                  f"the number of fires. {findings['band_note']}"]
    return "\n".join(parts)


def first_measured(ban: dict) -> int:
    return next(s["year"] for s in ban["seasons"] if s["source"] != "MODIS")


def fill_readme(text: str, blocks: dict[str, str]) -> str:
    for name, body in blocks.items():
        pattern = re.compile(rf"(<!-- generated:{name} -->\n).*?(<!-- /generated:{name} -->)", re.S)
        if not pattern.search(text):
            raise SystemExit(f"README.md has no block <!-- generated:{name} -->")
        text = pattern.sub(lambda mo: mo.group(1) + body + "\n" + mo.group(2), text)
    return text


# ---------------------------------------------------------------- run

def main() -> int:
    check = "--check" in sys.argv[1:]
    method, findings, area = load("method.json"), load("findings.json"), load(f"areas/{AREA}.json")
    files: dict[Path, str] = {}
    for theme in THEMES:
        files[ASSETS / f"hero-{theme}.svg"] = hero(theme, area, method)
        files[ASSETS / f"validation-{theme}.svg"] = validation(theme, method)
        files[ASSETS / f"calendar-{theme}.svg"] = calendar(theme, area, method)
    readme = README.read_text(encoding="utf-8").replace("\r\n", "\n")
    files[README] = fill_readme(readme, {
        "problem": block_problem(method),
        "numbers": block_numbers(method, findings),
        "validation": block_validation(method),
        "findings": block_findings(findings),
    })

    bad = [p for p, s in files.items() if "—" in s]
    if bad:
        print("em dash in: " + ", ".join(str(p.relative_to(ROOT)) for p in bad))
        return 1
    stale = []
    for path, content in files.items():
        old = path.read_text(encoding="utf-8").replace("\r\n", "\n") if path.exists() else None
        if old == content:
            continue
        stale.append(path)
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
            print(f"wrote {path.relative_to(ROOT)}")
    if check and stale:
        print("not up to date (run python scripts/readme_assets.py): " + ", ".join(str(p.relative_to(ROOT)) for p in stale))
        return 1
    if not stale:
        print("README.md and docs/assets are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
