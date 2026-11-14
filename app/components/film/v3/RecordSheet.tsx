"use client";

// L1 and L2 of the third film (lib/film/v3.ts): the record sheet.
//   L1  NASA GIBS true colour of the Nile Delta on 20 October 2023, that day's fire dots inking in;
//       the picture folds down into the record chart, the Delta's raw seasons are drawn, and the
//       bars leap at 2012 on "tenfold" (162 and 1,609, from the data)
//   L2  an ink circle round 2012; "MODIS 1 km" and "VIIRS 375 m" on the two halves
// The chart is the app's own SeriesChart; the picture is the app's own MapView on its satellite
// basemap, which is NASA GIBS's corrected reflectance for that day.

import dynamic from "next/dynamic";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@/lib/data";
import type { DayResult } from "@/lib/dayData";
import { arrive, clamp, move } from "@/lib/film/timeline";
import type { Beats } from "@/lib/film/v3";
import type { DayHotspot } from "@/lib/hotspots/day";
import { fitBox } from "@/lib/map/atlas/camera";
import { COLOURS } from "@/lib/tokens";
import { ResultPaper } from "../../Panel";
import Paper from "../../Paper";
import SeriesChart from "../../SeriesChart";
import { Lever } from "../../ui";
import { axisTop, chartIn, useSeasons } from "../board/Charts";
import { mapProps, useIdle } from "../board/Maps";
import { inked, Sheet, useDriver, useFilm, useReady, useT } from "../kit";

const MapView = dynamic(() => import("../../MapView"), { ssr: false });

const noop = () => {};
const NONE: DayHotspot[] = [];
const NO_AREAS: never[] = [];
const PAD = 34; // the chart's room above it (film.css, .film-chart)
const CARD = { x: 120, y: 64, w: 1560, k: 2 }; // the chart card on the sheet: 780 wide, shown at twice its size
const PICTURE = { w: 1560, h: 812 };
/** The Nile Delta, the app's preset box. */
const DELTA: [number, number, number, number] = [29.8, 30.0, 32.3, 31.6];

function inkRing(cx: number, cy: number, rx: number, ry: number): string {
  const points: string[] = [];
  const turns = 1.08, n = 120, start = -2.2;
  for (let i = 0; i <= n; i++) {
    const a = start + (i / n) * turns * 2 * Math.PI;
    const wobble = 1 + 0.035 * Math.sin(3 * a + 0.7) + 0.025 * (i / n);
    points.push(`${(cx + rx * wobble * Math.cos(a)).toFixed(1)} ${(cy + ry * wobble * Math.sin(a)).toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}

interface Geo { x: number[]; step: number; foot: number; high: number; top: number[] }

export function RecordSheet({ area, b, day, dayResult }: { area: Area; b: Beats; day: string; dayResult: DayResult }) {
  const t = useT();
  const { warn } = useFilm();
  const idle = useIdle();
  const sheet = useRef<HTMLDivElement>(null);
  const halves = useRef<(HTMLParagraphElement | null)[]>([]);
  const divide = useRef<HTMLElement>(null);
  const ring = useRef<SVGPathElement>(null);
  const numbers = useRef<(HTMLParagraphElement | null)[]>([]);
  const top = useRef<number | undefined>(undefined);
  const geo = useRef<Geo | null>(null);
  const r = useSeasons(area);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [settled, setSettled] = useState(false);
  const applied = useRef(-1);
  const last = r.nModis - 1, first = r.nModis; // 2011 and 2012
  const view = useMemo(() => fitBox(DELTA, PICTURE.w, PICTURE.h, 30), []);

  // That day's fires, inked in over the first second, in the order the satellites saw them.
  const dots = useMemo(() => [...dayResult.view.hotspots].sort((a, c) => a.time_utc.localeCompare(c.time_utc) || a.longitude - c.longitude), [dayResult]);
  const inkedCount = (time: number) => Math.round(dots.length * clamp((time - b.dots[0]) / (b.dots[1] - b.dots[0])));
  const count = inkedCount(t);
  const shown = useMemo(() => (count === 0 ? NONE : dots.slice(0, count)), [dots, count]);

  const onMap = useCallback((m: MapLibreMap) => {
    m.on("error", (event) => warn(`picture: ${event.error?.message ?? "error"}`));
    setMap(m);
  }, [warn]);
  useEffect(() => {
    if (!map) return;
    let live = true;
    idle(map, "picture").then(() => live && setSettled(true));
    return () => {
      live = false;
    };
  }, [map, idle]);
  useReady("record", settled);

  useDriver(async (time) => {
    if (map && time < b.fold[1] && inkedCount(time) !== applied.current) {
      applied.current = inkedCount(time);
      await idle(map, "picture");
    }
    const chart = chartIn(sheet.current);
    if (!chart) return;
    const c = COLOURS;
    const raw = r.rows.map((i) => ({ value: r.raw(i), itemStyle: { color: r.converted(i) ? c.lapis : c.rubric } }));
    if (top.current === undefined) {
      chart.setOption({ animation: false, yAxis: { max: null }, series: [{ id: "bars", data: raw }, { id: "band", data: [] }] });
      top.current = axisTop(chart);
      chart.setOption({ animation: false, yAxis: { max: top.current } });
      chart.getZr().flush();
      const px = (k: number, v: number) => chart.convertToPixel({ seriesId: "bars" }, [k, v]);
      const x = r.rows.map((_, k) => px(k, 0)[0]);
      geo.current = { x, step: x[1] - x[0], foot: px(0, 0)[1], high: px(0, top.current)[1], top: raw.map((bar, k) => px(k, bar.value)[1]) };
    }
    // The MODIS years drawn one after another; on "tenfold" the VIIRS years leap.
    const each = (b.modis[1] - b.modis[0]) / r.nModis;
    const grown = (k: number) => (k < r.nModis ? move(time, b.modis[0] + k * each, Math.max(0.12, each * 2)) : arrive(time, b.leap + (k - r.nModis) * 0.03, 0.5));
    chart.setOption({ animation: false, yAxis: { max: top.current }, series: [{ id: "bars", data: raw.map((bar, k) => ({ ...bar, value: bar.value * grown(k) })) }, { id: "band", data: [] }] });
    chart.getZr().flush();

    const g = geo.current!;
    const place = (element: HTMLElement | null, from: number, to: number) => {
      if (!element) return;
      element.style.left = `${g.x[from] - g.step * 0.41}px`;
      element.style.width = `${g.x[to] - g.x[from] + g.step * 0.82}px`;
    };
    place(halves.current[0], 0, last);
    place(halves.current[1], first, r.rows.length - 1);
    if (divide.current) {
      divide.current.style.left = `${(g.x[last] + g.x[first]) / 2}px`;
      divide.current.style.top = `${g.high + PAD}px`;
      divide.current.style.height = `${(g.foot - g.high) * move(time, b.leap - 0.25, 0.25)}px`;
    }
    // The two numbers over 2011 and 2012.
    [last, first].forEach((k, j) => {
      const element = numbers.current[j];
      if (!element) return;
      // 2011's over its bar; 2012's ends at its bar's right edge, clear of 2013's taller bar.
      element.style.left = `${j === 0 ? g.x[k] : g.x[k] + g.step * 0.42}px`;
      element.style.transform = j === 0 ? "translateX(-50%)" : "translateX(-100%)";
      element.style.top = `${PAD + g.foot - (g.foot - g.top[k]) * grown(k) - 34}px`;
    });
    // The ink circle takes in the leap: 2011 and 2012, with their numbers.
    const cx = (g.x[last] + g.x[first]) / 2, ringTop = g.top[first] + PAD - 78, bottom = g.foot + PAD + 30;
    if (ring.current) {
      ring.current.setAttribute("d", inkRing(cx, (ringTop + bottom) / 2, g.step * 1.45, (bottom - ringTop) / 2));
      ring.current.style.strokeDashoffset = String(1 - move(time, b.circle, 0.6));
    }
  });

  const fold = move(t, b.fold[0], b.fold[1] - b.fold[0]);
  const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
  return (
    <Paper as="div" kind="sheet" seed="v3-record" className="v3-record">
      <Sheet ref={sheet} className="film-seasons v3-seasons" x={CARD.x} y={CARD.y} w={780} k={CARD.k}>
        <ResultPaper letter="ه" id="v3-record-chart" title={<>Nile Delta · Seasons · {r.seasonWords}</>}
          extra={<Lever label="Which record" off="As recorded" on="On one scale" checked={false} onChange={noop} />}>
          <ul className="key board-key"><li><i className="key-modis" aria-hidden="true" />MODIS, as recorded</li><li><i className="key-viirs" aria-hidden="true" />VIIRS, as recorded</li></ul>
          <div className="film-chart">
            <SeriesChart area={area} fromYear={Number(r.from.slice(0, 4))} toYear={Number(r.to.slice(0, 4))} normal={r.normal} recorded />
            <p ref={(e) => void (halves.current[0] = e)} className="film-half is-modis" style={inked(t, b.sensors[0], 0.3)}><b>MODIS</b> 1 km</p>
            <p ref={(e) => void (halves.current[1] = e)} className="film-half is-viirs" style={inked(t, b.sensors[1], 0.3)}><b>VIIRS</b> 375 m</p>
            <i ref={divide} className="film-divide" style={t < b.leap - 0.25 ? { visibility: "hidden" } : undefined} aria-hidden="true" />
            <p ref={(e) => void (numbers.current[0] = e)} className="v3-number is-modis" style={inked(t, b.modis[1] - 0.1, 0.2)}>{fmt(r.raw(r.rows[last]))}</p>
            <p ref={(e) => void (numbers.current[1] = e)} className="v3-number is-viirs" style={inked(t, b.numbers, 0.2)}>{fmt(r.raw(r.rows[first]))}</p>
            <svg className="v3-ring" aria-hidden="true" style={t < b.circle ? { visibility: "hidden" } : undefined}>
              <path ref={ring} pathLength={1} strokeDasharray="1 1" />
            </svg>
          </div>
        </ResultPaper>
      </Sheet>

      {/* The Delta from space, folding down into the chart. */}
      <div className="v3-picture" aria-hidden="true"
        style={{ left: CARD.x, top: CARD.y, width: PICTURE.w, height: PICTURE.h, visibility: fold >= 1 ? "hidden" : undefined,
          transform: `perspective(2600px) rotateX(${(88 * fold).toFixed(3)}deg)` }}>
        <MapView {...mapProps} basemap="satellite" date={day} areas={NO_AREAS} selected={null} tags={false} shape={null} hotspots={shown} view={view} onMap={onMap} />
        <i className="v3-picture-shade" style={{ opacity: 0.75 * fold }} />
      </div>
    </Paper>
  );
}
