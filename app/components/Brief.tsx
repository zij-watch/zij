"use client";

// The season brief: one printable page for an area. The verdict, the calendar, the critical period,
// this month against the median, how sure the numbers are, and the credits.
// It prints from the browser (the print rules are in app/ui.css) and saves as a PNG drawn here.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadArea, type Area } from "@/lib/data";
import { saveBlob } from "@/lib/capture";
import { COVERED, resolveDrawn } from "@/lib/drawnArea";
import { areaFacts } from "@/lib/facts";
import type { Shape } from "@/lib/fit/cells";
import { MONTHS, UNIT, UNIT_EXACT, num } from "@/lib/format";
import { COLOURS, FONT_DISPLAY, FONT_TEXT } from "@/lib/tokens";
import { shapeParams, useAppState } from "@/lib/url";
import { areaVerdict } from "@/lib/verdict";
import Calendar from "./Calendar";
import { Seal, VerdictLine } from "./Shell";

const SVG_ID = "brief-calendar";
const CREDITS = "Fire data: NASA FIRMS active fire detections, MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21). Map: made with Natural Earth. Zij is not affiliated with or endorsed by NASA. zij.watch";

/** The Monday of an ISO week in a year, as "20 April". */
function weekStart(isoWeek: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (isoWeek - 1) * 7 * 86400000);
}
const dayMonth = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

/** "The 9 weeks from 7 September to 8 November hold 80% of a typical year's fire activity." */
function criticalWords(area: Area): string {
  const weeks = [...area.climatology.critical_weeks].sort((a, b) => a - b);
  if (weeks.length === 0) return "No critical period: there is too little fire here to name one.";
  const year = Number(area.last_full_day.slice(0, 4));
  const runs: [number, number][] = [];
  for (const w of weeks) {
    const last = runs[runs.length - 1];
    if (last && w === last[1] + 1) last[1] = w;
    else runs.push([w, w]);
  }
  const spans = runs.map(([a, b]) => `${dayMonth(weekStart(a, year))} to ${dayMonth(new Date(weekStart(b, year).getTime() + 6 * 86400000))}`);
  const share = Math.round(area.climatology.critical_share * 100);
  return `The critical period is the fewest weeks that hold ${share}% of a typical year's ${UNIT}: ${weeks.length} week${weeks.length === 1 ? "" : "s"} here, ` +
    `${spans.length === 1 ? spans[0] : `${spans.slice(0, -1).join(", ")} and ${spans[spans.length - 1]}`} (dates for ${year}).`;
}

function bandWords(area: Area): string {
  if (area.fit.mode === "none") return "This area has too few MODIS fire weeks for a fit, so years before 2012 are not converted and no verdict is given. Read the raw counts on the map page.";
  const season = area.bands.season_pct, month = area.bands.month_mult, week = area.bands.week_mult;
  return `Years before 2012 were recorded by MODIS and are converted to VIIRS terms. ` +
    (season[0] !== null ? `A converted season is likely within ${num(season[0])}% to +${num(season[1])}% of the truth. ` : "") +
    `A converted month is likely between ${num(month[0], 2)} and ${num(month[1], 2)} times its value, a week between ${num(week[0], 2)} and ${num(week[1], 2)} times. ` +
    (area.fit.mode === "blend" ? `This is a small area (${num(area.fit.n_fire_weeks)} MODIS fire weeks in 2012 to 2020): its fit is blended with its country's, and the bands are wide. ` : "") +
    `Bands are measured on years the model never saw. From 2012 the values are VIIRS's own.`;
}

/** Draw text wrapped to a width. Returns the y under the last line. With draw off it only measures. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, draw: boolean): number {
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      if (draw) ctx.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) {
    if (draw) ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function calendarImage(): Promise<HTMLImageElement | null> {
  const svg = document.getElementById(SVG_ID) as SVGSVGElement | null;
  if (!svg) return null;
  const box = svg.viewBox.baseVal;
  const text = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The calendar could not be drawn"));
      image.width = box.width * 2;
      image.height = box.height * 2;
      image.src = url;
    });
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

type Block = { head: string; text: string };

async function briefPng(area: Area, title: string, badge: string | null, blocks: Block[]): Promise<Blob> {
  const W = 1240, PAD = 80, inner = W - PAD * 2;
  const image = await calendarImage();
  const calendarH = image ? Math.round((inner * image.height) / image.width) : 0;
  const layout = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    let y = PAD;
    ctx.textBaseline = "top";
    ctx.fillStyle = COLOURS.brass;
    ctx.font = `600 22px ${FONT_DISPLAY}`;
    if (draw) ctx.fillText(`ZIJ · SEASON BRIEF · ${area.country.toUpperCase()}`, PAD, y);
    y += 36;
    ctx.fillStyle = COLOURS.ink;
    ctx.font = `600 64px ${FONT_DISPLAY}`;
    y = wrap(ctx, title, PAD, y, inner, 70, draw) + 6;
    ctx.fillStyle = COLOURS["ink-muted"];
    ctx.font = `400 22px ${FONT_TEXT}`;
    if (draw) ctx.fillText(`Data to ${area.last_full_day}. ${num(area.n_cells)} cells of 0.1°. Unit: ${UNIT}.`, PAD, y);
    y += 46;
    blocks.forEach((block, k) => {
      ctx.fillStyle = COLOURS.brass;
      ctx.font = `600 30px ${FONT_DISPLAY}`;
      if (draw) ctx.fillText(k === 0 && badge ? `${block.head}: ${badge}` : block.head, PAD, y);
      y += 40;
      ctx.fillStyle = COLOURS.ink;
      ctx.font = `400 24px ${FONT_TEXT}`;
      y = wrap(ctx, block.text, PAD, y, inner, 36, draw) + 22;
      if (k === 0 && image) {
        if (draw) ctx.drawImage(image, PAD, y, inner, calendarH);
        y += calendarH + 30;
      }
    });
    return y + PAD - 22;
  };
  const probe = document.createElement("canvas").getContext("2d")!;
  const height = layout(probe, false);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = COLOURS["ground-raised"];
  ctx.fillRect(0, 0, W, height);
  ctx.strokeStyle = COLOURS.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, W - 60, height - 60);
  layout(ctx, true);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))), "image/png"));
}

export default function Brief() {
  const [state] = useAppState();
  const [area, setArea] = useState<Area | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const shapeKey = state.shape ? JSON.stringify(state.shape) : "";
  const areaId = shapeKey ? null : state.area ?? "nile-delta";

  useEffect(() => {
    let current = true;
    setProblem(null);
    setArea(null);
    if (shapeKey) {
      resolveDrawn(JSON.parse(shapeKey) as Shape)
        .then((result) => {
          if (!current) return;
          if (result.status === "ok") setArea(result.area);
          else setProblem(result.status === "two-countries" ? `The drawn area touches ${result.countries.join(" and ")}. Draw it inside one region.` : `The drawn area is outside the regions Zij has processed (${COVERED}).`);
        })
        .catch((e: Error) => current && setProblem(e.message));
    } else if (areaId) {
      loadArea(areaId).then((a) => current && setArea(a)).catch((e: Error) => current && setProblem(e.message));
    }
    return () => {
      current = false;
    };
  }, [shapeKey, areaId]);

  const content = useMemo(() => {
    if (!area) return null;
    const verdict = areaVerdict(area);
    const facts = areaFacts(area);
    const span = area.months.year.length ? [`${area.months.year[0]}-${String(area.months.month[0]).padStart(2, "0")}`, area.last_full_day.slice(0, 7)] : ["2000-11", area.last_full_day.slice(0, 7)];
    const blocks: Block[] = [
      { head: "Verdict", text: verdict?.sentence ?? "No verdict: this area has no fit, or too few years to compare." },
      { head: "Critical period", text: criticalWords(area) },
      { head: "This month against the median", text: facts.thisMonth ?? "This month has no data yet." },
      { head: "How sure", text: bandWords(area) },
      { head: "What is counted", text: UNIT_EXACT },
      { head: "Sources", text: CREDITS },
    ];
    return { verdict, blocks, span };
  }, [area]);

  const back = shapeKey ? Object.entries(shapeParams(state.shape)).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join("&") : `area=${areaId}`;
  const save = async () => {
    if (!area || !content) return;
    try {
      setNote("Drawing the picture…");
      await document.fonts.ready;
      saveBlob(await briefPng(area, area.name, content.verdict?.badge ?? null, content.blocks), `zij_brief_${area.id}_${area.last_full_day}.png`);
      setNote("Saved the brief as a PNG.");
    } catch {
      setNote("The picture could not be made. Print to PDF instead.");
    }
  };

  return (
    <main className="brief">
      <div className="brief-actions">
        <Link className="button-link" href={`/explore?${back}`}>Back to the map</Link>
        <button type="button" className="is-active" onClick={() => window.print()} disabled={!area}>Print</button>
        <button type="button" onClick={save} disabled={!area}>Save as PNG</button>
        {note && <span role="status">{note}</span>}
      </div>
      <article className="brief-page paper">
        <header className="brief-head">
          <Seal />
          <p className="eyebrow">Season brief{area ? ` · ${area.country}` : ""}</p>
        </header>
        {problem && <p role="alert">{problem}</p>}
        {!area && !problem && <p role="status">Loading the area…</p>}
        {area && content && (
          <>
            <h1>{area.name}</h1>
            <p className="note">Data to {area.last_full_day}. {num(area.n_cells)} cells of 0.1&deg;. Unit: {UNIT}.</p>
            <section>
              <h2>Verdict</h2>
              {content.verdict ? <VerdictLine verdict={content.verdict} /> : <p>{content.blocks[0].text}</p>}
            </section>
            <section className="brief-calendar">
              <Calendar id={SVG_ID} area={area} from={content.span[0]} to={content.span[1]} />
            </section>
            {content.blocks.slice(1).map((block) => (
              <section key={block.head}>
                <h2>{block.head}</h2>
                <p>{block.text}</p>
              </section>
            ))}
          </>
        )}
      </article>
    </main>
  );
}
