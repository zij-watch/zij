"use client";

import { useEffect, useState } from "react";
import { loadArea, loadIndex, type Area, type Index } from "@/lib/data";
import { hotspotsCsvFor } from "@/lib/dayData";
import { loadingWords, useLoading } from "@/lib/download";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import type { Shape } from "@/lib/fit/cells";
import { monthSpan } from "@/lib/format";
import type { Theme } from "@/lib/tokens";
import { COLOURS } from "@/lib/tokens";
import { useAppState } from "@/lib/url";
import Calendar from "./Calendar";

const SVG_ID = "zij-calendar-export";

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cell(x: unknown): string {
  if (x === null || x === undefined) return "";
  const text = String(x);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function header(area: Area, what: string, from: string, to: string): string[] {
  return [
    `# Zij: ${what}`,
    `# Area: ${area.name}, ${area.country}. Box [west, south, east, north]: ${area.box.join(", ")}. ${area.n_cells} cells of 0.1 degree.`,
    `# Dates: ${from} to ${to}. Data to ${area.last_full_day}. Built ${area.built_at_utc}.`,
    `# Unit: ${area.unit_label}. Method: ${area.fit.model}, fit ${area.fit.mode}, ${area.fit.n_fire_weeks} MODIS fire weeks in 2012 to 2020.`,
    `# value: VIIRS where VIIRS has data, otherwise MODIS converted. lo and hi: the band of a converted value (true value inside 8 times in 10).`,
    `# Fire data: NASA FIRMS. Zij is not affiliated with or endorsed by NASA.`,
  ];
}

function weeklyCsv(area: Area, from: string, to: string): string {
  const w = area.weeks;
  const sats = Object.entries(area.satellites);
  const columns = ["week_start", "iso_year", "iso_week", "value", "lo", "hi", "source", "flag", "is_partial", "modis_raw", "viirs_raw", "modis_hotspots", "viirs_hotspots",
    ...sats.flatMap(([, s]) => [`${s.code}_fire_cell_days`, `${s.code}_hotspots`, `${s.code}_days_flown`])];
  const lines = [...header(area, "weekly harmonized series, with raw counts per satellite", from, to), columns.join(",")];
  w.week_start.forEach((start, i) => {
    const ym = start.slice(0, 7);
    if (ym < from || ym > to) return;
    lines.push([start, w.year[i], w.iso_week[i], w.value[i], w.lo[i], w.hi[i], w.source[i], w.flag[i], w.is_partial[i], w.modis[i], w.viirs[i],
      w.modis_hotspots[i], w.viirs_hotspots[i], ...sats.flatMap(([, s]) => [s.fire_days[i], s.hotspots[i], s.days[i]])].map(cell).join(","));
  });
  return lines.join("\n") + "\n";
}

function monthlyCsv(area: Area, from: string, to: string): string {
  const m = area.months;
  const clim = area.climatology.months;
  const lines = [...header(area, "monthly harmonized series", from, to),
    "year,month,value,lo,hi,source,days_with_data,complete,median_of_month,anomaly_pct,flag"];
  m.year.forEach((year, i) => {
    const ym = `${year}-${String(m.month[i]).padStart(2, "0")}`;
    if (ym < from || ym > to) return;
    lines.push([year, m.month[i], m.value[i], m.lo[i], m.hi[i], m.source[i], m.days_with_data[i], m.complete[i], clim.median[m.month[i] - 1], m.anomaly_pct[i], m.flag[i]]
      .map(cell).join(","));
  });
  return lines.join("\n") + "\n";
}

function svgText(): string | null {
  const svg = document.getElementById(SVG_ID);
  if (!svg) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

const EXPORT_FONTS = [
  { family: "Cormorant Garamond", weight: 600, file: "/vendor/fonts/cormorant-garamond-latin-600-normal.woff2" },
  { family: "Amiri", weight: 400, file: "/vendor/fonts/amiri-latin-400-normal.woff2" },
];

/** @font-face rules with the font files inside them, so a picture drawn from the SVG uses the real fonts. */
async function embeddedFonts(): Promise<string> {
  const rules = await Promise.all(EXPORT_FONTS.map(async (font) => {
    const response = await fetch(font.file);
    if (!response.ok) return "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `@font-face{font-family:"${font.family}";font-weight:${font.weight};src:url(data:font/woff2;base64,${btoa(binary)}) format("woff2");}`;
  }));
  return rules.join("");
}

async function savePng(name: string, background: string) {
  let text = svgText();
  if (text) {
    const fonts = await embeddedFonts().catch(() => "");
    if (fonts) text = text.replace(/(<svg[^>]*>)/, `$1<style>${fonts}</style>`);
  }
  const svg = document.getElementById(SVG_ID) as SVGSVGElement | null;
  if (!text || !svg) return;
  const box = svg.viewBox.baseVal;
  const scale = 3;
  const image = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The calendar could not be drawn"));
    image.width = box.width * scale;
    image.height = box.height * scale;
    image.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = box.width * scale;
  canvas.height = box.height * scale;
  const context = canvas.getContext("2d")!;
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob((blob) => blob && save(name, blob), "image/png");
}

export default function Downloads() {
  const [state, update] = useAppState();
  const [index, setIndex] = useState<Index | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [theme, setTheme] = useState<Theme>("folio");

  useEffect(() => {
    loadIndex().then(setIndex).catch(() => setIndex(null));
  }, []);
  const [problem, setProblem] = useState<string | null>(null);
  const [hotspotNote, setHotspotNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loading = useLoading();
  // A drawn area (box= or poly= in the URL) is fitted here, like on Explore; otherwise a preset.
  const shapeKey = state.shape ? JSON.stringify(state.shape) : "";
  const areaId = shapeKey ? null : state.area ?? index?.areas[0]?.id ?? null;
  useEffect(() => {
    let current = true;
    setProblem(null);
    setHotspotNote(null);
    if (shapeKey) {
      setArea(null);
      resolveDrawn(JSON.parse(shapeKey) as Shape)
        .then((result) => {
          if (!current) return;
          if (result.status === "ok") setArea(result.area);
          else setProblem(result.status === "two-countries"
            ? `Your drawn area touches ${result.countries.join(" and ")}. Draw it inside one region.`
            : `Your drawn area is outside the regions Zij has processed (${COVERED}).`);
        })
        .catch((e: Error) => current && setProblem(e.message));
    } else if (areaId) {
      loadArea(areaId).then((a) => current && setArea(a)).catch((e: Error) => current && setProblem(e.message));
    }
    return () => {
      current = false;
    };
  }, [areaId, shapeKey]);
  const noFit = area?.fit.mode === "none";

  const saveHotspots = async () => {
    if (!area) return;
    setBusy(true);
    setHotspotNote(null);
    try {
      const first = `${from}-01`;
      const [y, m] = to.split("-").map(Number);
      const lastOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const last = lastOfMonth > area.last_full_day ? area.last_full_day : lastOfMonth;
      const result = await hotspotsCsvFor(area, first, last);
      if (!result) {
        setHotspotNote(`Single hotspots are not shipped for this part of ${area.country}: in Argentina they cover only the Chilecito and Parana Delta areas. The weekly and monthly files above are complete.`);
      } else {
        save(`${base}_hotspots.csv`, new Blob([result.csv], { type: "text/csv" }));
        setHotspotNote(`${result.rows.toLocaleString("en-US")} hotspots, ${first} to ${last}.`);
      }
    } catch (e) {
      setHotspotNote(`Could not build the file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const span = area ? monthSpan(area) : null;
  const from = span && state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span?.[0] ?? "2000-11";
  const to = span && state.to && state.to <= span[1] && state.to >= from ? state.to : span?.[1] ?? "2026-11";
  const slugOf = (a: Area) => (a.id === "drawn" ? `drawn_${a.box.map((v) => v.toFixed(2)).join("_")}` : a.id);
  const base = area ? `zij_${slugOf(area)}_${from}_${to}` : "zij";

  return (
    <main className="page" data-theme="folio">
      <div className="page-inner">
        <p className="eyebrow">Downloads</p>
        <h1>Take the numbers with you</h1>
        <p>The harmonized series as CSV, and the calendar as a picture. Files cover the area and dates chosen here.</p>
        <div className="actions">
          <label>
            Area{" "}
            <select value={shapeKey ? "drawn" : areaId ?? ""} onChange={(e) => e.target.value !== "drawn" && update({ area: e.target.value, shape: null, month: null })}>
              {shapeKey && <option value="drawn">Your drawn area</option>}
              {index?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}, {a.country}</option>)}
            </select>
          </label>
          <label>From <input type="month" value={from} min={span?.[0]} max={to} onChange={(e) => e.target.value && update({ from: e.target.value })} /></label>
          <label>To <input type="month" value={to} min={from} max={span?.[1]} onChange={(e) => e.target.value && update({ to: e.target.value })} /></label>
        </div>

        {problem && <p className="placeholder">{problem}</p>}
        {!problem && !area && <p role="status">{loading ? loadingWords(loading) : "Loading the area…"}</p>}
        {area && (
          <>
            <p><strong>{area.name}</strong>, {area.country}.</p>
            {noFit && (
              <p className="placeholder">
                This area has too few fires to convert MODIS (fewer than 30 MODIS fire weeks in 2012 to 2020). The files hold the raw counts of each
                sensor; the harmonized value is empty before 2012.
              </p>
            )}
            <h2>Hotspots (CSV)</h2>
            <p>
              One row per kept fire detection in the area and dates, from both sensors: position, date and time (UTC), satellite, sensor,
              confidence, fire radiative power, day or night. Source: NASA FIRMS, credited in the file&rsquo;s header. A long range over a
              large area is a big file.
            </p>
            <div className="actions">
              <button type="button" disabled={busy} onClick={saveHotspots}>{busy ? "Building…" : "Hotspots CSV"}</button>
              {busy && loading && <span role="status">{loadingWords(loading)}</span>}
            </div>
            {hotspotNote && <p className="note">{hotspotNote}</p>}

            <h2>Harmonized series (CSV)</h2>
            <p>
              One row per week or per month: the harmonized value in {area.unit_label}, its band where it was converted from MODIS,
              where the value comes from, and the anomaly flag. The weekly file also has the raw counts of every satellite.
            </p>
            <div className="actions">
              <button type="button" onClick={() => save(`${base}_weekly.csv`, new Blob([weeklyCsv(area, from, to)], { type: "text/csv" }))}>Weekly CSV</button>
              <button type="button" onClick={() => save(`${base}_monthly.csv`, new Blob([monthlyCsv(area, from, to)], { type: "text/csv" }))}>Monthly CSV</button>
            </div>

            <h2>Calendar (PNG and SVG)</h2>
            <div className="actions">
              <button type="button" className={theme === "folio" ? "is-active" : ""} aria-pressed={theme === "folio"} onClick={() => setTheme("folio")}>Light, for print</button>
              <button type="button" className={theme === "night" ? "is-active" : ""} aria-pressed={theme === "night"} onClick={() => setTheme("night")}>Dark, for screens</button>
              <button type="button" onClick={() => savePng(`${base}_calendar.png`, COLOURS[theme].ground)}>Calendar PNG</button>
              <button type="button" onClick={() => { const text = svgText(); if (text) save(`${base}_calendar.svg`, new Blob([text], { type: "image/svg+xml" })); }}>Calendar SVG</button>
            </div>
            <div className="preview">
              <Calendar id={SVG_ID} area={area} from={from} to={to} theme={theme} title />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
