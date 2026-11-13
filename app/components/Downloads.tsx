"use client";

import { useEffect, useState } from "react";
import { loadArea, loadIndex, type Area, type Index } from "@/lib/data";
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

async function savePng(name: string, background: string) {
  const text = svgText();
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
  const areaId = state.area ?? index?.areas[0]?.id ?? null;
  useEffect(() => {
    if (!areaId) return;
    let current = true;
    loadArea(areaId).then((a) => current && setArea(a)).catch(() => undefined);
    return () => {
      current = false;
    };
  }, [areaId]);

  const span = area ? monthSpan(area) : null;
  const from = span && state.from && state.from >= span[0] && state.from <= span[1] ? state.from : span?.[0] ?? "2000-11";
  const to = span && state.to && state.to <= span[1] && state.to >= from ? state.to : span?.[1] ?? "2026-11";
  const base = area ? `zij_${area.id}_${from}_${to}` : "zij";

  return (
    <main className="page" data-theme="folio">
      <div className="page-inner">
        <p className="eyebrow">Downloads</p>
        <h1>Take the numbers with you</h1>
        <p>The harmonized series as CSV, and the calendar as a picture. Files cover the area and dates chosen here.</p>
        <div className="actions">
          <label>
            Area{" "}
            <select value={areaId ?? ""} onChange={(e) => update({ area: e.target.value, month: null })}>
              {index?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}, {a.country}</option>)}
            </select>
          </label>
          <label>From <input type="month" value={from} min={span?.[0]} max={to} onChange={(e) => e.target.value && update({ from: e.target.value })} /></label>
          <label>To <input type="month" value={to} min={from} max={span?.[1]} onChange={(e) => e.target.value && update({ to: e.target.value })} /></label>
        </div>

        {area && (
          <>
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
